/**
 * 反查手机 · 接管覆盖层（顶部悬浮椭圆胶囊）
 *
 * 挂在 PhoneShell 全局层（z-index 高于普通 App），角色接管真实 SullyOS 时显示：
 *  - 顶部居中悬浮的椭圆胶囊（不占满整条，避开状态栏）
 *  - 红色呼吸光晕 + 微小 scale 呼吸，营造"被监视/偷看"氛围
 *  - 暂停 / 继续 / 关闭
 */
import React from 'react';
import { Pause, Play, X, ChatCircleText } from '@phosphor-icons/react';
import type { ReverseTakeoverState } from '../../types';

interface ReverseOverlayProps {
    state: ReverseTakeoverState;
    onPause?: () => void;
    onResume?: () => void;
    onClose: () => void;
    /** 替用户回消息（角色偷看手机后，以用户身份发给私聊对象） */
    onReply?: () => void;
}

const ReverseOverlay: React.FC<ReverseOverlayProps> = ({
    state, onPause, onResume, onClose, onReply,
}) => {
    if (!state.active) return null;
    const paused = !!state.paused;

    return (
        <div className="fixed top-0 left-0 right-0 z-[95] pointer-events-none"
            style={{ top: 'max(env(safe-area-inset-top), 12px)' }}>
            <div
                className="pointer-events-auto mx-auto w-max max-w-[86%] flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-xl border border-rose-500/30 hover:border-rose-400/60 transition-colors"
                style={{ animation: 'reverseTakeoverPulse 2s ease-in-out infinite' }}>
                <style>{`@keyframes reverseTakeoverPulse{0%,100%{box-shadow:0 0 12px rgba(239,68,68,0.25);transform:scale(1)}50%{box-shadow:0 0 26px rgba(239,68,68,0.5);transform:scale(1.03)}}`}</style>

                {/* 红色脉冲圆点 */}
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0"
                    style={{ animation: 'reverseTakeoverDot 1s ease-in-out infinite' }} />
                <style>{`@keyframes reverseTakeoverDot{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

                {/* 中间文字 */}
                <span className="text-white text-[12.5px] font-semibold truncate leading-none">
                    {paused ? `⏸ ${state.charName} 暂停查看` : `👁 ${state.charName} 在看你手机`}
                </span>

                {/* 暂停/继续 + 替回 + 关闭 */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {onReply && (
                        <button onClick={onReply} title="替用户回消息"
                            className="w-7 h-7 rounded-full bg-sky-500/90 text-white flex items-center justify-center active:scale-90 transition hover:bg-sky-500">
                            <ChatCircleText size={13} weight="fill" />
                        </button>
                    )}
                    {paused ? (
                        onResume && (
                            <button onClick={onResume} title="继续"
                                className="w-7 h-7 rounded-full bg-emerald-500/90 text-white flex items-center justify-center active:scale-90 transition hover:bg-emerald-500">
                                <Play size={13} weight="fill" />
                            </button>
                        )
                    ) : (
                        onPause && (
                            <button onClick={onPause} title="暂停"
                                className="w-7 h-7 rounded-full bg-amber-500/90 text-white flex items-center justify-center active:scale-90 transition hover:bg-amber-500">
                                <Pause size={13} weight="fill" />
                            </button>
                        )
                    )}
                    <button onClick={onClose} title="结束查看"
                        className="w-7 h-7 rounded-full bg-rose-500/90 text-white flex items-center justify-center active:scale-90 transition hover:bg-rose-500">
                        <X size={14} weight="bold" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReverseOverlay;
