/**
 * 小说共读 v9.2.7 — SullyOS 适配版
 * 从 CSY OS 插件 novel-reader-code.js 移植，React/TS 重写核心逻辑。
 *
 * 小数据（进度/生词/皮肤/字号/学习模式/面板位置）存 localStorage，key 沿用原插件
 * 前缀 "nrcache_" 以兼容用户已有数据；书架全文（几 MB）存**独立的** IndexedDB
 * SullyOS_NovelShelf —— 塞 localStorage 会撞 5MB 配额且写入静默失败，书会直接丢；
 * 放在主库 AetherOS_Data 里则会被「版本号已被占用 → 建表不触发」坑到，见下方说明。
 *
 * 功能：书架 / txt·epub 导入 / Gutenberg 公版书搜索 / 翻译(长按选中) /
 *       生词本 / 学习模式 / 皮肤 / 字号 / AI 共读上下文。
 */

import type { NovelReaderBook } from '../types';

/* ========== 类型 ========== */
/** 书架里的一本书（形状定义在 types.ts，备份导出/导入共用同一份）。 */
export type Book = NovelReaderBook;

export interface VocabEntry {
  src: string;
  trans: string;
  bookId: string;
  bookTitle: string;
  ts: number;
}

export interface GutendexHit {
  id: number;
  title: string;
  authors: string;
  formats: Record<string, string>;
}

export interface NovelReaderState {
  books: Book[];
  currentBookId: string | null;
  progress: Record<string, number>;
  theme: 'day' | 'night';
  skin: string;
  fontSize: number;
  vocab: VocabEntry[];
  learnMode: 0 | 1 | 2;
}

/* ========== 常量 ========== */
export const LS_PREFIX = 'nrcache_';
const BK_BOOKS = 'nr_books';
const BK_CURRENT = 'nr_current';
const BK_PROGRESS = 'nr_progress';
const BK_THEME = 'nr_theme';
const BK_SKIN = 'nr_skin';
const BK_FONTSIZE = 'nr_fontsize';
const BK_VOCAB = 'nr_vocab';
const BK_LEARN = 'nr_learn';
const BK_GEOM = 'nr_geom';

export const FS_MIN = 12;
export const FS_MAX = 24;
export const FS_STEP = 2;
export const FS_DEFAULT = 16;

export const SKINS = [
  { id: 'default', name: '默认', bg: '#ffffff', fg: '#1f2937', chipBg: '#ffffff', chipBd: '#ccc' },
  { id: 'green', name: '护眼绿', bg: '#c7edcc', fg: '#14532d', chipBg: '#c7edcc', chipBd: '#a8d8b0' },
  { id: 'parchment', name: '羊皮纸', bg: '#f0e2c4', fg: '#4a3b1f', chipBg: '#f0e2c4', chipBd: '#d4c4a0' },
  { id: 'paper', name: '米黄', bg: '#faf3e0', fg: '#5b4a2a', chipBg: '#faf3e0', chipBd: '#e0d8c0' },
  { id: 'ink', name: '墨黑', bg: '#1a1a1a', fg: '#d6d3d1', chipBg: '#1a1a1a', chipBd: '#333' },
] as const;

const GUTENDEX_API = 'https://gutendex.com/books/?search=';
const CORS_PROXY = 'https://proxy.cors.sh/';
const MAX_CHARS = 500;
const TRANS_MAX = 500;

export const VERSION = 'v9.2.7-sully';

/* ========== 存储（localStorage 封装） ========== */
const lsKey = (k: string) => LS_PREFIX + k;

function safeGet(k: string): string | null {
  try { return window.localStorage.getItem(lsKey(k)); } catch { return null; }
}
function safeSet(k: string, v: unknown): void {
  try { window.localStorage.setItem(lsKey(k), typeof v === 'string' ? v : JSON.stringify(v)); } catch {}
}
function safeRemove(k: string): void {
  try { window.localStorage.removeItem(lsKey(k)); } catch {}
}

/* ========== 状态读写 ========== */
/** 旧版整架书的 localStorage 键（仅用于迁移，见 loadBooks）。 */
function readLegacyBooks(): Book[] {
  const raw = safeGet(BK_BOOKS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((b: any) => b && typeof b.id === 'string' && Array.isArray(b.passages));
  } catch {
    return [];
  }
}

