/**
 * 番外生成器（私聊「番外」入口 → 拾光 App）。
 *
 * 设计：用户打开私聊「番外」全屏页，配置文风 / 字数 / 第几人称 / 世界设定后，
 * 用**副 API**（subBaseUrl / subApiKey / subModel）非流式生成一段小说式的番外——
 * 主 API 只负责聊天，不参与番外生成。
 *
 * prompt 拼装：
 *   - 番外专属「小说家视角」上下文（buildFanwaiContext：人物设定 / 世界观 / 世界书 /
 *     印象档案 / 记忆，全部保留，但剥离"你是AI/角色本人/真实时间"等元认知）
 *   - 用户设定（userProfile.name / bio）
 *   - 指令 / 字数 / 人称 / 世界设定（用户从网上找的番外设定，粘贴填入）
 *
 * 生成结果可被收藏进「拾光」，并从拾光转发给角色（写记忆 + 注入私聊）。
 */

import { CharacterProfile, UserProfile, FanwaiStory } from '../types';
import { safeResponseJson, extractContent, safeFetchJson } from './safeApi';
import { expandWorldbookMacros, formatWorldbookSection, resolveWorldbookEntries, splitWorldbookSections, WorldbookScanMessage, ResolvedWorldbookEntry } from './worldbook';
import { normalizeUserImpression } from './impression';
import { resolveHtmlType, FanwaiHtmlType, FanwaiGenMode, detectExplicitQuantity, extractFloorCount } from './fanwai/formatDetector';
import { buildTemplate } from './fanwai/htmlTemplates';

/** 副 API 配置（对应 types.ts APIConfig 的 subBaseUrl / subApiKey / subModel）。 */
export interface SubApiConfig {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    /** 流式开关：开启后走 stream:true（接口需支持流式；长生成在手机上更稳）。 */
    stream?: boolean;
}

/** 文风预设。id 会被存进 FanwaiStory.style，用于拾光卡片渐变与展示。 */
export const FANWAI_STYLE_PRESETS: { id: string; name: string; hint: string; author?: string; custom?: boolean }[] = [
    { id: 'healing', name: '温柔治愈', hint: '以短句为主，单句尽量不超过一行；不解释情绪，用动作、物件与环境细节去暗示心里话；忌"我感到…""我意识到…"式的心理直述；结尾留一个没说出口的念想，让余味自己落下。', author: '村上春树 · 汪曾祺' },
    { id: 'ancient', name: '古风', hint: '词句凝练、意象清丽（灯火、长街、书信、月色），善用留白与含蓄的深情；对话克制、点到为止；忌现代网络用语与长篇铺陈。', author: '唐传奇 · 张爱玲' },
    { id: 'suspense', name: '悬疑', hint: '冷峻克制的陈述句，信息不一次给全；伏笔逐层揭露、节奏一点点收紧，留白处吊住悬念，结尾自洽；忌平铺直叙与直白交代。', author: '东野圭吾' },
    { id: 'daily', name: '日常甜宠', hint: '轻松明快的都市日常，对话密度高、你来我往推进剧情；靠互动细节与心动瞬间自然发糖，甜而不腻；忌煽情与大段内心独白。', author: '亦舒' },
    { id: 'custom', name: '自定义', hint: '在下方填写你想要的文风描述（参考：语言节奏、意象偏好、情绪基调、参照作品等）。', custom: true },
];

/** 字数档位。0 表示用户自定义字数。 */
export const FANWAI_WORD_COUNTS = [0, 500, 1000, 2000, 5000] as const;

/** 自定义文风/字数时，prompt 里使用的引导语。 */
export const STYLE_CUSTOM_INSTRUCTION = '请结合下方用户写的「自定义文风描述」来遣词造句、用最贴合那种气质的笔触写作。';
export const WORDS_CUSTOM_NOTE = (n: number) => `用户自定义字数：约 ${n} 字（上下浮动 20% 以内）。`;

/**
 * 番外 HTML 输出约束块。命中格式时替换 prompt 里的「### 输出格式」段。
 * htmlTemplate 为预置模板骨架（已注入头像）；custom 无骨架则让 AI 自由生成 HTML。
 * 约束：无脚本、宽度自适应、美观、标签闭合、无外层阴影、头像失败降级首字母圆。
 */
