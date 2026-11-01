import React, { useState } from 'react';
import { ArrowLeft, ImageSquare } from '@phosphor-icons/react';
import type { PhoneListEntry } from '../../utils/offlineMode/phoneContent';

/**
 * 他手机里的相册（文档 §5.7）。
 *
 * - 一级：全部（按时间倒序、时间分组，§5.7 B）
 * - 二级（可选）：相簿（人物 / 工作 / 地点…§5.7 B），这里用生成时给的 type 当相簿
 * - 每张图：色块 + 文字描述（截断）
 * - 点开：大色块 + 完整描述 + 拍摄时间 + 地点（§5.7 B）
 *
 * 不生图（零成本）：所有"照片"都是色块 + 文字，界面里不出现裂图。
 */

interface Props {
    entries: PhoneListEntry[];
    emptyHint: string;
}

const TILE_COLORS = [
    'from-sky-300 to-sky-400',
    'from-rose-300 to-rose-400',
    'from-amber-300 to-amber-400',
    'from-emerald-300 to-emerald-400',
    'from-violet-300 to-violet-400',
    'from-slate-300 to-slate-400',
];

/** 相簿顺序：先"人物"类再其他（§5.7 C 里偷拍/合照是最有戏的） */
const ALBUM_ORDER = ['偷拍', '合照', '日常', '工作', '截图', '风景'];

const colorAt = (index: number): string => TILE_COLORS[index % TILE_COLORS.length];

/** "9月14日" / "上周三" → 时间分组标题 */
const timeGroupOf = (meta?: string): string => {
    if (!meta) return '更早';
    const month = /(\d{1,2})\s*月/.exec(meta);
    if (month) return `${month[1]} 月`;
    if (/今天|刚刚|小时/.test(meta)) return '今天';
    if (/昨天/.test(meta)) return '昨天';
    if (/周|星期/.test(meta)) return '本周';
    return '更早';
};

export default function OfflinePhoneGallery({ entries, emptyHint }: Props) {
    const [album, setAlbum] = useState<string | null>(null); // null = 全部
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    if (!entries.length) {
        return (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] leading-5 text-slate-400">
                {emptyHint}
            </div>
        );
    }

    /* ---------------- 单张照片 ---------------- */
    const detail = openIndex !== null ? entries[openIndex] : undefined;
    if (detail) {
        return (
            <div className="absolute inset-0 bg-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                    <button onClick={() => setOpenIndex(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">{detail.type || '照片'}</span>
                    <span className="ml-auto pr-2 text-[9px] text-slate-400">{detail.meta || ''}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <div className={`w-full aspect-[4/3] bg-gradient-to-br ${colorAt(openIndex || 0)} flex items-center justify-center`}>
                        <ImageSquare className="w-11 h-11 text-white/70" weight="fill" />
                    </div>
                    <div className="px-4 py-3">
                        <div className="text-[12px] font-bold text-slate-700 leading-5">{detail.title}</div>
                        <div className="mt-1.5 space-y-1 text-[10px] text-slate-400">
                            {detail.sub ? <div>地点 · {detail.sub}</div> : null}
                            {detail.meta ? <div>时间 · {detail.meta}</div> : null}
                        </div>
                        {detail.body ? (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] leading-[1.75] text-slate-600 whitespace-pre-wrap">
                                {detail.body}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    /* ---------------- 某个相簿 ---------------- */
    if (album) {
        const items = entries
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => (entry.type || '日常') === album);
        return (
            <div className="absolute inset-0 bg-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                    <button onClick={() => setAlbum(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">{album}</span>
                    <span className="ml-auto pr-2 text-[9px] text-slate-400">{items.length} 张</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-3 gap-1.5">
                        {items.map(({ entry, index }) => (
                            <button key={`${entry.title}-${index}`} onClick={() => setOpenIndex(index)} className="text-left active:opacity-70">
                                <div className={`aspect-square rounded-md bg-gradient-to-br ${colorAt(index)} flex items-center justify-center`}>
                                    <ImageSquare className="w-5 h-5 text-white/70" weight="fill" />
                                </div>
                                <div className="mt-1 text-[9px] leading-[1.35] text-slate-500 line-clamp-2">{entry.title}</div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    /* ---------------- 相簿入口 ---------------- */
    const albumTypes = Array.from(new Set(entries.map((entry) => entry.type || '日常')));
    albumTypes.sort((a, b) => {
        const ai = ALBUM_ORDER.indexOf(a);
        const bi = ALBUM_ORDER.indexOf(b);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    /* ---------------- 全部（时间分组） ---------------- */
    const groups: { label: string; items: { entry: PhoneListEntry; index: number }[] }[] = [];
    entries.forEach((entry, index) => {
        const label = timeGroupOf(entry.meta);
        const found = groups.find((group) => group.label === label);
        if (found) found.items.push({ entry, index });
        else groups.push({ label, items: [{ entry, index }] });
    });

    return (
        <div className="absolute inset-0 bg-white overflow-y-auto">
            {/* 相簿入口 */}
            <div className="px-3 pt-2.5 pb-1 flex gap-2 overflow-x-auto">
                <button onClick={() => setAlbum(null)} className="shrink-0 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[9px]">全部</button>
                {albumTypes.map((type) => (
                    <button
                        key={type}
                        onClick={() => setAlbum(type)}
                        className="shrink-0 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[9px]"
                    >
                        {type}
                    </button>
                ))}
            </div>

            {groups.map((group) => (
                <div key={group.label} className="px-2 pt-2">
                    <div className="text-[10px] text-slate-400 pl-1 pb-1.5">{group.label}</div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {group.items.map(({ entry, index }) => (
                            <button key={`${entry.title}-${index}`} onClick={() => setOpenIndex(index)} className="text-left active:opacity-70">
                                <div className={`aspect-square rounded-md bg-gradient-to-br ${colorAt(index)} flex items-center justify-center`}>
                                    <ImageSquare className="w-5 h-5 text-white/70" weight="fill" />
                                </div>
                                <div className="mt-1 mb-1 text-[9px] leading-[1.35] text-slate-500 line-clamp-2">
                                    {entry.title}
                                    {entry.meta ? <span className="text-slate-400"> · {entry.meta}</span> : null}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            <div className="h-3" />
        </div>
    );
}
