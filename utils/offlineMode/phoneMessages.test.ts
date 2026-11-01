import { describe, it, expect } from 'vitest';
import { takeRecentMessages, RECENT_MESSAGE_LIMIT } from './phoneMessages';

const make = (count: number, startAt = 1) =>
    Array.from({ length: count }, (_, index) => ({ timestamp: startAt + index, content: `m${startAt + index}` }));

describe('takeRecentMessages', () => {
    it('条数不到上限时原样返回', () => {
        const list = make(10);
        expect(takeRecentMessages(list)).toHaveLength(10);
        expect(takeRecentMessages(list)[0].content).toBe('m1');
    });

    it('超过 100 条时只留最近的 100 条，且保持旧→新的顺序', () => {
        const list = make(250);
        const recent = takeRecentMessages(list);
        expect(recent).toHaveLength(RECENT_MESSAGE_LIMIT);
        expect(recent[0].content).toBe(`m${250 - RECENT_MESSAGE_LIMIT + 1}`);
        expect(recent[recent.length - 1].content).toBe('m250');
    });

    it('输入乱序时按时间戳排好再截断', () => {
        const list = [
            { timestamp: 5, content: 'e' },
            { timestamp: 2, content: 'b' },
            { timestamp: 9, content: 'i' },
            { timestamp: 1, content: 'a' },
        ];
        expect(takeRecentMessages(list, 3).map((m) => m.content)).toEqual(['b', 'e', 'i']);
    });

    it('空数组/异常输入不炸', () => {
        expect(takeRecentMessages([])).toEqual([]);
        expect(takeRecentMessages(undefined as never)).toEqual([]);
    });

    it('上限可以单独指定（用户手机按会话复用时用得到）', () => {
        expect(takeRecentMessages(make(20), 5)).toHaveLength(5);
    });
});
