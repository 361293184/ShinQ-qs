/**
 * 中国节假日数据层 —— 官方内置表为准 + 上游同源 CDN 刷新。
 *
 * 提供三类信息：
 *   - 法定节假日（放假范围）：如 国庆 10-01~10-07
 *   - 调休补班：如 春节前的某个周六要上班
 *   - 传统节日：复用 realtimeWorldCore 的公历/农历节日表（除夕/元宵/端午/中秋/情人节等）
 *
 * 数据源（与聊天、主动消息感知用的是同一套官方数据，不再维护第二份）：
 *   - 内置 `presets/holidays/cn-2026.json`：国务院办公厅正式安排（含官方文号 papers），
 *     离线可用且**自带调休补班**，所以该年份完全不联网。
 *   - 其余年份：上游同源地址 https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn
 *     （与 utils/userHolidays.ts 用的同一个源），成功后写本地缓存。
 *
 * 本模块是「手账日历的节日聚合层」：把「法定假/补班」与「公历/农历节日名」合成一处，
 * 供 apps/TechoApp.tsx 的月视图逐格读取。上游 userHolidays 只管公共假期与补班、
 * 不提供「情人节/七夕/教师节」这类不放假的节日，所以聚合层必须保留。
 *
 * 对外查询接口是**同步**的（月视图在渲染期逐格调用），因此缓存必须同步可读：
 * 联网只发生在 prefetchFestivals（useEffect 内），首帧由内置表兜底，不会空白。
 */
import { checkSpecialDates } from './realtimeWorldCore';
import { parseHolidayCalendar, type HolidayCalendar } from './userHolidays';
import china2026 from '../presets/holidays/cn-2026.json';

/* ---------- 类型 ---------- */

/** 某一天的节假日状态。 */
export interface DayFestivalInfo {
    date: string;          // YYYY-MM-DD
    type: 'holiday' | 'workday' | 'normal'; // 放假 / 补班 / 普通
    names: string[];       // 节日名（普通日可能多个，如 中秋恰好撞国庆）
}

/* ---------- 内置表（官方正式安排，离线可用） ---------- */

/**
 * 年份 → 官方 JSON。结构与 `parseHolidayCalendar` 的入参一致
 * （顶层 `year` / `papers` / `days[{date,name,isOffDay}]`）。
 */
const BUILTIN_BY_YEAR: Record<number, unknown> = {
    2026: china2026,
};

/* ---------- 同步可读缓存 ---------- */

const CACHE_KEY = 'os_calendar_festivals';
/** 7 天内不重复联网拉同一年。 */
const REFRESH_WINDOW_MS = 7 * 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 3000;
/**
 * 缓存结构版本。旧版是 `{ fetchedAt, byYear: { [y]: { holidays, workdays } } }`，
 * 与新结构不兼容，读到无版本标记（或版本不符）的内容一律丢弃，避免旧数据继续污染日历。
 */
const CACHE_VERSION = 2;

interface CachedYear {
    fetchedAt: number;
    /** 与 `HolidayCalendar.days` 同形，直接存上游归一化结果，省一次转换。 */
    days: Array<{ date: string; name: string; off: boolean }>;
}
interface FestivalCacheV2 {
    v: typeof CACHE_VERSION;
    byYear: Record<string, CachedYear>;
}

/** 某年的放假/补班索引（由归一化结果派生，供 O(1) 查表）。 */
interface YearTables {
    /** 放假日 → 节日名，如 2026-10-01 → 国庆节 */
    holidays: Map<string, string>;
    /** 补班日 → 「XX补班」，如 2026-02-14 → 春节补班 */
    workdays: Map<string, string>;
}

/** 年内归一化结果（含 null＝该年确实没有数据），避免每次渲染都解析 JSON / 读 localStorage。 */
const memory = new Map<number, HolidayCalendar | null>();
/** 由 memory 派生的查表索引。 */
const tables = new Map<number, YearTables>();
/** 正在飞行的刷新，用于同一页面并发去重。 */
const inFlight = new Map<number, Promise<boolean>>();

function readCache(): FestivalCacheV2 {
    const empty: FestivalCacheV2 = { v: CACHE_VERSION, byYear: {} };
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return empty;
        const parsed = JSON.parse(raw) as FestivalCacheV2 | null;
        if (parsed?.v !== CACHE_VERSION || typeof parsed.byYear !== 'object' || parsed.byYear === null) {
            // 旧结构（没有 v 字段）：丢弃，下一次 writeCache 会把它覆盖掉。
            return empty;
        }
        return parsed;
    } catch {
        return empty;
    }
}

