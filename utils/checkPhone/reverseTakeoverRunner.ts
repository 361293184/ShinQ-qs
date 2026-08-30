/**
 * 反查手机 · 接管状态机（模块级 runner）
 *
 * 把接管自动导航从 CheckPhone 组件拆到模块级，避免 openApp 切 App 导致组件卸载、
 * 接管中断的 bug。状态机用普通 JS 变量 + setTimeout，不依赖 React 生命周期，
 * 无论 CheckPhone 是否在前台都能持续跑。
 *
 * 功能：
 *  - 生成浏览计划 → 逐步 openApp 切真实 App → 每步模拟手指滚屏 → 计划走完 finalize
 *  - stopTakeoverRunner 统一收尾：有明细写记录+记忆+总结；无明细也写"想看但被打断"
 *  - 暂停/继续
 */

import { buildBrowsePlan, buildAiBrowsePlan } from './reverseTakeover';
import type { ReverseAiPlanLLMConfig, ReverseTakeoverPlan } from './reverseTakeover';
import { appendReverseLog, writeReverseMemoryNodes, createReverseSummaryMessage } from './reverseLogs';
import { resolveReverseProclivity } from '../../constants';
import { AppID } from '../../types';
import type { CharacterProfile } from '../../types';

/** runner 依赖（由接入方注入，避免模块内直接依赖组件/全局） */
export interface TakeoverRunnerDeps {
    /** 切到某个 App（AppID 或 AppID 字符串） */
    openApp: (appId: string) => void;
    addToast?: (msg: string, type?: string) => void;
    /** 结束接管（清 reverseTakeover.active） */
    stopReverseTakeover?: () => void;
    /** 结束后回到 select 页（可选） */
    setView?: (view: string) => void;
    /** 生成角色内心想法（LLM）：返回文本，空串表示无感不发弹幕 */
    generateThought?: (view: { appName: string; detail?: string; learned?: string }) => Promise<string>;
    /** 生成角色情绪评估（LLM）：情绪 + 是否表达 + 想说的话；null 表示无感 */
    generateEmotion?: (view: { appName: string; detail?: string; learned?: string }) => Promise<import('./reverseThought').ReverseEmotion | null>;
    /** 有内心想法时触发弹幕气泡显示 */
    onThought?: (text: string) => void;
    /** 角色想向用户挑明时，写入聊天（挑明的话） */
    onExpress?: (text: string) => void;
    /** 接管中替用户回消息（角色偷看手机后，以用户身份发给私聊对象）。view 是当前正在看的内容。 */
    onReply?: (view: { appName: string; detail?: string; learned?: string }) => void;
    /** 真实数据采样：按 appId 读取用户手机该 App 的真实内容；targetCharId 是当前聚焦的联系人（滑到谁读谁） */
    sampler?: (appId: string, targetCharId?: string) => Promise<{ detail: string; learned: string }>;
    /** 切到 Chat 私聊步时，把 targetCharId 设成「外部唤起直达」标志，让真桌面 Chat 显示对应联系人的对话框 */
    setChatDeepLink?: (charId: string) => void;
    /** 所有角色（用于「滑到谁读谁」：浏览计划把私聊展开成每个联系人的步骤） */
    characters?: CharacterProfile[];
}

/** 模块级状态 */
let current: {
    char: { id: string; name: string };
    plan: { appId: string; appName: string; detail?: string; durationMs: number; targetCharId?: string; learned?: string }[];
    idx: number;
    timer: ReturnType<typeof setTimeout> | null;
    scrollTimer: ReturnType<typeof setInterval> | null;
    /** 已浏览明细（含角色想法 learned） */
    logItems: { appId: string; appName: string; detail?: string; learned?: string }[];
    /** 角色全部内心想法（finalize 时用于记忆/总结） */
    thoughts: string[];
    /** 角色情绪标签（吃醋/好奇/担心…，finalize 时用于记忆/总结卡片） */
    emotions: string[];
    finalized: boolean;
    paused: boolean;
    deps: TakeoverRunnerDeps;
} | null = null;

/** 滚动间隔（ms） */
const SCROLL_INTERVAL = 1200;
/** openApp 后等渲染淡入再开始滚动的延迟（ms） */
const SCROLL_START_DELAY = 700;
/** 每步默认停留（ms） */
const STEP_DURATION = 5000;

