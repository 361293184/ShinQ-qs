/**
 * 微信桥 · LLM 调用与凭据加解密。
 *
 * 加密模式对齐 Sully amsg / 现实桥：用户在前端把 apiUrl/apiKey/model 上传到
 * `/wx/config`，Worker 用 MASTER_KEY 派生密钥 AES-GCM 加密后存 D1；微信消息到达时
 * 解密、组装 OpenAI 兼容 chat/completions 请求生成回复。因此 **App 被杀之后
 * 角色照样能在微信里回话**。
 *
 * 和现实桥的关键差别（这条决定会不会 OOC）：
 *   现实桥的 `buildLlmMessages` 是「只塞 persona、要求一两句话」的**简化 prompt**；
 *   这里**不拼任何自己的提示词**——`messages` 就是 SullyOS 本地生成会 POST 出去的
 *   那一串（fire_pack 的 chat.messages 原样 + 末尾时效块，见 index.ts）。系统提示词、
 *   角色卡、世界书、记忆、时间感知全在前端烤好的模板里，云端一个字都不加。
 *
 * 零浏览器依赖（这份代码会被打进 worker bundle）。
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(bytes: Uint8Array<ArrayBuffer>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(masterKey: string, salt: string): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(masterKey + ':' + salt)));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** 加密一段 JSON 文本，返回 iv|cipher（均 base64）。 */
export async function encryptSecret(masterKey: string, salt: string, plainText: string): Promise<{ iv: string; data: string }> {
  const key = await deriveKey(masterKey, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText)));
  return { iv: bytesToB64(iv), data: bytesToB64(cipher) };
}

/** 解密 encryptSecret 的输出；masterKey 不一致 / 数据损坏返回 null。 */
export async function decryptSecret(masterKey: string, salt: string, ivB64: string, dataB64: string): Promise<string | null> {
  try {
    const key = await deriveKey(masterKey, salt);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
      key,
      b64ToBytes(dataB64) as BufferSource,
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}

export interface LlmCredentials {
  apiUrl: string;
  apiKey: string;
  model: string;
  /**
   * 角色级「额外请求参数」透传（心象卡片 / 思考开关 / temperature 之类）。
   * 与 SullyOS 本地生成那条路的 extraBody 同源——两条路的请求体必须尽量一致，
   * 不然同一个角色在 App 里和微信里会是两个脾气（见 activeMsgClient 的 instant 分支）。
   */
  extraBody?: Record<string, unknown>;
}

/**
 * 一条对话消息。`content` **原样透传**、绝不 String()：
 * 带图片的消息在 SullyOS 里是结构化分段（`[{type:'text'},{type:'image_url'}]`），
 * 拍平了模型收到的就是 "[object Object]" 而不是那张图。
 */
export interface LlmMessage {
  role: string;
  content: unknown;
}

export interface CallLlmOptions {
  /** 墙钟上限。微信那边用户正等着，超时不如报错让他重发。默认 120s。 */
  timeoutMs?: number;
  temperature?: number;
}

export interface CallLlmResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** 上游 HTTP 状态（有的话），排障用。 */
  status?: number;
}

/**
 * OpenAI 兼容 chat/completions 单次调用（非流式）。
 *
 * 不用流式：微信是「一条消息一次性到达」，没有逐字上屏的收益；而流式会让
 * 「哪一段算一条微信消息」这件事变得依赖分块时机，纯属自找麻烦。
 */
export async function callLlm(
  creds: LlmCredentials,
  messages: LlmMessage[],
  options: CallLlmOptions = {},
): Promise<CallLlmResult> {
  const base = String(creds.apiUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'LLM 凭据里没有 apiUrl' };
  const timeoutMs = options.timeoutMs ?? 120_000;

  // extraBody 在前、核心字段在后：用户配的额外参数不能把 model / messages 顶掉，
  // 否则一个手滑的 extraBody 就能让整条链路把提示词发丢。
  const body: Record<string, unknown> = {
    ...(creds.extraBody || {}),
    model: creds.model,
    messages,
    temperature: options.temperature ?? 0.85,
    stream: false,
  };

  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey || 'sk-none'}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: `LLM HTTP ${resp.status}: ${raw.slice(0, 300)}` };
    }
    let data: { choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }> };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return { ok: false, error: `LLM 返回的不是 JSON：${raw.slice(0, 200)}` };
    }
    const message = data.choices?.[0]?.message;
    const text = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!text) return { ok: false, error: 'LLM 返回空内容' };
    return { ok: true, text };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { ok: false, error: `LLM 超时（${Math.round(timeoutMs / 1000)}s）` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
