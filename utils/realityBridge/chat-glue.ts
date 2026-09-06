/** 现实桥 · 事件合并与本地动作落地（chat-glue）。
 *
 *  云端 Worker 不写 Sully 本地库；它把「事件 + 角色回应 + 动作请求」打包成
 *  BridgePushBundle 下发。这里把 bundle 幂等合并进角色会话，并把能在本地做的
 *  动作（记忆/卡片/日历手账/系统通知）映射到 Sully 各表。chat/记忆依赖宿主注入
 *  （UI 层用 useOS 的 updateCharacter），避免本 util 与 OSContext 循环依赖。
 */

import { DB } from '../db';
import { CHAT_GEN_EVENTS, announceChatGen } from '../chatGenEvents';
import type { CharacterProfile, Message } from '../../types';
import {
    BridgeActionRequest,
    BridgePushBundle,
} from './types';
import { buildEventText, safeSlice } from './rules';

/** chat-glue 宿主注入：UI/管理器把 OSContext 能力传进来。 */
export interface BridgeChatGlueHost {
    /** 更新角色（改记忆等）。UI 传 useOS().updateCharacter；无可用宿主则本模块回退 DB 直写。 */
    updateCharacter?: (characterId: string, patch: Partial<CharacterProfile>) => void | Promise<void>;
    /** 浏览器系统通知。 */
    notify?: (title: string, body: string) => void;
}

const MEMORY_EVENT_MARK = 'reality_bridge_event_id';

/** 该会话最近 N 条里是否已含某 eventId（幂等防重）。 */
export async function isEventAlreadyMerged(charId: string, eventId: string): Promise<boolean> {
    const recent = await DB.getRecentMessagesByCharId(charId, 80);
    return recent.some((m: Message) =>
        m.metadata?.[MEMORY_EVENT_MARK] === eventId || m.metadata?.realityBridgeEventId === eventId);
}

async function writeMessage(msg: {
    charId: string;
    role: 'user' | 'assistant' | 'system';
    type: string;
    content: string;
    eventId?: string;
    extra?: Record<string, unknown>;
}): Promise<void> {
    const metadata = msg.extra ? { ...msg.extra } : {};
    if (msg.eventId) {
        metadata[MEMORY_EVENT_MARK] = msg.eventId;
        metadata.realityBridge = true;
    }
    await DB.saveMessage({
        charId: msg.charId,
        role: msg.role,
        type: (msg.type || 'text') as Message['type'],
        content: safeSlice(msg.content, 3000),
        metadata,
    } as Parameters<typeof DB.saveMessage>[0]);
}

/** 把事件 user 消息落进角色会话（幂等）。 */
export async function mergeEventMessage(bundle: BridgePushBundle): Promise<boolean> {
    if (await isEventAlreadyMerged(bundle.charId, bundle.eventId)) return false;
    await writeMessage({
        charId: bundle.charId,
        role: 'user',
        type: 'text',
        content: buildEventText({ id: bundle.eventId, type: bundle.itemType, payload: bundle.eventText, createdAt: bundle.createdAt }),
        eventId: bundle.eventId,
        extra: { realityBridgeType: bundle.itemType },
    });
    return true;
}

/** 把角色回应 assistant 消息落进会话（幂等；重复事件不重复落回应）。 */
export async function mergeReplyMessage(bundle: BridgePushBundle): Promise<boolean> {
    if (!bundle.replyText) return false;
    if (await isEventAlreadyMerged(bundle.charId, `${bundle.eventId}:reply`)) return false;
    await writeMessage({
        charId: bundle.charId,
        role: 'assistant',
        type: 'text',
        content: bundle.replyText,
        eventId: `${bundle.eventId}:reply`,
    });
    return true;
}

/** 通知 UI：当前挂载的 Chat reload；不在会话时 OSContext 补未读 + toast。 */
export function announceChatRefresh(charId: string, charName?: string): void {
    announceChatGen(CHAT_GEN_EVENTS.replyArrived, { charId, charName: charName || '角色' });
}

async function resolveHostPatch(charId: string, patch: Partial<CharacterProfile>, host: BridgeChatGlueHost): Promise<void> {
    if (host.updateCharacter) {
        await host.updateCharacter(charId, patch);
        return;
    }
    const chars = await DB.getAllCharacters();
    const cur = chars.find(c => c.id === charId);
    if (!cur) return;
    await DB.saveCharacter({ ...cur, ...patch });
}

