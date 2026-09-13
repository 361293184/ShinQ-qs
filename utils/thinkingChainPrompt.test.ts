import { describe, it, expect } from 'vitest';
import { buildThinkingChainPrompt } from './thinkingChainPrompt';

// 锁住 thinking 阶段的「回复前自检」小节：
//   1. 小节存在，且落在 THINKING 块内（【以下规则仅适用于 THINKING 阶段】之后、【THINKING 规则结束】之前）
//   2. 两处名字占位符已被替换（不残留 ${charName} / ${userName}）
//   3. 7 个维度齐备（称呼 / 弱化 / 催作息 / 易碎品 / 塞建议 / 自贬 / 恋爱脑）
//   4. 零词例：刻意不含任何具体禁用句（把禁语写进提示词反而会激活它——粉色大象）
//
// 为什么值得锁：效果无法自动断言（要真聊才有数据），能守住的就是
// "它有没有被原样写进 thinking、有没有被悄悄塞进禁语"。

// 具体禁用句清单：这些字面串一旦写进提示词，反而教会模型去说。
// 自检文案一律用「类别描述」规避。
const BANNED_LITERALS = [
    '去睡吧', '早点休息', '别熬夜',
    '你应该', '听我的',
    '你还小', '你不懂', '小心点别逞强',
    '还好吗', '对不起',
];

describe('thinking 阶段 · 回复前自检', () => {
    const prompt = buildThinkingChainPrompt('阿澈', '小夏');

    it('小节存在且落在 THINKING 块内', () => {
        const blockStart = prompt.indexOf('【以下规则仅适用于 THINKING 阶段】');
        const selfCheck = prompt.indexOf('### 回复前自检');
        const blockEnd = prompt.indexOf('【THINKING 规则结束】');
        expect(blockStart).toBeGreaterThan(-1);
        expect(blockEnd).toBeGreaterThan(-1);
        expect(selfCheck).toBeGreaterThan(-1);
        expect(selfCheck).toBeGreaterThan(blockStart);
        expect(selfCheck).toBeLessThan(blockEnd);
    });

    it('两处名字占位符已被替换，不残留模板变量', () => {
        expect(prompt).toContain('阿澈');
        expect(prompt).toContain('小夏');
        expect(prompt).not.toContain('${charName}');
        expect(prompt).not.toContain('${userName}');
    });

    it('七个维度齐备', () => {
        expect(prompt).toContain('姓氏＋职位'); // 称呼：类别描述
        expect(prompt).toContain('别小看 ta');
        expect(prompt).toContain('别催 ta 作息');
        expect(prompt).toContain('别把 ta 当易碎品');
        expect(prompt).toContain('别不请自来塞建议');
        expect(prompt).toContain('别过度道歉自贬');
        expect(prompt).toContain('别恋爱脑');
    });

    it('零词例：不出现任何具体禁用句', () => {
        for (const banned of BANNED_LITERALS) {
            expect(prompt).not.toContain(banned);
        }
    });
});
