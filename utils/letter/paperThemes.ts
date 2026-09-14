/**
 * 来信 · 信纸皮肤表。
 *
 * 不做固定米白：整张信纸的配色（纸底色 / 墨色 / 年份章色 / 火漆色）跟着节日整套换。
 * 绝大多数主题是浅底深字，唯一例外是除夕/春节的「深红金线信笺」（dark: true），
 * 该主题需由渲染层补一点可读性兜底（极淡描边）。
 */

import type { LetterOccasion, LetterPaperThemeId, LetterToneId } from '../../types';

export interface LetterPaperTheme {
    id: LetterPaperThemeId;
    name: string;
    /** 纸底色。 */
    paper: string;
    /** 墨色（手写字）。 */
    ink: string;
    /** 年份章颜色。 */
    stamp: string;
    /** 火漆印颜色（信封上的封蜡）。 */
    seal: string;
    /** 深底浅字：需要渲染层做可读性兜底（描边）。目前仅除夕/春节。 */
    dark?: boolean;

    // ── 以下为**可选**节庆装饰字段：只有新年（除夕/春节）填值 ──
    // 渲染层一律用 festive 分流；未填的主题走原分支，渲染结果与改动前逐像素一致。
    /** 是否启用节庆装饰（动态烟花 + 深红金线信笺）。仅新年为 true。 */
    festive?: boolean;
    /** 金线描边色：外框 / 四角角花 / 标题两侧横线。 */
    innerBorder?: string;
}

export const LETTER_PAPER_THEMES: LetterPaperTheme[] = [
    // 情书 —— 藕荷粉纸 + 深紫墨，稍微带一点暧昧的暖。
    { id: 'qixi', name: '情书', paper: '#FBF0F4', ink: '#4A2B3D', stamp: '#C96F8A', seal: '#B3445F' },
    // 家书 —— 深红金线「新年信笺」（除夕 / 春节专属形态）。
    // 参考的是正式年节纸质信笺：整片红枣红底、金线框与角花，米白正文直接落在红底上，
    // 不再有「米色内页」那一层，所以 ink 是米白而非金色 —— 金色正文压在深红上会发燥。
    // 唯一的深底浅字主题。
    {
        id: 'newyear', name: '家书',
        paper: '#7E1D1D', ink: '#EFE0D2', stamp: '#C9A227', seal: '#E8C87A', dark: true,
        festive: true,
        innerBorder: '#C9A227',
    },
    // 生日 —— 最私人，配色最「暖」。
    { id: 'birthday', name: '生日', paper: '#FDF7E8', ink: '#4A3A22', stamp: '#B8860B', seal: '#C9A227' },
    // 纪念日 —— 比生日更暗、更旧，像一封在抽屉里放了很久的信。
    { id: 'anniversary', name: '纪念日', paper: '#F3E9D8', ink: '#3B2B1E', stamp: '#A67C3D', seal: '#8C6428' },
    // 平安夜 / 圣诞 —— 冷一点，跟其他区分开。
    { id: 'christmas', name: '圣诞', paper: '#F2F7F2', ink: '#22382C', stamp: '#2E6B4F', seal: '#2E6B4F' },
    // 跨年夜 —— 短而有重量。
    { id: 'newyearEve', name: '跨年', paper: '#F0F2F7', ink: '#1A2B4A', stamp: '#5A7CA8', seal: '#5A7CA8' },
    // 默认兜底 —— 米白纸 + 深蓝墨 + 琥珀章。
    { id: 'default', name: '信纸', paper: '#FDF8F0', ink: '#1A2B4A', stamp: '#BA7517', seal: '#BA7517' },
];

/** 取信纸主题；未知 id 兜底到默认。 */
export function getPaperTheme(id: LetterPaperThemeId): LetterPaperTheme {
    return LETTER_PAPER_THEMES.find(t => t.id === id)
        || LETTER_PAPER_THEMES[LETTER_PAPER_THEMES.length - 1];
}

/**
 * 按节日/调性选信纸主题。
 * 优先按节日名精确匹配（平安夜/圣诞/跨年要分开），再退回调性映射，最后兜底默认。
 */
export function resolvePaperTheme(tone: LetterToneId, occasion: LetterOccasion): LetterPaperThemeId {
    if (occasion.isUserBirthday) return 'birthday';
    if (occasion.isAnniversary) return 'anniversary';

    const byOccasion: Record<string, LetterPaperThemeId> = {
        '七夕': 'qixi',
        '情人节': 'qixi',
        '520': 'qixi',
        '除夕': 'newyear',
        '春节': 'newyear',
        '平安夜': 'christmas',
        '圣诞节': 'christmas',
        '跨年夜': 'newyearEve',
    };
    if (byOccasion[occasion.name]) return byOccasion[occasion.name];

    switch (tone) {
        case 'love': return 'qixi';
        case 'family': return 'newyear';
        case 'birthday': return 'birthday';
        case 'anniversary': return 'anniversary';
        default: return 'default';
    }
}
