import { describe, expect, it } from 'vitest';
import {
    buildInlineEmotionInstruction,
    extractInlineEmotionBlock,
} from './emotionInline';

describe('extractInlineEmotionBlock — 正文与控制块分离', () => {
    it('完整块：正文原样保留，raw 只取块内 JSON', () => {
        const text = '今天有点累。\n早点睡。\n<情绪>{"changed":true,"innerState":"我也有点困"}</情绪>';
        const out = extractInlineEmotionBlock(text);
        expect(out.closed).toBe(true);
        expect(out.content).toBe('今天有点累。\n早点睡。');
        expect(out.raw).toBe('{"changed":true,"innerState":"我也有点困"}');
    });

    it('块后还有正文：前后都要接上，不能吞掉', () => {
        const text = '先说一句<情绪>{"innerState":"x"}</情绪>后面还有话';
        const out = extractInlineEmotionBlock(text);
        expect(out.closed).toBe(true);
        expect(out.content).toBe('先说一句\n后面还有话');
        expect(out.raw).toBe('{"innerState":"x"}');
    });

    it('未闭合（被截断）：正文取块之前，raw 取块之后', () => {
        const text = '晚安。\n<情绪>{"changed":true,"buffs":[{"name":"calm"';
        const out = extractInlineEmotionBlock(text);
        expect(out.closed).toBe(false);
        expect(out.content).toBe('晚安。');
        expect(out.raw).toContain('"changed":true');
    });

    it('没有块：原样返回，不误伤正文里的尖括号', () => {
        const text = '他说「<不爱了>」是假的。';
        const out = extractInlineEmotionBlock(text);
        expect(out.closed).toBe(false);
        expect(out.content).toBe(text);
        expect(out.raw).toBe('');
    });

    it('标签内的空白容错：< 情绪 > / </ 情绪 >', () => {
        const text = '好< 情绪 >{"innerState":"y"}</ 情绪 >';
        const out = extractInlineEmotionBlock(text);
        expect(out.closed).toBe(true);
        expect(out.content).toBe('好');
        expect(out.raw).toBe('{"innerState":"y"}');
    });

    it('空输入安全', () => {
        expect(extractInlineEmotionBlock('')).toEqual({ content: '', raw: '', closed: false });
    });
});

describe('buildInlineEmotionInstruction — 注入主请求的指令', () => {
    it('带上规则正文与硬性输出格式', () => {
        const text = buildInlineEmotionInstruction('## 任务\n判断情绪底色');
        expect(text).toContain('## 任务\n判断情绪底色');
        expect(text).toContain('<情绪>');
        expect(text).toContain('</情绪>');
        expect(text).toContain('绝不会显示给对方');
        expect(text).toContain('innerState');
    });
});
