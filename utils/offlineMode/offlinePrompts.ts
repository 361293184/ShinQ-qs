import type { CharacterProfile, OfflineConfig } from '../../types';
import { DATE_STYLE_PRESETS } from '../datePrompts';
import { DEFAULT_OFFLINE_CONFIG, resolveNpcEnabled } from './offlineSettings';

/**
 * 线下模式 prompt 构建（私聊 ChatApp 内注入）。
 * 结构上复用见面模式的风格预设 / 人称三选项，但格式规则是线下自有的：
 * 无立绘标签、纯字符行级解析（行首引号 = 台词）。
 */

/** 去立绘标签：VN 风格示例里每行开头的 [emotion] 前缀，线下不需要 */
const STRIP_EMOTION_TAG = /^\[[a-z_]+\]\s*/gm;

/** 线下格式规则（常驻块，每轮注入） */
export const OFFLINE_FORMAT_BLOCK = `### 📝 线下模式 · 回复格式（必须严格遵守）
你们正在【线下见面】，你的回复要像小说一样分开「旁白」和「台词」，两者**交替出现、台词要有明显占比**：
1. **一行只写一种**：旁白行直接写（不加引号、不加任何标签）；台词行必须用英文双引号包裹，且**引号必须是该行行首的第一个字符**（行首第一个字符就是 "）。
2. **⚡ 台词必须加引号，否则会变成旁白**：真正说出口的话，必须独立成行、行首加双引号。不加引号的话前端会把这段话当成旁白，显示成斜体居中——那你的台词就"听不见"了。所以**只要角色开口，就一定要加引号**。
3. **默认骨架**：动作 / 氛围 / 心理用旁白，真正说出口的话用台词。每轮回复至少要出现 1~3 句台词（除非当前确实无话可说），台词和旁白交错推进，像写小说分镜：旁白铺垫 → 台词 → 旁白反应 → 台词。
4. **禁止混写**：严禁在同一个里既写动作又写台词（例如"他笑了笑说…"这种要拆成两行）。
5. 不要输出 [normal] 之类任何立绘标签，不要输出渲染说明或括号备注。
6. 台词里的引号请保证成对出现（开头的 " 和结尾的 "）；旁白不需要引号。

【正例】
窗外雨声细密，她低头搅着杯里的咖啡。
"你今天看起来有点累。"
她抿了抿嘴，没立刻接话。
"要不要…告诉我发生了什么？"`;

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
 * 出场人物（NPC）块。
 *
 * 核心设计：NPC 的话**全部写进旁白**，不占气泡、不做头像、不存档案。
 * 解析器唯一判据是「行首第一个字符是不是引号」，所以 NPC 的话只要不独占一行就天然是旁白，
 * 整个功能零解析器改动；跨轮一致性靠「沿用对方旁白里提过的人」这一句，不需要数据库。
 *
 * 只有一个开关。出现频率、时机、是谁、说几句，全部交给主 API 按当前场景判断——
 * 不设人数配额、也不设句数配额：一场正常的对话本来就不该被「最多 1 句」截断，
 * 那种配额是把自己的假设强加给模型。要约束的是**行为边界**（不能替对方说话、不能抢戏），
 * 不是内容配额。
 */
