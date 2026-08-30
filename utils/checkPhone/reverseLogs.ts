/**
 * 反查手机 · 记录 + 总结卡片 + 记忆联动删除
 *
 *  - 反查记录：谁/时间/查看了什么（含拒绝事件），localStorage 持久化
 *  - 角色记忆：接管操作写入记忆宫殿，节点带 REVERSE_MEMORY_TAG 标签，可联动删除
 *  - 总结卡片：接管结束生成角色感想进私聊，基于真实查看内容（防幻觉），可删+联动删记忆
 */

import { DB } from '../db';
import { MemoryNodeDB, MemoryVectorDB } from '../memoryPalace';
import { vectorizeAndStore } from '../memoryPalace/vectorStore';
import type { EmbeddingConfig } from '../memoryPalace/types';
import type {
    CharacterProfile, Message, ReverseCheckItem, ReverseCheckLog,
    ReverseSummaryMeta, ReverseReplyMeta,
} from '../../types';
import { REVERSE_MEMORY_TAG } from '../../types';

/** 读取全局记忆宫殿 embedding 配置（同 pipeline.getEmbeddingConfig 的全局部分） */
function getEmbeddingConfigForReverse(): EmbeddingConfig | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem('os_memory_palace_config');
        if (raw) {
            const global = JSON.parse(raw);
            if (global.embedding?.baseUrl && global.embedding?.apiKey) {
                return global.embedding as EmbeddingConfig;
            }
        }
    } catch { /* 读取失败回落 */ }
    return null;
}

const LOGS_KEY = 'sullyos_reverse_check_logs_v1';

export const REVERSE_SUMMARY_SOURCE = 'reverse_summary';

