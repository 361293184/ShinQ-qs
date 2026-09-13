/**
 * 多租户的三道闸与隔离口径的回归守卫。
 *
 * 背景：微信桥原本是"单租户"——一份配置、一枚共享密钥、数据没有"谁"这个维度，
 * 于是别人要用就得自己再部署一份。改成"一个链接服务多人"之后，最容易出事的地方
 * 不是功能，而是**隔离**：任何一处查询漏带 owner，就是"能看到别人的微信绑定与
 * 对话"这种越权，而且平时完全看不出来。所以这里用两层钉住：
 *
 *   ① 行为层：身份 → owner 的稳定性、名额、老密钥兼容、认领老空间；
 *   ② 源码层：`wx_packs / wx_messages / wx_outbox` 的每一条 SQL 都必须带 owner
 *      （见文件末尾的「SQL 隔离守卫」）——将来新增查询忘了带，测试直接红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from './index';

const SOURCE_PATH = fileURLToPath(new URL('./index.ts', import.meta.url));

/** 测试侧自己算一遍 owner（与服务端同口径）：sha256 前 16 位 hex。 */
const ownerOf = async (identity: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

const ALL_TABLES = ['wx_config', 'wx_packs', 'wx_messages', 'wx_outbox', 'wx_heartbeat'];
/** 多租户升级列：三张表各补了一个 owner（体检要为"就绪"）。 */
const OWNER_COLUMNS: Record<string, string[]> = {
  wx_packs: ['owner'],
  wx_messages: ['owner'],
  wx_outbox: ['owner'],
};

/**
 * 假 D1：只回答这道测试用得到的查询形状。
 * 表结构与升级列都报"齐"，这样 /wx/status 会走完整分支（而不是空库早退）。
 */
const makeFakeD1 = (options: { existingOwners?: string[] } = {}) => {
  const existingOwners = new Set(options.existingOwners ?? []);
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const self = {
        bind: (...values: unknown[]) => { args = values; return self; },
        async run() {
          queries.push({ sql, args });
          // 认领老空间靠 changes 计数，这里一律回 1（够验证"搬了哪几张表、按什么条件搬"）。
          return { meta: { changes: 1 } };
        },
        async first() {
          queries.push({ sql, args });
          if (/count\(\*\) AS n FROM wx_config/i.test(sql)) return { n: existingOwners.size };
          if (/SELECT 1 AS ok FROM wx_config/i.test(sql)) {
            return existingOwners.has(String(args[0] ?? '')) ? { ok: 1 } : null;
          }
          return null;                                  // 其余单行查询（配置行/统计）都当"没有"
        },
        async all() {
          queries.push({ sql, args });
          if (/sqlite_master/i.test(sql)) {
            return { results: ALL_TABLES.map((name) => ({ name })) };
          }
          const pragma = /pragma_table_info\('?([A-Za-z_]+)'?\)/i.exec(sql);
          if (pragma) {
            return { results: (OWNER_COLUMNS[pragma[1]] ?? []).map((name) => ({ name })) };
          }
          return { results: [] as unknown[] };          // 业务表的列表查询一律回空
        },
      };
      return self;
    },
  };
  return { db, queries };
};

const call = (
  path: string,
  env: Record<string, unknown>,
  init: { method?: string; identity?: string; token?: string } = {},
) => {
  const headers: Record<string, string> = {};
  if (init.identity) headers['X-Client-Token'] = init.identity;
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  return worker.fetch(
    new Request(`https://bridge.test${path}`, { method: init.method ?? 'GET', headers }),
    env as never,
  );
};

type StatusBody = {
  ok: boolean;
  error?: string;
  hint?: string;
  data?: { owner: string; anonymous: boolean; owners?: { used: number; max: number } };
};

