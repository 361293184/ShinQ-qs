/**
 * 「你说我猜」副 API 调用层。
 *
 * - 游戏所有 AI 调用（主持人吐槽 / 角色与 NPC 描述、猜词 / AI 出题）统一走副 API
 *   （apiConfig.subBaseUrl / subApiKey / subModel），省钱用小模型（如 Gemini flash）。
 * - 未配置副 API → 抛提示去设置，不静默用主 API。
 * - 副 API 调用失败 → 按设置开关「副 API 失败降级主 API」：开 → 该次改主 API；关 → 失败重试一次后跳过。
 * - 串行队列：猜词窗口并发调用会打爆副 API 限流，这里用队列保证同时最多 N 路。
 */

import { safeResponseJson, extractContent } from '../safeApi';

export interface ApiEndpoint {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
}

export interface GameApiCall {
    system?: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
    /** 埋点用途名 */
    purpose?: string;
}

export interface GameApiResult {
    ok: boolean;
    text: string;
    /** 实际用的是副 API 还是降级后的主 API */
    usedApi: 'sub' | 'main';
    error?: string;
}

/** 串行队列：控制并发，避免打爆副 API 限流 */
class GameApiQueue {
    private running = 0;
    private readonly maxConcurrent: number;

    constructor(maxConcurrent = 2) {
        this.maxConcurrent = maxConcurrent;
    }

    async enqueue<T>(task: () => Promise<T>): Promise<T> {
        while (this.running >= this.maxConcurrent) {
            await new Promise((r) => setTimeout(r, 120));
        }
        this.running++;
        try {
            return await task();
        } finally {
            this.running--;
        }
    }
}

// 全局队列：全游戏共用（猜词并发、主持人、描述者都在这里排队）
const apiQueue = new GameApiQueue(2);

/** 单次 /chat/completions 调用（OpenAI 兼容） */
async function rawCompletion(endpoint: ApiEndpoint, call: GameApiCall): Promise<string> {
    const baseUrl = (endpoint.baseUrl || '').replace(/\/+$/, '');
    const apiKey = endpoint.apiKey || '';
    const model = endpoint.model || '';
    if (!baseUrl || !apiKey || !model) {
        throw new Error('API 配置不完整');
    }

    const body: Record<string, unknown> = {
        model,
        messages: [
            ...(call.system ? [{ role: 'system', content: call.system }] : []),
            ...call.messages,
        ],
        temperature: call.temperature ?? 0.7,
    };
    if (call.maxTokens) body.max_tokens = call.maxTokens;

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        __sullyMeta: { appName: 'MyGame', purpose: call.purpose || '你说我猜' },
    } as RequestInit);

    if (!response.ok) {
        throw new Error(`API HTTP ${response.status}`);
    }
    const data = await safeResponseJson(response);
    const content = extractContent(data);
    if (!content || !content.trim()) {
        throw new Error('API 返回空内容');
    }
    return content.trim();
}

/**
 * 一次游戏 AI 调用：优先副 API，失败按开关降级主 API。
 * @param subApi 副 API（必须，未配置则抛错提示去设置）
 * @param mainApi 主 API（降级用）
 * @param fallbackToMain 是否允许降级主 API
 * @param call 调用参数
 */
export async function callGameApi(
    subApi: ApiEndpoint,
    mainApi: ApiEndpoint,
    fallbackToMain: boolean,
    call: GameApiCall,
): Promise<GameApiResult> {
    const run = (ep: ApiEndpoint): Promise<string> => rawCompletion(ep, call);
    return apiQueue.enqueue(async () => {
        // 1) 优先副 API
        const subOk = !!(subApi?.baseUrl && subApi?.apiKey && subApi?.model);
        if (!subOk) {
            throw new Error('未配置副 API，请到 设置 → 其他 API 里填写 subBaseUrl/subApiKey/subModel');
        }
        try {
            const text = await run(subApi);
            return { ok: true, text, usedApi: 'sub' };
        } catch (e: any) {
            // 2) 降级主 API
            if (fallbackToMain && mainApi?.baseUrl && mainApi?.apiKey && mainApi?.model) {
                try {
                    const text = await run(mainApi);
                    return { ok: true, text, usedApi: 'main' };
                } catch (e2: any) {
                    return { ok: false, text: '', usedApi: 'main', error: e2?.message || '主 API 也失败' };
                }
            }
            return { ok: false, text: '', usedApi: 'sub', error: e?.message || '副 API 失败' };
        }
    });
}

/**
 * AI 实时出题：让副 API 生成一个词。
 * 返回的词需再走敏感词过滤（在调用方处理）。
 */
export async function generateAWord(
    subApi: ApiEndpoint,
    mainApi: ApiEndpoint,
    fallbackToMain: boolean,
    categoryLabel: string,
): Promise<string | null> {
    const call: GameApiCall = {
        system: '你是一个出题人。请根据要求输出【一个】中文词语，只输出词本身，不要任何解释、标点或前后缀。',
        messages: [
            { role: 'user', content: `给我出一个「${categoryLabel}」类的词，要常见、适合你画我猜，2~4 个字。` },
        ],
        temperature: 0.9,
        maxTokens: 16,
        purpose: 'AI出题',
    };
    const res = await callGameApi(subApi, mainApi, fallbackToMain, call);
    if (!res.ok || !res.text) return null;
    // 提取第一个中文词（去掉标点/英文/数字）
    const m = res.text.match(/[\u4e00-\u9fa5]{2,6}/g);
    if (!m || !m.length) return null;
    return m[0];
}