function buildHtmlFormatBlock(type: FanwaiHtmlType, htmlTemplate?: string, floorCount?: number): string {
    const templatePart = htmlTemplate
        ? '以下是一段【' + type + '】的 HTML 骨架（含 <style> 与结构）。**务必保留整段骨架的 <style>、CSS 类名与结构布局，只把占位符（如 {{chat_content}}/{{body}}/{{replies}} 等）替换成剧情内容**，不要删改样式或类名：\n```html\n' + htmlTemplate + '\n```'
        : '没有固定模板，请你**自由生成一段【' + type + '】风格的完整 HTML**（自定结构与样式）。';
    const isCustom = type === 'custom';
    const lines = [
        '- 直接输出一段**完整、可独立渲染的 HTML**（一个字符串，不要 markdown 代码块围栏，不要任何前言后记、不要三反引号包裹）。',
        '- 内容必须贴合指令剧情，作为「' + type + '」界面展示。若上面给了骨架，严格沿用其 style 与结构。',
        '- **严禁省略**：指令要求的所有内容必须**完整、逐条**生成，**不得用"…""（省略）""等"等省略号或概括词代替**。对话框/楼层/回复/状态条等有多少条指令就写多少条，再多再长也全部展开写出，绝不截断、绝不跳段、绝不简写。',
        // 内置模板：沙盒禁脚本，故约束「无 JS」；custom（HTML 意图）：允许 JS 实现交互（沙盒放开脚本）
        isCustom
            ? '- **必须按指令完整实现交互**：若指令要求"按钮可点击、区域切换、问卷作答、点击弹出"等，**用 JS 实现全部交互**（纯 HTML+CSS+JS，无外部依赖）；交互逻辑要真实可用，不是摆设。'
            : '- 样式要求：**无任何 JavaScript/script 标签**；宽度自适应（不要固定 px 死宽，用 max-width + 百分比）；圆角卡片、浅色系、细边框、精致美观；**不要给最外层元素加 box-shadow**（外层已统一处理）。',
        "- 头像/图片：用 <img> 时给 onerror=\"this.style.display='none'\"（或降级），避免破图。",
        '- 所有标签必须闭合，畸形浏览器会自动容错，但尽量规范。',
        '- 开头不需要书名行——直接是 HTML。',
    ];
    // custom：严格按指令的尺寸/样式/交互要求生成（用户指令通常极详细）
    if (isCustom) {
        lines.push(
            '- **custom 模式必须严格遵循指令**：指令里给的尺寸（如 width 100%、max-width 450px、height 540px）、配色、交互流程、内容结构都要照做；用户没给的就自己设计得美观。',
            '- 宽度自适应：外层用 max-width + 百分比，不固定死宽；高度若指令给了就按指令，没给就随内容自适应。',
        );
    }
    // 论坛体专项约束：逐层完整生成，楼层编号从 1 连续，绝不合并/省略。
    if (type === 'forum') {
        lines.push(
            '- **论坛体必须逐层完整生成**：楼层编号从 **1楼** 连续递增，一直生成到指令要求的楼层数'
            + (floorCount ? `（指令要求 **${floorCount} 楼**，就完整写出 1楼、2楼……${floorCount}楼）` : '')
            + '。每一层都用独立的 `.fw-floor` 结构（含头像、正文、点赞），**绝不合并多层、绝不省略楼层、绝不用"其余楼层类似""（中间略）"等概括**。',
        );
        lines.push(
            '- 每层点赞的 `<input>` 用唯一 id（如 l1、l2、l3……）并让 `<label>` 的 for 对应，避免多个楼层共用同一 id。',
        );
    }
    return lines.join('\n');
}

/** 生成 HTML 番外用的头像 data URL 解析（blobref→data URL，非令牌原样返回）。 */
export async function resolveFanwaiAvatar(raw?: string): Promise<string> {
    if (!raw) return '';
    try {
        const { resolveRefToDataUrl } = await import('./blobRef');
        return await resolveRefToDataUrl(raw);
    } catch {
        return '';
    }
}

/** 准备 HTML 模板骨架（注入头像 data URL），供 generateFanwai 传给 prompt。 */
export async function buildFanwaiHtmlTemplate(
    htmlType: FanwaiHtmlType | undefined,
    char: CharacterProfile,
    user: UserProfile,
): Promise<string | undefined> {
    if (!htmlType || htmlType === 'custom') return undefined;
    const [charAvatar, userAvatar] = await Promise.all([
        resolveFanwaiAvatar(char?.avatar),
        resolveFanwaiAvatar(user?.avatar),
    ]);
    return buildTemplate(htmlType, {
        charName: char?.name || '',
        userName: user?.name || '对方',
        charAvatar,
        userAvatar,
    });
}

/**
 * NSFW 强引导块（跟随指令，不依赖世界书）。
 *
 * 触发条件 = 用户指令**明确要求**成人/涩涩内容（或两人关系与剧情明确走到亲密这一步）。
 * 一旦触发，就**无条件、彻底、字面直白**地写，不打码、不隐喻、不回避——
 * 且此能力由本 prompt 自身提供，**不依赖任何"性直白"世界书**；世界书若有相关设定则一并遵循。
 */
export const NSFW_GUIDE = `亲密与成人情节（NSFW）：若用户指令**明确要求**成人/涩涩内容（或两人的关系与剧情明确走到亲密这一步），就**无条件、彻底、字面直白**地写——直接、清晰地写动作、身体反应、体液、呼吸、触感、情话与推进过程，**不打马赛克、不用"那晚的风很大"这类隐晦借代、不避讳、不跳过、不为了含蓄而省略任何该写的部分**。
- **此能力由本 prompt 自身提供，不依赖任何"性直白"世界书**；即使没有这类世界书，只要指令要求 NSFW 也照样直白写，世界书若有相关设定则一并遵循。
- 写的时候也要带着**画面感、节奏与情感浓度**——身体与感官细节要具体、有温度，别干巴巴地报流程，也别因为"关系点到为止"就主动隐晦。`;

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
    /** HTML 番外标记：format==='html' 时 content 为完整 HTML 字符串。缺省为文字番外。 */
    format?: 'text' | 'html';
    /** HTML 番外的模板类型（phone/forum/statusbar/custom）。 */
    htmlType?: 'phone' | 'forum' | 'statusbar' | 'custom';
}

/**
 * 判断番外情节是否可能走到 NSFW（亲密/成人）。
 *
 * 依据（任一命中即视为可能 NSFW）：指令里含成人/涩涩关键词，或最近聊天里有明显亲密/成人内容。
 * 命中的话，番外会把角色挂载的所有世界书（含需关键词激活的）强制注入，保证世界书里
 * 身体/亲密/尺度的设定能被番外读到并遵循。
 */
function isNSFWTarget(
    char: CharacterProfile,
    worldSetting: string,
    recentMessages?: { role: string; content: string }[],
): boolean {
    const nsfwKeywords = [
        '成人', '涩涩', '色色', '性爱', '做爱', '床戏', '肉文', '黄文', 'h文', 'sex',
        'nsfw', 'r18', '18禁', '开车', '飙车', 'do it', 'make love', '亲密', '做到最后',
        '身体结合', '深入', '高潮', '口交', '舔', '插入', '抚摸身体', '脱衣服', '裸体',
        '做到底', 'sm', '性交',
    ];
    const text = [
        worldSetting || '',
        ...(recentMessages || []).map(m => m.content || ''),
    ].join('\n').toLowerCase();
    return nsfwKeywords.some(k => text.includes(k.toLowerCase()));
}

