// @vitest-environment jsdom
/**
 * 本地状态备份往返测试。
 *
 * 覆盖三件事：
 *   1. 收集 → 恢复 往返无损（前缀项与精确项都要收齐）；
 *   2. 无数据时收集返回 undefined —— 旧备份导入端据此跳过，不会误清空本地；
 *   3. 恢复时只接受登记表内的键，备份文件被塞入额外键会被丢弃。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
    LOCAL_STATE_ENTRIES,
    collectLocalStateBackup,
    isRegisteredLocalStateKey,
    restoreLocalStateBackup,
} from './backupLocalState';

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
