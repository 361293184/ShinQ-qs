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
import { TechoDayData, TechoHabit, TechoSettings, TechoTodoItem, TechoTimelineItem } from '../types';
import {
    todayStr, dateStr, addDays, weekKey, greeting, weekdayCN, uid,
    weatherIcon, getDay, saveDay, getHabits, saveHabits, getSettings, saveSettings,
} from '../utils/techoStore';
import {
    GearSix, CaretLeft, CaretRight,
    Star, PencilSimple, Trash, Plus, CheckCircle, Circle,
    ClipboardText, CalendarBlank, SquaresFour, ChartBar, CheckSquare,
} from '@phosphor-icons/react';

/* ---------- 主题配色 ---------- */
const THEMES: Record<string, { name: string; bg: string; card: string; text: string; muted: string; accent: string }> = {
    warm:  { name: '暖纸', bg: 'bg-[#FDF6EC]', card: 'bg-white/90', text: 'text-[#3A3229]', muted: 'text-[#9A8B7A]', accent: 'bg-[#E8A87C]' },
    calm:  { name: '青蓝', bg: 'bg-[#EEF4F8]', card: 'bg-white/90', text: 'text-[#2F3E4E]', muted: 'text-[#8FA2B4]', accent: 'bg-[#6C9BD1]' },
    forest:{ name: '森绿', bg: 'bg-[#EEF4EC]', card: 'bg-white/90', text: 'text-[#2E3D30]', muted: 'text-[#93A894]', accent: 'bg-[#7CA982]' },
    dusk:  { name: '暮紫', bg: 'bg-[#F1EEF6]', card: 'bg-white/90', text: 'text-[#3A3350]', muted: 'text-[#A198B8]', accent: 'bg-[#9B8FD0]' },
    plain: { name: '素白', bg: 'bg-white', card: 'bg-white', text: 'text-[#333]', muted: 'text-[#999]', accent: 'bg-[#1F1F1F]' },
};