/* ========== 书架库（独立 IndexedDB） ==========
 * 刻意不复用主库 AetherOS_Data：主库每加一张表都要升全局唯一的 DB_VERSION，而浏览器里
 * 若已存在同号/更高号的库，upgradeneeded 根本不会触发 → 新表永远建不出来，于是
 * 「存了但读不回来」（读侧还会静默返回空书架）。独立小库每次都是从 0 升到 1，不受主库
 * 版本状态、主库连接被其它标签页占用等影响。
 */
const SHELF_DB_NAME = 'SullyOS_NovelShelf';
const SHELF_STORE = 'books';
const SHELF_DB_VERSION = 1;

/** 最近一次书架读写的结果：面板直接把失败原因显示出来，用户不看控制台也能看见。 */
export interface ShelfStatus { ok: boolean; message: string; at: number; }
let shelfStatus: ShelfStatus = { ok: true, message: '', at: 0 };
export function getShelfStatus(): ShelfStatus { return shelfStatus; }
function noteShelf(ok: boolean, message = ''): void {
  shelfStatus = { ok, message, at: Date.now() };
  if (!ok) console.warn('[novelReader] 书架存储异常：', message);
}

/** 把 DOMException 翻成用户能看懂的一句话。 */
function describeError(error: unknown): string {
  const e = error as any;
  const name = e?.name || '';
  if (name === 'QuotaExceededError') return '浏览器存储空间已满';
  if (name === 'SecurityError' || name === 'InvalidStateError') return '浏览器禁止了本地存储（隐私模式？）';
  if (name === 'VersionError') return '书库版本冲突';
  return e?.message ? `${name ? name + ': ' : ''}${e.message}` : String(error);
}

let shelfDbPromise: Promise<IDBDatabase> | null = null;

function openShelfDb(): Promise<IDBDatabase> {
  if (shelfDbPromise) return shelfDbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(SHELF_DB_NAME, SHELF_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHELF_STORE)) db.createObjectStore(SHELF_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      // 另一个标签页要升级/删库时主动让位，别把连接卡死
      db.onversionchange = () => {
        db.close();
        if (shelfDbPromise === wrapped) shelfDbPromise = null;
      };
      db.onclose = () => { if (shelfDbPromise === wrapped) shelfDbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('书库打开失败'));
    request.onblocked = () => reject(new Error('书库被其它标签页占用'));
  });
  // 失败不缓存，让下一次操作能重试
  const wrapped = opening.catch(error => {
    if (shelfDbPromise === wrapped) shelfDbPromise = null;
    throw error;
  });
  shelfDbPromise = wrapped;
  return wrapped;
}

function runShelfRead(): Promise<Book[]> {
  return openShelfDb().then(db => new Promise<Book[]>((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE, 'readonly');
    const req = tx.objectStore(SHELF_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []) as Book[]);
    req.onerror = () => reject(req.error);
  }));
}

/** 早期版本曾把书放进主库 AetherOS_Data 的 novel_reader_books 表，读出来搬迁用。 */
const LEGACY_MAIN_DB = 'AetherOS_Data';
const LEGACY_MAIN_STORE = 'novel_reader_books';

function readLegacyMainDbBooks(): Promise<Book[]> {
  return new Promise(resolve => {
    let request: IDBOpenDBRequest;
    try {
      // 不带版本号 = 连到现有库，绝不触发升级；主库不可用时静默放弃
      request = indexedDB.open(LEGACY_MAIN_DB);
    } catch {
      resolve([]);
      return;
    }
    request.onerror = () => resolve([]);
    request.onblocked = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      const done = (rows: Book[]) => { try { db.close(); } catch {} resolve(rows); };
      try {
        if (!db.objectStoreNames.contains(LEGACY_MAIN_STORE)) { done([]); return; }
        const tx = db.transaction(LEGACY_MAIN_STORE, 'readonly');
        const req = tx.objectStore(LEGACY_MAIN_STORE).getAll();
        req.onsuccess = () => done((req.result || []) as Book[]);
        req.onerror = () => done([]);
      } catch {
        done([]);
      }
    };
  });
}

