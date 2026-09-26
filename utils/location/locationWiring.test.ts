/**
 * 高德定位/搜索链路的接线守卫（源码级断言，参考 apiPresetSwitch.wiring.test.ts）。
 *
 * 这次修的两个问题都是「配好了高德却没用对」——插件加载了没用、搜索被类别过滤卡死。
 * 这些断言钉住的是容易悄悄退回去的点：
 *
 *   1. 插件串漏掉 AMap.Geolocation —— 定位静默回退到 WebView IP 定位，误差回到公里级；
 *   2. PlaceSearch 又传了 type 过滤 —— 公寓/学校/医院再次搜不到（用户亲测踩过的坑）；
 *   3. 关键词搜索不锁城市 —— 本地小地点被全国同名结果淹没；
 *   4. AutoComplete 联想从主通道被摘掉 —— 退回又慢又窄的纯 PlaceSearch。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, ...rel.split('/')), 'utf8');
/** 去掉注释行，避免注释里提到的字样把断言骗过去。 */
const code = (source: string): string => source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

describe('高德插件加载', () => {
    it('amapLoader 插件串必须包含 Geolocation（定位精度主通道）', () => {
        const loader = code(read('utils/location/amapLoader.ts'));
        expect(loader).toContain('AMap.PlaceSearch,AMap.Geocoder,AMap.AutoComplete,AMap.Geolocation');
    });
});

describe('搜索不再被类别过滤卡死', () => {
    const poi = code(read('utils/location/poi.ts'));

    it('不再存在 SEARCH_TYPES 类别过滤', () => {
        expect(poi).not.toContain('SEARCH_TYPES');
        // PlaceSearch 构造项里不传 type（传了等于重新把搜索范围锁死）
        expect(poi).not.toMatch(/type:\s*SEARCH/);
    });

    it('关键词搜索支持城市锁定与距离加权（city/location 入参）', () => {
        expect(poi).toMatch(/city\?:\s*string/);
        expect(poi).toMatch(/location\?:\s*\{\s*lng:\s*number;\s*lat:\s*number\s*\}/);
        expect(poi).toMatch(/city:\s*city \|\| ''/);
    });

    it('AutoComplete 联想是导出的搜索通道，并过滤无 location 的联想项', () => {
        expect(poi).toMatch(/export async function searchPlaceSuggestions/);
        expect(poi).toMatch(/new AMap\.AutoComplete\(/);
        expect(poi).toMatch(/filter\(\(t: any\) => t\?\.location/);
    });
});

describe('定位与选点接线', () => {
    const coordinate = code(read('utils/location/coordinate.ts'));
    const picker = code(read('components/chat/LocationPickerModal.tsx'));

    it('geolocateViaAmap 存在：高德插件优先、15s 超时、低精度重试', () => {
        expect(coordinate).toMatch(/export async function geolocateViaAmap/);
        expect(coordinate).toMatch(/enableHighAccuracy:\s*true/);
        expect(coordinate).toMatch(/timeout:\s*15000/);
        expect(coordinate).toMatch(/accuracy > 500/);
    });

    it('选点弹窗优先走高德定位，旧链路仅作回退', () => {
        expect(picker).toMatch(/await geolocateViaAmap\(\)/);
        // 回退分支仍然保留（插件不可用的环境不能比改前更差）
        expect(picker).toMatch(/await geolocate\(\)/);
        expect(picker).toMatch(/await toGcj02\(/);
    });

    it('关键词搜索走「联想优先、PlaceSearch 兜底」双通道', () => {
        expect(picker).toMatch(/await searchPlaceSuggestions\(/);
        expect(picker).toMatch(/await searchAroundPois\(\{[\s\S]*?keyword/);
    });

    it('定位后逆地理拿城市码（搜索锁城的数据来源）', () => {
        expect(picker).toMatch(/await reverseGeocodeAmap\(/);
        expect(picker).toMatch(/cityCodeRef\.current = rev\.citycode/);
    });

    it('定位误差画成精度圈，让用户直观看到准不准', () => {
        expect(picker).toMatch(/drawAccuracyCircle\(/);
        expect(picker).toMatch(/new AMap\.Circle\(/);
    });
});
