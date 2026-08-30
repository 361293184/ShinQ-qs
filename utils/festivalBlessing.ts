/**
 * 节日 0 点祝福调度器（本地前端版）。
 *
 * - 陪伴核心节日（七夕/情人节/520/跨年夜/平安夜/圣诞/春节/用户生日/纪念日）当天
 *   0:00（按角色时区），由角色主动发一张 HTML 祝福卡片。
 * - 页面打开时：先做「错过补发」（今天已是核心节日且已过 0 点且当日没发过 → 补发），
 *   再调度「下一个核心节日的 0 点」定时器。
 * - 防重复：localStorage 记录「角色 × 日期」已发标记。
 * - HTML 生成：优先副 API 生成（贴角色性格），失败回退内置模板。
 * - 云端通道（worker 主动消息 2.0）未配置前静默跳过，这里只做本地。
 */

import { DB } from './db';
import { checkSpecialDatesDetailed, type SpecialDateHit } from './realtimeWorldCore';
import { extractHtmlBlocks } from './htmlPrompt';
import { safeResponseJson, extractContent } from './safeApi';
import { resolveCharTimeZone } from './timezone';
import type { CharacterProfile, UserProfile, APIConfig, Anniversary } from '../types';

const BLESSING_KEY = 'os_festival_blessing_v1';

/** 内置模板池：按节日名给不同配色 / emoji，生成一张简约祝福卡片。 */
function builtinBlessingCard(char: CharacterProfile, hit: SpecialDateHit, userName: string): { html: string; text: string } {
    const name = hit.name;
    const label = hit.label && hit.label !== name ? ` · ${hit.label}` : '';
    const emojiMap: Record<string, string> = {
        '情人节': '💘', '520': '💝', '七夕': '🌙', '跨年夜': '🎆',
        '平安夜': '🎄', '圣诞节': '🎅', '春节': '🧧', '除夕': '🧧',
        '用户生日': '🎂', '元宵节': '🏮', '中秋节': '🌕', '端午节': '🥟',
    };
    const emoji = emojiMap[name] || '✨';
    const title = hit.isUserBirthday ? '生日快乐' : name;
    const greeting = hit.isUserBirthday
        ? `${userName}，今天是你的生日 🎂 希望你今天的所有愿望都成真！`
        : `${name}${label}，这个特别的日子，我想第一个对你说：节日快乐 💫`;
    const html =
        `<div style="width:260px;padding:20px;border-radius:18px;background:linear-gradient(135deg,#fff5f7,#ffeef2);font-family:system-ui;color:#8a4a5a;text-align:center;">` +
        `<div style="font-size:34px;line-height:1;">${emoji}</div>` +
        `<div style="font-size:20px;font-weight:700;margin-top:10px;letter-spacing:1px;">${title}${label}</div>` +
        `<div style="font-size:13px;margin-top:12px;line-height:1.7;color:#a06474;">${greeting}</div>` +
        `<div style="font-size:11px;margin-top:14px;opacity:0.55;letter-spacing:2px;">— ${char.name}</div>` +
        `</div>`;
    return { html, text: `${title}${label}：${greeting} —— ${char.name}` };
}

