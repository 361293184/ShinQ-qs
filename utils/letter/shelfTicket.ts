/**
 * 拾光票根卡片的纯逻辑（不碰 React、不碰 DB，纯函数好测）。
 *
 * 管三件事：票根编号、条形码、以及「每天换一张图」的选图。
 *
 * 三者都必须是**确定性**的：同一个角色每次渲染要得到同一个编号和同一串条码。
 * 否则每次重渲染卡片都在变样，看起来像坏了 —— 随机数只能来自 charId 的哈希。
 */

/** 字符串 → 32 位无符号整数（FNV-1a）。同一个输入永远得到同一个值。 */
export function hashString(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** 票根编号：NO.0000 ~ NO.9999，同一个角色恒定不变。 */
export function ticketSerial(charId: string): string {
    return String(hashString(`serial:${charId}`) % 10000).padStart(4, '0');
}

/**
 * 条形码：返回一串竖条宽度（px），按 charId 确定性生成。
 *
 * 不用「一份固定图案平铺」是因为那样所有角色的条码会长得一模一样 ——
 * 真票根上的条码是这张票的指纹，长得都一样就失去意义了。
 */
export function barcodeBars(charId: string, count = 26): number[] {
    const bars: number[] = [];
    let h = hashString(`barcode:${charId}`);
    for (let i = 0; i < count; i++) {
        // 线性同余再混一轮，避免相邻条宽呈周期性重复（那样一眼就看出是假的）
        h = (Math.imul(h, 1103515245) + 12345) >>> 0;
        // 1~4px 四档，而不是 1~3：真条码的宽窄比是跳跃的，
        // 只有三档时整条看起来像均匀条纹，一眼假。
        bars.push(1 + (h % 4));
    }
    return bars;
}

/**
 * 「今天」的整数标记（YYYYMMDD）。
 * 用本地日期而不是 `时间戳 / 86400000`：后者按 UTC 切日，东八区用户会在早上 8 点看到换图。
 */
export function dayStamp(now = Date.now()): number {
    const d = new Date(now);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * 每天挑一张图：同一天内稳定（反复渲染不跳），第二天自动换一张。
 *
 * 刻意不落库、不加定时器 —— 选图完全由「charId + 今天」决定，
 * 所以关掉 App 再打开、隔一周再进，行为都自然正确。
 * 图池为空时返回 null，由调用方走占位。
 */
export function pickDailyImage<T>(charId: string, pool: T[], now = Date.now()): T | null {
    if (!pool || pool.length === 0) return null;
    const seed = hashString(`${charId}#${dayStamp(now)}`);
    return pool[seed % pool.length];
}
