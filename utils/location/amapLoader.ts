/**
 * 高德 JS API 2.0 动态加载器（单例）。
 *
 * - 不引入 npm 包（@amap/amap-jsapi-loader 体积大且需新增依赖），改为手动注入 script。
 * - key / securityJsCode 由调用方从「设置 → 实时感知 → 定位」传入（存在 localStorage），
 *   不写死在代码仓库里，避免 key 被提交到 GitHub。
 * - 2021 年后高德 JS API 必须配置 `_AMapSecurityConfig.securityJsCode`，否则地图白屏。
 * - 组件卸载 / 切换 key 时应调用 `resetAmapLoader()` 让下次加载用新 key。
 */

let amapPromise: Promise<void> | null = null;
let loadedKey = '';

/** 当前正在注入的 script URL（便于调试 / 移除） */
export const getAmapScriptUrl = (key: string) =>
    `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.AutoComplete`;

/**
 * 加载高德 JS API。同一 key 只加载一次；换 key 前先 reset。
 * @param amapKey      高德 JS API Key（Web端类型）
 * @param securityJsCode 高德安全密钥 securityJsCode（可空字符串，空则不注入 security config）
 */
export async function loadAmap(amapKey: string, securityJsCode: string): Promise<void> {
    const key = (amapKey || '').trim();
    if (!key) throw new Error('未配置高德 Key，请在 设置 → 实时感知 → 定位 里填写');

    if (amapPromise && loadedKey === key) return amapPromise;

    // 换 key 了：重置单例与已注入 script
    if (amapPromise && loadedKey !== key) resetAmapLoader();

    loadedKey = key;
    amapPromise = new Promise<void>((resolve, reject) => {
        if ((window as any).AMap) {
            resolve();
            return;
        }
        // 注入安全密钥配置（必须在 script 加载前）
        if (securityJsCode && (securityJsCode as string).trim()) {
            (window as any)._AMapSecurityConfig = {
                securityJsCode: (securityJsCode as string).trim(),
            };
        }

        const script = document.createElement('script');
        script.src = getAmapScriptUrl(key);
        script.async = true;
        script.onload = () => {
            const wait = () => {
                if ((window as any).AMap) {
                    resolve();
                } else {
                    setTimeout(wait, 50);
                }
            };
            wait();
        };
        script.onerror = () => {
            resetAmapLoader();
            reject(new Error('高德地图脚本加载失败，请检查网络 / Key 是否正确'));
        };
        document.head.appendChild(script);
    });
    return amapPromise;
}

/** 重置加载器单例（换 key / 清理时调用）。会移除已注入的 script 与 security 配置。 */
export function resetAmapLoader(): void {
    amapPromise = null;
    loadedKey = '';
    const scripts = document.querySelectorAll('script[src^="https://webapi.amap.com/maps"]');
    scripts.forEach((s) => s.remove());
    delete (window as any)._AMapSecurityConfig;
}
