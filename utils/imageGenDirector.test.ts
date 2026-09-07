import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildDirectorChatBody,
  buildDirectorUserMessage,
  buildFallbackExecution,
  coerceDirective,
  collectShotIntents,
  extractDirectiveFromResponse,
  guardPersonSubject,
  requestDirectorDirective,
  resolveExecutionFromDirective,
  textRequestsJointShot,
  textRequestsUserShot,
  type ImageGenDirective,
  type ImageGenDirectorInput,
} from './imageGenDirector';

function makeInput(overrides: Partial<ImageGenDirectorInput> = {}): ImageGenDirectorInput {
  return {
    charName: '小樱',
    userName: '我',
    charDesc: '黑发、温柔、穿白裙',
    userDesc: '圆脸戴眼镜',
    sceneDesc: '窗外的雨景，雨水打在玻璃上',
    charShort: '小樱，黑发温柔的女孩',
    userShort: '圆脸戴眼镜的人',
    charLockDataUrl: '',
    userLockDataUrl: '',
    recentChat: [
      { speaker: '我', isUser: true, text: '你那边下雨了吗' },
      { speaker: '小樱', isUser: false, text: '下了，雨滴顺着玻璃滑下来' },
    ],
    memoryLines: ['[2026-09-01] 用户说过想一起去山里看雪'],
    refinedMemoryLines: ['[2026-08] 两人约定今年冬天一起去看海'],
    fallbackMode: 'char',
    ...overrides,
  };
}

const okDirective: ImageGenDirective = {
  subjectType: 'scenery',
  useCharLock: true,
  useUserLock: true,
  prompt: 'rain drops sliding down a window pane at dusk, cozy warm light inside',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractDirectiveFromResponse', () => {
  it('parses plain JSON', () => {
    const dir = extractDirectiveFromResponse(JSON.stringify(okDirective));
    expect(dir?.subjectType).toBe('scenery');
    expect(dir?.useCharLock).toBe(true); // 解析层不纠正锁脸，原始值保留由 coerce 校正
    expect(dir?.prompt).toContain('window pane');
  });

  it('strips ```json fences and surrounding noise', () => {
    const raw = 'Sure!\n```json\n' + JSON.stringify(okDirective) + '\n```\nDone';
    const dir = extractDirectiveFromResponse(raw);
    expect(dir?.subjectType).toBe('scenery');
  });

  it('returns null for garbage / missing fields / unknown subject', () => {
    expect(extractDirectiveFromResponse('not json at all')).toBeNull();
    expect(extractDirectiveFromResponse('{"foo":1}')).toBeNull();
    expect(extractDirectiveFromResponse(JSON.stringify({ subjectType: 'alien', useCharLock: false, useUserLock: false, prompt: 'x' }))).toBeNull();
    expect(extractDirectiveFromResponse(JSON.stringify({ ...okDirective, prompt: '' }))).toBeNull();
  });
});

describe('coerceDirective', () => {
  it('forces both locks off for scenery/object even if model asked for them', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user' });
    const dir = coerceDirective(input, { ...okDirective, useCharLock: true, useUserLock: true });
    expect(dir?.useCharLock).toBe(false);
    expect(dir?.useUserLock).toBe(false);
  });

  it('turns off char lock when no character reference exists', () => {
    const input = makeInput({ charLockDataUrl: '', userLockDataUrl: 'data:user' });
    const dir = coerceDirective(input, { subjectType: 'char', useCharLock: true, useUserLock: true, prompt: 'portrait of her' });
    expect(dir?.useCharLock).toBe(false);
    expect(dir?.useUserLock).toBe(false);
  });

  it('keeps valid char lock and drops the unrelated user lock', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user' });
    const dir = coerceDirective(input, { subjectType: 'char', useCharLock: true, useUserLock: true, prompt: 'portrait' });
    expect(dir?.useCharLock).toBe(true);
    expect(dir?.useUserLock).toBe(false);
  });

  it('nullifies joint locks that do not exist', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: '' });
    const dir = coerceDirective(input, { subjectType: 'joint', useCharLock: true, useUserLock: true, prompt: 'couple' });
    expect(dir?.useCharLock).toBe(true);
    expect(dir?.useUserLock).toBe(false);
  });
});

