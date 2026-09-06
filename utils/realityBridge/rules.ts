/** 现实桥 · 规则匹配 / 冷却 / 加工 精简引擎（本地判定 + Worker 同构语义）。
 *  云端不复制本文件：Worker 以同一 JSON 规则结构独立实现 matchType/cooldown，
 *  ai 加工在云端执行；本文件供 UI「测试」与本地前台执行复用。 */

import { BridgeItem, BridgeRule } from './types';

/** 判断某条数据是否命中规则（matchType='*' 全匹配，否则等值匹配）。 */
export function ruleMatches(rule: BridgeRule, item: BridgeItem): boolean {
    if (!rule.enabled) return false;
    if (rule.matchType === '*' || !rule.matchType) return true;
    return rule.matchType === item.type;
}

/** 冷却判定：距上次触发（runs[rule.id]）是否仍在间隔内。 */
export function inCooldown(rule: BridgeRule, lastRunAt: number, now = Date.now()): boolean {
    const cdMs = Math.max(0, Number(rule.cooldownMinutes) || 0) * 60_000;
    return cdMs > 0 && now - lastRunAt < cdMs;
}

/** template 占位展开：{payload} / {type}。 */
export function fillTemplate(template: string, item: BridgeItem): string {
    return template.replace(/\{payload\}/g, item.payload).replace(/\{type\}/g, item.type);
}

export type ProcessMode = 'raw' | 'template' | 'ai';

/**
 * 加工数据文本。
 * - raw：原样返回 payload
 * - template：展开 {payload}/{type}（截 4000）
 * - ai：本函数不调模型；返回 null 表示需由云端/调用方做 AI 加工。
 */
export function processBridgeText(rule: BridgeRule, item: BridgeItem): { text: string; mode: ProcessMode } | null {
    const mode = rule.process?.mode ?? 'raw';
    if (mode === 'template' && rule.process?.template) {
        return { text: fillTemplate(rule.process.template, item).slice(0, 4000), mode };
    }
    if (mode === 'ai') return null;
    return { text: item.payload, mode: 'raw' };
}

/** 生成一条事件消息文案（进聊天 user 侧，说明来源）。 */
export function buildEventText(item: BridgeItem, processedText?: string): string {
    const body = (processedText ?? item.payload).trim();
    return body || item.payload;
}

/** 事件消息在聊天里的显示：加现实桥来源前缀，让角色/用户一眼看出「这是桥数据」。 */
export function buildEventDisplayText(type: string, body: string): string {
    return body;
}

export function safeSlice(text: string, max = 2000): string {
    return (text ?? '').slice(0, max);
}
