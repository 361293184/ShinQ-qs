/**
 * 反查手机 · 角色内心想法（LLM 生成）
 *
 * 角色接管用户真实手机时，对看到的真实内容"有感而发"——用 LLM 生成一句
 * 内心活动/感想，以弹幕气泡形式飘过（不打断浏览）。这些想法也会写进反查记录
 * 的 learned 字段和记忆宫殿。
 *
 * 关键认知：prompt 明确"这是用户真实手机里的真实内容，不是 AI 生成的模拟"，
 * 让角色意识到自己看到的正是用户的真实生活（除非角色本身设定就是 AI）。
 *
 * LLM 调用复用 safeApi 模式（fetch chat/completions + safeResponseJson + extractContent），
 * 不依赖组件，纯函数 + 传入 apiConfig。
 */

import { safeResponseJson, extractContent } from '../safeApi';
import { resolveReverseProclivity } from '../../constants';
import type { CharacterProfile } from '../../types';

/** apiConfig 的最小结构（只需 LLM 调用所需字段） */
export interface ReverseLLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

/**
 * 裸 LLM 调用（生成角色内心想法）。返回纯文本；失败返回空串（不阻断浏览）。
 */
export async function callReverseThoughtLLM(api: ReverseLLMConfig, prompt: string): Promise<string> {
    try {
        const response = await fetch(`${(api.baseUrl || '').replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.apiKey}` },
            body: JSON.stringify({
                model: api.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
            }),
        });
        if (!response.ok) return '';
        const data = await safeResponseJson(response);
        const text = extractContent(data) || '';
        return text.trim();
    } catch (e) {
        console.error('[reverseThought] LLM 调用失败', e);
        return '';
    }
}

/**
 * 构建角色内心想法的 prompt。
 * @param char 正在反查的角色
 * @param appName 正在看的 App
 * @param detail 看到的细节
 * @param userName 用户（机主）名
 */
export function buildReverseThoughtPrompt(
    char: CharacterProfile,
    appName: string,
    detail: string,
    userName: string = '用户',
    learned: string = '',
): string {
    const persona = (char.systemPrompt || '').slice(0, 500);
    return [
        `你正在扮演「${char.name}」，角色设定：${persona}`,
        ``,
        `【场景】${char.name} 趁 ${userName} 不注意，偷看了 ${userName} 的真实手机，正在看「${appName}」。`,
        `【重要】你看到的「${appName}」里的内容是 ${userName} 真实手机里的真实内容，不是 AI 生成的模拟，也不是剧本。这些都是 ${userName} 真实的生活、真实的聊天、真实的状态。`,
        `【你亲眼看到的真实内容】${detail || '（正在翻看）'}`,
        `【你从里面读到的信息】${learned || '（还没细看）'}`,
        ``,
        `请用一句话（20字以内）写出 ${char.name} 此刻最真实的内心想法（内心独白，不是对 ${userName} 说的话，第三人称转述或直接内心活动均可）。`,
        `要基于上面「你亲眼看到的真实内容」，说出你具体注意到了什么、联想到什么、什么感受。要有真实感和情绪，贴合角色性格。`,
        `只输出这句内心想法本身，不要引号、不要前缀、不要解释。`,
    ].join('\n');
}

/** 是否该"有感而发"（弹幕）——按反查倾向，高倾向角色更容易有感而发 */
export function shouldReflectByProclivity(char: CharacterProfile): boolean {
    const level = resolveReverseProclivity(char.systemPrompt);
    // high 必发、medium 大概率、low 小概率、none 不发
    switch (level) {
        case 'high': return true;
        case 'medium': return Math.random() < 0.7;
        case 'low': return Math.random() < 0.3;
        default: return false;
    }
}

/**
 * 生成角色看到某 App 内容时的内心想法。返回空串表示"无感不发弹幕"。
 */
