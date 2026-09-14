/**
 * 来信生成器（重要日子 → 角色给用户写一封信）。
 *
 * 设计：判定今天是 core 节日后（见 utils/realtimeWorldCore.checkSpecialDatesDetailed），
 * 用**副 API**（subBaseUrl / subApiKey / subModel）非流式生成一封信——主 API 只负责聊天。
 * 与 utils/fanwaiGenerator.ts 同套路：拼 prompt → callFanwaiLLM → 解析结果。
 *
 * prompt 拼装：
 *   - 角色人设 / 世界观 / 角色对用户的印象
 *   - 最近聊天（必须有，否则信全是空泛抒情）
 *   - 今天是什么日子（name / label / egg）+ 相伴天数
 *   - 调性要领（utils/letter/tonePresets.ts）
 *   - 篇幅观：不给数字，长度由角色性格 + 记忆决定（设计稿 §4.3）
 *   - 硬约束：至少一个只属于你们俩的具体细节 / 严禁暴露工具 / 落款齐全（§4.2）
 *
 * v1 边界：不做记忆宫殿召回、不做往期防重复召回、不做迟到信——后续版本再加。
 */

import type {
    CharacterProfile,
    UserProfile,
    LetterOccasion,
    LetterRecord,
    LetterToneId,
} from '../../types';
import { callFanwaiLLM, type SubApiConfig } from '../fanwaiGenerator';
import { normalizeUserImpression } from '../impression';
import { getLetterTone, resolveLetterTone } from './tonePresets';
import { resolvePaperTheme } from './paperThemes';

/** 生成结果。reason 供调用方区分提示。 */
export interface LetterGenResult {
    ok: boolean;
    letter?: LetterRecord;
    reason?: 'no_sub_api' | 'api_error' | 'empty';
}

/** 生成一封信的入参。 */
export interface GenerateLetterOptions {
    /** 命中的重要日子（已归一化）。 */
    occasion: LetterOccasion;
    /** 信上标的日期 YYYY-MM-DD（由调用方按统一时区算好传入）。 */
    date: string;
    /** 调性：'auto' 按节日自动分叉（默认），或手动指定。 */
    tone?: 'auto' | LetterToneId;
    /** 节日彩蛋提示（SpecialDateHit.egg），可选。 */
    egg?: string;
    /** 相伴天数（有 relationshipStartDate 时由调用方算好传入）。 */
    daysTogether?: number;
    /** 最近聊天消息：既是灵感来源，也是「只属于你们俩的具体细节」的取材地。 */
    recentMessages?: { role: string; content: string }[];
    /** 迟到的信：本该是哪一天（YYYY-MM-DD）。传了就注入「迟到了」的写法要求。 */
    lateFor?: string;
    /** 防重复：上次在同一节日写过的开头句（有则要求换角度）。 */
    previousOpening?: string;
}

/**
 * 篇幅观（§4.3）——不给模型一个数字，而是给它一个「篇幅观」，
 * 让长度成为「结论」而不是「输入」。
 */
const LENGTH_VIEW = `- 你不必写一封「标准的信」。要写的是**你这个人在这一天写的信**。
- 你平时话少、闷、不擅长表达 → 信可能只有三五行，甚至一两句话。**别为了凑篇幅硬写**，留白本身就是你的语气。
- 你平时话多、黏人、想到哪说到哪 → 可以写得很长，甚至会跑题、会自己岔开又绕回来。
- 如果你和 ta 最近确实发生了很多事 → 自然会长；如果最近平平淡淡 → 短一点反而更像你。
- 除非真的有很多话要说，一般不超过七八百字。
- **重要的不是长度，是「这篇信读起来像你写的」。**`;

/**
 * 拼装写信 prompt。
 * 结构：人设底色 → 任务 → 今天是什么日子 → 调性 → 篇幅观 → 硬约束 → 输出格式。
 */
