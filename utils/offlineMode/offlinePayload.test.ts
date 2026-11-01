import { describe, expect, it } from 'vitest';
import { ChatPrompts } from '../chatPrompts';
import {
    OFFLINE_TAIL_REMINDER,
    buildOfflineDividerContent,
    describeOfflineClock,
    withOfflineTailReminder,
} from './offlinePrompts';

/**
 * 回归守卫：线下模式最容易坏的地方都不在解析器，而在「prompt 装配」——
 * 别人改 ChatApp 规则、加末尾提示、动续说补丁，线下格式就悄悄失效了，
 * 而且没有任何报错（解析器的原则是「只错位不炸」）。这里把关键几条钉死。
 */

const userProfile = { name: '条条' } as any;
const char = { id: 'char-off', name: '阿一' } as any;

const stableOf = async (offlineMode?: boolean): Promise<string> => {
    const parts = await ChatPrompts.buildSystemPromptParts(
        char, userProfile, [], [], [], [],
        undefined, undefined, undefined, undefined, undefined, undefined,
        offlineMode === undefined ? undefined : { offlineMode },
    );
    return parts.stable;
};

describe('线下模式接管 ChatApp 规则', () => {
    it('开启时不再出现「手机聊天 / 不要输出行为」这两条冲突规则', async () => {
        const stable = await stableOf(true);
        expect(stable).toContain('TOP 1｜线下见面');
        expect(stable).not.toContain('请不要输出你的行为');
        expect(stable).not.toContain('哪怕上一句话你们还面对面在一起');
        // 整段替换规则最容易把功能教没了：这些能力必须原样还在
        expect(stable).toContain('[[SEND_EMOJI');
        expect(stable).toContain('[[ACTION:TRANSFER');
        expect(stable).toContain('[[QUOTE');
        expect(stable).toContain('图片-');
        expect(stable).toContain('[[ACTION:ADD_EVENT');
    });

    it('未开启时保留原来的手机聊天规则', async () => {
        const stable = await stableOf(undefined);
        expect(stable).toContain('TOP 1｜ChatApp 格式');
        expect(stable).toContain('请不要输出你的行为');
        expect(stable).not.toContain('TOP 1｜线下见面');
    });

    it('环境感知按语境切换：线下不讲「发图片」', async () => {
        expect(await stableOf(true)).toContain('你们之间安静了多久');
        expect(await stableOf(undefined)).toContain('如果用户发送了图片');
    });
});

describe('线下末尾提醒', () => {
    const base = [
        { role: 'system', content: 'system' },
        { role: 'user', content: '在吗' },
        { role: 'system', content: '实时上下文' },
    ];

    it('开启时挂在最后一条 system 之后，且有格式要求', () => {
        const out = withOfflineTailReminder(base, true);
        expect(out).toHaveLength(base.length + 1);
        expect(out[out.length - 1]).toEqual({ role: 'system', content: OFFLINE_TAIL_REMINDER });
        expect(OFFLINE_TAIL_REMINDER).toContain('旁白');
        expect(OFFLINE_TAIL_REMINDER).toContain('引号');
    });

    it('未开启时不改动原数组', () => {
        expect(withOfflineTailReminder(base, false)).toBe(base);
    });
});

describe('间隔提示的线下语境', () => {
    // 10 分钟内两种语境都不提示（原文案本来就这样），所以用 20 分钟
    const twentyMinutesAgo = { timestamp: Date.now() - 20 * 60 * 1000 } as any;

    it('线下不提「消息 / 离开」', () => {
        const offline = ChatPrompts.getTimeGapHint(twentyMinutesAgo, Date.now(), undefined, true);
        expect(offline).toContain('安静了');
        expect(offline).not.toContain('消息');
        expect(offline).not.toContain('离开');
    });

    it('非线下保持原文案', () => {
        const online = ChatPrompts.getTimeGapHint(twentyMinutesAgo, Date.now(), undefined, false);
        expect(online).toContain('距离上一条消息');
    });
});

describe('进入线下的时间锚点', () => {
    it('按小时给时段', () => {
        expect(describeOfflineClock(new Date(2026, 0, 1, 3, 5))).toBe('凌晨 03:05');
        expect(describeOfflineClock(new Date(2026, 0, 1, 12, 0))).toBe('中午 12:00');
        expect(describeOfflineClock(new Date(2026, 0, 1, 18, 40))).toBe('傍晚 18:40');
        expect(describeOfflineClock(new Date(2026, 0, 1, 23, 59))).toBe('深夜 23:59');
    });

    it('分隔线文案带锚点，退出不带', () => {
        const start = buildOfflineDividerContent('start', new Date(2026, 0, 1, 18, 40));
        expect(start).toContain('线下模式 · 进入');
        expect(start).toContain('傍晚 18:40');
        expect(buildOfflineDividerContent('end')).toBe('─── 线下模式 · 结束 ───');
    });
});
