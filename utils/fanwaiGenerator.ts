/**
 * 番外生成器（私聊「番外」入口 → 拾光 App）。
 *
 * 设计：用户打开私聊「番外」全屏页，配置文风 / 字数 / 第几人称 / 世界设定后，
 * 用**副 API**（subBaseUrl / subApiKey / subModel）非流式生成一段小说式的番外——
 * 主 API 只负责聊天，不参与番外生成。
 *
 * prompt 拼装：
 *   - 当前角色全量人设（ContextBuilder.buildCoreContext，含记忆 / 世界观 / 世界书）
 *   - 用户设定（userProfile.name / bio）
 *   - 文风 / 字数 / 人称 / 世界设定（用户从网上找的番外设定，粘贴填入）
 *
 * 生成结果可被收藏进「拾光」，并从拾光转发给角色（写记忆 + 注入私聊）。
 */

import { CharacterProfile, UserProfile } from '../types';
import { ContextBuilder } from './context';
import { safeResponseJson, extractContent } from './safeApi';

/** 副 API 配置（对应 types.ts APIConfig 的 subBaseUrl / subApiKey / subModel）。 */
export interface SubApiConfig {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
}

/** 文风预设。id 会被存进 FanwaiStory.style，用于拾光卡片渐变与展示。 */
export const FANWAI_STYLE_PRESETS: { id: string; name: string; hint: string; author?: string; custom?: boolean }[] = [
    { id: 'healing', name: '温柔治愈', hint: '文字温软细腻，像一杯热可可，侧重于角色间的暖意、陪伴与日常里的微小幸福，结尾余韵悠长。笔调清淡克制、不煽情。', author: '村上春树 · 汪曾祺' },
    { id: 'ancient', name: '古风', hint: '以古风笔调写作，用词雅致、意象清丽（灯火、长街、书信、月色），讲究含蓄克制的深情与留白。', author: '唐传奇 · 张爱玲' },
    { id: 'suspense', name: '悬疑', hint: '节奏紧张、伏笔环环相扣，信息逐层揭露，保持悬念与反转，氛围感强烈但结局自洽。语气冷峻、克制。', author: '东野圭吾' },
    { id: 'daily', name: '日常甜宠', hint: '轻松明快的都市日常，甜而不腻，注重互动细节与心动瞬间，像一部小甜剧的文字版。', author: '亦舒' },
    { id: 'custom', name: '自定义', hint: '在下方填写你想要的文风描述（参考：语言节奏、意象偏好、情绪基调、参照作品等）。', custom: true },
];

/** 字数档位。0 表示用户自定义字数。 */
export const FANWAI_WORD_COUNTS = [0, 500, 1000, 2000, 5000] as const;

/** 自定义文风/字数时，prompt 里使用的引导语。 */
export const STYLE_CUSTOM_INSTRUCTION = '请结合下方用户写的「自定义文风描述」来遣词造句、用最贴合那种气质的笔触写作。';
export const WORDS_CUSTOM_NOTE = (n: number) => `用户自定义字数：约 ${n} 字（上下浮动 20% 以内）。`;

/**
 * 视角选项。把「第几人称」改成更直观的「视角」——
 *   char 视角 = 以角色本人「我」为主视角
 *   user 视角 = 以用户本人「我」为主视角
 *   第三视角 = 上帝视角 / 全知视角
 */
export const FANWAI_POVS: { id: 'first' | 'second' | 'third'; name: string; sub: string; desc: string }[] = [
    { id: 'first',  name: 'char 视角', sub: '角色视角', desc: '以角色为「我」的主视角' },
    { id: 'second', name: 'user 视角', sub: '用户视角', desc: '以用户为「我」的主视角' },
    { id: 'third',  name: '第三视角', sub: '旁观视角', desc: '上帝视角，名字或他/她' },
];

const POV_INSTRUCTION: Record<'first' | 'second' | 'third', string> = {
    /** char 视角 = "我" 是角色；用名字称呼用户。 */
    first: '全篇以角色（"我"）作为第一人称写作，"你"指向用户。',
    /** user 视角 = "我" 是用户；用名字称呼角色。 */
    second: '全篇以用户（"我"）作为第一人称写作，"你"指向角色。',
    third: '全篇以第三人称（用角色名字或"他/她"）旁观式写作，不使用"我"。',
};

/** 生成结果。reason 供页面区分提示。 */
export interface FanwaiGenResult {
    ok: boolean;
    content?: string;
    reason?: 'no_sub_api' | 'api_error' | 'empty';
}

