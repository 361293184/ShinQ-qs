/**
 * 微信桥 · 微信官方 iLink Bot 客户端（收发层）。
 *
 * 这是微信 2026 年通过 ClawBot 开放的**官方** Bot API（iLink 协议）：扫码登录拿
 * bot_token，之后纯 HTTP 长轮询收消息、HTTP 发消息——**不需要任何第三方网关、
 * 常驻程序或付费服务**，官方接口也基本没有封号问题。
 *
 * 协议实现移植自上游已验证的同源项目 ai-virtual-phone
 * （tools/weixin-local-assistant/assistant-core.mjs 与 lib/weixin-bridge.ts），
 * 那边是更详细的协议来源，改动前先对照。
 *
 * 关键协议事实（改代码前先背下来）：
 *   · `getupdates` 是**长轮询**（服务端最多挂 ~35s 才返回）。游标 `get_updates_buf`
 *     是不透明串：必须持久化、原样回传；首次传空串。
 *   · `error_code === -14` = 会话过期，没有刷新接口。**别一次就判死**：它也会被瞬时
 *     因素触发（长轮询被平台掐断 / 两个轮询器并发打同一 token），所以 pollUpdates
 *     先丢游标重试一次，仍 -14 才算真过期（2026-09-13 因此误报过一次，用户白重扫）。
 *   · 回复**必须**原样带上入站消息里的 `context_token`，否则路由不回会话。
 *     所以协议天然「只能被动回复」，没法凭空主动发起消息。
 *   · 扫码确认后可能返回专属 `baseurl`（与默认基址不同），必须持久化并用返回值。
 *
 * 零浏览器依赖（会被打进 worker bundle）。
 */

const DEFAULT_ILINK_BASE = 'https://ilinkai.weixin.qq.com';

/** 所有请求体都要带的基础信息（上游同款；别随手升版本，升了要两边对齐）。 */
export const ILINK_BASE_INFO = { channel_version: '1.0.2' };

// ─────────── 消息形状（只声明用得到的字段，其余原样透传不解释） ───────────

export interface ILinkInboundMessage {
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  /** 回复路由凭据：谁发来的这条，回复时就带谁的。 */
  context_token?: string;
  item_list?: Array<{
    type?: number;
    text_item?: { text?: string };
    [key: string]: unknown;
  }>;
}

export interface QrLoginStartResult {
  /** 轮询扫码状态用的 id。 */
  qrcode: string;
  /** 可直接放进 <img> 的二维码地址。 */
  qrcodeImg: string;
}

export type QrLoginState = 'wait' | 'scaned' | 'confirmed' | 'expired';

export interface QrLoginPollResult {
  status: QrLoginState;
  /** confirmed 时才有：后续一切调用的 Bearer 凭据（落库前必须加密）。 */
  botToken?: string;
  /** 这个 bot 自己的 id——防自环过滤就靠它。 */
  botId?: string;
  /** 登录确认可能返回专属基址；有就用它，没有回退官方基址。 */
  baseUrl?: string;
}

export interface PollUpdatesResult {
  /** true = 丢游标重试后仍判会话过期（只有真过期才是 true，见 pollUpdates 注释）。 */
  expired: boolean;
  messages: ILinkInboundMessage[];
  /** 下次轮询要带的游标；expired 时为空串（官方口径：清状态重新开始）。 */
  nextCursor: string;
  /** true = 这一次是「丢游标重试」拿到的结果（会话已自愈，游标已重置）。 */
  cursorReset?: boolean;
}

export interface SendTextResult {
  ok: boolean;
  error?: string;
}

// ─────────── 请求头与底层调用 ───────────

function makeIlinkHeaders(botToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'iLink-App-ClientVersion': '1',
  };
  if (botToken) {
    // 官方文档口径：随机 uint32 → 十进制字符串 → base64（不是原始 4 字节的 base64）。
    // 每次请求重新生成，照抄勿改。
    const randomUin = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    headers['Authorization'] = `Bearer ${botToken}`;
    headers['AuthorizationType'] = 'ilink_bot_token';
    headers['X-WECHAT-UIN'] = btoa(String(randomUin));
  }
  return headers;
}

