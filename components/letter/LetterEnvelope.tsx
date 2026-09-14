/**
 * 来信浮层：信封弹出 → 点一下拆开 → 信纸展开 → 回信 / 收下。
 *
 * 视觉对齐项目标准弹窗（components/os/Modal.tsx）：淡遮罩 + 白色圆角卡片，
 * 不是全屏黑。两个阶段都是「正常弹窗」尺寸：
 *   - 信封阶段：小卡片（≤240px），轻触拆开
 *   - 信纸阶段：弹窗卡片（≤384px），信纸内容区可滚动，底部「回信 / 收下」
 *
 * 必须 portal 到 body：App.tsx 包 PhoneShell 的那层 div 有 transform: translateZ(0)，
 * 后代 position: fixed 会以该祖先为基准而非视口，直接渲染会错位。
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LetterRecord } from '../../types';
import { getPaperTheme } from '../../utils/letter/paperThemes';
import LetterPaper from './LetterPaper';
import LetterFireworks from './LetterFireworks';
import { CornerOrnament, FireworkBurst } from './StationeryOrnaments';
import { SERIF_STACK } from '../../utils/letter/fontStacks';
import './LetterPaper.css';

/** 卡面文字与信内同一套字体栈，避免信封上冒出 UI 字体。 */
const CARD_FONT = SERIF_STACK;

/** 钢笔符号：信末的回信入口，代替「回信」两个字。 */
const PenGlyph: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
    >
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
    </svg>
);

interface LetterEnvelopeProps {
    letter: LetterRecord;
    onClose: () => void;
    /** 提交回信；不传则不显示回信入口（纯阅读）。 */
    onReply?: (text: string) => void | Promise<void>;
}

