import { describe, it, expect, beforeEach } from 'vitest';
import { getDayFestival, clearFestivalCache } from './calendarFestivals';

describe('getDayFestival 本地节假日表', () => {
    beforeEach(() => clearFestivalCache());

    it('放假日返回 holiday + 节名', () => {
        const r = getDayFestival('2026-10-01');
        expect(r?.type).toBe('holiday');
        expect(r?.names).toContain('国庆节');
    });

    it('补班日返回 workday + 班', () => {
        const r = getDayFestival('2026-02-14');
        expect(r?.type).toBe('workday');
        expect(r?.names.some(n => n.includes('补班'))).toBe(true);
    });

    it('普通公历节日返回 normal + 节名（如教师节）', () => {
        const r = getDayFestival('2026-09-10');
        // 教师节不放假、不补班，是 normal
        expect(r?.type).toBe('normal');
        expect(r?.names).toContain('教师节');
    });

    it('普通工作日返回 null', () => {
        const r = getDayFestival('2026-03-04');
        expect(r).toBeNull();
    });
});
