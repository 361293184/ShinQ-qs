/**
 * 拾光 · L1 角色卡片横滑（票根形态）。
 *
 * 卡片是「票根」：照片 + 性格签名 + 编号 / 角色名 / 条形码（见 ShelfTicketCard）。
 * 这里负责三件事：
 *   1. 拉每个角色的相册图池（DB.getGalleryImages），每天自动挑一张；
 *   2. 拉/生成每个角色的一句话（副 API，生成一次永久缓存）；
 *   3. 横滑与分页点。
 *
 * 角色一多，横滑找一张「有内容」的卡会很累 —— 所以上游已经过滤成「只显示有内容的角色」。
 * 只有 1 个角色时也保持卡片形态（居中），层级稳定比省一次点击重要。
 *
 * 背景是独立的静态层（ShelfBackdrop）：格纹 + 暖光 + 邮戳 + 微尘，
 * 垫在所有内容之下，不参与交互、不拦横滑手势。
 *
 * 手势注意：容器加 touch-action: pan-x + overscroll-behavior-x: contain，
 * 与页面纵向滚动隔离（iOS Safari 边缘还有返回手势的坑，已用 padding 留出安全区）。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CaretLeft, Feather } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import { DB } from '../../utils/db';
import type { CharShelfSummary } from '../../utils/letter/shelf';
import { shelfCountText, shelfDateText } from '../../utils/letter/shelf';
import { pickDailyImage } from '../../utils/letter/shelfTicket';
import { ensureShelfPersonas } from '../../utils/letter/shelfPersona';
import ShelfTicketCard from './ShelfTicketCard';
import ShelfBackdrop from './ShelfBackdrop';

interface ShelfCharacterRailProps {
    summaries: CharShelfSummary[];
    onSelect: (charId: string) => void;
    onClose: () => void;
}

const ShelfCharacterRail: React.FC<ShelfCharacterRailProps> = ({ summaries, onSelect, onClose }) => {
    const { characters, apiConfig } = useOS();
    const railRef = useRef<HTMLDivElement>(null);
    const [activeIdx, setActiveIdx] = useState(0);
    /** charId → 该角色的相册图（新→旧）。 */
    const [imagePool, setImagePool] = useState<Record<string, string[]>>({});
    /** charId → 一句话。先出缓存/兜底，生成成功后再原地替换。 */
    const [personaLines, setPersonaLines] = useState<Record<string, string>>({});

    const subApi = useMemo(() => ({
        baseUrl: apiConfig?.subBaseUrl || '',
        apiKey: apiConfig?.subApiKey || '',
        model: apiConfig?.subModel || '',
    }), [apiConfig?.subBaseUrl, apiConfig?.subApiKey, apiConfig?.subModel]);

    const handleScroll = () => {
        const el = railRef.current;
        if (!el || summaries.length <= 1) return;
        const max = el.scrollWidth - el.clientWidth;
        const ratio = max > 0 ? el.scrollLeft / max : 0;
        setActiveIdx(Math.round(ratio * (summaries.length - 1)));
    };

    // 相册图池：每个角色一次查询（与相册 App 同一套读法）。
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const pairs = await Promise.all(summaries.map(async (entry) => {
                const images = await DB.getGalleryImages(entry.charId);
                // 新的在前：图池顺序影响挑选结果，也让「最近那张」有机会上票面
                images.sort((a, b) => b.timestamp - a.timestamp);
                return [entry.charId, images.map(img => img.url)] as const;
            }));
            if (!cancelled) setImagePool(Object.fromEntries(pairs));
        };
        load();
        return () => { cancelled = true; };
    }, [summaries]);

    // 一句话：命中缓存立刻显示；缺失的先给兜底文案，再由副 API 逐个替换。
    useEffect(() => {
        let cancelled = false;
        const chars = summaries
            .map(entry => characters.find(c => c.id === entry.charId))
            .filter((c): c is CharacterProfile => !!c);

        ensureShelfPersonas(chars, subApi, (charId, line) => {
            if (!cancelled) setPersonaLines(prev => ({ ...prev, [charId]: line }));
        }).then(lines => {
            if (!cancelled) setPersonaLines(lines);
        });

        return () => { cancelled = true; };
    }, [summaries, characters, subApi]);

    return (
        <div className="relative h-full w-full flex flex-col font-sans overflow-hidden">
            {/* 背景层：格纹 / 暖光 / 邮戳 / 微尘。纯静态、不拦事件，垫在所有内容之下。
                底色也收在它这一层，根容器不再自己写 bg —— 避免两处各存一份米色。 */}
            <ShelfBackdrop />

            {/* 顶部栏 */}
            <div className="relative bg-[#FBF5EA]/85 backdrop-blur-md border-b border-[#E4D6BE] shrink-0 z-20" style={{ paddingTop: 'var(--chrome-top)' }}>
                <div className="flex items-center justify-between px-4 py-3">
                    {/* 返回。拾光是入口层，所以「返回」就是关闭 —— 用箭头而不是 ✕，
                        是因为这里的动作在用户心里是「退出去」而不是「关掉一个弹窗」。 */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 -ml-2 rounded-full hover:bg-[#F6EDE3] active:scale-90 transition-transform cursor-pointer"
                        aria-label="返回"
                    >
                        <CaretLeft className="w-5 h-5 text-[#4A3F35]" weight="bold" />
                    </button>
                    <div className="flex items-center gap-1.5">
                        <Feather className="w-4 h-4 text-[#E8845A]" weight="fill" />
                        <span className="font-bold text-[#4A3F35] text-sm tracking-wide">拾光</span>
                        <span className="text-[10px] text-[#B5A89A] font-medium">{summaries.length} 位角色</span>
                    </div>
                    {/* 右侧留等宽占位，标题才真的居中 */}
                    <div className="w-9" />
                </div>
            </div>

            <div className="relative flex-1 min-h-0 flex flex-col justify-center py-6">
                {summaries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center px-8">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#FDE7D7] to-[#EFB6C6] flex items-center justify-center shadow-inner mb-4">
                            <BookOpen className="w-9 h-9 text-white/90" weight="fill" />
                        </div>
                        <p className="text-[#4A3F35] font-bold text-sm">收藏馆还空着</p>
                        <p className="text-xs text-[#8A7A6C] mt-1.5 leading-relaxed">
                            和 ta 聊点什么 —— 番外和来信都会收在这里。
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="px-6 mb-5 text-center text-xs text-[#8A7A6C]">
                            选一位角色，看看 ta 写给你的信和故事
                        </p>

                        <div
                            ref={railRef}
                            onScroll={handleScroll}
                            className={`flex gap-4 overflow-x-auto px-5 pb-2 snap-x snap-mandatory no-scrollbar ${summaries.length === 1 ? 'justify-center' : ''}`}
                            style={{ touchAction: 'pan-x', overscrollBehaviorX: 'contain' }}
                        >
                            {summaries.map((entry, i) => (
                                <ShelfTicketCard
                                    key={entry.charId}
                                    charId={entry.charId}
                                    charName={entry.charName}
                                    image={pickDailyImage(entry.charId, imagePool[entry.charId] || []) || undefined}
                                    line={personaLines[entry.charId] || ''}
                                    metaLeft={shelfCountText(entry)}
                                    metaRight={`最近 ${shelfDateText(entry.latestAt)}`}
                                    onClick={() => onSelect(entry.charId)}
                                    style={{ animationDelay: `${i * 40}ms` }}
                                />
                            ))}
                        </div>

                        {summaries.length > 1 && (
                            <div className="mt-5 flex justify-center gap-1.5">
                                {summaries.map((entry, i) => (
                                    <span
                                        key={entry.charId}
                                        className={`h-1.5 rounded-full transition-all ${i === activeIdx ? 'w-4 bg-[#C4643A]' : 'w-1.5 bg-[#BFA98A]'}`}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ShelfCharacterRail;
