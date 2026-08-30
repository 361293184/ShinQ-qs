/**
 * 反查手机 · 警示弹窗
 *
 * 角色请求查看用户真实手机的红色预警覆盖层：
 *  - 全屏红色调 + 动态呼吸/闪烁动画
 *  - 固定标题 + 角色生成的一段请求语
 *  - 同意 / 拒绝
 */
import React from 'react';
import { Warning } from '@phosphor-icons/react';

interface ReverseAccessModalProps {
    open: boolean;
    /** 正在请求反查的角色名 */
    charName: string;
    /** 角色请求语（AI 生成，按角色性格） */
    requestText?: string;
    /** 同意 */
    onAgree: () => void;
    /** 拒绝 */
    onReject: () => void;
}

const ReverseAccessModal: React.FC<ReverseAccessModalProps> = ({
    open, charName, requestText, onAgree, onReject,
}) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-6 animate-fade-in">
            {/* 红色预警覆盖层 */}
            <div className="absolute inset-0 bg-[#4a0d0d]/90 backdrop-blur-md" style={{ animation: 'reverseAlertPulse 1.8s ease-in-out infinite' }} />
            <style>{`@keyframes reverseAlertPulse{0%,100%{opacity:0.92}50%{opacity:1}}`}</style>

            <div className="relative w-full max-w-sm rounded-[2rem] border border-red-400/40 bg-[#3a0707] p-6 text-center shadow-2xl animate-slide-up"
                style={{ boxShadow: '0 0 40px rgba(239,68,68,0.35)' }}>
                {/* 动态闪烁的警告图标 */}
                <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4"
                    style={{ animation: 'reverseAlertBlink 1s ease-in-out infinite' }}>
                    <Warning size={36} weight="fill" className="text-red-400" />
                </div>
                <style>{`@keyframes reverseAlertBlink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.08)}}`}</style>

                <h3 className="text-lg font-bold text-red-100">
                    ⚠️ {charName} 请求查看你的手机
                </h3>
                <p className="mt-3 text-sm text-red-200/90 leading-relaxed">
                    {requestText || `${charName} 想看看你的手机，就一眼。`}
                </p>

                <div className="mt-6 flex gap-3">
                    <button
                        onClick={onReject}
                        className="flex-1 py-3 rounded-2xl bg-red-500/20 border border-red-400/40 text-red-100 font-bold active:scale-95 transition-transform">
                        拒绝
                    </button>
                    <button
                        onClick={onAgree}
                        className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold active:scale-95 transition-transform hover:bg-red-600">
                        同意
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReverseAccessModal;
