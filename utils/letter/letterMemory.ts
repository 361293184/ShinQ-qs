/**
 * 来信 · 记忆联动。
 *
 * 两件事：
 *   ① **信全文分块进记忆宫殿**（indexLetterToPalace）—— 这是「L3 召回层」能成立的前提：
 *      既然要让角色能「想起信里的原文」，就不能靠 prompt 硬塞，得让它可被向量检索。
 *      走 pipeline 的 importExternalMemoryText：**不推进聊天水位线**，正是「信搬家进宫殿」的通道。
 *   ② **分层注入**（buildLetterInjectionBlock）—— 信正文进上下文，但**不无脑常驻全文**：
 *      L0 信档案（常驻、永不裁）/ L1 最近 3 封要点 / L2 当下层（24h 且 ≤3 轮）/ L3 靠检索，
 *      总预算 800 字，超出按 L3 → L2 → L1 截断。
 *
 * 安全边界：没有信、没开宫殿、检索失败 → 一律降级为空串/false，绝不影响聊天主链路。
 */

import type { CharacterProfile, LetterRecord } from '../../types';
import { importExternalMemoryText } from '../memoryPalace/pipeline';
import { stripImageMarkers } from './generator';

/** 信相关注入总预算（字）。L0 永不被裁。 */
const INJECT_BUDGET = 800;
/** L0 最多列几封信的档案。 */
const L0_MAX = 8;
/** L1 取最近几封。 */
const L1_MAX = 3;

// ── 信上下文源：由 OSContext 在 collectedLetters 变化时写入（纯内存，构建上下文时不触发任何 IO）──
let letterSource: LetterRecord[] = [];

/** 由 OSContext 调用：把当前收藏的来信同步给上下文构建器。 */
export function setLetterContextSource(letters: LetterRecord[]): void {
    letterSource = Array.isArray(letters) ? letters : [];
}

/** 取某角色的信（按时间倒序）。 */
export function getLettersForChar(charId: string): LetterRecord[] {
    return letterSource
        .filter(l => l.charId === charId)
        .sort((a, b) => b.createdAt - a.createdAt);
}

function clip(s: string, max: number): string {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * 按 letterInjectMode + 800 字预算拼装「你们之间的信」区块。
 * 纯内存计算，可每轮调用；没有信（也没短期上下文）时返回空串。
 */
export function buildLetterInjectionBlock(char: CharacterProfile): string {
    const mode = char.letterConfig?.letterInjectMode || 'gist';
    const letters = getLettersForChar(char.id);
    const rlc = char.recentLetterContext;
    const now = Date.now();

    const l0Lines = letters.slice(0, L0_MAX).map(l =>
        `- [${l.date}·${l.occasion.name}]「${l.title}」${l.gist ? `：${clip(l.gist, 50)}` : ''}`,
    );
    const hasL2 = !!(rlc && rlc.expiresAt > now && (rlc.turnsLeft ?? 0) > 0);
    if (l0Lines.length === 0 && !hasL2) return '';

    const header = `### 你们之间的信\n（这些是「${char.name}」写给 ta 的信，不是普通聊天；提到时请像回忆自己亲手写过的东西。）\n`;
    const l0 = l0Lines.join('\n');

    // L1：最近几封的开头（只在 gist/full 档注入）
    let l1 = '';
    if (mode !== 'index') {
        l1 = letters.slice(0, L1_MAX)
            .filter(l => !!l.body)
            .map(l => `- 「${l.title}」开头是：${clip(l.body, 40)}`)
            .join('\n');
    }

    // L2：当下层（当前这封信 + 用户回信原文）
    let l2 = '';
    if (hasL2 && rlc) {
        const parts = [`- 我在「${rlc.occasion}」给 ta 写了一封信，大意：${clip(rlc.gist, 80)}`];
        if (rlc.replyText) parts.push(`- ta 回信说：${clip(rlc.replyText, 80)}`);
        l2 = parts.join('\n');
    }

    // 预算裁剪：L0 永不裁；L2 优先于 L1；剩余空间再放 L1。
    const remain = Math.max(0, INJECT_BUDGET - header.length - l0.length);
    const l2Block = l2 ? `\n\n#### 刚刚发生\n${l2}` : '';
    const l1Block = l1 ? `\n\n#### 最近几封是怎么开头的\n${l1}` : '';

    let extra = '';
    if (l2Block.length <= remain) {
        extra += l2Block;
        const left = remain - l2Block.length;
        extra += l1Block.length <= left ? l1Block : l1Block.slice(0, left);
    } else {
        extra += l2Block.slice(0, remain);
    }

    return `${header}${l0}${extra}\n\n`;
}

// ── 向量化入库 ──

/** importExternalMemoryText 的前两个配置参数（用 Parameters 提取，避免重复 import 类型名）。 */
type PalaceEmbeddingConfig = Parameters<typeof importExternalMemoryText>[3];
type PalaceLLMConfig = Parameters<typeof importExternalMemoryText>[4];

/**
 * 把一封信的全文送进记忆宫殿（按自然段落由 pipeline 自行分块，不推进聊天水位线）。
 * 只在角色开启了记忆宫殿时执行；任何失败都静默降级，不阻塞写信/聊天。
 */
export async function indexLetterToPalace(
    letter: LetterRecord,
    char: CharacterProfile,
    userName: string,
    embeddingConfig: PalaceEmbeddingConfig,
    llmConfig: PalaceLLMConfig,
): Promise<boolean> {
    if (!char.memoryPalaceEnabled) return false;
    if (!embeddingConfig || !llmConfig) return false;
    if (!letter.body || !letter.body.trim()) return false;

    // 剥离夹图标记：写进宫殿的应该是信的文字，不该把 `[[图:…]]` 当正文。
    const text = [
        `【来信 · ${letter.occasion.name} · ${letter.date}】`,
        letter.title ? `标题：${letter.title}` : '',
        stripImageMarkers(letter.body),
    ].filter(Boolean).join('\n');

    try {
        const res = await importExternalMemoryText(
            text,
            char.id,
            char.name,
            embeddingConfig,
            llmConfig,
            userName,
        );
        return (res?.stored || 0) > 0;
    } catch (e) {
        console.error('[Letter] index to palace failed:', e);
        return false;
    }
}
