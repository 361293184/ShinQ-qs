import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DeviceMobile } from '@phosphor-icons/react';
import { clampBubblePos } from '../../utils/floatingBallBounds';
import type { PhoneHolder } from '../../utils/offlineMode/phoneHolder';

/**
 * 线下模式 · 手机道具悬浮球（可拖动、圆形）。
 *
 * 一个球三件事：状态指示 + 入口 + 位置自由。
 * 悬浮球显示的就是「用户此刻手上那台手机」：
 *   me   = 自己的手机（默认）→ 正常手机图标
 *   none = 空（自己的手机在角色手里）→ 虚线 + 半透明 + 「空」角标，点了打不开
 *   char = 角色的手机 → 深色机身样式，与自己的明确区分
 *
 * 拖动手感：
 *  - 用 transform 位移（走合成层），不再改 left/top；
 *  - 位置状态用 rAF 合并，一次拖动不会每像素触发一次 React 渲染；
 *  - 拖动过程中不加任何 transition（加了会有"被拽着走"的黏滞感，这就是之前发堵的原因）。
 */

const SIZE = 46;
const DRAG_THRESHOLD = 4;
const POSITION_KEY = 'os_offline_phone_ball_pos';

type Position = { x: number; y: number };

interface Props {
    holder: PhoneHolder;
    /** 手机弹窗打开时淡出：此刻球已经变成手里那台手机了 */
    hidden?: boolean;
    onOpen: () => void;
}

const readPosition = (): Position | null => {
    try {
        const value = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
        if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) return value;
    } catch { /* 用默认位置 */ }
    return null;
};

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

/** 默认停在左下角、输入框上方一点：右边已经被输入模式球占了 */
const defaultPosition = (): Position => ({
    x: 12,
    y: Math.max(72, window.innerHeight - SIZE - 132),
});

export default function OfflinePhoneBall({ holder, hidden, onOpen }: Props) {
    const [position, setPosition] = useState<Position | null>(readPosition);
    const latest = useRef(position);
    latest.current = position;
    const suppressClick = useRef(false);
    const frame = useRef<number | null>(null);
    const drag = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        origin: Position;
        bounds: ReturnType<typeof currentBounds>;
        moved: boolean;
    } | null>(null);

    const apply = (next: Position) => {
        latest.current = next;
        setPosition(next);
    };

    /** 拖动中的位移合并到下一帧，避免每个 pointermove 都渲染一次 */
    const scheduleApply = (next: Position) => {
        latest.current = next;
        if (frame.current != null) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            setPosition(latest.current);
        });
    };

    useLayoutEffect(() => {
        const constrain = () => {
            const origin = latest.current || defaultPosition();
            apply(clampBubblePos(origin.x, origin.y, currentBounds()));
        };
        constrain();
        window.addEventListener('resize', constrain);
        window.addEventListener('orientationchange', constrain);
        return () => {
            window.removeEventListener('resize', constrain);
            window.removeEventListener('orientationchange', constrain);
        };
    }, []);

    // 软键盘弹起时也重新夹一次，避免被键盘盖住
    useEffect(() => {
        const onViewport = () => {
            if (!latest.current) return;
            apply(clampBubblePos(latest.current.x, latest.current.y, currentBounds()));
        };
        window.visualViewport?.addEventListener('resize', onViewport);
        return () => window.visualViewport?.removeEventListener('resize', onViewport);
    }, []);

    useEffect(() => () => {
        if (frame.current != null) cancelAnimationFrame(frame.current);
    }, []);

    const skin = holder === 'char'
        ? 'bg-slate-800 text-white border-2 border-slate-300'
        : holder === 'none'
            ? 'bg-white/60 text-slate-300 border border-dashed border-slate-400'
            : 'bg-white/95 text-slate-500 border border-slate-200';

    return (
        <button
            type="button"
            aria-label={holder === 'char' ? '他的手机（点击打开）' : holder === 'none' ? '你的手机不在手上' : '你的手机（点击打开）'}
            title={holder === 'char' ? '他的手机' : holder === 'none' ? '你的手机在他那里' : '你的手机'}
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
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 退化到普通点击 */ }
            }}
            onPointerMove={(event) => {
                const state = drag.current;
                if (!state || state.pointerId !== event.pointerId) return;
                const dx = event.clientX - state.startX;
                const dy = event.clientY - state.startY;
                if (!state.moved && Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
                state.moved = true;
                scheduleApply(clampBubblePos(state.origin.x + dx, state.origin.y + dy, state.bounds));
            }}
            onPointerUp={(event) => {
                const state = drag.current;
                if (!state || state.pointerId !== event.pointerId) return;
                suppressClick.current = state.moved;
                if (state.moved && latest.current) {
                    setPosition(latest.current);
                    try { localStorage.setItem(POSITION_KEY, JSON.stringify(latest.current)); } catch { /* 位置不持久不影响使用 */ }
                }
                drag.current = null;
                try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* 已释放 */ }
            }}
            onPointerCancel={() => { suppressClick.current = true; drag.current = null; }}
            onClick={(event) => {
                if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
                onOpen();
            }}
            className={`fixed left-0 top-0 z-[45] rounded-full flex items-center justify-center shadow-lg select-none transition-colors duration-150 will-change-transform ${skin}`}
            style={{
                width: SIZE,
                height: SIZE,
                transform: `translate3d(${position?.x ?? -999}px, ${position?.y ?? -999}px, 0)`,
                opacity: hidden ? 0 : position ? 1 : 0,
                pointerEvents: hidden ? 'none' : 'auto',
                touchAction: 'none',
            }}
        >
            <DeviceMobile className="w-6 h-6" weight={holder === 'none' ? 'regular' : 'fill'} />
            {holder === 'none' && (
                <span className="absolute -top-1 -right-1 px-1 rounded-full bg-slate-400 text-white text-[9px] leading-4">空</span>
            )}
        </button>
    );
}
