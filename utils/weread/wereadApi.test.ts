import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  clearWereadCache,
  fetchWereadShelf,
  normalizeShelf,
  normalizeNotes,
  normalizeSearch,
  verifyWereadCookie,
} from './wereadApi';

const fakeCookie = 'wr_vid=123456; wr_name=%E5%B0%8F%E6%98%8E; wr_skey=abcdefghijklmnopqrstuvwxyz';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('os_weread_profile', JSON.stringify({ cookie: fakeCookie, roleAwareEnabled: true }));
  clearWereadCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(json: unknown, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: status < 400,
      status,
      json: async () => json,
    } as Response;
  });
  vi.stubGlobal('fetch', mock as unknown as typeof fetch);
  return calls;
}

describe('normalize helpers', () => {
  it('maps a shelf payload into stable book items', () => {
    const books = normalizeShelf({
      books: [
        { book: { bookId: 'b1', title: '窄门', author: '纪德' }, readingStatus: 1, percentage: 0.23, markCount: 2 },
        { book: { bookId: 'b2', title: '三体', author: '刘慈欣' }, readingStatus: 3, percentage: 1, noteCount: 5 },
      ],
    });
    expect(books).toHaveLength(2);
    expect(books[0].bookId).toBe('b1');
    expect(books[0].readingStatus).toBe('reading');
    expect(books[0].progress).toBe(23);
    expect(books[0].cover).toContain('bookCover/b1');
    expect(books[1].readingStatus).toBe('finished');
  });

  it('flattens notes/highlights with tolerant fields', () => {
    const notes = normalizeNotes({
      updated: [
        { bookId: 'b1', chapterTitle: '第一章', markText: '人始终有选择的自由', content: '' },
        { bookId: 'b1', content: '这句让我想起你', type: 'thought' },
      ],
    }, 'b1');
    expect(notes).toHaveLength(2);
    expect(notes[0].noteType).toBe('highlight');
    expect(notes[1].noteType).toBe('thought');
  });

  it('maps search hits', () => {
    const hits = normalizeSearch({ books: [{ book: { bookId: 'b9', title: '局外人', author: '加缪' } }] });
    expect(hits[0].title).toBe('局外人');
  });
});

describe('fetchWereadShelf through worker', () => {
  it('sends X-Weread-Cookie and parses shelf, then serves from cache on second call', async () => {
    const calls = stubFetch({ data: { books: [{ book: { bookId: 'b1', title: '窄门' }, percentage: 0.5 }] } });
    const first = await fetchWereadShelf();
    const second = await fetchWereadShelf();
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe('窄门');
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1); // 第二次命中缓存，不再发请求
    expect(calls[0].init?.headers).toMatchObject({ 'X-Weread-Cookie': fakeCookie });
  });

  it('force bypasses the cache', async () => {
    const calls = stubFetch({ data: { books: [] } });
    await fetchWereadShelf();
    await fetchWereadShelf({ force: true });
    expect(calls).toHaveLength(2);
  });

  it('maps COOKIE_EXPIRED into a friendly error with code', async () => {
    stubFetch({ error: 'COOKIE_EXPIRED', message: '微信读书登录已失效' }, 401);
    await expect(fetchWereadShelf()).rejects.toMatchObject({ code: 'COOKIE_EXPIRED' });
    await expect(fetchWereadShelf()).rejects.toThrow(/登录已失效/);
  });
});

describe('verifyWereadCookie', () => {
  it('reports ok and extracts vid/nickname from cookie on success', async () => {
    stubFetch({ data: { books: [] } });
    const r = await verifyWereadCookie();
    expect(r.ok).toBe(true);
    expect(r.vid).toBe('123456');
    expect(r.nickname).toBe('小明');
  });

  it('reports failure with message when worker refuses', async () => {
    stubFetch({ error: 'NO_COOKIE', message: '尚未登录' }, 401);
    const r = await verifyWereadCookie();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('登录');
  });
});
