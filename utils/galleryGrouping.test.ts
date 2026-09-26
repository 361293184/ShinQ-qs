// @vitest-environment jsdom
/**
 * 相册日期分组纯逻辑单测。
 *
 * 重点钉住四件容易退化的事：
 *   1. `savedDate` 缺失/非法时的回退路径必须与写入侧同一个函数（本地时区），
 *      否则跨时区会差一天；
 *   2. 分组保持入参顺序 —— 调用方按 timestamp 倒序传，分组后「今天」必须在最前；
 *   3. 「未知日期」不打断正常日期段的倒序，固定排末尾；
 *   4. 标签的天/月格式与跨年补年份规则。
 */
import { describe, expect, it } from 'vitest';
import type { GalleryImage } from '../types';
import {
    UNKNOWN_DATE_KEY,
    countGroupImages,
    formatDayLabel,
    formatMonthLabel,
    groupImagesByDate,
    resolveImageDateKey,
    resolveImageMonthKey,
} from './galleryGrouping';

/** 造一张相册图；只填本模块真正读的字段。 */
const img = (partial: Partial<GalleryImage> & { id: string }): GalleryImage => ({
    charId: 'char-1',
    url: `blobref:${partial.id}`,
    timestamp: 0,
    ...partial,
});

/** 本地时间某日 12:00 的时间戳 —— 避开时区把日期推到前后一天。 */
const noonOf = (year: number, month: number, day: number): number =>
    new Date(year, month - 1, day, 12, 0, 0, 0).getTime();

describe('resolveImageDateKey', () => {
    it('savedDate 合法时直接采用（不与 timestamp 比对）', () => {
        const image = img({ id: 'a', savedDate: '2026-08-15', timestamp: noonOf(2026, 9, 26) });
        expect(resolveImageDateKey(image)).toBe('2026-08-15');
    });

    it('savedDate 缺失时按本地时区从 timestamp 推算', () => {
        const image = img({ id: 'b', timestamp: noonOf(2025, 3, 7) });
        expect(resolveImageDateKey(image)).toBe('2025-03-07');
    });

    it('savedDate 非法（日历上不存在）时回退到 timestamp', () => {
        const image = img({ id: 'c', savedDate: '2026-02-31', timestamp: noonOf(2026, 5, 9) });
        expect(resolveImageDateKey(image)).toBe('2026-05-09');
    });

    it('savedDate 是残缺/非日期字符串时同样回退', () => {
        for (const broken of ['', '   ', '2026-8-1', 'not-a-date', '2026/08/01']) {
            const image = img({ id: 'd', savedDate: broken, timestamp: noonOf(2026, 1, 2) });
            expect(resolveImageDateKey(image), broken).toBe('2026-01-02');
        }
    });

    it('timestamp 也不可用时归入未知，而不是抛错或给出 NaN 日期', () => {
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const image = img({ id: 'e', timestamp: bad });
            expect(resolveImageDateKey(image), String(bad)).toBe(UNKNOWN_DATE_KEY);
        }
        // timestamp 缺失（undefined）走同一个兜底
        expect(resolveImageDateKey(img({ id: 'f' }))).toBe(UNKNOWN_DATE_KEY);
    });

    it('月键取日期键前 7 位；未知日期保持未知', () => {
        expect(resolveImageMonthKey(img({ id: 'g', savedDate: '2026-08-15' }))).toBe('2026-08');
        expect(resolveImageMonthKey(img({ id: 'h', savedDate: '2026-02-31' }))).toBe(UNKNOWN_DATE_KEY);
    });
});

