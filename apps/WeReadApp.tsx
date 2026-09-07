/**
 * 微信读书 App 壳（真实数据，个人自用）
 * - 底部 Tab：阅读 / 书架 / 我（去掉书友，与微信读书一致）
 * - 阅读 Tab：最近在读 + 快捷续读
 * - 书架 Tab：全量书架（全部/在读/读完/想读）
 * - 我 Tab：个人中心（账号配置统一在 SullyOS 设置 → 实时感知）
 * - 页面栈：搜索书城 / 书籍详情 / 阅读器 / 笔记
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOS } from '../context/OSContext';
import { AppID } from '../types';
import { fetchWereadShelf } from '../utils/weread/wereadApi';
import type { WereadBook } from '../utils/weread/types';
import { BookCover, EmptyHint, Spinner, HeaderBar } from '../components/weread/WereadShared';
import WereadShelf from '../components/weread/WereadShelf';
import WereadProfile from '../components/weread/WereadProfile';
import WereadBookCity from '../components/weread/WereadBookCity';
import WereadBookDetail from '../components/weread/WereadBookDetail';
import WereadReader from '../components/weread/WereadReader';
import WereadNotes from '../components/weread/WereadNotes';
import WereadAllNotes from '../components/weread/WereadAllNotes';

type Tab = 'read' | 'shelf' | 'me';

const TABS: { key: Tab; label: string; icon: 'discover' | 'shelf' | 'me' }[] = [
  { key: 'read', label: '阅读', icon: 'discover' },
  { key: 'shelf', label: '书架', icon: 'shelf' },
  { key: 'me', label: '我', icon: 'me' },
];

function TabIcon({ name, active }: { name: 'discover' | 'shelf' | 'me'; active: boolean }) {
  const cls = active ? '#07A05C' : '#9AA3A0';
  const common = { fill: 'none', viewBox: '0 0 24 24', strokeWidth: active ? 2.2 : 1.8, stroke: cls };
  if (name === 'shelf') {
    return (
      <svg className="w-6 h-6 shrink-0" {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    );
  }
  if (name === 'discover') {
    return (
      <svg className="w-6 h-6 shrink-0" {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M3.5 12h4m9 0h4M12 3.5v4m0 9v4" />
      </svg>
    );
  }
  return (
    <svg className="w-6 h-6 shrink-0" {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

const WeReadApp: React.FC = () => {
  const { closeApp, openApp } = useOS();
  const [tab, setTab] = useState<Tab>('read');
  const [detail, setDetail] = useState<WereadBook | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [reader, setReader] = useState<{ bookId: string; bookTitle: string } | null>(null);
  const [notes, setNotes] = useState<{ bookId: string; bookTitle: string } | null>(null);
  // 「我」页数字卡跳书架：目标过滤 + 每次点强制重挂载书架
  const [shelfNav, setShelfNav] = useState<{ filter: 'reading' | 'finished' | 'wish' | 'all'; ts: number } | null>(null);
  // 「我」页点「笔记」→ 聚合全部书的划线/想法
  const [allNotesOpen, setAllNotesOpen] = useState(false);

  // 阅读 Tab：最近在读
  const [recent, setRecent] = useState<WereadBook[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      const list = await fetchWereadShelf();
      const reading = list.filter(b => b.readingStatus === 'reading').sort((a, b) => (b.updated || 0) - (a.updated || 0));
      setRecent(reading.length ? reading : list.slice(0, 9));
    } catch {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => { void loadRecent(); }, [loadRecent]);

  // 「我」页统计（全量书架汇总，5 分钟缓存内秒开）
  const [meStats, setMeStats] = useState<{ inRead: number; finished: number; notes: number } | null>(null);
  useEffect(() => {
    if (tab !== 'me') return;
    let alive = true;
    fetchWereadShelf()
      .then(list => {
        if (!alive) return;
        setMeStats({
          inRead: list.filter(b => b.readingStatus === 'reading').length,
          finished: list.filter(b => b.readingStatus === 'finished').length,
          notes: list.reduce((s, b) => s + (b.markCount || 0) + (b.noteCount || 0), 0),
        });
      })
      .catch(() => { if (alive) setMeStats(null); });
    return () => { alive = false; };
  }, [tab]);

  const openBook = (b: WereadBook) => { setDetail(b); };
  const openReader = (bookId: string) => setReader({ bookId, bookTitle: detail?.title || '微信读书' });
  const openNotes = (bookId: string) => setNotes({ bookId, bookTitle: detail?.title || '' });

  // 「阅读」Tab 版式数据（方案 §3.1①）
  const READ_CATEGORIES = ['开学特惠', '分类', '榜单', '书单', '会员'] as const;
  const WEEK_ROW = ['一', '二', '三', '四', '五', '六', '日'] as const;
  const todayWeekIdx = (new Date().getDay() + 6) % 7; // 周一为首

  // 全屏子页（搜索/详情/阅读器/笔记/全部笔记）：隐藏 Tab 栏
  const fullscreenPage = useMemo(() => {
    if (allNotesOpen) {
      return {
        key: 'all-notes',
        render: () => (
          <WereadAllNotes
            onBack={() => setAllNotesOpen(false)}
            onOpenBook={(bookId, bookTitle) => { setAllNotesOpen(false); setNotes({ bookId, bookTitle }); }}
          />
        ),
      };
    }
    if (reader) {
      return { render: () => <WereadReader bookId={reader.bookId} bookTitle={reader.bookTitle} onBack={() => setReader(null)} />, key: 'reader' };
    }
    if (notes) {
      return { render: () => <WereadNotes bookId={notes.bookId} bookTitle={notes.bookTitle || '笔记'} onBack={() => setNotes(null)} />, key: 'notes' };
    }
    if (detail) {
      return {
        key: 'detail',
        render: () => (
          <WereadBookDetail
            book={detail}
            onBack={() => setDetail(null)}
            onRead={id => { setDetail(null); setReader({ bookId: id, bookTitle: detail?.title || '' }); }}
            onNotes={id => { setDetail(null); setNotes({ bookId: id, bookTitle: detail?.title || '' }); }}
          />
        ),
      };
    }
    if (searchOpen) {
      return { key: 'search', render: () => <WereadBookCity onBack={() => setSearchOpen(false)} onOpenBook={b => { setSearchOpen(false); setDetail(b); }} /> };
    }
    return null;
  }, [reader, notes, detail, searchOpen, allNotesOpen]);

  if (fullscreenPage) {
    return (
      <div className="flex flex-col h-full bg-[#F7F8F6]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {fullscreenPage.render()}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg,#F7F8F6 0%,#FFFFFF 40%)' }}>
      {/* Header */}
      <HeaderBar
        title={tab === 'read' ? '微信读书' : tab === 'shelf' ? '书架' : '我'}
        onBack={closeApp}
        right={
          (tab === 'read' || tab === 'shelf') ? (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="书城"
              className="px-3 h-8 rounded-full text-emerald-700 text-xs font-semibold bg-emerald-600/10 active:scale-95 transition-transform"
            >
              书城
            </button>
          ) : undefined
        }
      />

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'shelf' && (
          <WereadShelf
            key={shelfNav?.ts ?? 0}
            initialFilter={shelfNav?.filter ?? 'all'}
            onOpenBook={openBook}
            onOpenSearch={() => setSearchOpen(true)}
            onNeedsLogin={() => setTab('me')}
          />
        )}

        {tab === 'read' && (
          <div className="flex-1 min-h-0 flex flex-col bg-[#F7F8F6] overflow-y-auto no-scrollbar pb-6">
            {/* 分类入口（横滑）：真实分类/榜单/书单接口暂未接入 → 先进「书城」搜索同类内容 */}
            <div className="shrink-0 flex gap-2 overflow-x-auto no-scrollbar px-3 pt-3">
              {READ_CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="shrink-0 px-4 py-2 rounded-full bg-white border border-emerald-100 text-emerald-800/70 text-xs font-semibold active:scale-95 transition-transform"
                >
                  {c}
                </button>
              ))}
            </div>

            {/* 本周阅读（时长接口未接入 → 诚实占位，不造假） */}
            <div className="mx-3 mt-3 rounded-2xl bg-white border border-emerald-100 px-4 py-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[11px] text-emerald-800/50 font-medium">本周阅读</h3>
                <span className="text-lg font-bold text-slate-300">— 分钟</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                {WEEK_ROW.map((w, i) => (
                  <span
                    key={w}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] ${i === todayWeekIdx ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'}`}
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>

            {/* 为你推荐（真实最近在读，非假数据） */}
            <div className="px-3 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[14px] font-semibold text-emerald-950">为你推荐</h3>
                {recent.length > 0 && <span className="text-[10px] text-emerald-800/40">{recent.length} 本在读</span>}
              </div>
              {recentLoading ? (
                <Spinner label="同步最近阅读…" />
              ) : recent.length === 0 ? (
                <EmptyHint
                  title="还没有最近阅读"
                  desc="在『书架』里打开一本书，推荐区就会出现"
                  action={
                    <button
                      type="button"
                      onClick={() => setTab('shelf')}
                      className="mt-2 px-5 py-2 rounded-full text-white text-xs font-semibold active:scale-95 transition-transform"
                      style={{ backgroundColor: '#07A05C' }}
                    >
                      去书架
                    </button>
                  }
                />
              ) : (
                <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-3 px-3">
                  {recent.map(b => (
                    <button key={b.bookId} type="button" onClick={() => openBook(b)} className="w-[104px] shrink-0 text-left active:scale-[0.98] transition-transform">
                      <BookCover src={b.cover} title={b.title} className="aspect-[3/4]" rounded="rounded-lg" />
                      <p className="mt-1.5 text-[12px] text-emerald-950 font-medium line-clamp-1">{b.title}</p>
                      {b.progress > 0 && <p className="text-[10px] font-semibold" style={{ color: '#07A05C' }}>读到 {Math.round(b.progress)}%</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'me' && (
          <WereadProfile
            inReadCount={meStats?.inRead ?? 0}
            finishedCount={meStats?.finished ?? 0}
            noteCount={meStats?.notes ?? 0}
            onOpenSettings={() => openApp(AppID.Settings)}
            // 「我」页数字卡点击：在读/读完 → 书架带过滤；笔记 → 全部笔记聚合页
            onOpenInRead={() => { setTab('shelf'); setShelfNav({ filter: 'reading', ts: Date.now() }); }}
            onOpenFinished={() => { setTab('shelf'); setShelfNav({ filter: 'finished', ts: Date.now() }); }}
            onOpenNotes={() => setAllNotesOpen(true)}
          />
        )}
      </div>

      {/* Bottom Tabs */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-t border-emerald-100 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 active:scale-95 transition-transform"
            >
              <TabIcon name={t.icon} active={active} />
              <span className="text-[11px] font-semibold" style={{ color: active ? '#07A05C' : '#9AA3A0' }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WeReadApp;
