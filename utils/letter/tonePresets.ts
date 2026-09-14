/**
 * 来信 · 调性表（source of truth）。
 *
 * 按节日把「信该用什么语气写」分成几条支线，供 utils/letter/generator.ts 拼 prompt 时取用。
 * 结构对齐 utils/fanwaiGenerator.ts 的 FANWAI_STYLE_PRESETS。
 *
 * 命中多个时取**第一个匹配的**（数组顺序即优先级）；LetterConfig.tone 手动指定则覆盖。
 */

import type { LetterOccasion, LetterToneId } from '../../types';

export interface LetterTonePreset {
    id: LetterToneId;
    /** 展示名：情书 / 家书 / 生日 / 纪念日 / 节庆。 */
    name: string;
    /** 命中的节日名列表（与 LetterOccasion.name 比对）。 */
    occasions: string[];
    /** 写进 prompt 的语气要领。 */
    hint: string;
}

export const LETTER_TONES: LetterTonePreset[] = [
    {
        id: 'love',
        name: '情书',
        occasions: ['七夕', '情人节', '520'],
        hint: '私密、有具体细节、可以不讲道理；忌套话、忌排比抒情；结尾留一句不敢当面说的话。',
    },
    {
        id: 'family',
        name: '家书',
        occasions: ['除夕', '春节'],
        hint: '年末回顾体：「这一年你……」+ 一个新年愿望；语气像守岁时说的话，暖但不腻。',
    },
    {
        id: 'birthday',
        name: '生日',
        occasions: ['用户生日'],
        hint: '最私人：只属于这个人，严禁出现任何节日套话；必须写出一个别人不会知道的细节。',
    },
    {
        id: 'anniversary',
        name: '纪念日',
        occasions: ['纪念日'],
        hint: '回望式：从「那天」写到「现在」，带上相伴天数；时间感要真，别写成贺卡。',
    },
    {
        id: 'festive',
        name: '节庆',
        occasions: ['平安夜', '圣诞节', '跨年夜'],
        hint: '轻快、有画面感；跨年夜宜短而有重量，像倒计时那几秒说的话。',
    },
];

/**
 * 按命中节日自动选调性。
 * 生日 / 纪念日优先靠标记位判断（它们的 name 是被覆盖成「用户生日」/ 纪念日 title 的），
 * 其余按 occasions 列表匹配；都没命中时兜底用节庆调性。
 */
export function resolveLetterTone(occasion: LetterOccasion): LetterToneId {
    if (occasion.isUserBirthday) return 'birthday';
    if (occasion.isAnniversary) return 'anniversary';
    const hit = LETTER_TONES.find(t => t.occasions.includes(occasion.name));
    return hit ? hit.id : 'festive';
}

/** 取调性预设；未知 id 兜底到节庆。 */
export function getLetterTone(id: LetterToneId): LetterTonePreset {
    return LETTER_TONES.find(t => t.id === id)
        || LETTER_TONES.find(t => t.id === 'festive')
        || LETTER_TONES[0];
}
