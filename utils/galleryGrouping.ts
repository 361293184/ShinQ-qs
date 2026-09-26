/**
 * 相册日期分组 —— 纯逻辑，不碰 React / DOM / IndexedDB，便于在纯 Node 下单测。
 *
 * 日期基准必须与写入侧一致：相册图落库时 `savedDate` 由 useLocalDateKey() 产出
 * （本地时区的 YYYY-MM-DD，见 utils/localDate.ts 的 getLocalDateKey）。所以这里
 * 的「回退推算」也走同一个函数 —— 否则同一张图会出现「缩略图上写的日期」与
 * 「分组标题的日期」差一天的情况（跨时区、跨夏令时都会踩到）。
 */
import type { GalleryImage } from '../types';
import { getLocalDateKey, getCalendarDayDifference, parseLocalDateKey } from './localDate';

export type GalleryGroupMode = 'day' | 'month';

/** 既无 savedDate 也无法从 timestamp 推算时的归组键。 */
export const UNKNOWN_DATE_KEY = 'unknown';

const UNKNOWN_LABEL = '未知日期';

/** 'YYYY-MM-DD' / 'YYYY-MM' 的形态校验。 */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

export interface GalleryGroup {
    /** 'day' 为 YYYY-MM-DD，'month' 为 YYYY-MM，未知日期为 UNKNOWN_DATE_KEY。 */
    key: string;
    /** 已本地化的展示标签，如「今天」「2026年8月」。 */
    label: string;
    images: GalleryImage[];
}

/**
 * 归组用的日期键。
 *
 * 优先取落库时的 `savedDate`；它缺失或非法（例如 2026-02-31 这种日历上不存在的
 * 日期，parseLocalDateKey 会判掉）时，用 `timestamp` 按本地时区重算一次；
 * 两者都不可用才落到 UNKNOWN_DATE_KEY。
 */
export function resolveImageDateKey(image: GalleryImage): string {
    const saved = typeof image.savedDate === 'string' ? image.savedDate.trim() : '';
    if (saved && parseLocalDateKey(saved)) return saved;

    const timestamp = image.timestamp;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
        return getLocalDateKey(new Date(timestamp));
    }
    return UNKNOWN_DATE_KEY;
}

/** 月键：YYYY-MM；未知日期归 UNKNOWN_DATE_KEY。 */
export function resolveImageMonthKey(image: GalleryImage): string {
    const dayKey = resolveImageDateKey(image);
    return dayKey === UNKNOWN_DATE_KEY ? UNKNOWN_DATE_KEY : dayKey.slice(0, 7);
}

/**
 * 按日期分组。**保持入参顺序**（调用方已按 timestamp 倒序），单趟遍历建 Map，
 * 整体 O(n)。用 Map 而不是普通对象是为了保住插入顺序 —— 这样「今天」必然排在
 * 最前，与网格本身的倒序视觉连续。
 *
 * @param todayKey 仅供测试注入「今天」，生产路径留空即取设备当前日期。
 */
export function groupImagesByDate(
    images: GalleryImage[],
    mode: GalleryGroupMode,
    todayKey: string = getLocalDateKey(),
): GalleryGroup[] {
    const keyOf = mode === 'month' ? resolveImageMonthKey : resolveImageDateKey;

    const buckets = new Map<string, GalleryImage[]>();
    for (const image of images) {
        const key = keyOf(image);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(image);
        else buckets.set(key, [image]);
    }

    const groups: GalleryGroup[] = [];
    for (const [key, group] of buckets) {
        groups.push({
            key,
            label: key === UNKNOWN_DATE_KEY
                ? UNKNOWN_LABEL
                : mode === 'month'
                    ? formatMonthLabel(key, todayKey)
                    : formatDayLabel(key, todayKey),
            images: group,
        });
    }

    // 「未知日期」不在时间轴上，移到末尾，避免插在正常日期段中间打断倒序
    const unknownIndex = groups.findIndex(group => group.key === UNKNOWN_DATE_KEY);
    if (unknownIndex >= 0 && unknownIndex !== groups.length - 1) {
        const [unknown] = groups.splice(unknownIndex, 1);
        groups.push(unknown);
    }

    return groups;
}

/**
 * 日标签：今天 / 昨天 / 前天，其余为「9月26日 周五」；
 * 跨年时补上年份「2025年9月26日 周五」。
 */
export function formatDayLabel(dateKey: string, todayKey: string = getLocalDateKey()): string {
    if (dateKey === UNKNOWN_DATE_KEY) return UNKNOWN_LABEL;
    if (!DAY_KEY_RE.test(dateKey)) return dateKey;

    const date = parseLocalDateKey(dateKey);
    if (!date) return dateKey;

    const daysAgo = getCalendarDayDifference(dateKey, todayKey);
    if (daysAgo === 0) return '今天';
    if (daysAgo === 1) return '昨天';
    if (daysAgo === 2) return '前天';

    const weekday = WEEKDAY_CN[date.getDay()];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const todayYear = parseLocalDateKey(todayKey)?.getFullYear();

    return date.getFullYear() === todayYear
        ? `${month}月${day}日 周${weekday}`
        : `${date.getFullYear()}年${month}月${day}日 周${weekday}`;
}

/**
 * 月标签：「8月」；跨年时补上年份「2025年8月」。
 * 当年不用「今年8月」这种相对说法 —— 分组标题要能一眼定位到具体时间。
 */
export function formatMonthLabel(monthKey: string, todayKey: string = getLocalDateKey()): string {
    if (monthKey === UNKNOWN_DATE_KEY) return UNKNOWN_LABEL;
    if (!MONTH_KEY_RE.test(monthKey)) return monthKey;

    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || month < 1 || month > 12) {
        return monthKey;
    }

    const todayYear = Number(todayKey.slice(0, 4));
    return year === todayYear ? `${month}月` : `${year}年${month}月`;
}

/** 统计一组里的张数，用于组头的「N 张」。 */
export const countGroupImages = (group: GalleryGroup): number => group.images.length;
