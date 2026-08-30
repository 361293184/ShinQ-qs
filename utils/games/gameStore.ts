/**
 * 「你说我猜」设置持久化 + 战绩历史（localStorage）。
 *
 * - 游戏设置：key `gamehub_settings`，一次保存长期生效；首次用默认值。
 * - 战绩历史：key `gamehub_stats`，记录总局数 / 胜局 / MVP 次数 / 最近战绩。
 */

import type { WordCategory } from './wordBank';

/** 你说我猜游戏设置 */
export interface CharadesSettings {
    /** 一局人数（2~8，默认 4） */
    playerCount: number;
    /** 描述者场次（4~20，默认 8 = 每人上场 轮数/人数 次） */
    totalRounds: number;
    /** 每题时限（秒：30/60/90/120，默认 60） */
    timeLimit: number;
    /** 启用的词库分类 */
    categories: WordCategory[];
    /** AI 实时出题（开关，默认关） */
    aiGenerate: boolean;
    /** 副 API 失败降级主 API（默认开） */
    fallbackToMain: boolean;
    /** 战绩存入记忆（默认关） */
    saveToMemory: boolean;
    /** 自动补 NPC（默认开） */
    autoFillNpc: boolean;
    /** 选择参与的角色 id（开局时选，存最近一次） */
    selectedCharIds?: string[];
    /** 设置版本（迁移用） */
    version: number;
}

/** 战绩历史 */
export interface GameStats {
    totalGames: number;
    wins: number;
    mvpCount: number;
    /** 最近一局战绩描述（大厅卡片展示"上次战绩"） */
    lastResult?: string;
}

export const DEFAULT_CHARADES_SETTINGS: CharadesSettings = {
    playerCount: 4,
    totalRounds: 8,
    timeLimit: 60,
    categories: ['animal', 'food', 'idiom', 'film', 'game'],
    aiGenerate: false,
    fallbackToMain: true,
    saveToMemory: false,
    autoFillNpc: true,
    version: 1,
};

const SETTINGS_KEY = 'gamehub_settings';
const STATS_KEY = 'gamehub_stats';

/** 读取设置（带字段缺省兜底 + 版本迁移） */
export function loadCharadesSettings(): CharadesSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...DEFAULT_CHARADES_SETTINGS };
        const parsed = JSON.parse(raw);
        // 版本迁移 / 缺省兜底
        return {
            ...DEFAULT_CHARADES_SETTINGS,
            ...parsed,
            categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
                ? parsed.categories
                : DEFAULT_CHARADES_SETTINGS.categories,
        };
    } catch (e) {
        return { ...DEFAULT_CHARADES_SETTINGS };
    }
}

/** 保存设置 */
export function saveCharadesSettings(settings: CharadesSettings): void {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, version: 1 }));
    } catch (e) { /* ignore */ }
}

/** 读取战绩历史 */
export function loadGameStats(): GameStats {
    try {
        const raw = localStorage.getItem(STATS_KEY);
        return raw ? { totalGames: 0, wins: 0, mvpCount: 0, ...JSON.parse(raw) } : { totalGames: 0, wins: 0, mvpCount: 0 };
    } catch (e) {
        return { totalGames: 0, wins: 0, mvpCount: 0 };
    }
}

/**
 * 记录一局战绩。
 * @param isWin 用户是否获胜（总分最高）
 * @param isMvp 用户是否为 MVP
 * @param lastResult 最近战绩描述
 */
export function recordGameStats(isWin: boolean, isMvp: boolean, lastResult: string): GameStats {
    const stats = loadGameStats();
    const next: GameStats = {
        totalGames: stats.totalGames + 1,
        wins: stats.wins + (isWin ? 1 : 0),
        mvpCount: stats.mvpCount + (isMvp ? 1 : 0),
        lastResult,
    };
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(next));
    } catch (e) { /* ignore */ }
    return next;
}
