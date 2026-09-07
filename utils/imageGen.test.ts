import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  generateImage,
  resolveSafetyNegative,
  IMAGE_NEGATIVE_ANATOMY,
  IMAGE_NEGATIVE_VIOLENCE,
  IMAGE_NEGATIVE_DEFAULT,
} from './imageGen';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 造一个能记录请求体并返回 b64 结果的 fetch mock */
function stubFetch() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || '{}')) });
    return {
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJD' }] }),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return calls;
}

const baseOpts = {
  baseUrl: 'https://img.example.com/v1/',
  apiKey: 'key',
  model: 'gpt-image-1',
  prompt: 'a girl smiling in a sunlit park, masterpiece, best quality, highly detailed',
};

describe('resolveSafetyNegative', () => {
  it('defaults to anatomy + violence for a normal prompt', () => {
    expect(resolveSafetyNegative('portrait of a woman', undefined)).toBe(IMAGE_NEGATIVE_DEFAULT);
    expect(resolveSafetyNegative('portrait of a woman', undefined)).toContain('deformed anatomy');
    expect(resolveSafetyNegative('portrait of a woman', undefined)).toContain('gore');
  });

  it('exempts the anatomy group for chibi / super-deformed style but keeps violence terms', () => {
    const n = resolveSafetyNegative('chibi style, cute, super deformed, adorable', undefined);
    expect(n).toBe(IMAGE_NEGATIVE_VIOLENCE);
    expect(n).toContain('gore');
    expect(n).not.toContain('deformed anatomy');
    expect(n).not.toContain('extra or fused fingers');
  });

  it('honours explicit empty/null to disable and custom strings verbatim', () => {
    expect(resolveSafetyNegative('anything', '')).toBeNull();
    expect(resolveSafetyNegative('anything', null)).toBeNull();
    expect(resolveSafetyNegative('anything', '  my own negative  ')).toBe('my own negative');
  });
});

describe('generateImage negative_prompt propagation', () => {
  it('includes the default negative_prompt in the request body', async () => {
    const calls = stubFetch();
    await generateImage({ ...baseOpts });
    expect(calls[0].body.negative_prompt).toBe(IMAGE_NEGATIVE_DEFAULT);
  });

  it('keeps only violence terms for a super-deformed (Q-style) prompt', async () => {
    const calls = stubFetch();
    await generateImage({ ...baseOpts, prompt: 'chibi style, cute, super deformed, adorable' });
    expect(calls[0].body.negative_prompt).toBe(IMAGE_NEGATIVE_VIOLENCE);
  });

  it('omits negative_prompt when disabled with "" or null', async () => {
    const calls = stubFetch();
    await generateImage({ ...baseOpts, negativePrompt: '' });
    await generateImage({ ...baseOpts, negativePrompt: null });
    expect(calls[0].body.negative_prompt).toBeUndefined();
    expect(calls[1].body.negative_prompt).toBeUndefined();
  });

  it('uses a caller-provided custom string verbatim', async () => {
    const calls = stubFetch();
    await generateImage({ ...baseOpts, negativePrompt: 'custom negative words' });
    expect(calls[0].body.negative_prompt).toBe('custom negative words');
  });
});

describe('generateImage legacy behaviour (no regression)', () => {
  it('keeps reference fields when a lock image is provided (pure base64, no data: prefix)', async () => {
    const calls = stubFetch();
    await generateImage({ ...baseOpts, lockImageDataUrl: 'data:image/png;base64,REFB' });
    const body = calls[0].body;
    expect(Array.isArray(body.image)).toBe(true);
    expect(body.image).toEqual(['REFB']);
    expect(body.reference_images).toEqual(['REFB']);
  });

  it('returns a data-url result from b64_json', async () => {
    stubFetch();
    const r = await generateImage({ ...baseOpts });
    expect(r.isBase64).toBe(true);
    expect(r.url).toBe('data:image/png;base64,QUJD');
  });

  it('returns an http url result when no b64_json present', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ url: 'https://cdn.example.com/1.png' }] }),
    } as Response));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const r = await generateImage({ ...baseOpts });
    expect(r.isBase64).toBe(false);
    expect(r.url).toBe('https://cdn.example.com/1.png');
  });

  it('throws with a useful message when the API returns an error status', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'bad key',
    } as Response));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    await expect(generateImage({ ...baseOpts })).rejects.toThrow(/401/);
  });
});
