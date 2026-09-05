// 共享的生图调用工具
// 关键原则：自动生图和手动面板共用同一套调用逻辑，避免重复
// 固定竖版 9:16 比例（1024x1792），统一走 /images/generations。
// 锁脸参考图不再走 /images/edits（该端点通常只支持 1:1），而是通过参考图字段传进
// generations。国产中转/聚合服务普遍兼容这两种写法，优先传标准 reference_images 数组，
// 部分服务只认旧的 image 字段，故一并带上，服务端会忽略不认识的字段。

export interface ImageGenOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  /** 锁脸参考图 dataURL（可选） */
  lockImageDataUrl?: string | null;
  /** 多张锁脸参考图 dataURL（可选）：合照时同时锁角色和用户的长相。
   *  按顺序对应 prompt 里描述的第一个人、第二个人；不传时退回单图 lockImageDataUrl。 */
  lockImageDataUrls?: (string | null | undefined)[];
  /** 出图尺寸，默认 1024x1792（9:16 竖版） */
  size?: string;
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
 * 调用 /images/generations（JSON 通用协议，兼容性最好）。
 * 固定竖版 9:16（1024x1792）；带锁脸参考图时把 base64 塞进 reference_images / image 字段。
 */
export async function generateImage(opts: ImageGenOptions): Promise<ImageGenResult> {
  const { baseUrl, apiKey, model, prompt, lockImageDataUrl, lockImageDataUrls, size, signal, timeoutMs = 300000 } = opts;
  const base = baseUrl.replace(/\/+$/, '');
  const outSize = size || '1024x1792';

  // 标准 /images/generations
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const sig = signal
    ? (() => { const c = new AbortController(); signal.addEventListener('abort', () => c.abort()); return c.signal; })()
    : ctrl.signal;

  // 参考图统一转成纯 base64（去掉 data: 前缀），塞进兼容字段。
  // 优先用多图数组（合照锁脸：按顺序对应 prompt 里的第一个人/第二个人），否则退回单图。
  const refsPureB64 = (lockImageDataUrls && lockImageDataUrls.length > 0
    ? lockImageDataUrls
    : lockImageDataUrl ? [lockImageDataUrl] : []
  )
    .filter((d): d is string => !!d)
    .map(d => d.replace(/^data:image\/\w+;base64,/, ''));

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: outSize,
    response_format: 'b64_json',
  };
  // 标准字段 image 必须是数组（参考 OpenAI 兼容规范 / gpt-image-1/2）。
  // 部分国产中转还认 reference_images 字段，一并带上以兼容老聚合服务。
  // 注意：image 数组里只放纯 base64 字符串，不要带 data:image/png;base64, 前缀。
  // 多张参考图（合照双锁脸）直接放进数组——OpenAI 兼容规范 image 本身就是多图数组。
  if (refsPureB64.length > 0) {
    body.image = refsPureB64;
    body.reference_images = refsPureB64;
  }

  try {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: sig,
    });
    clearTimeout(timer);
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
    clearTimeout(timer);
  }
}

/** 从 localStorage 加载角色外观/锁脸设置（与 ImageGenPanel 保持一致的 key） */
export function loadCharImageSettings(charName: string): { description: string; lockImage: string; sceneDescription: string } {
  try {
    const saved = localStorage.getItem(`os_imagegen_char_${charName || ''}`);
    if (saved) {
      const d = JSON.parse(saved);
      return {
        description: d.description || '',
        lockImage: d.lockImage || '',
        sceneDescription: d.sceneDescription || '',
      };
    }
  } catch {}
  return { description: '', lockImage: '', sceneDescription: '' };
}

/** 用户锁脸/外观设置（全局一份，所有角色共用） */
const USER_IMAGE_SETTINGS_KEY = 'os_imagegen_user_lock';

export interface UserImageSettings {
  description: string;
  lockImage: string;
  sceneDescription: string;
}

export function loadUserImageSettings(): UserImageSettings {
  try {
    const raw = localStorage.getItem(USER_IMAGE_SETTINGS_KEY);
    if (!raw) return { description: '', lockImage: '', sceneDescription: '' };
    const parsed = JSON.parse(raw);
    // 兼容旧版没存 sceneDescription 的情况
    return {
      description: parsed.description || '',
      lockImage: parsed.lockImage || '',
      sceneDescription: parsed.sceneDescription || '',
    };
  } catch {
    return { description: '', lockImage: '', sceneDescription: '' };
  }
}

export function saveUserImageSettings(settings: Partial<UserImageSettings>) {
  const current = loadUserImageSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(USER_IMAGE_SETTINGS_KEY, JSON.stringify(updated));
}

/* ---------- 自定义生图风格 ---------- */
export interface CustomStyle {
  id: string;
  label: string;
  prompt: string;
}

const CUSTOM_STYLE_KEY = 'os_imagegen_custom_styles';

export function loadCustomStyles(): CustomStyle[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STYLE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.id === 'string' && typeof x.label === 'string' && typeof x.prompt === 'string');
  } catch {
    return [];
  }
}

export function saveCustomStyles(styles: CustomStyle[]): void {
  try {
    localStorage.setItem(CUSTOM_STYLE_KEY, JSON.stringify(styles));
  } catch {}
}
