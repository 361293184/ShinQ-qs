import React, { useEffect, useState } from 'react';
import {
    ArrowLeft, BookOpen, ChatCircleDots, Images, MagnifyingGlass,
    MusicNotes, NotePencil, Notebook, Wallet, WifiHigh, BatteryFull,
} from '@phosphor-icons/react';
import { nowInTimeZone } from '../../utils/timezone';
import type { PhoneHolder } from '../../utils/offlineMode/phoneHolder';

/**
 * 线下模式 · 悬浮手机弹窗（方向 A 的外壳）。
 *
 * 三条形态要求来自方案文档，都别改：
 * 1. **不加遮罩**——聊天界面原样留在背后，不压暗不模糊。层次靠机身投影和边框建立。
 * 2. 手机轮廓比例（约 9:19.5），大圆角 + 细中框 + 刘海 + 底部 Home 条。
 * 3. 顶部状态栏显示**角色时区的时间**，并标注这是谁的手机。
 *
 * 本步只做外壳：桌面网格 + 各 App 的占位页。微信真实同步、相册等内容放后面几步。
 */

type AppId = 'wechat' | 'gallery' | 'memo' | 'alipay' | 'read' | 'browser' | 'diary' | 'music'
    | 'chat' | 'bank';

interface AppEntry {
    id: AppId;
    label: string;
    bg: string;
    icon: React.ReactNode;
    note: string;
}

/** 他的手机：这一套内容是本项目自建的，不复用「查手机」的数据 */
const APPS_HIS: AppEntry[] = [
    { id: 'wechat', label: '微信', bg: 'from-emerald-400 to-emerald-500', icon: <ChatCircleDots className="w-6 h-6" weight="fill" />, note: '和他的聊天记录（和你这边的真实消息同步）、他自己的群、他和别人的私聊' },
    { id: 'gallery', label: '相册', bg: 'from-sky-400 to-indigo-400', icon: <Images className="w-6 h-6" weight="fill" />, note: '他眼里的世界：生活片段、随手拍、存下的图' },
    { id: 'memo', label: '备忘录', bg: 'from-amber-400 to-orange-400', icon: <NotePencil className="w-6 h-6" weight="fill" />, note: '待办、随手记、写了一半的句子' },
    { id: 'alipay', label: '支付宝', bg: 'from-blue-500 to-sky-500', icon: <Wallet className="w-6 h-6" weight="fill" />, note: '账单、转账、给谁花过钱' },
    { id: 'read', label: '读书', bg: 'from-rose-400 to-pink-500', icon: <BookOpen className="w-6 h-6" weight="fill" />, note: '在读什么、划线笔记' },
    { id: 'browser', label: '浏览器', bg: 'from-slate-500 to-slate-600', icon: <MagnifyingGlass className="w-6 h-6" weight="bold" />, note: '搜索记录——最暴露内心的东西' },
    { id: 'diary', label: '日记', bg: 'from-violet-400 to-purple-500', icon: <Notebook className="w-6 h-6" weight="fill" />, note: '翻到就走不掉的内容' },
    { id: 'music', label: '音乐', bg: 'from-red-400 to-rose-500', icon: <MusicNotes className="w-6 h-6" weight="fill" />, note: '他最近在听什么' },
];

/**
 * 你自己的手机：只放你自己的数据。
 * 方案里这一屏的完整形态是「三个 App + 右上角齿轮进权限设置」（§5.26 J），
 * 权限用来决定「他把你的手机拿过去之后能看到什么」——那是方向 B 的活，后面几步再做。
 */
const APPS_MINE: AppEntry[] = [
    { id: 'chat', label: '聊天', bg: 'from-emerald-400 to-emerald-500', icon: <ChatCircleDots className="w-6 h-6" weight="fill" />, note: '你和他的聊天——就是他手机上那一段的另一面' },
    { id: 'gallery', label: '相册', bg: 'from-sky-400 to-indigo-400', icon: <Images className="w-6 h-6" weight="fill" />, note: '你自己的相册（要不要对他开放，由权限设置决定）' },
    { id: 'diary', label: '日记', bg: 'from-violet-400 to-purple-500', icon: <Notebook className="w-6 h-6" weight="fill" />, note: '你自己的日记，默认不对他开放' },
    { id: 'bank', label: '账单', bg: 'from-blue-500 to-sky-500', icon: <Wallet className="w-6 h-6" weight="fill" />, note: '你自己的账单，默认不对他开放' },
];

