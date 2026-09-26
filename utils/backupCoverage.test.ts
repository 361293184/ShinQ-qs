/**
 * 备份覆盖守卫。
 *
 * 目的：防止「新增了 IndexedDB store，却忘了登记进导出清单」这类问题再次发生。
 * 这个坑在本仓库已出现四次 —— vr_* / worlds / life_records（context/OSContext.tsx
 * 里那三条「早期导出清单漏了…导入端早已支持恢复」的注释就是证据），
 * 加上自研的番外收藏 / 来信收藏 / 角色小红书主页。
 *
 * 判定规则：utils/db.ts 里定义的每个 store，要么出现在 exportSystem 的 allStores
 * 清单中，要么在下面的 EXEMPT_STORES 里、并写明豁免理由。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/**
 * 显式豁免名单：按设计不随普通备份导出的 store。
 * 每一项都必须写清理由，让后来者能判断「我新加的 store 该不该在这儿」。
 */
const EXEMPT_STORES: Record<string, string> = {
    blob_assets:
        'blobref 二进制资源：不进 store 清单，由 exportSystem 的 collectBackupRefs 收集令牌后走 blobs/* 旁路落包',
    api_call_log:
        'API 调用日志：诊断数据，非用户内容，按设计不随备份迁移',
};

/** 从 utils/db.ts 提取所有 `const STORE_X = 'name';` 的 name。 */
function extractDbStoreNames(): string[] {
    const source = readFileSync(join(ROOT, 'utils', 'db.ts'), 'utf8');
    const names = new Set<string>();
    for (const match of source.matchAll(/const\s+STORE_[A-Z0-9_]+\s*=\s*'([a-z0-9_]+)'/g)) {
        names.add(match[1]);
    }
    return [...names].sort();
}

/** 从 context/OSContext.tsx 提取 allStores 数组里的字符串字面量（跳过注释行）。 */
function extractExportStoreNames(): Set<string> {
    const source = readFileSync(join(ROOT, 'context', 'OSContext.tsx'), 'utf8');
    const start = source.indexOf('const allStores = [');
    if (start < 0) throw new Error('未能在 OSContext.tsx 中定位 allStores 清单');
    const end = source.indexOf('];', start);
    if (end < 0) throw new Error('未能定位 allStores 清单的结束位置');

    const body = source
        .slice(start, end)
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n');

    return new Set([...body.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]));
}

describe('备份覆盖守卫', () => {
    it('utils/db.ts 里每个 store 都被导出清单覆盖，或在豁免名单中', () => {
        const dbStores = extractDbStoreNames();
        const exported = extractExportStoreNames();

        expect(dbStores.length).toBeGreaterThan(50); // 清单解析成功的基本校验

        const missing = dbStores.filter(
            name => !exported.has(name) && !(name in EXEMPT_STORES),
        );

        // 失败时把缺口和修复指引一并抛出，省得后来者去翻排查记录
        expect(
            missing,
            missing.length
                ? `以下 store 未进导出清单也未豁免：${missing.join(', ')}\n`
                  + '请在 context/OSContext.tsx 的 allStores 追加，或在本测试的 EXEMPT_STORES 里写明豁免理由。'
                : '',
        ).toEqual([]);
    });

    it('豁免名单里的 store 必须真实存在于 utils/db.ts（避免名单腐化）', () => {
        const dbStores = new Set(extractDbStoreNames());
        const stale = Object.keys(EXEMPT_STORES).filter(name => !dbStores.has(name));
        expect(stale, `豁免名单里这些 store 已不存在，应删除：${stale.join(', ')}`).toEqual([]);
    });

    it('自研的番外 / 来信 / 角色小红书主页三个 store 必须在导出清单里', () => {
        const exported = extractExportStoreNames();
        for (const name of ['fanwai_stories', 'collected_letters', 'xhs_owned_posts']) {
            expect(exported.has(name), `${name} 应出现在 allStores 中`).toBe(true);
        }
    });
});
