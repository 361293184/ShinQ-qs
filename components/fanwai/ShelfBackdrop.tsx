/**
 * 拾光首页背景层。
 *
 * 这一层只讲一件事：**一束光，落在一本摊开的收藏册上**。
 * 四层是同一个空间里的四个距离，不是四个装饰贴纸 ——
 *   最近的：内页细格纹（纸的质感）
 *   中景：自上而下的暖光（光的氛围）
 *   最远：纸上盖过的旧戳（藏品的印记）
 *   浮在光里：缓慢上升的微尘（光的证据）
 *
 * 邮戳上的字刻意与票根同源：中心「拾光」用宋体（同票根上的角色名），
 * 环绕小字用等宽体（同票根上的 NO.xxxx）。背景和卡片必须像同一套印刷品。
 *
 * 纯静态组件：没有 state、没有 effect，只在挂载时渲染一次；
 * 所有动效交给 CSS keyframes（见 ShelfBackdrop.css），不产生任何 JS 逐帧开销。
 *
 * 全部 aria-hidden + pointer-events-none：它是氛围不是内容，
 * 既不该被读屏念出来，也绝不能拦住卡片的横滑手势。
 */

import React from 'react';
import './ShelfBackdrop.css';

/** 邮戳直径（px）。与 CSS 里 .shelf-bg-stamp 的 width/height 保持一致。 */
const STAMP = 300;
const CX = STAMP / 2;
const CY = STAMP / 2;
/** 双环：外环粗、内环细（真邮戳就是一道实环 + 一道内衬线）。 */
const R_OUTER = 142;
const R_INNER = 128;
/** 刻度环：短线夹在内外环之间，每 4 条加长一档做出节奏（等长会像齿轮）。 */
const TICKS = 60;
const R_TICK_OUT = 127;
const R_TICK_IN = 120;
const R_TICK_IN_LONG = 115;
/** 弧形文字的基线半径。 */
const R_ARC = 104;
/** 中心圈：把「拾光」框住，真印章几乎都有这一圈。 */
const R_CORE = 54;
/** 四枚装饰星到圆心的距离（落在中心圈与弧文字之间）。 */
const R_STAR = 72;

/**
 * 尘埃：18 颗，位置 / 尺寸 / 周期 / 延迟全部写死。
 * 用随机数会让每次重渲染都换一批 —— 那看起来不是"浮尘"，是"闪烁"。
 * 颜色只在旧金与暖橘之间取，避免引入第三种色相。
 */
interface Mote {
    left: number;
    top: number;
    size: number;
    dur: number;
    delay: number;
    drift: number;
    color: string;
    peak: number;
}

const MOTES: Mote[] = [
    { left: 6, top: 74, size: 3, dur: 19, delay: 0, drift: 14, color: '#E8C87A', peak: 0.20 },
    { left: 14, top: 88, size: 2, dur: 23, delay: 3.5, drift: -10, color: '#E8845A', peak: 0.14 },
    { left: 22, top: 62, size: 2.5, dur: 16, delay: 7, drift: 18, color: '#E8C87A', peak: 0.17 },
    { left: 29, top: 92, size: 2, dur: 21, delay: 11, drift: -14, color: '#E8C87A', peak: 0.12 },
    { left: 35, top: 70, size: 3.5, dur: 24, delay: 5, drift: 8, color: '#E8845A', peak: 0.16 },
    { left: 41, top: 84, size: 2, dur: 15, delay: 13.5, drift: -16, color: '#E8C87A', peak: 0.19 },
    { left: 48, top: 66, size: 2.5, dur: 20, delay: 2, drift: 12, color: '#E8C87A', peak: 0.13 },
    { left: 54, top: 90, size: 3, dur: 17, delay: 9, drift: -8, color: '#E8845A', peak: 0.18 },
    { left: 60, top: 72, size: 2, dur: 22, delay: 15, drift: 16, color: '#E8C87A', peak: 0.15 },
    { left: 66, top: 86, size: 2.5, dur: 18, delay: 6.5, drift: -12, color: '#E8C87A', peak: 0.20 },
    { left: 72, top: 64, size: 3, dur: 14, delay: 12, drift: 10, color: '#E8845A', peak: 0.14 },
    { left: 78, top: 92, size: 2, dur: 23, delay: 1.5, drift: -18, color: '#E8C87A', peak: 0.17 },
    { left: 84, top: 76, size: 3.5, dur: 19, delay: 8, drift: 14, color: '#E8C87A', peak: 0.13 },
    { left: 91, top: 88, size: 2, dur: 16, delay: 14.5, drift: -10, color: '#E8845A', peak: 0.16 },
    { left: 11, top: 52, size: 2, dur: 21, delay: 10, drift: 12, color: '#E8C87A', peak: 0.11 },
    { left: 45, top: 56, size: 2, dur: 18, delay: 17, drift: -12, color: '#E8845A', peak: 0.12 },
    { left: 69, top: 50, size: 2.5, dur: 24, delay: 4, drift: 8, color: '#E8C87A', peak: 0.14 },
    { left: 88, top: 58, size: 2, dur: 20, delay: 16, drift: -14, color: '#E8C87A', peak: 0.11 },
];

