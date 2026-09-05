/**
 * 角色心声（inner_voice）解析剥离器。
 *
 * 设计（对照《角色心声·设计方案 v0.11》）：
 * - 主回复末尾附一段 `<inner_voice>…</inner_voice>`（XML 风格，模型不易在中文里误触发）。
 * - 入库前调用 extractInnerVoice：把块剥出来存 metadata，台词继续走正常管线。
 * - 层解析：
 *   1. 块内按行切分，行首 `【标签】` → 开新层（标签 ∈ 六类固定集；未知标签归为「心声」）；
 *   2. 无 `【】` 的纯文本行 → 归入当前层继续（层内可多行）；
 *   3. 整块无任何 `【】` → 降级为单层 `{ type: '心声', text: 整块 }`；
 *   4. 层数不设上限，安全阀：>12 层判异常整块丢弃；总文本 >200 字截断、单层 >30 字截断。
 * - 兜底：开标签未闭合 → 尝试取到末尾；无标签/空内容 → 判无心声；
 *   台词里残留的字面标签字样一并清除。
 * - 最坏情况永远是「可读的错位或静默无心声」，绝不让格式异常炸掉正常回复。
 */

import type { InnerVoice } from '../types';

/** 六类固定标签集合 */
const KNOWN_TAGS = new Set(['真心话', '吐槽', '小动作', '预谋', '回忆', '关系']);

/** 块级 XML 标签（非贪婪、跨行），容忍开闭之间空白 */
const VOICE_BLOCK_RE = /<inner_voice>([\s\S]*?)<\/inner_voice>/;
/** 未闭合块（取到末尾，容错） */
const VOICE_OPEN_RE = /<inner_voice>([\s\S]*)$/;
/** 台词里可能残留的字面标签字样（开闭标签、无闭合的） */
const LEFTOVER_TAG_RE = /<\/?inner_voice>/g;
/** 行首 【标签】 */
const LAYER_TAG_RE = /^【([^】]+)】(.*)$/u;
/** 单层超长截断 */
const MAX_LAYER_TEXT = 48;
/** 整块总长截断 */
const MAX_BLOCK_TEXT = 260;
/** 异常刷层安全阀 */
const MAX_LAYERS = 12;

const clampText = (text: string, max: number): string => {
    const t = text.trim();
    return t.length > max ? t.slice(0, max) : t;
};

/**
 * 从原始回复里剥出 inner_voice 块并清洗台词。
 *
 * @returns clean 剥离后的台词文本；innerVoice 解析结果，解析失败/无心声时为 null。
 * 整个函数永不 throw：任何异常都按「无心声、原文照常」处理。
 */
