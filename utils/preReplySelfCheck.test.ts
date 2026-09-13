import { describe, it, expect } from 'vitest';
import { ContextBuilder, PRE_REPLY_SELFCHECK } from './context';

// 锁住 output 阶段的「回复前自检 (Pre-Reply Self-Check)」这一节：
//   1. 文案稳定：关键句仍在，且名字占位符被替换（不残留 ${charName} / ${userName}）
//   2. 两处名字占位符被真正替换
//   3. 必须留在 stable 侧：deferVolatile 拿不走它（拿走了 prompt 前缀缓存就白拆）
//   4. 多角色场景不注入：避免同一份规则重复 N 份
//   5. 只注入一次
//   6. 零词例：刻意不含任何具体禁用句（避免反向激活那些词）
//
// 为什么值得用测试锁：效果无法自动断言，能自动化守住的就是
// "它有没有被原样注入、有没有被悄悄塞进禁语"。

const makeChar = (name = '测试角色') => ({
    id: 'c1',
    name,
    systemPrompt: '你是测试角色。',
    timeAwarenessEnabled: false,
} as any);

const makeUser = (name = '测试用户') => ({ name, bio: '' } as any);

// 具体禁用句清单：一旦写进提示词反而会教会模型去说（粉色大象）。
const BANNED_LITERALS = [
    '去睡吧', '早点休息', '别熬夜',
    '你应该', '听我的',
    '你还小', '你不懂', '小心点别逞强',
    '还好吗', '对不起',
];

describe('回复前自检 (Pre-Reply Self-Check)', () => {
    it('私聊核心上下文里注入了这一节，且名字占位符换成了真名', () => {
        const core = ContextBuilder.buildCoreContext(makeChar('阿澈'), makeUser('小夏'), true);
        expect(core).toContain('### 回复前自检 (Pre-Reply Self-Check)');
        expect(core).toContain('阿澈，每次开口前先扫一遍');
        expect(core).toContain('小夏');
        expect(core).not.toContain('${charName}');
        expect(core).not.toContain('${userName}');
    });

    it('七个维度齐备', () => {
        const text = PRE_REPLY_SELFCHECK('阿澈', '小夏');
        expect(text).toContain('按上方《对话中的称呼规范》来'); // 称呼维度指向既有规则
        expect(text).toContain('别小看小夏');
        expect(text).toContain('别催小夏作息');
        expect(text).toContain('别把小夏当易碎品');
        expect(text).toContain('别不请自来塞建议');
        expect(text).toContain('别过度道歉自贬');
        expect(text).toContain('别恋爱脑');
    });

    it('零词例：不出现任何具体禁用句，但保留类别描述', () => {
        const text = PRE_REPLY_SELFCHECK('角色', '用户');
        for (const banned of BANNED_LITERALS) {
            expect(text).not.toContain(banned);
        }
        // 类别描述保留：靠类别说清"不要什么"，不靠举例
        expect(text).toContain('易碎品');
    });

    it('deferVolatile 下仍在 stable 侧，且不进 volatile 段', () => {
        const char = makeChar();
        const user = makeUser();
        const stable = ContextBuilder.buildCoreContext(
            char, user, true, undefined, undefined, undefined, { deferVolatile: true },
        );
        expect(stable).toContain('### 回复前自检 (Pre-Reply Self-Check)');

        const volatile = ContextBuilder.buildVolatileCoreState(char, { includeDetailedMemories: true });
        expect(volatile).not.toContain('回复前自检');
    });

    it('多角色场景（群聊/游戏房）不注入，避免同一份规则重复 N 份', () => {
        const core = ContextBuilder.buildCoreContext(
            makeChar(), makeUser(), true, undefined, { skipUserProfile: true },
        );
        expect(core).not.toContain('### 回复前自检 (Pre-Reply Self-Check)');
    });

    it('只注入一次（防止将来在别处重复拼接，把权重抬高）', () => {
        const core = ContextBuilder.buildCoreContext(makeChar(), makeUser(), true);
        const hits = core.split('### 回复前自检 (Pre-Reply Self-Check)').length - 1;
        expect(hits).toBe(1);
    });
});