function genId(prefix: string): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}_${crypto.randomUUID()}`;
        }
    } catch { /* fallthrough */ }
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** 读取反查记录 */
export function loadReverseLogs(): ReverseCheckLog[] {
    try {
        const raw = localStorage.getItem(LOGS_KEY);
        if (raw) return JSON.parse(raw) as ReverseCheckLog[];
    } catch { /* 解析失败回落 */ }
    return [];
}

/** 保存反查记录 */
export function saveReverseLogs(logs: ReverseCheckLog[]): void {
    try { localStorage.setItem(LOGS_KEY, JSON.stringify(logs)); } catch { /* 静默 */ }
}

/** 追加一条反查记录（新记录放最前） */
export function appendReverseLog(log: Omit<ReverseCheckLog, 'id' | 'timestamp'>): ReverseCheckLog {
    const logs = loadReverseLogs();
    const entry: ReverseCheckLog = {
        ...log,
        id: genId('revlog'),
        timestamp: Date.now(),
    };
    logs.unshift(entry);
    saveReverseLogs(logs);
    return entry;
}

/** 删除一条反查记录 */
export function deleteReverseLog(id: string): void {
    saveReverseLogs(loadReverseLogs().filter(l => l.id !== id));
}

/** 判断一条消息是否为「反查总结卡片」 */
export function isReverseSummary(msg: Message | null | undefined): boolean {
    return !!msg?.metadata && (msg.metadata as any)?.source === REVERSE_SUMMARY_SOURCE;
}

/**
 * 把「查看了什么」写进记忆宫殿（防幻觉：内容即真实查看明细，不调用 LLM 提取）。
 * 节点打 REVERSE_MEMORY_TAG 标签，room 用 user_room（用户信息）或 living_room。
 *
 * @param reverseChar 正在反查的角色
 * @param items       真实查看明细
 * @param mood        情绪标签（如 'curious'/'jealous'/'happy'）
 * @returns 创建的记忆节点 id 列表
 */
export async function writeReverseMemoryNodes(
    reverseChar: { id: string; name: string },
    items: ReverseCheckItem[],
    mood: string = 'curious',
): Promise<string[]> {
    if (!items || items.length === 0) return [];
    const nodeIds: string[] = [];
    const now = Date.now();

    // 把查看明细合并成一段第三人称叙事（基于真实内容，不编造）。
    // 每个 App 的「看到什么(detail)」和「知道什么(learned)」都写入，不二选一、不丢信息，
    // 让角色以后读到记忆时能完整了解这次查手机。
    const lines = items
        .filter(it => it.detail || it.learned)
        .map(it => {
            const where = it.appName;
            const seen = it.detail ? `看到${where}里：${it.detail}` : '';
            const learned = it.learned ? `由此知道：${it.learned}` : '';
            return [seen, learned].filter(Boolean).join('；');
        });

    if (lines.length === 0) return [];

    const content = `（反查手机）${reverseChar.name}偷偷查看了用户的真实手机：${lines.join('；')}。`;
    const id = genId('revmem');
    const node = {
        id,
        charId: reverseChar.id,
        content,
        room: 'user_room' as const,
        tags: [REVERSE_MEMORY_TAG],
        importance: 7,
        mood,
        embedded: false as boolean,
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        origin: 'system' as const,
    };

    // 优先向量化进记忆宫殿（embedded:true + 存向量）→ 角色聊天时能自动检索到这次记忆。
    // 需要 embedding 配置；未配置则退回普通保存（embedded:false，记忆宫殿 App 仍可见，但不进向量检索）。
    const embeddingConfig = getEmbeddingConfigForReverse();
    try {
        if (embeddingConfig) {
            await vectorizeAndStore([node as any], embeddingConfig, undefined, { skipDedup: true });
            nodeIds.push(id);
            return nodeIds;
        }
        await MemoryNodeDB.save(node as any);
        nodeIds.push(id);
    } catch (e) {
        console.error('[reverseLogs] 记忆节点写入失败（已尝试向量化），回落普通保存', e);
        // 向量化失败（如 embedding 接口异常）：至少落库，保证记忆不丢
        try {
            await MemoryNodeDB.save({ ...node, embedded: false } as any);
            nodeIds.push(id);
        } catch (e2) {
            console.error('[reverseLogs] 记忆节点普通保存也失败', e2);
        }
    }

    return nodeIds;
}

/**
 * 生成「总结卡片」进私聊：AI 生成的角色感想（文本由调用方传入）。
 * 卡片消息 role:'assistant'，metadata.source='reverse_summary'，记录关联记忆节点。
 * 以「偷看手机」可展开卡片渲染（phone_card 类型 + <details> 折叠），
 * 点开可看到完整查看明细（每个 App 看到什么/知道什么），让角色能完整读到。
 *
 * @param charId      卡片发往的角色私聊 id（通常就是 reverseChar.id）
 * @param reverseChar 正在反查的角色
 * @param summaryText 角色感想文本（AI 生成，基于真实查看内容）
 * @param memoryNodeIds 关联的记忆节点 id（删除卡片时联动删除）
 * @param items       完整查看明细（每个 App 看到什么/知道什么，可展开展示）
 * @param mood        情绪标签（吃醋/好奇/担心等）
 */
export async function createReverseSummaryMessage(
    charId: string,
    reverseChar: { id: string; name: string },
    summaryText: string,
    memoryNodeIds: string[] = [],
    items?: ReverseCheckItem[],
    mood?: string,
): Promise<number | null> {
    const text = (summaryText || '').trim();
    if (!text) return null;

    const meta: ReverseSummaryMeta = {
        source: REVERSE_SUMMARY_SOURCE,
        charId: reverseChar.id,
        charName: reverseChar.name,
        timestamp: Date.now(),
        memoryNodeIds,
        mood,
        phoneCard: {
            kind: 'reverse_summary',
            title: '偷看手机',
            detail: text,
            mood,
            items: (items || []).map(it => ({ appName: it.appName, detail: it.detail, learned: it.learned })),
        },
    };

    try {
        return await DB.saveMessage({
            charId,
            role: 'assistant',
            type: 'phone_card',
            content: text,
            metadata: meta as any,
        });
    } catch (e) {
        console.error('[reverseLogs] 总结卡片写入失败', e);
        return null;
    }
}

/** 删除一条消息（供删除总结卡片用） */
export async function deleteMessageById(msgId: number): Promise<void> {
    try { await DB.deleteMessage(msgId); } catch (e) { console.error('[reverseLogs] 删除消息失败', e); }
}

/**
 * 删除总结卡片时联动删除记忆节点（仅删卡片则传 dryRun=true 只返回待删 id）。
 * @returns 实际删除的记忆节点 id 列表
 */
export async function deleteReverseMemories(memoryNodeIds: string[]): Promise<string[]> {
    const deleted: string[] = [];
    for (const id of memoryNodeIds) {
        try {
            await MemoryNodeDB.delete(id);
            // 同步删对应向量（本地），避免孤儿向量；远端向量在 syncNodeMetadataToRemote 之外，这里只清本地
            try { await MemoryVectorDB.delete(id); } catch (e) { console.warn(`[reverseLogs] 删除记忆向量失败 ${id}`, e); }
            deleted.push(id);
        } catch (e) { console.warn(`[reverseLogs] 删除记忆节点失败 ${id}`, e); }
    }
    return deleted;
}

/** 从消息 metadata 提取关联记忆节点 id */
export function extractReverseMemoryNodeIds(msg: Message | null | undefined): string[] {
    const meta = msg?.metadata as ReverseSummaryMeta | undefined;
    return meta?.memoryNodeIds || [];
}

/** 生成替回消息的 metadata（供 reverseReply 复用/统一来源标记） */
export function buildReverseReplyMeta(charId: string, charName: string): ReverseReplyMeta {
    return { source: 'reverse_reply', charId, charName, timestamp: Date.now() };
}

/** 生成反查角色展示信息 */
export function reverseCharLabel(c: CharacterProfile): { id: string; name: string } {
    return { id: c.id, name: c.name };
}
