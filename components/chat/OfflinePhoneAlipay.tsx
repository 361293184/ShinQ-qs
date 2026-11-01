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

type Page =
    | 'home' | 'bills' | 'assets'
    | 'transfer' | 'finance' | 'fund' | 'huabei' | 'credit' | 'more';

const CATEGORY_COLORS: Record<string, string> = {
    餐饮: 'bg-orange-100 text-orange-600',
    交通: 'bg-sky-100 text-sky-600',
    购物: 'bg-rose-100 text-rose-600',
    娱乐: 'bg-violet-100 text-violet-600',
    医疗: 'bg-emerald-100 text-emerald-600',
    房租: 'bg-amber-100 text-amber-600',
    转账: 'bg-blue-100 text-blue-600',
};

/** 宫格 8 项，全部能点进去（§5.10 B ③） */
const GRID_ITEMS: { label: string; page: Page }[] = [
    { label: '账单', page: 'bills' },
    { label: '资产', page: 'assets' },
    { label: '转账', page: 'transfer' },
    { label: '理财', page: 'finance' },
    { label: '基金', page: 'fund' },
    { label: '花呗', page: 'huabei' },
    { label: '信用卡', page: 'credit' },
    { label: '更多', page: 'more' },
];

/** 更多服务里的装饰项（点了给一句软提示，不假装能用） */
const MORE_ITEMS = ['生活缴费', '手机充值', '蚂蚁森林', '蚂蚁庄园', '我的快递', '公益捐赠'];