/**
 * 压印邮戳：外环 + 刻度环 + 内环 + 上下弧形文字 + 中心圈（手写「拾光」+ 日期）+ 四枚星。
 *
 * 层层加码是刻意的：真邮戳的"繁琐"来自工艺 —— 压环、打刻度、排字、再在中心压一个圈。
 * 少掉任何一层都还叫"圆环"，凑齐了才叫"印章"。
 */
const StampGlyph: React.FC = () => {
    // 盖戳日期。放在这里算一次即可（组件是 React.memo 的静态层，不会因为父组件更新而重算）。
    const now = new Date();
    const stampDate = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

    return (
        <svg
            className="shelf-bg-stamp"
            viewBox={`0 0 ${STAMP} ${STAMP}`}
            width={STAMP}
            height={STAMP}
            fill="none"
            aria-hidden
            focusable="false"
        >
            <defs>
                {/* 上半弧（从左经顶到右）：文字正向。 */}
                <path
                    id="shelf-bg-stamp-arc-top"
                    d={`M ${CX - R_ARC},${CY} A ${R_ARC},${R_ARC} 0 0 1 ${CX + R_ARC},${CY}`}
                />
                {/* 下半弧反过来画（sweep=0 → 走底部）：这样文字沿路径从左到右排，也是正的。
                    如果复用上半弧那条 path，下半圈的字会整个倒过来。 */}
                <path
                    id="shelf-bg-stamp-arc-bottom"
                    d={`M ${CX - R_ARC},${CY} A ${R_ARC},${R_ARC} 0 0 0 ${CX + R_ARC},${CY}`}
                />
            </defs>

            <circle cx={CX} cy={CY} r={R_OUTER} stroke="currentColor" strokeWidth={1.4} />
            <circle cx={CX} cy={CY} r={R_INNER} stroke="currentColor" strokeWidth={0.7} />
            <circle cx={CX} cy={CY} r={R_CORE} stroke="currentColor" strokeWidth={0.9} />

            {/* 刻度环：真邮戳用这圈短线压住外环，也是「繁琐感」的主要来源 */}
            {Array.from({ length: TICKS }).map((_, i) => {
                const angle = ((360 / TICKS) * i * Math.PI) / 180;
                const long = i % 4 === 0;
                const rIn = long ? R_TICK_IN_LONG : R_TICK_IN;
                return (
                    <line
                        key={i}
                        x1={CX + Math.cos(angle) * R_TICK_OUT}
                        y1={CY + Math.sin(angle) * R_TICK_OUT}
                        x2={CX + Math.cos(angle) * rIn}
                        y2={CY + Math.sin(angle) * rIn}
                        stroke="currentColor"
                        strokeWidth={long ? 1 : 0.6}
                    />
                );
            })}

            <text className="shelf-bg-stamp-arc" fill="currentColor">
                <textPath href="#shelf-bg-stamp-arc-top" startOffset="50%" textAnchor="middle">
                    COLLECTED MOMENTS
                </textPath>
            </text>
            <text className="shelf-bg-stamp-arc" fill="currentColor">
                <textPath href="#shelf-bg-stamp-arc-bottom" startOffset="50%" textAnchor="middle">
                    EST. 2026 · SULLYOS
                </textPath>
            </text>

            {/* 四枚星：上下左右各一，把中心圈"架"起来 */}
            {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => (
                <text
                    key={`${dx},${dy}`}
                    className="shelf-bg-stamp-star"
                    x={CX + dx * R_STAR}
                    y={CY + dy * R_STAR}
                    fill="currentColor"
                    textAnchor="middle"
                    dominantBaseline="central"
                >
                    ✦
                </text>
            ))}

            <text
                className="shelf-bg-stamp-core"
                x={CX}
                y={CY - 6}
                fill="currentColor"
                textAnchor="middle"
                dominantBaseline="central"
            >
                拾光
            </text>
            <text
                className="shelf-bg-stamp-date"
                x={CX}
                y={CY + 26}
                fill="currentColor"
                textAnchor="middle"
                dominantBaseline="central"
            >
                {stampDate}
            </text>
        </svg>
    );
};

const ShelfBackdrop: React.FC = () => (
    <div className="shelf-bg" aria-hidden>
        <div className="shelf-bg-grid" />
        {/* 旧票虚影：压在卡片后面，让"这一张"变成"一叠里的最上面那张" */}
        <div className="shelf-bg-ghost shelf-bg-ghost--a" />
        <div className="shelf-bg-ghost shelf-bg-ghost--b" />
        <div className="shelf-bg-glow" />
        <StampGlyph />

        <div className="shelf-bg-dust">
            {MOTES.map((m, i) => (
                <span
                    key={i}
                    className="shelf-bg-mote"
                    style={{
                        left: `${m.left}%`,
                        top: `${m.top}%`,
                        width: m.size,
                        height: m.size,
                        background: m.color,
                        animationDuration: `${m.dur}s`,
                        animationDelay: `${m.delay}s`,
                        ['--drift' as string]: `${m.drift}px`,
                        ['--peak' as string]: m.peak,
                    } as React.CSSProperties}
                />
            ))}
        </div>
    </div>
);

/**
 * 零 props 的纯静态层 —— memo 之后它只在挂载时渲染一次。
 * 否则每次图片池 / 一句话回来触发父组件重渲染时，这 18 颗微尘 + 一枚邮戳都会被重建一遍，
 * 纯属白做（而且动画元素被重建会看到跳动）。
 */
export default React.memo(ShelfBackdrop);
