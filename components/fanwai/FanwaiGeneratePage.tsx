/**
 * 番外生成页（私聊「番外」入口 → 全屏独立页面，非悬浮窗）。
 *
 * 流程：配置文风 / 字数 / 视角 / 世界设定 → 用副 API 生成小说式番外 →
 * 书籍排版预览 → 一键收藏到「拾光」App。
 *
 * 视觉：贴合 SullyOS 整体基线（text-sm / rounded-2xl / py-2.5~3），
 * 米白纸感底 + 暖色强调，整体密度更紧凑。
 */
import { useEffect, useState } from 'react';
import { APIConfig, CharacterProfile, FanwaiStory, UserProfile } from '../../types';
import {
    FANWAI_STYLE_PRESETS, FANWAI_WORD_COUNTS, FANWAI_POVS, FANWAI_FORM_LS_KEY,
    generateFanwai, createFanwaiStoryId,
} from '../../utils/fanwaiGenerator';
import { DB } from '../../utils/db';

interface FanwaiGeneratePageProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: APIConfig;
    addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
    onClose: () => void;
    onCollect: (story: FanwaiStory) => Promise<void>;
}

interface SavedForm {
    style?: string;
    styleCustomDesc?: string;
    wordCountPreset?: number;
    wordCountIsCustom?: boolean;
    customWordCount?: number;
    pov?: 'first' | 'second' | 'third';
    worldSetting?: string;
}

const DEFAULT_WORD_PRESET = 1000;
const MIN_CUSTOM_WORDS = 100;
const MAX_CUSTOM_WORDS = 20000;

/** 输入框通用样式（贴合 SullyOS 基线：白底 + 细描边 + 中性灰焦点）。 */
const INPUT_BASE = 'w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#1F1F1F] placeholder:text-[#9A9A9A] outline-none focus:border-[#1F1F1F] focus:ring-2 focus:ring-[#1F1F1F]/10 transition-colors';

