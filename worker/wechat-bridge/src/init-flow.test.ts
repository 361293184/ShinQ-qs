/**
 * 「刚装好、还没建表」与「老库缺多租户列」这两条路的回归守卫。
 *
 * 为什么专门盯这两条路：状态接口以前一上来就查业务表，空库时每一条查询都会抛
 * `no such table`，整个接口 500 —— 卡片就永远显示不出"该点初始化了"，用户看到的是
 * "连不上"，然后没有任何线索。多租户改造后又多了一种：**表都在、但缺 owner 列**，
 * 那会让每条业务查询 `no such column`，同样得靠"点一下初始化"自救。
 *
 * 用假 D1（认 sqlite_master、`CREATE ... IF NOT EXISTS`、`pragma_table_info`、
 * `ALTER TABLE ADD COLUMN`）把这条路钉住：
 *   ① 空库 → `/wx/status` 必须仍然返回可读状态，且明确报告表不齐
 *   ② `/wx/init` → 把 5 张表建起来并报告 created，再查状态就变成就绪
 *   ③ 重复调用 `/wx/init` 是空操作（幂等）
 *   ④ 老库（表在、缺 owner 列）→ 状态报告缺列 → 点一次初始化补齐 → 再点一次空操作
 */
import { describe, it, expect } from 'vitest';
import worker from './index';
import { SCHEMA_STATEMENTS, SCHEMA_TABLES, SCHEMA_UPGRADE_COLUMNS } from './schema';

/** 从 CREATE TABLE 语句里抠出列名（够用即可：按逗号切、取每段第一个词，丢掉 PRIMARY 那种约束行）。 */
const columnsOf = (sql: string): string[] => {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  return body
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((name) => !!name && !/^PRIMARY$/i.test(name));
};

/** 多租户之前建好的库：五张表都在，但没有 owner 列。 */
const legacyTables = (): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const statement of SCHEMA_STATEMENTS) {
    const name = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(statement)?.[1];
    if (!name) continue;
    const cols = new Set(columnsOf(statement));
    cols.delete('owner');
    map.set(name, cols);
  }
  return map;
};

/** 只实现这条路径用得到的部分：prepare().all() / .run() / .first() / .bind()。 */
const makeFakeD1 = (options: { legacySchema?: boolean } = {}) => {
  const tables = options.legacySchema ? legacyTables() : new Map<string, Set<string>>();
  const db = {
    prepare(sql: string) {
      const self = {
        bind: (..._args: unknown[]) => self,
        async run() {
          const created = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(sql);
          if (created) {
            // IF NOT EXISTS：已存在的表不重建（老库场景正是靠这一点保留"缺列"状态）
            if (!tables.has(created[1])) tables.set(created[1], new Set(columnsOf(sql)));
            return { meta: { changes: 1 } };
          }
          const altered = /ALTER TABLE\s+([A-Za-z_]+)\s+ADD COLUMN\s+([A-Za-z_]+)/i.exec(sql);
          if (altered) {
            tables.get(altered[1])?.add(altered[2]);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first(): Promise<null> { return null; },
        async all() {
          if (/sqlite_master/i.test(sql)) {
            return { results: [...tables.keys()].map((name) => ({ name })) };
          }
          const pragma = /pragma_table_info\('?([A-Za-z_]+)'?\)/i.exec(sql);
          if (pragma) {
            return { results: [...(tables.get(pragma[1]) ?? [])].map((name) => ({ name })) };
          }
          return { results: [] as unknown[] };
        },
      };
      return self;
    },
  };
  return { db, tables };
};

const call = (path: string, env: unknown, method = 'GET') => worker.fetch(
  new Request(`https://bridge.test${path}`, { method }),
  env as never,
);

const upgradeKeys = SCHEMA_UPGRADE_COLUMNS.map((item) => `${item.table}.${item.column}`);

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
      data: { created: string[]; tableCount: number; schemaReady: boolean; upgraded: string[] };
    };
    expect(body.data.created).toEqual([...SCHEMA_TABLES]);
    expect(body.data.schemaReady).toBe(true);
    expect(body.data.tableCount).toBe(SCHEMA_TABLES.length);
    expect(body.data.upgraded).toEqual([]);          // 新库由 CREATE 一次到位，没有补列动作
    expect([...tables.keys()].sort()).toEqual([...SCHEMA_TABLES].sort());

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

describe('多租户升级：老库（表在、缺 owner 列）', () => {
  it('状态先报告缺列，点一次初始化就补齐，且第二次是空操作', async () => {
    const { db, tables } = makeFakeD1({ legacySchema: true });
    const env = { DB: db, MASTER_KEY: 'k'.repeat(32) };

    const before = await (await call('/wx/status', env)).json() as {
      data: { storage: { schemaReady: boolean; missingTables: string[]; missingColumns: string[] } };
    };
    expect(before.data.storage.missingTables).toEqual([]);      // 表是齐的
    expect(before.data.storage.missingColumns).toEqual(upgradeKeys);
    expect(before.data.storage.schemaReady).toBe(false);        // 但缺列 → 仍不该算就绪

    const init = await (await call('/wx/init', env, 'POST')).json() as {
      data: { created: string[]; upgraded: string[]; schemaReady: boolean };
    };
    expect(init.data.created).toEqual([]);                      // 没有新建表
    expect(init.data.upgraded).toEqual(upgradeKeys);            // 补了三个 owner 列
    expect(init.data.schemaReady).toBe(true);
    for (const { table, column } of SCHEMA_UPGRADE_COLUMNS) {
      expect(tables.get(table)?.has(column)).toBe(true);
    }

    const again = await (await call('/wx/init', env, 'POST')).json() as { data: { upgraded: string[] } };
    expect(again.data.upgraded).toEqual([]);                    // 幂等
  });
});
