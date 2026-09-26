/**
 * 拾光票根卡守卫。
 *
 * 放在 utils/ 下是因为 vitest 的 include 只覆盖 utils / worker / scripts 三处
 * （见 vitest.config.ts），components 下的测试文件不会被收集。
 *
 * 1) 防回潮：条宽必须由 CSS 的 flex **长属性**分配，不能再用内联的
 *    `flex: <权重> 0 0%` 简写 —— 该简写的百分比基准在部分 iOS Safari 上会被错解析成
 *    `flex-basis: auto`，导致 26 个竖条不再从零基础宽度分配剩余空间，
 *    实测表现为条码只铺满票根左半边（桌面 Chrome 解析正确，所以一直没暴露）。
 * 2) 纯函数契约：编号位数、条码条数与权重范围、每日选图的稳定性。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { barcodeBars, dayStamp, pickDailyImage, ticketSerial } from './shelfTicket';

const ROOT = process.cwd();
const tsxPath = join(ROOT, 'components', 'fanwai', 'ShelfTicketCard.tsx');
const cssPath = join(ROOT, 'components', 'fanwai', 'ShelfTicketCard.css');

describe('拾光票根 · 条形码宽度分配守卫', () => {
    it('不再用内联 flex 简写分配条宽（iOS Safari 会错解析其中的百分比基准）', () => {
        const source = readFileSync(tsxPath, 'utf8');

        // 形如 flex: `2 0 0%` / flex: '1 0 0%' 的简写一律不允许
        expect(source, '条宽不能用含百分比基准的 flex 简写').not.toMatch(
            /flex:\s*[`'"][^`'"]*\b0%\b/,
        );
        // 形如 flex: `${w} 0 0%` 的模板串写法（本次修掉的那一种）
        expect(source, '条宽不能用模板串拼 flex 简写').not.toMatch(/flex:\s*[`'"]\$\{/);
    });

    it('改用 CSS 长属性 + 绝对长度基准，权重经 --bar-w 注入', () => {
        const tsx = readFileSync(tsxPath, 'utf8');
        const css = readFileSync(cssPath, 'utf8');

        // 变量名两处必须一致：拼错会静默回落到 fallback 值（不报错，但条码会看起来均匀）
        expect(tsx, 'TSX 侧应注入 --bar-w').toContain('--bar-w');
        expect(css, 'CSS 侧应读取 --bar-w').toMatch(/var\(--bar-w/);

        // 三项长属性分开写、基准用绝对长度
        expect(css).toMatch(/flex-grow:\s*var\(--bar-w/);
        expect(css).toMatch(/flex-shrink:\s*0\b/);
        expect(css).toMatch(/flex-basis:\s*0px/);
    });

    it('权重变量带兜底值，避免变量缺失时竖条塌成 0 宽', () => {
        const css = readFileSync(cssPath, 'utf8');
        expect(css).toMatch(/var\(--bar-w,\s*1\)/);
    });
});

describe('拾光票根 · 纯函数契约', () => {
    it('条码固定 26 条，权重落在 1~4（四档才能有参差感）', () => {
        const bars = barcodeBars('char-alpha');
        expect(bars).toHaveLength(26);
        expect(bars.every(w => Number.isInteger(w) && w >= 1 && w <= 4)).toBe(true);
    });

    it('条码是确定性的：同一 charId 每次结果一致，不同 charId 图案不同', () => {
        expect(barcodeBars('char-alpha')).toEqual(barcodeBars('char-alpha'));
        expect(barcodeBars('char-alpha')).not.toEqual(barcodeBars('char-beta'));
    });

    it('编号是 4 位数字（不足补零），且同一角色恒定不变', () => {
        for (const charId of ['char-alpha', 'char-beta', 'x', '一个中文角色名']) {
            const serial = ticketSerial(charId);
            expect(serial, charId).toMatch(/^\d{4}$/);
            expect(ticketSerial(charId)).toBe(serial);
        }
    });

    it('dayStamp 是 YYYYMMDD 形态，按本地日期切日', () => {
        // 2026-09-26 12:00 本地时间
        const stamp = dayStamp(new Date(2026, 8, 26, 12, 0, 0).getTime());
        expect(stamp).toBe(20260926);
    });

    it('每日选图：同一天内稳定，图池为空时返回 null', () => {
        const pool = ['a.jpg', 'b.jpg', 'c.jpg'];
        const noon = new Date(2026, 8, 26, 12, 0, 0).getTime();
        const night = new Date(2026, 8, 26, 23, 30, 0).getTime();

        const first = pickDailyImage('char-alpha', pool, noon);
        expect(first).not.toBeNull();
        expect(pool).toContain(first as string);
        // 同一天不同时刻应选中同一张
        expect(pickDailyImage('char-alpha', pool, night)).toBe(first);
        // 空池走占位
        expect(pickDailyImage('char-alpha', [], noon)).toBeNull();
    });
});
