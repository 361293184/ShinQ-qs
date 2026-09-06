/**
 * 现实桥 · Cloudflare Worker 入口
 *
 * 职责：
 *  - /bridge/inbox  POST  快捷指令把现实数据送进来（type+payload），幂等入库；
 *  - /bridge/config POST  App 上传角色 persona/历史 + LLM 凭据(加密) + push 订阅 + 规则/开关快照；
 *  - /bridge/pending GET / POST(ack)  App 兜底拉取/认领待合并 bundle（SW 收到 push 后一般不查这里）；
 *  - /screen-chat  POST   屏幕速聊同步端点：返回 LLM 对「截图文本/问题」的直接回应；
 *  - /status /health /vapid-public-key。
 *
 * 处理模型：收到 inbox 后，读 config → 按「规则匹配 + 角色开关 + autoReply」决定：
 *  - 有命中开关角色：生成 BridgePushBundle（事件 + 可选角色回应 + 动作请求）存 D1 并 Web Push；
 *  - 无人接收：仅存档（保留待查）。
 *  Worker 不写 Sully 本地库——本地动作由 App 收到 bundle 后落地。
 */

import { prepareVapid, sendPush, type VapidContext, type PushSubscription } from './webpush';
import { decryptSecret, encryptSecret, callLlm, buildLlmMessages, type LlmCredentials } from './llm';

const BRIDGE_VERSION = '1.0.0';

interface Env {
  DB: D1Database;
  CLIENT_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** 加密 LLM 凭据主密钥（64 位 hex） */
  MASTER_KEY: string;
}

/* 最小 D1 类型声明（与 proactive-push/amsg 同风格，不引 workers-types） */
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  first<T = unknown>(col?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

/* ─────────── 类型 ─────────── */

interface InboxBody {
  type?: string;
  payload?: string;
  token?: string;
}

interface CharCtx {
  id: string;
  enabled: boolean;
  autoReply: boolean;
  persona?: string;
  history?: Array<{ role: string; content: string }>;
}

interface ConfigRow {
  rules_json: string;
  chars_json: string;
  llm_enc: string | null;
  llm_iv: string | null;
  push_sub: string | null;
}

interface BundleRow {
  event_id: string;
  char_id: string;
  item_type: string;
  event_text: string;
  reply_text: string | null;
  action_notes: string | null;
  created_at: number;
}

/* ─────────── helpers ─────────── */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function checkToken(req: Request, env: Env): Response | null {
  if (!env.CLIENT_TOKEN) return null;
  const auth = req.headers.get('Authorization') || '';
  const got = auth.replace(/^Bearer\s+/i, '').trim() || req.headers.get('X-Client-Token') || '';
  if (got !== env.CLIENT_TOKEN) return json({ ok: false, error: 'unauthorized' }, 401);
  return null;
}

async function readJson<T>(req: Request): Promise<T | null> {
  try { return await req.json() as T; } catch { return null; }
}

function genId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const MASTER_SALT = 'reality-bridge-v1';

async function getVapid(env: Env): Promise<VapidContext | null> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return prepareVapid(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT || 'mailto:bridge@example.com');
}

async function parsePushSub(raw: string | null): Promise<PushSubscription | null> {
  if (!raw) return null;
  try {
    const sub = JSON.parse(raw) as PushSubscription;
    if (sub?.endpoint && sub?.p256dh && sub?.auth) return sub;
  } catch { /* ignore */ }
  return null;
}

async function tryPush(env: Env, sub: PushSubscription, bundle: Omit<BundleRow, 'created_at'> & { created_at?: number }): Promise<boolean> {
  const vapid = await getVapid(env);
  if (!vapid) return false;
  try {
    const result = await sendPush(vapid, sub, JSON.stringify({ kind: 'bridge-event', ...bundle }));
    return result.ok;
  } catch { return false; }
}

/* ─────────── 处理一条 inbox ─────────── */

