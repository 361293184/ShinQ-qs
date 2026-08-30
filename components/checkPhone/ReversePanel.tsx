/**
 * 反查手机 · 面板（查看记录 / 权限设置）
 *
 * 内嵌在 CheckPhone 的反查手机页，两个 Tab：
 *  - 查看记录：谁 / 时间 / 查看了什么（含拒绝事件）
 *  - 权限设置：App 列表 + 逐项开关（设置永远禁止）
 */
import React, { useState } from 'react';
import { ClockCounterClockwise, ShieldCheck, Trash, Play, UserFocus, X, CaretRight } from '@phosphor-icons/react';
import type { CharacterProfile, ReverseCheckLog, ReversePermission } from '../../types';

interface ReversePanelProps {
    logs: ReverseCheckLog[];
    permissions: ReversePermission[];
    /** 可选：角色列表（「发起」Tab 用） */
    chars?: CharacterProfile[];
    /** 点角色直接触发该角色的反查接管 */
    onRequestReverse?: (char: CharacterProfile) => void;
    onDeleteLog: (id: string) => void;
    onTogglePermission: (appId: string) => void;
    onResetPermissions: () => void;
}

const ReversePanel: React.FC<ReversePanelProps> = ({
    logs, permissions, chars = [], onRequestReverse,
    onDeleteLog, onTogglePermission, onResetPermissions,
}) => {
    const [tab, setTab] = useState<'logs' | 'perms' | 'launch'>('logs');
    /** 点开的记录明细（Modal 浮层） */
    const [selectedLog, setSelectedLog] = useState<ReverseCheckLog | null>(null);

    const fmtTime = (ts: number) => {
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-[#0a0b10] text-white overflow-hidden">
            {/* 顶栏 */}
            <div className="h-14 flex items-center justify-between px-4 shrink-0">
                <span className="font-semibold tracking-widest uppercase text-[13px] text-white/80">Reverse Check</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setTab('logs')}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${tab === 'logs' ? 'bg-violet-500/80 text-white' : 'bg-white/[0.06] text-white/50'}`}>
                        <ClockCounterClockwise size={14} /> 记录
                    </button>
                    <button
                        onClick={() => setTab('perms')}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${tab === 'perms' ? 'bg-violet-500/80 text-white' : 'bg-white/[0.06] text-white/50'}`}>
                        <ShieldCheck size={14} /> 权限
                    </button>
                    <button
                        onClick={() => setTab('launch')}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${tab === 'launch' ? 'bg-violet-500/80 text-white' : 'bg-white/[0.06] text-white/50'}`}>
                        <Play size={14} /> 发起
                    </button>
                </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-4">
                {tab === 'logs' ? (
                    logs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-white/30">
                            <ClockCounterClockwise size={40} weight="thin" />
                            <p className="mt-3 text-sm">还没有反查记录</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {logs.map(log => (
                                <div key={log.id} onClick={() => setSelectedLog(log)}
                                    className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 cursor-pointer hover:border-violet-400/40 hover:bg-white/[0.05] active:scale-[0.99] transition group">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-white/90">{log.charName}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-white/40 font-mono">{fmtTime(log.timestamp)}</span>
                                            <button onClick={(e) => { e.stopPropagation(); onDeleteLog(log.id); }}
                                                className="w-7 h-7 rounded-lg bg-white/[0.05] text-white/40 hover:text-rose-400 flex items-center justify-center active:scale-90 transition">
                                                <Trash size={13} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-1.5 text-[12px] leading-relaxed">
                                        {log.result === 'rejected' ? (
                                            <span className="text-amber-400/90">被拒绝，未查看</span>
                                        ) : log.result === 'interrupted' ? (
                                            <span className="text-slate-400">接管被打断</span>
                                        ) : (
                                            <div className="text-white/70">
                                                {(log.items || []).slice(0, 2).map((it, i) => (
                                                    <div key={i} className="py-0.5">
                                                        <span className="text-white/50">· 查看了</span> {it.appName}
                                                        {it.detail && <span className="text-white/40">（{it.detail}）</span>}
                                                    </div>
                                                ))}
                                                {(log.items || []).length > 2 && (
                                                    <div className="text-[11px] text-violet-300/70 mt-0.5">查看全部明细…</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center justify-end text-[11px] text-violet-300/50 group-hover:text-violet-300/80 transition">
                                        详情 <CaretRight size={12} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : tab === 'launch' ? (
                    <div>
                        <div className="mb-2">
                            <span className="text-[11px] text-white/40 uppercase tracking-widest">让角色主动查手机</span>
                        </div>
                        {chars.length === 0 ? (
                            <p className="text-center text-white/30 text-sm mt-8">暂无角色</p>
                        ) : (
                            <div className="space-y-2">
                                {chars.map(c => (
                                    <button key={c.id}
                                        onClick={() => onRequestReverse?.(c)}
                                        className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 flex items-center gap-3 text-left hover:border-violet-400/50 hover:shadow-[0_0_16px_rgba(157,124,255,0.15)] active:scale-[0.98] transition">
                                        <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                                            {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : <UserFocus size={18} className="text-violet-300" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-white/90">{c.name}</div>
                                            <div className="text-[11px] text-white/40 truncate">{c.systemPrompt || ''}</div>
                                        </div>
                                        <span className="text-violet-300 text-xs shrink-0">让 TA 查</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="mt-3 text-[11px] text-white/30 leading-relaxed">
                            选一个角色，TA 会直接发起查看你手机的请求（弹警示窗确认后接管）。反查里角色直接查，不会拒绝。
                        </p>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] text-white/40 uppercase tracking-widest">App 权限</span>
                            <button onClick={onResetPermissions}
                                className="text-[11px] text-violet-300/80 hover:text-violet-300 underline underline-offset-2">全部重置</button>
                        </div>
                        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
                            {permissions.map((p, i) => (
                                <div key={p.appId}
                                    className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-white/[0.06]' : ''} ${p.hardBlocked ? 'opacity-50' : ''}`}>
                                    <span className="text-sm text-white/80">{p.appName}</span>
                                    {p.hardBlocked ? (
                                        <span className="text-[11px] text-rose-400 font-semibold">⛔ 永久禁止</span>
                                    ) : (
                                        <button
                                            onClick={() => onTogglePermission(p.appId)}
                                            className={`w-10 h-6 rounded-full relative transition-colors ${p.allowed ? 'bg-emerald-500/90' : 'bg-white/15'}`}>
                                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${p.allowed ? 'left-[18px]' : 'left-0.5'}`} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-[11px] text-white/30 leading-relaxed">
                            设置 App 永久禁止查看，保护你的系统配置。角色接管时只能打开有权限的 App。
                        </p>
                    </div>
                )}
            </div>

            {/* 反查记录 · 明细浮层 */}
            {selectedLog && (
                <div className="absolute inset-0 z-[90] flex flex-col bg-[#0a0b10]/95 backdrop-blur-md animate-fade-in">
                    <div className="h-14 flex items-center justify-between px-4 shrink-0">
                        <button onClick={() => setSelectedLog(null)}
                            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-white/70 bg-white/[0.05] hover:bg-white/10 active:scale-90 transition">
                            <X size={18} weight="bold" />
                        </button>
                        <span className="font-semibold text-white/90 text-sm">{selectedLog.charName} · 反查明细</span>
                        <div className="w-9" />
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-6">
                        <div className="text-[11px] text-white/40 font-mono mb-3">{fmtTime(selectedLog.timestamp)}</div>
                        {selectedLog.result === 'rejected' ? (
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300/90 text-sm">
                                {selectedLog.rejectRequest || '被拒绝，未查看'}
                            </div>
                        ) : selectedLog.result === 'interrupted' ? (
                            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-slate-400 text-sm">接管被打断</div>
                        ) : (
                            <div className="space-y-2">
                                {(selectedLog.items || []).map((it, i) => (
                                    <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                                            <span className="font-semibold text-white/90 text-sm">{it.appName}</span>
                                        </div>
                                        {it.detail && (
                                            <p className="mt-1.5 text-[12.5px] text-white/60 leading-relaxed">{it.detail}</p>
                                        )}
                                        {it.learned && (
                                            <div className="mt-2 rounded-xl bg-violet-500/10 border border-violet-400/20 px-3 py-2">
                                                <span className="text-[11px] text-violet-300/80 font-semibold">TA 知道了：</span>
                                                <p className="text-[12.5px] text-violet-100/90 leading-relaxed mt-0.5">{it.learned}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReversePanel;
