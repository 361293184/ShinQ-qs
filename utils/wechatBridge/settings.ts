/** 微信桥 · 本地配置存储（localStorage KV，与现实桥 settings.ts 同一套模式：
 *  不动全局 DB，避免为几行配置牵动 IndexedDB 版本升级）。
 *
 * 绑定关系（角色↔微信）不在本地——它存在 Worker 的 D1 里，扫码即绑定、一键改绑；
 * 本地只管「Worker 地址、密钥、凭据草稿、回流游标」。
 */

import { DEFAULT_WECHAT_BRIDGE_SETTINGS, type WechatBridgeSettings } from './types';

const KEY_SETTINGS = 'wechat_bridge_settings_v1';

function read(): WechatBridgeSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_WECHAT_BRIDGE_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    const parsed = raw ? JSON.parse(raw) as Partial<WechatBridgeSettings> : {};
    return { ...DEFAULT_WECHAT_BRIDGE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_WECHAT_BRIDGE_SETTINGS };
  }
}

function write(settings: WechatBridgeSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  } catch { /* 存储满 / 隐私模式：丢持久化，不影响内存态 */ }
}

export function loadWechatSettings(): WechatBridgeSettings {
  return read();
}

export function saveWechatSettings(settings: WechatBridgeSettings): void {
  write(settings);
}

export function saveWechatCursor(seq: number): void {
  const settings = read();
  if (seq <= settings.lastSeq) return;
  settings.lastSeq = seq;
  write(settings);
}
