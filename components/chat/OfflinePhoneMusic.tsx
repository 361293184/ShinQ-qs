import React, { useState } from 'react';
import { ArrowLeft, ArrowsClockwise, Pause, Play } from '@phosphor-icons/react';
import { useMusic, musicApi, toHttps, type Song } from '../../context/MusicContext';
import type { PhoneListEntry, PhoneMusicPlaylist } from '../../utils/offlineMode/phoneContent';

/**
 * 他手机里的音乐（文档 §5.14）。
 *
 * 三块（§5.14 H）：首页（最近播放 + 歌单横滑）→ 歌单页 → 播放页。
 * §5.14 C 是这个 App 唯一的特殊之处：**点开一首歌，它真的会响**。
 * 生成的内容只有歌名和歌手，没有音源，所以播放时用 `musicApi.search` 去搜同名歌，
 * 搜到就交给全局 MusicContext 真播（顺便进入「一起听」语境），搜不到就老实说没音源，不假装在放。
 *
 * 封面不生图（§5.14 H 待确认 3）：色块 + 歌名排版。
 */

interface Props {
    entries: PhoneListEntry[];
    playlists?: PhoneMusicPlaylist[];
    emptyHint: string;
}

interface SongRef {
    title: string;
    artist?: string;
    lyric?: string;
    meta?: string;
    plays?: number;
    body?: string;
}

const COVER_COLORS = [
    'from-rose-400 to-orange-300',
    'from-sky-400 to-indigo-400',
    'from-emerald-400 to-teal-400',
    'from-violet-400 to-fuchsia-400',
    'from-amber-400 to-yellow-300',
    'from-slate-500 to-slate-700',
];

const colorOf = (key: string): string => {
    let sum = 0;
    for (let i = 0; i < key.length; i += 1) sum += key.charCodeAt(i);
    return COVER_COLORS[sum % COVER_COLORS.length];
};

