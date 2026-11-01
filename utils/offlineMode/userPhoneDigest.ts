import { DB } from '../db';
import { readUserPhonePermissions, type UserPhonePermissions } from './userPhonePermissions';

/**
 * 「他已经翻过你的手机」——把被授权范围内的真实内容压成一段摘要，注入他的上下文（§5.26 A / §6.2）。
 *
 * 为什么要有这个：
 * - 手机到他手里 = 默认他已经看过（需求方定案），所以内容必须进入他的已知事实，
 *   否则会出现「他提起相册里的照片，自己却不知道」的矛盾。
 * - **上限 = 被授权范围**：关掉的 App 不在摘要里，他对应地"看不到"（§4.1）。
 * - 提不提、怎么提，全交给模型按性格决定 —— 这里只给事实，不给台词（§6.3）。
 *
 * 性能：私聊/群聊要读 DB，不能每轮都读，所以按角色做 60 秒缓存；
 * 内容超长会被截断（只保留"最近一条"级别的信息），避免把上下文撑爆。
 */

interface DigestCacheEntry {
    at: number;
    text: string;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, DigestCacheEntry>();

const MUSIC_STATE_KEY = 'sully_music_state_v1';

const clip = (text: string, max: number): string => {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

/** 音乐：从 MusicContext 的持久化状态里读"正在听什么"（不额外调接口） */
const readMusicNow = (): string | null => {
    try {
        const raw = localStorage.getItem(MUSIC_STATE_KEY);
        if (!raw) return null;
        const state = JSON.parse(raw) as { queue?: { name?: string; artists?: string }[]; idx?: number };
        const idx = typeof state?.idx === 'number' ? state.idx : -1;
        const song = idx >= 0 ? state?.queue?.[idx] : undefined;
        if (!song?.name) return null;
        return `${song.name}${song.artists ? `（${song.artists}）` : ''}`;
    } catch {
        return null;
    }
};

/**
 * 生成摘要。holder === 'none'（你的手机在他手里）时才调用。
 * 返回 null 表示没有任何可说的内容（权限全关 / 库里是空的）。
 */
export async function buildUserPhoneDigest(
    charId: string,
    charName: string,
    userName: string,
    permissions?: UserPhonePermissions,
): Promise<string | null> {
    const cached = cache.get(charId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text || null;

    const perms = permissions || readUserPhonePermissions(charId);
    const lines: string[] = [];

    try {
        // ① 你和他的对话：永远可见（那是你们俩的，不存在"给不给看"）
        const own = await DB.getMessagesByCharId(charId);
        const ownCount = own.filter((m) => m.role !== 'system').length;
        lines.push(`你们俩的 ${ownCount} 条对话（全部）`);

        // ② 你和其他角色的私聊（默认关，最敏感）
        if (perms.others) {
            const characters = await DB.getAllCharacters();
            const others = characters.filter((c) => c.id !== charId).slice(0, 6);
            const parts: string[] = [];
            for (const other of others) {
                const messages = await DB.getMessagesByCharId(other.id);
                const last = messages.filter((m) => m.role !== 'system').slice(-1)[0];
                if (!last) continue;
                const who = last.role === 'user' ? userName : other.name;
                parts.push(`和「${other.name}」的对话（最近一条 ${who}：${clip(String(last.content || ''), 28)}）`);
            }
            if (parts.length) lines.push(...parts);
        } else {
            lines.push('相册之外，你和别人的对话他打不开（他只知道有这么一块，看不到内容）');
        }

        // ③ 群聊
        if (perms.groups) {
            const groups = await DB.getGroups();
            const picked = groups.slice(0, 3);
            for (const group of picked) {
                const messages = await DB.getGroupMessages(group.id);
                const last = messages.filter((m) => m.role !== 'system').slice(-1)[0];
                if (!last) continue;
                lines.push(`群「${group.name}」最近一条：${clip(String(last.content || ''), 30)}`);
            }
        }

        // ④ 相册（默认关）：真实照片，但有 review 的才有文字可读
        if (perms.gallery) {
            const images = await DB.getGalleryImages();
            const recent = images.slice(-20).reverse();
            const described = recent.filter((img) => img.review && img.review.trim()).slice(0, 3);
            if (described.length) {
                described.forEach((img) => {
                    lines.push(`相册里一张照片${img.savedDate ? `（${img.savedDate}）` : ''}：${clip(String(img.review), 40)}`);
                });
            } else if (images.length) {
                lines.push(`相册里的 ${images.length} 张照片（他只看到图，没有文字说明）`);
            }
        }

        // ⑤ 音乐
        if (perms.music) {
            const nowPlaying = readMusicNow();
            if (nowPlaying) lines.push(`音乐里正在听：${nowPlaying}`);
        }
    } catch (error) {
        console.error('[offline-phone] 生成"他看过什么"摘要失败', error);
        return cached?.text || null;
    }

    const text = lines.length
        ? `按你自己的权限设置，他能看到的是 —— ${lines.join('；')}。他已经翻过了，可以提起，也可以一句都不提；怎么提由他决定，别替他预设台词。`
        : '';

    cache.set(charId, { at: Date.now(), text });
    return text || null;
}

/** 权限一改就失效缓存，下一次请求立刻按新开关算 */
export const invalidateUserPhoneDigest = (charId?: string): void => {
    if (charId) cache.delete(charId);
    else cache.clear();
};
