import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChatCircleDots } from '@phosphor-icons/react';
import { DB } from '../../utils/db';
import { stripPhoneHolderMarker } from '../../utils/offlineMode/phoneHolder';
import type { GeneratedChat } from '../../utils/offlineMode/phoneContent';

/**
 * 他手机里的微信。
 *
 * 只做文档 §5.3 里的 ①② 两类 —— 也就是**真实同步**的那两类：
 *   ① 他和「我」的私聊：直接读 SullyOS 的 messages（charId = 这个角色）
 *   ② 同步群：SullyOS 里已存在、且他在其中的群
 * ③ 角色独有群 / ④ 他和别人的私聊属于 LLM 生成，还没做（生成架构在文档 §5.9）。
 *
 * 两条硬要求：
 *   - **视角必须翻转**：从他的手机看，他自己的消息在右边（绿），"我"的在左边。
 *   - **条数与时间必须和主聊天一致**：这里读的就是同一份数据，不另存、不裁剪。
 */

interface PhoneMessage {
    id: string;
    side: 'left' | 'right';
    text: string;
    ts: number;
}

interface Conversation {
    id: string;
    title: string;
    subtitle: string;
    ts: number;
    messages: PhoneMessage[];
    kind: 'p2p' | 'group';
    /** ③④ 类：内容由副 API 生成，不是真实同步，界面上要标出来 */
    generated?: boolean;
}

interface Props {
    charId: string;
    charName: string;
    userName: string;
    /** ③ 角色独有群 / ④ 他和别人的私聊（LLM 生成，来自 phoneContent） */
    extraChats?: GeneratedChat[];
    extraGroups?: GeneratedChat[];
}

/** 一次渲染多少条：全部渲染在长会话上会明显卡 */
const PAGE_SIZE = 60;

/** 生成的会话 → 统一的消息结构（他的消息在右） */
const toPhoneMessages = (chat: GeneratedChat, charName: string): PhoneMessage[] =>
    (chat.messages || [])
        .map((m, index): PhoneMessage => {
            const from = String(m?.from || '').trim();
            const isMine = from === 'me' || from === '我' || from === charName;
            const text = cleanText(m?.text);
            return {
                id: `${chat.name}-${index}`,
                side: isMine ? 'right' : 'left',
                text: isMine ? text : (from && from !== chat.name ? `${from}：${text}` : text),
                ts: 0,
            };
        })
        .filter((m) => m.text);

const pad = (n: number) => n.toString().padStart(2, '0');

