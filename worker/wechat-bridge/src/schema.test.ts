/**
 * 建表 DDL 漂移守卫：`schema.sql` ↔ `src/schema.ts`。
 *
 * 两份表述并存是刻意的（一份给人看/给命令行用，一份给运行时用），代价是可能漂移。
 * 漂移的后果特别难查：命令行装的库有某列，面板装的库没有 —— 报错现场在业务逻辑里，
 * 没人会想到去看建表语句。所以这里逐条钉死，改任一边不同步另一边就红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMA_STATEMENTS, SCHEMA_TABLES, SCHEMA_UPGRADE_COLUMNS, normalizeSql } from './schema';

const SQL_PATH = fileURLToPath(new URL('../schema.sql', import.meta.url));

/** 把 schema.sql 切成一条条语句并规范化（去注释、去空、去尾分号）。 */
const parseSchemaSql = (): string[] => readFileSync(SQL_PATH, 'utf8')
  .split(';')
  .map(normalizeSql)
  .filter((statement) => statement.length > 0);

describe('建表 DDL 漂移守卫（schema.sql ↔ src/schema.ts）', () => {
  it('语句逐条一致，且顺序一致', () => {
    expect(SCHEMA_STATEMENTS.map(normalizeSql)).toEqual(parseSchemaSql());
  });

  it('表名清单与 schema.sql 里 CREATE TABLE 的出现顺序一致', () => {
    const fromFile = parseSchemaSql()
      .map((statement) => /^CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(statement)?.[1])
      .filter((name): name is string => !!name);
    expect([...SCHEMA_TABLES]).toEqual(fromFile);
  });

  it('每条 DDL 都是幂等的（CREATE TABLE/INDEX IF NOT EXISTS）', () => {
    // 这是 /wx/init 可以被重复调用、且对已建好表的库无害的前提。
    // ⚠️ 也正因为这条约束，老库补列不能写进 SCHEMA_STATEMENTS（表已存在时 CREATE 是空操作），
    //    只能走 SCHEMA_UPGRADE_COLUMNS + ALTER TABLE，见下面两条。
    for (const statement of SCHEMA_STATEMENTS) {
      expect(normalizeSql(statement)).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /i);
    }
  });

  it('升级列的定义与建表语句里的列定义逐字一致', () => {
    // 防的是"新装的库（CREATE 带 owner）和老库（ALTER 补 owner）结构不一样"——
    // 那种偏差只在老库上暴露，排查成本极高。
    const ddl = SCHEMA_STATEMENTS.map(normalizeSql);
    for (const { table, column, definition } of SCHEMA_UPGRADE_COLUMNS) {
      const create = ddl.find((statement) => statement.startsWith(`CREATE TABLE IF NOT EXISTS ${table} `));
      expect(create, `缺少 ${table} 的建表语句`).toBeTruthy();
      expect(create).toContain(`${column} ${definition}`);
    }
  });

  it('升级列覆盖了所有按 owner 过滤的表', () => {
    const tables = new Set(SCHEMA_UPGRADE_COLUMNS.map((item) => item.table));
    for (const table of ['wx_packs', 'wx_messages', 'wx_outbox']) {
      expect(tables.has(table), `${table} 缺 owner 升级列`).toBe(true);
    }
    // owner 是唯一的升级列；将来加新列时这条会提醒你同步 schema.sql 与运行时 DDL
    for (const item of SCHEMA_UPGRADE_COLUMNS) expect(item.column).toBe('owner');
  });
});
