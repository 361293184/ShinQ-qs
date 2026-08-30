import React, { useEffect, useRef, useState } from 'react';
import type { RealtimeConfig } from '../../types';
import { loadAmap } from '../../utils/location/amapLoader';
import { geolocate, toGcj02 } from '../../utils/location/coordinate';
import { searchAroundPois, toLocationFields } from '../../utils/location/poi';

/**
 * 定位分享弹窗（两层结构）：
 *  - 第一层：选择「真实定位 / 虚拟定位」
 *  - 真实定位：完整地图弹窗（高德地图 + POI 选点 + 拖动联动刷新）
 *  - 虚拟定位：简化文本输入框（手动填写文字）
 *
 * 真实定位流程：定位(WGS-84) → 纠偏(GCJ-02) → 地图落点 → 周边 POI → 点选发送。
 * 未配置高德 Key / 定位失败：Toast 提示并停留在本层，用户可返回重选（不强制跳虚拟）。
 */
export default function LocationPickerModal(props: {
    realtimeConfig?: RealtimeConfig;
    onSend: (name: string, desc: string | undefined, source: 'real' | 'manual', lat?: number, lng?: number) => void;
    onClose: () => void;
}) {
    const { realtimeConfig, onSend, onClose } = props;
    const [mode, setMode] = useState<'pick' | 'manual' | 'real'>('pick');
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');

    // ---- 真实定位状态 ----
    const [loading, setLoading] = useState<'idle' | 'loading' | 'error'>('idle');
    const [errMsg, setErrMsg] = useState('');
    const [pois, setPois] = useState<any[]>([]);
    const [selected, setSelected] = useState<any | null>(null); // 当前选中的地点（发送用）
    const [locatingNow, setLocatingNow] = useState(false); // 是否正在重新定位/搜 POI
    const [keyword, setKeyword] = useState(''); // 地点搜索关键词
    const [searching, setSearching] = useState(false); // 关键词搜索中

    const mapRef = useRef<HTMLDivElement>(null);
    const amapMapRef = useRef<any>(null);
    const centerMarkerRef = useRef<any>(null);
    const searchTimerRef = useRef<number | null>(null);
    const keywordTimerRef = useRef<number | null>(null);

    const amapKey = realtimeConfig?.amapKey?.trim() || '';
    const securityJsCode = realtimeConfig?.amapSecurityJsCode?.trim() || '';
    const locationEnabled = !!realtimeConfig?.locationEnabled;

    // 清理地图实例，防内存泄漏（StrictMode 双挂载也依赖幂等清理）
    useEffect(() => {
        return () => {
            if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
            if (keywordTimerRef.current) window.clearTimeout(keywordTimerRef.current);
            try { amapMapRef.current?.destroy?.(); } catch (e) { /* noop */ }
            amapMapRef.current = null;
            centerMarkerRef.current = null;
        };
    }, []);

    // 进入真实定位态：初始化地图 + 定位
    useEffect(() => {
        if (mode !== 'real') return;
        let cancelled = false;

        // 复用真实定位态（real→pick→real）：先销毁旧地图实例，避免叠加
        if (amapMapRef.current) {
            try { amapMapRef.current.destroy(); } catch (e) { /* noop */ }
            amapMapRef.current = null;
            centerMarkerRef.current = null;
        }

        (async () => {
            setLoading('loading');
            setErrMsg('');
            // 1) Key 校验
            if (!locationEnabled || !amapKey) {
                setLoading('error');
                setErrMsg('未开启定位或未配置高德 Key，请在 设置 → 实时感知 → 定位 里填写。');
                return;
            }
            try {
                await loadAmap(amapKey, securityJsCode);
            } catch (e: any) {
                if (!cancelled) { setLoading('error'); setErrMsg(e?.message || '高德地图加载失败'); }
                return;
            }
            if (cancelled || !mapRef.current) return;

            // 2) 建地图
            const AMap = (window as any).AMap;
            const map = new AMap.Map(mapRef.current, {
                viewMode: '2D',
                zoom: 15,
                resizeEnable: true,
            });
            amapMapRef.current = map;

            // 中心点 marker（跟随地图中心）
            const marker = new AMap.Marker({
                position: new AMap.LngLat(116.397428, 39.90923),
                map,
            });
            centerMarkerRef.current = marker;

            // 3) 定位 + 纠偏 + 落点 + 搜周边
            await locateAndSearch(map, marker);

            // 4) 拖动地图 → 中心点变化 → 防抖重搜（无关键词搜周边，有关键词继续按关键词搜）
            map.on('moveend', () => {
                if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
                searchTimerRef.current = window.setTimeout(() => {
                    if (!amapMapRef.current) return;
                    const center = amapMapRef.current.getCenter();
                    centerMarkerRef.current?.setPosition(center);
                    if (keyword.trim()) {
                        // 有关键词：按关键词搜（PlaceSearch.search 是全国范围，中心点无关）
                        refreshPois({ lng: center.getLng(), lat: center.getLat() }, keyword.trim());
                    } else {
                        refreshPois({ lng: center.getLng(), lat: center.getLat() });
                    }
                }, 300);
            });

            setLoading('idle');
        })();

        return () => { cancelled = true; };
    }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

    // 定位 + 纠偏 + 落点 + 搜周边（供初始化与「重新定位」复用）
    const locateAndSearch = async (map: any, marker: any) => {
        setLocatingNow(true);
        try {
            const geo = await geolocate();
            const gcj = await toGcj02(geo.lng, geo.lat);
            map.setCenter([gcj.lng, gcj.lat]);
            marker.setPosition(new (window as any).AMap.LngLat(gcj.lng, gcj.lat));
            await refreshPois(gcj);
            // 默认选中「当前位置」
            setSelected({
                name: '当前位置',
                address: `定位精度 ±${geo.accuracy >= 1000 ? (geo.accuracy / 1000).toFixed(1) + 'km' : Math.round(geo.accuracy) + 'm'}`,
                lat: gcj.lat,
                lng: gcj.lng,
                isCur: true,
            });
        } catch (e: any) {
            setErrMsg(e?.message || '定位失败，请检查位置权限或使用 HTTPS（本地开发用 localhost）。');
        } finally {
            setLocatingNow(false);
        }
    };

    // 搜 POI（支持关键词搜索/周边搜索）
    // - 有关键词：按关键词搜（PlaceSearch.search 全国范围，中心点作为偏好但非必需）
    // - 无关键词：按中心点搜周边
    const refreshPois = async (center: { lng: number; lat: number }, kw?: string) => {
        const isKeyword = !!(kw && kw.trim());
        if (isKeyword) setSearching(true);
        try {
            const list = await searchAroundPois({ center, keyword: isKeyword ? kw : undefined });
            // 预处理成展示/发送字段
            const mapped = list.map((p: any) => ({ ...toLocationFields(p) }));
            setPois(mapped);
        } finally {
            if (isKeyword) setSearching(false);
        }
    };

    // 关键词变化 → 防抖 300ms → 触发搜索（无论地图当前在哪都按关键词搜）
    useEffect(() => {
        if (mode !== 'real') return;
        if (keywordTimerRef.current) window.clearTimeout(keywordTimerRef.current);
        const kw = keyword.trim();
        if (!kw) {
            // 清空关键词 → 恢复按当前地图中心搜周边
            if (amapMapRef.current) {
                const center = amapMapRef.current.getCenter();
                refreshPois({ lng: center.getLng(), lat: center.getLat() });
            }
            return;
        }
        keywordTimerRef.current = window.setTimeout(() => {
            if (!amapMapRef.current) return;
            const center = amapMapRef.current.getCenter();
            refreshPois({ lng: center.getLng(), lat: center.getLat() }, kw);
        }, 300);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyword, mode]);

    const handleSend = () => {
        if (!selected) return;
        const isCur = !!(selected as any).isCur;
        onSend(
            selected.name || '当前位置',
            isCur ? (selected.address || '我在这里') : (selected.address || ''),
            'real',
            selected.lat,
            selected.lng
        );
        onClose();
    };

    // 重新定位（清空列表、重新走定位流程）
    const handleReLocate = async () => {
        if (!amapMapRef.current) return;
        await locateAndSearch(amapMapRef.current, centerMarkerRef.current);
    };

    const amapConfigured = locationEnabled && !!amapKey;

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {mode === 'pick' && (
                    <>
                        {/* 第一层：选择 */}
                        <div className="px-5 pt-5 pb-2">
                            <h3 className="text-base font-bold text-slate-800">发送位置</h3>
                            <p className="text-xs text-slate-400 mt-0.5">选择一种方式，角色会看到你的位置</p>
                        </div>
                        <div className="p-4 space-y-2">
                            <button
                                onClick={() => {
                                    if (!amapConfigured) {
                                        // 未配置高德 key：提示去设置，停留在本层（不自动跳虚拟）
                                        setLoading('error');
                                        setErrMsg('未开启定位或未配置高德 Key，请在 设置 → 实时感知 → 定位 里填写。');
                                        return;
                                    }
                                    setMode('real');
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-[0.98] transition-all cursor-pointer text-left"
                            >
                                <span className="w-9 h-9 rounded-full bg-amber-200/70 flex items-center justify-center shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-amber-700">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0 1 15 0Z" />
                                    </svg>
                                </span>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">真实定位</p>
                                    <p className="text-[11px] text-slate-500">使用当前位置（高德地图选点）</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setMode('manual')}
                                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all cursor-pointer text-left"
                            >
                                <span className="w-9 h-9 rounded-full bg-slate-200/70 flex items-center justify-center shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-slate-700">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                    </svg>
                                </span>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">虚拟定位</p>
                                    <p className="text-[11px] text-slate-500">手动输入地点文字</p>
                                </div>
                            </button>
                        </div>
                        {mode === 'pick' && loading === 'error' && errMsg && (
                            <div className="px-4 pb-3">
                                <div className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</div>
                            </div>
                        )}
                        <div className="px-4 pb-4">
                            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors cursor-pointer">取消</button>
                        </div>
                    </>
                )}

                {mode === 'manual' && (
                    <>
                        {/* 第二层：虚拟定位输入 */}
                        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-800">虚拟定位</h3>
                                <p className="text-xs text-slate-400 mt-0.5">输入你想让角色看到的位置</p>
                            </div>
                            <button onClick={() => setMode('pick')} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">‹ 返回</button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">地点</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="如：北京 · 朝阳公园"
                                    autoFocus
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">补充描述（可选）</label>
                                <input
                                    value={desc}
                                    onChange={e => setDesc(e.target.value)}
                                    placeholder="如：我在公司楼下等你"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-colors"
                                />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors cursor-pointer">取消</button>
                                <button
                                    onClick={() => {
                                        if (!name.trim()) return;
                                        onSend(name.trim(), desc.trim() || undefined, 'manual');
                                        onClose();
                                    }}
                                    disabled={!name.trim()}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${name.trim() ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                                >
                                    发送
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {mode === 'real' && (
                    <>
                        {/* 第二层 A：真实定位（完整地图弹窗） */}
                        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-800">真实定位</h3>
                                <p className="text-xs text-slate-400 mt-0.5">选一个地点发送给角色</p>
                            </div>
                            <button onClick={() => { setMode('pick'); setSelected(null); setPois([]); setKeyword(''); }} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">‹ 返回</button>
                        </div>

                        {/* 搜索框 + 地图区 */}
                        <div className="px-4">
                            <div className="relative mb-2">
                                <input
                                    value={keyword}
                                    onChange={e => setKeyword(e.target.value)}
                                    placeholder="搜索地点（如：西湖、断桥、瑞幸）"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-[13px] focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-colors"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                                    className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                                </svg>
                                {keyword && (
                                    <button onClick={() => setKeyword('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-500 flex items-center justify-center text-xs cursor-pointer">✕</button>
                                )}
                            </div>
                            <div className="relative rounded-xl overflow-hidden border border-slate-200" style={{ height: 220 }}>
                                <div ref={mapRef} className="absolute inset-0" />
                                {loading === 'loading' && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 text-xs text-slate-500 z-10">正在加载地图…</div>
                                )}
                                {loading === 'error' && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 text-xs text-red-600 z-10 px-4 text-center">
                                        <div>
                                            <p className="font-bold mb-1">地图加载失败</p>
                                            <p className="text-[11px] text-slate-500">{errMsg}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-slate-400">{locatingNow ? '正在定位…' : '拖动地图可查看周边地点'}</span>
                                <button onClick={handleReLocate} disabled={loading === 'loading' || locatingNow}
                                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 disabled:opacity-50 cursor-pointer">重新定位</button>
                            </div>
                        </div>

                        {/* POI 列表 */}
                        <div className="flex-1 overflow-y-auto max-h-44 px-4 py-2 space-y-1">
                            {/* 列表顶部标签：搜索结果 / 周边地点 */}
                            {(pois.length > 0 || searching || keyword.trim()) && (
                                <div className="flex items-center justify-between px-1 pb-1">
                                    <span className="text-[10px] font-bold text-slate-500">
                                        {keyword.trim() ? `搜索结果（${pois.length}）` : '周边地点'}
                                    </span>
                                    {searching && <span className="text-[10px] text-amber-500">搜索中…</span>}
                                </div>
                            )}
                            {pois.length === 0 && !locatingNow && !searching && (
                                <div className="text-[11px] text-slate-400 text-center py-6">
                                    {keyword.trim() ? '没有搜到结果，换个关键词试试' : '暂未找到周边地点，试试拖动地图'}
                                </div>
                            )}
                            {pois.map((poi, i) => {
                                const isSel = selected && (selected.isCur ? selected.isCur === poi.isCur : selected.lng === poi.lng && selected.lat === poi.lat && !selected.isCur);
                                return (
                                    <button key={i} onClick={() => {
                                        // 选中搜索/周边结果：把地图移到该点，marker 落到搜索点
                                        setSelected(poi);
                                        if (amapMapRef.current && poi.lng != null && poi.lat != null) {
                                            amapMapRef.current.setCenter([poi.lng, poi.lat]);
                                            centerMarkerRef.current?.setPosition(new (window as any).AMap.LngLat(poi.lng, poi.lat));
                                        }
                                    }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${isSel ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 hover:bg-slate-100 border border-transparent'}`}>
                                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSel ? 'border-amber-500' : 'border-slate-300'}`}>
                                            {isSel && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-slate-800 truncate">{poi.name}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{poi.address || poi.name}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="px-4 py-3 flex gap-2 border-t border-slate-100">
                            <button onClick={() => { setMode('pick'); setSelected(null); setPois([]); setKeyword(''); }}
                                className="flex-1 py-2.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors cursor-pointer">取消</button>
                            <button
                                onClick={handleSend}
                                disabled={!selected || loading === 'loading'}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${selected && loading !== 'loading' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                            >
                                发送
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
