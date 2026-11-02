/**
 * 小说共读书架持久化回归测试。
 *
 * 背景 bug：书架整本原文塞 localStorage（nrcache_nr_books），一本几 MB 的 txt 撞 5MB
 * 配额后写入被静默吞掉，表现就是「导入完关掉阅读器书就没了」。v75 起改存 IDB。
 */
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.resetModules();
});

/** 每个用例一份干净的 IDB + 浏览器壳（novelReader 的读写都经过 window.localStorage）。 */
function stubBrowser(): void {
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('indexedDB', new IDBFactory());
}

it('导入的书存进 IndexedDB：重开面板/刷新之后还在', async () => {
    stubBrowser();
    const mod = await import('./novelReader');
    await mod.saveBook({
        id: 'b1',
        title: '测试书',
        source: 'local',
        passages: ['第一段', '第二段'],
        createdAt: 1,
    });

    // 模拟关掉阅读器 / 刷新页面：模块重载，但 IDB 里的数据还在
    vi.resetModules();
    const reopened = await import('./novelReader');
    const books = await reopened.loadBooks();

    expect(books.map(b => b.id)).toEqual(['b1']);
    expect(books[0].passages).toEqual(['第一段', '第二段']);
});

it('旧版 localStorage 书架会被迁进 IDB，并且迁移成功后才删旧键', async () => {
    stubBrowser();
    localStorage.setItem('nrcache_nr_books', JSON.stringify([
        { id: 'old1', title: '老书', source: 'local', passages: ['旧段落'], createdAt: 2 },
    ]));

    const mod = await import('./novelReader');
    const books = await mod.loadBooks();

    expect(books.map(b => b.id)).toEqual(['old1']);
    expect(localStorage.getItem('nrcache_nr_books')).toBeNull();

    vi.resetModules();
    const reopened = await import('./novelReader');
    expect((await reopened.loadBooks()).map(b => b.id)).toEqual(['old1']);
});

it('删书会真的从库里删掉，下一次打开不会又冒出来', async () => {
    stubBrowser();
    const mod = await import('./novelReader');
    await mod.saveBook({ id: 'b1', title: '测试书', source: 'online', passages: ['p'], createdAt: 1 });
    await mod.deleteBook('b1');

    vi.resetModules();
    const reopened = await import('./novelReader');
    expect(await reopened.loadBooks()).toEqual([]);
});