/** 副 API 生成祝福卡片；失败返回 null（调用方回退内置模板）。 */
async function generateBlessingCard(
    char: CharacterProfile,
    hit: SpecialDateHit,
    userName: string,
    apiConfig: APIConfig,
): Promise<{ html: string; text: string } | null> {
    const sub = apiConfig.subBaseUrl && apiConfig.subApiKey && apiConfig.subModel
        ? { baseUrl: apiConfig.subBaseUrl, apiKey: apiConfig.subApiKey, model: apiConfig.subModel }
        : null;
    const main = apiConfig.baseUrl && apiConfig.apiKey && apiConfig.model
        ? { baseUrl: apiConfig.baseUrl, apiKey: apiConfig.apiKey, model: apiConfig.model }
        : null;
    const ep = sub || main;
    if (!ep) return null;

    const name = hit.name;
    const label = hit.label && hit.label !== name ? `（${hit.label}）` : '';
    const egg = hit.egg ? `，今天的你可以：${hit.egg}` : '';
    const system =
        `你是「${char.name}」，正在给心爱的${userName}送节日祝福。` +
        `你是一位浪漫、真诚、有自己说话风格的角色（不要官方腔、不要大道理）。` +
        `请输出一张 HTML 祝福卡片：只用 [html]<div>…</div>[/html] 包裹一个完整 div，` +
        `宽度 ≤ 270px，内联样式，柔和低饱和配色，圆角 14~18px，留白充足，中文，` +
        `禁止 <script>、禁止外链、禁止外阴影、禁止内部滚动，整张卡优雅简约不堆砌。`;
    const user =
        `今天是「${name}${label}」，${hit.windowText || ''}` +
        `请以「${char.name}」的口吻，写一句真诚的节日祝福（10~30 字左右，走心不油腻）${egg}。` +
        `只输出 [html]…[/html] 卡片，不要输出任何卡片外的解释文字。`;

    try {
        const baseUrl = (ep.baseUrl || '').replace(/\/+$/, '');
        const body: Record<string, unknown> = {
            model: ep.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.8,
            max_tokens: 600,
        };
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ep.apiKey}` },
            body: JSON.stringify(body),
            __sullyMeta: { appName: 'FestivalBlessing', purpose: '节日0点祝福' },
        } as RequestInit);
        if (!res.ok) return null;
        const data = await safeResponseJson(res);
        const text = extractContent(data);
        if (!text) return null;
        const { blocks } = extractHtmlBlocks(text);
        const blk = blocks[0];
        if (blk?.html) {
            return { html: blk.html, text: blk.textPreview || text.replace(/\[html\][\s\S]*?\[\/html\]/gi, '').trim() || `节日快乐 💫 —— ${char.name}` };
        }
        return null;
    } catch {
        return null;
    }
}

/** 取「角色 × 日期」已发标记（dateKey = YYYY-MM-DD，角色时区下）。 */
function wasBlessed(charId: string, dateKey: string): boolean {
    try {
        const map = JSON.parse(localStorage.getItem(BLESSING_KEY) || '{}');
        return !!map[`${charId}:${dateKey}`];
    } catch {
        return false;
    }
}

function markBlessed(charId: string, dateKey: string): void {
    try {
        const map = JSON.parse(localStorage.getItem(BLESSING_KEY) || '{}');
        map[`${charId}:${dateKey}`] = true;
        localStorage.setItem(BLESSING_KEY, JSON.stringify(map));
    } catch {
        // 存不下就算了，不阻塞祝福
    }
}

/** 把角色时区下的「今天」格式化为 YYYY-MM-DD。 */
function localDateKey(tz: string | undefined, nowMs: number): string {
    const d = new Date(nowMs);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || undefined,
        year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return fmt.format(d); // en-CA 输出 YYYY-MM-DD
}

/** 计算角色时区下「dateKey 那一天 00:00」对应的毫秒时间戳。 */
function startOfDayInTz(tz: string | undefined, dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    // 用该时区「正午」的 UTC 偏移近似当天偏移（避开 DST 边界误差，够定时用）
    const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
    let offsetMin = 0;
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz || undefined, timeZoneName: 'longOffset', hour12: false,
        }).formatToParts(noonUtc);
        const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || '';
        const m2 = tzName.match(/GMT([+-])(\d{2}):(\d{2})/);
        if (m2) {
            const sign = m2[1] === '-' ? -1 : 1;
            offsetMin = sign * (Number(m2[2]) * 60 + Number(m2[3]));
        }
    } catch {
        offsetMin = -new Date(noonUtc).getTimezoneOffset();
    }
    return noonUtc - offsetMin * 60 * 1000 - 12 * 3600 * 1000;
}

/** 扫描未来 days 天内，角色时区下的第一个陪伴核心节日（core 级，生日/纪念日也算）。 */
export function nextCoreFestival(
    char: CharacterProfile,
    userProfile: UserProfile,
    tz: string | undefined,
    anniversaries: Anniversary[],
    fromMs: number,
    days = 90,
): { hit: SpecialDateHit; dateKey: string; startMs: number } | null {
    for (let i = 0; i <= days; i++) {
        const dayMs = fromMs + i * 86400000;
        const dateKey = localDateKey(tz, dayMs);
        const hits = checkSpecialDatesDetailed(tz, dayMs, anniversaries, userProfile.birthday);
        const core = hits.find((h) => h.tier === 'core' && !h.windowText);
        if (core) {
            return { hit: core, dateKey, startMs: startOfDayInTz(tz, dateKey) };
        }
    }
    return null;
}

/** 发送一条祝福消息并触发 UI 刷新。 */
async function sendBlessing(
    char: CharacterProfile,
    hit: SpecialDateHit,
    dateKey: string,
    userProfile: UserProfile,
    apiConfig: APIConfig,
    late: boolean,
): Promise<void> {
    const card = (await generateBlessingCard(char, hit, userProfile.name, apiConfig)) ||
        builtinBlessingCard(char, hit, userProfile.name);
    const prefix = late ? '【迟到的祝福】' : '';
    try {
        await DB.saveMessage({
            charId: char.id,
            role: 'assistant',
            type: 'html_card',
            content: `[HTML卡片] ${prefix}${card.text}`,
            metadata: {
                htmlSource: card.html,
                htmlTextPreview: card.text,
                festivalBlessing: true,
                late,
            },
        } as any);
        markBlessed(char.id, dateKey);
        window.dispatchEvent(new CustomEvent('active-msg-received', {
            detail: { charId: char.id, charName: char.name, body: `${prefix}${card.text}` },
        }));
    } catch (e) {
        console.error('[FestivalBlessing] 保存祝福失败', e);
    }
}

/**
 * 启动本地 0 点祝福调度器。返回清理函数（卸载时 clearTimeout）。
 * 页面打开时自动做「错过补发 + 调度下一个 0 点」。
 */
export function startFestivalBlessingScheduler(opts: {
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: APIConfig;
    anniversariesByChar?: Record<string, Anniversary[]>;
    /** 测试用：注入当前时间 */
    nowMs?: number;
}): () => void {
    const { characters, userProfile, apiConfig, anniversariesByChar } = opts;
    const timers: number[] = [];
    const now = opts.nowMs ?? Date.now();

    const scheduleForChar = (char: CharacterProfile) => {
        const tz = resolveCharTimeZone(char);
        const anniversaries = anniversariesByChar?.[char.id] || [];

        // 1) 错过补发：今天（角色时区）已是核心节日、已过 0 点、当日未发 → 补发
        const todayKey = localDateKey(tz, now);
        const todayHits = checkSpecialDatesDetailed(tz, now, anniversaries, userProfile.birthday);
        const todayCore = todayHits.find((h) => h.tier === 'core' && !h.windowText);
        if (todayCore && now > startOfDayInTz(tz, todayKey) && !wasBlessed(char.id, todayKey)) {
            void sendBlessing(char, todayCore, todayKey, userProfile, apiConfig, true);
        }

        // 2) 调度下一个核心节日 0 点
        const next = nextCoreFestival(char, userProfile, tz, anniversaries, now);
        if (!next) return;
        const delay = next.startMs - now;
        if (delay <= 0) return;
        const timer = window.setTimeout(() => {
            void sendBlessing(char, next.hit, next.dateKey, userProfile, apiConfig, false);
            // 发完继续调下一个
            scheduleForChar(char);
        }, delay);
        timers.push(timer);
    };

    for (const char of characters) {
        scheduleForChar(char);
    }

    return () => {
        for (const t of timers) window.clearTimeout(t);
    };
}
