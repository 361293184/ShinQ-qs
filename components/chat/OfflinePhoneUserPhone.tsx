import React, { useState } from 'react';
import { ArrowLeft, ChatCircleDots, Images, MusicNotes } from '@phosphor-icons/react';
import OfflinePhoneUserWechat from './OfflinePhoneUserWechat';
import OfflinePhoneUserGallery from './OfflinePhoneUserGallery';
import OfflinePhoneUserMusic from './OfflinePhoneUserMusic';

/**
 * 你的手机（方案 §5.26）。
 *
 * 结构就三样（§5.26 J ①）：**微信 / 相册 / 音乐**，右上角齿轮进权限设置。
 * 和「他的手机」比，这里没有生成、没有加载、没有刷新 —— 因为**所有内容都是 SullyOS 里真实存在的**
 * （§5.26 B/D）。手机上有什么，打开就是什么。
 *
 * 视觉上刻意和「他的手机」分开（§5.26 H）：壁纸是暖色渐变，他的手机是冷色。
 */

type Page = 'home' | 'wechat' | 'gallery' | 'music';

interface Props {
    charId: string;
    charName: string;
    userName: string;
    /** 齿轮 → 权限设置（由面板接管，因为齿轮画在状态栏上） */
    onOpenPermissions: () => void;
}

const APPS: { id: Exclude<Page, 'home'>; label: string; bg: string; icon: React.ReactNode }[] = [
    { id: 'wechat', label: '微信', bg: 'from-emerald-400 to-emerald-500', icon: <ChatCircleDots className="w-6 h-6" weight="fill" /> },
    { id: 'gallery', label: '相册', bg: 'from-sky-400 to-indigo-400', icon: <Images className="w-6 h-6" weight="fill" /> },
    { id: 'music', label: '音乐', bg: 'from-rose-400 to-orange-400', icon: <MusicNotes className="w-6 h-6" weight="fill" /> },
];

export default function OfflinePhoneUserPhone({ charId, charName, userName, onOpenPermissions }: Props) {
    const [page, setPage] = useState<Page>('home');

    if (page === 'home') {
        return (
            <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50">
                <div className="px-4 pt-5">
                    <div className="text-[11px] text-slate-500 mb-4 pl-1">你的手机</div>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                        {APPS.map((app) => (
                            <button
                                key={app.id}
                                onClick={() => setPage(app.id)}
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

                <div className="absolute bottom-3 left-0 right-0 px-5 text-center">
                    <div className="text-[9px] leading-4 text-slate-400">这里只有你自己知道的东西</div>
                    <button
                        onClick={onOpenPermissions}
                        className="mt-1 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur text-[9px] text-slate-500 active:bg-white"
                    >
                        配好「他能看到什么」
                    </button>
                </div>
            </div>
        );
    }

    const label = APPS.find((app) => app.id === page)?.label || '';

    return (
        <div className="absolute inset-0 flex flex-col bg-slate-50">
            <div className="shrink-0 h-9 flex items-center gap-1 px-2 bg-white/80 backdrop-blur border-b border-slate-100">
                <button
                    onClick={() => setPage('home')}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100"
                >
                    <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
                </button>
                <span className="text-[11px] font-bold text-slate-600">{label}</span>
            </div>
            <div className="flex-1 relative overflow-hidden">
                {page === 'wechat' && (
                    <OfflinePhoneUserWechat primaryCharId={charId} charName={charName} userName={userName} />
                )}
                {page === 'gallery' && <OfflinePhoneUserGallery primaryCharId={charId} charName={charName} />}
                {page === 'music' && <OfflinePhoneUserMusic charName={charName} />}
            </div>
        </div>
    );
}
