/**
 * 反查手机 · 触发增强纯逻辑
 *
 * 集中管理反查的「概率主动触发」「冷却」「角色意愿判定」「拒绝文案」，避免散落在 Chat.tsx：
 *  - 概率：按角色反查倾向（resolveReverseProclivity）映射到 REVERSE_PROCLIVITY_TUNE.weight → 触发概率
 *  - 冷却：localStorage 记录上次反查时间 + 触发轮次，避免频繁刷屏
 *  - 角色意愿：用户主动让角色查手机时，按倾向 + 随机决定同意/拒绝
 *  - 拒绝文案：本地模板（不调 LLM），按性格给不同台词
 *
 * 纯函数 + localStorage，可单测。
 */

import type { CharacterProfile, ReverseProclivity } from '../../types';
import { REVERSE_PROCLIVITY_TUNE, resolveReverseProclivity } from '../../constants';

const COOLDOWN_KEY = 'sullyos_reverse_cooldown_v1';

/** 冷却时长（ms）：两次主动反查的最小间隔 */
export const REVERSE_COOLDOWN_MS = 20 * 60 * 1000; // 20 分钟
/** 主动发起的最小聊天轮数 */
export const MIN_TRIGGER_ROUNDS = 3;

/** 用户主动让角色查手机的意图正则（命中即视为用户请求） */
export const REVERSE_USER_ASK_RE = new RegExp(
    // 你查/看/翻/检查手机（含"一下/下/我/我的"）
    '(你(?:去|来|可以|帮我)?(?:查|看|翻|检查|翻翻|翻看)(?:一下|下)?(?:我|我的)?(?:手机|聊天|记录|消息))' +
    // 我手机给你看/查/翻
    '|((?:我|我的)手机(?:给|拿)你(?:看|查|翻))' +
    // 让你/给你 看/查/翻（手机）
    '|((?:让你|给你)(?:看|查|翻)(?:手机)?)' +
    // 查/翻/看 我的手机
    '|((?:查|翻|看)(?:我的|我)手机)' +
    // 你查一下我 / 你翻我
    '|(你(?:查|翻)一下我)'
);

/** 反查倾向 → 主动触发概率（每轮判定时的基准概率） */
const PROCLIVITY_PROB: Record<ReverseProclivity, number> = {
    high: 0.20,
    medium: 0.12,
    low: 0.05,
    none: 0,
};

/** 反查倾向 → 角色对「用户让 TA 查」的同意概率 */
const PROCLIVITY_CONSENT: Record<ReverseProclivity, number> = {
    high: 0.9,
    medium: 0.7,
    low: 0.25,
    none: 0.1,
};

interface CooldownState {
    lastTimestamp: number;
    lastRound: number;
}

/** 读取冷却状态 */
export function getReverseCooldown(): CooldownState {
    try {
        const raw = localStorage.getItem(COOLDOWN_KEY);
        if (raw) return JSON.parse(raw) as CooldownState;
    } catch { /* 解析失败回落 */ }
    return { lastTimestamp: 0, lastRound: 0 };
}

/** 记录一次反查触发（时间 + 轮次） */
export function setReverseCooldown(roundCount: number): void {
    try {
        localStorage.setItem(COOLDOWN_KEY, JSON.stringify({
            lastTimestamp: Date.now(),
            lastRound: roundCount,
        }));
    } catch { /* 存储失败静默 */ }
}

/** 冷却是否已过（距上次触发超过 REVERSE_COOLDOWN_MS 即认为已过） */
export function isCooldownPassed(now: number = Date.now()): boolean {
    return now - getReverseCooldown().lastTimestamp >= REVERSE_COOLDOWN_MS;
}

/** 取角色反查倾向等级（复用 constants 的自动推导） */
export function proclivityOf(char: CharacterProfile): ReverseProclivity {
    return resolveReverseProclivity(char.systemPrompt);
}

/** 按倾向拿主动触发概率 */
export function proclivityProbability(char: CharacterProfile): number {
    return PROCLIVITY_PROB[proclivityOf(char)];
}

/**
 * 判定「聊了若干轮后」是否应主动发起反查。
 * 条件：轮数达阈值 + 冷却已过 + Math.random() < 概率。命中后调用方应 setReverseCooldown。
 */
export function shouldAutoTriggerReverse(char: CharacterProfile, roundCount: number, rand: number = Math.random()): boolean {
    if (roundCount < MIN_TRIGGER_ROUNDS) return false;
    if (!isCooldownPassed()) return false;
    const prob = PROCLIVITY_PROB[proclivityOf(char)];
    if (prob <= 0) return false;
    return rand < prob;
}

/** 角色对「用户让 TA 查手机」的自主意愿：同意 / 拒绝 */
export type ReverseConsent = 'agree' | 'decline';

export function roleConsentToReverse(char: CharacterProfile, rand: number = Math.random()): ReverseConsent {
    const consentProb = PROCLIVITY_CONSENT[proclivityOf(char)];
    return rand < consentProb ? 'agree' : 'decline';
}

/** 用户主动让角色查：识别用户意图文本 */
export function isUserAskingReverse(userText: string): boolean {
    return REVERSE_USER_ASK_RE.test(userText || '');
}

/**
 * 角色拒绝「用户让查手机」时的本地回复文案（按性格，不调 LLM）。
 * 倾向 high/medium 且仍拒绝 → 傲娇式；low/none → 尊重隐私式。
 */
export function buildRoleDeclineText(char: CharacterProfile): string {
    const level = proclivityOf(char);
    const name = char.name || '';
    switch (level) {
        case 'high':
        case 'medium':
            return `哼，谁要看你手机，我才不看呢。${name} 扭头。`;
        case 'low':
            return `不了，尊重你的隐私，手机我就不看啦。`;
        default:
            return `还是不看了，每个人都有自己的小秘密。`;
    }
}

/** 角色同意时（用户主动让查）的简短接受语（可选，用于聊天反馈） */
export function buildRoleAgreeText(char: CharacterProfile): string {
    const level = proclivityOf(char);
    if (level === 'high') return `真的让我看？那...那我看了哦。`;
    if (level === 'medium') return `嗯...你确定？那我稍微看一下。`;
    return `好呀，那我看一眼。`;
}
