/**
 * 自动生图的"执行构造"——主模型描述驱动版。
 *
 * 判定哲学（副 API"画面导演"已退役，不再额外调用）：
 * - 聊天主模型在生成「图片- 描述」时，已经基于完整上下文决定了要不要发、画面里是谁。
 *   不需要再调一次副 API 去"解读"主模型刚写好的描述（那是二道贩子：多花钱、会超时、
 *   还会因为裁剪上下文而判错）。
 * - 前端唯一需要做的判断是：**描述里谁出镜 → 决定给生图 API 传哪张锁脸参考图**。
 *   - 角色本人出镜（描述里"我"作画面主语 / 自拍 / 身体部位 / 穿搭）→ 传角色锁脸图
 *   - 用户与角色一起（描述含"你和我 / 咱俩 / 合照"）→ 双锁脸
 *   - 用户本人出镜（描述以"你"为被拍对象）→ 传用户锁脸图
 *   - 纯景 / 物件（描述里没有任何人）→ 不传锁脸图 + 追加"无人物"硬约束
 * - 人物画面统一追加"解剖正确 / 肢体完整 / 无血腥"正向约束。
 */

export type ImageGenSubjectType = 'char' | 'user' | 'joint' | 'scenery' | 'object';

export const IMAGE_SUBJECT_TYPES: readonly ImageGenSubjectType[] = ['char', 'user', 'joint', 'scenery', 'object'];

/** 锁脸强化指令：有锁脸图时强制 AI 以参考图为准，避免自由发挥改变性别/外貌 */
export const LOCK_FACE_HINT =
  'MUST keep the face, hairstyle, gender, age, ethnicity, body shape and overall look of the reference photo (do not change appearance, do not invent a new person)';

/** 生图 prompt 固定质量尾缀 */
const QUALITY_TAIL = 'masterpiece, best quality, highly detailed';

/** 无人物硬约束（仅纯景/物件场景追加） */
const NO_HUMAN_GUARD = 'No humans, no people, no human faces, no characters anywhere in the image.';

/** 人物正向安全约束尾缀（角色照/用户照/合照场景追加，防畸形/血腥恐怖） */
const HUMAN_SAFETY_TAIL =
  'anatomically correct, naturally proportioned body, complete healthy limbs, ' +
  'intact hands with five normal fingers, no gore, no blood, no violence, no horror, no disturbing content';

/** 有人物画面统一追加安全尾缀（判重，避免 retry 复用 prompt 时二次拼接） */
function withHumanSafetyTail(prompt: string): string {
  if (/anatomically correct/i.test(prompt || '')) return prompt;
  return `${(prompt || '').trim().replace(/[.\s]+$/, '')}. ${HUMAN_SAFETY_TAIL}`;
}

/* ------------------------------------------------------------------ */
/* 出镜判定：从主模型自己写的画面描述里读"谁在画面"                     */
/* ------------------------------------------------------------------ */

/**
 * 描述里"角色本人出镜"的信号。主模型按 prompt 约定：角色在画面就用"我"作画面主语、
 * 或描述自拍/身体部位/穿搭造型。仅凭所属格（"我的房间/我的书"）不判出镜。
 */
const CHAR_IN_FRAME_PATTERNS = [
  /(?:我|自己|本人)(?:在|站|坐|躺|蹲|靠|穿|戴|披|露|笑|看镜头|比|举|抱|回眸|侧身|走|跳|吃|喝|淋|晒)/,
  /自拍|他拍|镜中|拍下了我|拍了一张我|出镜/,
  /我的(?:脸|头|肩|锁骨|身材|侧脸|正脸|背影|腿|腰|手指|手|脚|脚踝|发型|素颜|妆|穿搭|打扮|look|状态|样子)/,
  /(?:锁骨|侧脸|背影|素颜|洗完头|洗了澡|洗完澡|今天的穿搭|这身穿搭|这身look|没化妆|只涂了|还挂着水珠)/,
];

/** 描述里"用户与角色同框"的信号（合照/并肩/依偎等双人表达） */
const JOINT_IN_FRAME_PATTERNS = [
  /你和我|你与我|我俩|咱俩|我们俩|我们两个|两个人|双人|合照|合影|并肩|依偎|一起出镜|都(?:在|入|出)镜/,
];