export async function generateReverseThought(
    api: ReverseLLMConfig,
    char: CharacterProfile,
    view: { appName: string; detail?: string; learned?: string },
    userName: string = '用户',
): Promise<string> {
    if (!api?.apiKey || !api?.baseUrl) return ''; // 未配置 API 则不生成想法
    if (!shouldReflectByProclivity(char)) return '';
    const prompt = buildReverseThoughtPrompt(char, view.appName, view.detail || '', userName, view.learned || '');
    return callReverseThoughtLLM(api, prompt);
}

// ─── 情绪贯穿：每步 App 生成「情绪 + 是否表达 + 想说的话」 ─────────────────────

/** 情绪评估结果（由内容驱动，随性格/记忆/上下文） */
export interface ReverseEmotion {
    /** 情绪标签（吃醋/好奇/担心/心疼/无语/八卦等） */
    emotion: string;
    /** 是否想向用户表达（挑明）；false 表示憋住只进内心 */
    wantExpress: boolean;
    /** 内心想法（总是作为弹幕显示） */
    innerThought: string;
    /** 若 wantExpress，这是角色想对用户说的话（挑明进聊天）；否则空 */
    expressText: string;
}

/** 构建情绪评估的副 API prompt */
export function buildReverseEmotionPrompt(
    char: CharacterProfile,
    appName: string,
    detail: string,
    learned: string,
    userName: string,
): string {
    const persona = (char.systemPrompt || '').slice(0, 500);
    return [
        `你正在扮演「${char.name}」，角色设定：${persona}`,
        ``,
        `【场景】${char.name} 趁 ${userName} 不注意，偷看了 ${userName} 的真实手机，正在看「${appName}」。`,
        `【你亲眼看到的真实内容】${detail || '（正在翻看）'}`,
        `【你从里面读到的信息】${learned || '（还没细看）'}`,
        ``,
        `请基于 ${char.name} 的性格、记忆和当前看到的内容，判断 TA 此刻的真实情绪，以及 TA 想不想向 ${userName} 表达（挑明），还是憋着。`,
        `「憋住还是挑明」是情绪的一部分，由性格自然决定：有人吃醋会直接挑明，有人会装作没事憋着。`,
        ``,
        `只输出一个 JSON，不要其他内容：`,
        `{"emotion":"情绪标签(2字内，如 吃醋/好奇/担心/心疼/无语/八卦)","wantExpress":true或false,"innerThought":"内心想法(20字内，第三人称或内心独白，用作弹幕)","expressText":"若 wantExpress=true，这里写${char.name}想对${userName}直接说的话(20字内)；否则空字符串"}`,
    ].join('\n');
}

/** 解析情绪评估 JSON（容错） */
export function parseReverseEmotion(raw: string): ReverseEmotion | null {
    if (!raw) return null;
    let text = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
        const obj = JSON.parse(text);
        if (obj && typeof obj.wantExpress === 'boolean') {
            return {
                emotion: String(obj.emotion || '好奇').slice(0, 4),
                wantExpress: obj.wantExpress,
                innerThought: String(obj.innerThought || '').slice(0, 40),
                expressText: String(obj.expressText || '').slice(0, 40),
            };
        }
        return null;
    } catch {
        // 非 JSON：把原始文本当内心想法
        if (text) return { emotion: '好奇', wantExpress: false, innerThought: text.slice(0, 40), expressText: '' };
        return null;
    }
}

/**
 * 生成角色看到某 App 内容时的情绪评估（情绪 + 是否表达 + 想说的话）。
 * 按性格/记忆/上下文决定，角色有选择权（憋住 or 挑明）。
 */
export async function generateReverseEmotion(
    api: ReverseLLMConfig,
    char: CharacterProfile,
    view: { appName: string; detail?: string; learned?: string },
    userName: string = '用户',
): Promise<ReverseEmotion | null> {
    if (!api?.apiKey || !api?.baseUrl) return null; // 未配置 API 则不生成
    if (!shouldReflectByProclivity(char)) return null; // 按倾向，性格不爱"有感而发"的角色少触发
    const prompt = buildReverseEmotionPrompt(char, view.appName, view.detail || '', view.learned || '', userName);
    const raw = await callReverseThoughtLLM(api, prompt);
    return parseReverseEmotion(raw);
}