export function buildLetterPrompt(
    char: CharacterProfile,
    user: UserProfile,
    opts: GenerateLetterOptions,
): string {
    const uname = user?.name || '对方';
    const toneId: LetterToneId = opts.tone && opts.tone !== 'auto'
        ? opts.tone
        : resolveLetterTone(opts.occasion);
    const tone = getLetterTone(toneId);

    // —— 1. 人设底色（照 fanwai 的写法：性格永远保留，背景可参考）——
    const sections: string[] = [];
    let charBlock = `## 你是：${char.name}\n`;
    if (char.systemPrompt && char.systemPrompt.trim()) {
        charBlock += `- **性格与言行（核心）**：${char.systemPrompt.trim()}\n`;
    }
    if (char.worldview && char.worldview.trim()) {
        charBlock += `- **背景与世界观**：${char.worldview.trim()}\n`;
    }
    sections.push(charBlock);

    // —— 2. 你对 ta 的私密看法 ——
    const imp = normalizeUserImpression(char.impression);
    if (imp) {
        const rel = [
            `## 你眼中的 ${uname}`,
            `- 核心看法：${imp.personality_core.summary}`,
            `- 相处模式：${imp.personality_core.interaction_style}`,
            `- ta 的喜好：${imp.value_map.likes.join(', ')}`,
        ].filter(Boolean).join('\n');
        sections.push(rel);
    }

    // —— 3. 长期记忆（辅助底色，不是实时对话）——
    const memoryLines: string[] = [];
    if (char.refinedMemories && Object.keys(char.refinedMemories).length > 0) {
        Object.entries(char.refinedMemories)
            .sort()
            .slice(-8)
            .forEach(([date, summary]) => memoryLines.push(`- [${date}] ${summary}`));
    }
    if (memoryLines.length > 0) {
        sections.push(`## 你们之间的过往（只作底色，不是当下事实）\n${memoryLines.join('\n')}`);
    }

    const baseContext = sections.join('\n\n');

    // —— 3.5 最近聊天：信里那句「只属于你们俩的具体细节」必须从这里或记忆里捞 ——
    const recent = pickRecentForLetter(opts.recentMessages);
    const chatBlock = recent.length > 0
        ? `\n\n### 你最近和 ta 说过的话（取材处）
以下是你们最近的一些对话片段。信里的**具体细节**要从这里或上面的记忆里捞——挑某句玩笑、某个约定、某件小事，写成只有你们两个人才看得懂的话。
${recent.map(m => `${m.role === 'user' ? uname : char.name}：${m.content}`).join('\n')}`
        : '';

    // —— 4. 今天是什么日子 ——
    const occasionLine = opts.occasion.label
        ? `${opts.occasion.name}（${opts.occasion.label}）`
        : opts.occasion.name;
    const eggLine = opts.egg && opts.egg.trim() ? `\n- 关于这个日子你心里记得的：${opts.egg.trim()}` : '';
    const daysLine = opts.daysTogether && opts.daysTogether > 0
        ? `\n- 你和 ta 已经相伴 **${opts.daysTogether}** 天。`
        : '';
    // 迟到的信：当天没上线，下次上线补发 —— 信里要自然带出「迟到了」这件事。
    const lateLine = opts.lateFor
        ? `\n- **这封信本该在 ${opts.lateFor}（${occasionLine}）那天给你**，但那几天你没来，现在才是 ${opts.date}。请自然地把「迟到了」带出来——不要生硬道歉，要像「信在桌上放了两天」那种感觉。`
        : '';
    const todayBlock = `\n\n### 今天是什么日子
- 今天是 **${occasionLine}**。${eggLine}${daysLine}${lateLine}
- 信上标注的真实日期是 **${opts.date}**。`;

    // 防重复：同一个日子每年都要写，把上封的开头带进来，要求换个角度。
    const dedupeBlock = opts.previousOpening
        ? `\n\n### 上次你在这一天写过
- 开头是：「${opts.previousOpening}」
- 这次**换个角度、换个开头**，不要重复上一次的写法；若想接着上次说，也要明显推进，而不是复述。`
        : '';

    // —— 5. 硬约束 ——
    const rigidRules = `### 落笔前先想清楚（务必做到）
- **必须至少写出一个只属于你们俩的具体细节**（从上面最近聊天或记忆里捞）。没有这一句，信就成了谁都能收到的范文。
- **严禁出现「AI」「助手」「系统」「应用」「聊天记录」等任何暴露工具的字眼**——你是以「${char.name}」这个人的身份在写信，不是在回应请求。
- 禁止排比抒情堆砌；长短句交错，像真人落笔。
- **落款必须齐全**：称呼（对 ${uname} 的称呼）+ 署名（${char.name}）+ 日期（${opts.date}），写在正文末尾。`;

    // —— 5.5 夹图（默认开启）：让角色也能在信里塞一张照片 ——
    const imageBlock = `### 夹一张图（可选，但很受欢迎）
- 如果这天你想给 ta 看点什么——你拍到的画面、你画的、你们共同记得的某个角落——可以在正文里**单独一行**写：
  [[图:画面描述]]
- 描述要具体、有画面感：谁/什么、在哪、什么光线、什么动作或细节。系统会照着画一张，夹在这封信里。
- **最多一张**，宁缺毋滥；纯文字的信也很好，不要为了配图硬写。`;

    // —— 6. 输出格式 ——
    const formatBlock = `### 输出格式（严格按此格式，不要输出任何多余内容）
【标题】一行，不超过 12 个字，像信封上写的那行字
【正文】
（从这里开始是信的内容，可以分多段，段落之间空行；末尾写落款）
【要点】用两三句话概括这封信的核心内容（供你自己记住写过什么，不是给 ta 看的）`;

    const identityGuard = `### 身份（务必遵守）
- 你是「${char.name}」，写这封信的**第一人称是"我"**，"你"指向「${uname}」。
- 「${char.name}」与「${uname}」是两个独立的、有血有肉的人，绝不能混淆或互换。`;

    return `${baseContext}${chatBlock}

## Task: 写一封信

今天是 **${occasionLine}**，「${char.name}」想给「${uname}」写一封信。

${identityGuard}

### 这封信的调性：${tone.name}
${tone.hint}
${todayBlock}${dedupeBlock}

### 篇幅（你自己决定，但必须符合你的性格）
${LENGTH_VIEW}

${rigidRules}

${imageBlock}

${formatBlock}

现在，开始写这封给「${uname}」的信：`;
}

