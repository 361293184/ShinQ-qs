/**
 * 合照生图用的聊天上下文摘要。
 * 旧的 `slice(-6)` + 每条 100 字做法会把剧情截断、还会把图片 URL 喂给模型，
 * 这里锁住新规则：非文本消息只留标记、空内容跳过、长文截断加省略号、超量只取最近 N 条。
 */
import { describe, expect, it } from 'vitest';
import { buildImageChatContext } from './imageGenContext';

const msg = (role: 'user' | 'assistant', type: string, content: string) =>
    ({ role, type, content } as any);

describe('buildImageChatContext', () => {
    it('非文本消息只保留类型标记，不把图片 URL 或 base64 塞进上下文', () => {
        const text = buildImageChatContext([
            msg('assistant', 'image', 'https://example.com/a.jpg'),
            msg('assistant', 'voice', 'data:audio/mp3;base64,AAAA'),
            msg('user', 'text', '我们到海边了'),
        ], '秦述');

        expect(text).toBe('秦述: [图片]\n秦述: [语音]\n用户: 我们到海边了');
    });

    it('空内容被丢弃，长正文压平空白后截断加省略号', () => {
        const long = '他把外套披在我肩上\n\n然后说  风大。' + '啊'.repeat(400);
        const text = buildImageChatContext([
            msg('assistant', 'text', '   '),
            msg('assistant', 'text', long),
        ], '秦述', { maxCharsPerMessage: 20 });

        const lines = text.split('\n');
        expect(lines).toHaveLength(1);
        expect(lines[0].startsWith('秦述: 他把外套披在我肩上 然后说 风大。')).toBe(true);
        expect(lines[0].endsWith('…')).toBe(true);
        expect(lines[0].length).toBe('秦述: '.length + 21);
    });

    it('只取最近 N 条，且最旧的那条会被丢弃', () => {
        const messages = [
            msg('user', 'text', '第一句'),
            msg('assistant', 'text', '第二句'),
            msg('user', 'text', '第三句'),
        ];
        const text = buildImageChatContext(messages, '秦述', { limit: 2 });

        expect(text).toBe('秦述: 第二句\n用户: 第三句');
    });

    it('角色名缺失时用「角色」兜底', () => {
        const text = buildImageChatContext([msg('assistant', 'text', '嗯')], '');
        expect(text).toBe('角色: 嗯');
    });
});
