# 微信桥（wechat-bridge）

> **微信是角色的第二扇门，共用同一个大脑。**
> 你在微信里跟 ta 说话，ta 用**和 SullyOS 里完全一样的上下文**回你；一来一回同时回流进
> SullyOS 的聊天记录，打开 App 就能看到。

对接的是**微信官方 iLink Bot API**（2026 年随 ClawBot 开放）——扫码登录、HTTP 长轮询收发。
**不需要任何第三方网关、常驻电脑或付费服务**，官方接口也基本没有封号问题。

## 它是怎么工作的

```
微信官方 iLink 服务器
   ↑ 35s 长轮询（Cron 每分钟）          ← 你发消息
微信桥 Worker（Cloudflare）
   1. 按联系人找到绑定的角色
   2. 取该角色的 fire_pack（App 上传的完整上下文）
   3. pack.chat.messages 原样 + 末尾时效块（现在几点）
   4. 用你上传的加密 LLM 凭据生成回复        ← App 被杀也能回
   5. sendmessage 逐段发回微信；一来一回记进 outbox
   ↓
SullyOS App（打开/切前台时）
   drain outbox → 幂等合并进角色主时间线 → 认领
```

三条硬规矩（改代码前先读 `src/index.ts` 头部注释）：

1. **不拼自己的提示词**——请求消息就是 SullyOS 本地生成会发的那一串（角色卡、世界书、
   记忆、时间感知全在里面）。这是「不 OOC」的根本保证。
2. **不依赖主动消息 2.0**——自有 D1、自有凭据、自有会话存储，没配过 amsg 照样能跑。
3. **对话只能往前**——App 上传 pack 时，云端若有更新的微信对话（App 关着时聊的），
   保留云端那份，防止旧历史把新对话盖掉。

## 部署 Worker

**给第一次装的人**：走 [《微信桥 · 从零开始的部署手册》](../../docs/wechat-bridge-setup-walkthrough.md)——
全程浏览器点击、不需要命令行，并且把"建表"这一步换成了 App 里的一个按钮
（面板路线本来得去 D1 控制台粘 SQL，粘错一个字就是功能假死）。

快速版（已装 Node.js / wrangler）：

```bash
# 0) 打包（仓库里已带产物，改过代码才需要重跑）
pnpm build:workers

# 1) 建 D1
wrangler d1 create sullyos-wechat-bridge --config worker/wechat-bridge/wrangler.toml   # 把 database_id 填进 wrangler.toml

# 2) 建表（也可以在 App 里点「初始化数据表」，二选一，两者等价：全是 CREATE ... IF NOT EXISTS）
wrangler d1 execute sullyos-wechat-bridge --config worker/wechat-bridge/wrangler.toml --file=./schema.sql

# 3) 配密钥
wrangler secret put MASTER_KEY --config worker/wechat-bridge/wrangler.toml         # 任意够长的一串（走 SHA-256 派生，不要求 hex）
wrangler secret put WX_BRIDGE_TOKEN --config worker/wechat-bridge/wrangler.toml    # 建议配

# 4) 部署
wrangler deploy --config worker/wechat-bridge/wrangler.toml
```

不想装 wrangler 也可以：打开 `public/wechat-bridge-worker.bundle.js` 全选复制，
粘到 Cloudflare 面板新建 Worker（ES Module 格式），再按面板提示配 D1 绑定（`DB`）、
Cron Trigger（`* * * * *`，收消息靠它）与 Secrets（`MASTER_KEY`；**类型必须选 Secret**，
存成 Text 会被下一次部署清空）。**表不用手建**：连上之后在卡片里点「初始化数据表」。

> ⚠️ 仓库根目录还有一份 `wrangler.jsonc`，所以上面每条命令都显式带 `--config`，别省。
> ⚠️ `WX_BRIDGE_TOKEN` 留空 = 所有 `/wx/*` 端点**完全不校验**（`checkToken` 里 `if (!expected) return null`）：
> 知道地址的人就能读走消息增量、删掉绑定、覆盖模型凭据。自用也建议配。

`POST /wx/init` 是幂等建表端点（`/wx/status` 的 `storage` 字段报告表齐不齐），App 卡片上的
「初始化数据表」按钮走的就是它；`src/schema.ts` 与 `schema.sql` 必须逐条一致，有漂移守卫测试钉着。

## 在 SullyOS 里配置（四步）

`神经链接 → 点开角色 → 「设定」页签 → 微信桥`（第一次装请对照 [《部署手册》](../../docs/wechat-bridge-setup-walkthrough.md)）

1. **连接配置**：填 Worker 地址（+ 密钥）→ 点「检查连接」；那一行数据表状态若还是琥珀色，点「初始化数据表」
2. **保存凭据**：LLM 凭据点「一键填入当前聊天 API」后「保存凭据」
3. **上传角色上下文**：把该角色的完整上下文传上去
4. **扫码登录微信**：点「扫码登录（绑定为「XX」）」→ 微信扫码确认（建议用小号）

**绑定模型**：在哪个角色的设定页扫码，微信就归那个角色（一个微信 = 一个角色）。
想换角色：去那个角色的设定页点「**改绑到当前角色**」——token 不动、不用重新扫码。
想多开：多个微信小号各绑各的角色。

之后日常使用零操作：微信里直接聊，回复 10~60 秒内到。

**上下文自动同步**：你在 SullyOS 里和 ta 聊过后，云端上下文自动跟上（每角色至少间隔
5 分钟），「上传角色上下文」按钮平时不用点；改了人设 / 世界书后手动点一次兜底。
微信里聊天不需要刷新——Worker 自己会把一来一回追加进云端对话。

## 已知边界（P0）

- **只能被动回复**：iLink 协议的回复必须带联系人刚发消息的 context_token，
  所以「角色主动找你」「在 App 里回话发到微信」都做不到。
- **仅文本**：入站图片/语音在 SullyOS 里显示占位文字（协议具备图片能力，留作后续）；
  角色的表情包令牌会被剥掉不发图。
- **回复延迟 10~60 秒**（长轮询节奏）；bot 长期不轮询后微信侧显示「暂无法连接」，
  恢复需数分钟，**离线期间的消息不补发**。
- **会话过期会自愈**：微信侧会话过期时，云端**先丢游标重试一次**；仍判失效就每 5 分钟低频探测一次，
  恢复了自动回来（任何一次成功轮询都会清掉过期标记）。卡片亮黄字时**先点「检查连接」**，
  一直不行才需要重新扫码——重扫后同角色的旧绑定会自动清理，永远只留最新那一条。