async function handleInbox(req: Request, env: Env): Promise<Response> {
  const body = await readJson<InboxBody>(req);
  if (!body || !body.type || body.payload === undefined) return json({ ok: false, error: 'missing type/payload' }, 400);
  const type = String(body.type).slice(0, 80);
  const payload = String(body.payload).slice(0, 8000);
  const eventId = genId();
  const createdAt = Date.now();

  // 幂等：同 payload+type 近 60s 已收过则不重复入库
  const dup = await env.DB.prepare(
    `SELECT id FROM bridge_items WHERE item_type = ?1 AND payload = ?2 AND created_at > ?3 LIMIT 1`
  ).bind(type, payload, createdAt - 60_000).first<{ id: string }>();
  if (dup) return json({ ok: true, deduped: true, id: dup.id });

  await env.DB.prepare(
    `INSERT INTO bridge_items (id, item_type, payload, created_at) VALUES (?1, ?2, ?3, ?4)`
  ).bind(eventId, type, payload, createdAt).run();

  // 读取 config
  const cfg = await env.DB.prepare(
    `SELECT rules_json, chars_json, llm_enc, llm_iv, push_sub FROM bridge_config WHERE id = 'main'`
  ).first<ConfigRow>();
  if (!cfg) return json({ ok: true, id: eventId, note: '已存档（未配置角色）' });

  let chars: CharCtx[] = [];
  try { chars = JSON.parse(cfg.chars_json || '[]') as CharCtx[]; } catch { /* ignore */ }

  // 命中的接收角色：开关 enabled 且其 persona 存在；事件类型尽量匹配字符（v1：规则忽略，直接看开关）
  const targets = chars.filter(c => c && c.enabled);

  // 解密 LLM 凭据（autoReply 的目标才需要）
  let llm: LlmCredentials | null = null;
  if (targets.some(c => c.autoReply) && cfg.llm_enc && cfg.llm_iv && env.MASTER_KEY) {
    const plain = await decryptSecret(env.MASTER_KEY, MASTER_SALT, cfg.llm_iv, cfg.llm_enc);
    if (plain) {
      try { llm = JSON.parse(plain) as LlmCredentials; } catch { /* ignore */ }
    }
  }

  const bundles: Array<BundleRow> = [];
  for (const char of targets) {
    let replyText: string | null = null;
    if (char.autoReply && llm) {
      const persona = char.persona || `你是「${char.id}」，请自然回应。`;
      const history = char.history || [];
      const messages = [...history.slice(-12).map(m => ({ role: m.role, content: m.content })),
        ...buildLlmMessages(persona, payload, type)];
      const res = await callLlm(llm, messages as Array<{ role: string; content: string }>);
      if (res.ok) replyText = res.text ?? null;
    }
    const bundle: BundleRow = {
      event_id: eventId,
      char_id: char.id,
      item_type: type,
      event_text: payload,
      reply_text: replyText,
      action_notes: JSON.stringify(replyText ? ['写入聊天（事件+回应）'] : ['写入聊天（仅事件）']),
      created_at: createdAt,
    };
    await env.DB.prepare(
      `INSERT INTO bridge_bundles (event_id, char_id, item_type, event_text, reply_text, action_notes, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(bundle.event_id, bundle.char_id, bundle.item_type, bundle.event_text,
      bundle.reply_text, bundle.action_notes, bundle.created_at).run();
    bundles.push(bundle);
  }

  // 推送第一个订阅（多角色取同一 push 订阅各推一次会打扰；v1：只推第一个命中的）
  if (bundles.length > 0) {
    const sub = await parsePushSub(cfg.push_sub);
    if (sub) {
      for (const b of bundles) {
        const pushed = await tryPush(env, sub, b);
        if (!pushed) break; // 第一个没推成（如无 VAPID/订阅死）就停，App 打开走 /bridge/pending 兜底
        // 推送成功后短暂间隔避免同一秒多条（bundle 已带 char，多角色仍会多条 push，可接受）
      }
    }
  }

  return json({ ok: true, id: eventId, delivered: bundles.length > 0 ? bundles.length : 0 });
}

/* ─────────── config 上传 ─────────── */

async function handleConfig(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{
    rules?: unknown[];
    characters?: CharCtx[];
    llm?: LlmCredentials;
    pushSubscription?: PushSubscription | null;
  }>(req);
  if (!body) return json({ ok: false, error: 'invalid json' }, 400);

  const now = Date.now();
  const chars = (body.characters || []).map(c => ({
    id: String(c.id || '').slice(0, 120),
    enabled: c.enabled !== false,
    autoReply: c.autoReply === true,
    persona: String(c.persona || '').slice(0, 8000),
    history: Array.isArray(c.history) ? c.history.slice(-20) : [],
  })).filter(c => c.id);

  let llmEnc: string | null = null;
  let llmIv: string | null = null;
  if (body.llm?.apiUrl && env.MASTER_KEY) {
    const { iv, data } = await encryptSecret(env.MASTER_KEY, MASTER_SALT, JSON.stringify({
      apiUrl: String(body.llm.apiUrl).slice(0, 500),
      apiKey: String(body.llm.apiKey || '').slice(0, 500),
      model: String(body.llm.model || '').slice(0, 200),
    } satisfies LlmCredentials));
    llmEnc = data;
    llmIv = iv;
  }

  const pushSub = body.pushSubscription ? JSON.stringify(body.pushSubscription).slice(0, 2000) : null;

  await env.DB.prepare(
    `INSERT INTO bridge_config (id, rules_json, chars_json, llm_enc, llm_iv, push_sub, updated_at)
     VALUES ('main', ?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET
       rules_json = excluded.rules_json,
       chars_json = excluded.chars_json,
       llm_enc = excluded.llm_enc,
       llm_iv = excluded.llm_iv,
       push_sub = excluded.push_sub,
       updated_at = excluded.updated_at`
  ).bind(
    JSON.stringify(body.rules || []).slice(0, 20000),
    JSON.stringify(chars).slice(0, 60000),
    llmEnc, llmIv, pushSub, now,
  ).run();

  return json({ ok: true, characters: chars.length });
}

/* ─────────── pending 拉取 / 认领 ─────────── */

async function handlePending(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT event_id, char_id, item_type, event_text, reply_text, action_notes, created_at
     FROM bridge_bundles ORDER BY created_at ASC LIMIT 50`
  ).all<BundleRow>();
  return json({ ok: true, items: (rows.results || []).map(r => ({
    kind: 'bridge-event',
    eventId: r.event_id,
    charId: r.char_id,
    itemType: r.item_type,
    eventText: r.event_text,
    replyText: r.reply_text,
    actions: (() => { try { return JSON.parse(r.action_notes || '[]'); } catch { return []; } })(),
    createdAt: new Date(r.created_at).toISOString(),
  })) });
}

async function handlePendingAck(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ ids?: string[] }>(req);
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return json({ ok: false, error: 'missing ids' }, 400);
  }
  // 只删该 event_id 的所有行（App 侧按 eventId+charId 都认领）
  for (const id of body.ids.slice(0, 50)) {
    await env.DB.prepare(`DELETE FROM bridge_bundles WHERE event_id = ?1`).bind(String(id)).run();
  }
  return json({ ok: true, deleted: Math.min(body.ids.length, 50) });
}

