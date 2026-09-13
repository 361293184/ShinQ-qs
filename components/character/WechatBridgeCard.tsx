/** 微信桥 · 神经链接「角色设定」页里的卡片。
 *
 * 绑定模型（用户定的）：**在哪个角色的设定页扫码，微信就归那个角色**。
 * 一个微信 = 一个角色；换角色点「改绑到当前角色」，token 不动、不重扫。
 * 没有联系人 ID、没有绑定表——绑定关系存在 Worker 的 D1 里。
 *
 * 扫码全程经 Worker 中转：bot token 加密存在 Worker 端，前端拿不到。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatCircleDots, CaretDown, ArrowsClockwise, CheckCircle, WarningCircle, QrCode, ArrowRight } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import { loadWechatSettings, saveWechatSettings } from '../../utils/wechatBridge/settings';
import type { WechatBridgeSettings, WechatStatusInfo } from '../../utils/wechatBridge/types';
import {
    uploadWechatConfig, uploadWechatPack, wechatStatus, checkBot, bindBot,
    startQrLogin, pollQrLogin, initWechatSchema,
} from '../../utils/wechatBridge/sync';
import { buildWechatFirePack } from '../../utils/wechatBridge/pack';
import QRCode from 'qrcode';

/**
 * 把 iLink 返回的 qrcode_img_content 转成 <img> 能显示的 data URL。
 *
 * 实测它有三种形态（照抄上游 weixin-settings 的 resolveQrImage，别自作聪明精简）：
 *   ① data: 开头      → 已经是图片，直接用
 *   ② 裸 base64 长串  → 补 data:image/png;base64, 前缀
 *   ③ 一个登录链接    → 【最常见】它不是图片地址！要用 qrcode 库把它现场画成二维码，
 *                        用户微信扫的是这个链接。直接塞 <img> 就是用户截图里的裂图。
 */
const resolveQrImage = async (raw: string): Promise<string> => {
    if (raw.startsWith('data:')) return raw;
    if (!raw.startsWith('http') && raw.length > 100) return `data:image/png;base64,${raw}`;
    return QRCode.toDataURL(raw, { width: 280, margin: 2 });
};

const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-violet-300 placeholder:text-slate-300';
const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

// 部署教程（写给用户看的图文）。静态部署的站点看不到仓库内文档，所以只能跳 GitHub 的
// blob 页——与设置页那份 MCP 教程同一套做法（见 apps/Settings.tsx 的 MCP_USER_GUIDE_URL）。
const SETUP_GUIDE_URL = 'https://github.com/qegj567-cloud/SullyOS/blob/master/docs/wechat-bridge-setup-walkthrough.md';

const ToggleRow: React.FC<{ checked: boolean; onChange: () => void; label: string; desc?: string }> = ({ checked, onChange, label, desc }) => (
    <button onClick={onChange} type="button"
        className="w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer transition-colors text-left"
        style={{ borderColor: checked ? '#CBD5A0' : '#E5E0D2', background: checked ? '#F2F5E9' : '#fff' }}>
        <span className="flex-1">
            <span className="block text-[11px] font-bold text-slate-600">{label}</span>
            {desc && <span className="block text-[9px] text-slate-400 mt-0.5">{desc}</span>}
        </span>
        <span className="w-8 rounded-full p-0.5 transition-colors flex items-center shrink-0" style={{ background: checked ? '#7F8C52' : '#E0DACB', height: 18 }}>
            <span className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-3.5' : ''}`} />
        </span>
    </button>
);

interface Props {
    char: CharacterProfile;
}

