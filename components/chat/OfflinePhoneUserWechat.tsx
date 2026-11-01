import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChatCircleDots } from '@phosphor-icons/react';
import { DB } from '../../utils/db';
import { stripPhoneHolderMarker } from '../../utils/offlineMode/phoneHolder';
import { takeRecentMessages } from '../../utils/offlineMode/phoneMessages';

/**
 * 你的手机 · 微信（方案 §5.26 C）
 *
 * 两个 Tab：
 * - 私聊：`!groupId` 的消息，**按角色分组** —— 包含你和其它角色的私聊（§5.26 E，最有戏的地方）
 * - 群聊：`groupId` 的消息
 *
 * 视角（§5.26 J ⑤）：**你自己打开时是常规视角** —— 你的消息在右、对方在左。
 * 这和「他翻你手机」时的翻转视角是两回事；翻转发生在角色侧，这里不做。
 *
 * 权限（§5.26 F）只决定「他把手机拿走时能看到什么」，**不**影响你自己看到的范围 ——
 * 你自己的手机，你永远看到全部。
 */

interface Props {
    /** 当前主角色 id：用来把自己和他的会话排在第一位 */
    primaryCharId: string;
    charName: string;
    userName: string;
}

interface PhoneMessage {
    id: string;
    side: 'left' | 'right';
    text: string;
    ts: number;
    from?: string;
}

interface Conversation {
    id: string;
    title: string;
    subtitle: string;
    ts: number;
    messages: PhoneMessage[];
    kind: 'p2p' | 'group';
    isPrimary?: boolean;
}

const PAGE_SIZE = 60;
const pad = (n: number) => n.toString().padStart(2, '0');

const timeLabel = (ts: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 剥掉标记/标签，只留"手机上看到的样子" */
const cleanText = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    return stripPhoneHolderMarker(raw)
        .replace(/\[\[[^\]]{0,80}\]\]/g, '')
        .replace(/<语音>[\s\S]*?<\/语音>/g, '［语音］')
        .replace(/^\s*图片-.*$/gm, '［图片］')
        .replace(/<[^>]{0,200}>/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
};