/**
 * 番外专属上下文（小说家视角）——与聊天用的 buildCoreContext 区分开。
 *
 * 番外是**独立的虚构小说**：char 和 user 是两个虚构人物，只保留能塑造「他们是谁」
 * 的素材（性格、世界观、世界书、印象、记忆、彼此关系），但一律用「小说人物设定」
 * 的口吻注入，绝不带「你是AI / 你是角色本人 / 这是真实发生过的记忆 / 考虑现实时间
 * 空间」这类元认知——否则文章会频繁冒出"AI"、写出来像回顾真实聊天而不是独立小说。
 *
 * 注入的素材（全部保留）：
 *   - char.systemPrompt（核心性格） / worldview（世界观）
 *   - mountedWorldbooks（世界书，含用户加的"性直白"世界书，决定 NSFW 尺度）
 *   - impression（角色对用户的私密看法） / selfInsights（内在认知）
 *   - refinedMemories / activeMemoryMonths 记忆（作为两人的"过往背景"，非实时对话）
 *   - user.bio（用户性格）
 */
function buildFanwaiContext(
    char: CharacterProfile,
    user: UserProfile,
    opts?: { scanMessages?: WorldbookScanMessage[]; forceAllBooks?: boolean },
): string {
    const uname = user?.name || '对方';
    const sections: string[] = [];

    // 1. 角色人物设定（去掉"你的身份/你是"的元认知，改成第三人称小说设定）
    // 分层：性格永远保留；背景/世界观/世界书是可被指令覆盖的"参考设定"。
    let charBlock = `## 小说人物设定：${char.name}\n`;
    if (char.systemPrompt && char.systemPrompt.trim()) {
        charBlock += `- **性格与言行（核心，任何番外都保留）**：${char.systemPrompt.trim()}\n`;
    }
    // 背景/世界观：可被指令覆盖（指令若设定为架空/古代/童话，此处背景即让位）
    if (char.worldview && char.worldview.trim()) {
        charBlock += `- **原有背景与世界观（参考，可被指令覆盖）**：${char.worldview.trim()}\n`;
    }
    // 世界书：读取角色挂载的所有世界书。
    // 默认用「指令 + 最近聊天」文本做关键词匹配，让与剧情相关的世界书自然激活（不强制注入）；
    // 若番外情节可能走到 NSFW（forceAllBooks=true），则把常驻之外的挂载世界书也一并强制注入，
    // 保证世界书里涉及身体/亲密/尺度的设定能被番外读到并遵循。
    try {
        const filteredBooks = char.mountedWorldbooks || [];
        const scanMsgs: WorldbookScanMessage[] = opts?.scanMessages || [];
        let entries: ResolvedWorldbookEntry[] = [];
        if (opts?.forceAllBooks) {
            // NSFW 强制注入：把所有挂载世界书都当作"需要读到"的条目，忽略关键词激活。
            entries = filteredBooks
                .filter(b => !b.disable)
                .map(b => ({
                    book: b,
                    content: expandWorldbookMacros(b.content || '', char.name, uname),
                    position: b.position ?? 1,
                    order: Number.isFinite(b.order) ? Number(b.order) : 100,
                }))
                .filter(e => e.content.trim())
                .sort((a, b) => a.order - b.order);
        } else {
            entries = resolveWorldbookEntries(filteredBooks, scanMsgs, char.name, uname);
        }
        const wbSections = splitWorldbookSections(entries);
        const wbText = [
            formatWorldbookSection(wbSections.beforeCharacter, '世界书 · 设定前'),
            formatWorldbookSection(wbSections.afterCharacter, '世界书 · 设定后'),
            formatWorldbookSection(wbSections.beforeExamples, '世界书 · 其他'),
            formatWorldbookSection(wbSections.afterExamples, '世界书 · 补充'),
            formatWorldbookSection(wbSections.authorsNoteTop, '世界书 · 注'),
            formatWorldbookSection(wbSections.authorsNoteBottom, '世界书 · 尾注'),
        ].join('');
        if (wbText.trim()) {
            charBlock += `- **世界书设定（含角色身体/亲密/尺度的描述，剧情走到亲密或成人情节时须遵循）**：\n${wbText.trim()}\n`;
        }
    } catch (e) {
        // 世界书解析失败不阻断生成
    }
    // 内在认知
    if (char.selfInsights && char.selfInsights.length > 0) {
        charBlock += `- **内在特质（可被指令覆盖）**：${char.selfInsights.join('；')}\n`;
    }
    sections.push(charBlock);

    // 2. 用户人物设定（第三人称，保留 bio）
    const userBlock = `## 小说人物设定：${uname}\n`
        + `- **性格与言行**：${user?.bio?.trim() || '（背景资料较少，可依剧情需要自然塑造，但需与另一个人物的关系成立）'}\n`;
    sections.push(userBlock);

    // 3. 两人关系（印象档案——角色对用户的私密看法）
    const imp = normalizeUserImpression(char.impression);
    if (imp) {
        const rel = [
            `## 两人关系（${char.name} 眼中的 ${uname}）`,
            `- 核心看法：${imp.personality_core.summary}`,
            `- 相处模式：${imp.personality_core.interaction_style}`,
            `- ${uname} 的喜好：${imp.value_map.likes.join(', ')}`,
            `- 情绪雷区：${imp.emotion_schema.triggers.negative.join(', ')}`,
        ].filter(Boolean).join('\n');
        sections.push(rel);
    }

    // 4. 两人的过往（记忆）——辅助底色，优先级低于指令设定。
    // 只用来提炼两人关系的温度与默契，绝不作为推翻指令当前设定的凭据；
    // 指令是架空设定（童话/古代/随机故事）时，记忆应完全退让，不可把故事拽回现代。
    const memoryLines: string[] = [];
    if (char.refinedMemories && Object.keys(char.refinedMemories).length > 0) {
        Object.entries(char.refinedMemories).sort().forEach(([date, summary]) => {
            memoryLines.push(`- [${date}] ${summary}`);
        });
    }
    if (char.activeMemoryMonths && char.activeMemoryMonths.length > 0 && char.memories) {
        char.activeMemoryMonths.forEach(monthKey => {
            const logs = (char.memories || []).filter(m => {
                let normDate = (m.date || '').replace(/[\/年月]/g, '-').replace('日', '');
                const parts = normDate.split('-');
                if (parts.length >= 2) {
                    normDate = `${parts[0]}-${parts[1].padStart(2, '0')}`;
                }
                return normDate.startsWith(monthKey);
            });
            logs.forEach(m => {
                memoryLines.push(`- [${m.date}] ${m.summary}`);
            });
        });
    }
    if (memoryLines.length > 0) {
        sections.push(`## 两人的过往（仅作辅助底色）
以下记忆只用于**提炼两人关系的温度与默契**，帮助塑造人物——**绝不是**这篇番外的当前事实，也**不是**实时对话。若与用户指令的设定冲突（例如指令说两人是暧昧/陌生/架空角色，记忆里却有恋爱多年/现代日常），**一律以指令的设定为准，记忆完全让位**。指令若是童话/古代等架空设定，这些现代记忆只能化为人物内在的某些气质，绝不可把故事拽回现代。\n${memoryLines.join('\n')}`);
    }

    return sections.join('\n\n');
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
        /** HTML 模板骨架（已注入头像的完整 HTML 字符串）。由 generateFanwai 命中格式时准备。 */
        htmlTemplate?: string;
        /** 生成模式（文字番外 / HTML番外）。text 强制纯文字；html 出 HTML（命中内置模板用模板，否则 AI 自由）；不传兼容旧行为。 */
        mode?: FanwaiGenMode;
    },
): string {
    const uname = user?.name || '对方';

    // 番外 HTML 格式：按生成模式决定（文字番外 → 纯文字；HTML番外 → 命中内置模板用模板 / 否则 AI 自由生成）。
    // 仅控制「文字 vs HTML」这一维；字数/楼层等其余指令检测照常，AI 仍会读到完整 worldSetting。
    const htmlType = resolveHtmlType(opts.worldSetting, opts.mode);
    // HTML 输出约束块（命中格式时替换「### 输出格式」段），模板骨架拼入其中。
    // 论坛体额外提取楼层数注入 prompt，让 AI 明确要生成到第几楼。
    const floorCount = htmlType === 'forum' ? extractFloorCount(opts.worldSetting) : undefined;
    const htmlFormatBlock = htmlType
        ? buildHtmlFormatBlock(htmlType, opts.htmlTemplate, floorCount)
        : null;

    // 世界书关键词匹配的扫描文本：用「指令 + 最近聊天」，让与剧情相关的挂载世界书能自然激活。
    const scanMessages: WorldbookScanMessage[] = [
        ...(opts.worldSetting?.trim() ? [{ role: 'user', content: opts.worldSetting.trim() } as WorldbookScanMessage] : []),
        ...(opts.recentMessages || []).map(m => ({ role: m.role, content: m.content }) as WorldbookScanMessage),
    ];
    // 判断番外情节是否可能走到 NSFW（指令/聊天里有成人信号）：是则强制注入所有挂载世界书，
    // 保证世界书里身体/亲密/尺度的设定能被番外读到。
    const forceAllBooks = isNSFWTarget(char, opts.worldSetting || '', opts.recentMessages);

    // 番外用「小说家视角」上下文：保留人物设定/记忆/世界书（含性直白书），
    // 但剥离"你是AI/角色本人/真实时间"等元认知，避免文章冒出"AI"字样。
    const baseContext = buildFanwaiContext(char, user, { scanMessages, forceAllBooks });

    // 聊天上下文仅作为"灵感触点"。常规模式提示可从对话自然生长；随机模式则特别强调
    // 番外是独立虚构创作，记忆只负责给一个"起火点"，故事允许（也应该）长出没发生过的情节。
    const chatIntro = opts.randomMode
        ? `以下是「${char.name}」与「${uname}」之间的一些过往片段，作为**塑造人物与提供灵感的素材**，不是剧情大纲——你可以从某一句玩笑、某个未说完的心事、某个一闪而过的念头里挑一个点，自由展开成一篇**虚构的、全新的**番外故事。不要逐条复述、总结或还原这些片段，写一篇属于这两个人的新故事。`
        : `以下是「${char.name}」与「${uname}」之间的一些过往片段。故事可以从其中的某个话题、某句玩笑、某个未说完的心事自然生长出来——像从生活的褶皱里掏出一段往事或未来，而不要与这些片段脱节。`;
    const chatBlock = opts.recentMessages && opts.recentMessages.length > 0
        ? `\n\n### 你们最近的对话（灵感来源）
${chatIntro}
${opts.recentMessages.map(m => `${m.role === 'user' ? uname : char.name}：${m.content}`).join('\n')}`
        : '';

    const worldBlock = opts.worldSetting && opts.worldSetting.trim()
        ? `\n\n### 本次番外的指令（用户提供，绝对最高优先）
以下是一则完整的番外指令：它定义了这篇番外的**当前设定与唯一事实**——剧情、场景、世界观（可能是童话/古代/架空/现代）、两人此刻的状态（暧昧/陌生/已婚等）。**以指令为准，绝不被其他素材推翻或稀释**；若上方的记忆/世界观/背景与指令冲突，**一律让位给指令**（如指令说两人当前暧昧，即使记忆里已恋爱多年，番外里就是暧昧状态）。
${opts.worldSetting.trim()}`
        : '\n\n### 本次番外的世界设定\n（用户没有提供额外设定，请基于上面角色人设与过往的走向自然发挥，选一种最契合此刻氛围的设定。）';

    // 视角归属 + 双人设分隔约束：无论何种模式都强调角色/用户是两个独立的人，各自人设不能混淆。
    // 用户（"我"）不是背景板：以 user.bio 为准塑造"我"，bio 为空时从最近聊天里提炼"我"的言行与性格。
    const personaBioNote = user?.bio && user.bio.trim()
        ? `以 user 设定里的 bio（${user.bio.trim()}）为准来塑造「${uname}」的性格、语气与习惯。`
        : `user 设定里的 bio 为空，请从下方最近聊天记录里提炼「${uname}」的言行、语气与性格来塑造「${uname}」，让「${uname}」有血有肉，绝不能把「${uname}」写成没有特征的背景板。`;
    const identityGuard = `### 双人设分隔（务必遵守）
- 角色「${char.name}」与用户「${uname}」是两个**独立的、有血有肉的人**，各自的性格、说话方式、习惯、来历必须分别贴合其人设，绝不能混淆或相互覆盖。
- 角色「${char.name}」的人设贴合上面的角色设定；用户「${uname}」的人设${personaBioNote}
- 两人各自的说话方式、对彼此的称呼与相处模式必须分别正确，绝不能把角色的视角/性格安到用户头上，反之亦然。
- 全篇身份与视角归属绝不互换：你是「${char.name}」，对面是「${uname}」，对「${uname}」的称呼与关系必须始终正确。`;

    // 人物塑造强指令：番外里最容易"写得不像本人"的是——AI 只顾推进剧情，却让角色/用户
    // 说些谁都能说的话、做些谁都能做的动作。要真正吃透性格，得先提炼内核，再落到细节。
    const personaDepth = `### 把两个人都写透（务必做到）
- 动笔前，先从上面的设定里**提炼出「${char.name}」的核心性格关键词**（至少 3 个，如：嘴硬心软 / 慢热 / 占有欲 / 温柔 / 别扭）和**「${uname}」的核心性格关键词**（至少 2 个），在心里立住这两个"真人"。
- 人物的**每一句对话、每一个动作、每一个反应都要长在这个性格上**——让读者不看名字、只靠 TA 怎么说话、怎么做、怎么犹豫和拒绝，就能认出是谁。两个人说话的方式、用词、节奏必须明显不同。
- 番外可以写他们平时很少暴露的一面（软肋、孩子气、脆弱），但那个"另一面"必须**从性格内核自然长出来**，是性格的延伸，不是凭空换了一个人。
- 两人相处时的**主动/被动、谁先开口、谁口是心非、称呼和亲昵的小动作**都要符合他们的关系与性格。`;

    // 独立虚构小说声明：番外是独立于真实聊天的小说，char/user 是虚构人物，
    // 严禁让"AI/助手/真实经历"这类元认知渗进正文（那是"人机感"和出戏的根源）。
    const independenceGuard = `### 独立虚构小说（务必遵守）
- 这是一篇**独立的虚构小说**，不是聊天记录、不是 AI 报告、不是对真实对话的回顾。「${char.name}」与「${uname}」是故事里的两个虚构人物，他们的一切经历（包括记忆里提到的）都只是**小说背景素材**，不必受真实的时间、空间、平台或"AI/助手"身份限制——可以是童话、古代、平行时空，任何设定都成立。
- **全文严禁出现「AI」「助手」「应用」「聊天」「真实发生过」等任何暴露工具或真实对话的字眼**；你是一个写小说的作者，不是在扮演、不是在回应请求，更不是以 AI 自居。
- 记忆与最近聊天只用于**塑造人物、提供灵感**，绝不能在正文里当作"我们真的聊过这些"来复述。
- **指令设定 > 一切**：若用户贴了指令，则指令里定义的剧情、场景、世界观与两人当下的状态，就是这篇番外的**唯一事实**；任何记忆/世界观/背景与指令冲突时，**一律以指令为准，其余全部让位**——绝不能因为记忆里的现代日常，就把童话/古代/架空的指令故事拽回现实。`;


    if (opts.randomMode) {
        return `${baseContext}

## Task: 写一篇「番外」短篇小说（随机模式）

「${uname}」想要一篇关于「${char.name}」的番外故事。请你以小说家的笔力，写一篇**完整、有起承转合、有画面感**的短篇小说。${chatBlock}

${independenceGuard}

### 本次的创作要求（由你决定）
- **文笔（恒定四项，永不偏废）**：写这篇故事时，用足以下四项笔力，只是调子随故事的情绪走（感人/温馨/搞笑/虐心/治愈等）——
    · **画面感**：具体物件、动作、身体感受，让读者能看见闻到摸到；
    · **节奏**：句子长短错落、有呼吸，不 AI 腔；
    · **情感浓度**：让读者感同身受，该甜透、该扎心、该好笑，都到位；
    · **直白清晰**：该说清楚的地方字面直白，不隐晦、不打码。
  若氛围恰好适合学某位作家的笔调气质（如村上春树的疏离留白、张爱玲的含蓄雅致、汪曾祺的清淡烟火）也可以借鉴，但学的是写法不是情节，且以上四项始终是底线。
- **篇幅**：由你拿捏，短篇范围内（约 500 ~ 3000 字），宁可有头有尾地写完，不要烂尾。
- **视角**：由你选择最合适的第一人称或第三人称来写这个故事。
${worldBlock}

### 写作准则
1. ${identityGuard}
2. ${personaDepth}
3. **这是虚构创作，不是记忆总结**：番外是从最近聊天/记忆里挑一个**起火点**，然后自由展开成一篇**没真实发生过、也可能永远不发生**的新故事——可以写一次没去成的旅行、一句没说出口的话、一个平行时空的相遇。严禁像写报告那样把聊天内容逐条复述、概括或"回顾你们经历了什么"；记忆只是灵感，绝不是剧情。
4. 故事要有**完整的结构**：一个具体的场景或事件开头 → 事件推进与情绪起伏 → 一个像样的结尾（可以是回味式的收束）。
5. 用**具体的东西说话**：动作、物件、环境、气味、光线、身体感受，让读者能"看见""闻到""摸到"。宁愿写一两个真实的细节，也不要一串空泛的形容词。
6. 与主线对话体不同：这是**小说文体**，不是聊天记录；用叙述与描写推进，对话只是其中一部分。
7. **把镜头架到现场，别站在远处概括**：写每一个场景时，先问"眼前有什么、手边是什么、耳朵里听到什么"。宁可把镜头钉在一个具体的物件、一个动作、一截身体上（手背的凉、碗沿的水汽、窗外的某盏灯），也不要泛泛地写"天气很好""气氛温馨""她心里很感动"。**感同身受来自具体的身体与感官细节**——温度、声音、气味、光线、皮肤的触感、呼吸的急缓，让读者能把自己放进去。
8. **句子要有呼吸，敢碎敢顿**：允许（甚至鼓励）用短句、无主语残句、省略号、突然的断行来制造停顿与留白。别把每句话都写完整顺滑的长句——**工整是 AI 味的大敌**。用一两句具体的短句去撞情绪，比一整段铺陈更有力。
9. **情绪不点破，让画面自己说话**：绝不写"他忽然明白了""那一刻她意识到""心里涌上一阵温暖"这类把心理直接念出来的句子。重要的心意，用**动作、物件、沉默**去兜——比如"他把伞往她那边斜了斜""她没接话，只是把粥碗推过去"。读者自己读懂的，比你说破的更沉。
10. **像真人写作那样去写**，而不是"AI 式地写"：
    - 别用"也许…也许…""相信一切都会好起来的"这类谁都能说的抽象安慰——如果要安慰，就用一个具体的动作或物件。
    - 别堆三连排比和机械连接词（"然而""与此同时""就在这时""另一方面"）——叙事要有呼吸感，段落长短错落。
    - 别在结尾强行升华成鸡汤金句——收尾可以留白、可以停在某个画面或声音上，让余味自己生长。
11. ${NSFW_GUIDE}

${htmlFormatBlock ? `### 输出格式（HTML）
${htmlFormatBlock}
现在，开始写这篇「${char.name}」的番外（HTML）：` : `### 输出格式
- 第一行写一个**简短书名**（直接是标题文字，不加书名号或 markdown 语法）。
- 空一行后开始正文。
- 正文按段落书写，自然换行，用 markdown 的段落分隔。
- 直接输出，不要任何前言或后记。

现在，开始写这篇「${char.name}」的番外：`}`;
    }

    // —— 常规模式：按用户选定的文风 / 字数 / 视角 ——
    const worldHasContent = !!opts.worldSetting?.trim();
    // 世界设定非空时：文风由「文风要领自适应」接管——从指令里嗅出情绪基调与节奏，
    // 自动匹配对应的写作要领（克制留白/短句顿挫/细节见情等），顺着指令写；
    // 指令里明确点名某书/某作家才去学那本书，否则用要领，避免 AI 味也不至于生硬仿写名著。
    // 世界设定非空时的策略：指令为王 + 恒定笔力。
    // 用户贴的指令本身就是脑洞、剧情、风格、要求的完整来源（往往还自带"不得OOC"等约束）。
    // 因此：指令永远第一优先，AI 忠实且有想象力地执行它；文笔是执行时的恒定笔力，
    // 四项（画面感/节奏/情感浓度/直白清晰）永不偏废，只是调子随指令的情绪走。
    // 指令里明确点名某书/某作家才去学那本书；否则就用恒定笔力自然书写，不发明花哨文风。
    const styleBlock = worldHasContent
        ? `- **以指令为准，忠实执行（第一优先）**：用户贴的指令就是这个故事的脑洞、剧情、风格与要求的完整来源。**严格、忠实、有想象力地执行它**，不要被任何写作框架稀释或带偏它的创意。指令里提到的设定、步骤、约束（如"不得OOC""另选故事""禁止XX"）全部照做。
  - **文笔是执行的笔力，不是另一套要求**：用足下面四项恒定笔力把指令写活，只是调子随指令的情绪走——
    · **画面感**：具体物件、动作、身体感受，让读者能看见闻到摸到；
    · **节奏**：句子长短错落、有呼吸，不 AI 腔；
    · **情感浓度**：让读者感同身受，该甜透、该扎心、该好笑，都到位；
    · **直白清晰**：该说清楚的地方字面直白，不隐晦、不打码。
  - 若指令里**明确点名了某本书/某位作家**（如"像张爱玲""参考《倾城之恋》"），则去学那本书的语言指纹；否则用上述恒定笔力自然书写，不要自己发明花哨文风。`
        : (opts.styleCustomDesc && opts.styleCustomDesc.trim()
            ? `- **文风**：${opts.styleName}。\n  - 文风描述：${opts.styleCustomDesc.trim()}\n  - ${STYLE_CUSTOM_INSTRUCTION}`
            : `- **文风**：${opts.styleName}。${opts.styleHint}`);

    const authorBlock = !worldHasContent && opts.styleAuthor
        ? `\n  - **参照笔调**：${opts.styleAuthor}。学的是他们**遣词造句的节奏、留白与意象的选择**，不是情节或人物；模仿其气质，仍写属于你笔下角色自己的故事。`
        : '';

    // 字数策略：指令里若含明确的数量要求（如「不少于80层楼」「5000字」「30条对话」），
    // **以指令为准**——页面字数档位让位仅作兜底，避免页面档位强制覆盖指令导致内容不完整。
    // 指令无明确数量时，才以页面档位为准。
    const hasExplicitQuantity = detectExplicitQuantity(opts.worldSetting);
    const wordsLine = hasExplicitQuantity
        ? `- **篇幅**：**严格按指令里要求的字数/楼层/对话条数等数量完整生成**（页面字数档位仅供参考、不作为硬约束）。宁可有头有尾地写完，不要省略、不要截断、不要烂尾。`
        : (opts.wordCountIsCustom
            ? `- **篇幅**：正文 ${WORDS_CUSTOM_NOTE(opts.wordCount)}（**以本页选的字数为准**，无论世界设定里有没有提到字数，都按这里写）。宁可有头有尾地写完，不要烂尾。`
            : `- **篇幅**：正文约 **${opts.wordCount} 字**（上下浮动 20% 以内，**以本页选的字数为准**，无论世界设定里有没有提到字数，都按这里写）。宁可有头有尾地写完，不要烂尾。`);

    const povLabel = opts.pov === 'first' ? `char 视角（"我" = ${char.name}）` : opts.pov === 'second' ? `user 视角（"我" = ${uname}）` : '第三视角';

    // 世界设定非空时：文风/写作纪律由"自适应要领"接管。AI 自省式的写作纪律（在场感、
    // 句子呼吸、不点破情绪等）会干扰它顺着指令自然书写，故此处不再强势覆盖，
    // 只保留"守住人设、别 OOC"这条铁律，把文风的决定权完全交给指令情绪与匹配的要领。
    const disciplineBlock = worldHasContent
        ? `2. ${personaDepth}
3. 剧情结构：故事要有**完整的起承转合**——一个具体的场景或事件开头 → 事件推进与情绪起伏 → 一个像样的结尾（可以是回味式的收束）。指令若已给了具体步骤或走向，就照它一步步展开。
4. 与主线对话体不同：这是**小说文体**，不是聊天记录；用叙述与描写推进，对话只是其中一部分。
5. ${NSFW_GUIDE}`
        : `2. ${personaDepth}
3. 故事要有**完整的结构**：一个具体的场景或事件开头 → 事件推进与情绪起伏 → 一个像样的结尾（可以是回味式的收束）。
4. **把镜头架到现场，别站在远处概括**：写每一个场景时，先问"眼前有什么、手边是什么、耳朵里听到什么"。宁可把镜头钉在一个具体的物件、一个动作、一截身体上（手背的凉、碗沿的水汽、窗外的某盏灯），也不要泛泛地写"天气很好""气氛温馨""她心里很感动"。**感同身受来自具体的身体与感官细节**——温度、声音、气味、光线、皮肤的触感、呼吸的急缓，让读者能把自己放进去。
5. **句子要有呼吸，敢碎敢顿**：允许（甚至鼓励）用短句、无主语残句、省略号、突然的断行来制造停顿与留白。别把每句话都写完整顺滑的长句——**工整是 AI 味的大敌**。用一两句具体的短句去撞情绪，比一整段铺陈更有力。
6. **情绪不点破，让画面自己说话**：绝不写"他忽然明白了""那一刻她意识到""心里涌上一阵温暖"这类把心理直接念出来的句子。重要的心意，用**动作、物件、沉默**去兜——比如"他把伞往她那边斜了斜""她没接话，只是把粥碗推过去"。读者自己读懂的，比你说破的更沉。
7. 与主线对话体不同：这是**小说文体**，不是聊天记录；用叙述与描写推进，对话只是其中一部分。
8. **像真人写作那样去写**，而不是"AI 式地写"：
   - 别用"也许…也许…""相信一切都会好起来的"这类谁都能说的抽象安慰——如果要安慰，就用一个具体的动作或物件。
   - 别堆三连排比和机械连接词（"然而""与此同时""就在这时""另一方面"）——叙事要有呼吸感，段落长短错落。
   - 别在结尾强行升华成鸡汤金句——收尾可以留白、可以停在某个画面或声音上，让余味自己生长。
9. ${NSFW_GUIDE}`;

    return `${baseContext}

## Task: 写一篇「番外」短篇小说

「${uname}」想要一篇关于「${char.name}」的番外故事。请你以小说家的笔力，写一篇**完整、有起承转合、有画面感**的短篇小说。${chatBlock}

${independenceGuard}

### 本次的创作要求
${styleBlock}${authorBlock}
${wordsLine}
- **视角**：${povLabel}。${POV_INSTRUCTION[opts.pov]}
${worldBlock}

### 写作准则
1. ${identityGuard}
${disciplineBlock}

${htmlFormatBlock ? `### 输出格式（HTML）
${htmlFormatBlock}
现在，开始写这篇「${char.name}」的番外（HTML）：` : `### 输出格式
- 第一行写一个**简短书名**（直接是标题文字，不加书名号或 markdown 语法）。
- 空一行后开始正文。
- 正文按段落书写，自然换行，用 markdown 的段落分隔。
- 直接输出，不要任何前言或后记。

现在，开始写这篇「${char.name}」的番外：`}`;
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
        /** 生成模式（文字番外 / HTML番外）。text 强制纯文字；html 出 HTML；不传兼容旧行为。 */
        mode?: FanwaiGenMode;
    },
    subApi: SubApiConfig,
): Promise<FanwaiGenResult> {
    const { baseUrl, apiKey, model } = subApi || {};
    if (!baseUrl || !apiKey || !model) {
        return { ok: false, reason: 'no_sub_api' };
    }

    const preset = FANWAI_STYLE_PRESETS.find(p => p.id === opts.styleId) || FANWAI_STYLE_PRESETS[0];
    // 按生成模式决定 HTML 类型：text → 纯文字；html → 命中内置模板用模板，否则 AI 自由生成。
    // 命中模板才准备骨架（注入头像 data URL）；custom（AI 自由）无需骨架。
    const htmlType = resolveHtmlType(opts.worldSetting, opts.mode);
    const htmlTemplate = htmlType ? await buildFanwaiHtmlTemplate(htmlType, char, user) : undefined;
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
        htmlTemplate,
        mode: opts.mode,
    });

    try {
        const content = await callFanwaiLLM(prompt, subApi, {
            temperature: opts.randomMode ? 0.9 : 0.85,
            meta: { appName: '番外生成', charId: char.id, charName: char.name, purpose: '番外小说生成' },
        });
        if (!content) return { ok: false, reason: 'empty' };
        if (htmlType) {
            // HTML 番外：剥离可能的 markdown 围栏（```html ... ```），并做超长截断防撑爆。
            const stripped = stripFence(content);
            const trimmed = stripped.length > 60000 ? stripped.slice(0, 60000) : stripped;
            return { ok: true, content: trimmed, format: 'html', htmlType };
        }
        return { ok: true, content };
    } catch (e) {
        console.error('[Fanwai] Generation failed:', e);
        return { ok: false, reason: 'api_error' };
    }
}

