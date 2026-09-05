/**
 * 角色心声 · 读心面板装饰层
 *
 * 两个零 props 的纯视觉组件，专供 Chat.tsx 读心面板使用：
 * - PetalHalo   外围花瓣叶：白卡四周点缀一片片独立的小花叶（不再是连续 blob 圆环），
 *               沿白卡边缘均匀分布、错相位呼吸，粉彩低饱和。
 * - HeartFloats 卡内杏金爱心粒子：6 颗线形小爱心，自底部上浮淡出，错相位循环、克制。
 *
 * 所有 keyframes 以 .ivp- 前缀私有，不污染全局；尊重 prefers-reduced-motion。
 * 注意：含 transform 的动画元素绝不能放到外层"负责居中"的 div 上（历史 bug），
 * 它们各自独立定位，与居中 transform / 白卡 fade-in 不共享元素。
 */
import React from 'react';

// ── 花瓣叶 ──────────────────────────────────────────────────────────────────
// 一片花叶的 SVG path（尖椭圆 + 一段小 V 凹口，像花瓣/叶子轮廓）
const PETAL_PATH =
    'M16 3 C 22 6, 26 12, 24 19 C 22 24, 18 28, 14 27 C 8 26, 4 21, 3 14 C 2 8, 7 3, 16 3 Z M16 3 L 14 27';

interface PetalSpec { side: 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l'; size: number; delay: number; rot: number }

// 沿白卡四周：左上、上、右上、右、右下、下、左下、左 各 1 片，共 8 片错相位
const PETALS: PetalSpec[] = [
    { side: 'tl', size: 42, delay: 0.0, rot: -28 },
    { side: 't',  size: 36, delay: 1.4, rot:   0 },
    { side: 'tr', size: 44, delay: 0.7, rot:  28 },
    { side: 'r',  size: 38, delay: 2.1, rot:  62 },
    { side: 'br', size: 44, delay: 1.1, rot: 118 },
    { side: 'b',  size: 34, delay: 2.6, rot: 180 },
    { side: 'bl', size: 42, delay: 1.8, rot: -118 },
    { side: 'l',  size: 36, delay: 0.4, rot: -62 },
];

// 把 "side" 翻译成 absolute 定位坐标（白卡四周贴外沿）
const sideToStyle = (side: PetalSpec['side'], size: number, rot: number): React.CSSProperties => {
    const base: React.CSSProperties = {
        position: 'absolute',
        width: size,
        height: size,
        transform: `rotate(${rot}deg)`,
        transformOrigin: '50% 50%',
        pointerEvents: 'none',
    };
    switch (side) {
        case 'tl': return { ...base, top: -size * 0.78,  left: -size * 0.35 };
        case 't':  return { ...base, top: -size * 0.95,  left: '50%', marginLeft: -size / 2 };
        case 'tr': return { ...base, top: -size * 0.78,  right: -size * 0.35 };
        case 'r':  return { ...base, top: '50%', marginTop: -size / 2, right: -size * 0.95 };
        case 'br': return { ...base, bottom: -size * 0.78, right: -size * 0.35 };
        case 'b':  return { ...base, bottom: -size * 0.95, left: '50%', marginLeft: -size / 2 };
        case 'bl': return { ...base, bottom: -size * 0.78, left: -size * 0.35 };
        case 'l':  return { ...base, top: '50%', marginTop: -size / 2, left: -size * 0.95 };
    }
};

export const PetalHalo: React.FC = () => (
    <>
        <style>{`
            .ivp-petal-layer {
                position: absolute;
                inset: -28px;
                z-index: 0;
                pointer-events: none;
            }
            .ivp-petal {
                color: #D89AA4;
                opacity: 0.85;
                animation: ivp-petal-breathe 4.2s ease-in-out infinite;
                animation-delay: var(--delay, 0s);
                filter: drop-shadow(0 4px 6px rgba(186,118,128,0.16));
                will-change: transform, opacity;
            }
            .ivp-petal svg {
                width: 100%;
                height: 100%;
                display: block;
            }
            @keyframes ivp-petal-breathe {
                0%, 100% { opacity: 0.78; }
                50%      { opacity: 1; }
            }
            /* 错相位：在每片静态 rotate 之上叠加一段 translate 漂移（轻微上下） */
            .ivp-petal-inner {
                animation: ivp-petal-drift var(--drift, 5.4s) ease-in-out infinite;
                animation-delay: calc(var(--delay, 0s) + 0.6s);
                width: 100%;
                height: 100%;
            }
            @keyframes ivp-petal-drift {
                0%, 100% { translate: 0 0; }
                50%      { translate: 0 -2px; }
            }
            @media (prefers-reduced-motion: reduce) {
                .ivp-petal, .ivp-petal-inner { animation: none; opacity: 0.85; }
            }
        `}</style>
        <div className="ivp-petal-layer" aria-hidden>
            {PETALS.map((p, i) => (
                <div
                    key={i}
                    className="ivp-petal"
                    style={{ ...sideToStyle(p.side, p.size, p.rot), ['--delay' as string]: `${p.delay}s` }}
                >
                    <div className="ivp-petal-inner">
                        <svg viewBox="0 0 30 30" fill="rgba(243,222,222,0.9)" stroke="rgba(216,154,164,0.55)" strokeWidth="1" strokeLinejoin="round">
                            <path d={PETAL_PATH} />
                        </svg>
                    </div>
                </div>
            ))}
        </div>
    </>
);

// ── 杏金线形爱心粒子（更明显） ─────────────────────────────────────────────
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