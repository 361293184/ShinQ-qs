/**
 * 微信读书「全部笔记」：聚合书架里所有书的划线 + 想法。
 * 只对书架里标记了有笔记/划线的书逐本拉取（降请求量），失败跳过不阻断。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWereadNotes, fetchWereadShelf } from '../../utils/weread/wereadApi';
import type { WereadBook, WereadNote } from '../../utils/weread/types';
import { EmptyHint, ErrorHint, HeaderBar, Spinner } from './WereadShared';

interface Props {
  onBack: () => void;
  /** 点某条笔记 → 打开该书详情/笔记 */
  onOpenBook: (bookId: string, bookTitle: string) => void;
}

interface GroupedNote extends WereadNote {
  bookTitle: string;
}

export default function WereadAllNotes({ onBack, onOpenBook }: Props) {
  const [groups, setGroups] = useState<GroupedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const shelf = await fetchWereadShelf();
      // 只对有笔记/划线的书去拉详情，避免空跑全部接口
      const candidate = shelf.filter(b => (b.markCount || 0) + (b.noteCount || 0) > 0);
      const list: GroupedNote[] = [];
      // 串行少量拉取（书架书通常不多）；每本失败跳过，不阻断整体
      for (const b of candidate) {
        try {
          const notes = await fetchWereadNotes(b.bookId);
          for (const n of notes) {
            list.push({ ...n, bookTitle: b.title });
          }
        } catch { /* 单本笔记失败跳过 */ }
      }
      setGroups(list);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <HeaderBar title="全部笔记" onBack={onBack} subtitle={`${groups.length} 条划线/想法`} />
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#F7F8F6] px-3 py-3 space-y-2.5">
        {loading ? (
          <Spinner label="正在汇总全部划线…" />
        ) : error ? (
          <ErrorHint message={error} onRetry={() => load()} />
        ) : groups.length === 0 ? (
          <EmptyHint title="还没有笔记" desc="在阅读里划下的句子和想法会汇总到这里" />
        ) : (
          groups.map((n, i) => {
            const key = `${n.bookId}-${i}`;
            const open = expanded === key;
            return (
              <div key={key} className="rounded-2xl bg-white border border-emerald-100 overflow-hidden">
                <div className="px-3.5 pt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenBook(n.bookId, n.bookTitle || '')}
                    className="min-w-0 flex-1 text-left group"
                  >
                    <p className="text-[11px] text-emerald-700/70 font-semibold truncate group-hover:underline">{n.bookTitle || '未知书籍'}</p>
                  </button>
                  {n.chapterTitle && <span className="shrink-0 text-[9px] text-emerald-800/35">{n.chapterTitle}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : key)}
                  className="w-full text-left px-3.5 py-2"
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
                        <p className={`mt-1 text-xs text-emerald-800/60 italic leading-relaxed ${!open ? 'line-clamp-2' : ''}`}>{n.content}</p>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : key)}
                  className="px-3.5 pb-3 text-[10px] text-emerald-700/70 font-semibold"
                >
                  {open ? '收起' : '展开'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
