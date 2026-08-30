/**
 * 反查手机 · 替回消息
 *
 * 角色接管用户手机后，可「替用户回消息」：以用户身份（role:'user'）向目标对话
 * 写入一条真实消息。为保证与"真实用户消息"区分（渲染/统计/上下文），
 * 消息 metadata.source = 'reverse_reply'，并带上角色 id/名。
 *
 * 只以用户身份发送（方案 A）；角色间私下通信不在本期范围。
 */

import { DB } from '../db';
import type { CharacterProfile, Message, ReverseReplyMeta } from '../../types';

export const REVERSE_REPLY_SOURCE = 'reverse_reply';

/** 判断一条消息是否为「反查替回」消息 */
export function isReverseReply(msg: Message | null | undefined): boolean {
    return !!msg?.metadata && (msg.metadata as any)?.source === REVERSE_REPLY_SOURCE;
}

/**
 * 替回消息：角色偷看用户手机后，替机主（用户）向指定角色的私聊发送一条文本消息。
 * 关键：无论内容是装作用户口吻还是带角色自己的语气，**对方收到的都只能是「用户发来的消息」**
 * （role:'user'）——就像你偷完别人的手机，替机主给别人发消息一样。
 *
 * @param charId      目标角色 id（消息发往的私聊）
 * @param content     替发的文本内容（内容由 LLM 决定语气，但身份恒为用户）
 * @param reverseChar 正在反查的角色（即"替他操作"的发起角色，用于标记）
 * @returns 新消息 id；失败返回 null
 */
export async function sendReverseReply(
    charId: string,
    content: string,
    reverseChar: { id: string; name: string },
): Promise<number | null> {
    const text = (content || '').trim();
    if (!text) return null;

    const meta: ReverseReplyMeta = {
        source: REVERSE_REPLY_SOURCE,
        charId: reverseChar.id,
        charName: reverseChar.name,
        timestamp: Date.now(),
    };

    try {
        const msgId = await DB.saveMessage({
            charId,
            role: 'user',
            type: 'text',
            content: text,
            metadata: meta,
        });
        return msgId;
    } catch (e) {
        console.error('[reverseReply] 替回消息写入失败', e);
        return null;
    }
}

/**
 * 便捷：给某个角色生成替回文本后调用 sendReverseReply。
 * 这里只封装"构造反向角色展示信息"，实际文本生成由 UI 层用 LLM 完成。
 */
export function buildReverseReplyCharacterLabel(c: CharacterProfile): { id: string; name: string } {
    return { id: c.id, name: c.name };
}
