-- 现实桥 · D1 schema
--
-- 三张表分工：
--   bridge_items   收件箱原始条目（快捷指令 POST 进来先落地，幂等去重）
--   bridge_bundles 已打包待下发的推送（事件+回应+动作），App 轮询/收 push 后认领删除
--   bridge_config  角色上下文 + 加密 LLM 凭据 + push 订阅 + 规则快照（单行 main）

CREATE TABLE IF NOT EXISTS bridge_items (
  id          TEXT    NOT NULL,          -- event id（幂等键，客户端生成或服务端生成）
  item_type   TEXT    NOT NULL,
  payload     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS bridge_bundles (
  event_id     TEXT    NOT NULL,
  char_id      TEXT    NOT NULL,
  item_type    TEXT    NOT NULL,
  event_text   TEXT    NOT NULL,
  reply_text   TEXT,
  action_notes TEXT,                     -- JSON 数组，动作摘要
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (event_id, char_id)
);

CREATE TABLE IF NOT EXISTS bridge_config (
  id          TEXT NOT NULL DEFAULT 'main',
  rules_json  TEXT NOT NULL DEFAULT '[]',  -- 规则快照
  chars_json  TEXT NOT NULL DEFAULT '[]',  -- 启用角色 persona + 开关
  llm_enc     TEXT,                         -- AES-GCM 加密后的 LLM 凭据 JSON
  llm_iv      TEXT,
  push_sub    TEXT,                         -- pushSubscription JSON（endpoint/p256dh/auth）
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (id)
);

-- App 拉取待合并 bundle：按 char 拉最旧一批。
CREATE INDEX IF NOT EXISTS idx_bridge_bundles_char ON bridge_bundles(char_id, created_at);
