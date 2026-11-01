import React, { useEffect, useRef, useState } from 'react';
import {
    ArrowLeft, ArrowsClockwise, BookOpen, ChatCircleDots, Gear, Images, MagnifyingGlass,
    MusicNotes, NotePencil, Notebook, Wallet, WifiHigh, BatteryFull,
} from '@phosphor-icons/react';
import { nowInTimeZone } from '../../utils/timezone';
import type { PhoneHolder } from '../../utils/offlineMode/phoneHolder';
import OfflinePhoneWechat from './OfflinePhoneWechat';
import OfflinePhoneAppList from './OfflinePhoneAppList';
import OfflinePhoneAlipay from './OfflinePhoneAlipay';
import OfflinePhoneMusic from './OfflinePhoneMusic';
import OfflinePhoneGallery from './OfflinePhoneGallery';
import OfflinePhoneMemo from './OfflinePhoneMemo';
import OfflinePhoneUserPhone from './OfflinePhoneUserPhone';
import OfflinePhonePermissions from './OfflinePhonePermissions';
import {
    generatePhoneContent, readPhoneContent, clearPhoneContent,
    missingBlocks, PHONE_BLOCK_ORDER,
    type PhoneBlockId, type PhoneContent, type PhoneListEntry,
} from '../../utils/offlineMode/phoneContent';
import type { SubApiConfig } from '../../utils/fanwaiGenerator';

/**
 * 线下模式 · 悬浮手机弹窗（方向 A 的外壳）。
 *
 * 三条形态要求来自方案文档，都别改：
 * 1. **不加遮罩**——聊天界面原样留在背后，不压暗不模糊。层次靠机身投影和边框建立。
 * 2. 手机轮廓比例（约 9:19.5），大圆角 + 细中框 + 刘海 + 底部 Home 条。
 * 3. 顶部状态栏显示**角色时区的时间**，并标注这是谁的手机。
 *
 * 本步只做外壳：桌面网格 + 各 App 的占位页。微信真实同步、相册等内容放后面几步。
 */

type AppId = 'wechat' | 'gallery' | 'memo' | 'alipay' | 'read' | 'browser' | 'diary' | 'music'
    | 'chat' | 'bank';

interface AppEntry {
    id: AppId;
    label: string;
    bg: string;
    icon: React.ReactNode;
    note: string;
}

/** 他的手机：这一套内容是本项目自建的，不复用「查手机」的数据 */
const APPS_HIS: AppEntry[] = [
    { id: 'wechat', label: '微信', bg: 'from-emerald-400 to-emerald-500', icon: <ChatCircleDots className="w-6 h-6" weight="fill" />, note: '和他的聊天记录（和你这边的真实消息同步）、他自己的群、他和别人的私聊' },
    { id: 'gallery', label: '相册', bg: 'from-sky-400 to-indigo-400', icon: <Images className="w-6 h-6" weight="fill" />, note: '他眼里的世界：生活片段、随手拍、存下的图' },
    { id: 'memo', label: '备忘录', bg: 'from-amber-400 to-orange-400', icon: <NotePencil className="w-6 h-6" weight="fill" />, note: '待办、随手记、写了一半的句子' },
    { id: 'alipay', label: '支付宝', bg: 'from-blue-500 to-sky-500', icon: <Wallet className="w-6 h-6" weight="fill" />, note: '账单、转账、给谁花过钱' },
    { id: 'read', label: '读书', bg: 'from-rose-400 to-pink-500', icon: <BookOpen className="w-6 h-6" weight="fill" />, note: '在读什么、划线笔记' },
    { id: 'browser', label: '浏览器', bg: 'from-slate-500 to-slate-600', icon: <MagnifyingGlass className="w-6 h-6" weight="bold" />, note: '搜索记录——最暴露内心的东西' },
    { id: 'diary', label: '日记', bg: 'from-violet-400 to-purple-500', icon: <Notebook className="w-6 h-6" weight="fill" />, note: '翻到就走不掉的内容' },
    { id: 'music', label: '音乐', bg: 'from-red-400 to-rose-500', icon: <MusicNotes className="w-6 h-6" weight="fill" />, note: '他最近在听什么' },
];

