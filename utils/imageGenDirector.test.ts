import { describe, expect, it } from 'vitest';
import {
  classifySceneSubject,
  buildExecution,
  buildExecutionFromPreset,
  type ImageGenInput,
} from './imageGenDirector';

function makeInput(overrides: Partial<ImageGenInput> = {}): ImageGenInput {
  return {
    charName: '小樱',
    charDesc: '黑发、温柔、穿白裙',
    userDesc: '圆脸戴眼镜',
    sceneDesc: '窗外下着雨，雨滴顺着玻璃滑下来',
    charLockDataUrl: '',
    userLockDataUrl: '',
    ...overrides,
  };
}

describe('classifySceneSubject — 主模型描述里谁出镜就按谁', () => {
  it('role showing their place/food/weather (no person) → scenery/object, not char', () => {
    expect(classifySceneSubject('阳台一角，午后的阳光洒在木地板上，晾衣架上的白衬衫微微晃动，角落里一盆绿植')).toBe('scenery');
    expect(classifySceneSubject('窗外下着雨，雨滴顺着玻璃滑下来')).toBe('scenery');
    expect(classifySceneSubject('刚做好的可乐鸡翅，冒着热气，撒着葱花')).toBe('object');
  });

  it('explicit "我/selfie/body/outfit" in the caption → char (the character is in frame)', () => {
    expect(classifySceneSubject('我站在阳台晒太阳，穿着白衬衫')).toBe('char');
    expect(classifySceneSubject('我的自拍，刚洗完头')).toBe('char');
    expect(classifySceneSubject('锁骨上还挂着水珠，顺着线条滑下来')).toBe('char');
    expect(classifySceneSubject('今天的穿搭，oversize 卫衣配工装裤')).toBe('char');
  });

  it('possessive 我 without being in the frame (我的书房) does NOT force char', () => {
    expect(classifySceneSubject('我现在的书房，阳光照在书桌上')).toBe('scenery');
    expect(classifySceneSubject('我的房间一角，书架和台灯')).toBe('scenery');
  });

  it('joint cues (你和我/咱俩/合照) → joint; user as subject → user', () => {
    expect(classifySceneSubject('你和我并肩站在夕阳下的海边')).toBe('joint');
    expect(classifySceneSubject('拍了一张你的照片，你站在窗边')).toBe('user');
  });
});

describe('buildExecution — 描述直接决定锁脸与 prompt 拼法', () => {
  it('scenery: no lock image, no lock flags, no-human guard, no human safety tail', () => {
    const ex = buildExecution(makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user', sceneDesc: '图片- 阳台一角' }));
    expect(ex.imageGenMode).toBe('scenery');
    expect(ex.lockImageDataUrl).toBeNull();
    expect(ex.lockImageDataUrls).toBeUndefined();
    expect(ex.useCharLock).toBe(false);
    expect(ex.useUserLock).toBe(false);
    expect(ex.usedLockFace).toBe(false);
    expect(ex.prompt).toContain('No humans, no people');
    expect(ex.prompt).toContain('阳台一角');
    expect(ex.prompt).not.toContain('anatomically correct');
    expect(ex.prompt).not.toContain('MUST keep the face');
  });

  it('object mirrors scenery semantics', () => {
    const ex = buildExecution(makeInput({ charLockDataUrl: 'data:char', sceneDesc: '一碗热腾腾的牛肉面' }));
    expect(ex.imageGenMode).toBe('object');
    expect(ex.lockImageDataUrl).toBeNull();
    expect(ex.useCharLock).toBe(false);
    expect(ex.prompt).toContain('No humans');
  });

  it('char with lock passes the character reference as single lock', () => {
    const ex = buildExecution(makeInput({ charLockDataUrl: 'data:char', sceneDesc: '我站在阳台晒太阳，穿着白衬衫' }));
    expect(ex.imageGenMode).toBe('char');
    expect(ex.lockImageDataUrl).toBe('data:char');
    expect(ex.lockImageDataUrls).toBeUndefined();
    expect(ex.usedLockFace).toBe(true);
    expect(ex.useUserLock).toBe(false);
    expect(ex.prompt).toContain('MUST keep the face');
    expect(ex.prompt).toContain('anatomically correct');
  });

  it('joint with both locks maps to the dual-array layout (0=char, 1=user)', () => {
    const ex = buildExecution(makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user', sceneDesc: '你和我并肩站在夕阳下的海边' }));
    expect(ex.imageGenMode).toBe('joint');
    expect(ex.lockImageDataUrls).toEqual(['data:char', 'data:user']);
    expect(ex.lockImageDataUrl).toBe('data:char');
    expect(ex.usedLockFace).toBe(true);
  });

  it('user without lock still produces a portrait prompt but no reference image', () => {
    const ex = buildExecution(makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: '', sceneDesc: '拍了一张你的照片，你站在窗边' }));
    expect(ex.imageGenMode).toBe('user');
    expect(ex.lockImageDataUrl).toBeNull();
    expect(ex.usedLockFace).toBe(false);
    expect(ex.useCharLock).toBe(false);
  });
});

describe('buildExecutionFromPreset — 重试复用已定稿 prompt，避免图意漂移', () => {
  it('reuses final prompt and lock intent', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user', sceneDesc: '我站在阳台晒太阳' });
    const ex = buildExecutionFromPreset(input, {
      subjectType: 'char',
      useCharLock: true,
      useUserLock: false,
      finalPrompt: 'final english prompt of the girl on the balcony',
    });
    expect(ex.prompt).toBe('final english prompt of the girl on the balcony');
    expect(ex.imageGenMode).toBe('char');
    expect(ex.lockImageDataUrl).toBe('data:char');
    expect(ex.usedLockFace).toBe(true);
  });

  it('scenery preset never reappends the no-human guard twice nor uses locks', () => {
    const input = makeInput({ charLockDataUrl: 'data:char', userLockDataUrl: 'data:user', sceneDesc: '窗外下雨' });
    const first = buildExecutionFromPreset(input, {
      subjectType: 'scenery',
      useCharLock: false,
      useUserLock: false,
      finalPrompt: 'rain drops on a window. No humans, no people, no human faces, no characters anywhere in the image.',
    });
    const second = buildExecutionFromPreset(input, {
      subjectType: 'scenery',
      useCharLock: false,
      useUserLock: false,
      finalPrompt: first.prompt,
    });
    expect(second.prompt).toBe(first.prompt);
    expect(second.prompt.match(/No humans, no people/g)).toHaveLength(1);
    expect(second.lockImageDataUrl).toBeNull();
    expect(second.usedLockFace).toBe(false);
  });
});
