/**
 * 生图面板用的「最近聊天上下文」摘要。
 *
 * 合照的「结合聊天上下文优化 prompt」靠这段文字还原当前剧情，所以不能像以前那样
 * 直接 `messages.slice(-6).map(m => m.content.slice(0, 100))`：
 *   1. 只取 6 条，最近几条若是表情/图片/卡片，剧情就整段丢失；
 *   2. 每条砍到 100 字，长段叙述里的动作、地点、情绪全被截掉；
 *   3. 图片消息的 content 是图片 URL / base64，塞进 prompt 只会污染模型输入。
 *
 * 这里统一成「过滤坏行 + 非文本消息换成标记 + 每条压平空白并截断」的纯文本剧本。
 */
import type { Message } from '../types';

/** 非文本消息在上下文里的占位标记：让模型知道"这里发生了什么事"，又不喂垃圾内容。 */
const NON_TEXT_LABEL: Record<string, string> = {
    image: '[图片]',
    voice: '[语音]',
    emoji: '[表情]',
    transfer: '[转账]',
    interaction: '[互动]',
    system: '[系统提示]',
};

export interface ImageChatContextOptions {
    /** 取最近多少条消息，默认 12 */
    limit?: number;
    /** 单条最多保留多少字，默认 300 */
    maxCharsPerMessage?: number;
}

/**
 * 把最近聊天整理成 `发送者: 内容` 的纯文本，供生图 prompt 使用。
 * 空内容会被丢弃；非文本消息只保留类型标记（如 `[图片]`）；过长的正文截断并加省略号。
 */
export function buildImageChatContext(
    messages: Message[],
    charName: string,
    options: ImageChatContextOptions = {},
): string {
    const limit = options.limit ?? 12;
    const maxChars = options.maxCharsPerMessage ?? 300;
    const lines: string[] = [];

    for (const m of messages.slice(-limit)) {
        const who = m.role === 'user' ? '用户' : (charName || '角色');
        const isText = !m.type || m.type === 'text';

        if (!isText) {
            const label = NON_TEXT_LABEL[m.type] || '[附件]';
            lines.push(`${who}: ${label}`);
            continue;
        }

        const flat = (m.content || '').replace(/\s+/g, ' ').trim();
        if (!flat) continue;
        lines.push(`${who}: ${flat.length > maxChars ? `${flat.slice(0, maxChars)}…` : flat}`);
    }

    return lines.join('\n');
}
