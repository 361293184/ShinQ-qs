import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCharPhoneDigest, formatCharPhoneDigest } from './charPhoneDigest';
import type { PhoneContent } from './phoneContent';

/**
 * 角色自己手机里的内容摘要。
 *
 * 背景：手机内容只生成给 UI 看，从来没进过 prompt，角色被问起只能现编。
 * 口径：默认全看过（手机是他的，内容即已知事实）；文案用名字指代，不用「你/他」。
 */

const content: PhoneContent = {
    generatedAt: 1,
    wechatGroups: [{ name: '家族群', messages: [{ from: '妈', text: '周末回来吃饭吗' }] }],
    wechatChats: [{ name: '老周', relation: '同事', messages: [{ from: '老周', text: '方案改好了没' }] }],
    moments: [{ author: '阿一', time: '9月14日', text: '加班到现在，楼下便利店还开着' }],
    gallery: [{ title: '夜里的便利店', body: '关东煮的白汽' }],
    memo: [{ title: '买牛奶' }, { title: '退快递' }],
    alipayAssets: { total: '12,340.00', monthExpense: '1,280.00' },
    musicPlaylists: [{ name: '深夜循环', songs: [] }],
};

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('formatCharPhoneDigest', () => {
    it('把各 App 的内容压成一段事实，用角色名字指代', () => {
        const text = formatCharPhoneDigest(content, '阿一')!;
        expect(text).toContain('阿一自己手机里的内容');
        expect(text).toContain('家族群');
        expect(text).toContain('「老周」');
        expect(text).toContain('的私聊');
        expect(text).toContain('朋友圈');
        expect(text).toContain('相册 1 张');
        expect(text).toContain('买牛奶');
        expect(text).toContain('支付宝');
        // 不用「你/他」指代，避免两台手机之间指反
        expect(text).not.toContain('你');
        expect(text).not.toContain('他的');
    });

    it('没内容时返回 null，不编造', () => {
        expect(formatCharPhoneDigest(null, '阿一')).toBeNull();
        expect(formatCharPhoneDigest({ generatedAt: 1 }, '阿一')).toBeNull();
    });

    it('长度有上限，不会把整份手机内容塞进 prompt', () => {
        const big: PhoneContent = {
            generatedAt: 1,
            wechatChats: Array.from({ length: 30 }, (_, i) => ({
                name: `朋友${i}`,
                relation: '同学',
                messages: [{ from: `朋友${i}`, text: '这是一条很长的聊天内容'.repeat(6) }],
            })),
        };
        expect(formatCharPhoneDigest(big, '阿一')!.length).toBeLessThan(700);
    });
});

describe('buildCharPhoneDigest', () => {
    it('读缓存；没生成过就返回 null（不触发副 API）', () => {
        vi.stubGlobal('window', { localStorage });
        expect(buildCharPhoneDigest('c1', '阿一')).toBeNull();

        localStorage.setItem('os_offline_phone_content_c1', JSON.stringify(content));
        expect(buildCharPhoneDigest('c1', '阿一')).toContain('家族群');
    });
});

describe('ensureCharPhoneContent（默认生成一次）', () => {
    it('已有缓存直接返回，不调副 API', async () => {
        vi.stubGlobal('window', { localStorage });
        localStorage.setItem('os_offline_phone_content_c2', JSON.stringify(content));
        const { ensureCharPhoneContent } = await import('./charPhoneDigest');
        const digest = await ensureCharPhoneContent({
            char: { id: 'c2', name: '阿一' } as any,
            user: { name: '条条' } as any,
            subApi: { baseUrl: '', apiKey: '', model: '' },
            timeoutMs: 10,
        });
        expect(digest).toContain('家族群');
    });

    it('没配副 API 时返回 null（不抛错、不编）', async () => {
        vi.stubGlobal('window', { localStorage });
        const { ensureCharPhoneContent } = await import('./charPhoneDigest');
        await expect(ensureCharPhoneContent({
            char: { id: 'c3', name: '阿一' } as any,
            user: { name: '条条' } as any,
            subApi: null,
            timeoutMs: 10,
        })).resolves.toBeNull();
    });
});
