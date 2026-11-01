import React, { useCallback, useEffect, useState } from 'react';
import { FilmScript } from '@phosphor-icons/react';
import { clampBubblePos } from '../../utils/floatingBallBounds';

/**
 * 线下模式 · 输入模式悬浮球（对话 / 旁白）。
 *
 * 位置不再自由拖动，而是吸附在底栏容器的「右上角外侧」：
 * 球贴着底栏上边缘、靠右对齐，但不进入底栏内部、不压住发送键。
 * 底栏高度会变（动作面板展开、输入框增高、软键盘弹起），所以位置是算出来的：
 * 读锚点容器的 getBoundingClientRect，再用 ResizeObserver 跟着走。
 *
 * 层级：底栏和动作面板都是 z-40，球用 z-45 压在上面；
 * 生图面板（z-89/90）、模态框（z-110 起）仍然盖得住球。
 */

const SIZE = 44;
const RIGHT_MARGIN = 12;
const GAP = 8;

type Mode = 'dialogue' | 'narration';
type Position = { x: number; y: number };

interface Props {
    mode: Mode;
    onToggle: () => void;
    /** 底栏容器（relative z-40 那一层）：球吸附在它的右上角外侧 */
    anchorRef: React.RefObject<HTMLElement | null>;
}

/** 安全区：顶部躲刘海，底部躲 home 手势条（变量没初始化时按 0 处理） */
const readInsets = () => {
    const style = getComputedStyle(document.documentElement);
    return {
        insetTop: parseFloat(style.getPropertyValue('--standalone-safe-area-top')) || 0,
        insetBottom: parseFloat(style.getPropertyValue('--standalone-safe-area-bottom')) || 0,
    };
};

export default function OfflineInputBall({ mode, onToggle, anchorRef }: Props) {
    const [position, setPosition] = useState<Position | null>(null);

    const place = useCallback(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        // 贴着底栏上边缘、靠右；再夹一次，防止横屏或视口异常时跑到屏幕外
        const next = clampBubblePos(
            window.innerWidth - SIZE - RIGHT_MARGIN,
            rect.top - SIZE - GAP,
            {
                parentW: window.innerWidth,
                parentH: window.innerHeight,
                bubble: SIZE,
                ...readInsets(),
            },
        );
        setPosition(next);
    }, [anchorRef]);

    useEffect(() => {
        place();
        // 面板展开是 max-height 动画、输入框会随内容增高，所以跟锚点尺寸绑定
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place()) : null;
        const anchor = anchorRef.current;
        if (anchor) observer?.observe(anchor);
        if (anchor?.parentElement) observer?.observe(anchor.parentElement);
        const raf = requestAnimationFrame(place);
        window.addEventListener('resize', place);
        window.addEventListener('orientationchange', place);
        window.visualViewport?.addEventListener('resize', place);
        return () => {
            observer?.disconnect();
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', place);
            window.removeEventListener('orientationchange', place);
            window.visualViewport?.removeEventListener('resize', place);
        };
    }, [anchorRef, place]);

    const isNarration = mode === 'narration';

    return (
        <button
            type="button"
            aria-label={`线下输入模式：${isNarration ? '旁白' : '对话'}，点击切换`}
            title={`${isNarration ? '旁白输入' : '对话输入'}（点击切换）`}
            onClick={onToggle}
            className={`fixed z-[45] rounded-full flex items-center justify-center shadow-lg select-none transition-colors ${isNarration ? 'bg-sky-500 text-white ring-2 ring-sky-200' : 'bg-white/95 text-slate-500 ring-1 ring-slate-200'}`}
            style={{
                left: position?.x ?? undefined,
                top: position?.y ?? undefined,
                right: position ? undefined : RIGHT_MARGIN,
                bottom: position ? undefined : 132,
                width: SIZE,
                height: SIZE,
                // 首次测量前先不显示，避免在默认位置闪一下再跳过去
                opacity: position ? 1 : 0,
                transition: 'background-color 160ms ease, color 160ms ease, left 180ms ease-out, top 180ms ease-out, opacity 120ms ease',
                touchAction: 'manipulation',
            }}
        >
            <FilmScript className="w-5 h-5" weight={isNarration ? 'fill' : 'regular'} />
        </button>
    );
}