/** 子页面统一外壳：返回键 + 标题 */
const SubPage = ({ title, extra, onBack, children }: {
    title: string;
    extra?: string;
    onBack: () => void;
    children: React.ReactNode;
}) => (
    <div className="absolute inset-0 bg-slate-50 flex flex-col">
        <div className="h-10 shrink-0 flex items-center gap-1 px-2 bg-white border-b border-slate-100">
            <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                <ArrowLeft className="w-4 h-4" weight="bold" />
            </button>
            <span className="text-[12px] font-bold text-slate-700">{title}</span>
            {extra ? <span className="ml-auto pr-2 text-[9px] text-slate-400">{extra}</span> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">{children}</div>
    </div>
);

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

    /* ---------------- 转账 ---------------- */
    if (page === 'transfer') {
        const transfers = entries.filter((entry) => entry.category === '转账' || /转账/.test(entry.title));
        return (
            <SubPage title="转账" extra={transfers.length ? `${transfers.length} 笔` : undefined} onBack={() => setPage('home')}>
                {transfers.map((entry, index) => (
                    <button
                        key={`${entry.title}-${index}`}
                        onClick={() => setOpenIndex(entries.indexOf(entry))}
                        className="w-full rounded-xl bg-white p-3 text-left active:bg-slate-50"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold text-slate-700 truncate">{entry.title}</span>
                            <span className={`text-[12px] font-bold shrink-0 ${isIncome(entry) ? 'text-emerald-600' : 'text-slate-800'}`}>
                                {entry.amount || entry.meta || ''}
                            </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-slate-400">{entry.sub || ''}</span>
                            {entry.body ? <span className="text-[9px] text-slate-500 truncate max-w-[60%]">{entry.body}</span> : null}
                        </div>
                    </button>
                ))}
                {!transfers.length && <div className="py-10 text-center text-[11px] text-slate-400">最近没有转账</div>}
            </SubPage>
        );
    }

    /* ---------------- 理财 ---------------- */
    if (page === 'finance') {
        return (
            <SubPage title="理财" onBack={() => setPage('home')}>
                <div className="rounded-xl bg-white p-3">
                    <div className="text-[10px] text-slate-400">余额宝</div>
                    <div className="text-[20px] font-bold text-slate-800 mt-0.5">{assets?.yuebao || '—'}</div>
                    <div className="text-[9px] text-slate-400 mt-1">七日年化 —　昨日收益 —</div>
                </div>
                {(assets?.funds || []).length > 0 ? (
                    <div className="rounded-xl bg-white p-3">
                        <div className="text-[10px] font-bold text-slate-400 mb-2">持有的理财</div>
                        {(assets?.funds || []).map((fund, index) => (
                            <div key={`${fund.name}-${index}`} className="flex items-center justify-between py-1.5">
                                <span className="text-[11px] text-slate-700 truncate">{fund.name}</span>
                                <span className={`text-[10px] font-bold shrink-0 ${profitColor(fund.profitRate || fund.profit)}`}>
                                    {fund.profitRate || fund.profit || '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center text-[11px] text-slate-400">没有理财持仓</div>
                )}
            </SubPage>
        );
    }

    /* ---------------- 基金 ---------------- */
    if (page === 'fund') {
        const funds = assets?.funds || [];
        return (
            <SubPage title="基金" extra={funds.length ? `${funds.length} 只` : undefined} onBack={() => setPage('home')}>
                {funds.map((fund, index) => (
                    <div key={`${fund.name}-${index}`} className="rounded-xl bg-white p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 truncate">{fund.name}</span>
                            <span className="text-[11px] text-slate-700 shrink-0">{fund.amount || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[9px] text-slate-400">持有收益</span>
                            <span className={`text-[10px] font-bold ${profitColor(fund.profit)}`}>
                                {fund.profit || '—'}{fund.profitRate ? `（${fund.profitRate}）` : ''}
                            </span>
                        </div>
                    </div>
                ))}
                {!funds.length && <div className="py-10 text-center text-[11px] text-slate-400">没有基金持仓</div>}
            </SubPage>
        );
    }

    /* ---------------- 花呗 ---------------- */
    if (page === 'huabei') {
        const owe = Number(String(assets?.huabei || '').replace(/[^\d.-]/g, '')) || 0;
        const limit = Number(String(assets?.huabeiLimit || '').replace(/[^\d.-]/g, '')) || 0;
        const used = limit > 0 ? Math.min(100, (owe / limit) * 100) : 0;
        return (
            <SubPage title="花呗" onBack={() => setPage('home')}>
                <div className="rounded-xl bg-white p-4">
                    <div className="text-[10px] text-slate-400">待还金额</div>
                    <div className="text-[24px] font-bold text-slate-800 mt-0.5">{assets?.huabei || '—'}</div>
                    {limit > 0 ? (
                        <>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-3">
                                <div className="h-full bg-[#1677ff]" style={{ width: `${used}%` }} />
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                                <span>已用 {Math.round(used)}%</span>
                                <span>额度 {assets?.huabeiLimit}</span>
                            </div>
                        </>
                    ) : (
                        <div className="text-[9px] text-slate-400 mt-2">还款日 每月 9 日</div>
                    )}
                </div>
                <div className="rounded-xl bg-white p-3">
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5">近三个月账单</div>
                    <div className="text-[10px] text-slate-400 leading-5">
                        这个月的还没出账。上个月按时还了，没有分期。
                    </div>
                </div>
            </SubPage>
        );
    }

    /* ---------------- 信用卡 ---------------- */
    if (page === 'credit') {
        const cards = (assets?.cards || []).filter((card) => /信用/.test(card.name) || card.type === '信用卡');
        const showCards = cards.length ? cards : (assets?.cards || []);
        return (
            <SubPage title="信用卡" extra={showCards.length ? `${showCards.length} 张` : undefined} onBack={() => setPage('home')}>
                {showCards.map((card, index) => (
                    <div key={`${card.name}-${index}`} className="rounded-xl bg-white p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700">{card.name}</span>
                            {card.tail ? <span className="text-[9px] text-slate-400">尾号 {card.tail}</span> : null}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-[9px] text-slate-400">{card.type === '信用卡' ? '本期账单' : '当前余额'}</span>
                            <span className="text-[12px] font-bold text-slate-800">{card.balance || '—'}</span>
                        </div>
                    </div>
                ))}
                {!showCards.length && <div className="py-10 text-center text-[11px] text-slate-400">还没绑信用卡</div>}
                <div className="text-center text-[9px] text-slate-400 pt-1">还款日 每月 9 日</div>
            </SubPage>
        );
    }

    /* ---------------- 更多 ---------------- */
    if (page === 'more') {
        return (
            <SubPage title="更多" onBack={() => setPage('home')}>
                <div className="rounded-xl bg-white overflow-hidden">
                    {MORE_ITEMS.map((item) => (
                        <button
                            key={item}
                            onClick={() => {
                                setHint(`${item}暂时打不开`);
                                window.setTimeout(() => setHint(''), 1400);
                            }}
                            className="w-full flex items-center justify-between px-3 py-3 text-left active:bg-slate-50 border-b border-slate-50 last:border-0"
                        >
                            <span className="text-[12px] text-slate-700">{item}</span>
                            <CaretRight className="w-3 h-3 text-slate-300" weight="bold" />
                        </button>
                    ))}
                </div>
                {hint ? <div className="text-center text-[9px] text-slate-400">{hint}</div> : null}
            </SubPage>
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
                {GRID_ITEMS.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => setPage(item.page)}
                        className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                    >
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold bg-[#1677ff]/10 text-[#1677ff]">
                            {item.label[0]}
                        </span>
                        <span className="text-[9px] text-slate-600">{item.label}</span>
                    </button>
                ))}
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