export default function OfflinePhoneMusic({ entries, playlists, emptyHint }: Props) {
    const music = useMusic();
    const [page, setPage] = useState<'home' | 'playlist' | 'player'>('home');
    const [playlistIndex, setPlaylistIndex] = useState<number | null>(null);
    const [song, setSong] = useState<SongRef | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // 真实搜索到的歌曲 id：只靠歌名比较会因为「名字不完全一致」判不出来，
    // 结果就是播放键永远显示"播放"，点了又重搜一遍——看起来像「没法暂停」。
    const [activeId, setActiveId] = useState<number | null>(null);

    /** 当前这首是不是真的在全局播放器里（有 id 用 id，没有才退回歌名比较） */
    const isCurrent = (ref: SongRef | null | undefined): boolean => {
        if (!ref || !music.current) return false;
        if (activeId !== null) return music.current.id === activeId;
        return music.current.name === ref.title;
    };

    const openSong = (ref: SongRef) => {
        setSong(ref);
        setError('');
        setPage('player');
    };

    /** 真播：搜同名歌 → 交给全局播放器（搜不到就说清楚，不假装） */
    const play = async () => {
        if (!song) return;
        // 已经是当前这首：直接暂停 / 继续，不再重新搜索
        if (isCurrent(song) && music.current) {
            music.togglePlay();
            return;
        }
        if (!music.cfg.cookie) {
            setError('音乐还没登录，先去「音乐」App 里配置音源');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const keyword = `${song.title} ${song.artist || ''}`.trim();
            const result = await musicApi.search(music.cfg, keyword);
            const songs: Array<Record<string, any>> = result?.result?.songs || [];
            if (!songs.length) {
                setError('没找到这首歌的音源');
                return;
            }
            // 优先免播放版权的，最多试 3 个候选（生成出来的歌名经常只有一部分对得上）
            const candidates = [...songs].sort((a, b) => (a.fee ?? 0) - (b.fee ?? 0)).slice(0, 3);
            let lastError: unknown = null;
            for (const candidate of candidates) {
                try {
                    const mapped: Song = {
                        id: candidate.id,
                        name: candidate.name,
                        artists: (candidate.ar || candidate.artists || []).map((a: { name: string }) => a.name).join(' / '),
                        album: candidate.al?.name || candidate.album?.name || '',
                        albumPic: toHttps(candidate.al?.picUrl || candidate.album?.picUrl || ''),
                        duration: (candidate.dt || candidate.duration || 0) / 1000,
                        fee: candidate.fee ?? 0,
                    };
                    await music.playSong(mapped);
                    setActiveId(mapped.id);
                    return;
                } catch (err) {
                    lastError = err;
                }
            }
            console.error('[offline-phone] 音乐播放失败', lastError);
            setError('这几首都放不了，可能是没版权或音源异常');
        } catch (err) {
            console.error('[offline-phone] 音乐搜索失败', err);
            setError('搜索失败，检查一下音乐设置里的音源');
        } finally {
            setLoading(false);
        }
    };

    /* ---------------- 播放页 ---------------- */
    if (page === 'player' && song) {
        const currentSong = isCurrent(song);
        const playing = currentSong && music.playing;
        const pct = currentSong && music.duration > 0 ? Math.min(100, (music.progress / music.duration) * 100) : 0;
        return (
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col">
                <div className="h-10 shrink-0 flex items-center px-2">
                    <button onClick={() => setPage(playlistIndex === null ? 'home' : 'playlist')} className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 active:bg-white/10">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[10px] text-white/50 ml-1">正在播放</span>
                </div>
                <div className="flex-1 flex flex-col items-center px-6 overflow-y-auto">
                    <div className={`w-full aspect-square max-w-[180px] rounded-2xl bg-gradient-to-br ${colorOf(song.title)} mt-3 flex items-center justify-center shadow-lg`}>
                        <span className="text-white/95 text-[13px] font-bold px-4 text-center leading-5">{song.title}</span>
                    </div>
                    <div className="text-[14px] font-bold mt-5 text-center">{song.title}</div>
                    <div className="text-[11px] text-white/60 mt-1">{song.artist || '未知歌手'}</div>
                    {song.plays && song.plays > 1 ? (
                        <div className="text-[9px] text-white/40 mt-1">他听了 {song.plays} 次</div>
                    ) : null}

                    <div className="w-full mt-5">
                        <div className="h-1 rounded-full bg-white/20 overflow-hidden">
                            <div className="h-full bg-white/80 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[8px] text-white/40 mt-1">
                            <span>{fmt(currentSong ? music.progress : 0)}</span>
                            <span>{fmt(currentSong ? music.duration : 0)}</span>
                        </div>
                    </div>

                    <button
                        onClick={play}
                        disabled={loading}
                        className="mt-5 w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center active:scale-95"
                    >
                        {loading || (currentSong && music.loadingSong) ? (
                            <ArrowsClockwise className="w-5 h-5 animate-spin" weight="bold" />
                        ) : playing ? (
                            <Pause className="w-5 h-5" weight="fill" />
                        ) : (
                            <Play className="w-5 h-5 ml-0.5" weight="fill" />
                        )}
                    </button>
                    {currentSong && !playing && !loading ? (
                        <div className="text-[9px] text-white/40 mt-1.5">已暂停 · 点一下继续</div>
                    ) : null}
                    {error ? <div className="text-[9px] text-rose-300 mt-2">{error}</div> : null}

                    {song.lyric ? (
                        <div className="mt-5 mb-6 text-center text-[11px] leading-6 text-white/60 whitespace-pre-wrap">{song.lyric}</div>
                    ) : song.body ? (
                        <div className="mt-5 mb-6 text-center text-[10px] leading-5 text-white/40 whitespace-pre-wrap">{song.body}</div>
                    ) : null}
                </div>
            </div>
        );
    }

    /* ---------------- 歌单页 ---------------- */
    if (page === 'playlist' && playlistIndex !== null && playlists?.[playlistIndex]) {
        const list = playlists[playlistIndex];
        return (
            <div className="absolute inset-0 bg-slate-50 flex flex-col">
                <div className="h-10 shrink-0 flex items-center gap-1 px-2 bg-white border-b border-slate-100">
                    <button onClick={() => setPage('home')} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700 truncate">{list.name}</span>
                    <span className="ml-auto pr-2 text-[9px] text-slate-400">{(list.songs || []).length} 首</span>
                </div>
                <div className="flex-1 overflow-y-auto bg-white">
                    {(list.songs || []).map((item, index) => (
                        <button
                            key={`${item.title}-${index}`}
                            onClick={() => openSong({ title: item.title, artist: item.artist })}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50"
                        >
                            <span className="w-5 text-[10px] text-slate-300 shrink-0">{index + 1}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[12px] text-slate-700 truncate">{item.title}</span>
                                <span className="block text-[9px] text-slate-400 mt-0.5">{item.artist || ''}</span>
                            </span>
                            {isCurrent({ title: item.title }) && music.playing ? (
                                <span className="text-[9px] text-emerald-500 shrink-0">播放中</span>
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    /* ---------------- 首页 ---------------- */
    if (!entries.length && !(playlists || []).length) {
        return (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] leading-5 text-slate-400">
                {emptyHint}
            </div>
        );
    }

    return (
        <div className="absolute inset-0 bg-slate-50 overflow-y-auto">
            {/* 歌单横滑（§5.14 H：首页 = 最近播放 + 歌单横滑卡片） */}
            {(playlists || []).length > 0 && (
                <div className="px-3 pt-3">
                    <div className="text-[10px] font-bold text-slate-500 mb-2">他的歌单</div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {(playlists || []).map((list, index) => (
                            <button
                                key={`${list.name}-${index}`}
                                onClick={() => { setPlaylistIndex(index); setPage('playlist'); }}
                                className="w-[86px] shrink-0 text-left active:scale-95 transition-transform"
                            >
                                <div className={`w-[86px] h-[86px] rounded-xl bg-gradient-to-br ${colorOf(list.name)} flex items-end p-2`}>
                                    <span className="text-white text-[10px] font-bold leading-3 line-clamp-2">{list.name}</span>
                                </div>
                                <div className="text-[9px] text-slate-400 mt-1">{(list.songs || []).length} 首</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 最近播放 */}
            <div className="mt-3 bg-white">
                <div className="px-3 py-2 text-[10px] font-bold text-slate-500 border-b border-slate-50">最近播放</div>
                {entries.map((entry, index) => (
                    <button
                        key={`${entry.title}-${index}`}
                        onClick={() => openSong({ title: entry.title, artist: entry.artist || entry.sub, lyric: entry.lyric, meta: entry.meta, plays: entry.plays, body: entry.body })}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                        <span className={`w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br ${colorOf(entry.title)}`} />
                        <span className="flex-1 min-w-0">
                            <span className="block text-[12px] text-slate-700 truncate">{entry.title}</span>
                            <span className="block text-[9px] text-slate-400 mt-0.5">
                                {entry.artist || ''}{entry.plays && entry.plays > 1 ? ` · 循环 ${entry.plays} 次` : ''}
                            </span>
                        </span>
                        <span className="text-[9px] text-slate-400 shrink-0">{entry.meta || ''}</span>
                    </button>
                ))}
                {!entries.length && <div className="p-6 text-center text-[10px] text-slate-400">最近没有听歌记录</div>}
            </div>
            <div className="h-4" />
        </div>
    );
}

const fmt = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};