function writeCache(cache: FestivalCacheV2): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* 配额满 / 隐私模式：忽略，缓存丢了只是下次重新拉 */ }
}

/** 写入内存并失效派生的查表索引。 */
function remember(year: number, calendar: HolidayCalendar | null): void {
    memory.set(year, calendar);
    tables.delete(year);
}

/** 内存 → localStorage → 内置表，**全部同步**；都没有则 null（该年按「无数据」处理）。 */
function calendarForYear(year: number): HolidayCalendar | null {
    const cached = memory.get(year);
    if (cached !== undefined) return cached;

    let calendar: HolidayCalendar | null = null;

    // 1) 联网刷新写下的缓存
    const entry = readCache().byYear[String(year)];
    if (entry && Number.isFinite(entry.fetchedAt) && Array.isArray(entry.days)) {
        calendar = { country: 'CN', year, fetchedAt: entry.fetchedAt, days: entry.days };
    }

    // 2) 内置官方表兜底（离线可用；已有更新缓存时不覆盖）
    if (!calendar) {
        const raw = BUILTIN_BY_YEAR[year];
        if (raw) calendar = parseHolidayCalendar('CN', year, raw, Date.now());
    }

    remember(year, calendar);
    return calendar;
}

/** 派生某年的放假/补班索引。 */
function tablesForYear(year: number): YearTables {
    const cached = tables.get(year);
    if (cached) return cached;

    const built: YearTables = { holidays: new Map(), workdays: new Map() };
    const calendar = calendarForYear(year);
    if (calendar) {
        for (const day of calendar.days) {
            // 官方表只给节日名（补班日也是同一个名字，如 2026-02-14「春节」isOffDay=false）。
            // 这里必须补出「补班」二字：月视图的补班格子靠 it，既有测试也断言 names 含「补班」。
            if (day.off) built.holidays.set(day.date, day.name);
            else built.workdays.set(day.date, `${day.name}补班`);
        }
    }

    tables.set(year, built);
    return built;
}

/* ---------- 查询接口 ---------- */

/**
 * 查询某天的节假日信息。
 * 优先看官方法定节假日表（放假/补班），其次看公历/农历节日名。
 * 同步函数 —— 月视图在渲染期逐格调用，不可改成 async。
 */
export function getDayFestival(dateStr: string): DayFestivalInfo | null {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const { holidays, workdays } = tablesForYear(year);

    const holiday = holidays.get(dateStr);
    if (holiday) {
        return { date: dateStr, type: 'holiday', names: [holiday] };
    }
    const workday = workdays.get(dateStr);
    if (workday) {
        return { date: dateStr, type: 'workday', names: [workday] };
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
 * 预取某年节假日数据。
 * 返回是否**从网络**更新了该年数据（内置表命中的年份恒为 false）。
 *
 * - 内置官方表的年份（当前 2026）：直接短路，一次请求都不发 —— 内置表已含全部放假与调休补班。
 * - 其余年份：从上游同源拉取，成功后写缓存并刷新内存。
 * - 失败不抛错（保留内置表或既有缓存），绝不阻塞渲染。
 */
export async function prefetchFestivals(year: number): Promise<boolean> {
    if (BUILTIN_BY_YEAR[year]) {
        calendarForYear(year); // 预热内存，保证首帧查表即有数据
        return false;
    }

    const now = Date.now();
    const entry = readCache().byYear[String(year)];
    if (entry && now - entry.fetchedAt < REFRESH_WINDOW_MS) return false;

    const flying = inFlight.get(year);
    if (flying) return flying;

    const job = (async (): Promise<boolean> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const url = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`;
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) return false;
            const parsed = parseHolidayCalendar('CN', year, await res.json(), now);
            // 官方安排未公布时 parse 会返回 null：那是「尚未确认」，不是「该年没有假期」，不能写缓存。
            if (!parsed) return false;

            // 重读一次再写，避免把本轮期间其他年份的刷新结果覆盖掉。
            const latest = readCache();
            latest.byYear[String(year)] = { fetchedAt: now, days: parsed.days };
            writeCache(latest);
            remember(year, parsed);
            return true;
        } catch {
            return false; // 网络异常 / 格式不符 / 超时：静默降级
        } finally {
            clearTimeout(timer);
        }
    })();

    inFlight.set(year, job);
    try {
        return await job;
    } finally {
        inFlight.delete(year);
    }
}

/** 清除节假日缓存（测试/手动刷新用）。内存与 localStorage 一并清，避免内存副本继续生效。 */
export function clearFestivalCache(): void {
    memory.clear();
    tables.clear();
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch { /* ignore */ }
}
