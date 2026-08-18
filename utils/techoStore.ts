/**
 * techo 手账数据层 —— 个人日程/打卡/碎碎念手账的本地存储。
 *
 * 沿用 techo 插件的存储设计：localStorage 为主，key 前缀 `techo_`。
 * 所有手账数据（每日日程、习惯、设置、大事记、目标、周月备注、生理期、
 * 下周池、角色收集、天气缓存）都以 `{ key }` 形式存在这个 KV 里。
 */
import {
    TechoDayData, TechoHabit, TechoSettings, TechoMilestone, TechoGoal,
    TechoMonthData, TechoPeriod, TechoTodoItem, TechoChallenge,
} from '../types';

const PREFIX = 'techo_';

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw != null) return JSON.parse(raw) as T;
    } catch (e) { /* ignore */ }
    return fallback;
}

function write(key: string, val: unknown): void {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(val));
    } catch (e) { /* ignore */ }
}

/* ---------- 日期辅助 ---------- */

export function todayStr(): string {
    const d = new Date();
    return dateStr(d);
}

export function dateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(str: string): Date {
    const p = str.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
}

export function addDays(str: string, n: number): string {
    const d = parseDate(str);
    d.setDate(d.getDate() + n);
    return dateStr(d);
}

export function weekNum(str: string): number {
    const d = parseDate(str);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function weekKey(str: string): string {
    const d = parseDate(str);
    return `${d.getFullYear()}-W${weekNum(str)}`;
}

export function monthKey(str: string): string {
    return str.substring(0, 7);
}

export function greeting(): string {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早安';
    if (h < 14) return '午安';
    if (h < 18) return '下午好';
    if (h < 22) return '晚上好';
    return '夜深了';
}

export function weekdayCN(d: Date): string {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

export function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/** 天气 code → emoji。兼容 OWM icon code（'01d' 等字符串）和 Open-Meteo WMO 数字码。 */
export function weatherIcon(code: number | string | undefined): string {
    if (code == null) return '🌤️';
    const s = String(code);
    // OWM icon code：01d/01n… 取前两位数字
    const m = s.match(/^(\d{2})/);
    if (m) {
        const c = parseInt(m[1], 10);
        if (c === 1) return '☀️';   // 01 晴
        if (c === 2) return '🌤️';   // 02 大致晴朗
        if (c === 3) return '☁️';   // 03 局部多云
        if (c === 4) return '☁️';   // 04 阴
        if (c === 9) return '🌧️';   // 09 雨
        if (c === 10) return '🌦️';  // 10 阵雨
        if (c === 11) return '⛈️';  // 11 雷雨
        if (c === 13) return '🌨️';  // 13 雪
        if (c === 50) return '🌫️';  // 50 雾
        return '🌤️';
    }
    const n = parseInt(s, 10);
    if (isNaN(n)) return '🌤️';
    if (n === 0 || n === 1) return '☀️';
    if (n === 2 || n === 3) return '☁️';
    if (n >= 4 && n <= 19) return '🌧️';
    if (n >= 20 && n <= 29) return '🌨️';
    if (n >= 30 && n <= 39) return '🌪️';
    if (n >= 40 && n <= 49) return '🌨️';
    if (n >= 50 && n <= 59) return '🌫️';
    if (n >= 60 && n <= 79) return '🌧️';
    if (n >= 80 && n <= 89) return '🌦️';
    if (n >= 90 && n <= 99) return '⛈️';
    return '🌤️';
}

/* ---------- 每日数据 ---------- */

export function getDay(dateStrKey: string): TechoDayData {
    const d = read<TechoDayData>(`day_${dateStrKey}`, { date: dateStrKey, timeline: [], todos: [], notes: '' });
    if (!d.timeline) d.timeline = [];
    if (!d.todos) d.todos = [];
    if (!d.notes) d.notes = '';
    return d;
}

export function saveDay(dateStrKey: string, data: TechoDayData): void {
    data.date = dateStrKey;
    write(`day_${dateStrKey}`, data);
}

/* ---------- 习惯 ---------- */

/** 习惯专属色的中性兜底盘（旧数据无 color 时按索引取一个）。 */
export const HABIT_COLOR_PALETTE = [
    '#D9A0A0', '#E8B98A', '#E8C992', '#A8C99E', '#9FC9BD',
    '#9BC2CD', '#9CB1D1', '#B0A2C9', '#C9A2C5', '#D1A0B5',
];

export function habitColor(h: TechoHabit, index: number): string {
    return h.color || HABIT_COLOR_PALETTE[index % HABIT_COLOR_PALETTE.length];
}

export function getHabits(): TechoHabit[] {
    return read<TechoHabit[]>('habits', []);
}

export function saveHabits(h: TechoHabit[]): void {
    write('habits', h);
}

/* ---------- 21 天挑战 ---------- */

export function getChallenges(): TechoChallenge[] {
    return read<TechoChallenge[]>('challenges', []);
}

export function saveChallenges(c: TechoChallenge[]): void {
    write('challenges', c);
}

/* ---------- 年视图手动备注（如生日、纪念日等特殊日子）---------- */

export function getYearNotes(): Record<string, string> {
    return read<Record<string, string>>('yearNotes', {});
}

export function saveYearNotes(n: Record<string, string>): void {
    write('yearNotes', n);
}

/* ---------- 设置 ---------- */

const DEFAULT_SETTINGS: TechoSettings = {
    theme: 'warm',
    fontSize: 15,
    notebookName: '',
    city: '',
    characterFrequency: 'medium',
    characterTone: 'gentle',
    charWhitelist: [],
    charData: {},
    nodeSwitches: { period: true, weather: true, habit: true, milestone: true },
    habitReminder: true,
    bgUrl: '',
    bgOpacity: 0.65,
};

export function getSettings(): TechoSettings {
    const s = read<TechoSettings>('settings', DEFAULT_SETTINGS);
    // 合并默认值，防止缺字段
    return { ...DEFAULT_SETTINGS, ...s, nodeSwitches: { ...DEFAULT_SETTINGS.nodeSwitches, ...(s.nodeSwitches || {}) } };
}

export function saveSettings(s: TechoSettings): void {
    write('settings', s);
}

/* ---------- 大事记 / 年度目标 ---------- */

export function getMilestones(): TechoMilestone[] {
    return read<TechoMilestone[]>('milestones', []);
}

export function saveMilestones(m: TechoMilestone[]): void {
    write('milestones', m);
}

export function getGoals(year: number): TechoGoal[] {
    return read<TechoGoal[]>(`goals_${year}`, []);
}

export function saveGoals(year: number, g: TechoGoal[]): void {
    write(`goals_${year}`, g);
}

/* ---------- 周备注 / 月数据 / 下周池 ---------- */

export function getWeekNote(wk: string): { note: string } {
    return read<{ note: string }>(`weeknote_${wk}`, { note: '' });
}

export function saveWeekNote(wk: string, data: { note: string }): void {
    write(`weeknote_${wk}`, data);
}

export function getMonthData(mk: string): TechoMonthData {
    return read<TechoMonthData>(`month_${mk}`, { note: '', period: null });
}

export function saveMonthData(mk: string, data: TechoMonthData): void {
    write(`month_${mk}`, data);
}

export function getPool(wk: string): TechoTodoItem[] {
    return read<TechoTodoItem[]>(`pool_${wk}`, []);
}

export function savePool(wk: string, pool: TechoTodoItem[]): void {
    write(`pool_${wk}`, pool);
}

/* ---------- 角色收集 ---------- */

export function getChars(): Record<string, { name: string; lastSeen: number }> {
    return read('chars', {});
}

export function saveChars(c: Record<string, { name: string; lastSeen: number }>): void {
    write('chars', c);
}

/* ---------- 天气缓存 ---------- */

export function getWeather(): { code?: number; text?: string; temp?: string } {
    return read('weather', {});
}

export function saveWeather(w: { code?: number; text?: string; temp?: string }): void {
    write('weather', w);
}

/* ---------- 导出 / 清除 ---------- */

export function exportAll(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) {
                data[k.substring(PREFIX.length)] = JSON.parse(localStorage.getItem(k) || '');
            }
        }
    } catch (e) { /* ignore */ }
    return data;
}

export function importAll(data: Record<string, unknown>): void {
    try {
        Object.entries(data).forEach(([k, v]) => write(k, v));
    } catch (e) { /* ignore */ }
}

export function clearAll(): void {
    try {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
}

/** 导出为可下载的 JSON 字符串（生理期默认排除，可选包含）。 */
export function exportJson(includePeriod: boolean): string {
    const data = exportAll();
    if (!includePeriod) {
        const out: Record<string, unknown> = {};
        Object.entries(data).forEach(([k, v]) => {
            if (k.startsWith('month_') && v && typeof v === 'object' && 'period' in (v as object)) {
                out[k] = { ...(v as TechoMonthData), period: null };
            } else {
                out[k] = v;
            }
        });
        return JSON.stringify(out, null, 2);
    }
    return JSON.stringify(data, null, 2);
}

export { DEFAULT_SETTINGS };
export type { TechoPeriod };
