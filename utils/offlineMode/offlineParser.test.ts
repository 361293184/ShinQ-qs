import { describe, it, expect } from 'vitest';
import { parseOfflineMessage, hasDialogue, isQuoteStartLine, detectOfflineFormatBreak } from './offlineParser';
import { normalizeOfflineConfig, clampReplyLength, clampNarrationSize, isOfflineEnabled, isChineseText, DEFAULT_OFFLINE_CONFIG } from './offlineSettings';

describe('parseOfflineMessage 行级解析', () => {
    it('纯旁白 → 相邻旁白合并成一段', () => {
        const segs = parseOfflineMessage('风把她的发梢吹得轻轻晃。\n她盯着你看了很久。');
        expect(segs).toEqual([{ type: 'narration', text: '风把她的发梢吹得轻轻晃。\n她盯着你看了很久。' }]);
    });

    it('纯台词 → 台词段并剥掉成对引号', () => {
        const segs = parseOfflineMessage('"你终于来啦。"');
        expect(segs).toEqual([{ type: 'dialogue', text: '你终于来啦。' }]);
    });

    it('半角引号也算台词', () => {
        const segs = parseOfflineMessage('"你终于来啦。"');
        expect(segs[0].type).toBe('dialogue');
    });

    it('旁白 + 台词交替，相邻同类合并，行内引号剥干净', () => {
        const segs = parseOfflineMessage(
            '她站在门口，肩上还挂着雪花。\n"外面好冷。"\n"快进来吧。"\n她搓了搓手，露出笑容。',
        );
        expect(segs).toEqual([
            { type: 'narration', text: '她站在门口，肩上还挂着雪花。' },
            { type: 'dialogue', text: '外面好冷。\n快进来吧。' },
            { type: 'narration', text: '她搓了搓手，露出笑容。' },
        ]);
    });

    it('台词折行容错：开引号未闭合时后续旁白行继续并入台词', () => {
        const segs = parseOfflineMessage('"今天风很大。\n你冷吗？"');
        expect(segs).toEqual([{ type: 'dialogue', text: '今天风很大。\n你冷吗？' }]);
    });

    it('残留 [emotion] 立绘标签在旁白行行首被清掉', () => {
        const segs = parseOfflineMessage('[normal] 她低头笑了笑。');
        expect(segs).toEqual([{ type: 'narration', text: '她低头笑了笑。' }]);
    });

    it('空输入 / 空白行 → 空数组', () => {
        expect(parseOfflineMessage('')).toEqual([]);
        expect(parseOfflineMessage('\n  \n')).toEqual([]);
    });

    it('无台词时 hasDialogue 为 false，有台词为 true', () => {
        expect(hasDialogue(parseOfflineMessage('她只是静静看着窗外。'))).toBe(false);
        expect(hasDialogue(parseOfflineMessage('她静静看着窗外。\n"你回来啦。"'))).toBe(true);
    });

    it('isQuoteStartLine 只认行首引号', () => {
        expect(isQuoteStartLine('"你好"')).toBe(true);
        expect(isQuoteStartLine('他笑了笑说"你好"')).toBe(false);
    });

    it('台词变旁白时能给出诊断原因（格式失效可观测）', () => {
        const noQuote = '她看着你。\n你今天去哪了？';
        expect(detectOfflineFormatBreak(noQuote, parseOfflineMessage(noQuote))).toContain('没给台词加引号');

        const quoteInside = '她低声说"你回来了"。';
        expect(detectOfflineFormatBreak(quoteInside, parseOfflineMessage(quoteInside))).toContain('引号写在行中');

        // 正常格式不报
        const ok = '她笑了。\n"你回来了。"';
        expect(detectOfflineFormatBreak(ok, parseOfflineMessage(ok))).toBeNull();
        // 纯动作、无对话迹象不报
        expect(detectOfflineFormatBreak('她把杯子放下。', parseOfflineMessage('她把杯子放下。'))).toBeNull();
    });
});