describe('resolveExecutionFromDirective', () => {
  it('scenery/object: no lock image at all and prompt gets a no-human guard', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user' });
    const ex = resolveExecutionFromDirective(input, { ...okDirective, useCharLock: true, useUserLock: true });
    expect(ex.lockImageDataUrl).toBeNull();
    expect(ex.lockImageDataUrls).toBeUndefined();
    expect(ex.usedLockFace).toBe(false);
    expect(ex.prompt).toContain('No humans, no people');
    expect(ex.imageGenMode).toBe('scenery');
    expect(ex.directorUsed).toBe(true);
  });

  it('scenery re-resolution (retry reuse) does not append the no-human guard twice', () => {
    const input = makeInput();
    const first = resolveExecutionFromDirective(input, { ...okDirective, useCharLock: false, useUserLock: false });
    const second = resolveExecutionFromDirective(input, { ...okDirective, prompt: first.prompt, useCharLock: false, useUserLock: false });
    expect(second.prompt).toBe(first.prompt);
    expect(second.prompt.match(/No humans, no people/g)).toHaveLength(1);
  });

  it('char with lock passes the character reference as single lock', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: '' });
    const ex = resolveExecutionFromDirective(input, { subjectType: 'char', useCharLock: true, useUserLock: false, prompt: 'portrait of the girl' });
    expect(ex.lockImageDataUrl).toBe('data:char');
    expect(ex.lockImageDataUrls).toBeUndefined();
    expect(ex.usedLockFace).toBe(true);
    expect(ex.imageGenMode).toBe('char');
  });

  it('joint with both locks maps to the dual-array layout (0=char, 1=user)', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user' });
    const ex = resolveExecutionFromDirective(input, { subjectType: 'joint', useCharLock: true, useUserLock: true, prompt: 'two people together' });
    expect(ex.lockImageDataUrls).toEqual(['data:char', 'data:user']);
    expect(ex.lockImageDataUrl).toBe('data:char');
    expect(ex.usedLockFace).toBe(true);
  });

  it('user without lock still produces a portrait prompt but no reference image', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: '' });
    const ex = resolveExecutionFromDirective(input, { subjectType: 'user', useCharLock: false, useUserLock: true, prompt: 'selfie of the user' });
    expect(ex.lockImageDataUrl).toBeNull();
    expect(ex.usedLockFace).toBe(false);
  });
});

describe('buildFallbackExecution', () => {
  it('char default keeps legacy behavior (lock hint + lock image when available)', () => {
    const input = makeInput({ charLockDataUrl: 'data:char' });
    const ex = buildFallbackExecution(input);
    expect(ex.imageGenMode).toBe('char');
    expect(ex.lockImageDataUrl).toBe('data:char');
    expect(ex.useCharLock).toBe(true);
    expect(ex.directorUsed).toBe(false);
    expect(ex.prompt).toContain('小樱');
    expect(ex.prompt).toContain('MUST keep the face');
    expect(ex.prompt).toContain('窗外的雨景');
  });

  it('user mode builds user-led prompt with user lock only', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user', fallbackMode: 'user' });
    const ex = buildFallbackExecution(input);
    expect(ex.imageGenMode).toBe('user');
    expect(ex.lockImageDataUrl).toBe('data:user');
    expect(ex.useUserLock).toBe(true);
    expect(ex.useCharLock).toBe(false);
  });

  it('joint mode keeps dual lock arrays even when one side missing', () => {
    const input = makeInput({ charLockDataUrl: '', userLockDataUrl: 'data:user', fallbackMode: 'joint' });
    const ex = buildFallbackExecution(input);
    expect(ex.lockImageDataUrls).toEqual(['', 'data:user']);
    expect(ex.lockImageDataUrl).toBe('data:user');
    expect(ex.usedLockFace).toBe(true);
  });
});

