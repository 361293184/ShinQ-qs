import { describe, expect, it } from 'vitest';
import {
    isVideoFileName,
    isVideoMimeType,
    normalizeVideoMimeForUpload,
    VIDEO_MAX_DESCRIBE_SECONDS,
    VIDEO_MAX_UPLOAD_BYTES,
} from './videoMessage';

describe('视频类型识别', () => {
    it('认得视频 mime', () => {
        expect(isVideoMimeType('video/mp4')).toBe(true);
        expect(isVideoMimeType('VIDEO/QUICKTIME')).toBe(true);
        expect(isVideoMimeType('image/png')).toBe(false);
        expect(isVideoMimeType('')).toBe(false);
        expect(isVideoMimeType(null)).toBe(false);
        expect(isVideoMimeType(undefined)).toBe(false);
    });

    it('认得视频扩展名（选取文件时 type 常是空串，靠这一层兜）', () => {
        expect(isVideoFileName('旅行.MOV')).toBe(true);
        expect(isVideoFileName('a.mp4')).toBe(true);
        expect(isVideoFileName('a.webm')).toBe(true);
        expect(isVideoFileName('a.png')).toBe(false);
        expect(isVideoFileName('没有扩展名')).toBe(false);
        expect(isVideoFileName(undefined)).toBe(false);
    });
});

describe('送模型前的容器归一', () => {
    it('QuickTime / 3gp / avi 一律标成 mp4', () => {
        expect(normalizeVideoMimeForUpload('video/quicktime')).toBe('video/mp4');
        expect(normalizeVideoMimeForUpload('video/3gpp')).toBe('video/mp4');
        expect(normalizeVideoMimeForUpload('video/x-msvideo')).toBe('video/mp4');
        expect(normalizeVideoMimeForUpload('video/x-matroska')).toBe('video/mp4');
    });

    it('空类型也当 mp4（空字符串被拒的概率比猜错更高）', () => {
        expect(normalizeVideoMimeForUpload('')).toBe('video/mp4');
        expect(normalizeVideoMimeForUpload(undefined)).toBe('video/mp4');
    });

    it('本来就支持的容器原样保留，并去掉 codecs 参数', () => {
        expect(normalizeVideoMimeForUpload('video/webm')).toBe('video/webm');
        expect(normalizeVideoMimeForUpload('video/mp4; codecs=avc1')).toBe('video/mp4');
        expect(normalizeVideoMimeForUpload('VIDEO/MP4')).toBe('video/mp4');
    });
});

describe('体积与时长阈值', () => {
    it('上限 8MB、只描述前 60 秒', () => {
        expect(VIDEO_MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
        expect(VIDEO_MAX_DESCRIBE_SECONDS).toBe(60);
    });
});
