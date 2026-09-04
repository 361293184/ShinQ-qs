import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import type { CharacterProfile } from '../../types';
import { useOS } from '../../context/OSContext';
import { useBlobRefUrl } from '../../utils/blobRef';
import TokenImg from '../os/TokenImg';
import { DB } from '../../utils/db';

interface ChatListProps {
    characters: CharacterProfile[];
    unreadMessages: Record<string, number>;
    refreshKey: number; // 来自 OSContext 的 lastMsgTimestamp，新消息驱动预览刷新
    onSelect: (charId: string) => void;
    onClose: () => void;
}

/** 取最近一条可展示的消息预览文案：去 HTML 标签、压缩空白，撤回/图片/语音走特殊文案。 */
function previewText(m: { content: string; type: string; isRevoked?: boolean } | undefined, char: CharacterProfile): string {
    if (!m) return char.description?.trim() ? char.description.trim() : '开始聊天吧';
    if (m.isRevoked) return '撤回了一条消息';
    if (m.type === 'image') return '[图片]';
    if (m.type === 'voice') return '[语音]';
    const cleaned = m.content
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return '[消息]';
    return cleaned.length > 30 ? `${cleaned.slice(0, 30)}…` : cleaned;
}

/** 会话列表时间：今天 HH:mm / 昨天 / 更早 M月D日（用户本地时间）。 */
function formatPreviewTime(ts: number, now: number): string {
    const d = new Date(ts);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfDay = new Date(ts);
    startOfDay.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000);
    if (dayDiff <= 0) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }
    if (dayDiff === 1) return '昨天';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 对 refreshKey 做防抖，避免消息密集到达时反复全量查 IDB。 */
function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

