/**
 * 反查手机 · 真实数据采样
 *
 * 角色接管用户真实手机时，按当前打开的 App 真实读取用户手机里该 App 的数据
 * （聊天记录 / 朋友圈 / 相册 / 日记 / 日程 / 音乐 / 世界书 / 用户资料），
 * 把真实内容组装成「角色看到了什么」(detail) 和「角色知道了什么」(learned)，
 * 供 LLM 生成角色感想并写入反查记录、记忆宫殿、总结卡片。
 *
 * 异步读 IndexedDB（经 DB 统一入口），失败回落通用文案，不阻断浏览。
 */

import { DB } from '../db';
import { AppID } from '../../types';
import type { CharacterProfile, Message } from '../../types';

/** 采样上下文 */
export interface ReverseSamplerCtx {
    /** 正在接管的角色（反查的发起者） */
    char: CharacterProfile;
    /** 所有角色（用于判断"用户和谁聊"） */
    characters: CharacterProfile[];
    /** 用户自己的名字 */
    userName: string;
}

/** 采样结果 */
export interface ReverseSample {
    /** 角色"看到了什么"（界面内容描述） */
    detail: string;
    /** 角色"知道了什么"（从真实数据提炼的具体信息） */
    learned: string;
}

const MAX_ITEMS = 4;
const MAX_MSG = 6;

/** 把一条消息转成一句话（区分用户/角色） */
function msgLine(m: Message, userName: string): string {
    if (m.role === 'user') {
        return `你：${(m.content || '').slice(0, 40)}`;
    }
    return `对方：${(m.content || '').slice(0, 40)}`;
}

/**
 * 采样聊天记录：读取"用户和某个联系人"的最新几条真实聊天。
 * 「滑到谁读谁」——浏览计划每步聚焦一个联系人（targetCharId），
 * 角色只读到当前正在看的那个人的私聊，没滑到的不知道。
 * targetCharId 未提供时，回退读接管角色自己的对话。
 */
async function sampleChat(char: CharacterProfile, characters: CharacterProfile[], userName: string, targetCharId?: string): Promise<ReverseSample> {
    // 只读"当前正在看的那个人"的对话（反查者滑到谁，就知道谁的）
    let chatMsgs: { targetName: string; lines: string[] }[] = [];

    const targets = targetCharId
        ? [characters.find(c => c.id === targetCharId) || char]
        : [char];
    for (const target of targets) {
        try {
            const msgs = await DB.getRecentMessagesByCharId(target.id, MAX_MSG, true);
            if (msgs.length === 0) continue;
            chatMsgs.push({ targetName: target.name, lines: msgs.map(m => msgLine(m, userName)) });
        } catch { /* 读取失败跳过 */ }
    }

    if (chatMsgs.length === 0) {
        return { detail: '聊天记录', learned: '' };
    }

    // 组装"看到了什么"（前 2 个对话的最近消息）
    const parts = chatMsgs.slice(0, 2).map(c =>
        `和「${c.targetName}」的聊天：${c.lines.slice(0, 4).join(' / ')}`
    );
    const detail = `聊天记录：${parts.join('；')}`;

    // "知道了什么"：从真实消息提炼"用户主动表达的关键内容"，不再重复整段对话原文（避免和 detail 雷同）
    const userSays = chatMsgs.flatMap(c => c.lines.filter(l => l.startsWith('你：'))).slice(0, 3);
    const targetNames = chatMsgs.slice(0, 2).map(c => `「${c.targetName}」`).join('、');
    const learned = userSays.length > 0
        ? `与${targetNames}对话中你重点提到：${userSays.join('；')}`
        : `与${targetNames}的对话多由对方发起，你没什么主动表达`;

    return { detail, learned };
}

/** 采样朋友圈：读取用户本人发的最近动态 */
async function sampleSocial(userName: string): Promise<ReverseSample> {
    try {
        const posts = await DB.getSocialPosts();
        const userPosts = posts
            .filter(p => p.authorType === 'user' || p.authorName === userName)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_ITEMS);
        if (userPosts.length === 0) return { detail: '朋友圈动态', learned: '' };
        const detail = `你发的朋友圈：${userPosts.map(p => `「${(p.content || p.title || '').slice(0, 40)}」`).join(' / ')}`;
        const learned = `你最近在朋友圈发了：${userPosts.map(p => (p.content || p.title || '').slice(0, 30)).join('；')}`;
        return { detail, learned };
    } catch {
        return { detail: '朋友圈动态', learned: '' };
    }
}

