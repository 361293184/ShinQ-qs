/**
 * 视频消息的基础工具：这是不是视频、多大、多长，以及「要送出去的东西必须小」那半步。
 *
 * 体积策略只有一条线：≤ 8MB 原样送，> 8MB 现录一份 720p / 前 60 秒的副本。
 * 不设「太大就放弃」的门槛——iPhone 直拍 15 秒 1080p 就有 30~45MB，硬门槛切掉的
 * 恰好是最常见的场景。压缩失败也不影响发送：视频照发，只是角色看不到内容。
 *
 * 为什么不用 ffmpeg.wasm：wasm 本体几十 MB，还要整段解进内存，手机上跑不动，
 * 加载那一下就把人劝退了。canvas + MediaRecorder 是浏览器里现成的、零依赖的路。
 */

/** 送模型的上限。超过就现录一份小副本，而不是放弃。 */
export const VIDEO_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** 只让模型看前 60 秒。截断了要在 prompt 里说清楚，否则它会把中断当结局。 */
export const VIDEO_MAX_DESCRIBE_SECONDS = 60;
/** 压缩副本的目标高度（720p）。 */
const VIDEO_TARGET_HEIGHT = 720;
/** 录制帧率。再高对描述没有帮助，只会让文件更大、掉帧更明显。 */
const VIDEO_TARGET_FPS = 24;

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|ogv|ogm|3gp|3g2|avi|mkv|flv)$/i;

export const isVideoMimeType = (type: string | undefined | null): boolean =>
    typeof type === 'string' && /^video\//i.test(type);

export const isVideoFileName = (name: string | undefined | null): boolean =>
    typeof name === 'string' && VIDEO_EXT_RE.test(name);

export interface VideoMeta {
    /** 秒。拿不到时为 0。 */
    duration: number;
    width: number;
    height: number;
}

/** 视频消息落在 metadata.video 上的形状（渲染定宽高比、prompt 报时长都靠它）。 */
export interface VideoMessageMeta extends VideoMeta {
    mime?: string;
    bytes?: number;
    /** 送给模型的那份被截到前 60 秒了。 */
    truncated?: boolean;
    /** 送给模型的是压缩副本（本地存的仍是原片）。 */
    compressed?: boolean;
}

/**
 * 用 `<video>` 读时长和分辨率。失败（不是视频 / 编解码不认识 / 超时）一律 reject，
 * 调用方据此判断「这不是视频」或「这个文件读不了」。
 */
export const readVideoMeta = (src: string, timeoutMs = 6000): Promise<VideoMeta> => new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    let timer = 0;
    const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        try { video.load(); } catch { /* ignore */ }
    };
    const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
    };
    timer = window.setTimeout(() => settle(() => reject(new Error('读取视频信息超时'))), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => settle(() => resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
    }));
    video.onerror = () => settle(() => reject(new Error('这个文件不是可识别的视频')));
    video.src = src;
});

/**
 * 判断用户选的文件是不是视频。三重兜底，因为「选取文件」这条路给的 `File.type`
 * 经常是空字符串，只信 mime 会把视频当图片丢进 canvas 重编码，报一个看不懂的错。
 *
 * 依次看：mime → 扩展名 → 当视频读一次元数据（能读出宽高就算）。
 */
export async function classifyVideoFile(file: File): Promise<{ isVideo: boolean; meta?: VideoMeta }> {
    if (isVideoMimeType(file.type) || isVideoFileName(file.name)) return { isVideo: true };
    const url = URL.createObjectURL(file);
    try {
        const meta = await readVideoMeta(url, 4000);
        return meta.width > 0 && meta.height > 0 ? { isVideo: true, meta } : { isVideo: false };
    } catch {
        return { isVideo: false };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * 送模型前统一把容器标成 mp4。
 *
 * 智谱吃 `data:video/quicktime` 没有官方背书，mp4 是确定能过的；QuickTime 文件头
 * 标成 mp4 在多数解码器上仍能正确识别。注意编码比容器更容易出问题：iPhone 默认
 * HEVC(H.265)，报「格式不支持」而文件明明是 mp4 时先怀疑编码——那种情况只能走
 * 重编码（MediaRecorder 输出 H.264）。
 */
export const normalizeVideoMimeForUpload = (value: string | undefined | null): string => {
    const type = String(value || '').toLowerCase().split(';')[0].trim();
    if (!type) return 'video/mp4';
    if (type === 'video/quicktime' || type === 'video/3gpp' || type === 'video/3gpp2'
        || type === 'video/x-msvideo' || type === 'video/x-matroska' || type === 'video/x-flv') {
        return 'video/mp4';
    }
    return type;
};

/** Blob → data URL（描述这一步要把字节真的送到模型面前，不能只给令牌）。 */
export const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result.includes(',')) { reject(new Error('读取视频数据失败')); return; }
        resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error('读取视频数据失败'));
    reader.onabort = () => reject(new Error('读取视频数据被中断'));
    reader.readAsDataURL(blob);
});

const pickRecorderMime = (): string | null => {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ];
    for (const candidate of candidates) {
        try {
            if (MediaRecorder.isTypeSupported(candidate)) return candidate;
        } catch { /* ignore */ }
    }
    return null;
};

const canCaptureCanvas = (canvas: HTMLCanvasElement): boolean =>
    typeof (canvas as any).captureStream === 'function';

/**
 * 现录一份 720p / 前 60 秒的副本，给识图模型看。
 *
 * 音频要单独接：canvas 流只有画面，而「有人说的话记下来」正是这段描述最有价值的部分。
 * 用 AudioContext 把 `<video>` 的音轨接到 MediaStreamDestination，再和画面合成一条流。
 * 接不上（老 Safari / 被自动播放策略拒）就退成纯画面——宁可少音频，也别整段失败。
 *
 * 返回 null 表示这条路走不通（不支持 MediaRecorder / 解不出画面 / 播放被拒），
 * 上层据此跳过描述，视频照发。
 */
