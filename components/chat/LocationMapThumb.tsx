import React, { useEffect, useRef, useState } from 'react';
import { loadAmap } from '../../utils/location/amapLoader';

/**
 * 真实定位卡片的迷你地图缩略图。
 *
 * - 用已配置的高德 JS API（同真实定位弹窗的 key，走 JS API 域名白名单保护），
 *   在卡片里实例化一张静态、不可交互的小地图，标出当前地点。
 * - 不需要额外的 Web 服务 key / Worker 代理。
 * - 复用 loadAmap 单例：JS API 已加载则直接建图；未配置 / 加载失败 → 返回 null（卡片自动回落纯文字样式）。
 * - 关键：组件卸载时 map.destroy()，聊天气泡滚动回收时不会内存泄漏。
 */
export default function LocationMapThumb(props: { lat: number; lng: number; name?: string }) {
    const { lat, lng, name } = props;
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (failed) return;
        let cancelled = false;
        let map: any = null;

        (async () => {
            // 从实时感知配置读 key（与弹窗一致）
            let amapKey = '';
            let securityJsCode = '';
            try {
                const saved = localStorage.getItem('os_realtime_config');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    amapKey = (parsed?.amapKey || '').trim();
                    securityJsCode = (parsed?.amapSecurityJsCode || '').trim();
                }
            } catch (e) { /* ignore */ }

            if (!amapKey) { if (!cancelled) setFailed(true); return; }
            try {
                await loadAmap(amapKey, securityJsCode);
            } catch (e) {
                if (!cancelled) setFailed(true);
                return;
            }
            if (cancelled || !containerRef.current) return;

            const AMap = (window as any).AMap;
            map = new AMap.Map(containerRef.current, {
                viewMode: '2D',
                zoom: 16,
                center: [lng, lat],
                mapStyle: 'amap://styles/light',
                // 静态缩略图：禁掉所有交互
                dragEnable: false,
                zoomEnable: false,
                scrollWheel: false,
                doubleClickZoom: false,
                keyboardEnable: false,
                touchZoom: false,
                resizeEnable: true,
                showBuildingBlock: false,
            });
            mapRef.current = map;

            const marker = new AMap.Marker({
                position: new AMap.LngLat(lng, lat),
                map,
            });
            markerRef.current = marker;
        })();

        return () => {
            cancelled = true;
            try { map?.destroy?.(); } catch (e) { /* noop */ }
            mapRef.current = null;
            markerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lng, failed]);

    if (failed) return null;

    return (
        <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
            <div ref={containerRef} className="absolute inset-0" />
            <span className="absolute bottom-1 right-1 text-[8px] px-1 py-0.5 rounded bg-black/40 text-white/80 font-mono leading-none">
                {name ? '📍' : ''}
            </span>
        </div>
    );
}
