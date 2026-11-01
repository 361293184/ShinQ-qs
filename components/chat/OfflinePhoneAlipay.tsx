import React, { useState } from 'react';
import { ArrowLeft, CaretRight } from '@phosphor-icons/react';
import type { PhoneAlipayAssets, PhoneListEntry } from '../../utils/offlineMode/phoneContent';

/**
 * 他手机里的支付宝（文档 §5.10）。
 *
 * 三个页面（§5.10 B 定案）：
 * - 首页：资产总览（品牌蓝底）+ 本月收支 + 功能宫格 + 最近账单
 * - 账单：完整流水，按时间分组
 * - 资产：银行卡 + 基金持仓（涨红跌绿）+ 花呗欠款
 *
 * 功能宫格里只有「账单」「资产」是真入口，其余是真实感（§5.10 B ④ 的说明）。
 */

interface Props {
    entries: PhoneListEntry[];
    assets?: PhoneAlipayAssets;
    emptyHint: string;
}

type Page = 'home' | 'bills' | 'assets';

const CATEGORY_COLORS: Record<string, string> = {
    餐饮: 'bg-orange-100 text-orange-600',
    交通: 'bg-sky-100 text-sky-600',
    购物: 'bg-rose-100 text-rose-600',
    娱乐: 'bg-violet-100 text-violet-600',
    医疗: 'bg-emerald-100 text-emerald-600',
    房租: 'bg-amber-100 text-amber-600',
    转账: 'bg-blue-100 text-blue-600',
};

const GRID_ITEMS = ['账单', '资产', '转账', '理财', '基金', '花呗', '信用卡', '更多'];

/** "9月14日 20:14" → "9月"；解析不出来就归「更早」 */
const monthGroupOf = (text?: string): string => {
    if (!text) return '更早';
    const match = /(\d{1,2})\s*月/.exec(text);
    return match ? `${match[1]}月` : '更早';
};

const isIncome = (entry: PhoneListEntry): boolean => {
    const amount = entry.amount || entry.meta || '';
    return amount.trim().startsWith('+');
};

/** 盈亏：涨红跌绿（项目规则） */
const profitColor = (value?: string): string => {
    if (!value) return 'text-slate-400';
    return value.trim().startsWith('-') ? 'text-emerald-500' : 'text-rose-500';
};

