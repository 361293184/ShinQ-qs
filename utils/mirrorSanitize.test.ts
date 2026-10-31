/**
 * 镜像脏数据清洗的回归测试。
 *
 * 线上问题：点「保存」番外时报
 * `saveFanwaiStory failed: null is not an object (evaluating 'n.id')`——
 * 镜像是 `JSON.parse` 出来的数组，混进 null 后 `mirror.filter(s => s.id !== ...)` 直接抛错，
 * 脏数据既清不掉也写不回。这里锁住"脏条目一律丢弃、好条目原样保留"的行为。
 */
import { describe, expect, it } from 'vitest';
import { sanitizeMirrorList } from './mirrorSanitize';

type Item = { id?: unknown };

describe('sanitizeMirrorList', () => {
    it('丢掉 null / undefined / 非对象 / 缺 id / 空 id，保留正常条目', () => {
        const input: unknown = [
            null,
            undefined,
            'a-string',
            42,
            { title: '没有 id' },
            { id: '' },
            { id: 7 },
            { id: 'keep-1', title: '一' },
            { id: 'keep-2', title: '二' },
        ];
        expect(sanitizeMirrorList<Item>(input).map(x => x.id)).toEqual(['keep-1', 'keep-2']);
    });

    it('非数组输入一律返回空数组', () => {
        expect(sanitizeMirrorList<Item>(null)).toEqual([]);
        expect(sanitizeMirrorList<Item>('[]')).toEqual([]);
        expect(sanitizeMirrorList<Item>({})).toEqual([]);
    });

    it('原本干净的数组保持顺序不变', () => {
        const clean = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        expect(sanitizeMirrorList<Item>(clean)).toEqual(clean);
    });
});
