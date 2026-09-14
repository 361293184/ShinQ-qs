/**
 * 信笺右侧的**常驻**金色长条滚动指示条。
 *
 * 为什么自绘，而不是给容器写 ::-webkit-scrollbar：
 *   1. iOS Safari 上对 ::-webkit-scrollbar 的定制基本无效（只有滚动时才浮出的系统条），
 *      而这里要的是「常驻可见」；
 *   2. 系统滚动条跟随系统主题变白/变灰，压不住深红金线这套配色 —— 一条白杠会直接毁掉信笺。
 *
 * 为什么全程不 setState（这条最重要）：
 *   正文在非新年主题下是逐字 <span>（一封长信能有几百个）。滚动是每秒几十次的高频事件，
 *   一次 setState 就会让整段正文重新渲染 —— 手机会明显掉帧。所以这里的路径是：
 *   scroll（passive）→ rAF 节流 → **直接写滑块的 style**。React 只在挂载时渲染一次。
 */

import React, { useEffect, useRef } from 'react';

interface LetterScrollBarProps {
    /** 被监听的滚动容器。 */
    targetRef: React.RefObject<HTMLElement | null>;
    /** 长条颜色（通常传主题金）。 */
    color: string;
}

const LetterScrollBar: React.FC<LetterScrollBarProps> = ({ targetRef, color }) => {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = targetRef.current;
        const bar = barRef.current;
        if (!el || !bar) return;

        let frame = 0;

        const sync = () => {
            frame = 0;

            // 布局读取集中在一处拿完：scrollHeight / clientHeight 都会触发 reflow，
            // 反复读同一个值等于把这次 reflow 的成本乘上好几倍。
            const viewH = el.clientHeight;
            const totalH = el.scrollHeight;
            const scrollable = totalH - viewH;

            // 内容没有超出可视高度：整条隐藏。短信用一条多余的滚动条比没有更糟。
            if (scrollable <= 2) {
                bar.style.opacity = '0';
                return;
            }

            // 滑块高度按「可视 / 总高」等比，但给一个下限 —— 太短会变成一个小点，抓不住。
            const thumb = Math.max(30, Math.round(viewH * (viewH / totalH)));
            const offset = (el.scrollTop / scrollable) * (viewH - thumb);

            // 三处样式一次写完（同一个 cssText）：省掉两次样式重算，也少三次对象属性写入。
            // transform 而不是 top —— top 会触发布局，transform 走合成层。
            bar.style.cssText = `background:${color};height:${thumb}px;transform:translate3d(0,${offset}px,0);opacity:0.85;`;
        };

        const onScroll = () => {
            if (frame) return;                       // 同一帧内的多次 scroll 只算一次
            frame = window.requestAnimationFrame(sync);
        };

        sync();
        el.addEventListener('scroll', onScroll, { passive: true });

        // 内容或容器尺寸变化（夹图加载完、字体替换、弹窗 resize）也要重算一次，
        // 否则滑块高度会停在旧比例上。
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
        observer?.observe(el);

        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            el.removeEventListener('scroll', onScroll);
            observer?.disconnect();
        };
    }, [targetRef]);

    return (
        <div
            ref={barRef}
            aria-hidden
            className="letter-st-scrollbar"
            style={{ background: color, opacity: 0 }}
        />
    );
};

export default LetterScrollBar;
