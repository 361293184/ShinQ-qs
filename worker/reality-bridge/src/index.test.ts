import { describe, expect, it } from 'vitest';
import worker from './index';

/* ── 内存 D1 fake ──────────────────────────────────────────────
 * 只覆盖本 worker 用到的语句形态：
 *  - INSERT INTO <t> (a,b,..) VALUES (?1,?2,..) [ON CONFLICT...]
 *  - SELECT <cols> FROM <t> WHERE id='main'   （first，返回整行）
 *  - SELECT COUNT(*) AS n FROM bridge_items WHERE created_at >= ?1 （first）
 *  - SELECT <cols> FROM bridge_items WHERE ... LIMIT 1 （去重探测 → null）
 *  - SELECT <cols> FROM bridge_bundles ORDER BY ... LIMIT .. （all）
 *  - DELETE FROM bridge_bundles WHERE event_id = ?1
 */
type Row = Record<string, unknown>;
function makeFakeDb() {
  const tables: Record<string, Map<string, Row>> = {
    bridge_items: new Map(),
    bridge_bundles: new Map(),
    bridge_config: new Map(),
  };

  const stmt = {
    bind: (..._args: unknown[]) => stmt,
    async run(): Promise<unknown> { return undefined; },
    async first<T = Row>(): Promise<T | null> { return null; },
    async all<T = Row>(): Promise<{ results: T[] }> { return { results: [] as T[] }; },
  };

  // 记录 INSERT 的实际参数：prepare 后 bind(...) 会先把参数存起来，run 时写表。
  const pending: Array<{ args: unknown[] }> = [];
  const pendingInsert = { args: [] as unknown[] };

  const prepared = (sql: string) => {
    const handle = {
      bind: (...args: unknown[]) => {
        pendingInsert.args = args;
        return handle;
      },
      async run(): Promise<unknown> {
        const m = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)/);
        if (m) {
          const [, name, colsRaw] = m;
          const cols = colsRaw.split(',').map(c => c.trim());
          const row: Row = {};
          pendingInsert.args.forEach((v, i) => {
            if (cols[i]) row[cols[i]] = v;
          });
          const key = name === 'bridge_config' ? 'main' : String(row[cols[0]] ?? pendingInsert.args.length);
          tables[name]!.set(key, row);
        }
        return undefined;
      },
      async first<T>(): Promise<T | null> {
        if (/FROM bridge_config\b/.test(sql)) return (tables.bridge_config.get('main') as T) ?? null;
        if (/FROM bridge_items\b/.test(sql) && /LIMIT 1/.test(sql)) return null; // 去重探测恒空
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (/FROM bridge_bundles\b/.test(sql)) return { results: [...tables.bridge_bundles.values()] as T[] };
        return { results: [] as T[] };
      },
    };
    return handle;
  };
  void pending;

  const db = { prepare: (sql: string) => prepared(sql) };
  return { db, tables };
}

function makeEnv(db: unknown, overrides: Record<string, unknown> = {}) {
  return {
    DB: db,
    CLIENT_TOKEN: '',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: 'mailto:t@example.com',
    MASTER_KEY: 'a'.repeat(64),
    ...overrides,
  } as Parameters<typeof worker.fetch>[1];
}

async function call(env: unknown, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const req = new Request(`https://bridge.example${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const resp = await worker.fetch(req, env as Parameters<typeof worker.fetch>[1]);
  let parsed: unknown = null;
  try { parsed = await resp.json(); } catch { /* ignore */ }
  return { status: resp.status, body: parsed };
}

function putConfig(tables: ReturnType<typeof makeFakeDb>['tables'], chars: unknown[], rules: unknown[] = [], llm = false) {
  tables.bridge_config.set('main', {
    rules_json: JSON.stringify(rules),
    chars_json: JSON.stringify(chars),
    llm_enc: llm ? 'enc' : null,
    llm_iv: llm ? 'iv' : null,
    push_sub: null,
  });
}

describe('reality-bridge worker', () => {
  it('GET /health 无需 token 返回 ok + 版本', async () => {
    const { db } = makeFakeDb();
    const res = await call(makeEnv(db), 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it('未配置时 POST /bridge/inbox 存档并提示未配置角色', async () => {
    const { db } = makeFakeDb();
    const res = await call(makeEnv(db), 'POST', '/bridge/inbox', { type: '天气', payload: '晴 25°C' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(res.body.note).toContain('未配置');
  });

  it('CLIENT_TOKEN 配置后无 token 请求被拒', async () => {
    const { db } = makeFakeDb();
    const res = await call(makeEnv(db, { CLIENT_TOKEN: 'secret-123' }), 'POST', '/bridge/inbox', { type: 'X', payload: 'y' });
    expect(res.status).toBe(401);
  });

  it('未知路由 404', async () => {
    const { db } = makeFakeDb();
    const res = await call(makeEnv(db), 'GET', '/nope');
    expect(res.status).toBe(404);
  });

  it('POST /bridge/config 保存角色与凭据（不带 LLM 时返回角色数）', async () => {
    const { db } = makeFakeDb();
    const res = await call(makeEnv(db), 'POST', '/bridge/config', {
      rules: [],
      characters: [{ id: 'char-1', enabled: true, autoReply: false, persona: '你是小夏。' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, characters: 1 });
  });

  it('POST /bridge/config 缺字段返回 400', async () => {
    const { db } = makeFakeDb();
    const res = await call(makeEnv(db), 'POST', '/bridge/config', null as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
  });

  it('配置了角色开关但未开 autoReply → 事件打包为仅事件 bundle，replyText 为 null', async () => {
    const { db, tables } = makeFakeDb();
    putConfig(tables, [{ id: 'char-1', enabled: true, autoReply: false, persona: '你是小夏。' }]);
    const res = await call(makeEnv(db), 'POST', '/bridge/inbox', { type: '定位', payload: '用户到了图书馆' });
    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(1);
    const rows = [...tables.bridge_bundles.values()] as Array<{ reply_text: string | null; char_id: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].char_id).toBe('char-1');
    expect(rows[0].reply_text).toBeNull();
  });

  it('无启用角色的开关 → delivered=0（不打扰）', async () => {
    const { db, tables } = makeFakeDb();
    putConfig(tables, [{ id: 'char-x', enabled: false, autoReply: false, persona: '' }]);
    const res = await call(makeEnv(db), 'POST', '/bridge/inbox', { type: '定位', payload: '在家' });
    expect(res.body.delivered).toBe(0);
  });

  it('GET /bridge/pending 返回已打包的 bundle', async () => {
    const { db, tables } = makeFakeDb();
    tables.bridge_bundles.set('b1', {
      event_id: 'e1', char_id: 'c1', item_type: 'T', event_text: '数据',
      reply_text: null, action_notes: '["写入聊天（仅事件）"]', created_at: 1,
    });
    const res = await call(makeEnv(db), 'GET', '/bridge/pending');
    expect(res.status).toBe(200);
    const items = (res.body as { items: Array<{ eventId: string; charId: string }> }).items;
    expect(items.length).toBe(1);
    expect(items[0].eventId).toBe('e1');
    expect(items[0].charId).toBe('c1');
  });
});
