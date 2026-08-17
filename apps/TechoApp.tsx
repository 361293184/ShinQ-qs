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
import { TechoDayData, TechoHabit, TechoSettings, TechoTodoItem, TechoTimelineItem, CharacterProfile } from '../types';
import { RealtimeContextManager, WeatherData } from '../utils/realtimeContext';
import { getDayFestival, prefetchFestivals } from '../utils/calendarFestivals';
import {
    todayStr, dateStr, addDays, weekKey, greeting, weekdayCN, uid,
    weatherIcon, getDay, saveDay, getHabits, saveHabits, getSettings, saveSettings,
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
    const [page, setPage] = useState<'cover' | 'day' | 'week' | 'month' | 'year' | 'habit' | 'settings'>('cover');
    const [date, setDate] = useState(() => todayStr());
    const [dayData, setDayData] = useState<TechoDayData>(() => getDay(todayStr()));
    const [habits, setHabitsState] = useState<TechoHabit[]>(() => getHabits());
    const [dayTab, setDayTab] = useState(0);
    const [showQuickAdd, setShowQuickAdd] = useState(false);

    const theme = THEMES[settings.theme] || THEMES.warm;

    const saveSettingsAndState = (s: TechoSettings) => { saveSettings(s); setSettings(s); };
    const saveHabitsAndState = (h: TechoHabit[]) => { saveHabits(h); setHabitsState(h); };

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
                        onHabit={todayHabitsTodo}
                    />
                )}
                {page === 'week' && <WeekView theme={theme} date={date} onDayClick={loadDay} onGoDay={() => setPage('day')} />}
                {page === 'month' && <MonthView theme={theme} date={date} habits={habits} onDayClick={loadDay} />}
                {page === 'year' && <YearView theme={theme} habits={habits} />}
                {page === 'habit' && (
                    <HabitView theme={theme} habits={habits} onChange={saveHabitsAndState} addToast={addToast} />
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
                    { key: 'habit', label: '习惯', Icon: CheckSquare },
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
                        {todayHabitsTodo.slice(0, 4).map(h => (
                            <span key={h.id} className="text-sm">{h.icon} {h.name}</span>
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
}) {
    const { theme: t, date, dayData, dayTab, setDayTab, onNav, onPersist } = props;
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [editItem, setEditItem] = useState<TechoTimelineItem | null>(null);

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
                {['时间轴', 'Todo', '碎碎念'].map((tab, i) => (
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

            {/* 碎碎念 */}
            {dayTab === 2 && (
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
function WeekView(props: { theme: any; date: string; onDayClick: (d: string) => void; onGoDay: () => void }) {
    const { theme: t, date, onDayClick, onGoDay } = props;
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
                    return (
                        <button
                            key={d}
                            onClick={() => { onDayClick(d); onGoDay(); }}
                            className={`flex flex-col items-center p-1.5 rounded-xl ${t.card} cursor-pointer ${d === todayStr() ? 'ring-2 ring-[#1F1F1F]' : ''}`}
                        >
                            <span className={`text-[10px] ${t.muted}`}>{weekdayCN(dd)}</span>
                            <span className="text-sm font-bold">{dd.getDate()}</span>
                            <span className={`text-[9px] ${total ? (done === total ? 'text-green-500' : t.muted) : t.muted}`}>
                                {total ? `${done}/${total}` : '·'}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
function parseDateWeek(str: string): Date {
    const d = new Date(str + 'T00:00:00');
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // 周一起
    d.setDate(d.getDate() - day);
    return d;
}

/* ---------- 月视图 ---------- */
function MonthView(props: { theme: any; date: string; habits: TechoHabit[]; onDayClick: (d: string) => void }) {
    const { theme: t, date, habits, onDayClick } = props;
    const [base] = useState(() => new Date(date + 'T00:00:00'));
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
                    // 节日/补班标记（格子空间有限，只显示首名）
                    const festLabel = fest && fest.names.length > 0 ? (fest.type === 'workday' ? '班' : fest.names[0]) : '';
                    const festColor = fest
                        ? (fest.type === 'workday'
                            ? (d === todayStr() ? 'text-white/80' : t.muted)
                            : (d === todayStr() ? 'text-amber-300' : 'text-red-500'))
                        : '';
                    return (
                        <button key={d} onClick={() => onDayClick(d)}
                            className={`flex flex-col items-center py-1 rounded-lg cursor-pointer ${d === todayStr() ? 'bg-[#1F1F1F] text-white' : t.card} ${d !== todayStr() ? 'hover:bg-black/5' : ''}`}>
                            <span className="text-sm leading-none">{dd.getDate()}</span>
                            <span className={`text-[7px] leading-tight truncate max-w-full ${festColor || (hasHabit ? '' : t.muted)}`}>
                                {festLabel || (total > 0 ? (done === total ? '✓' : total ? '·' : '') : hasHabit ? '✦' : '')}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ---------- 年视图 ---------- */
function YearView(props: { theme: any; habits: TechoHabit[] }) {
    const { theme: t, habits } = props;
    const year = new Date().getFullYear();
    const totalChecks = habits.reduce((sum, h) => sum + Object.keys(h.checkins || {}).length, 0);
    return (
        <div className="py-3">
            <p className="font-bold mb-1">{year}年</p>
            <div className={`rounded-2xl ${t.card} p-4 mb-4`}>
                <p className="text-xs font-semibold mb-1">持续事项</p>
                <p className={`text-sm ${t.muted}`}>已累计打卡 <b className={t.text}>{totalChecks}</b> 次</p>
            </div>
            {habits.map(h => (
                <div key={h.id} className={`rounded-2xl ${t.card} p-4 mb-2`}>
                    <p className="text-sm">{h.icon} {h.name} · 本年 {Object.keys(h.checkins || {}).length} 天</p>
                </div>
            ))}
        </div>
    );
}

/* ---------- 习惯打卡 ---------- */
function HabitView(props: { theme: any; habits: TechoHabit[]; onChange: (h: TechoHabit[]) => void; addToast: (m: string, type?: 'error' | 'success' | 'info') => void }) {
    const { theme: t, habits, onChange, addToast } = props;
    const [showAdd, setShowAdd] = useState(false);
    const toggle = (h: TechoHabit) => {
        const key = todayStr();
        const checkins = { ...(h.checkins || {}) };
        checkins[key] = checkins[key] ? 0 : 1;
        onChange(habits.map(x => x.id === h.id ? { ...x, checkins } : x));
    };
    return (
        <div className="py-3">
            {habits.length === 0 && <p className={`text-sm text-center ${t.muted} py-8`}>还没有习惯，点右下角添加</p>}
            <div className="space-y-2">
                {habits.map(h => {
                    const key = todayStr();
                    const done = h.checkins && h.checkins[key];
                    return (
                        <div key={h.id} className={`flex items-center gap-3 p-3 rounded-2xl ${t.card}`}>
                            <span className="text-xl">{h.icon}</span>
                            <div className="flex-1">
                                <p className="text-sm font-bold">{h.name}</p>
                                <p className={`text-[10px] ${t.muted}`}>{habitFreqText(h)}</p>
                            </div>
                            <button
                                onClick={() => toggle(h)}
                                className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer ${done ? 'bg-green-500 text-white' : 'bg-black/5'}`}
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
                    onAdd={(name, icon) => {
                        const h: TechoHabit = { id: uid(), name, icon, frequency: { type: 'daily' }, startDate: todayStr(), phase: 'growing', checkins: {} };
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
        </div>
    );
}
function habitFreqText(h: TechoHabit): string {
    if (h.frequency.type === 'daily') return '每日';
    if (h.frequency.type === 'weekly_count') return `每周 ${h.frequency.count} 次`;
    return `每周固定日`;
}
function AddHabitModal(props: { theme: any; onClose: () => void; onAdd: (name: string, icon: string) => void }) {
    const { theme: t, onClose, onAdd } = props;
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('✅');
    const ICONS = ['✅', '💃', '📖', '🧘', '🏃', '💧', '🍎', '😴', '✍️', '🎸'];
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className={`w-full max-w-sm rounded-2xl p-5 ${t.card} shadow-xl`} onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-3">添加习惯</h3>
                <label className="text-xs text-[#666]">图标</label>
                <div className="flex flex-wrap gap-1 mb-3">
                    {ICONS.map(ic => (
                        <button key={ic} onClick={() => setIcon(ic)}
                            className={`h-8 w-8 rounded-lg text-lg cursor-pointer ${icon === ic ? 'bg-black/10' : 'hover:bg-black/5'}`}>{ic}</button>
                    ))}
                </div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="习惯名称（如：读书）"
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm mb-4" />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-black/5 cursor-pointer">取消</button>
                    <button onClick={() => name.trim() && onAdd(name.trim(), icon)}
                        className="flex-1 py-2 rounded-xl text-sm bg-[#1F1F1F] text-white cursor-pointer">添加</button>
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
