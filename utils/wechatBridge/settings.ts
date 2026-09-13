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

/** 16 字节随机（128 bit，抗猜）。极老的 WebView 没有 webcrypto 时退回 Math.random 兜底。 */
function randomIdentity(): string {
  const bytes = new Uint8Array(16);
  const webcrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (webcrypto?.getRandomValues) {
    webcrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 设备身份（多租户）：**没有就生成一枚并持久化**，返回值可直接用。
 *
 * 为什么让浏览器自己生：这样"别人要用"就不需要主人做任何事——打开链接、扫码、完事，
 * 谁也不用复制粘贴 token。代价是身份只在这一台设备的这个浏览器里，换设备时要粘一次
 * （卡片里有「这台设备的身份」复制/粘贴），而那正好也是"同一人手机+电脑都能看到
 * 全部微信消息"的解法。
 */
export function ensureClientId(): string {
  const settings = read();
  if (settings.clientId) return settings.clientId;
  const clientId = randomIdentity();
  write({ ...settings, clientId });
  return clientId;
}

/** 写入一枚身份（粘贴别人的身份 = 加入同一份空间，两台设备共享绑定与上下文）。 */
export function saveClientId(clientId: string): void {
  write({ ...read(), clientId: clientId.trim() });
}

/**
 * 请求身份：老部署填过共享密钥（WX_BRIDGE_TOKEN）就用它——那时所有请求靠它认人；
 * 没填则用本机自动生成的身份。**两者互斥**（服务端只认一个身份头）。
 */
export function requestIdentity(): string {
  const settings = read();
  return (settings.token || '').trim() || ensureClientId();
}
