import React from 'react';
import { ImageSquare } from '@phosphor-icons/react';
import type { PhoneListEntry } from '../../utils/offlineMode/phoneContent';

/**
 * 手机里除微信之外的 App 的通用内容视图。
 *
 * 内容来自一次性生成（utils/offlineMode/phoneContent.ts），这里只负责"怎么长得像个 App"：
 * - list：标题 + 副标题 + 右侧时间/金额（备忘录、账单、搜索记录、读书、日记、音乐都走这个）
 * - gallery：相册用色块占位（真机相册必须有图，但生成的只有描述，用色块 + 说明比空着体面）
 */

interface Props {
    kind: 'list' | 'gallery';
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

export default function OfflinePhoneAppList({ kind, entries, emptyHint }: Props) {
    if (!entries.length) {
        return (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] leading-5 text-slate-400">
                {emptyHint}
            </div>
        );
    }

    if (kind === 'gallery') {
        return (
            <div className="absolute inset-0 overflow-y-auto bg-white p-2">
                <div className="grid grid-cols-3 gap-1.5">
                    {entries.map((entry, index) => (
                        <div key={`${entry.title}-${index}`} className="relative">
                            <div className={`aspect-square rounded-md bg-gradient-to-br ${TILE_COLORS[index % TILE_COLORS.length]} flex items-center justify-center`}>
                                <ImageSquare className="w-5 h-5 text-white/70" weight="fill" />
                            </div>
                            <div className="mt-1 text-[9px] leading-[1.35] text-slate-500 line-clamp-2">
                                {entry.title}
                                {entry.meta ? <span className="text-slate-400"> · {entry.meta}</span> : null}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 overflow-y-auto bg-white divide-y divide-slate-100">
            {entries.map((entry, index) => (
                <div key={`${entry.title}-${index}`} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="text-[12px] font-bold text-slate-700 leading-[1.4]">{entry.title}</div>
                        {entry.meta ? <div className="text-[9px] text-slate-400 shrink-0 pt-0.5">{entry.meta}</div> : null}
                    </div>
                    {entry.sub ? <div className="text-[10px] text-slate-400 mt-0.5">{entry.sub}</div> : null}
                    {entry.body ? <div className="text-[11px] text-slate-600 leading-[1.6] mt-1 whitespace-pre-wrap">{entry.body}</div> : null}
                </div>
            ))}
        </div>
    );
}