/** 拼装番外生成 prompt。 */
export function buildFanwaiPrompt(
    char: CharacterProfile,
    user: UserProfile,
    opts: {
        styleName: string;
        styleHint: string;
        styleAuthor?: string;
        styleCustomDesc?: string;
        wordCount: number;
        wordCountIsCustom: boolean;
        pov: 'first' | 'second' | 'third';
        worldSetting: string;
        /** 最近聊天消息（可选）。作为本次番外的灵感来源注入。 */
        recentMessages?: { role: string; content: string }[];
        /** 随机模式：文风/字数/视角全交由 AI 自主决定，不套用固定配置。 */
        randomMode?: boolean;
    },
): string {
    const uname = user?.name || '对方';
    // 全量读取角色记忆与世界书：月度总结 + 当月日志 + 世界书 + 印象档案。
    // 记忆宫殿仅当角色本就开启时自然带出，不强开（安全优先）。
    const baseContext = ContextBuilder.buildCoreContext(char, user, true);

    // 聊天上下文仅作为"灵感触点"。常规模式提示可从对话自然生长；随机模式则特别强调
    // 番外是独立虚构创作，记忆只负责给一个"起火点"，故事允许（也应该）长出没发生过的情节。
    const chatIntro = opts.randomMode
        ? `以下是你和「${uname}」最近聊天的真实记录。它们只是给你**提供创作灵感的触点**，不是剧情大纲——你可以从某一句玩笑、某个未说完的心事、某个一闪而过的念头里挑一个点，自由展开成一篇**虚构的、可能从未真实发生过的**番外故事。不要逐条复述、总结或还原这些对话，写一篇属于这两个人的新故事。`
        : `以下是你和「${uname}」最近聊天的真实记录。故事可以从这段对话里的某个话题、某句玩笑、某个未说完的心事自然生长出来——像从生活的褶皱里掏出一段往事或未来，而不要与最近聊天的走向脱节。`;
    const chatBlock = opts.recentMessages && opts.recentMessages.length > 0
        ? `\n\n### 你们最近的对话（灵感来源）
${chatIntro}
${opts.recentMessages.map(m => `${m.role === 'user' ? uname : char.name}：${m.content}`).join('\n')}`
        : '';

    const worldBlock = opts.worldSetting && opts.worldSetting.trim()
        ? `\n\n### 本次番外的世界设定（用户提供的硬设定，必须严格遵守，故事要建立在这些设定之上）\n${opts.worldSetting.trim()}`
        : '\n\n### 本次番外的世界设定\n（用户没有提供额外设定，请基于上面角色人设、你的记忆与最近聊天的走向自然发挥，选一个最契合此刻氛围的文风。）';

    // 视角归属约束：无论何种模式都强调角色/用户身份不能搞反
    const identityGuard = `你是「${char.name}」，对面是「${uname}」。全篇的身份与视角归属绝不能互换——角色的性格、说话方式属于${char.name}，对「${uname}」的称呼与关系必须始终正确，绝不能把角色该有的视角安到用户头上，反之亦然。`;

    // —— 随机模式：文风 / 字数 / 视角全交由 AI 自主决定 ——
    if (opts.randomMode) {
        return `${baseContext}

## Task: 写一篇「番外」短篇小说（随机模式）

「${uname}」想要一篇关于「${char.name}」的番外故事。请你以小说家的笔力，写一篇**完整、有起承转合、有画面感**的短篇小说。${chatBlock}

### 本次的创作要求（由你决定）
- **文风**：由你根据角色人设、你们的记忆与最近聊天的氛围，自行挑选一种最合适的文风——可以参考古今中外任何作家的笔调（如村上春树的疏离留白、张爱玲的含蓄雅致、东野圭吾的冷峻克制、汪曾祺的清淡烟火、亦舒的小甜节奏等），学的是他们遣词造句的节奏、留白与意象，仍写属于你笔下角色自己的故事。挑定后在行文里贯穿始终，不要中途摇摆。
- **篇幅**：由你拿捏，短篇范围内（约 500 ~ 3000 字），宁可有头有尾地写完，不要烂尾。
- **视角**：由你选择最合适的第一人称或第三人称来写这个故事。
${worldBlock}

### 写作准则
1. ${identityGuard}
2. **这是虚构创作，不是记忆总结**：番外是从最近聊天/记忆里挑一个**起火点**，然后自由展开成一篇**没真实发生过、也可能永远不发生**的新故事——可以写一次没去成的旅行、一句没说出口的话、一个平行时空的相遇。严禁像写报告那样把聊天内容逐条复述、概括或"回顾你们经历了什么"；记忆只是灵感，绝不是剧情。
3. 严守角色人设：${char.name} 的性格、说话方式、习惯、关系（尤其是与「${uname}」的关系）必须贴合上面的设定，绝不能 OOC。
4. 故事要有**完整的结构**：一个具体的场景或事件开头 → 事件推进与情绪起伏 → 一个像样的结尾（可以是回味式的收束）。
5. 用**具体的东西说话**：动作、物件、环境、气味、光线、身体感受，让读者能"看见""闻到""摸到"。宁愿写一两个真实的细节，也不要一串空泛的形容词。
6. 与主线对话体不同：这是**小说文体**，不是聊天记录；用叙述与描写推进，对话只是其中一部分。
7. **像真人写作那样去写**，而不是"AI 式地写"：
   - 别用"也许…也许…""相信一切都会好起来的"这类谁都能说的抽象安慰——如果要安慰，就用一个具体的动作或物件。
   - 别堆三连排比和机械连接词（"然而""与此同时""就在这时""另一方面"）——叙事要有呼吸感，段落长短错落。
   - 别在结尾强行升华成鸡汤金句——收尾可以留白、可以停在某个画面或声音上，让余味自己生长。
8. 亲密与成人情节：如果两人关系与剧情走到这一步，就**明确直白地描写**，不打马赛克、不用隐喻借代蒙混，尺度由剧情的需要和两人关系的温度自然决定——写身体反应、呼吸、触感时也要带着具体的感官细节，而不是干巴巴地报流程。

### 输出格式
- 第一行写一个**简短书名**（直接是标题文字，不加书名号或 markdown 语法）。
- 空一行后开始正文。
- 正文按段落书写，自然换行，用 markdown 的段落分隔。
- 直接输出，不要任何前言或后记。

现在，开始写这篇「${char.name}」的番外：`;
    }

    // —— 常规模式：按用户选定的文风 / 字数 / 视角 ——
    const styleBlock = opts.styleCustomDesc && opts.styleCustomDesc.trim()
        ? `- **文风**：${opts.styleName}。\n  - 文风描述：${opts.styleCustomDesc.trim()}\n  - ${STYLE_CUSTOM_INSTRUCTION}`
        : `- **文风**：${opts.styleName}。${opts.styleHint}`;

    const authorBlock = opts.styleAuthor
        ? `\n  - **参照笔调**：${opts.styleAuthor}。学的是他们**遣词造句的节奏、留白与意象的选择**，不是情节或人物；模仿其气质，仍写属于你笔下角色自己的故事。`
        : '';

    const wordsLine = opts.wordCountIsCustom
        ? `- **篇幅**：正文 ${WORDS_CUSTOM_NOTE(opts.wordCount)}  宁可有头有尾地写完，不要烂尾。`
        : `- **篇幅**：正文约 **${opts.wordCount} 字**（上下浮动 20% 以内），宁可有头有尾地写完，不要烂尾。`;

    const povLabel = opts.pov === 'first' ? `char 视角（"我" = ${char.name}）` : opts.pov === 'second' ? `user 视角（"我" = ${uname}）` : '第三视角';

    return `${baseContext}

## Task: 写一篇「番外」短篇小说

「${uname}」想要一篇关于「${char.name}」的番外故事。请你以小说家的笔力，写一篇**完整、有起承转合、有画面感**的短篇小说。${chatBlock}

### 本次的创作要求
${styleBlock}${authorBlock}
${wordsLine}
- **视角**：${povLabel}。${POV_INSTRUCTION[opts.pov]}
${worldBlock}

### 写作准则
1. ${identityGuard}
2. 故事要有**完整的结构**：一个具体的场景或事件开头 → 事件推进与情绪起伏 → 一个像样的结尾（可以是回味式的收束）。
3. 用**具体的东西说话**：动作、物件、环境、气味、光线、身体感受，让读者能"看见""闻到""摸到"。宁愿写一两个真实的细节，也不要一串空泛的形容词。
4. 与主线对话体不同：这是**小说文体**，不是聊天记录；用叙述与描写推进，对话只是其中一部分。
5. **像真人写作那样去写**，而不是"AI 式地写"：
   - 别用"也许…也许…""相信一切都会好起来的"这类谁都能说的抽象安慰——如果要安慰，就用一个具体的动作或物件。
   - 别堆三连排比和机械连接词（"然而""与此同时""就在这时""另一方面"）——叙事要有呼吸感，段落长短错落。
   - 别在结尾强行升华成鸡汤金句——收尾可以留白、可以停在某个画面或声音上，让余味自己生长。
6. 亲密与成人情节：如果两人关系与剧情走到这一步，就**明确直白地描写**，不打马赛克、不用隐喻借代蒙混，尺度由剧情的需要和两人关系的温度自然决定——写身体反应、呼吸、触感时也要带着具体的感官细节，而不是干巴巴地报流程。

### 输出格式
- 第一行写一个**简短书名**（直接是标题文字，不加书名号或 markdown 语法）。
- 空一行后开始正文。
- 正文按段落书写，自然换行，用 markdown 的段落分隔。
- 直接输出，不要任何前言或后记。

现在，开始写这篇「${char.name}」的番外：`;
}

