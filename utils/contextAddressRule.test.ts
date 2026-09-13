import { describe, it, expect } from 'vitest';
import { ContextBuilder, FORMS_OF_ADDRESS } from './context';

// 锁住「对话中的称呼规范 (Forms of Address)」这一节的四件事：
//   1. 文案稳定：关键句仍在，且**刻意不含**任何具体头衔/外号示例
//      （把禁语写进提示词反而会激活它——同「表达底线」的取向，见 context.ts 的注释）
//   2. 两处名字占位符被真正替换（不残留 ${charName} / ${userName}）
//   3. 必须留在 stable 侧：deferVolatile 拿不走它（拿走了 prompt 前缀缓存就白拆）
//   4. 多角色场景不注入：避免同一份规则重复 N 份
//
// 为什么值得用测试锁：这条规则的效果无法自动断言（要真聊十几轮才有数据），
// 能自动化守住的就是"它有没有被原样注入、有没有被悄悄塞进禁语"。

const makeChar = (name = '测试角色') => ({
    id: 'c1',
    name,
    systemPrompt: '你是测试角色。',
    timeAwarenessEnabled: false,
} as any);

const makeUser = (name = '测试用户') => ({ name, bio: '' } as any);

describe('对话中的称呼规范 (Forms of Address)', () => {
    it('私聊核心上下文里注入了这一节，且两处名字都换成了真名', () => {
        const core = ContextBuilder.buildCoreContext(makeChar('阿澈'), makeUser('小夏'), true);
        expect(core).toContain('### 对话中的称呼规范 (Forms of Address)');
        expect(core).toContain('阿澈，你对小夏的称呼应自然、克制');
        expect(core).toContain('拿不准该如何称呼小夏时');
        // 占位符必须已经被替换掉，不能把 ${charName} 这种东西送去给模型
        expect(core).not.toContain('${charName}');
        expect(core).not.toContain('${userName}');
    });

    it('刻意不列举任何具体头衔或外号示例（避免反向激活那些词）', () => {
        const text = FORMS_OF_ADDRESS('角色', '用户');
        for (const banned of [
            '老师', '小姐', '先生', '女士', '老板', '师傅',
            '某总', '管家婆', '醋包', '财迷', '笨蛋', '操心鬼',
        ]) {
            expect(text).not.toContain(banned);
        }
        // 类别描述要保留：靠类别说清"不要什么"，而不是靠举例
        expect(text).toContain('姓氏＋职位');
        expect(text).toContain('角色化的头衔');
        expect(text).toContain('外号');
    });

    it('deferVolatile 下仍在 stable 侧，且不进 volatile 段', () => {
        const char = makeChar();
        const user = makeUser();
        const stable = ContextBuilder.buildCoreContext(
            char, user, true, undefined, undefined, undefined, { deferVolatile: true },
        );
        expect(stable).toContain('### 对话中的称呼规范 (Forms of Address)');

        const volatile = ContextBuilder.buildVolatileCoreState(char, { includeDetailedMemories: true });
        expect(volatile).not.toContain('对话中的称呼规范');
    });

    it('多角色场景（群聊/游戏房）不注入，避免同一份规则重复 N 份', () => {
        const core = ContextBuilder.buildCoreContext(
            makeChar(), makeUser(), true, undefined, { skipUserProfile: true },
        );
        expect(core).not.toContain('### 对话中的称呼规范 (Forms of Address)');
    });

    it('只注入一次（防止将来在别处重复拼接，把权重抬高）', () => {
        const core = ContextBuilder.buildCoreContext(makeChar(), makeUser(), true);
        const hits = core.split('### 对话中的称呼规范 (Forms of Address)').length - 1;
        expect(hits).toBe(1);
    });
});
