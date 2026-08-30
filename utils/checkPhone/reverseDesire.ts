/**
 * 反查手机 · 角色「想不想查手机」副 API 判断
 *
 * 把旧的死板正则（tryReverseCheckFromReply）升级为 LLM 结合上下文判断：
 * 角色本轮回复后，结合完整对话历史、用户最近说的话、角色性格/记忆，
 * 由 LLM 判断「角色此刻是否真想偷偷查看用户的手机」，以及如果触发，
 * 弹窗那句「角色当时自然说的话」（随性格/语境变，不固定模板）。
 *
 * 设计要点（对应需求）：
 *  - 不只匹配「查手机」字眼：用户说「我觉得别的AI更厉害」这类引发角色
 *    好奇/吃醋的话，也可能让角色想查手机。全部交给 LLM 判断。
 *  - 结合上下文：注入最近对话历史，让角色「结合上下文」而非单纯指令。
 *  - 角色有选择权：LLM 按性格/记忆/上下文自动决定想不想查、怎么表达。
 *  - fire & forget：调用方在角色回复落库后发射，不阻塞主流程。
 *
 * 纯函数 + 传入 apiConfig / apiMessages，可单测。
 */

import { safeResponseJson, extractContent } from '../safeApi';

// ─── 工具：处理 LLM 返回 text 字段时的「双重编码 JSON」问题 ────────────────────
/**
 * LLM 偶尔会把外层 JSON 示例里的 `{"text":"..."}` 再次当成字面量写进 text 字段
 * （双重编码），导致解析后 obj.text 仍是 JSON 字符串，弹窗/卡片上显示 `{"text":"..."}` 嵌套。
 * 本函数检测 text 是否本身是合法 JSON 字符串，是的话再 parse 一次提取真实 text；
 * 否则原样返回。
 */
function extractTextField(rawText: unknown): string {
    const s = typeof rawText === 'string' ? rawText : (rawText == null ? '' : String(rawText));
    const trimmed = s.trim();
    // 1) 先检测是否是 LLM 复述的格式指令脏文本（不是有效对话内容），命中则返回空让 UI 走默认文案
    if (isDirtyLLMText(trimmed)) return '';
    // 2) 检测是否双重编码的 JSON 字符串
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const inner = JSON.parse(trimmed);
            if (inner && typeof inner === 'object' && typeof inner.text === 'string') {
                const innerText = inner.text.trim();
                // 二次提取后再做一次脏文本检测（防止嵌套 JSON 里的 text 也是脏的）
                return isDirtyLLMText(innerText) ? '' : innerText;
            }
        } catch {
            // 不是合法 JSON，忽略，按原值返回
        }
    }
    return s;
}

/**
 * 检测 LLM 输出的"脏文本"——常见模式是 LLM 没按 prompt 输出 JSON，反而把
 * prompt 里的格式说明/系统提示/示例 JSON 等当成了回答内容。
 * 命中则视为无效（让 UI 走默认文案），避免脏文本污染弹窗/卡片。
 */
