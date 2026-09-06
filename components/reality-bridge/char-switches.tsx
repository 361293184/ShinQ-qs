/** 现实桥 · 角色接收开关列表：每角色一个「接收」开关，开后可展开「自动回应」。 */
import React from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { CharacterBridgePref } from '../../utils/realityBridge/types';

export function CharSwitchList({ characters, prefs, onToggle, onToggleAutoReply, expanded, onToggleExpand }: {
    characters: Array<{ id: string; name: string; avatar?: string }>;
    prefs: Record<string, CharacterBridgePref>;
    onToggle: (id: string, next: CharacterBridgePref) => void;
    onToggleAutoReply: (id: string, next: CharacterBridgePref) => void;
    expanded: string | null;
    onToggleExpand: (id: string) => void;
}): React.ReactElement {
    if (characters.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-[#D8D2BE] bg-[#FCF9F2] px-4 py-8 text-center">
                <p className="text-xs text-[#A89B7F]">还没有角色。先去「神经链接」创建角色，再回来决定哪些角色能收现实桥事件。</p>
            </div>
        );
    }
    return (
        <div className="space-y-1.5">
            {characters.map(c => {
                const pref = prefs[c.id] || { enabled: false, autoReply: false };
                const isOpen = expanded === c.id;
                return (
                    <div key={c.id} className={`rounded-2xl border transition-colors ${pref.enabled ? 'bg-white border-[#CBD5A0]' : 'bg-[#FAF8F1] border-[#E5E0D2]'}`}>
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                            <button onClick={() => onToggleExpand(c.id)} className="shrink-0 cursor-pointer" aria-label="展开">
                                <CaretDown className={`w-4 h-4 text-[#A89B7F] transition-transform ${isOpen ? '' : '-rotate-90'}`} weight="bold" />
                            </button>
                            {c.avatar ? <img src={c.avatar} alt="" className="w-9 h-9 rounded-full object-cover" /> : <span className="w-9 h-9 rounded-full bg-[#E5E0D2]" />}
                            <button onClick={() => onToggleExpand(c.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                                <p className="text-[13px] font-bold text-[#3A3A38] truncate">{c.name}</p>
                                <p className="text-[10px] text-[#A89B7F]">{pref.enabled ? pref.autoReply ? '接收中 · 自动回应开' : '接收中 · 只收不自动回' : '未接收'}</p>
                            </button>
                            <button
                                onClick={() => onToggle(c.id, { ...pref, enabled: !pref.enabled })}
                                aria-label={`${c.name} 接收开关`}
                                className="w-10 h-6 rounded-full p-1 transition-colors flex items-center cursor-pointer"
                                style={{ background: pref.enabled ? '#7F8C52' : '#E0DACB' }}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${pref.enabled ? 'translate-x-4' : ''}`} />
                            </button>
                        </div>
                        {isOpen && (
                            <div className="px-3 pb-3 pl-11">
                                <button onClick={() => onToggleAutoReply(c.id, { ...pref, autoReply: !pref.autoReply })} disabled={!pref.enabled}
                                    className="flex items-center gap-2 rounded-xl border px-3 py-2 w-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    style={{ borderColor: pref.autoReply ? '#B4C198' : '#E5E0D2', background: pref.autoReply ? '#F2F5E9' : '#FFF' }}
                                >
                                    <span className="flex-1 text-left">
                                        <span className="block text-[12px] font-bold text-[#3A3A38]">自动回应</span>
                                        <span className="block text-[10px] text-[#A89B7F] mt-0.5">事件到达时，云端用 TA 的人设与最近聊天生成回应后推回（需在设置里上传 LLM 凭据）</span>
                                    </span>
                                    <span className="w-9 h-5 rounded-full p-0.5 transition-colors flex items-center" style={{ background: pref.autoReply ? '#7F8C52' : '#E0DACB' }}>
                                        <span className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${pref.autoReply ? 'translate-x-4' : ''}`} />
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