async function ilinkJson<T>(
  baseUrl: string,
  path: string,
  botToken: string | undefined,
  body: unknown,
  timeoutMs = 40_000,
): Promise<T> {
  const base = (baseUrl || DEFAULT_ILINK_BASE).replace(/\/+$/, '');
  // 上游所有端点（含扫码两个 GET 语义的）都按 POST 发且可用——照抄，别"纠正"成 GET。
  const resp = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: makeIlinkHeaders(botToken),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`iLink HTTP ${resp.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`iLink 返回的不是 JSON：${text.slice(0, 200)}`);
  }
}

// ─────────── 扫码登录 ───────────

/** 拿一张登录二维码。qrcodeImg 可直接塞进 <img>。 */
export async function startQrLogin(): Promise<QrLoginStartResult> {
  const data = await ilinkJson<{ qrcode?: string; qrcode_img_content?: string }>(
    DEFAULT_ILINK_BASE,
    '/ilink/bot/get_bot_qrcode?bot_type=3',
    undefined,
    {},
  );
  if (!data.qrcode || !data.qrcode_img_content) {
    throw new Error('iLink 没有返回二维码，请稍后重试');
  }
  return { qrcode: data.qrcode, qrcodeImg: data.qrcode_img_content };
}

/** 轮询扫码状态。confirmed 之后立即把 token 加密落库，明文不留内存之外。 */
export async function pollQrLogin(qrcode: string): Promise<QrLoginPollResult> {
  const data = await ilinkJson<{
    status?: string;
    bot_token?: string;
    ilink_bot_id?: string;
    baseurl?: string;
    base_url?: string;
  }>(
    DEFAULT_ILINK_BASE,
    `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
    undefined,
    {},
  );
  const raw = String(data.status || '').toLowerCase();
  const status = (['wait', 'scaned', 'confirmed', 'expired'] as const).find((s) => s === raw) ?? 'wait';
  return {
    status,
    botToken: typeof data.bot_token === 'string' && data.bot_token ? data.bot_token : undefined,
    botId: typeof data.ilink_bot_id === 'string' && data.ilink_bot_id ? data.ilink_bot_id : undefined,
    baseUrl: data.baseurl || data.base_url || undefined,
  };
}

// ─────────── 收消息（长轮询） ───────────

/** getupdates 的原始响应（只声明用得到的字段，其余不解释）。 */
interface RawUpdates {
  ret?: number;
  error_code?: number;
  msgs?: ILinkInboundMessage[];
  get_updates_buf?: string;
}

/** 原始响应 → 统一结果。服务端没给新游标就沿用传入的那个。 */
function readUpdates(data: RawUpdates, cursor: string, cursorReset: boolean): PollUpdatesResult {
  return {
    expired: false,
    messages: Array.isArray(data.msgs) ? data.msgs : [],
    nextCursor: typeof data.get_updates_buf === 'string' && data.get_updates_buf ? data.get_updates_buf : cursor,
    cursorReset,
  };
}

/**
 * 长轮询一次（服务端最多挂 ~35s）。游标由调用方持久化：
 * 拿到 nextCursor 就落库，下次带它来；首次传空串。
 *
 * `timeoutMs` 按场景给：HTTP 端点（前端手动检查）给 40s；**cron 必须更短（当前 20s）**
 * ——scheduled 的墙钟预算比 HTTP 小，40s 长轮询会连"状态写回"都来不及就被掐掉
 * （实测症状：lastPollAt 恒久不动，看起来像定时任务压根没跑）。
 *
 * `-14` 必须走**两段式**，别退回成"一次就判死"：
 *   官方文档口径是「会话过期 → 清状态重登」，但它也会被瞬时因素触发——长轮询被平台
 *   掐断，或两个轮询器（cron / App 兜底 / 手动检查）并发打同一个 token（官方文档明确
 *   警告过不要并发 getupdates）。若一次就判死：token 明明还活着，卡片却永久亮
 *   「登录已过期，需要重新扫码」，用户白重扫一次（2026-09-13 实际发生过）。
 * 所以先丢游标重试一次（即官方说的"清状态重来"），仍 -14 才认账。
 */
export async function pollUpdates(
  baseUrl: string,
  botToken: string,
  cursor: string,
  timeoutMs = 40_000,
): Promise<PollUpdatesResult> {
  const call = (buf: string) => ilinkJson<RawUpdates>(
    baseUrl,
    '/ilink/bot/getupdates',
    botToken,
    { get_updates_buf: buf, base_info: ILINK_BASE_INFO },
    timeoutMs,
  );

  const first = await call(cursor || '');
  if (first.error_code !== -14) return readUpdates(first, cursor, false);

  console.warn('[wechat-bridge] getupdates 返回 -14（会话过期），丢游标重试一次');
  const retry = await call('');
  if (retry.error_code === -14) {
    return { expired: true, messages: [], nextCursor: '', cursorReset: true };
  }
  return readUpdates(retry, '', true);
}

/**
 * 入站文本：item_list 里第一个 type===1 且文本非空的项。
 * 图片 / 语音等其他类型 P0 不处理（协议具备能力，留作后续）。
 */
export function extractInboundText(msg: ILinkInboundMessage): string {
  const items = Array.isArray(msg.item_list) ? msg.item_list : [];
  for (const item of items) {
    if (item?.type === 1 && typeof item.text_item?.text === 'string') {
      const text = item.text_item.text.trim();
      if (text) return text;
    }
  }
  return '';
}

// ─────────── 发消息 ───────────

/**
 * 发一条文本。`contextToken` 必须来自要回复的那条入站消息（协议规定，缺了路由不回会话）。
 */
export async function sendText(
  baseUrl: string,
  botToken: string,
  toUserId: string,
  contextToken: string,
  text: string,
): Promise<SendTextResult> {
  // client_id 是微信侧的幂等键：同一条消息重试时要复用同一个 id，这里每次新发自然新 id。
  const clientId = `wxbridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await ilinkJson<{ ret?: number }>(
      baseUrl,
      '/ilink/bot/sendmessage',
      botToken,
      {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: [{ type: 1, text_item: { text } }],
        },
        base_info: ILINK_BASE_INFO,
      },
      20_000,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export { DEFAULT_ILINK_BASE };
