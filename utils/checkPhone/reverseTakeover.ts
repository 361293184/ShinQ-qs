/**
 * 反查手机 · 接管状态机（纯逻辑）
 *
 * 「接管整个 SullyOS」的自动导航驱动。职责：
 *  - 生成浏览计划（默认：按固定顺序浏览有权限的 App；可注入 AI 计划）
 *  - 逐步骤推进（打开 App → 停留浏览 → 记录看了什么 → 下一步）
 *  - 权限校验（导航前检查；设置硬禁止）
 *  - 暂停/继续/关闭
 *
 * 状态机本身不持有 React 状态，由 OSContext/覆盖层在渲染层驱动；
 * 这里提供纯函数：构建计划、推进、校验、把 App 映射成"看了什么"。
 */

import { INSTALLED_APPS } from '../../constants';
import { AppID } from '../../types';
import type { CharacterProfile, ReverseCheckItem, ReverseTakeoverState } from '../../types';
import { safeResponseJson, extractContent } from '../safeApi';
import { isReverseAppAllowed } from './reversePermissions';

/** 副 API 最小配置（AI 个性化浏览计划用） */
export interface ReverseAiPlanLLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

/** 浏览计划里的一步 */
export interface ReverseTakeoverStep {
    /** 要打开的 App id */
    appId: string;
    /** App 中文名 */
    appName: string;
    /** 这一步"看了什么"的 detail 描述（可从角色上下文/聊天生成，缺省用通用描述） */
    detail?: string;
    /** 这一步停留时长 ms */
    durationMs: number;
    /** 这一步记录的「角色知道了什么」（可选，基于真实界面内容） */
    learned?: string;
    /** 当前聚焦的聊天对象 id（「滑到谁读谁」：只读这个联系人的私聊；非聊天步骤可省略） */
    targetCharId?: string;
}

/** 一个浏览计划 */
export interface ReverseTakeoverPlan {
    steps: ReverseTakeoverStep[];
}

/** 默认：每个 App 停留时长（ms） */
export const DEFAULT_STEP_DURATION = 4500;

/** 用户反查的启动角色参数 */
export interface ReverseTakeoverInit {
    char: CharacterProfile;
    systemPrompt?: string;
    /** 所有角色（用于「滑到谁读谁」：把私聊展开成每个联系人的步骤） */
    characters?: CharacterProfile[];
}

/**
 * 生成浏览计划：按固定顺序浏览所有「允许被查看」的 App。
 * 设置 App 自动剔除；Chat 优先（角色最想看聊天）。
 * 如需 AI 生成的个性计划，可在 UI 层调用 buildAiBrowsePlan 覆盖默认结果。
 */
export function buildBrowsePlan(init: ReverseTakeoverInit): ReverseTakeoverPlan {
    // Chat 优先看，其余按 INSTALLED_APPS 顺序。
    // 排除：CheckPhone 自身（避免递归接管）、Launcher 桌面（无实义）。
    const EXCLUDED = new Set<string>([AppID.CheckPhone, AppID.Launcher]);
    const preferred = [AppID.Chat, AppID.Social, AppID.Gallery, AppID.GroupChat, AppID.MemoryPalace];
    const ordered = [
        ...preferred,
        ...INSTALLED_APPS.map(a => a.id).filter(id => !preferred.includes(id as AppID) && !EXCLUDED.has(id)),
    ];

    const appNameOf = (id: string) => INSTALLED_APPS.find(a => a.id === id)?.name || id;

    const steps: ReverseTakeoverStep[] = [];
    const contacts = (init.characters || [])
        .filter(c => c.id !== init.char.id) // 看用户和别人/其他角色的私聊；接管角色自己单独放前面
        .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
    for (const appId of ordered) {
        // 权限校验：设置永远不可进；无权限的跳过
        if (!isReverseAppAllowed(appId)) continue;
        const name = appNameOf(appId);
        // 私聊：展开成「每个联系人的私聊」步骤——角色滑到谁，采样只读谁的（滑到谁读谁）
        if (appId === AppID.Chat && contacts.length > 0) {
            steps.push({
                appId,
                appName: `${name}（${init.char.name}）`,
                detail: `打开和「${init.char.name}」的私聊`,
                durationMs: DEFAULT_STEP_DURATION,
                targetCharId: init.char.id,
            });
            for (const contact of contacts) {
                steps.push({
                    appId,
                    appName: `${name}（${contact.name}）`,
                    detail: `点开和「${contact.name}」的私聊`,
                    durationMs: DEFAULT_STEP_DURATION,
                    targetCharId: contact.id,
                });
            }
            continue;
        }
        steps.push({
            appId,
            appName: name,
            detail: `浏览了「${name}」`,
            durationMs: DEFAULT_STEP_DURATION,
        });
    }
    return { steps };
}

/** 从消息上下文生成某个 App 这一步的"看了什么"（无 LLM，简单规则） */
export function describeStepView(step: ReverseTakeoverStep): ReverseCheckItem {
    return {
        appId: step.appId,
        appName: step.appName,
        detail: step.detail || `浏览了「${step.appName}」`,
        startedAt: Date.now(),
        endedAt: Date.now() + step.durationMs,
        learned: step.learned,
    };
}

/** 校验某 App 当前是否可被接管查看 */
export function canTakeoverApp(appId: string): boolean {
    return isReverseAppAllowed(appId);
}

/** 接管总时长上限（ms），超出自动结束，防失控 */
export const MAX_TAKEOVER_DURATION = 120_000;

/** 判断接管是否超时 */
export function isTakeoverExpired(state: ReverseTakeoverState): boolean {
    if (!state.active || !state.startedAt) return false;
    return Date.now() - state.startedAt > MAX_TAKEOVER_DURATION;
}