const LetterEnvelope: React.FC<LetterEnvelopeProps> = ({ letter, onClose, onReply }) => {
    const [opened, setOpened] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [sentReply, setSentReply] = useState('');
    const [sending, setSending] = useState(false);
    const theme = getPaperTheme(letter.paperTheme);
    const gold = theme.innerBorder || '#C9A227';
    // 节庆主题（新年）才走夜空 + 烟花 + 红金信封；其他主题一行不差走原分支。
    const festive = !!theme.festive;
    const replyRef = useRef<HTMLTextAreaElement>(null);

    // ESC 关闭。
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        if (replyOpen) replyRef.current?.focus();
    }, [replyOpen]);

    const submitReply = async () => {
        const text = replyText.trim();
        if (!text || sending || !onReply) return;
        setSending(true);
        try {
            await onReply(text);
            setSentReply(text);
            setReplyText('');
            setReplyOpen(false);
        } finally {
            setSending(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4" onClick={onClose}>
            {/* 遮罩：只用很淡的一层 —— 弹窗外要看得见后面的界面，只是略暗一点点。
                新年也只是把这一层调暖一些让金色烟花看得清，不再压「夜空黑底」。 */}
            <div
                className="absolute inset-0 bg-black/25"
                style={festive ? { background: 'rgba(46, 14, 20, 0.30)' } : undefined}
                onClick={onClose}
            />
            {festive && <LetterFireworks />}

            {!opened ? (
                festive ? (
                    /* ---------- 新年：卡片形式（红底金框 + 金色标题 + 福印，不再做成信封/红包形状） ---------- */
                    <button
                        type="button"
                        aria-label="打开这封信"
                        onClick={(e) => { e.stopPropagation(); setOpened(true); }}
                        className="letter-st-paper group relative z-10 aspect-[4/5] w-full max-w-[264px] cursor-pointer overflow-hidden rounded-[20px] shadow-[0_24px_56px_-20px_rgba(0,0,0,0.55)] transition-transform active:scale-[0.98]"
                    >
                        {/* 金线框 + 四角回纹：与信纸同一套「函套」语汇 —— 开信前后是同一个物件，
                            不该在拆开的瞬间换一种设计语言。 */}
                        <span aria-hidden className="letter-st-frame" />
                        <CornerOrnament corner="tl" color={gold} size={20} className="letter-st-corner letter-st-corner--tl" />
                        <CornerOrnament corner="tr" color={gold} size={20} className="letter-st-corner letter-st-corner--tr" />
                        <CornerOrnament corner="br" color={gold} size={20} className="letter-st-corner letter-st-corner--br" />
                        <CornerOrnament corner="bl" color={gold} size={20} className="letter-st-corner letter-st-corner--bl" />

                        {/* 两枚小烟花：剪影式点缀，说明这是封「年节」的信 */}
                        <FireworkBurst size={38} color={gold} rays={16} style={{ position: 'absolute', left: '12%', top: '13%', opacity: 0.8 }} />
                        <FireworkBurst size={24} color={gold} rays={12} showTips={false} style={{ position: 'absolute', right: '13%', top: '22%', opacity: 0.55 }} />

                        <div className="relative flex h-full flex-col items-center justify-center px-7">
                            <span style={{ fontFamily: CARD_FONT, color: '#E8C87A', fontSize: 30, letterSpacing: '0.2em', lineHeight: 1.4 }}>
                                {letter.occasion.name}
                            </span>
                            <span className="mt-2.5" style={{ fontFamily: CARD_FONT, color: 'rgba(239,224,210,0.66)', fontSize: 12, letterSpacing: '0.4em' }}>
                                {letter.year} · 来信
                            </span>

                            <span
                                aria-hidden
                                className="my-7 h-px w-16"
                                style={{ background: `linear-gradient(90deg, transparent, ${gold}, transparent)` }}
                            />

                            <span
                                className="transition-transform group-hover:translate-y-0.5"
                                style={{ fontFamily: CARD_FONT, color: 'rgba(239,224,210,0.82)', fontSize: 13, letterSpacing: '0.26em' }}
                            >
                                轻触打开
                            </span>
                        </div>

                        {/* 右下金印（福） */}
                        <span
                            className="absolute bottom-5 right-5 flex h-10 w-10 items-center justify-center rounded-full"
                            style={{ background: theme.seal, color: '#8A1A12', boxShadow: '0 0 0 3px rgba(232,200,122,0.22)' }}
                        >
                            <span style={{ fontFamily: CARD_FONT, fontSize: 17, lineHeight: 1 }}>福</span>
                        </span>
                    </button>
                ) : (
                    /* ---------- 其他主题：原米色信封，一行不变 ---------- */
                    <button
                        type="button"
                        aria-label="拆开信封"
                        onClick={(e) => { e.stopPropagation(); setOpened(true); }}
                        className="group relative z-10 w-full max-w-[240px] aspect-[3/2] cursor-pointer rounded-2xl transition-transform active:scale-[0.98]"
                        style={{
                            background: 'linear-gradient(158deg, #FBF7F0 0%, #EFE7DA 100%)',
                            boxShadow: '0 20px 44px -16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.7)',
                        }}
                    >
                        {/* 封盖三角 */}
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 rounded-2xl"
                            style={{
                                background: 'linear-gradient(180deg, #F3EADB 0%, #E7DCC9 100%)',
                                clipPath: 'polygon(0 0, 100% 0, 50% 62%)',
                            }}
                        />
                        {/* 火漆印（颜色跟随信纸主题） */}
                        <span
                            className="absolute left-1/2 top-[46%] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white transition-transform group-hover:scale-110"
                            style={{ background: theme.seal, boxShadow: '0 3px 10px rgba(0,0,0,0.35)' }}
                        >
                            <span className="text-base leading-none">✦</span>
                        </span>
                        <span className="absolute inset-x-0 bottom-2.5 text-center text-[10px] font-bold tracking-widest" style={{ color: '#9C8E78' }}>
                            轻触拆开
                        </span>
                    </button>
                )
            ) : (
                /* ---------- 信纸：正常弹窗（抬头 / 祝语钉住，只有正文滚） ---------- */
                <div className="relative z-10 w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
                    <div
                        className="flex max-h-[72vh] flex-col overflow-hidden rounded-[2rem] shadow-2xl"
                        // 新年时信纸自带红包壳，外层卡托透明；其他主题仍是白色卡托。
                        style={{ background: festive ? 'transparent' : '#FFFFFF' }}
                    >
                        {/* 信纸：正文在它自己内部滚（scrollBody），抬头与祝语不跟着动。
                            高度上限交给外面这层 max-h —— 信纸只负责「被压到多高就滚多少」。 */}
                        <LetterPaper letter={letter} scrollBody className="mx-2 mt-2 min-h-0" />

                        {/* 页脚：回信入口钉在弹窗底部，不跟着正文滚 */}
                        <div className="shrink-0 px-2 pb-2 pt-2">
                            {sentReply && (
                                <div
                                    className="mx-2 mt-3 rounded-2xl border px-4 py-3"
                                    style={{ background: `${theme.stamp}0f`, borderColor: `${theme.stamp}33` }}
                                >
                                    <div className="mb-1 text-[10px] font-bold" style={{ color: theme.stamp, fontFamily: CARD_FONT }}>我的回信</div>
                                    <div className="whitespace-pre-wrap text-[14px] leading-relaxed" style={{ fontFamily: CARD_FONT, color: '#4A3A22' }}>{sentReply}</div>
                                </div>
                            )}

                            {/* ── 信的末尾：回信入口 ──
                                不再做成弹窗底部固定操作栏，而是跟着信纸一起滚 —— 读完整封信，笔就落在纸的尽头。
                                入口只留一支钢笔符号（不再写「回信」两个字）；也不给「收下」——点弹窗外、空白处或按 ESC 都能关。 */}
                            {onReply && !sentReply && (
                                <div className="flex flex-col items-center px-4 pb-2 pt-4">
                                    {!replyOpen ? (
                                        <button
                                            type="button"
                                            aria-label="回信"
                                            title="回信"
                                            onClick={() => setReplyOpen(true)}
                                            className="flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-90"
                                            style={{
                                                background: theme.paper,
                                                color: festive ? '#F2D9A0' : theme.ink,
                                                border: `1px solid ${festive ? gold : theme.stamp}44`,
                                                boxShadow: '0 10px 26px -12px rgba(0,0,0,0.55)',
                                            }}
                                        >
                                            <PenGlyph className="h-[22px] w-[22px]" />
                                        </button>
                                    ) : (
                                        <div className="w-full">
                                            <textarea
                                                ref={replyRef}
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                rows={3}
                                                maxLength={500}
                                                placeholder="在信的末尾写点什么…"
                                                className="w-full resize-none rounded-2xl bg-white/95 px-4 py-3 text-[15px] leading-relaxed outline-none"
                                                style={{
                                                    fontFamily: CARD_FONT,
                                                    color: '#4A3A22',
                                                    boxShadow: `0 0 0 1px ${theme.stamp}33, 0 12px 26px -16px rgba(0,0,0,0.5)`,
                                                }}
                                            />
                                            <div className="mt-2 flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setReplyOpen(false); setReplyText(''); }}
                                                    className="rounded-full bg-white/70 px-4 py-1.5 text-[13px] font-bold text-slate-500 transition-transform active:scale-95"
                                                    style={{ fontFamily: CARD_FONT }}
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={submitReply}
                                                    disabled={!replyText.trim() || sending}
                                                    className="rounded-full bg-primary px-5 py-1.5 text-[13px] font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                                    style={{ fontFamily: CARD_FONT }}
                                                >
                                                    {sending ? '寄出中…' : '寄出'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
};

export default LetterEnvelope;
