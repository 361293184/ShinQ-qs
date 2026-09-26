/**
 * 本地状态备份注册表（localStorage）。
 *
 * 背景：系统备份的导出侧（context/OSContext.tsx 的 exportSystem）原本只认一份
 * 「硬编码的 localStorage 白名单」（study_api_config / os_cloud_backup_config /
 * chat_translate_* 等）。自研功能的 localStorage 数据不在名单里，于是备份文件里
 * 根本没有它们，换设备导入后全部消失。
 *
 * 本模块是这类数据的**单一事实来源**：新增功能只要在 LOCAL_STATE_ENTRIES 加一行，
 * 导出与导入两侧都会自动带上，不必再改备份主流程。
 *
 * 刻意**不收录**以下几类（已由既有逻辑覆盖，重复收录会互相覆盖）：
 *   - `sullyos_` 前缀          —— exportSystem 已有前缀扫描（含拾光角色一句话、
 *                                  查手机反查记录/权限/冷却等）
 *   - `check_phone_api`        —— 走 checkPhoneApi 访问器显式备份
 *   - `os_realtime_config`     —— 作为 realtimeConfig 备份（微信读书主配置在里面）
 *   - `os_fanwai_stories_v1`
 *     `os_collected_letters_v1` —— 只是 IndexedDB 丢写时的**本机镜像**，非权威源；
 *                                  随备份迁移反而可能用陈旧镜像覆盖新数据
 *   - `os_weread_profile`      —— 旧键，真值已在 os_realtime_config 内
 *
 * 值的形状：localStorage 里全部是字符串，这里原样搬运（无损往返），
 * 不做解析再序列化 —— 那会让「裸字符串」与「JSON 字符串字面量」无法区分。
 */

/** 一条需要随备份迁移的本地状态登记项。 */
export interface LocalStateEntry {
    /** 精确 key；当 prefix 为 true 时表示前缀。 */
    key: string;
    /** true 表示前缀匹配，会收集所有以它开头的 key。 */
    prefix?: boolean;
    /** 中文标签，用于导入日志与失败告警。 */
    label: string;
    /** true = 用户内容（丢失不可恢复）；false = 配置（丢失需重设）。 */
    content: boolean;
}

/**
 * 需要备份的 localStorage 清单。
 *
 * 各 key 的权威定义位置见每行注释 —— 这里是备份视角的登记，不是定义的搬运；
 * 那些模块内的常量是私有的（未 export），因此本表集中写一次，改动时两处都要看。
 */
export const LOCAL_STATE_ENTRIES: LocalStateEntry[] = [
    // ─────────── 用户内容类（丢失不可恢复，优先保） ───────────
    {
        // 权威定义：utils/novelReader.ts:48 `LS_PREFIX = 'nrcache_'`（已 export）
        // 覆盖 nr_books(书架全文) / nr_current / nr_progress / nr_theme / nr_skin /
        // nr_fontsize / nr_vocab(生词本) / nr_learn / nr_geom
        key: 'nrcache_',
        prefix: true,
        label: '私聊小说共读（书架/进度/生词本/皮肤等）',
        content: true,
    },
    {
        // 权威定义：utils/realityBridge/settings.ts:18 `KEY_FEED`
        key: 'reality_bridge_feed_v1',
        label: '现实桥信息流记录',
        content: true,
    },
    {
        // 权威定义：utils/wechatBridge/settings.ts:10
        // 内含本机设备身份 clientId —— 丢了要重新粘贴同一枚才能共用同一片云端空间
        key: 'wechat_bridge_settings_v1',
        label: '微信桥设备身份与本地配置',
        content: true,
    },
    {
        // 权威定义：apps/Settings.tsx:501 / 1119
        key: 'os_sub_api_presets',
        label: '副 API 预设列表',
        content: true,
    },
    {
        // 权威定义：utils/games/gameStore.ts:56
        // 总局数/胜局/MVP/最近战绩，属积累型内容
        key: 'gamehub_stats',
        label: '小游戏战绩历史',
        content: true,
    },

    // ─────────── 配置类（丢失需重设） ───────────
    {
        // 权威定义：utils/realityBridge/settings.ts:14-17,19
        key: 'reality_bridge_settings_v1',
        label: '现实桥设置',
        content: false,
    },
    {
        key: 'reality_bridge_rules_v1',
        label: '现实桥规则',
        content: false,
    },
    {
        key: 'reality_bridge_actions_v1',
        label: '现实桥快捷动作',
        content: false,
    },
    {
        key: 'reality_bridge_data_items_v1',
        label: '现实桥数据项',
        content: false,
    },
    {
        key: 'reality_bridge_screen_chat_v1',
        label: '现实桥屏幕聊天设置',
        content: false,
    },
    {
        // 权威定义：utils/games/gameStore.ts:55
        key: 'gamehub_settings',
        label: '小游戏设置',
        content: false,
    },
    {
        // 权威定义：utils/fanwaiGenerator.ts:801
        key: 'os_fanwai_form_v1',
        label: '番外生成表单记忆（文风/字数/人称）',
        content: false,
    },
    {
        // 权威定义：utils/letter/letterTrigger.ts:18
        key: 'os_last_seen_date',
        label: '来信节奏·最后上线日',
        content: false,
    },
    {
        // 权威定义：utils/letter/letterTrigger.ts:19（`os_letter_written_${charId}`）
        key: 'os_letter_written_',
        prefix: true,
        label: '来信节奏·当天已写信标记',
        content: false,
    },
];

