/**
 * 微信读书公共 UI 原子（封面/进度/状态徽标/空态错误态），
 * 全部按真实微信读书的"白底 + 品牌绿"克制风格实现。
 */
import React, { useState } from 'react';
import type { WereadReadingStatus } from '../../utils/weread/types';

export const WEREAD_GREEN = '#07A05C';
export const WEREAD_SOFT = '#E7F6EE';

/** 阅读状态 → 展示文案/色板 */
export const WEREAD_STATUS_META: Record<WereadReadingStatus, { label: string; badge: string; dot: string }> = {
  reading: { label: '在读', badge: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  finished: { label: '读完', badge: 'bg-sky-50 text-sky-600', dot: 'bg-sky-500' },
  wish: { label: '想读', badge: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
  unknown: { label: '未读', badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

/** 书籍封面：真实 cover + 失败渐变兜底（微信读书绿系书脊感占位） */
export function BookCover({ src, title, className = 'aspect-[3/4]', rounded = 'rounded-md' }: { src?: string; title?: string; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  const show = !!src && !failed;
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-emerald-100 via-teal-50 to-emerald-200 ${rounded} ${className}`}>
      {show && (
        <img
          src={src}
          alt={title || '封面'}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {!show && (
        <div className="absolute inset-0 flex items-center justify-center px-2">
          <span className="text-emerald-900/45 text-xs font-medium leading-snug text-center line-clamp-4">{title || '微信读书'}</span>
        </div>
      )}
    </div>
  );
}

/** 进度徽标（阅读页/书架角标通用） */
export function ProgressPill({ percent, status }: { percent?: number; status?: WereadReadingStatus }) {
  const meta = WEREAD_STATUS_META[status || 'unknown'];
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {p >= 100 ? '已读完' : status === 'wish' ? '想读' : status === 'unknown' ? '未读' : p > 0 ? `${p}%` : '在读'}
    </span>
  );
}

/** 顶部可复用 Headless 头部（微信读书壳统一走 App 自己的 HeaderBar） */
export function HeaderBar({ title, onBack, right, subtitle }: {
  title: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="shrink-0 bg-white/85 backdrop-blur-xl border-b border-emerald-50 z-10" style={{ paddingTop: 'var(--safe-top)' }}>
      <div className="h-12 flex items-center gap-1 px-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            className="p-2 -ml-2 rounded-full text-emerald-800 hover:bg-emerald-50 active:scale-90 transition-transform"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold text-emerald-950 leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-[10px] text-emerald-700/60 truncate">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-emerald-700">
      <svg className="animate-spin w-7 h-7" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="text-xs text-emerald-800/60">{label}</span>}
    </div>
  );
}

export function ErrorHint({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
      <span className="text-3xl">📖</span>
      <p className="text-sm text-emerald-900/70 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold active:scale-95 transition-transform"
        >
          重试
        </button>
      )}
    </div>
  );
}

export function EmptyHint({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-8 gap-2">
      <span className="text-4xl">🪴</span>
      <p className="text-sm font-semibold text-emerald-950">{title}</p>
      {desc && <p className="text-xs text-emerald-800/50 leading-relaxed">{desc}</p>}
      {action}
    </div>
  );
}
