/**
 * 微信桥 · 建表 DDL（运行时常量）。
 *
 * 为什么代码里还要再写一遍：**装的时候不该要求人去 D1 控制台粘 SQL**。
 * 面板路线装完，粘错一个字就是"功能假死 + 报错看不懂"，而且没人能从那种报错里
 * 看出"少了一张表"。`POST /wx/init` 用这份常量幂等建表（全部 IF NOT EXISTS），
 * 装好后点一下按钮就完事；命令行走 `schema.sql` 装的库跑它同样无害。
 *
 * ⚠️ 与 `schema.sql` **必须逐条一致**（顺序也一致）：
 *   · `schema.sql` 给人看、给 `wrangler d1 execute --file=./schema.sql` 用；
 *   · 这份常量给运行时用。
 *   两边一旦漂移，就会出现"命令行装的库和面板装的库结构不一样"这种极难排查的问题。
 *   `schema.test.ts` 是漂移守卫；改任意一边都必须同步另一边，否则测试会红。
 */

/**
 * 建表语句，**顺序与 `schema.sql` 完全一致**（先表后索引）。
 *
 * 之所以是数组而不是一整段 SQL：D1 的 `prepare()` 一次只能执行一条语句。
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS wx_config (
  id           TEXT NOT NULL DEFAULT 'main',
  bots_json    TEXT NOT NULL DEFAULT '[]',
  llm_enc      TEXT,
  llm_iv       TEXT,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (id)
)`,
  `CREATE TABLE IF NOT EXISTS wx_packs (
  char_id        TEXT NOT NULL,
  pack_json      TEXT NOT NULL,
  template_ver   INTEGER NOT NULL DEFAULT 1,
  chat_built_at  INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (char_id)
)`,
  `CREATE TABLE IF NOT EXISTS wx_messages (
  msg_id     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'wechat',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (msg_id)
)`,
  `CREATE INDEX IF NOT EXISTS idx_wx_messages_char ON wx_messages(char_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS wx_outbox (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id    TEXT NOT NULL,
  msg_id     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_wx_outbox_char ON wx_outbox(char_id, seq)`,
  `CREATE TABLE IF NOT EXISTS wx_heartbeat (
  id   TEXT NOT NULL,
  at   INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id)
)`,
];

/**
 * 五张表的名字。体检（`/wx/status` 的 `storage`）按它判断"缺哪张表"，
 * 顺序与 `schema.sql` 里 CREATE TABLE 的出现顺序一致。
 */
export const SCHEMA_TABLES: readonly string[] = [
  'wx_config',
  'wx_packs',
  'wx_messages',
  'wx_outbox',
  'wx_heartbeat',
];

/**
 * 规范化一条 SQL，用于比对 `schema.sql` 与上面的常量：
 * 去掉行注释 → 压掉所有空白 → 去掉结尾分号。
 *
 * 只做这两件事，是为了让"格式差异"不报红、"真正的结构差异"必须报红
 * （列名、类型、默认值、主键改了都躲不过）。
 */
export const normalizeSql = (sql: string): string => sql
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/;$/, '')
  .trim();
