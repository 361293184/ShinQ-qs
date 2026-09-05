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
    generateFanwai, createFanwaiStoryId, continueFanwai,
} from '../../utils/fanwaiGenerator';
import { DB } from '../../utils/db';
import TokenImg from '../os/TokenImg';
import { FanwaiHtmlType, FanwaiGenMode, detectBuiltinHtmlType, HTML_TYPE_LABELS, detectExplicitQuantity, extractHtmlSize } from '../../utils/fanwai/formatDetector';

interface FanwaiGeneratePageProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: APIConfig;
    addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
    onClose: () => void;
    onCollect: (story: FanwaiStory) => Promise<void>;
}

interface SavedForm {
    /** 生成模式：text = 文字番外（默认）；html = HTML番外 */
    genMode?: FanwaiGenMode;
    style?: string;
    styleCustomDesc?: string;
    wordCountPreset?: number;
    wordCountIsCustom?: boolean;
    customWordCount?: number;
    pov?: 'first' | 'second' | 'third';
    worldSetting?: string;
}

/** 生成模式两段 pill 选项 */
const GEN_MODE_TABS: { id: FanwaiGenMode; label: string; desc: string }[] = [
    { id: 'text', label: '文字番外', desc: '小说排版' },
    { id: 'html', label: 'HTML番外', desc: '交互界面' },
];

const DEFAULT_WORD_PRESET = 1000;
const MIN_CUSTOM_WORDS = 100;
const MAX_CUSTOM_WORDS = 20000;

/** 输入框通用样式（贴合 SullyOS 基线：白底 + 细描边 + 中性灰焦点）。 */
const INPUT_BASE = 'w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#1F1F1F] placeholder:text-[#9A9A9A] outline-none focus:border-[#1F1F1F] focus:ring-2 focus:ring-[#1F1F1F]/10 transition-colors';

