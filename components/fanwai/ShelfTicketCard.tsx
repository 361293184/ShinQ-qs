/**
 * 拾光 · 票根卡片。
 *
 * 一张「票」：上方是照片（角色相册里每天自动换一张），中间一道撕线，
 * 下方是票根 —— 编号 / 角色名 / 条形码。性格签名压在照片底部。
 *
 * 为什么是票根而不是普通卡片：拾光收藏的东西（番外、来信）都带时间戳，
 * 票根本身就在说「这是某一天留下的凭证」—— 形态和内容对得上。
 *
 * 编号与条码都按 charId 确定性生成（见 utils/letter/shelfTicket）：
 * 每张票只属于一个角色，且每次渲染都长一样。
 */

import React from 'react';
import TokenImg from '../os/TokenImg';
import { barcodeBars, ticketSerial } from '../../utils/letter/shelfTicket';
import './ShelfTicketCard.css';

interface ShelfTicketCardProps {
    charId: string;
    charName: string;
    /** 今天这张票选中的相册图；为空时退回首字占位。 */
    image?: string;
    /** 性格签名（一句话）。 */
    line: string;
    /** 照片左上：收藏统计，如「3 封信 · 7 篇」。 */
    metaLeft?: string;
    /** 照片右上：最近时间。 */
    metaRight?: string;
    onClick: () => void;
    style?: React.CSSProperties;
}

const ShelfTicketCard: React.FC<ShelfTicketCardProps> = ({
    charId,
    charName,
    image,
    line,
    metaLeft,
    metaRight,
    onClick,
    style,
}) => {
    const serial = ticketSerial(charId);
    const bars = barcodeBars(charId);

    // 高度用 clamp 而不是 aspect-ratio：竖长方形要成立，但矮屏上也不能顶破头。
    return (
        <button
            type="button"
            onClick={onClick}
            style={style}
            aria-label={`打开 ${charName} 的收藏`}
            className="shelf-ticket h-[clamp(340px,60vh,440px)] w-[76%] max-w-[320px] shrink-0 cursor-pointer snap-center text-left"
        >
            {/* ── 照片区 ── */}
            <div className="shelf-ticket-photo">
                <div className="shelf-ticket-photo-frame">
                    {image ? (
                        <TokenImg value={image} alt={`${charName} 的照片`} />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <span className="text-4xl font-bold text-[#B5A89A]">{charName.slice(0, 1)}</span>
                        </div>
                    )}
                </div>

                {(metaLeft || metaRight) && (
                    <div className="shelf-ticket-photo-top">
                        <span>{metaLeft}</span>
                        <span>{metaRight}</span>
                    </div>
                )}

                {line && (
                    <div className="shelf-ticket-photo-veil">
                        <p className="shelf-ticket-line">{line}</p>
                    </div>
                )}
            </div>

            {/* ── 撕线（两端的半圆缺口由卡片 mask 切出） ── */}
            <div className="shelf-ticket-perf" />

            {/* ── 票根 ── */}
            <div className="shelf-ticket-stub">
                <div className="shelf-ticket-meta">
                    <span className="shelf-ticket-serial">NO.{serial}</span>
                    <span className="shelf-ticket-name">{charName}</span>
                </div>
                <div className="shelf-ticket-barcode" aria-hidden>
                    {bars.map((w, i) => (
                        <span key={i} style={{ flex: `${w} 0 0%` }} />
                    ))}
                </div>
            </div>
        </button>
    );
};

export default ShelfTicketCard;
