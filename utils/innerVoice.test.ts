import { describe, it, expect } from 'vitest';
import { extractInnerVoice, isInnerVoiceEnabled } from './innerVoice';

describe('extractInnerVoice 心声解析剥离', () => {
    it('正常多层：台词剥离干净，分层正确', () => {
        const raw = `我没事，你先忙吧。
<inner_voice>
【真心话】嘴上说没事，其实有点失落。
【小动作】手指一直没离开手机。
</inner_voice>`;
        const { clean, innerVoice } = extractInnerVoice(raw);
        expect(clean).toBe('我没事，你先忙吧。');
        expect(innerVoice).not.toBeNull();
        expect(innerVoice!.layers).toEqual([
            { type: '真心话', text: '嘴上说没事，其实有点失落。' },
            { type: '小动作', text: '手指一直没离开手机。' },
        ]);
    });

    it('台词在块之后：只剥块，前后文保留', () => {
        const raw = `<inner_voice>
【真心话】"想见你。"
</inner_voice>
那你周末有空吗？`;
        const { clean, innerVoice } = extractInnerVoice(raw);
        expect(clean).toBe('那你周末有空吗？');
        expect(innerVoice!.layers).toEqual([{ type: '真心话', text: '想见你。' }]);
    });

    it('未闭合块容错：取到末尾为心声，台词为空也不抛错', () => {
        const raw = `<inner_voice>
【真心话】还没说出口的那句`;
        const { clean, innerVoice } = extractInnerVoice(raw);
        expect(innerVoice!.layers).toEqual([{ type: '真心话', text: '还没说出口的那句' }]);
        expect(clean).toBe('');
    });

    it('纯文本无【】降级单层「心声」', () => {
        const raw = `好的呀。
<inner_voice>其实我今天不太舒服，但不想让你担心。</inner_voice>`;
        const { clean, innerVoice } = extractInnerVoice(raw);
        expect(clean).toBe('好的呀。');
        expect(innerVoice!.layers).toEqual([{ type: '心声', text: '其实我今天不太舒服，但不想让你担心。' }]);
    });

    it('未知标签归为「心声」', () => {
        const raw = `嗯。
<inner_voice>
【计划】明天偷偷去看他。
</inner_voice>`;
        const { innerVoice } = extractInnerVoice(raw);
        expect(innerVoice!.layers).toEqual([{ type: '心声', text: '明天偷偷去看他。' }]);
    });

    it('空内容 / 无标签 → 无心声，原文原样返回', () => {
        expect(extractInnerVoice('').innerVoice).toBeNull();
        expect(extractInnerVoice('普通的一句话')).toEqual({ clean: '普通的一句话', innerVoice: null });
        const empty = extractInnerVoice('你好<inner_voice>\n\n</inner_voice>');
        expect(empty.innerVoice).toBeNull();
        expect(empty.clean).toBe('你好');
    });

    it('超长截断：单层 >48 字截断，整块总长 ≤260 字', () => {
        const longLine = '啊'.repeat(60);
        const { innerVoice } = extractInnerVoice(`<inner_voice>【真心话】${longLine}</inner_voice>`);
        expect(innerVoice!.layers[0].text).toHaveLength(48);

        // 多层累积超 260 字（但层数 ≤12 不触发刷层阀）→ 在边界处停住，不超 260
        let raw = '<inner_voice>\n';
        for (let i = 0; i < 10; i++) raw += `【吐槽】${'字'.repeat(30)}\n`;
        raw += '</inner_voice>';
        const many = extractInnerVoice(raw);
        const total = many.innerVoice!.layers.reduce((s, l) => s + l.text.length, 0);
        expect(total).toBeLessThanOrEqual(260);
    });

    it('>12 层判异常刷层 → 整块静默丢弃（视为无心声）', () => {
        let raw = '<inner_voice>\n';
        for (let i = 0; i < 13; i++) raw += `【真心话】第${i}句\n`;
        raw += '</inner_voice>';
        const { clean, innerVoice } = extractInnerVoice(raw);
        expect(innerVoice).toBeNull();
        expect(clean).toBe('');
    });

    it('台词里残留字面标签字样被清掉', () => {
        const raw = '别看我<inner_voice>说这些，其实</inner_voice>我都在意。';
        const { clean } = extractInnerVoice(raw);
        expect(clean).not.toContain('inner_voice');
        expect(clean).toBe('别看我我都在意。');
    });

    it('无包裹引号的层文本保持原样；成对引号被剥掉', () => {
        const raw = `<inner_voice>
【真心话】"真的会等你"
【关系】好像越来越习惯他在了
</inner_voice>`;
        const { innerVoice } = extractInnerVoice(raw);
        expect(innerVoice!.layers).toEqual([
            { type: '真心话', text: '真的会等你' },
            { type: '关系', text: '好像越来越习惯他在了' },
        ]);
    });
});

describe('isInnerVoiceEnabled 开关判定', () => {
    it('缺省视为开', () => {
        expect(isInnerVoiceEnabled(undefined)).toBe(true);
        expect(isInnerVoiceEnabled(null)).toBe(true);
        expect(isInnerVoiceEnabled({})).toBe(true);
    });
    it('显式开/关生效', () => {
        expect(isInnerVoiceEnabled({ innerVoiceEnabled: true })).toBe(true);
        expect(isInnerVoiceEnabled({ innerVoiceEnabled: false })).toBe(false);
    });
});
