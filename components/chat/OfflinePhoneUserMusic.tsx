import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pause, Play } from '@phosphor-icons/react';
import { useMusic, musicApi, type Song } from '../../context/MusicContext';
import { DB } from '../../utils/db';

/**
 * 你的手机 · 音乐（方案 §5.26 C）
 *
 * 全部是真实数据，零生成：
 * - 正在播放：全局 MusicContext 的真实播放器（进度、播放/暂停都跟着它走）
 * - 播放队列：你真实听过的队列（持久化在 sully_music_state_v1）
 * - 我的歌单：登录后从网易云拉（`/user/playlist`），点进歌单拉 `/playlist/track/all`
 * - 一起听：当前和哪些角色一起听（`listeningTogetherWith`）
 * - 一起写的歌：写歌 App 生成的本地专辑
 */

interface Props {
    charName: string;
}

interface PlaylistBrief {
    id: number;
    name: string;
    cover?: string;
    count?: number;
}

const fmt = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function OfflinePhoneUserMusic({ charName }: Props) {
    const music = useMusic();
    const [playlists, setPlaylists] = useState<PlaylistBrief[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [openList, setOpenList] = useState<PlaylistBrief | null>(null);
    const [listSongs, setListSongs] = useState<Song[]>([]);
    const [loadingSongs, setLoadingSongs] = useState(false);
    const [partnerNames, setPartnerNames] = useState<string[]>([]);

    // 一起听的伙伴 id → 名字
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!music.listeningTogetherWith.length) {
                setPartnerNames([]);
                return;
            }
            try {
                const characters = await DB.getAllCharacters();
                const names = music.listeningTogetherWith
                    .map((id) => characters.find((c) => c.id === id)?.name)
                    .filter((name): name is string => !!name);
                if (!cancelled) setPartnerNames(names);
            } catch {
                if (!cancelled) setPartnerNames([]);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [music.listeningTogetherWith]);

    // 歌单：登录了才拉，失败就老实空着
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!music.profile?.userId || !music.cfg.cookie) {
                setPlaylists([]);
                return;
            }
            setLoadingLists(true);
            try {
                const result = await musicApi.userPlaylist(music.cfg, music.profile.userId);
                const raw: Array<Record<string, any>> = result?.playlist || [];
                const mapped: PlaylistBrief[] = raw.map((item) => ({
                    id: item.id,
                    name: item.name,
                    cover: item.coverImgUrl,
                    count: item.trackCount,
                }));
                if (!cancelled) setPlaylists(mapped);
            } catch (error) {
                console.error('[user-phone] 读取歌单失败', error);
                if (!cancelled) setPlaylists([]);
            } finally {
                if (!cancelled) setLoadingLists(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [music.profile?.userId, music.cfg.cookie]);

    const openPlaylist = async (playlist: PlaylistBrief) => {
        setOpenList(playlist);
        setListSongs([]);
        setLoadingSongs(true);
        try {
            const result = await musicApi.playlistTrackAll(music.cfg, playlist.id, 100, 0);
            const raw: Array<Record<string, any>> = result?.songs || [];
            setListSongs(raw.map((item) => ({
                id: item.id,
                name: item.name,
                artists: (item.ar || []).map((a: { name: string }) => a.name).join(' / '),
                album: item.al?.name || '',
                albumPic: item.al?.picUrl || '',
                duration: (item.dt || 0) / 1000,
                fee: item.fee ?? 0,
            })));
        } catch (error) {
            console.error('[user-phone] 读取歌单歌曲失败', error);
        } finally {
            setLoadingSongs(false);
        }
    };

    const current = music.current;
    const pct = current && music.duration > 0 ? Math.min(100, (music.progress / music.duration) * 100) : 0;
    const partners = useMemo(
        () => (partnerNames.length ? partnerNames.join('、') : music.listeningTogetherWith.length ? charName : ''),
        [partnerNames, music.listeningTogetherWith.length, charName],
    );

    /* 歌单详情 */
    if (openList) {
        return (
            <div className="absolute inset-0 bg-slate-50 flex flex-col">
                <div className="shrink-0 h-10 flex items-center gap-1 px-2 bg-white border-b border-slate-100">
                    <button onClick={() => setOpenList(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[12px] font-bold text-slate-700 truncate">{openList.name}</span>
                    <span className="ml-auto pr-2 text-[9px] text-slate-400">{listSongs.length} 首</span>
                </div>
                <div className="flex-1 overflow-y-auto bg-white">
                    {loadingSongs && <div className="p-6 text-center text-[11px] text-slate-400">正在读取…</div>}
                    {listSongs.map((song, index) => (
                        <button
                            key={`${song.id}-${index}`}
                            onClick={() => music.playSong(song)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50"
                        >
                            <span className="w-5 text-[10px] text-slate-300 shrink-0">{index + 1}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[12px] text-slate-700 truncate">{song.name}</span>
                                <span className="block text-[9px] text-slate-400 mt-0.5">{song.artists}</span>
                            </span>
                            {current?.id === song.id && music.playing ? <span className="text-[9px] text-emerald-500">播放中</span> : null}
                        </button>
                    ))}
                    {!loadingSongs && !listSongs.length && <div className="p-8 text-center text-[11px] text-slate-400">这个歌单读不出来</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 bg-slate-50 overflow-y-auto">
            {/* 正在播放 */}
            {current ? (
                <div className="mx-3 mt-3 rounded-xl bg-white p-3">
                    <div className="flex items-center gap-3">
                        {current.albumPic ? (
                            <img src={current.albumPic} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        ) : (
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-rose-400 to-orange-300 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-bold text-slate-700 truncate">{current.name}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5 truncate">{current.artists}</div>
                        </div>
                        <button
                            onClick={() => music.togglePlay()}
                            className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center active:scale-95 shrink-0"
                        >
                            {music.playing ? <Pause className="w-4 h-4" weight="fill" /> : <Play className="w-4 h-4 ml-0.5" weight="fill" />}
                        </button>
                    </div>
                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden mt-2.5">
                        <div className="h-full bg-slate-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[8px] text-slate-400 mt-1">
                        <span>{fmt(music.progress)}</span>
                        <span>{fmt(music.duration)}</span>
                    </div>
                    {partners ? (
                        <div className="mt-1.5 text-[9px] text-emerald-600">一起听：{partners}</div>
                    ) : null}
                </div>
            ) : (
                <div className="mx-3 mt-3 rounded-xl bg-white p-4 text-center">
                    <div className="text-[11px] text-slate-400">现在没有在放歌</div>
                    <div className="text-[9px] text-slate-400 mt-1">下面是从你听过的队列里挑的</div>
                </div>
            )}

            {/* 播放队列 = 真实听过的歌 */}
            <div className="mt-3 bg-white">
                <div className="px-3 py-2 text-[10px] font-bold text-slate-500 border-b border-slate-50">播放队列</div>
                {music.queue.map((song, index) => (
                    <button
                        key={`${song.id}-${index}`}
                        onClick={() => music.playSong(song, { startIdx: index })}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                        {song.albumPic ? (
                            <img src={song.albumPic} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
                        ) : (
                            <span className="w-8 h-8 rounded bg-slate-200 shrink-0" />
                        )}
                        <span className="flex-1 min-w-0">
                            <span className="block text-[11px] text-slate-700 truncate">{song.name}</span>
                            <span className="block text-[9px] text-slate-400 mt-0.5 truncate">{song.artists}</span>
                        </span>
                        {current?.id === song.id && music.playing ? <span className="text-[9px] text-emerald-500 shrink-0">播放中</span> : null}
                    </button>
                ))}
                {!music.queue.length && <div className="p-6 text-center text-[10px] text-slate-400">还没听过歌</div>}
            </div>

            {/* 我的歌单 */}
            <div className="mt-3 bg-white">
                <div className="px-3 py-2 text-[10px] font-bold text-slate-500 border-b border-slate-50 flex items-center justify-between">
                    <span>我的歌单</span>
                    {loadingLists ? <span className="text-[9px] text-slate-400 font-normal">读取中…</span> : null}
                </div>
                {playlists.map((playlist) => (
                    <button
                        key={playlist.id}
                        onClick={() => openPlaylist(playlist)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50 last:border-0"
                    >
                        {playlist.cover ? (
                            <img src={playlist.cover} alt="" className="w-9 h-9 rounded-lg shrink-0 object-cover" />
                        ) : (
                            <span className="w-9 h-9 rounded-lg bg-slate-200 shrink-0" />
                        )}
                        <span className="flex-1 min-w-0">
                            <span className="block text-[11px] text-slate-700 truncate">{playlist.name}</span>
                            <span className="block text-[9px] text-slate-400">{playlist.count || 0} 首</span>
                        </span>
                    </button>
                ))}
                {!playlists.length && !loadingLists && (
                    <div className="px-3 py-6 text-center text-[10px] leading-4 text-slate-400">
                        {music.cfg.cookie ? '没有拉到歌单' : '还没登录音乐，去音乐 App 登录后这里才有歌单'}
                    </div>
                )}
            </div>

            {/* 一起写的歌 */}
            {music.localAlbumSongs.length > 0 && (
                <div className="mt-3 bg-white">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 border-b border-slate-50">一起写的歌</div>
                    {music.localAlbumSongs.map((song, index) => (
                        <button
                            key={`${song.id}-${index}`}
                            onClick={() => music.playSong(song)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-50 border-b border-slate-50 last:border-0"
                        >
                            <span className="w-8 h-8 rounded bg-gradient-to-br from-violet-400 to-fuchsia-400 shrink-0" />
                            <span className="flex-1 min-w-0">
                                <span className="block text-[11px] text-slate-700 truncate">{song.name}</span>
                                <span className="block text-[9px] text-slate-400 truncate">{song.artists}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="h-4" />
        </div>
    );
}
