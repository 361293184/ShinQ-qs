import React, { useState } from 'react';
import { ArrowLeft, CaretRight } from '@phosphor-icons/react';
import type { PhoneListEntry } from '../../utils/offlineMode/phoneContent';

/**
 * 他手机里的备忘录（文档 §5.8）。
 *
 * - 列表：标题（粗）+ 摘要（灰、一行）+ 时间；分组 **置顶 / 今天 / 更早**（§5.8 D）
 * - 清单类显示勾选进度（如 2/5），详情里画出来（§5.8 D / E 待确认 1：做勾选框）
 * - 详情 = 标题 + 正文 + 时间（§5.8 D）
 * - 只读：用户能改角色的备忘录，"这是他自己写的"就失效了（§5.8 F 待确认 2）
 */

interface Props {
    entries: PhoneListEntry[];
    emptyHint: string;
}

/** "2/5" → { done: 2, total: 5 } */
const parseChecklist = (text?: string): { done: number; total: number } | null => {
    if (!text) return null;
    const match = /(\d+)\s*\/\s*(\d+)/.exec(text);
    if (!match) return null;
    const done = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return null;
    return { done: Math.min(done, total), total };
};

export default function OfflinePhoneMemo({ entries, emptyHint }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const detail = openIndex !== null ? entries[openIndex] : undefined;

    if (!entries.length) {
        return (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] leading-5 text-slate-400">
                {emptyHint}
            </div>
        );
    }

    /* ---------------- 详情 ---------------- */
    if (detail) {
        const checklist = parseChecklist(detail.checklist);
        return (
            <div className="absolute inset-0 bg-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                    <button onClick={() => setOpenIndex(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">备忘录</span>
                    {detail.pinned ? <span className="ml-1 text-[9px] text-amber-500">已置顶</span> : null}
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <div className="text-[14px] font-bold text-slate-800 leading-6">{detail.title}</div>
                    <div className="text-[9px] text-slate-400 mt-1">{detail.meta || ''}</div>
                    {checklist ? (
                        <div className="mt-3 space-y-1.5">
                            {/* 清单条目的真实文字（items），没有就按总数画空框 */}
                            {Array.from({ length: Math.max(checklist.total, (detail.items || []).length) }).map((_, index) => {
                                const checked = index < checklist.done;
                                const text = (detail.items || [])[index];
                                return (
                                    <div key={index} className="flex items-start gap-2">
                                        <span className={`w-3.5 h-3.5 mt-0.5 shrink-0 rounded-[4px] border flex items-center justify-center text-[9px] ${checked ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-300 text-transparent'}`}>
                                            ✓
                                        </span>
                                        <span className={`text-[11px] leading-4 ${checked ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                            {text || (checked ? '已完成的一项' : '还没做的一项')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                    {detail.body ? (
                        <div className="mt-3 text-[11px] leading-[1.8] text-slate-600 whitespace-pre-wrap break-words">
                            {detail.body}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    /* ---------------- 列表 ---------------- */
    const pinned = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.pinned);
    const today = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !entry.pinned && /今天|刚刚/.test(entry.meta || ''));
    const earlier = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !entry.pinned && !/今天|刚刚/.test(entry.meta || ''));

    const sections = [
        { key: 'pinned', label: '置顶', items: pinned },
        { key: 'today', label: '今天', items: today },
        { key: 'earlier', label: '更早', items: earlier },
    ].filter((section) => section.items.length > 0);

    return (
        <div className="absolute inset-0 bg-white overflow-y-auto">
            {sections.map((section) => (
                <div key={section.key}>
                    <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-400">{section.label}</div>
                    <div className="divide-y divide-slate-100">
                        {section.items.map(({ entry, index }) => {
                            const checklist = parseChecklist(entry.checklist);
                            return (
                                <button
                                    key={`${entry.title}-${index}`}
                                    onClick={() => setOpenIndex(index)}
                                    className="w-full flex items-start gap-2 px-3 py-2.5 text-left active:bg-slate-50"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="text-[12px] font-bold text-slate-700 leading-[1.4]">{entry.title}</div>
                                            <div className="text-[9px] text-slate-400 shrink-0 pt-0.5">{entry.meta || ''}</div>
                                        </div>
                                        {entry.body ? (
                                            <div className="text-[10px] text-slate-500 leading-[1.6] mt-1 line-clamp-2">{entry.body}</div>
                                        ) : null}
                                        {checklist ? (
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="text-[9px] text-slate-400">清单 {checklist.done}/{checklist.total}</span>
                                                <span className="flex-1 h-0.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <span
                                                        className="block h-full bg-slate-400"
                                                        style={{ width: `${(checklist.done / checklist.total) * 100}%` }}
                                                    />
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>
                                    <CaretRight className="w-3 h-3 shrink-0 mt-1 text-slate-300" weight="bold" />
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