/** 描述里"用户本人是被拍对象"的信号（角色拍了一张用户的照片）。
 *  只认"拍你/你在画面里/你的特写"这些把用户当主体的表达，避免误伤"你的房间"这类所属。 */
const USER_IN_FRAME_PATTERNS = [
  /拍(?:了|下|到)?(?:一张)?(?:的)?你/,
  /你(?:在|站|坐|躺|蹲|靠|穿|戴|披|露|笑|看镜头|回眸|侧身|走|跳)/,
  /你的(?:自拍|样子|穿搭|锁骨|侧脸|背影|正脸)/,
  /这张(?:是|拍的是)你/,
];

/** 物件特写类画面名词（纯景 vs 物件只影响徽标与文案，都不传锁脸图） */
const OBJECT_DESC_NOUNS = [
  '饭', '菜', '汤', '面', '饺子', '火锅', '烧烤', '咖啡', '奶茶', '甜点', '蛋糕', '水果', '外卖',
  '鸡翅', '排骨', '炒饭', '蛋挞', '披萨', '汉堡', '包子', '粥', '猫', '狗', '宠物', '鱼', '花',
  '绿植', '植物', '盆栽', '手办', '书', '快递', '礼物', '新买的', '鞋', '球鞋', '工牌',
];

/** 纯景画面描述里的场景词（供"无人物"时区分徽标用） */
const SCENERY_DESC_NOUNS = [
  '阳台', '窗', '窗户', '窗外', '屋里', '家里', '房间', '卧室', '客厅', '厨房', '书房', '天空', '阳光', '日落',
  '日出', '晚霞', '街道', '马路', '城市', '风景', '外面', '楼下', '公园', '花园', '院子', '天台',
  '海边', '湖', '山', '树林', '雨天', '下雨', '雪', '微风', '晾衣', '绿植', '植物', '盆栽',
];

/** 从主模型自己写的画面描述判断主体档位。 */
export function classifySceneSubject(sceneDesc: string): ImageGenSubjectType {
  const scene = (sceneDesc || '').trim();
  if (!scene) return 'char'; // 无描述默认保守为角色照（几乎不会发生）

  // 1) 双人同框（优先于单角色，因为"你和我"同时含两方）
  if (JOINT_IN_FRAME_PATTERNS.some(re => re.test(scene))) return 'joint';

  // 2) 用户本人是被拍对象（且不含角色自己出镜）
  if (USER_IN_FRAME_PATTERNS.some(re => re.test(scene))) return 'user';

  // 3) 角色自己出镜
  if (CHAR_IN_FRAME_PATTERNS.some(re => re.test(scene))) return 'char';

  // 4) 没有任何人 → 先看场景词再看物件词（都无锁脸）。场景词优先：
  //    避免"书房/阳台+绿植"这类描述因命中物件词(书/绿植)被误标成 object。
  if (SCENERY_DESC_NOUNS.some(n => scene.includes(n))) return 'scenery';
  if (OBJECT_DESC_NOUNS.some(n => scene.includes(n))) return 'object';
  return 'scenery'; // 无人且无明确词 → 当纯景处理（无锁脸、不加人）
}

/* ------------------------------------------------------------------ */
/* 判定结果 → 执行参数                                                 */
/* ------------------------------------------------------------------ */

/** 执行参数：Chat.tsx 拿它直接调生图 API 与落库 */
export interface ImageGenExecution {
  prompt: string;
  /** 徽标/落库用的主体档位 */
  imageGenMode: ImageGenSubjectType;
  lockImageDataUrl: string | null;
  /** 合照双锁脸：0=角色、1=用户 */
  lockImageDataUrls: (string | null | undefined)[] | undefined;
  usedLockFace: boolean;
  useCharLock: boolean;
  useUserLock: boolean;
}

export interface ImageGenInput {
  /** 角色名（日志/占位用） */
  charName: string;
  /** 角色外貌/锁脸文字描述（可空） */
  charDesc: string;
  /** 用户外貌/锁脸文字描述（可空） */
  userDesc: string;
  /** 主模型写的画面描述（"图片- xxx" 的内容） */
  sceneDesc: string;
  /** 角色锁脸参考图 dataURL（无则空串） */
  charLockDataUrl: string;
  /** 用户锁脸参考图 dataURL（无则空串） */
  userLockDataUrl: string;
}

