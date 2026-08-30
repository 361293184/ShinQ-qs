import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldAutoTriggerReverse, roleConsentToReverse, isUserAskingReverse,
    buildRoleDeclineText, buildRoleAgreeText, proclivityOf, proclivityProbability,
    isCooldownPassed, setReverseCooldown, getReverseCooldown,
    MIN_TRIGGER_ROUNDS, REVERSE_COOLDOWN_MS,
} from './reverseTrigger';

const mkChar = (systemPrompt: string): any => ({ id: 'c1', name: '小柴', systemPrompt });

describe('reverseTrigger 反查触发', () => {
    beforeEach(() => localStorage.clear());

    it('反查倾向自动推导：吃醋→high，内向→low', () => {
        expect(proclivityOf(mkChar('非常爱吃醋，喜欢偷看'))).toBe('high');
        expect(proclivityOf(mkChar('内向害羞，温和'))).toBe('low');
        expect(proclivityProbability(mkChar('爱吃醋'))).toBeGreaterThan(proclivityProbability(mkChar('内向温和')));
    });

    it('轮数不足时不触发', () => {
        const char = mkChar('爱吃醋，爱查手机');
        expect(shouldAutoTriggerReverse(char, MIN_TRIGGER_ROUNDS - 1, 0)).toBe(false);
    });

    it('冷却未过时不触发', () => {
        const char = mkChar('爱吃醋');
        setReverseCooldown(10); // 刚触发过
        expect(shouldAutoTriggerReverse(char, 10, 0)).toBe(false);
    });

    it('概率命中时触发，未命中不触发', () => {
        const char = mkChar('爱吃醋，控制欲强');
        // 冷却已过（没触发过）
        expect(shouldAutoTriggerReverse(char, 10, 0)).toBe(true); // rand=0 必命中
        setReverseCooldown(10);
        // 冷却已过需重新等时间，这里手动清冷却
        localStorage.removeItem('sullyos_reverse_cooldown_v1');
        expect(shouldAutoTriggerReverse(char, 10, 1)).toBe(false); // rand=1 必不命中（概率<1）
    });

    it('低倾向概率显著低于高倾向，且未命中不触发', () => {
        const high = mkChar('爱吃醋，查手机狂魔');
        const low = mkChar('内向害羞，尊重隐私');
        expect(proclivityProbability(high)).toBeGreaterThan(proclivityProbability(low));
        // low 概率 0.05，rand=1 必不命中
        expect(shouldAutoTriggerReverse(low, 10, 1)).toBe(false);
        // low 概率 0.05，rand 在 (0.05, 1) 也不命中
        expect(shouldAutoTriggerReverse(low, 10, 0.5)).toBe(false);
    });

    it('角色意愿：高倾向更易同意，低倾向更易拒绝', () => {
        const high = mkChar('爱吃醋，粘人');
        const low = mkChar('内向害羞');
        // rand=0 都同意；但低倾向同意概率低，用 rand 接近 1 测拒绝
        expect(roleConsentToReverse(high, 0)).toBe('agree');
        // 低倾向：rand 0.9（超过其同意概率 0.25）→ decline
        expect(roleConsentToReverse(low, 0.9)).toBe('decline');
    });

    it('识别用户主动让角色查手机的意图', () => {
        expect(isUserAskingReverse('你查我手机吧')).toBe(true);
        expect(isUserAskingReverse('给你看看我的手机')).toBe(true);
        expect(isUserAskingReverse('今天天气不错')).toBe(false);
    });

    it('扩宽后能识别更多用户表达', () => {
        expect(isUserAskingReverse('你查一下我手机')).toBe(true);
        expect(isUserAskingReverse('你来翻我手机')).toBe(true);
        expect(isUserAskingReverse('你检查下我的手机')).toBe(true);
        expect(isUserAskingReverse('我手机给你看')).toBe(true);
        expect(isUserAskingReverse('让你翻翻手机')).toBe(true);
        expect(isUserAskingReverse('你翻翻我手机')).toBe(true);
        expect(isUserAskingReverse('你查一下我')).toBe(true);
        // 无手机/查翻语境不应误判
        expect(isUserAskingReverse('今天吃了吗')).toBe(false);
        expect(isUserAskingReverse('帮我想个办法')).toBe(false);
    });

    it('角色拒绝文案按性格区分', () => {
        const low = mkChar('内向害羞');
        expect(buildRoleDeclineText(low)).toContain('隐私');
        const high = mkChar('爱吃醋傲娇');
        expect(buildRoleDeclineText(high)).toContain('哼');
        expect(buildRoleAgreeText(high)).toContain('看');
    });

    it('冷却状态读写', () => {
        expect(isCooldownPassed()).toBe(true); // 未触发过
        setReverseCooldown(5);
        const state = getReverseCooldown();
        expect(state.lastRound).toBe(5);
        expect(isCooldownPassed()).toBe(false);
        expect(REVERSE_COOLDOWN_MS).toBeGreaterThan(0);
    });
});
