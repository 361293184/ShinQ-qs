-- 微信桥 · D1 schema
--
-- ⚠️ 这份文件与 `src/schema.ts` 里的 `SCHEMA_STATEMENTS` **必须逐条一致（含顺序）**：
--   · 那份是运行时用的（POST /wx/init 幂等建表，面板路线的人点一下按钮就建好）；
--   · 这份是给人看、给命令行 `wrangler d1 execute --file=./schema.sql` 用的。
--   改了任意一边都要同步另一边，否则单测 `src/schema.test.ts` 会红——那正是漂移守卫。
--
-- 五张表分工：
--   wx_config   绑定与配置（**每人一行**，id = owner）：已登录的微信 bot、加密 LLM 凭据
--   wx_packs    每角色一份 fire_pack：模板（变化慢）+ 对话（变化快、云端自洽）
--   wx_messages 消息台账：入站幂等键 + 出站留痕（去重靠 msg_id）
--   wx_outbox   待 App 补收的增量：App 打开 / 切前台时拉走，合并进角色主时间线
--   wx_heartbeat cron 心跳（全局单行，与用户无关）
--
-- 多租户（2026-09-13 起）：owner = sha256(客户端设备身份) 取前 16 位 hex。
--   老库里的历史数据 owner 取默认值 'main'（那是最初的单租户空间），
--   可用 POST /wx/claim 认领到自己名下，不需要手工跑 SQL。
--   老库补列无法用 CREATE 语句完成（表已存在），所以另有一条升级通道：
--   `SCHEMA_UPGRADE_COLUMNS` + `/wx/init` 里的 pragma 检查 + ALTER TABLE。
--
-- 为什么不把「对话」单独开一张表：fire_pack 的 chat.messages 必须**逐字**是
-- SullyOS 本地生成会 POST 出去的那一串（含 system 段与结构化分段），它不是一个
-- 关系型的消息表能无损表达的东西。所以它就以 JSON 存在 wx_packs 里，wx_messages
-- 只做幂等台账，各管各的。

CREATE TABLE IF NOT EXISTS wx_config (
  id           TEXT NOT NULL DEFAULT 'main',
  -- 已扫码登录的微信 bot：[{ botId, charId(扫码即绑定), autoReply, timeAwarenessEnabled,
  --   tokenEnc, tokenIv, baseUrl, label, cursor, lastPollAt, lastProbeAt, lastError, expired }]。
  -- token 用 MASTER_KEY AES-GCM 加密，明文不落库。
  -- id 的语义：每人一行，id = owner；默认值 'main' 只服务于"老客户端不带身份"的兼容路径。
  bots_json    TEXT NOT NULL DEFAULT '[]',
  -- AES-GCM 加密后的 LLM 凭据 JSON（{ apiUrl, apiKey, model, extraBody }）
  llm_enc      TEXT,
  llm_iv       TEXT,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS wx_packs (
  -- 归属：sha256(设备身份) 前 16 位；老数据为 'main'
  owner          TEXT NOT NULL DEFAULT 'main',
  char_id        TEXT NOT NULL,
  -- 完整 AmsgFirePack（含 chat 段）。云端每次生成后自己 append 新的一来一回，
  -- 所以 App 长期不开也不会断上下文（见 index.ts 的 processIncoming）。
  pack_json      TEXT NOT NULL,
  -- 模板版本：App 每次上传 +1；只用于排障与自检展示。
  template_ver   INTEGER NOT NULL DEFAULT 1,
  -- 对话部分的写入时刻（epoch ms）。App 上传时用它做**条件写**：
  -- 云端比它新就拒绝采用 App 的 chat 段（防「App 拿旧历史盖掉云端的微信对话」）。
  chat_built_at  INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (owner, char_id)
);

CREATE TABLE IF NOT EXISTS wx_messages (
  -- 幂等键：iLink 侧 message_id（或由 联系人+时间戳+正文 兜底生成）
  msg_id     TEXT NOT NULL,
  -- 归属：sha256(设备身份) 前 16 位；老数据为 'main'
  owner      TEXT NOT NULL DEFAULT 'main',
  char_id    TEXT NOT NULL,
  role       TEXT NOT NULL,
  -- 纯展示用的正文留痕（真正喂模型的那份在 wx_packs.pack_json 的 chat 里）。
  content    TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'wechat',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner, msg_id)
);

CREATE INDEX IF NOT EXISTS idx_wx_messages_char ON wx_messages(char_id, created_at);

CREATE INDEX IF NOT EXISTS idx_wx_messages_owner ON wx_messages(owner, created_at);

CREATE TABLE IF NOT EXISTS wx_outbox (
  -- 自增序号即游标：App 用 GET /wx/outbox?since=<上一轮拿到的最大 seq> 增量拉取。
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 归属：sha256(设备身份) 前 16 位；老数据为 'main'
  owner      TEXT NOT NULL DEFAULT 'main',
  char_id    TEXT NOT NULL,
  msg_id     TEXT NOT NULL,
  -- { msgId, charId, role, content, at } —— 前端拿到直接走 chat-glue 那套幂等合并。
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wx_outbox_char ON wx_outbox(char_id, seq);

CREATE INDEX IF NOT EXISTS idx_wx_outbox_owner ON wx_outbox(owner, seq);

CREATE TABLE IF NOT EXISTS wx_heartbeat (
  id   TEXT NOT NULL,
  at   INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id)
);
