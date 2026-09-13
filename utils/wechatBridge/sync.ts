/** 微信桥 · 与云 Worker（sullyos-wechat-bridge）的同步层。
 *
 * 与现实桥 sync.ts 同一套形状：轻封装 fetch + 统一错误归一。
 * 收发对接微信官方 iLink Bot API：扫码登录由 Worker 中转（bot token 加密落库，
 * 前端拿不到），收消息靠 Worker 的 cron 长轮询。
 * 绑定模型：**在哪个角色的设定页扫码，微信就归那个角色**；换角色走 bindBot 一键改绑。
 */

import type { AmsgFirePack } from '../amsgFirePack';
import type {
  WechatConfigUploadResult,
  WechatOutboxEntry,
  WechatStatusInfo,
} from './types';
import { loadWechatSettings, saveWechatCursor } from './settings';
import { mergeWechatOutboxEntry } from './chat-glue';

function baseUrl(): string {
  return loadWechatSettings().workerUrl.replace(/\/+$/, '');
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const tk = token ?? loadWechatSettings().token;
  if (tk) h['X-Client-Token'] = tk;
  return h;
}

const isConfigured = (): boolean => !!baseUrl();

async function post<T>(path: string, body?: unknown): Promise<{ ok: boolean; error?: string; hint?: string; data?: T }> {
  try {
    const resp = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = await resp.json().catch(() => null) as { ok?: boolean; error?: string; hint?: string; data?: T } | null;
    if (!resp.ok) return { ok: false, error: parsed?.error || `HTTP ${resp.status}`, hint: parsed?.hint };
    return { ok: parsed?.ok !== false, error: parsed?.error, hint: parsed?.hint, data: (parsed?.data ?? (parsed as unknown as T)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Worker 状态自检（设置页红绿灯用）。 */
export async function wechatStatus(): Promise<{ ok: boolean; error?: string; info?: WechatStatusInfo }> {
  if (!isConfigured()) return { ok: false, error: '未配置 Worker 地址' };
  try {
    const resp = await fetch(`${baseUrl()}/wx/status`, { headers: headers() });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const body = await resp.json() as { ok?: boolean; error?: string; data?: WechatStatusInfo };
    if (body.ok === false) return { ok: false, error: body.error };
    return { ok: true, info: body.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 上传 LLM 凭据（Worker 端用 MASTER_KEY 加密落库）。 */
export async function uploadWechatConfig(payload: {
  llm?: { apiUrl: string; apiKey: string; model: string } | null;
  clearLlm?: boolean;
}): Promise<WechatConfigUploadResult> {
  if (!isConfigured()) return { ok: false, error: '请先填写 Worker 地址' };
  const res = await post<{ llmConfigured?: boolean }>('/wx/config', payload);
  return { ok: res.ok, error: res.error, hint: res.hint, llmConfigured: res.data?.llmConfigured };
}

/** 上传某角色的 fire_pack。Worker 侧对 chat 段做「只许往前」的版本守卫。 */
export async function uploadWechatPack(
  charId: string,
  pack: AmsgFirePack,
): Promise<{ ok: boolean; error?: string; chatKept?: boolean; templateVer?: number }> {
  if (!isConfigured()) return { ok: false, error: '请先填写 Worker 地址' };
  const res = await post<{ chatKept?: boolean; templateVer?: number }>(
    '/wx/pack', { charId, pack, chatBuiltAt: pack.chat?.builtAt ?? 0 },
  );
  return { ok: res.ok, error: res.error, chatKept: res.data?.chatKept, templateVer: res.data?.templateVer };
}

// ── 扫码登录（全程 Worker 中转，bot token 加密落库，前端拿不到） ──

export interface QrLoginStart {
  ok: boolean;
  error?: string;
  /** 轮询状态用的 id。 */
  qrcode?: string;
  /** 可直接放进 <img> 的二维码地址。 */
  img?: string;
}

export async function startQrLogin(): Promise<QrLoginStart> {
  const res = await post<{ qrcode?: string; img?: string }>('/wx/bot/qr');
  return { ok: res.ok, error: res.error, qrcode: res.data?.qrcode, img: res.data?.img };
}

export type QrLoginState = 'wait' | 'scaned' | 'confirmed' | 'expired';

export interface QrLoginPoll {
  ok: boolean;
  error?: string;
  status?: QrLoginState;
  /** confirmed 时返回：bot 已加密落库并绑定到 charId（扫码的那个角色）。 */
  botId?: string;
  charId?: string;
  /** confirmed 时返回：同角色下被云端自动清理的旧绑定数量（重扫 = 以最新为准）。 */
  removedOld?: number;
}

/**
 * 轮询扫码状态。`charId` = 当前角色的 id（在谁家扫码就绑谁），确认时由 Worker 写进绑定。
 */
export async function pollQrLogin(qrcode: string, charId: string): Promise<QrLoginPoll> {
  if (!isConfigured()) return { ok: false, error: '请先填写 Worker 地址' };
  try {
    const params = new URLSearchParams({ qrcode });
    if (charId) params.set('charId', charId);
    const resp = await fetch(`${baseUrl()}/wx/bot/qr/status?${params.toString()}`, { headers: headers() });
    const body = await resp.json().catch(() => null) as
      { ok?: boolean; error?: string; status?: QrLoginState; botId?: string; charId?: string; removedOld?: number } | null;
    if (!resp.ok || body?.ok === false) return { ok: false, error: body?.error || `HTTP ${resp.status}` };
    return { ok: true, status: body?.status, botId: body?.botId, charId: body?.charId, removedOld: body?.removedOld };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 一键改绑 / 改自动回复开关。token 与游标不动——换角色不需要重新扫码。
 * botId 缺省 = 唯一那个 bot。
 */
export async function bindBot(payload: { botId?: string; charId: string; autoReply?: boolean }): Promise<{
  ok: boolean;
  error?: string;
  botId?: string;
  charId?: string;
}> {
  const res = await post<{ botId?: string; charId?: string }>('/wx/bot/bind', payload);
  return { ok: res.ok, error: res.error, botId: res.data?.botId, charId: res.data?.charId };
}

/** 连接体检：让 Worker 对 bot 做一次真实轮询，探测 token 是否过期（顺带收消息）。 */
export async function checkBot(botId?: string): Promise<{ ok: boolean; error?: string; expired?: boolean }> {
  const res = await post<{ expired?: boolean; botId?: string }>('/wx/bot/check', botId ? { botId } : {});
  return { ok: res.ok, error: res.error, expired: res.data?.expired };
}

/**
 * 幂等建表：面板路线装完后端、还没建表时点一下就好（POST /wx/init）。
 * 不用去 D1 控制台粘 SQL —— 粘错一个字就是"功能假死 + 报错看不懂"。
 * 重复调用无副作用（后端全是 CREATE ... IF NOT EXISTS）。
 */
export async function initWechatSchema(): Promise<{
  ok: boolean;
  error?: string;
  created?: string[];
  tableCount?: number;
}> {
  if (!isConfigured()) return { ok: false, error: '请先填写 Worker 地址' };
  const res = await post<{ created?: string[]; tableCount?: number }>('/wx/init');
  return { ok: res.ok, error: res.error, created: res.data?.created, tableCount: res.data?.tableCount };
}

export async function removeBot(botId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await post<{ removed?: number }>('/wx/bot/remove', { botId });
  return { ok: res.ok, error: res.error };
}

// ── 增量补收（回流） ──

/** 拉取待合并的增量。 */
export async function pullWechatOutbox(
  since: number,
  charId?: string,
): Promise<{ items: WechatOutboxEntry[]; nextSince: number }> {
  if (!isConfigured()) return { items: [], nextSince: since };
  try {
    const params = new URLSearchParams({ since: String(since), limit: '200' });
    if (charId) params.set('charId', charId);
    const resp = await fetch(`${baseUrl()}/wx/outbox?${params.toString()}`, { headers: headers() });
    if (!resp.ok) return { items: [], nextSince: since };
    const body = await resp.json() as { ok?: boolean; items?: WechatOutboxEntry[]; nextSince?: number };
    if (body.ok === false || !Array.isArray(body.items)) return { items: [], nextSince: since };
    return { items: body.items, nextSince: typeof body.nextSince === 'number' ? body.nextSince : since };
  } catch {
    return { items: [], nextSince: since };
  }
}

/** 批量认领（删除）已合并的增量。失败不抛：下次重复拉，幂等合并会兜住。 */
export async function ackWechatOutbox(seqs: number[]): Promise<void> {
  if (!isConfigured() || seqs.length === 0) return;
  try {
    await fetch(`${baseUrl()}/wx/outbox/ack`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ seqs }),
    });
  } catch { /* 认领失败留待下次 */ }
}

export interface DrainResult {
  merged: number;
  /** 这次有新消息落进主时间线的角色（调用方可据此刷新 UI）。 */
  charIds: string[];
  nextSince: number;
}

/**
 * 增量补收一条龙：拉 → 合并 → 认领 → 推进游标。
 *
 * 顺序不能换：**先合并成功、再认领**。中途崩了最坏情况是「合并了但没认领」，
 * 下次重复拉同一条、幂等合并直接跳过——绝不会出现「认领了但没合并」的消息黑洞。
 */
export async function drainWechatOutbox(charId?: string): Promise<DrainResult> {
  const settings = loadWechatSettings();
  const since = charId ? 0 : settings.lastSeq;
  const { items, nextSince } = await pullWechatOutbox(since, charId);
  if (items.length === 0) return { merged: 0, charIds: [], nextSince: settings.lastSeq };

  const touched = new Set<string>();
  const acked: number[] = [];
  let merged = 0;
  for (const item of items) {
    if (typeof item.seq === 'number') acked.push(item.seq);
    try {
      // persistTimestamp 用微信真实发送时刻（云端记账的 at）：气泡显示的时间才对得上
    // 「这条是那时候在微信里聊的」；同时避免补收写库时刻晚于云端 chatBuiltAt，
    // 让自动同步把「微信聊过」误判成「App 里聊过」。
    if (await mergeWechatOutboxEntry(item, item.at)) {
        merged += 1;
        touched.add(item.charId);
      }
    } catch { /* 单条失败不连累整批；它没被认领，下次会再来 */ }
  }
  await ackWechatOutbox(acked);
  if (!charId) saveWechatCursor(nextSince);
  return { merged, charIds: [...touched], nextSince };
}
