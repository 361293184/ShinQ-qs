/**
 * 回信全文弹窗（用户自己写的那封）。
 *
 * 与来信浮层同一套约定：淡遮罩 + 白色圆角卡片 + 内容区滚动 + createPortal 到 body。
 * 视觉上刻意与「ta 写的信」区分：不用信纸皮肤，改成白底 + 主题色的浅描边，
 * 墨色更浅 —— 一眼能看出哪封是我写的。
 * 但**字体不区分**：字体跟着原信的节庆走（新年宋体 / 其他楷体）。两封信字不一样
 * 会显得「不是一本书里的东西」。
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LetterPaperThemeId } from '../../types';
import { getPaperTheme } from '../../utils/letter/paperThemes';
import { HANDWRITING_STACK, SERIF_STACK } from '../../utils/letter/fontStacks';
import HandwritingText from './HandwritingText';

interface LetterReplyViewProps {
    text: string;
    occasion: string;
    /** 原信主题：与来信卡片配同一色系。 */
    paperTheme?: LetterPaperThemeId;
    onClose: () => void;
}

const LetterReplyView: React.FC<LetterReplyViewProps> = ({ text, occasion, paperTheme, onClose }) => {
    const theme = getPaperTheme(paperTheme || 'default');
    /**
     * 字体跟着原信的节庆走：我看的那封是宋体信笺，回头看自己写的这封也该是宋体 ——
     * 两封信的字不一样会显得「不是一本书里的东西」。非新年仍用手写楷体。
     */
    const stack = theme.festive ? SERIF_STACK : HANDWRITING_STACK;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-5" onClick={onClose}>
            {/* 遮罩与来信浮层同一档淡度 —— 用户明确不接受把背景压黑 */}
            <div className="absolute inset-0 bg-black/25" onClick={onClose} />

            <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                <div className="overflow-hidden rounded-[2rem] bg-white shadow-2xl">
                    <div className="px-6 pt-5 pb-0.5 text-center">
                        <span
                            className="text-[12px]"
                            style={{ fontFamily: stack, fontWeight: 400, color: theme.stamp }}
                        >
                            我的回信{occasion ? ` · ${occasion}` : ''}
                        </span>
                    </div>

                    <div className="max-h-[58vh] overflow-y-auto no-scrollbar px-6 pb-2 pt-4">
                        {theme.festive ? (
                            /* 新年：原信是宋体整齐排印，这封也照排 —— 不加逐字扰动，宋体加扰动只会显脏 */
                            <div
                                className="text-[15.5px]"
                                style={{ fontFamily: stack, fontWeight: 400, lineHeight: 1.95, color: '#475569', whiteSpace: 'pre-wrap' }}
                            >
                                {text}
                            </div>
                        ) : (
                            <HandwritingText
                                text={text}
                                seed={`reply-${occasion}`}
                                className="block"
                                style={{
                                    fontFamily: stack,
                                    fontWeight: 400,
                                    fontSize: 15.5,
                                    lineHeight: 1.95,
                                    letterSpacing: 0,
                                    color: '#475569',
                                }}
                            />
                        )}
                    </div>

                    <div className="px-6 pb-5 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-500 transition-transform active:scale-95 cursor-pointer"
                        >
                            收下
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default LetterReplyView;