describe('身份 → 空间（owner）', () => {
  it('不带身份 = 默认空间，且明确标记为 anonymous', async () => {
    const { db } = makeFakeD1();
    const body = await (await call('/wx/status', { DB: db })).json() as StatusBody;
    expect(body.ok).toBe(true);
    expect(body.data?.owner).toBe('main');
    expect(body.data?.anonymous).toBe(true);
  });

  it('同一身份永远折成同一个空间，不同身份互不相干', async () => {
    const { db } = makeFakeD1();
    const read = async (identity: string) => {
      const body = await (await call('/wx/status', { DB: db }, { identity })).json() as StatusBody;
      return body.data!.owner;
    };
    const a1 = await read('device-identity-a');
    const a2 = await read('device-identity-a');
    const b = await read('device-identity-b');
    expect(a1).toBe(a2);                       // 稳定：同一串身份总能回到同一个空间
    expect(a1).not.toBe(b);                    // 隔离：不同身份不同空间
    expect(a1).toBe(await ownerOf('device-identity-a'));
    expect(a1).not.toContain('device');        // 明文身份不上库、也不回给客户端
  });
});

describe('名额（默认 10，可用 WX_MAX_OWNERS 覆盖）', () => {
  it('名额没满时新身份放行，并把 used/max 报给前端', async () => {
    const { db } = makeFakeD1({ existingOwners: [await ownerOf('a'), await ownerOf('b')] });
    const body = await (await call('/wx/status', { DB: db }, { identity: 'new-device' })).json() as StatusBody;
    expect(body.ok).toBe(true);
    expect(body.data?.owners).toEqual({ used: 2, max: 10 });
  });

  it('名额满了：新身份被拒（人话提示），老成员与默认空间不受影响', async () => {
    const members = ['member-0', 'member-1', 'member-2', 'member-3', 'member-4', 'member-5', 'member-6', 'member-7', 'member-8', 'member-9'];
    const { db } = makeFakeD1({ existingOwners: await Promise.all(members.map(ownerOf)) });

    const blocked = await call('/wx/status', { DB: db }, { identity: 'late-comer' });
    expect(blocked.status).toBe(403);
    const blockedBody = await blocked.json() as StatusBody;
    expect(blockedBody.error).toBe('OWNERS_FULL');
    expect(blockedBody.hint).toContain('10');

    const member = await call('/wx/status', { DB: db }, { identity: 'member-3' });
    expect(member.status).toBe(200);           // 老成员不会被名额挤出去

    const legacy = await call('/wx/status', { DB: db });
    expect(legacy.status).toBe(200);           // 默认空间（主人自己的历史数据）永远放行
  });

  it('名额可以放宽到 20（面板改一个环境变量，不用改代码、不用重新部署）', async () => {
    const members = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'];
    const { db } = makeFakeD1({ existingOwners: await Promise.all(members.map(ownerOf)) });
    const res = await call('/wx/status', { DB: db, WX_MAX_OWNERS: '20' }, { identity: 'late-comer' });
    expect(res.status).toBe(200);
    const body = await res.json() as StatusBody;
    expect(body.data?.owners).toEqual({ used: 10, max: 20 });
  });
});

describe('老部署兼容：WX_BRIDGE_TOKEN 配了就是单人模式', () => {
  it('密钥对不上 401；对得上则退化成"一枚密钥一个空间"', async () => {
    const env = { DB: makeFakeD1().db, WX_BRIDGE_TOKEN: 'shared-secret' };

    expect((await call('/wx/status', env, { token: 'wrong' })).status).toBe(401);
    expect((await call('/wx/status', env, { identity: 'whatever' })).status).toBe(401);

    const good = await (await call('/wx/status', env, { token: 'shared-secret' })).json() as StatusBody;
    expect(good.ok).toBe(true);
    expect(good.data?.anonymous).toBe(false);   // 有身份（= 这枚密钥），不是默认空间
    expect(good.data?.owner).toBe(await ownerOf('shared-secret'));
  });
});