export default function FanwaiGeneratePage({ char, userProfile, apiConfig, addToast, onClose, onCollect }: FanwaiGeneratePageProps) {
    // 生成模式：文字番外（默认）/ HTML番外。显式控制输出形态，不再靠关键词猜。
    const [genMode, setGenMode] = useState<FanwaiGenMode>('text');
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
    // HTML 番外状态：命中格式指令时 generated 为完整 HTML，这里记录 format/htmlType 供预览/收藏分流。
    const [generatedFormat, setGeneratedFormat] = useState<'text' | 'html'>('text');
    const [generatedHtmlType, setGeneratedHtmlType] = useState<FanwaiHtmlType | undefined>(undefined);
    // 续写状态
    const [showContinueModal, setShowContinueModal] = useState(false);
    const [continueDirection, setContinueDirection] = useState('');
    const [continuing, setContinuing] = useState(false);

    // 记住上次选择（localStorage）
    useEffect(() => {
        try {
            const raw = localStorage.getItem(FANWAI_FORM_LS_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw) as SavedForm;
            if (saved.genMode === 'text' || saved.genMode === 'html') setGenMode(saved.genMode);
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
        const saved: SavedForm = { genMode, style, styleCustomDesc, wordCountPreset, wordCountIsCustom, customWordCount, pov, worldSetting };
        try { localStorage.setItem(FANWAI_FORM_LS_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
    }, [genMode, style, styleCustomDesc, wordCountPreset, wordCountIsCustom, customWordCount, pov, worldSetting]);

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
        setGeneratedFormat('text');
        setGeneratedHtmlType(undefined);
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
            { styleId: randomMode ? 'random' : style, styleCustomDesc: styleCustomDesc.trim() || undefined, wordCount, wordCountIsCustom, pov, worldSetting, recentMessages, randomMode, mode: genMode },
            subApi,
        );
        setGenerating(false);
        if (result.ok && result.content) {
            setGenerated(result.content);
            setGeneratedFormat(result.format === 'html' ? 'html' : 'text');
            setGeneratedHtmlType(result.htmlType);
            addToast(result.format === 'html' ? `已按【${HTML_TYPE_LABELS[result.htmlType || 'custom']}】格式生成，请预览确认` : '番外写好了', 'success');
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
            // HTML 番外记录格式/模板类型；文字番外缺省 text（零迁移）
            ...(generatedFormat === 'html' ? { format: 'html' as const, htmlType: generatedHtmlType || 'custom' } : {}),
        };
        await onCollect(story);
        setCollected(true);
        addToast('已收藏到拾光', 'success');
    };

    // 续写：仅纯文字番外。AI 接续生成并追加进预览正文末尾，随收藏保存完整内容。
    const handleContinue = async () => {
        if (!char || !generated || generatedFormat === 'html') return;
        if (continuing) return;
        if (!subApi.baseUrl || !subApi.apiKey || !subApi.model) {
            addToast('请先在设置 → 副 API 配置 填入副 API（续写走副 API）', 'info');
            return;
        }
        setShowContinueModal(false);
        setContinuing(true);
        try {
            // 构造临时 FanwaiStory 供 continueFanwai 读取原文（content/pov/worldSetting）
            const tempStory: FanwaiStory = {
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
            const res = await continueFanwai(char, tempStory, subApi, continueDirection || undefined);
            if (res.ok && res.content) {
                setGenerated(prev => prev + '\n\n' + res.content);
                setCollected(false); // 续写后内容变化，允许重新收藏（若已收藏则重置收藏态）
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
                <header className="flex items-center justify-between px-4 pt-1 pb-2 shrink-0 sticky top-0 z-20 bg-white" style={{ paddingTop: 'calc(var(--chrome-top) + 1.25rem)' }}>
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
                        <TokenImg value={char.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-[#E5E5E5]" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#1F1F1F]">为 {char.name} 写一篇番外</p>
                            <p className="text-[11px] text-[#666666] truncate">设定将结合 ta 的人设、记忆与你们的关系</p>
                        </div>
                        <span className="text-[#D4D4D4] text-base leading-none">✦</span>
                    </div>
                )}

                {/* 生成模式：文字番外 / HTML番外（显式切换，不再靠关键词猜） */}
                <section className="mb-4">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold text-[#1F1F1F] mb-2">
                        <span className="inline-block h-3 w-0.5 rounded-full bg-[#D4D4D4]" />
                        生成模式
                    </h2>
                    <div className="flex gap-1.5">
                        {GEN_MODE_TABS.map(t => {
                            const active = genMode === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setGenMode(t.id)}
                                    className={`flex-1 rounded-xl px-2 py-2 transition-all cursor-pointer text-left ${
                                        active
                                            ? 'bg-[#1F1F1F] text-white shadow-sm shadow-[#1F1F1F]/20'
                                            : 'bg-white/80 text-[#666666] hover:bg-white border border-[#E5E5E5]'
                                    }`}
                                >
                                    <span className="block text-xs font-bold leading-tight">{t.label}</span>
                                    <span className={`block text-[10px] font-normal mt-0.5 leading-tight ${active ? 'text-white/85' : 'text-[#9A9A9A]'}`}>
                                        {t.desc}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 text-[10px] text-[#9A9A9A] leading-relaxed">
                        {genMode === 'text'
                            ? '按小说排版输出纯文字，世界设定里的"手机/论坛/状态栏"等词按剧情内容理解，不会生成 HTML'
                            : '生成可交互的 HTML 界面；世界设定提到小手机/论坛/状态栏时套用对应版式，否则由 AI 按指令自由设计'}
                    </p>
                </section>

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
                    {detectExplicitQuantity(worldSetting) && (
                        <p className="mt-1.5 text-[10px] text-[#4F7CFF] font-medium">
                            ✏️ 检测到指令有字数/条数要求（如楼层/对话条数），将**以指令为准**，此档位仅作参考
                        </p>
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
                    {/* 格式提示只属于 HTML 模式：命中内置版式给出提示；文字模式一律不显示（强制纯文字） */}
                    {genMode === 'html' && (
                        (() => {
                            const builtin = detectBuiltinHtmlType(worldSetting);
                            return (
                                <p className="mt-1.5 text-[10px] text-[#4F7CFF] font-medium">
                                    {builtin
                                        ? `📱 世界设定命中【${HTML_TYPE_LABELS[builtin]}】版式，将按该模板生成`
                                        : '✨ 未指定具体版式，将按世界设定由 AI 自由生成 HTML 界面'}
                                </p>
                            );
                        })()
                    )}
                </section>
            </div>

            {/* 底部操作（生成前：随机入口小字 + 生成按钮，让位 home 条） */}
            {!generated && (
                <div className="fixed inset-x-0 z-10 px-4 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent" style={{ bottom: '0.5cm', paddingBottom: 'max(1.5rem, calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 0.5rem))' }}>
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
                    <header className="flex items-center justify-between px-4 shrink-0 sticky top-0 z-20 bg-[#1F1F1F]" style={{ paddingTop: 'calc(var(--chrome-top) / 2)', minHeight: 'calc(var(--chrome-top) / 2 + 4rem)' }}>
                        <div className="w-14 flex justify-start">
                            <button
                                onClick={() => setGenerated('')}
                                aria-label="返回调整"
                                className="p-2 rounded-full text-white hover:bg-white/10 active:scale-90 transition-transform cursor-pointer"
                            >
                                <span className="text-base leading-none">&lt;</span>
                            </button>
                        </div>
                        <div className="text-base font-bold text-white tracking-wide">番外</div>
                        <div className="w-14" />
                    </header>
                    <div className="flex-1 overflow-y-auto px-4 pb-28">
                        {generatedFormat === 'html' ? (
                            (() => {
                                const isCustom = generatedHtmlType === 'custom';
                                // custom 且指令给了具体 height 时按指令高度预览；否则 flex 撑满
                                const customSize = isCustom ? extractHtmlSize(worldSetting) : undefined;
                                const customH = customSize?.height;
                                return (
                                    <div className="mx-auto max-w-md" style={customH ? { height: customH, display: 'flex', flexDirection: 'column' } : { height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        {/* HTML 番外：沙盒 iframe 预览。内置模板禁脚本；custom 放开脚本支持交互 */}
                                        <iframe
                                            title={`${generatedHtmlType || 'custom'} 番外预览`}
                                            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#F5F7FB;font-family:-apple-system,'PingFang SC',sans-serif;}*{box-sizing:border-box}body{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:0;}</style></head><body>${generated}</body></html>`}
                                            sandbox={isCustom ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
                                            style={{ width: '100%', flex: 1, border: '1px solid #E5E5E5', borderRadius: 16, background: '#fff', display: 'block' }}
                                        />
                                    </div>
                                );
                            })()
                        ) : (
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
                                {/* 续写入口：纯文字番外常态显示（不管是否截断） */}
                                <button
                                    onClick={() => setShowContinueModal(true)}
                                    disabled={continuing}
                                    className="mt-5 w-full py-2.5 rounded-xl border border-dashed border-[#4F7CFF]/40 bg-[#F4F7FF] text-[12px] text-[#4F7CFF] font-medium active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {continuing ? '✍️ 续写中…' : '✍️ 续写'}
                                </button>
                            </div>
                        )}
                    </div>
                    {/* 预览区底部：收藏（让位 home 条） */}
                    <div className="fixed inset-x-0 z-10 px-4 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent" style={{ bottom: '0.5cm', paddingBottom: 'max(1.5rem, calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 0.5rem))' }}>
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

            {/* 续写弹框：续写走向（可选）+ 开始/取消 */}
            {showContinueModal && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm px-6" onClick={() => setShowContinueModal(false)}>
                    <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5E5] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] animate-slide-up" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-[#1F1F1F] flex items-center gap-2">
                            <span className="text-[#4F7CFF]">✍️</span> 续写番外
                        </h3>
                        <p className="text-xs text-[#9A9A9A] mt-1">AI 会接着正文末尾继续写，保持人物与文风。可填续写走向（可选）：</p>
                        <textarea
                            value={continueDirection}
                            onChange={e => setContinueDirection(e.target.value.slice(0, 100))}
                            placeholder="例：他们后来一起去旅行…（留空则自然接续前文）"
                            className="mt-3 w-full h-20 rounded-xl border border-[#E5E5E5] bg-[#FAFBFF] p-3 text-[13px] text-[#1F1F1F] resize-none outline-none focus:border-[#4F7CFF]/60"
                        />
                        <div className="mt-2 text-right text-[10px] text-[#9A9A9A]">{continueDirection.length}/100</div>
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => setShowContinueModal(false)} className="flex-1 rounded-xl bg-white border border-[#E5E5E5] py-2.5 text-xs font-bold text-[#666666] active:scale-[0.98] transition-transform cursor-pointer">
                                取消
                            </button>
                            <button onClick={handleContinue} className="flex-1 rounded-xl bg-gradient-to-r from-[#4F7CFF] to-[#6C8CFF] py-2.5 text-xs font-bold text-white shadow-md shadow-[#4F7CFF]/30 active:scale-[0.98] transition-transform cursor-pointer">
                                开始续写
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}