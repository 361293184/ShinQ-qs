import { speciesById, type FishingMarketState } from './fishingMarket';
import { getSARModuleById as getChip } from './sarGacha';
import { getSARModuleById as getModule } from './sarModuleShop';

export type SARWarehouseItem = { id: string; title: string; kind: 'chip' | 'module' | 'catch'; count: number; detail: string; status: string; speciesId?: string };
/** Current ownership is authoritative; acquisition origin never grants duplicate ownership. */
export const sarWarehouseItems = (state: FishingMarketState, actorId: string, now = Date.now()): SARWarehouseItem[] => {
    const items: SARWarehouseItem[] = [];
    if (actorId === 'user') for (const [id, count] of Object.entries(state.sarCommerce?.gacha.collection || {})) {
        const chip = getChip(id);
        if (chip && count > 0) items.push({ id, title: chip.title, kind: 'chip', count, detail: chip.summary, status: chip.pool === 'story' ? '故事芯片' : '变体芯片' });
    }
    for (const [id, count] of Object.entries(actorId === 'user' ? state.sarCommerce?.moduleShop.inventory || {} : state.sarCharacterModules?.[actorId] || {})) {
        const module = getModule(id);
        if (module && count > 0) items.push({ id, title: module.title, kind: 'module', count, detail: module.description, status: '待装载' });
    }
    for (const caught of state.inventory.filter(c => c.ownerId === actorId)) {
        const species = speciesById(caught.speciesId);
        if (!species) continue;
        const toy = state.dinosaurGarden?.toys[caught.id];
        const listed = state.listings.some(p => p.catchId === caught.id && p.status === 'open' && p.expiresAt > now);
        items.push({ id: caught.id, title: toy?.name || species.name, kind: 'catch', count: 1, speciesId: caught.speciesId,
            detail: `${species.blurb} ${caught.sizeCm} cm · ${'✦'.repeat(caught.quality)}`,
            status: listed ? '挂板中' : caught.incubatingUntil ? caught.incubatingUntil > now ? '孵化中' : '等待揭晓' : caught.displayed ? '陈列中' : toy?.mapId ? '箱庭中' : species.category === 'fish' ? '鱼获' : '橡皮泥模型' });
    }
    return items;
};
