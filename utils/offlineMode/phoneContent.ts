import type { CharacterProfile, UserProfile } from '../../types';
import { callFanwaiLLM, type SubApiConfig } from '../fanwaiGenerator';

/**
 * 他手机里的内容（方案文档 §5.9 的生成架构）。
 *
 * 原则：
 * - **一次性生成**（打开手机时），结果按角色缓存，之后每次打开只读缓存，零成本。
 * - 只走**副 API**（subBaseUrl / subApiKey / subModel），主 API 只负责聊天。
 * - **并行分块**（§5.9 D 定案）：一次生成所有 App 会撞 max_tokens 且后半段敷衍，
 *   所以按「几个 App 一块」并发发请求，每块 2~4 个 App；单块失败只补那一块，不全部重来。
 * - 微信的 ①② 类（和「我」的私聊、同步群）**不在这里生成**——那些是真实数据，由 OfflinePhoneWechat 直接读主聊天。
 *   这里只管 ③ 角色独有群、④ 和别人的私聊。
 * - 内容必须来自「角色性格 + 角色记忆」（§5.7 A 通则二），所以 prompt 里会带上人设与记忆摘要。
 */

export interface PhoneListEntry {
    title: string;
    sub?: string;
    body?: string;
    meta?: string;
    /** 相册：偷拍/工作/日常/截图/风景/合照 */
    type?: string;
    /** 账单/转账：金额（带符号，如 -38.00 / +2000） */
    amount?: string;
    /** 账单分类：餐饮/交通/购物/娱乐/医疗/房租/转账 */
    category?: string;
    /** 精确时间（详情页）= meta 的更完整版本 */
    time?: string;
    /** 备忘录：置顶 */
    pinned?: boolean;
    /** 备忘录清单：勾选进度，如 2/5 */
    checklist?: string;
    /** 备忘录清单的条目文字（前 checklist.done 条是勾上的） */
    items?: string[];
    /** 读书：作者 */
    author?: string;
    /** 读书：书单（在读/读完/想读） */
    shelf?: 'reading' | 'read' | 'want';
    /** 读书：进度百分比 */
    progress?: number;
    /** 读书：划线/笔记 */
    quote?: string;
    /** 音乐：歌手 */
    artist?: string;
    /** 音乐：循环次数 */
    plays?: number;
    /** 音乐：歌词片段 */
    lyric?: string;
    /** 浏览器：搜索结果 */
    results?: { title: string; summary?: string; source?: string }[];
    /** 浏览器：网友评论（互相矛盾才真实） */
    comments?: string[];
    /** 日记：天气 */
    weather?: string;
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

/** 支付宝资产（文档 §5.10 B：资产总览 / 本月收支 / 银行卡 / 基金 / 花呗） */
export interface PhoneAlipayAssets {
    /** 总资产 */
    total?: string;
    balance?: string;
    yuebao?: string;
    monthExpense?: string;
    monthIncome?: string;
    cards?: { name: string; tail?: string; balance?: string }[];
    /** 基金 / 理财持仓：盈亏按项目规则「涨红跌绿」 */
    funds?: { name: string; amount?: string; profit?: string; profitRate?: string }[];
    /** 花呗 / 借呗待还 */
    huabei?: string;
}

/** 音乐：概念歌单（文档 §5.14 D：3 个概念歌单，名字本身就暴露性格） */
export interface PhoneMusicPlaylist {
    name: string;
    songs: { title: string; artist?: string }[];
}

/** 朋友圈（文档 §5.6 H） */
export interface PhoneMoment {
    author: string;
    time: string;
    text: string;
    /** 图片只写文字描述（零生图，用色块 + 文字） */
    images?: string[];
    likes?: string[];
    comments?: { from: string; text: string }[];
}

/** 微信「我」页的账号信息 */
export interface PhoneWechatProfile {
    nickname: string;
    wechatId: string;
    signature?: string;
}

/** 分块状态：ok = 这块生成成功；failed = 上次失败，需要「仅补齐」 */
export type PhoneBlockStatus = 'ok' | 'failed';

/**
 * 内容结构版本。换 prompt / 换字段就要 +1：
 * 旧缓存会被当成「没生成」，打开手机时自动重生成一次，用户不用手动清缓存。
 * v2：分块生成 + 每条的详情字段（body/type/amount/progress/quote/results/comments…）
 * v3：支付宝资产 / 音乐歌单 / 朋友圈 / 微信账号（各 App 有了自己的首页，不再只有列表）
 */
export const PHONE_CONTENT_SCHEMA = 3;

export interface PhoneContent {
    generatedAt: number;
    schemaVersion?: number;
    /** ③ 角色独有的群（家庭群 / 工作群 / 同学群…） */
    wechatGroups?: GeneratedChat[];
    /** ④ 他和别人的私聊 */
    wechatChats?: GeneratedChat[];
    /** 微信「我」页的账号信息（v3） */
    profile?: PhoneWechatProfile;
    /** 朋友圈（v3，§5.6 H） */
    moments?: PhoneMoment[];
    /** 支付宝资产总览（v3，§5.10 B） */
    alipayAssets?: PhoneAlipayAssets;
    /** 音乐歌单（v3，§5.14 D） */
    musicPlaylists?: PhoneMusicPlaylist[];
    gallery?: PhoneListEntry[];
    memo?: PhoneListEntry[];
    diary?: PhoneListEntry[];
    alipay?: PhoneListEntry[];
    read?: PhoneListEntry[];
    browser?: PhoneListEntry[];
    music?: PhoneListEntry[];
    /** 每块生成了没有，用于「仅补齐未完成的」判断 */
    blocks?: Partial<Record<PhoneBlockId, PhoneBlockStatus>>;
}

/* ------------------------------------------------------------------ */
/* 存储                                                                */
/* ------------------------------------------------------------------ */

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

/**
 * 「仅补齐未完成的」用的合并：已经生成过的内容原样保留，缺的（空数组 / undefined）用新结果填上。
 * 新生成的结果是整份的，所以这里逐字段判断，不能整体覆盖。
 */
export const mergePhoneContent = (base: PhoneContent | null, incoming: PhoneContent): PhoneContent => {
    if (!base) return incoming;
    const merged: PhoneContent = { ...incoming, generatedAt: Date.now(), schemaVersion: PHONE_CONTENT_SCHEMA };
    (Object.keys(incoming) as (keyof PhoneContent)[]).forEach((key) => {
        if (key === 'generatedAt' || key === 'blocks') return;
        const oldValue = base[key];
        const hasOld = Array.isArray(oldValue) ? oldValue.length > 0 : Boolean(oldValue);
        if (hasOld) (merged as unknown as Record<string, unknown>)[key as string] = oldValue;
    });
    if (base.blocks) merged.blocks = { ...base.blocks, ...incoming.blocks };
    return merged;
};

/* ------------------------------------------------------------------ */
/* 分块定义（§5.9 D 定案的分块，只保留本项目已做的 App）                 */
/* ------------------------------------------------------------------ */

export type PhoneBlockId = 'wechat' | 'gallery' | 'alipay' | 'memoRead' | 'diary' | 'browserMusic';

/** 分块顺序 = 用户点开的概率顺序（微信/相册先到） */
export const PHONE_BLOCK_ORDER: PhoneBlockId[] = ['wechat', 'gallery', 'alipay', 'memoRead', 'diary', 'browserMusic'];

export const PHONE_BLOCK_LABELS: Record<PhoneBlockId, string> = {
    wechat: '微信',
    gallery: '相册',
    alipay: '支付宝',
    memoRead: '备忘录 · 读书',
    diary: '日记',
    browserMusic: '浏览器 · 音乐',
};

interface BlockSpec {
    id: PhoneBlockId;
    /** 这块负责的字段：全部为空才算"没生成" */
    keys: (keyof PhoneContent)[];
    /** 输出 JSON 的键名说明，拼进 prompt */
    prompt: string;
}

const BLOCKS: Record<PhoneBlockId, BlockSpec> = {
    wechat: {
        id: 'wechat',
        keys: ['wechatGroups', 'wechatChats', 'profile', 'moments'],
        prompt: `1. wechatGroups：他**自己独有的群** 2~3 个（家庭群 / 工作群 / 同学群 / 游戏群之类），每个群 **8~15 条**消息。
   - from 写发言人的称呼（"妈""组长""老王""班长"），他自己发言写 "me"
   - 群里要真的**多个人**在说话，不要两个人一问一答
   - 内容要碎：谁买菜、几点到家、报销单在哪、有人发了个表情、有人发错群
2. wechatChats：他和**别人**的私聊 2~4 个（家人 / 挚友 / 同事各一个），每个 **10~20 条**消息。
   - from 写对方称呼，他自己发言写 "me"
   - 要像真聊天：短句、有来有回、有时隔了很久才回、有生活琐事和一点情绪
3. profile：他自己的微信账号 —— {nickname 昵称, wechatId 微信号（拼音+数字）, signature 个性签名（一句话，最能暴露性格）}
4. moments：朋友圈 **6~12 条**（他自己发的 2~4 条，其余是别人发的）。每条字段：
   - author：发的人（他自己写 "me"）
   - time：时间（"9月14日"、"三天前"）
   - text：正文（20~120 字，可以是一条没头没尾的话）
   - images：图片的文字描述数组（0~3 条，如 "夜里的高架桥，车灯拉成一条线"）
   - likes：点赞的人名数组（0~5 个）
   - comments：评论 [{from, text}] 0~4 条
   要求：朋友圈是他**给别人看的那张脸**，所以他自己发的要多是克制的、体面的；偶尔一条深夜的、第二天早上会删的那种。用户提过的事可以出现在评论里。

时间分布：最近几天到几周，不能全是很久以前（否则会话列表排序会一眼假）。

输出：
{
  "wechatGroups": [{"name":"家庭群","relation":"家人","messages":[{"from":"妈","text":"..."},{"from":"me","text":"..."}]}],
  "wechatChats": [{"name":"老陈","relation":"大学室友","messages":[{"from":"老陈","text":"..."},{"from":"me","text":"..."}]}],
  "profile": {"nickname":"...","wechatId":"...","signature":"..."},
  "moments": [{"author":"me","time":"9月14日","text":"...","images":["..."],"likes":["..."],"comments":[{"from":"...","text":"..."}]}]
}`,
    },
    gallery: {
        id: 'gallery',
        keys: ['gallery'],
        prompt: `gallery：相册 **20~40 张**。每张字段：
  - title：列表里露出的短描述（一句话，别太长）
  - type：偷拍 / 工作 / 日常 / 截图 / 风景 / 合照 之一
  - sub：地点（"公司楼下""城南那家面馆"）
  - meta：时间（"9月14日"、"上周三"）
  - body：**照片里的细节 80~150 字** —— 谁、在哪、当时在做什么、光线和氛围
  要求：
  - 按性格分配比例：爱拍照的多日常与风景；工作狂多工作场景与截图；混乱的人有重复照片和截图
  - **在意用户的人，相册里要混着几张「偷拍/她的照片」**（不要扎堆，混在日常里才有戏）
  - 截图类直接在 body 里写清截图上的文字（聊天截图 / 订单截图 / 搜索结果截图）
  - 时间：最近一周密集，越往前越稀，可以有几张几年前的

输出：
{"gallery":[{"title":"...","type":"日常","sub":"...","meta":"9月14日","body":"..."}]}`,
    },
    alipay: {
        id: 'alipay',
        keys: ['alipay', 'alipayAssets'],
        prompt: `1. alipay：账单 **15~30 笔**。每笔字段：
  - title：商家或用途（"楼下便利店""烤肉店""打车"）
  - meta：金额（带符号，支出 "-38.00"、收入 "+12000.00"）
  - sub：时间（"9月14日 20:14"）
  - category：餐饮 / 交通 / 购物 / 娱乐 / 医疗 / 房租 / 转账 之一
  - body：这笔钱的场合或备注（30~80 字；转账要写转账备注，比如"不用还""生日快乐""买点好吃的"）
  要求：
  - **金额量级必须符合角色的经济状况**（按职业与设定推导，不写死），并且内部自洽
  - **转账 2~8 笔，混在流水里**（真实支付宝就是这样），转给用户的要有
  - 深夜消费、同一家店反复消费、偶尔的退款，都可以有
2. alipayAssets：首页的资产总览（数字必须和上面的流水自洽：本月收支能对上大致量级）
  - total 总资产　- balance 余额　- yuebao 余额宝
  - monthExpense 本月支出　- monthIncome 本月收入
  - cards 银行卡 [{name, tail 尾号后四位, balance}]
  - funds 基金/理财 [{name, amount 市值, profit 盈亏（带符号）, profitRate 收益率}]
  - huabei 花呗/借呗待还（没有就省略）

输出：
{"alipay":[{"title":"...","meta":"-38.00","sub":"9月14日 20:14","category":"餐饮","body":"..."}],
 "alipayAssets":{"total":"...","balance":"...","yuebao":"...","monthExpense":"...","monthIncome":"...",
   "cards":[{"name":"招商银行储蓄卡","tail":"8821","balance":"..."}],
   "funds":[{"name":"...","amount":"...","profit":"+...","profitRate":"+..."}],
   "huabei":"..."}}`,
    },
    memoRead: {
        id: 'memoRead',
        keys: ['memo', 'read'],
        prompt: `1. memo：备忘录 **8~15 条**。字段：
   - title：标题
   - body：正文 30~120 字（**保持"碎"**，它是碎片容器不是记事本）
   - meta：时间（"9月14日"、"三年前"）
   - pinned：true / false（**置顶了哪一条信息量很大**）
   - checklist：如果这条是清单，写勾选进度（"2/5"）
   - items：清单的**真实条目文字**数组（和 checklist 对得上，前 done 条是勾上的；不是清单就没有）
   - 内容类型要杂：待办、随手记、写了一半的句子、别人说的地址、想买的东西、关于用户的喜好
2. read：书架 **10~20 本**。字段：
   - title：书名　- author：作者
   - shelf：reading（在读 2~4 本）/ read（读完 1~5 本）/ want（想读 3~8 本）
   - progress：进度百分比数字（在读的书必须有；比如 12、47、98）
   - meta：进度文字（"47%"、"读完"、"想读"）
   - quote：划线的句子（**只有少数几本有**，这是"哪句话击中了他"的证据）
   - body：书简介 + 他的笔记 / 读后感（**只有一部分读完的书有读后感**，多数没有；在读的通常没有）

输出：
{"memo":[{"title":"...","body":"...","meta":"9月14日","pinned":false,"checklist":"2/5","items":["已经做完的那条","还没做的那条"]}],
 "read":[{"title":"...","author":"...","shelf":"reading","progress":47,"meta":"47%","quote":"...","body":"..."}]}`,
    },
    diary: {
        id: 'diary',
        keys: ['diary'],
        prompt: `diary：日记 **8~20 篇**。字段：
  - title：日期（"9月14日 周二"）
  - meta：时间（"02:13"）
  - weather：天气（"雨""闷热"），可以没有
  - body：**正文 100~400 字**，多段；其中**要有一篇特别长的（600~900 字，情绪峰值）**
  要求：
  - **情绪要宽**：工作受挫、家人、身体、孤独、无聊、被某件小事击中……不要篇篇都写用户
  - **关于用户的大约占 30~50%**，其余是他自己的生活
  - **深夜占比高**（白天的人写不出日记）
  - 允许有一篇写到一半断掉、有错字、句子破碎
  - 时间跨度几个月到几年，中间可以有一段很长的空白（"两个月没写"本身就说明问题）

输出：
{"diary":[{"title":"9月14日 周二","meta":"02:13","weather":"雨","body":"..."}]}`,
    },
    browserMusic: {
        id: 'browserMusic',
        keys: ['browser', 'music'],
        prompt: `1. browser：搜索记录 **15~30 条**。字段：
   - title：搜索词（口语，像真的在心里问）
   - meta：时间（"9月14日 02:47"、"上个月"）
   - body：他为什么搜、搜完干了什么（30~80 字）
   - results：**2~3 条搜索结果**，每条 {title, summary, source}
   - comments：**2~4 条网友评论**，要互相矛盾（有人劝和有人劝分），像真互联网
   要求：五类关键词都要有 —— 关于用户的（她的喜好、怎么哄人、送什么）、情绪性的（深夜、吵架后）、自我怀疑的（"我是不是……"）、职业/学业的、生活琐事的。**时间要和聊天时间线吻合**（昨天吵架 → 今天凌晨搜"怎么道歉"）
2. music：最近播放 **10~20 条**。字段：
   - title：歌名　- artist：歌手
   - meta：时间（"今天 01:20"）
   - plays：播放次数（**要有同一首歌循环十几遍的**，那是心情最强的证据）
   - lyric：一句歌词
   - body：他当时的状态（30~60 字）
   要求：有凌晨还在听的；有用户提过的歌（他记着）；歌单之外的单曲。
3. musicPlaylists：**3 个概念歌单**（§5.14 D：歌单名字本身就暴露性格）。每个字段：
   - name：歌单名（别叫"我的收藏"，要有人味，比如"凌晨三点的高架""不想说话的时候"）
   - songs：[{title, artist}] 每个歌单 6~12 首
   要求：三个歌单的情绪要分得开；里面可以有和"最近播放"重复的歌（真实的人就这样）。

输出：
{"browser":[{"title":"怎么道歉才不显得敷衍","meta":"9月14日 02:47","body":"...","results":[{"title":"...","summary":"...","source":"zhihu.com"}],"comments":["...","..."]}],
 "music":[{"title":"...","artist":"...","meta":"今天 01:20","plays":13,"lyric":"...","body":"..."}],
 "musicPlaylists":[{"name":"...","songs":[{"title":"...","artist":"..."}]}]}`,
    },
};

/* ------------------------------------------------------------------ */
/* prompt 组装                                                          */
/* ------------------------------------------------------------------ */

/** 角色设定压成一小段：给生成的"人设底色"，不要塞整个 systemPrompt */
const personaBrief = (char: CharacterProfile): string => {
    const persona = (char.systemPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const worldview = String((char as { worldview?: string }).worldview || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const desc = String((char as { description?: string }).description || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return [
        `名字：${char.name}`,
        desc ? `简介：${desc}` : '',
        persona ? `性格与说话方式：${persona}` : '',
        worldview ? `所处世界 / 背景：${worldview}` : '',
    ].filter(Boolean).join('\n');
};

/** 长期记忆压成几行：通则二要求「内容必须来自性格 + 记忆」，不能凭空 */
const memoryBrief = (char: CharacterProfile): string => {
    const fragments = Array.isArray(char.memories) ? char.memories : [];
    const lines = fragments
        .filter((m) => m && typeof m.summary === 'string' && m.summary.trim())
        .slice(-14)
        .map((m) => `- ${m.date || ''}${m.mood ? `（${m.mood}）` : ''}：${String(m.summary).replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    return lines.join('\n');
};

/** 拼一块的完整 prompt */
const buildBlockPrompt = (
    block: BlockSpec,
    char: CharacterProfile,
    userName: string,
): string => {
    const memory = memoryBrief(char);
    return `你在为一部虚构的手机生成内容。这部手机属于角色「${char.name}」，是他的私人手机，会被「${userName || '用户'}」当面翻看。

【角色】
${personaBrief(char)}

【关系】
${char.name} 和「${userName || '用户'}」是熟人 / 亲密关系。这份内容会被对方当面翻看，所以不能出现"这是为对方准备的展示材料"的痕迹。

${memory ? `【角色最近记得的事】（时间与内容必须能和手机里的东西对上）\n${memory}\n` : ''}
【硬性要求】
- 所有内容都必须从**角色性格 + 上面这些记忆**推出来，不许凭空编造与角色无关的东西
- 具体、日常、有生活质感；大部分应该是无聊的真实生活，不要句句都在暗示秘密
- **数量要写够**（下面每项都给了条数区间，不要只写两三条就收尾）
- **每条都要有细节**，不要只给一个标题（列表页只露一行，点进去要有完整内容）
- 时间分布：最近一周密集、越往前越稀；写具体日期时间，不要用"昨天""前几天"这种相对词
- 不要用"某某""示例""张三"这类占位词；人名用称呼或具体名字
- 职业、收入、城市、手机里的消费量级要互相自洽

【本块要生成：${PHONE_BLOCK_LABELS[block.id]}】
${block.prompt}

【输出格式】
**只输出 JSON 对象**，不要解释、不要 markdown 代码块、不要注释。JSON 必须能被 JSON.parse 直接解析（不要尾逗号）。`;
};

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

/** 模型经常包一层 ```json 或者前后废话：取第一个 { 到最后一个 } 再解析 */
export const parseJsonObject = (raw: string): Record<string, unknown> | null => {
    if (!raw) return null;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
};

/** 兼容旧接口（整体解析） */
export const parsePhoneContent = (raw: string): PhoneContent | null => {
    const parsed = parseJsonObject(raw);
    if (!parsed) return null;
    return { generatedAt: Date.now(), ...(parsed as Omit<PhoneContent, 'generatedAt'>) };
};

const arrayOf = (value: unknown): PhoneListEntry[] => (Array.isArray(value) ? value as PhoneListEntry[] : []);

/* ------------------------------------------------------------------ */
/* 生成                                                                */
/* ------------------------------------------------------------------ */

export interface GeneratePhoneContentResult {
    ok: boolean;
    content?: PhoneContent;
    /** 这一轮失败的块（用于「仅补齐未完成的」） */
    failed: PhoneBlockId[];
    reason?: 'no_sub_api' | 'empty' | 'parse_failed' | 'api_error';
}

export interface GeneratePhoneContentOptions {
    /** 只生成这些块；不传 = 自动挑「还没有内容」的块 */
    only?: PhoneBlockId[];
    /** 不管有没有内容都重生成（「重新生成全部」用） */
    force?: boolean;
    /** 每完成一块回报一次：已完成数 / 总数 / 已失败的块 */
    onProgress?: (done: number, total: number, failed: PhoneBlockId[]) => void;
}

const isEmptyValue = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null;
};

/** 这块的内容是否已经齐了 */
export const isBlockPresent = (content: PhoneContent | null, id: PhoneBlockId): boolean => {
    if (!content) return false;
    // 旧结构（v1 单次全量生成）没有这些详情字段，当作没生成，让内容自动换成新的
    if ((content.schemaVersion || 1) !== PHONE_CONTENT_SCHEMA) return false;
    return BLOCKS[id].keys.every((key) => !isEmptyValue(content[key]));
};

/** 哪些块还没生成（或上次失败） */
export const missingBlocks = (content: PhoneContent | null): PhoneBlockId[] =>
    PHONE_BLOCK_ORDER.filter((id) => !isBlockPresent(content, id));

export async function generatePhoneContent(
    char: CharacterProfile,
    user: UserProfile,
    subApi: SubApiConfig,
    options: GeneratePhoneContentOptions = {},
): Promise<GeneratePhoneContentResult> {
    const { baseUrl, apiKey, model } = subApi || {} as SubApiConfig;
    if (!baseUrl || !apiKey || !model) return { ok: false, failed: [], reason: 'no_sub_api' };

    const base = readPhoneContent(char.id);
    const userName = user?.name || '用户';

    // 要生成哪些块
    let targets: PhoneBlockId[];
    if (options.force) {
        targets = [...PHONE_BLOCK_ORDER];
    } else if (options.only?.length) {
        targets = options.only;
    } else {
        targets = missingBlocks(base);
    }
    if (!targets.length) {
        return { ok: true, content: base || undefined, failed: [] };
    }

    // force（重新生成全部）时丢弃旧内容；补齐时保留已有块
    const merged: PhoneContent = options.force
        ? { generatedAt: Date.now() }
        : { generatedAt: Date.now(), ...(base || {}) };
    merged.schemaVersion = PHONE_CONTENT_SCHEMA;
    const blocks: Partial<Record<PhoneBlockId, PhoneBlockStatus>> = { ...(base?.blocks || {}) };
    const failed: PhoneBlockId[] = [];
    let done = 0;
    const report = () => options.onProgress?.(done, targets.length, [...failed]);

    report();

    // 并行分块：同一块里的 App 语境相近，能互相呼应（支付宝账单 ↔ 外卖订单）
    // 但同时最多跑 3 块 —— 一次性打 6 个请求容易被副 API 限流，反而全失败
    const CONCURRENCY = 3;
    const save = () => {
        merged.blocks = { ...blocks };
        merged.generatedAt = Date.now();
        writePhoneContent(char.id, merged);
    };

    const runBlock = async (id: PhoneBlockId) => {
        const block = BLOCKS[id];
        try {
            const raw = await callFanwaiLLM(buildBlockPrompt(block, char, userName), subApi, {
                // 0.85：要具体、像真的，但别飘
                temperature: 0.85,
                meta: {
                    appName: '线下手机生成',
                    charId: char.id,
                    charName: char.name,
                    purpose: `生成角色手机内容 · ${PHONE_BLOCK_LABELS[id]}`,
                },
            });
            const parsed = raw ? parseJsonObject(raw) : null;
            let got = false;
            if (parsed) {
                for (const key of block.keys) {
                    const value = parsed[key as string];
                    // 数组（账单 / 相册…）与对象（资产总览 / 微信账号）都要收
                    const isArray = Array.isArray(value) && value.length > 0;
                    const isObject = !!value && typeof value === 'object' && !Array.isArray(value)
                        && Object.keys(value as Record<string, unknown>).length > 0;
                    if (isArray || isObject) {
                        (merged as unknown as Record<string, unknown>)[key as string] = value;
                        got = true;
                    }
                }
            }
            if (got) {
                blocks[id] = 'ok';
                // 每块成功就落盘：中途关掉弹窗也不会白烧已完成的块
                save();
            } else {
                blocks[id] = 'failed';
                failed.push(id);
                save();
            }
        } catch (error) {
            console.error(`[offline-phone] ${PHONE_BLOCK_LABELS[id]} 生成失败`, error);
            blocks[id] = 'failed';
            failed.push(id);
            save();
        } finally {
            done += 1;
            report();
        }
    };

    let cursor = 0;
    const worker = async () => {
        while (cursor < targets.length) {
            const id = targets[cursor++];
            await runBlock(id);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()),
    );

    const hasAny = PHONE_BLOCK_ORDER.some((id) => isBlockPresent(merged, id));
    if (!hasAny) {
        return { ok: false, failed, content: undefined, reason: failed.length ? 'api_error' : 'empty' };
    }
    return { ok: failed.length === 0, failed, content: merged };
}

/** 兼容旧签名的一次性生成（不做分块）——不建议再用，保留给测试/历史调用 */
export async function generatePhoneContentLegacy(
    char: CharacterProfile,
    user: UserProfile,
    subApi: SubApiConfig,
): Promise<GeneratePhoneContentResult> {
    return generatePhoneContent(char, user, subApi, { force: true });
}

/** 相册等数组字段的安全读取（渲染侧用，避免 undefined.map 崩） */
export const entriesOf = (content: PhoneContent | null, key: keyof PhoneContent): PhoneListEntry[] =>
    arrayOf(content ? content[key] : undefined);
