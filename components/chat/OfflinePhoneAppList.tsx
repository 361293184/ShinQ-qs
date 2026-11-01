import React, { useState } from 'react';
import { ArrowLeft, CaretRight, ImageSquare } from '@phosphor-icons/react';
import type { PhoneListEntry } from '../../utils/offlineMode/phoneContent';

/**
 * 手机里除微信之外的 App 的通用内容视图。
 *
 * 内容来自分块生成（utils/offlineMode/phoneContent.ts），这里负责"怎么长得像个 App"：
 * - gallery：色块占位（生成的只有文字描述，色块 + 说明比空着体面），点开 = 大图块 + 完整描述 + 地点 + 时间
 * - list：标题 + 一行摘要 + 时间/金额，点开 = 详情
 * - 读书：按「在读 / 读完 / 想读」分区（文档 §5.13 C）
 *
 * 详情页字段（文档 §5.7 B / §5.8 D / §5.10 C / §5.13 F / §5.14 H / §5.11 D-E）：
 * 金额、分类、作者、进度、划线、歌词、播放次数、搜索结果、网友评论、天气。
 *
 * ⚠️ 这里**不能**用 useEffect 监听 entries 来重置详情：
 * 父组件每次重渲染都可能给出新的数组引用，effect 一跑就会把刚点开的详情关掉。
 * 详情位置用索引保存，取不到时自然回落成列表（父级已经用 key={appId} 保证切 App 会重挂）。
 */

interface Props {
    kind: 'list' | 'gallery';
    entries: PhoneListEntry[];
    emptyHint: string;
    /** App 名，详情页标题栏用（相册 / 备忘录 / 账单…） */
    label?: string;
}

const TILE_COLORS = [
    'from-sky-300 to-sky-400',
    'from-rose-300 to-rose-400',
    'from-amber-300 to-amber-400',
    'from-emerald-300 to-emerald-400',
    'from-violet-300 to-violet-400',
    'from-slate-300 to-slate-400',
];

const SHELF_LABELS: Record<string, string> = {
    reading: '在读',
    read: '读完',
    want: '想读',
};

/** 详情页用的元信息行 */
const DetailMeta = ({ label, value }: { label: string; value?: string }) => {
    if (!value) return null;
    return (
        <div className="flex items-start gap-2 text-[10px] leading-4">
            <span className="text-slate-400 shrink-0">{label}</span>
            <span className="text-slate-500 break-words">{value}</span>
        </div>
    );
};

