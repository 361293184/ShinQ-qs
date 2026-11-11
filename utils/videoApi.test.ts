import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message, VideoApiConfig } from '../types';
import { DB } from './db';

const getBlobForRef = vi.fn();
vi.mock('./blobRef', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./blobRef')>();
    return {
        ...actual,
        getBlobForRef: (ref: string) => getBlobForRef(ref),
    };
});

const {
    describeVideoWithVideoApi,
    isVideoApiReady,
    materializeVideoDescriptions,
    readVideoDescription,
    readVideoTruncated,
} = await import('./videoApi');

const config: VideoApiConfig = {
    enabled: true,
    baseUrl: 'https://video.example.com/v1',
    apiKey: 'video-key',
    model: 'video-model',
};

const videoMessage = (id: number, metadata?: Record<string, any>): Message => ({
    id,
    charId: 'char-1',
    role: 'user',
    type: 'video',
    content: `blobref:b_${id}`,
    timestamp: 1_700_000_000_000 + id,
    ...(metadata ? { metadata } : {}),
});

const okResponse = (description: string) => new Response(JSON.stringify({
    choices: [{ message: { content: description } }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getBlobForRef.mockReset();
});

describe('video api readiness', () => {
    it('只在开关打开且三项字段齐全时认为可用', () => {
        expect(isVideoApiReady(config)).toBe(true);
        expect(isVideoApiReady({ ...config, enabled: false })).toBe(false);
        expect(isVideoApiReady({ ...config, apiKey: '   ' })).toBe(false);
        expect(isVideoApiReady({ ...config, baseUrl: '' })).toBe(false);
        expect(isVideoApiReady({ ...config, model: '' })).toBe(false);
        expect(isVideoApiReady(null)).toBe(false);
        expect(isVideoApiReady(undefined)).toBe(false);
    });

    it('描述与截断标记分开读取', () => {
        expect(readVideoDescription(videoMessage(1, { visionDescription: '  海边日落  ' }))).toBe('海边日落');
        expect(readVideoDescription(videoMessage(2))).toBe('');
        expect(readVideoTruncated(videoMessage(3, { videoTruncated: true }))).toBe(true);
        expect(readVideoTruncated(videoMessage(4, { video: { truncated: true } }))).toBe(true);
        expect(readVideoTruncated(videoMessage(5))).toBe(false);
    });
});

describe('materializeVideoDescriptions', () => {
    it('未开启时原样返回，不碰网络', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const messages = [videoMessage(1)];
        const result = await materializeVideoDescriptions(messages, { ...config, enabled: false });
        expect(result).toBe(messages);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('开关打开但字段不全时明确报错（与识图同一口径）', async () => {
        await expect(materializeVideoDescriptions([videoMessage(1)], { ...config, model: '' }))
            .rejects.toThrow(/URL、Key 或 Model/);
    });

    it('已有描述的视频直接复用，不再请求模型', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const message = videoMessage(1, { visionDescription: '一只猫在窗台上' });
        const result = await materializeVideoDescriptions([message], config);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(readVideoDescription(result[0])).toBe('一只猫在窗台上');
    });

    it('没有令牌的视频保留原样，不会拿空数据去请求', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const message: Message = { ...videoMessage(1), content: '随便一段文字' };
        const result = await materializeVideoDescriptions([message], config);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result[0]).toBe(message);
    });

    it('识别成功后把描述写回消息 metadata', async () => {
        const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'video/mp4' });
        getBlobForRef.mockResolvedValue(blob);
        const fetchMock = vi.fn().mockResolvedValue(okResponse('  女孩在沙滩上奔跑  '));
        vi.stubGlobal('fetch', fetchMock);
        const updateSpy = vi.spyOn(DB, 'updateMessageMetadata').mockResolvedValue(undefined as any);

        const result = await materializeVideoDescriptions([videoMessage(7, { video: { truncated: true } })], config);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(readVideoDescription(result[0])).toBe('女孩在沙滩上奔跑');
        expect(readVideoTruncated(result[0])).toBe(true);
        expect(updateSpy).toHaveBeenCalledWith(7, expect.any(Function));
    });

    it('识别失败时保留原消息，不让整轮聊天挂掉', async () => {
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
        getBlobForRef.mockResolvedValue(blob);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
        vi.spyOn(DB, 'updateMessageMetadata').mockResolvedValue(undefined as any);

        const message = videoMessage(9);
        const result = await materializeVideoDescriptions([message], config);
        expect(result[0]).toBe(message);
        expect(readVideoDescription(result[0])).toBe('');
    });
});

describe('describeVideoWithVideoApi', () => {
    it('空数据直接拒绝，不发请求', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(describeVideoWithVideoApi(new Blob([]), config)).rejects.toThrow(/视频数据不可用/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('请求体里放的是 video_url + 文本提示，且走的是配置的模型', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse('一段测试描述'));
        vi.stubGlobal('fetch', fetchMock);

        await describeVideoWithVideoApi(new Blob([new Uint8Array([9])], { type: 'video/mp4' }), config);

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://video.example.com/v1/chat/completions');
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe('video-model');
        expect(body.messages[0].content[0].type).toBe('video_url');
        expect(String(body.messages[0].content[0].video_url.url)).toMatch(/^data:video\/mp4;base64,/);
    });
});
