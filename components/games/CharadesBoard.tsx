import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CharadesSettings } from '../../utils/games/gameStore';
import type { WordCategory } from '../../utils/games/wordBank';
import { pickWord } from '../../utils/games/wordBank';
import { isCorrectGuess, forbiddenInGuess } from '../../utils/games/guessing';
import { callGameApi, generateAWord, type ApiEndpoint } from '../../utils/games/gameApi';
import { describePrompt, guessPrompt, hostLine, HOST_NAME } from '../../utils/games/charadesPrompts';

/** 参与者（用户 / 角色 / NPC 统一） */
export interface Participant {
    id: string;
    name: string;
    isUser: boolean;
    isNpc: boolean;
    /** 角色/NPC 人设（prompt 用） */
    persona?: string;
    /** NPC 头像色相 */
    hue?: number;
    /** 角色头像 */
    avatar?: string;
    score: number;
}

export interface Bubble {
    id: number;
    fromId?: string;
    fromName: string;
    text: string;
    kind: 'host' | 'describe' | 'guess' | 'correct' | 'system' | 'user-describer';
    isUser?: boolean;
}

export interface CharadesResult {
    /** 参与者及其得分 */
    participants: Participant[];
    /** 回放全文（聊天流式排版） */
    transcript: string;
    /** 一句话战绩摘要 */
    summary: string;
    mvpName: string;
    mvpScore: number;
    myScore: number;
    /** 参与的 char id（存记忆/转发用） */
    charIds: string[];
}

interface Props {
    settings: CharadesSettings;
    participants: Participant[];
    subApi: ApiEndpoint;
    mainApi: ApiEndpoint;
    /** 主持人吐槽/描述/猜词是否用副 API（未配置时由上层保证已校验） */
    onFinish: (r: CharadesResult) => void;
    onQuit: (r: CharadesResult | null) => void;
}

let bubbleSeq = 1000;

function makeBubble(p: Partial<Bubble>): Bubble {
    bubbleSeq++;
    return { id: bubbleSeq, fromName: '系统', kind: 'system', ...p } as Bubble;
}

