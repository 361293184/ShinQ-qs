import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_WEREAD_PROFILE,
  isPlausibleWereadCookie,
  isWereadRoleAwareReady,
  loadWereadProfile,
  saveWereadProfile,
} from './wereadConfig';

beforeEach(() => {
  localStorage.clear();
});

describe('wereadConfig profile store', () => {
  it('defaults to empty cookie and perception off', () => {
    expect(loadWereadProfile()).toEqual(DEFAULT_WEREAD_PROFILE);
  });

  it('round-trips saved patches', () => {
    saveWereadProfile({ cookie: 'wr_vid=123; wr_skey=abc', roleAwareEnabled: true, nickname: '小明' });
    const p = loadWereadProfile();
    expect(p.cookie).toContain('wr_vid');
    expect(p.roleAwareEnabled).toBe(true);
    expect(p.nickname).toBe('小明');
  });

  it('isPlausibleWereadCookie requires length and typical fields', () => {
    expect(isPlausibleWereadCookie('wr_vid=123; wr_skey=abcdefghijklmnop')).toBe(true);
    expect(isPlausibleWereadCookie('abc')).toBe(false);
    expect(isPlausibleWereadCookie('')).toBe(false);
  });

  it('isWereadRoleAwareReady requires toggle ON and a plausible cookie', () => {
    expect(isWereadRoleAwareReady({ cookie: '', roleAwareEnabled: true })).toBe(false);
    expect(isWereadRoleAwareReady({ cookie: 'wr_vid=1; wr_skey=abcdefghijklmnop', roleAwareEnabled: false })).toBe(false);
    expect(isWereadRoleAwareReady({ cookie: 'wr_vid=1; wr_skey=abcdefghijklmnop', roleAwareEnabled: true })).toBe(true);
  });
});
