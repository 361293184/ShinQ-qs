/**
 * 拾光 App —— 番外收藏书架。
 *
 * 私聊「番外」生成的小说式番外收藏在这里；本 App 提供：
 *   - 书架式列表（迷你书封面：文风渐变 + 书名 + 角色名）
 *   - 全文阅读（书卷式排版）
 *   - 转发给角色：写角色记忆（MemoryFragment）+ 注入私聊 user 消息 + 跳转私聊，
 *     让角色真正"知道"这个故事（不转发则角色完全不知情）。
 *   - 删除
 */
import { useMemo, useState } from 'react';
import { useOS } from '../context/OSContext';
import { AppID, CharacterProfile, FanwaiStory } from '../types';
import { DB } from '../utils/db';
import { X, Trash, PaperPlaneTilt, BookOpen, Feather, PenNib } from '@phosphor-icons/react';
import { HTML_TYPE_LABELS } from '../utils/fanwai/formatDetector';
import { continueFanwai } from '../utils/fanwaiGenerator';
import { SubApiConfig } from '../utils/fanwaiGenerator';

/** 文风 → 迷你书封面渐变（暖色治愈系）。 */
const STYLE_GRADIENTS: Record<string, string> = {
    healing: 'from-[#FDE7D7] via-[#F7CBA8] to-[#EFB6C6]',
    ancient: 'from-[#F8E3C2] via-[#EFCE93] to-[#E2B87E]',
    suspense: 'from-[#EAE0EE] via-[#D7C8E0] to-[#BFADC9]',
    daily: 'from-[#F9DCE3] via-[#F3C0CE] to-[#E79DB4]',
    custom: 'from-[#F3EBDD] via-[#E7D8BE] to-[#D9C39A]',
    random: 'from-[#EDE7F2] via-[#D6CEE4] to-[#B9AED4]', // 随机模式：中性紫调
};

const DEFAULT_GRADIENT = 'from-[#F3EBDD] via-[#E7D8BE] to-[#D9C39A]';

const STYLE_NAMES: Record<string, string> = {
    healing: '温柔治愈', ancient: '古风', suspense: '悬疑', daily: '日常甜宠', custom: '自定义', random: '随机',
};

const POV_NAMES: Record<string, string> = { first: 'char 视角', second: 'user 视角', third: '第三视角' };

function fmtDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return `今天`;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function storyParts(story: FanwaiStory): { title: string; body: string } {
    const lines = story.content.split('\n');
    const title = lines.find(l => l.trim())?.trim() || '未命名';
    const body = lines.slice(1).join('\n').trim() || story.content;
    return { title, body };
}