/** 空计划（无任何可查看 App 时兜底） */
export function emptyPlan(): ReverseTakeoverPlan {
    return { steps: [] };
}

// ─── AI 个性化浏览计划 ────────────────────────────────────────────────────────

/** 可让 LLM 挑选的「有查看意义的 App」及其用途说明（优先放社交/聊天类，角色最想看你跟谁聊） */
const AI_SELECTABLE_APPS: { id: string; name: string; hint: string }[] = [
    { id: AppID.Chat, name: '私聊', hint: '用户和别人的私聊记录（最可能看到暧昧/重要内容）' },
    { id: AppID.Social, name: '朋友圈', hint: '用户发的动态、照片、和别人互动' },
    { id: AppID.GroupChat, name: '群聊', hint: '用户所在的群聊消息' },
    { id: AppID.Gallery, name: '相册', hint: '用户的照片、自拍、截图' },
    { id: AppID.Journal, name: '手账', hint: '用户的日程、打卡、碎碎念日记' },
    { id: AppID.MemoryPalace, name: '记忆宫殿', hint: '用户的记忆/心事记录' },
    { id: AppID.Schedule, name: '日程', hint: '用户的行程安排、和谁约了见面' },
    { id: AppID.Browser, name: '浏览器', hint: '用户最近搜了什么东西（可能暴露心思）' },
    { id: AppID.Music, name: '音乐', hint: '用户最近听的歌（能反映心情）' },
    { id: AppID.Room, name: '房间', hint: '用户的虚拟房间布置' },
];

/** 构建 AI 浏览计划的 prompt */
export function buildAiBrowsePlanPrompt(charName: string, persona: string, userName: string): string {
    const options = AI_SELECTABLE_APPS
        .map(a => `${a.id}（${a.name}：${a.hint}）`)
        .join('\n');
    return [
        `你正在决定「${charName}」偷看「${userName}」手机时，最想看哪些 App、按什么顺序。`,
        `角色设定：${persona || '（无）'}`,
        ``,
        `「${charName}」此刻是出于欲望/好奇/吃醋/担心/八卦在看手机，最想了解 ${userName} 的真实生活。`,
        `请基于 ${charName} 的性格和可能的心态，选出 3~6 个最想看的 App 并排好顺序（第一个是 TA 最想看的）。`,
        `【可选的 App】`,
        options,
        ``,
        `注意：`,
        `- 优先选社交/聊天类（私聊、朋友圈、群聊）——角色最想知道用户跟谁聊了什么。`,
        `- 选真正符合角色性格和此时心态的，不要每次都一样。`,
        `- 只输出一个 JSON：{"apps":["appId1","appId2",...]}，appId 必须是上面列出的 id。`,
    ].join('\n');
}

/** 解析 AI 计划返回的 JSON（容错） */
export function parseAiBrowsePlan(raw: string): string[] | null {
    if (!raw) return null;
    let text = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
        const obj = JSON.parse(text);
        if (obj && Array.isArray(obj.apps)) {
            return obj.apps.map(String).filter(Boolean);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * 用 LLM 生成个性化浏览计划（按角色欲望/性格/当前事由，优先社交/聊天类）。
 * 返回合法 steps；失败（未配置 API / 解析失败 / 无可查看 App）返回 null，调用方回落固定计划。
 */
export async function buildAiBrowsePlan(
    char: CharacterProfile,
    api?: ReverseAiPlanLLMConfig,
    characters?: CharacterProfile[],
): Promise<ReverseTakeoverPlan | null> {
    if (!api?.apiKey || !api?.baseUrl) return null;
    try {
        const persona = (char.systemPrompt || '').slice(0, 500);
        const prompt = buildAiBrowsePlanPrompt(char.name || '角色', persona, '用户');

        const base = (api.baseUrl || '').replace(/\/+$/, '');
        const response = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.apiKey}` },
            body: JSON.stringify({
                model: api.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 200,
            }),
        });
        if (!response.ok) return null;
        const data = await safeResponseJson(response);
        const raw = extractContent(data) || '';
        const appIds = parseAiBrowsePlan(raw);
        if (!appIds || appIds.length === 0) return null;

        // 过滤：只保留可查看、且存在于可选列表的 App；映射成 steps
        const nameOf = (id: string) => INSTALLED_APPS.find(a => a.id === id)?.name || id;
        const steps: ReverseTakeoverStep[] = [];
        const seen = new Set<string>();
        for (const id of appIds) {
            if (!isReverseAppAllowed(id)) continue;
            if (!AI_SELECTABLE_APPS.some(a => a.id === id)) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            // 私聊：展开成「每个联系人的私聊」步骤（滑到谁读谁）
            if (id === AppID.Chat && characters && characters.length > 0) {
                const contacts = characters
                    .filter(c => c.id !== char.id)
                    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
                steps.push({
                    appId: id,
                    appName: `${nameOf(id)}（${char.name}）`,
                    detail: `打开和「${char.name}」的私聊`,
                    durationMs: DEFAULT_STEP_DURATION,
                    targetCharId: char.id,
                });
                for (const contact of contacts) {
                    steps.push({
                        appId: id,
                        appName: `${nameOf(id)}（${contact.name}）`,
                        detail: `点开和「${contact.name}」的私聊`,
                        durationMs: DEFAULT_STEP_DURATION,
                        targetCharId: contact.id,
                    });
                }
                continue;
            }
            steps.push({
                appId: id,
                appName: nameOf(id),
                detail: `浏览了「${nameOf(id)}」`,
                durationMs: DEFAULT_STEP_DURATION,
            });
        }
        if (steps.length === 0) return null;
        return { steps };
    } catch (e) {
        console.error('[reverseTakeover] AI 浏览计划生成失败，回落默认', e);
        return null;
    }
}