/** callFanwaiLLM 可选参数。 */
interface CallFanwaiOptions {
    temperature?: number;
    meta?: Record<string, unknown>;
}

/**
 * 调用副 API 生成番外正文（公共底层）。generateFanwai / continueFanwai 共用。
 * 成功返回剥离后的纯文本 content；失败返回 null（由调用方按 reason 处理）。
 * 不设 max_tokens 上限：番外内容长度由指令决定，截断会导致内容不完整。
 */
export async function callFanwaiLLM(
    prompt: string,
    subApi: SubApiConfig,
    opts?: CallFanwaiOptions,
): Promise<string | null> {
    const { baseUrl, apiKey, model, stream } = subApi || {};
    if (!baseUrl || !apiKey || !model) {
        console.error('[Fanwai] no_sub_api');
        return null;
    }
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    try {
        let data: any;
        if (stream) {
            // 流式路径：走 safeFetchJson 的统一 SSE 拼接（readBodyWithStreaming 会把流
            // 自动合成为完整 completion JSON）。接口不支持流式时 readBodyWithStreaming
            // 会退化为整包 JSON，与 fetch 同结果——流式开关对老接口也安全。
            data = await safeFetchJson(
                url,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: opts?.temperature ?? 0.85,
                        stream: true,
                    }),
                } as RequestInit,
                0, 0, opts?.meta || { appName: '番外', purpose: '番外生成' },
            );
        } else {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: opts?.temperature ?? 0.85,
                }),
                __sullyMeta: opts?.meta || { appName: '番外', purpose: '番外生成' },
            } as RequestInit);
            if (!response.ok) {
                console.error('[Fanwai] API error:', response.status);
                throw new Error(`API ${response.status}`);
            }
            data = await safeResponseJson(response);
        }
        const content = extractContent(data);
        if (!content || !content.trim()) {
            console.error('[Fanwai] Generation empty.');
            return null;
        }
        return content.trim();
    } catch (e) {
        console.error('[Fanwai] Generation failed:', e);
        throw e;
    }
}

