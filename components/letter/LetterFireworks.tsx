/**
 * 来信 · 节庆动态烟花（纯 CSS，无图片 / 无视频 / 无第三方库）。
 *
 * 结构：若干「烟花簇」错峰循环，每簇 = 一枚上升光点 + 一圈放射粒子。
 * 动画只用 transform 与 opacity（走合成层，不触发布局）。
 *
 * **尺寸是这一版改动的重点**：原来 4 簇、粒子 2.5px、炸开半径 40~52px，
 * 在手机屏上几乎只是几个抖动的小点，看不出是烟花。现在 7 簇、半径 90~150px
 * 按 scale 分档、粒子 3.5~5px 带静态辉光，才有「炸开」的体量感。
 * 半径必须分档：等半径的一圈粒子看着像齿轮，不像烟花。
 *
 * 无障碍与性能：
 *   - 整体 aria-hidden + pointer-events-none，不遮挡、不参与交互；
 *   - prefers-reduced-motion: reduce 时**不跑动画**，降级为一枚枚静态光点；
 *   - 粒子总数控制在 ~110 个 span 以内；辉光是静态 box-shadow，不参与动画
 *     （动画里的 box-shadow 会在每帧重绘，是这类效果最常见的掉帧来源）。
 *
 * 只在 festivity 主题（新年）里挂载；其他节日根本不渲染这个组件。
 */

import React, { useMemo } from 'react';

interface Burst {
    id: number;
    left: string;
    top: string;
    delay: string;
    duration: string;
    color: string;
    petals: number;
    /** 簇的体量：同时影响粒径与炸开半径（大簇更远、更亮、更大）。 */
    scale: number;
}

const KEYFRAMES = `
@keyframes letter-fw-core {
  0%   { transform: translate3d(0, 52px, 0) scale(0.4); opacity: 0; }
  10%  { opacity: 1; }
  48%  { transform: translate3d(0, 0, 0) scale(1.15); opacity: 1; }
  54%  { transform: translate3d(0, 0, 0) scale(0.5);  opacity: 0; }
  100% { transform: translate3d(0, 0, 0) scale(0.5);  opacity: 0; }
}
@keyframes letter-fw-petal {
  0%, 48% { transform: rotate(var(--angle)) translateY(0) scale(0.3); opacity: 0; }
  56%     { opacity: 1; }
  100%    { transform: rotate(var(--angle)) translateY(calc(-1 * var(--reach))) scale(1); opacity: 0; }
}
.letter-fw-core {
  position: absolute; left: -2px; top: -2px;
  width: 4px; height: 4px; border-radius: 9999px;
  will-change: transform, opacity;
}
.letter-fw-petal {
  position: absolute;
  border-radius: 9999px;
  will-change: transform, opacity;
}
@media (prefers-reduced-motion: reduce) {
  .letter-fw-petal { display: none !important; }
  .letter-fw-core { animation: none !important; opacity: 0.6; transform: translate3d(0, 0, 0); }
}
`;

const LetterFireworks: React.FC<{ className?: string }> = ({ className }) => {
    const bursts = useMemo<Burst[]>(() => ([
        { id: 0, left: '14%', top: '26%', delay: '0s', duration: '4.2s', color: '#F2D9A0', petals: 16, scale: 1.15 },
        { id: 1, left: '76%', top: '18%', delay: '1.1s', duration: '4.8s', color: '#F0A93B', petals: 18, scale: 1 },
        { id: 2, left: '46%', top: '34%', delay: '2.3s', duration: '4.4s', color: '#FFF3D6', petals: 14, scale: 0.8 },
        { id: 3, left: '88%', top: '42%', delay: '3.2s', duration: '5.0s', color: '#E8845A', petals: 16, scale: 0.9 },
        { id: 4, left: '8%', top: '48%', delay: '4.1s', duration: '4.6s', color: '#F2D9A0', petals: 12, scale: 0.7 },
        { id: 5, left: '62%', top: '8%', delay: '5.0s', duration: '5.2s', color: '#FFE9B8', petals: 20, scale: 1.25 },
        { id: 6, left: '32%', top: '12%', delay: '5.9s', duration: '4.7s', color: '#F0A93B', petals: 14, scale: 0.85 },
    ]), []);

    return (
        <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className || ''}`} aria-hidden>
            <style>{KEYFRAMES}</style>
            {bursts.map(b => (
                <div key={b.id} className="absolute" style={{ left: b.left, top: b.top }}>
                    {/* 上升光点：从下方升起，到点炸开 */}
                    <span
                        className="letter-fw-core"
                        style={{
                            background: b.color,
                            boxShadow: `0 0 10px 2px ${b.color}99`,
                            animation: `letter-fw-core ${b.duration} ${b.delay} linear infinite`,
                        }}
                    />
                    {/* 放射粒子：一圈角度均分，但半径分三档 —— 等半径看着像齿轮 */}
                    {Array.from({ length: b.petals }).map((_, i) => {
                        const dot = (3.5 + (i % 3) * 0.75) * b.scale;   // 3.5 / 4.25 / 5 px
                        const reach = (90 + (i % 3) * 30) * b.scale;     // 90 / 120 / 150 px
                        return (
                            <span
                                key={i}
                                className="letter-fw-petal"
                                style={{
                                    width: `${dot.toFixed(2)}px`,
                                    height: `${dot.toFixed(2)}px`,
                                    left: `${(-dot / 2).toFixed(2)}px`,
                                    top: `${(-dot / 2).toFixed(2)}px`,
                                    background: b.color,
                                    boxShadow: `0 0 7px 1px ${b.color}88`,
                                    ['--angle' as string]: `${(360 / b.petals) * i}deg`,
                                    ['--reach' as string]: `${reach.toFixed(0)}px`,
                                    animation: `letter-fw-petal ${b.duration} ${b.delay} cubic-bezier(0.2, 0.7, 0.3, 1) infinite`,
                                } as React.CSSProperties}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export default LetterFireworks;