describe('groupImagesByDate · 按天', () => {
    it('空数组返回空分组，不产生空组', () => {
        expect(groupImagesByDate([], 'day')).toEqual([]);
    });

    it('保持入参顺序：倒序进来，「今天」就在最前', () => {
        const images = [
            img({ id: '1', savedDate: '2026-09-26' }),
            img({ id: '2', savedDate: '2026-09-26' }),
            img({ id: '3', savedDate: '2026-09-25' }),
            img({ id: '4', savedDate: '2026-09-20' }),
        ];
        const groups = groupImagesByDate(images, 'day', '2026-09-26');

        expect(groups.map(g => g.key)).toEqual(['2026-09-26', '2026-09-25', '2026-09-20']);
        expect(groups[0].images.map(i => i.id)).toEqual(['1', '2']);
        expect(groups[1].images.map(i => i.id)).toEqual(['3']);
    });

    it('同一天内保持传入顺序（不打乱调用方的倒序）', () => {
        const images = [
            img({ id: 'newer', savedDate: '2026-09-26', timestamp: 200 }),
            img({ id: 'older', savedDate: '2026-09-26', timestamp: 100 }),
        ];
        expect(groupImagesByDate(images, 'day', '2026-09-26')[0].images.map(i => i.id))
            .toEqual(['newer', 'older']);
    });

    it('未知日期组固定排末尾，不打断正常日期倒序', () => {
        const images = [
            img({ id: '1', savedDate: '2026-09-26' }),
            img({ id: 'broken', savedDate: 'bad', timestamp: 0 }),
            img({ id: '2', savedDate: '2026-09-20' }),
            img({ id: '3', savedDate: '2026-09-19' }),
        ];
        const groups = groupImagesByDate(images, 'day', '2026-09-26');

        expect(groups.map(g => g.key)).toEqual(['2026-09-26', '2026-09-20', '2026-09-19', UNKNOWN_DATE_KEY]);
        expect(groups[groups.length - 1].label).toBe('未知日期');
    });

    it('跨月跨年仍然按传入顺序分组，不被字典序重排', () => {
        const images = [
            img({ id: 'a', savedDate: '2026-01-02' }),
            img({ id: 'b', savedDate: '2025-12-31' }),
            img({ id: 'c', savedDate: '2025-12-30' }),
        ];
        const groups = groupImagesByDate(images, 'day', '2026-01-02');
        expect(groups.map(g => g.key)).toEqual(['2026-01-02', '2025-12-31', '2025-12-30']);
    });

    it('countGroupImages 与组内实际张数一致', () => {
        const groups = groupImagesByDate([
            img({ id: '1', savedDate: '2026-09-26' }),
            img({ id: '2', savedDate: '2026-09-26' }),
            img({ id: '3', savedDate: '2026-09-25' }),
        ], 'day', '2026-09-26');

        expect(groups.map(countGroupImages)).toEqual([2, 1]);
    });
});

describe('groupImagesByDate · 按月', () => {
    it('同月合并、跨月分段，且保持倒序', () => {
        const images = [
            img({ id: '1', savedDate: '2026-09-26' }),
            img({ id: '2', savedDate: '2026-09-01' }),
            img({ id: '3', savedDate: '2026-08-31' }),
            img({ id: '4', savedDate: '2025-12-31' }),
        ];
        const groups = groupImagesByDate(images, 'month', '2026-09-26');

        expect(groups.map(g => g.key)).toEqual(['2026-09', '2026-08', '2025-12']);
        expect(groups[0].images.map(i => i.id)).toEqual(['1', '2']);
        expect(groups.map(countGroupImages)).toEqual([2, 1, 1]);
    });

    it('savedDate 缺失的图靠 timestamp 落进正确的月', () => {
        const images = [
            img({ id: 'withDate', savedDate: '2026-09-26' }),
            img({ id: 'noDate', timestamp: noonOf(2026, 8, 3) }),
        ];
        const groups = groupImagesByDate(images, 'month', '2026-09-26');
        expect(groups.map(g => g.key)).toEqual(['2026-09', '2026-08']);
    });
});

describe('标签格式', () => {
    it('日标签：今天 / 昨天 / 前天', () => {
        expect(formatDayLabel('2026-09-26', '2026-09-26')).toBe('今天');
        expect(formatDayLabel('2026-09-25', '2026-09-26')).toBe('昨天');
        expect(formatDayLabel('2026-09-24', '2026-09-26')).toBe('前天');
    });

    it('日标签：更早的同年日期带星期、不带年份', () => {
        expect(formatDayLabel('2026-09-20', '2026-09-26')).toBe('9月20日 周日');
        expect(formatDayLabel('2026-01-01', '2026-09-26')).toBe('1月1日 周四');
    });

    it('跨年但只差一两天时仍走相对日期（「前天」对近期比具体日期更有用）', () => {
        expect(formatDayLabel('2025-12-31', '2026-01-02')).toBe('前天');
    });

    it('日标签：更早的跨年日期补上年份', () => {
        expect(formatDayLabel('2025-12-31', '2026-01-15')).toBe('2025年12月31日 周三');
    });

    it('月标签：当年只给「N月」，跨年补年份', () => {
        expect(formatMonthLabel('2026-09', '2026-09-26')).toBe('9月');
        expect(formatMonthLabel('2026-01', '2026-09-26')).toBe('1月');
        expect(formatMonthLabel('2025-08', '2026-09-26')).toBe('2025年8月');
    });

    it('未知键在日/月两种粒度下都给「未知日期」，而不是 raw key', () => {
        expect(formatDayLabel(UNKNOWN_DATE_KEY, '2026-09-26')).toBe('未知日期');
        expect(formatMonthLabel(UNKNOWN_DATE_KEY, '2026-09-26')).toBe('未知日期');
    });

    it('传入形态不对的键时原样返回，不抛错（防御异常数据）', () => {
        expect(formatDayLabel('2026-9-1', '2026-09-26')).toBe('2026-9-1');
        expect(formatMonthLabel('2026-9', '2026-09-26')).toBe('2026-9');
        expect(formatMonthLabel('2026-13', '2026-09-26')).toBe('2026-13');
    });
});
