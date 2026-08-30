/**
 * 反查手机 · 接管弹幕气泡
 *
 * 角色接管用户手机时，对看到的真实内容"有感而发"——内心想法以半透明气泡
 * 飘过（弹幕效果），不打断浏览。自动逐个显示队列，每条停留数秒后淡出。
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface ReverseDanmakuProps {
    /** 接管中是否激活（active 时展示弹幕） */
    active: boolean;
    /** 角色名（气泡前缀用） */
    charName?: string;
}

interface Bubble {
    id: number;
    text: string;
    /** 随机水平位置（10%–70%），营造弹幕错落感 */
    left: number;
    /** 是否偏底部（气泡飘过的区域） */
    bottom: boolean;
}

const ReverseDanmaku: React.FC<ReverseDanmakuProps> = ({ active, charName }) => {
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const idRef = useRef(0);

    /** 对外暴露：推入一条角色想法弹幕 */
    const push = useCallback((text: string) => {
        const id = ++idRef.current;
        const bubble: Bubble = {
            id,
            text,
            left: 12 + Math.random() * 55,
            bottom: Math.random() < 0.5,
        };
        setBubbles(prev => [...prev, bubble]);
        // 每条显示 4.2s 后移除
        setTimeout(() => {
            setBubbles(prev => prev.filter(b => b.id !== id));
        }, 4200);
    }, []);

    // 暴露 push 到全局，供 runner 的 onThought 调用
    useEffect(() => {
        if (!active) return;
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as { text?: string } | undefined;
            if (detail?.text) push(detail.text);
        };
        window.addEventListener('sullyos-reverse-thought', handler);
        return () => window.removeEventListener('sullyos-reverse-thought', handler);
    }, [active, push]);

    if (!active || bubbles.length === 0) return null;

    return (
        <div className="fixed inset-x-0 z-[85] pointer-events-none flex justify-center px-6"
            style={{ top: '66%' }}>
            <style>{`@keyframes reverseDanmaku{0%{opacity:0;transform:translateY(8px) scale(0.96)}10%{opacity:1;transform:translateY(0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}`}</style>
            <div className="relative flex flex-col items-center gap-2 w-full">
                {bubbles.map(b => (
                    <div
                        key={b.id}
                        className="max-w-[80%] px-3.5 py-2 rounded-2xl bg-slate-900/75 backdrop-blur-md border border-white/10 text-white/90 text-[12.5px] leading-relaxed whitespace-nowrap"
                        style={{
                            animation: 'reverseDanmaku 4.2s ease-in-out forwards',
                            boxShadow: '0 4px 18px rgba(15,23,42,0.35)',
                        }}>
                        {charName ? <span className="text-rose-300/80 font-semibold mr-1.5">{charName}</span> : null}
                        {b.text}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ReverseDanmaku;
