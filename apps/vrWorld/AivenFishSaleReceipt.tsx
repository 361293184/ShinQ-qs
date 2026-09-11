import React from 'react';
import { AIVEN_FISH_SALE_REPLIES, type AivenFishSale } from '../../utils/vrWorld/fishingSale';
import { SARPortrait } from './SARNpcArt';
import './aiven-fish-sale.css';

export function AivenFishSaleReceipt({ sale, sellerName, sellerWords }: { sale: AivenFishSale; sellerName: string; sellerWords?: string }) {
    const reply = AIVEN_FISH_SALE_REPLIES[sale.replyIndex];
    if (!reply) return null;
    return <section className="fish-aiven-sale" aria-label="艾文的售鱼回执">
        <div className="fish-aiven-sale-art"><SARPortrait who="aiven" expression={reply.expression}/></div>
        <div className="fish-aiven-sale-copy"><small>艾文 · 收鱼</small><p>{reply.text}</p><span>{sellerName}获得 <strong>{sale.amount}</strong> 鳞币</span>
            {sellerWords && <blockquote>{sellerName}：{sellerWords}</blockquote>}
        </div>
    </section>;
}