function isDirtyLLMText(s: string): boolean {
    if (!s) return true;
    // 1) 太短（1-2 字符无意义）
    if (s.length <= 2) return true;
    // 2) 明显是格式说明/系统提示泄露（含 "Output format"、"ONLY a JSON"、"JSON object"、"格式"、"schema"、"function call" 等）
    if (/Output\s+format\s*[:：]/i.test(s)) return true;
    if (/ONLY\s+a?\s*JSON(\s+object)?/i.test(s)) return true;
    if (/^\s*[\{【\[]/.test(s) && /JSON\s+object/i.test(s)) return true;
    if (/格式\s*[:：]/.test(s) && s.length < 30) return true;
    if (/^(schema|function[_ ]?call|tool[_ ]?call)\s*[:：]/i.test(s)) return true;
    // 3) 特殊 token 泄露（<|...|>、<...> 内含 system/assistant/user 等）
    if (/<\|.*?\|>/.test(s)) return true;
    if (/<\/?(system|assistant|user|prompt|tool)\s*>/i.test(s)) return true;
    // 4) 纯 markdown 围栏
    if (/^```/.test(s)) return true;
    return false;
}

/** 副 API 最小配置 */
export interface ReverseDesireLLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

/** 副 API 判断结果 */
export interface ReverseDesireResult {
    /** 角色是否想查手机 */
    wantReverse: boolean;
    /** 命中时弹窗文案（角色当时自然说的话，随性格/语境变） */
    text: string;
}

/**
 * 构建「角色想不想查手机」的副 API prompt。
 * @param charName 角色名
 * @param persona 角色设定（systemPrompt 摘要）
 * @param userName 用户（机主）名
 * @param recentHistory 最近对话历史（含用户最新的话、角色回复）
 * @param alreadySeen 本次会话是否已看过手机（看过 → 不重复发起，除非没看够）
 */
export function buildReverseDesirePrompt(
    charName: string,
    persona: string,
    userName: string,
    recentHistory: string,
    alreadySeen?: boolean,
): string {
    return [
        `你正在判断「${charName}」此刻的内心想法。角色设定：${persona || '（无）'}`,
        ``,
        `【背景】「${charName}」正在和「${userName}」私聊。请判断「${charName}」在此刻，是否产生了「想偷偷看一下 ${userName} 手机」的念头。`,
        `这可以是用户明确让 TA 看（引导），也可以是 TA 因为对话内容（比如好奇、吃醋、担心、八卦）自己产生的念头。`,
        `【关键】这由 ${charName} 的性格、记忆和上下文自然决定，不是死板指令。TA 可以想看，也可以不想看。`,
        ``,
        ...(alreadySeen ? [
            `【重要】「${charName}」**本次会话已经看过 ${userName} 的手机了**，应该已经了解了想知道的内容。`,
            `除非 ${charName} 是真的没看够 / 有新的想看理由（比如刚才没看到关键的、或又想确认某件事），否则**不应该再次发起查看**。`,
            `请结合上下文判断是否真的还需要再看。`,
            ``,
        ] : []),
        `【重要】如果 ${charName} 在本轮回复里**明确表达"想看 / 想查 / 让我看 / 好呀我看看 / 来查吧"等同意/想看的词**，应当判定 wantReverse=true（这是角色已经口头答应的强信号）。`,
        `只有当回复明确是拒绝/不想看/敷衍/或完全无关时，才判定 false。`,
        ``,
        `【最近对话】`,
        recentHistory || '（暂无）',
        ``,
        `请只输出一个 JSON，不要输出其他任何内容：`,
        `{"wantReverse": true 或 false, "text": "若想查，这里写 ${charName} 此刻最自然想说的那句内心/对 ${userName} 说的话（20字以内，符合性格，作为弹窗文案）；若不想查，填空字符串"}`,
    ].join('\n');
}

/** 解析副 API 返回的 JSON（容错：去掉 markdown 围栏/前后杂文本） */
export function parseReverseDesireResult(raw: string): ReverseDesireResult | null {
    if (!raw) return null;
    let text = (raw || '').trim();
    // 去掉 markdown 代码块围栏
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
        const obj = JSON.parse(text);
        if (obj && typeof obj.wantReverse === 'boolean') {
            return { wantReverse: obj.wantReverse, text: extractTextField(obj.text) };
        }
        return null;
    } catch {
        // 非 JSON（可能模型没听话直接说人话）——尝试看有没有 true/false 字样
        if (/true/i.test(text) && !/false/i.test(text)) return { wantReverse: true, text: '' };
        if (/false/i.test(text) && !/true/i.test(text)) return { wantReverse: false, text: '' };
        return null;
    }
}

/**
 * 裸 LLM 调用（副 API 判断）。返回 JSON 文本；失败返回空串。
 */
async function callDesireLLM(api: ReverseDesireLLMConfig, prompt: string): Promise<string> {
    try {
        const base = (api?.baseUrl || '').replace(/\/+$/, '');
        if (!base || !api?.apiKey) return '';
        const response = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.apiKey}` },
            body: JSON.stringify({
                model: api.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 300,
            }),
        });
        if (!response.ok) return '';
        const data = await safeResponseJson(response);
        return extractContent(data) || '';
    } catch (e) {
        console.error('[reverseDesire] 副 API 判断失败', e);
        return '';
    }
}

