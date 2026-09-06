/** 现实桥 · 与云 Worker(reality-bridge) 的同步层。
 *
 *  Worker 是桥事件唯一处理者：快捷指令 POST → 云端收件箱；App 在此把
 *  启用角色 persona/历史 + API 凭据 + push 订阅 + 规则/开关快照上传，
 *  并拉取/认领已生成的推送 bundle 供前端合并。
 */

import { loadBridgeSettings } from './settings';
import type { BridgeItem, BridgeRule, BridgePushBundle, BridgeSettings } from './types';

function baseUrl(): string {
    return loadBridgeSettings().workerUrl.replace(/\/+$/, '');
}

function headers(token?: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const tk = token ?? loadBridgeSettings().token;
    if (tk) h['Authorization'] = `Bearer ${tk}`;
    return h;
}

async function parseJson(resp: Response): Promise<{ ok: boolean; error?: string; data?: unknown }> {
    try {
        const body = await resp.json() as { ok?: boolean; error?: string; data?: unknown };
        return { ok: body.ok !== false, error: body.error, data: body.data };
    } catch {
        return { ok: false, error: `服务器响应异常（HTTP ${resp.status}）` };
    }
}

/** 组装一次「把 iPhone 数据送进现实桥」的请求体示例（供 UI 复制给快捷指令）。 */
export function buildInboxRequestExample(settings: BridgeSettings, type = '剪贴板', payload = '示例内容'): string {
    const url = `${settings.workerUrl.replace(/\/+$/, '')}/bridge/inbox`;
    return `POST ${url}\n\n{ "token": "${settings.token}", "type": "${type}", "payload": "${payload}" }`;
}

/** 手动发一条测试事件（等价于 iPhone 快捷指令 POST）。 */
export async function sendBridgeTestItem(type: string, payload: string): Promise<{ ok: boolean; error?: string; id?: string }> {
    if (!baseUrl()) return { ok: false, error: '请先填写 Worker 地址' };
    try {
        const resp = await fetch(`${baseUrl()}/bridge/inbox`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ type, payload }),
        });
        const json = await parseJson(resp);
        if (!resp.ok || !json.ok) return { ok: false, error: json.error || `HTTP ${resp.status}` };
        return { ok: true, id: (json.data as { id?: string } | undefined)?.id };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** 查询 Worker 状态（健康 + 版本 + 今日收件数）。 */
export async function bridgeStatus(): Promise<{ ok: boolean; error?: string; info?: { version?: string; todayCount?: number } }> {
    if (!baseUrl()) return { ok: false, error: '未配置 Worker 地址' };
    try {
        const resp = await fetch(`${baseUrl()}/status`, { headers: headers() });
        const json = await parseJson(resp);
        if (!resp.ok || !json.ok) return { ok: false, error: json.error || `HTTP ${resp.status}` };
        return { ok: true, info: (json.data ?? {}) as { version?: string; todayCount?: number } };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** 上传角色上下文 + 规则 + 开关快照到云端（Worker 据此跑 LLM 生成回应）。 */
export async function uploadBridgeConfig(payload: {
    rules: BridgeRule[];
    characters: Array<{ id: string; enabled: boolean; autoReply: boolean; persona?: string; history?: Array<{ role: string; content: string }> }>;
    llm?: { apiUrl: string; apiKey: string; model: string };
    pushSubscription?: { endpoint: string; keys: { p256dh: string; auth: string } } | null;
}): Promise<{ ok: boolean; error?: string }> {
    if (!baseUrl()) return { ok: false, error: '请先填写 Worker 地址' };
    try {
        const resp = await fetch(`${baseUrl()}/bridge/config`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(payload),
        });
        const json = await parseJson(resp);
        if (!resp.ok || !json.ok) return { ok: false, error: json.error || `HTTP ${resp.status}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** 拉取待合并的推送 bundle（App 回前台时兜底，防 SW 未收到/丢消息）。 */
export async function fetchPendingBundles(): Promise<BridgePushBundle[]> {
    if (!baseUrl()) return [];
    try {
        const resp = await fetch(`${baseUrl()}/bridge/pending`, { headers: headers() });
        if (!resp.ok) return [];
        const json = (await resp.json()) as { ok?: boolean; items?: BridgePushBundle[] };
        if (json.ok === false || !Array.isArray(json.items)) return [];
        return json.items;
    } catch {
        return [];
    }
}

/** 批量认领（删除）云端待合并 bundle。 */
export async function ackBundles(eventIds: string[]): Promise<void> {
    if (!baseUrl() || eventIds.length === 0) return;
    try {
        await fetch(`${baseUrl()}/bridge/pending/ack`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ ids: eventIds }),
        });
    } catch { /* 认领失败留待下次 */ }
}

/** 幂等写入一条云端待处理事件（手工排障用，等价快捷指令 POST）。 */
export async function pushBridgeItem(item: BridgeItem): Promise<{ ok: boolean; error?: string }> {
    return sendBridgeTestItem(item.type, item.payload);
}
