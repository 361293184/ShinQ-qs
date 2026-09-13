/**
 * 「刚装好、还没建表」这条路的回归守卫。
 *
 * 为什么专门盯这条路：状态接口以前一上来就查业务表，空库时每一条查询都会抛
 * `no such table`，整个接口 500 —— 卡片就永远显示不出"该点初始化了"，用户看到的是
 * "连不上"，然后没有任何线索。所以这里用一个假 D1（只认 sqlite_master 与
 * `CREATE ... IF NOT EXISTS`）把三步钉住：
 *   ① 空库 → `/wx/status` 必须仍然返回可读状态，且明确报告表不齐
 *   ② `/wx/init` → 把 5 张表建起来并报告 created，再查状态就变成就绪
 *   ③ 重复调用 `/wx/init` 是空操作（幂等）
 */
import { describe, it, expect } from 'vitest';
import worker from './index';
import { SCHEMA_TABLES } from './schema';

/** 只实现这条路径用得到的部分：prepare().all() / .run() / .first() / .bind()。 */
const makeFakeD1 = () => {
  const tables = new Set<string>();
  const executed: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind: (..._args: unknown[]) => db.prepare(sql),
        async run() {
          executed.push(sql);
          const created = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(sql);
          if (created) tables.add(created[1]);
          return { meta: { changes: created ? 1 : 0 } };
        },
        async first(): Promise<null> { return null; },
        async all() {
          if (/sqlite_master/i.test(sql)) {
            return { results: [...tables].map((name) => ({ name })) };
          }
          return { results: [] as unknown[] };
        },
      };
    },
  };
  return { db, tables, executed };
};

const call = (path: string, env: unknown, method = 'GET') => worker.fetch(
  new Request(`https://bridge.test${path}`, { method }),
  env as never,
);

describe('首次安装：空库 → 状态可读 → 建表 → 就绪', () => {
  it('空库时状态接口不炸，并明确报告表不齐', async () => {
    const { db } = makeFakeD1();
    const res = await call('/wx/status', { DB: db, MASTER_KEY: 'k'.repeat(32) });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      data: { storage: { schemaReady: boolean; missingTables: string[]; tableCount: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.data.storage.schemaReady).toBe(false);
    expect(body.data.storage.missingTables).toEqual([...SCHEMA_TABLES]);
    expect(body.data.storage.tableCount).toBe(0);
  });

  it('/wx/init 建起 5 张表并报告 created，再查状态变成就绪', async () => {
    const { db, tables } = makeFakeD1();
    const env = { DB: db, MASTER_KEY: 'k'.repeat(32) };

    const res = await call('/wx/init', env, 'POST');
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      data: { created: string[]; tableCount: number; schemaReady: boolean };
    };
    expect(body.data.created).toEqual([...SCHEMA_TABLES]);
    expect(body.data.schemaReady).toBe(true);
    expect(body.data.tableCount).toBe(SCHEMA_TABLES.length);
    expect([...tables].sort()).toEqual([...SCHEMA_TABLES].sort());

    const after = await (await call('/wx/status', env)).json() as {
      data: { storage: { schemaReady: boolean } };
    };
    expect(after.data.storage.schemaReady).toBe(true);
  });

  it('重复调用 /wx/init 是空操作（幂等）', async () => {
    const { db } = makeFakeD1();
    const env = { DB: db, MASTER_KEY: 'k'.repeat(32) };
    await call('/wx/init', env, 'POST');
    const second = await (await call('/wx/init', env, 'POST')).json() as { data: { created: string[] } };
    expect(second.data.created).toEqual([]);
  });

  it('没配共享密钥时也走同一套逻辑（建表不受密钥影响）', async () => {
    const { db } = makeFakeD1();
    const res = await call('/wx/init', { DB: db }, 'POST');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { created: string[] } };
    expect(body.data.created).toEqual([...SCHEMA_TABLES]);
  });
});
