import type { CharacterProfile, OfflineConfig } from '../../types';
import { DATE_STYLE_PRESETS } from '../datePrompts';
import { DEFAULT_OFFLINE_CONFIG } from './offlineSettings';

/**
 * 线下模式 prompt 构建（私聊 ChatApp 内注入）。
 * 结构上复用见面模式的风格预设 / 人称三选项，但格式规则是线下自有的：
 * 无立绘标签、纯字符行级解析（行首引号 = 台词）。
 */

/** 去立绘标签：VN 风格示例里每行开头的 [emotion] 前缀，线下不需要 */
const STRIP_EMOTION_TAG = /^\[[a-z_]+\]\s*/gm;

/** 线下格式规则（常驻块，每轮注入） */
export const OFFLINE_FORMAT_BLOCK = `### 📝 线下模式 · 回复格式（必须严格遵守）
你们正在【线下见面】，你的回复要像小说一样分开「旁白」和「台词」：
1. **一行只写一种**：旁白行直接写（不加引号、不加任何标签）；台词行必须用双引号包裹，且**引号必须是该行行首的第一个字符**。
2. **交替推进**：动作 / 氛围 / 心理活动用旁白，真正说出口的话用台词。像写小说分镜一样：旁白铺垫 → 台词 → 旁白反应。
3. **禁止混写**：严禁在同一个里既写动作又写台词（例如"他笑了笑说…"这种要拆成两行）。
4. 不要输出 [normal] 之类任何立绘标签，不要输出渲染说明或括号备注。
5. 台词里的引号是给前端解析器看的，请保证成对出现；旁白不需要引号。`;

/** 叙述风格块：复用见面模式 5 种预设，示例去掉立绘标签 */
export const buildOfflineStyleBlock = (cfg?: Partial<OfflineConfig> | null): string => {
    const preset =
        DATE_STYLE_PRESETS.find((p) => p.id === (cfg?.style || DEFAULT_OFFLINE_CONFIG.style)) ||
        DATE_STYLE_PRESETS[0];
    return `### 🎬 叙述风格（${preset.label}：${preset.hint}）
${preset.block.replace(STRIP_EMOTION_TAG, '')}`;
};

/** 叙事人称块（复用见面模式三选项文案，改造成线下语境） */
export const buildOfflinePovBlock = (
    cfg: Partial<OfflineConfig> | null | undefined,
    charName: string,
    userName: string,
): string => {
    const uname = userName || '对方';
    switch (cfg?.pov) {
        case 'third-name':
            return `### 🎭 叙事人称（必须严格遵守）
旁白使用**第三人称**：称呼你自己为「${charName}」，称呼对方为「${uname}」。旁白里不要出现"我""你"。
示例：${charName}看向${uname}，伸手替${uname}拢了拢被风吹乱的头发。
（台词引号内不受限，正常说话即可。上方风格示例中的人称仅为格式示意，一律以本节为准。）`;
        case 'third-you':
            return `### 🎭 叙事人称（必须严格遵守）
旁白中称呼你自己为「${charName}」（第三人称），称呼对方为"你"。旁白里不要用"我"指代自己。
示例：${charName}看向你，伸手替你拢了拢被风吹乱的头发。
（台词引号内不受限，正常说话即可。上方风格示例中的人称仅为格式示意，一律以本节为准。）`;
        case 'first-you':
            return `### 🎭 叙事人称（必须严格遵守）
旁白使用**第一人称**：称呼你自己为"我"，称呼对方为"你"。不要在旁白里用自己的名字指代自己。
示例：我看向你，伸手替你拢了拢被风吹乱的头发。
（上方风格示例中的人称仅为格式示意，一律以本节为准。）`;
        default:
            return '';
    }
};

/** 自定义文风补充（优先级最高，空则不注入） */
export const buildOfflineCustomStyleBlock = (cfg?: Partial<OfflineConfig> | null): string => {
    const extra = (cfg?.customStyle || '').trim();
    if (!extra) return '';
    return `### ✍️ 用户对文风的额外要求（优先级高于风格预设）
${extra}`;
};

/** 篇幅约束块（旁白+台词合计） */
export const buildOfflineLengthBlock = (cfg?: Partial<OfflineConfig> | null): string => {
    const n = cfg?.replyLength || DEFAULT_OFFLINE_CONFIG.replyLength;
    return `### ✂️ 篇幅
整条回复（旁白 + 台词合计）控制在约 **${n} 字**，不要长篇大论，写满氛围就收。`;
};

/**
 * 线下模式主系统块（send / reroll / 主动消息共用）。
 * 追加在既有系统提示之后，覆盖 ChatApp 默认的「纯聊天」写法。
 */
export const buildOfflineMainBlock = (input: {
    char: CharacterProfile;
    userName: string;
    cfg?: Partial<OfflineConfig> | null;
}): string => {
    const { char, userName, cfg } = input;
    const parts: string[] = [];
    parts.push(`### 🌙 线下模式 · 系统设定（覆盖上方所有"聊天对话"类指令）
你们不是在手机上聊天，而是在同一个地方、同一个时刻【线下见面】。回复一律按下方格式输出。`);
    parts.push(OFFLINE_FORMAT_BLOCK);
    const style = buildOfflineStyleBlock(cfg);
    if (style) parts.push(style);
    const pov = buildOfflinePovBlock(cfg, char.name, userName);
    if (pov) parts.push(pov);
    const extra = buildOfflineCustomStyleBlock(cfg);
    if (extra) parts.push(extra);
    parts.push(buildOfflineLengthBlock(cfg));
    parts.push(`### 🌍 场景
根据最近的对话自然延续当前场景（时间 / 地点 / 天气以最近的消息为准，不要凭空重开）。`);
    return parts.join('\n\n');
};

/** 进入线下时的开场旁白请求（用户侧一条 user 消息的文本） */
export const buildOfflineOpeningRequest = (charName: string): string =>
    `（你轻轻走进${charName}所在的场景。请用一段旁白描写你此刻的状态、周围的环境和你们之间的气氛——只写旁白，不要说话，不要用引号。这一段用于建立氛围，篇幅两三行即可。）`;

/** 主动消息格式块：线下激活时，主动消息也按线下格式生成；通知策略见 amsg 侧 */
export const buildOfflineAmsgBlock = (cfg?: Partial<OfflineConfig> | null): string => {
    const n = cfg?.replyLength || DEFAULT_OFFLINE_CONFIG.replyLength;
    return `### 🌙 主动消息 · 线下格式
这条主动消息同样按线下模式输出：旁白 + 台词交替，行首引号 = 台词。整条控制在约 ${n} 字。
如果这是一条"氛围 / 状态"向的主动消息（比如角色在发呆、看窗外），可以只给旁白不给台词，一样是合法回复。`;
};
