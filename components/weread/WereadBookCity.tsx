/**
 * 微信读书「书城」页：搜索书籍/作者，真实结果网格 → 点开书籍详情。
 */
import React, { useState } from 'react';
import { searchWereadBooks } from '../../utils/weread/wereadApi';
import type { WereadSearchHit, WereadBook } from '../../utils/weread/types';
import { BookCover, EmptyHint, ErrorHint, Spinner, HeaderBar } from './WereadShared';

interface Props {
  onBack: () => void;
  onOpenBook: (book: WereadBook) => void;
}

export default function WereadBookCity({ onBack, onOpenBook }: Props) {
  const [keyword, setKeyword] = useState('');
  const [hits, setHits] = useState<WereadSearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const doSearch = async (kw?: string) => {
    const q = (kw ?? keyword).trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      setHits(await searchWereadBooks(q));
    } catch (e: any) {
      setHits([]);
      setError(e?.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <HeaderBar title="书城" onBack={onBack} />
      <div className="flex-1 min-h-0 flex flex-col bg-[#F7F8F6]">
        <div className="p-3 flex gap-2 shrink-0">
          <div className="flex-1 flex items-center bg-white rounded-full border border-emerald-100 px-4">
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              placeholder="搜书、搜作者"
              className="flex-1 bg-transparent text-sm text-emerald-950 py-2.5 focus:outline-none placeholder:text-emerald-800/30"
            />
          </div>
          <button
            type="button"
            onClick={() => doSearch()}
            disabled={loading || !keyword.trim()}
            className="px-4 rounded-full bg-emerald-600 text-white text-xs font-semibold active:scale-95 transition-transform disabled:opacity-40"
          >
            {loading ? '…' : '搜索'}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-6">
          {loading ? (
            <Spinner label="正在搜索…" />
          ) : error ? (
            <ErrorHint message={error} onRetry={() => doSearch()} />
          ) : !searched ? (
            <EmptyHint title="输入书名或作者" desc="搜索微信读书里的真实书籍" />
          ) : hits && hits.length === 0 ? (
            <EmptyHint title="没有找到相关书籍" desc="换个关键词试试" />
          ) : (
            <div className="grid grid-cols-3 gap-x-3 gap-y-4">
              {hits?.map(h => (
                <button
                  key={h.bookId}
                  type="button"
                  onClick={() => onOpenBook({ bookId: h.bookId, title: h.title, author: h.author, cover: h.cover, readingStatus: 'unknown', progress: 0 })}
                  className="text-left active:scale-[0.98] transition-transform"
                >
                  <BookCover src={h.cover} title={h.title} className="aspect-[3/4] shadow-sm" rounded="rounded-lg" />
                  <p className="mt-1.5 text-[12px] font-medium text-emerald-950 line-clamp-2">{h.title}</p>
                  <p className="text-[10px] text-emerald-800/45 mt-0.5 line-clamp-1">{h.author || ' '}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
