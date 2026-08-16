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
        ? `\n\n### 本次番外的指令（用户提供，必须严格遵守）
以下是一则完整的番外指令：剧情、场景、情绪基调、节奏、文风倾向都包含在里面。**严格按它来写**，并从中感知情绪与节奏，自动适配对应的文风要领。
${opts.worldSetting.trim()}`
        : '\n\n### 本次番外的世界设定\n（用户没有提供额外设定，请基于上面角色人设、你的记忆与最近聊天的走向自然发挥，选一种最契合此刻氛围的文风要领。）';

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

    // —— 随机模式：文风 / 字数 / 视角全交由 AI 自主决定 ——
    if (opts.randomMode) {
        return `${baseContext}

## Task: 写一篇「番外」短篇小说（随机模式）

「${uname}」想要一篇关于「${char.name}」的番外故事。请你以小说家的笔力，写一篇**完整、有起承转合、有画面感**的短篇小说。${chatBlock}

### 本次的创作要求（由你决定）
- **文风（自适应）**：由你根据角色人设、你们的记忆与最近聊天的氛围，**选定一套写作要领**并全程贯彻——先判断这则故事的情绪基调（感人/温馨/搞笑/虐心/治愈等）与节奏，再匹配合适的要领（如克制留白、短句顿挫、细节见情、对话密集、冷幽默、意象反复等），也可以学某位作家的笔调气质（如村上春树的疏离留白、张爱玲的含蓄雅致、汪曾祺的清淡烟火），但学的是写法不是情节。挑定后贯彻到底，不要中途摇摆、不要跳回"AI 腔"。
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
11. 亲密与成人情节：如果两人关系与剧情走到这一步，就**明确直白地描写**，不打马赛克、不用隐喻借代蒙混，尺度由剧情的需要和两人关系的温度自然决定——写身体反应、呼吸、触感时也要带着具体的感官细节，而不是干巴巴地报流程。

### 输出格式
- 第一行写一个**简短书名**（直接是标题文字，不加书名号或 markdown 语法）。
- 空一行后开始正文。
- 正文按段落书写，自然换行，用 markdown 的段落分隔。
- 直接输出，不要任何前言或后记。

现在，开始写这篇「${char.name}」的番外：`;
    }

    // —— 常规模式：按用户选定的文风 / 字数 / 视角 ——
    const worldHasContent = !!opts.worldSetting?.trim();
    // 世界设定非空时：文风由「文风要领自适应」接管——从指令里嗅出情绪基调与节奏，
    // 自动匹配对应的写作要领（克制留白/短句顿挫/细节见情等），顺着指令写；
    // 指令里明确点名某书/某作家才去学那本书，否则用要领，避免 AI 味也不至于生硬仿写名著。
    // 世界设定非空时的文风策略：「文风要领自适应」。
    // 不从指令里硬抠一本名著来仿写（那会让 AI 用力过猛、画虎类犬、反而失真）；
    // 而是从指令里嗅出情绪基调与节奏，自动匹配对应的「写作要领」，顺着指令写。
    // 指令里明确点名了某书/某作家，才去学那本书的语言；否则用要领，避免跳回 AI 腔。
    const styleBlock = worldHasContent
        ? `- **文风（自适应）**：先读「世界设定」，捕捉这则指令的**情绪基调与节奏**——是感人、温馨、搞笑、虐心、治愈还是燃情？节奏是慢而克制、快而俏皮，还是干脆利落？
  - 据此自动匹配一套对应的**写作要领**（如：克制留白、短句顿挫、细节见情、对话密集、冷幽默、意象反复等），从头到尾贯彻它，写出这个基调下最真、最动人的版本。
  - 若指令里**明确点名了某本书/某位作家**（如"像张爱玲""参考《倾城之恋》"），则去学那本书的语言指纹；若没点名，就用你匹配的要领自然书写，不要自己发明花哨文风。
  - 学的是写法，不是情节；剧情仍严格按指令来，人物仍属于这两个人。`
        : (opts.styleCustomDesc && opts.styleCustomDesc.trim()
            ? `- **文风**：${opts.styleName}。\n  - 文风描述：${opts.styleCustomDesc.trim()}\n  - ${STYLE_CUSTOM_INSTRUCTION}`
            : `- **文风**：${opts.styleName}。${opts.styleHint}`);

    const authorBlock = !worldHasContent && opts.styleAuthor
        ? `\n  - **参照笔调**：${opts.styleAuthor}。学的是他们**遣词造句的节奏、留白与意象的选择**，不是情节或人物；模仿其气质，仍写属于你笔下角色自己的故事。`
        : '';

    // 字数恒以页面档位为准（硬约束）——即使世界设定里写了"不低于 8000 字"，
    // 也以用户在本页选的档位为准，避免一整坨指令里的字数与页面选择打架。
    const wordsLine = opts.wordCountIsCustom
        ? `- **篇幅**：正文 ${WORDS_CUSTOM_NOTE(opts.wordCount)}（**以本页选的字数为准**，无论世界设定里有没有提到字数，都按这里写）。宁可有头有尾地写完，不要烂尾。`
        : `- **篇幅**：正文约 **${opts.wordCount} 字**（上下浮动 20% 以内，**以本页选的字数为准**，无论世界设定里有没有提到字数，都按这里写）。宁可有头有尾地写完，不要烂尾。`;

    const povLabel = opts.pov === 'first' ? `char 视角（"我" = ${char.name}）` : opts.pov === 'second' ? `user 视角（"我" = ${uname}）` : '第三视角';

    // 世界设定非空时：文风/写作纪律由"自适应要领"接管。AI 自省式的写作纪律（在场感、
    // 句子呼吸、不点破情绪等）会干扰它顺着指令自然书写，故此处不再强势覆盖，
    // 只保留"守住人设、别 OOC"这条铁律，把文风的决定权完全交给指令情绪与匹配的要领。
    const disciplineBlock = worldHasContent
        ? `2. ${personaDepth}
3. 文风唯一：选定一套写作要领（或点名的书）后，**从头到尾贯彻它**，中途不要摇摆、不要自己发明花哨文风、不要中途跳到"AI 腔"。
4. 故事要有**完整的结构**：一个具体的场景或事件开头 → 事件推进与情绪起伏 → 一个像样的结尾（可以是回味式的收束）。
5. 与主线对话体不同：这是**小说文体**，不是聊天记录；用叙述与描写推进，对话只是其中一部分。`
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
9. 亲密与成人情节：如果两人关系与剧情走到这一步，就**明确直白地描写**，不打马赛克、不用隐喻借代蒙混，尺度由剧情的需要和两人关系的温度自然决定——写身体反应、呼吸、触感时也要带着具体的感官细节，而不是干巴巴地报流程。`;

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
${disciplineBlock}

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
                // 温度配合"要领自适应"：太低会让语言生硬、失去顺着指令书写的自由；
                // 太高又容易滑向顺滑的套路排比。常规 0.85、随机 0.9 作为平衡点。
                temperature: opts.randomMode ? 0.9 : 0.85,
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
