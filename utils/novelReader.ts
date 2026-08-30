/**
 * 小说共读 v9.2.7 — SullyOS 适配版
 * 从 CSY OS 插件 novel-reader-code.js 移植，React/TS 重写核心逻辑。
 *
 * 数据全部存 localStorage（SullyOS 无 Sully.storage，直接用 localStorage），
 * key 沿用原插件前缀 "nrcache_" 以兼容用户已有数据。
 *
 * 功能：书架 / txt·epub 导入 / Gutenberg 公版书搜索 / 翻译(长按选中) /
 *       生词本 / 学习模式 / 皮肤 / 字号 / AI 共读上下文。
 */

/* ========== 类型 ========== */
export interface Book {
  id: string;
  title: string;
  source: 'local' | 'online';
  passages: string[];
  createdAt: number;
}

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
export function loadBooks(): Book[] {
  try {
    const d = safeGet(BK_BOOKS);
    if (d) { const p = JSON.parse(d); if (Array.isArray(p)) return p; }
  } catch {}
  return [];
}
export function saveBooks(books: Book[]): void { safeSet(BK_BOOKS, books); }

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
  return SKINS.some(k => k.id === s) ? s : 'default';
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
