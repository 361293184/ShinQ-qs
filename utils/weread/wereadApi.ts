/**
 * 微信读书前端调用封装：
 * - cookie 从 os_weread_profile 读取，走 X-Weread-Cookie 头（与小红书 X-Xhs-Cookie 同模式）；
 * - worker 返回 { error?, message?, data? }，这里统一做错误码→人话文案 + 字段归一化；
 * - 书架/笔记/搜索等 5 分钟内存短缓存，force 强制绕过（下拉刷新）。
 */
import { getProxyWorkerUrl } from '../proxyWorker';
import { loadWereadProfile, getWereadCookieValue } from './wereadConfig';
import type { WereadBook, WereadBookInfo, WereadChapter, WereadNote, WereadSearchHit, WereadReadingStatus } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface WereadApiError extends Error {
  code: string;
}

function apiError(code: string, message: string): WereadApiError {
  const e = new Error(message) as WereadApiError;
  e.code = code;
  return e;
}

function humanMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'NO_COOKIE': return '尚未登录微信读书：请到『我』页粘贴 cookie 或扫码登录';
    case 'COOKIE_EXPIRED': return '微信读书登录已失效，请到『我』页重新登录/更新 cookie';
    case 'NO_VID': return 'cookie 中未找到 wr_vid，请到微信读书网页版重新复制完整 cookie（必须含 wr_vid= 与 wr_skey=）';
    case 'WEREAD_LOGIN_TIMEOUT': return '微信读书登录已超时，请到『我』页重新粘贴 cookie';
    case 'WEREAD_AUTH_FAILED': return '微信读书鉴权失败，请到『我』页重新粘贴 cookie';
    case 'UPSTREAM_NETWORK': return '微信读书接口暂不可达，请稍后重试';
    case 'WEREAD_ERROR': return '微信读书接口异常，稍后重试';
    default: return fallback || '加载失败，请稍后重试';
  }
}

/**
 * 微信读书上游接口在 HTTP 200 的 body 里也会塞业务错误码（{ errCode: -2012, errMsg: "登录超时" }）。
 * 这里把常见业务码归一到前端的 error.code，方便 UI 走对应文案 + 引导去『我』页重新登录。
 * errCode 约定：0 = 成功；负数 = 鉴权/会话类；正数 = 一般业务错误。
 */
function mapUpstreamErrCode(ec: number): string {
  if (ec === -2012 || ec === -2010 || ec === -2011) return 'COOKIE_EXPIRED';
  if (ec === -1 || ec === -2 || ec === -3) return 'WEREAD_AUTH_FAILED';
  return 'WEREAD_LOGIN_TIMEOUT';
}

/* ---------- 内存缓存 ---------- */
const cache = new Map<string, { ts: number; data: unknown }>();

function cached<T>(key: string, force?: boolean): T | undefined {
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data as T;
  return undefined;
}

function remember<T>(key: string, data: T): T {
  cache.set(key, { ts: Date.now(), data });
  return data;
}

export function clearWereadCache(): void {
  cache.clear();
}

/* ---------- 请求 ---------- */
interface WereadRequestOptions {
  /** 强制绕过 5 分钟缓存（下拉刷新/重试用） */
  force?: boolean;
}

async function wereadRequest<T>(action: string, params: Record<string, string>, opts: WereadRequestOptions = {}): Promise<T> {
  const key = `${action}?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).sort().join('&')}`;
  const hit = cached<T>(key, opts.force);
  if (hit !== undefined) return hit;

  const profile = loadWereadProfile();
  if (!profile.cookie) throw apiError('NO_COOKIE', humanMessage('NO_COOKIE'));

  const qs = new URLSearchParams(params).toString();
  const url = `${getProxyWorkerUrl().replace(/\/+$/, '')}/weread/${action}${qs ? `?${qs}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Weread-Cookie': profile.cookie },
    });
  } catch {
    throw apiError('UPSTREAM_NETWORK', humanMessage('UPSTREAM_NETWORK'));
  }

  let payload: any = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }
  if (!res.ok || payload?.error) {
    const code = (payload?.error as string) || 'WEREAD_ERROR';
    throw apiError(code, payload?.message || humanMessage(code));
  }
  const data = (payload?.data !== undefined ? payload.data : payload) as T;
  // 微信读书上游在 HTTP 200 的 body 里也塞业务错误码（errCode ≠ 0）。
  // 不识别的话 normalizeShelf 会把它当正常数据解析、返回 []，UI 就显示"书架空空的"，
  // 实际是 cookie 过期——这就是当前 bug 的根因。统一在这里翻译成前端 error code。
  if (data && typeof data === 'object' && 'errCode' in (data as any)) {
    const ec = Number((data as any).errCode);
    if (Number.isFinite(ec) && ec !== 0) {
      const code = mapUpstreamErrCode(ec);
      const upstreamMsg = typeof (data as any).errMsg === 'string' && (data as any).errMsg ? (data as any).errMsg : '';
      throw apiError(code, upstreamMsg ? `${humanMessage(code)}（${upstreamMsg}）` : humanMessage(code));
    }
  }
  return remember(key, data);
}