const ChatList: React.FC<ChatListProps> = memo(function ChatListInner({
    characters,
    unreadMessages,
    refreshKey,
    onSelect,
    onClose,
}: ChatListProps) {
    const { theme: osTheme } = useOS();
    // messageWallpaper 可能是 blobref:<id> 令牌（本地上传），必须经 useBlobRefUrl 解析成 objectURL；
    // http(s)/data:/CSS 渐变则原样透传。桌面壁纸也走同一套。
    const messageWallpaperUrl = useBlobRefUrl(osTheme.messageWallpaper);
    // 顶栏高度与私聊 ChatHeaderShell 一致：跟随 chatHeaderDensity（compact 5rem / default 6rem / airy 7rem）+ safe-top。
    // 同时叠加相同的 py 内边距（headerDensityClass 同款），保证最终渲染高度与私聊完全一致。
    const headerBaseHeight = osTheme.chatHeaderDensity === 'compact' ? '5rem' : osTheme.chatHeaderDensity === 'airy' ? '7rem' : '6rem';
    const headerPyClass = osTheme.chatHeaderDensity === 'compact' ? 'py-2' : osTheme.chatHeaderDensity === 'airy' ? 'py-4' : 'py-3';
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [timestamps, setTimestamps] = useState<Record<string, number>>({});
    const [hasMsg, setHasMsg] = useState<Record<string, boolean>>({});
    const [now, setNow] = useState(() => Date.now());

    // 定时刷新"今天/昨天"边界时间，避免跨天不更新
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);

    const debouncedKey = useDebounced(refreshKey, 300);

    // 并行取各角色最近 1 条消息做预览，带 cancelled 防竞态
    useEffect(() => {
        if (!characters.length) {
            setPreviews({});
            setTimestamps({});
            setHasMsg({});
            return;
        }
        let cancelled = false;
        const run = async () => {
            const entries = await Promise.all(
                characters.map(async (c) => {
                    try {
                        const { messages } = await DB.getRecentMessagesWithCount(c.id, 1);
                        return { id: c.id, msg: messages[0] };
                    } catch {
                        return { id: c.id, msg: undefined as undefined };
                    }
                })
            );
            if (cancelled) return;
            const nextP: Record<string, string> = {};
            const nextT: Record<string, number> = {};
            const nextH: Record<string, boolean> = {};
            for (const e of entries) {
                const char = characters.find((c) => c.id === e.id);
                if (!char) continue;
                nextP[e.id] = previewText(e.msg, char);
                nextT[e.id] = e.msg ? e.msg.timestamp : 0;
                nextH[e.id] = !!e.msg;
            }
            setPreviews(nextP);
            setTimestamps(nextT);
            setHasMsg(nextH);
        };
        run();
        return () => {
            cancelled = true;
        };
    }, [characters, debouncedKey]);

    // 排序：未读优先 → 有消息按时间倒序 → 无消息按 characters 原顺序垫底
    const sorted = useMemo(() => {
        return characters
            .map((c, idx) => ({ c, idx }))
            .sort((a, b) => {
                const ua = unreadMessages[a.c.id] || 0;
                const ub = unreadMessages[b.c.id] || 0;
                if (ua > 0 && ub === 0) return -1;
                if (ub > 0 && ua === 0) return 1;
                const ha = hasMsg[a.c.id];
                const hb = hasMsg[b.c.id];
                if (ha && hb) {
                    const ta = timestamps[a.c.id] || 0;
                    const tb = timestamps[b.c.id] || 0;
                    if (ta !== tb) return tb - ta;
                } else if (ha && !hb) {
                    return -1;
                } else if (!ha && hb) {
                    return 1;
                }
                return a.idx - b.idx;
            })
            .map(({ c }) => c);
    }, [characters, unreadMessages, timestamps, hasMsg]);

    const handleSelect = useCallback((id: string) => onSelect(id), [onSelect]);
    const handleClose = useCallback(() => onClose(), [onClose]);

    return (
        <div
            className={`sully-chat-root flex flex-col h-full overflow-hidden relative font-sans ${messageWallpaperUrl ? '' : 'bg-white/70 backdrop-blur'}`}
        >
            {/* 背景图层：绝对定位铺满，避免被 backdrop-blur 模糊。设为 z-0，顶栏/列表 z-10 在其上。 */}
            {messageWallpaperUrl && (
                <div
                    className="absolute inset-0 z-0 pointer-events-none"
                    style={{
                        background: (messageWallpaperUrl.startsWith('linear-gradient') || messageWallpaperUrl.startsWith('radial-gradient') || messageWallpaperUrl.startsWith('conic-gradient'))
                            ? messageWallpaperUrl
                            : `url("${messageWallpaperUrl}") center/cover`,
                    }}
                />
            )}
            {/* 顶栏：高度与私聊 ChatHeaderShell 对齐（跟随 chatHeaderDensity + safe-top），
                标题「Message」放大、上下左右居中，保持通栏直边（不做圆角）。 */}
            <div className={`sully-chat-header sticky top-0 z-10 flex items-center relative bg-white/70 backdrop-blur border-b border-slate-200/60 ${headerPyClass}`}
                 style={{ minHeight: headerBaseHeight, paddingTop: 'var(--safe-top)' }}>
                <div className="relative w-full flex items-center justify-center">
                    <button
                        onClick={handleClose}
                        className="sully-chat-back absolute left-0 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-800 transition-colors"
                        aria-label="关闭 Message"
                    >
                        <CaretLeft className="w-5 h-5" weight="bold" />
                    </button>
                    <span className="text-2xl font-bold tracking-wide text-slate-800">Message</span>
                </div>
            </div>

            {sorted.length === 0 ? (
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
                        <CaretLeft className="w-7 h-7 rotate-180 opacity-40" />
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        还没有联系人，去「神经链接」新建一个角色吧
                    </p>
                </div>
            ) : (
                <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar">
                    <div className="divide-y divide-slate-100/80">
                        {sorted.map((c) => {
                            const unread = unreadMessages[c.id] || 0;
                            const ts = timestamps[c.id];
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => handleSelect(c.id)}
                                    className="w-full flex items-center gap-4 px-4 py-3 text-left transition-colors active:bg-slate-100/70 hover:bg-slate-50/80"
                                >
                                    <div className="relative shrink-0">
                                        {c.avatar ? (
                                            <TokenImg value={c.avatar} alt="" className="w-12 h-12 rounded-2xl object-cover" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-400 font-bold">
                                                {(c.name || '?').slice(0, 1)}
                                            </div>
                                        )}
                                        {unread > 0 && (
                                            <span
                                                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-white"
                                                aria-label={`${unread} 条未读消息`}
                                            >
                                                {unread > 99 ? '99+' : unread}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span
                                                className={`text-sm truncate ${unread > 0 ? 'font-bold text-slate-800' : 'font-semibold text-slate-700'}`}
                                            >
                                                {c.name}
                                            </span>
                                            {ts > 0 && (
                                                <span className="shrink-0 text-xs text-slate-400">{formatPreviewTime(ts, now)}</span>
                                            )}
                                        </div>
                                        <div
                                            className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-slate-600 font-medium' : 'text-slate-400'}`}
                                        >
                                            {previews[c.id] || ''}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
});

export default ChatList;
