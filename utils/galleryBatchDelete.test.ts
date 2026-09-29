/**
 * 相册批量删除的数据层测试（fake-indexeddb 走真库，不是 mock）。
 *
 * 钉住四件容易在重构中退化的事：
 *   1. 只删传进去的那些，其余原样保留；
 *   2. 空数组不开事务；重复 id 去重，计数不虚高；
 *   3. 超过单块上限时分块，但结果与「一次删完」等价；
 *   4. 批量路径同样要跑收藏保留 —— 被收藏的照片删掉后收藏项仍可解析，
 *      这是 utils/contentFavorites.test.ts 已钉住的不变量，不能因为换成批量就绕过。
 *
 * 另有两条兼容性断言：deleteGalleryImage 的对外行为不变（它现在是批量的薄封装）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryImage } from '../types';
import { DB } from './db';
import {
    CONTENT_FAVORITES_INDEX_ASSET_ID,
    listContentFavorites,
    resolveContentFavorite,
    saveGalleryImageContentFavorite,
} from './contentFavorites';

const CHAR_ID = 'gallery-batch-delete-test-char';

const image = (id: string, overrides: Partial<GalleryImage> = {}): GalleryImage => ({
    id,
    charId: CHAR_ID,
    url: `blobref:${id}`,
    timestamp: 1_700_000_000_000,
    savedDate: '2026-09-26',
    ...overrides,
});

beforeEach(async () => {
    // 清掉本用例角色名下的全部照片与收藏索引，避免用例之间互相影响
    await DB.deleteAsset(CONTENT_FAVORITES_INDEX_ASSET_ID).catch(() => undefined);
    const existing = await DB.getGalleryImages(CHAR_ID).catch(() => []);
    await DB.deleteGalleryImages(existing.map(item => item.id)).catch(() => undefined);
});

describe('DB.deleteGalleryImages', () => {
    it('只删传进去的那些，其余原样保留', async () => {
        for (const id of ['a', 'b', 'c', 'd']) await DB.saveGalleryImage(image(id));

        const result = await DB.deleteGalleryImages(['a', 'c']);

        expect(result).toEqual({ deleted: 2, failed: 0 });
        const left = (await DB.getGalleryImages(CHAR_ID)).map(item => item.id).sort();
        expect(left).toEqual(['b', 'd']);
    });

    it('空数组直接返回，不开任何事务', async () => {
        const transactionSpy = vi.spyOn(IDBDatabase.prototype, 'transaction');
        try {
            expect(await DB.deleteGalleryImages([])).toEqual({ deleted: 0, failed: 0 });
            expect(transactionSpy).not.toHaveBeenCalled();
        } finally {
            transactionSpy.mockRestore();
        }
    });

    it('重复 id 会被去重，删除张数不虚高', async () => {
        await DB.saveGalleryImage(image('dup'));

        const result = await DB.deleteGalleryImages(['dup', 'dup', 'dup']);

        expect(result).toEqual({ deleted: 1, failed: 0 });
        expect(await DB.getGalleryImageById('dup')).toBeNull();
    });

    it('不存在的 id 不报错，按已删计数（DELETE 是幂等的）', async () => {
        await DB.saveGalleryImage(image('real'));

        const result = await DB.deleteGalleryImages(['real', 'never-existed']);

        expect(result).toEqual({ deleted: 2, failed: 0 });
        expect(await DB.getGalleryImages(CHAR_ID)).toHaveLength(0);
    });

    it('超过单块上限（300）时分块，结果与一次删完等价', async () => {
        // 650 = 300 + 300 + 50，正好跨三块，能验到分块边界
        const ids = Array.from({ length: 650 }, (_, index) => `bulk-${index}`);
        for (const id of ids) await DB.saveGalleryImage(image(id));

        const result = await DB.deleteGalleryImages(ids);

        expect(result).toEqual({ deleted: 650, failed: 0 });
        expect(await DB.getGalleryImages(CHAR_ID)).toHaveLength(0);
    });

    it('块内出现异常时，该块计入失败而不是假装成功', async () => {
        const ids = ['boom-1', 'boom-2', 'boom-3'];
        const original = IDBObjectStore.prototype.delete;
        const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation((function (
            this: IDBObjectStore,
            key: IDBValidKey,
        ) {
            if (String(key).startsWith('boom')) throw new Error('mock: 事务内抛错');
            return original.call(this, key);
        }) as unknown as typeof IDBObjectStore.prototype.delete);
        try {
            // 事务里抛错会 abort 掉整个块，所以这三张都不算删成功
            expect(await DB.deleteGalleryImages(ids)).toEqual({ deleted: 0, failed: 3 });
        } finally {
            spy.mockRestore();
        }
    });

    it('批量路径同样跑收藏保留：删掉被收藏的照片后，收藏项仍可解析', async () => {
        const charName = '测试角色';
        await DB.saveGalleryImage(image('fav-1'));
        await DB.saveGalleryImage(image('fav-2'));
        await saveGalleryImageContentFavorite(image('fav-1'), charName);

        const before = await listContentFavorites();
        expect(before).toHaveLength(1);

        await DB.deleteGalleryImages(['fav-1', 'fav-2']);

        // 收藏项本身还在（批量删除不能顺手把它清掉），且解析时明确标出源已不可用
        const after = await listContentFavorites();
        expect(after).toHaveLength(1);
        const resolved = await resolveContentFavorite(after[0]);
        expect('sourceAvailable' in resolved && resolved.sourceAvailable).toBe(false);
    });
});

describe('deleteGalleryImage（单张薄封装）行为不变', () => {
    it('删掉指定的一张，并跑过收藏保留', async () => {
        const charName = '测试角色';
        await DB.saveGalleryImage(image('one'));
        await DB.saveGalleryImage(image('two'));
        await saveGalleryImageContentFavorite(image('one'), charName);

        await DB.deleteGalleryImage('one');

        expect(await DB.getGalleryImageById('one')).toBeNull();
        expect(await DB.getGalleryImageById('two')).not.toBeNull();
        const favorites = await listContentFavorites();
        expect(favorites).toHaveLength(1);
    });

    it('删不存在的 id 不抛错（既有调用点依赖这个宽容度）', async () => {
        await expect(DB.deleteGalleryImage('nothing-here')).resolves.toBeUndefined();
    });
});