/**
 * 判断角色「想不想查手机」。
 * @param api 副 API 配置（LLM 调用）
 * @param charName 角色名
 * @param persona 角色设定
 * @param userName 用户（机主）名
 * @param recentHistory 最近对话历史（含用户最新的话 + 角色回复）
 * @returns 判断结果；未配置 API 或解析失败返回 null
 */
export async function evaluateReverseDesire(
    api: ReverseDesireLLMConfig,
    charName: string,
    persona: string,
    userName: string,
    recentHistory: string,
    alreadySeen?: boolean,
): Promise<ReverseDesireResult | null> {
    if (!api?.apiKey || !api?.baseUrl) return null; // 未配置 API 则不判断
    const prompt = buildReverseDesirePrompt(charName, persona, userName, recentHistory, alreadySeen);
    const raw = await callDesireLLM(api, prompt);
    return parseReverseDesireResult(raw);
}

// ─── 被拒绝后：角色坚持反应 ─────────────────────────────────────────────────────

/** 被拒绝后的角色反应 */
export interface ReverseRejectReaction {
    /** 角色继续坚持/再次请求的话（作为弹窗文案，随性格/记忆变） */
    text: string;
    /** 是否放弃（true=这次被拒后就不再查了） */
    giveUp: boolean;
}

/**
 * 生成「角色被拒绝查看手机」后的反应：结合角色性格 + 记忆 + 已被拒次数 + 上一次说的话，
 * 决定角色是继续坚持（再说一句**延续上一轮**的请求语）还是放弃。
 *
 * 行为（对应需求）：
 *  - 每次拒绝后弹窗重新发起要快，且**延续上一轮**——第二轮角色已经知道自己被拒绝了，
 *    所以说的话要和上次有关联（如"我刚说想看，你还没答应我"）。
 *  - 被拒一次就放弃的也有；被拒 2~3 次还坚持的也有——由角色性格/上下文自然决定。
 *
 * @param api 副 API 配置
 * @param char 角色
 * @param userName 用户（机主）名
 * @param rejectCount 已被拒绝的次数（0 表示第一次被拒）
 * @param lastText 上一次弹窗说的话（用于延续，让第二轮话有关联）
 */
export async function evaluateReverseRejectReaction(
    api: ReverseDesireLLMConfig,
    char: { name?: string; systemPrompt?: string },
    userName: string,
    rejectCount: number,
    lastText?: string,
): Promise<ReverseRejectReaction | null> {
    if (!api?.apiKey || !api?.baseUrl) return null;
    const charName = char?.name || '角色';
    const persona = (char?.systemPrompt || '').slice(0, 500);
    const prompt = [
        `你正在扮演「${charName}」，角色设定：${persona}`,
        ``,
        `【场景】你想偷看「${userName}」的手机，但被拒绝了${rejectCount > 0 ? `${rejectCount + 1} 次` : '。'}`,
        ...(lastText ? [`【你上一次请求时说的是】${lastText}——但被 ${userName} 拒绝了。`, ``] : []),
        `【关键】结合 ${charName} 的性格和与 ${userName} 的过往（记忆），决定 TA 此时是继续坚持（再说一句**和上次有关联**的请求语，明确提到"我刚才想看你手机被你拒绝了"）还是放弃。`,
        `- 继续坚持的话要自然延续上一轮，别从零开始，让 ${userName} 能看出这是连续的请求；`,
        `- 粘人/爱吃醋/多疑/八卦的性格：会更坚持，被拒好几次还想看；`,
        `- 傲娇/尊重隐私/淡然的性格：被拒一次可能就放弃，或别扭地再问一句。`,
        ``,
        `只输出一个 JSON：`,
        `{"text":"${charName}此刻对${userName}说的一句话(20字内，符合性格，延续上一轮，作为继续请求/坚持的话)","giveUp":true或false(是否这次就放弃不再查)}`,
    ].join('\n');
    const raw = await callDesireLLM(api, prompt);
    if (!raw) return null;
    let t = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
        const obj = JSON.parse(t);
        if (obj && typeof obj.giveUp === 'boolean') {
            return { text: extractTextField(obj.text), giveUp: obj.giveUp };
        }
    } catch {
        // 非 JSON：把文本当坚持语，默认不放弃（再试一次）
        if (t) return { text: t.slice(0, 40), giveUp: false };
    }
    return null;
}
