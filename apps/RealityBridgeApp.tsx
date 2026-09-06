/**
 * 现实桥 App —— Sully 桌面入口。
 *
 * iPhone 快捷指令 POST 现实数据 → Cloudflare Worker(reality-bridge) →
 * 按「角色接收开关 + 自动回应」处理 → App 存活期间全局轮询器把事件+回应
 * 幂等合并进对应角色会话。本页负责：连接状态 / 角色开关 / 联动规则 · 快捷动作 ·
 * 数据项 · 屏幕速聊 四分区 / 历史(最近收到 · 最近快捷指令) / Worker 配置。
 *
 * 结构对齐 ai-virtual-phone reality-bridge：Tab(main|history)，
 * main 下四分区 + 每分区多步创建向导，history 下 feed/commands 两子页。
 */
import React, { useEffect, useState } from 'react';
import { X, GearSix, Broadcast, ClipboardText, Eraser, ArrowClockwise, CaretDown } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { CharacterProfile } from '../types';
import {
    BridgeRule, BridgeSettings, BridgeShortcutAction, BridgeDataItem, ScreenChatSettings,
} from '../utils/realityBridge/types';
import {
    loadBridgeSettings, saveBridgeSettings, loadBridgeRules, saveBridgeRules,
    loadBridgeActions, saveBridgeActions, loadBridgeDataItems, saveBridgeDataItems,
    loadBridgeFeed, clearBridgeFeed, loadScreenChat, saveScreenChat,
} from '../utils/realityBridge/settings';
import { bridgeStatus, uploadBridgeConfig } from '../utils/realityBridge/sync';
import { CharSwitchList } from '../components/reality-bridge/char-switches';
import { RulesSection } from '../components/reality-bridge/rules-section';
import { ActionsSection, DataItemsSection, ScreenChatSection } from '../components/reality-bridge/other-sections';

type MainSec = 'rules' | 'shortcuts' | 'queries' | 'screen';
type HistSec = 'feed' | 'commands';

const MAIN_SECS: Array<{ key: MainSec; label: string }> = [
    { key: 'rules', label: '联动规则' },
    { key: 'shortcuts', label: '快捷动作' },
    { key: 'queries', label: '数据项' },
    { key: 'screen', label: '屏幕速聊' },
];

function ToggleRow({ checked, onChange, label, desc }: { checked: boolean; onChange: () => void; label: string; desc?: string }) {
    return (
        <button onClick={onChange} className="w-full flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 cursor-pointer transition-colors"
            style={{ borderColor: checked ? '#CBD5A0' : '#E5E0D2', background: checked ? '#F2F5E9' : '#fff' }}>
            <span className="flex-1 text-left">
                <span className="block text-[12px] font-bold text-[#3A3A38]">{label}</span>
                {desc && <span className="block text-[10px] text-[#A89B7F] mt-0.5">{desc}</span>}
            </span>
            <span className="w-9 h-5 rounded-full p-0.5 transition-colors flex items-center" style={{ background: checked ? '#7F8C52' : '#E0DACB' }}>
                <span className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </span>
        </button>
    );
}

