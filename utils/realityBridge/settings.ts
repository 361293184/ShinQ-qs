/** 现实桥 · 本地配置存储（localStorage KV，参考 pushVapid 模式，不用全局 DB 避免版本升级牵动）。 */

import {
    BridgeDataItem,
    BridgeFeedEntry,
    BridgeRule,
    BridgeSettings,
    BridgeShortcutAction,
    DEFAULT_BRIDGE_SETTINGS,
    CharacterBridgePref,
    ScreenChatSettings,
} from './types';

const KEY_SETTINGS = 'reality_bridge_settings_v1';
const KEY_RULES = 'reality_bridge_rules_v1';
const KEY_ACTIONS = 'reality_bridge_actions_v1';
const KEY_DATA_ITEMS = 'reality_bridge_data_items_v1';
const KEY_FEED = 'reality_bridge_feed_v1';
const KEY_SCREEN_CHAT = 'reality_bridge_screen_chat_v1';

const FEED_LIMIT = 100;

function read<T>(key: string, fallback: T): T {
    if (typeof localStorage === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return { ...(fallback as object), ...(JSON.parse(raw) as T) } as T;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown): void {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { /* 存储满/隐私模式：仅丢持久化，不影响内存态 */ }
}

function readArray<T>(key: string): T[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) as unknown : [];
        return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
        return [];
    }
}

/* ── 全局设置 ── */

export function loadBridgeSettings(): BridgeSettings {
    return read<BridgeSettings>(KEY_SETTINGS, DEFAULT_BRIDGE_SETTINGS);
}

export function saveBridgeSettings(settings: BridgeSettings): void {
    write(KEY_SETTINGS, settings);
}

/* ── 角色开关 ── */

export function loadCharBridgePref(characterId: string): CharacterBridgePref {
    return loadBridgeSettings().perChar?.[characterId] ?? { enabled: false, autoReply: false };
}

export function saveCharBridgePref(characterId: string, pref: CharacterBridgePref): void {
    const settings = loadBridgeSettings();
    const perChar = { ...(settings.perChar || {}) };
    perChar[characterId] = pref;
    saveBridgeSettings({ ...settings, perChar });
}

/* ── 规则 ── */

export function loadBridgeRules(): BridgeRule[] {
    return readArray<BridgeRule>(KEY_RULES);
}

export function saveBridgeRules(rules: BridgeRule[]): void {
    write(KEY_RULES, rules.slice(0, 50));
}

/* ── 快捷动作 ── */

export function loadBridgeActions(): BridgeShortcutAction[] {
    return readArray<BridgeShortcutAction>(KEY_ACTIONS);
}

export function saveBridgeActions(actions: BridgeShortcutAction[]): void {
    write(KEY_ACTIONS, actions.slice(0, 30));
}

/* ── 数据项 ── */

export function loadBridgeDataItems(): BridgeDataItem[] {
    return readArray<BridgeDataItem>(KEY_DATA_ITEMS);
}

export function saveBridgeDataItems(items: BridgeDataItem[]): void {
    write(KEY_DATA_ITEMS, items.slice(0, 30));
}

/* ── 屏幕速聊 ── */

export function loadScreenChat(): ScreenChatSettings {
    return { enabled: false, characterId: '', ...read<Partial<ScreenChatSettings>>(KEY_SCREEN_CHAT, {}) };
}

export function saveScreenChat(settings: ScreenChatSettings): void {
    write(KEY_SCREEN_CHAT, settings);
}

/* ── 事件流水 ── */

export function loadBridgeFeed(): BridgeFeedEntry[] {
    return readArray<BridgeFeedEntry>(KEY_FEED);
}

export function appendBridgeFeed(entry: BridgeFeedEntry): void {
    write(KEY_FEED, [entry, ...loadBridgeFeed()].slice(0, FEED_LIMIT));
}

export function clearBridgeFeed(): void {
    write(KEY_FEED, []);
}
