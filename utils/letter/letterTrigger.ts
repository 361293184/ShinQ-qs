/**
 * 来信 · 触发判定。
 *
 * 复用既有的重要日子引擎（utils/realtimeWorldCore.checkSpecialDatesDetailed），只取 tier==='core'。
 * 判定策略：
 *   - **生成时机**：当天用户首次进该角色私聊时才写（不是开机批量跑）——省 token，也更自然：
 *     信跟着「你来找 ta」出现。
 *   - **一天一封**：本机标记（同一角色同一天只写一封）。
 *   - **活跃度门槛**：只给近期有互动的角色写，防陌生角色轰炸。
 *   - **迟到的信**：当天没上线，下次上线补发。**只补最重要的一封**，否则上线瞬间被几封信糊脸。
 *
 * 边界：localStorage 是单设备语义，多设备各自记录（可接受，迟到信本身是"惊喜"而非强一致数据）。
 */

import type { Anniversary, CharacterProfile, LetterOccasion } from '../../types';
import { checkSpecialDatesDetailed } from '../realtimeWorldCore';

const LAST_SEEN_KEY = 'os_last_seen_date';
const WRITTEN_PREFIX = 'os_letter_written_';

/** 命中结果（occasion + 节日彩蛋）。 */
export interface OccasionHit {
    occasion: LetterOccasion;
    egg?: string;
}

/** 触发结果。 */
export interface LetterTriggerResult {
    /** 'today' = 今天就是重要日子；'late' = 补发某一天缺席的信。 */
    kind: 'today' | 'late';
    occasion: LetterOccasion;
    egg?: string;
    /** 迟到的信：本该是哪一天（YYYY-MM-DD）。 */
    lateFor?: string;
}

/** 重要度权重：迟到的信同时命中多个日子时，只补权重最高的那个。 */
function occasionWeight(o: LetterOccasion): number {
    if (o.isUserBirthday || o.isAnniversary) return 4;
    if (o.name === '七夕' || o.name === '情人节' || o.name === '520') return 3;
    if (o.name === '除夕' || o.name === '春节') return 2;
    return 1;
}

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免 UTC 偏移把日期算偏）。 */
export function localDateKey(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
}

// —— 「最后上线日」 ——
export function readLastSeenDate(): string | null {
    try { return localStorage.getItem(LAST_SEEN_KEY); } catch { return null; }
}
export function writeLastSeenDate(date: string): void {
    try { localStorage.setItem(LAST_SEEN_KEY, date); } catch { /* 隐私模式等场景静默忽略 */ }
}

// —— 「这一天已经写过」本机标记（一天一封） ——
export function hasLetterWritten(charId: string, date: string): boolean {
    try { return localStorage.getItem(WRITTEN_PREFIX + charId) === date; } catch { return false; }
}
export function markLetterWritten(charId: string, date: string): void {
    try { localStorage.setItem(WRITTEN_PREFIX + charId, date); } catch { /* 静默忽略 */ }
}

/**
 * 判定某一天命中的 core 重要日子。
 * 用当天中午 12 点做基准，避开夏令时/时区边界把日期算偏。
 */
export function resolveCoreOccasionOn(
    dateKey: string,
    tz?: string,
    anniversaries?: Anniversary[],
    birthday?: string,
): OccasionHit | null {
    const d = parseDateKey(dateKey);
    if (!d) return null;
    const ms = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
    const hits = checkSpecialDatesDetailed(tz, ms, anniversaries, birthday);
    const core = hits.find(h => h.tier === 'core');
    if (!core) return null;
    return {
        occasion: {
            name: core.name,
            label: core.label,
            tier: core.tier,
            isUserBirthday: core.isUserBirthday,
            isAnniversary: core.isAnniversary,
        },
        egg: core.egg,
    };
}

/** 判定这次该不该写、写给哪一天（今天优先，其次补发最重要的一天）。 */
export function resolveLetterTrigger(params: {
    lastSeenDate: string | null;
    today: string;
    tz?: string;
    anniversaries?: Anniversary[];
    birthday?: string;
}): LetterTriggerResult | null {
    const { lastSeenDate, today, tz, anniversaries, birthday } = params;

    // ① 今天就是重要日子
    const todayHit = resolveCoreOccasionOn(today, tz, anniversaries, birthday);
    if (todayHit) {
        return { kind: 'today', occasion: todayHit.occasion, egg: todayHit.egg };
    }

    // ② 迟到的信：扫 (lastSeen, today) 区间，只补重要度最高的一天
    if (!lastSeenDate) return null;
    const start = parseDateKey(lastSeenDate);
    const end = parseDateKey(today);
    if (!start || !end) return null;

    let best: { dateKey: string; hit: OccasionHit } | null = null;
    for (let t = start.getTime() + 86400000; t < end.getTime(); t += 86400000) {
        const key = localDateKey(new Date(t));
        const hit = resolveCoreOccasionOn(key, tz, anniversaries, birthday);
        if (!hit) continue;
        if (!best || occasionWeight(hit.occasion) > occasionWeight(best.hit.occasion)) {
            best = { dateKey: key, hit };
        }
    }
    if (!best) return null;
    return { kind: 'late', occasion: best.hit.occasion, egg: best.hit.egg, lateFor: best.dateKey };
}

/** 活跃度门槛：最近 N 天内有互动才写（默认 30 天），防陌生角色轰炸。 */
export function isLetterEligible(
    lastActiveTs: number | undefined,
    nowMs: number = Date.now(),
    days = 30,
): boolean {
    if (!lastActiveTs) return false;
    return nowMs - lastActiveTs <= days * 86400000;
}

/** 角色是否开启了来信（默认关）。 */
export function isLetterEnabled(char: CharacterProfile | undefined): boolean {
    return !!char?.letterConfig?.enabled;
}
