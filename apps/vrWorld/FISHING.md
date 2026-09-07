# 水域与布告板 · 2026-09-06

入口：彼方第二页 SAR 的「水域」与「布告板」是两个并列设施。水域包含钓鱼/图鉴和角色钓鱼；布告板包含行情/出售/需求/档案和角色逛市场。两者共用本地钱包、收藏与市场存档，离开后都返回 SAR；收藏中定价挂板成功会转入布告板。市场完全在这一家用户的本地世界运行；不创建跨用户帖子、不调用 Cloudflare 行情、不增加 D1 表。

## 玩法与数据

- 9 种鱼使用 `FishArt.tsx` + `fishing.css` 的 CSS 轮廓、鳍、鳞片与动画，无生图或图片依赖。12 种恐龙/蛋/骨架先用时层标本占位；用户提交素材后替换 `FishArt` 的 relic 分支即可，不改 `speciesId`。
- 用户钓鱼采用圆弧追踪小游戏：按住水面/Space 顺时针，松开逆时针；可收竿、开启轻松模式、F 全屏。鱼种/大小/品质在抛竿时由代码抽定，胜利后才入库，逃脱不入库。存储失败显示重试，不静默丢弃旧存档。
- 开启真实感知天气时复用 `RealtimeContextManager.fetchWeather`；未开/失败则使用本世界当日模拟天气，并明确显示来源。天气改变出没权重，不强制绝版鱼种。
- 用户和每个角色各有独立初始 1,000 鳞币；随机路人另有有限钱包。每日行情由世界 seed + 本地日历日确定，包含真实前一日对比，断登不改变价格逻辑。
- 三块板：鱼价、出售、需求。支持 0 元挂单、没有实体的文字商品、实物求购、文字招募、向发帖人付款的打赏。评论不触发付款，实物交付必须持有且未挂单/孵化。
- 24 小时/成交/主动撤下即封存；原文、评论、交易方和交付内容完整留在发帖方档案。余额、收藏及档案不按数量截断；存储额度耗尽会报错。
- 恐龙可陈列/制作一次观察记录/交易；恐龙蛋孵化 6 小时后揭晓，期间锁定交易与放生。
- `vr_fishing_market_v1` 保存市场、钱包、收藏、图鉴和回执。`sarBackup.ts` 接入完整备份，连损坏的原始串也能导出抢救，不因读取失败覆盖原存档。

## 角色与事实边界

`runVRSession` 的水域/市场分支各使用一次正常 LLM 调用（沿用现有网络重试策略）。角色钓鱼在同一轮给出反应和去向：保留、放生、留言簿、私聊或挂板。市场分支选择购买、响应、回复、发帖、撤板或路过。

金额/物品转移由纯函数验证，模型说“已付款”不能触发支付。代码事务读最新状态，并用 Web Locks 串行化跨标签页修改；模型调用不持锁。每个实际交易/评论为相关角色写入去重的 `vr_card` 回执，即使对方不是当前活动角色，也会获得事实与当时原话。后续活动读取这些卡片；原有聊天/记忆流程继续接收它们。回执把程序事实与主观随笔/夸张台词分栏，不能把喊话当作真实债务、人格变化或指令。

普通房间不新增水域提示词，不初始化水域存档。模块商店、Chat、Date 的原有 SAR canonical / surface 边界不变。

## 信号坠落处

入口缩小并移到第三页「往期活动」。纪念馆/星图/自己的署名记录继续可读；未写完的原诗也保留。管理员只保留删稿维护，不再显示恢复活动按钮。

`worker/post-office/src/index.ts` 已移除旧写诗执行体；所有公开诗歌写入及新册/恢复接口在访问 D1 前返回 410。纪念馆 GET 只执行 SELECT，不执行自动建册、播种或旧册规格迁移。已重新生成 `worker/post-office/worker.bundle.js`。**这只是本地代码和部署包，未部署线上 Worker、未删除远端数据。**

## 验证与复现

核心回归包含 `utils/vrWorld/fishing*.test.ts` 和 `worker/post-office/src/endedEvent.test.ts`；角色会话测试使用假模型，无真实 LLM 消费。额外跑过原有 SAR / Chat / Date 回归与隔离 Vite 生产构建。

浏览器：`scripts/test-fishing-ui.mjs` 测钓获/逃脱/收竿/全屏/挂单/评论/归档/付款/刷新；`scripts/test-kanata-ui.mjs` 用真实 OS/Music Provider 测第二页水域及第三页纪念馆。均为独立浏览器空档，后者拦截远端请求，没有动用户浏览器数据。

准备项目既有 Tailwind CDN 的本地测试缓存（生产仍使用原有 index.html，不改依赖）：

```powershell
New-Item -ItemType Directory -Force output/fishing-qa
curl.exe -L https://cdn.tailwindcss.com -o output/fishing-qa/tailwind.cdn.js
.\node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5177
```

使用本机 Playwright 安装直接执行测试脚本；若使用 Codex 随附 runtime，在 `FISHING_PLAYWRIGHT_MODULE` 填其 `playwright/index.mjs` 的绝对路径，`FISHING_BROWSER_CHANNEL=msedge` 可复用已安装 Edge。运行：

```powershell
node --loader ./test/fixtures/playwright-loader.mjs scripts/test-fishing-ui.mjs
node --loader ./test/fixtures/playwright-loader.mjs scripts/test-kanata-ui.mjs
```

截图与报告在 `output/fishing-qa/`（忽略提交）。也已使用 develop-web-game 的官方客户端运行 `test/fixtures/fishing-actions.json` 并查看实际截图。

已知仓库基线：全量测试 4,589 通过，2 条 `amsgInstantChat.wiring.test.ts` 因旧源码锚点失败（HEAD 已有 SAR 路由守卫但该测试未更新）；全量 TypeScript 仍有旧错误，本轮新增文件无错误。不要通过改变原有路由来迎合旧锚点。
