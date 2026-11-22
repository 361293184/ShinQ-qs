// 情绪并入主 API 的接线守卫（源码级断言）。
//
// 这套逻辑横跨 useChatAI（注入 + 剥离 + 落地）、streamPreview（预览扣块）、
// Chat（写回角色配置），而 vitest 是纯 Node 环境，跑不起这些 React 文件。
// 沿用仓库既有做法：读源码钉住关键接线，防「重构时被误删/改回去」这一类静默回归。
//
// 塌了的表现：
//   · 注入没了 → 主回复不再带情绪块，情绪永远不更新；
//   · 剥离没了 → 一坨 JSON 直接上屏；
//   · 写回没了 → 后处理二轮把控制块当正文再处理一遍；
//   · 即时对话/工具模式没排除 → 云端推回来的正文里带着控制块。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const chatAiSrc = read('../hooks/useChatAI.ts');
const streamPreviewSrc = read('./streamPreview.ts');
const chatSrc = read('../apps/Chat.tsx');

describe('情绪并入主 API — 接线', () => {
    it('主请求注入了内联指令，并且不再并行发独立评估', () => {
        expect(chatAiSrc).toContain('buildInlineEmotionInstruction(');
        expect(chatAiSrc).toContain('if (!inlineEmotionOn) fireLocalEmotionEval?.();');
    });

    it('即时对话 / 工具模式 / 主动消息 2.0 一律不并入', () => {
        expect(chatAiSrc).toContain('&& !instantChatRoute');
        expect(chatAiSrc).toContain('&& !toolModeActive');
        expect(chatAiSrc).toContain('&& !amsg2ToolsInjected');
    });

    it('落库前剥离控制块，并写回本次响应正文', () => {
        expect(chatAiSrc).toContain('extractInlineEmotionBlock(inlineSchedule.content)');
        expect(chatAiSrc).toContain('data.choices[0].message.content = inlineEmotion.content;');
    });

    it('落地复用既有的 applyEmotionEvalRaw（不另写一套解析）', () => {
        expect(chatAiSrc).toContain('applyEmotionEvalRaw(');
        expect(chatAiSrc).toContain('inlineEmotion.raw, charForGen, inlineSecretTask?.id, secretOrigin,');
    });

    it('秘密/朋友圈任务在成功、失败、提前返回三条路都会交还', () => {
        expect(chatAiSrc).toContain('const releaseInlineEmotionTasks = async');
        // 成功落地后的 finally / catch 开头 / 外层 finally 各一次（幂等）。
        expect(chatAiSrc.match(/await releaseInlineEmotionTasks\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });

    it('流式预览扣住情绪控制块', () => {
        expect(streamPreviewSrc).toContain('情');
        expect(streamPreviewSrc).toContain('绪');
    });

    it('设置面板的开关会写回角色配置', () => {
        expect(chatSrc).toContain('inline: config.inline !== false');
    });
});

describe('日程并入主 API — 接线', () => {
    it('情绪默认并入，只有显式关掉才走独立评估', () => {
        expect(chatAiSrc).toContain('char.emotionConfig?.inline !== false');
        expect(chatAiSrc).not.toContain('inlineEmotionChoice === undefined');
    });

    it('今天没有日程时，把日程任务段一起注入主请求', () => {
        expect(chatAiSrc).toContain('getDailyScheduleForChar(charForGen)');
        expect(chatAiSrc).toContain('buildInlineScheduleInstruction(scheduleTaskPrompt)');
    });

    it('落库前剥离日程块，并复用既有归一化与落库函数', () => {
        expect(chatAiSrc).toContain('extractInlineScheduleBlock(finalRoundContentRaw)');
        expect(chatAiSrc).toContain('buildScheduleFromParsed(');
        expect(chatAiSrc).toContain('persistGeneratedSchedule(charForGen, schedule, parsed.homeVisits)');
    });

    it('进聊天页只读日程，不再单独触发生成', () => {
        expect(chatSrc).toContain('setScheduleData(existing ?? null);');
        expect(chatSrc).not.toContain("// Generate in background, don't block chat");
    });

    it('流式预览同样扣住日程块', () => {
        expect(streamPreviewSrc).toContain('日');
        expect(streamPreviewSrc).toContain('程');
    });
});