describe('NPC 台词写进旁白（解析器零改动的回归保护）', () => {
    it('NPC 台词内联在旁白行内 → 整行仍是 narration', () => {
        const segs = parseOfflineMessage('林小满端着咖啡走过来，"两位要续杯吗？"');
        expect(segs).toHaveLength(1);
        expect(segs[0].type).toBe('narration');
    });

    it('NPC 台词独立成行带引号 → 被判成 dialogue（串号，锁定行为提醒 prompt 必须禁止）', () => {
        const segs = parseOfflineMessage('林小满走过来\n"两位要续杯吗？"');
        expect(segs[1].type).toBe('dialogue');
    });

    it('NPC 行不因内联成对引号而改变类型', () => {
        const segs = parseOfflineMessage('老陈笑了笑，"行啊。"然后又低下头。');
        expect(segs[0].type).toBe('narration');
    });

    it('未闭合台词会吞掉后续 NPC 行（既有容错，回归锁定）', () => {
        const segs = parseOfflineMessage('"我其实——\n林小满推门进来，"打扰了。"');
        expect(segs).toHaveLength(1);
        expect(segs[0].type).toBe('dialogue');
    });

    it('混合：旁白(含NPC) → 角色台词 → 旁白', () => {
        const segs = parseOfflineMessage(
            '林小满端着咖啡走过来，"两位要续杯吗？"\n"不用了，谢谢。"\n她点点头，转身离开。',
        );
        expect(segs.map((s) => s.type)).toEqual(['narration', 'dialogue', 'narration']);
    });
});

describe('offlineSettings 归一化', () => {
    it('空配置 → 默认值兜底', () => {
        const cfg = normalizeOfflineConfig();
        expect(cfg.enabled).toBe(false);
        expect(cfg.style).toBe('cinematic');
        expect(cfg.replyLength).toBe(150);
        expect(cfg.pov).toBe('first-you');
        expect(cfg.openingNarration).toBe(true);
    });

    it('越界字数/字号被钳制', () => {
        expect(normalizeOfflineConfig({ replyLength: 9999 }).replyLength).toBe(500);
        expect(normalizeOfflineConfig({ replyLength: 1 }).replyLength).toBe(50);
        expect(normalizeOfflineConfig({ narrationSize: 99 }).narrationSize).toBe(22);
        expect(clampReplyLength(undefined)).toBe(150);
        expect(clampNarrationSize(undefined)).toBe(DEFAULT_OFFLINE_CONFIG.narrationSize);
    });

    it('非法 pov 回退默认，合法值保留', () => {
        expect(normalizeOfflineConfig({ pov: 'xxx' as any }).pov).toBe('first-you');
        expect(normalizeOfflineConfig({ pov: 'third-name' }).pov).toBe('third-name');
    });

    it('出场人物档位：默认关闭，非法值回落 none', () => {
        expect(normalizeOfflineConfig().npcPresence).toBe('none');
        expect(normalizeOfflineConfig({ npcPresence: 'low' }).npcPresence).toBe('low');
        expect(normalizeOfflineConfig({ npcPresence: 'medium' }).npcPresence).toBe('medium');
        expect(normalizeOfflineConfig({ npcPresence: 'always' as any }).npcPresence).toBe('none');
    });

    it('isOfflineEnabled 判定', () => {
        expect(isOfflineEnabled()).toBe(false);
        expect(isOfflineEnabled({ enabled: true })).toBe(true);
        expect(isOfflineEnabled({ enabled: false })).toBe(false);
    });
});

describe('isChineseText 中文检测（双语隐藏翻译按钮）', () => {
    it('纯中文判中文', () => {
        expect(isChineseText('你好，今天天气不错！')).toBe(true);
    });
    it('中文为主判中文', () => {
        expect(isChineseText('我去便利店坐一会儿。')).toBe(true);
    });
    it('日文/英文判非中文', () => {
        expect(isChineseText('こんにちは！今日はいい天気ですね。')).toBe(false);
        expect(isChineseText('Hello, how are you today?')).toBe(false);
    });
    it('空串/空白判非中文', () => {
        expect(isChineseText('')).toBe(false);
        expect(isChineseText('   ')).toBe(false);
        expect(isChineseText(null)).toBe(false);
    });
});