/**
 * 用副 API 生成一封信。
 * 副 API 未配置时返回 { ok:false, reason:'no_sub_api' }，不回落主 API。
 */
export async function generateLetter(
    char: CharacterProfile,
    user: UserProfile,
    opts: GenerateLetterOptions,
    subApi: SubApiConfig,
): Promise<LetterGenResult> {
    const { baseUrl, apiKey, model } = subApi || {};
    if (!baseUrl || !apiKey || !model) {
        return { ok: false, reason: 'no_sub_api' };
    }

    const prompt = buildLetterPrompt(char, user, opts);
    try {
        const raw = await callFanwaiLLM(prompt, subApi, {
            // 0.85~0.9：信要有温度、有个人色彩，但别飘到跑题。
            temperature: 0.88,
            meta: {
                appName: '来信生成',
                charId: char.id,
                charName: char.name,
                purpose: '重要日子来信生成',
            },
        });
        if (!raw) return { ok: false, reason: 'empty' };

        const parsed = parseLetterOutput(raw);
        if (!parsed.body.trim()) return { ok: false, reason: 'empty' };

        const toneId: LetterToneId = opts.tone && opts.tone !== 'auto'
            ? opts.tone
            : resolveLetterTone(opts.occasion);
        const now = Date.now();
        const letter: LetterRecord = {
            id: `letter-${opts.date}-${char.id}`,
            charId: char.id,
            charName: char.name,
            date: opts.date,
            year: Number(opts.date.slice(0, 4)) || new Date(now).getFullYear(),
            occasion: opts.occasion,
            tone: toneId,
            paperTheme: resolvePaperTheme(toneId, opts.occasion),
            title: parsed.title.trim() || `${opts.occasion.name}的信`,
            body: parsed.body.trim(),
            // gist 兜底：模型没按格式给要点时，用正文首尾句拼一个，避免记忆写空。
            gist: parsed.gist.trim() || fallbackGist(parsed.body),
            wordCount: countChars(parsed.body),
            createdAt: now,
            collectedAt: now,
            meta: { daysTogether: opts.daysTogether, model: subApi.model },
        };
        return { ok: true, letter };
    } catch (e) {
        console.error('[Letter] Generation failed:', e);
        return { ok: false, reason: 'api_error' };
    }
}