const WechatBridgeCard: React.FC<Props> = ({ char }) => {
    const { userProfile, groups, apiConfig, addToast, characters } = useOS();
    const [settings, setSettings] = useState<WechatBridgeSettings>(() => loadWechatSettings());
    const [open, setOpen] = useState(false);
    const [showSetup, setShowSetup] = useState(() => !loadWechatSettings().workerUrl);
    const [status, setStatus] = useState<WechatStatusInfo | null>(null);
    const [busy, setBusy] = useState<'llm' | 'pack' | 'check' | 'status' | 'qr' | 'bind' | 'init' | null>(null);

    // 扫码登录态：img 展示二维码，qrcode 用来轮询，轮到 confirmed/expired 收尾。
    const [qrImg, setQrImg] = useState<string | null>(null);
    const [qrState, setQrState] = useState<'idle' | 'waiting' | 'scaned' | 'expired' | 'error'>('idle');
    const qrPollTimer = useRef<number | null>(null);
    const qrCodeRef = useRef<string>('');

    const persist = useCallback((next: WechatBridgeSettings) => {
        setSettings(next);
        saveWechatSettings(next);
        // 轮询器监听这个事件决定开不开（见 global-poller）。
        window.dispatchEvent(new CustomEvent('wechat-bridge-settings-changed'));
    }, []);

    const stopQrPoll = useCallback(() => {
        if (qrPollTimer.current !== null) {
            window.clearInterval(qrPollTimer.current);
            qrPollTimer.current = null;
        }
    }, []);

    useEffect(() => () => stopQrPoll(), [stopQrPoll]);

    const refreshStatus = useCallback(async () => {
        if (!loadWechatSettings().workerUrl) return;
        setBusy('status');
        const res = await wechatStatus();
        setBusy(null);
        setStatus(res.ok && res.info ? res.info : null);
    }, []);

    useEffect(() => { void refreshStatus(); }, [refreshStatus]);

    const bots = status?.bots ?? [];
    // 优先拿**当前角色自己的**那条绑定。以前写死 bots[0]：一旦存在第二条绑定，卡片和
    // 「检查连接」就一直在看另一个微信——用户看到的"失效"甚至不是他在用的那个。
    const bot = bots.find(b => b.charId === char.id) ?? bots[0];
    const boundToThis = !!bot && bot.charId === char.id;
    const boundCharName = bot?.charId ? (characters.find(c => c.id === bot.charId)?.name || '某个角色') : '';

    // 数据表体检：面板路线装完后端只差"建表"这一步（以前得去 D1 控制台粘 SQL）。
    // 界面据它决定要不要摆「初始化数据表」按钮。
    const storage = status?.storage;
    const schemaReady = !!storage?.schemaReady;

    const handleSaveLlm = async () => {
        setBusy('llm');
        const res = await uploadWechatConfig({
            llm: settings.llm && settings.llm.apiUrl && settings.llm.model ? settings.llm : null,
        });
        setBusy(null);
        if (!res.ok) { addToast(res.error || '保存失败', 'error'); return; }
        addToast('LLM 凭据已加密保存到 Worker', 'success');
        void refreshStatus();
    };

    const handleUploadContext = async () => {
        setBusy('pack');
        try {
            const { pack, messageCount } = await buildWechatFirePack(char, userProfile, groups);
            const res = await uploadWechatPack(char.id, pack);
            if (!res.ok) { addToast(res.error || '上传失败', 'error'); return; }
            addToast(res.chatKept
                ? `已上传模板；微信里有更新的对话（${messageCount} 条上下文），云端那份保留`
                : `角色上下文已上传（${messageCount} 条消息）`, 'success');
            void refreshStatus();
        } catch (err) {
            addToast(err instanceof Error ? err.message : String(err), 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleCheck = async () => {
        setBusy('check');
        // 只查当前角色这条绑定（不带 botId 时云端会把所有绑定都查一遍，那是兜底轮询的用法）。
        const res = await checkBot(bot?.botId);
        setBusy(null);
        if (res.ok && res.expired) addToast('登录会话已过期：云端会每分钟自动重试，也可以再点一次「检查连接」；一直不行才需要重新扫码', 'error');
        else if (res.ok) addToast('连接正常，正在收微信消息', 'success');
        else addToast(res.error || '检查失败', 'error');
        void refreshStatus();
    };

    /** 一键建表：面板/命令行装完后端、只差建表这一步时点一下（后端幂等，重复点无害）。 */
    const handleInitSchema = async () => {
        setBusy('init');
        const res = await initWechatSchema();
        setBusy(null);
        if (!res.ok) { addToast(res.error || '初始化失败', 'error'); return; }
        addToast(res.created?.length ? `数据表已建好（新建 ${res.created.length} 张）` : '数据表已就绪', 'success');
        void refreshStatus();
    };

    const handleRebind = async () => {
        setBusy('bind');
        const res = await bindBot({ charId: char.id });
        setBusy(null);
        if (!res.ok) { addToast(res.error || '改绑失败', 'error'); return; }
        addToast(`这个微信现在扮演「${char.name}」了`, 'success');
        void refreshStatus();
    };

    const handleToggleAutoReply = async () => {
        if (!bot) return;
        setBusy('bind');
        const res = await bindBot({ botId: bot.botId, charId: bot.charId || char.id, autoReply: !(bot.autoReply !== false) });
        setBusy(null);
        if (!res.ok) { addToast(res.error || '操作失败', 'error'); return; }
        void refreshStatus();
    };

    /** 扫码登录：拿二维码 → 每 2s 轮询状态（带当前角色 id）→ confirmed 即绑定。 */
    const handleStartQr = async () => {
        stopQrPoll();
        setBusy('qr');
        const res = await startQrLogin();
        setBusy(null);
        if (!res.ok || !res.qrcode || !res.img) {
            setQrState('error');
            addToast(res.error || '拿二维码失败', 'error');
            return;
        }
        qrCodeRef.current = res.qrcode;
        try {
            setQrImg(await resolveQrImage(res.img));
        } catch (err) {
            setQrState('error');
            addToast(`二维码渲染失败：${err instanceof Error ? err.message : String(err)}`, 'error');
            return;
        }
        setQrState('waiting');
        qrPollTimer.current = window.setInterval(async () => {
            const poll = await pollQrLogin(qrCodeRef.current, char.id);
            if (poll.ok && poll.status === 'confirmed') {
                stopQrPoll();
                setQrState('idle');
                setQrImg(null);
                addToast(poll.removedOld
                    ? `微信登录成功，已绑定到「${char.name}」（同角色的旧绑定已自动清理）`
                    : `微信登录成功，已绑定到「${char.name}」`, 'success');
                void refreshStatus();
            } else if (poll.ok && poll.status === 'scaned') {
                setQrState('scaned');
            } else if (poll.ok && poll.status === 'expired') {
                stopQrPoll();
                setQrState('expired');
            }
        }, 2000);
    };

    const hasBot = !!bot;
    const botOk = hasBot && !bot!.expired;
    const boundElsewhere = hasBot && !!bot!.charId && bot!.charId !== char.id;
    const packInfo = status?.packs?.[char.id];

    return (
        <div>
            <div className="flex justify-between items-center mb-2 px-1">
                <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block flex items-center gap-1">
                    <ChatCircleDots size={12} /> 微信桥 (WeChat)
                </label>
                <button onClick={() => setOpen(o => !o)} type="button"
                    className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1">
                    {open ? '收起' : '展开'}
                    <CaretDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* 收起态也要一眼能看出状态 */}
            {!open && (
                <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2">
                    {boundToThis && botOk
                        ? <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                        : <WarningCircle size={16} className={`${botOk ? 'text-amber-500' : 'text-slate-300'} shrink-0`} />}
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-700 truncate">
                            {!hasBot ? '微信还没登录（扫一次码就行）'
                                : boundToThis ? `这个微信正在扮演「${char.name}」`
                                : `这个微信正在扮演「${boundCharName}」`}
                        </div>
                        {hasBot && bot!.expired && <div className="text-[9px] text-amber-500 mt-0.5">会话已过期：点「检查连接」重试（云端每分钟也会自动重试），一直不行才需要重新扫码</div>}
                        {packInfo && boundToThis && botOk && (
                            <div className="text-[9px] text-slate-400 mt-0.5">
                                云端上下文 {packInfo.messages} 条 · 模板 v{packInfo.templateVer}
                            </div>
                        )}
                    </div>
                    {!settings.workerUrl && <span className="text-[9px] text-amber-500 shrink-0">未配置 Worker</span>}
                </div>
            )}

            {open && (
                <div className="space-y-3">
                    {/* ── 微信登录 / 绑定（账号级） ── */}
                    <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                            <div className={labelCls}>微信登录（一个微信 = 一个角色）</div>
                            {hasBot && (
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${botOk ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {botOk ? '已登录' : '已过期'}
                                </span>
                            )}
                        </div>

                        {boundElsewhere && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 flex items-center gap-2">
                                <span className="flex-1 text-[10px] text-amber-700">
                                    这个微信正在扮演「{boundCharName}」，想让它演「{char.name}」吗？
                                </span>
                                <button onClick={handleRebind} disabled={busy !== null} type="button"
                                    className="shrink-0 text-[10px] font-bold bg-amber-500 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1">
                                    <ArrowRight size={11} /> 改绑到当前角色
                                </button>
                            </div>
                        )}

                        {(!hasBot || bot!.expired) ? (
                            <button onClick={handleStartQr} disabled={busy !== null} type="button"
                                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                                <QrCode size={14} /> {busy === 'qr' ? '获取二维码中…' : `扫码登录（绑定为「${char.name}」）`}
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <ToggleRow checked={bot!.autoReply !== false} onChange={handleToggleAutoReply}
                                    label="自动回复" desc="关了只同步进 SullyOS，云端不生成回复" />
                                <button onClick={handleCheck} disabled={busy !== null} type="button"
                                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-500 text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                                    <ArrowsClockwise size={12} className={busy === 'check' ? 'animate-spin' : ''} /> 检查连接
                                </button>
                            </div>
                        )}

                        {qrImg && qrState !== 'idle' && (
                            <div className="flex flex-col items-center gap-1.5 py-2">
                                {/* 二维码图由微信服务器出，直接 <img> 引用 */}
                                <img src={qrImg} alt="微信登录二维码" className="w-44 h-44 rounded-xl border border-slate-100" />
                                <div className="text-[10px] text-slate-400">
                                    {qrState === 'scaned' ? '已扫码，请在手机上确认…'
                                        : qrState === 'expired' ? '二维码过期了'
                                        : '用微信扫码登录（建议用小号）'}
                                </div>
                                {qrState === 'expired' && (
                                    <button onClick={handleStartQr} type="button"
                                        className="text-[10px] text-emerald-600 font-bold hover:underline">
                                        刷新二维码
                                    </button>
                                )}
                            </div>
                        )}
                        {hasBot && (
                            <div className="text-[9px] text-slate-400">
                                最近轮询：{bot!.lastPollAt ? new Date(bot!.lastPollAt!).toLocaleTimeString() : '还没跑过'}
                                {bot!.lastError ? ` · ${bot!.lastError}` : ''}
                            </div>
                        )}
                    </div>

                    {/* ── 角色上下文 ── */}
                    <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                        <div className={labelCls}>角色上下文（ta 在微信里的记忆与性格）</div>
                        <button onClick={handleUploadContext} disabled={busy !== null} type="button"
                            className="w-full py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-1">
                            <ArrowsClockwise size={12} className={busy === 'pack' ? 'animate-spin' : ''} /> 上传角色上下文
                        </button>
                        <div className="text-[9px] text-slate-400">App 里聊过会自动同步，平时不用点；改了人设 / 世界书后点一下当兜底。</div>
                        {packInfo && (
                            <div className="text-[9px] text-slate-400 pt-1">
                                云端上下文 {packInfo.messages} 条 · 模板 v{packInfo.templateVer} · 今日微信消息 {status?.todayMessages ?? 0} 条
                            </div>
                        )}
                    </div>

                    {/* ── 连接配置（Worker / 凭据） ── */}
                    <button onClick={() => setShowSetup(s => !s)} type="button"
                        className="w-full flex items-center justify-between px-1 text-[10px] text-slate-400">
                        <span className={labelCls}>连接配置（所有角色共用）</span>
                        <CaretDown size={10} className={`transition-transform ${showSetup ? 'rotate-180' : ''}`} />
                    </button>
                    {showSetup && (
                        <div className="bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 space-y-2">
                            <div>
                                <div className={labelCls}>微信桥 Worker 地址</div>
                                <input className={inputCls} placeholder="https://sullyos-wechat-bridge.xxx.workers.dev"
                                    value={settings.workerUrl}
                                    onChange={(e) => persist({ ...settings, workerUrl: e.target.value.trim() })} />
                            </div>
                            <div>
                                <div className={labelCls}>Worker 密钥（WX_BRIDGE_TOKEN，没配可空）</div>
                                <input className={inputCls} placeholder="可选"
                                    value={settings.token}
                                    onChange={(e) => persist({ ...settings, token: e.target.value.trim() })} />
                            </div>
                            {/* 数据表体检：面板路线装完后端只差这一步——点一下就好，不用去 D1 控制台粘 SQL */}
                            {!!settings.workerUrl && (
                                <div className="flex items-center gap-2 rounded-xl border px-3 py-2"
                                    style={{
                                        borderColor: schemaReady ? '#CBD5A0' : '#FCD9A6',
                                        background: schemaReady ? '#F2F5E9' : '#FFFBEB',
                                    }}>
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${schemaReady ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                    <span className="flex-1 text-[10px] leading-snug"
                                        style={{ color: schemaReady ? '#64748B' : '#B45309' }}>
                                        {schemaReady
                                            ? `云端数据表已就绪（${storage?.tableCount ?? 0} 张）`
                                            : storage
                                                ? `云端数据表还没初始化${storage.missingTables.length ? `，缺 ${storage.missingTables.length} 张` : ''}`
                                                : '数据表状态未知，点「检查连接」刷新'}
                                    </span>
                                    {!schemaReady && (
                                        <button onClick={handleInitSchema} disabled={busy !== null} type="button"
                                            className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500 text-white disabled:opacity-50 flex items-center gap-1">
                                            <ArrowsClockwise size={11} className={busy === 'init' ? 'animate-spin' : ''} /> 初始化数据表
                                        </button>
                                    )}
                                </div>
                            )}
                            <div>
                                <div className={labelCls}>LLM 凭据（上传后在 Worker 端加密，App 被杀 ta 也能回）</div>
                                <div className="space-y-1.5">
                                    <input className={inputCls} placeholder="API 地址，如 https://api.xxx.com/v1"
                                        value={settings.llm?.apiUrl || ''}
                                        onChange={(e) => persist({ ...settings, llm: { apiUrl: e.target.value.trim(), apiKey: settings.llm?.apiKey || '', model: settings.llm?.model || '' } })} />
                                    <input className={inputCls} placeholder="API Key"
                                        value={settings.llm?.apiKey || ''}
                                        onChange={(e) => persist({ ...settings, llm: { apiUrl: settings.llm?.apiUrl || '', apiKey: e.target.value, model: settings.llm?.model || '' } })} />
                                    <input className={inputCls} placeholder="模型，如 gpt-4o / claude-sonnet-4"
                                        value={settings.llm?.model || ''}
                                        onChange={(e) => persist({ ...settings, llm: { apiUrl: settings.llm?.apiUrl || '', apiKey: settings.llm?.apiKey || '', model: e.target.value.trim() } })} />
                                    <div className="flex items-center gap-2 pt-0.5">
                                        {!settings.llm?.apiUrl && !!apiConfig?.baseUrl && (
                                            <button type="button" onClick={() => persist({ ...settings, llm: { apiUrl: apiConfig.baseUrl, apiKey: apiConfig.apiKey, model: apiConfig.model } })}
                                                className="text-[10px] text-emerald-600 font-bold hover:underline">
                                                一键填入当前聊天 API
                                            </button>
                                        )}
                                        <button onClick={handleSaveLlm} disabled={busy !== null} type="button"
                                            className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-white disabled:opacity-50 flex items-center gap-1">
                                            <ArrowsClockwise size={11} className={busy === 'llm' ? 'animate-spin' : ''} /> 保存凭据
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <a href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer"
                                className="block text-[10px] text-slate-400 hover:text-violet-500 hover:underline text-center pt-0.5">
                                第一次配置？看《微信桥部署教程》→
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WechatBridgeCard;