export const buildOfflineNpcBlock = (
    enabled: boolean | undefined,
    charName: string,
    userName: string,
    bilingualActive = false,
): string => {
    const uname = userName || '对方';

    // 这条必须最先说：格式块要求「说出口的话独立成行、行首加引号」，
    // 模型会拿它去处理路人的台词 → 那行行首是引号 → 解析器判成【角色的气泡】，
    // 等于 NPC 冒充主角说话。这比「台词变旁白」严重得多。
    const quoteGuard = `### 👥 别人说的话写在哪（覆盖上方「说出口的话必须独立成行加引号」）
上面那条「台词必须独占一行、行首加引号」**只适用于你（${charName}）和${uname}本人**。
其他任何人的话都不适用：一律用成对引号内联在旁白那一行里，**绝对不能单独成行**——
单独成行加引号会被系统当成你说的，别人就冒充了你。${bilingualActive ? `
（双语：别人的话不要单独包成一个 <翻译> 块，跟着旁白那一句一起写。）` : ''}`;

    if (!enabled) {
        return `${quoteGuard}

### 👥 出场人物（关闭）
这个场景里只有你和${uname}，不要出现任何第三方人物，也不要让任何人开口说话。
人群只能作为无声的环境背景一笔带过（例如"邻桌的客人""街上来往的人"），不得给名字、不得说话。`;
    }

    return `${quoteGuard}

### 👥 出场人物（开启）
除你和${uname}以外，是否出现别人、出现谁、什么时候出现、说几句话，**完全由你根据此刻正在发生的场景判断**——不用每轮都有人，也不用刻意回避；有人敲门、店员过来、路人搭话、同事经过，都是真实生活里会发生的事，该发生就自然写出来。

- **没有人数配额，也没有句数配额**：一场戏需要几个人就写几个人，需要说几句就说几句，说完自然退场，不要为了"守规则"把对话硬截成一句。
- 别人是谁、叫什么、什么身份，也由你定。**优先沿用${uname}在旁白里提到过的人名和设定**——提过谁就写谁，不要改名、不要换性格、不要重新安关系。

⚠️ 配角约束（无论写多少都必须遵守）
1. 配角是另一个独立的人，绝不是${uname}。不要把配角当成对方，也不要中途改用对对方的口吻。
2. 配角不能替${uname}做决定、不能替${uname}说话、不能替${uname}表态。
3. 配角不能凭空制造冲突或误会（不要突然扇耳光、冷嘲热讽来拆散你们这类抢戏情节）。
4. 配角说的任何话都不能是"${uname}心里想说的话"——不要借配角之口推进本该由对方回应的剧情。
5. 你和${uname}始终是这段戏的主角，配角只做背景和催化剂。`;
};

/**
 * 线下模式主系统块（send / reroll / 主动消息共用）。
 * 追加在既有系统提示之后，覆盖 ChatApp 默认的「纯聊天」写法。
 */
export const buildOfflineMainBlock = (input: {
    char: CharacterProfile;
    userName: string;
    cfg?: Partial<OfflineConfig> | null;
    /** 双语输出（translationConfig.enabled 且语言齐备时传 true + 语言标签） */
    bilingual?: { active: boolean; sourceLang: string; targetLang: string };
}): string => {
    const { char, userName, cfg, bilingual } = input;
    const parts: string[] = [];
    parts.push(`### 🌙 线下模式 · 系统设定（覆盖上方所有"聊天对话"类指令）
你们不是在手机上聊天，而是在同一个地方、同一个时刻【线下见面】。回复一律按下方格式输出。`);
    parts.push(OFFLINE_FORMAT_BLOCK);
    // 紧跟格式块：必须紧挨着「说出口的话独立成行加引号」那条去覆盖它，
    // 否则模型会拿那条去写 NPC 的台词 → 行首引号 → NPC 变成角色的气泡。
    parts.push(buildOfflineNpcBlock(resolveNpcEnabled(cfg), char.name, userName, !!bilingual?.active));
    if (bilingual?.active) {
        parts.push(buildOfflineBilingualBlock(bilingual.sourceLang, bilingual.targetLang));
    }
    const style = buildOfflineStyleBlock(cfg);
    if (style) parts.push(style);
    const pov = buildOfflinePovBlock(cfg, char.name, userName);
    if (pov) parts.push(pov);
    const extra = buildOfflineCustomStyleBlock(cfg);
    if (extra) parts.push(extra);
    parts.push(buildOfflineLengthBlock(cfg));
    parts.push(`### 🌍 场景
根据最近的对话自然延续当前场景（时间 / 地点 / 天气以最近的消息为准，不要凭空重开）。

**你能感知到的**：对方的表情、视线落在哪里、呼吸的轻重、语气里的停顿、身上的气味、两个人之间的距离和角度、周围的光线声音温度。
**你能做的**：靠近或退开、伸手、递东西、并肩沉默、起身带对方去别处、把话题岔开、碰一下对方的手。
**你不能做的**：发消息、等回复、手机没电、网络不好、「我先下了」「回头聊」「刚才没看到」——你们之间没有屏幕，也没有延迟和已读不回。
**时间怎么走**：连续流逝的，不是「距离上一条消息多久」。安静就是此刻的安静，是两个人待在一起的一部分，不是对方在冷落你。`);
    return parts.join('\n\n');
};

