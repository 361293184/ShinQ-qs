/**
 * 自动生图链路的"画面导演"（副 API 判定）——纯逻辑层，无 React/无 UI 文案。
 *
 * 背景：旧的自动发图链路是"前端关键词三档硬判(char/user/joint) + 模板拼 prompt +
 * 可选副 API 润色"。它不认识上下文，导致"角色被要求拍眼前的花田/窗外雨景"时，
 * 依然按默认 char 档把角色+角色锁脸硬塞进画面。
 *
 * 本模块把判定权交给副 API：把「最近聊天 + 角色长期记忆 + 角色/用户外貌与锁脸状态 +
 * 本次画面描述」喂给它，让它先输出结构化画面意图
 * （subjectType: char/user/joint/scenery/object + 是否用各锁脸 + 完整英文 prompt），
 * 前端照做再调生图 API。
 *
 * 约定：
 * - 副 API 未配置 / 超时 / 解析失败 → 调用方回退 buildFallbackExecution（旧三档模板），保证不哑火。
 * - 纯景/物件（scenery/object）强制不使用任何锁脸参考图，并在 prompt 末尾追加"无人物"硬约束。
 */

export type ImageGenSubjectType = 'char' | 'user' | 'joint' | 'scenery' | 'object';
export type ImageGenFallbackMode = 'char' | 'user' | 'joint';

export const IMAGE_SUBJECT_TYPES: readonly ImageGenSubjectType[] = ['char', 'user', 'joint', 'scenery', 'object'];

/** 副 API 判定超时（毫秒） */
export const DIRECTOR_TIMEOUT_MS = 20_000;

/** 判定材料裁剪上限 */
export const DIRECTOR_RECENT_CHAT_TURNS = 20;
export const DIRECTOR_RECENT_TURN_CHARS = 200;
export const DIRECTOR_MEMORY_COUNT = 15;
export const DIRECTOR_MEMORY_CHARS = 200;
export const DIRECTOR_REFINED_COUNT = 10;
export const DIRECTOR_REFINED_CHARS = 300;

/** 锁脸强化指令：有锁脸图时强制 AI 以参考图为准，避免自由发挥改变性别/外貌 */
export const LOCK_FACE_HINT =
  'MUST keep the face, hairstyle, gender, age, ethnicity, body shape and overall look of the reference photo (do not change appearance, do not invent a new person)';

/** 生图 prompt 固定质量尾缀 */
const QUALITY_TAIL = 'masterpiece, best quality, highly detailed';

/** 无人物硬约束（仅纯景/物件场景追加） */
const NO_HUMAN_GUARD = 'No humans, no people, no human faces, no characters anywhere in the image.';

/** 人物正向安全约束尾缀（角色照/用户照/合照场景追加，防畸形/血腥恐怖） */
export const HUMAN_SAFETY_TAIL =
  'anatomically correct, naturally proportioned body, complete healthy limbs, ' +
  'intact hands with five normal fingers, no gore, no blood, no violence, no horror, no disturbing content';

/** 有人物画面统一追加安全尾缀（判重，避免 retry 复用 prompt 时二次拼接） */
function withHumanSafetyTail(prompt: string): string {
  if (/anatomically correct/i.test(prompt || '')) return prompt;
  return `${(prompt || '').trim().replace(/[.\s]+$/, '')}. ${HUMAN_SAFETY_TAIL}`;
}

/** 副 API 的"画面导演"系统提示词 */
export const DIRECTOR_SYSTEM_PROMPT = [
  'You are the visual director of an image-generation feature inside a virtual companion app.',
  'A request to take/send a photo just arrived. Decide what the photo should actually show by reasoning over the recent conversation and the character\'s long-term memory — NOT by always depicting the character.',
  '',
  'When the context is about a place, weather, scenery, plants, an object, food, an animal or a moment the character is seeing/describing, the photo should capture THAT scene/thing, with no person in it.',
  '',
  'Output a SINGLE JSON object with exactly these fields:',
  '{"subjectType":"char"|"user"|"joint"|"scenery"|"object","useCharLock":true|false,"useUserLock":true|false,"prompt":"<final english prompt>"}',
  '',
  'subjectType meaning:',
  '- "char": a photo of the AI character (the companion).',
  '- "user": a photo of the human user (the person chatting).',
  '- "joint": both the user and the character together in one photo.',
  '- "scenery": a place/landscape/weather/urban or natural view — NO people at all.',
  '- "object": an object/plant/food/animal/item/detail shot — NO people at all.',
  '',
  'Lock (reference photo) rules:',
  '- A lock exists only when "Character reference available / User reference available" says yes.',
  '- If subjectType is "scenery" or "object" you MUST set useCharLock=false and useUserLock=false, and the prompt must not describe or imply any person, and must not mention the reference photos.',
  '- If subjectType is "char" and the character reference exists, set useCharLock=true so the face matches; otherwise false.',
  '- Same logic for "user" and for "joint" (use the two locks separately). Never set a lock that does not exist.',
  '',
  'Prompt rules:',
  '- Write the final prompt in English, photographic style, vivid and concrete.',
  '- Weave in details from the scene description AND relevant specifics from the recent conversation / long-term memory (place, season, weather, mood, shared plans...) when they fit.',
  '- If a person is depicted, describe pose/expression/activity and surrounding naturally; use "the person in the reference photo" wording when a lock is enabled.',
  '- If scenery/object, focus on the scenery/object itself (lighting, colors, composition, atmosphere).',
  '- End the prompt with: masterpiece, best quality, highly detailed.',
  '',
  'Output ONLY the JSON object. No explanations, no markdown code fences.',
].join('\n');

