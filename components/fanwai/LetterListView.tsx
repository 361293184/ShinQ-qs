/**
 * 拾光 · L3a 来信列表（按年份分章）。
 *
 * 年份本身做成一条「年份章」分隔条，下面是该年的信；组内最新在上（打开信件匣的第一诉求
 * 是「看看最近写了什么」）。未拆的信带醒目角标，迟到的信带「迟到」角标 —— 迟到是特质，不是 bug。
 */

import React from 'react';
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import type { LetterRecord } from '../../types';
import { groupLettersByYear, shelfDateText } from '../../utils/letter/shelf';
import { getPaperTheme } from '../../utils/letter/paperThemes';

interface LetterListViewProps {
    charName: string;
    letters: LetterRecord[];
    onOpen: (letter: LetterRecord) => void;
    onBack: () => void;
    onClose: () => void;
}

const LetterListView: React.FC<LetterListViewProps> = ({ charName, letters, onOpen, onBack, onClose }) => {
    const groups = groupLettersByYear(letters);

    return (
        <div className="h-full w-full bg-[#FDF8F0] flex flex-col font-sans overflow-hidden">
            {/* 顶部栏 */}
            <div className="bg-white/70 backdrop-blur-md border-b border-[#F0E4D2] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2 -ml-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer"
                        aria-label="返回"
                    >
                        <CaretLeft className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                    <span className="font-bold text-[#4A3F35] text-sm tracking-wide">
                        来信 · {charName}
                    </span>
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

            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-10">
                {groups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center px-8">
                        <p className="text-[#4A3F35] font-bold text-sm">还没有来信</p>
                        <p className="text-xs text-[#8A7A6C] mt-1.5 leading-relaxed">
                            到了重要日子，ta 会给你写一封信，信封会落在聊天里。
                        </p>
                    </div>
                ) : (
                    groups.map(group => (
                        <div key={group.year}>
                            {/* 年份章 */}
                            <div className="flex items-center gap-3 my-4 first:mt-1">
                                <span className="rounded-full border border-[#E8845A]/40 px-2.5 py-0.5 text-[11px] font-bold text-[#E8845A]">
                                    {group.year}
                                </span>
                                <span className="h-px flex-1 bg-[#F0E4D2]" />
                                <span className="text-[10px] text-[#C4B8A9]">{group.items.length} 封</span>
                            </div>

                            <div className="space-y-2.5">
                                {group.items.map((letter, i) => {
                                    const theme = getPaperTheme(letter.paperTheme);
                                    return (
                                        <button
                                            type="button"
                                            key={letter.id}
                                            onClick={() => onOpen(letter)}
                                            style={{ animationDelay: `${i * 30}ms` }}
                                            className="flex w-full items-center gap-3 rounded-2xl border border-[#F0E4D2] bg-white/85 p-3.5 text-left shadow-[0_6px_20px_rgba(74,63,53,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(74,63,53,0.12)] active:scale-[0.98] cursor-pointer"
                                        >
                                            {/* 迷你信封（配色跟随该信的节日主题） */}
                                            <span
                                                className="relative shrink-0 rounded-lg"
                                                style={{ width: 42, height: 30, background: theme.paper, border: `1px solid ${theme.stamp}55` }}
                                            >
                                                <span
                                                    aria-hidden
                                                    className="absolute inset-0 rounded-lg"
                                                    style={{ background: `${theme.stamp}18`, clipPath: 'polygon(0 0, 100% 0, 50% 58%)' }}
                                                />
                                                <span
                                                    className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                                                    style={{ background: theme.seal }}
                                                />
                                            </span>

                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="truncate text-[13px] font-bold text-[#4A3F35]">{letter.title}</span>
                                                    {!letter.readAt && (
                                                        <span className="shrink-0 rounded-full bg-[#E8845A] px-1.5 py-0.5 text-[9px] font-bold text-white">未拆</span>
                                                    )}
                                                    {letter.lateFor && (
                                                        <span className="shrink-0 rounded-full bg-[#F0E4D2] px-1.5 py-0.5 text-[9px] font-bold text-[#8A7A6C]">迟到</span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 block truncate text-[10px] text-[#B5A89A]">
                                                    {letter.occasion.name} · {shelfDateText(letter.createdAt)}
                                                </span>
                                            </span>

                                            <CaretRight className="w-4 h-4 shrink-0 text-[#C4B8A9]" weight="bold" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default LetterListView;
