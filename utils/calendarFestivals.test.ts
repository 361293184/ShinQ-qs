import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFestivalCache, getDayFestival, prefetchFestivals } from './calendarFestivals';

const CACHE_KEY = 'os_calendar_festivals';

/** 写一份 v2 缓存，模拟「联网刷新已落盘」。 */
function seedCache(year: number, days: Array<{ date: string; name: string; off: boolean }>, fetchedAt = Date.now()) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: 2, byYear: { [String(year)]: { fetchedAt, days } } }));
}

describe('getDayFestival 官方内置表', () => {
    beforeEach(() => clearFestivalCache());
    afterEach(() => { clearFestivalCache(); vi.restoreAllMocks(); });

    // ── 以下 4 个断言是对外契约，数据源换代后必须继续成立 ──

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

    // ── 新增：官方表替换掉旧占位表后的具体差异（这些正是当初要换数据源的原因） ──

    it('官方全部 6 个补班日都命中，且名字带「补班」后缀', () => {
        // 旧占位表漏掉 01-04 / 02-28，把补班标在官方没有的 04-11 / 09-13 上
        for (const date of ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']) {
            const r = getDayFestival(date);
            expect(r?.type, date).toBe('workday');
            expect(r?.names.some(n => n.includes('补班')), date).toBe(true);
        }
    });

    it('2026-02-15 是春节放假，不是补班（旧占位表正好标反）', () => {
        const r = getDayFestival('2026-02-15');
        expect(r?.type).toBe('holiday');
        expect(r?.names).toContain('春节');
    });

    it('放假区间首尾日在放（元旦 1-1~1-3、国庆末 10-7）', () => {
        for (const date of ['2026-01-01', '2026-01-03', '2026-10-07']) {
            expect(getDayFestival(date)?.type, date).toBe('holiday');
        }
    });

    it('内置表未覆盖的年份不报错，退化为只认公历/农历节日名', () => {
        // 元旦仍在（走 checkSpecialDates），但没有法定假日记录 → normal 而非 holiday
        expect(getDayFestival('2027-01-01')?.type).toBe('normal');
        expect(getDayFestival('2027-03-04')).toBeNull();
    });

    // ── 新增：缓存行为 ──

    it('旧结构缓存（无版本标记）被判定为不兼容并忽略', () => {
        // 线上老版本留下的 { fetchedAt, byYear: { [y]: { holidays, workdays } } }
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            fetchedAt: 1,
            byYear: { 2026: { holidays: { '2026-03-04': '旧缓存的假数据' }, workdays: {} } },
        }));
        // 旧数据不得生效，内置表照常工作
        expect(getDayFestival('2026-03-04')).toBeNull();
        expect(getDayFestival('2026-10-01')?.type).toBe('holiday');
    });

    it('v2 缓存优先于内置表', () => {
        seedCache(2026, [{ date: '2026-03-04', name: '测试假', off: true }]);
        const r = getDayFestival('2026-03-04');
        expect(r?.type).toBe('holiday');
        expect(r?.names).toContain('测试假');
    });

    it('v2 缓存里的补班日同样补出「补班」后缀', () => {
        seedCache(2026, [{ date: '2026-03-05', name: '测试节', off: false }]);
        expect(getDayFestival('2026-03-05')?.names).toContain('测试节补班');
    });
});

describe('prefetchFestivals 联网策略', () => {
    beforeEach(() => clearFestivalCache());
    afterEach(() => { clearFestivalCache(); vi.restoreAllMocks(); });

    it('内置表命中的年份一次请求都不发', async () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        await expect(prefetchFestivals(2026)).resolves.toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });

    it('其它年份从上游同源 CDN 拉取并写缓存', async () => {
        const payload = { year: 2027, papers: ['https://www.gov.cn/xxx'], days: [{ date: '2027-01-01', name: '元旦', isOffDay: true }] };
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

        await expect(prefetchFestivals(2027)).resolves.toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(String(spy.mock.calls[0]?.[0])).toContain('NateScarlet/holiday-cn');
        // 落盘后同步查表即可命中
        expect(getDayFestival('2027-01-01')?.type).toBe('holiday');
    });

    it('官方安排未公布（解析不通过）时不写缓存', async () => {
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        await expect(prefetchFestivals(2028)).resolves.toBe(false);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('网络失败静默降级，不抛错', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
        await expect(prefetchFestivals(2029)).resolves.toBe(false);
    });

    it('7 天窗口内不重复拉取', async () => {
        seedCache(2030, [], Date.now());
        const spy = vi.spyOn(globalThis, 'fetch');
        await expect(prefetchFestivals(2030)).resolves.toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });
});
