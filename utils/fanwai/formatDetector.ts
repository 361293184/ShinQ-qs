/**
 * 番外 HTML 格式识别。
 * 默认番外是纯文字；仅当指令（worldSetting）里提到"小手机/论坛/状态栏"等格式时，
 * 才切换成 HTML 格式输出。多格式关键词冲突时取第一个命中为准。
 */

export type FanwaiHtmlType = 'phone' | 'forum' | 'statusbar' | 'custom';

/** 番外「生成模式」：text = 纯文字（忽略一切格式词）；html = 出 HTML（命中内置模板用模板，否则 AI 自由生成）。 */
export type FanwaiGenMode = 'text' | 'html';

/** 关键词 → 模板类型。按方案三套预置模板 + custom（AI 自由）。 */
const KEYWORDS: { type: FanwaiHtmlType; words: string[] }[] = [
    {
        type: 'phone',
        words: ['小手机', '手机', '聊天记录', '微信', '短信', '聊天气泡', '聊天天'],
    },
    {
        type: 'forum',
        words: ['论坛', '帖子', '贴吧', '楼层', '回复', '盖楼', '评论'],
    },
    {
        type: 'statusbar',
        words: ['状态栏', '状态条', '胶囊'],
    },
];

/** 否定词（长词优先）。关键词前后一段出现这些词时，视为"不要这个格式"，跳过。 */
const NEGATION_WORDS = ['不需要', '不用', '不要', '无需', '请勿', '勿', '免', '去掉', '取消', '别', '不'];

/** 关键词前后各取多少字符作否定判断窗口（覆盖「不需要生成状态栏」「状态栏不需要」等）。 */
const NEG_WINDOW = 10;

/**
 * 判断 text 中位置 index（词长 wordLen）的关键词是否被否定。
 * 以关键词为中心，前后各取约 10 个字检测否定词，覆盖「不需要生成状态栏」「状态栏不用」等写法。
 */
function isNegated(text: string, index: number, wordLen: number): boolean {
    const start = Math.max(0, index - NEG_WINDOW);
    const end = Math.min(text.length, index + wordLen + NEG_WINDOW);
    const around = text.slice(start, end);
    return NEGATION_WORDS.some(n => around.includes(n));
}

/**
 * custom「HTML 意图」常见词：指令提到这些词（但没有命中内置三格式）时，
 * 判定为要让 AI 自由生成 HTML（问卷/表单/卡片/界面等），而不是纯文字。
 * 大小写不敏感（html/HTML 都算）。词表适度，避免过度误伤普通文字指令。
 */
const CUSTOM_HTML_WORDS = [
    'html', '问卷', '表单', '卡片', '界面', '网页', '网站', 'ui', '组件', 'h5', '页面', '弹窗', '面板', 'app界面', '可视化',
];

/**
 * 只检测内置三模板（phone/forum/statusbar），不含 custom 意图词。
 * 供「显式 HTML 模式」用：明确提到内置格式词才用预置模板，否则交给 AI 自由生成。
 */
export function detectBuiltinHtmlType(worldSetting?: string): Exclude<FanwaiHtmlType, 'custom'> | undefined {
    const text = (worldSetting || '').trim();
    if (!text) return undefined;
    for (const k of KEYWORDS) {
        for (const w of k.words) {
            const idx = text.indexOf(w);
            if (idx >= 0 && !isNegated(text, idx, w.length)) return k.type as Exclude<FanwaiHtmlType, 'custom'>;
        }
    }
    return undefined;
}

/**
 * 纯关键词检测：在指令文本里匹配格式关键词，返回命中的模板类型。
 * 匹配顺序：先内置三格式（phone/forum/statusbar），再 custom HTML 意图词。
 * 多格式冲突时返回第一个命中；无命中返回 undefined（纯文字番外）。
 * 大小写不敏感。
 */
export function detectHtmlFormat(worldSetting?: string): FanwaiHtmlType | undefined {
    const text = (worldSetting || '').trim();
    if (!text) return undefined;
    // 内置格式优先（它们通常更明确，如"论坛"/"小手机"）。
    // 否定表述（如"不需要状态栏"）跳过该格式，避免误触发。
    const builtin = detectBuiltinHtmlType(worldSetting);
    if (builtin) return builtin;
    // 无内置格式但含 HTML 意图 → custom（AI 按指令自由生成 HTML）
    const lower = text.toLowerCase();
    for (const w of CUSTOM_HTML_WORDS) {
        const idx = lower.indexOf(w);
        if (idx >= 0 && !isNegated(lower, idx, w.length)) return 'custom';
    }
    return undefined;
}

