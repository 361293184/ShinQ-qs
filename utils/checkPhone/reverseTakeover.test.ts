import { describe, it, expect, beforeEach } from 'vitest';
import { buildBrowsePlan, canTakeoverApp, MAX_TAKEOVER_DURATION, isTakeoverExpired } from './reverseTakeover';
import { resetReversePermissions, toggleReversePermission } from './reversePermissions';
import { AppID, REVERSE_MEMORY_TAG } from '../../types';

describe('reverseTakeover 接管浏览计划', () => {
    beforeEach(() => resetReversePermissions());

    it('浏览计划排除设置 App（硬禁止）', () => {
        const plan = buildBrowsePlan({ char: { id: 'c1', name: '测试', avatar: '' } as any });
        expect(plan.steps.some(s => s.appId === AppID.Settings)).toBe(false);
    });

    it('浏览计划排除查手机 App 自身（避免递归）', () => {
        const plan = buildBrowsePlan({ char: { id: 'c1', name: '测试', avatar: '' } as any });
        expect(plan.steps.some(s => s.appId === AppID.CheckPhone)).toBe(false);
    });

    it('浏览计划排除桌面 Launcher', () => {
        const plan = buildBrowsePlan({ char: { id: 'c1', name: '测试', avatar: '' } as any });
        expect(plan.steps.some(s => s.appId === AppID.Launcher)).toBe(false);
    });

    it('关闭某 App 权限后该 App 不出现在浏览计划', () => {
        toggleReversePermission(AppID.Chat);
        const plan = buildBrowsePlan({ char: { id: 'c1', name: '测试', avatar: '' } as any });
        expect(plan.steps.some(s => s.appId === AppID.Chat)).toBe(false);
    });

    it('canTakeoverApp 对设置返回 false', () => {
        expect(canTakeoverApp(AppID.Settings)).toBe(false);
        expect(canTakeoverApp(AppID.Chat)).toBe(true);
    });

    it('接管超时判断', () => {
        expect(isTakeoverExpired({ active: false })).toBe(false);
        expect(isTakeoverExpired({ active: true, startedAt: Date.now() - MAX_TAKEOVER_DURATION - 1000 })).toBe(true);
        expect(isTakeoverExpired({ active: true, startedAt: Date.now() })).toBe(false);
    });

    it('REVERSE_MEMORY_TAG 存在（供记忆联动删除）', () => {
        expect(REVERSE_MEMORY_TAG).toBe('reverse_check');
    });
});
