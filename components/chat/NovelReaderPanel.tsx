/**
 * 小说共读 — 可拖拽缩放悬浮面板
 * 从 CSY OS 插件移植，React/TS 重写。书架 / 阅读器 / 生词本 / Gutenberg 搜索。
 *
 * 与 GlobalMiniPlayer 类似：面板可整体拖动（头部），右下角手柄可缩放；
 * 白天/夜间主题 + 阅读皮肤 + 字号；长按选中可翻译/复制。
 * AI 共读：onContextChange 把当前段落 + 学习模式回传给父组件，注入 AI 上下文。
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Book, BookOpenText, X, CaretDown, CaretUp, Trash, UploadSimple,
  MagnifyingGlass, ArrowLeft, ArrowRight, PaintBrush, Sun, Moon,
  TextAa, Translate, Copy, PencilSimple, GraduationCap, ChatCircleDots,
} from '@phosphor-icons/react';
import {
  loadBooks, saveBooks, loadCurrentBookId, saveCurrentBookId,
  loadProgress, saveProgress, loadTheme, saveTheme,
  loadSkin, saveSkin, loadFontSize, saveFontSize,
  loadVocab, saveVocab, loadLearnMode, saveLearnMode,
  loadGeom, saveGeom, splitPassages, readFileAsText,
  extractEpubText, translateText, searchGutendex, downloadGutendexBook,
  SKINS, FS_MIN, FS_MAX, FS_STEP, genId,
  type Book as NovelBook, type VocabEntry, type GutendexHit,
} from '../../utils/novelReader';

const DRAG_THRESHOLD = 4;
const MIN_W = 280, MIN_H = 200;

interface NovelReaderPanelProps {
  charName: string;
  onClose: () => void;
  onContextChange: (ctx: { bookTitle: string; passage: string; learnMode: 0 | 1 | 2; recentVocab: VocabEntry[] }) => void;
}

type View = 'shelf' | 'reader' | 'vocab' | 'search';

const NovelReaderPanel: React.FC<NovelReaderPanelProps> = ({ charName, onClose, onContextChange }) => {
  const [books, setBooks] = useState<NovelBook[]>(() => loadBooks());
  const [currentBookId, setCurrentBookId] = useState<string | null>(() => loadCurrentBookId());
  const [progress, setProgress] = useState<Record<string, number>>(() => loadProgress());
  const [theme, setTheme] = useState<'day' | 'night'>(() => loadTheme());
  const [skin, setSkin] = useState<string>(() => loadSkin());
  const [fontSize, setFontSize] = useState<number>(() => loadFontSize());
  const [vocab, setVocab] = useState<VocabEntry[]>(() => loadVocab());
  const [learnMode, setLearnMode] = useState<0 | 1 | 2>(() => loadLearnMode());
  const [view, setView] = useState<View>('shelf');
  const [folded, setFolded] = useState(false);
  const [skinBar, setSkinBar] = useState(false);

  // 面板几何（可拖可缩放）。
  // 每次打开都重置到屏幕中间（避免记忆上次被拖到角落/顶上而点不到），仅保留尺寸记忆。
  const [geom, setGeom] = useState<{ x: number; y: number; w: number; h: number }>(() => {
    const saved = loadGeom();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = saved?.w || 380;
    const h = saved?.h || 500;
    return { x: Math.max(4, Math.round((vw - w) / 2)), y: Math.max(4, Math.round((vh - h) / 2)), w, h };
  });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; offX: number; offY: number; startGeom: { x: number; y: number; w: number; h: number }; parentW: number; parentH: number; moved: boolean; pointerId: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; startW: number; startH: number; parentW: number; parentH: number; moved: boolean; pointerId: number } | null>(null);

  // 阅读器状态
  const [inputRef, setInputRef] = useState<HTMLInputElement | null>(null);
  // 搜索状态
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<GutendexHit[]>([]);
  const [searchNext, setSearchNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const curBook = useMemo(() => books.find(b => b.id === currentBookId) || null, [books, currentBookId]);
  const idx = curBook ? Math.min(progress[curBook.id] || 0, Math.max(curBook.passages.length - 1, 0)) : 0;

  // 持久化
  useEffect(() => saveBooks(books), [books]);
  useEffect(() => saveCurrentBookId(currentBookId), [currentBookId]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveSkin(skin), [skin]);
  useEffect(() => saveFontSize(fontSize), [fontSize]);
  useEffect(() => saveVocab(vocab), [vocab]);
  useEffect(() => saveLearnMode(learnMode), [learnMode]);
  useEffect(() => saveGeom(geom), [geom]);

  // AI 共读上下文上报（当前段落 + 最近生词 + 学习模式）
  useEffect(() => {
    if (!curBook) return;
    const passage = curBook.passages[idx] || '';
    const recentVocab = vocab.slice(0, 15);
    onContextChange({ bookTitle: curBook.title, passage, learnMode, recentVocab });
  }, [curBook, idx, vocab, learnMode, onContextChange]);

  const isNight = theme === 'night';
  const panelBg = isNight ? '#1e2430' : '#ffffff';
  const panelFg = isNight ? '#e2e8f0' : '#1f2937';
  const subFg = isNight ? '#94a3b8' : '#64748b';
  const barBg = isNight ? '#252d3b' : '#f8fafc';
  const border = isNight ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)';
  const skinObj = SKINS.find(s => s.id === skin) || SKINS[0];

  /* ---- 拖拽移动 ---- */
  const onHeadDown = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 快照起始几何 + 手指相对面板的偏移；移动时用「起始位置 + 累计位移」避免二次叠加
    dragState.current = {
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top,
      startGeom: geom,
      parentW: (el.parentElement?.getBoundingClientRect().width || window.innerWidth),
      parentH: (el.parentElement?.getBoundingClientRect().height || window.innerHeight),
      moved: false, pointerId: e.pointerId,
    };
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX, dy = e.clientY - ds.startY;
    if (!ds.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) ds.moved = true;
    if (!ds.moved) return;
    // 用起始几何 + 本次累计位移，保持手指相对面板的位置，不做增量叠加
    setGeom({
      ...ds.startGeom,
      x: Math.max(0, Math.min(ds.parentW - ds.startGeom.w, ds.startGeom.x + dx)),
      y: Math.max(0, Math.min(ds.parentH - 24, ds.startGeom.y + dy)),
    });
  };
  const onHeadUp = (e: React.PointerEvent) => {
    dragState.current = null;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
  };

  /* ---- 缩放（右下角手柄） ---- */
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    resizeState.current = {
      startX: e.clientX, startY: e.clientY,
      startW: rect.width, startH: rect.height,
      parentW: rect.width, parentH: rect.height,
      moved: false, pointerId: e.pointerId,
    };
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const rs = resizeState.current;
    if (!rs) return;
    const dx = e.clientX - rs.startX, dy = e.clientY - rs.startY;
    if (!rs.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) rs.moved = true;
    if (!rs.moved) return;
    setGeom(g => ({
      ...g,
      w: Math.max(MIN_W, Math.min(window.innerWidth, rs.startW + dx)),
      h: Math.max(MIN_H, Math.min(window.innerHeight - 20, rs.startH + dy)),
    }));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    resizeState.current = null;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
  };

  /* ---- 导入 txt/epub ---- */
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let text = '';
    if (/\.epub$/i.test(file.name)) {
      try { text = await extractEpubText(file); } catch { text = ''; }
      if (!text) { alert('epub 解析失败'); return; }
    } else {
      try { text = await readFileAsText(file); } catch { alert('读取失败'); return; }
    }
    const title = file.name.replace(/\.(txt|epub)$/i, '');
    const book: NovelBook = { id: genId('b'), title, source: 'local', passages: splitPassages(text), createdAt: Date.now() };
    setBooks(prev => [book, ...prev]);
    setCurrentBookId(book.id);
    setView('reader');
    e.target.value = '';
  };

  /* ---- 翻译 + 生词本 ---- */
  const [selText, setSelText] = useState('');
  const [selBubble, setSelBubble] = useState<{ x: number; y: number; trans: string; loading: boolean } | null>(null);
  const onSelect = useCallback(() => {
    const s = window.getSelection();
    const t = s ? s.toString().trim() : '';
    if (t && t.length <= 200) {
      const rect = s!.getRangeAt(0).getBoundingClientRect();
      setSelText(t);
      setSelBubble({ x: rect.left, y: rect.top, trans: '', loading: false });
    }
  }, []);
  const doTranslate = async () => {
    if (!selText || !selBubble) return;
    setSelBubble(b => b ? { ...b, loading: true } : b);
    const t = await translateText(selText);
    setSelBubble(b => b ? { ...b, trans: t, loading: false } : b);
    if (t) {
      setVocab(prev => {
        if (prev.some(v => v.src === selText)) return prev;
        const b = books.find(bb => bb.id === currentBookId);
        const next = [{ src: selText, trans: t, bookId: b?.id || '', bookTitle: b?.title || '', ts: Date.now() }, ...prev].slice(0, 500);
        return next;
      });
    }
  };
  const doCopy = () => {
    if (!selText) return;
    try { navigator.clipboard.writeText(selText); } catch {}
    setSelBubble(null);
  };

  /* ---- 搜索 ---- */
  const doSearch = async (next?: string | null) => {
    if (!searchQ.trim() && !next) return;
    setSearching(true);
    const r = await searchGutendex(searchQ, next);
    setSearchHits(r.hits);
    setSearchNext(r.nextUrl);
    setSearching(false);
  };
  const doDownload = async (hit: GutendexHit) => {
    setDownloading(hit.id.toString());
    try {
      const { title, text } = await downloadGutendexBook(hit);
      const book: NovelBook = { id: genId('b'), title, source: 'online', passages: splitPassages(text), createdAt: Date.now() };
      setBooks(prev => [book, ...prev]);
      setCurrentBookId(book.id);
      setView('reader');
    } catch (err: any) {
      alert(err.message || '下载失败');
    }
    setDownloading(null);
  };

  /* ---- 学习模式循环 ---- */
  const cycleLearn = () => setLearnMode(m => ((m + 1) % 3) as 0 | 1 | 2);

  /* ---- 头部图标按钮通用样式 ---- */
  const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: subFg, background: 'transparent', border: 'none', cursor: 'pointer' };

  if (folded) {
    return (
      <div
        ref={wrapRef}
        className="absolute z-[60] shadow-2xl overflow-hidden"
        style={{ left: geom.x, top: geom.y, width: MIN_W, height: 40, background: barBg, border: `1px solid ${border}`, borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.25)', pointerEvents: 'auto' }}
      >
        <div onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp} onPointerCancel={onHeadUp}
          className="flex items-center gap-2 px-3 h-10 cursor-grab active:cursor-grabbing touch-none select-none"
          style={{ color: panelFg }}>
          <BookOpenText size={16} weight="fill" color="#f59e0b" />
          <span className="text-xs font-bold truncate flex-1">{curBook ? curBook.title : '小说共读'}</span>
          <button onClick={() => setFolded(false)} style={iconBtn} title="展开"><CaretUp size={16} /></button>
          <button onClick={onClose} style={iconBtn} title="关闭"><X size={16} /></button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="absolute z-[60] shadow-2xl overflow-hidden"
      style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h, background: panelBg, border: `1px solid ${border}`, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}
    >
      {/* 头部 */}
      <div onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp} onPointerCancel={onHeadUp}
        className="flex items-center gap-1 px-2 h-10 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ background: barBg, borderBottom: `1px solid ${border}`, color: panelFg }}>
        <BookOpenText size={16} weight="fill" color="#f59e0b" />
        <span className="text-xs font-bold truncate flex-1">{curBook ? curBook.title : '小说共读'}</span>
        {view === 'reader' && curBook && (
          <button onClick={() => setView('shelf')} style={iconBtn} title="书架"><Book size={16} /></button>
        )}
        <button onClick={() => setSkinBar(v => !v)} style={iconBtn} title="皮肤"><PaintBrush size={16} /></button>
        <button onClick={() => setTheme(t => t === 'day' ? 'night' : 'day')} style={iconBtn} title="白天/夜间">
          {isNight ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={() => setFolded(true)} style={iconBtn} title="折叠"><CaretDown size={16} /></button>
        <button onClick={onClose} style={iconBtn} title="关闭"><X size={16} /></button>
      </div>

      {/* 皮肤选择条 */}
      {skinBar && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0" style={{ background: barBg, borderBottom: `1px solid ${border}` }}>
          {SKINS.map(s => (
            <button key={s.id} onClick={() => setSkin(s.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium"
              style={{ background: s.chipBg, border: `1px solid ${s.chipBd}`, color: s.fg, outline: skin === s.id ? '2px solid #f59e0b' : 'none' }}>
              {s.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-0.5" style={{ color: subFg }}>
            <button onClick={() => setFontSize(f => Math.max(FS_MIN, f - FS_STEP))} style={iconBtn} title="减小字号"><TextAa size={14} /></button>
            <span className="text-[10px]">{fontSize}</span>
            <button onClick={() => setFontSize(f => Math.min(FS_MAX, f + FS_STEP))} style={iconBtn} title="增大字号"><TextAa size={18} /></button>
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto" style={{ color: panelFg }}>
        {view === 'shelf' && (
          <ShelfView
            books={books}
            theme={theme}
            panelBg={panelBg}
            panelFg={panelFg}
            subFg={subFg}
            border={border}
            onImport={onImportFile}
            onOpen={(id) => { setCurrentBookId(id); setView('reader'); }}
            onRemove={(id) => {
              setBooks(prev => prev.filter(b => b.id !== id));
              if (currentBookId === id) { setCurrentBookId(null); setView('shelf'); }
            }}
            onVocab={() => setView('vocab')}
            onSearch={() => { setView('search'); setSearchHits([]); }}
          />
        )}

        {view === 'reader' && curBook && (
          <ReaderView
            book={curBook}
            idx={idx}
            theme={theme}
            skin={skinObj}
            fontSize={fontSize}
            panelBg={panelBg}
            panelFg={panelFg}
            subFg={subFg}
            onSelect={onSelect}
            onPrev={() => setProgress(p => ({ ...p, [curBook.id]: Math.max(0, idx - 1) }))}
            onNext={() => setProgress(p => ({ ...p, [curBook.id]: Math.min(curBook.passages.length - 1, idx + 1) }))}
          />
        )}

        {view === 'vocab' && (
          <VocabView
            vocab={vocab}
            theme={theme}
            panelBg={panelBg}
            panelFg={panelFg}
            subFg={subFg}
            border={border}
            onRemove={(src) => setVocab(prev => prev.filter(v => v.src !== src))}
            onClear={() => setVocab([])}
            onBack={() => setView('shelf')}
            learnMode={learnMode}
            onCycleLearn={cycleLearn}
          />
        )}

        {view === 'search' && (
          <SearchView
            q={searchQ}
            setQ={setSearchQ}
            hits={searchHits}
            searching={searching}
            downloading={downloading}
            theme={theme}
            panelBg={panelBg}
            panelFg={panelFg}
            subFg={subFg}
            border={border}
            onSearch={doSearch}
            onDownload={doDownload}
            onNext={searchNext ? () => doSearch(searchNext) : undefined}
            onBack={() => setView('shelf')}
          />
        )}
      </div>

      {/* 阅读器底部进度 */}
      {view === 'reader' && curBook && (
        <div className="shrink-0 px-3 pb-2" style={{ color: subFg }}>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: isNight ? '#2c3646' : '#e2e8f0' }}>
            <div className="h-full bg-amber-500" style={{ width: `${curBook.passages.length > 1 ? ((idx + 1) / curBook.passages.length) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px]">
            <span>第 {idx + 1} / {curBook.passages.length} 段</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setProgress(p => ({ ...p, [curBook.id]: Math.max(0, idx - 1) }))} style={iconBtn}><ArrowLeft size={14} /></button>
              <button onClick={() => setProgress(p => ({ ...p, [curBook.id]: Math.min(curBook.passages.length - 1, idx + 1) }))} style={iconBtn}><ArrowRight size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {/* 长按选中翻译气泡 */}
      {selBubble && (
        <div className="absolute z-10 flex items-center gap-1 rounded-lg shadow-xl px-1.5 py-1"
          style={{ left: selBubble.x, top: selBubble.y - 34, background: isNight ? '#2c3646' : '#fff', border: `1px solid ${border}`, color: panelFg }}>
          {selBubble.loading ? <span className="text-[10px] px-1">翻译中…</span> : selBubble.trans ? (
            <span className="text-[10px] max-w-[200px] truncate">{selBubble.trans}</span>
          ) : (
            <>
              <button onClick={doTranslate} style={{ ...iconBtn, width: 28, height: 28 }} title="翻译"><Translate size={14} /></button>
              <button onClick={doCopy} style={{ ...iconBtn, width: 28, height: 28 }} title="复制"><Copy size={14} /></button>
            </>
          )}
          <button onClick={() => setSelBubble(null)} style={{ ...iconBtn, width: 24, height: 24 }} title="关闭"><X size={12} /></button>
        </div>
      )}

      {/* 缩放手柄 */}
      <div onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} onPointerCancel={onResizeUp}
        className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize touch-none select-none"
        style={{ background: isNight ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.2)', borderRadius: '4px 0 12px 0', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
      />
    </div>
  );
};

/* ========== 书架视图 ========== */
function ShelfView(props: {
  books: NovelBook[]; panelBg: string; panelFg: string; subFg: string; border: string;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void; onOpen: (id: string) => void; onRemove: (id: string) => void;
  onVocab: () => void; onSearch: () => void;
}) {
  const { books, panelBg, panelFg, subFg, border } = props;
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold cursor-pointer active:scale-95 transition-transform"
          style={{ background: '#f59e0b', color: '#fff' }}>
          <UploadSimple size={14} /> 导入小说 (txt/epub)
          <input type="file" accept=".txt,.epub" className="hidden" onChange={props.onImport} />
        </label>
        <button onClick={props.onSearch} className="p-2 rounded-lg text-xs" style={{ background: panelBg, border: `1px solid ${border}`, color: subFg }} title="在线搜索"><MagnifyingGlass size={15} /></button>
        <button onClick={props.onVocab} className="p-2 rounded-lg text-xs relative" style={{ background: panelBg, border: `1px solid ${border}`, color: subFg }} title="生词本">
          <PencilSimple size={15} />
          {props.books.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />}
        </button>
      </div>

      {books.length === 0 ? (
        <div className="text-center py-10" style={{ color: subFg }}>
          <BookOpenText size={40} weight="thin" className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">书架空空如也</p>
          <p className="text-[10px] mt-1">导入一本小说，或在线搜索公版名著</p>
        </div>
      ) : (
        books.map(b => (
          <div key={b.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: panelBg, border: `1px solid ${border}` }}>
            <div className="w-8 h-10 rounded flex items-center justify-center" style={{ background: '#f59e0b' }}>
              <Book size={16} weight="fill" color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate" style={{ color: panelFg }}>{b.title}</div>
              <div className="text-[10px]" style={{ color: subFg }}>
                {b.passages.length} 段 · {b.source === 'online' ? '🌐 在线' : '📄 本地'}
                {props.books.length > 0 && <span className="ml-1 text-[10px]">· {Math.round(((props.books[0].passages.length > 0 ? 0 : 0)))}</span>}
              </div>
            </div>
            <button onClick={() => props.onOpen(b.id)} className="px-2.5 py-1 rounded-md text-[10px] font-bold" style={{ background: '#f59e0b', color: '#fff' }}>阅读</button>
            <button onClick={() => props.onRemove(b.id)} style={{ color: subFg, padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }} title="删除"><Trash size={14} /></button>
          </div>
        ))
      )}
    </div>
  );
}

/* ========== 阅读器视图 ========== */
function ReaderView(props: {
  book: NovelBook; idx: number; theme: 'day' | 'night'; skin: typeof SKINS[number]; fontSize: number;
  panelBg: string; panelFg: string; subFg: string; onSelect: () => void;
  onPrev: () => void; onNext: () => void;
}) {
  const { book, idx, skin, fontSize, subFg } = props;
  return (
    <div
      className="px-4 py-3 select-text"
      style={{ background: skin.bg, color: skin.fg, fontSize, lineHeight: 1.8, minHeight: '100%' }}
      onMouseUp={props.onSelect}
      onTouchEnd={props.onSelect}
    >
      <p className="whitespace-pre-wrap">{book.passages[idx] || ''}</p>
    </div>
  );
}

/* ========== 生词本视图 ========== */
function VocabView(props: {
  vocab: VocabEntry[]; theme: 'day' | 'night'; panelBg: string; panelFg: string; subFg: string; border: string;
  onRemove: (src: string) => void; onClear: () => void; onBack: () => void;
  learnMode: 0 | 1 | 2; onCycleLearn: () => void;
}) {
  const { vocab, panelBg, panelFg, subFg, border } = props;
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <button onClick={props.onBack} className="p-2 rounded-lg text-xs" style={{ background: panelBg, border: `1px solid ${border}`, color: subFg }}><ArrowLeft size={14} /></button>
        <span className="text-xs font-bold flex-1" style={{ color: panelFg }}>生词本 ({vocab.length})</span>
        {vocab.length > 0 && (
          <button onClick={props.onClear} className="p-2 rounded-lg text-xs" style={{ background: panelBg, border: `1px solid ${border}`, color: '#ef4444' }} title="清空"><Trash size={14} /></button>
        )}
      </div>

      {/* 学习模式（收进生词本） */}
      <button onClick={props.onCycleLearn} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold"
        style={{ border: `1px solid ${border}`, color: props.theme === 'night' ? '#c4b5fd' : '#7c3aed', background: panelBg }}>
        <GraduationCap size={13} />
        {props.learnMode === 0 ? '学习模式: 关（点击切换）' : props.learnMode === 1 ? '学习模式: 被动复习（点击切换）' : '学习模式: 主动测验（点击切换）'}
      </button>

      {vocab.length === 0 ? (
        <div className="text-center py-10 text-xs" style={{ color: subFg }}>还没有生词。在阅读时长按选中单词即可翻译并加入生词本。</div>
      ) : (
        vocab.map(v => (
          <div key={v.src} className="p-2.5 rounded-xl" style={{ background: panelBg, border: `1px solid ${border}` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold" style={{ color: panelFg }}>{v.src}</div>
                <div className="text-xs mt-0.5" style={{ color: subFg }}>{v.trans}</div>
                <div className="text-[10px] mt-1" style={{ color: subFg, opacity: 0.7 }}>{v.bookTitle}</div>
              </div>
              <button onClick={() => props.onRemove(v.src)} style={{ color: subFg, padding: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ========== 搜索视图 ========== */
function SearchView(props: {
  q: string; setQ: (v: string) => void; hits: GutendexHit[]; searching: boolean; downloading: string | null;
  theme: 'day' | 'night'; panelBg: string; panelFg: string; subFg: string; border: string;
  onSearch: (next?: string | null) => void; onDownload: (hit: GutendexHit) => void; onNext?: () => void; onBack: () => void;
}) {
  const { q, setQ, hits, searching, downloading, panelBg, panelFg, subFg, border } = props;
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <button onClick={props.onBack} className="p-2 rounded-lg text-xs" style={{ background: panelBg, border: `1px solid ${border}`, color: subFg }}><ArrowLeft size={14} /></button>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && props.onSearch()}
          placeholder="搜索英文公版名著" className="flex-1 px-3 py-2 rounded-lg text-xs focus:outline-none"
          style={{ background: panelBg, border: `1px solid ${border}`, color: panelFg }} />
        <button onClick={() => props.onSearch()} className="p-2 rounded-lg" style={{ background: '#f59e0b', color: '#fff' }}><MagnifyingGlass size={14} /></button>
      </div>
      {searching && <div className="text-center py-8 text-xs" style={{ color: subFg }}>搜索中…</div>}
      {!searching && hits.length === 0 && <div className="text-center py-8 text-xs" style={{ color: subFg }}>输入关键词搜索 Project Gutenberg 公版书</div>}
      {hits.map(h => (
        <div key={h.id} className="p-2.5 rounded-xl" style={{ background: panelBg, border: `1px solid ${border}` }}>
          <div className="text-xs font-bold" style={{ color: panelFg }}>{h.title}</div>
          <div className="text-[10px] mt-0.5" style={{ color: subFg }}>{h.authors || '佚名'}</div>
          <button onClick={() => props.onDownload(h)} disabled={downloading === h.id.toString()}
            className="mt-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold disabled:opacity-50"
            style={{ background: '#f59e0b', color: '#fff' }}>
            {downloading === h.id.toString() ? '下载中…' : '下载并加入书架'}
          </button>
        </div>
      ))}
      {props.onNext && !searching && (
        <button onClick={props.onNext} className="w-full py-2 rounded-lg text-[10px]" style={{ border: `1px solid ${border}`, color: subFg }}>加载更多</button>
      )}
    </div>
  );
}

export default NovelReaderPanel;
