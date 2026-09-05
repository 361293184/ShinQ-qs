/**
 * 角色心声 · 读心面板装饰层
 *
 * 两个零 props 的纯视觉组件，专供 Chat.tsx 读心面板使用：
 * - PetalHalo   外围花瓣光环：白卡保持近圆角矩形可读，外围露出不规则花瓣形淡粉光环（blob 圆角 + 缓慢呼吸）。
 * - HeartFloats 卡内杏金爱心粒子：5-7 颗半透明线形小爱心自底部上浮淡出，循环但低饱和、不扰人。
 *
 * 所有 keyframes 均以 .ivp- 前缀私有，不污染全局；尊重 prefers-reduced-motion。
 * 注意：这两个元素若含 transform 动画，绝不能加到外层"负责居中"的 div 上（历史 bug），
 * 它们各自是独立定位元素，与居中 transform / 白卡 fade-in 不共享元素。
 */
import React from 'react';

// ── 花瓣光环 ───────────────────────────────────────────────────────────────
export const PetalHalo: React.FC = () => (
    <>
        <style>{`
            .ivp-halo {
                position: absolute;
                inset: -13px;
                z-index: 0;
                pointer-events: none;
                border-radius: 46% 54% 48% 52% / 52% 46% 54% 48%;
                background:
                    radial-gradient(120% 120% at 22% 18%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 46%),
                    linear-gradient(150deg, #F8ECEC 0%, #F3DEDE 48%, #EFD6D7 100%);
                box-shadow:
                    0 10px 32px -10px rgba(183,121,130,0.22),
                    inset 0 0 0 1px rgba(198,146,154,0.22);
                animation: ivp-halo-breathe 3.6s ease-in-out infinite;
            }
            @keyframes ivp-halo-breathe {
                0%, 100% { transform: scale(1); opacity: 0.92; }
                50%      { transform: scale(1.022); opacity: 1; }
            }
            @media (prefers-reduced-motion: reduce) {
                .ivp-halo { animation: none; opacity: 0.9; }
            }
        `}</style>
        <div className="ivp-halo" aria-hidden />
    </>
);

// ── 杏金线形爱心粒子 ───────────────────────────────────────────────────────
interface HeartSpec {
    left: string;
    size: number;
    delay: number;
    duration: number;
    drift: number;   // 轻微横向漂移（px）
    peak: number;    // 峰值透明度 0..1
}

// 静态数组：固定分布，避免每次 render 随机导致抖动。5-7 颗、低饱和、错峰。
const HEARTS: HeartSpec[] = [
    { left: '14%',  size: 13, delay: 0.3, duration: 6.4, drift: 6,  peak: 0.5 },
    { left: '30%',  size: 10, delay: 1.8, duration: 7.1, drift: -8, peak: 0.42 },
    { left: '47%',  size: 15, delay: 0.9, duration: 6.9, drift: 4,  peak: 0.55 },
    { left: '63%',  size: 11, delay: 2.6, duration: 7.6, drift: -5, peak: 0.46 },
    { left: '76%',  size: 13, delay: 1.2, duration: 6.6, drift: 7,  peak: 0.5 },
    { left: '88%',  size: 9,  delay: 3.2, duration: 7.9, drift: -4, peak: 0.4 },
    { left: '55%',  size: 10, delay: 4.0, duration: 6.2, drift: 6,  peak: 0.45 },
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
                bottom: -12px;
                display: block;
                opacity: 0;
                color: #C8935B;
                animation: ivp-heart-rise var(--dur, 6.5s) linear var(--delay, 0s) infinite;
                will-change: transform, opacity;
            }
            @keyframes ivp-heart-rise {
                0%   { transform: translate(0, 10px) scale(0.55); opacity: 0; }
                12%  { opacity: var(--peak, 0.5); }
                55%  { transform: translate(var(--drift, 6px), -70px) scale(0.92); opacity: calc(var(--peak, 0.5) * 0.72); }
                78%  { opacity: calc(var(--peak, 0.5) * 0.38); }
                100% { transform: translate(0, -185px) scale(0.98); opacity: 0; }
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
                    strokeWidth={1.3}
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
