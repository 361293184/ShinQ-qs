/**
 * 微信读书「笔记」：某本书的划线 + 想法列表，点开查看详情，可复制原文。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWereadNotes } from '../../utils/weread/wereadApi';
import { useOS } from '../../context/OSContext';
import type { WereadNote } from '../../utils/weread/types';
import { EmptyHint, ErrorHint, HeaderBar, Spinner } from './WereadShared';

interface Props {
  bookId: string;
  bookTitle: string;
  onBack: () => void;
}

export default function WereadNotes({ bookId, bookTitle, onBack }: Props) {
  const { addToast } = useOS();
  const [notes, setNotes] = useState<WereadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setNotes(await fetchWereadNotes(bookId));
    } catch (e: any) {
      setError(e?.message || '笔记加载失败');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { load(); }, [load]);

  const copy = (n: WereadNote) => {
    const text = [n.markText, n.content].filter(Boolean).join('\n');
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    addToast('已复制', 'success');
  };

  return (
    <>
      <HeaderBar title="笔记" onBack={onBack} subtitle={bookTitle} />
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#F7F8F6] px-3 py-3 space-y-2.5">
        {loading ? (
          <Spinner label="正在整理划线…" />
        ) : error ? (
          <ErrorHint message={error} onRetry={() => load()} />
        ) : notes.length === 0 ? (
          <EmptyHint title="还没有笔记" desc="在阅读里划下的句子和想法会出现在这里" />
        ) : (
          notes.map((n, i) => {
            const open = expanded === i;
            return (
              <div key={`${n.bookId}-${i}`} className="rounded-2xl bg-white border border-emerald-100 overflow-hidden">
                {n.chapterTitle && <p className="px-3.5 pt-3 text-[10px] text-emerald-800/40">{n.chapterTitle}</p>}
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : i)}
                  className="w-full text-left px-3.5 py-3"
                >
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${n.noteType === 'thought' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {n.noteType === 'thought' ? '想法' : '划线'}
                    </span>
                    <div className="min-w-0 flex-1">
                      {n.markText && (
                        <p className={`text-[13px] text-emerald-950 leading-relaxed ${!open ? 'line-clamp-2' : ''}`}>{n.markText}</p>
                      )}
                      {n.content && n.noteType === 'thought' && (
                        <p className={`mt-1 text-xs text-emerald-800/60 italic leading-relaxed ${!open ? 'line-clamp-2' : ''}`}>
                          {n.content}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                <div className="px-3.5 pb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : i)}
                    className="text-[10px] text-emerald-700/70 font-semibold"
                  >
                    {open ? '收起' : '展开'}
                  </button>
                  <button type="button" onClick={() => copy(n)} className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold active:scale-95 transition-transform">
                    复制
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