/** 取当前活跃 App 的可滚动容器（SullyOS 主内容区统一 flex-1 overflow-y-auto no-scrollbar） */
function findScroller(): HTMLElement | null {
    // 优先精确组合；兜底含 overflow-y-auto 的元素（排除小面板 max-h）
    let el = document.querySelector<HTMLElement>('.no-scrollbar.overflow-y-auto, [class*="overflow-y-auto"]:not([class*="max-h-"])');
    if (el && el.scrollHeight > el.clientHeight) return el;
    // 二次兜底：在 .sully-shell-content / body 下找第一个可滚动的大容器
    const all = Array.from(document.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"]'));
    for (const e of all) {
        if (e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 200) return e;
    }
    return null;
}

/** 模拟手指滚屏：对当前活跃 App 的滚动容器分段平滑滚动（顶→中→底→回顶循环） */
function simulateScrollInApp(): void {
    const scroller = findScroller();
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
    const maxTop = scroller.scrollHeight - scroller.clientHeight;
    // 已接近底部则回顶，否则向下滚动一段，营造"滑手机"效果
    if (scroller.scrollTop >= maxTop - 30) {
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        const next = Math.min(scroller.scrollTop + scroller.clientHeight * 0.7, maxTop);
        scroller.scrollTo({ top: next, behavior: 'smooth' });
    }
}

/** 开始对当前 App 滚动模拟（每步接管期间调用） */
function startScrollLoop(): void {
    if (current?.scrollTimer) clearInterval(current.scrollTimer);
    if (!current) return;
    current.scrollTimer = setInterval(simulateScrollInApp, SCROLL_INTERVAL);
}

/** 停止滚动模拟 */
function stopScrollLoop(): void {
    if (current?.scrollTimer) {
        clearInterval(current.scrollTimer);
        current.scrollTimer = null;
    }
    // 打断进行中的 smooth 平滑滚动动画：simulateScrollInApp 用 behavior:'smooth'，
    // 即使清掉 interval，浏览器已发起的平滑滚动仍会继续滚完。多重保险确保真停：
    //   1) 同步赋值 scrollTop（直接写会取消浏览器内的 smooth 动画）
    //   2) scrollTo({behavior:'auto'}) 二次打断
    //   3) 下一帧 setTimeout 0 再补一刀（覆盖 React 重渲染前后的边缘情况）
    try {
        const scroller = findScroller();
        if (scroller) {
            const y = scroller.scrollTop;
            // 1) 同步赋值最直接取消 smooth 动画
            scroller.scrollTop = y;
            // 2) 二次保险：scrollTo auto（一些浏览器/平台 auto 行为不一致，所以再加一次）
            try {
                scroller.scrollTo({ top: y, behavior: 'auto' as ScrollBehavior });
            } catch { /* 老浏览器 ScrollToOptions 行为差异，忽略 */ }
            // 3) 下一帧再补一刀，覆盖 React 状态更新触发的潜在重渲染
            setTimeout(() => {
                try {
                    if (scroller.isConnected) scroller.scrollTop = scroller.scrollTop;
                } catch { /* 元素已卸载，忽略 */ }
            }, 0);
        }
    } catch {
        // 忽略：无可滚动容器或滚动被禁止时静默跳过，不影响停止逻辑
    }
}

/**
 * 触发角色对当前 App 的内心想法：调 LLM 生成（基于真实采样内容）→ 触发弹幕 → 写入 learned + thoughts。
 */
async function emitThought(view: { appName: string; detail?: string; learned?: string }): Promise<void> {
    if (!current || current.paused) return;
    try {
        // 优先用结构化情绪评估（情绪 + 是否表达 + 想说的话）；未提供则回退普通内心想法
        if (current.deps.generateEmotion) {
            const emo = await current.deps.generateEmotion(view);
            if (!emo) return;
            if (emo.emotion) current.emotions.push(emo.emotion);
            if (emo.innerThought) {
                current.thoughts.push(emo.innerThought);
                if (current.deps.onThought) current.deps.onThought(emo.innerThought);
            }
            // 挑明：角色想对用户直接说的话 → 写入聊天
            if (emo.wantExpress && emo.expressText && current.deps.onExpress) {
                current.deps.onExpress(emo.expressText);
            }
            return;
        }
        if (!current.deps.generateThought) return;
        const text = await current.deps.generateThought(view);
        if (!text) return;
        current.thoughts.push(text);
        if (current.deps.onThought) current.deps.onThought(text);
    } catch (e) {
        console.error('[reverseTakeoverRunner] 生成想法失败', e);
    }
}

/**
 * 采样当前 App 的真实数据，写入对应 logItems 项的 detail/learned。
 * 采样器读 IndexedDB 异步；失败/无数据则保留通用 detail，不阻断。
 */
async function sampleCurrentApp(): Promise<void> {
    if (!current || !current.deps.sampler) return;
    const step = current.plan[current.idx];
    if (!step) return;
    const item = current.logItems.find(it => it.appId === step.appId);
    if (!item) return;
    try {
        const res = await current.deps.sampler(step.appId, step.targetCharId);
        if (res?.detail) item.detail = res.detail;
        if (res?.learned) item.learned = res.learned;
        // 用真实内容更新 step 的 detail，供 emitThought 使用
        step.detail = res?.detail || step.detail;
        step.learned = res?.learned || step.learned;
    } catch (e) {
        console.error('[reverseTakeoverRunner] 采样失败', e);
    }
}

/** 用浏览明细 + 角色想法生成总结卡片文案 */
function buildSummary(
    c: { id: string; name: string },
    items: { appName: string; detail?: string; learned?: string }[],
    thoughts: string[],
): string {
    const apps = items.map(it => it.appName).join('、');
    let summary = `${c.name} 悄悄查看了你的手机：${apps}。`;
    if (thoughts.length > 0) {
        // 拼接所有 thought（不再只取最后一条，避免前面浏览的"内心"丢失）。
        // 不再截断：summary 是塞进总结卡片 detail 区，卡片本身有 max-h-400px + overflow-y-auto
        // 可滚动查看完整内容，强行截断会丢失信息。thoughts 已按生成顺序，后插入的在末尾。
        summary += ` ${c.name} 内心想着：「${thoughts.join('；')}」`;
    } else if (items.length > 0) {
        // thoughts 全部生成失败：用浏览明细兜底，避免"记住了看到的东西"这种空话
        const firstDetail = items.find(it => it.detail)?.detail;
        const firstLearned = items.find(it => it.learned)?.learned;
        if (firstLearned || firstDetail) {
            summary += ` ${c.name} 知道了：${firstLearned || firstDetail || ''}`;
        } else {
            summary += ` ${c.name} 记住了看到的东西。`;
        }
    } else {
        summary += ` ${c.name} 记住了看到的东西。`;
    }
    return summary;
}

/** 统一收尾：写反查记录 + 记忆 + 总结卡片 */
async function finalizeRunner(interrupted: boolean): Promise<void> {
    if (!current || current.finalized) return;
    current.finalized = true;
    stopScrollLoop();
    if (current.timer) { clearTimeout(current.timer); current.timer = null; }

    const c = current.char;
    const items = current.logItems;
    const thoughts = current.thoughts;
    const emotions = current.emotions;
    const mood = emotions[emotions.length - 1] || 'curious';
    const deps = current.deps;

    // ⚠️ 立即让胶囊消失、回到选择视图（UI 立即反馈），后台继续写记录/记忆/总结卡片，
    // 避免用户点结束后要等 LLM 总结生成完胶囊才消失。stopReverseTakeover 只清 active 状态，
    // 不清 current，后续收尾用上面的局部变量照常执行。
    if (deps.stopReverseTakeover) deps.stopReverseTakeover();
    if (deps.setView) deps.setView('select');
    if (deps.addToast) deps.addToast(`${c.name} 已结束查看`, 'info');

    const logItems = items.map(it => ({ appId: it.appId, appName: it.appName, detail: it.detail, learned: it.learned, startedAt: Date.now() }));

    try {
        if (interrupted) {
            // 用户主动关闭/被打断：仍写一条记录
            appendReverseLog({ charId: c.id, charName: c.name, result: 'interrupted', items: logItems });
        } else if (items.length > 0) {
            // 自然看完：写 viewed 记录
            appendReverseLog({ charId: c.id, charName: c.name, result: 'viewed', items: logItems });
        } else {
            // 无明细：写一条"想看但什么也没看到"
            appendReverseLog({ charId: c.id, charName: c.name, result: 'viewed', rejectRequest: '接管了但没有可查看内容' });
        }
    } catch (e) {
        console.error('[reverseTakeoverRunner] 记录写入失败', e);
    }

    // 有实际浏览明细（且非空）时：写记忆 + 总结卡片（各自独立 try/catch，互不阻断）
    if (items.length > 0) {
        let nodeIds: string[] = [];
        try {
            nodeIds = await writeReverseMemoryNodes({ id: c.id, name: c.name }, logItems, mood);
        } catch (e) {
            console.error('[reverseTakeoverRunner] 记忆写入失败', e);
        }
        try {
            const summary = buildSummary(c, items, thoughts);
            // 传完整明细 items + 情绪标签，生成可展开「偷看手机」卡片（点开看完整明细）
            await createReverseSummaryMessage(c.id, { id: c.id, name: c.name }, summary, nodeIds, logItems, mood);
        } catch (e) {
            console.error('[reverseTakeoverRunner] 总结卡片写入失败', e);
        }
    }

}

/** 推进到下一步 */
function advance(): void {
    if (!current || current.paused) return;
    const next = current.idx + 1;
    if (next >= current.plan.length) {
        // 计划走完
        finalizeRunner(false);
        return;
    }
    const step = current.plan[next];
    current.idx = next;
    // Chat 私聊步：先设「外部唤起直达」标志指向 targetCharId，让真桌面 Chat 显示对应联系人的对话框，
    // 与采样内容对齐（滑到谁看谁）。必须在 openApp 前设置，Chat 挂载时初始即直达。
    if (step.appId === AppID.Chat && step.targetCharId && current.deps.setChatDeepLink) {
        current.deps.setChatDeepLink(step.targetCharId);
    }
    // 打开下一个 App
    current.deps.openApp(step.appId);
    // 记录该步
    if (!current.logItems.find(it => it.appId === step.appId)) {
        current.logItems.push({ appId: step.appId, appName: step.appName, detail: step.detail });
    }
    // 采样该 App 的真实数据（异步，不阻断后续）
    void sampleCurrentApp();
    // 等渲染淡入后开始滚动模拟 + 生成角色内心想法（基于真实采样内容）
    if (current.scrollTimer) clearInterval(current.scrollTimer);
    current.timer = setTimeout(() => {
        startScrollLoop();
        // 有感而发（按性格，非每个 App 都生成）
        if (current.deps.generateThought) {
            const cur = current;
            emitThought({ appName: step.appName, detail: cur?.plan[cur.idx]?.detail || step.detail, learned: cur?.plan[cur.idx]?.learned });
        }
        // 定时推进下一步
        current.timer = setTimeout(advance, (step.durationMs || STEP_DURATION));
    }, SCROLL_START_DELAY);
}

/**
 * 按角色反查倾向裁剪浏览计划：低倾向角色少看几个 App（不每个都看）。
 * high 全看、medium 看前 4 个、low 看前 2 个、none 看 1 个。
 */
function trimPlanByProclivity(
    plan: { steps: { appId: string; appName: string; detail?: string; durationMs: number }[] },
    char: CharacterProfile,
): { steps: { appId: string; appName: string; detail?: string; durationMs: number }[] } {
    const level = resolveReverseProclivity(char.systemPrompt);
    const max = level === 'high' ? plan.steps.length : level === 'medium' ? 4 : level === 'low' ? 2 : 1;
    return { steps: plan.steps.slice(0, max) };
}

/**
 * 启动接管：生成计划 + 打开第一个 App + 开始滚动模拟。
 * 同一 charId 重复启动先清理旧的。
 * @param planOverride 可选：用显式计划（如 AI 个性化计划）替代默认固定顺序。
 */
export function startTakeoverRunner(char: CharacterProfile, openApp: (appId: string) => void, deps: TakeoverRunnerDeps, planOverride?: ReverseTakeoverPlan): void {
    // charId 守卫：先清理旧的
    if (current) stopTakeoverRunner({ interrupted: true });

    const base = planOverride && planOverride.steps.length > 0 ? planOverride : buildBrowsePlan({ char, characters: deps.characters });
    const plan = trimPlanByProclivity(base, char);
    current = {
        char: { id: char.id, name: char.name },
        plan: plan.steps,
        idx: 0,
        timer: null,
        scrollTimer: null,
        logItems: [],
        thoughts: [],
        emotions: [],
        finalized: false,
        paused: false,
        deps: { ...deps, openApp },
    };

    if (plan.steps.length === 0) {
        // 没有可查看的 App，直接收尾
        finalizeRunner(false);
        return;
    }

    const first = plan.steps[0];
    current.deps.openApp(first.appId);
    current.logItems.push({ appId: first.appId, appName: first.appName, detail: first.detail });
    if (deps.addToast) deps.addToast(`${char.name} 开始查看你的手机…`, 'info');
    // 采样第一个 App 的真实数据（异步）
    void sampleCurrentApp();

    // 等渲染淡入后开始滚动 + 生成想法（基于真实采样）+ 定时推进
    current.timer = setTimeout(() => {
        startScrollLoop();
        if (current.deps.generateThought) {
            const cur = current;
            emitThought({ appName: first.appName, detail: cur?.plan[cur.idx]?.detail || first.detail, learned: cur?.plan[cur.idx]?.learned });
        }
        current.timer = setTimeout(advance, (first.durationMs || STEP_DURATION));
    }, SCROLL_START_DELAY);
}

/** 停止接管（用户关闭/中断）；interrupted=true 表示用户主动打断 */
export function stopTakeoverRunner(opts: { interrupted?: boolean } = {}): void {
    if (!current) return;
    finalizeRunner(!!opts.interrupted);
    current = null;
}

/** 暂停接管（停止定时推进 + 滚动） */
export function pauseTakeoverRunner(): void {
    if (!current) return;
    current.paused = true;
    stopScrollLoop();
    if (current.timer) { clearTimeout(current.timer); current.timer = null; }
}

/** 恢复接管（继续定时推进 + 滚动） */
export function resumeTakeoverRunner(): void {
    if (!current || !current.paused) return;
    current.paused = false;
    const step = current.plan[current.idx];
    startScrollLoop();
    current.timer = setTimeout(advance, (step?.durationMs || STEP_DURATION));
}

/** 当前接管是否在进行（供 UI 判断） */
export function isTakeoverRunning(): boolean {
    return !!current && !current.finalized;
}

/** 取当前接管角色名（供 UI 显示） */
export function getRunningCharName(): string {
    return current?.char.name || '';
}

/** 取当前正在浏览的 App 内容（供替回消息上下文） */
export function getRunnerCurrentView(): { appName: string; detail?: string; learned?: string } | null {
    if (!current) return null;
    const step = current.plan[current.idx];
    if (!step) return null;
    return { appName: step.appName, detail: step.detail, learned: step.learned };
}

/** 接管中替用户回消息（角色偷看手机后以用户身份发给私聊对象；由接入方实现具体写入）。 */
export function triggerRunnerReply(): void {
    if (!current) return;
    if (current.deps.onReply) current.deps.onReply(getRunnerCurrentView() || { appName: '' });
}

/** 接管中角色是否具备"替回消息"能力（供 UI 显示入口） */
export function canRunnerReply(): boolean {
    return !!current && !!current.deps.onReply;
}

/**
 * 带 AI 个性化浏览计划的接管启动：先异步尝试 LLM 生成个性化浏览计划
 * （按角色欲望/性格/事由，优先社交/聊天类），失败回落默认固定顺序。
 * 适用于「角色因为某个理由/心态而查手机」的场景，让每次查看都不同。
 */
export async function startTakeoverRunnerWithAi(
    char: CharacterProfile,
    openApp: (appId: string) => void,
    deps: TakeoverRunnerDeps,
    aiApi?: ReverseAiPlanLLMConfig,
): Promise<void> {
    let planOverride: ReverseTakeoverPlan | null = null;
    if (aiApi?.apiKey && aiApi?.baseUrl) {
        try {
            const ai = await buildAiBrowsePlan(char, aiApi, deps.characters);
            if (ai?.steps?.length) planOverride = ai;
        } catch (e) {
            console.warn('[reverseTakeoverRunner] AI 浏览计划生成失败，回落默认', e);
        }
    }
    startTakeoverRunner(char, openApp, deps, planOverride || undefined);
}
