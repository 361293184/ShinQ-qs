import type { Message, VideoApiConfig } from '../types';
import { DB } from './db';
import { getBlobForRef, isBlobRef } from './blobRef';
import { extractContent, safeFetchJson } from './safeApi';
import {
    blobToDataUrl,
    shrinkVideoForUpload,
    VIDEO_MAX_UPLOAD_BYTES,
    type VideoMessageMeta,
} from './videoMessage';

/**
 * 视频理解的独立槽位。
 *
 * 为什么不复用「副 API」（subBaseUrl）：那个槽位的契约是「给我一段话，还我一段话」，
 * 调用方是番外 / 你说我猜 / 合照提炼这些幕后小任务，请求体里只有字符串。视频要发
 * 几十 MB 的二进制，形态根本不同；更要紧的是故障会串——智谱抖一下，番外和猜词会
 * 跟着一起挂。
 *
 * 为什么不复用「识图 API」（visionApi）：识图跑得很好，没必要为省一个 key 去动一条
 * 已经在工作的链路。想省 token 的话把同一个 key 填进两处是允许的，两处各存各的。
 */

/** 描述写在 metadata 的这个键上：识图和视频共用「视觉描述」这一个语义位。 */
export const VIDEO_DESCRIPTION_METADATA_KEY = 'visionDescription';
/** 哪一版模型描的（换模型后便于回看/重跑）。 */
export const VIDEO_DESCRIPTION_MODEL_KEY = 'videoDescriptionModel';
/** 描述时间戳。 */
export const VIDEO_RECOGNIZED_AT_KEY = 'videoRecognizedAt';
/** 送给模型的那份被截到前 60 秒——prompt 要据此让角色知道「没看完」。 */
export const VIDEO_TRUNCATED_KEY = 'videoTruncated';

const USAGE_STORAGE_KEY = 'os_video_api_usage_v1';
/** 单次请求的超时。视频理解比识图慢得多，30s 不够。 */
const VIDEO_REQUEST_TIMEOUT_MS = 120_000;
/** 429 退避：1s → 2s，共两次。免费额度不限次数，但限并发。 */
const RATE_LIMIT_RETRY_DELAYS = [1_000, 2_000];

const VIDEO_PROMPT = `请按时间顺序描述这段视频里实际发生的内容，供另一个看不到视频的对话模型理解。
1. 画面怎么变：主体、动作、场景，按先后顺序说清楚；
2. 有人说的话原样记下来，尽量标出大致时间（第几秒）；
3. 画面里的文字、界面信息原样写出。
不要猜测画面外的事，不要寒暄，不要总结意义，只描述看到的；看不清就写看不清。输出 200~400 字。`;

/**
 * 截断提示。不写这句，模型会把「视频在第 60 秒断掉」当成完整结局，然后自己补一个收尾
 * ——那比不描述更糟，因为它会把编出来的东西写进记忆。
 */
const VIDEO_TRUNCATED_PROMPT = `另外注意：这段视频是被截断的片段，结尾之后还有内容。不要把它当成完整结局，也不要替它补一个收尾。`;

export const isVideoApiReady = (config?: VideoApiConfig | null): config is VideoApiConfig =>
    config?.enabled === true
    && !!config.baseUrl?.trim()
    && !!config.apiKey?.trim()
    && !!config.model?.trim();

/** 这条消息上已有的视频描述（没有就是空串）。 */
export const readVideoDescription = (message: Message): string => {
    if (!message?.metadata) return '';
    const value = message.metadata[VIDEO_DESCRIPTION_METADATA_KEY];
    return typeof value === 'string' ? value.trim() : '';
};

export const readVideoTruncated = (message: Message): boolean =>
    message?.metadata?.[VIDEO_TRUNCATED_KEY] === true
    || message?.metadata?.video?.truncated === true;

const cleanDescription = (value: string): string => String(value || '')
    .replace(/^\s*\[?视频\s*[：:]\s*/i, '')
    .replace(/\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

const sleep = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

const isRateLimited = (error: unknown): boolean => {
    const message = String((error as any)?.message || error || '');
    return /API Error 429\b/.test(message) || /\b429\b/.test(message);
};

/** 本地按日滚的调用计数：不是额度，而是「我是不是在反复重试同一条视频」。 */
export const readVideoApiUsage = (): { date: string; count: number } => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    try {
        const raw = localStorage.getItem(USAGE_STORAGE_KEY);
        if (!raw) return { date, count: 0 };
        const parsed = JSON.parse(raw) as { date?: unknown; count?: unknown };
        if (parsed?.date !== date) return { date, count: 0 };
        const count = typeof parsed.count === 'number' && Number.isFinite(parsed.count) ? Math.max(0, Math.floor(parsed.count)) : 0;
        return { date, count };
    } catch {
        return { date, count: 0 };
    }
};

/** 记一次成功调用。写不进去（隐私模式/配额满）就算了，这个数字只是自检用。 */
export const bumpVideoApiUsage = (): void => {
    try {
        const current = readVideoApiUsage();
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ date: current.date, count: current.count + 1 }));
    } catch { /* ignore */ }
};

