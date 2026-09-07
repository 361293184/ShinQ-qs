/**
 * 微信读书本地配置存取（App『我』页 / 角色感知注入共用）。
 * cookie 只在浏览器 localStorage 里存，随请求经 worker 转发，不写明文日志。
 */
import type { WereadProfile } from './types';

const WEREAD_PROFILE_KEY = 'os_weread_profile';

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

export function loadWereadProfile(): WereadProfile {
  try {
    const raw = localStorage.getItem(WEREAD_PROFILE_KEY);
    if (!raw) return { ...DEFAULT_WEREAD_PROFILE };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_WEREAD_PROFILE };
    return {
      cookie: typeof parsed.cookie === 'string' ? parsed.cookie : '',
      roleAwareEnabled: !!parsed.roleAwareEnabled,
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '',
      vid: typeof parsed.vid === 'string' ? parsed.vid : '',
      verified: !!parsed.verified,
    };
  } catch {
    return { ...DEFAULT_WEREAD_PROFILE };
  }
}

export function saveWereadProfile(patch: Partial<WereadProfile>): WereadProfile {
  const next = { ...loadWereadProfile(), ...patch };
  try {
    localStorage.setItem(WEREAD_PROFILE_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('[Weread] failed to save profile:', e);
  }
  return next;
}

/** 是否已登录（有 cookie）且「角色感知」开关打开 —— 注入层短路判断用 */
export function isWereadRoleAwareReady(profile?: WereadProfile): boolean {
  const p = profile || loadWereadProfile();
  return !!p.roleAwareEnabled && isPlausibleWereadCookie(p.cookie);
}

/** 从整串 cookie 里取某个字段（展示/请求辅助用） */
export function getWereadCookieValue(cookie: string, key: string): string {
  const m = (cookie || '').match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}