/** localStorage 是否可用（SSR / 隐私模式下可能缺失）。 */
function hasLocalStorage(): boolean {
    try {
        return typeof window !== 'undefined' && !!window.localStorage;
    } catch {
        return false;
    }
}

/** 该 key 是否落在登记表内（精确或前缀）。用于导入时拒绝写无关键。 */
export function isRegisteredLocalStateKey(key: string): boolean {
    return LOCAL_STATE_ENTRIES.some(entry => (
        entry.prefix ? key.startsWith(entry.key) : key === entry.key
    ));
}

/**
 * 收集所有登记键的当前值。无任何数据时返回 undefined，
 * 这样旧版本读到此字段为 undefined 时不会误判为「备份里是空的」而清空本地。
 */
export function collectLocalStateBackup(): Record<string, string> | undefined {
    if (!hasLocalStorage()) return undefined;
    const out: Record<string, string> = {};

    const take = (key: string): void => {
        try {
            const value = window.localStorage.getItem(key);
            if (value !== null) out[key] = value;
        } catch {
            /* 单键读取失败不影响其余键 */
        }
    };

    for (const entry of LOCAL_STATE_ENTRIES) {
        if (!entry.prefix) {
            take(entry.key);
            continue;
        }
        try {
            // 前缀项：遍历现有 key 收集。不边遍历边写，避免顺序依赖。
            const matched: string[] = [];
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (key && key.startsWith(entry.key)) matched.push(key);
            }
            matched.forEach(take);
        } catch {
            /* ignore */
        }
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 用备份内容覆盖本地登记键。未出现在备份中的键保持不动（旧备份 → 不清空本地）。
 *
 * 逐键 try/catch：单键失败只告警，绝不抛出，也不回滚已完成的 IndexedDB 恢复。
 * 出于安全，只接受登记表内的 key —— 备份文件若被塞入无关键会被丢弃。
 */
export function restoreLocalStateBackup(
    data: Record<string, string> | undefined,
): { restored: number; failed: number; skipped: number } {
    const result = { restored: 0, failed: 0, skipped: 0 };
    if (!data || typeof data !== 'object' || !hasLocalStorage()) return result;

    for (const [key, value] of Object.entries(data)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
            result.skipped++;
            continue;
        }
        if (!isRegisteredLocalStateKey(key)) {
            result.skipped++;
            continue;
        }
        try {
            window.localStorage.setItem(key, value);
            result.restored++;
        } catch (error) {
            result.failed++;
            console.warn(`[Backup] 恢复本地状态失败: ${key}`, error);
        }
    }
    return result;
}