interface Props {
    open: boolean;
    holder: PhoneHolder;
    charId: string;
    charName: string;
    userName: string;
    /** 副 API：手机内容一次性生成用它，主 API 只负责聊天 */
    subApi?: SubApiConfig;
    /** 生成时需要的角色主体（拿人设做底色） */
    char?: any;
    user?: any;
    /** 角色时区 id，用于状态栏时间（resolveCharTimeZone 的结果） */
    charTimeZone?: string;
    onClose: () => void;
}

/** App → 生成内容里的字段（"你的手机"那几个不在这张表里：它们是你自己的数据，不是生成的） */
const CONTENT_KEY: Partial<Record<AppId, keyof PhoneContent>> = {
    gallery: 'gallery',
    memo: 'memo',
    diary: 'diary',
    alipay: 'alipay',
    read: 'read',
    browser: 'browser',
    music: 'music',
};

const pad = (n: number) => n.toString().padStart(2, '0');

export default function OfflinePhonePanel({
    open, holder, charId, charName, userName, subApi, char, user, charTimeZone, onClose,
}: Props) {
    const [activeApp, setActiveApp] = useState<AppId | null>(null);
    // 手机内容：按块并行生成 + 缓存，打开他的手机时只补缺的块
    const [content, setContent] = useState<PhoneContent | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genError, setGenError] = useState<string>('');
    // 进度（§5.9 E：显示「已完成 M / 共 N」，不出现「API」字样）
    const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
    // 右上角循环箭头的下拉菜单（文档 §4.2：先选范围，不直接覆盖已有内容）
    const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
    // 当前这次生成是「全量」还是「补齐」，只影响弹窗文案
    const [genMode, setGenMode] = useState<'all' | 'fill'>('all');
    // 你的手机：右上角齿轮 → 「他能看到什么」（§5.26 J ②）
    const [permissionsOpen, setPermissionsOpen] = useState(false);

    /**
     * char / user / subApi 都是父组件每次渲染新建的对象（尤其是 subApi 的内联字面量）。
     * 一旦把它们放进 useEffect 依赖，父组件任何一次重渲染都会让下面这段重跑：
     * 重读缓存 → setContent(新的解析结果) → 子组件 entries 换引用 → 刚点开的详情被重置。
     * 这就是「点开详情不到一秒就退回去」的根因，所以这里用 ref 取最新值，依赖只留稳定项。
     */
    const latest = useRef({ char, user, subApi });
    latest.current = { char, user, subApi };

    /** only 只在挂载时用（那一刻 content 还是 null，不能靠组件状态判断缺哪块） */
    const runGenerate = (mode: 'all' | 'fill', only?: PhoneBlockId[]) => {
        const { char: curChar, user: curUser, subApi: curSub } = latest.current;
        if (!curChar || !curUser || generating) return;
        const targets: PhoneBlockId[] | undefined = mode === 'fill'
            ? (only && only.length ? only : missingBlocks(content))
            : undefined;
        if (mode === 'fill' && targets && targets.length === 0) {
            setGenError('没有缺的内容');
            return;
        }
        if (mode === 'all') {
            clearPhoneContent(charId);
            setContent(null);
            setActiveApp(null);
        }
        setGenMode(mode);
        setGenerating(true);
        setGenError('');
        setGenProgress({ done: 0, total: targets?.length || PHONE_BLOCK_ORDER.length });
        generatePhoneContent(curChar, curUser, curSub || ({} as SubApiConfig), {
            force: mode === 'all',
            only: targets,
            onProgress: (done, total) => setGenProgress({ done, total }),
        })
            .then((result) => {
                // 分块生成已经把旧内容合并进 result.content（含补齐的块），直接用最新的
                if (result.content) setContent(result.content);
                if (result.reason === 'no_sub_api') {
                    setGenError('没有配置副 API，手机内容生成不了（设置 → 其他 API）');
                } else if (result.failed.length) {
                    setGenError(`有 ${result.failed.length} 块没生成出来，点右上角「仅补齐未完成的」再试一次`);
                } else if (!result.content) {
                    setGenError('生成失败了，点右上角重新生成');
                }
            })
            .catch((error) => {
                console.error('[offline-phone] 生成异常', error);
                setGenError('生成失败了，点右上角重新生成');
            })
            .finally(() => {
                setGenerating(false);
                setGenProgress(null);
            });
    };

    useEffect(() => {
        if (!open || holder !== 'char' || !charId) return;
        const cached = readPhoneContent(charId);
        if (cached) {
            // 只在还没内容时写入，避免每次重读都把 content 换成新对象引用
            setContent((prev) => prev || cached);
            const missing = missingBlocks(cached);
            if (missing.length) runGenerate('fill', missing);
            return;
        }
        runGenerate('all');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, holder, charId]);

    /**
     * mode='all'：清缓存重生成，全部覆盖；
     * mode='fill'：只补没内容的块（§5.9 G：任何失败都不该导致全部重来）。
     */
    const regenerate = (mode: 'all' | 'fill' = 'all') => runGenerate(mode);
    const [clock, setClock] = useState(() => {
        const d = nowInTimeZone(charTimeZone);
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });

    // 弹窗开着时每分钟推一次时间，别让状态栏停在打开那一刻
    useEffect(() => {
        if (!open) { setActiveApp(null); setRefreshMenuOpen(false); return; }
        const tick = () => {
            const d = nowInTimeZone(charTimeZone);
            setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        };
        tick();
        const timer = window.setInterval(tick, 30_000);
        return () => window.clearInterval(timer);
    }, [open, charTimeZone]);

    if (!open) return null;

    // 看谁的手机会决定里面有什么：默认只能看自己的（他的手机得先在你手里）
    const apps = APPS_HIS;
    const current = holder === 'char' ? (apps.find((a) => a.id === activeApp) || null) : null;
    const ownerLabel = holder === 'char' ? '他的手机' : '你的手机';
    // §5.9 H：「仅补齐未完成的」平时不出现，只有确实缺块时才给
    const missing = holder === 'char' ? missingBlocks(content) : [];

    /**
     * 他的手机里每个 App 有自己的界面（文档 §5.6~§5.14），
     * 只有读书 / 浏览器 / 日记还走通用列表 + 详情。
     */
    const renderCharApp = (app: AppEntry) => {
        if (!content) return null;
        switch (app.id) {
            case 'alipay':
                return (
                    <OfflinePhoneAlipay
                        key="alipay"
                        entries={content.alipay || []}
                        assets={content.alipayAssets}
                        emptyHint={`${app.label}里没有内容`}
                    />
                );
            case 'music':
                return (
                    <OfflinePhoneMusic
                        key="music"
                        entries={content.music || []}
                        playlists={content.musicPlaylists}
                        emptyHint={`${app.label}里没有内容`}
                    />
                );
            case 'gallery':
                return <OfflinePhoneGallery key="gallery" entries={content.gallery || []} emptyHint={`${app.label}里没有内容`} />;
            case 'memo':
                return <OfflinePhoneMemo key="memo" entries={content.memo || []} emptyHint={`${app.label}里没有内容`} />;
            default: {
                const key = CONTENT_KEY[app.id];
                if (!key) return null;
                return (
                    <OfflinePhoneAppList
                        key={app.id}
                        kind="list"
                        entries={(content[key] as PhoneListEntry[] | undefined) || []}
                        emptyHint={`${app.label}里没有内容`}
                        label={app.label}
                    />
                );
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
            {/* 点外部关闭：透明、不压暗，聊天界面原样留在背后 */}
            <div className="absolute inset-0" onClick={onClose} />

            <div
                className="relative rounded-[38px] p-[3px] bg-slate-900/90 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.55)]"
                style={{ width: '82%', maxWidth: 330, height: '72%', maxHeight: 620 }}
            >
                <div className="w-full h-full rounded-[35px] overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col relative">
                    {/* 刘海：永远最上层 */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-slate-900/90 z-50" />

                    {/*
                      菜单兜底层：必须低于状态栏（z-30）。
                      状态栏是 flex 子元素且带 z-index，会自成一层；兜底层若是 z-20 盖在它上面，
                      菜单虽然看得见却点不到——刷新按钮会「点了没反应」。
                    */}
                    {refreshMenuOpen && (
                        <div className="absolute inset-0 z-10" onClick={() => setRefreshMenuOpen(false)} />
                    )}

                    {/* 状态栏：角色时区的时间 + 这是谁的手机 */}
                    <div className="h-11 shrink-0 flex items-center justify-between px-5 pt-2.5 text-[11px] font-bold text-slate-700 z-30">
                        <span>{clock}</span>
                        <span className="flex items-center gap-1 text-slate-400 text-[10px] font-medium">
                            <span className="truncate max-w-[86px]">{ownerLabel}</span>
                            <WifiHigh className="w-3 h-3" weight="bold" />
                            <BatteryFull className="w-4 h-4" weight="fill" />
                            {/* 文档 §4.2：右上角循环箭头 → 弹小菜单，不直接覆盖生成 */}
                            {holder === 'char' && (
                                <span className="relative">
                                    <button
                                        onClick={() => setRefreshMenuOpen((v) => !v)}
                                        disabled={generating}
                                        title="重新生成"
                                        className={`ml-0.5 w-6 h-6 rounded-full flex items-center justify-center active:bg-slate-200 ${generating ? 'text-sky-500' : ''}`}
                                    >
                                        <ArrowsClockwise className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} weight="bold" />
                                    </button>
                                    {refreshMenuOpen && (
                                        <span className="absolute right-0 top-7 w-40 rounded-xl bg-white shadow-[0_10px_30px_-6px_rgba(15,23,42,0.35)] border border-slate-200 py-1 z-40 block text-[11px] font-medium text-slate-600">
                                            <button onClick={() => { setRefreshMenuOpen(false); regenerate('all'); }} className="w-full px-3 py-2 text-left active:bg-slate-100">重新生成全部</button>
                                            {missing.length > 0 && (
                                                <button onClick={() => { setRefreshMenuOpen(false); regenerate('fill'); }} className="w-full px-3 py-2 text-left active:bg-slate-100 whitespace-nowrap">仅补齐未完成的（{missing.length}）</button>
                                            )}
                                            <button onClick={() => setRefreshMenuOpen(false)} className="w-full px-3 py-2 text-left text-slate-400 active:bg-slate-100">取消</button>
                                        </span>
                                    )}
                                </span>
                            )}
                            {/* 你的手机：右上角是齿轮（和他的手机那个刷新箭头正好对称） */}
                            {holder !== 'char' && (
                                <button
                                    onClick={() => setPermissionsOpen(true)}
                                    title="他能看到什么"
                                    className="ml-0.5 w-6 h-6 rounded-full flex items-center justify-center active:bg-slate-200"
                                >
                                    <Gear className="w-3.5 h-3.5" weight="bold" />
                                </button>
                            )}
                        </span>
                    </div>

                    {/* 桌面 / App 页 */}
                    <div className="flex-1 relative overflow-hidden">
                        {holder !== 'char' ? (
                            /* 你的手机：三个真实 App + 齿轮（§5.26 J）。没有生成、没有加载 */
                            <OfflinePhoneUserPhone
                                charId={charId}
                                charName={charName}
                                userName={userName}
                                onOpenPermissions={() => setPermissionsOpen(true)}
                            />
                        ) : !current ? (
                            <div className="px-4 pt-6">
                                <div className="text-[11px] text-slate-400 mb-3 pl-1">
                                    {holder === 'char' ? `${charName}的手机` : '你的手机'}
                                </div>
                                {/* 生成中由全屏弹窗负责提示，这里只剩失败回执 */}
                                {!generating && genError && (
                                    <div className="mb-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-500 text-[10px] leading-4 px-3 py-1.5">
                                        {genError}
                                    </div>
                                )}
                                <div className="grid grid-cols-4 gap-x-2 gap-y-4">
                                    {apps.map((app) => (
                                        <button
                                            key={app.id}
                                            onClick={() => setActiveApp(app.id)}
                                            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                                        >
                                            <span className={`w-12 h-12 rounded-[15px] bg-gradient-to-br ${app.bg} text-white flex items-center justify-center shadow-sm`}>
                                                {app.icon}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-medium">{app.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="absolute inset-0 bg-white flex flex-col">
                                <div className="h-10 shrink-0 flex items-center gap-1 px-2 border-b border-slate-100">
                                    <button onClick={() => setActiveApp(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                                        <ArrowLeft className="w-4 h-4" weight="bold" />
                                    </button>
                                    <span className="text-[13px] font-bold text-slate-700">{current.label}</span>
                                </div>
                                {/*
                                  他的手机：微信 ①② 类读真实聊天，③④ 类用生成内容；
                                  其余 App 的内容全部来自一次性生成（副 API）。
                                */}
                                {holder === 'char' && current.id === 'wechat' ? (
                                    <div className="flex-1 relative overflow-hidden">
                                        <OfflinePhoneWechat
                                            charId={charId}
                                            charName={charName}
                                            userName={userName}
                                            extraChats={content?.wechatChats}
                                            extraGroups={content?.wechatGroups}
                                            profile={content?.profile}
                                            moments={content?.moments}
                                        />
                                    </div>
                                ) : holder === 'char' && CONTENT_KEY[current.id] ? (
                                    <div className="flex-1 relative overflow-hidden">
                                        {content ? (
                                            renderCharApp(current)
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                                                <div className="text-[11px] text-slate-400">
                                                    {generating ? '正在生成他的手机…（首次需要十几秒）' : (genError || '内容还没生成')}
                                                </div>
                                                {!generating && (
                                                    <button onClick={() => regenerate('all')} className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[10px] active:scale-95">
                                                        重新生成
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
                                        <span className={`w-14 h-14 rounded-[18px] bg-gradient-to-br ${current.bg} text-white flex items-center justify-center shadow`}>
                                            {current.icon}
                                        </span>
                                        <div className="text-[12px] font-bold text-slate-600 mt-1">
                                            {holder === 'char' ? '这个 App 还没接上数据' : '这是你自己的手机'}
                                        </div>
                                        <div className="text-[11px] leading-5 text-slate-400">{current.note}</div>
                                        {holder !== 'char' && current.id === 'chat' ? (
                                            <button
                                                onClick={onClose}
                                                className="mt-1 px-3 py-1.5 rounded-full bg-slate-900 text-white text-[10px] active:scale-95"
                                            >
                                                收起手机，回去说话
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 权限设置：盖住整块屏幕（刘海之上留出来），返回键回主屏 */}
                    {permissionsOpen && holder !== 'char' && (
                        <div className="absolute left-0 right-0 top-0 bottom-6 z-[45]">
                            <OfflinePhonePermissions
                                charId={charId}
                                charName={charName}
                                onBack={() => setPermissionsOpen(false)}
                            />
                        </div>
                    )}

                    {/*
                      生成中弹窗：盖住屏幕内容区（刘海、Home 条保持原样），生成完自动消失。
                      之前只有一行小字提示，很容易被当成「点了没反应」，这里改成能看见的等待层。
                    */}
                    {generating && (
                        <div className="absolute left-0 right-0 top-0 bottom-6 z-40 flex flex-col items-center justify-center gap-3 px-6 text-center bg-white/85 backdrop-blur-[2px]">
                            <ArrowsClockwise className="w-7 h-7 text-slate-500 animate-spin" weight="bold" />
                            <div className="text-[12px] font-bold text-slate-700">
                                {genMode === 'fill' ? '正在补齐没生成的部分…' : '正在生成他的手机…'}
                            </div>
                            {genProgress && genProgress.total > 0 && (
                                <div className="flex items-center gap-1.5">
                                    {Array.from({ length: genProgress.total }).map((_, index) => (
                                        <span
                                            key={index}
                                            className={`w-1.5 h-1.5 rounded-full ${index < genProgress.done ? 'bg-slate-500' : 'bg-slate-300'}`}
                                        />
                                    ))}
                                    <span className="ml-1 text-[10px] text-slate-500 font-medium">
                                        {genProgress.done} / {genProgress.total}
                                    </span>
                                </div>
                            )}
                            <div className="text-[10px] leading-4 text-slate-400">
                                分成几块同时生成，首次大概要十几秒；好了会自己关掉，之后就能挨个点开看
                            </div>
                        </div>
                    )}

                    {/* Home 指示条 */}
                    <div className="h-6 shrink-0 flex items-start justify-center">
                        <div className="w-24 h-1 rounded-full bg-slate-900/25" />
                    </div>
                </div>
            </div>
        </div>
    );
}