export const extractInnerVoice = (raw: string): { clean: string; innerVoice: InnerVoice | null } => {
    try {
        if (!raw) return { clean: raw || '', innerVoice: null };

        const text = String(raw);

        // 1. 优先匹配完整闭合块；未闭合时尝试取到末尾（容错）。
        let blockMatch = VOICE_BLOCK_RE.exec(text);
        let inner = blockMatch ? blockMatch[1] : null;
        if (!inner) {
            const openMatch = VOICE_OPEN_RE.exec(text);
            if (openMatch) {
                inner = openMatch[1];
                blockMatch = openMatch as unknown as RegExpExecArray;
            }
        }
        if (!inner) {
            // 没有任何标签 → 无心声；顺带清一遍可能的残留半截标签再返回
            return { clean: text.replace(LEFTOVER_TAG_RE, ''), innerVoice: null };
        }

        const rawInner = inner.trim();
        // 内容为空 / 全为换行 → 无心声
        if (!rawInner || /^\s*$/.test(rawInner)) {
            return { clean: removeBlock(text, blockMatch?.[0] || ''), innerVoice: null };
        }

        // 2. 整块没有任何「行首带【标签】」的行 → 降级单层「心声」（整块直接作为文本，先截断）
        if (!/^【[^】]+】/mu.test(rawInner)) {
            const fallbackText = clampText(rawInner.replace(/[\n\r]+/g, '').replace(LEFTOVER_TAG_RE, ''), MAX_LAYER_TEXT);
            const layers = fallbackText ? [{ type: '心声' as const, text: fallbackText }] : [];
            const clean = removeBlock(text, blockMatch?.[0] || '');
            return { clean, innerVoice: layers.length ? { layers, at: Date.now() } : null };
        }

        // 3. 分层解析：行首【标签】开新层，纯文本行并入当前层
        const layers: { type: InnerVoice['layers'][number]['type']; text: string }[] = [];
        const lines = rawInner.split('\n');
        let current: { type: InnerVoice['layers'][number]['type']; text: string } | null = null;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            const tagMatch = LAYER_TAG_RE.exec(line);
            if (tagMatch) {
                const label = tagMatch[1].trim();
                const rest = tagMatch[2].trim();
                const type = KNOWN_TAGS.has(label) ? label as InnerVoice['layers'][number]['type'] : '心声';
                current = { type, text: rest ? rest : '' };
                layers.push(current);
            } else {
                // 纯文本行并入当前层；前面还没层（先出现无标签文本）则开一层「心声」
                if (!current) {
                    current = { type: '心声', text: '' };
                    layers.push(current);
                }
                current.text = current.text ? `${current.text}${line}` : line;
            }
        }

        // 空文本层过滤
        const filled = layers.filter((l) => l.text);
        if (filled.length === 0) {
            return { clean: removeBlock(text, blockMatch?.[0] || ''), innerVoice: null };
        }
        // >12 层判模型异常刷层 → 整块丢弃（视为无心声）
        if (filled.length > MAX_LAYERS) {
            return { clean: removeBlock(text, blockMatch?.[0] || ''), innerVoice: null };
        }

        // 截断 + 清洗包裹引号；累计超整块上限即停（安全阀）
        let totalLen = 0;
        const normalized: { type: InnerVoice['layers'][number]['type']; text: string }[] = [];
        for (const l of filled) {
            const t = clampText(stripWrappingQuotes(l.text), MAX_LAYER_TEXT);
            if (!t) continue;
            const room = MAX_BLOCK_TEXT - totalLen;
            if (room <= 0) break;
            const sliced = t.length > room ? t.slice(0, room) : t;
            normalized.push({ type: l.type, text: sliced });
            totalLen += sliced.length;
        }
        if (normalized.length === 0) {
            return { clean: removeBlock(text, blockMatch?.[0] || ''), innerVoice: null };
        }

        const clean = removeBlock(text, blockMatch?.[0] || '');
        return {
            clean,
            innerVoice: { layers: normalized, at: Date.now() },
        };
    } catch {
        // 任何异常 → 静默降级：原文照常入库，视为无心声
        return { clean: raw || '', innerVoice: null };
    }
};

/** 从台词中移除整块（连同块标签），并清掉残留字面标签 */
const removeBlock = (text: string, blockText: string): string => {
    let clean = blockText ? text.replace(blockText, '') : text;
    clean = clean.replace(LEFTOVER_TAG_RE, '');
    // 块常与正文之间夹着空行：去首尾多余空行，保留内容行
    return clean.replace(/^\s*\n/, '').replace(/\n\s*$/, '').trim();
};

/** 去首尾成对包裹引号（中英文双引号），及剥掉残余的单个首尾引号 */
const stripWrappingQuotes = (text: string): string => {
    let t = text.trim();
    t = t.replace(/^["“「『]([\s\S]*?)["”」』"]$/, '$1').trim();
    if (t.length >= 2) {
        const first = t[0];
        const last = t[t.length - 1];
        if (/["“「『"]/.test(first) && /["”」』"]/.test(last)) t = t.slice(1, -1).trim();
    }
    return t;
};

/** 判断该角色是否开启心声：undefined 视为默认开 */
export const isInnerVoiceEnabled = (char: { innerVoiceEnabled?: boolean } | null | undefined): boolean =>
    char?.innerVoiceEnabled !== false;
