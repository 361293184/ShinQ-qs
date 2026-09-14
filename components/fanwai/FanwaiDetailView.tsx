/**
 * 拾光 · 番外详情（从原 apps/FanwaiApp.tsx 的内联详情页抽出）。
 *
 * 主操作是「转发给角色」：写角色记忆 + 注入私聊番外卡片 + 跳回私聊，
 * 让角色真正「知道」这个故事。次操作：续写（仅纯文字番外）、删除（二次确认 + 可撤销）。
 */

import React, { useState } from 'react';
import { CaretLeft, PaperPlaneTilt, PenNib, Trash, X } from '@phosphor-icons/react';
import type { CharacterProfile, FanwaiStory } from '../../types';
import { HTML_TYPE_LABELS } from '../../utils/fanwai/formatDetector';
import { POV_NAMES, STYLE_NAMES, fmtDate, storyParts } from './fanwaiVisual';

interface FanwaiDetailViewProps {
    story: FanwaiStory;
    characters: CharacterProfile[];
    continuing: boolean;
    onForward: (story: FanwaiStory, role: CharacterProfile) => void | Promise<void>;
    onDelete: (story: FanwaiStory) => void | Promise<void>;
    onContinue: (story: FanwaiStory, direction: string) => void | Promise<void>;
    onBack: () => void;
    onClose: () => void;
}

