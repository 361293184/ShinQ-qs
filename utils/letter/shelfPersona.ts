/**
 * 拾光票根卡上的「一句话」—— 用副 API 生成，**生成一次永久缓存**。
 *
 * 为什么不按天刷新：这句话描述的是**性格**，性格不会天天变。天天重新生成只是白烧额度，
 * 而且第二次的措辞未必比第一次好 —— 卡片上那句话反复横跳反而显得不可信。
 *
 * 三级兜底，保证卡上永远有字：
 *   1. 命中缓存 → 直接用（绝大多数情况）
 *   2. 未配副 API / 调用失败 / 返回为空 → 从角色资料里截一句（不写缓存，下次进来还会再试）
 *
 * 与来信 / 番外同一条规矩：只走副 API（subBaseUrl / subApiKey / subModel），
 * 不回落主 API —— 主 API 只负责聊天。
 */

import type { CharacterProfile } from '../../types';
import { callFanwaiLLM, type SubApiConfig } from '../fanwaiGenerator';

const CACHE_KEY = 'sullyos_shelf_persona_v1';

/** 一句话的最大长度（超出截断，卡片上放不下更长的）。 */
const MAX_LEN = 22;

type PersonaCache = Record<string, string>;

function readCache(): PersonaCache {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as PersonaCache : {};
    } catch (e) {
        console.error('[Shelf] read persona cache failed', e);
        return {};
    }
}

function writeCache(cache: PersonaCache): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        // 配额满 / 隐私模式：缓存写不进去不是错误，下次生成就是了
        console.error('[Shelf] write persona cache failed', e);
    }
}

/** 清掉全文里的引号、换行、末尾句号 —— 模型很爱自觉加这些。 */
function cleanLine(raw: string): string {
    return raw
        .trim()
        .replace(/\s*\n+\s*/g, ' ')
        .replace(/^["'“”「『【]+/, '')
        .replace(/["'“”」』】]+$/, '')
        .replace(/[。.]+$/, '')
        .trim()
        .slice(0, MAX_LEN)
        .trim();
}

function buildPersonaPrompt(char: CharacterProfile): string {
    const parts: string[] = [`你在给一本角色卡片册写「签名档」。`, ``, `角色：${char.name}`];
    if (char.systemPrompt && char.systemPrompt.trim()) parts.push(`性格与言行：${char.systemPrompt.trim()}`);
    if (char.description && char.description.trim()) parts.push(`简介：${char.description.trim()}`);
    if (char.worldview && char.worldview.trim()) parts.push(`背景：${char.worldview.trim()}`);

    parts.push(
        ``,
        `请写**一句话**（不超过 ${MAX_LEN} 个字）概括这个角色的味道。要求：`,
        `- 必须落到具体：一个习惯、一句口头禅、一种语气，或旁人看 ta 的某个角度`,
        `- 严禁堆抽象形容词（「温柔善良又坚强」这种直接作废）`,
        `- 不加引号 / 书名号 / 破折号，不加 emoji，结尾不加句号`,
        `- 用第三人称或无人称，不要出现「你」`,
        ``,
        `只输出这一句话，不要任何前后说明。`,
    );
    return parts.join('\n');
}

/**
 * 回退文案：从角色资料里截第一句。
 * 不是「随便凑一句」，而是让卡上始终有 ta 自己的东西 —— 副 API 修好之前也能看。
 */
export function fallbackPersona(char: CharacterProfile): string {
    const src = (char.description || char.systemPrompt || '').replace(/\s+/g, ' ').trim();
    if (!src) return 'ta 的故事还在写';
    const first = src.split(/[。！？!?；;]/)[0].trim() || src;
    return first.length > MAX_LEN ? `${first.slice(0, MAX_LEN - 1)}…` : first;
}

/**
 * 取一批角色的「一句话」。
 *
 * 返回缓存命中的完整映射；缺失的角色**串行**生成（避免同时打十几个请求把账号打限流），
 * 每生成出一句就通过 onProgress 回调吐出去，让卡片先显示先到位的，不必等全部完成。
 * 生成失败的用 fallbackPersona 顶上，但不写缓存 —— 下次进来会重试。
 */
export async function ensureShelfPersonas(
    chars: CharacterProfile[],
    subApi: SubApiConfig,
    onProgress?: (charId: string, line: string) => void,
): Promise<Record<string, string>> {
    const cache = readCache();
    const out: Record<string, string> = { ...cache };
    const hasApi = !!(subApi?.baseUrl && subApi?.apiKey && subApi?.model);

    const missing = chars.filter(c => !cache[c.id]);

    // 先让缺失的角色有个兜底文案（不写缓存），卡片不会空着等网络
    for (const char of missing) {
        if (!out[char.id]) {
            out[char.id] = fallbackPersona(char);
            onProgress?.(char.id, out[char.id]);
        }
    }

    if (!hasApi || missing.length === 0) return out;

    for (const char of missing) {
        const content = await callFanwaiLLM(buildPersonaPrompt(char), subApi, {
            temperature: 0.9,
            meta: { appName: '拾光', charId: char.id, charName: char.name, purpose: '拾光角色签名档' },
        });
        const line = content ? cleanLine(content) : '';
        if (!line) continue;              // 失败：保留兜底文案，且不写缓存
        cache[char.id] = line;
        out[char.id] = line;
        writeCache(cache);
        onProgress?.(char.id, line);
    }

    return out;
}
