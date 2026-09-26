// @vitest-environment jsdom
/**
 * 本地状态备份往返测试。
 *
 * 覆盖三件事：
 *   1. 收集 → 恢复 往返无损（前缀项与精确项都要收齐）；
 *   2. 无数据时收集返回 undefined —— 旧备份导入端据此跳过，不会误清空本地；
 *   3. 恢复时只接受登记表内的键，备份文件被塞入额外键会被丢弃。
 */
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import {
    LOCAL_STATE_ENTRIES,
    collectLocalStateBackup,
    isRegisteredLocalStateKey,
    restoreLocalStateBackup,
} from './backupLocalState';
import {
    assembleV2Backup,
    writeV2Backup,
    type ZipFileReader,
    type ZipFileWriter,
} from './backupFormat';

/** 把 JSZip 适配成 backupFormat 期望的极简读写接口。 */
function adaptZip(zip: JSZip): { writer: ZipFileWriter; reader: ZipFileReader } {
    const writer = {
        file(name: string, data: string | Uint8Array, options?: Record<string, unknown>) {
            zip.file(name, data as never, options as never);
        },
    } as unknown as ZipFileWriter;
    const reader = {
        file(name: string) {
            const entry = zip.file(name);
            if (!entry) return null;
            return {
                async(type: 'string' | 'uint8array') {
                    return entry.async(type as never);
                },
            };
        },
    } as unknown as ZipFileReader;
    return { writer, reader };
}

/** 样例覆盖：前缀项（nrcache_ / os_letter_written_）与各精确项。 */
const SAMPLE: Record<string, string> = {
    // 前缀 nrcache_
    'nrcache_nr_books': '[{"id":"b1","title":"测试书","source":"local","passages":["第一段"],"createdAt":1}]',
    'nrcache_nr_progress': '{"b1":42}',
    'nrcache_nr_vocab': '[{"src":"word","trans":"词","bookId":"b1","bookTitle":"测试书","ts":1}]',
    'nrcache_nr_skin': 'green',
    // 精确项
    'reality_bridge_feed_v1': '[{"id":"f1","text":"信息流"}]',
    'wechat_bridge_settings_v1': '{"clientId":"dev-1","cursor":3}',
    'os_sub_api_presets': '[{"id":"p1","name":"副API","baseUrl":"https://x","apiKey":"k","model":"m"}]',
    'gamehub_stats': '{"total":10,"wins":4}',
    'reality_bridge_rules_v1': '{"rule":1}',
    'gamehub_settings': '{"autoFillNpc":true}',
    'os_fanwai_form_v1': '{"style":"古风","pov":"first"}',
    'os_last_seen_date': '2026-09-26',
    // 前缀 os_letter_written_
    'os_letter_written_char-1': '2026-09-26',
    // 前缀 os_imagegen_char_（key 拼的是角色名，这里用中文名顺带验证这种形态）
    'os_imagegen_char_小林': '{"description":"银发少年","lockImage":"data:image/jpeg;base64,AAAA","sceneDescription":"教室"}',
    // 生图设置（用户侧与风格）
    'os_imagegen_user_lock': '{"description":"黑长直","lockImage":"data:image/jpeg;base64,BBBB","sceneDescription":"咖啡店"}',
    'os_imagegen_custom_styles': '[{"id":"s1","label":"水彩","prompt":"watercolor, soft light"}]',
    'os_imagegen_style_preset': 'anime',
    // 前缀 tama_board_img_ / tama_board_fg_（每角色看板；注意旧全局单键不带下划线）
    'tama_board_img_char-1': 'blobref:b_abc123',
    'tama_board_fg_char-1': '#ffffff',
    // 壁纸备份 / 假摄像头机位图 / 视觉模型缓存
    'acnh_wallpaper_backup': 'linear-gradient(#fff, #000)',
    'sully-call-fake-camera-image-v1': 'blobref:b_def456',
    'os_vision_available_models': '["gpt-4o","qwen-vl-max"]',
};