interface Props {
    open: boolean;
    holder: PhoneHolder;
    charName: string;
    /** 角色时区 id，用于状态栏时间（resolveCharTimeZone 的结果） */
    charTimeZone?: string;
    onClose: () => void;
}

const pad = (n: number) => n.toString().padStart(2, '0');

export default function OfflinePhonePanel({ open, holder, charName, charTimeZone, onClose }: Props) {
    const [activeApp, setActiveApp] = useState<AppId | null>(null);
    const [clock, setClock] = useState(() => {
        const d = nowInTimeZone(charTimeZone);
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });

    // 弹窗开着时每分钟推一次时间，别让状态栏停在打开那一刻
    useEffect(() => {
        if (!open) { setActiveApp(null); return; }
        const tick = () => {
            const d = nowInTimeZone(charTimeZone);
            setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        };
        tick();
        const timer = window.setInterval(tick, 30_000);
        return () => window.clearInterval(timer);
    }, [open, charTimeZone]);

    if (!open) return null;

    // 看谁的手机会决定里面有什么：默认只能看自己的（他的手机得先在你手里）
    const apps = holder === 'char' ? APPS_HIS : APPS_MINE;
    const current = apps.find((a) => a.id === activeApp) || null;
    const ownerLabel = holder === 'char' ? '他的手机' : '你的手机';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
            {/* 点外部关闭：透明、不压暗，聊天界面原样留在背后 */}
            <div className="absolute inset-0" onClick={onClose} />

            <div
                className="relative rounded-[38px] p-[3px] bg-slate-900/90 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.55)]"
                style={{ width: '82%', maxWidth: 330, height: '72%', maxHeight: 620 }}
            >
                <div className="w-full h-full rounded-[35px] overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col relative">
                    {/* 刘海 */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-slate-900/90 z-20" />

                    {/* 状态栏：角色时区的时间 + 这是谁的手机 */}
                    <div className="h-9 shrink-0 flex items-center justify-between px-5 pt-1 text-[11px] font-bold text-slate-700 z-10">
                        <span>{clock}</span>
                        <span className="flex items-center gap-1 text-slate-400 text-[10px] font-medium">
                            <span className="truncate max-w-[86px]">{ownerLabel}</span>
                            <WifiHigh className="w-3 h-3" weight="bold" />
                            <BatteryFull className="w-4 h-4" weight="fill" />
                        </span>
                    </div>

                    {/* 桌面 / App 页 */}
                    <div className="flex-1 relative overflow-hidden">
                        {!current ? (
                            <div className="px-4 pt-4">
                                <div className="text-[11px] text-slate-400 mb-3 pl-1">
                                    {holder === 'char' ? `${charName}的手机` : '你的手机'}
                                </div>
                                <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                                    {apps.map((app) => (
                                        <button
                                            key={app.id}
                                            onClick={() => setActiveApp(app.id)}
                                            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                                        >
                                            <span className={`w-12 h-12 rounded-[15px] bg-gradient-to-br ${app.bg} text-white flex items-center justify-center shadow-sm`}>
                                                {app.icon}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-medium">{app.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="absolute inset-0 bg-white flex flex-col">
                                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                                    <button onClick={() => setActiveApp(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                                        <ArrowLeft className="w-4 h-4" weight="bold" />
                                    </button>
                                    <span className="text-[13px] font-bold text-slate-700">{current.label}</span>
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                                    <span className={`w-14 h-14 rounded-[18px] bg-gradient-to-br ${current.bg} text-white flex items-center justify-center shadow`}>
                                        {current.icon}
                                    </span>
                                    <div className="text-[12px] font-bold text-slate-600 mt-1">还没接上数据</div>
                                    <div className="text-[11px] leading-5 text-slate-400">{current.note}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Home 指示条 */}
                    <div className="h-6 shrink-0 flex items-start justify-center">
                        <div className="w-24 h-1 rounded-full bg-slate-900/25" />
                    </div>
                </div>
            </div>
        </div>
    );
}
