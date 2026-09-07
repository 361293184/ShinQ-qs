/**
 * 微信读书「书架」Tab：全部/在读/读完/想读 过滤、真实书封网格 + 进度角标、下拉刷新。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWereadShelf, clearWereadCache } from '../../utils/weread/wereadApi';
import { loadWereadProfile } from '../../utils/weread/wereadConfig';
import type { WereadBook, WereadReadingStatus } from '../../utils/weread/types';
import { BookCover, ErrorHint, EmptyHint, Spinner, ProgressPill } from './WereadShared';

type Filter = 'all' | WereadReadingStatus;

interface Props {
  /** 初始过滤（「我」页点数字卡跳来带的目标过滤；父级用 key 重挂载生效） */
  initialFilter?: Filter;
  onOpenBook: (book: WereadBook) => void;
  onOpenSearch: () => void;
  onNeedsLogin: () => void;
}

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'reading', label: '在读' },
  { key: 'finished', label: '读完' },
  { key: 'wish', label: '想读' },
];

export default function WereadShelf({ initialFilter = 'all', onOpenBook, onOpenSearch, onNeedsLogin }: Props) {
  const [books, setBooks] = useState<WereadBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [profileCookieOk] = useState(() => !!loadWereadProfile().cookie);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchWereadShelf({ force });
      setBooks(list);
    } catch (e: any) {
      // 不自动跳「我」页：只在当前书架里提示，让用户自己决定是否去登录
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return books;
    if (filter === 'reading') return books.filter(b => b.readingStatus === 'reading');
    if (filter === 'finished') return books.filter(b => b.readingStatus === 'finished');
    return books.filter(b => b.readingStatus === 'wish');
  }, [books, filter]);

  const refresh = () => { clearWereadCache(); load(true); };

  if (!profileCookieOk) {
    return (
      <div className="flex-1 min-h-0 bg-[#F7F8F6] overflow-y-auto">
        <EmptyHint
          title="还没有接入你的微信读书"
          desc="先去『我』页粘贴网页版 Cookie 或扫码登录，书架就会自动出现"
          action={
            <button
              type="button"
              onClick={onNeedsLogin}
              className="mt-2 px-5 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold active:scale-95 transition-transform"
            >
              去『我』页登录
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F7F8F6]">
      {/* 过滤 Tab */}
      <div className="shrink-0 flex items-center gap-1 px-3 pt-2 pb-1 overflow-x-auto no-scrollbar">
        {TABS.map(t => {
          const count = t.key === 'all' ? books.length : books.filter(b => b.readingStatus === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === t.key ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800/60 border border-emerald-100'}`}
            >
              {t.label} {count}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="搜索"
          className="ml-auto w-8 h-8 rounded-full bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
          </svg>
        </button>
      </div>

      {loading && books.length === 0 ? (
        <Spinner label="正在同步书架…" />
      ) : error ? (
        <>
          <ErrorHint message={error} onRetry={() => load(true)} />
          {/登录/.test(error) && (
            <div className="px-6 -mt-8">
              <button
                type="button"
                onClick={onNeedsLogin}
                className="w-full py-2.5 rounded-full text-emerald-800 text-xs font-semibold active:scale-[0.98] transition-transform"
                style={{ backgroundColor: '#E7F6EE' }}
              >
                去『我』页登录 / 更新 Cookie
              </button>
            </div>
          )}
        </>
      ) : filtered.length === 0 ? (
        <EmptyHint title={books.length === 0 ? '书架空空的' : '这个分类还没有书'} desc={books.length === 0 ? '在微信读书里加入几本想读的，就会出现在这里' : undefined} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pt-2 pb-6">
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {filtered.map(b => (
              <button
                key={b.bookId}
                type="button"
                onClick={() => onOpenBook(b)}
                className="text-left group active:scale-[0.98] transition-transform"
              >
                <BookCover src={b.cover} title={b.title} className="aspect-[3/4] shadow-sm group-hover:shadow-md transition-shadow" rounded="rounded-lg" />
                <p className="mt-1.5 text-[12px] font-medium text-emerald-950 leading-snug line-clamp-2">{b.title}</p>
                <p className="text-[10px] text-emerald-800/45 mt-0.5 line-clamp-1">{b.author || ' '}</p>
                <div className="mt-1"><ProgressPill percent={b.progress} status={b.readingStatus} /></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 底部刷新条 */}
      <button
        type="button"
        onClick={refresh}
        className="shrink-0 mx-auto mb-3 px-4 py-1.5 rounded-full bg-white border border-emerald-200 text-emerald-700 text-[11px] font-semibold active:scale-95 transition-transform"
      >
        刷新书架
      </button>
    </div>
  );
}
