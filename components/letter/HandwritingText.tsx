/**
 * 逐字微扰动文本。
 *
 * 中文印刷字体（含手写体字库）每个字都是「正」的：基线齐、方框一样大、字距均匀——
 * 这正是机械感/假感的来源。真手写没有两个字一模一样。
 *
 * 做法：把文本按单字符切开，给每个字单独加极小的随机微变换
 * （rotate ±0.8° / translateY ±0.6px / 字号 ±2%），制造「手写的不齐」。
 *
 * 关键约束：
 *   - seed 必须固定（用 letterId + 字符索引派生），否则每次重渲染字都在抖，会变成鬼畜。
 *   - 「微」是重点：幅度大到看得见就坏了。
 *   - 800 字的信 = 800 个 span，所以整体 memo，且这些 span 上不做任何动画。
 */

import React, { useMemo } from 'react';

/** 确定性伪随机：同一个 seed 永远返回同一个值（不依赖 Math.random）。 */
function seededRand(seed: number): number {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

interface HandwritingTextProps {
    text: string;
    /** 稳定 seed 基（建议用 letter.id）：保证每次渲染扰动一致。 */
    seed?: string;
    className?: string;
    style?: React.CSSProperties;
}

const HandwritingText: React.FC<HandwritingTextProps> = ({ text, seed = '', className, style }) => {
    const baseSeed = useMemo(() => {
        let h = 0;
        for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
        return h;
    }, [seed]);

    const chars = useMemo(() => Array.from(text || ''), [text]);

    return (
        <span className={className} style={{ ...style }}>
            {chars.map((ch, i) => {
                if (ch === '\n') return <br key={i} />;
                const r1 = seededRand(baseSeed + i * 3);
                const r2 = seededRand(baseSeed + i * 7 + 1);
                const r3 = seededRand(baseSeed + i * 11 + 2);
                const rotate = (r1 - 0.5) * 1.6;      // ±0.8deg
                const ty = (r2 - 0.5) * 1.2;          // ±0.6px
                const scale = 1 + (r3 - 0.5) * 0.04;  // ±2%
                return (
                    <span
                        key={i}
                        style={{
                            display: 'inline-block',
                            // 逐字 inline-block 会把字距撑松（字面两侧的留白 + scale 不参与布局），
                            // 用一点点负边距收回来，让整段读起来是连贯的一行手写，而不是「一个字一个字摆」。
                            marginRight: '-0.04em',
                            transform: `rotate(${rotate.toFixed(2)}deg) translateY(${ty.toFixed(2)}px) scale(${scale.toFixed(3)})`,
                        }}
                    >
                        {ch === ' ' ? '\u00A0' : ch}
                    </span>
                );
            })}
        </span>
    );
};

export default React.memo(HandwritingText);