export default function OfflinePhoneUserWechat({ primaryCharId, charName, userName }: Props) {
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'p2p' | 'group'>('p2p');
    const [p2p, setP2p] = useState<Conversation[]>([]);
    const [groups, setGroups] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const characters = await DB.getAllCharacters();
                const conversations: Conversation[] = [];
                for (const character of characters) {
                    // 每个会话只同步最近 100 条（和他的手机同一口径）
                    const messages = takeRecentMessages(
                        (await DB.getMessagesByCharId(character.id)).filter((m) => m.role !== 'system'),
                    );
                    const mapped: PhoneMessage[] = messages
                        .map((m): PhoneMessage => ({
                            id: String(m.id ?? `${m.timestamp}-${Math.random()}`),
                            // 常规视角：我说的在右，他说的在左
                            side: m.role === 'user' ? 'right' : 'left',
                            text: cleanText(m.content) || (m.type === 'image' ? '［图片］' : ''),
                            ts: m.timestamp || 0,
                            from: m.role === 'user' ? userName : character.name,
                        }))
                        .filter((m) => m.text);
                    if (!mapped.length) continue;
                    const last = mapped[mapped.length - 1];
                    conversations.push({
                        id: `p2p-${character.id}`,
                        title: character.name,
                        subtitle: last.text,
                        ts: last.ts,
                        messages: mapped,
                        kind: 'p2p',
                        isPrimary: character.id === primaryCharId,
                    });
                }
                conversations.sort((a, b) => (a.isPrimary === b.isPrimary ? (b.ts || 0) - (a.ts || 0) : (a.isPrimary ? -1 : 1)));

                const groupList: Conversation[] = [];
                const rawGroups = await DB.getGroups();
                for (const group of rawGroups) {
                    const messages = takeRecentMessages(
                        (await DB.getGroupMessages(group.id)).filter((m) => m.role !== 'system'),
                    );
                    const mapped: PhoneMessage[] = messages
                        .map((m): PhoneMessage => ({
                            id: String(m.id ?? `${m.timestamp}-${Math.random()}`),
                            side: m.role === 'user' ? 'right' : 'left',
                            text: cleanText(m.content),
                            ts: m.timestamp || 0,
                            from: m.role === 'user' ? userName : '',
                        }))
                        .filter((m) => m.text);
                    if (!mapped.length) continue;
                    const last = mapped[mapped.length - 1];
                    groupList.push({
                        id: `group-${group.id}`,
                        title: group.name,
                        subtitle: last.text,
                        ts: last.ts,
                        messages: mapped,
                        kind: 'group',
                    });
                }
                groupList.sort((a, b) => (b.ts || 0) - (a.ts || 0));

                if (!cancelled) {
                    setP2p(conversations);
                    setGroups(groupList);
                }
            } catch (error) {
                console.error('[user-phone] 读取微信失败', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [primaryCharId, userName]);

    const list = tab === 'p2p' ? p2p : groups;
    const active = useMemo(
        () => [...p2p, ...groups].find((c) => c.id === activeId) || null,
        [p2p, groups, activeId],
    );

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeId]);

    if (loading) {
        return <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">正在读取…</div>;
    }

    /* 聊天详情：常规视角 */
    if (active) {
        const from = Math.max(0, active.messages.length - visibleCount);
        const visible = active.messages.slice(from);
        return (
            <div className="absolute inset-0 bg-[#ededed] flex flex-col">
                <div className="shrink-0 h-10 flex items-center gap-1 px-2 border-b border-slate-200">
                    <button onClick={() => setActiveId(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-200">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700 truncate">{active.title}</span>
                    <ChatCircleDots className="w-3.5 h-3.5 text-slate-400" weight="fill" />
                </div>
                <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2">
                    {from > 0 && (
                        <div className="flex justify-center pb-1">
                            <button
                                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                                className="px-2.5 py-1 rounded-full bg-white/80 text-[10px] text-slate-500 active:bg-white"
                            >
                                查看更早的消息
                            </button>
                        </div>
                    )}
                    {visible.map((m) => (
                        <div key={m.id} className={`flex ${m.side === 'right' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[78%] rounded-lg px-2.5 py-1.5 text-[11px] leading-[1.5] whitespace-pre-wrap break-words ${m.side === 'right' ? 'bg-[#95ec69] text-slate-800' : 'bg-white text-slate-700'}`}>
                                {active.kind === 'group' && m.side === 'left' && m.from ? (
                                    <span className="block text-[9px] text-slate-400 mb-0.5">{m.from}</span>
                                ) : null}
                                {m.text}
                                <span className="block text-[8px] text-slate-400 text-right mt-0.5">{timeLabel(m.ts)}</span>
                            </div>
                        </div>
                    ))}
                    {!visible.length && <div className="p-6 text-center text-[11px] text-slate-400">这里还没有消息</div>}
                </div>
            </div>
        );
    }

    /* 会话列表：私聊 / 群聊 */
    return (
        <div className="absolute inset-0 bg-[#ededed] flex flex-col">
            <div className="shrink-0 flex bg-[#ededed] border-b border-slate-200">
                {([['p2p', '私聊'], ['group', '群聊']] as ['p2p' | 'group', string][]).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex-1 py-2 text-[11px] font-medium ${tab === key ? 'text-slate-800' : 'text-slate-400'}`}
                    >
                        {label}
                        <span className="ml-0.5 text-[9px] text-slate-400">
                            {key === 'p2p' ? p2p.length : groups.length}
                        </span>
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto">
                {list.map((conv) => (
                    <button
                        key={conv.id}
                        onClick={() => setActiveId(conv.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border-b border-slate-100 text-left active:bg-slate-50"
                    >
                        <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white text-[13px] font-bold ${conv.kind === 'p2p' ? 'bg-sky-500' : 'bg-teal-500'}`}>
                            {conv.title.slice(0, 1)}
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-bold text-slate-700 truncate">
                                    {conv.title}
                                    {conv.isPrimary ? <span className="ml-1 text-[8px] text-slate-400">他</span> : null}
                                </span>
                                <span className="text-[9px] text-slate-400 shrink-0">{timeLabel(conv.ts)}</span>
                            </span>
                            <span className="block text-[10px] text-slate-400 truncate mt-0.5">{conv.subtitle}</span>
                        </span>
                    </button>
                ))}
                {!list.length && (
                    <div className="p-8 text-center text-[11px] text-slate-400">
                        {tab === 'p2p' ? '还没有聊天记录' : '还没有群聊'}
                    </div>
                )}
            </div>
        </div>
    );
}
