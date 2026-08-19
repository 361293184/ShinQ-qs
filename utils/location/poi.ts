/**
 * 高德 PlaceSearch 周边 POI 搜索封装。
 *
 * - 用 JS API 内置插件 AMap.PlaceSearch（around 模式）搜周边，走 JS API 域名白名单保护，
 *   不需要额外的 Web 服务 key，也不需要代理。
 * - 搜索类别：餐饮 / 咖啡 / 地标 / 酒店 / 交通枢纽 混合。
 * - 拖动地图中心点变化时重新搜索，调用方需做 ~300ms 防抖（见 LocationPickerModal）。
 */

export interface SearchPoiOptions {
    center: { lng: number; lat: number };
    radius?: number;       // 搜索半径（米），默认 2000
    keyword?: string;      // 可选：关键词优先
    pageSize?: number;     // 默认 15
}

/** 周边搜索类别（高德 type 编码，取主要类别 + 交通枢纽） */
const SEARCH_TYPES = '餐饮服务|购物服务|道路附属设施|地名地址信息|交通设施服务';

/**
 * 在中心点周边搜索 POI。返回简化后的地点列表。
 * 依赖高德 JS API 已加载（loadAmap 之后调用）。
 */
export async function searchAroundPois(opts: SearchPoiOptions): Promise<AMap.PoiItem[]> {
    const AMap = (window as any).AMap;
    if (!AMap || typeof AMap.PlaceSearch !== 'function') return [];

    const { center, radius = 2000, keyword, pageSize = 15 } = opts;

    const placeSearch = new AMap.PlaceSearch({
        pageSize,
        pageIndex: 1,
        extensions: 'all',
        type: SEARCH_TYPES,
        city: '',
    });

    return new Promise<AMap.PoiItem[]>((resolve) => {
        const done = (status: string, result: any) => {
            if (status === 'complete' && result?.poiList?.pois?.length) {
                resolve(result.poiList.pois);
            } else {
                resolve([]);
            }
        };

        try {
            if (keyword && keyword.trim()) {
                placeSearch.search(keyword.trim(), done);
            } else {
                placeSearch.searchNearBy('', new AMap.LngLat(center.lng, center.lat), radius, done);
            }
        } catch (e) {
            resolve([]);
        }
    });
}

/** 归一化 POI 为消息卡片要用的字段（name/address/lng/lat）。 */
export function toLocationFields(poi: AMap.PoiItem): {
    name: string;
    address: string;
    lng: number;
    lat: number;
} {
    const loc = poi.location;
    return {
        name: poi.name || '当前位置',
        address: poi.address || `${poi.pname || ''}${poi.cityname || ''}${poi.adname || ''}`,
        lng: loc?.lng ?? 0,
        lat: loc?.lat ?? 0,
    };
}
