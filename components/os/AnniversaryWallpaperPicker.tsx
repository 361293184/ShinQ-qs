import React from 'react';
import { ANNIVERSARY_ARTIST, ANNIVERSARY_WALLPAPERS } from '../../utils/anniversaryGifts';

export default function AnniversaryWallpaperPicker({ value, onSelect }: {
  value?: string;
  onSelect: (url: string) => void;
}) {
  return (
    <div className="mt-4 mb-4">
      <p className="mb-1 text-xs font-bold text-violet-700">一周年赠礼 · 永久收藏</p>
      <p className="mb-2 text-[11px] text-violet-600">作者：{ANNIVERSARY_ARTIST}</p>
      <div className="flex gap-3">
        {ANNIVERSARY_WALLPAPERS.map(wallpaper => (
          <button key={wallpaper.id} type="button" aria-pressed={value === wallpaper.url}
            onClick={() => onSelect(wallpaper.url)}
            className={`min-w-0 flex-1 rounded-xl p-1.5 text-xs transition-colors ${value === wallpaper.url ? 'bg-violet-100 text-violet-800 ring-2 ring-violet-400' : 'bg-slate-50 text-slate-600 hover:bg-violet-50'}`}>
            <img src={wallpaper.url} alt="" loading="lazy" className="mx-auto h-28 rounded-lg object-contain" />
            <span className="mt-1.5 block">{wallpaper.name}{value === wallpaper.url ? ' · 使用中' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