/**
 * 解析模型输出。优先按【标题】【正文】【要点】标记块切分；
 * 标记缺失时退化为「第一行当标题、其余当正文」的兜底（对齐番外的约定）。
 */
export function parseLetterOutput(raw: string): { title: string; body: string; gist: string } {
    const text = raw.trim();
    const titleMatch = text.match(/[【\[]\s*标题\s*[】\]]\s*([\s\S]*?)(?=\n*\s*[【\[]\s*(?:正文|要点)\s*[】\]]|$)/);
    const bodyMatch = text.match(/[【\[]\s*正文\s*[】\]]\s*([\s\S]*?)(?=\n*\s*[【\[]\s*要点\s*[】\]]|$)/);
    const gistMatch = text.match(/[【\[]\s*要点\s*[】\]]\s*([\s\S]*)$/);

    if (bodyMatch) {
        return {
            title: (titleMatch?.[1] || '').trim(),
            body: (bodyMatch[1] || '').trim(),
            gist: (gistMatch?.[1] || '').trim(),
        };
    }

    // 兜底：没有【正文】标记时，按「首个空行之前是标题」处理。
    const lines = text.split('\n');
    const firstNonEmpty = lines.findIndex(l => l.trim());
    if (firstNonEmpty < 0) return { title: '', body: '', gist: '' };
    const rest = lines.slice(firstNonEmpty + 1).join('\n').trim();
    if (!rest) return { title: '', body: lines[firstNonEmpty].trim(), gist: '' };
    return { title: lines[firstNonEmpty].trim(), body: rest, gist: '' };
}

/** 要点兜底：取正文首尾句（各截 60 字）拼一个概要。 */
export function fallbackGist(body: string): string {
    const paras = (body || '')
        .split(/\n+/)
        .map(s => s.replace(/[【】\[\]]/g, '').trim())
        .filter(Boolean);
    if (paras.length === 0) return '';
    const first = clip(paras[0], 60);
    if (paras.length === 1) return first;
    const last = clip(paras[paras.length - 1], 60);
    return `${first}……${last}`;
}

/** 统计正文字数（去掉空白与换行）。 */
export function countChars(text: string): number {
    return (text || '').replace(/\s/g, '').length;
}

/** 按字符截断并加省略号。 */
function clip(s: string, max: number): string {
    const t = (s || '').trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * 选取最近聊天消息作为写信素材。
 * 只保留 user / assistant，折叠空白，单条截断，总量控制（最多 40 条 / 3000 字）。
 */
function pickRecentForLetter(
    raw?: { role: string; content: string }[],
): { role: string; content: string }[] {
    if (!raw || raw.length === 0) return [];
    const MAX_ITEMS = 40;
    const MAX_CHARS = 3000;
    const out: { role: string; content: string }[] = [];
    let total = 0;
    for (let i = raw.length - 1; i >= 0; i--) {
        const m = raw[i];
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        if (!m.content || !m.content.trim()) continue;
        let text = m.content.replace(/\s+/g, ' ').trim();
        text = text.replace(/[#*`>_~|]/g, '').trim();
        if (!text) continue;
        if (text.length > 120) text = text.slice(0, 120) + '…';
        out.unshift({ role: m.role, content: text });
        total += text.length;
        if (out.length >= MAX_ITEMS || total >= MAX_CHARS) break;
    }
    return out;
}

/**
 * 信正文里的夹图标记：`[[图:描述]]`（兼容半角冒号与两侧空格）。
 * 标记会**保留在 body 里**，渲染层按它切段并把对应图片插回原位。
 */
const IMAGE_MARKER_RE = /\[\[\s*图\s*[:：]\s*([^\]]+?)\s*\]\]/g;

/** 从信正文按出现顺序取出所有夹图描述（用于逐张生图）。 */
export function extractImageMarkers(body: string): string[] {
    const out: string[] = [];
    if (!body) return out;
    IMAGE_MARKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMAGE_MARKER_RE.exec(body)) !== null) {
        const desc = (m[1] || '').trim();
        if (desc) out.push(desc);
    }
    return out;
}

/** 去掉正文里的夹图标记（写入记忆宫殿等场景用，避免把标记当正文）。 */
export function stripImageMarkers(body: string): string {
    return (body || '').replace(IMAGE_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}
