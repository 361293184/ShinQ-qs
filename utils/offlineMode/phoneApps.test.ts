// 手机 App 扩充的守卫。
//
// 生成目标现在统一走 ALL_PHONE_BLOCKS（默认 6 块 + 5 个按需块，3 组并发）：
// 首次打开就把整部手机写完，不再「6 个 + 点开才补」。
// PHONE_BLOCK_ORDER 只保留「哪几块最常看」的语义（单块补齐/旧逻辑用）。
//
// 这里钉三件事：
//   1. 生成目标覆盖全部块（missingBlocks 不能退回只查 6 块）；
//   2. 每个新增 App 都必须有渲染落点（有专属组件 / 有 case / 有通用列表映射），
//      避免出现「主屏点了没反应」——这个项目已经因为合并丢过一次接线；
//   3. 有专属渲染的 App 不能被入口闸门挡住。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_PHONE_BLOCKS, PHONE_BLOCK_LABELS, PHONE_BLOCK_ORDER, PHONE_CONTENT_SCHEMA, missingBlocks } from './phoneContent';

const panelSrc = readFileSync(
    fileURLToPath(new URL('../../components/chat/OfflinePhonePanel.tsx', import.meta.url)),
    'utf8',
);

const ON_DEMAND_BLOCKS = ['shopping', 'mapWeather', 'health', 'records', 'publicFace'];
const NEW_APPS = ['taobao', 'meituan', 'map', 'weather', 'health', 'phone', 'sms', 'weibo', 'mail', 'schedule'];

describe('线下手机 · 新增 App', () => {
    it('按需块不进默认生成顺序', () => {
        expect(PHONE_BLOCK_ORDER).toHaveLength(6);
        for (const id of ON_DEMAND_BLOCKS) {
            expect(PHONE_BLOCK_ORDER).not.toContain(id);
            expect(PHONE_BLOCK_LABELS[id as keyof typeof PHONE_BLOCK_LABELS]).toBeTruthy();
        }
    });

    it('首次生成就覆盖全部 App（按需块不用点开才补）', () => {
        expect(ALL_PHONE_BLOCKS).toHaveLength(PHONE_BLOCK_ORDER.length + ON_DEMAND_BLOCKS.length);
        expect(missingBlocks(null)).toEqual(ALL_PHONE_BLOCKS);
    });

    it('每个新增 App 都有渲染落点', () => {
        for (const id of NEW_APPS) {
            const hasCase = panelSrc.includes(`case '${id}'`);
            const hasInlineBranch = panelSrc.includes(`current.id === '${id}'`);
            const hasContentKey = new RegExp(`\\n\\s+${id}: '`).test(panelSrc);
            expect(hasCase || hasInlineBranch || hasContentKey, `${id} 没接上渲染`).toBe(true);
        }
    });

    it('按需块都有 App 挂在上面（不会永远不生成）', () => {
        for (const block of ON_DEMAND_BLOCKS) {
            expect(panelSrc).toContain(`'${block}'`);
        }
        // 日程不生成，只读，所以它不该出现在 APP_BLOCK 里。
        expect(panelSrc).not.toContain("schedule: 'schedule'");
    });

    it('结构版本已升到 5（旧缓存自动重生成）', () => {
        expect(PHONE_CONTENT_SCHEMA).toBeGreaterThanOrEqual(5);
    });

    // 2026-11-26 修的坑：天气/健康/微博/邮件 有专属组件和生成块，但入口闸门只写了
    // CONTENT_KEY，于是点开直接落到「这个 App 还没接上数据」。加这条防止再漏。
    it('专属渲染的 App 不会被入口闸门挡住', () => {
        const declared = panelSrc.match(/DEDICATED_APPS = new Set<AppId>\(\[([\s\S]*?)\]\)/)?.[1] || '';
        const ids = [...declared.matchAll(/'([a-zA-Z]+)'/g)].map((match) => match[1]);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) {
            expect(panelSrc, `${id} 没有专属渲染分支`).toContain(`case '${id}'`);
            // 这些 id 必须同时出现在「能不能打开」的判断里
            expect(panelSrc, `${id} 被闸门挡住`).toContain('DEDICATED_APPS.has(current.id)');
        }
    });
});