/** 采样相册：读取用户最近保存的图片（说明/日期） */
async function sampleGallery(): Promise<ReverseSample> {
    try {
        const imgs = await DB.getGalleryImages();
        const recent = [...imgs].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ITEMS);
        if (recent.length === 0) return { detail: '相册', learned: '' };
        const descs = recent.map(i => i.review || i.savedDate || '一张图片').slice(0, 3);
        const detail = `你保存的图片：${descs.join(' / ')}`;
        const learned = `你的相册里有${recent.length}张最近保存的图片（${descs.slice(0, 3).join('；')}）`;
        return { detail, learned };
    } catch {
        return { detail: '相册', learned: '' };
    }
}

/** 采样用户资料 */
async function sampleProfile(): Promise<ReverseSample> {
    try {
        const p = await DB.getUserProfile();
        if (!p) return { detail: '个人资料', learned: '' };
        const detail = `你的个人资料：${p.name || '未命名'}${p.bio ? `（${p.bio.slice(0, 40)}）` : ''}`;
        const learned = `你的名字是${p.name || '未知'}${p.bio ? `，签名是「${p.bio.slice(0, 30)}」` : ''}`;
        return { detail, learned };
    } catch {
        return { detail: '个人资料', learned: '' };
    }
}

/** 采样日记 */
async function sampleJournal(char: CharacterProfile): Promise<ReverseSample> {
    try {
        const entries = await DB.getDiariesByCharId(char.id);
        const recent = [...entries].slice(-MAX_ITEMS).reverse();
        if (recent.length === 0) return { detail: '日记', learned: '' };
        const lines = recent.map(d => (d.userPage || '').slice(0, 40)).filter(Boolean);
        const detail = `你的日记：${lines.join(' / ') || '（有记录）'}`;
        const learned = lines.length > 0 ? `你的日记里最近写了：${lines.slice(0, 2).join('；')}` : '';
        return { detail, learned };
    } catch {
        return { detail: '日记', learned: '' };
    }
}

/** 采样音乐：最近收藏/播放的歌单 */
async function sampleMusic(): Promise<ReverseSample> {
    try {
        const songs = await DB.getAllSongs();
        const recent = [...songs].slice(-MAX_ITEMS).reverse();
        if (recent.length === 0) return { detail: '音乐', learned: '' };
        const titles = recent.map(s => s.title || '未命名歌曲').slice(0, 3);
        const detail = `你最近听的音乐：${titles.join(' / ')}`;
        const learned = `你最近在听：${titles.join('、')}`;
        return { detail, learned };
    } catch {
        return { detail: '音乐', learned: '' };
    }
}

/** 采样世界书 */
async function sampleWorldbook(): Promise<ReverseSample> {
    try {
        const books = await DB.getAllWorldbooks();
        const recent = [...books].slice(-MAX_ITEMS).reverse();
        if (recent.length === 0) return { detail: '世界书', learned: '' };
        const titles = recent.map(b => b.title || '未命名').slice(0, 3);
        const detail = `你的世界书：${titles.join(' / ')}`;
        const learned = `你的世界书里有：${titles.join('、')}`;
        return { detail, learned };
    } catch {
        return { detail: '世界书', learned: '' };
    }
}

/**
 * 按 App 读取用户真实数据，返回角色"看到了什么/知道了什么"。
 * 未知/不可读的 App 返回通用文案，不报错不阻断。
 */
export async function sampleAppData(appId: string, ctx: ReverseSamplerCtx, targetCharId?: string): Promise<ReverseSample> {
    const { char, characters, userName } = ctx;
    switch (appId) {
        case AppID.Chat:
            return sampleChat(char, characters, userName, targetCharId);
        case AppID.Social:
            return sampleSocial(userName);
        case AppID.Gallery:
            return sampleGallery();
        case AppID.User:
            return sampleProfile();
        case AppID.Journal:
            return sampleJournal(char);
        case AppID.Music:
            return sampleMusic();
        case AppID.Worldbook:
            return sampleWorldbook();
        default:
            return { detail: '', learned: '' };
    }
}
