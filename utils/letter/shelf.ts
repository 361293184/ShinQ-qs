/**
 * 拾光（收藏馆）的数据归一化层。
 *
 * 拾光要同时展示两类收藏：番外（FanwaiStory）与来信（LetterRecord）。
 * 两者的数据结构不同，但都存了 charId / charName，所以「按角色分组」不需要改数据结构——
 * 在 UI 层把两者归一化成统一的 ShelfItem，再按角色聚合即可。
 *
 * 之所以不动 fanwaiStories 的类型：它在 OSContext、生成页、拾光三处共用，改类型会牵动生成侧。
 * 新增 collectedLetters + UI 层归一化是最小改动。
 */

import type { CharacterProfile, FanwaiStory, LetterRecord } from '../../types';

/** 拾光的统一条目（仅 UI 层归一化用，不落库）。 */
export type ShelfItem =
    | { kind: 'fanwai'; id: string; charId: string; charName: string; createdAt: number; data: FanwaiStory }
    | { kind: 'letter'; id: string; charId: string; charName: string; createdAt: number; data: LetterRecord };

/** 一个角色在拾光里的汇总（L1 角色卡 / L2 角色主页用）。 */
export interface CharShelfSummary {
    charId: string;
    charName: string;
    /** 角色头像（角色被删后为空，用首字母兜底）。 */
    avatar: string;
    letters: LetterRecord[];
    stories: FanwaiStory[];
    /** 该角色最近一条收藏的时间，用于 L1 排序。 */
    latestAt: number;
}

/**
 * 把番外 + 来信合并后按角色分组。
 * - 只返回**有内容**的角色（一个角色既没番外也没信 → 不出现在拾光里）；
 * - 角色被删后用 charName 快照兜底显示；
 * - 返回按「该角色最近一条收藏」倒序。
 */
export function buildShelfSummaries(
    characters: CharacterProfile[],
    fanwaiStories: FanwaiStory[],
    collectedLetters: LetterRecord[],
): CharShelfSummary[] {
    const map = new Map<string, CharShelfSummary>();

    const ensure = (charId: string, charName: string): CharShelfSummary => {
        let entry = map.get(charId);
        if (!entry) {
            const char = characters.find(c => c.id === charId);
            entry = {
                charId,
                charName: char?.name || charName || '未知角色',
                avatar: char?.avatar || '',
                letters: [],
                stories: [],
                latestAt: 0,
            };
            map.set(charId, entry);
        }
        return entry;
    };

    for (const story of fanwaiStories) {
        const entry = ensure(story.charId, story.charName);
        entry.stories.push(story);
        entry.latestAt = Math.max(entry.latestAt, story.continuedAt || story.createdAt || 0);
    }

    for (const letter of collectedLetters) {
        const entry = ensure(letter.charId, letter.charName);
        entry.letters.push(letter);
        entry.latestAt = Math.max(entry.latestAt, letter.createdAt || 0);
    }

    const list = Array.from(map.values());
    for (const entry of list) {
        entry.letters.sort((a, b) => b.createdAt - a.createdAt);
        entry.stories.sort((a, b) => b.createdAt - a.createdAt);
    }
    // 只有有内容的角色才出现；按最近一条收藏倒序。
    return list
        .filter(entry => entry.letters.length > 0 || entry.stories.length > 0)
        .sort((a, b) => b.latestAt - a.latestAt);
}

/** 来信按年份分组（组内最新在上），供 L3a 的年份章列表用。 */
export function groupLettersByYear(letters: LetterRecord[]): { year: number; items: LetterRecord[] }[] {
    const byYear = new Map<number, LetterRecord[]>();
    for (const letter of letters) {
        const year = letter.year || Number((letter.date || '').slice(0, 4)) || new Date(letter.createdAt).getFullYear();
        const bucket = byYear.get(year);
        if (bucket) bucket.push(letter);
        else byYear.set(year, [letter]);
    }
    return Array.from(byYear.entries())
        .map(([year, items]) => ({ year, items: items.sort((a, b) => b.createdAt - a.createdAt) }))
        .sort((a, b) => b.year - a.year);
}

/** 角色卡上的统计文案：「3 封信 · 7 篇」。 */
export function shelfCountText(entry: CharShelfSummary): string {
    const parts: string[] = [];
    if (entry.letters.length > 0) parts.push(`${entry.letters.length} 封信`);
    if (entry.stories.length > 0) parts.push(`${entry.stories.length} 篇`);
    return parts.join(' · ') || '还没有内容';
}

/** 相对时间文案（拾光列表用）。 */
export function shelfDateText(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return '今天';
    const sameYear = d.getFullYear() === now.getFullYear();
    const md = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
    return sameYear ? md : `${d.getFullYear()}.${md}`;
}
