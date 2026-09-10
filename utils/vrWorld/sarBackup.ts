import { SAR_CLUB_STORAGE_KEY, readSARClubState } from './sarClub';
import { SAR_GACHA_STORAGE_KEY, readSARGachaState } from './sarGacha';
import { SAR_MODULE_SHOP_STORAGE_KEY, readSARModuleShopState } from './sarModuleShop';
import { FISHING_MARKET_STORAGE_KEY, readFishingMarketState } from './fishingMarket';

// 与 sarSimulation.ts 的公开键保持一致。这里故意不反向 import 推演执行器，
// 避免 OSContext 的备份入口把整条聊天 Prompt / LLM 管线提前拉进启动包。
const SAR_SIMULATION_STORAGE_KEY = 'vr_sar_simulations_v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SARLocalBackup = {
    version: 1;
    club?: unknown;
    gacha?: unknown;
    simulations?: unknown;
    moduleShop?: unknown;
    fishingMarket?: unknown;
    fishingMarketRaw?: string;
};

const has = (storage: Pick<Storage, 'getItem'>, key: string) => storage.getItem(key) !== null;

export const collectSARLocalBackup = (storage: StorageLike = localStorage): SARLocalBackup => {
    const backup: SARLocalBackup = { version: 1 };
    let source = storage;
    if (has(storage, FISHING_MARKET_STORAGE_KEY)) {
        try { backup.fishingMarket = readFishingMarketState(storage); }
        catch {
            backup.fishingMarketRaw = storage.getItem(FISHING_MARKET_STORAGE_KEY)!;
            source = { getItem: key => key === FISHING_MARKET_STORAGE_KEY ? null : storage.getItem(key), setItem: (key, value) => storage.setItem(key, value), removeItem: key => storage.removeItem(key) };
        }
    }
    if (has(storage, SAR_CLUB_STORAGE_KEY)) backup.club = readSARClubState(storage);
    const commerce = (backup.fishingMarket as ReturnType<typeof readFishingMarketState> | undefined)?.sarCommerce;
    if (has(storage, SAR_GACHA_STORAGE_KEY) || commerce?.gacha) backup.gacha = readSARGachaState(source);
    if (has(storage, SAR_MODULE_SHOP_STORAGE_KEY) || commerce?.moduleShop) backup.moduleShop = readSARModuleShopState(source);
    if (has(storage, SAR_SIMULATION_STORAGE_KEY)) {
        try { backup.simulations = JSON.parse(storage.getItem(SAR_SIMULATION_STORAGE_KEY) || 'null'); }
        catch { backup.simulations = { version: 1, records: [] }; }
    }
    return backup;
};

export const restoreSARLocalBackup = (
    backup: SARLocalBackup | undefined,
    options: { replaceMissing: boolean },
    storage: StorageLike = localStorage,
) => {
    const restoreOne = (key: string, value: unknown) => {
        if (value !== undefined) storage.setItem(key, JSON.stringify(value));
        else if (options.replaceMissing) storage.removeItem(key);
    };
    restoreOne(SAR_CLUB_STORAGE_KEY, backup?.club);
    restoreOne(SAR_GACHA_STORAGE_KEY, backup?.gacha);
    restoreOne(SAR_SIMULATION_STORAGE_KEY, backup?.simulations);
    restoreOne(SAR_MODULE_SHOP_STORAGE_KEY, backup?.moduleShop);
    if (typeof backup?.fishingMarketRaw === 'string') storage.setItem(FISHING_MARKET_STORAGE_KEY, backup.fishingMarketRaw);
    else restoreOne(FISHING_MARKET_STORAGE_KEY, backup?.fishingMarket);
    // A partial legacy import must also reach the authoritative migrated inventory.
    if (!options.replaceMissing && backup && backup.fishingMarket === undefined && backup.fishingMarketRaw === undefined
        && (backup.gacha !== undefined || backup.moduleShop !== undefined) && has(storage, FISHING_MARKET_STORAGE_KEY)) {
        const market = readFishingMarketState(storage);
        if (market.sarCommerce) storage.setItem(FISHING_MARKET_STORAGE_KEY, JSON.stringify({ ...market, sarCommerce: {
            gacha: backup.gacha !== undefined ? backup.gacha : market.sarCommerce.gacha,
            moduleShop: backup.moduleShop !== undefined ? backup.moduleShop : market.sarCommerce.moduleShop,
        } }));
    }
};