describe('backupLocalState', () => {
    afterEach(() => {
        window.localStorage.clear();
    });

    it('收集后恢复：前缀项与精确项都齐，往返逐键一致', () => {
        for (const [key, value] of Object.entries(SAMPLE)) {
            window.localStorage.setItem(key, value);
        }

        const collected = collectLocalStateBackup();
        expect(collected).toBeDefined();
        for (const [key, value] of Object.entries(SAMPLE)) {
            expect(collected![key], key).toBe(value);
        }

        // 清空后按备份恢复，应逐键还原
        window.localStorage.clear();
        const result = restoreLocalStateBackup(collected);
        expect(result.failed).toBe(0);
        expect(result.restored).toBe(Object.keys(SAMPLE).length);
        for (const [key, value] of Object.entries(SAMPLE)) {
            expect(window.localStorage.getItem(key), key).toBe(value);
        }
    });

    it('无数据时收集返回 undefined（旧备份不会误清空本地）', () => {
        window.localStorage.clear();
        expect(collectLocalStateBackup()).toBeUndefined();
        expect(restoreLocalStateBackup(undefined)).toEqual({ restored: 0, failed: 0, skipped: 0 });
    });

    it('未出现在备份中的本地键保持不动', () => {
        window.localStorage.setItem('nrcache_nr_theme', 'night');
        window.localStorage.setItem('unrelated_key', 'keep-me');

        restoreLocalStateBackup({ 'nrcache_nr_books': '[]' });

        expect(window.localStorage.getItem('nrcache_nr_theme')).toBe('night');
        expect(window.localStorage.getItem('unrelated_key')).toBe('keep-me');
    });

    it('拒绝写入登记表之外的键（备份被塞入额外项时丢弃）', () => {
        const result = restoreLocalStateBackup({
            evil_key: 'x',
            'os_realtime_config': '{"hijack":true}', // 已由 realtimeConfig 通道负责，不由此处写
            nrcache_nr_theme: 'night',
        });
        expect(result.skipped).toBe(2);
        expect(result.restored).toBe(1);
        expect(window.localStorage.getItem('evil_key')).toBeNull();
        expect(window.localStorage.getItem('os_realtime_config')).toBeNull();
        expect(window.localStorage.getItem('nrcache_nr_theme')).toBe('night');
    });

    it('登记表覆盖了本次修复涉及的全部自研键', () => {
        const expected = [
            'nrcache_nr_books',
            'reality_bridge_feed_v1',
            'wechat_bridge_settings_v1',
            'os_sub_api_presets',
            'gamehub_stats',
            'reality_bridge_settings_v1',
            'reality_bridge_rules_v1',
            'reality_bridge_actions_v1',
            'reality_bridge_data_items_v1',
            'reality_bridge_screen_chat_v1',
            'gamehub_settings',
            'os_fanwai_form_v1',
            'os_last_seen_date',
            'os_letter_written_char-1',
            // 生图设置（本次补登记）
            'os_imagegen_char_小林',
            'os_imagegen_user_lock',
            'os_imagegen_custom_styles',
            'os_imagegen_style_preset',
            // 图片相关（本次穷尽排查补登记）
            'tama_board_img_char-1',
            'tama_board_fg_char-1',
            'acnh_wallpaper_backup',
            'sully-call-fake-camera-image-v1',
            'os_vision_available_models',
        ];
        for (const key of expected) {
            expect(isRegisteredLocalStateKey(key), key).toBe(true);
        }
    });

    it('登记表不得收录已由既有通道覆盖的键（避免互相覆盖）', () => {
        // 这几个 key 分别由 sullyos_ 前缀扫描、访问器、realtimeConfig 通道处理，
        // 若在此重复登记，导入顺序不同会导致同一份数据被写两遍甚至写坏。
        for (const key of [
            'os_realtime_config',
            'check_phone_api',
            'sullyos_shelf_persona_v1',
            'os_fanwai_stories_v1',
            'os_collected_letters_v1',
        ]) {
            expect(isRegisteredLocalStateKey(key), key).toBe(false);
        }
    });

    it('登记表每项都有中文标签，便于导入日志定位', () => {
        for (const entry of LOCAL_STATE_ENTRIES) {
            expect(entry.label.trim().length, entry.key).toBeGreaterThan(0);
            expect(typeof entry.content, entry.key).toBe('boolean');
        }
    });
});

describe('backupLocalState · 端到端（真实打包往返）', () => {
    afterEach(() => {
        window.localStorage.clear();
    });

    it('收集到的本地状态能经 v2 备份包往返，新键确实进包', async () => {
        for (const [key, value] of Object.entries(SAMPLE)) {
            window.localStorage.setItem(key, value);
        }
        const collected = collectLocalStateBackup();
        expect(collected).toBeDefined();

        const zip = new JSZip();
        const { writer, reader } = adaptZip(zip);
        // localState 是非数组字段 → 由 writeV2Backup 落进 metadata.json
        const manifest = await writeV2Backup(
            writer,
            { timestamp: 1, version: 3, localState: collected },
            { mode: 'full', createdAt: 1 },
        );

        // ① 落盘层：metadata.json 里必须逐键可见 —— 这一步才真正证明「数据进包了」，
        //    而不是只在内存对象里转了一圈。
        expect(zip.file('metadata.json'), 'metadata.json 应存在').not.toBeNull();
        expect(manifest.stores.localState, 'localState 不该被当成数组分片').toBeUndefined();
        const metadata = JSON.parse(await zip.file('metadata.json')!.async('string'));
        for (const [key, value] of Object.entries(SAMPLE)) {
            expect(metadata.localState?.[key], key).toBe(value);
        }

        // ② 读取层：解包后原样还原，写回 localStorage 后逐键一致
        const data = await assembleV2Backup(reader, manifest);
        window.localStorage.clear();
        const result = restoreLocalStateBackup(data.localState);
        expect(result.failed).toBe(0);
        expect(result.restored).toBe(Object.keys(SAMPLE).length);
        for (const [key, value] of Object.entries(SAMPLE)) {
            expect(window.localStorage.getItem(key), key).toBe(value);
        }

        // 留一个体积读数：样例含 2 张锁脸照 dataURL，便于以后评估要不要定向抽图
        const serializedLength = JSON.stringify(collected).length;
        console.log(`[backup] localState 序列化长度 = ${serializedLength} 字符（样例含 2 张锁脸照 dataURL）`);
        expect(serializedLength).toBeGreaterThan(0);
    });
});
