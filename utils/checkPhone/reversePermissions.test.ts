import { describe, it, expect, beforeEach } from 'vitest';
import {
    getReversePermissions, isReverseAppAllowed, toggleReversePermission,
    resetReversePermissions, REVERSE_BLOCKED_APPS,
} from './reversePermissions';
import { AppID } from '../../types';

describe('reversePermissions 反查权限', () => {
    beforeEach(() => resetReversePermissions());

    it('默认所有 App 允许查看', () => {
        const perms = getReversePermissions();
        expect(perms.length).toBeGreaterThan(0);
        // 默认全开（设置除外）
        for (const p of perms) {
            if (!p.hardBlocked) expect(p.allowed).toBe(true);
        }
    });

    it('设置 App 永远禁止（hardBlocked）', () => {
        expect(isReverseAppAllowed(AppID.Settings)).toBe(false);
        const setPerm = getReversePermissions().find(p => p.appId === AppID.Settings);
        expect(setPerm?.hardBlocked).toBe(true);
        expect(setPerm?.allowed).toBe(false);
    });

    it('toggle 关闭某个 App 后不可查看', () => {
        expect(isReverseAppAllowed(AppID.Chat)).toBe(true);
        toggleReversePermission(AppID.Chat);
        expect(isReverseAppAllowed(AppID.Chat)).toBe(false);
    });

    it('设置 App 的 toggle 无效（硬禁止不可开启）', () => {
        toggleReversePermission(AppID.Settings);
        expect(isReverseAppAllowed(AppID.Settings)).toBe(false);
        expect(REVERSE_BLOCKED_APPS.has(AppID.Settings)).toBe(true);
    });

    it('重置恢复默认全开', () => {
        toggleReversePermission(AppID.Chat);
        expect(isReverseAppAllowed(AppID.Chat)).toBe(false);
        resetReversePermissions();
        expect(isReverseAppAllowed(AppID.Chat)).toBe(true);
    });
});