const inFlightDescriptions = new Map<string, Promise<string>>();

export interface DescribeVideoOptions {
    /** 被截断（只送了前 60 秒）。 */
    truncated?: boolean;
    /** 去重键：同一条视频多轮对话只识别一次。 */
    cacheKey?: string;
    /** 压缩 / 上传阶段回调，界面可以据此显示「正在压缩视频…」。 */
    onProgress?: (phase: 'compressing' | 'uploading') => void;
}

/**
 * 把一段视频变成可以交给纯文本模型的描述。
 *
 * 体积策略在这里收口：> 8MB 先现录一份 720p / 前 60 秒的副本再送，压缩失败就抛错
 * ——调用方要把它当「这条视频没描述」处理，绝不能让它影响视频本身的发送。
 */
export async function describeVideoWithVideoApi(
    blob: Blob,
    config: VideoApiConfig,
    options?: DescribeVideoOptions,
): Promise<string> {
    if (!isVideoApiReady(config)) {
        throw new Error('视频 API 已开启，但 URL、Key 或 Model 尚未填写完整');
    }
    if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('视频数据不可用，无法调用视频 API');
    }

    const cacheKey = options?.cacheKey;
    if (cacheKey) {
        const existing = inFlightDescriptions.get(cacheKey);
        if (existing) return existing;
    }

    const request = (async () => {
        let sendBlob = blob;
        let truncated = options?.truncated === true;

        if (blob.size > VIDEO_MAX_UPLOAD_BYTES) {
            options?.onProgress?.('compressing');
            const shrunk = await shrinkVideoForUpload(blob, { duration: 0, width: 0, height: 0 });
            if (!shrunk) throw new Error('视频太大且无法压缩，跳过理解');
            sendBlob = shrunk.blob;
            truncated = truncated || shrunk.truncated;
        }

        options?.onProgress?.('uploading');
        const dataUrl = await blobToDataUrl(sendBlob);
        const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
        const text = truncated ? `${VIDEO_PROMPT}\n\n${VIDEO_TRUNCATED_PROMPT}` : VIDEO_PROMPT;

        const sendOnce = async (): Promise<string> => {
            const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey.trim()}`,
                },
                body: JSON.stringify({
                    model: config.model.trim(),
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'video_url', video_url: { url: dataUrl } },
                            { type: 'text', text },
                        ],
                    }],
                    temperature: 0.1,
                    max_tokens: 800,
                    stream: false,
                }),
            }, 0, VIDEO_REQUEST_TIMEOUT_MS, { appName: '聊天', purpose: '视频理解' });

            const description = cleanDescription(extractContent(data));
            if (!description) throw new Error('视频 API 没有返回视频描述');
            return description;
        };

        // 429 是「并发超了」而不是「额度没了」：退避两次，仍失败就把描述留空，
        // 不要往上抛成用户可见的报错——用户根本没做错事，报错只会让人以为功能坏了。
        let lastError: unknown = null;
        for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS.length; attempt++) {
            try {
                const description = await sendOnce();
                bumpVideoApiUsage();
                return description;
            } catch (error) {
                lastError = error;
                if (!isRateLimited(error) || attempt >= RATE_LIMIT_RETRY_DELAYS.length) throw error;
                await sleep(RATE_LIMIT_RETRY_DELAYS[attempt]);
            }
        }
        throw lastError instanceof Error ? lastError : new Error('视频理解失败');
    })();

    if (cacheKey) {
        inFlightDescriptions.set(cacheKey, request);
        try {
            return await request;
        } finally {
            inFlightDescriptions.delete(cacheKey);
        }
    }
    return request;
}

/**
 * 给一条视频消息补描述，把结果写回 metadata。
 *
 * 三种情况静默跳过、绝不抛给界面：
 *   1. 视频 blob 不在本机（纯文字备份导回来的历史）；
 *   2. 压缩/请求失败（网络、并发、模型抽风）；
 *   3. 已经有描述（同一条视频只识别一次）。
 */
export async function describeVideoForMessage(
    message: Message,
    config?: VideoApiConfig | null,
): Promise<void> {
    if (!isVideoApiReady(config)) return;
    if (message.type !== 'video') return;
    if (readVideoDescription(message)) return;

    const token = typeof message.content === 'string' ? message.content : '';
    if (!isBlobRef(token)) return;

    let blob: Blob | null = null;
    try {
        blob = await getBlobForRef(token);
    } catch {
        blob = null;
    }
    if (!blob) return;

    try {
        const description = await describeVideoWithVideoApi(blob, config, {
            truncated: message.metadata?.video?.truncated === true,
            cacheKey: token,
        });
        const metadata = {
            ...(message.metadata || {}),
            [VIDEO_DESCRIPTION_METADATA_KEY]: description,
            [VIDEO_DESCRIPTION_MODEL_KEY]: config.model.trim(),
            [VIDEO_RECOGNIZED_AT_KEY]: Date.now(),
            ...(message.metadata?.video?.truncated ? { [VIDEO_TRUNCATED_KEY]: true } : {}),
        };
        // 先写回 DB 再交给主模型：下一轮与刷新页面后都会直接命中，不重复调用。
        await DB.updateMessageMetadata(message.id, prev => ({ ...(prev || {}), ...metadata }));
    } catch (error) {
        console.warn('[VideoApi] describe failed:', error);
    }
}

/**
 * 为聊天历史里的视频补齐描述（挂在请求构造那一侧）。
 *
 * 只处理 `type === 'video'`：没有描述的视频原样放行，prompt 那边会退成
 * 「你还没看到内容，别假装看过」，不会让整轮聊天失败。
 */
export async function materializeVideoDescriptions(
    messages: Message[],
    config?: VideoApiConfig | null,
): Promise<Message[]> {
    if (config?.enabled !== true) return messages;
    if (!isVideoApiReady(config)) {
        throw new Error('视频 API 已开启，但 URL、Key 或 Model 尚未填写完整');
    }

    const descriptionByToken = new Map<string, string>();
    const prepared: Message[] = [];

    for (const message of messages) {
        if (message.type !== 'video') {
            prepared.push(message);
            continue;
        }

        const cached = readVideoDescription(message);
        if (cached) {
            descriptionByToken.set(message.content, cached);
            prepared.push(message);
            continue;
        }

        const token = typeof message.content === 'string' ? message.content : '';
        if (!isBlobRef(token)) {
            prepared.push(message);
            continue;
        }

        const reused = descriptionByToken.get(token);
        if (reused) {
            const metadata = {
                ...(message.metadata || {}),
                [VIDEO_DESCRIPTION_METADATA_KEY]: reused,
                [VIDEO_DESCRIPTION_MODEL_KEY]: config.model.trim(),
                [VIDEO_RECOGNIZED_AT_KEY]: Date.now(),
                ...(message.metadata?.video?.truncated ? { [VIDEO_TRUNCATED_KEY]: true } : {}),
            };
            await DB.updateMessageMetadata(message.id, prev => ({ ...(prev || {}), ...metadata }));
            prepared.push({ ...message, metadata });
            continue;
        }

        let blob: Blob | null = null;
        try {
            blob = await getBlobForRef(token);
        } catch {
            blob = null;
        }

        // 拿不到二进制 / 理解失败：都退回「没描述」，prompt 会如实告诉模型没看到内容。
        if (!blob) {
            prepared.push(message);
            continue;
        }

        try {
            const description = await describeVideoWithVideoApi(blob, config, {
                truncated: message.metadata?.video?.truncated === true,
                cacheKey: token,
            });
            descriptionByToken.set(token, description);
            const metadata = {
                ...(message.metadata || {}),
                [VIDEO_DESCRIPTION_METADATA_KEY]: description,
                [VIDEO_DESCRIPTION_MODEL_KEY]: config.model.trim(),
                [VIDEO_RECOGNIZED_AT_KEY]: Date.now(),
                ...(message.metadata?.video?.truncated ? { [VIDEO_TRUNCATED_KEY]: true } : {}),
            };
            await DB.updateMessageMetadata(message.id, prev => ({ ...(prev || {}), ...metadata }));
            prepared.push({ ...message, metadata });
        } catch (error) {
            console.warn('[VideoApi] materialize failed:', error);
            prepared.push(message);
        }
    }

    return prepared;
}

/** 视频消息在 metadata.video 上的形状，导出给入口侧复用。 */
export type { VideoMessageMeta };
