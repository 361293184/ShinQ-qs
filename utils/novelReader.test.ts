/**
 * 小说共读书架持久化回归测试。
 *
 * 背景 bug：书架整本原文塞 localStorage（nrcache_nr_books），一本几 MB 的 txt 撞 5MB
 * 配额后写入被静默吞掉，表现就是「导入完关掉阅读器书就没了」。现在改存独立小库
 * SullyOS_NovelShelf —— 特意不放进主库，避免「DB_VERSION 已被占用 → upgradeneeded
 * 不触发 → 新表建不出来 → 读回空书架」这类只在真机上出现的坑。
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

it('主库版本号已被占用（升级建表不会触发）时，书架照样能存能读', async () => {
    stubBrowser();
    // 模拟浏览器里已存在一个比当前 build 更新的主库：openDB 带旧版本号会 VersionError，
    // 就算走不带版本号的回退，也永远等不到 upgradeneeded —— 新表建不出来。
    await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('AetherOS_Data', 999);
        req.onupgradeneeded = () => { req.result.createObjectStore('characters', { keyPath: 'id' }); };
        req.onsuccess = () => { req.result.close(); resolve(); };
        req.onerror = () => reject(req.error);
    });

    const mod = await import('./novelReader');
    await mod.saveBook({ id: 'b9', title: '不依赖主库', source: 'local', passages: ['p'], createdAt: 3 });

    vi.resetModules();
    const reopened = await import('./novelReader');
    expect((await reopened.loadBooks()).map(b => b.id)).toEqual(['b9']);
    expect(reopened.getShelfStatus().ok).toBe(true);
});

it('曾暂存在主库 novel_reader_books 的书会搬进书库（升级后不会又丢一次）', async () => {
    stubBrowser();
    await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('AetherOS_Data', 75);
        req.onupgradeneeded = () => {
            req.result
                .createObjectStore('novel_reader_books', { keyPath: 'id' })
                .put({ id: 'main1', title: '旧主库里的书', source: 'local', passages: ['x'], createdAt: 5 });
        };
        req.onsuccess = () => { req.result.close(); resolve(); };
        req.onerror = () => reject(req.error);
    });

    const mod = await import('./novelReader');
    expect((await mod.loadBooks()).map(b => b.id)).toEqual(['main1']);

    vi.resetModules();
    const reopened = await import('./novelReader');
    expect((await reopened.loadBooks()).map(b => b.id)).toEqual(['main1']);
});

it('本地存储被禁用时不崩，把原因记进状态供面板显示', async () => {
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('indexedDB', { open() { throw new Error('blocked by policy'); } });

    const mod = await import('./novelReader');
    expect(await mod.loadBooks()).toEqual([]);
    expect(mod.getShelfStatus().ok).toBe(false);
    expect(mod.getShelfStatus().message).toContain('blocked by policy');
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
