/**
 * 来信 · 回信落库（聊天页与拾光详情共用，保证两处行为一致）。
 *
 * 一次回信要做三件事：
 *   ① 落库为一条 user 消息（metadata.letterReply 指回原信）；
 *   ② 幂等写角色长期记忆（固定 id，重写替换而非追加）；
 *   ③ 刷新短期「最近的信」上下文（24h / ≤3 轮），让角色紧接着的下一轮就知道。
 */

import { DB } from '../db';
import type { CharacterProfile, LetterRecord } from '../../types';

/** 回信消息的 metadata（聊天页与拾光共用同一形状；带齐渲染卡片所需的全部信息）。 */
export function letterReplyMeta(letter: LetterRecord) {
    return {
        letterReply: {
            letterId: letter.id,
            occasion: letter.occasion.name,
            originalTitle: letter.title,
            /** 原信主题：回信卡片与来信卡片配对用同一套色系。 */
            paperTheme: letter.paperTheme,
            replyAt: Date.now(),
        },
    };
}

/**
 * 保存用户回信。返回新消息 id（调用方可用它把消息追加进当前聊天列表）。
 */
export async function saveLetterReply(
    letter: LetterRecord,
    text: string,
    char: CharacterProfile,
    updateCharacter: (id: string, patch: Partial<CharacterProfile>) => void,
): Promise<number> {
    const trimmed = text.trim();
    const meta = letterReplyMeta(letter);

    // 回信在聊天里是一张「回信卡片」（与来信卡片成对），不是普通气泡文字。
    const newMsgId = await DB.saveMessage({
        charId: char.id,
        role: 'user',
        type: 'letter_reply_card',
        content: trimmed,
        metadata: meta,
    } as any);

    const memId = `mem-letter-reply-${letter.id}`;
    const prevMems = char.memories || [];
    const nowMs = Date.now();
    updateCharacter(char.id, {
        memories: [
            ...prevMems.filter(m => m.id !== memId),
            {
                id: memId,
                date: letter.date,
                summary: `ta 回了我那封「${letter.occasion.name}」的信，ta 说：${trimmed.slice(0, 120)}`,
                mood: 'moved',
            },
        ],
        recentLetterContext: {
            letterId: letter.id,
            occasion: letter.occasion.name,
            gist: letter.gist,
            replyText: trimmed,
            createdAt: nowMs,
            expiresAt: nowMs + 24 * 60 * 60 * 1000,
            turnsLeft: 3,
        },
    });

    return newMsgId;
}
