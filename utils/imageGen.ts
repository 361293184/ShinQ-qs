// 共享的生图调用工具
// 关键原则：自动生图和手动面板共用同一套调用逻辑，避免重复
// 锁脸图片（lockImage）使用 multipart/form-data 走 /images/edits（OpenAI 官方方式）
// 不带锁脸走 /images/generations（兼容性最好）

export interface ImageGenOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  /** 锁脸参考图 dataURL（可选） */
  lockImageDataUrl?: string | null;
  /** 信号控制器 */
  signal?: AbortSignal;
  /** 超时毫秒，默认 300000 */
  timeoutMs?: number;
}

export interface ImageGenResult {
  /** b64_json 字符串（data:image/...;base64,...），或者 http URL */
  url: string;
  isBase64: boolean;
}

/**
 * 调用 /images/generations 或 /images/edits
 * - 带 lockImage 时尝试 multipart/form-data 走 edits（OpenAI 标准）
 * - 不带或 edits 不支持时退回 generations（JSON 通用协议）
 */
export async function generateImage(opts: ImageGenOptions): Promise<ImageGenResult> {
  const { baseUrl, apiKey, model, prompt, lockImageDataUrl, signal, timeoutMs = 300000 } = opts;
  const base = baseUrl.replace(/\/+$/, '');

  // 带锁脸：先尝试 multipart/form-data 走 edits
  if (lockImageDataUrl) {
    try {
      const refB64 = lockImageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const binaryStr = atob(refB64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // 推断 mime 和扩展名
      const mimeMatch = lockImageDataUrl.match(/^data:(image\/\w+);base64,/);
      const mime = mimeMatch?.[1] || 'image/png';
      const ext = mime.split('/')[1] || 'png';

      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('size', '1024x1024');
      form.append('response_format', 'b64_json');
      form.append('image', new Blob([bytes], { type: mime }), `ref.${ext}`);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const editSig = signal
        ? (() => { const c = new AbortController(); signal.addEventListener('abort', () => c.abort()); return c.signal; })()
        : ctrl.signal;

      try {
        const res = await fetch(`${base}/images/edits`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: form,
          signal: editSig,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          const b64 = data?.data?.[0]?.b64_json;
          const url = data?.data?.[0]?.url;
          if (b64) return { url: `data:image/png;base64,${b64}`, isBase64: true };
          if (url) return { url, isBase64: false };
          throw new Error('/images/edits 返回数据格式异常');
        }
        // 415/400/422 → 不支持 multipart，回退
        if (res.status === 400 || res.status === 404 || res.status === 415 || res.status === 422) {
          // 不报错，继续走 generations 回退
          console.warn('[ImageGen] /edits 不支持，回退到 /generations:', res.status);
        } else {
          const errText = await res.text().catch(() => '');
          throw new Error(`/images/edits ${res.status}: ${errText.slice(0, 200)}`);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      // 不是 abort 就忽略错误往下走（继续 generations 回退）
      if (e?.name === 'AbortError') throw e;
      console.warn('[ImageGen] /edits 失败，回退到 /generations:', e?.message);
    }
  }

  // 标准 /images/generations
  const ctrl2 = new AbortController();
  const timer2 = setTimeout(() => ctrl2.abort(), timeoutMs);
  const sig2 = signal
    ? (() => { const c = new AbortController(); signal.addEventListener('abort', () => c.abort()); return c.signal; })()
    : ctrl2.signal;

  try {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
      signal: sig2,
    });
    clearTimeout(timer2);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (b64) return { url: `data:image/png;base64,${b64}`, isBase64: true };
    if (url) return { url, isBase64: false };
    const apiErr = data?.error?.message || JSON.stringify(data?.error || {});
    throw new Error(`API 未返回图片: ${apiErr}`);
  } finally {
    clearTimeout(timer2);
  }
}

/** 从 localStorage 加载角色外观/锁脸设置（与 ImageGenPanel 保持一致的 key） */
export function loadCharImageSettings(charName: string): { description: string; lockImage: string } {
  try {
    const saved = localStorage.getItem(`os_imagegen_char_${charName || ''}`);
    if (saved) {
      const d = JSON.parse(saved);
      return { description: d.description || '', lockImage: d.lockImage || '' };
    }
  } catch {}
  return { description: '', lockImage: '' };
}

/** 用户锁脸/外观设置（全局一份，所有角色共用） */
const USER_IMAGE_SETTINGS_KEY = 'os_imagegen_user_lock';

export interface UserImageSettings {
  description: string;
  lockImage: string;
}

export function loadUserImageSettings(): UserImageSettings {
  try {
    const raw = localStorage.getItem(USER_IMAGE_SETTINGS_KEY);
    if (!raw) return { description: '', lockImage: '' };
    return JSON.parse(raw);
  } catch {
    return { description: '', lockImage: '' };
  }
}

export function saveUserImageSettings(settings: Partial<UserImageSettings>) {
  const current = loadUserImageSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(USER_IMAGE_SETTINGS_KEY, JSON.stringify(updated));
}