describe('human safety tail on person shots', () => {
  const charDir: ImageGenDirective = { subjectType: 'char', useCharLock: true, useUserLock: false, prompt: 'portrait of the girl in a park' };
  const userDir: ImageGenDirective = { subjectType: 'user', useCharLock: false, useUserLock: true, prompt: 'selfie of the user' };

  it('appends the anatomically-correct tail exactly once for char/user shots', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user' });
    const charEx = resolveExecutionFromDirective(input, charDir);
    const userEx = resolveExecutionFromDirective(input, userDir);
    for (const ex of [charEx, userEx]) {
      expect(ex.prompt).toContain('anatomically correct');
      expect(ex.prompt).toContain('no gore');
      expect(ex.prompt.match(/anatomically correct/g)).toHaveLength(1);
    }
  });

  it('skips the tail for scenery/object (still keeps the no-human guard)', () => {
    const input = makeInput({ charLockDataUrl: 'data:char' });
    const scenery = resolveExecutionFromDirective(input, { subjectType: 'scenery', useCharLock: false, useUserLock: false, prompt: 'a field of sunflowers at sunset' });
    const obj = resolveExecutionFromDirective(input, { subjectType: 'object', useCharLock: false, useUserLock: false, prompt: 'a steaming cup of coffee on a rainy windowsill' });
    expect(scenery.prompt).not.toContain('anatomically correct');
    expect(scenery.prompt).toContain('No humans');
    expect(obj.prompt).not.toContain('anatomically correct');
  });

  it('retry reuse (second resolve) does not duplicate the tail', () => {
    const input = makeInput({ charLockDataUrl: 'data:char' });
    const once = resolveExecutionFromDirective(input, charDir);
    const twice = resolveExecutionFromDirective(input, { ...charDir, prompt: once.prompt });
    expect(twice.prompt).toBe(once.prompt);
    expect(twice.prompt.match(/anatomically correct/g)).toHaveLength(1);
  });

  it('covers all three fallback templates too', () => {
    for (const fallbackMode of ['char', 'user', 'joint'] as const) {
      const ex = buildFallbackExecution(makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user', fallbackMode }));
      expect(ex.prompt).toContain('anatomically correct');
      expect(ex.prompt).toContain('no gore');
      expect(ex.prompt.match(/anatomically correct/g)).toHaveLength(1);
    }
  });
});

describe('buildDirectorUserMessage / buildDirectorChatBody', () => {
  it('assembles context, memories and lock availability into the message', () => {
    const input = makeInput({ charLockDataUrl: 'data:char' });
    const msg = buildDirectorUserMessage(input);
    expect(msg).toContain('Character (AI companion): 小樱');
    expect(msg).toContain('User (human chatting): 我');
    expect(msg).toContain('窗外的雨景');
    expect(msg).toContain('Character reference available: yes');
    expect(msg).toContain('User reference available: no');
    expect(msg).toContain('[User 我]: 你那边下雨了吗');
    expect(msg).toContain('[Character 小樱]: 下了，雨滴顺着玻璃滑下来');
    expect(msg).toContain('[2026-09-01] 用户说过想一起去山里看雪');
    expect(msg).toContain('[2026-08] 两人约定今年冬天一起去看海');
    expect(msg).toContain('"user" is FORBIDDEN'); // 用户没要求拍自己 → 约束行禁止 user

    const body = buildDirectorChatBody('gpt-4o-mini', input);
    expect(body.model).toBe('gpt-4o-mini');
    expect((body.messages as { role: string }[])[0].role).toBe('system');
    expect((body.messages as { role: string }[])[1].role).toBe('user');
  });
});

describe('requestDirectorDirective', () => {
  it('returns coerced directive on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(okDirective) } }] }),
    })) as unknown as typeof fetch);
    const input = makeInput({ charLockDataUrl: 'data:char' });
    const dir = await requestDirectorDirective({ baseUrl: 'https://sub.example.com/v1/', apiKey: 'k', model: 'm' }, input);
    expect(dir?.subjectType).toBe('scenery');
    expect(dir?.useCharLock).toBe(false); // scenery 强制关锁
  });

  it('returns null when endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as unknown as typeof fetch);
    const dir = await requestDirectorDirective({ baseUrl: 'https://sub.example.com/v1/', apiKey: 'k', model: 'm' }, makeInput());
    expect(dir).toBeNull();
  });

  it('returns null on network error / invalid JSON content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch);
    const dir = await requestDirectorDirective({ baseUrl: 'https://sub.example.com/v1/', apiKey: 'k', model: 'm' }, makeInput());
    expect(dir).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'I refuse to follow instructions.' } }] }),
    })) as unknown as typeof fetch);
    const dir2 = await requestDirectorDirective({ baseUrl: 'https://sub.example.com/v1/', apiKey: 'k', model: 'm' }, makeInput());
    expect(dir2).toBeNull();
  });
});