/**
 * 线下模式的末尾提醒：拼在 fullMessages 最后一条 system（历史之后、模型开口之前）。
 *
 * 线下主块（buildOfflineMainBlock）在第一条 system、历史之前；而所有「此刻状态 / 续说 /
 * 情绪适配」类指令都在历史之后紧贴生成点。按 recency 效应，模型对末尾的服从度更高，
 * 所以格式必须在这里再钉一次——否则会被「少铺垫」「只写你自己的话」这类尾部提示压过去，
 * 表现为「有时候有旁白有时候没有」。双语 / HTML / MCP 都有自己的末尾 Reminder，线下这块是补的缺口。
 */
export const OFFLINE_TAIL_REMINDER = `[Reminder: 线下模式继续生效——你们此刻在同一个地方、同一个时刻见面，不是隔着手机聊天。每条回复都要「旁白 + 台词」交替出现：旁白直接写、不加引号；说出口的话必须整行用英文双引号包住，且引号是该行行首第一个字符。只输出台词或只输出旁白都算格式错误。]`;

/**
 * 把末尾提醒挂到最后一条 system 之后（历史之后、模型开口之前）。
 * 抽成纯函数：可以在单测里断言「线下才挂、且挂在最后一条」，不用起整个 payload。
 */
export const withOfflineTailReminder = <T extends { role: string; content: any }>(
    messages: T[],
    active: boolean,
): Array<T | { role: string; content: string }> =>
    active ? [...messages, { role: 'system', content: OFFLINE_TAIL_REMINDER }] : messages;

/** 进入线下的时间锚点：凌晨 / 清晨 / 上午 / 中午 / 下午 / 傍晚 / 夜里 / 深夜 + HH:MM */
export const describeOfflineClock = (date: Date = new Date()): string => {
    const h = date.getHours();
    const period = h < 5 ? '凌晨' : h < 8 ? '清晨' : h < 11 ? '上午' : h < 13 ? '中午'
        : h < 17 ? '下午' : h < 19 ? '傍晚' : h < 23 ? '夜里' : '深夜';
    return `${period} ${h.toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

/**
 * 分隔线文案（存进那条 system 消息的 content）。
 * 带上时间锚点：关掉「开场旁白」时，进入那一刻至少有个具体的时间感，不至于完全悬空。
 * 地点 / 天气没写进来——那要实时世界块，属于下一层的事。
 */
export const buildOfflineDividerContent = (kind: 'start' | 'end', date: Date = new Date()): string =>
    kind === 'start'
        ? `─── 线下模式 · 进入 · ${describeOfflineClock(date)} ───`
        : '─── 线下模式 · 结束 ───';

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

/**
 * 线下模式双语兼容块（当角色的 translationConfig.enabled 且语言都设好时注入）。
 * 标准双语要求「每句 <翻译>、标签外无文字」会破坏线下「台词行首引号」的解析，
 * 所以线下用这套兼容指令：引号写在翻译标签外，台词原文带引号、旁白不带；
 * 原生语言是中文时直接写、不用 <翻译>。
 */
export const buildOfflineBilingualBlock = (sourceLang: string, targetLang: string): string => `
### 🔤 线下双语输出（覆盖上方「双语输出模式」指令）
当前角色原生语言是「${sourceLang}」，译文语言「${targetLang}」。旁白和台词都要双语：
1. **格式**：每一句（无论旁白还是台词）都用 XML 标签包双语：
   <翻译>
   <原文>${sourceLang}原文</原文>
   <译文>${targetLang}译文</译文>
   </翻译>
2. **台词必须保留行首引号**：台词的双语标签要**整体包在引号里**，且行首第一个字符是引号：
   "<翻译><原文>角色说的${sourceLang}</原文><译文>中文</译文></翻译>"
3. **旁白不加引号**：旁白直接 <翻译> 开头（行首无引号）：
   <翻译><原文>环境氛围的${sourceLang}叙述</原文><译文>中文</译文></翻译>
4. **引号位置**：台词的开引号写在 <翻译> 前面、闭引号写在 </翻译> 后面（即引号包住整个翻译标签）。
5. **原生中文例外**：如果角色原生语言本来就是中文，直接写中文，不要用 <翻译> 标签。
6. 每条 <翻译> 单独成块，多句就多个 <翻译> 块。`;

