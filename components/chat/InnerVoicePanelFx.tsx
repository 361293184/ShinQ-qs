/**
 * 角色心声 · 读心面板装饰层
 *
 * 零 props 的纯视觉组件，专供 Chat.tsx 读心面板使用：
 * - HeartFloats 卡内杏金爱心粒子：6 颗线形小爱心，自底部上浮淡出，错相位循环、克制。
 *
 * 所有 keyframes 以 .ivp- 前缀私有，不污染全局；尊重 prefers-reduced-motion。
 * 注意：含 transform 的动画元素绝不能放到外层"负责居中"的 div 上（历史 bug），
 * 它们各自独立定位，与居中 transform / 白卡 fade-in 不共享元素。
 */
import React from 'react';

// ── 杏金线形爱心粒子 ──────────────────────────────────────────────────────────
interface HeartSpec {
    left: string;
    size: number;
    delay: number;
    duration: number;
    drift: number;
    peak: number;
}

const HEARTS: HeartSpec[] = [
    { left: '16%', size: 20, delay: 0.2, duration: 6.6, drift: 6,  peak: 0.7 },
    { left: '32%', size: 16, delay: 1.6, duration: 7.2, drift: -7, peak: 0.6 },
    { left: '48%', size: 22, delay: 0.8, duration: 7.0, drift: 4,  peak: 0.78 },
    { left: '66%', size: 18, delay: 2.4, duration: 7.5, drift: -5, peak: 0.68 },
    { left: '78%', size: 17, delay: 1.1, duration: 6.8, drift: 7,  peak: 0.66 },
    { left: '58%', size: 19, delay: 3.0, duration: 7.3, drift: -4, peak: 0.72 },
];

const HEART_PATH =
    'M12 21s-8-5.3-8-11.5C4 6 6.5 3.5 9.5 3.5c1.6 0 3 .8 2.5 2.2C11.5 4.3 12.9 3.5 14.5 3.5 17.5 3.5 20 6 20 9.5 20 15.7 12 21 12 21z';

export const HeartFloats: React.FC = () => (
    <>
        <style>{`
            .ivp-heart-layer {
                position: absolute;
                inset: 0;
                /* 画在文字之下、白底之上：白卡自身是 stacking context（relative z-10），
                   层内 -1 即落在背景与内容之间，爱心最含蓄、不压文字 */
                z-index: -1;
                overflow: hidden;
                pointer-events: none;
            }
            .ivp-heart {
                position: absolute;
                bottom: -14px;
                display: block;
                opacity: 0;
                color: #C68F4D;
                animation: ivp-heart-rise var(--dur, 6.5s) linear var(--delay, 0s) infinite;
                will-change: transform, opacity;
                filter: drop-shadow(0 1px 2px rgba(160,108,52,0.18));
            }
            @keyframes ivp-heart-rise {
                0%   { transform: translate(0, 12px) scale(0.55); opacity: 0; }
                12%  { opacity: var(--peak, 0.7); }
                55%  { transform: translate(var(--drift, 6px), -78px) scale(0.95); opacity: calc(var(--peak, 0.7) * 0.78); }
                80%  { opacity: calc(var(--peak, 0.7) * 0.42); }
                100% { transform: translate(0, -200px) scale(1.02); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
                .ivp-heart { animation: none; display: none; }
            }
        `}</style>
        <div className="ivp-heart-layer" aria-hidden>
            {HEARTS.map((h, i) => (
                <svg
                    key={i}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ivp-heart"
                    style={{
                        left: h.left,
                        width: h.size,
                        height: h.size,
                        ['--dur' as string]: `${h.duration}s`,
                        ['--delay' as string]: `${h.delay}s`,
                        ['--drift' as string]: `${h.drift}px`,
                        ['--peak' as string]: h.peak,
                    }}
                >
                    <path d={HEART_PATH} />
                </svg>
            ))}
        </div>
    </>
);