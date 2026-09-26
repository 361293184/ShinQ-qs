/**
 * 高德 POI 搜索封装（PlaceSearch 周边 + AutoComplete 输入联想）。
 *
 * - 用 JS API 内置插件，走 JS API 域名白名单保护，不需要额外的 Web 服务 key，也不需要代理。
 * - **不做任何类别过滤**：早期版本限定「餐饮/购物/道路/地名/交通」五类，导致小区、学校、
 *   医院、公司、景点全搜不到（用户连自己住的公寓都搜不出来）。高德全类别索引下放开
 *   过滤是「能搜到自己公寓」的前提，别再把 type 加回来。
 * - 关键词搜索支持 city 锁定 + location 距离加权：不加 city 时 PlaceSearch 是全国范围，
 *   本地小地点会被全国同名结果淹没（著名地点权重高总排前面）。
 * - 拖动地图中心点变化时重新搜索，调用方需做 ~300ms 防抖（见 LocationPickerModal）。
 */

export interface SearchPoiOptions {
    center: { lng: number; lat: number };
    radius?: number;       // 搜索半径（米），默认 2000（仅周边模式生效）
    keyword?: string;      // 可选：关键词优先
    pageSize?: number;     // 默认 15
    /** 城市（citycode / adcode / 城市名）。关键词搜索时锁定城市，避免全国同名结果淹没本地小地点。 */
    city?: string;
    /** 中心点（GCJ-02）。关键词搜索时作为距离加权（结果按离它远近排）。 */
    location?: { lng: number; lat: number };
}

/**
 * 关键词搜索（全类别，PlaceSearch.search）。
 * 调用方优先走 searchPlaceSuggestions（更快、联想），本函数作为联想空结果时的回退。
 */
export async function searchAroundPois(opts: SearchPoiOptions): Promise<AMap.PoiItem[]> {
    const AMap = (window as any).AMap;
    if (!AMap || typeof AMap.PlaceSearch !== 'function') return [];

    const { center, radius = 2000, keyword, pageSize = 15, city, location } = opts;
    // 注意：不传 type —— 传了就把搜索范围锁死在那几个类别里，公寓/学校/医院全搜不到
    const placeSearch = new AMap.PlaceSearch({
        pageSize,
        pageIndex: 1,
        extensions: 'all',
        city: city || '',
        // 关键词搜索时把中心点传给高德做距离加权，本地结果尽量排前
        location: location ? new AMap.LngLat(location.lng, location.lat) : undefined,
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

/**
 * 高德输入联想（AMap.AutoComplete）—— 搜公寓 / 小店 / 小机构的主通道：
 * 全类别生效、原生按城市过滤、响应比 PlaceSearch 快得多。
 *
 * 过滤掉无 location 的联想项（公交线路等无法直接落点的结果），
 * 输出统一成与 PlaceSearch PoiItem 同构的形态，调用方用 toLocationFields 统一处理。
 */
export async function searchPlaceSuggestions(
    keyword: string,
    city?: string,
): Promise<AMap.PoiItem[]> {
    const AMap = (window as any).AMap;
    if (!AMap || typeof AMap.AutoComplete !== 'function') return [];

    const kw = keyword.trim();
    if (!kw) return [];

    const auto = new AMap.AutoComplete({ city: city || '' });

    return new Promise<AMap.PoiItem[]>((resolve) => {
        try {
            auto.search(kw, (status: string, result: any) => {
                if (status === 'complete' && Array.isArray(result?.tips)) {
                    const tips = result.tips
                        .filter((t: any) => t?.location && typeof t.location.lng === 'number' && typeof t.location.lat === 'number')
                        .map((t: any) => ({
                            name: t.name || '',
                            // tip 的 address 在 2.0 里可能是字符串，也可能是空数组（区的聚合项），统一兜底
                            address: typeof t.address === 'string' ? t.address : '',
                            location: t.location,
                            pname: typeof t.pname === 'string' ? t.pname : '',
                            cityname: typeof t.cityname === 'string' ? t.cityname : '',
                            adname: typeof t.adname === 'string' ? t.adname : '',
                        }));
                    resolve(tips);
                } else {
                    resolve([]);
                }
            });
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