describe('认领老空间（多租户升级的一次性动作）', () => {
  it('把老数据并到自己名下：逐表搬迁，最后才搬配置', async () => {
    const { db, queries } = makeFakeD1();
    const res = await call('/wx/claim', { DB: db }, { identity: 'owner-device', method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; moved: Record<string, number> };
    expect(body.ok).toBe(true);
    expect(body.moved.packs).toBe(1);

    const updates = queries.filter((q) => /^UPDATE /.test(q.sql.trim()));
    const targets = updates.map((q) => /UPDATE\s+(\w+)/.exec(q.sql)?.[1]);
    expect(targets).toEqual(['wx_packs', 'wx_messages', 'wx_outbox', 'wx_config']);
    for (const q of updates) {
      expect(q.args).toContain('main');         // 来源固定是默认空间
      // 三张按 owner 分区的表必须按 owner 改；配置表的主键就是 owner（写 id）
      if (!/UPDATE wx_config/.test(q.sql)) expect(q.sql).toContain('owner');
    }
    // 配置行必须最后搬：中途失败时 'main' 还在，重试仍然走得通
    expect(targets.at(-1)).toBe('wx_config');
  });

  it('已经有自己数据的身份不许认领（防止把两份数据搅在一起）', async () => {
    const { db } = makeFakeD1({ existingOwners: [await ownerOf('owner-device')] });
    const res = await call('/wx/claim', { DB: db }, { identity: 'owner-device', method: 'POST' });
    expect(res.status).toBe(409);
    expect((await res.json() as StatusBody).error).toBe('ALREADY_HAS_SPACE');
  });

  it('不带身份（本身就在默认空间）没有可认领的对象', async () => {
    const res = await call('/wx/claim', { DB: makeFakeD1().db }, { method: 'POST' });
    expect(res.status).toBe(400);
    expect((await res.json() as StatusBody).error).toBe('NO_IDENTITY');
  });
});

/**
 * SQL 隔离守卫（源码层）。
 *
 * `wx_packs / wx_messages / wx_outbox` 是多租户改造里新加 owner 的三张表：它们以前
 * 只有 char_id / msg_id，任何一条漏带 owner 的查询都意味着"别人能读到你的东西"。
 * 这条守卫把这些表的所有 SQL 抠出来逐个检查——将来新增查询忘了带 owner 会直接红。
 *
 * 豁免：wx_config（主键就是 owner，查询一律 `id = ?1`）、wx_heartbeat（全局，与用户无关）、
 * 以及建表 / 补列 / 体检用的 DDL 与 pragma。
 */
describe('SQL 隔离守卫：三张按 owner 分区的表不能漏 owner', () => {
  const PARTITIONED = ['wx_packs', 'wx_messages', 'wx_outbox'];
  const EXEMPT = [/CREATE (TABLE|INDEX)/i, /ALTER TABLE/i, /pragma_table_info/i, /sqlite_master/i];

  it('每条涉及 packs / messages / outbox 的语句都带 owner', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const statements = [...source.matchAll(/`([^`]*)`/g)]
      .map((match) => match[1])
      .filter((sql) => PARTITIONED.some((table) => new RegExp(`\\b${table}\\b`).test(sql)))
      .map((sql) => sql.replace(/\s+/g, ' ').trim())
      .filter((sql) => !EXEMPT.some((pattern) => pattern.test(sql)));

    expect(statements.length).toBeGreaterThan(5);        // 守卫本身没瞎：确实抠到了语句
    const offenders = statements.filter((sql) => !/\bowner\b/.test(sql));
    expect(offenders, `这些语句漏了 owner 过滤：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('三张表都建了带 owner 的索引或复合主键（否则多租户下每次查询全表扫）', () => {
    // 建表语句住在 schema.ts（与 schema.sql 由漂移守卫对齐），不在入口文件里。
    const ddl = readFileSync(fileURLToPath(new URL('./schema.ts', import.meta.url)), 'utf8');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_wx_outbox_owner ON wx_outbox(owner, seq)');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_wx_messages_owner ON wx_messages(owner, created_at)');
    expect(ddl).toContain('PRIMARY KEY (owner, char_id)');
  });
});
