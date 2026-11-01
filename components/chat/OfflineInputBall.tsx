import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FilmScript } from '@phosphor-icons/react';
import { clampBubblePos } from '../../utils/floatingBallBounds';

/**
 * 线下模式 · 输入模式悬浮球（对话 / 旁白）。
 *
 * 从底栏那个小圆按钮搬出来：底栏位置被发送键和表情键夹着，手指容易点错，
 * 所以做成可拖动的悬浮球——点一下切模式，按住可以拖到顺手的位置，位置记在 localStorage。
 *
 * 拖动与「点击」的区分沿用快捷导航悬浮球（NavigationBall）的做法：
 * 位移超过 4px 才算拖动，拖动结束这一次不触发切换，避免手一抖就换了模式。
 */

const SIZE = 44;
const DRAG_THRESHOLD = 4;
const POSITION_KEY = 'os_offline_input_ball_pos';

type Mode = 'dialogue' | 'narration';
type Position = { x: number; y: number };

interface Props {
    mode: Mode;
    onToggle: () => void;
}

const readPosition = (): Position | null => {
    try {
        const value = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
        if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) return value;
    } catch { /* 用默认位置 */ }
    return null;
};

/** 安全区：顶部躲刘海，底部躲 home 手势条（变量没初始化时按 0 处理） */
const readInsets = () => {
    const style = getComputedStyle(document.documentElement);
    return {
        insetTop: parseFloat(style.getPropertyValue('--standalone-safe-area-top')) || 0,
        insetBottom: parseFloat(style.getPropertyValue('--standalone-safe-area-bottom')) || 0,
    };
};

const currentBounds = () => ({
    parentW: window.innerWidth,
    parentH: window.innerHeight,
    bubble: SIZE,
    ...readInsets(),
});

/** 默认停在右下角、输入框上方一点，不压住发送键 */
const defaultPosition = (): Position => ({
    x: window.innerWidth - SIZE - 12,
    y: Math.max(72, window.innerHeight - SIZE - 132),
});

export default function OfflineInputBall({ mode, onToggle }: Props) {
    const [position, setPosition] = useState<Position | null>(readPosition);
    const latest = useRef(position);
    latest.current = position;
    const suppressClick = useRef(false);
    const drag = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        origin: Position;
        bounds: ReturnType<typeof currentBounds>;
        moved: boolean;
    } | null>(null);

    // 首次进入 / 窗口尺寸变化：把球夹回可见范围（横竖屏切换后不至于丢在屏幕外）
    useLayoutEffect(() => {
        const constrain = () => {
            const bounds = currentBounds();
            const next = clampBubblePos(
                (latest.current || defaultPosition()).x,
                (latest.current || defaultPosition()).y,
                bounds,
            );
            latest.current = next;
            setPosition(next);
        };
        constrain();
        window.addEventListener('resize', constrain);
        window.addEventListener('orientationchange', constrain);
        return () => {
            window.removeEventListener('resize', constrain);
            window.removeEventListener('orientationchange', constrain);
        };
    }, []);

    // 输入框弹起（软键盘）时也要重新夹一次，避免被键盘盖住
    useEffect(() => {
        const onViewport = () => {
            if (!latest.current) return;
            const next = clampBubblePos(latest.current.x, latest.current.y, currentBounds());
            latest.current = next;
            setPosition(next);
        };
        window.visualViewport?.addEventListener('resize', onViewport);
        return () => window.visualViewport?.removeEventListener('resize', onViewport);
    }, []);

    const isNarration = mode === 'narration';

    return (
        <button
            type="button"
            aria-label={`线下输入模式：${isNarration ? '旁白' : '对话'}，点击切换，可拖动`}
            title={`${isNarration ? '旁白输入' : '对话输入'}（点击切换，可拖动）`}
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                const origin = latest.current || defaultPosition();
                suppressClick.current = false;
                drag.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    origin,
                    bounds: currentBounds(),
                    moved: false,
                };
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 保留常规点击 */ }
            }}
            onPointerMove={(event) => {
                const state = drag.current;
                if (!state || state.pointerId !== event.pointerId) return;
                const dx = event.clientX - state.startX;
                const dy = event.clientY - state.startY;
                if (!state.moved && Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
                state.moved = true;
                const next = clampBubblePos(state.origin.x + dx, state.origin.y + dy, state.bounds);
                latest.current = next;
                setPosition(next);
            }}
            onPointerUp={(event) => {
                const state = drag.current;
                if (!state || state.pointerId !== event.pointerId) return;
                suppressClick.current = state.moved;
                if (state.moved && latest.current) {
                    try { localStorage.setItem(POSITION_KEY, JSON.stringify(latest.current)); } catch { /* 位置不持久也不影响使用 */ }
                }
                drag.current = null;
                try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* 已释放 */ }
            }}
            onPointerCancel={() => { suppressClick.current = true; drag.current = null; }}
            onClick={(event) => {
                // 拖动结束时浏览器还会补一次 click，这里吞掉，别顺手把模式切了
                if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
                onToggle();
            }}
            className={`fixed z-30 rounded-full flex items-center justify-center shadow-lg select-none transition-colors ${isNarration ? 'bg-sky-500 text-white ring-2 ring-sky-200' : 'bg-white/95 text-slate-500 ring-1 ring-slate-200'}`}
            style={{
                left: position?.x ?? undefined,
                top: position?.y ?? undefined,
                right: position ? undefined : 12,
                bottom: position ? undefined : 132,
                width: SIZE,
                height: SIZE,
                touchAction: 'none',
            }}
        >
            <FilmScript className="w-5 h-5" weight={isNarration ? 'fill' : 'regular'} />
        </button>
    );
}