const FanwaiApp: React.FC = () => {
    const { closeApp, fanwaiStories, deleteFanwaiStory, updateFanwaiStory, characters, updateCharacter, addToast, openApp, setActiveCharacterId, apiConfig } = useOS();

    const [detail, setDetail] = useState<FanwaiStory | null>(null);
    const [forwardTarget, setForwardTarget] = useState<FanwaiStory | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
    // 续写状态
    const [showContinueModal, setShowContinueModal] = useState(false);
    const [continueDirection, setContinueDirection] = useState('');
    const [continuing, setContinuing] = useState(false);

    const sortedStories = useMemo(
        () => [...fanwaiStories].sort((a, b) => b.createdAt - a.createdAt),
        [fanwaiStories],
    );

    // 转发给角色：①写长期记忆 → ②注入私聊番外卡片 → ③跳转私聊。
    // 文章篇幅很长，转发时只给角色看「标题 + 开头梗概」一张迷你书卡片（全文不进上下文，
    // 避免篇幅过长把上下文撑爆 / 让角色复读整篇文章）。全文只存在卡片 metadata 里供 UI 展示。
    const handleForward = async (story: FanwaiStory, role: CharacterProfile) => {
        const { title, body } = storyParts(story);
        const dateStr = new Date().toISOString().slice(0, 10);
        const flatBody = body.replace(/\s+/g, ' ');
        const summary = `${flatBody.slice(0, 120)}${flatBody.length > 120 ? '…' : ''}`;
        // ① 角色长期记忆：标题 + 开头梗概（截断），角色从此"记住"这个故事
        const mem = {
            id: `mem-fanwai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: dateStr,
            summary: `「${title}」是关于你的一篇番外：${summary}`,
            mood: 'creative',
        };
        updateCharacter(role.id, { memories: [...(role.memories || []), mem] });
        // ② 注入私聊上下文：一张番外卡片（内容只放标题+梗概，全文不喂给角色）
        await DB.saveMessage({
            charId: role.id,
            role: 'user',
            type: 'fanwai_card',
            content: title,
            metadata: {
                fanwaiStory: {
                    title,
                    summary,
                    charName: story.charName,
                    style: story.style,
                    wordCount: story.wordCount,
                    pov: story.pov,
                    content: story.content,
                    // HTML 番外转发时带上格式/模板类型，供聊天卡片按 HTML 缩略预览渲染
                    ...(story.format === 'html' ? { format: 'html' as const, htmlType: story.htmlType || 'custom' } : {}),
                },
            },
        });
        // ③ 跳转私聊
        setForwardTarget(null);
        setDetail(null);
        setConfirmingDelete(false);
        setActiveCharacterId(role.id);
        openApp(AppID.Chat);
        addToast(`已转发给 ${role.name}，ta 已经读到这篇番外`, 'success');
    };

    const handleDelete = async (story: FanwaiStory) => {
        // 软删除在 OSContext 内部完成并自带「可撤销」toast，这里不再重复提示
        await deleteFanwaiStory(story.id);
        setConfirmingDelete(false);
        if (detail?.id === story.id) setDetail(null);
    };

    // 续写：仅纯文字番外。取原文末尾为上下文，AI 接续生成并追加进正文末尾。
    const handleContinue = async () => {
        if (!detail || detail.format === 'html') return;
        if (continuing) return;
        const subApi: SubApiConfig = {
            baseUrl: apiConfig?.subBaseUrl || '',
            apiKey: apiConfig?.subApiKey || '',
            model: apiConfig?.subModel || '',
        };
        const char = characters.find(c => c.id === detail.charId);
        if (!char) { addToast('找不到这篇番外的角色', 'error'); return; }
        setShowContinueModal(false);
        setContinuing(true);
        try {
            const res = await continueFanwai(char, detail, subApi, continueDirection || undefined);
            if (res.ok && res.content) {
                const updated: FanwaiStory = {
                    ...detail,
                    content: detail.content + '\n\n' + res.content,
                    continuedAt: Date.now(),
                };
                setDetail(updated);
                updateFanwaiStory(updated.id, updated);
                addToast('续写完成', 'success');
            } else if (res.reason === 'no_sub_api') {
                addToast('副 API 未配置，无法续写', 'error');
            } else {
                addToast('续写失败，重试？', 'error');
            }
        } catch {
            addToast('续写失败，重试？', 'error');
        } finally {
            setContinuing(false);
            setContinueDirection('');
        }
    };

    // 转发角色选择弹层：详情页 / 书架列表共用，确保在拾光内点「转发给角色」立即弹出。
    const forwardSheet = forwardTarget && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#4A3F35]/30 backdrop-blur-sm" onClick={() => { setForwardTarget(null); addToast('已取消转发，番外仍在书架上', 'info'); }}>
            <div className="w-full max-w-md bg-[#FFFDF9] rounded-t-3xl border-t border-[#F0E4D2] max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
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
                            key={role.id}
                            onClick={() => handleForward(forwardTarget, role)}
                            className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-[#F6EDE3] active:scale-[0.98] transition-all cursor-pointer"
                        >
                            <img src={role.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-[#F0A93B]/30" />
                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-bold text-[#4A3F35]">{role.name}</p>
                                <p className="text-xs text-[#8A7A6C] truncate">{(role as any).persona || (role as any).description || '一个你熟悉的角色'}</p>
                            </div>
                            <PaperPlaneTilt className="w-4 h-4 text-[#C4B8A9]" weight="bold" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    // ==================== 详情页 ====================
    if (detail) {
        const { title, body } = storyParts(detail);
        return (
            <div className="h-full w-full bg-[#FDF8F0] flex flex-col font-sans overflow-hidden">
                {/* 顶部栏 */}
                <div className="bg-white/70 backdrop-blur-md border-b border-[#F0E4D2] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                    <div className="flex items-center justify-between px-4 py-3">
                        <button onClick={() => { setDetail(null); setConfirmingDelete(false); }} className="p-2 -ml-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer" aria-label="返回书架">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-[#4A3F35]"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <span className="font-bold text-[#4A3F35] text-sm tracking-wide">拾光 · 番外</span>
                        <button onClick={() => closeApp()} className="p-2 -mr-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer" aria-label="关闭">
                            <X className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                        </button>
                    </div>
                </div>

                {/* 正文 */}
                <div className="flex-1 overflow-y-auto px-4 pb-32">
                    {detail.format === 'html' ? (
                        <div className="mx-auto max-w-md mt-4 flex-1 flex flex-col" style={{ minHeight: 'calc(100vh - 7.4rem)' }}>
                            <p className="mb-1 text-center text-[10px] text-[#C4B8A9]">{detail.charName} · {HTML_TYPE_LABELS[detail.htmlType || 'custom']} · 收藏于 {fmtDate(detail.createdAt)}</p>
                            {/* HTML 番外：沙盒 iframe 渲染（内置禁脚本；custom 放开脚本支持交互），高度顶到底栏；内部可滚动 */}
                            <iframe
                                title={`${detail.htmlType || 'custom'} 番外`}
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#F5F7FB;font-family:-apple-system,'PingFang SC',sans-serif;}*{box-sizing:border-box}body{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:0;}</style></head><body>${detail.content}</body></html>`}
                                sandbox={detail.htmlType === 'custom' ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
                                style={{ width: '100%', flex: 1, border: '1px solid #F0E4D2', borderRadius: 16, background: '#fff', display: 'block' }}
                            />
                        </div>
                    ) : (
                        <div className="mx-auto max-w-md rounded-2xl bg-[#FFFDF9] shadow-[0_6px_32px_rgba(74,63,53,0.08)] border border-[#F0E4D2] p-5 mt-4">
                            <h2 className="text-center font-serif text-base font-bold text-[#4A3F35] leading-relaxed">{title}</h2>
                            <div className="mx-auto mt-2 h-px w-10 bg-gradient-to-r from-transparent via-[#F0A93B] to-transparent" />
                            <p className="mt-2 text-center text-[11px] text-[#B5A89A]">
                                {detail.charName} · {STYLE_NAMES[detail.style] || detail.style} · 约{detail.wordCount}字 · {POV_NAMES[detail.pov] || ''}
                            </p>
                            <p className="mt-1 text-center text-[10px] text-[#C4B8A9]">收藏于 {fmtDate(detail.createdAt)}</p>
                            <article className="mt-4 whitespace-pre-wrap text-[13px] leading-[1.85] text-[#4A3F35] font-light">
                                {body}
                            </article>
                            {/* 续写入口：仅纯文字番外（HTML 分支在上面 iframe 渲染，不显示） */}
                            <button
                                onClick={() => setShowContinueModal(true)}
                                disabled={continuing}
                                className="mt-5 w-full py-2.5 rounded-xl border border-dashed border-[#E8845A]/40 bg-[#FFF9F2] text-[12px] text-[#E8845A] font-medium active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            onClick={() => setConfirmingDelete(true)}
                            className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/90 border border-[#F0E4D2] py-3 px-4 text-xs font-bold text-[#E8604C] active:scale-[0.97] transition-all cursor-pointer"
                        >
                            <Trash className="w-3.5 h-3.5" weight="bold" />
                            删除
                        </button>
                        <button
                            onClick={() => setForwardTarget(detail)}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-bold text-white bg-gradient-to-r from-[#F0A93B] via-[#E8845A] to-[#C96F8A] shadow-md shadow-[#E8845A]/30 active:scale-[0.98] transition-all cursor-pointer"
                        >
                            <PaperPlaneTilt className="w-3.5 h-3.5" weight="bold" />
                            转发给角色
                        </button>
                    </div>
                </div>

                {/* 删除二次确认条：防误删，点「删除」先确认，确认后再真正移除 */}
                {confirmingDelete && (
                    <div className="fixed bottom-0 inset-x-0 px-4 pb-3 z-[95]" style={{ paddingBottom: 'max(6.5rem, calc(var(--safe-bottom, 0px) + 4.5rem))' }}>
                        <div className="max-w-lg mx-auto rounded-2xl bg-[#2A1B1B] border border-[#E8604C]/40 shadow-[0_12px_40px_rgba(0,0,0,0.35)] p-4 animate-slide-up">
                            <p className="text-sm font-bold text-[#FFF5F2]">确定从拾光移除「{title}」吗？</p>
                            <p className="text-[11px] text-[#D9A9A1] mt-1">此操作可撤销，删除后 5 秒内可恢复。</p>
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={() => setConfirmingDelete(false)}
                                    className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-[#FFE3DC] hover:bg-white/15 transition-colors cursor-pointer"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => { setConfirmingDelete(false); handleDelete(detail); }}
                                    className="flex-1 rounded-xl bg-gradient-to-r from-[#E8604C] to-[#C9372A] py-2.5 text-xs font-bold text-white shadow-md shadow-[#E8604C]/30 hover:brightness-110 transition-all cursor-pointer"
                                >
                                    确认移除
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 转发角色选择弹层（详情页也要能弹，不能只在书架列表显示） */}
                {forwardTarget && forwardSheet}

                {/* 续写弹框：续写走向（可选）+ 开始/取消 */}
                {showContinueModal && (
                    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#4A3F35]/40 backdrop-blur-sm px-6" onClick={() => setShowContinueModal(false)}>
                        <div className="w-full max-w-sm rounded-3xl bg-[#FFFDF9] border border-[#F0E4D2] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-slide-up" onClick={e => e.stopPropagation()}>
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
                                <button onClick={() => setShowContinueModal(false)} className="flex-1 rounded-xl bg-white border border-[#F0E4D2] py-2.5 text-xs font-bold text-[#8A7A6C] active:scale-[0.98] transition-transform cursor-pointer">
                                    取消
                                </button>
                                <button onClick={handleContinue} className="flex-1 rounded-xl bg-gradient-to-r from-[#E8845A] to-[#D9644B] py-2.5 text-xs font-bold text-white shadow-md shadow-[#E8845A]/30 active:scale-[0.98] transition-transform cursor-pointer">
                                    开始续写
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ==================== 书架列表 ====================
    return (
        <div className="h-full w-full bg-[#FDF8F0] flex flex-col font-sans overflow-hidden">
            {/* 顶部栏 */}
            <div className="bg-white/70 backdrop-blur-md border-b border-[#F0E4D2] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="w-9" />
                    <div className="flex items-center gap-1.5">
                        <Feather className="w-4 h-4 text-[#E8845A]" weight="fill" />
                        <span className="font-bold text-[#4A3F35] text-sm tracking-wide">拾光</span>
                        <span className="text-[10px] text-[#B5A89A] font-medium">{sortedStories.length} 篇</span>
                    </div>
                    <button onClick={() => closeApp()} className="p-2 -mr-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer" aria-label="关闭">
                        <X className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                </div>
            </div>

            {/* 书架内容 */}
            <div className="flex-1 overflow-y-auto px-5 pt-5 pb-10">
                {sortedStories.length === 0 ? (
                    // 空状态
                    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-8">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#FDE7D7] to-[#EFB6C6] flex items-center justify-center shadow-inner mb-4">
                            <BookOpen className="w-9 h-9 text-white/90" weight="fill" />
                        </div>
                        <p className="text-[#4A3F35] font-bold text-sm">书架上还空着</p>
                        <p className="text-xs text-[#8A7A6C] mt-1.5 leading-relaxed">
                            去私聊点「番外」，为 ta 生成一篇小说式的故事，<br />写好后收藏到这里，随时可以回看、转发。
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {sortedStories.map((story, i) => {
                            const { title } = storyParts(story);
                            const gradient = STYLE_GRADIENTS[story.style] || DEFAULT_GRADIENT;
                            return (
                                <button
                                    key={story.id}
                                    onClick={() => setDetail(story)}
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
                                        <span className="text-[#D8CCBC] text-[10px]">·</span>
                                        <span className="text-[10px] text-[#8A7A6C] truncate max-w-[80px]">{story.charName}</span>
                                    </div>
                                    <p className="mt-0.5 text-[10px] text-[#B5A89A]">{fmtDate(story.createdAt)}</p>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 转发给角色弹层 */}
            {forwardSheet}
        </div>
    );
};

export default FanwaiApp;
