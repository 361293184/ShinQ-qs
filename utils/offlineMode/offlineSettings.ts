import type { OfflineConfig } from '../../types';

/**
 * 线下模式默认值。所有字段可空（读角色 offlineConfig 时按这里兜底），
 * 新增字段时记得同步 DEFAULT 与 normalize。
 */
export const DEFAULT_OFFLINE_CONFIG: Required<OfflineConfig> = {
    enabled: false,
    style: 'cinematic',
    customStyle: '',
    replyLength: 150,
    pov: 'first-you',
    narrationColor: '#9a9a9a',
    userNarrationColor: '#5b8def',
    narrationSize: 14,
    openingNarration: true,
};

/** 回复总字数（旁白+台词）的合法区间 */
export const OFFLINE_LENGTH_MIN = 50;
export const OFFLINE_LENGTH_MAX = 500;

/** 旁白字号合法区间 */
export const OFFLINE_SIZE_MIN = 11;
export const OFFLINE_SIZE_MAX = 22;

export const clampReplyLength = (n: number | undefined): number => {
    const v = Math.round(Number(n) || DEFAULT_OFFLINE_CONFIG.replyLength);
    return Math.min(OFFLINE_LENGTH_MAX, Math.max(OFFLINE_LENGTH_MIN, v));
};

export const clampNarrationSize = (n: number | undefined): number => {
    const v = Math.round(Number(n) || DEFAULT_OFFLINE_CONFIG.narrationSize);
    return Math.min(OFFLINE_SIZE_MAX, Math.max(OFFLINE_SIZE_MIN, v));
};

/** 把任意 partial 配置归一化成完整配置（缺省值兜底），便于各消费方直接解构。 */
export const normalizeOfflineConfig = (cfg?: Partial<OfflineConfig> | null): Required<OfflineConfig> => ({
    ...DEFAULT_OFFLINE_CONFIG,
    ...(cfg || {}),
    // 关键数值再钳一次，防脏数据（比如设置面板拖出来越界的值）
    replyLength: clampReplyLength(cfg?.replyLength),
    narrationSize: clampNarrationSize(cfg?.narrationSize),
    pov: cfg?.pov === 'third-name' || cfg?.pov === 'third-you' ? cfg.pov : (cfg?.pov === 'first-you' ? 'first-you' : DEFAULT_OFFLINE_CONFIG.pov),
    style: cfg?.style || DEFAULT_OFFLINE_CONFIG.style,
});

/** 角色是否开启线下模式 */
export const isOfflineEnabled = (cfg?: OfflineConfig | null): boolean =>
    cfg?.enabled === true;
