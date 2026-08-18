/**
 * 手账 App —— 个人日程/打卡/碎碎念手账（techo 插件 React 移植）。
 *
 * 定位：不是「AI 代笔的手账」，而是**自己用的生活手账**——记日程、勾 Todo、
 * 写碎碎念、打卡习惯、设目标，角色可选地基于手账数据说话。
 *
 * 结构：
 *   - 封面（问候 + 今日概览 + 天气 + 习惯快捷卡 + 统计）
 *   - 日视图（时间轴 / Todo / 碎碎念 三 tab，左右翻日期）
 *   - 周视图 / 月视图（含生理期）/ 年视图
 *   - 习惯打卡
 *   - 设置（主题 / 角色管理 / 数据导出）
 *
 * 数据走 utils/techoStore（localStorage，key 前缀 techo_）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { TechoDayData, TechoHabit, TechoSettings, TechoTodoItem, TechoTimelineItem, TechoChallenge, CharacterProfile } from '../types';
import { RealtimeContextManager, WeatherData } from '../utils/realtimeContext';
import { getDayFestival, prefetchFestivals } from '../utils/calendarFestivals';
import {
    todayStr, dateStr, addDays, weekKey, greeting, weekdayCN, uid,
    weatherIcon, getDay, saveDay, getHabits, saveHabits, getSettings, saveSettings,
    getChallenges, saveChallenges,
    getYearNotes, saveYearNotes,
    habitColor,
} from '../utils/techoStore';
import {
    GearSix, CaretLeft, CaretRight,
    Star, PencilSimple, Trash, Plus, CheckCircle, Circle,
    ClipboardText, CalendarBlank, SquaresFour, ChartBar, CheckSquare,
} from '@phosphor-icons/react';

/* ---------- 主题配色 ----------
 * bg：内容区底色；headerBg：顶栏加深色（顶/底栏同色）；card/text/muted/accent 沿用；
 * pattern：内容区背景纹路（内联 SVG data URI，低透明度、不元素位置随机）。
 */
