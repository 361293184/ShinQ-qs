/** 现实桥 · 通用多步向导壳：步骤指示器 + 内容 + 上一步/下一步/保存。 */
import React from 'react';
import { CaretLeft, CaretRight, Check, X } from '@phosphor-icons/react';

export type WizardStepProps = {
    step: number;
    total: number;
    onNext: () => void;
    onBack: () => void;
    onClose: () => void;
    canNext: boolean;
    saving?: boolean;
};

type StepWizardProps = {
    title: string;
    icon?: React.ReactNode;
    stepNames: readonly string[];
    step: number;
    children: React.ReactNode;
    footer?: React.ReactNode;
    onBack: () => void;
    onClose: () => void;
};

export function StepDots({ current, total }: { current: number; total: number }): React.ReactElement {
    return (
        <div className="flex items-center gap-1.5">
            {Array.from({ length: total }, (_, i) => (
                <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i < current ? 'w-4 bg-[#7F8C52]' : i === current ? 'w-4 bg-[#B4C198]' : 'w-1.5 bg-[#E5E0D2]'}`}
                />
            ))}
        </div>
    );
}

export function StepWizardShell({
    title, icon, stepNames, step, children, footer, onBack, onClose,
}: StepWizardProps): React.ReactElement {
    return (
        // 居中弹窗（原来是贴底抽屉）：抽屉在手机上会被浏览器底栏 / home 条盖住，
        // 导致底部「上一步 / 下一步 / 保存」看不全。改成居中后四周都留出安全区余量。
        <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-[#4A3F35]/35 backdrop-blur-sm px-3"
            style={{
                // 顶部让开 SullyOS 状态栏（状态栏隐藏时自动塌回 --safe-top），
                // 底部避开 iOS home 条 / 浏览器底栏
                paddingTop: 'max(12px, var(--chrome-top))',
                paddingBottom: 'max(12px, var(--safe-bottom))',
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                // max-h-full：高度上限由外层 padding 决定，比 max-h-[88vh] 稳
                // （vh 在移动端会算进浏览器工具栏，是这次「显示不全」的原因之一）
                className="w-full max-w-md max-h-full bg-[#FFFDF8] rounded-3xl border border-[#EDE7D8] shadow-[0_20px_60px_rgba(74,63,53,0.28)] flex flex-col overflow-hidden animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* 头：标题 + 步骤名（弹窗模式不再需要拖拽条） */}
                <div className="shrink-0 px-5 pt-4 pb-3 border-b border-[#EFEAE0]">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-[#3A3A38] flex items-center gap-2 text-sm">
                            {icon}
                            {title}
                        </h3>
                        <button onClick={onClose} aria-label="关闭" className="p-2 -mr-2 rounded-full hover:bg-[#F3EFE6] transition-colors cursor-pointer">
                            <X className="w-4 h-4 text-[#A89B7F]" weight="bold" />
                        </button>
                    </div>
                    {/* 步骤名（横向滚动适应超长步骤名） */}
                    <div className="mt-2.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {stepNames.map((name, i) => (
                            <div key={name} className="flex items-center gap-1 shrink-0">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${i <= step ? 'bg-[#ECEFDF] text-[#6F7C54]' : 'text-[#BDB5A4]'}`}>{name}</span>
                                {i < stepNames.length - 1 && <span className="text-[#D8D2C0] text-[8px]">›</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 内容区：min-h-0 必须有——flex 子项默认 min-height:auto 不肯收缩，
                    长内容会把底部按钮挤出 max-h 之外并被 overflow-hidden 裁掉（本次的根因） */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 no-scrollbar">{children}</div>

                {/* 脚部：始终固定在弹窗底部，不参与滚动（安全区余量已由外层 padding 提供） */}
                {footer ? (
                    <div className="shrink-0 px-5 py-3 border-t border-[#EFEAE0] bg-[#FFFDF8]">{footer}</div>
                ) : null}
            </div>
        </div>
    );
}

/** 标准向导底部按钮条。 */
export function WizardFooter({ onBack, onNext, canNext, backLabel = '上一步', nextLabel = '下一步' }: {
    onBack: () => void;
    onNext: () => void;
    canNext?: boolean;
    backLabel?: string;
    nextLabel?: string;
}): React.ReactElement {
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={onBack}
                className="flex items-center gap-1 rounded-2xl bg-[#F3EFE6] text-[#8A8172] px-4 py-2.5 text-xs font-bold hover:bg-[#ECE7DA] transition-colors cursor-pointer"
            >
                <CaretLeft className="w-3.5 h-3.5" weight="bold" />
                {backLabel}
            </button>
            <button
                onClick={onNext}
                disabled={canNext === false}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-[#7F8C52] text-white px-4 py-2.5 text-xs font-bold shadow-sm shadow-[#7F8C52]/25 hover:bg-[#71804A] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {nextLabel}
                {nextLabel === '保存' ? <Check className="w-3.5 h-3.5" weight="bold" /> : <CaretRight className="w-3.5 h-3.5" weight="bold" />}
            </button>
        </div>
    );
}

/** 向导内文字块。 */
export function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
    return <p className="text-[11px] leading-relaxed text-[#A89B7F]">{children}</p>;
}

/** 向导内输入行。 */
export function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
    return (
        <label className="block">
            <span className="block text-[11px] font-bold text-[#6F7C54] mb-1.5">{label}</span>
            {children}
        </label>
    );
}

export const inputCls =
    'w-full rounded-xl border border-[#E5E0D2] bg-white px-3 py-2 text-[13px] text-[#3A3A38] outline-none focus:border-[#B4C198] focus:ring-2 focus:ring-[#B4C198]/20 transition-all placeholder:text-[#C4BDAC]';

export function CopyBlock({ text }: { text: string }): React.ReactElement {
    const copy = () => {
        try {
            void navigator.clipboard.writeText(text);
        } catch { /* ignore */ }
    };
    return (
        <div className="rounded-xl border border-[#E5E0D2] bg-[#F7F4EC] p-3">
            <pre className="text-[10px] text-[#6F7C54] whitespace-pre-wrap leading-relaxed break-all font-mono">{text}</pre>
            <button onClick={copy} className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#7F8C52] hover:text-[#71804A] cursor-pointer">
                复制到剪贴板
            </button>
        </div>
    );
}
