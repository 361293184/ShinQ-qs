import React from 'react';
import { DATE_STYLE_PRESETS } from '../../utils/datePrompts';
import type { OfflineConfig } from '../../types';
import { DEFAULT_OFFLINE_CONFIG, OFFLINE_LENGTH_MIN, OFFLINE_LENGTH_MAX, OFFLINE_SIZE_MIN, OFFLINE_SIZE_MAX } from '../../utils/offlineMode/offlineSettings';
import { FilmScript } from '@phosphor-icons/react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** normalizeOfflineConfig 后的完整配置（各字段必有值，改哪个传哪个 partial） */
    value: Required<OfflineConfig>;
    onChange: (next: Partial<OfflineConfig>) => void;
    charName: string;
    userName: string;
}

const POV_OPTIONS: Array<{ id: OfflineConfig['pov']; label: string; sub: string }> = [
    { id: 'first-you', label: '第一人称「我」', sub: '我看向你……（默认，代入感强）' },
    { id: 'third-name', label: '第三人称·角色名', sub: `${'角色名'}看向${'对方'}……` },
    { id: 'third-you', label: '第三人称「你」', sub: `${'角色名'}看向你……` },
];

const SAMPLE_NARRATION = '风把她的发梢吹得轻轻晃，她盯着你看了很久，才终于开口——';
const SAMPLE_DIALOGUE = '"你终于来啦，我等你好久了。"';