export default function OfflinePhoneAlipay({ entries, assets, emptyHint }: Props) {
    const [page, setPage] = useState<Page>('home');
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [hint, setHint] = useState('');

    const detail = openIndex !== null ? entries[openIndex] : undefined;

    /* ---------------- 账单详情 ---------------- */
    if (detail) {
        const amount = detail.amount || detail.meta || '';
        return (
            <div className="absolute inset-0 bg-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                    <button onClick={() => setOpenIndex(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">账单详情</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 text-center">
                    <div className={`text-[26px] font-bold ${isIncome(detail) ? 'text-emerald-600' : 'text-slate-800'}`}>{amount}</div>
                    <div className="text-[12px] text-slate-600 mt-1.5">{detail.title}</div>
                    <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-left space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">时间</span>
                            <span className="text-slate-600">{detail.sub || detail.meta || '—'}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">分类</span>
                            <span className="text-slate-600">{detail.category || '其它'}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400">方式</span>
                            <span className="text-slate-600">余额</span>
                        </div>
                    </div>
                    {detail.body ? (
                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-[11px] leading-[1.7] text-slate-600 whitespace-pre-wrap">
                            {detail.body}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    if (!entries.length && !assets) {
        return (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] leading-5 text-slate-400">
                {emptyHint}
            </div>
        );
    }

    /* ---------------- 账单页 ---------------- */
    if (page === 'bills') {
        const groups: { label: string; items: { entry: PhoneListEntry; index: number }[] }[] = [];
        entries.forEach((entry, index) => {
            const label = monthGroupOf(entry.sub || entry.meta);
            const found = groups.find((group) => group.label === label);
            if (found) found.items.push({ entry, index });
            else groups.push({ label, items: [{ entry, index }] });
        });
        return (
            <div className="absolute inset-0 bg-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                    <button onClick={() => setPage('home')} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">账单</span>
                    <span className="ml-auto pr-2 text-[9px] text-slate-400">{entries.length} 笔</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {groups.map((group) => (
                        <div key={group.label}>
                            <div className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 sticky top-0">{group.label}</div>
                            {group.items.map(({ entry, index }) => (
                                <button
                                    key={`${entry.title}-${index}`}
                                    onClick={() => setOpenIndex(index)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50"
                                >
                                    <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${CATEGORY_COLORS[entry.category || ''] || 'bg-slate-100 text-slate-500'}`}>
                                        {(entry.category || '其')[0]}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[12px] font-bold text-slate-700 truncate">{entry.title}</span>
                                        <span className="block text-[9px] text-slate-400 mt-0.5">{entry.sub || entry.meta || ''}</span>
                                    </span>
                                    <span className={`text-[12px] font-bold shrink-0 ${isIncome(entry) ? 'text-emerald-600' : 'text-slate-800'}`}>
                                        {entry.amount || entry.meta || ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ))}
                    {!entries.length && (
                        <div className="p-8 text-center text-[11px] text-slate-400">还没有账单</div>
                    )}
                </div>
            </div>
        );
    }

    /* ---------------- 资产页 ---------------- */
    if (page === 'assets') {
        return (
            <div className="absolute inset-0 bg-slate-50 flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 bg-white border-b border-slate-100">
                    <button onClick={() => setPage('home')} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700">资产</span>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                    {(assets?.cards || []).length > 0 && (
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold text-slate-400 mb-2">银行卡</div>
                            {(assets?.cards || []).map((card, index) => (
                                <div key={`${card.name}-${index}`} className="flex items-center justify-between py-1.5">
                                    <span className="text-[11px] text-slate-700">
                                        {card.name}{card.tail ? <span className="text-slate-400"> (尾号{card.tail})</span> : null}
                                    </span>
                                    <span className="text-[11px] text-slate-600">{card.balance || '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {(assets?.funds || []).length > 0 && (
                        <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold text-slate-400 mb-2">基金 / 理财</div>
                            {(assets?.funds || []).map((fund, index) => (
                                <div key={`${fund.name}-${index}`} className="py-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-slate-700 truncate">{fund.name}</span>
                                        <span className="text-[11px] text-slate-600 shrink-0">{fund.amount || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5">
                                        <span className="text-[9px] text-slate-400">持有收益</span>
                                        <span className={`text-[10px] font-bold ${profitColor(fund.profit)}`}>
                                            {fund.profit || '—'}{fund.profitRate ? `（${fund.profitRate}）` : ''}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {assets?.huabei ? (
                        <div className="rounded-xl bg-white p-3 flex items-center justify-between">
                            <span className="text-[11px] text-slate-700">花呗待还</span>
                            <span className="text-[12px] font-bold text-slate-800">{assets.huabei}</span>
                        </div>
                    ) : null}
                    {!assets && <div className="p-8 text-center text-[11px] text-slate-400">还没有资产数据</div>}
                </div>
            </div>
        );
    }

    /* ---------------- 首页 ---------------- */
    const recent = entries.slice(0, 5);
    return (
        <div className="absolute inset-0 bg-slate-50 overflow-y-auto">
            {/* 资产总览（品牌蓝底） */}
            <div className="bg-[#1677ff] text-white px-4 pt-4 pb-5">
                <div className="text-[10px] text-white/70">总资产（元）</div>
                <div className="text-[26px] font-bold leading-8 mt-0.5">{assets?.total || '—'}</div>
                <div className="flex gap-5 mt-2.5 text-[10px] text-white/85">
                    <span>余额 {assets?.balance || '—'}</span>
                    <span>余额宝 {assets?.yuebao || '—'}</span>
                </div>
                <div className="flex gap-6 mt-3 pt-3 border-t border-white/20 text-[10px]">
                    <span className="text-white/70">本月支出 <span className="text-white font-bold ml-1">{assets?.monthExpense || '—'}</span></span>
                    <span className="text-white/70">本月收入 <span className="text-white font-bold ml-1">{assets?.monthIncome || '—'}</span></span>
                </div>
            </div>

            {/* 功能宫格 */}
            <div className="bg-white mx-3 -mt-3 rounded-xl px-2 py-3 grid grid-cols-4 gap-y-3 shadow-sm relative">
                {GRID_ITEMS.map((item) => {
                    const enabled = item === '账单' || item === '资产';
                    return (
                        <button
                            key={item}
                            onClick={() => {
                                if (item === '账单') { setPage('bills'); return; }
                                if (item === '资产') { setPage('assets'); return; }
                                // 其余是「真实感」，点了给一句软提示，不假装能用
                                setHint(`${item}暂时打不开`);
                                window.setTimeout(() => setHint(''), 1400);
                            }}
                            className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                        >
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold ${enabled ? 'bg-[#1677ff]/10 text-[#1677ff]' : 'bg-slate-100 text-slate-400'}`}>
                                {item[0]}
                            </span>
                            <span className={`text-[9px] ${enabled ? 'text-slate-600' : 'text-slate-400'}`}>{item}</span>
                        </button>
                    );
                })}
                {hint ? (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-1 px-2.5 py-1 rounded-full bg-slate-900/85 text-white text-[9px]">
                        {hint}
                    </div>
                ) : null}
            </div>

            {/* 最近账单 */}
            <div className="bg-white mx-3 mt-3 rounded-xl overflow-hidden">
                <button
                    onClick={() => setPage('bills')}
                    className="w-full flex items-center justify-between px-3 py-2.5 active:bg-slate-50"
                >
                    <span className="text-[11px] font-bold text-slate-600">最近账单</span>
                    <span className="flex items-center gap-0.5 text-[9px] text-slate-400">全部 <CaretRight className="w-2.5 h-2.5" weight="bold" /></span>
                </button>
                <div className="border-t border-slate-50">
                    {recent.map((entry, index) => (
                        <button
                            key={`${entry.title}-${index}`}
                            onClick={() => setOpenIndex(index)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-slate-50 border-b border-slate-50 last:border-0"
                        >
                            <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold ${CATEGORY_COLORS[entry.category || ''] || 'bg-slate-100 text-slate-500'}`}>
                                {(entry.category || '其')[0]}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[11px] text-slate-700 truncate">{entry.title}</span>
                                <span className="block text-[9px] text-slate-400">{entry.sub || entry.meta || ''}</span>
                            </span>
                            <span className={`text-[11px] font-bold shrink-0 ${isIncome(entry) ? 'text-emerald-600' : 'text-slate-800'}`}>
                                {entry.amount || entry.meta || ''}
                            </span>
                        </button>
                    ))}
                    {!recent.length && <div className="p-6 text-center text-[10px] text-slate-400">还没有账单</div>}
                </div>
            </div>

            <div className="h-4" />
        </div>
    );
}