/* ---------- 归一化（上游字段变动只改这里） ---------- */

function toSafeString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function pickFirst<T>(...vals: T[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** 微信读书封面兜底 URL（无 cover 字段也能出图占位） */
export function wereadCoverFallback(bookId: string): string {
  return bookId ? `https://weread.qq.com/web/bookCover/${encodeURIComponent(bookId)}` : '';
}

function mapReadingStatus(rawStatus: number | undefined, progress: number): WereadReadingStatus {
  const s = Number(rawStatus);
  if (!Number.isNaN(s)) {
    // 常见的网页版状态语义（个别账号可能反着，进度 >=99.5 一定判读完作兜底）：
    // 1=在读 2=想读 3=读完（若实测相反，改动这里即可，前端组件不感知）
    if (s === 1) return 'reading';
    if (s === 2) return 'wish';
    if (s === 3) return 'finished';
  }
  if (progress >= 99.5) return 'finished';
  if (progress > 0) return 'reading';
  return 'unknown';
}

function toProgress(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // 部分接口给 0~1 小数
  return Math.max(0, Math.min(100, n <= 1 ? Math.round(n * 1000) / 10 : Math.round(n)));
}

/** 书架：常见返回 { books: [{ book:{bookId,title,author,cover}, readingStatus, percentage/ratio, markCount, noteCount, updated }] } */
export function normalizeShelf(raw: any): WereadBook[] {
  if (!raw) return [];
  const list = Array.isArray(raw?.books) ? raw.books : Array.isArray(raw?.data?.books) ? raw.data.books : Array.isArray(raw) ? raw : [];
  return list
    .map((item: any): WereadBook | null => {
      const meta = item?.book && typeof item?.book === 'object' ? item.book : item;
      const bookId = toSafeString(pickFirst(meta?.bookId, meta?.bid, item?.bookId));
      if (!bookId) return null;
      const progress = toProgress(pickFirst(item?.percentage, item?.ratio, meta?.percentage));
      const title = toSafeString(pickFirst(meta?.title, item?.title)) || '未命名';
      return {
        bookId,
        title,
        author: toSafeString(pickFirst(meta?.author, item?.author)),
        cover: toSafeString(pickFirst(meta?.cover, item?.cover)) || wereadCoverFallback(bookId),
        readingStatus: mapReadingStatus(pickFirst(item?.readingStatus, meta?.readingStatus), progress),
        progress,
        markCount: Number(pickFirst(item?.markCount, meta?.markCount) || 0) || undefined,
        noteCount: Number(pickFirst(item?.noteCount, meta?.noteCount) || 0) || undefined,
        updated: Number(pickFirst(item?.updated, meta?.updated) || 0) || undefined,
        rawStatus: Number(pickFirst(item?.readingStatus, meta?.readingStatus)),
      };
    })
    .filter((b: WereadBook | null): b is WereadBook => !!b);
}

/** 书籍详情：常见顶层 title/author/intro/cover */
export function normalizeBookInfo(raw: any): WereadBookInfo | null {
  if (!raw) return null;
  const info = raw?.book && typeof raw?.book === 'object' ? raw.book : raw;
  const bookId = toSafeString(pickFirst(info?.bookId, raw?.bookId));
  if (!bookId || !toSafeString(pickFirst(info?.title, raw?.title))) return null;
  return {
    bookId,
    title: toSafeString(pickFirst(info?.title, raw?.title)),
    author: toSafeString(pickFirst(info?.author, raw?.author)),
    cover: toSafeString(pickFirst(info?.cover, raw?.cover)) || wereadCoverFallback(bookId),
    intro: toSafeString(pickFirst(info?.intro, info?.description, raw?.intro)),
    category: toSafeString(pickFirst(info?.category, raw?.category)),
  };
}

/** 章节目录：常见 { data:[{ bookId, updated:[{uid,title,level}] }] } */
export function normalizeChapters(raw: any): WereadChapter[] {
  const group = Array.isArray(raw?.data) && raw.data.length ? raw.data[0] : raw;
  const list = Array.isArray(group?.updated) ? group.updated : Array.isArray(group) ? group : [];
  return list
    .map((c: any): WereadChapter | null => {
      const uid = toSafeString(pickFirst(c?.uid, c?.chapterUid, c?.id));
      if (!uid) return null;
      return { uid, title: toSafeString(pickFirst(c?.title, c?.name)) || `章节 ${uid}`, level: Number(c?.level || 0) };
    })
    .filter((c: WereadChapter | null): c is WereadChapter => !!c);
}

/** 划线/想法：常见 { updated: [{ bookId, chapterTitle, markText, content/review, createdAt, type }] } */
export function normalizeNotes(raw: any, fallbackBookId?: string): WereadNote[] {
  const list = Array.isArray(raw?.updated) ? raw.updated : Array.isArray(raw) ? raw : [];
  return list
    .map((n: any): WereadNote | null => {
      const bookId = toSafeString(pickFirst(n?.bookId, fallbackBookId));
      const markText = toSafeString(n?.markText || n?.mark);
      const content = toSafeString(n?.content || n?.review);
      if (!bookId || (!markText && !content)) return null;
      const isThought = n?.type === 'thought' || (!markText && content);
      return {
        bookId,
        bookTitle: toSafeString(n?.bookTitle),
        noteType: isThought ? 'thought' : 'highlight',
        markText,
        content,
        chapterTitle: toSafeString(n?.chapterTitle),
        createdAt: Number(n?.createdAt || n?.ct || 0) || undefined,
      };
    })
    .filter((n: WereadNote | null): n is WereadNote => !!n);
}

/** 搜索：常见 { books: [...] } 或 { results: [...] } */
export function normalizeSearch(raw: any): WereadSearchHit[] {
  const list = Array.isArray(raw?.books) ? raw.books : Array.isArray(raw?.results) ? raw.results : Array.isArray(raw?.data?.books) ? raw.data.books : [];
  return list
    .map((b: any): WereadSearchHit | null => {
      const meta = b?.book && typeof b?.book === 'object' ? b.book : b;
      const bookId = toSafeString(pickFirst(meta?.bookId, b?.bookId));
      if (!bookId || !toSafeString(pickFirst(meta?.title, b?.title))) return null;
      return {
        bookId,
        title: toSafeString(pickFirst(meta?.title, b?.title)),
        author: toSafeString(pickFirst(meta?.author, b?.author)),
        cover: toSafeString(pickFirst(meta?.cover, b?.cover)) || wereadCoverFallback(bookId),
        intro: toSafeString(pickFirst(meta?.intro, meta?.description, b?.intro)),
      };
    })
    .filter((b: WereadSearchHit | null): b is WereadSearchHit => !!b);
}

/* ---------- 公开 API ---------- */

export async function fetchWereadShelf(opts: WereadRequestOptions = {}): Promise<WereadBook[]> {
  const raw = await wereadRequest<any>('shelf', {}, opts);
  return normalizeShelf(raw);
}

export async function fetchWereadBookInfo(bookId: string, opts: WereadRequestOptions = {}): Promise<WereadBookInfo | null> {
  const raw = await wereadRequest<any>('book', { bookId }, opts);
  return normalizeBookInfo(raw);
}

export async function fetchWereadChapters(bookId: string, opts: WereadRequestOptions = {}): Promise<WereadChapter[]> {
  const raw = await wereadRequest<any>('chapters', { bookIds: bookId }, opts);
  return normalizeChapters(raw);
}

/** 正文返回原始 payload（结构随上游变动，阅读页自身负责容错） */
export async function fetchWereadRead(bookId: string, chUid: string, opts: WereadRequestOptions = {}): Promise<unknown> {
  return wereadRequest('read', { bookId, chUid }, opts);
}

export async function fetchWereadNotes(bookId: string, opts: WereadRequestOptions = {}): Promise<WereadNote[]> {
  const raw = await wereadRequest<any>('notes', { bookId }, opts);
  return normalizeNotes(raw, bookId);
}

export async function searchWereadBooks(keyword: string, opts: WereadRequestOptions = {}): Promise<WereadSearchHit[]> {
  const raw = await wereadRequest<any>('search', { keyword }, opts);
  return normalizeSearch(raw);
}

/** 测试连接：拉一次书架验证 cookie；成功后返回昵称/vid（昵称优先取 cookie 的 wr_name） */
export async function verifyWereadCookie(): Promise<{ ok: boolean; nickname?: string; vid?: string; message?: string }> {
  try {
    const profile = loadWereadProfile();
    await wereadRequest<any>('shelf', {}, { force: true });
    return {
      ok: true,
      nickname: profile.nickname || getWereadCookieValue(profile.cookie, 'wr_name') || '',
      vid: getWereadCookieValue(profile.cookie, 'wr_vid') || '',
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || humanMessage(e?.code || 'WEREAD_ERROR') };
  }
}
