// 线下模式悬浮球的接线守卫（源码级断言）。
//
// 背景：eb80f283 同步上游 162 commits 时，Chat.tsx 采用了上游重构后的消息列表，
// 把这两个球 + 手机面板的 5 处接线一起带走了——组件和 import 都在，就是没人渲染，
// 编译不报错、测试全绿，直到用户发现「线下模式里没有旁白球和手机球」。
//
// 这类「import 还在、JSX 没了」的静默丢失没法靠类型检查发现，只能钉住接线本身：
//   · 底栏容器丢了 ref → 输入球没法定位，会一直 opacity:0；
//   · 输入球没了 → 永远停在「对话」模式，发不出旁白；
//   · 手机球/面板没了 → 手机道具完全不可达。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const chatSrc = readFileSync(
    fileURLToPath(new URL('../apps/Chat.tsx', import.meta.url)),
    'utf8',
);

describe('线下模式 — 悬浮球接线', () => {
    it('底栏容器挂着吸附锚点', () => {
        expect(chatSrc).toContain('className="relative z-40" ref={offlineBallAnchorRef}');
    });

    it('输入模式球（对话 / 旁白）真的被渲染，并且能切换模式', () => {
        expect(chatSrc).toContain('<OfflineInputBall');
        expect(chatSrc).toContain('anchorRef={offlineBallAnchorRef}');
        expect(chatSrc).toContain("setOfflineInputMode(offlineInputMode === 'dialogue' ? 'narration' : 'dialogue')");
    });

    it('手机道具球与手机面板都被渲染，且面板能打开/关闭', () => {
        expect(chatSrc).toContain('<OfflinePhoneBall');
        expect(chatSrc).toContain('onOpen={() => setPhonePanelOpen(true)}');
        expect(chatSrc).toContain('<OfflinePhonePanel');
        expect(chatSrc).toContain('onClose={() => setPhonePanelOpen(false)}');
        // 三种持有者状态要透传给球，不能写死 "me"。
        expect(chatSrc).toContain('holder={phoneHolder}');
    });

    it('输入区拿到线下状态（「线下已开」小点与旁白 placeholder 依赖它）', () => {
        expect(chatSrc).toContain('offlineModeEnabled={!!char && isOfflineEnabled(char.offlineConfig)}');
        expect(chatSrc).toContain('offlineInputMode={offlineInputMode}');
    });
});