export async function shrinkVideoForUpload(
    blob: Blob,
    meta: VideoMeta,
): Promise<{ blob: Blob; truncated: boolean } | null> {
    const recorderMime = pickRecorderMime();
    if (!recorderMime) return null;

    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    let audioContext: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let frameHandle = 0;

    const cleanup = () => {
        if (frameHandle) cancelAnimationFrame(frameHandle);
        try { recorder?.state !== 'inactive' && recorder?.stop(); } catch { /* ignore */ }
        try { video.pause(); } catch { /* ignore */ }
        video.removeAttribute('src');
        try { video.load(); } catch { /* ignore */ }
        try { void audioContext?.close(); } catch { /* ignore */ }
        URL.revokeObjectURL(url);
    };

    try {
        video.src = url;
        video.muted = true;      // 声音走 AudioContext，不走扬声器
        video.playsInline = true;
        await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('读取视频画面超时')), 8000);
            video.onloadeddata = () => { window.clearTimeout(timer); resolve(); };
            video.onerror = () => { window.clearTimeout(timer); reject(new Error('这个视频无法解码')); };
        });

        const srcW = video.videoWidth || meta.width || 0;
        const srcH = video.videoHeight || meta.height || 0;
        if (!srcW || !srcH) return null;

        const scale = Math.min(1, VIDEO_TARGET_HEIGHT / srcH);
        const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
        const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        if (!canCaptureCanvas(canvas)) return null;

        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : meta.duration;
        const truncated = duration > VIDEO_MAX_DESCRIBE_SECONDS + 0.5;
        const recordSeconds = Math.min(duration || VIDEO_MAX_DESCRIBE_SECONDS, VIDEO_MAX_DESCRIBE_SECONDS);

        const canvasStream = (canvas as any).captureStream(VIDEO_TARGET_FPS) as MediaStream;
        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

        // 音轨：失败就只录画面（描述里就只剩画面内容，不会整段失败）。
        try {
            const AudioCtor: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AudioCtor) {
                audioContext = new AudioCtor();
                const source = audioContext.createMediaElementSource(video);
                const destination = audioContext.createMediaStreamDestination();
                source.connect(destination);
                tracks.push(...destination.stream.getAudioTracks());
            }
        } catch {
            audioContext = null;
        }

        const stream = new MediaStream(tracks);
        recorder = new MediaRecorder(stream, { mimeType: recorderMime, videoBitsPerSecond: 2_500_000 });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };

        const finished = new Promise<Blob>((resolve, reject) => {
            if (!recorder) { reject(new Error('录制器不可用')); return; }
            recorder.onstop = () => {
                const type = recorderMime.split(';')[0];
                const out = new Blob(chunks, { type });
                out.size > 0 ? resolve(out) : reject(new Error('压缩后的视频是空的'));
            };
            recorder.onerror = () => reject(new Error('压缩视频失败'));
        });

        recorder.start(1000);
        const startedAt = Date.now();
        await video.play();

        const draw = () => {
            if (!video.paused && !video.ended) {
                try { ctx.drawImage(video, 0, 0, outW, outH); } catch { /* 偶发解码空帧，跳过这一帧 */ }
                if ((Date.now() - startedAt) / 1000 < recordSeconds) {
                    frameHandle = requestAnimationFrame(draw);
                    return;
                }
            }
            try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
        };
        frameHandle = requestAnimationFrame(draw);

        const out = await finished;
        return { blob: out, truncated };
    } catch {
        return null;
    } finally {
        cleanup();
    }
}

/**
 * 设置页「测试」按钮用：现生成一段 2.5 秒的测试片（640×360，方块在移动）。
 *
 * 不打包素材，是因为视频没法像识图那样内嵌一张几十 KB 的 PNG；而「测试」必须发真视频
 * ——描述内容对不对，比 HTTP 200 更能说明问题。
 */
export async function createSampleVideoBlob(seconds = 2.5): Promise<Blob | null> {
    const recorderMime = pickRecorderMime();
    if (!recorderMime || typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canCaptureCanvas(canvas)) return null;

    const stream = (canvas as any).captureStream(VIDEO_TARGET_FPS) as MediaStream;
    let recorder: MediaRecorder;
    try {
        recorder = new MediaRecorder(stream, { mimeType: recorderMime, videoBitsPerSecond: 1_500_000 });
    } catch {
        return null;
    }

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };
    const finished = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
            const out = new Blob(chunks, { type: recorderMime.split(';')[0] });
            out.size > 0 ? resolve(out) : reject(new Error('测试视频是空的'));
        };
        recorder.onerror = () => reject(new Error('生成测试视频失败'));
    });

    const startedAt = Date.now();
    recorder.start();
    await new Promise<void>((resolve) => {
        const draw = () => {
            const elapsed = (Date.now() - startedAt) / 1000;
            ctx.fillStyle = '#f3f0ff';
            ctx.fillRect(0, 0, 640, 360);
            const x = 40 + (elapsed / seconds) * 480;
            ctx.fillStyle = '#6d28d9';
            ctx.fillRect(x, 140, 120, 120);
            ctx.fillStyle = '#111827';
            ctx.font = 'bold 28px sans-serif';
            ctx.fillText('SullyOS 视频测试', 40, 60);
            if (elapsed >= seconds) { resolve(); return; }
            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    });
    try { recorder.stop(); } catch { /* ignore */ }
    return finished.catch(() => null);
}
