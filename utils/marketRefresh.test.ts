import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterProfile } from '../types';
import { MARKET_LLM_ENABLED_KEY, readMarketLLMEnabled, rollMarketVisitor, setMarketLLMEnabled } from './vrWorld/marketRefresh';
import { collectSARLocalBackup, restoreSARLocalBackup } from './vrWorld/sarBackup';
import { createFishingMarketState, createRequest, refreshMarketNPCs } from './vrWorld/fishingMarket';

const roster = [
    { id: 'off', vrState: { enabled: false } },
    { id: 'manual', vrState: { enabled: true, activityMode: 'manual' } },
    { id: 'roaming', vrState: { enabled: true, activityMode: 'scheduled' } },
] as CharacterProfile[];
beforeEach(() => localStorage.clear());
describe('布告板手动刷新', () => {
    it('缺省、非法开关都不允许模型；仅明确开启后才抽自由活动角色', () => {
        expect(readMarketLLMEnabled()).toBe(false);
        expect(rollMarketVisitor(roster, false, () => .99)).toBeNull();
        localStorage.setItem(MARKET_LLM_ENABLED_KEY, 'yes');
        expect(readMarketLLMEnabled()).toBe(false);
        setMarketLLMEnabled(true);
        expect(readMarketLLMEnabled()).toBe(true);
        expect(rollMarketVisitor(roster, true, () => .99)?.id).toBe('roaming');
        expect(rollMarketVisitor(roster.slice(0, 2), true, () => .99)).toBeNull();
        expect(rollMarketVisitor(roster, true, () => .1)).toBeNull();
    });
    it.each([false, true])('模型许可 %s 随导出导入保留，旧全量备份恢复为关闭', enabled => {
        setMarketLLMEnabled(enabled);
        const backup = collectSARLocalBackup(); localStorage.clear();
        restoreSARLocalBackup(backup, { replaceMissing: true });
        expect(readMarketLLMEnabled()).toBe(enabled);
        expect(localStorage.getItem(MARKET_LLM_ENABLED_KEY)).toBe(String(enabled));
        restoreSARLocalBackup(undefined, { replaceMissing: true });
        expect(readMarketLLMEnabled()).toBe(false);
    });
    it('一批来访两三位不同 NPC，保留原便笺、留言和钱包，不受旧半小时限制', () => {
        const at = Date.now(), original = { ...createFishingMarketState(42), accounts: { user: 20, 'wanderer:0': 0 }, lastPulseAt: at };
        const input = createRequest(original, { id: 'user', name: '我', kind: 'user' }, undefined, '随便聊聊', 0, '原便笺', at, 'favor');
        const frozen = structuredClone(input);
        const { state, visitors } = refreshMarketNPCs(input, at + 1, () => .1);
        expect(visitors).toHaveLength(2); expect(new Set(visitors.map(v => v.id)).size).toBe(2);
        expect(visitors.every(v => v.kind === 'wanderer')).toBe(true);
        expect(state.accounts.user).toBe(20); expect(state.accounts['wanderer:0']).toBe(0);
        expect(state.requests[0].id).toBe(input.requests[0].id);
        expect(state.requests[0].body).toBe('原便笺');
        expect(state.requests[0].comments).toHaveLength(2);
        expect(input).toEqual(frozen);
        const again = refreshMarketNPCs(state, at + 2, () => .9);
        expect(again.visitors).toHaveLength(3);
        expect(again.state.requests[0].comments.slice(0, 2)).toEqual(state.requests[0].comments);
    });
});
