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