/* ---------- 主组件 ---------- */
const TechoApp: React.FC = () => {
    const { closeApp, characters, addToast } = useOS();
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
        <div className={`fixed inset-0 flex flex-col ${theme.bg} ${theme.text}`} style={{ fontSize: settings.fontSize }}>
            {/* 顶部导航 */}
            <header
                className="flex items-center justify-between px-4 pt-1 pb-2 shrink-0"
                style={{ paddingTop: 'calc(var(--chrome-top) + 1rem)' }}
            >
                <button onClick={closeApp} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs hover:bg-black/5 transition-colors cursor-pointer" aria-label="返回">
                    <CaretLeft className="w-4 h-4" /><span>返回</span>
                </button>
                <span className="text-sm font-bold tracking-wide">{settings.notebookName || '手账'}</span>
                <button onClick={() => setPage('settings')} className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 transition-colors cursor-pointer" aria-label="设置">
                    <GearSix className={`w-5 h-5 ${theme.muted}`} />
                </button>
            </header>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-4 pb-24">
                {page === 'cover' && (
                    <Cover
                        theme={theme}
                        settings={settings}
                        date={date}
                        todayStats={todayStats}
                        habits={habits}
                        todayHabitsTodo={todayHabitsTodo}
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
                        addToast={addToast}
                    />
                )}
            </div>

            {/* 底部导航 */}
            <nav
                className="fixed bottom-0 inset-x-0 z-10 flex items-center justify-around px-4"
                style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom, 0px))', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}
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
                            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors cursor-pointer ${active ? 'text-[#1F1F1F] font-bold' : 'text-[#9A9A9A]'}`}
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
    habits: TechoHabit[]; todayHabitsTodo: TechoHabit[]; onEnter: () => void; onSettings: () => void;
}) {
    const { theme, settings, date, todayStats, todayHabitsTodo, onEnter } = props;
    const d = new Date(date + 'T00:00:00');
    const weather = { text: '', temp: '' };
    const t = theme;

    return (
        <div className="py-4">
            <div className={`rounded-3xl ${t.card} p-5 shadow-sm mb-4`}>
                <p className={`text-sm ${t.muted}`}>{greeting()}{settings.notebookName ? `，${settings.notebookName}` : ''}</p>
                <h2 className="text-2xl font-bold mt-1">{weekdayCN(d)} · {d.getMonth() + 1}月{d.getDate()}日</h2>
                {weather.text && (
                    <p className={`text-sm ${t.muted} mt-1`}>{weatherIcon(1)} {weather.text}{settings.city ? ` · ${settings.city}` : ''}</p>
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
                    const dd = new Date(d + 'T00:00:00');
                    return (
                        <button key={d} onClick={() => onDayClick(d)}
                            className={`flex flex-col items-center py-1 rounded-lg cursor-pointer ${d === todayStr() ? 'bg-[#1F1F1F] text-white' : t.card} ${d !== todayStr() ? 'hover:bg-black/5' : ''}`}>
                            <span className="text-sm">{dd.getDate()}</span>
                            {total > 0 && (
                                <span className={`text-[8px] ${d === todayStr() ? 'text-white/80' : done === total ? 'text-green-500' : t.muted}`}>
                                    {done === total ? '●' : total ? '◐' : ''}
                                </span>
                            )}
                            {hasHabit && <span className="text-[8px]">✅</span>}
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
function SettingsView(props: { theme: any; settings: TechoSettings; onChange: (s: TechoSettings) => void; characters: { id: string; name: string }[]; addToast: (m: string, type?: 'error' | 'success' | 'info') => void }) {
    const { theme: t, settings, onChange, characters, addToast } = props;
    const set = (patch: Partial<TechoSettings>) => onChange({ ...settings, ...patch });
    const setNode = (key: keyof TechoSettings['nodeSwitches'], val: boolean) =>
        set({ nodeSwitches: { ...settings.nodeSwitches, [key]: val } });

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
                            const on = settings.charWhitelist.includes(c.id);
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => set({ charWhitelist: on ? settings.charWhitelist.filter(x => x !== c.id) : [...settings.charWhitelist, c.id] })}
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

            {/* 说话：频率 + 语气 */}
            <Section title="说话风格" theme={t}>
                <p className={`text-[10px] ${t.muted} mb-2`}>频率</p>
                <div className="flex gap-1.5 mb-3">
                    {([['high', '频繁'], ['medium', '适中'], ['low', '偶尔']] as const).map(([v, label]) => (
                        <button key={v} onClick={() => set({ characterFrequency: v })}
                            className={`flex-1 py-1.5 rounded-full text-xs cursor-pointer ${settings.characterFrequency === v ? 'bg-[#1F1F1F] text-white' : 'bg-black/5'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className={`text-[10px] ${t.muted} mt-2 leading-relaxed`}>
                    语气、称呼、亲疏由<b className={t.text}>角色人设 + 你和 ta 的关系</b>自动决定，无需手动设置
                </div>
            </Section>

            {/* 节点开关（4 个） */}
            <Section title="关键节点触发" theme={t}>
                <p className={`text-[10px] ${t.muted} mb-2`}>勾选后，角色会在对应节点主动说话</p>
                <Toggle label="生理期" theme={t} on={settings.nodeSwitches.period}
                    onChange={(v) => setNode('period', v)} />
                <Toggle label="天气变化" theme={t} on={settings.nodeSwitches.weather}
                    onChange={(v) => setNode('weather', v)} />
                <Toggle label="习惯未打卡" theme={t} on={settings.nodeSwitches.habit}
                    onChange={(v) => setNode('habit', v)} />
                <Toggle label="里程碑达成" theme={t} on={settings.nodeSwitches.milestone}
                    onChange={(v) => setNode('milestone', v)} />
            </Section>

            {/* 习惯提醒 */}
            <Section title="习惯提醒" theme={t}>
                <Toggle label="今日习惯未全部打卡时提醒" theme={t}
                    on={settings.habitReminder}
                    onChange={(v) => set({ habitReminder: v })} />
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

function Toggle(props: { label: string; theme: any; on: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center justify-between py-1.5 cursor-pointer">
            <span className="text-sm">{props.label}</span>
            <span
                onClick={() => props.onChange(!props.on)}
                className={`relative inline-block w-9 h-5 rounded-full transition-colors cursor-pointer ${props.on ? 'bg-[#1F1F1F]' : 'bg-black/15'}`}
            >
                <span className={`absolute top-0.5 ${props.on ? 'left-[18px]' : 'left-0.5'} w-4 h-4 rounded-full bg-white shadow transition-all`} />
            </span>
        </label>
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