/**
 * 用副 API 非流式生成番外正文。
 * 副 API 未配置时返回 { ok:false, reason:'no_sub_api' }，不回落主 API（主 API 仅用于聊天）。
 */
export async function generateFanwai(
    char: CharacterProfile,
    user: UserProfile,
    opts: {
        styleId: string;
        styleCustomDesc?: string;
        wordCount: number;
        wordCountIsCustom: boolean;
        pov: 'first' | 'second' | 'third';
        worldSetting: string;
        /** 最近聊天消息（可选）。清洗后作为番外的灵感来源。 */
        recentMessages?: { role: string; content: string }[];
        /** 随机模式：文风/字数/视角全交由 AI 决定。 */
        randomMode?: boolean;
    },
    subApi: SubApiConfig,
): Promise<FanwaiGenResult> {
    const { baseUrl, apiKey, model } = subApi || {};
    if (!baseUrl || !apiKey || !model) {
        return { ok: false, reason: 'no_sub_api' };
    }

    const preset = FANWAI_STYLE_PRESETS.find(p => p.id === opts.styleId) || FANWAI_STYLE_PRESETS[0];
    const prompt = buildFanwaiPrompt(char, user, {
        styleName: preset.name,
        styleHint: preset.hint,
        styleAuthor: preset.author,
        styleCustomDesc: opts.styleCustomDesc,
        wordCount: opts.wordCount,
        wordCountIsCustom: opts.wordCountIsCustom,
        pov: opts.pov,
        worldSetting: opts.worldSetting,
        recentMessages: cleanRecentMessages(opts.recentMessages),
        randomMode: opts.randomMode,
    });

    try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: opts.randomMode ? 0.95 : 0.85,
                // 中文约 0.6~1 token/字，按字数上限留足余量，避免长文被截断。
                // 随机模式字数不定，放宽到足够覆盖 500~3000 字短篇。
                max_tokens: opts.randomMode
                    ? Math.min(Math.round(3000 * 1.8) + 800, 12000)
                    : Math.min(Math.round(opts.wordCount * 1.8) + 600, 12000),
            }),
            __sullyMeta: { appName: '番外生成', charId: char.id, charName: char.name, purpose: '番外小说生成' },
        } as RequestInit);

        if (!response.ok) {
            console.error('[Fanwai] API error:', response.status);
            return { ok: false, reason: 'api_error' };
        }

        const data = await safeResponseJson(response);
        const content = extractContent(data);
        if (!content || !content.trim()) {
            console.error('[Fanwai] Generation empty.');
            return { ok: false, reason: 'empty' };
        }
        return { ok: true, content: content.trim() };
    } catch (e) {
        console.error('[Fanwai] Generation failed:', e);
        return { ok: false, reason: 'api_error' };
    }
}