/** 由主体档位 + 描述拼出最终英文生图 prompt（不锁脸 / 无人物约束都在这层定）。 */
export function buildExecution(input: ImageGenInput): ImageGenExecution {
  const subj = classifySceneSubject(input.sceneDesc);
  const charLock = input.charLockDataUrl || '';
  const userLock = input.userLockDataUrl || '';
  const scene = (input.sceneDesc || '').trim();
  const isSceneryLike = subj === 'scenery' || subj === 'object';

  let prompt: string;
  let lockImageDataUrl: string | null = null;
  let lockImageDataUrls: (string | null | undefined)[] | undefined;
  let useCharLock = false;
  let useUserLock = false;

  if (subj === 'scenery' || subj === 'object') {
    const parts = [scene || 'a scenic view'];
    parts.push(NO_HUMAN_GUARD);
    parts.push(QUALITY_TAIL);
    prompt = parts.filter(Boolean).join(', ');
  } else if (subj === 'user') {
    const parts = [input.userDesc?.trim() || 'a person'];
    if (userLock) parts.push(LOCK_FACE_HINT);
    if (scene) parts.push(scene);
    parts.push(QUALITY_TAIL);
    prompt = parts.filter(Boolean).join(', ');
    lockImageDataUrl = userLock || null;
    useUserLock = !!userLock;
    prompt = withHumanSafetyTail(prompt);
  } else if (subj === 'joint') {
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
    prompt = withHumanSafetyTail(prompt);
  } else {
    // char：角色本人出镜
    const parts = [input.charDesc?.trim() || 'a character'];
    if (charLock) parts.push(LOCK_FACE_HINT);
    if (scene) parts.push(scene);
    parts.push(QUALITY_TAIL);
    prompt = parts.filter(Boolean).join(', ');
    lockImageDataUrl = charLock || null;
    useCharLock = !!charLock;
    prompt = withHumanSafetyTail(prompt);
  }

  return {
    prompt,
    imageGenMode: subj,
    lockImageDataUrl,
    lockImageDataUrls,
    usedLockFace: useCharLock || useUserLock,
    useCharLock,
    useUserLock,
  };
}

/** 复用已有 prompt 与锁脸意图（失败占位卡点「重试」用，避免重判导致图意漂移）。 */
export function buildExecutionFromPreset(
  input: ImageGenInput,
  preset: { subjectType: ImageGenSubjectType; useCharLock: boolean; useUserLock: boolean; finalPrompt: string },
): ImageGenExecution {
  const subj = preset.subjectType;
  const isSceneryLike = subj === 'scenery' || subj === 'object';

  let prompt = preset.finalPrompt || '';
  let lockImageDataUrl: string | null = null;
  let lockImageDataUrls: (string | null | undefined)[] | undefined;
  const useCharLock = !isSceneryLike && preset.useCharLock && !!input.charLockDataUrl;
  const useUserLock = !isSceneryLike && preset.useUserLock && !!input.userLockDataUrl;

  if (isSceneryLike) {
    if (!/No humans?|no people|no human faces/i.test(prompt)) {
      prompt = `${prompt.replace(/[.\s]+$/, '')}. ${NO_HUMAN_GUARD}`;
    }
  } else if (subj === 'char') {
    if (useCharLock) lockImageDataUrl = input.charLockDataUrl || null;
  } else if (subj === 'user') {
    if (useUserLock) lockImageDataUrl = input.userLockDataUrl || null;
  } else if (subj === 'joint') {
    if (useCharLock || useUserLock) {
      lockImageDataUrl = input.charLockDataUrl || input.userLockDataUrl || null;
      lockImageDataUrls = [input.charLockDataUrl, input.userLockDataUrl];
    }
  }

  return {
    prompt,
    imageGenMode: subj,
    lockImageDataUrl,
    lockImageDataUrls,
    usedLockFace: useCharLock || useUserLock,
    useCharLock,
    useUserLock,
  };
}
