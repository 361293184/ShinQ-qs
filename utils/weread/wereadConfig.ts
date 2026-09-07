/**
 * 微信读书本地配置：统一读/写 SullyOS「实时感知」配置（os_realtime_config 里的
 * wereadCookie/wereadRoleAwareEnabled 等字段）。旧版单独存的 os_weread_profile
 * 会在首次读取时自动迁移到 os_realtime_config（只读一次，之后以实时配置为准）。
 */
import type { WereadProfile } from './types';

/** 旧版独立存储 key（迁移用） */
const LEGACY_WEREAD_PROFILE_KEY = 'os_weread_profile';
/** 全局实时感知配置 key（真实归属，OSContext.updateRealtimeConfig 也写这里） */
const REALTIME_CONFIG_KEY = 'os_realtime_config';

export const DEFAULT_WEREAD_PROFILE: WereadProfile = {
  cookie: '',
  roleAwareEnabled: false,
  nickname: '',
  vid: '',
  verified: false,
};

/** cookie 是否粗看起来可用的登录态串（要求非空、长度够、含常见字段名） */
export function isPlausibleWereadCookie(cookie: string): boolean {
  const c = (cookie || '').trim();
  if (c.length < 20) return false;
  return /wr_vid|wr_skey|vid=|wr_name/i.test(c) || c.includes('=');
}

interface RealtimeRaw {
  wereadCookie?: string;
  wereadNickname?: string;
  wereadVid?: string;
  wereadVerified?: boolean;
  wereadRoleAwareEnabled?: boolean;
}

function readRealtimeRaw(): RealtimeRaw {
  try {
    const raw = localStorage.getItem(REALTIME_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRealtimeWeread(fields: RealtimeRaw): void {
  try {
    const raw = readRealtimeRaw();
    localStorage.setItem(REALTIME_CONFIG_KEY, JSON.stringify({ ...raw, ...fields }));
  } catch (e) {
    console.error('[Weread] failed to save realtime weread config:', e);
  }
}

function readLegacy(): WereadProfile | null {
  try {
    const raw = localStorage.getItem(LEGACY_WEREAD_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      cookie: typeof parsed.cookie === 'string' ? parsed.cookie : '',
      roleAwareEnabled: !!parsed.roleAwareEnabled,
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '',
      vid: typeof parsed.vid === 'string' ? parsed.vid : '',
      verified: !!parsed.verified,
    };
  } catch {
    return null;
  }
}

function fromRealtime(rt: RealtimeRaw): WereadProfile {
  return {
    cookie: typeof rt.wereadCookie === 'string' ? rt.wereadCookie : '',
    roleAwareEnabled: !!rt.wereadRoleAwareEnabled,
    nickname: typeof rt.wereadNickname === 'string' ? rt.wereadNickname : '',
    vid: typeof rt.wereadVid === 'string' ? rt.wereadVid : '',
    verified: !!rt.wereadVerified,
  };
}

/** 读取当前生效的微信读书配置：优先实时感知字段；缺失则从旧 key 迁移一次 */
export function getWereadConfig(): WereadProfile {
  const rt = readRealtimeRaw();
  const hasRt = typeof rt.wereadCookie === 'string' && rt.wereadCookie.trim().length > 0;
  if (hasRt) return fromRealtime(rt);

  const legacy = readLegacy();
  if (legacy && legacy.cookie) {
    // 一次性迁移：旧数据回写进实时感知配置，后续以实时配置为准
    writeRealtimeWeread({
      wereadCookie: legacy.cookie,
      wereadNickname: legacy.nickname || undefined,
      wereadVid: legacy.vid || undefined,
      wereadVerified: legacy.verified || undefined,
      wereadRoleAwareEnabled: legacy.roleAwareEnabled || undefined,
    });
    return legacy;
  }
  return { ...DEFAULT_WEREAD_PROFILE };
}

/** 写入（patch）微信读书配置：同时更新 os_realtime_config 与旧 key（双写兼容） */
export function saveWereadConfig(patch: Partial<WereadProfile>): WereadProfile {
  const next = { ...getWereadConfig(), ...patch };
  const rtPatch: RealtimeRaw = {
    wereadCookie: next.cookie,
    wereadNickname: next.nickname || undefined,
    wereadVid: next.vid || undefined,
    wereadVerified: next.verified || undefined,
    wereadRoleAwareEnabled: next.roleAwareEnabled || undefined,
  };
  writeRealtimeWeread(rtPatch);
  try {
    localStorage.setItem(LEGACY_WEREAD_PROFILE_KEY, JSON.stringify(next));
  } catch { /* 旧 key 写失败不影响主配置 */ }
  return next;
}

/** 兼容旧调用点 */
export function loadWereadProfile(): WereadProfile {
  return getWereadConfig();
}

/** 兼容旧调用点 */
export function saveWereadProfile(patch: Partial<WereadProfile>): WereadProfile {
  return saveWereadConfig(patch);
}

/** 是否已登录（有 cookie）且「角色感知」开关打开 —— 注入层短路判断用 */
export function isWereadRoleAwareReady(profile?: WereadProfile): boolean {
  const p = profile || getWereadConfig();
  return !!p.roleAwareEnabled && isPlausibleWereadCookie(p.cookie);
}

/** 从整串 cookie 里取某个字段（展示/请求辅助用） */
export function getWereadCookieValue(cookie: string, key: string): string {
  const m = (cookie || '').match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}