/** 判定材料：由 Chat.tsx 在触发时收集（纯数据，无 DOM 依赖） */
export interface ImageGenDirectorInput {
  charName: string;
  /** 角色外貌/锁脸文字描述（可空） */
  charDesc: string;
  /** 用户外貌/锁脸文字描述（可空） */
  userDesc: string;
  /** 本次要画的内容（AI 回复里的"图片- xxx"描述，可空） */
  sceneDesc: string;
  /** 已折叠好的角色形象短句（charDesc || persona 前300字 || 名字） */
  charShort: string;
  /** 已折叠好的用户短句（userDesc || 'a person'） */
  userShort: string;
  /** 角色锁脸参考图 dataURL（无则空串） */
  charLockDataUrl: string;
  /** 用户锁脸参考图 dataURL（无则空串） */
  userLockDataUrl: string;
  /** 最近聊天（时间正序），speaker 已带名字 */
  recentChat: { speaker: string; text: string }[];
  /** 近期记忆行（"[date] summary"），已裁剪 */
  memoryLines: string[];
  /** 长期核心记忆行（"[month] summary"），已裁剪 */
  refinedMemoryLines: string[];
  /** 前端关键词粗分（仅作为提示，不是硬约束） */
  fallbackMode: ImageGenFallbackMode;
}

/** 副 API 返回的结构化画面意图 */
export interface ImageGenDirective {
  subjectType: ImageGenSubjectType;
  useCharLock: boolean;
  useUserLock: boolean;
  /** 最终英文生图 prompt */
  prompt: string;
}

/** 判定结束后的"执行参数"：Chat.tsx 拿它直接调生图 API 与落库 */
export interface ImageGenExecution {
  prompt: string;
  /** 徽标/落库用的主体档位（scenery/object 会落进来） */
  imageGenMode: ImageGenSubjectType;
  lockImageDataUrl: string | null;
  /** 合照双锁脸：0=角色、1=用户 */
  lockImageDataUrls: (string | null | undefined)[] | undefined;
  usedLockFace: boolean;
  useCharLock: boolean;
  useUserLock: boolean;
  /** true=副 API 导演成功；false=回退三档模板 */
  directorUsed: boolean;
}

export interface DirectorRequestConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 默认 DIRECTOR_TIMEOUT_MS */
  timeoutMs?: number;
}

/* ------------------------------------------------------------------ */
/* 判定材料 → 副 API 请求                                              */
/* ------------------------------------------------------------------ */

/** 组装发给副 API 的 user 消息（上下文材料 + 判定指令） */
export function buildDirectorUserMessage(input: ImageGenDirectorInput): string {
  const chatBlock = input.recentChat.length
    ? input.recentChat.map(t => `- ${t.speaker}: ${t.text}`).join('\n')
    : '(no recent conversation)';

  const memoryBlock = input.memoryLines.length
    ? input.memoryLines.map(l => `- ${l}`).join('\n')
    : '(none)';

  const refinedBlock = input.refinedMemoryLines.length
    ? input.refinedMemoryLines.map(l => `- ${l}`).join('\n')
    : '(none)';

  return [
    `Character: ${input.charName}`,
    `Character appearance: ${input.charDesc?.trim() || input.charShort || '(unknown)'}`,
    `User appearance: ${input.userDesc?.trim() || input.userShort || '(unknown)'}`,
    `Scene / what the photo is about: ${input.sceneDesc?.trim() || '(see conversation)'}`,
    `Character reference available: ${input.charLockDataUrl ? 'yes' : 'no'}`,
    `User reference available: ${input.userLockDataUrl ? 'yes' : 'no'}`,
    `Front-end rough guess (use only as a hint, override when context disagrees): ${input.fallbackMode}`,
    '',
    'Recent conversation (newest at bottom):',
    chatBlock,
    '',
    'Character recent memories (daily):',
    memoryBlock,
    '',
    'Character long-term key memories (monthly):',
    refinedBlock,
    '',
    'Decide the subjectType & lock usage based on the above, then write the final English image prompt.',
  ].join('\n');
}

