import type { CharacterProfile, UserProfile } from '../../types';
import { callFanwaiLLM, type SubApiConfig } from '../fanwaiGenerator';

/**
 * 他手机里的内容（方案文档 §5.9 的生成架构）。
 *
 * 原则：
 * - **一次性生成**，不是每打开一个 App 就发一次请求；生成结果按角色缓存，下次打开直接读。
 * - 只走**副 API**（subBaseUrl / subApiKey / subModel），主 API 只负责聊天，与番外 / 来信同一条规矩。
 * - 微信的 ①② 类（和"我"的私聊、同步群）**不在这里生成**——那些是真实数据，由 OfflinePhoneWechat 直接读主聊天。
 *   这里只管 ③ 角色独有群、④ 和别人的私聊，以及其余 App 的内容。
 * - 生成失败不阻断界面：各 App 退回"还没接上数据"的占位，并给一个重试入口。
 */

export interface PhoneListEntry {
    title: string;
    sub?: string;
    body?: string;
    meta?: string;
}

export interface GeneratedChatMessage {
    from: string;
    text: string;
}

export interface GeneratedChat {
    name: string;
    relation?: string;
    messages: GeneratedChatMessage[];
}

export interface PhoneContent {
    generatedAt: number;
    /** ③ 角色独有的群（家庭群 / 工作群 / 同学群…） */
    wechatGroups?: GeneratedChat[];
    /** ④ 他和别人的私聊 */
    wechatChats?: GeneratedChat[];
    gallery?: PhoneListEntry[];
    memo?: PhoneListEntry[];
    diary?: PhoneListEntry[];
    alipay?: PhoneListEntry[];
    read?: PhoneListEntry[];
    browser?: PhoneListEntry[];
    music?: PhoneListEntry[];
}

const KEY_PREFIX = 'os_offline_phone_content_';
const keyFor = (charId: string) => `${KEY_PREFIX}${charId}`;

export const readPhoneContent = (charId: string): PhoneContent | null => {
    if (!charId) return null;
    try {
        const raw = localStorage.getItem(keyFor(charId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as PhoneContent : null;
    } catch {
        return null;
    }
};

export const writePhoneContent = (charId: string, content: PhoneContent): void => {
    try {
        localStorage.setItem(keyFor(charId), JSON.stringify(content));
    } catch { /* 存不下就只在本次会话里用 */ }
};

export const clearPhoneContent = (charId: string): void => {
    try { localStorage.removeItem(keyFor(charId)); } catch { /* ignore */ }
};

/** 角色设定压成一小段：给生成的"人设底色"，不要塞整个 systemPrompt */
const personaBrief = (char: CharacterProfile): string => {
    const persona = (char.systemPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const worldview = String((char as { worldview?: string }).worldview || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return `${char.name}${persona ? `\n性格与说话方式：${persona}` : ''}${worldview ? `\n所处世界 / 背景：${worldview}` : ''}`;
};

export const buildPhoneContentPrompt = (char: CharacterProfile, userName: string): string => `你在为一部虚构的手机生成内容。这部手机属于角色「${char.name}」，是他的私人手机。

【角色】
${personaBrief(char)}

【关系】
${char.name} 和「${userName || '用户'}」是熟人/亲密关系。这份手机内容会被「${userName || '用户'}」当面翻看。

【任务】
生成这个人的手机里"本来就有"的东西。要求：具体、日常、有生活质感，能透出他的性格和社交位置；
不要戏剧化、不要句句都在暗示秘密，大部分应该是无聊的真实生活。

【要生成的内容】
1. wechatGroups：他的群聊 2~3 个（家庭群 / 工作群 / 同学群 之类），每个群 3~6 条消息，成员用身份或称呼（"妈""组长""老王"）。
2. wechatChats：他和别人的私聊 2~4 个（家人 / 挚友 / 同事各一个就够），每个 3~6 条消息，from 字段写对方名字，他自己发的写 "me"。
3. gallery：相册 4~6 条，写照片内容（拍的是什么、在哪、大概什么时候）。
4. memo：备忘录 3~5 条（待办、随手记、写了一半的句子）。
5. diary：日记 2~3 条（date + 一两句心里话，不要长篇）。
6. alipay：账单 4~6 条（金额、用途、大致时间）。
7. read：读书 2~3 条（书名 + 一句划线或想法）。
8. browser：搜索记录 4~6 条（真实的人会搜什么就搜什么，包括很没营养的）。
9. music：最近在听 3~5 条（歌名 + 歌手 + 大致时间）。

【输出格式】
**只输出 JSON**，不要解释、不要 markdown 代码块、不要注释。结构如下：
{
  "wechatGroups": [{"name":"家庭群","relation":"家人","messages":[{"from":"妈","text":"..."}]}],
  "wechatChats": [{"name":"老陈","relation":"大学室友","messages":[{"from":"老陈","text":"..."},{"from":"me","text":"..."}]}],
  "gallery": [{"title":"照片内容","sub":"地点","meta":"上周"}],
  "memo": [{"title":"待办标题","body":"正文"}],
  "diary": [{"title":"日期或标题","body":"一两句"}],
  "alipay": [{"title":"用途","meta":"-38.00","sub":"昨天 20:14"}],
  "read": [{"title":"书名","body":"划线或想法"}],
  "browser": [{"title":"搜索词","meta":"前天"}],
  "music": [{"title":"歌名","sub":"歌手","meta":"昨天"}]
}`;

/** 模型经常包一层 ```json 或者前后废话：取第一个 { 到最后一个 } 再解析 */
export const parsePhoneContent = (raw: string): PhoneContent | null => {
    if (!raw) return null;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (!parsed || typeof parsed !== 'object') return null;
        return { generatedAt: Date.now(), ...parsed } as PhoneContent;
    } catch {
        return null;
    }
};

export interface GeneratePhoneContentResult {
    ok: boolean;
    content?: PhoneContent;
    reason?: 'no_sub_api' | 'empty' | 'parse_failed' | 'api_error';
}

export async function generatePhoneContent(
    char: CharacterProfile,
    user: UserProfile,
    subApi: SubApiConfig,
): Promise<GeneratePhoneContentResult> {
    const { baseUrl, apiKey, model } = subApi || {} as SubApiConfig;
    if (!baseUrl || !apiKey || !model) return { ok: false, reason: 'no_sub_api' };

    try {
        const raw = await callFanwaiLLM(buildPhoneContentPrompt(char, user?.name || '用户'), subApi, {
            // 0.8：要具体、像真的，但别飘
            temperature: 0.8,
            meta: {
                appName: '线下手机生成',
                charId: char.id,
                charName: char.name,
                purpose: '生成角色手机内容',
            },
        });
        if (!raw) return { ok: false, reason: 'empty' };
        const content = parsePhoneContent(raw);
        if (!content) return { ok: false, reason: 'parse_failed' };
        writePhoneContent(char.id, content);
        return { ok: true, content };
    } catch (error) {
        console.error('[offline-phone] 生成失败', error);
        return { ok: false, reason: 'api_error' };
    }
}