/**
 * 按「生成模式」决定番外输出 HTML 类型（文字/HTML 分开方案的核心入口）。
 *
 * - mode === 'text'  → undefined：强制纯文字。无论世界设定写了什么格式词都忽略
 *   （场景里提到"手机短信/论坛"只是剧情内容，不是要 HTML 格式）。
 * - mode === 'html'  → 已确定出 HTML：命中内置三模板（小手机/论坛/状态栏）用对应
 *   模板；没命中直接 custom（HTML 形态开放，交给 AI 按世界设定自由生成，不再靠
 *   "html/卡片/界面"等意图词猜）。
 * - 不传 mode → 兼容旧行为：走 detectHtmlFormat（关键词命中才 HTML，否则纯文字）。
 *
 * 只影响「文字 vs HTML」这一维；字数/楼层数/文风等其他指令检测全部照常生效，
 * AI 在 HTML 模式下仍会读到完整的世界设定指令。
 */
export function resolveHtmlType(
    worldSetting?: string,
    mode?: FanwaiGenMode,
): FanwaiHtmlType | undefined {
    if (mode === 'text') return undefined;
    if (mode === 'html') return detectBuiltinHtmlType(worldSetting) ?? 'custom';
    return detectHtmlFormat(worldSetting);
}

/** 是否有任意格式关键词命中（供生成页提示用）。 */
export function hasFormatKeyword(worldSetting?: string): boolean {
    return detectHtmlFormat(worldSetting) !== undefined;
}

/** 模板类型的中文名（生成页提示/预览标题用）。 */
export const HTML_TYPE_LABELS: Record<FanwaiHtmlType, string> = {
    phone: '小手机',
    forum: '论坛',
    statusbar: '状态栏',
    custom: '自定义',
};

/**
 * 数量限定词 + 量词模式。用于检测指令里是否含明确的数量/条数要求（字数、楼层、对话条数等）。
 * 一旦检测到，生成时「以指令为准」，页面字数档位让位仅作兜底。
 */
const QUANTITY_RE = /(不少于|不低于|至少|大于|超过|多于|超出|≥|≤|以上|以下|以内|上下浮动|约)\s*\d+|\d+\s*(字|层|楼|条|段|句|条对话|个回复|个评论|分钟|小时|话)/;

/**
 * 检测指令（worldSetting）里是否有明确的数量要求（如「论坛不少于80层楼」「5000字」「30条对话」）。
 * 返回 true 表示指令已明确要求生成多少字数/条数，应以此为准（页面字数档位让位）。
 */
export function detectExplicitQuantity(worldSetting?: string): boolean {
    const text = (worldSetting || '').trim();
    if (!text) return false;
    return QUANTITY_RE.test(text);
}

/**
 * 从指令里提取明确的楼层数（如「不少于80层楼」「80楼」「80层」→ 80）。
 * 返回具体数字；未提到楼层数或无法解析返回 undefined。
 */
export function extractFloorCount(worldSetting?: string): number | undefined {
    const text = (worldSetting || '').trim();
    if (!text) return undefined;
    // 兼容「N 层楼 / N 楼 / N 层 / 不少于 N 层」等多种表述：数字紧跟"层/楼"
    const m = text.match(/(\d+)\s*(?:层|楼)/);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    // 防异常超大数字（如用户写 999999）撑爆生成，封顶一个合理上限
    return Math.min(n, 500);
}

/** 从指令里提取的 HTML 预览尺寸（仅 custom HTML 使用）。 */
export interface HtmlSize {
    /** height 像素值（如 540px → 540）；未指定 undefined。 */
    height?: number;
    /** max-width 像素值；未指定 undefined。 */
    maxWidth?: number;
}

/**
 * 从指令里提取 custom HTML 的预览尺寸（如「height 540px」「max-width 450px」）。
 * 提取成功返回对应字段；未提到返回空对象。数字可能带单位 px。
 */
export function extractHtmlSize(worldSetting?: string): HtmlSize {
    const text = (worldSetting || '').trim();
    const size: HtmlSize = {};
    const h = text.match(/(?:height|高度)\s*[:：]?\s*(\d+)\s*(?:px)?/i);
    if (h) {
        const n = parseInt(h[1], 10);
        if (Number.isFinite(n) && n > 0) size.height = n;
    }
    const mw = text.match(/(?:max-width|最大宽度)\s*[:：]?\s*(\d+)\s*(?:px)?/i);
    if (mw) {
        const n = parseInt(mw[1], 10);
        if (Number.isFinite(n) && n > 0) size.maxWidth = n;
    }
    return size;
}
