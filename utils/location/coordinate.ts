/**
 * 坐标处理：浏览器/Capacitor 拿到的 WGS-84 坐标 → 高德地图 GCJ-02。
 *
 * 高德地图（及国内主流地图）用火星坐标系 GCJ-02；浏览器 navigator.geolocation
 * 返回的是 WGS-84，两者相差约 200~500 米。必须用高德 `AMap.convertFrom` 纠偏，
 * 否则地图落点和真实位置对不上。
 */

import { getCurrentPositionSmart } from '../geo';

export interface RawGeo {
    lng: number;
    lat: number;
    accuracy: number;
}

/** 用现有跨端定位工具取真实坐标（原生走 Capacitor 插件弹权限，浏览器走 navigator）。 */
export async function geolocate(): Promise<RawGeo> {
    const r = await getCurrentPositionSmart();
    return { lng: r.longitude, lat: r.latitude, accuracy: r.accuracy ?? 99999 };
}

/**
 * 用高德自家定位插件（AMap.Geolocation）取当前坐标。
 *
 * 与 geolocate()（WebView/IP 定位，WGS-84 需纠偏）的两点关键差别：
 *  - 高德插件混合 IP/WiFi/基站/GPS 定位、走高德在国内的定位服务，
 *    国产无 GMS 机型上精度远好于 WebView 的 H5 定位（那条路实际是 IP 定位，误差 500m~5km）；
 *  - 返回**直接就是 GCJ-02**（插件内部已转换），调用方无需再走 toGcj02（省一次网络纠偏）。
 *
 * enableHighAccuracy + 15s 超时：给 GPS 冷启动留足时间 —— GPS 首次定位通常要 10~30s，
 * 旧链路 8s 超时会在收敛前把低精度结果端上来。accuracy > 500m（几乎可以断定是网络定位）
 * 时自动再等一次，两次取精度更优的。
 *
 * 依赖 AMap.Geolocation 插件已随地图加载（见 amapLoader 的插件串）。
 * 插件不可用 / 定位失败 / 超时：抛错，由调用方回退 geolocate() + toGcj02 既有链路。
 */
export async function geolocateViaAmap(): Promise<RawGeo> {
    const AMap = (window as any).AMap;
    if (!AMap || typeof AMap.Geolocation !== 'function') {
        throw new Error('AMap.Geolocation 插件未加载');
    }

    const once = (): Promise<RawGeo> => new Promise<RawGeo>((resolve, reject) => {
        let geo: any;
        try {
            geo = new AMap.Geolocation({
                enableHighAccuracy: true, // 尝试 GPS，而不是只用 IP/基站
                timeout: 15000,           // GPS 冷启动通常 10~30s，给够收敛时间
                maximumAge: 0,            // 不用缓存结果
                convert: true,            // 返回 GCJ-02（默认值，显式写出以免误会）
            });
            geo.getCurrentPosition((status: string, result: any) => {
                if (status === 'complete' && result?.position) {
                    resolve({
                        lng: result.position.lng,
                        lat: result.position.lat,
                        accuracy: typeof result.accuracy === 'number' ? result.accuracy : 99999,
                    });
                } else {
                    reject(new Error(result?.message || '高德定位失败'));
                }
            });
        } catch (e: any) {
            reject(new Error(e?.message || '高德定位异常'));
        }
    });

    const first = await once();
    if (first.accuracy > 500) {
        try {
            const second = await once();
            return second.accuracy < first.accuracy ? second : first;
        } catch {
            return first; // 重试失败就用第一次的结果，别让用户白等
        }
    }
    return first;
}

/**
 * 高德逆地理：坐标 → 城市码 + 格式化地址。
 *
 * 用于两件事：① 拿 citycode/adcode 给关键词搜索锁定城市（避免全国同名结果
 * 淹没本地小地点）；② 把默认「当前位置」的描述从「±xx 米」升级为真实地址。
 *
 * 依赖 AMap.Geocoder 插件已加载。任何失败返回 null，调用方降级为不限城市。
 */
export async function reverseGeocodeAmap(
    lng: number,
    lat: number,
): Promise<{ citycode: string; address: string } | null> {
    const AMap = (window as any).AMap;
    if (!AMap || typeof AMap.Geocoder !== 'function') return null;
    return new Promise((resolve) => {
        try {
            const geocoder = new AMap.Geocoder({});
            geocoder.getAddress([lng, lat], (status: string, result: any) => {
                if (status === 'complete' && result?.regeocode) {
                    const comp = result.regeocode.addressComponent || {};
                    const formatted = typeof result.regeocode.formattedAddress === 'string'
                        ? result.regeocode.formattedAddress
                        : '';
                    resolve({
                        citycode: typeof comp.citycode === 'string' ? comp.citycode
                            : typeof comp.adcode === 'string' ? comp.adcode : '',
                        address: formatted,
                    });
                } else {
                    resolve(null);
                }
            });
        } catch {
            resolve(null);
        }
    });
}

/**
 * WGS-84 → GCJ-02 纠偏（单个坐标）。
 * 依赖高德 JS API 已加载（loadAmap 之后调用）。返回纠偏后的 lng/lat。
 */
export async function toGcj02(lng: number, lat: number): Promise<{ lng: number; lat: number }> {
    const AMap = (window as any).AMap;
    if (!AMap || typeof AMap.convertFrom !== 'function') {
        // JS API 未就绪：直接返回原坐标（误差可接受，避免阻塞）
        return { lng, lat };
    }
    return new Promise<{ lng: number; lat: number }>((resolve) => {
        try {
            AMap.convertFrom([{ lng, lat }], 'gps', (status: string, result: any) => {
                if (status === 'complete' && result?.locations?.length) {
                    const loc = result.locations[0];
                    resolve({ lng: loc.lng, lat: loc.lat });
                } else {
                    resolve({ lng, lat });
                }
            });
        } catch (e) {
            resolve({ lng, lat });
        }
    });
}

/**
 * 快速、低精度纠偏算法（用于"当前位置"坐标展示兜底，防地图落点太飘）。
 * 未使用高德 convertFrom 时用纯算法做近似火星坐标纠偏。
 * 注：本项目真实定位统一走 toGcj02（高德 convertFrom），此函数仅作极端兜底。
 */
export function wgs84ToGcj02Approx(lng: number, lat: number): { lng: number; lat: number } {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    const PI = Math.PI;

    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = (lat / 180.0) * PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
    return { lng: lng + dLng, lat: lat + dLat };
}

function transformLat(x: number, y: number): number {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x: number, y: number): number {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0 / 3.0;
    return ret;
}
