/**
 * 拾光 · L3b 番外列表（沿用原来的迷你书网格）。
 * 番外靠「文风渐变 + 迷你书封面」区分形态，来信靠「信封」，混排时靠形态识别而不是文字标签。
 */

import React from 'react';
import { CaretLeft, Feather, X } from '@phosphor-icons/react';
import type { FanwaiStory } from '../../types';
import { DEFAULT_GRADIENT, STYLE_GRADIENTS, STYLE_NAMES, fmtDate, storyParts } from './fanwaiVisual';

interface FanwaiListViewProps {
    charName: string;
    stories: FanwaiStory[];
    onOpen: (story: FanwaiStory) => void;
    onBack: () => void;
    onClose: () => void;
}

const FanwaiListView: React.FC<FanwaiListViewProps> = ({ charName, stories, onOpen, onBack, onClose }) => (
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
                <span className="font-bold text-[#4A3F35] text-sm tracking-wide">番外 · {charName}</span>
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

        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-10">
            {stories.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center px-8">
                    <p className="text-[#4A3F35] font-bold text-sm">还没有番外</p>
                    <p className="text-xs text-[#8A7A6C] mt-1.5 leading-relaxed">
                        去私聊点「番外」，为 ta 生成一篇小说式的故事，写好后会收藏到这里。
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    {stories.map((story, i) => {
                        const { title } = storyParts(story);
                        const gradient = STYLE_GRADIENTS[story.style] || DEFAULT_GRADIENT;
                        return (
                            <button
                                type="button"
                                key={story.id}
                                onClick={() => onOpen(story)}
                                className="group text-left rounded-2xl bg-white/80 border border-[#F0E4D2] shadow-[0_6px_24px_rgba(74,63,53,0.10)] p-3 transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(74,63,53,0.16)] active:scale-[0.97] cursor-pointer"
                                style={{ animationDelay: `${i * 40}ms` }}
                            >
                                <div className={`rounded-xl bg-gradient-to-br ${gradient} p-3 mb-2.5 relative overflow-hidden`}>
                                    <div className="absolute -right-4 -top-4 h-14 w-14 rounded-full bg-white/20" />
                                    <div className="absolute right-6 -bottom-5 h-10 w-10 rounded-full bg-white/10" />
                                    <Feather className="w-4 h-4 text-white/80 mb-5" weight="fill" />
                                    <h3 className="font-serif font-bold text-[#4A3F35] leading-snug line-clamp-2 text-[13px]">{title}</h3>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] font-semibold text-[#C96F8A]">{STYLE_NAMES[story.style] || story.style}</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-[#B5A89A]">{fmtDate(story.createdAt)}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    </div>
);

export default FanwaiListView;
