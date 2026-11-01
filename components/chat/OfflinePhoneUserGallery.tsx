import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ImageSquare } from '@phosphor-icons/react';
import { DB } from '../../utils/db';
import type { GalleryImage } from '../../types';

/**
 * 你的手机 · 相册（方案 §5.26 C）
 *
 * ⚠️ 这里**破例用真图**：角色手机的图片一律是"灰块 + 文字"，但你自己相册里的照片本来就在，
 * 没有"不该生成"的问题，所以直接读 `galleryImages` 显示原图（§5.26 C 的说明）。
 *
 * 分组：按保存日期（savedDate，没有就用时间戳）倒序，跟真手机相册一致。
 */

interface Props {
    /** 用来把"和当前角色"的图排在最前（可选） */
    primaryCharId?: string;
    charName?: string;
}

interface Item {
    image: GalleryImage;
    dateLabel: string;
}

const pad = (n: number) => n.toString().padStart(2, '0');

const dateLabelOf = (image: GalleryImage, ts: number): string => {
    if (image.savedDate) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(image.savedDate);
        if (match) return `${Number(match[2])}月${Number(match[3])}日`;
        return image.savedDate;
    }
    if (!ts) return '更早';
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
};

const timeOf = (ts: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function OfflinePhoneUserGallery({ primaryCharId }: Props) {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<Item[]>([]);
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const images = await DB.getGalleryImages();
                const mapped: Item[] = images
                    .map((image) => ({
                        image,
                        dateLabel: dateLabelOf(image, image.timestamp || 0),
                    }))
                    .sort((a, b) => (b.image.timestamp || 0) - (a.image.timestamp || 0));
                if (!cancelled) setItems(mapped);
            } catch (error) {
                console.error('[user-phone] 读取相册失败', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [primaryCharId]);

    /** 按日期分组（不排序日期本身，已按时间倒序） */
    const groups = useMemo(() => {
        const result: { label: string; items: { item: Item; index: number }[] }[] = [];
        items.forEach((item, index) => {
            const found = result.find((group) => group.label === item.dateLabel);
            if (found) found.items.push({ item, index });
            else result.push({ label: item.dateLabel, items: [{ item, index }] });
        });
        return result;
    }, [items]);

    if (loading) {
        return <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">正在读取…</div>;
    }

    if (!items.length) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <ImageSquare className="w-8 h-8 text-slate-300" weight="fill" />
                <div className="text-[11px] text-slate-400">你的相册还是空的</div>
                <div className="text-[10px] leading-4 text-slate-400">聊天里收到的图，长按就能存进相册</div>
            </div>
        );
    }

    const detail = openIndex !== null ? items[openIndex] : undefined;
    if (detail) {
        return (
            <div className="absolute inset-0 bg-black flex flex-col">
                <div className="shrink-0 h-10 flex items-center gap-1 px-2">
                    <button onClick={() => setOpenIndex(null)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 active:bg-white/10">
                        <ArrowLeft className="w-4 h-4" weight="bold" />
                    </button>
                    <span className="text-[11px] text-white/60">{timeOf(detail.image.timestamp || 0)}</span>
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                    <img src={detail.image.url} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                {detail.image.review ? (
                    <div className="shrink-0 px-4 py-3 bg-black/60 text-[11px] leading-[1.7] text-white/80 whitespace-pre-wrap">
                        {detail.image.review}
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="absolute inset-0 bg-white overflow-y-auto">
            {groups.map((group) => (
                <div key={group.label} className="px-2 pt-2">
                    <div className="text-[10px] text-slate-400 pl-1 pb-1.5">{group.label}</div>
                    <div className="grid grid-cols-3 gap-1">
                        {group.items.map(({ item, index }) => (
                            <button
                                key={item.image.id}
                                onClick={() => setOpenIndex(index)}
                                className="relative aspect-square overflow-hidden rounded bg-slate-100 active:opacity-80"
                            >
                                <img src={item.image.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                {item.image.review ? (
                                    <span className="absolute left-0.5 bottom-0.5 px-1 rounded bg-black/45 text-white text-[8px]">有备注</span>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            <div className="h-3" />
        </div>
    );
}
