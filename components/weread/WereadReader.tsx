/**
 * 微信读书「阅读器」：章节目录、正文分章、字号调节、夜间模式、本地续读。
 * 正文接口偶有不稳 → 拿不到正文时给"暂不可读"降级提示，不影响其它页。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWereadChapters, fetchWereadRead } from '../../utils/weread/wereadApi';
import type { WereadChapter } from '../../utils/weread/types';
import { ErrorHint, HeaderBar, Spinner } from './WereadShared';

interface Props {
  bookId: string;
  bookTitle: string;
  onBack: () => void;
}

function progressKey(bookId: string): string {
  return `os_weread_progress_${bookId}`;
}

/** 在嵌套对象里尽量找正文文本（worker 归一化可能改动，这里做兜底提取） */
function extractChapterText(raw: unknown, depth = 0): string {
  if (depth > 4 || raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const s = extractChapterText(v, depth + 1);
      if (s) return s;
    }
    return '';
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const preferred = ['content', 'html', 'text', 'body', 'txt'];
    for (const k of preferred) {
      if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim();
    }
    for (const v of Object.values(obj)) {
      const s = extractChapterText(v, depth + 1);
      if (s) return s;
    }
  }
  return '';
}

export default function WereadReader({ bookId, bookTitle, onBack }: Props) {
  const [chapters, setChapters] = useState<WereadChapter[]>([]);
  const [chapterMap] = useState<Map<string, string>>(() => new Map());
  const [currentUid, setCurrentUid] = useState<string>('');
  const [body, setBody] = useState('');
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [loadingBody, setLoadingBody] = useState(false);
  const [error, setError] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [night, setNight] = useState(() => {
    try { return localStorage.getItem('os_weread_night') === '1'; } catch { return false; }
  });

  const loadChapters = useCallback(async () => {
    setLoadingChapters(true);
    setError('');
    try {
      const list = await fetchWereadChapters(bookId);
      setChapters(list);
      let start: WereadChapter | undefined;
      try {
        const saved = localStorage.getItem(progressKey(bookId));
        if (saved) {
          const hit = list.find(c => c.uid === saved);
          if (hit) start = hit;
        }
      } catch { /* ignore */ }
      if (!start && list.length) start = list[0];
      if (start) {
        setCurrentUid(start.uid);
        void loadBody(start.uid);
      }
    } catch (e: any) {
      setError(e?.message || '目录加载失败');
    } finally {
      setLoadingChapters(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const loadBody = useCallback(async (uid: string) => {
    const hit = chapterMap.get(uid);
    if (hit) { setBody(hit); return; }
    setLoadingBody(true);
    setError('');
    try {
      const raw = await fetchWereadRead(bookId, uid);
      const text = extractChapterText(raw);
      if (!text) {
        setBody('');
        setError('该书正文暂不可读（会员书或接口受限）');
      } else {
        chapterMap.set(uid, text);
        setBody(text);
      }
    } catch (e: any) {
      setError(e?.message || '正文加载失败');
    } finally {
      setLoadingBody(false);
    }
  }, [bookId, chapterMap]);

  useEffect(() => { loadChapters(); }, [loadChapters]);

  useEffect(() => {
    if (!currentUid) return;
    try { localStorage.setItem(progressKey(bookId), currentUid); } catch { /* ignore */ }
  }, [currentUid, bookId]);

  const idx = useMemo(() => chapters.findIndex(c => c.uid === currentUid), [chapters, currentUid]);

  const go = (uid: string) => {
    setCurrentUid(uid);
    setListOpen(false);
    setBody('');
    void loadBody(uid);
  };
  const goRel = (delta: number) => {
    if (idx < 0) return;
    const next = chapters[idx + delta];
    if (next) go(next.uid);
  };
  const toggleNight = () => {
    setNight(v => {
      const nv = !v;
      try { localStorage.setItem('os_weread_night', nv ? '1' : '0'); } catch { /* ignore */ }
      return nv;
    });
  };

  const curChapter = chapters[idx];
  const isHtml = body.includes('<');

  const surface = night ? '#1E2328' : '#F5F1E6';
  const textColor = night ? '#C9C5BC' : '#2B2B2B';
  const chip = night ? 'bg-white/10 text-emerald-100' : 'bg-white border border-emerald-100 text-emerald-700';
  const bar = night ? 'bg-[#1A1E22]/95' : 'bg-white/90';

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: surface }}>
      <HeaderBar
        title={curChapter ? curChapter.title : bookTitle}
        onBack={onBack}
        subtitle={curChapter ? `${idx + 1}/${chapters.length}` : bookTitle}
        right={
          <button type="button" onClick={() => setListOpen(v => !v)} className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${chip}`} aria-label="目录">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 py-6">
        {loadingChapters ? (
          <Spinner label="正在打开书…" />
        ) : loadingBody ? (
          <Spinner label="加载章节…" />
        ) : error && !body ? (
          <ErrorHint message={error} onRetry={() => currentUid && loadBody(currentUid)} />
        ) : (
          <article className="mx-auto max-w-[640px]">
            <h2 className="font-semibold mb-5" style={{ fontSize: fontSize + 6, color: textColor }}>{curChapter?.title}</h2>
            {isHtml ? (
              <div
                className="leading-loose [&_p]:my-3"
                style={{ fontSize, color: textColor }}
                // 正文由微信读书网页接口返回，仅做样式剥离后展示
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <div className="whitespace-pre-wrap leading-loose" style={{ fontSize, color: textColor }}>{body}</div>
            )}
          </article>
        )}
      </div>

      {/* 底部控制条 */}
      <div className={`shrink-0 border-t flex items-center gap-2 px-3 py-2 ${bar}`} style={{ borderColor: night ? '#ffffff14' : '#e7f6ee' }}>
        <button type="button" disabled={idx <= 0} onClick={() => goRel(-1)} className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 ${chip}`} aria-label="上一章">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12l7.5-7.5m7.5 15L10.5 12l7.5-7.5" /></svg>
        </button>
        <span className="text-[10px] text-emerald-700/50 select-none" style={{ color: night ? '#ffffff55' : undefined }}>{idx + 1}/{chapters.length}</span>
        <div className="flex-1" />
        <button type="button" onClick={() => setFontSize(v => Math.max(15, v - 1))} className={`w-8 h-8 rounded-full text-xs font-bold active:scale-90 transition-transform ${chip}`}>A−</button>
        <button type="button" onClick={() => setFontSize(v => Math.min(26, v + 1))} className={`w-8 h-8 rounded-full text-sm font-bold active:scale-90 transition-transform ${chip}`}>A+</button>
        <button type="button" onClick={toggleNight} className={`w-8 h-8 rounded-full flex items-center justify-center text-base active:scale-90 transition-transform ${chip}`} aria-label="夜间">
          {night ? '☀️' : '🌙'}
        </button>
        <button type="button" disabled={idx < 0 || idx >= chapters.length - 1} onClick={() => goRel(1)} className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 ${chip}`} aria-label="下一章">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m13.5 4.5 7.5 7.5-7.5 7.5m-7.5-15 7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>

      {/* 目录抽屉 */}
      {listOpen && (
        <div className="absolute inset-0 z-20 flex" style={{ backgroundColor: night ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)' }}>
          <div className="ml-auto w-[78%] max-w-sm h-full overflow-y-auto no-scrollbar p-3 space-y-0.5" style={{ backgroundColor: surface }}>
            <p className="px-2 py-2 text-xs font-semibold" style={{ color: night ? '#fff9' : '#07A05C' }}>目录 · {chapters.length} 章</p>
            {chapters.map((c, i) => (
              <button
                key={c.uid}
                type="button"
                onClick={() => go(c.uid)}
                className={`w-full text-left px-2 py-2 rounded-lg text-[13px] leading-snug active:scale-[0.99] transition-transform ${c.uid === currentUid ? 'bg-emerald-600 text-white' : ''}`}
                style={c.uid === currentUid ? undefined : { color: textColor }}
              >
                <span className="mr-1.5 opacity-50">{i + 1}</span>{c.title}
              </button>
            ))}
          </div>
          <div className="flex-1" onClick={() => setListOpen(false)} />
        </div>
      )}
    </div>
  );
}
