/**
 * 反查手机 · 权限系统
 *
 * 角色反查用户真实 SullyOS 时，可查看的 App 范围由这里控制：
 *  - App 列表动态读 INSTALLED_APPS，新增 App 自动加入
 *  - 每个 App 可手动开关，默认全开
 *  - 设置 App 永远禁止（hardBlocked，任何情况不可开启）
 *
 * 纯浏览器端，localStorage 单份持久化（账号级），无服务端依赖。
 */

import { INSTALLED_APPS } from '../../constants';
import { AppID } from '../../types';
import type { ReversePermission, ReversePermissionState } from '../../types';

const STORAGE_KEY = 'sullyos_reverse_permissions_v1';

/** 设置 App 的 id（永远禁止查看） */
export const REVERSE_BLOCKED_APPS = new Set<string>([AppID.Settings]);

/** 读取权限状态（localStorage），缺失的 App 默认 true */
export function loadReversePermissions(): ReversePermissionState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ReversePermissionState;
    } catch { /* 解析失败回落默认 */ }
    return {};
}

/** 保存权限状态到 localStorage */
export function saveReversePermissions(state: ReversePermissionState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* 存储失败静默 */ }
}

/**
 * 取完整权限列表（含每个 App 当前是否允许、是否硬禁止）。
 * 动态基于 INSTALLED_APPS，未显式存过的 App 默认 allowed=true。
 */
export function getReversePermissions(): ReversePermission[] {
    const state = loadReversePermissions();
    return INSTALLED_APPS.map((app) => {
        const hardBlocked = REVERSE_BLOCKED_APPS.has(app.id);
        return {
            appId: app.id,
            appName: app.name,
            // 硬禁止的 App 永远不可查看（allowed 强制 false）；其余按用户开关，缺省 true
            allowed: hardBlocked ? false : state[app.id] !== false,
            hardBlocked,
        };
    });
}

/**
 * 判断某个 App 当前是否允许被角色查看。
 * 硬禁止（设置）永远 false；否则看用户开关，缺省 true。
 */
export function isReverseAppAllowed(appId: string): boolean {
    if (REVERSE_BLOCKED_APPS.has(appId)) return false;
    const state = loadReversePermissions();
    return state[appId] !== false;
}

/** 切换某个 App 的查看权限（设置 App 硬禁止，拒绝切换） */
export function toggleReversePermission(appId: string): ReversePermissionState {
    if (REVERSE_BLOCKED_APPS.has(appId)) return loadReversePermissions();
    const state = loadReversePermissions();
    const next = !(state[appId] !== false);
    state[appId] = next;
    saveReversePermissions(state);
    return state;
}

/** 全部重置为允许（设置除外） */
export function resetReversePermissions(): ReversePermissionState {
    const state: ReversePermissionState = {};
    saveReversePermissions(state);
    return state;
}
