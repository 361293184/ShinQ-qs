/**
 * 拾光 · 来信详情。
 *
 * 与番外不同：信本来就是 ta 写的，「转发给 ta」是自我循环，所以主操作是**回信**，
 * 次操作是「删除 / 回聊天」。
 */

import React, { useRef, useState } from 'react';
import { CaretLeft, ChatCircleDots, Trash, X } from '@phosphor-icons/react';
import type { LetterRecord } from '../../types';
import { getPaperTheme } from '../../utils/letter/paperThemes';
import { shelfDateText } from '../../utils/letter/shelf';
import LetterPaper from '../letter/LetterPaper';

interface LetterDetailViewProps {
    letter: LetterRecord;
    onReply: (letter: LetterRecord, text: string) => void | Promise<void>;
    onDelete: (letter: LetterRecord) => void | Promise<void>;
    /** 去聊天找这个角色（可选）。 */
    onOpenChat?: (letter: LetterRecord) => void;
    onBack: () => void;
    onClose: () => void;
}

const LetterDetailView: React.FC<LetterDetailViewProps> = ({
    letter, onReply, onDelete, onOpenChat, onBack, onClose,
}) => {
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [sentReply, setSentReply] = useState('');
    const [sending, setSending] = useState(false);
    const theme = getPaperTheme(letter.paperTheme);
    const replyRef = useRef<HTMLTextAreaElement>(null);

    const openReply = () => {
        setReplyOpen(true);
        window.setTimeout(() => replyRef.current?.focus(), 30);
    };

    const submitReply = async () => {
        const text = replyText.trim();
        if (!text || sending) return;
        setSending(true);
        try {
            await onReply(letter, text);
            setSentReply(text);
            setReplyText('');
            setReplyOpen(false);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="h-full w-full bg-[#FDF8F0] flex flex-col font-sans overflow-hidden">
            {/* 顶部栏 */}
            <div className="bg-white/70 backdrop-blur-md border-b border-[#F0E4D2] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2 -ml-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer"
                        aria-label="返回来信列表"
                    >
                        <CaretLeft className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                    <span className="font-bold text-[#4A3F35] text-sm tracking-wide">拾光 · 来信</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 -mr-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer"
                        aria-label="关闭"
                    >
                        <X className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                </div>
            </div>

            {/* 信纸 */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
                <p className="mb-2 text-center text-[10px] text-[#C4B8A9]">
                    {letter.charName} · {letter.occasion.name} · 收藏于 {shelfDateText(letter.createdAt)}
                </p>
                <div className="mx-auto max-w-md">
                    <LetterPaper letter={letter} />
                </div>

                {sentReply && (
                    <div
                        className="mx-auto mt-3 max-w-md rounded-2xl border px-4 py-3"
                        style={{ background: `${theme.stamp}0f`, borderColor: `${theme.stamp}33` }}
                    >
                        <div className="mb-1 text-[10px] font-bold" style={{ color: theme.stamp }}>我的回信</div>
                        <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-600">{sentReply}</div>
                    </div>
                )}

                {replyOpen && (
                    <div className="mx-auto mt-3 max-w-md">
                        <textarea
                            ref={replyRef}
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="在信纸背面写点什么…"
                            className="w-full resize-none rounded-2xl bg-white border border-[#F0E4D2] px-4 py-3 text-sm text-[#4A3F35] outline-none focus:border-[#E8845A]/60"
                        />
                    </div>
                )}
            </div>

            {/* 底部操作 */}
            <div
                className="fixed bottom-0 inset-x-0 px-4 pt-3 bg-gradient-to-t from-[#FDF8F0] via-[#FDF8F0]/90 to-transparent"
                style={{ paddingBottom: 'max(1.25rem, var(--safe-bottom, 0px))' }}
            >
                <div className="flex gap-2.5 max-w-lg mx-auto">
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/90 border border-[#F0E4D2] py-3 px-4 text-xs font-bold text-[#E8604C] active:scale-[0.97] transition-all cursor-pointer"
                    >
                        <Trash className="w-3.5 h-3.5" weight="bold" />
                        删除
                    </button>
                    {onOpenChat && (
                        <button
                            type="button"
                            onClick={() => onOpenChat(letter)}
                            className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/90 border border-[#F0E4D2] py-3 px-4 text-xs font-bold text-[#8A7A6C] active:scale-[0.97] transition-all cursor-pointer"
                        >
                            <ChatCircleDots className="w-3.5 h-3.5" weight="bold" />
                            去聊天
                        </button>
                    )}
                    {replyOpen ? (
                        <>
                            <button
                                type="button"
                                onClick={() => { setReplyOpen(false); setReplyText(''); }}
                                className="flex-1 rounded-2xl bg-white border border-[#F0E4D2] py-3 text-xs font-bold text-[#8A7A6C] active:scale-[0.98] transition-transform cursor-pointer"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={submitReply}
                                disabled={!replyText.trim() || sending}
                                className="flex-1 rounded-2xl py-3 text-xs font-bold text-white bg-gradient-to-r from-[#F0A93B] via-[#E8845A] to-[#C96F8A] shadow-md shadow-[#E8845A]/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {sending ? '寄出中…' : '寄出'}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={openReply}
                            disabled={!!sentReply}
                            className="flex-1 rounded-2xl py-3 text-xs font-bold text-white bg-gradient-to-r from-[#F0A93B] via-[#E8845A] to-[#C96F8A] shadow-md shadow-[#E8845A]/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {sentReply ? '已回信' : '回信'}
                        </button>
                    )}
                </div>
            </div>

            {/* 删除二次确认 */}
            {confirmingDelete && (
                <div
                    className="fixed bottom-0 inset-x-0 px-4 z-[95]"
                    style={{ paddingBottom: 'max(6.5rem, calc(var(--safe-bottom, 0px) + 4.5rem))' }}
                >
                    <div className="max-w-lg mx-auto rounded-2xl bg-[#2A1B1B] border border-[#E8604C]/40 shadow-[0_12px_40px_rgba(0,0,0,0.35)] p-4 animate-slide-up">
                        <p className="text-sm font-bold text-[#FFF5F2]">确定从拾光移除「{letter.title}」吗？</p>
                        <p className="text-[11px] text-[#D9A9A1] mt-1">只从收藏馆移除，聊天里那封信还在。此操作可撤销。</p>
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmingDelete(false)}
                                className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-[#FFE3DC] hover:bg-white/15 transition-colors cursor-pointer"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={() => { setConfirmingDelete(false); void onDelete(letter); }}
                                className="flex-1 rounded-xl bg-gradient-to-r from-[#E8604C] to-[#C9372A] py-2.5 text-xs font-bold text-white shadow-md shadow-[#E8604C]/30 hover:brightness-110 transition-all cursor-pointer"
                            >
                                确认移除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LetterDetailView;