/** 组装副 API 请求体 */
export function buildDirectorChatBody(model: string, input: ImageGenDirectorInput): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
      { role: 'user', content: buildDirectorUserMessage(input) },
    ],
    max_tokens: 500,
    temperature: 0.7,
  };
}

/* ------------------------------------------------------------------ */
/* 响应解析 + 校正                                                     */
/* ------------------------------------------------------------------ */

/** 从副 API 回复文本中容错提取 JSON（支持 ```json 围栏与首尾噪声） */
export function extractDirectiveFromResponse(raw: string): ImageGenDirective | null {
  if (!raw || !raw.trim()) return null;
  const clean = raw
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(clean.slice(start, end + 1));
    const subjectType = obj?.subjectType;
    const prompt = typeof obj?.prompt === 'string' ? obj.prompt.trim() : '';
    if (!IMAGE_SUBJECT_TYPES.includes(subjectType)) return null;
    if (!prompt) return null;
    return {
      subjectType,
      useCharLock: !!obj?.useCharLock,
      useUserLock: !!obj?.useUserLock,
      prompt,
    };
  } catch {
    return null;
  }
}

/** 校正副 API 意图：锁脸只允许引用"真实存在"的参考图；纯景/物件强制无锁脸 */
export function coerceDirective(input: ImageGenDirectorInput, dir: ImageGenDirective): ImageGenDirective | null {
  if (!dir) return null;
  if (!IMAGE_SUBJECT_TYPES.includes(dir.subjectType)) return null;
  if (typeof dir.prompt !== 'string' || !dir.prompt.trim()) return null;

  const hasCharLock = !!input.charLockDataUrl;
  const hasUserLock = !!input.userLockDataUrl;
  let { useCharLock, useUserLock } = dir;
  const subjectType = dir.subjectType;

  if (subjectType === 'scenery' || subjectType === 'object') {
    useCharLock = false;
    useUserLock = false;
  } else if (subjectType === 'char') {
    useUserLock = false;
    if (!hasCharLock) useCharLock = false;
  } else if (subjectType === 'user') {
    useCharLock = false;
    if (!hasUserLock) useUserLock = false;
  } else {
    // joint
    if (!hasCharLock) useCharLock = false;
    if (!hasUserLock) useUserLock = false;
  }

  return { subjectType, useCharLock, useUserLock, prompt: dir.prompt.trim() };
}

/* ------------------------------------------------------------------ */
/* 意图 → 执行参数                                                     */
/* ------------------------------------------------------------------ */

/** 按校正后的副 API 意图生成执行参数（纯景/物件追加"无人物"硬约束） */
export function resolveExecutionFromDirective(input: ImageGenDirectorInput, directive: ImageGenDirective): ImageGenExecution {
  const subj = directive.subjectType;
  const isSceneryLike = subj === 'scenery' || subj === 'object';

  const useCharLock = directive.useCharLock && !!input.charLockDataUrl && !isSceneryLike;
  const useUserLock = directive.useUserLock && !!input.userLockDataUrl && !isSceneryLike;

  let prompt = directive.prompt || '';
  let lockImageDataUrl: string | null = null;
  let lockImageDataUrls: (string | null | undefined)[] | undefined;

  if (isSceneryLike) {
    // 仅首次追加无人物硬约束；重试复用的 prompt 已含该句时不再重复拼接
    if (!/No humans?|no people|no human faces/i.test(prompt)) {
      prompt = `${prompt.replace(/[.\s]+$/, '')}. ${NO_HUMAN_GUARD}`;
    }
  } else if (subj === 'char') {
    if (useCharLock) lockImageDataUrl = input.charLockDataUrl;
  } else if (subj === 'user') {
    if (useUserLock) lockImageDataUrl = input.userLockDataUrl;
  } else if (subj === 'joint') {
    if (useCharLock || useUserLock) {
      lockImageDataUrl = input.charLockDataUrl || input.userLockDataUrl || null;
      lockImageDataUrls = [input.charLockDataUrl, input.userLockDataUrl];
    }
  }
  // 有人物画面（char/user/joint）：追加"解剖正确/肢体完整/无血腥恐怖"正向约束。
  // 判重处理与上方无人物硬约束一致：retry 复用已含尾缀的 prompt 时不二次拼接。
  if (!isSceneryLike) prompt = withHumanSafetyTail(prompt);

  return {
    prompt,
    imageGenMode: subj,
    lockImageDataUrl,
    lockImageDataUrls,
    usedLockFace: subj === 'char' ? useCharLock : subj === 'user' ? useUserLock : useCharLock || useUserLock,
    useCharLock,
    useUserLock,
    directorUsed: true,
  };
}