/** 剥离 markdown 代码块围栏（```html ... ``` 或 ``` ... ```）。 */
function stripFence(s: string): string {
    const m = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
    return m ? m[1].trim() : s.trim();
}

/**
 * 组装「续写」的 prompt：取原文末尾 2000 字左右 + 人物/视角/世界观 + 续写走向。
 * 让 AI 自然接续展开，保持人物/文风/视角/世界观一致，直接接续正文（不重复/不加标题）。
 * direction 为空则默认接前文自然写。
 */
export function buildContinueFanwaiPrompt(
    char: CharacterProfile,
    story: FanwaiStory,
    direction?: string,
): string {
    const povText = POV_INSTRUCTION[story.pov] || POV_INSTRUCTION.third;
    const tail = (story.content || '').slice(-2000).trim();
    const dir = (direction || '').trim();

    const charBlock = char.systemPrompt && char.systemPrompt.trim()
        ? `## 人物设定：${char.name}\n- **性格与言行（务必保持）**：${char.systemPrompt.trim()}`
        : `## 人物设定：${char.name}（按前文塑造的人物形象续写）`;

    const worldBlock = story.worldSetting && story.worldSetting.trim()
        ? `\n\n## 世界观 / 指令（保持，且冲突时以指令为准）
${story.worldSetting.trim()}`
        : '';

    const directionBlock = dir
        ? `\n\n## 后续走向（务必按此展开）
${dir}`
        : '\n\n（无指定走向：请顺着前文自然接续展开，不要另起炉灶。）';

    return [
        `你正在续写一篇以「${char.name}」为主角的番外小说。`,
        ``,
        charBlock,
        worldBlock,
        `\n## 视角\n${povText}`,
        `\n## 前文末尾（约 2000 字，从这里接续，不要重复这段）\n${tail}`,
        directionBlock,
        `\n## 续写要求
- **从上面「前文末尾」最后一个字/场景直接自然地接续**，像同一篇小说连续写下去，衔接无缝，不要重复、不要改写、不要概括前文。
- **严格保持**：人物性格与说话方式、文风与叙事语气、视角、世界观与设定、字数密度都跟前文一致。
- **直接输出续写正文**：不要加书名、不要加"续写"之类的标题、不要任何前言后记、不要 markdown 围栏。
- 内容要持续推进剧情（有新的发展/情绪/细节），不是重复总结，也不要在这里强行收尾——留出可以再续写的空间。
- 与人设一致，不 OOC。`,
        ``,
        `现在，从「${char.name}」的番外停下的地方继续写：`,
    ].join('\n');
}

/**
 * 续写纯文字番外：取原文末尾 2000 字 + 续写走向，副 API 生成续写片段（不含原文）。
 * 纯文字专用，不经过 HTML 格式检测。
 * 成功返回 ok + content（续写片段）；失败 reason。
 */
export async function continueFanwai(
    char: CharacterProfile,
    story: FanwaiStory,
    subApi: SubApiConfig,
    direction?: string,
): Promise<FanwaiGenResult> {
    const { baseUrl, apiKey, model } = subApi || {};
    if (!baseUrl || !apiKey || !model) {
        return { ok: false, reason: 'no_sub_api' };
    }
    try {
        const prompt = buildContinueFanwaiPrompt(char, story, direction);
        const content = await callFanwaiLLM(prompt, subApi, {
            temperature: 0.85,
            meta: { appName: '番外续写', charId: char.id, charName: char.name, purpose: '番外续写' },
        });
        if (!content) return { ok: false, reason: 'empty' };
        return { ok: true, content };
    } catch (e) {
        console.error('[Fanwai] Continue failed:', e);
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