/* ─────────── 屏幕速聊同步端点 ─────────── */

async function handleScreenChat(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ charId?: string; text?: string; imageText?: string }>(req);
  if (!body || !body.charId) return json({ ok: false, error: 'missing charId' }, 400);
  const cfg = await env.DB.prepare(
    `SELECT chars_json, llm_enc, llm_iv FROM bridge_config WHERE id = 'main'`
  ).first<ConfigRow>();
  if (!cfg?.llm_enc || !cfg?.llm_iv || !env.MASTER_KEY) return json({ ok: false, error: '未上传 LLM 凭据' }, 400);
  const plain = await decryptSecret(env.MASTER_KEY, MASTER_SALT, cfg.llm_iv, cfg.llm_enc);
  if (!plain) return json({ ok: false, error: '凭据解密失败（MASTER_KEY 不一致？）' }, 500);
  const llm = JSON.parse(plain) as LlmCredentials;
  let persona = '';
  try {
    const chars = JSON.parse(cfg.chars_json || '[]') as CharCtx[];
    persona = chars.find(c => c.id === body.charId)?.persona || '';
  } catch { /* ignore */ }
  const prompt = body.text || body.imageText || '';
  const res = await callLlm(llm, buildLlmMessages(persona || `你是角色 ${body.charId}，看到屏幕内容后自然回应。`, prompt, '屏幕速聊'));
  if (!res.ok) return json({ ok: false, error: res.error }, 500);
  return json({ ok: true, reply: res.text });
}

/* ─────────── status ─────────── */

async function handleStatus(env: Env): Promise<Response> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bridge_items WHERE created_at >= ?1`
  ).bind(today.getTime()).first<{ n: number }>();
  return json({ ok: true, data: { version: BRIDGE_VERSION, todayCount: Number(count?.n || 0) } });
}

/* ─────────── main ─────────── */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return corsPreflight();
    const url = new URL(req.url);

    // 公开端点：不需要 token
    if (url.pathname === '/health' && req.method === 'GET') return json({ ok: true, version: BRIDGE_VERSION });
    if (url.pathname === '/vapid-public-key' && req.method === 'GET') return json({ publicKey: env.VAPID_PUBLIC_KEY || '' });

    // 其余统一校验 CLIENT_TOKEN
    const tokenErr = checkToken(req, env);
    if (tokenErr) return tokenErr;

    if (url.pathname === '/bridge/inbox' && req.method === 'POST') return handleInbox(req, env);
    if (url.pathname === '/bridge/config' && req.method === 'POST') return handleConfig(req, env);
    if (url.pathname === '/bridge/pending' && req.method === 'GET') return handlePending(env);
    if (url.pathname === '/bridge/pending/ack' && req.method === 'POST') return handlePendingAck(req, env);
    if (url.pathname === '/screen-chat' && req.method === 'POST') return handleScreenChat(req, env);
    if (url.pathname === '/status' && req.method === 'GET') return handleStatus(env);

    return json({ error: 'not found' }, 404);
  },
};