const FanwaiDetailView: React.FC<FanwaiDetailViewProps> = ({
    story, characters, continuing, onForward, onDelete, onContinue, onBack, onClose,
}) => {
    const { title, body } = storyParts(story);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [forwardTarget, setForwardTarget] = useState<FanwaiStory | null>(null);
    const [showContinueModal, setShowContinueModal] = useState(false);
    const [continueDirection, setContinueDirection] = useState('');

    return (
        <div className="h-full w-full bg-[#FDF8F0] flex flex-col font-sans overflow-hidden">
            {/* 顶部栏 */}
            <div className="bg-white/70 backdrop-blur-md border-b border-[#F0E4D2] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-2 -ml-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer"
                        aria-label="返回番外列表"
                    >
                        <CaretLeft className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                    <span className="font-bold text-[#4A3F35] text-sm tracking-wide">拾光 · 番外</span>
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

            {/* 正文 */}
            <div className="flex-1 overflow-y-auto px-4 pb-32">
                {story.format === 'html' ? (
                    <div className="mx-auto max-w-md mt-4 flex-1 flex flex-col" style={{ minHeight: 'calc(100vh - 7.4rem)' }}>
                        <p className="mb-1 text-center text-[10px] text-[#C4B8A9]">
                            {story.charName} · {HTML_TYPE_LABELS[story.htmlType || 'custom']} · 收藏于 {fmtDate(story.createdAt)}
                        </p>
                        <iframe
                            title={`${story.htmlType || 'custom'} 番外`}
                            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#F5F7FB;font-family:-apple-system,'PingFang SC',sans-serif;}*{box-sizing:border-box}body{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:0;}</style></head><body>${story.content}</body></html>`}
                            sandbox={story.htmlType === 'custom' ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
                            style={{ width: '100%', flex: 1, border: '1px solid #F0E4D2', borderRadius: 16, background: '#fff', display: 'block' }}
                        />
                    </div>
                ) : (
                    <div className="mx-auto max-w-md rounded-2xl bg-[#FFFDF9] shadow-[0_6px_32px_rgba(74,63,53,0.08)] border border-[#F0E4D2] p-5 mt-4">
                        <h2 className="text-center font-serif text-base font-bold text-[#4A3F35] leading-relaxed">{title}</h2>
                        <div className="mx-auto mt-2 h-px w-10 bg-gradient-to-r from-transparent via-[#F0A93B] to-transparent" />
                        <p className="mt-2 text-center text-[11px] text-[#B5A89A]">
                            {story.charName} · {STYLE_NAMES[story.style] || story.style} · 约{story.wordCount}字 · {POV_NAMES[story.pov] || ''}
                        </p>
                        <p className="mt-1 text-center text-[10px] text-[#C4B8A9]">收藏于 {fmtDate(story.createdAt)}</p>
                        <article className="mt-4 whitespace-pre-wrap text-[13px] leading-[1.85] text-[#4A3F35] font-light">
                            {body}
                        </article>
                        <button
                            type="button"
                            onClick={() => setShowContinueModal(true)}
                            disabled={continuing}
                            className="mt-5 w-full py-2.5 rounded-xl border border-dashed border-[#E8845A]/40 bg-[#FFF9F2] text-[12px] text-[#E8845A] font-medium active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <PenNib className="w-3.5 h-3.5" weight="fill" />
                            {continuing ? '✍️ 续写中…' : '✍️ 续写'}
                        </button>
                    </div>
                )}
            </div>

            {/* 底部操作 */}
            <div className="fixed bottom-0 inset-x-0 px-4 pt-3 bg-gradient-to-t from-[#FDF8F0] via-[#FDF8F0]/90 to-transparent" style={{ paddingBottom: 'max(1.25rem, var(--safe-bottom, 0px))' }}>
                <div className="flex gap-2.5 max-w-lg mx-auto">
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/90 border border-[#F0E4D2] py-3 px-4 text-xs font-bold text-[#E8604C] active:scale-[0.97] transition-all cursor-pointer"
                    >
                        <Trash className="w-3.5 h-3.5" weight="bold" />
                        删除
                    </button>
                    <button
                        type="button"
                        onClick={() => setForwardTarget(story)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold text-white bg-gradient-to-r from-[#F0A93B] via-[#E8845A] to-[#C96F8A] shadow-md shadow-[#E8845A]/30 active:scale-[0.98] transition-all cursor-pointer"
                    >
                        <PaperPlaneTilt className="w-3.5 h-3.5" weight="bold" />
                        转发给角色
                    </button>
                </div>
            </div>

            {/* 删除二次确认 */}
            {confirmingDelete && (
                <div className="fixed bottom-0 inset-x-0 px-4 z-[95]" style={{ paddingBottom: 'max(6.5rem, calc(var(--safe-bottom, 0px) + 4.5rem))' }}>
                    <div className="max-w-lg mx-auto rounded-2xl bg-[#2A1B1B] border border-[#E8604C]/40 shadow-[0_12px_40px_rgba(0,0,0,0.35)] p-4 animate-slide-up">
                        <p className="text-sm font-bold text-[#FFF5F2]">确定从拾光移除「{title}」吗？</p>
                        <p className="text-[11px] text-[#D9A9A1] mt-1">此操作可撤销，删除后 5 秒内可恢复。</p>
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
                                onClick={() => { setConfirmingDelete(false); void onDelete(story); }}
                                className="flex-1 rounded-xl bg-gradient-to-r from-[#E8604C] to-[#C9372A] py-2.5 text-xs font-bold text-white shadow-md shadow-[#E8604C]/30 hover:brightness-110 transition-all cursor-pointer"
                            >
                                确认移除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 转发角色选择弹层 */}
            {forwardTarget && (
                <div
                    className="fixed inset-0 z-[95] flex items-end justify-center bg-[#4A3F35]/30 backdrop-blur-sm"
                    onClick={() => setForwardTarget(null)}
                >
                    <div
                        className="w-full max-w-md bg-[#FFFDF9] rounded-t-3xl border-t border-[#F0E4D2] max-h-[75vh] flex flex-col overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-[#F0E4D2]">
                            <div className="mx-auto h-1 w-10 rounded-full bg-[#EADBC8] mb-3" />
                            <h3 className="font-bold text-[#4A3F35] flex items-center gap-2">
                                <PaperPlaneTilt className="w-4 h-4 text-[#E8845A]" weight="fill" />
                                把这篇番外转发给谁？
                            </h3>
                            <p className="text-xs text-[#8A7A6C] mt-1">转发的角色会完整读到这个故事，并记进自己的记忆</p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-3 py-2">
                            {characters.length === 0 && (
                                <p className="text-center text-sm text-[#B5A89A] py-8">还没有角色</p>
                            )}
                            {characters.map(role => (
                                <button
                                    type="button"
                                    key={role.id}
                                    onClick={() => void onForward(story, role)}
                                    className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-[#F6EDE3] active:scale-[0.98] transition-all cursor-pointer"
                                >
                                    <img src={role.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-[#F0A93B]/30" />
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="text-sm font-bold text-[#4A3F35]">{role.name}</p>
                                        <p className="text-xs text-[#8A7A6C] truncate">{role.description || '一个你熟悉的角色'}</p>
                                    </div>
                                    <PaperPlaneTilt className="w-4 h-4 text-[#C4B8A9]" weight="bold" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 续写弹框 */}
            {showContinueModal && (
                <div
                    className="fixed inset-0 z-[95] flex items-center justify-center bg-[#4A3F35]/40 backdrop-blur-sm px-6"
                    onClick={() => setShowContinueModal(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-3xl bg-[#FFFDF9] border border-[#F0E4D2] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-slide-up"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="font-bold text-[#4A3F35] flex items-center gap-2">
                            <PenNib className="w-4 h-4 text-[#E8845A]" weight="fill" />
                            续写番外
                        </h3>
                        <p className="text-xs text-[#8A7A6C] mt-1">AI 会接着正文末尾继续写，保持人物与文风。可填续写走向（可选）：</p>
                        <textarea
                            value={continueDirection}
                            onChange={e => setContinueDirection(e.target.value.slice(0, 100))}
                            placeholder="例：他们后来一起去旅行…（留空则自然接续前文）"
                            className="mt-3 w-full h-20 rounded-xl border border-[#F0E4D2] bg-white p-3 text-[13px] text-[#4A3F35] resize-none outline-none focus:border-[#E8845A]/60"
                        />
                        <div className="mt-2 text-right text-[10px] text-[#B5A89A]">{continueDirection.length}/100</div>
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowContinueModal(false)}
                                className="flex-1 rounded-xl bg-white border border-[#F0E4D2] py-2.5 text-xs font-bold text-[#8A7A6C] active:scale-[0.98] transition-transform cursor-pointer"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowContinueModal(false); void onContinue(story, continueDirection); setContinueDirection(''); }}
                                className="flex-1 rounded-xl bg-gradient-to-r from-[#E8845A] to-[#D9644B] py-2.5 text-xs font-bold text-white shadow-md shadow-[#E8845A]/30 active:scale-[0.98] transition-transform cursor-pointer"
                            >
                                开始续写
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FanwaiDetailView;
