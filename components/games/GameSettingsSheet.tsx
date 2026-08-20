import React, { useState } from 'react';
import type { CharadesSettings } from '../../utils/games/gameStore';
import { saveCharadesSettings, DEFAULT_CHARADES_SETTINGS } from '../../utils/games/gameStore';
import { WORD_CATEGORIES } from '../../utils/games/wordBank';

/**
 * 「你说我猜」设置页（游戏内顶栏右上角 ⚙️ 进入）。
 * 只负责设置项，选角色放在开局流程（CharadesApp setup）。
 */

interface Props {
    settings: CharadesSettings;
    onSave: (s: CharadesSettings) => void;
    onClose: () => void;
}

const PLAYER_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const ROUND_OPTIONS = [4, 6, 8, 10, 12, 16, 20];
const TIME_OPTIONS = [30, 60, 90, 120];

function SegOptions({ options, value, onChange, suffix }: {
    options: number[];
    value: number;
    onChange: (v: number) => void;
    suffix: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
                <button key={o} onClick={() => onChange(o)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${value === o ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {o}{suffix}
                </button>
            ))}
        </div>
    );
}

export default function GameSettingsSheet({ settings, onSave, onClose }: Props) {
    const [draft, setDraft] = useState<CharadesSettings>({ ...settings });

    const toggleCat = (id: (typeof WORD_CATEGORIES)[number]['id']) => {
        setDraft((prev) => {
            const has = prev.categories.includes(id);
            // 至少保留一个分类
            if (has && prev.categories.length === 1) return prev;
            return { ...prev, categories: has ? prev.categories.filter((c) => c !== id) : [...prev.categories, id] };
        });
    };

    const handleSave = () => {
        // 校正人数/轮数/时限边界
        const next: CharadesSettings = {
            ...draft,
            playerCount: Math.min(8, Math.max(2, draft.playerCount)),
            totalRounds: Math.min(20, Math.max(4, draft.totalRounds)),
            categories: draft.categories.length ? draft.categories : DEFAULT_CHARADES_SETTINGS.categories,
        };
        saveCharadesSettings(next);
        onSave(next);
        onClose();
    };

    const Toggle = ({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) => (
        <div className="flex items-center justify-between py-2.5">
            <div>
                <p className="text-[13px] font-bold text-slate-700">{label}</p>
                {desc && <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>}
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-slate-200 peer-checked:bg-amber-500 rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4"></div>
            </label>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100dvh - 4rem)' }} onClick={(e) => e.stopPropagation()}>
                <div className="px-5 pt-5 pb-2 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-800">游戏设置</h3>
                        <p className="text-xs text-slate-400 mt-0.5">保存后长期生效</p>
                    </div>
                    <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1.5">一局人数</label>
                        <SegOptions options={PLAYER_OPTIONS} value={draft.playerCount} onChange={(v) => setDraft({ ...draft, playerCount: v })} suffix="人" />
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1.5">描述者场次</label>
                        <SegOptions options={ROUND_OPTIONS} value={draft.totalRounds} onChange={(v) => setDraft({ ...draft, totalRounds: v })} suffix="轮" />
                        <p className="text-[10px] text-slate-400 mt-1">{draft.playerCount} 人局，每人上场约 {Math.ceil(draft.totalRounds / draft.playerCount)} 次</p>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1.5">每题时限（每人每轮）</label>
                        <SegOptions options={TIME_OPTIONS} value={draft.timeLimit} onChange={(v) => setDraft({ ...draft, timeLimit: v })} suffix="s" />
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1.5">词库类目（可多选）</label>
                        <div className="flex flex-wrap gap-1.5">
                            {WORD_CATEGORIES.map((c) => (
                                <button key={c.id} onClick={() => toggleCat(c.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${draft.categories.includes(c.id) ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-2">
                        <Toggle label="AI 实时出题" desc="每词让 AI 生成一个词（副 API，略慢）" value={draft.aiGenerate} onChange={(v) => setDraft({ ...draft, aiGenerate: v })} />
                        <Toggle label="副 API 失败降级主 API" desc="副 API 出错时用主 API 兜底" value={draft.fallbackToMain} onChange={(v) => setDraft({ ...draft, fallbackToMain: v })} />
                        <Toggle label="战绩存入记忆" desc="对局结束后写入参与角色的记忆" value={draft.saveToMemory} onChange={(v) => setDraft({ ...draft, saveToMemory: v })} />
                        <Toggle label="自动补 NPC" desc="人数不足时用 NPC 补齐" value={draft.autoFillNpc} onChange={(v) => setDraft({ ...draft, autoFillNpc: v })} />
                    </div>
                </div>

                <div className="px-5 py-3 flex gap-2 border-t border-slate-100">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors cursor-pointer">取消</button>
                    <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl text-sm bg-amber-500 hover:bg-amber-600 text-white font-bold transition-colors cursor-pointer">保存并生效</button>
                </div>
            </div>
        </div>
    );
}
