import type { CharacterProfile, UserProfile } from '../../types';
import { readPhoneContent, generatePhoneContent, type PhoneContent } from './phoneContent';
import type { SubApiConfig } from '../fanwaiGenerator';

/**
 * 角色**自己**手机里的内容摘要。
 *
 * 为什么需要：手机里的微信/朋友圈/相册/备忘录/账单只有生成时的 UI 看过（存 localStorage，
 * 见 phoneContent.ts），从来没有进过 prompt。角色只能凭一句「你必须知道自己手机里有什么」
 * 现场编，跟玩家实际看到的内容对不上。
 *
 * 口径（需求方定案）：
 * - **默认全看过**：手机是他的，里面的一切本来就属于他的已知事实，不做 App 级「看没看过」的记录。
 * - **不统一视角**：现场有两台手机，所以文案里一律用名字指代（{角色名} / {对方名}），
 *   不用「你/他」——同一个代词在两台手机之间会打架。
 * - **不能编**：没生成过就用副 API 默认生成一次（ensureCharPhoneContent，每角色一份），
 *   生成不出来时才让调用方注入「本轮别编具体内容」的兜底。
 */

const clip = (value: unknown, max: number): string =>
    String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** 微信里和「我」的私聊、同步群是真实聊天记录，不在这里重复（模型本来就看过历史）。 */
export const formatCharPhoneDigest = (content: PhoneContent | null, charName: string): string | null => {
    if (!content) return null;
    const lines: string[] = [];

    const groups = content.wechatGroups || [];
    for (const group of groups.slice(0, 3)) {
        const last = (group.messages || []).slice(-1)[0];
        if (!last) continue;
        lines.push(`微信群「${clip(group.name, 12)}」最后一条（${clip(last.from, 8)}）：${clip(last.text, 30)}`);
    }

    const chats = content.wechatChats || [];
    for (const chat of chats.slice(0, 3)) {
        const last = (chat.messages || []).slice(-1)[0];
        if (!last) continue;
        const relation = chat.relation ? `（${clip(chat.relation, 8)}）` : '';
        lines.push(`微信和「${clip(chat.name, 12)}」${relation}的私聊：${clip(last.text, 28)}`);
    }

    const moments = content.moments || [];
    const latestMoment = moments[moments.length - 1];
    if (latestMoment) {
        lines.push(`朋友圈（${clip(latestMoment.time, 8)}）：${clip(latestMoment.text, 40)}`);
    }

    const gallery = content.gallery || [];
    if (gallery.length) {
        const first = gallery[0];
        const title = clip(first.title, 16);
        lines.push(`相册 ${gallery.length} 张，第一张「${title}」${first.body ? `：${clip(first.body, 26)}` : ''}`);
    }

    const memo = content.memo || [];
    if (memo.length) {
        lines.push(`备忘录：${memo.slice(0, 3).map((entry) => `「${clip(entry.title, 12)}」`).join('')}`);
    }

    const diary = content.diary || [];
    if (diary.length) {
        const first = diary[0];
        lines.push(`日记（${clip(first.meta || first.time || '', 10)}）：${clip(first.title, 24)}`);
    }

    const assets = content.alipayAssets;
    if (assets) {
        const bits = [
            assets.total ? `总资产 ${clip(assets.total, 12)}` : '',
            assets.monthExpense ? `本月支出 ${clip(assets.monthExpense, 12)}` : '',
            assets.huabei ? `花呗待还 ${clip(assets.huabei, 12)}` : '',
        ].filter(Boolean);
        if (bits.length) lines.push(`支付宝：${bits.join('，')}`);
    } else if (content.alipay?.length) {
        lines.push(`支付宝账单 ${content.alipay.length} 条，最近一笔：${clip(content.alipay[0].title, 20)}`);
    }

    const read = content.read || [];
    if (read.length) {
        const book = read[0];
        lines.push(`在读《${clip(book.title, 16)}》${Number.isFinite(book.progress) ? ` ${book.progress}%` : ''}`);
    }

    const browser = content.browser || [];
    if (browser.length) {
        lines.push(`手机浏览器搜过「${clip(browser[0].title, 24)}」`);
    }

    const playlists = content.musicPlaylists || [];
    if (playlists.length) {
        lines.push(`歌单：${playlists.slice(0, 3).map((list) => clip(list.name, 10)).join(' / ')}`);
    } else if (content.music?.length) {
        lines.push(`常听《${clip(content.music[0].title, 16)}》`);
    }

    if (lines.length === 0) return null;
    const body = lines.join('；').slice(0, 520);
    return `【${charName}自己手机里的内容（${charName}本来就记得，被问起时如实说，不要现编）】${body}。`;
};

/** 读缓存并生成摘要；没生成过内容就返回 null（不触发副 API 调用）。 */
export const buildCharPhoneDigest = (charId: string, charName: string): string | null => {
    try {
        return formatCharPhoneDigest(readPhoneContent(charId), charName);
    } catch (error) {
        console.warn('[offline-phone] 生成角色手机摘要失败', error);
        return null;
    }
};

/** 同一角色同一时刻只跑一份生成，重复调用共用这一个 promise。 */
const inflight = new Map<string, Promise<void>>();

const hasSubApi = (subApi?: SubApiConfig | null): boolean =>
    !!(subApi?.baseUrl && subApi?.apiKey && subApi?.model);

/**
 * 「默认生成一次」：没有缓存时用副 API 生成一次（每角色只跑一份），然后给摘要。
 *
 * - timeoutMs 传 0 = 只把生成挂起来就跑（进会话时的预取用法），不等结果
 * - 超时就不给摘要，交由调用方注入"不要编"的兜底；生成会继续，下一轮就有内容
 * - 没配副 API 直接返回 null（不报错、不打扰）
 */
export async function ensureCharPhoneContent(input: {
    char: CharacterProfile;
    user: UserProfile;
    subApi?: SubApiConfig | null;
    timeoutMs?: number;
}): Promise<string | null> {
    const { char, user, subApi } = input;
    if (!char?.id) return null;

    const cached = buildCharPhoneDigest(char.id, char.name);
    if (cached) return cached;
    if (!hasSubApi(subApi)) return null;

    let task = inflight.get(char.id);
    if (!task) {
        task = generatePhoneContent(char, user, subApi as SubApiConfig, {})
            .then(() => undefined)
            .catch((error) => {
                console.warn('[offline-phone] 后台生成手机内容失败', error);
            })
            .finally(() => { inflight.delete(char.id); });
        inflight.set(char.id, task);
    }

    const timeoutMs = input.timeoutMs ?? 15000;
    if (timeoutMs <= 0) return null;   // 预取：不阻塞，跑完写进缓存，下一轮就有
    await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
    return buildCharPhoneDigest(char.id, char.name);
}
