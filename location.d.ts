/**
 * 高德地图 JS API 2.0 全局类型声明（`window.AMap`）。
 * 官方 JS API 不提供完整 TS 类型，这里只声明本次真实定位用到的 API 子集，
 * 需要新增再往上补。加载器见 utils/location/amapLoader.ts。
 */
declare namespace AMap {
    interface LngLatLike {
        lng: number;
        lat: number;
    }

    class LngLat {
        constructor(lng: number, lat: number);
        getLng(): number;
        getLat(): number;
        lng: number;
        lat: number;
    }

    class Pixel {
        constructor(x: number, y: number);
    }

    class Size {
        constructor(width: number, height: number);
    }

    class Map {
        constructor(container: HTMLElement | string, options?: MapOptions);
        setCenter(center: LngLatLike): void;
        getCenter(): LngLat;
        setZoom(zoom: number): void;
        getZoom(): number;
        setCity(city: string, callback?: () => void): void;
        add(overlay: any | any[]): void;
        clearMap(): void;
        destroy(): void;
        on(event: string, callback: (...args: any[]) => void): void;
        off(event: string, callback?: (...args: any[]) => void): void;
        setStatus(status: object): void;
        getContainer(): HTMLElement;
        remove(overlay: any): void;
        pixelToLngLat(pixel: Pixel): LngLat;
        lngLatToPixel(lnglat: LngLat): Pixel;
    }

    interface MapOptions {
        viewMode?: '2D' | '3D';
        zoom?: number;
        center?: LngLatLike;
        mapStyle?: string;
        resizeEnable?: boolean;
        showBuildingBlock?: boolean;
    }

    interface MarkerOptions {
        position: LngLatLike;
        map?: Map;
        offset?: Pixel;
        content?: string | HTMLElement;
        icon?: string | any;
        animation?: string | number;
        title?: string;
    }

    class Marker {
        constructor(options?: MarkerOptions);
        setPosition(lnglat: LngLatLike): void;
        setMap(map: Map | null): void;
        setContent(content: string | HTMLElement): void;
        on(event: string, callback: (...args: any[]) => void): void;
        getPosition(): LngLat;
        setAnimation(animation: string | number): void;
    }

    class Circle {
        constructor(options?: object);
        setMap(map: Map | null): void;
    }

    interface PoiItem {
        id: string;
        name: string;
        type: string;
        pname?: string;
        cityname?: string;
        adname?: string;
        address: string;
        location: LngLat;
        distance?: number;
        tel?: string;
    }

    interface SearchOptions {
        pageSize?: number;
        pageIndex?: number;
        city?: string;
        extensions?: string;
        type?: string;
        autoFitView?: boolean;
    }

    interface PlaceSearchResult {
        poiList?: {
            pois: PoiItem[];
            count: number;
        };
        info?: string;
    }

    class PlaceSearch {
        constructor(opts: { pageSize?: number; pageIndex?: number; city?: string; map?: Map; panel?: HTMLElement | string; extensions?: string; type?: string });
        search(keyword: string, callback: (status: string, result: PlaceSearchResult) => void): void;
        searchNearBy(keyword: string, center: LngLatLike, radius: number, callback: (status: string, result: PlaceSearchResult) => void): void;
        setCity(city: string): void;
    }

    class Geocoder {
        constructor(opts?: object);
        getAddress(lnglat: LngLatLike, callback: (status: string, result: any) => void): void;
        getLocation(address: string, callback: (status: string, result: any) => void): void;
        setCity(city: string): void;
    }

    interface ConvertResult {
        info: string;
        locations: LngLat[];
    }

    function convertFrom(
        lnglat: LngLatLike | LngLatLike[],
        type: string,
        callback: (status: string, result: ConvertResult) => void
    ): void;

    function getDefaultConfig(): any;
}