/**
 * 读整架书。顺带把历史数据搬进书库：
 *   1) 更早的 localStorage 版（nrcache_nr_books）
 *   2) 曾短暂放进主库的 novel_reader_books 表
 * 只补库里没有的 id，全部搬成功才删旧键 —— 绝不「先删再写」。
 */
export async function loadBooks(): Promise<Book[]> {
  let list: Book[] = [];
  try {
    list = await runShelfRead();
    noteShelf(true);
  } catch (error) {
    noteShelf(false, `书架读取失败：${describeError(error)}`);
    return readLegacyBooks(); // 库打不开时至少别让老数据看起来凭空消失
  }

  const have = new Set(list.map(b => b.id));
  const incoming = readLegacyBooks();
  // 书库为空时才去翻主库里的历史表（正常情况下不碰主库，也不多开一次连接）
  if (list.length === 0) incoming.push(...await readLegacyMainDbBooks());
  const missing = incoming.filter(b => !have.has(b.id));

  if (missing.length > 0) {
    let allOk = true;
    for (const book of missing) {
      try {
        await saveBook(book);
        list.push(book);
      } catch {
        allOk = false;
      }
    }
    if (allOk) safeRemove(BK_BOOKS);
  }

  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** 存一本（导入/下载后立刻落盘）。失败会抛出，同时把原因记进 getShelfStatus()。 */
export async function saveBook(book: Book): Promise<void> {
  try {
    const db = await openShelfDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SHELF_STORE, 'readwrite');
      tx.objectStore(SHELF_STORE).put(book);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('写入被中止'));
    });
    noteShelf(true);
  } catch (error) {
    noteShelf(false, `书库写入失败：${describeError(error)}`);
    throw error;
  }
}

export async function deleteBook(id: string): Promise<void> {
  try {
    const db = await openShelfDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SHELF_STORE, 'readwrite');
      tx.objectStore(SHELF_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('删除被中止'));
    });
    noteShelf(true);
  } catch (error) {
    noteShelf(false, `书库删除失败：${describeError(error)}`);
    throw error;
  }
}

/** 备份导出用：读不到就退回旧版 localStorage（至少不丢老数据）。 */
export async function exportShelfBooks(): Promise<Book[]> {
  try {
    return await runShelfRead();
  } catch {
    return readLegacyBooks();
  }
}

/** 备份导入用：整架覆盖（undefined/null 表示这份备份没有书架，保持本地不动）。 */
export async function importShelfBooks(books: Book[] | undefined | null): Promise<void> {
  if (books === undefined || books === null) return;
  const db = await openShelfDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE, 'readwrite');
    const store = tx.objectStore(SHELF_STORE);
    store.clear();
    books.forEach(book => { if (book && book.id) store.put(book); });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('导入被中止'));
  });
}

export function loadCurrentBookId(): string | null {
  const v = safeGet(BK_CURRENT);
  return v || null;
}
export function saveCurrentBookId(id: string | null): void { safeSet(BK_CURRENT, id || ''); }

export function loadProgress(): Record<string, number> {
  try {
    const d = safeGet(BK_PROGRESS);
    if (d) { const p = JSON.parse(d); if (p && typeof p === 'object') return p; }
  } catch {}
  return {};
}
export function saveProgress(p: Record<string, number>): void { safeSet(BK_PROGRESS, p); }

export function loadTheme(): 'day' | 'night' {
  const t = safeGet(BK_THEME);
  return t === 'night' ? 'night' : 'day';
}
export function saveTheme(t: 'day' | 'night'): void { safeSet(BK_THEME, t); }

export function loadSkin(): string {
  const s = safeGet(BK_SKIN);
  return s && SKINS.some(k => k.id === s) ? s : 'default';
}
export function saveSkin(s: string): void { safeSet(BK_SKIN, s); }

export function loadFontSize(): number {
  try {
    const fs = parseInt(safeGet(BK_FONTSIZE) || '', 10);
    if (!isNaN(fs) && fs >= FS_MIN && fs <= FS_MAX) return fs;
  } catch {}
  return FS_DEFAULT;
}
export function saveFontSize(fs: number): void { safeSet(BK_FONTSIZE, String(fs)); }

export function loadVocab(): VocabEntry[] {
  try {
    const d = safeGet(BK_VOCAB);
    if (d) { const p = JSON.parse(d); if (Array.isArray(p)) return p; }
  } catch {}
  return [];
}
export function saveVocab(v: VocabEntry[]): void { safeSet(BK_VOCAB, v); }