export default function OfflinePhoneAppList({ kind, entries, emptyHint, label }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const detail = openIndex !== null ? entries[openIndex] : undefined;

    if (!entries.length) {
        return (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] leading-5 text-slate-400">
                {emptyHint}
            </div>
        );
    }

    /* ---------------- 详情页 ---------------- */
    if (detail) {
        const color = TILE_COLORS[(openIndex || 0) % TILE_COLORS.length];
        const isMoney = Boolean(detail.amount) || entryLooksLikeAmount(detail.meta);
        return (
            <div className="absolute inset-0 bg-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                    <button
                        onClick={() => setOpenIndex(null)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100"
                    >
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">{label || '详情'}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {kind === 'gallery' && (
                        <div className={`w-full aspect-[4/3] bg-gradient-to-br ${color} flex flex-col items-center justify-center gap-2`}>
                            <ImageSquare className="w-10 h-10 text-white/70" weight="fill" />
                            {detail.type ? (
                                <span className="px-2 py-0.5 rounded-full bg-white/25 text-white text-[9px]">{detail.type}</span>
                            ) : null}
                        </div>
                    )}
                    <div className="px-4 py-3">
                        {isMoney && (
                            <div className="text-[20px] font-bold text-slate-800 -mt-0.5 mb-1">
                                {detail.amount || detail.meta}
                            </div>
                        )}
                        <div className="text-[13px] font-bold text-slate-700 leading-5 whitespace-pre-wrap break-words">
                            {detail.title}
                        </div>

                        <div className="mt-2 space-y-1">
                            {detail.author ? <DetailMeta label="作者" value={detail.author} /> : null}
                            {detail.type && kind !== 'gallery' ? <DetailMeta label="类别" value={detail.type} /> : null}
                            {detail.category ? <DetailMeta label="分类" value={detail.category} /> : null}
                            {detail.sub ? <DetailMeta label={kind === 'gallery' ? '地点' : '备注'} value={detail.sub} /> : null}
                            {!isMoney && detail.meta ? <DetailMeta label="时间" value={detail.meta} /> : null}
                            {isMoney && detail.sub ? <DetailMeta label="时间" value={detail.sub} /> : null}
                            {detail.weather ? <DetailMeta label="天气" value={detail.weather} /> : null}
                            {detail.checklist ? <DetailMeta label="清单" value={detail.checklist} /> : null}
                            {detail.plays ? <DetailMeta label="播放" value={`${detail.plays} 次`} /> : null}
                            {typeof detail.progress === 'number' ? <DetailMeta label="进度" value={`${detail.progress}%`} /> : null}
                        </div>

                        {typeof detail.progress === 'number' ? (
                            <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-slate-400" style={{ width: `${Math.max(2, Math.min(100, detail.progress))}%` }} />
                            </div>
                        ) : null}

                        {detail.quote ? (
                            <div className="mt-3 border-l-2 border-amber-300 bg-amber-50/60 px-2.5 py-2 text-[11px] leading-[1.7] text-slate-600 whitespace-pre-wrap break-words">
                                {detail.quote}
                            </div>
                        ) : null}

                        {detail.lyric ? (
                            <div className="mt-3 text-[10px] leading-5 text-slate-400 whitespace-pre-wrap">{detail.lyric}</div>
                        ) : null}

                        {detail.body ? (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600 leading-[1.75] whitespace-pre-wrap break-words">
                                {detail.body}
                            </div>
                        ) : null}

                        {/* 浏览器：搜索结果 */}
                        {Array.isArray(detail.results) && detail.results.length > 0 && (
                            <div className="mt-4">
                                <div className="text-[10px] font-bold text-slate-400 mb-1.5">搜索结果</div>
                                <div className="space-y-2.5">
                                    {detail.results.map((result, index) => (
                                        <div key={`${result.title}-${index}`} className="border-b border-slate-50 pb-2">
                                            <div className="text-[11px] font-bold text-sky-700 leading-4">{result.title}</div>
                                            {result.summary ? (
                                                <div className="text-[10px] leading-4 text-slate-500 mt-0.5">{result.summary}</div>
                                            ) : null}
                                            {result.source ? (
                                                <div className="text-[9px] text-slate-400 mt-0.5">{result.source}</div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 浏览器：网友评论（真实互联网是互相矛盾的） */}
                        {Array.isArray(detail.comments) && detail.comments.length > 0 && (
                            <div className="mt-3">
                                <div className="text-[10px] font-bold text-slate-400 mb-1.5">网友评论</div>
                                <div className="space-y-1.5">
                                    {detail.comments.map((comment, index) => (
                                        <div key={index} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] leading-4 text-slate-600">
                                            {comment}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ---------------- 相册（网格） ---------------- */
    if (kind === 'gallery') {
        return (
            <div className="absolute inset-0 overflow-y-auto bg-white p-2">
                <div className="grid grid-cols-3 gap-1.5">
                    {entries.map((entry, index) => (
                        <button
                            key={`${entry.title}-${index}`}
                            onClick={() => setOpenIndex(index)}
                            className="relative text-left active:opacity-70"
                        >
                            <div className={`aspect-square rounded-md bg-gradient-to-br ${TILE_COLORS[index % TILE_COLORS.length]} flex items-center justify-center`}>
                                <ImageSquare className="w-5 h-5 text-white/70" weight="fill" />
                            </div>
                            <div className="mt-1 text-[9px] leading-[1.35] text-slate-500 line-clamp-2">
                                {entry.title}
                                {entry.meta ? <span className="text-slate-400"> · {entry.meta}</span> : null}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    /* ---------------- 列表（读书按书单分区） ---------------- */
    const hasShelf = entries.some((entry) => entry.shelf);
    const groups: { key: string; label: string; items: { entry: PhoneListEntry; index: number }[] }[] = [];

    if (hasShelf) {
        (['reading', 'read', 'want'] as const).forEach((shelf) => {
            const items = entries
                .map((entry, index) => ({ entry, index }))
                .filter(({ entry }) => entry.shelf === shelf);
            if (items.length) groups.push({ key: shelf, label: SHELF_LABELS[shelf], items });
        });
        // 没标书单的兜底塞到最后
        const rest = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.shelf);
        if (rest.length) groups.push({ key: 'other', label: '其它', items: rest });
    } else {
        groups.push({ key: 'all', label: '', items: entries.map((entry, index) => ({ entry, index })) });
    }

    return (
        <div className="absolute inset-0 overflow-y-auto bg-white">
            {groups.map((group) => (
                <div key={group.key}>
                    {group.label ? (
                        <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-400">{group.label}</div>
                    ) : null}
                    <div className="divide-y divide-slate-100">
                        {group.items.map(({ entry, index }) => (
                            <button
                                key={`${entry.title}-${index}`}
                                onClick={() => setOpenIndex(index)}
                                className="w-full flex items-start gap-2 px-3 py-2.5 text-left active:bg-slate-50"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="text-[12px] font-bold text-slate-700 leading-[1.4] flex items-center gap-1 min-w-0">
                                            {entry.pinned ? <span className="text-[9px] text-amber-500 shrink-0">置顶</span> : null}
                                            <span className="truncate">{entry.title}</span>
                                        </div>
                                        {/* 账单看金额，其余看时间 */}
                                        {entry.amount || entryLooksLikeAmount(entry.meta) ? (
                                            <div className="text-[10px] font-bold text-slate-600 shrink-0 pt-0.5">{entry.amount || entry.meta}</div>
                                        ) : entry.meta ? (
                                            <div className="text-[9px] text-slate-400 shrink-0 pt-0.5">{entry.meta}</div>
                                        ) : null}
                                    </div>
                                    {entry.author ? (
                                        <div className="text-[10px] text-slate-400 mt-0.5">{entry.author}</div>
                                    ) : entry.sub ? (
                                        <div className="text-[10px] text-slate-400 mt-0.5">{entry.sub}</div>
                                    ) : null}
                                    {typeof entry.progress === 'number' ? (
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <div className="h-0.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full bg-slate-400" style={{ width: `${Math.max(2, Math.min(100, entry.progress))}%` }} />
                                            </div>
                                            <span className="text-[8px] text-slate-400">{entry.progress}%</span>
                                        </div>
                                    ) : null}
                                    {entry.body ? (
                                        <div className="text-[11px] text-slate-600 leading-[1.6] mt-1 line-clamp-2">{entry.body}</div>
                                    ) : null}
                                    {entry.checklist ? (
                                        <div className="text-[9px] text-slate-400 mt-1">清单 {entry.checklist}</div>
                                    ) : null}
                                </div>
                                <CaretRight className="w-3 h-3 shrink-0 mt-1 text-slate-300" weight="bold" />
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** 老数据没有 amount 字段，金额可能只写在 meta 里（"-38.00"） */
function entryLooksLikeAmount(value?: string): boolean {
    return typeof value === 'string' && /^[+-]?\d+(\.\d+)?$/.test(value.trim());
}
