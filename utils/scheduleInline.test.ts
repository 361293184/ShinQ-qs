import { describe, expect, it } from 'vitest';
import {
    buildInlineScheduleInstruction,
    extractInlineScheduleBlock,
} from './scheduleInline';

const JSON_BODY = '{"slots":[{"startTime":"08:00","activity":"改稿"}]}';

describe('extractInlineScheduleBlock — 正文与日程块分离', () => {
    it('完整块：正文保留，raw 只取块内 JSON', () => {
        const text = `<日程>${JSON_BODY}</日程>\n早啊，刚醒。`;
        const out = extractInlineScheduleBlock(text);
        expect(out.closed).toBe(true);
        expect(out.content).toBe('早啊，刚醒。');
        expect(out.raw).toBe(JSON_BODY);
    });

    it('块在正文中间：前后拼接不粘连', () => {
        const text = `先说一句<日程>${JSON_BODY}</日程>后面还有`;
        const out = extractInlineScheduleBlock(text);
        expect(out.closed).toBe(true);
        expect(out.content).toBe('先说一句\n后面还有');
    });

    it('未闭合（截断）：正文取块之前，raw 取块之后', () => {
        const text = '你好。\n<日程>{"slots":[{"startTime":"08:00"';
        const out = extractInlineScheduleBlock(text);
        expect(out.closed).toBe(false);
        expect(out.content).toBe('你好。');
        expect(out.raw).toContain('"slots"');
    });

    it('没有块：原样返回', () => {
        const text = '今天没有日程任务，正常聊天。';
        const out = extractInlineScheduleBlock(text);
        expect(out.content).toBe(text);
        expect(out.raw).toBe('');
        expect(out.closed).toBe(false);
    });

    it('标签空白容错', () => {
        const out = extractInlineScheduleBlock(`好< 日 程 >${JSON_BODY}</ 日 程 >`);
        expect(out.closed).toBe(true);
        expect(out.content).toBe('好');
        expect(out.raw).toBe(JSON_BODY);
    });
});

describe('buildInlineScheduleInstruction — 注入主请求的任务段', () => {
    it('带上原始任务 prompt、控制块与先后顺序要求', () => {
        const text = buildInlineScheduleInstruction('## Task: 生成角色的今日日程');
        expect(text).toContain('## Task: 生成角色的今日日程');
        expect(text).toContain('<日程>');
        expect(text).toContain('</日程>');
        expect(text).toContain('先输出日程块');
        expect(text).toContain('不会显示给对方');
    });
});