const THEMES: Record<string, {
    name: string; bg: string; headerBg: string; card: string; text: string; muted: string; accent: string;
    pattern: string;
}> = {
    warm:  { name: '暖纸', bg: 'bg-[#FDF6EC]', headerBg: 'bg-[#F2E4CC]', card: 'bg-white/90', text: 'text-[#3A3229]', muted: 'text-[#9A8B7A]', accent: 'bg-[#E8A87C]',
             pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='240' viewBox='0 0 160 240'%3E%3Cg fill='none' stroke='%23C89A6B' stroke-width='1' opacity='0.32'%3E%3Cpath transform='translate(22 30) rotate(18)' d='M0 0c-4 2-6 6-4 10 1 3 4 5 6 2 2-2 1-7-2-12z'/%3E%3Cpath transform='translate(28 28) rotate(15)' d='M4 -2c-1 5-4 9-8 12'/%3E%3Cpath transform='translate(108 70) rotate(-25)' d='M0 0c4-1 6-5 4-9-1-3-4-4-5-2-2 2-1 7 1 11z'/%3E%3Cpath transform='translate(105 68) rotate(-22)' d='M3 -2c1-5 3-8 7-10'/%3E%3Cpath transform='translate(56 122) rotate(45)' d='M0 0c-3 2-5 5-3 8 1 2 3 4 5 2 1-2 1-6-2-10z'/%3E%3Cpath transform='translate(132 158) rotate(-40)' d='M0 0c3-2 4-4 2-7-1-2-3-3-4-1-1 1 0 5 2 8z'/%3E%3Cpath transform='translate(40 198) rotate(12)' d='M0 0c-3 2-4 5-2 8 1 2 3 3 4 1 1-2 0-6-2-9z'/%3E%3Cpath transform='translate(96 210) rotate(-15)' d='M0 0c-3 1-5 4-3 7 1 2 3 3 4 1 1-2 1-5-1-8z'/%3E%3C/g%3E%3C/svg%3E")` },
    calm:  { name: '青蓝', bg: 'bg-[#EEF4F8]', headerBg: 'bg-[#D9E8F2]', card: 'bg-white/90', text: 'text-[#2F3E4E]', muted: 'text-[#8FA2B4]', accent: 'bg-[#6C9BD1]',
             pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='220' viewBox='0 0 140 220'%3E%3Cg fill='%238FB6CE' opacity='0.36'%3E%3Cellipse transform='translate(18 22) rotate(8)' cx='0' cy='0' rx='1.6' ry='3'/%3E%3Cellipse transform='translate(88 38) rotate(-12)' cx='0' cy='0' rx='1.4' ry='2.8'/%3E%3Cellipse transform='translate(48 64) rotate(15)' cx='0' cy='0' rx='1.8' ry='3.2'/%3E%3Cellipse transform='translate(112 82) rotate(-6)' cx='0' cy='0' rx='1.5' ry='2.6'/%3E%3Cellipse transform='translate(28 108) rotate(20)' cx='0' cy='0' rx='1.7' ry='3'/%3E%3Cellipse transform='translate(72 132) rotate(-18)' cx='0' cy='0' rx='1.5' ry='2.8'/%3E%3Cellipse transform='translate(108 156) rotate(10)' cx='0' cy='0' rx='1.6' ry='3'/%3E%3Cellipse transform='translate(36 178) rotate(-22)' cx='0' cy='0' rx='1.4' ry='2.6'/%3E%3Cellipse transform='translate(82 198) rotate(14)' cx='0' cy='0' rx='1.5' ry='2.8'/%3E%3C/g%3E%3C/svg%3E")` },
    forest:{ name: '森绿', bg: 'bg-[#EEF4EC]', headerBg: 'bg-[#DCEAD5]', card: 'bg-white/90', text: 'text-[#2E3D30]', muted: 'text-[#93A894]', accent: 'bg-[#7CA982]',
             pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='240' viewBox='0 0 150 240'%3E%3Cg fill='none' stroke='%2393B18A' stroke-width='1' opacity='0.36' stroke-linecap='round'%3E%3Cpath transform='translate(20 20) rotate(-8)' d='M0 0c-2 18 2 30 4 46 1 12 0 30-1 46'/%3E%3Cpath transform='translate(22 36)' d='M-6 -2c-6-1-10 1-12 5'/%3E%3Cpath transform='translate(23 50)' d='M-7 0c-7 0-11 2-13 6'/%3E%3Cpath transform='translate(24 70)' d='M-5 -2c-5-2-9-1-11 2'/%3E%3Cpath transform='translate(90 30) rotate(12)' d='M0 0c2 18-2 30-3 46-1 12 0 30 1 46'/%3E%3Cpath transform='translate(91 50)' d='M6 -2c6 0 10 2 12 6'/%3E%3Cpath transform='translate(91 70)' d='M5 0c5 2 9 1 11 2'/%3E%3Cpath transform='translate(120 110) rotate(-15)' d='M0 0c-1 14 1 24 2 36'/%3E%3Cpath transform='translate(122 124)' d='M-5 0c-5-1-8 1-10 4'/%3E%3Cpath transform='translate(45 150) rotate(10)' d='M0 0c-1 16 1 28 2 42'/%3E%3Cpath transform='translate(47 168)' d='M-5 -2c-5-1-8 1-10 4'/%3E%3Cpath transform='translate(48 184)' d='M-5 0c-5 1-8 2-9 5'/%3E%3C/g%3E%3C/svg%3E")` },
    dusk:  { name: '暮紫', bg: 'bg-[#F1EEF6]', headerBg: 'bg-[#E0D8EF]', card: 'bg-white/90', text: 'text-[#3A3350]', muted: 'text-[#A198B8]', accent: 'bg-[#9B8FD0]',
             pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='240' viewBox='0 0 160 240'%3E%3Cg fill='%23C0A9D6' opacity='0.32'%3E%3Ccircle transform='translate(24 28) rotate(20)' cx='0' cy='0' r='3'/%3E%3Ccircle transform='translate(30 24)' cx='0' cy='0' r='1.6'/%3E%3Ccircle transform='translate(18 36)' cx='0' cy='0' r='1.2'/%3E%3Ccircle transform='translate(112 52) rotate(-30)' cx='0' cy='0' r='2.6'/%3E%3Ccircle transform='translate(118 48)' cx='0' cy='0' r='1.4'/%3E%3Ccircle transform='translate(64 86) rotate(45)' cx='0' cy='0' r='2.2'/%3E%3Ccircle transform='translate(70 82)' cx='0' cy='0' r='1.2'/%3E%3Ccircle transform='translate(38 128) rotate(-15)' cx='0' cy='0' r='2.8'/%3E%3Ccircle transform='translate(44 134)' cx='0' cy='0' r='1.5'/%3E%3Ccircle transform='translate(126 162) rotate(25)' cx='0' cy='0' r='2.4'/%3E%3Ccircle transform='translate(132 158)' cx='0' cy='0' r='1.4'/%3E%3Ccircle transform='translate(78 198) rotate(-40)' cx='0' cy='0' r='2.6'/%3E%3Ccircle transform='translate(84 204)' cx='0' cy='0' r='1.3'/%3E%3Ccircle transform='translate(22 212) rotate(10)' cx='0' cy='0' r='2.2'/%3E%3C/g%3E%3C/svg%3E")` },
    plain: { name: '素白', bg: 'bg-white', headerBg: 'bg-[#F0F0F0]', card: 'bg-white', text: 'text-[#333]', muted: 'text-[#999]', accent: 'bg-[#1F1F1F]',
             pattern: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='240' viewBox='0 0 160 240'%3E%3Cg fill='none' stroke='%23CCCCCC' stroke-width='1' opacity='0.4' stroke-linecap='round'%3E%3Cg transform='translate(20 28) rotate(15)'%3E%3Cpath d='M0 0l4 4M4 0l-4 4'/%3E%3C/g%3E%3Cg transform='translate(28 22) rotate(20)'%3E%3Cpath d='M0 0l3 3M3 0l-3 3'/%3E%3C/g%3E%3Cg transform='translate(96 40) rotate(-12)'%3E%3Cpath d='M0 0l4 4M4 0l-4 4'/%3E%3C/g%3E%3Cg transform='translate(104 34) rotate(-18)'%3E%3Cpath d='M0 0l3 3M3 0l-3 3'/%3E%3C/g%3E%3Cg transform='translate(48 82) rotate(30)'%3E%3Cpath d='M0 0l4 4M4 0l-4 4'/%3E%3C/g%3E%3Cg transform='translate(118 98) rotate(-25)'%3E%3Cpath d='M0 0l4 4M4 0l-4 4'/%3E%3C/g%3E%3Cg transform='translate(34 142) rotate(10)'%3E%3Cpath d='M0 0l3 3M3 0l-3 3'/%3E%3C/g%3E%3Cg transform='translate(124 168) rotate(-35)'%3E%3Cpath d='M0 0l4 4M4 0l-4 4'/%3E%3C/g%3E%3Cg transform='translate(56 198) rotate(18)'%3E%3Cpath d='M0 0l3 3M3 0l-3 3'/%3E%3C/g%3E%3Cg transform='translate(110 220) rotate(-8)'%3E%3Cpath d='M0 0l4 4M4 0l-4 4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` },
};

/* ---------- 主组件 ---------- */
const TechoApp: React.FC = () => {
    const { closeApp, characters, addToast, realtimeConfig, updateCharacter } = useOS();
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [settings, setSettings] = useState<TechoSettings>(() => getSettings());
    const [page, setPage] = useState<'cover' | 'day' | 'week' | 'month' | 'year' | 'habit' | 'challenge' | 'settings'>('cover');
    const [date, setDate] = useState(() => todayStr());
    const [dayData, setDayData] = useState<TechoDayData>(() => getDay(todayStr()));
    const [habits, setHabitsState] = useState<TechoHabit[]>(() => getHabits());
    const [challenges, setChallengesState] = useState<TechoChallenge[]>(() => getChallenges());
    const [dayTab, setDayTab] = useState(0);
    const [showQuickAdd, setShowQuickAdd] = useState(false);

    const theme = THEMES[settings.theme] || THEMES.warm;

    const saveSettingsAndState = (s: TechoSettings) => { saveSettings(s); setSettings(s); };
    const saveHabitsAndState = (h: TechoHabit[]) => { saveHabits(h); setHabitsState(h); };
    const saveChallengesAndState = (c: TechoChallenge[]) => { saveChallenges(c); setChallengesState(c); };

    // 切换日期时加载当天数据
    const loadDay = (d: string) => { setDate(d); setDayData(getDay(d)); };

    // 保存当前 day 数据
    const persistDay = (next: TechoDayData) => { saveDay(next.date, next); setDayData(next); };

    /* ---------- 天气（复用 Sully 的实时天气） ---------- */
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const w = await RealtimeContextManager.fetchWeather(realtimeConfig);
                if (!cancelled && w) setWeather(w);
            } catch (e) { /* 拉不到天气不阻断 */ }
        };
        load();
        return () => { cancelled = true; };
    }, [realtimeConfig.weatherEnabled, realtimeConfig.weatherCity, realtimeConfig.weatherApiKey]);

    /* ---------- 今日统计 ---------- */
    const todayStats = useMemo(() => {
        const tl = dayData.timeline;
        const td = dayData.todos;
        const total = tl.length + td.length;
        const done = tl.filter(t => t.done).length + td.filter(t => t.done).length;
        return { total, done, rate: total ? Math.round((done / total) * 100) : 0 };
    }, [dayData]);

    /* ---------- 习惯：今日待打卡 ---------- */
    const todayHabitsTodo = useMemo(
        () => habits.filter(h => !(h.checkins && h.checkins[todayStr()])),
        [habits],
    );

    /* ---------- 工具栏：主题/设置/搜索 ---------- */
    const headerRight = (
        <div className="flex items-center gap-1">
            <button onClick={() => setPage('settings')} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer" aria-label="设置">
                <GearSix className={`w-5 h-5 ${theme.muted}`} />
            </button>
        </div>
    );

    return (
        <div className={`absolute inset-0 flex flex-col ${theme.bg} ${theme.text}`} style={{ fontSize: settings.fontSize }}>
            {/* 内容区背景纹路（落叶/雨水/柳枝/花瓣/雪花，极淡） */}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: theme.pattern, backgroundSize: 'auto' }} />
            {/* 顶部导航 */}
            <header
                className={`flex items-center justify-between px-4 pt-1 pb-2 shrink-0 sticky top-0 z-20 ${theme.headerBg}`}
                style={{ paddingTop: 'calc(var(--chrome-top) + 1rem - 0.5cm)' }}
            >
                <button onClick={closeApp} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs hover:bg-black/5 transition-colors cursor-pointer" aria-label="返回">
                    <CaretLeft className="w-4 h-4" /><span>返回</span>
                </button>
                <span className="text-base font-bold tracking-wide">{settings.notebookName || '手账'}</span>
                <button onClick={() => setPage('settings')} className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 transition-colors cursor-pointer" aria-label="设置">
                    <GearSix className={`w-5 h-5 ${theme.muted}`} />
                </button>
            </header>

            {/* 内容区 */}
            <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-24">
                {page === 'cover' && (
                    <Cover
                        theme={theme}
                        settings={settings}
                        date={date}
                        todayStats={todayStats}
                        habits={habits}
                        todayHabitsTodo={todayHabitsTodo}
                        weather={weather}
                        onEnter={() => { setPage('day'); setDate(todayStr()); setDayData(getDay(todayStr())); }}
                        onSettings={() => setPage('settings')}
                    />
                )}
                {page === 'day' && (
                    <DayView
                        theme={theme}
                        date={date}
                        dayData={dayData}
                        dayTab={dayTab}
                        setDayTab={setDayTab}
                        onNav={loadDay}
                        onPersist={persistDay}
                        onHabit={habits}
                        onHabitChange={saveHabitsAndState}
                        onManageHabits={() => setPage('habit')}
                    />
                )}
                {page === 'week' && <WeekView theme={theme} date={date} habits={habits} onDayClick={loadDay} onGoDay={() => setPage('day')} />}
                {page === 'month' && <MonthView theme={theme} date={date} habits={habits} onDayClick={loadDay} onGoDay={() => setPage('day')} />}
                {page === 'year' && <YearView theme={theme} habits={habits} />}
                {page === 'habit' && (
                    <HabitView theme={theme} habits={habits} onChange={saveHabitsAndState} addToast={addToast} />
                )}
                {page === 'challenge' && (
                    <ChallengeView theme={theme} challenges={challenges} onChange={saveChallengesAndState} addToast={addToast} />
                )}
                {page === 'settings' && (
                    <SettingsView
                        theme={theme}
                        settings={settings}
                        onChange={saveSettingsAndState}
                        characters={characters}
                        updateCharacter={updateCharacter}
                        addToast={addToast}
                    />
                )}
            </div>

            {/* 底部导航（和顶栏同色） */}
            <nav
                className={`fixed inset-x-0 z-20 flex items-center justify-around px-4 ${theme.headerBg} rounded-t-2xl`}
                style={{ bottom: '0.5cm', paddingBottom: 'max(0.75rem, var(--safe-bottom, 0px))' }}
            >
                {[
                    { key: 'day', label: '今日', Icon: ClipboardText },
                    { key: 'week', label: '周', Icon: CalendarBlank },
                    { key: 'month', label: '月', Icon: SquaresFour },
                    { key: 'year', label: '年', Icon: ChartBar },
                    { key: 'challenge', label: '21天', Icon: CheckSquare },
                ].map(b => {
                    const active = page === b.key;
                    return (
                        <button
                            key={b.key}
                            onClick={() => setPage(b.key as typeof page)}
                            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors cursor-pointer ${active ? `${theme.text} font-bold` : `${theme.muted} opacity-60`}`}
                        >
                            <b.Icon size={20} weight={active ? 'fill' : 'regular'} />
                            <span className="text-[10px]">{b.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* 全局 + 快速添加 */}
            {page !== 'settings' && (
                <button
                    onClick={() => setShowQuickAdd(true)}
                    className="fixed right-4 bottom-24 z-20 h-12 w-12 rounded-full bg-[#1F1F1F] text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                    aria-label="快速添加"
                >
                    <Plus className="w-6 h-6" weight="bold" />
                </button>
            )}
            {showQuickAdd && (
                <QuickAddModal
                    theme={theme}
                    date={date}
                    dayData={dayData}
                    onPersist={persistDay}
                    onClose={() => setShowQuickAdd(false)}
                />
            )}
        </div>
    );
};

/* ---------- 封面 ---------- */
function Cover(props: {
    theme: any; settings: TechoSettings; date: string; todayStats: { total: number; done: number; rate: number };
    habits: TechoHabit[]; todayHabitsTodo: TechoHabit[]; weather: WeatherData | null;
    onEnter: () => void; onSettings: () => void;
}) {
    const { theme, settings, date, todayStats, todayHabitsTodo, weather, onEnter } = props;
    const d = new Date(date + 'T00:00:00');
    const t = theme;

    return (
        <div className="py-4">
            <div className={`rounded-3xl ${t.card} p-5 shadow-sm mb-4`}>
                <p className={`text-sm ${t.muted}`}>{greeting()}{settings.notebookName ? `，${settings.notebookName}` : ''}</p>
                <h2 className="text-2xl font-bold mt-1">{weekdayCN(d)} · {d.getMonth() + 1}月{d.getDate()}日</h2>
                {weather && (
                    <p className={`text-sm ${t.muted} mt-1`}>
                        {weatherIcon(weather.icon)} {weather.description} {weather.temp}°C
                        {settings.city ? ` · ${settings.city}` : weather.city ? ` · ${weather.city}` : ''}
                    </p>
                )}
            </div>

            {/* 今日概览 */}
            <div className={`rounded-3xl ${t.card} p-5 shadow-sm mb-4`}>
                <p className="text-xs font-semibold mb-2 text-[#8A7B6A]">今日概览</p>
                {todayStats.total === 0 ? (
                    <p className={`text-sm ${t.muted}`}>今天还没有安排</p>
                ) : todayStats.rate === 100 ? (
                    <p className="text-sm">全部完成啦 🎉</p>
                ) : (
                    <p className="text-sm">
                        今天有 <b>{todayStats.done}/{todayStats.total}</b> 项完成
                    </p>
                )}
                <div className="flex gap-3 mt-3">
                    <div className={`flex-1 rounded-xl p-3 ${t.accent} text-white`}>
                        <p className="text-[10px] opacity-80">已完成</p>
                        <p className="text-xl font-bold">{todayStats.done}/{todayStats.total}</p>
                    </div>
                    <div className="flex-1 rounded-xl p-3 bg-black/5">
                        <p className={`text-[10px] ${t.muted}`}>完成率</p>
                        <p className={`text-xl font-bold ${t.text}`}>{todayStats.rate}%</p>
                    </div>
                </div>
            </div>

            {/* 习惯 */}
            {todayHabitsTodo.length > 0 && (
                <div className={`rounded-3xl ${t.card} p-5 shadow-sm mb-4`}>
                    <p className="text-xs font-semibold mb-2 text-[#8A7B6A]">今天还有 {todayHabitsTodo.length} 个习惯没打卡</p>
                    <div className="flex flex-wrap gap-2">
                        {todayHabitsTodo.slice(0, 4).map((h, hi) => (
                            <span key={h.id} className="text-sm flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: habitColor(h, hi) }} />
                                {h.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <button
                onClick={onEnter}
                className="w-full rounded-2xl py-3 text-sm font-bold bg-[#1F1F1F] text-white shadow-md active:scale-[0.98] transition-all cursor-pointer"
            >
                进入手账
            </button>
        </div>
    );
}

/* ---------- 日视图 ---------- */
function DayView(props: {
    theme: any; date: string; dayData: TechoDayData; dayTab: number; setDayTab: (n: number) => void;
    onNav: (d: string) => void; onPersist: (d: TechoDayData) => void; onHabit: TechoHabit[];
    onHabitChange?: (h: TechoHabit[]) => void;
    onManageHabits?: () => void;
}) {
    const { theme: t, date, dayData, dayTab, setDayTab, onNav, onPersist, onHabit, onHabitChange, onManageHabits } = props;
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [editItem, setEditItem] = useState<TechoTimelineItem | null>(null);
    const [showAddHabit, setShowAddHabit] = useState(false);

    const d = new Date(date + 'T00:00:00');
    const isToday = date === todayStr();

    const addTimeline = (time: string, text: string) => {
        const item: TechoTimelineItem = { id: uid(), time, text, done: false, star: false };
        onPersist({ ...dayData, timeline: [...dayData.timeline, item] });
    };
    const editTimeline = (item: TechoTimelineItem, time: string, text: string) => {
        onPersist({ ...dayData, timeline: dayData.timeline.map(x => x.id === item.id ? { ...x, time, text } : x) });
    };
    const toggleTimeline = (id: string) => {
        onPersist({ ...dayData, timeline: dayData.timeline.map(x => x.id === id ? { ...x, done: !x.done } : x) });
    };
    const toggleTimelineStar = (id: string) => {
        onPersist({ ...dayData, timeline: dayData.timeline.map(x => x.id === id ? { ...x, star: !x.star } : x) });
    };
    const deleteTimeline = (id: string) => {
        onPersist({ ...dayData, timeline: dayData.timeline.filter(x => x.id !== id) });
    };
    const toggleTodo = (id: string) => {
        onPersist({ ...dayData, todos: dayData.todos.map(x => x.id === id ? { ...x, done: !x.done } : x) });
    };
    const toggleTodoStar = (id: string) => {
        onPersist({ ...dayData, todos: dayData.todos.map(x => x.id === id ? { ...x, star: !x.star } : x) });
    };
    const deleteTodo = (id: string) => {
        onPersist({ ...dayData, todos: dayData.todos.filter(x => x.id !== id) });
    };
    const addTodo = () => {
        const text = window.prompt('添加 Todo');
        if (text && text.trim()) {
            const item: TechoTodoItem = { id: uid(), text, done: false, star: false };
            onPersist({ ...dayData, todos: [...dayData.todos, item] });
        }
    };

    const sortedTimeline = [...dayData.timeline].sort((a, b) => a.time.localeCompare(b.time));

    return (
        <div className="py-3">
            {/* 头部 */}
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => onNav(addDays(date, -1))} className="p-2 rounded-full hover:bg-black/5 cursor-pointer" aria-label="前一天">
                    <CaretLeft className={`w-5 h-5 ${t.muted}`} />
                </button>
                <div className="text-center">
                    <p className="font-bold">{d.getMonth() + 1}月{d.getDate()}日 {weekdayCN(d)}</p>
                    {isToday && <p className={`text-[10px] ${t.muted}`}>今天</p>}
                </div>
                <button onClick={() => onNav(addDays(date, 1))} className="p-2 rounded-full hover:bg-black/5 cursor-pointer" aria-label="后一天">
                    <CaretRight className={`w-5 h-5 ${t.muted}`} />
                </button>
            </div>

            {/* Tab */}
            <div className="flex gap-1 mb-3">
                {['时间轴', 'Todo', 'habit', '碎碎念'].map((tab, i) => (
                    <button
                        key={tab}
                        onClick={() => setDayTab(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${dayTab === i ? 'bg-[#1F1F1F] text-white' : `${t.card} ${t.muted} hover:bg-black/5`}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* 时间轴 */}
            {dayTab === 0 && (
                <div>
                    {sortedTimeline.length === 0 ? (
                        <p className={`text-sm text-center ${t.muted} py-8`}>今天还没有时间轴任务</p>
                    ) : (
                        <div className="space-y-1">
                            {sortedTimeline.map(item => (
                                <div key={item.id} className={`flex items-center gap-2 p-2 rounded-xl ${t.card} ${item.done ? 'opacity-60' : ''}`}>
                                    <span className={`text-xs font-mono ${t.muted} w-10`}>{item.time}</span>
                                    <span className={`text-sm flex-1 ${item.done ? 'line-through' : ''}`}>{item.text}</span>
                                    <button onClick={() => toggleTimelineStar(item.id)} className="cursor-pointer">
                                        {item.star ? <Star weight="fill" className="w-4 h-4 text-amber-400" /> : <Star className={`w-4 h-4 ${t.muted}`} />}
                                    </button>
                                    <button onClick={() => toggleTimeline(item.id)} className="cursor-pointer">
                                        {item.done ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Circle className={`w-4 h-4 ${t.muted}`} />}
                                    </button>
                                    <button onClick={() => { setEditItem(item); setShowTimelineModal(true); }} className="cursor-pointer">
                                        <PencilSimple className={`w-4 h-4 ${t.muted}`} />
                                    </button>
                                    <button onClick={() => deleteTimeline(item.id)} className="cursor-pointer">
                                        <Trash className={`w-4 h-4 ${t.muted}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => { setEditItem(null); setShowTimelineModal(true); }}
                        className="mt-3 w-full rounded-xl py-2 text-xs font-bold border border-dashed border-black/20 hover:bg-black/5 transition-colors cursor-pointer"
                    >
                        + 添加时间轴任务
                    </button>
                </div>
            )}

            {/* Todo */}
            {dayTab === 1 && (
                <div>
                    {dayData.todos.length === 0 ? (
                        <p className={`text-sm text-center ${t.muted} py-8`}>还没有 Todo</p>
                    ) : (
                        <div className="space-y-1">
                            {dayData.todos.map(item => (
                                <div key={item.id} className={`flex items-center gap-2 p-2 rounded-xl ${t.card} ${item.done ? 'opacity-60' : ''}`}>
                                    <button onClick={() => toggleTodo(item.id)} className="cursor-pointer">
                                        {item.done ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Circle className={`w-5 h-5 ${t.muted}`} />}
                                    </button>
                                    <span className={`text-sm flex-1 ${item.done ? 'line-through' : ''}`}>{item.text}</span>
                                    {item.star && <Star weight="fill" className="w-4 h-4 text-amber-400" />}
                                    <button onClick={() => toggleTodoStar(item.id)} className="cursor-pointer">
                                        {item.star ? <Star weight="fill" className="w-4 h-4 text-amber-400" /> : <Star className={`w-4 h-4 ${t.muted}`} />}
                                    </button>
                                    <button onClick={() => deleteTodo(item.id)} className="cursor-pointer">
                                        <Trash className={`w-4 h-4 ${t.muted}`} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={addTodo}
                        className="mt-3 w-full rounded-xl py-2 text-xs font-bold border border-dashed border-black/20 hover:bg-black/5 transition-colors cursor-pointer"
                    >
                        + 添加 Todo
                    </button>
                </div>
            )}

            {/* 习惯打卡（当日） */}
            {dayTab === 2 && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <p className={`text-xs font-bold ${t.muted}`}>今日习惯</p>
                        <div className="flex items-center gap-2">
                            {onManageHabits && (
                                <button onClick={onManageHabits}
                                    className="h-7 px-3 rounded-full text-xs font-bold bg-black/5 cursor-pointer">管理</button>
                            )}
                            <button onClick={() => setShowAddHabit(true)}
                                className="h-7 px-3 rounded-full text-xs font-bold bg-[#1F1F1F] text-white cursor-pointer">+ 添加</button>
                        </div>
                    </div>
                    {onHabit.length === 0 ? (
                        <p className={`text-sm text-center ${t.muted} py-6`}>还没有习惯，点右上角添加</p>
                    ) : (
                        <div className="space-y-1">
                            {onHabit.map((h, idx) => {
                                const done = h.checkins && h.checkins[date];
                                const color = habitColor(h, idx);
                                return (
                                    <div key={h.id} className={`flex items-center gap-2 p-2 rounded-xl ${t.card}`}>
                                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">{h.name}</p>
                                            <p className={`text-[10px] ${t.muted}`}>{habitFreqText(h)}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (!onHabitChange) return;
                                                const key = date;
                                                const checkins = { ...(h.checkins || {}) };
                                                checkins[key] = checkins[key] ? 0 : 1;
                                                onHabitChange(onHabit.map(x => x.id === h.id ? { ...x, checkins } : x));
                                            }}
                                            className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer ${done ? 'text-white' : 'bg-black/5'}`}
                                            style={done ? { backgroundColor: color } : {}}
                                        >
                                            {done ? '已打卡' : '打卡'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {showAddHabit && (
                        <AddHabitModal
                            theme={t}
                            onClose={() => setShowAddHabit(false)}
                            onAdd={(name, color) => {
                                const nh: TechoHabit = {
                                    id: uid(), name, icon: '', color, frequency: 'daily',
                                    targetDays: 21, startDate: date, phase: 'growing', checkins: {},
                                };
                                if (onHabitChange) onHabitChange([...onHabit, nh]);
                                setShowAddHabit(false);
                            }}
                        />
                    )}
                </div>
            )}

            {/* 碎碎念 */}
            {dayTab === 3 && (
                <NotesPanel theme={t} date={date} notes={dayData.notes} onSave={(n) => onPersist({ ...dayData, notes: n })} />
            )}

            {showTimelineModal && (
                <TimelineModal
                    theme={t}
                    item={editItem}
                    onClose={() => setShowTimelineModal(false)}
                    onSave={(time, text) => {
                        if (editItem) editTimeline(editItem, time, text);
                        else addTimeline(time, text);
                        setShowTimelineModal(false);
                    }}
                />
            )}
        </div>
    );
}

/* ---------- 碎碎念 ---------- */
function NotesPanel(props: { theme: any; date: string; notes: string; onSave: (n: string) => void }) {
    const { theme: t, notes, onSave } = props;
    const [text, setText] = useState(notes);
    return (
        <div>
            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onBlur={() => onSave(text)}
                placeholder="随手写两句…"
                rows={6}
                className={`w-full rounded-xl p-3 text-sm ${t.card} resize-none outline-none focus:ring-2 focus:ring-black/10`}
            />
            <p className={`text-[10px] ${t.muted} mt-1`}>随手记录，无压力。自动保存。</p>
        </div>
    );
}

/* ---------- 时间轴编辑弹窗 ---------- */
function TimelineModal(props: { theme: any; item: TechoTimelineItem | null; onClose: () => void; onSave: (time: string, text: string) => void }) {
    const { theme: t, item, onClose, onSave } = props;
    const [time, setTime] = useState(item?.time || '09:00');
    const [text, setText] = useState(item?.text || '');
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-3">{item ? '编辑任务' : '添加时间轴任务'}</h3>
                <label className="text-xs text-[#666]">时间</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-3" />
                <label className="text-xs text-[#666]">内容</label>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="做什么？"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-4" />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                    <button
                        onClick={() => text.trim() && onSave(time, text.trim())}
                        className="flex-1 py-2 rounded-xl text-sm bg-[#1F1F1F] text-white cursor-pointer"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------- 周视图 ---------- */
function WeekView(props: { theme: any; date: string; habits: TechoHabit[]; onDayClick: (d: string) => void; onGoDay: () => void }) {
    const { theme: t, date, habits, onDayClick, onGoDay } = props;
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const base = parseDateWeek(date);
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base); d.setDate(base.getDate() + i); return dateStr(d);
    });
    return (
        <div className="py-3">
            <p className="font-bold mb-3">本周 · {weekKey(date)}</p>
            <div className="grid grid-cols-7 gap-1.5 mb-4">
                {days.map(d => {
                    const day = getDay(d);
                    const total = day.timeline.length + day.todos.length;
                    const done = day.timeline.filter(x => x.done).length + day.todos.filter(x => x.done).length;
                    const dd = new Date(d + 'T00:00:00');
                    const isSelected = selectedDay === d;
                    return (
                        <button
                            key={d}
                            onClick={() => { setSelectedDay(isSelected ? null : d); }}
                            className={`flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition-colors ${
                                isSelected ? 'bg-[#1F1F1F] text-white'
                                : d === todayStr() ? `${t.card} ring-2 ring-[#1F1F1F]`
                                : t.card
                            }`}
                        >
                            <span className={`text-[10px] ${isSelected ? 'text-white/70' : t.muted}`}>{weekdayCN(dd)}</span>
                            <span className="text-sm font-bold">{dd.getDate()}</span>
                            <span className={`text-[9px] ${isSelected ? 'text-white/70' : (done === total && total > 0 ? 'text-green-500' : t.muted)}`}>
                                {total ? `${done}/${total}` : '·'}
                            </span>
                        </button>
                    );
                })}
            </div>
            {selectedDay && (
                <DaySummaryPanel
                    theme={t}
                    date={selectedDay}
                    habits={habits}
                    onClose={() => setSelectedDay(null)}
                    onGoDay={() => { onDayClick(selectedDay); onGoDay(); }}
                />
            )}
        </div>
    );
}
function parseDateWeek(str: string): Date {
    const d = new Date(str + 'T00:00:00');
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // 周一起
    d.setDate(d.getDate() - day);
    return d;
}

/* ---------- 周视图当日摘要面板 ---------- */
function DaySummaryPanel(props: { theme: any; date: string; habits: TechoHabit[]; onClose: () => void; onGoDay: () => void }) {
    const { theme: t, date, habits, onClose, onGoDay } = props;
    const day = getDay(date);
    const dd = new Date(date + 'T00:00:00');
    const doneTodo = day.todos.filter(x => x.done).length;
    const doneTimeline = day.timeline.filter(x => x.done).length;
    const dayHabits = habits.filter(h => h.checkins && h.checkins[date]);
    return (
        <div className={`rounded-2xl p-4 mb-2 ${t.card}`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold">{dd.getMonth() + 1}月{dd.getDate()}日 {weekdayCN(dd)}</p>
                <div className="flex items-center gap-2">
                    <button onClick={onGoDay} className="text-[11px] px-2.5 py-1 rounded-full bg-[#1F1F1F] text-white cursor-pointer">进日视图</button>
                    <button onClick={onClose} className={`text-[11px] px-2.5 py-1 rounded-full ${t.muted} hover:bg-black/5 cursor-pointer`}>收起</button>
                </div>
            </div>
            <div className="space-y-1.5 text-xs">
                {day.timeline.length === 0 && day.todos.length === 0 && dayHabits.length === 0 && (
                    <p className={`${t.muted} py-2`}>这天没有记录</p>
                )}
                {day.timeline.slice(0, 4).map(x => (
                    <div key={x.id} className="flex items-center gap-2">
                        <span className={`font-mono ${t.muted} w-10`}>{x.time}</span>
                        <span className={`flex-1 ${x.done ? 'line-through opacity-60' : ''}`}>{x.text}</span>
                        {x.star && <span className="text-amber-400">★</span>}
                    </div>
                ))}
                {day.todos.slice(0, 4).map(x => (
                    <div key={x.id} className="flex items-center gap-2">
                        <span className={x.done ? 'text-green-500' : t.muted}>{x.done ? '☑' : '☐'}</span>
                        <span className={`flex-1 ${x.done ? 'line-through opacity-60' : ''}`}>{x.text}</span>
                    </div>
                ))}
                {dayHabits.slice(0, 4).map(h => (
                    <div key={h.id} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: habitColor(h, habits.findIndex(x => x.id === h.id)) }} />
                        <span className="flex-1">{h.name}</span>
                        <span className="text-green-500">已打卡</span>
                    </div>
                ))}
            </div>
            {(day.timeline.length + day.todos.length) > 0 && (
                <p className={`text-[10px] ${t.muted} mt-2`}>时间轴 {doneTimeline}/{day.timeline.length} · Todo {doneTodo}/{day.todos.length}</p>
            )}
        </div>
    );
}

/* ---------- 月视图 ---------- */
function MonthView(props: { theme: any; date: string; habits: TechoHabit[]; onDayClick: (d: string) => void; onGoDay: () => void }) {
    const { theme: t, date, habits, onDayClick, onGoDay } = props;
    const [base] = useState(() => new Date(date + 'T00:00:00'));
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const year = base.getFullYear();
    const month = base.getMonth();
    // 联网刷新该年节假日（自动更新；本地表兜底）
    useEffect(() => { prefetchFestivals(year); }, [year]);
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay(); // 0=周日
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: startWeekday }, () => '') as string[];
    for (let i = 1; i <= daysInMonth; i++) {
        cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    return (
        <div className="py-3">
            <p className="font-bold mb-3">{year}年{month + 1}月</p>
            <div className="grid grid-cols-7 gap-1 mb-2">
                {['日', '一', '二', '三', '四', '五', '六'].map(w => <span key={w} className={`text-center text-[10px] ${t.muted}`}>{w}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                    if (!d) return <span key={`empty-${i}`} />;
                    const day = getDay(d);
                    const total = day.timeline.length + day.todos.length;
                    const done = day.timeline.filter(x => x.done).length + day.todos.filter(x => x.done).length;
                    const hasHabit = habits.some(h => h.checkins && h.checkins[d]);
                    const fest = getDayFestival(d);
                    const dd = new Date(d + 'T00:00:00');
                    // 类型化标记并排：● 有记录完成 · ☑ 全部完成 · ✎ 有碎碎念 · ✦ 有习惯 · ★ 有星标
                    const markers: string[] = [];
                    if (day.timeline.length > 0 || day.todos.length > 0) markers.push(total > 0 && done === total ? '☑' : '●');
                    if (day.notes && day.notes.trim()) markers.push('✎');
                    if (hasHabit) markers.push('✦');
                    if (day.timeline.some(x => x.star) || day.todos.some(x => x.star)) markers.push('★');
                    const festLabel = fest && fest.names.length > 0 ? (fest.type === 'workday' ? '班' : fest.names[0]) : '';
                    const festColor = fest
                        ? (fest.type === 'workday'
                            ? (selectedDay === d || d === todayStr() ? 'text-white/80' : t.muted)
                            : (selectedDay === d || d === todayStr() ? 'text-amber-300' : 'text-red-500'))
                        : '';
                    const isSelected = selectedDay === d;
                    return (
                        <button key={d}
                            onClick={() => { setSelectedDay(isSelected ? null : d); }}
                            className={`flex flex-col items-center py-1 rounded-lg cursor-pointer transition-colors ${
                                isSelected ? 'bg-[#1F1F1F] text-white'
                                : d === todayStr() ? `${t.card} ring-2 ring-[#1F1F1F]`
                                : `${t.card} hover:bg-black/5`
                            }`}>
                            <span className="text-sm leading-none">{dd.getDate()}</span>
                            {festLabel ? (
                                <span className={`text-[7px] leading-tight truncate max-w-full ${festColor || (isSelected ? 'text-white/70' : t.muted)}`}>{festLabel}</span>
                            ) : markers.length > 0 ? (
                                <span className={`text-[7px] leading-tight flex gap-[1px] ${isSelected ? 'text-white/70' : t.muted}`}>
                                    {markers.slice(0, 3).map((m, mi) => (
                                        <span key={mi}>{m}</span>
                                    ))}
                                </span>
                            ) : (
                                <span className="text-[7px] leading-tight text-transparent">.</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {selectedDay && (
                <DaySummaryPanel
                    theme={t}
                    date={selectedDay}
                    habits={habits}
                    onClose={() => setSelectedDay(null)}
                    onGoDay={() => { onDayClick(selectedDay); onGoDay(); }}
                />
            )}
        </div>
    );
}

/* ---------- 年视图 ---------- */
/** 手动备注的统一色（生日/纪念日等特殊日子，与习惯专属色区分） */
const YEAR_NOTE_COLOR = '#D4A574';

function YearView(props: { theme: any; habits: TechoHabit[] }) {
    const { theme: t, habits } = props;
    const [year, setYear] = useState(new Date().getFullYear());
    const [yearNotes, setYearNotes] = useState<Record<string, string>>(() => getYearNotes());
    const [editingDay, setEditingDay] = useState<string | null>(null);
    const [focusedMonth, setFocusedMonth] = useState<number | null>(null); // 放大的月份（null=看整年）
    const totalChecks = habits.reduce((sum, h) => sum + Object.keys(h.checkins || {}).length, 0);
    const thisYearChecks = habits.reduce((sum, h) => sum + Object.keys(h.checkins || {}).filter(k => k.startsWith(String(year))).length, 0);
    const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    const saveNotes = (n: Record<string, string>) => { setYearNotes(n); saveYearNotes(n); };

    return (
        <div className="py-3">
            {/* 年份切换 */}
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => setYear(year - 1)} className="p-2 rounded-full hover:bg-black/5 cursor-pointer" aria-label="上一年">
                    <CaretLeft className={`w-5 h-5 ${t.muted}`} />
                </button>
                <p className="font-bold">{year}年</p>
                <button onClick={() => setYear(year + 1)} className="p-2 rounded-full hover:bg-black/5 cursor-pointer" aria-label="下一年">
                    <CaretRight className={`w-5 h-5 ${t.muted}`} />
                </button>
            </div>

            {/* 统计 */}
            <div className={`rounded-2xl ${t.card} p-4 mb-4`}>
                <p className="text-xs font-semibold mb-1">持续事项</p>
                <p className={`text-sm ${t.muted}`}>累计打卡 <b className={t.text}>{totalChecks}</b> 次 · {year}年 <b className={t.text}>{thisYearChecks}</b> 次</p>
            </div>

            {/* 整年 12 个月网格（未放大时显示） */}
            {!focusedMonth && (
            <div className="grid grid-cols-3 gap-2 mb-4">
                {MONTHS.map(m => {
                    const dims = new Date(year, m, 0).getDate();
                    const firstWeekday = new Date(year, m - 1, 1).getDay();
                    const lead = Array.from({ length: firstWeekday }, () => '' ) as string[];
                    const cells: string[] = [...lead];
                    for (let d = 1; d <= dims; d++) {
                        cells.push(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
                    }
                    return (
                        <button key={m} onClick={() => setFocusedMonth(m)}
                            className={`rounded-lg p-1.5 ${t.card} hover:bg-black/5 transition-colors cursor-pointer`}>
                            <p className={`text-[9px] font-bold mb-1 ${t.muted}`}>{m}月</p>
                            <div className="grid grid-cols-7 gap-[2px]">
                                {cells.map((d, i) => {
                                    if (d === '') return <span key={`e-${i}`} />;
                                    // 当天打了哪些习惯（专属色圆点，显示全）
                                    const habitDots = habits.map((h, idx) => (h.checkins && h.checkins[d]) ? habitColor(h, idx) : null).filter(Boolean) as string[];
                                    const hasNote = !!yearNotes[d];
                                    return (
                                        <button key={d} onClick={() => setEditingDay(d)}
                                            className="flex flex-col items-center gap-[2px] p-0.5 rounded-[3px] hover:bg-black/5 cursor-pointer">
                                            <span className="text-[8px] leading-none opacity-70">{Number(d.slice(8))}</span>
                                            <span className="flex gap-[1px] h-1.5 max-w-full flex-wrap">
                                                {habitDots.slice(0, 3).map((c, ci) => (
                                                    <span key={ci} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                                                ))}
                                                {hasNote && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: YEAR_NOTE_COLOR }} />}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </button>
                    );
                })}
            </div>
            )}

            {/* 单月放大视图（点击某个月后） */}
            {focusedMonth && (
                <MonthZoomView
                    theme={t}
                    year={year}
                    month={focusedMonth}
                    habits={habits}
                    yearNotes={yearNotes}
                    onBack={() => setFocusedMonth(null)}
                    onEditDay={(d) => setEditingDay(d)}
                />
            )}

            {/* 手动备注编辑弹层 */}
            {editingDay && (
                <YearNoteModal
                    theme={t}
                    day={editingDay}
                    initial={yearNotes[editingDay] || ''}
                    habitDots={habits.map((h, idx) => (h.checkins && h.checkins[editingDay]) ? habitColor(h, idx) : null).filter(Boolean) as string[]}
                    onSave={(text) => {
                        const next = { ...yearNotes };
                        if (text.trim()) next[editingDay] = text.trim(); else delete next[editingDay];
                        saveNotes(next);
                        setEditingDay(null);
                    }}
                    onDelete={() => {
                        const next = { ...yearNotes };
                        delete next[editingDay];
                        saveNotes(next);
                        setEditingDay(null);
                    }}
                    onClose={() => setEditingDay(null)}
                />
            )}

            {/* 每个习惯一行专属颜色的全年打卡色带（放大单月时隐藏，聚焦查看） */}
            {!focusedMonth && habits.length > 0 && (
                <div className="space-y-2 mb-2">
                    <p className={`text-xs font-bold ${t.muted}`}>全年打卡色带（{year}年）</p>
                    {habits.map((h, idx) => {
                        const color = habitColor(h, idx);
                        const days = 365;
                        return (
                            <div key={h.id} className={`rounded-2xl ${t.card} p-3`}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-xs font-bold flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                                        {h.name}
                                    </p>
                                    <span className="text-[10px]" style={{ color }}>{Object.keys(h.checkins || {}).filter(k => k.startsWith(String(year))).length} 天</span>
                                </div>
                                <div className="flex gap-[2px] h-4 overflow-hidden">
                                    {Array.from({ length: days }, (_, i) => {
                                        const d = new Date(year, 0, 1);
                                        d.setDate(d.getDate() + i);
                                        const key = dateStr(d);
                                        const on = h.checkins && h.checkins[key];
                                        return <span key={key} className="flex-1 rounded-[2px]" style={{ backgroundColor: on ? color : 'rgba(0,0,0,0.05)' }} />;
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ---------- 年视图单月放大 ---------- */
function MonthZoomView(props: { theme: any; year: number; month: number; habits: TechoHabit[]; yearNotes: Record<string, string>; onBack: () => void; onEditDay: (d: string) => void }) {
    const { theme: t, year, month, habits, yearNotes, onBack, onEditDay } = props;
    const dims = new Date(year, month, 0).getDate();
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const lead = Array.from({ length: firstWeekday }, () => '') as string[];
    const cells: string[] = [...lead];
    for (let d = 1; d <= dims; d++) {
        cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return (
        <div>
            <button onClick={onBack} className="flex items-center gap-1 mb-3 px-2 py-1 rounded-full hover:bg-black/5 cursor-pointer">
                <CaretLeft className={`w-4 h-4 ${t.muted}`} />
                <span className={`text-xs ${t.muted}`}>返回整年</span>
            </button>
            <div className={`rounded-2xl p-4 ${t.card} mb-4`}>
                <p className="font-bold mb-3 text-center">{year}年{month}月</p>
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['日', '一', '二', '三', '四', '五', '六'].map(w => <span key={w} className={`text-center text-[10px] ${t.muted}`}>{w}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {cells.map((d, i) => {
                        if (d === '') return <span key={`e-${i}`} />;
                        const habitDots = habits.map((h, idx) => (h.checkins && h.checkins[d]) ? habitColor(h, idx) : null).filter(Boolean) as string[];
                        const hasNote = !!yearNotes[d];
                        return (
                            <button key={d} onClick={() => onEditDay(d)}
                                className="flex flex-col items-center gap-1 py-1 rounded-lg hover:bg-black/5 cursor-pointer">
                                <span className="text-sm leading-none">{Number(d.slice(8))}</span>
                                <span className="flex gap-[2px] h-2 max-w-full flex-wrap">
                                    {habitDots.slice(0, 4).map((c, ci) => (
                                        <span key={ci} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                                    ))}
                                    {hasNote && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: YEAR_NOTE_COLOR }} />}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ---------- 年视图手动备注弹层 ---------- */
function YearNoteModal(props: { theme: any; day: string; initial: string; habitDots: string[]; onSave: (text: string) => void; onDelete: () => void; onClose: () => void }) {
    const { theme: t, day, initial, habitDots, onSave, onDelete, onClose } = props;
    const [text, setText] = useState(initial);
    const dd = new Date(day + 'T00:00:00');
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-1">{dd.getMonth() + 1}月{dd.getDate()}日</h3>
                {habitDots.length > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                        {habitDots.map((c, i) => <span key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />)}
                        <span className={`text-[10px] ${t.muted}`}>当天有习惯打卡</span>
                    </div>
                )}
                <input value={text} onChange={e => setText(e.target.value)} placeholder="记一下这天（如：朋友生日）"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-4" autoFocus />
                <div className="flex gap-2">
                    {initial && (
                        <button onClick={onDelete} className="px-3 py-2 rounded-xl text-sm bg-red-50 text-red-500 cursor-pointer">删除</button>
                    )}
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                    <button onClick={() => onSave(text)} className="flex-1 py-2 rounded-xl text-sm bg-[#1F1F1F] text-white cursor-pointer">保存</button>
                </div>
            </div>
        </div>
    );
}

/* ---------- 习惯打卡 ---------- */
function HabitView(props: { theme: any; habits: TechoHabit[]; onChange: (h: TechoHabit[]) => void; addToast: (m: string, type?: 'error' | 'success' | 'info') => void }) {
    const { theme: t, habits, onChange, addToast } = props;
    const [showAdd, setShowAdd] = useState(false);
    const [confirmDel, setConfirmDel] = useState<TechoHabit | null>(null);
    const toggle = (h: TechoHabit) => {
        const key = todayStr();
        const checkins = { ...(h.checkins || {}) };
        checkins[key] = checkins[key] ? 0 : 1;
        onChange(habits.map(x => x.id === h.id ? { ...x, checkins } : x));
    };
    const delHabit = (h: TechoHabit) => {
        onChange(habits.filter(x => x.id !== h.id));
        setConfirmDel(null);
        addToast(`已删除「${h.name}」`);
    };
    return (
        <div className="py-3">
            {habits.length === 0 && <p className={`text-sm text-center ${t.muted} py-8`}>还没有习惯，点右下角添加</p>}
            <div className="space-y-2">
                {habits.map((h, hi) => {
                    const key = todayStr();
                    const done = h.checkins && h.checkins[key];
                    const c = habitColor(h, hi);
                    return (
                        <div key={h.id}
                            onContextMenu={(e) => { e.preventDefault(); setConfirmDel(h); }}
                            className={`flex items-center gap-3 p-3 rounded-2xl ${t.card} cursor-pointer active:scale-[0.99] transition-transform`}>
                            <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c }} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold">{h.name}</p>
                                <p className={`text-[10px] ${t.muted}`}>{habitFreqText(h)} · {Object.keys(h.checkins || {}).length} 天</p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); toggle(h); }}
                                className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer ${done ? 'text-white' : 'bg-black/5'}`}
                                style={done ? { backgroundColor: c } : {}}
                            >
                                {done ? '已打卡' : '打卡'}
                            </button>
                        </div>
                    );
                })}
            </div>
            {showAdd && (
                <AddHabitModal
                    theme={t}
                    onClose={() => setShowAdd(false)}
                    onAdd={(name, color) => {
                        const h: TechoHabit = { id: uid(), name, icon: '', color, frequency: { type: 'daily' }, startDate: todayStr(), phase: 'growing', checkins: {} };
                        onChange([...habits, h]);
                        setShowAdd(false);
                        addToast('习惯已添加');
                    }}
                />
            )}
            <button onClick={() => setShowAdd(true)}
                className="mt-4 w-full rounded-xl py-2 text-xs font-bold border border-dashed border-black/20 hover:bg-black/5 cursor-pointer">
                + 添加新习惯
            </button>
            <p className={`text-[10px] text-center mt-2 ${t.muted}`}>长按习惯可删除</p>

            {confirmDel && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
                    <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-bold mb-2">删除习惯</h3>
                        <p className={`text-xs ${t.muted} mb-1`}>「{confirmDel.name}」的 {Object.keys(confirmDel.checkins || {}).length} 天打卡记录会一起被清除，此操作不可撤销。</p>
                        <p className="text-xs text-red-500 mb-4">确定要删除吗？</p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmDel(null)} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                            <button onClick={() => delHabit(confirmDel)} className="flex-1 py-2 rounded-xl text-sm bg-red-500 text-white cursor-pointer">删除</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
function habitFreqText(h: TechoHabit): string {
    if (h.frequency.type === 'daily') return '每日';
    if (h.frequency.type === 'weekly_count') return `每周 ${h.frequency.count} 次`;
    return `每周固定日`;
}
function AddHabitModal(props: { theme: any; onClose: () => void; onAdd: (name: string, color: string) => void }) {
    const { theme: t, onClose, onAdd } = props;
    const [name, setName] = useState('');
    const [color, setColor] = useState('#4ADE80');
    const COLORS = ['#D9A0A0', '#E8B98A', '#E8C992', '#A8C99E', '#9FC9BD', '#9BC2CD', '#9CB1D1', '#B0A2C9', '#C9A2C5', '#D1A0B5'];
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-3">添加习惯</h3>
                <label className="text-xs text-[#666]">颜色（会显示在年视图）</label>
                <div className="flex flex-wrap gap-2 mb-4">
                    {COLORS.map(cc => (
                        <button key={cc} onClick={() => setColor(cc)}
                            className="h-8 w-8 rounded-full cursor-pointer"
                            style={{ backgroundColor: cc, outline: color === cc ? '2px solid #1F1F1F' : 'none', outlineOffset: 2 }} />
                    ))}
                </div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="习惯名称（如：读书）"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-4" />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                    <button onClick={() => name.trim() && onAdd(name.trim(), color)}
                        className="flex-1 py-2 rounded-xl text-sm bg-[#1F1F1F] text-white cursor-pointer">添加</button>
                </div>
            </div>
        </div>
    );
}

/* ---------- 21 天挑战 ---------- */
function ChallengeView(props: { theme: any; challenges: TechoChallenge[]; onChange: (c: TechoChallenge[]) => void; addToast: (m: string, type?: 'error' | 'success' | 'info') => void }) {
    const { theme: t, challenges, onChange, addToast } = props;
    const [showAdd, setShowAdd] = useState(false);

    // 从 startDate 起是否每天连续打卡（含今天）。用于判定「连续 21 天」是否成功/是否断签。
    const streakTo = (c: TechoChallenge, upTo: string): number => {
        // 从 startDate 数到 upTo，连续每天都有打卡才累计，断一天即停
        let count = 0;
        const d = new Date(parseDate(c.startDate));
        const end = parseDate(upTo);
        while (d.getTime() <= end.getTime()) {
            if (c.checkins && c.checkins[dateStr(d)]) count++;
            else break; // 断签
            d.setDate(d.getDate() + 1);
        }
        return count;
    };

    // 挂载时把「进行中但已断签」的挑战固化为 failed（归档）
    useEffect(() => {
        const key = todayStr();
        let dirty = false;
        const next = challenges.map(c => {
            if (c.status !== 'active') return c;
            if (Object.keys(c.checkins || {}).length === 0) return c;
            // 从 startDate 到今天连续没断 → 正常；断了（昨天没打）→ 失效
            const todayDone = !!(c.checkins && c.checkins[key]);
            const streak = streakTo(c, todayDone ? key : addDays(key, -1));
            const expectedDays = Math.round((parseDate(key).getTime() - parseDate(c.startDate).getTime()) / 86400000) + 1;
            // 若应连续的天数与实际连续天数不符，说明中间断签了
            if (streak < expectedDays) { dirty = true; return { ...c, status: 'failed' as const, failDate: key }; }
            return c;
        });
        if (dirty) onChange(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 打卡（连续逻辑：今天打上后，若从 startDate 到今天连续满 targetDays 即完成）
    const check = (c: TechoChallenge) => {
        const key = todayStr();
        const checkins = { ...(c.checkins || {}) };
        if (checkins[key]) { addToast('今天已打卡'); return; }
        checkins[key] = 1;
        const streak = streakTo({ ...c, checkins }, key);
        if (streak >= c.targetDays) {
            onChange(challenges.map(x => x.id === c.id ? { ...c, checkins, status: 'done', doneDate: key } : x));
            addToast(`🎉 连续 ${streak} 天，完成挑战「${c.name}」！`, 'success');
        } else {
            onChange(challenges.map(x => x.id === c.id ? { ...c, checkins } : x));
            addToast(`打卡成功，已连续 ${streak} 天`);
        }
    };
    // 撤销今天打卡
    const uncheck = (c: TechoChallenge) => {
        const key = todayStr();
        const checkins = { ...(c.checkins || {}) };
        if (!checkins[key]) return;
        delete checkins[key];
        onChange(challenges.map(x => x.id === c.id ? { ...x, checkins } : x));
    };
    // 判定失效：进行中但打卡不连续（从 startDate 起断了）
    const isFailed = (c: TechoChallenge): boolean => {
        if (c.status !== 'active') return false;
        if (Object.keys(c.checkins || {}).length === 0) return false;
        const key = todayStr();
        const todayDone = !!(c.checkins && c.checkins[key]);
        const streak = streakTo(c, todayDone ? key : addDays(key, -1));
        const expectedDays = Math.round((parseDate(key).getTime() - parseDate(c.startDate).getTime()) / 86400000) + 1;
        return streak < expectedDays;
    };

    const active = challenges.filter(c => c.status === 'active' && !isFailed(c));
    const failed = challenges.filter(c => c.status === 'failed' || (c.status === 'active' && isFailed(c)));
    const done = challenges.filter(c => c.status === 'done');

    const renderCard = (c: TechoChallenge) => {
        const doneDays = Object.keys(c.checkins || {}).length;
        const pct = Math.min(100, Math.round(doneDays / c.targetDays * 100));
        const todayDone = !!(c.checkins && c.checkins[todayStr()]);
        return (
            <div key={c.id} className={`rounded-2xl ${t.card} p-4 mb-2`}>
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                        <p className="text-sm font-bold">{c.name}</p>
                        <p className={`text-[10px] ${t.muted}`}>第 {doneDays}/{c.targetDays} 天 · 已坚持 {doneDays} 天</p>
                    </div>
                    {c.status === 'active' && (
                        todayDone ? (
                            <button onClick={() => uncheck(c)} className="h-8 px-3 rounded-full text-xs font-bold bg-black/5 cursor-pointer">撤销</button>
                        ) : (
                            <button onClick={() => check(c)} className="h-8 px-3 rounded-full text-xs font-bold text-white cursor-pointer" style={{ backgroundColor: c.color }}>今日打卡</button>
                        )
                    )}
                    {c.status === 'done' && <span className="text-xs font-bold text-green-500">✅ 已完成</span>}
                    {c.status === 'failed' && <span className="text-xs font-bold text-red-400">已失效</span>}
                </div>
                {/* 进度条 */}
                <div className="h-2 rounded-full bg-black/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                </div>
            </div>
        );
    };

    return (
        <div className="py-3">
            <div className="flex items-center justify-between mb-3">
                <p className="font-bold">21 天挑战</p>
                <button onClick={() => setShowAdd(true)} className="h-8 px-3 rounded-full text-xs font-bold bg-[#1F1F1F] text-white cursor-pointer">+ 新挑战</button>
            </div>

            {active.length === 0 && done.length === 0 && failed.length === 0 && (
                <p className={`text-sm text-center ${t.muted} py-8`}>还没有挑战，点右上角新建</p>
            )}

            {active.length > 0 && (
                <>
                    <p className={`text-xs font-bold ${t.muted} mb-1.5`}>进行中</p>
                    {active.map(renderCard)}
                </>
            )}

            {failed.length > 0 && (
                <>
                    <p className={`text-xs font-bold ${t.muted} mb-1.5 mt-3`}>已失效</p>
                    {failed.map(c => {
                        const failedC = { ...c, status: 'failed' as const, failDate: todayStr() };
                        return renderCard(failedC);
                    })}
                </>
            )}

            {done.length > 0 && (
                <>
                    <p className={`text-xs font-bold ${t.muted} mb-1.5 mt-3`}>已完成</p>
                    {done.map(renderCard)}
                </>
            )}

            {showAdd && (
                <AddChallengeModal
                    theme={t}
                    onClose={() => setShowAdd(false)}
                    onAdd={(name, color) => {
                        const c: TechoChallenge = {
                            id: uid(), name, icon: '', color, startDate: todayStr(),
                            targetDays: 21, checkins: {}, status: 'active',
                        };
                        onChange([...challenges, c]);
                        setShowAdd(false);
                        addToast('挑战已创建，今天开始打卡！', 'success');
                    }}
                />
            )}
        </div>
    );
}

function AddChallengeModal(props: { theme: any; onClose: () => void; onAdd: (name: string, color: string) => void }) {
    const { theme: t, onClose, onAdd } = props;
    const [name, setName] = useState('');
    const [color, setColor] = useState('#D9A0A0');
    const COLORS = ['#D9A0A0', '#E8B98A', '#E8C992', '#A8C99E', '#9FC9BD', '#9BC2CD', '#9CB1D1', '#B0A2C9', '#C9A2C5', '#D1A0B5'];
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-3">新建 21 天挑战</h3>
                <label className="text-xs text-[#666]">颜色</label>
                <div className="flex flex-wrap gap-2 mb-4">
                    {COLORS.map(cc => (
                        <button key={cc} onClick={() => setColor(cc)}
                            className="h-8 w-8 rounded-full cursor-pointer"
                            style={{ backgroundColor: cc, outline: color === cc ? '2px solid #1F1F1F' : 'none', outlineOffset: 2 }} />
                    ))}
                </div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="挑战名称（如：早睡 21 天）"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-4" />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                    <button onClick={() => name.trim() && onAdd(name.trim(), color)}
                        className="flex-1 py-2 rounded-xl text-sm bg-[#1F1F1F] text-white cursor-pointer">创建</button>
                </div>
            </div>
        </div>
    );
}

/* ---------- 快速添加 ---------- */
function QuickAddModal(props: { theme: any; date: string; dayData: TechoDayData; onPersist: (d: TechoDayData) => void; onClose: () => void }) {
    const { theme: t, date, dayData, onPersist, onClose } = props;
    const [type, setType] = useState<'timeline' | 'todo'>('todo');
    const [time, setTime] = useState('09:00');
    const [text, setText] = useState('');
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-3">快速添加 · {date}</h3>
                <div className="flex gap-2 mb-3">
                    <button onClick={() => setType('todo')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${type === 'todo' ? 'bg-[#1F1F1F] text-white' : 'bg-black/5'}`}>Todo</button>
                    <button onClick={() => setType('timeline')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${type === 'timeline' ? 'bg-[#1F1F1F] text-white' : 'bg-black/5'}`}>时间轴</button>
                </div>
                {type === 'timeline' && (
                    <input type="time" value={time} onChange={e => setTime(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-3" />
                )}
                <input value={text} onChange={e => setText(e.target.value)} placeholder="记点什么…"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-4" />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                    <button onClick={() => {
                        if (!text.trim()) return;
                        if (type === 'todo') {
                            onPersist({ ...dayData, todos: [...dayData.todos, { id: uid(), text, done: false, star: false }] });
                        } else {
                            onPersist({ ...dayData, timeline: [...dayData.timeline, { id: uid(), time, text, done: false, star: false }] });
                        }
                        onClose();
                    }} className="flex-1 py-2 rounded-xl text-sm bg-[#1F1F1F] text-white cursor-pointer">保存</button>
                </div>
            </div>
        </div>
    );
}

/* ---------- 设置 ---------- */
function SettingsView(props: { theme: any; settings: TechoSettings; onChange: (s: TechoSettings) => void; characters: CharacterProfile[]; updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void; addToast: (m: string, type?: 'error' | 'success' | 'info') => void }) {
    const { theme: t, settings, onChange, characters, updateCharacter, addToast } = props;
    const set = (patch: Partial<TechoSettings>) => onChange({ ...settings, ...patch });

    return (
        <div className="py-3 space-y-4">
            {/* 外观：主题 */}
            <Section title="主题" theme={t}>
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(THEMES).map(([id, th]) => (
                        <button key={id} onClick={() => set({ theme: id })}
                            className={`px-3 py-1 rounded-full text-xs cursor-pointer ${settings.theme === id ? 'bg-[#1F1F1F] text-white' : 'bg-black/5'}`}>
                            {th.name}
                        </button>
                    ))}
                </div>
            </Section>

            {/* 手账名 + 字号 */}
            <Section title="手账" theme={t}>
                <input value={settings.notebookName} onChange={e => set({ notebookName: e.target.value })}
                    placeholder="给手账起个名字" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
                <div className="flex items-center justify-between mt-3">
                    <span className="text-sm">字号</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => set({ fontSize: Math.max(12, settings.fontSize - 1) })}
                            className="w-7 h-7 rounded-full bg-black/5 text-sm cursor-pointer">-</button>
                        <span className="text-sm w-6 text-center">{settings.fontSize}</span>
                        <button onClick={() => set({ fontSize: Math.min(22, settings.fontSize + 1) })}
                            className="w-7 h-7 rounded-full bg-black/5 text-sm cursor-pointer">+</button>
                    </div>
                </div>
            </Section>

            {/* 城市（天气用） */}
            <Section title="城市（用于天气）" theme={t}>
                <input value={settings.city} onChange={e => set({ city: e.target.value })}
                    placeholder="例如：北京 / Shanghai" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
                <p className={`text-[10px] ${t.muted} mt-2`}>接入高德/和风天气后会自动拉取；当前为占位</p>
            </Section>

            {/* 角色感知：哪些角色能感知手账 */}
            <Section title="角色感知（白名单）" theme={t}>
                <p className={`text-[10px] ${t.muted} mb-3`}>勾选后，这些角色能基于你的日程/习惯/碎碎念说话（头像取自角色档案，换头像后自动更新）</p>
                {characters.length === 0 ? (
                    <p className={`text-[10px] ${t.muted}`}>还没有角色</p>
                ) : (
                    <div className="space-y-1.5">
                        {characters.map(c => {
                            const on = c.journalSensingEnabled === true;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => updateCharacter(c.id, { journalSensingEnabled: !on })}
                                    className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${on ? 'border-[#1F1F1F] bg-black/5' : 'border-black/10 bg-white/40 hover:bg-black/5'}`}
                                >
                                    <CharAvatar avatar={c.avatar} name={c.name} size={40} />
                                    <span className="flex-1 text-left text-sm font-semibold truncate">{c.name}</span>
                                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${on ? 'border-[#1F1F1F] bg-[#1F1F1F] text-white text-xs' : 'border-black/20'}`}>
                                        {on && '✓'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </Section>

            {/* 数据 */}
            <Section title="数据管理" theme={t}>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={async () => {
                        const data = exportJsonSafe(true);
                        try { await navigator.clipboard.writeText(data); addToast('已复制手账 JSON（含生理期）', 'success'); }
                        catch { addToast('复制失败', 'error'); }
                    }} className="flex-1 min-w-[110px] py-2 rounded-xl text-xs bg-black/5 cursor-pointer">复制导出</button>
                    <button onClick={async () => {
                        const data = exportJsonSafe(false);
                        try { await navigator.clipboard.writeText(data); addToast('已复制（已去除生理期）', 'success'); }
                        catch { addToast('复制失败', 'error'); }
                    }} className="flex-1 min-w-[110px] py-2 rounded-xl text-xs bg-black/5 cursor-pointer">导出（隐生理期）</button>
                    <button onClick={() => {
                        const raw = window.prompt('粘贴手账 JSON 导入');
                        if (raw) {
                            try { importJsonSafe(raw); addToast('导入成功', 'success'); }
                            catch { addToast('导入失败：JSON 格式错误', 'error'); }
                        }
                    }} className="flex-1 min-w-[110px] py-2 rounded-xl text-xs bg-black/5 cursor-pointer">导入</button>
                    <button onClick={() => {
                        if (window.confirm('确定清空所有手账数据？此操作不可恢复。')) {
                            try { clearAllTecho(); addToast('已清空手账数据', 'success'); }
                            catch { addToast('清空失败', 'error'); }
                        }
                    }} className="flex-1 min-w-[110px] py-2 rounded-xl text-xs bg-red-50 text-red-500 cursor-pointer">清除所有数据</button>
                </div>
            </Section>
        </div>
    );
}

function Section(props: { title: string; theme: any; children: React.ReactNode }) {
    return (
        <div className={`rounded-2xl ${props.theme.card} p-4`}>
            <p className="text-xs font-semibold mb-2">{props.title}</p>
            {props.children}
        </div>
    );
}

/** 角色头像：URL/data:image 显示图片，其他当作 emoji 文字。 */
function CharAvatar(props: { avatar: string; name: string; size?: number }) {
    const { avatar, name, size = 40 } = props;
    const isUrl = avatar && (avatar.startsWith('http') || avatar.startsWith('data:image'));
    return (
        <span
            className="rounded-full overflow-hidden bg-black/10 flex items-center justify-center shrink-0"
            style={{ width: size, height: size }}
            aria-label={name}
        >
            {isUrl ? (
                <img src={avatar} alt={name} className="w-full h-full object-cover" />
            ) : (
                <span style={{ fontSize: Math.round(size * 0.55) }}>{avatar || '👤'}</span>
            )}
        </span>
    );
}

// 工具函数：避免顶部循环依赖（简单实现）
function exportJsonSafe(includePeriod: boolean): string {
    const out: Record<string, unknown> = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('techo_')) {
                const key = k.substring('techo_'.length);
                let val: unknown = JSON.parse(localStorage.getItem(k) || 'null');
                // 隐生理期
                if (!includePeriod && key.startsWith('month_') && val && typeof val === 'object' && 'period' in (val as object)) {
                    val = { ...(val as Record<string, unknown>), period: null };
                }
                out[key] = val;
            }
        }
    } catch (e) { /* ignore */ }
    return JSON.stringify(out, null, 2);
}
function importJsonSafe(raw: string): void {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) throw new Error('invalid');
    Object.entries(data).forEach(([k, v]) => localStorage.setItem('techo_' + k, JSON.stringify(v)));
}
function clearAllTecho(): void {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('techo_')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
}

export default TechoApp;
