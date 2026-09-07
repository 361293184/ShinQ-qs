/**
 * 微信读书「书籍详情」：封面/书名/作者/简介 + 「开始阅读 / 查看笔记」入口。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWereadBookInfo, fetchWereadNotes } from '../../utils/weread/wereadApi';
import type { WereadBook, WereadBookInfo } from '../../utils/weread/types';
import { BookCover, ErrorHint, HeaderBar, Spinner, WEREAD_SOFT } from './WereadShared';

interface Props {
  book: WereadBook;
  onBack: () => void;
  onRead: (bookId: string) => void;
  onNotes: (bookId: string) => void;
}

export default function WereadBookDetail({ book, onBack, onRead, onNotes }: Props) {
  const [info, setInfo] = useState<WereadBookInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteCount, setNoteCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [b, notes] = await Promise.all([
        fetchWereadBookInfo(book.bookId).catch(() => null),
        fetchWereadNotes(book.bookId).catch(() => []),
      ]);
      setInfo(b);
      setNoteCount(notes.length);
    } catch (e: any) {
      setError(e?.message || '详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [book.bookId]);

  useEffect(() => { load(); }, [load]);

  const title = info?.title || book.title;
  const author = info?.author || book.author;
  const intro = info?.intro || '';
  const cover = info?.cover || book.cover;

  return (
    <>
      <HeaderBar title={title} onBack={onBack} subtitle={author || '微信读书'} />
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#F7F8F6]">
        {loading ? (
          <Spinner label="正在获取详情…" />
        ) : error ? (
          <ErrorHint message={error} onRetry={() => load()} />
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex gap-4">
              <BookCover src={cover} title={title} className="aspect-[3/4] w-28 shadow-md" rounded="rounded-xl" />
              <div className="flex-1 min-w-0 pt-1">
                <h2 className="text-base font-semibold text-emerald-950 leading-snug">{title}</h2>
                {author && <p className="mt-1 text-xs text-emerald-800/55">{author}</p>}
                {info?.category && <p className="mt-0.5 text-[10px] text-emerald-800/40">{info.category}</p>}
                <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-800/50">
                  {noteCount !== null && <span className="px-2 py-1 rounded bg-white border border-emerald-100">{noteCount} 条笔记</span>}
                  {book.progress > 0 && <span className="px-2 py-1 rounded bg-white border border-emerald-100">读到 {Math.round(book.progress)}%</span>}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onRead(book.bookId)}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-semibold active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#07A05C' }}
              >
                {book.progress > 0 ? '继续阅读' : '开始阅读'}
              </button>
              <button
                type="button"
                onClick={() => onNotes(book.bookId)}
                className="flex-1 py-3 rounded-2xl text-emerald-800 text-sm font-semibold active:scale-[0.98] transition-transform"
                style={{ backgroundColor: WEREAD_SOFT }}
              >
                笔记（{noteCount ?? '-'}）
              </button>
            </div>

            {intro && (
              <div className="rounded-2xl bg-white border border-emerald-100 p-4">
                <h3 className="text-xs font-semibold text-emerald-950 mb-2">简介</h3>
                <p className="text-[13px] text-emerald-900/70 leading-relaxed whitespace-pre-wrap">{intro}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
