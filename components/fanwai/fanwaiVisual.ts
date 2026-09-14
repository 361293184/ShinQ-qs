/**
 * 拾光 · 番外的视觉常量与文本工具。
 * 从 apps/FanwaiApp.tsx 抽出，供列表与详情共用（避免重写后两处各留一份）。
 */

import type { FanwaiStory } from '../../types';

/** 文风 → 迷你书封面渐变（暖色治愈系）。 */
export const STYLE_GRADIENTS: Record<string, string> = {
    healing: 'from-[#FDE7D7] via-[#F7CBA8] to-[#EFB6C6]',
    ancient: 'from-[#F8E3C2] via-[#EFCE93] to-[#E2B87E]',
    suspense: 'from-[#EAE0EE] via-[#D7C8E0] to-[#BFADC9]',
    daily: 'from-[#F9DCE3] via-[#F3C0CE] to-[#E79DB4]',
    custom: 'from-[#F3EBDD] via-[#E7D8BE] to-[#D9C39A]',
    random: 'from-[#EDE7F2] via-[#D6CEE4] to-[#B9AED4]', // 随机模式：中性紫调
};

export const DEFAULT_GRADIENT = 'from-[#F3EBDD] via-[#E7D8BE] to-[#D9C39A]';

export const STYLE_NAMES: Record<string, string> = {
    healing: '温柔治愈', ancient: '古风', suspense: '悬疑', daily: '日常甜宠', custom: '自定义', random: '随机',
};

export const POV_NAMES: Record<string, string> = { first: 'char 视角', second: 'user 视角', third: '第三视角' };

/** 列表用的相对日期：今天 / M.D / YYYY.M.D。 */
export function fmtDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return '今天';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 番外正文拆「标题 + 正文」（第一行是书名）。 */
export function storyParts(story: FanwaiStory): { title: string; body: string } {
    const lines = story.content.split('\n');
    const title = lines.find(l => l.trim())?.trim() || '未命名';
    const body = lines.slice(1).join('\n').trim() || story.content;
    return { title, body };
}