/**
 * 回退三档模板（旧链路逻辑，从 Chat.tsx 抽入保持行为一致）。
 * 副 API 未配置 / 失败 / 无上下文可判定时使用，保证"没配副 API 也能发图"不退化为哑火。
 */
export function buildFallbackExecution(input: ImageGenDirectorInput): ImageGenExecution {
  const mode = input.fallbackMode;
  const charLock = input.charLockDataUrl;
  const userLock = input.userLockDataUrl;
  const scene = input.sceneDesc?.trim();

  let prompt: string;
  let lockImageDataUrl: string | null = null;
  let lockImageDataUrls: (string | null | undefined)[] | undefined;
  let useCharLock = false;
  let useUserLock = false;

  if (mode === 'user') {
    const parts = [input.userShort || 'a person'];
    if (userLock) parts.push(LOCK_FACE_HINT);
    if (scene) parts.push(scene);
    parts.push(QUALITY_TAIL);
    prompt = parts.filter(Boolean).join(', ');
    lockImageDataUrl = userLock || null;
    useUserLock = !!userLock;
  } else if (mode === 'joint') {
    // 健壮版：空描述时用"参考图中的人物"代替，有锁脸优先
    const _userPart = input.userDesc?.trim() || (userLock ? 'the exact person shown in the reference photo' : 'a person');
    const _charPart = input.charDesc?.trim() || (charLock ? 'the exact character shown in the reference photo' : 'a character');
    const parts = [
      'two people together in the photo',
      'the first person is the character in the first reference image, the second person is the person in the second reference image',
      _userPart,
      'and',
      _charPart,
    ];
    if (userLock) parts.push(LOCK_FACE_HINT);
    if (charLock) parts.push(LOCK_FACE_HINT);
    if (scene) parts.push(scene);
    parts.push('couple photo, intimate and natural pose');
    parts.push(QUALITY_TAIL);
    prompt = parts.filter(Boolean).join(', ');
    lockImageDataUrl = charLock || userLock || null; // 兼容旧字段
    lockImageDataUrls = [charLock, userLock]; // 两张都传：0=角色、1=用户
    useCharLock = !!charLock;
    useUserLock = !!userLock;
  } else {
    // 默认 char 模式
    const parts = [input.charShort || 'a character'];
    if (charLock) parts.push(LOCK_FACE_HINT);
    if (scene) parts.push(scene);
    parts.push(QUALITY_TAIL);
    prompt = parts.filter(Boolean).join(', ');
    lockImageDataUrl = charLock || null;
    useCharLock = !!charLock;
  }

  // 回退档都是人物画面：同样追加"解剖正确/无血腥恐怖"安全尾缀（与 resolve 行为一致）
  return {
    prompt: withHumanSafetyTail(prompt),
    imageGenMode: mode,
    lockImageDataUrl,
    lockImageDataUrls,
    usedLockFace: useCharLock || useUserLock,
    useCharLock,
    useUserLock,
    directorUsed: false,
  };
}

/* ------------------------------------------------------------------ */
/* 副 API 调用（超时保护，失败返回 null 由调用方降级）                   */
/* ------------------------------------------------------------------ */

/**
 * 调用副 API 完成一次"画面导演"判定。
 * 超时 / HTTP 失败 / 内容非 JSON / 校正不通过 → 返回 null（调用方回退三档模板）。
 */
export async function requestDirectorDirective(
  config: DirectorRequestConfig,
  input: ImageGenDirectorInput,
): Promise<ImageGenDirective | null> {
  if (!config.baseUrl || !config.apiKey || !config.model) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs ?? DIRECTOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(buildDirectorChatBody(config.model, input)),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return null;
    const directive = extractDirectiveFromResponse(raw);
    return directive ? coerceDirective(input, directive) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
