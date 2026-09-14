/**
 * 新年信笺 · 装饰图形（纯内联 SVG，不新增任何图片资源）。
 *
 * 中式信笺的装饰语汇是**线描**而不是色块：细金线勾出烟花与四角回纹角花，
 * 留白交给红底，靠线条的疏密建立层次 —— 一旦改成色块，气质就从「年节纸质信笺」
 * 掉成「喜庆包装」，那是两种东西。
 *
 * 全部装饰 aria-hidden + pointer-events-none：它们只负责气氛，不参与交互，
 * 也不该被读屏软件念出来。颜色一律由 props 注入（跟随主题的 innerBorder），
 * 这样信笺换配色时装饰自动跟着走，不需要改组件。
 *
 * 描边一律 vectorEffect="non-scaling-stroke"：同一根线在 54px 的大烟花和 22px 的
 * 小烟花上必须是同样的粗细，否则小烟花会细到看不见、大烟花会粗成色块。
 */

import React from 'react';

/** 确定性伪随机：同一个 index 永远得到同一根射线的长度，避免每次渲染烟花形状都在变。 */
function rayRand(i: number, salt: number): number {
    const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

interface FireworkBurstProps {
    /** 图形边长（px）。 */
    size: number;
    /** 描边色（一般传主题的 innerBorder）。 */
    color: string;
    /** 射线数量：大烟花多几根、小烟花少几根。 */
    rays?: number;
    /** 是否在长射线末端点星点。太小尺寸下星点会糊成脏点，故可关。 */
    showTips?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 线描烟花：一圈长短参差的细射线 + 末端星点 + 中心实心点。
 *
 * 长短参差是这张图能看的关键 —— 等长的射线会立刻变成一个「放射性图标」，
 * 而不是炸开的烟花。所以按 i % 3 分三档长度，再叠一点点角度抖动。
 */
export const FireworkBurst: React.FC<FireworkBurstProps> = ({
    size,
    color,
    rays = 18,
    showTips = size >= 34,
    className,
    style,
}) => {
    const cx = 50;
    const cy = 50;

    const sticks = Array.from({ length: rays }, (_, i) => {
        const angle = (360 / rays) * i + rayRand(i, 1) * 6;
        const rad = (angle * Math.PI) / 180;
        // 三档：中长 / 最长 / 短（短的一档只留一截，模拟内圈炸开）
        const tier = i % 3;
        const inner = tier === 0 ? 12 : tier === 1 ? 14 : 9;
        const outer = tier === 0 ? 36 : tier === 1 ? 44 : 24;
        return {
            x1: cx + Math.cos(rad) * inner,
            y1: cy - Math.sin(rad) * inner,
            x2: cx + Math.cos(rad) * outer,
            y2: cy - Math.sin(rad) * outer,
            tip: tier !== 2,
        };
    });

    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={className}
            style={style}
            aria-hidden
            focusable="false"
        >
            {sticks.map((s, i) => (
                <g key={i}>
                    <line
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        stroke={color}
                        strokeWidth={1.1}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />
                    {showTips && s.tip && <circle cx={s.x2} cy={s.y2} r={2.2} fill={color} />}
                </g>
            ))}
            <circle cx={cx} cy={cy} r={2.8} fill={color} />
        </svg>
    );
};

interface CornerOrnamentProps {
    /** 朝向：角尖在哪一角。四个角复用同一个图形，靠旋转摆位。 */
    corner: 'tl' | 'tr' | 'br' | 'bl';
    color: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 回纹角花：外层直角双线（粗细一深一浅、留出间隙）+ 内侧半圈「回」字。
 *
 * 用回纹而不是圆角，是因为圆角是通用 UI 语汇（任何卡片都有），
 * 回纹是中式函套/信封的语汇 —— 一眼能认出这是哪一类物件。
 */
export const CornerOrnament: React.FC<CornerOrnamentProps> = ({
    corner,
    color,
    size = 20,
    className,
    style,
}) => {
    const rotate = corner === 'tl' ? 0 : corner === 'tr' ? 90 : corner === 'br' ? 180 : 270;

    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={className}
            style={{ ...style, transform: `rotate(${rotate}deg)` }}
            aria-hidden
            focusable="false"
        >
            {/* 外层直角：主线 + 并行的一条淡线，形成「双线」的厚度 */}
            <path
                d="M1 10.5 V1 H10.5"
                fill="none"
                stroke={color}
                strokeWidth={1.1}
                strokeLinecap="square"
                vectorEffect="non-scaling-stroke"
            />
            <path
                d="M1 15.5 V1 H15.5"
                fill="none"
                stroke={color}
                strokeWidth={0.9}
                strokeLinecap="square"
                opacity={0.5}
                vectorEffect="non-scaling-stroke"
            />
            {/* 内侧回纹：两圈同心的「回」字半边 */}
            <path
                d="M4.8 10.5 V4.8 H10.5"
                fill="none"
                stroke={color}
                strokeWidth={1}
                strokeLinecap="square"
                opacity={0.85}
                vectorEffect="non-scaling-stroke"
            />
            <path
                d="M7.6 10.5 V7.6 H10.5"
                fill="none"
                stroke={color}
                strokeWidth={0.9}
                strokeLinecap="square"
                opacity={0.5}
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};