export default function FanwaiGeneratePage({ char, userProfile, apiConfig, addToast, onClose, onCollect }: FanwaiGeneratePageProps) {
    const [style, setStyle] = useState<string>('healing');
    const [styleCustomDesc, setStyleCustomDesc] = useState<string>('');
    const [wordCountPreset, setWordCountPreset] = useState<number>(DEFAULT_WORD_PRESET);
    const [wordCountIsCustom, setWordCountIsCustom] = useState<boolean>(false);
    const [customWordCount, setCustomWordCount] = useState<number>(1500);
    const [pov, setPov] = useState<'first' | 'second' | 'third'>('third');
    const [worldSetting, setWorldSetting] = useState<string>('');
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState<string>('');
    const [collected, setCollected] = useState(false);
    const [randomMode, setRandomMode] = useState(false); // 随机模式：文风/字数/视角全由 AI 决定

    // 记住上次选择（localStorage）
    useEffect(() => {
        try {
            const raw = localStorage.getItem(FANWAI_FORM_LS_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw) as SavedForm;
            if (saved.style && FANWAI_STYLE_PRESETS.some(p => p.id === saved.style)) setStyle(saved.style);
            if (typeof saved.styleCustomDesc === 'string') setStyleCustomDesc(saved.styleCustomDesc);
            if (typeof saved.wordCountPreset === 'number' && (FANWAI_WORD_COUNTS as readonly number[]).includes(saved.wordCountPreset)) {
                setWordCountPreset(saved.wordCountPreset);
            }
            if (typeof saved.wordCountIsCustom === 'boolean') setWordCountIsCustom(saved.wordCountIsCustom);
            if (typeof saved.customWordCount === 'number' && saved.customWordCount >= MIN_CUSTOM_WORDS && saved.customWordCount <= MAX_CUSTOM_WORDS) {
                setCustomWordCount(saved.customWordCount);
            }
            if (saved.pov && FANWAI_POVS.some(p => p.id === saved.pov)) setPov(saved.pov);
            if (typeof saved.worldSetting === 'string') setWorldSetting(saved.worldSetting);
        } catch { /* 忽略损坏的本地记录 */ }
    }, []);

    useEffect(() => {
        const saved: SavedForm = { style, styleCustomDesc, wordCountPreset, wordCountIsCustom, customWordCount, pov, worldSetting };
        try { localStorage.setItem(FANWAI_FORM_LS_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
    }, [style, styleCustomDesc, wordCountPreset, wordCountIsCustom, customWordCount, pov, worldSetting]);

    const wordCount = wordCountIsCustom ? customWordCount : wordCountPreset;

    const subApi = {
        baseUrl: apiConfig.subBaseUrl,
        apiKey: apiConfig.subApiKey,
        model: apiConfig.subModel,
    };

    const handleGenerate = async () => {
        if (generating) return;
        if (!char) { addToast('当前没有可用的角色', 'error'); return; }
        if (!subApi.baseUrl || !subApi.apiKey || !subApi.model) {
            addToast('请先在设置 → 副 API 配置 填入副 API（番外生成走副 API）', 'info');
            return;
        }
        // 随机模式：字数/风格/视角全由 AI 决定，跳过固定字数校验
        if (!randomMode && wordCountIsCustom && (customWordCount < MIN_CUSTOM_WORDS || customWordCount > MAX_CUSTOM_WORDS)) {
            addToast(`自定义字数需在 ${MIN_CUSTOM_WORDS} ~ ${MAX_CUSTOM_WORDS} 之间`, 'error');
            return;
        }
        setGenerated('');
        setCollected(false);
        setGenerating(true);

        // 拉取最近聊天记录作为番外的灵感来源（仅取纯文本消息，卡片类跳过，避免脏数据）
        let recentMessages: { role: string; content: string }[] | undefined;
        try {
            const msgs = await DB.getRecentMessagesByCharId(char.id, 100);
            recentMessages = msgs
                .filter(m => m.type === 'text' && (m.role === 'user' || m.role === 'assistant'))
                .map(m => ({ role: m.role, content: m.content }));
        } catch (e) {
            console.error('[Fanwai] Failed to load recent messages:', e);
            recentMessages = undefined;
        }

        const result = await generateFanwai(
            char, userProfile,
            { styleId: randomMode ? 'random' : style, styleCustomDesc: styleCustomDesc.trim() || undefined, wordCount, wordCountIsCustom, pov, worldSetting, recentMessages, randomMode },
            subApi,
        );
        setGenerating(false);
        if (result.ok && result.content) {
            setGenerated(result.content);
            addToast('番外写好了', 'success');
        } else if (result.reason === 'no_sub_api') {
            addToast('请先在设置 → 副 API 配置 填入副 API（番外生成走副 API）', 'info');
        } else {
            addToast('生成失败，请稍后重试', 'error');
        }
    };

    const handleCollect = async () => {
        if (!char || !generated || collected) return;
        // 随机模式下文风/字数/视角不由用户设定，收藏统一标记为 'random'，卡片展示"随机风格"
        const story: FanwaiStory = {
            id: createFanwaiStoryId(),
            charId: char.id,
            charName: char.name,
            style: randomMode ? 'random' : style,
            wordCount: randomMode ? 0 : wordCount,
            pov: randomMode ? 'third' : pov,
            worldSetting,
            content: generated,
            createdAt: Date.now(),
        };
        await onCollect(story);
        setCollected(true);
        addToast('已收藏到拾光', 'success');
    };

    // 生成的正文按段落拆分，首行为书名
    const lines = generated ? generated.split('\n') : [];
    const title = lines.find(l => l.trim())?.trim() || '未命名';
    const body = lines.slice(1).join('\n').trim() || generated;
    const currentStyle = FANWAI_STYLE_PRESETS.find(p => p.id === style);
    const currentPov = FANWAI_POVS.find(p => p.id === pov);

    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white">
            {/* 顶部导航（让位状态栏 / 刘海）；生成中时隐藏，避免与遮罩内返回键位置重叠导致点错 */}
            {!generating && (
                <header className="flex items-center justify-between px-4 pt-1 pb-2 shrink-0" style={{ paddingTop: 'calc(var(--chrome-top) + 1.25rem)' }}>
                <button
                    onClick={onClose}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[#666666] hover:bg-white/70 transition-colors cursor-pointer"
                    aria-label="返回"
                >
                    <span className="text-sm leading-none">←</span>
                    <span>返回</span>
                </button>
                <div className="flex items-center gap-1.5">
                    <h1 className="text-sm font-bold text-[#1F1F1F] tracking-wide">番外</h1>
                    <span className="text-[10px] text-[#9A9A9A] font-medium">Fanwai</span>
                </div>
                <div className="w-12" />
            </header>
            )}

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-4 pb-32">
                {/* 角色卡：为谁而写 */}
                {char && (
                    <div className="flex items-center gap-2.5 rounded-2xl bg-[#FAFAFA] border border-[#E5E5E5] px-3 py-2.5 mb-4">
                        <img src={char.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-[#E5E5E5]" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#1F1F1F]">为 {char.name} 写一篇番外</p>
                            <p className="text-[11px] text-[#666666] truncate">设定将结合 ta 的人设、记忆与你们的关系</p>
                        </div>
                        <span className="text-[#D4D4D4] text-base leading-none">✦</span>
                    </div>
                )}

                {/* 文风 */}
                <section className="mb-4">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] mb-2">
                        <span className="inline-block h-3 w-0.5 rounded-full bg-[#D4D4D4]" />
                        文风
                    </h2>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                        {FANWAI_STYLE_PRESETS.map(p => {
                            const active = style === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setStyle(p.id)}
                                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                                        active
                                            ? 'bg-[#1F1F1F] text-white shadow-sm shadow-[#1F1F1F]/20'
                                            : 'bg-white/80 text-[#666666] hover:bg-white border border-[#E5E5E5]'
                                    }`}
                                >
                                    {p.name}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#666666] leading-relaxed">
                        {currentStyle?.hint}
                    </p>
                    {worldSetting.trim() && (
                        <p className="mt-1 text-[10px] text-[#9A9A9A]">
                            已贴指令时以指令为准，AI 用足笔力执行；下方预设仅在留空时生效。
                        </p>
                    )}
                    {style === 'custom' && (
                        <textarea
                            value={styleCustomDesc}
                            onChange={e => setStyleCustomDesc(e.target.value)}
                            placeholder="例：日系轻小说风、对白偏多、句式短促带俏皮、参考《xxx》"
                            rows={2}
                            className={`${INPUT_BASE} mt-2 resize-none leading-relaxed`}
                        />
                    )}
                </section>

                {/* 字数 */}
                <section className="mb-4">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] mb-2">
                        <span className="inline-block h-3 w-0.5 rounded-full bg-[#D4D4D4]" />
                        字数
                    </h2>
                    <div className="flex gap-1.5">
                        {FANWAI_WORD_COUNTS.map(n => {
                            const isCustom = n === 0;
                            const active = isCustom ? wordCountIsCustom : (!wordCountIsCustom && wordCountPreset === n);
                            const label = isCustom ? '自定义' : `${n}字`;
                            return (
                                <button
                                    key={n}
                                    onClick={() => {
                                        if (isCustom) {
                                            setWordCountIsCustom(true);
                                        } else {
                                            setWordCountPreset(n);
                                            setWordCountIsCustom(false);
                                        }
                                    }}
                                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                                        active
                                            ? 'bg-[#1F1F1F] text-white shadow-sm shadow-[#1F1F1F]/20'
                                            : 'bg-white/80 text-[#666666] hover:bg-white border border-[#E5E5E5]'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    {wordCountIsCustom && (
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={MIN_CUSTOM_WORDS}
                                max={MAX_CUSTOM_WORDS}
                                step={100}
                                value={customWordCount}
                                onChange={e => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(v)) setCustomWordCount(v);
                                }}
                                className={`${INPUT_BASE} w-28 text-center`}
                            />
                            <span className="text-xs text-[#666666]">字（{MIN_CUSTOM_WORDS} ~ {MAX_CUSTOM_WORDS}）</span>
                        </div>
                    )}
                </section>

                {/* 视角（原"第几人称"） */}
                <section className="mb-4">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] mb-2">
                        <span className="inline-block h-3 w-0.5 rounded-full bg-[#D4D4D4]" />
                        视角
                    </h2>
                    <div className="flex gap-1.5">
                        {FANWAI_POVS.map(p => {
                            const active = pov === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setPov(p.id)}
                                    className={`flex-1 rounded-xl px-2 py-2 transition-all cursor-pointer text-left ${
                                        active
                                            ? 'bg-[#1F1F1F] text-white shadow-sm shadow-[#1F1F1F]/20'
                                            : 'bg-white/80 text-[#666666] hover:bg-white border border-[#E5E5E5]'
                                    }`}
                                >
                                    <span className="block text-xs font-bold leading-tight">{p.name}</span>
                                    <span className={`block text-[10px] font-normal mt-0.5 leading-tight ${active ? 'text-white/85' : 'text-[#9A9A9A]'}`}>
                                        {p.desc}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* 世界设定 */}
                <section className="mb-4">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] mb-2">
                        <span className="inline-block h-3 w-0.5 rounded-full bg-[#D4D4D4]" />
                        世界设定
                    </h2>
                    <textarea
                        value={worldSetting}
                        onChange={e => setWorldSetting(e.target.value)}
                        placeholder="请输入"
                        rows={4}
                        className={`${INPUT_BASE} resize-none leading-relaxed`}
                    />
                    <p className="mt-1 text-[10px] text-[#9A9A9A]">贴指令即可，AI 忠实执行并用足笔力。留空则自由发挥</p>
                </section>
            </div>

            {/* 底部操作（生成前：随机入口小字 + 生成按钮，让位 home 条） */}
            {!generated && (
                <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent" style={{ paddingBottom: 'max(1.5rem, calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 0.5rem))' }}>
                    <button
                        onClick={() => setRandomMode(v => !v)}
                        disabled={generating}
                        className="w-full mb-2 text-[11px] text-[#9A9A9A] hover:text-[#1F1F1F] transition-colors cursor-pointer"
                    >
                        {randomMode ? '✦ 自定义番外：按你选的文风 / 字数 / 视角生成' : '✦ 随机生成：字数、风格、视角全由 AI 决定'}
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="w-full rounded-2xl py-3 text-sm font-bold text-white bg-[#1F1F1F] shadow-md shadow-[#1F1F1F]/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {generating ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                正在为 ta 编织故事…
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-1.5">
                                {randomMode ? '来一篇随机的番外' : '开始写这篇番外'}
                                <span className="text-xs opacity-90">✎</span>
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* 生成中遮罩 */}
            {generating && (
                <div className="fixed inset-0 z-[80] bg-white/85 backdrop-blur-sm">
                    {/* 左上角返回键：万一不想等了直接返回（z 高于中央进度区，确保可点击） */}
                    <button
                        onClick={onClose}
                        className="absolute left-4 z-[90] flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[#666666] hover:bg-white/70 transition-colors cursor-pointer"
                        style={{ top: 'calc(var(--chrome-top) + 1.25rem)' }}
                        aria-label="返回"
                    >
                        <span className="text-sm leading-none">←</span>
                        <span>返回</span>
                    </button>
                    {/* 中央进度区（inset-0 会盖住先渲染的兄弟，故返回键须 z 更高） */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <div className="relative h-14 w-14">
                            <div className="absolute inset-0 rounded-full border-2 border-[#E5E5E5]" />
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#1F1F1F] animate-spin" />
                            <span className="absolute inset-0 flex items-center justify-center text-xl text-[#1F1F1F]">✎</span>
                        </div>
                        <p className="text-xs font-semibold text-[#666666]">正在为 ta 编织故事…</p>
                        <p className="text-[10px] text-[#9A9A9A]">番外较长，请稍候片刻</p>
                    </div>
                </div>
            )}

            {/* 生成结果预览（书籍排版） */}
            {generated && (
                <div className="fixed inset-0 z-[75] flex flex-col bg-white overflow-hidden">
                    <header className="flex items-center justify-between px-4 pt-1 pb-2 shrink-0" style={{ paddingTop: 'calc(var(--chrome-top) + 1.25rem)' }}>
                        <button
                            onClick={() => setGenerated('')}
                            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[#666666] hover:bg-white/70 transition-colors cursor-pointer"
                        >
                            <span className="text-sm leading-none">←</span>
                            <span>调整</span>
                        </button>
                        <div className="text-xs font-bold text-[#1F1F1F]">故事预览</div>
                        <div className="w-12" />
                    </header>
                    <div className="flex-1 overflow-y-auto px-4 pb-28">
                        <div className="mx-auto max-w-md rounded-2xl bg-white shadow-[0_6px_32px_rgba(0,0,0,0.06)] border border-[#E5E5E5] p-5">
                            {/* 书名 */}
                            <h2 className="text-center font-serif text-base font-bold text-[#1F1F1F] leading-relaxed">
                                {title}
                            </h2>
                            <div className="mx-auto mt-2 h-px w-10 bg-gradient-to-r from-transparent via-[#9A9A9A] to-transparent" />
                            <p className="mt-2 text-[10px] text-[#9A9A9A]">
                                {char?.name} · {currentStyle?.name} · 约{wordCount}字 · {currentPov?.name}
                            </p>
                            {/* 正文 */}
                            <article className="mt-4 whitespace-pre-wrap text-[13px] leading-[1.85] text-[#1F1F1F] font-light">
                                {body}
                            </article>
                        </div>
                    </div>
                    {/* 预览区底部：收藏（让位 home 条） */}
                    <div className="fixed bottom-0 inset-x-0 z-10 px-4 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent" style={{ paddingBottom: 'max(1.5rem, calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 0.5rem))' }}>
                        <button
                            onClick={handleCollect}
                            disabled={collected}
                            className={`w-full rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] cursor-pointer disabled:cursor-default ${
                                collected
                                    ? 'bg-[#34C77B] shadow-sm'
                                    : 'bg-[#1F1F1F] shadow-md shadow-[#1F1F1F]/20'
                            }`}
                        >
                            {collected ? '已收藏到拾光 ✓' : '收藏到拾光'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}