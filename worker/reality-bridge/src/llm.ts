/**
 * 现实桥 · LLM 调用与凭据加解密。
 *
 * 凭据加密模式对齐 Sully amsg：用户在前端把 apiUrl/apiKey/model + 角色上下文
 * 上传到 /bridge/config，Worker 用 MASTER_KEY 派生密钥 AES-GCM 加密后存 D1；
 * 事件到达时解密并在此组装 OpenAI 兼容 chat/completions 请求生成角色回应。
 * 因此 App 被杀后 Worker 仍能替角色「看到」事件并回话。
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

/** 解密 encryptSecret 的输出；masterKey 不一致/损坏返回 null。 */
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

export type LlmCredentials = { apiUrl: string; apiKey: string; model: string };

/** 组装给模型的「角色上下文 + 事件」消息（对齐 Sully chatPrompts 的主旨：角色知情、自然反应）。 */
export function buildLlmMessages(
  persona: string,
  eventText: string,
  itemType: string,
): Array<{ role: string; content: string }> {
  return [
    {
      role: 'system',
      content:
        `${persona}\n\n` +
        `你是「现实桥」的接收者——${'用户'}通过 iPhone 快捷指令把一条现实数据传给了你。` +
        `它可能是用户此刻的状态/剪贴板/通知/健康等（类型：${itemType}）。` +
        `这是真的、正在发生的。请像看到用户的实时消息一样自然地回应：可以接话、关心、吐槽、或分享感受。` +
        `只输出你的回应本身，一两句话以内，不要解释这是桥数据，不要加前缀。`,
    },
    { role: 'user', content: `（现实桥收到一条「${itemType}」）\n${eventText}` },
  ];
}

/** OpenAI 兼容 chat/completions 单次调用（非流式）。 */
export async function callLlm(
  creds: LlmCredentials,
  messages: Array<{ role: string; content: string }>,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const base = creds.apiUrl.replace(/\/+$/, '');
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey || 'sk-none'}`,
      },
      body: JSON.stringify({ model: creds.model, messages, temperature: 0.85, stream: false }),
    });
    const raw = await resp.text();
    if (!resp.ok) return { ok: false, error: `LLM HTTP ${resp.status}: ${raw.slice(0, 300)}` };
    const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (!text) return { ok: false, error: 'LLM 返回空内容' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
