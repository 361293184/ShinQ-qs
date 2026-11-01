import React from 'react';
import { X } from '@phosphor-icons/react';
import { HTML_TYPE_LABELS } from '../../utils/fanwai/formatDetector';

/**
 * 聊天里点开「拾光转发过来的番外」时的阅读器。
 *
 * 为什么需要它：转发进聊天的那条消息，metadata 里**存着全文**（`fanwaiStory.content`），
 * 但卡片上只有标题和一行摘要 —— 没有入口就永远看不到正文。
 * 所以卡片可点，点开就是这个阅读器：文字番外按书页排，HTML 番外整页渲染（沙盒 iframe）。
 *
 * 只读：转发的是"当时那一篇"，不是拾光里的可编辑副本。
 */

export interface FanwaiCardStory {
    title?: string;
    summary?: string;
    charName?: string;
    style?: string;
    pov?: string;
    wordCount?: number;
    content?: string;
    format?: string;
    htmlType?: string;
}

interface Props {
    story: FanwaiCardStory;
    onClose: () => void;
}

const POV_LABELS: Record<string, string> = {
    first: '第一人称',
    second: '第二人称',
    third: '第三人称',
};

export default function FanwaiReaderModal({ story, onClose }: Props) {
    const title = (story.title || '').trim() || '未命名番外';
    const isHtml = story.format === 'html' && !!story.content;
    const htmlLabel = isHtml
        ? HTML_TYPE_LABELS[((story.htmlType as keyof typeof HTML_TYPE_LABELS) || 'custom') as keyof typeof HTML_TYPE_LABELS]
        : '';

    const metaParts = [
        story.charName,
        htmlLabel,
        story.style,
        story.pov ? POV_LABELS[story.pov] || story.pov : '',
        story.wordCount ? `${story.wordCount} 字` : '',
    ].filter(Boolean) as string[];

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
            <div
                className="relative flex h-full w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-[#12101d] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]"
                onClick={(event) => event.stopPropagation()}
            >
                {/* 标题栏 */}
                <div className="shrink-0 flex items-start gap-2 px-4 py-3 border-b border-white/10">
                    <div className="min-w-0 flex-1">
                        <div className="text-[9px] italic font-extrabold tracking-widest text-[#f5c86b]/90">拾光 · 番外</div>
                        <h3 className="mt-1 text-[15px] font-bold leading-6 text-[#f0e6d2] break-words">{title}</h3>
                        {metaParts.length ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#8b7f9e]">
                                {metaParts.map((part, index) => (
                                    <span key={`${part}-${index}`}>{part}</span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#c8bbd6] active:bg-white/10"
                    >
                        <X className="w-4 h-4" weight="bold" />
                    </button>
                </div>

                {/* 正文：文字番外按书页排，HTML 番外整页渲染 */}
                {isHtml ? (
                    <iframe
                        title={`${story.htmlType || 'custom'} 番外`}
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:12px;background:#fff;font-family:-apple-system,'PingFang SC',sans-serif;}*{box-sizing:border-box}img{max-width:100%;height:auto}</style></head><body>${story.content}</body></html>`}
                        sandbox={story.htmlType === 'custom' ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
                        className="flex-1 w-full border-none bg-white"
                    />
                ) : (
                    <div className="flex-1 overflow-y-auto bg-[#1a1626] px-5 py-4">
                        {story.content ? (
                            <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.95] text-[#e4dccb] [text-align:justify]">
                                {story.content}
                            </div>
                        ) : (
                            <div className="text-[12px] text-[#8b7f9e]">这篇番外没有留下正文（当时只存了标题）。</div>
                        )}
                        {story.summary ? (
                            <div className="mt-4 pt-3 border-t border-white/10 text-[10px] leading-5 text-[#8b7f9e]">
                                摘要：{story.summary}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