/** 本地动作落地：把能做的映射到 Sully 表；返回动作摘要列表。 */
export async function applyActionRequests(
    bundle: BridgePushBundle,
    host: BridgeChatGlueHost = {},
): Promise<string[]> {
    const notes: string[] = [];
    const reqs = bundle.actionRequests || [];
    for (const req of reqs) {
        try {
            notes.push(await applyOne(req, bundle, host));
        } catch (err) {
            notes.push(`${actionLabel(req)} 失败：${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return notes;
}

function actionLabel(req: BridgeActionRequest): string {
    switch (req.kind) {
        case 'chat': return '写入聊天';
        case 'memory': return '写入记忆';
        case 'calendar': return '写入手账';
        case 'card': return '发送卡片';
        case 'notify': return '系统通知';
        case 'outbox': return '回传 iPhone';
        case 'shortcut': return '快捷动作';
    }
}

async function applyOne(req: BridgeActionRequest, bundle: BridgePushBundle, host: BridgeChatGlueHost): Promise<string> {
    switch (req.kind) {
        case 'chat': {
            if (await isEventAlreadyMerged(req.characterId, `${bundle.eventId}:act:${req.kind}`)) return '写入聊天（已存在）';
            await writeMessage({
                charId: req.characterId,
                role: req.role,
                type: 'text',
                content: req.text,
                eventId: `${bundle.eventId}:act:${req.kind}`,
                extra: { realityBridgeType: bundle.itemType },
            });
            if (req.reply) announceChatRefresh(req.characterId);
            return '写入聊天';
        }
        case 'memory': {
            const chars = await DB.getAllCharacters();
            const cur = chars.find(c => c.id === req.characterId);
            if (!cur) return '记忆写入跳过（角色不存在）';
            const now = new Date().toISOString().slice(0, 10);
            const summary = safeSlice(req.text, 400);
            const already = (cur.memories || []).some(m => m.summary === summary && m.date === now);
            if (already) return '写入记忆（当日已存在）';
            const frag = {
                id: `bridge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                date: now,
                summary,
                mood: 'calm',
            };
            await resolveHostPatch(req.characterId, { memories: [...(cur.memories || []), frag] }, host);
            return '写入记忆';
        }
        case 'calendar': {
            // 映射到 Sully 手账（Handbook）：当日追加一页 user_note，标题来自 itemType。
            const date = new Date().toISOString().slice(0, 10);
            const existing = await DB.getHandbook(date);
            const pages = existing?.pages || [];
            const page = {
                id: `bridge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'user_note' as const,
                title: `现实桥 · ${bundle.itemType}`,
                content: safeSlice(req.text, 2000),
                generatedBy: 'user' as const,
                generatedAt: Date.now(),
            };
            const entry = existing
                ? { ...existing, pages: [...pages, page], updatedAt: Date.now() }
                : { id: date, date, pages: [page], updatedAt: Date.now() };
            await DB.saveHandbook(entry as Parameters<typeof DB.saveHandbook>[0]);
            return '写入手账';
        }
        case 'card': {
            if (await isEventAlreadyMerged(req.characterId, `${bundle.eventId}:act:card`)) return '发送卡片（已存在）';
            await writeMessage({
                charId: req.characterId,
                role: 'user',
                type: 'html_card',
                content: req.text,
                eventId: `${bundle.eventId}:act:card`,
                extra: { realityBridgeCard: { title: req.title, type: bundle.itemType } },
            });
            return '发送卡片';
        }
        case 'notify': {
            if (host.notify) host.notify(req.title, req.body);
            return '系统通知';
        }
        case 'outbox':
            return '回传 iPhone（快捷指令需配置发件箱，v1 记录不投递）';
        case 'shortcut':
            return '快捷动作（投递链路随 push-merge v1 开放）';
    }
}

/** 全量合并入口：事件 + 回应 + 动作。供 push-merge / App 前台统一调用。 */
export async function mergeBridgeBundle(
    bundle: BridgePushBundle,
    host: BridgeChatGlueHost = {},
): Promise<{ mergedEvent: boolean; mergedReply: boolean; actionNotes: string[] }> {
    const mergedEvent = await mergeEventMessage(bundle);
    const mergedReply = await mergeReplyMessage(bundle);
    const actionNotes = await applyActionRequests(bundle, host);
    if (mergedEvent || mergedReply) announceChatRefresh(bundle.charId);
    return { mergedEvent, mergedReply, actionNotes };
}