const RealityBridgeApp: React.FC = () => {
    const { closeApp, characters, addToast } = useOS();
    const [settings, setSettings] = useState<BridgeSettings>(() => loadBridgeSettings());
    const [rules, setRules] = useState<BridgeRule[]>(() => loadBridgeRules());
    const [actions, setActions] = useState<BridgeShortcutAction[]>(() => loadBridgeActions());
    const [dataItems, setDataItems] = useState<BridgeDataItem[]>(() => loadBridgeDataItems());
    const [feed, setFeed] = useState(() => loadBridgeFeed());
    const [screenChat, setScreenChat] = useState<ScreenChatSettings>(() => loadScreenChat());

    const [tab, setTab] = useState<'main' | 'history'>('main');
    const [mainSec, setMainSec] = useState<MainSec>('rules');
    const [histSec, setHistSec] = useState<HistSec>('feed');
    const [showConfig, setShowConfig] = useState(false);
    const [expandedChar, setExpandedChar] = useState<string | null>(null);
    const [charListOpen, setCharListOpen] = useState(false);
    const [statusInfo, setStatusInfo] = useState<{ ok?: boolean; version?: string; todayCount?: number; checking?: boolean } | null>(null);

    const persistSettings = (next: BridgeSettings) => { setSettings(next); saveBridgeSettings(next); };
    const persistRules = (next: BridgeRule[]) => { setRules(next); saveBridgeRules(next); };
    const persistActions = (next: BridgeShortcutAction[]) => { setActions(next); saveBridgeActions(next); };
    const persistItems = (next: BridgeDataItem[]) => { setDataItems(next); saveBridgeDataItems(next); };
    const refreshFeed = () => setFeed(loadBridgeFeed());

    const checkStatus = async () => {
        setStatusInfo(s => ({ ...s, checking: true }));
        const res = await bridgeStatus();
        setStatusInfo({ ok: res.ok, version: res.info?.version, todayCount: res.info?.todayCount, checking: false });
    };
    useEffect(() => { if (settings.workerUrl.trim()) void checkStatus(); /* eslint-disable-line */ }, [settings.workerUrl]);

    // Worker 地址/Token 配置卡
    const configCard = showConfig ? (
        <div className="rounded-2xl border border-[#E5E0D2] bg-white p-3.5 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#3A3A38]">Worker 配置</span>
                <button onClick={() => setShowConfig(false)} className="p-1 rounded-full hover:bg-[#F1EDE3] cursor-pointer"><X className="w-4 h-4 text-[#A89B7F]" /></button>
            </div>
            <div className="space-y-2">
                <ToggleRow checked={settings.enabled} onChange={() => persistSettings({ ...settings, enabled: !settings.enabled })} label="自动接收" desc="开启后 App 存活期间定时拉取云端事件并合并进角色会话" />
                <label className="block">
                    <span className="block text-[10px] font-bold text-[#6F7C54] mb-1">Worker 地址</span>
                    <input className="w-full rounded-xl border border-[#E5E0D2] px-3 py-2 text-[12px] outline-none focus:border-[#B4C198]" placeholder="https://bridge.xxx.workers.dev"
                        value={settings.workerUrl} onChange={e => persistSettings({ ...settings, workerUrl: e.target.value })} />
                </label>
                <label className="block">
                    <span className="block text-[10px] font-bold text-[#6F7C54] mb-1">Token</span>
                    <input className="w-full rounded-xl border border-[#E5E0D2] px-3 py-2 text-[12px] outline-none focus:border-[#B4C198]" placeholder="与 Worker 的 CLIENT_TOKEN 一致"
                        value={settings.token} onChange={e => persistSettings({ ...settings, token: e.target.value })} />
                </label>
                <label className="block">
                    <span className="block text-[10px] font-bold text-[#6F7C54] mb-1">轮询间隔（秒）</span>
                    <input className="w-full rounded-xl border border-[#E5E0D2] px-3 py-2 text-[12px] outline-none focus:border-[#B4C198]" type="number" min={10} max={300}
                        value={settings.pollSeconds} onChange={e => persistSettings({ ...settings, pollSeconds: Math.max(10, Math.min(300, Number(e.target.value) || 20)) })} />
                </label>
            </div>
            <SyncButton settings={settings} rules={rules} actions={actions} dataItems={dataItems} characters={characters} addToast={addToast} onDone={() => void checkStatus()} />
        </div>
    ) : null;

    const mainSecLabel = MAIN_SECS.find(m => m.key === mainSec)?.label || '';
    const quickTest = async () => {
        // 发一条测试事件，走与 iPhone 快捷指令同一条 POST 路径
        const { sendBridgeTestItem } = await import('../utils/realityBridge/sync');
        const res = await sendBridgeTestItem('测试', `（来自现实桥的测试事件 ${new Date().toLocaleTimeString()}）`);
        if (res.ok) { addToast('已发送测试事件，稍候查看历史与角色会话', 'success'); refreshFeed(); }
        else addToast(res.error || '发送失败', 'error');
    };

    return (
        <div className="h-full w-full bg-[#F6F4EC] flex flex-col font-sans overflow-hidden">
            {/* 顶栏 */}
            <div className="bg-[#FCF9F2]/85 backdrop-blur-md border-b border-[#EAE4D4] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    <button onClick={() => closeApp()} className="p-2 -ml-2 rounded-full hover:bg-[#F0ECE2] active:scale-90 transition-transform cursor-pointer" aria-label="返回桌面">
                        <X className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                    <span className="font-bold text-[#4A3F35] text-sm tracking-wide">现实桥</span>
                    <button onClick={() => setShowConfig(v => !v)} className="p-2 -mr-2 rounded-full hover:bg-[#F0ECE2] active:scale-90 transition-transform cursor-pointer" aria-label="配置">
                        <GearSix className="w-5 h-5 text-[#4A3F35]" weight="fill" />
                    </button>
                </div>
                {/* 连接状态卡 */}
                <div className="px-4 pb-2.5">
                    <div className="rounded-2xl border px-3.5 py-2.5 flex items-center gap-3" style={{ borderColor: settings.workerUrl ? '#CBD5A0' : '#E0DACB', background: settings.workerUrl ? '#F4F6EA' : '#F7F4EC' }}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${settings.workerUrl && statusInfo?.ok ? 'bg-[#7F8C52]' : 'bg-[#D3CDBC]'} ${statusInfo?.checking ? 'animate-pulse' : ''}`} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-[#3A3A38]">
                                {!settings.workerUrl ? '未配置 Worker' : statusInfo?.ok ? '已连接' : statusInfo ? '连接异常' : '检查中…'}
                            </p>
                            <p className="text-[10px] text-[#A89B7F] truncate">
                                {settings.workerUrl ? settings.workerUrl : '点右上角 ⚙ 填写 Cloudflare Worker 地址与 Token'}
                                {statusInfo?.ok && statusInfo.version ? ` · v${statusInfo.version}` : ''}
                                {statusInfo?.ok && statusInfo.todayCount !== undefined ? ` · 今日收到 ${statusInfo.todayCount}` : ''}
                            </p>
                        </div>
                        <button onClick={() => void checkStatus()} aria-label="刷新状态" className="p-1.5 rounded-full hover:bg-[#ECE7DA] cursor-pointer"><ArrowClockwise className={`w-3.5 h-3.5 text-[#7F8C52] ${statusInfo?.checking ? 'animate-spin' : ''}`} weight="bold" /></button>
                    </div>
                </div>
                {/* Tab */}
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-1 rounded-full bg-[#EDE9DE] p-1">
                        {(['main', 'history'] as const).map(k => (
                            <button key={k} onClick={() => setTab(k)} className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${tab === k ? 'bg-white text-[#6F7C54] shadow-sm' : 'text-[#A89B7F]'}`}>
                                {k === 'main' ? '桥接' : '历史'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mx-auto max-w-lg px-4 pt-3 pb-6 space-y-4">
                    {configCard}

                    {tab === 'main' ? (
                        <>
                            {/* 角色接收（默认收起，点击标题展开） */}
                            <section>
                                <button
                                    onClick={() => setCharListOpen(v => !v)}
                                    aria-expanded={charListOpen}
                                    className="w-full flex items-center gap-1.5 px-1 py-1 mb-1.5 cursor-pointer"
                                >
                                    <CaretDown className={`w-3 h-3 text-[#A89B7F] transition-transform ${charListOpen ? '' : '-rotate-90'}`} weight="bold" />
                                    <span className="text-[11px] font-bold text-[#A89B7F] uppercase tracking-wide flex items-center gap-1.5">
                                        <Broadcast className="w-3.5 h-3.5" weight="fill" />角色接收
                                    </span>
                                    <span className="text-[10px] font-bold text-[#6F7C54] bg-[#ECEFDF] px-1.5 py-0.5 rounded-full">
                                        已开 {Object.values(settings.perChar || {}).filter(p => p?.enabled).length} / {characters.length}
                                    </span>
                                </button>
                                {charListOpen && (
                                    <>
                                        <p className="text-[10px] text-[#BDB5A4] px-1 mb-2">谁开着，现实桥事件才会写进谁的会话；默认全关。</p>
                                        <CharSwitchList
                                            characters={characters as CharacterProfile[]}
                                            prefs={settings.perChar || {}}
                                            expanded={expandedChar}
                                            onToggleExpand={id => setExpandedChar(v => (v === id ? null : id))}
                                            onToggle={(id, pref) => { const perChar = { ...(settings.perChar || {}), [id]: pref }; persistSettings({ ...settings, perChar }); if (!pref.enabled && expandedChar === id) setExpandedChar(null); }}
                                            onToggleAutoReply={(id, pref) => { const perChar = { ...(settings.perChar || {}), [id]: pref }; persistSettings({ ...settings, perChar }); }}
                                        />
                                    </>
                                )}
                            </section>

                            {/* 四区分段 chips */}
                            <section>
                                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar px-0.5 pb-1">
                                    {MAIN_SECS.map(m => (
                                        <button key={m.key} onClick={() => setMainSec(m.key)} className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer ${mainSec === m.key ? 'bg-[#7F8C52] text-white shadow-sm' : 'bg-white text-[#8A8172] border border-[#E5E0D2]'}`}>{m.label}</button>
                                    ))}
                                </div>
                                <div className="mt-1">
                                    {mainSec === 'rules' && <RulesSection rules={rules} onChange={persistRules} workerUrl={settings.workerUrl} token={settings.token} />}
                                    {mainSec === 'shortcuts' && <ActionsSection actions={actions} onChange={persistActions} />}
                                    {mainSec === 'queries' && <DataItemsSection items={dataItems} onChange={persistItems} workerUrl={settings.workerUrl} token={settings.token} />}
                                    {mainSec === 'screen' && <ScreenChatSection screenChat={screenChat} characters={characters as CharacterProfile[]} onChange={next => { setScreenChat(next); saveScreenChat(next); }} workerUrl={settings.workerUrl} token={settings.token} />}
                                </div>
                            </section>

                            {/* 测试 */}
                            <button onClick={() => void quickTest()} disabled={!settings.workerUrl} className="w-full rounded-2xl border border-dashed border-[#C2C79B] bg-[#F8F9F0] py-2.5 text-[12px] font-bold text-[#7F8C52] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                                发一条测试事件（模拟 iPhone 快捷指令 POST）
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1 rounded-full bg-[#EDE9DE] p-1">
                                {(['feed', 'commands'] as const).map(k => (
                                    <button key={k} onClick={() => setHistSec(k)} className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer ${histSec === k ? 'bg-white text-[#6F7C54] shadow-sm' : 'text-[#A89B7F]'}`}>
                                        {k === 'feed' ? '最近收到' : '最近快捷指令'}
                                    </button>
                                ))}
                                <button onClick={() => { clearBridgeFeed(); refreshFeed(); addToast('已清空接收记录', 'success'); }} aria-label="清空" className="px-2 py-1.5 rounded-full hover:bg-[#FDEDEA] text-[#E8845A] cursor-pointer"><Eraser className="w-3.5 h-3.5" /></button>
                            </div>

                            {histSec === 'feed' ? (
                                feed.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-[#D8D2BE] bg-[#FCF9F2] px-4 py-8 text-center space-y-2">
                                        <ClipboardText className="w-6 h-6 mx-auto text-[#C4BDAC]" />
                                        <p className="text-xs text-[#A89B7F] leading-relaxed">还没有收到任何事件。<br />配置好 Worker 并开一个角色开关后，发一条测试事件试试。</p>
                                        <button onClick={() => { setTab('main'); setMainSec('rules'); }} className="mt-1 rounded-full bg-[#7F8C52] text-white px-4 py-1.5 text-[11px] font-bold cursor-pointer">去配置</button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {feed.map(e => (
                                            <div key={e.id + e.receivedAt} className="rounded-2xl border bg-white border-[#E5E0D2] px-3.5 py-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold text-white bg-[#7F8C52] px-1.5 py-0.5 rounded-full">{e.type}</span>
                                                    <span className="text-[10px] text-[#BDB5A4]">{new Date(e.receivedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <p className="mt-1.5 text-[12px] text-[#3A3A38] leading-relaxed break-words">{e.payload}</p>
                                                {e.actions && e.actions.length > 0 && <p className="mt-1 text-[10px] text-[#A89B7F]">{e.actions.join(' · ')}</p>}
                                                {e.error && <p className="mt-1 text-[10px] text-[#E8845A]">{e.error}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                <div className="rounded-2xl border border-dashed border-[#D8D2BE] bg-[#FCF9F2] px-4 py-8 text-center">
                                    <p className="text-xs text-[#A89B7F] leading-relaxed">最近快捷指令记录会出现在这里。<br />（投递链路随 push-merge 后续版本开放）</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* 底部：当前分区标签（提示可上划） */}
            {tab === 'main' && mainSec !== 'rules' && (
                <div className="shrink-0 px-4 pb-2" style={{ paddingBottom: 'calc(0.5rem + var(--safe-bottom, 0px))' }}>
                    <p className="text-center text-[10px] text-[#BDB5A4]">正在编辑：{mainSecLabel} · 右上角 ⚙ 可改 Worker 配置</p>
                </div>
            )}
        </div>
    );
};

/* ── 同步到云端按钮：把启用角色 persona/历史 + LLM 凭据 + push 订阅 + 规则上传 ── */
function SyncButton({ settings, rules, actions, dataItems, characters, addToast, onDone }: {
    settings: BridgeSettings;
    rules: BridgeRule[];
    actions: BridgeShortcutAction[];
    dataItems: BridgeDataItem[];
    characters: CharacterProfile[];
    addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    onDone: () => void;
}) {
    const [syncing, setSyncing] = useState(false);
    const sync = async () => {
        if (!settings.workerUrl.trim()) { addToast('请先填写 Worker 地址', 'error'); return; }
        setSyncing(true);
        try {
            // ① 读全局 API（os_api_config）作为 LLM 凭据
            let llm: { apiUrl: string; apiKey: string; model: string } | undefined;
            try {
                const raw = localStorage.getItem('os_api_config');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed?.baseUrl && parsed?.apiKey) llm = { apiUrl: parsed.baseUrl, apiKey: parsed.apiKey, model: parsed.model || 'gpt-4o-mini' };
                }
            } catch { /* ignore */ }
            // ② push 订阅
            let pushSubscription: { endpoint: string; keys: { p256dh: string; auth: string } } | null = null;
            try {
                if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.ready;
                    const sub = await reg.pushManager?.getSubscription();
                    if (sub) {
                        const rawKeys = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
                        if (sub.endpoint && rawKeys?.keys?.p256dh && rawKeys.keys.auth) {
                            pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: rawKeys.keys.p256dh, auth: rawKeys.keys.auth } };
                        }
                    }
                }
            } catch { /* ignore */ }
            // ③ 组装启用角色上下文
            const charPayload = characters
                .filter(c => settings.perChar?.[c.id]?.enabled)
                .map(c => ({
                    id: c.id,
                    enabled: true,
                    autoReply: !!settings.perChar?.[c.id]?.autoReply,
                    persona: c.systemPrompt || c.description || `你是 ${c.name}。`,
                    history: [],
                }));
            const res = await uploadBridgeConfig({ rules, characters: charPayload, llm, pushSubscription });
            if (res.ok) {
                addToast(`已同步 ${charPayload.length} 个角色到云端`, 'success');
                onDone();
            } else addToast(res.error || '同步失败', 'error');
        } catch (err) {
            addToast(err instanceof Error ? err.message : '同步失败', 'error');
        } finally {
            setSyncing(false);
        }
    };
    return (
        <button onClick={() => void sync()} disabled={syncing} className="w-full rounded-xl bg-[#7F8C52] text-white py-2.5 text-[12px] font-bold shadow-sm shadow-[#7F8C52]/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {syncing ? '同步中…' : '把角色开关/LLM 凭据/订阅同步到云端'}
        </button>
    );
}

export default RealityBridgeApp;