export function loadLearnMode(): 0 | 1 | 2 {
  try {
    const m = parseInt(safeGet(BK_LEARN) || '', 10);
    if (!isNaN(m) && m >= 0 && m <= 2) return m as 0 | 1 | 2;
  } catch {}
  return 0;
}
export function saveLearnMode(m: 0 | 1 | 2): void { safeSet(BK_LEARN, String(m)); }

export interface Geom { x: number; y: number; w: number; h: number; }
export function loadGeom(): Geom | null {
  try {
    const g = JSON.parse(safeGet(BK_GEOM) || 'null');
    if (g && typeof g.x === 'number' && typeof g.y === 'number') {
      return {
        x: Math.max(0, Math.min(window.innerWidth - 60, g.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, g.y)),
        w: Math.max(280, Math.min(window.innerWidth, g.w || 380)),
        h: Math.max(200, Math.min(window.innerHeight - 20, g.h || 500)),
      };
    }
  } catch {}
  return null;
}
export function saveGeom(g: Geom): void { safeSet(BK_GEOM, g); }

/* ========== 工具 ========== */
export function genId(p: string): string {
  return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ========== 分段（保留原算法） ========== */
export function splitPassages(text: string): string[] {
  const raw = text.split(/\n\s*\n/);
  const result: string[] = [];
  let buffer = '';
  for (let ri = 0; ri < raw.length; ri++) {
    const p = (raw[ri] || '').trim();
    if (!p) continue;
    if (p.length > MAX_CHARS) {
      if (buffer) { result.push(buffer); buffer = ''; }
      const sentences = p.match(/[^。！？\n…」』]+[。！？\n…」』]*/g) || [p];
      let chunk = '';
      for (let si = 0; si < sentences.length; si++) {
        if ((chunk + sentences[si]).length > MAX_CHARS && chunk) {
          result.push(chunk); chunk = sentences[si];
        } else { chunk += sentences[si]; }
      }
      if (chunk) result.push(chunk);
    } else if ((buffer + '\n' + p).length > MAX_CHARS) {
      if (buffer) result.push(buffer);
      buffer = p;
    } else {
      buffer = buffer ? buffer + '\n' + p : p;
    }
  }
  if (buffer) result.push(buffer);
  return result.length > 0 ? result : [text];
}

/* ========== 文件读取（txt，UTF-8/GBK 兜底） ========== */
export function readFileAsText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('读取失败'));
    r.readAsText(file, 'UTF-8');
  }).then(text => {
    if (text.indexOf('\ufffd') !== -1 && /[\u00e0-\u00ff]/.test(text)) {
      return new Promise<string>(resolve => {
        const r2 = new FileReader();
        r2.onload = () => resolve(r2.result as string);
        r2.onerror = () => resolve(text);
        r2.readAsText(file, 'GBK');
      });
    }
    return text;
  });
}

/* ========== epub 解析（JSZip + DOMParser） ========== */
const JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
let jszipP: Promise<any> | null = null;
export function loadJsZip(): Promise<any> {
  if ((window as any).JSZip) return Promise.resolve((window as any).JSZip);
  if (jszipP) return jszipP;
  jszipP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_CDN;
    s.onload = () => (window as any).JSZip ? resolve((window as any).JSZip) : reject(new Error('JSZip 加载异常'));
    s.onerror = () => reject(new Error('无法加载 JSZip'));
    document.head.appendChild(s);
  });
  return jszipP;
}

function joinPath(base: string, rel: string): string {
  if (!rel) return base;
  const dir = base.replace(/[^/]+$/, '');
  const parts = (dir + rel).split('/');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '..') { if (out.length > 0) out.pop(); }
    else if (parts[i] !== '.' && parts[i] !== '') out.push(parts[i]);
  }
  return out.join('/');
}

function xhtmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const rm = tmp.querySelectorAll('script,style,head,link,meta,title,noscript');
  rm.forEach(n => n.remove());
  const blks = tmp.querySelectorAll('p,div,br,h1,h2,h3,h4,h5,h6,li,tr');
  blks.forEach(n => n.appendChild(document.createTextNode('\n')));
  const t = tmp.textContent || '';
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractEpubText(file: File): Promise<string> {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(file);
  const containerXml = await zip.file('META-INF/container.xml').async('text');
  const cp = new DOMParser().parseFromString(containerXml, 'text/xml');
  const opfRel = cp.getElementsByTagName('rootfile')[0]?.getAttribute('full-path') || '';
  const opf = await zip.file(opfRel).async('text');
  const opfDoc = new DOMParser().parseFromString(opf, 'text/xml');
  const baseDir = opfRel.replace(/[^/]+$/, '');
  const spine = Array.from(opfDoc.getElementsByTagName('itemref')).map(
    el => el.getAttribute('idref'),
  ).filter(Boolean) as string[];
  const idMap = new Map<string, string>();
  Array.from(opfDoc.getElementsByTagName('item')).forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) idMap.set(id, joinPath(baseDir, href));
  });
  let full = '';
  for (const idref of spine) {
    const href = idMap.get(idref);
    if (!href) continue;
    const f = zip.file(href);
    if (!f) continue;
    const html = await f.async('text');
    full += xhtmlToText(html) + '\n\n';
  }
  return full.trim();
}

/* ========== 翻译（Google 非官方 + MyMemory fallback） ========== */
const GT_URL = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh&dt=t&q=';
const MM_URL = 'https://api.mymemory.translated.net/get?q=';
const MM_LANGPAIR = '&langpair=en|zh';

const transCache = new Map<string, string>();

export async function translateText(text: string): Promise<string> {
  const key = text;
  if (transCache.has(key)) return transCache.get(key)!;
  const q = encodeURIComponent(text.slice(0, TRANS_MAX));
  // Google（通常需要代理，fallback 到 MyMemory）
  try {
    const res = await fetch(GT_URL + q, { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      const joined = (data?.[0] || []).map((seg: any) => seg?.[0] || '').join('');
      if (joined) { transCache.set(key, joined); return joined; }
    }
  } catch {}
  // MyMemory fallback
  try {
    const res = await fetch(MM_URL + q + MM_LANGPAIR, { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      const t = data?.responseData?.translatedText;
      if (t) { transCache.set(key, t); return t; }
    }
  } catch {}
  return '';
}

/* ========== Gutenberg 公版书搜索 ========== */
export interface GutendexSearchResult {
  hits: GutendexHit[];
  nextUrl: string | null;
  error?: string;
}

export async function searchGutendex(query: string, url?: string | null): Promise<GutendexSearchResult> {
  const target = url || GUTENDEX_API + encodeURIComponent(query);
  try {
    const res = await fetch(target, { mode: 'cors' });
    if (!res.ok) return { hits: [], nextUrl: null, error: '搜索失败' };
    const data = await res.json();
    const hits: GutendexHit[] = (data.results || []).map((r: any) => ({
      id: r.id,
      title: r.title || '',
      authors: (r.authors || []).map((a: any) => a.name).join(', '),
      formats: r.formats || {},
    }));
    return { hits, nextUrl: data.next || null };
  } catch {
    return { hits: [], nextUrl: null, error: '搜索失败，请检查网络' };
  }
}

async function fetchTextFallback(urls: string[]): Promise<string> {
  for (const u of urls) {
    try {
      const res = await fetch(CORS_PROXY + u, { mode: 'cors' });
      if (res.ok) return await res.text();
    } catch {}
  }
  throw new Error('下载失败');
}

export async function downloadGutendexBook(hit: GutendexHit): Promise<{ title: string; text: string }> {
  // 直接构造 cache/epub 路径（不重定向），避免 cors.sh 处理 302 拼错 URL
  const id = hit.id;
  const cacheUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  let text: string;
  try {
    text = await fetchTextFallback([cacheUrl, `https://www.gutenberg.org/files/${id}/${id}.txt`, hit.formats['text/plain; charset=utf-8'] || '']);
  } catch {
    throw new Error('下载失败');
  }
  // 清理 Gutenberg 头尾
  const start = text.indexOf('*** START OF THE PROJECT GUTENBERG EBOOK');
  const end = text.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK');
  let cleaned = text;
  if (start !== -1 && end !== -1) {
    cleaned = text.slice(start, end);
  }
  return { title: hit.title, text: cleaned };
}