const timeLabel = (ts: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 把主聊天的正文清成"手机上看到的样子"：剥掉系统指令、标签、换行折叠 */
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

export default function OfflinePhoneWechat({ charId, charName, userName, extraChats, extraGroups }: Props) {
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const list: Conversation[] = [];

                // ① 他和「我」的私聊：和主聊天同一份数据
                const own = await DB.getMessagesByCharId(charId);
                const ownMessages: PhoneMessage[] = own
                    .filter((m) => m.role !== 'system')
                    .map((m): PhoneMessage => ({
                        id: String(m.id ?? `${m.timestamp}-${Math.random()}`),
                        // 视角翻转：他说的话在他手机里是「我发的」，在右边
                        side: m.role === 'assistant' ? 'right' : 'left',
                        text: cleanText(m.content) || (m.type === 'image' ? '［图片］' : ''),
                        ts: m.timestamp || 0,
                    }))
                    .filter((m) => m.text);
                if (ownMessages.length) {
                    const last = ownMessages[ownMessages.length - 1];
                    list.push({
                        id: 'p2p',
                        title: userName || '你',
                        subtitle: last.text,
                        ts: last.ts,
                        messages: ownMessages,
                        kind: 'p2p',
                    });
                }

                // ② 同步群：他在其中的群
                const groups = await DB.getGroups();
                for (const group of groups) {
                    if (!Array.isArray(group.members) || !group.members.includes(charId)) continue;
                    const raw = await DB.getGroupMessages(group.id);
                    const messages: PhoneMessage[] = raw
                        .filter((m) => m.role !== 'system')
                        .map((m): PhoneMessage => ({
                            id: String(m.id ?? `${m.timestamp}-${Math.random()}`),
                            side: m.role === 'user' ? 'left' : 'right',
                            text: cleanText(m.content),
                            ts: m.timestamp || 0,
                        }))
                        .filter((m) => m.text);
                    if (!messages.length) continue;
                    const last = messages[messages.length - 1];
                    list.push({
                        id: group.id,
                        title: group.name,
                        subtitle: last.text,
                        ts: last.ts,
                        messages,
                        kind: 'group',
                    });
                }

                // ③ 他独有的群 / ④ 他和别人的私聊：副 API 生成的内容（标了 generated）
                for (const chat of extraGroups || []) {
                    const messages = toPhoneMessages(chat, charName);
                    if (!messages.length) continue;
                    list.push({
                        id: `gen-group-${chat.name}`,
                        title: chat.name,
                        subtitle: chat.relation || messages[messages.length - 1].text,
                        ts: 0,
                        messages,
                        kind: 'group',
                        generated: true,
                    });
                }
                for (const chat of extraChats || []) {
                    const messages = toPhoneMessages(chat, charName);
                    if (!messages.length) continue;
                    list.push({
                        id: `gen-chat-${chat.name}`,
                        title: chat.name,
                        subtitle: chat.relation || messages[messages.length - 1].text,
                        ts: 0,
                        messages,
                        kind: 'p2p',
                        generated: true,
                    });
                }

                if (!cancelled) {
                    // 真实的排前面（有时间的才有 ts），生成的排后面
                    list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
                    setConversations(list);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [charId, userName, extraChats, extraGroups]);

    const active = useMemo(
        () => conversations.find((c) => c.id === activeId) || null,
        [conversations, activeId],
    );

    // 长会话只渲染最近一段，往上滑再加载，避免一次塞几千条
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeId]);
    const visibleMessages = useMemo(
        () => (active ? active.messages.slice(Math.max(0, active.messages.length - visibleCount)) : []),
        [active, visibleCount],
    );
    const hasEarlier = !!active && active.messages.length > visibleMessages.length;

    if (loading) {
        return <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">正在读取…</div>;
    }

    if (!active) {
        return (
            <div className="absolute inset-0 bg-[#ededed] flex flex-col">
                <div className="shrink-0 px-3 py-2 text-[10px] text-slate-500 bg-[#ededed] border-b border-slate-200">
                    和「你」的聊天、你在的群，都是真实同步的
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 && (
                        <div className="p-6 text-center text-[11px] text-slate-400">这个手机里还没有会话</div>
                    )}
                    {conversations.map((conv) => (
                        <button
                            key={conv.id}
                            onClick={() => setActiveId(conv.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white border-b border-slate-100 text-left active:bg-slate-50"
                        >
                            <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white text-[13px] font-bold ${conv.kind === 'p2p' ? 'bg-emerald-500' : 'bg-teal-500'}`}>
                                {conv.title.slice(0, 1)}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="flex items-center justify-between gap-2">
                                    <span className="text-[12px] font-bold text-slate-700 truncate">{conv.title}</span>
                                    <span className="text-[9px] text-slate-400 shrink-0">{timeLabel(conv.ts)}</span>
                                </span>
                                <span className="block text-[10px] text-slate-400 truncate mt-0.5">{conv.subtitle}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 bg-[#ededed] flex flex-col">
            <div className="shrink-0 h-10 flex items-center gap-1 px-2 bg-[#ededed] border-b border-slate-200">
                <button onClick={() => setActiveId(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 active:bg-slate-200">
                    <ArrowLeft className="w-4 h-4" weight="bold" />
                </button>
                <span className="text-[12px] font-bold text-slate-700 truncate">{active.title}</span>
                {active.kind === 'p2p' && <ChatCircleDots className="w-3.5 h-3.5 text-slate-400" weight="fill" />}
            </div>
            <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2">
                {hasEarlier && (
                    <div className="flex justify-center pb-1">
                        <button
                            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                            className="px-2.5 py-1 rounded-full bg-white/80 text-[10px] text-slate-500 active:bg-white"
                        >
                            查看更早的消息
                        </button>
                    </div>
                )}
                {active.generated && (
                    <div className="text-center text-[9px] text-slate-400">这段是生成的内容</div>
                )}
                {visibleMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.side === 'right' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-lg px-2.5 py-1.5 text-[11px] leading-[1.5] whitespace-pre-wrap break-words ${m.side === 'right' ? 'bg-[#95ec69] text-slate-800' : 'bg-white text-slate-700'}`}>
                            {m.text}
                            <span className="block text-[8px] text-slate-400 text-right mt-0.5">{timeLabel(m.ts)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
