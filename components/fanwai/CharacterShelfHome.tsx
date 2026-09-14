/**
 * 拾光 · L2 角色主页：来信 / 番外 两个入口。
 *
 * 两张卡各带一点预览感（来信用信封叠影、番外用迷你书脊），让它不像两个干巴巴的按钮。
 * 某一类没有内容时卡片置灰不可点。
 */

import React from 'react';
import { BookOpen, CaretLeft, EnvelopeSimple, Feather, X } from '@phosphor-icons/react';
import type { CharShelfSummary } from '../../utils/letter/shelf';
import { shelfCountText, shelfDateText } from '../../utils/letter/shelf';

interface CharacterShelfHomeProps {
    summary: CharShelfSummary;
    onOpenLetters: () => void;
    onOpenFanwai: () => void;
    onBack: () => void;
    onClose: () => void;
}

const CharacterShelfHome: React.FC<CharacterShelfHomeProps> = ({
    summary, onOpenLetters, onOpenFanwai, onBack, onClose,
}) => {
    const letterCount = summary.letters.length;
    const storyCount = summary.stories.length;
    const latestLetter = summary.letters[0]?.createdAt || 0;
    const latestStory = summary.stories[0]?.createdAt || 0;

    return (
        <div className="h-full w-full bg-[#FDF8F0] flex flex-col font-sans overflow-hidden">
            {/* 顶部栏 */}
            <div className="bg-white/70 backdrop-blur-md border-b border-[#F0E4D2] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2 -ml-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer"
                        aria-label="返回角色列表"
                    >
                        <CaretLeft className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                    <span className="flex items-center gap-1.5 font-bold text-[#4A3F35] text-sm tracking-wide">
                        <Feather className="w-3.5 h-3.5 text-[#E8845A]" weight="fill" />
                        收藏馆
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

            <div className="flex-1 overflow-y-auto px-5 pt-7 pb-10">
                {/* 角色头 */}
                <div className="flex flex-col items-center mb-7">
                    {summary.avatar ? (
                        <img src={summary.avatar} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-[#F0A93B]/30" />
                    ) : (
                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#FDE7D7] to-[#EFB6C6] flex items-center justify-center text-[#4A3F35] font-bold text-xl">
                            {summary.charName.slice(0, 1)}
                        </div>
                    )}
                    <p className="mt-3 font-bold text-[#4A3F35] text-base">{summary.charName}</p>
                    <p className="text-[11px] text-[#B5A89A] mt-0.5">{shelfCountText(summary)}</p>
                </div>

                {/* 双入口 */}
                <div className="grid grid-cols-2 gap-3.5 max-w-md mx-auto">
                    {/* 来信 */}
                    <button
                        type="button"
                        onClick={onOpenLetters}
                        disabled={letterCount === 0}
                        className="rounded-3xl bg-white/85 border border-[#F0E4D2] shadow-[0_8px_26px_rgba(74,63,53,0.10)] p-3.5 text-left transition-all enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <div className="relative h-24 rounded-2xl bg-gradient-to-br from-[#FBF0F4] to-[#F3D9E4] flex items-center justify-center overflow-hidden mb-3">
                            {/* 信封叠影 */}
                            <span aria-hidden className="absolute left-1/2 top-1/2 h-12 w-16 -translate-x-[62%] -translate-y-[58%] rotate-[-8deg] rounded-lg bg-white/55" />
                            <span aria-hidden className="absolute left-1/2 top-1/2 h-12 w-16 -translate-x-[38%] -translate-y-[42%] rotate-[6deg] rounded-lg bg-white/75" />
                            <EnvelopeSimple className="relative w-7 h-7 text-[#C96F8A]" weight="fill" />
                        </div>
                        <p className="font-bold text-[#4A3F35] text-sm">来信</p>
                        <p className="text-[11px] text-[#C96F8A] mt-0.5">{letterCount} 封</p>
                        <p className="text-[10px] text-[#B5A89A] mt-0.5">
                            {latestLetter ? `最近 ${shelfDateText(latestLetter)}` : '还没有来信'}
                        </p>
                    </button>

                    {/* 番外 */}
                    <button
                        type="button"
                        onClick={onOpenFanwai}
                        disabled={storyCount === 0}
                        className="rounded-3xl bg-white/85 border border-[#F0E4D2] shadow-[0_8px_26px_rgba(74,63,53,0.10)] p-3.5 text-left transition-all enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <div className="relative h-24 rounded-2xl bg-gradient-to-br from-[#F8E3C2] to-[#EFCE93] flex items-center justify-center overflow-hidden mb-3">
                            {/* 书脊叠影 */}
                            <span aria-hidden className="absolute left-1/2 top-1/2 h-14 w-10 -translate-x-[62%] -translate-y-1/2 rotate-[-7deg] rounded-md bg-white/50" />
                            <span aria-hidden className="absolute left-1/2 top-1/2 h-14 w-10 -translate-x-[38%] -translate-y-[46%] rotate-[5deg] rounded-md bg-white/75" />
                            <BookOpen className="relative w-7 h-7 text-[#C08A3E]" weight="fill" />
                        </div>
                        <p className="font-bold text-[#4A3F35] text-sm">番外</p>
                        <p className="text-[11px] text-[#C08A3E] mt-0.5">{storyCount} 篇</p>
                        <p className="text-[10px] text-[#B5A89A] mt-0.5">
                            {latestStory ? `最近 ${shelfDateText(latestStory)}` : '还没有番外'}
                        </p>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CharacterShelfHome;