export default function OfflineSettingsModal({ isOpen, onClose, value, onChange, charName, userName }: Props) {
    if (!isOpen) return null;

    const uname = userName || '对方';
    const stylePreset = DATE_STYLE_PRESETS.find((p) => p.id === value.style) || DATE_STYLE_PRESETS[0];

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[1px]"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-5 pt-5 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                            <FilmScript className="w-5 h-5" weight="bold" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[15px] font-bold text-slate-800">线下模式 · 设置</div>
                            <div className="text-[11px] text-slate-400">按角色记忆，改动即时生效于后续回复</div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-sm hover:bg-slate-200 transition-colors">
                            ✕
                        </button>
                    </div>
                </div>

                <div className="px-5 py-4 space-y-6">
                    {/* 总开关 */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[13px] font-bold text-slate-700">开启线下模式</div>
                            <div className="text-[11px] text-slate-400">回复强制「旁白 + 台词」交替，像小说一样</div>
                        </div>
                        <button
                            onClick={() => onChange({ enabled: !value.enabled })}
                            className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${value.enabled ? 'bg-sky-500' : 'bg-slate-200'}`}
                        >
                            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${value.enabled ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>

                    {/* 叙述文风 */}
                    <div>
                        <div className="text-[12px] font-bold text-slate-500 mb-2">叙述文风</div>
                        <div className="grid grid-cols-2 gap-2">
                            {DATE_STYLE_PRESETS.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => onChange({ style: p.id })}
                                    className={`text-left px-3 py-2 rounded-xl border text-[12px] transition-colors ${value.style === p.id ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <div className="font-bold">{p.label}</div>
                                    <div className="text-[10px] opacity-70 mt-0.5 leading-snug">{p.hint}</div>
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={value.customStyle || ''}
                            onChange={(e) => onChange({ customStyle: e.target.value })}
                            placeholder={`自定义文风（优先级最高，可留空）\n例：文笔细腻克制，多用通感，台词短而有力。`}
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[12px] leading-relaxed focus:outline-none focus:border-sky-300 resize-none h-[68px]"
                        />
                    </div>

                    {/* 篇幅 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[12px] font-bold text-slate-500">篇幅（旁白 + 台词）</span>
                            <span className="text-[12px] font-mono font-bold text-sky-600">约 {value.replyLength} 字</span>
                        </div>
                        <input
                            type="range"
                            min={OFFLINE_LENGTH_MIN}
                            max={OFFLINE_LENGTH_MAX}
                            step={10}
                            value={value.replyLength}
                            onChange={(e) => onChange({ replyLength: Number(e.target.value) })}
                            className="w-full accent-sky-500"
                        />
                    </div>

                    {/* 叙事人称 */}
                    <div>
                        <div className="text-[12px] font-bold text-slate-500 mb-2">叙事人称</div>
                        <div className="space-y-2">
                            {POV_OPTIONS.map((p) => (
                                <button
                                    key={p.id as string}
                                    onClick={() => onChange({ pov: p.id })}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${value.pov === p.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                >
                                    <div className={`text-[12px] font-bold ${value.pov === p.id ? 'text-sky-700' : 'text-slate-600'}`}>{p.label}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{p.sub.replace('角色名', charName).replace('对方', uname)}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 旁白样式 */}
                    <div>
                        <div className="text-[12px] font-bold text-slate-500 mb-2">旁白样式</div>
                        <div className="space-y-2.5">
                            <label className="flex items-center gap-3 text-[12px]">
                                <span className="w-14 text-slate-500 shrink-0">角色旁白</span>
                                <input
                                    type="color"
                                    value={value.narrationColor.startsWith('#') ? value.narrationColor : '#9a9a9a'}
                                    onChange={(e) => onChange({ narrationColor: e.target.value })}
                                    className="w-8 h-8 rounded cursor-pointer border border-slate-200"
                                />
                                <input
                                    type="text"
                                    value={value.narrationColor}
                                    onChange={(e) => onChange({ narrationColor: e.target.value })}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono focus:outline-none focus:border-sky-300"
                                />
                            </label>
                            <label className="flex items-center gap-3 text-[12px]">
                                <span className="w-14 text-slate-500 shrink-0">用户旁白</span>
                                <input
                                    type="color"
                                    value={value.userNarrationColor.startsWith('#') ? value.userNarrationColor : '#5b8def'}
                                    onChange={(e) => onChange({ userNarrationColor: e.target.value })}
                                    className="w-8 h-8 rounded cursor-pointer border border-slate-200"
                                />
                                <input
                                    type="text"
                                    value={value.userNarrationColor}
                                    onChange={(e) => onChange({ userNarrationColor: e.target.value })}
                                    className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono focus:outline-none focus:border-sky-300"
                                />
                            </label>
                            <div className="flex items-center gap-3">
                                <span className="w-14 text-[12px] text-slate-500 shrink-0">字号</span>
                                <input
                                    type="range"
                                    min={OFFLINE_SIZE_MIN}
                                    max={OFFLINE_SIZE_MAX}
                                    step={1}
                                    value={value.narrationSize}
                                    onChange={(e) => onChange({ narrationSize: Number(e.target.value) })}
                                    className="flex-1 accent-sky-500"
                                />
                                <span className="text-[12px] font-mono font-bold text-sky-600 w-8 text-right">{value.narrationSize}px</span>
                            </div>
                        </div>
                    </div>

                    {/* 开场旁白 */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[13px] font-bold text-slate-700">开场旁白</div>
                            <div className="text-[11px] text-slate-400">进入线下时，角色先来一段场景旁白建立氛围</div>
                        </div>
                        <button
                            onClick={() => onChange({ openingNarration: !value.openingNarration })}
                            className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${value.openingNarration ? 'bg-sky-500' : 'bg-slate-200'}`}
                        >
                            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${value.openingNarration ? 'left-6' : 'left-1'}`} />
                        </button>
                    </div>

                    {/* 实时预览 */}
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3.5 space-y-2">
                        <div className="text-[11px] font-bold text-slate-400">渲染预览（旁白斜体居中 · 台词气泡）</div>
                        <div className="italic text-center text-[13px] leading-relaxed" style={{ color: value.narrationColor, fontSize: value.narrationSize }}>
                            {SAMPLE_NARRATION.replace('她', charName).replace('你', uname)}
                        </div>
                        <div className="flex justify-start">
                            <div
                                className="px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed text-slate-800 shadow-sm"
                                style={{ background: stylePreset ? undefined : undefined, backgroundColor: 'rgba(226,232,240,0.8)' }}
                            >
                                {SAMPLE_DIALOGUE.slice(1, -1)}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-5 pb-6">
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-2xl bg-slate-800 text-white text-[13px] font-bold active:scale-[0.98] transition-transform"
                    >
                        完成
                    </button>
                </div>
            </div>
        </div>
    );
}
