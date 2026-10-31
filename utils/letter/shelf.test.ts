/**
 * 拾光聚合层：只认现有角色。
 *
 * 角色在神经链接里被删掉后，ta 名下的番外/来信不应再出现在拾光列表里；
 * 历史上 charId 缺失的脏数据仍按 charName 快照兜底显示，避免误伤。
 */
import { describe, expect, it } from 'vitest';
import { buildShelfSummaries } from './shelf';

const character = (id: string, name: string) => ({ id, name, avatar: '' } as any);
const story = (id: string, charId: string, charName: string, createdAt: number) =>
    ({ id, charId, charName, createdAt } as any);
const letter = (id: string, charId: string, charName: string, createdAt: number) =>
    ({ id, charId, charName, createdAt, date: '2026-10-31', year: 2026 } as any);

describe('buildShelfSummaries', () => {
    it('已删角色的番外与来信都不再出现在拾光里', () => {
        const summaries = buildShelfSummaries(
            [character('char-a', '甲')],
            [story('s1', 'char-a', '甲', 10), story('s2', 'char-gone', '已删角色', 20)],
            [letter('l1', 'char-a', '甲', 30), letter('l2', 'char-gone', '已删角色', 40)],
        );

        expect(summaries.map(s => s.charId)).toEqual(['char-a']);
        expect(summaries[0].stories.map(s => s.id)).toEqual(['s1']);
        expect(summaries[0].letters.map(l => l.id)).toEqual(['l1']);
    });

    it('角色全被删光时拾光为空，不会拿快照名凑出一堆"幽灵角色"', () => {
        const summaries = buildShelfSummaries(
            [],
            [story('s1', 'char-gone', '已删角色', 10)],
            [letter('l1', 'char-gone', '已删角色', 20)],
        );

        expect(summaries).toEqual([]);
    });

    it('charId 缺失的历史条目按快照名兜底保留', () => {
        const summaries = buildShelfSummaries(
            [character('char-a', '甲')],
            [story('s-legacy', '', '老数据角色', 10)],
            [letter('l-legacy', '', '老数据角色', 20)],
        );

        expect(summaries).toHaveLength(1);
        expect(summaries[0].charName).toBe('老数据角色');
        expect(summaries[0].stories.map(s => s.id)).toEqual(['s-legacy']);
        expect(summaries[0].letters.map(l => l.id)).toEqual(['l-legacy']);
    });
});
