import React, { useState } from 'react';
import type { RealtimeConfig } from '../../types';

/**
 * 定位分享弹窗（两层结构）：
 *  - 第一层：选择「真实定位 / 虚拟定位」
 *  - 虚拟定位：手动输入地点文字 → 发送
 *  - 真实定位：需高德 key；当前阶段先给配置提示（地图选点在阶段 2 接入）
 */
export default function LocationPickerModal(props: {
    realtimeConfig?: RealtimeConfig;
    onSend: (name: string, desc: string | undefined, source: 'real' | 'manual', lat?: number, lng?: number) => void;
    onClose: () => void;
}) {
    const { realtimeConfig, onSend, onClose } = props;
    const [mode, setMode] = useState<'pick' | 'manual'>('pick');
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');

    const amapConfigured = !!realtimeConfig?.locationEnabled
        && !!realtimeConfig?.amapKey?.trim()
        && !!realtimeConfig?.amapSecurityJsCode?.trim();

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {mode === 'pick' ? (
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
                                        // 未配置高德 key：提示去设置（真实定位阶段 2 接入）
                                        onSend('真实定位尚未配置', undefined, 'manual');
                                        onClose();
                                        return;
                                    }
                                    // 阶段 2：接入高德地图选点。当前先回退到手动
                                    onSend('真实定位（地图选点）敬请期待', undefined, 'manual');
                                    onClose();
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
                    </>
                ) : (
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
            </div>
        </div>
    );
}
