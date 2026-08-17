/**
 * 中国节假日数据层 —— 本地表为主 + 联网 timor API 刷新。
 *
 * 提供三类信息：
 *   - 法定节假日（放假范围）：如 国庆 10-01~10-07
 *   - 调休补班：如 春节后的某个周日要上班
 *   - 传统节日：复用 realtimeWorldCore 的农历节日表（除夕/元宵/端午/中秋等）
 *
 * 数据源：
 *   - 本地内置 2026、2027 官方安排（离线可用、最稳）
 *   - 联网拉 https://timor.tech/api/holiday/year/{year}（免费、免 key、支持 CORS）
 *     成功后写 localStorage 覆盖本地，保证后续年份准确。
 *
 * 本模块零浏览器 DOM 依赖（除 fetch/localStorage），可安全用于 worker 外的普通环境。
 */
import { checkSpecialDates } from './realtimeWorldCore';

/* ---------- 类型 ---------- */

/** 某一天的节假日状态。 */
export interface DayFestivalInfo {
    date: string;          // YYYY-MM-DD
    type: 'holiday' | 'workday' | 'normal'; // 放假 / 补班 / 普通
    names: string[];       // 节日名（可能多个，如 春节+除夕）
}

/** 年度节假日数据（联网刷新后的完整结构）。 */
export interface YearFestivalData {
    year: number;
    holidays: Record<string, string>;   // 放假：{ YYYY-MM-DD: 节日名 }
    workdays: Record<string, string>;   // 补班：{ YYYY-MM-DD: 节日名 }
}

/* ---------- 本地内置表（2026-2027 官方安排） ---------- */
// 来源：国务院办公厅节假日安排。key 为该日期，值为节名；补班用单独数组。
const LOCAL_HOLIDAYS: Record<string, string> = {
    // 2026 元旦（1-1 放假1天）
    '2026-01-01': '元旦',
    // 2026 春节（2-16~2-22，除夕2-16）
    '2026-02-16': '除夕', '2026-02-17': '春节', '2026-02-18': '春节',
    '2026-02-19': '春节', '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节',
    // 2026 清明（4-4~4-6）
    '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
    // 2026 劳动节（5-1~5-5）
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
    '2026-05-04': '劳动节', '2026-05-05': '劳动节',
    // 2026 端午（6-19~6-21）
    '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
    // 2026 中秋（9-25~9-27）
    '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
    // 2026 国庆（10-1~10-7）
    '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节',
    '2026-10-04': '国庆节', '2026-10-05': '国庆节', '2026-10-06': '国庆节', '2026-10-07': '国庆节',
};

const LOCAL_WORKDAYS: Record<string, string> = {
    // 2026 补班（示例：春节前、劳动节前后等——以官方为准，此处为占位并会被联网刷新覆盖）
    '2026-02-14': '春节补班', '2026-02-15': '春节补班',
    '2026-04-11': '劳动节补班',
    '2026-09-13': '国庆节补班', '2026-10-10': '国庆节补班',
};

// 本地内置 2027（占位：正式安排以联网刷新为准）
const LOCAL_HOLIDAYS_2027: Record<string, string> = {
    '2027-01-01': '元旦', '2027-01-02': '元旦', '2027-01-03': '元旦',
};
const LOCAL_WORKDAYS_2027: Record<string, string> = {};

/* ---------- localStorage 缓存 ---------- */
const CACHE_KEY = 'os_calendar_festivals';

interface CacheShape {
    fetchedAt: number;
    byYear: Record<number, { holidays: Record<string, string>; workdays: Record<string, string> }>;
}

function readCache(): CacheShape {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) return JSON.parse(raw) as CacheShape;
    } catch (e) { /* ignore */ }
    return { fetchedAt: 0, byYear: {} };
}

function writeCache(c: CacheShape): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) { /* ignore */ }
}

/* ---------- 合并本地 + 联网 ---------- */

function baseForYear(year: number): { holidays: Record<string, string>; workdays: Record<string, string> } {
    if (year === 2026) return { holidays: { ...LOCAL_HOLIDAYS }, workdays: { ...LOCAL_WORKDAYS } };
    if (year === 2027) return { holidays: { ...LOCAL_HOLIDAYS_2027 }, workdays: { ...LOCAL_WORKDAYS_2027 } };
    return { holidays: {}, workdays: {} };
}

function mergedForYear(year: number): { holidays: Record<string, string>; workdays: Record<string, string> } {
    const base = baseForYear(year);
    const cache = readCache();
    const fetched = cache.byYear[year];
    if (fetched) {
        // 联网数据优先覆盖本地
        base.holidays = { ...base.holidays, ...fetched.holidays };
        base.workdays = { ...base.workdays, ...fetched.workdays };
    }
    return base;
}

/* ---------- 查询接口 ---------- */

/**
 * 查询某天的节假日信息。
 * 优先看联网/本地法定节假日表（放假/补班），其次看公历/农历节日名。
 */
export function getDayFestival(dateStr: string): DayFestivalInfo | null {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const merged = mergedForYear(year);

    if (merged.holidays[dateStr]) {
        return { date: dateStr, type: 'holiday', names: [merged.holidays[dateStr]] };
    }
    if (merged.workdays[dateStr]) {
        return { date: dateStr, type: 'workday', names: [merged.workdays[dateStr]] };
    }

    // 普通日：看是否有公历/农历节日名（如 情人节、七夕、教师节）
    // 用本地时间构造 Date（不用 UTC），避免跨时区读 getDate 时偏移到前一天。
    const parts = dateStr.split('-').map(Number); // [y, m, d]
    const localDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0); // 中午12点，稳
    const specials = checkSpecialDates(undefined, localDate.getTime());
    if (specials.length > 0) {
        return { date: dateStr, type: 'normal', names: specials };
    }
    return null;
}

/**
 * 预取某年节假日数据（联网刷新 + 缓存）。
 * 返回是否成功从网络更新了该年数据。失败不抛错（保留本地表）。
 */
export async function prefetchFestivals(year: number): Promise<boolean> {
    try {
        const cache = readCache();
        const now = Date.now();
        // 7 天内不重复拉
        if (cache.byYear[year] && now - cache.fetchedAt < 7 * 24 * 3600 * 1000) {
            return false;
        }
        const res = await fetch(`https://timor.tech/api/holiday/year/${year}`);
        if (!res.ok) return false;
        const data = await res.json();
        const holidays: Record<string, string> = {};
        const workdays: Record<string, string> = {};
        const holidayMap = data?.holiday;
        const workdayMap = data?.workday;
        if (holidayMap) {
            Object.entries(holidayMap as Record<string, any>).forEach(([date, v]) => {
                const name = typeof v === 'string' ? v : v?.name || '节假日';
                holidays[date] = name;
            });
        }
        if (workdayMap) {
            Object.entries(workdayMap as Record<string, any>).forEach(([date, v]) => {
                const name = typeof v === 'string' ? v : v?.name || '补班';
                workdays[date] = name;
            });
        }
        cache.byYear[year] = { holidays, workdays };
        cache.fetchedAt = now;
        writeCache(cache);
        return true;
    } catch (e) {
        return false;
    }
}

/** 清除节假日缓存（测试/手动刷新用）。 */
export function clearFestivalCache(): void {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* ignore */ }
}