export default function CharadesBoard({ settings, participants, subApi, mainApi, onFinish, onQuit }: Props) {
    const [round, setRound] = useState(0); // 已完成的轮次
    const [describerIdx, setDescriberIdx] = useState(0);
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [currentWord, setCurrentWord] = useState<string | null>(null);
    const [windowNo, setWindowNo] = useState(0); // 当前词的猜词窗口 0/1/2
    const [timeLeft, setTimeLeft] = useState(settings.timeLimit);
    const [clues, setClues] = useState<string[]>([]); // 当前词已给的线索
    const [forbiddenCount, setForbiddenCount] = useState(0);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false); // 正在等 AI 响应
    const [phase, setPhase] = useState<'running' | 'round-end' | 'all-end'>('running');
    const [guessWindowOpen, setGuessWindowOpen] = useState(false); // 猜词窗口是否打开

    const scoresRef = useRef<Record<string, number>>(
        Object.fromEntries(participants.map((p) => [p.id, p.score || 0]))
    );
    const usedWordsRef = useRef<Set<string>>(new Set());
    const roundRef = useRef(0);
    const describerIdxRef = useRef(0);
    const windowNoRef = useRef(0);
    const cluesRef = useRef<string[]>([]);
    const forbiddenRef = useRef(0);
    const wordsSolvedRef = useRef(0); // 当前描述者本轮猜中数
    const guessesRef = useRef<Record<string, number>>({}); // 各人猜中数
    const timerRef = useRef<number | null>(null);
    const bubbleArrRef = useRef<Bubble[]>([]);
    const runningRef = useRef(false);
    const startedRef = useRef(false);
    const currentWordRef = useRef<string | null>(null);

    const roundTotal = settings.totalRounds;
    const isUserDescriber = participants[describerIdx]?.isUser;

    const appendBubble = useCallback((b: Bubble) => {
        bubbleArrRef.current = [...bubbleArrRef.current, b];
        setBubbles(bubbleArrRef.current);
    }, []);

    // ---- 取词 ----
    const nextWord = useCallback(async (): Promise<string | null> => {
        let word: string | null = null;
        if (settings.aiGenerate) {
            const catLabel = WORD_LABEL[settings.categories[Math.floor(Math.random() * settings.categories.length)]];
            word = await generateAWord(subApi, mainApi, settings.fallbackToMain, catLabel);
        }
        if (!word) {
            word = pickWord(settings.categories as WordCategory[], usedWordsRef.current);
        }
        usedWordsRef.current.add(word);
        setCurrentWord(word);
        currentWordRef.current = word;
        setWindowNo(0);
        setClues([]);
        windowNoRef.current = 0;
        cluesRef.current = [];
        return word;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings]);

    // ---- 清定时器 ----
    const clearTimer = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    // ---- AI 描述者自动描述（NPC/角色作为描述者时调副 API 生成描述）----
    // 用 function 声明确保 hoist，避免 useCallback 闭包 TDZ 问题。
    async function doAiDescribe(d: Participant, word: string): Promise<void> {
        if (!runningRef.current) return;
        const bannedChars = [...word];
        const personaHint = d.isNpc ? `（NPC，${d.persona || '普通玩家'}）` : `（你的角色性格：${d.persona || ''}）`;
        const res = await callGameApi(subApi, mainApi, settings.fallbackToMain, {
            messages: [{ role: 'user', content: describePrompt(d.name, word, bannedChars, personaHint, 1) }],
            temperature: 0.8,
            maxTokens: 60,
            purpose: 'AI描述',
        });
        if (!runningRef.current) return;
        if (!res.ok || !res.text) {
            appendBubble(makeBubble({ kind: 'system', text: `${d.name} 想了半天没说话…` }));
            cluesRef.current = [...cluesRef.current, '（描述者卡壳，主持人引导）'];
            setClues(cluesRef.current);
            return;
        }
        let clue = res.text.trim().replace(/^["'「」]+|["'「」]+$/g, '').split('\n')[0].trim();
        const forbidden = clue ? forbiddenInGuess(clue, word) : null;
        if (forbidden && clue) {
            clue = `不能直接说，是个常见的东西（提示 ${bannedChars.length} 个字）`;
        }
        if (!clue) clue = '大家看看，这是什么？';
        cluesRef.current = [...cluesRef.current, clue];
        setClues(cluesRef.current);
        appendBubble(makeBubble({ kind: 'describe', fromId: d.id, fromName: d.name, text: clue, isUser: false }));
    }

    // ---- 开始一轮（指定描述者） ----
    const startTurn = useCallback(async (idx: number) => {
        runningRef.current = true;
        setPhase('running');
        setDescriberIdx(idx);
        describerIdxRef.current = idx;
        setForbiddenCount(0);
        forbiddenRef.current = 0;
        wordsSolvedRef.current = 0;
        setTimeLeft(settings.timeLimit);
        setBusy(false);
        setGuessWindowOpen(false);

        const d = participants[idx];
        appendBubble(makeBubble({ kind: 'system', text: hostLine('describeTurn', d.name, String(settings.timeLimit)) }));

        const word = await nextWord();
        if (!word) { appendBubble(makeBubble({ kind: 'system', text: '词库用完了，本局结束' })); endAll(); return; }

        // 用户是描述者：显示"你的词"遮罩（其他人看不到词，这里在用户 UI 顶部显示）
        if (d.isUser) {
            appendBubble(makeBubble({ kind: 'user-describer', text: `🎯 你的词：${word}（不能说：${[...word].join('、')}）` }));
        }

        // 启动倒计时
        clearTimer();
        timerRef.current = window.setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) { clearTimer(); endTurn(describerIdxRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);

        // 描述者是 NPC/角色：自动调副 API 生成描述（违禁字检测后）→ 触发猜词窗口
        if (!d.isUser) {
            setBusy(true);
            await doAiDescribe(d, word);
            setBusy(false);
            if (runningRef.current && currentWordRef.current) {
                await openGuessWindow();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings, participants, nextWord]);

    // ---- 描述（用户/描述者输入） ----
    const handleDescribe = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');
        if (!runningRef.current) return;
        const d = participants[describerIdxRef.current];

        // 违禁字检测
        const forbidden = currentWord ? forbiddenInGuess(text, currentWord) : null;
        if (forbidden) {
            const n = forbiddenRef.current + 1;
            forbiddenRef.current = n;
            setForbiddenCount(n);
            appendBubble(makeBubble({ kind: 'host', fromName: HOST_NAME, text: hostLine('forbidden', forbidden, String(n)) }));
            if (n >= 2) {
                appendBubble(makeBubble({ kind: 'system', text: hostLine('describerOut', d.name) }));
                clearTimer();
                // 换下一位描述者
                const nextIdx = (describerIdxRef.current + 1) % participants.length;
                if (roundRef.current + 1 >= roundTotal) { endAll(); return; }
                setRound((r) => r + 1); roundRef.current++;
                startTurn(nextIdx);
                return;
            }
            return;
        }

        // 正常描述：加入线索，触发猜词窗口
        cluesRef.current = [...cluesRef.current, text];
        setClues(cluesRef.current);
        appendBubble(makeBubble({ kind: 'describe', fromId: d.id, fromName: d.name, text, isUser: d.isUser }));
        await openGuessWindow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    };

    // ---- 用户抢答 ----
    const handleUserGuess = async () => {
        const text = input.trim();
        if (!text) return;
        setInput('');
        if (!runningRef.current || !currentWord) return;
        appendBubble(makeBubble({ kind: 'guess', fromId: 'user', fromName: participants.find((p) => p.isUser)?.name || '你', text, isUser: true }));
        if (isCorrectGuess(text, currentWord)) {
            onCorrect('user');
        } else {
            appendBubble(makeBubble({ kind: 'system', text: '再猜猜~' }));
        }
    };

    // ---- 猜中：加分 + 换词 ----
    const onCorrect = useCallback(async (guesserId: string) => {
        if (!runningRef.current) return;
        if (guesserId === 'user') {
            const uid = participants.find((p) => p.isUser)?.id || 'user';
            scoresRef.current[uid] = (scoresRef.current[uid] || 0) + 1;
            guessesRef.current[uid] = (guessesRef.current[uid] || 0) + 1;
            appendBubble(makeBubble({ kind: 'correct', text: hostLine('correct', participants.find((p) => p.id === uid)?.name || '你', participants[describerIdxRef.current]?.name) }));
        } else {
            scoresRef.current[guesserId] = (scoresRef.current[guesserId] || 0) + 1;
            guessesRef.current[guesserId] = (guessesRef.current[guesserId] || 0) + 1;
            appendBubble(makeBubble({ kind: 'correct', text: hostLine('correct', participants.find((p) => p.id === guesserId)?.name || '有人', participants[describerIdxRef.current]?.name) }));
        }
        // 描述者 +1
        const did = participants[describerIdxRef.current]?.id;
        if (did) scoresRef.current[did] = (scoresRef.current[did] || 0) + 1;
        wordsSolvedRef.current++;

        // 立即换下一个词（同一描述者继续）
        setGuessWindowOpen(false);
        const word = await nextWord();
        if (!word) { appendBubble(makeBubble({ kind: 'system', text: '词库用完' })); endAll(); return; }
        const d = participants[describerIdxRef.current];
        if (d?.isUser) {
            appendBubble(makeBubble({ kind: 'user-describer', text: `🎯 你的词：${word}（不能说：${[...word].join('、')}）` }));
            appendBubble(makeBubble({ kind: 'system', text: hostLine('newWord', word) }));
        } else {
            // NPC/角色描述者：自动描述 + 触发新猜词窗口
            appendBubble(makeBubble({ kind: 'system', text: hostLine('newWord', word) }));
            setBusy(true);
            await doAiDescribe(d, word);
            setBusy(false);
            if (runningRef.current && currentWordRef.current) {
                await openGuessWindow();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participants, nextWord]);

    // ---- 猜词窗口：其余参与者并发猜词 + 用户抢答 ----
    const openGuessWindow = useCallback(async () => {
        if (!runningRef.current) return;
        const w = windowNoRef.current + 1;
        windowNoRef.current = w;
        setWindowNo(w);
        setGuessWindowOpen(true);

        const describer = participants[describerIdxRef.current];
        const guessers = participants.filter((p) => p.id !== describer.id && !p.isUser); // 角色/NPC 猜词者
        const currentWordCopy = currentWord;

        // 并发调用所有 AI 猜词者，逐个返回即展示/判中（先到先得），不等全部
        let hit = false; // 是否已有人猜中（猜中即锁定，后续返回忽略）
        const guessedCorrect = await new Promise<boolean>((resolveAll) => {
            let pending = guessers.length;
            if (pending === 0) { resolveAll(false); return; }
            const done = (ok: boolean) => { if (ok) resolveAll(true); else { pending--; if (pending === 0) resolveAll(false); } };
            guessers.forEach((g) => {
                doAiGuess(g, cluesRef.current, w - 1).then((r) => {
                    if (!runningRef.current || !currentWordCopy || hit) return;
                    if (!r) { done(false); return; }
                    // 逐条展示
                    appendBubble(makeBubble({ kind: 'guess', fromId: r.guesserId, fromName: participants.find((p) => p.id === r.guesserId)?.name || '', text: r.answer, isUser: false }));
                    if (r.hit) {
                        hit = true;
                        done(true);
                        // 猜中：加分 + 换词（先到先得）
                        onCorrect(r.guesserId);
                    } else {
                        done(false);
                    }
                }).catch(() => done(false));
            });
        });
        // 有人猜中：onCorrect 已触发（内部换词+新窗口），这里不再继续
        if (hit || guessedCorrect === true) return;

        if (w >= 2) {
            // 第二个窗口仍无人猜中 → 揭晓 → 换词
            appendBubble(makeBubble({ kind: 'system', text: hostLine('reveal', currentWordCopy || '?') }));
            const word = await nextWord();
            if (!word) { endAll(); return; }
            const d = participants[describerIdxRef.current];
            if (d?.isUser) {
                appendBubble(makeBubble({ kind: 'user-describer', text: `🎯 你的词：${word}（不能说：${[...word].join('、')}）` }));
                appendBubble(makeBubble({ kind: 'system', text: hostLine('newWord', word) }));
            } else {
                // NPC/角色描述者：自动描述 + 触发新猜词窗口
                appendBubble(makeBubble({ kind: 'system', text: hostLine('newWord', word) }));
                setBusy(true);
                await doAiDescribe(d, word);
                setBusy(false);
                if (runningRef.current && currentWordRef.current) {
                    await openGuessWindow();
                }
            }
        } else {
            // 窗口#1 无人猜中：主持人引导再描述
            appendBubble(makeBubble({ kind: 'host', fromName: HOST_NAME, text: hostLine('clue') }));
            setGuessWindowOpen(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participants, currentWord, onCorrect, nextWord]);

    // ---- 单个 AI 猜词 ----
    const doAiGuess = async (g: Participant, clueList: string[], clueIdx: number) => {
        try {
            const res = await callGameApi(subApi, mainApi, settings.fallbackToMain, {
                system: undefined,
                messages: [{ role: 'user', content: guessPrompt(g.name, g.isNpc ? `（NPC，${g.persona || '普通玩家'}）` : `（你的角色性格：${g.persona || ''}）`, clueList, clueIdx) }],
                temperature: 0.7,
                maxTokens: 60,
                purpose: '猜词',
            });
            if (!res.ok || !res.text) return null;
            const answer = res.text.trim();
            // 猜中判定（先到先得在本函数返回后由调用方统一判定）
            const hit = isCorrectGuess(answer, currentWord || '');
            return { guesserId: g.id, answer, hit };
        } catch (e) {
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    };

    // ---- 结束当前描述者本轮 ----
    const endTurn = (idx: number) => {
        clearTimer();
        runningRef.current = false;
        setPhase('round-end');
        const d = participants[idx];
        appendBubble(makeBubble({ kind: 'system', text: hostLine('summary', d.name, String(wordsSolvedRef.current)) }));
        setBusy(true);

        // 判断是否所有轮次结束
        setTimeout(() => {
            const nextIdx = (idx + 1) % participants.length;
            const done = roundRef.current + 1 >= roundTotal;
            if (done) {
                endAll();
            } else {
                setRound((r) => r + 1); roundRef.current++;
                setBusy(false);
                startTurn(nextIdx);
            }
        }, 1500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    };

    // ---- 全部结束 → 结算 ----
    const endAll = () => {
        clearTimer();
        runningRef.current = false;
        setPhase('all-end');
        // 组装结果
        const finalParticipants = participants.map((p) => ({ ...p, score: scoresRef.current[p.id] || 0 }));
        const sorted = [...finalParticipants].sort((a, b) => b.score - a.score);
        const mvp = sorted[0];
        const user = sorted.find((p) => p.isUser);
        const transcript = bubbleArrRef.current.map((b) => {
            if (b.kind === 'system' || b.kind === 'host') return `[${b.fromName}] ${b.text}`;
            return `${b.fromName}：${b.text}`;
        }).join('\n');
        const summary = `【你说我猜】你们 ${participants.length} 人玩了 ${roundTotal} 轮，${user?.name || '你'}${user ? `猜中 ${guessesRef.current[user.id] || 0} 次得 ${user.score} 分` : ''}，${mvp?.name || ''} 得 ${mvp?.score || 0} 分拿了 MVP。`;
        const charIds = participants.filter((p) => !p.isUser && !p.isNpc).map((p) => p.id);

        const result: CharadesResult = {
            participants: finalParticipants,
            transcript,
            summary,
            mvpName: mvp?.name || '',
            mvpScore: mvp?.score || 0,
            myScore: user?.score || 0,
            charIds,
        };
        // 让 UI 展示结算前先延迟（结算页由 CharadesApp 渲染）
        setTimeout(() => onFinish(result), 800);
    };

    // 卸载清理
    useEffect(() => () => clearTimer(), []);

    // 挂载即开局（首轮，描述者=0）。StrictMode 下双调用保护：startedRef 幂等。
    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        startTurn(0);
        /* eslint-disable-line react-hooks/exhaustive-deps */
    }, []);

    const describer = participants[describerIdx];

    return (
        <div className="h-full w-full flex flex-col bg-slate-50 relative overflow-hidden">
            {/* 顶栏状态 */}
            <div className="shrink-0 px-4 py-3 bg-white border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-600">第 {Math.min(roundRef.current + 1, roundTotal)}/{roundTotal} 轮</span>
                        <span className="text-xs text-slate-400">描述者：{describer?.name}</span>
                    </div>
                    <span className={`text-sm font-bold ${timeLeft <= 10 ? 'text-red-500' : 'text-slate-700'}`}>⏱ {timeLeft}s</span>
                </div>
                {/* 分数条 */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {participants.map((p) => (
                        <span key={p.id} className={`text-[10px] px-2 py-0.5 rounded-full ${p.isUser ? 'bg-amber-100 text-amber-700 font-bold' : 'bg-slate-100 text-slate-500'}`}>
                            {p.name} {scoresRef.current[p.id] || 0}分
                        </span>
                    ))}
                </div>
            </div>

            {/* 描述者视角遮罩（用户是描述者时显示自己的词） */}
            {isUserDescriber && currentWord && (
                <div className="shrink-0 mx-4 mt-3 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                    <p className="text-xs text-indigo-400 font-bold mb-0.5">🎯 你是描述者</p>
                    <p className="text-sm font-bold text-indigo-700">你的词：{currentWord}（不能说：{[...currentWord].join('、')}）</p>
                </div>
            )}

            {/* 消息流 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {bubbles.map((b) => {
                    if (b.kind === 'system' || b.kind === 'host') {
                        return (
                            <div key={b.id} className="flex justify-center">
                                <span className="text-[11px] px-3 py-1.5 rounded-full bg-slate-200 text-slate-600 font-bold max-w-[90%] text-center">{b.text}</span>
                            </div>
                        );
                    }
                    const isRight = b.isUser;
                    return (
                        <div key={b.id} className={`flex ${isRight ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                            {!isRight && (
                                <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ background: b.fromId ? (b.fromId.startsWith('npc') ? `hsl(${participants.find((p) => p.id === b.fromId)?.hue || 200}, 55%, 45%)` : '#c3b2ff') : '#94a3b8' }}>
                                    {(b.fromName || '·').slice(0, 1)}
                                </span>
                            )}
                            <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-[13px] leading-snug ${isRight ? 'bg-amber-500 text-white rounded-br-sm' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-sm'}`}>
                                <p className="text-[10px] font-bold mb-0.5 opacity-70">{b.fromName}</p>
                                {b.text}
                            </div>
                        </div>
                    );
                })}
                {busy && <div className="text-center text-[11px] text-slate-400 py-2">描述者思考中…</div>}
            </div>

            {/* 输入区 */}
            <div className="shrink-0 p-3 bg-white border-t border-slate-100 flex items-center gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); isUserDescriber ? handleDescribe() : handleUserGuess(); } }}
                    placeholder={isUserDescriber ? '描述你的词…' : '输入你的猜测抢答…'}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                />
                <button
                    onClick={isUserDescriber ? handleDescribe : handleUserGuess}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold cursor-pointer"
                >{isUserDescriber ? '描述' : '猜'}</button>
                <button onClick={() => onQuit(null)} className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-sm font-bold cursor-pointer">退出</button>
            </div>
        </div>
    );
}

const WORD_LABEL: Record<string, string> = {
    animal: '动物', food: '食物', idiom: '成语', film: '影视', game: '游戏',
};