describe('photo subject intent detection', () => {
  it('textRequestsUserShot: rejects generic "show me" and role selfies, accepts explicit user shots', () => {
    expect(textRequestsUserShot('给我看看')).toBe(false);
    expect(textRequestsUserShot('发张你的照片给我')).toBe(false);
    expect(textRequestsUserShot('给我看看你的自拍')).toBe(false); // "你"=角色自拍，不是用户信号
    expect(textRequestsUserShot('看看你窗外的风景')).toBe(false);
    expect(textRequestsUserShot('拍我一张')).toBe(true);
    expect(textRequestsUserShot('帮我拍张我的照片')).toBe(true);
    expect(textRequestsUserShot('我的自拍好看吗')).toBe(true);
  });

  it('textRequestsJointShot: accepts joint requests, rejects generic ones', () => {
    expect(textRequestsJointShot('我们来张合照吧')).toBe(true);
    expect(textRequestsJointShot('合影留念')).toBe(true);
    expect(textRequestsJointShot('给我看看')).toBe(false);
    expect(textRequestsJointShot('发张你的照片')).toBe(false);
  });

  it('collectShotIntents only counts user-side (isUser=true) lines', () => {
    const turns = [
      { isUser: false, text: '图片- 我今天穿了白裙子，帮我看看好看吗' },
      { isUser: true, text: '拍我一张' },
      { isUser: false, text: '图片- 我的照片来啦，我自拍的' },
    ];
    const intents = collectShotIntents(turns);
    expect(intents.userShot).toBe(true);
    expect(intents.jointShot).toBe(false);

    // 角色第一人称 caption 里的"拍我/我的照片/自拍"不算用户信号
    const onlyChar = collectShotIntents([{ isUser: false, text: '图片- 拍我一张，我的照片，我刚自拍的' }]);
    expect(onlyChar.userShot).toBe(false);
    expect(onlyChar.jointShot).toBe(false);
  });
});

describe('guardPersonSubject intent gate', () => {
  const d = (subjectType: ImageGenDirective['subjectType']): ImageGenDirective => ({
    subjectType,
    useCharLock: true,
    useUserLock: true,
    prompt: 'final english prompt',
  });

  it('char/scenery/object are always allowed', () => {
    const input = makeInput();
    expect(guardPersonSubject(input, d('char'))).toBe('ok');
    expect(guardPersonSubject(input, d('scenery'))).toBe('ok');
    expect(guardPersonSubject(input, d('object'))).toBe('ok');
  });

  it('user is forbidden unless the user-side message asks to photograph the user', () => {
    const input = makeInput({ recentChat: [{ speaker: '我', isUser: true, text: '给我看看' }] });
    expect(guardPersonSubject(input, d('user'))).toBe('user-forbidden');

    const askUser = makeInput({ recentChat: [{ speaker: '我', isUser: true, text: '拍我一张' }] });
    expect(guardPersonSubject(askUser, d('user'))).toBe('ok');
  });

  it('joint is forbidden unless the user explicitly asks for a couple photo', () => {
    const input = makeInput({ recentChat: [{ speaker: '我', isUser: true, text: '给我看看你的照片' }] });
    expect(guardPersonSubject(input, d('joint'))).toBe('joint-forbidden');

    const askJoint = makeInput({ recentChat: [{ speaker: '我', isUser: true, text: '我们来张合照吧' }] });
    expect(guardPersonSubject(askJoint, d('joint'))).toBe('ok');
  });

  it('role-side first-person caption never unlocks user/joint', () => {
    const input = makeInput({ recentChat: [{ speaker: '小樱', isUser: false, text: '图片- 刚自拍了一张我的照片' }] });
    expect(guardPersonSubject(input, d('user'))).toBe('user-forbidden');
    expect(guardPersonSubject(input, d('joint'))).toBe('joint-forbidden');
  });
});
