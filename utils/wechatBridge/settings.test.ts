/**
 * 设备身份（多租户）的本地存储口径。
 *
 * 为什么这几条值得单独钉住：身份是"朋友只要扫码"的全部秘密——它必须**自动生成、
 * 稳定不变、能跨设备粘贴**。写错了表现会很难查：所有请求都会落在不同的空空间里，
 * 用户看到的是"微信绑定莫名其妙不见了"。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureClientId,
  saveClientId,
  requestIdentity,
  loadWechatSettings,
  saveWechatSettings,
} from './settings';
import { DEFAULT_WECHAT_BRIDGE_SETTINGS } from './types';

describe('设备身份', () => {
  beforeEach(() => {
    saveWechatSettings({ ...DEFAULT_WECHAT_BRIDGE_SETTINGS });
  });

  it('第一次调用就生成一枚 32 位十六进制身份并落盘', () => {
    const id = ensureClientId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(loadWechatSettings().clientId).toBe(id);
  });

  it('重复调用稳定不变（身份必须稳定，否则每次刷新都换个空空间）', () => {
    const first = ensureClientId();
    const second = ensureClientId();
    expect(second).toBe(first);
  });

  it('粘贴别人的身份 = 切换到这枚身份（换设备共用同一份数据）', () => {
    saveClientId('  AAAA1111BBBB2222CCCC3333DDDD4444  ');
    expect(loadWechatSettings().clientId).toBe('AAAA1111BBBB2222CCCC3333DDDD4444');
    expect(requestIdentity()).toBe('AAAA1111BBBB2222CCCC3333DDDD4444');   // 去空格后直接用
  });

  it('请求身份：填了老密钥就用密钥（单人模式），没填才用自动身份', () => {
    saveWechatSettings({ ...DEFAULT_WECHAT_BRIDGE_SETTINGS, token: 'legacy-shared' });
    expect(requestIdentity()).toBe('legacy-shared');

    saveWechatSettings({ ...DEFAULT_WECHAT_BRIDGE_SETTINGS, token: '   ' });
    const id = requestIdentity();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(loadWechatSettings().clientId).toBe(id);     // 顺便把身份落下来了
  });
});