/**
 * 清洗最近聊天消息，作为番外的灵感来源。
 * - 只保留 user / assistant 角色，丢弃 system 指令类。
 * - 清洗内容：折叠空白、去掉 markdown 行内标记（避免污染小说 prompt）。
 * - 总量控制：最多 80 条，总字符上限 4000，超出则丢弃最旧的部分。
 */
function cleanRecentMessages(raw?: { role: string; content: string }[]): { role: string; content: string }[] {
    if (!raw || raw.length === 0) return [];
    const MAX_ITEMS = 80;
    const MAX_CHARS = 4000;

    const cleaned: { role: string; content: string }[] = [];
    let total = 0;

    // 倒序遍历（最近的在末尾），从最新往旧收，收满字符上限即停
    for (let i = raw.length - 1; i >= 0; i--) {
        const m = raw[i];
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        if (!m.content || !m.content.trim()) continue;

        // 折叠空白；去掉容易被当作结构化语法的 markdown 符号
        let text = m.content.replace(/\s+/g, ' ').trim();
        text = text.replace(/[#*`>_~|]/g, '');
        text = text.trim();
        if (!text) continue;

        // 单条过长则截断（保护 prompt，也避免塞进整段卡片原文）
        if (text.length > 200) text = text.slice(0, 200) + '…';

        cleaned.unshift({ role: m.role, content: text });
        total += text.length;
        if (cleaned.length >= MAX_ITEMS || total >= MAX_CHARS) break;
    }

    return cleaned;
}

/** 生成本地设置记忆键（用于 localStorage 记住上次选择）。 */
export const FANWAI_FORM_LS_KEY = 'os_fanwai_form_v1';

/** 生成一篇收藏用番外的 id（`fanwai-${ts}-${rand}`）。 */
export function createFanwaiStoryId(): string {
    return `fanwai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
