import React, { useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import type { CharadesSettings } from '../../utils/games/gameStore';
import { loadCharadesSettings, recordGameStats } from '../../utils/games/gameStore';
import { createNpcs } from '../../utils/games/npcPool';
import CharadesBoard, { type Participant, type CharadesResult } from '../../components/games/CharadesBoard';
import GameSettingsSheet from '../../components/games/GameSettingsSheet';
import type { ApiEndpoint } from '../../utils/games/gameApi';
import { GameReplayCard } from '../../components/games/GameReplayCard';

interface Props {
    onBack: () => void;
}

/**
 * 「你说我猜」App（游戏大厅首个内置游戏）。
 * 阶段：setup（选角色+开始）→ play（CharadesBoard）→ result（结算+转发）。
 */
export default function CharadesApp({ onBack }: Props) {
    const { characters, userProfile, apiConfig, addToast, updateCharacter } = useOS();
    const [settings, setSettings] = useState<CharadesSettings>(() => loadCharadesSettings());
    const [showSettings, setShowSettings] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(settings.selectedCharIds?.filter((id) => characters.some((c) => c.id === id)) || [])
    );
    const [view, setView] = useState<'setup' | 'play' | 'result'>('setup');
    const [result, setResult] = useState<CharadesResult | null>(null);
    const [showReplay, setShowReplay] = useState(false);

    // 副 API / 主 API 配置
    const subApi: ApiEndpoint = useMemo(() => ({
        baseUrl: apiConfig.subBaseUrl,
        apiKey: apiConfig.subApiKey,
        model: apiConfig.subModel,
    }), [apiConfig]);
    const mainApi: ApiEndpoint = useMemo(() => ({
        baseUrl: apiConfig.baseUrl,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
    }), [apiConfig]);

    const subConfigured = !!(apiConfig.subBaseUrl && apiConfig.subApiKey && apiConfig.subModel);

    // 组装参与者：用户 + 选中角色 + NPC 补齐
    const participants: Participant[] = useMemo(() => {
        const list: Participant[] = [
            { id: 'user', name: userProfile.name || '你', isUser: true, isNpc: false, score: 0 },
        ];
        for (const c of characters) {
            if (selectedIds.has(c.id)) {
                list.push({
                    id: c.id, name: c.name, isUser: false, isNpc: false,
                    persona: c.systemPrompt?.slice(0, 120) || '', avatar: c.avatar,
                    score: 0,
                });
            }
        }
        if (settings.autoFillNpc) {
            const target = settings.playerCount;
            const need = target - list.length;
            if (need > 0) {
                const npcs = createNpcs(Math.min(need, 4), list.map((p) => p.name));
                for (const n of npcs) {
                    list.push({ id: n.id, name: n.name, isUser: false, isNpc: true, persona: n.persona, hue: n.hue, score: 0 });
                }
            }
        }
        // 最终人数 = list.length（可能超出 settings.playerCount，但保证 >=2）
        return list;
    }, [characters, selectedIds, settings.autoFillNpc, settings.playerCount, userProfile.name]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            // 记录最近选择
            const saved = loadCharadesSettings();
            saved.selectedCharIds = Array.from(next);
            try { localStorage.setItem('gamehub_settings', JSON.stringify({ ...saved, selectedCharIds: Array.from(next) })); } catch (e) { /* */ }
            return next;
        });
    };

    const startGame = () => {
        if (!subConfigured) {
            addToast('未配置副 API，请到 设置 → 其他 API 填写 subBaseUrl/subApiKey/subModel', 'error');
            return;
        }
        if (participants.length < 2) {
            addToast('至少需要 2 人（可只选 1 个角色，NPC 会补齐）', 'error');
            return;
        }
        setView('play');
    };

    const handleFinish = async (r: CharadesResult) => {
        setResult(r);
        setView('result');

        // 记战绩
        const user = r.participants.find((p) => p.isUser);
        const isWin = !!user && r.mvpName === user.name;
        const isMvp = isWin;
        const lastResult = `${r.participants.length}人·${settings.totalRounds}轮·MVP ${r.mvpName}(${r.mvpScore}分)`;
        recordGameStats(isWin, isMvp, lastResult);

        // 战绩存记忆（开关）
        if (settings.saveToMemory) {
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            for (const cid of r.charIds) {
                const char = characters.find((c) => c.id === cid);
                if (!char) continue;
                const mem = { id: `mem-${Date.now()}-${Math.random()}`, date: dateStr, summary: r.summary, mood: 'fun' };
                updateCharacter(cid, { memories: [...(char.memories || []), mem] });
            }
        }
    };

    const handleQuit = (r: CharadesResult | null) => {
        if (r) { handleFinish(r); } else { onBack(); }
    };

    const forwardReplay = async () => {
        if (!result) return;
        const ts = Date.now();
        for (const cid of result.charIds) {
            await DB.saveMessage({
                charId: cid,
                role: 'user',
                type: 'game_replay',
                content: result.summary,
                metadata: {
                    game: '你说我猜',
                    rounds: settings.totalRounds,
                    playerCount: result.participants.length,
                    mvp: result.mvpName,
                    mvpScore: result.mvpScore,
                    myScore: result.myScore,
                    transcript: result.transcript,
                    summary: result.summary,
                    charIds: result.charIds,
                    charNames: result.participants.filter((p) => !p.isNpc).map((p) => p.name),
                    ts,
                },
            });
        }
        addToast(`已转发到 ${result.charIds.length} 位角色的聊天`, 'success');
    };

    // ---- UI ----
    return (
        <div className="h-full w-full flex flex-col bg-white relative overflow-hidden">
            {/* 顶栏 */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.5rem)' }}>
                <button onClick={() => { if (view === 'play') onBack(); else setView('setup'); }} className="p-1 -ml-1 text-slate-500 hover:text-slate-700 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <span className="text-base font-black text-slate-800">你说我猜</span>
                <button onClick={() => setShowSettings(true)} className="p-1 -mr-1 text-slate-500 hover:text-slate-700 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                </button>
            </div>

            {/* setup：选角色 + 配置展示 + 开始 */}
            {view === 'setup' && (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800">选择参与的角色</h3>
                            <span className="text-[11px] text-slate-400">已选 {selectedIds.size} 个</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 mb-2">选 1~N 个角色一起玩，不够的由 NPC 补齐</p>
                        {characters.length === 0 ? (
                            <p className="text-xs text-slate-400 py-4 text-center">还没有角色，先去「神经链接」创建吧</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {characters.map((c) => {
                                    const on = selectedIds.has(c.id);
                                    return (
                                        <button key={c.id} onClick={() => toggleSelect(c.id)}
                                            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${on ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                            <span className="w-7 h-7 rounded-full bg-violet-200 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0 overflow-hidden">
                                                {c.avatar ? <img src={c.avatar} className="w-full h-full object-cover" alt="" /> : c.name.slice(0, 1)}
                                            </span>
                                            <span className="text-[13px] font-bold text-slate-700 truncate">{c.name}</span>
                                            <span className={`ml-auto w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'border-amber-500' : 'border-slate-300'}`}>
                                                {on && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 当前配置只读展示 */}
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-700">当前配置</p>
                            <button onClick={() => setShowSettings(true)} className="text-[11px] text-amber-600 font-bold cursor-pointer">修改 ⚙️</button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-slate-500">
                            <span className="px-2 py-0.5 bg-white rounded-full">{participants.length} 人</span>
                            <span className="px-2 py-0.5 bg-white rounded-full">{settings.totalRounds} 轮</span>
                            <span className="px-2 py-0.5 bg-white rounded-full">{settings.timeLimit}s/题</span>
                            <span className="px-2 py-0.5 bg-white rounded-full">词库：{settings.categories.map((c) => ({ animal: '动物', food: '食物', idiom: '成语', film: '影视', game: '游戏' }[c])).join('、')}</span>
                            {settings.aiGenerate && <span className="px-2 py-0.5 bg-white rounded-full text-amber-600">AI出题</span>}
                            {settings.saveToMemory && <span className="px-2 py-0.5 bg-white rounded-full text-violet-500">存记忆</span>}
                        </div>
                    </div>

                    {!subConfigured && (
                        <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-[12px] text-red-600">
                            未配置副 API，无法进行 AI 描述/猜词。请到 设置 → 其他 API 填写 subBaseUrl/subApiKey/subModel。
                        </div>
                    )}

                    <button onClick={startGame}
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-black transition-colors cursor-pointer">
                        🎮 开始游戏（{participants.length} 人局）
                    </button>
                </div>
            )}

            {/* play：游戏桌 */}
            {view === 'play' && (
                <div className="flex-1 flex flex-col min-h-0">
                    <CharadesBoard
                        settings={settings}
                        participants={participants}
                        subApi={subApi}
                        mainApi={mainApi}
                        onFinish={handleFinish}
                        onQuit={handleQuit}
                    />
                </div>
            )}

            {/* result：结算页 */}
            {view === 'result' && result && (
                <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
                    <div className="text-center">
                        <div className="text-3xl mb-1">🏆</div>
                        <h3 className="text-lg font-black text-slate-800">本局结果</h3>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-100 p-3 space-y-1">
                        {result.participants.map((p, i) => (
                            <div key={p.id} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${p.isUser ? 'bg-amber-50' : ''}`}>
                                <span className="w-6 text-center text-sm">{['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span>
                                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ background: p.isNpc ? `hsl(${p.hue || 200},55%,45%)` : '#c3b2ff' }}>
                                    {p.name.slice(0, 1)}
                                </span>
                                <span className="text-sm font-bold text-slate-700 flex-1">{p.name}{p.isUser ? '（你）' : ''}</span>
                                <span className="text-sm font-bold text-amber-600">{p.score} 分</span>
                            </div>
                        ))}
                    </div>

                    {/* 回放卡片（可展开） */}
                    <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
                        <button onClick={() => setShowReplay((s) => !s)} className="w-full px-4 py-3 flex items-center justify-between cursor-pointer">
                            <span className="text-sm font-bold text-slate-700">🎮 你说我猜 · 战报</span>
                            <span className="text-xs text-slate-400">{showReplay ? '收起 ▴' : '展开回放 ▾'}</span>
                        </button>
                        {showReplay && (
                            <div className="px-4 pb-3 border-t border-slate-100 pt-2">
                                <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-50 p-3 text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap font-mono">
                                    {result.transcript}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 操作 */}
                    <div className="space-y-2">
                        <button onClick={forwardReplay} disabled={result.charIds.length === 0}
                            className={`w-full py-3 rounded-xl text-sm font-black transition-colors cursor-pointer ${result.charIds.length ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            📤 转发战绩到 {result.charIds.length} 位角色的聊天
                        </button>
                        <button onClick={() => { setResult(null); setView('setup'); }} className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold cursor-pointer">🔄 再来一局</button>
                        <button onClick={onBack} className="w-full py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold cursor-pointer">🏠 返回大厅</button>
                    </div>
                </div>
            )}

            {showSettings && (
                <GameSettingsSheet settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />
            )}
        </div>
    );
}
