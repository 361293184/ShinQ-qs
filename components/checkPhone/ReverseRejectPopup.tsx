/**
 * 反查手机 · 拒绝后意见弹窗
 *
 * 角色被拒绝查看手机后，弹出 TA 的小意见（按角色性格 AI 生成），
 * 右上角 X 可关闭，一次最多 3 条（防刷屏），并可立即重新发起请求。
 */
import React from 'react';
import { X, PhoneDisconnect } from '@phosphor-icons/react';

interface ReverseRejectPopupProps {
    open: boolean;
    /** 角色名 */
    charName: string;
    /** 角色意见列表（最多 3 条，AI 生成） */
    opinions?: string[];
    /** 关闭弹窗 */
    onClose: () => void;
    /** 重新发起查看请求 */
    onRequestAgain?: () => void;
}

const ReverseRejectPopup: React.FC<ReverseRejectPopupProps> = ({
    open, charName, opinions = [], onClose, onRequestAgain,
}) => {
    if (!open) return null;
    const shown = opinions.slice(0, 3);

    return (
        <div className="fixed inset-0 z-[94] flex items-end justify-center p-4 pb-10 animate-fade-in">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl animate-slide-up">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{charName}</span>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 active:scale-90 transition">
                        <X size={18} weight="bold" />
                    </button>
                </div>

                {shown.length > 0 ? (
                    <div className="mt-3 space-y-2">
                        {shown.map((o, i) => (
                            <div key={i} className="bg-rose-50 text-rose-700 text-[13px] rounded-2xl px-3 py-2 leading-relaxed">
                                {o}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-[13px] text-slate-500 text-center">哼，小气。{charName} 看了一眼被拒绝，有点不开心。</p>
                )}

                {onRequestAgain && (
                    <div className="mt-4">
                        <button
                            onClick={onRequestAgain}
                            className="w-full py-2.5 rounded-2xl bg-rose-500 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform">
                            <PhoneDisconnect size={16} weight="bold" />
                            再让我看一眼
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReverseRejectPopup;
