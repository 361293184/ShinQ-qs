# 任务：稳妥同步上游 31 个提交（分三阶段合并）

## 目标
把上游 `e74856cc → 6dd60412` 的 31 个提交并入本地自研分支，**自研 74 个提交一个不丢**。
节奏求稳：分三段独立合并、独立验证、独立提交，任一段炸了只回滚那一段。

## 存档点与边界（已核实）
| 项 | 值 |
|---|---|
| 回退锚点（合并前 HEAD） | `8c313e5c` |
| 同步起点 | `e74856cc`（上次同步位置） |
| 上游目标 | `6dd60412`（upstream/master） |
| 落后 / 领先（起始） | 31 / 74 |
| 落后 / 领先（完成后） | **0 / 78** ✅ |

## 三段边界与提交
| 段 | 目标 sha | 主题 | 合并结果 |
|---|---|---|---|
| 1 | `011d12d1` | 美化分享系统、装修工作流统一、相机与节日感知 | merge `10c98148` + 收尾 `a63c6731`（有冲突，见下） |
| 2 | `d470e1bc` | Pixi 启动死循环、衣橱不可读恢复、白盒 CSS、manifest | merge `66f8e478`，**零冲突**自动合并 |
| 3 | `6dd60412` | 更新保活、马来西亚节假日、活动盒原子化、气泡预设、相机方向、隐私索引、聊天反馈 | merge（**零冲突**自动合并） |

## Phases
| # | Phase | 状态 |
|---|---|---|
| 1 | 存档点 + 分段基线 + 进度文件 | completed |
| 2 | 第 1 段合并（至 `011d12d1`）→ 解冲突 → 验证 | completed |
| 3 | 第 2 段合并（至 `d470e1bc`）→ 解冲突 → 验证 | completed |
| 4 | 第 3 段合并（至 `6dd60412`）→ 解冲突 → 验证 | completed |
| 5 | 重建 worker bundles + 最终验证（落后数归零、测试不劣于基线、自研资产点验） | completed |
| 6 | 汇总报告，**不推送**，等用户确认 | completed |

### Phase 5 结果
- **worker bundle 重建**：`pnpm run build:workers` exit=0，5 个产物全部生成
  （`sw-keep-alive` 74.9 KB / `post-office` 22.1 KB / `amsg` 755.4 KB /
  `reality-bridge` 18.9 KB / `wechat-bridge` 57.4 KB）。自研的 `reality-bridge`
  与 `wechat-bridge` 均正常构建。
  `worker/amsg/worker.bundle.js` 以重新构建的为准（`68f2b434`）；其余 4 个
  内容未变（仅 LF/CRLF 差异），已 checkout 还原。
- **自研资产点验**：备份注册表 **47 条**（`techo_` / `sully_chrome_css_presets_v1` 在）；
  `utils/galleryGrouping.ts`、`utils/fanwaiGenerator.ts`、`utils/backupLocalState.ts`、
  `utils/galleryBatchDelete.test.ts` 全在位；`components/gallery`、`components/fanwai`、
  `utils/location`、`utils/letter`、`utils/wechatBridge`、`worker/wechat-bridge` 目录全在；
  `DB.deleteGalleryImages`、`AMap.Geolocation`、`geolocateViaAmap` 符号全在；
  8 个 workflow（含自研 `sync-workers-repo.yml` / `deploy-site-main.yml` / `deploy-pages.yml`）保留。
- **落后 / 领先 = `0 / 79`** ✅

## 关键决策
- **分三段而非一次性 merge**：21 个冲突文件里有 `OSContext.tsx` 这种 6000+ 行大文件，
  一次性 merge 一次解错难以定位；分段后冲突面小、可解释、可单独回退。
- **`git merge <段边界 sha>`**，每段一个 merge commit；不用 rebase（不改写自研 74 个提交历史）。
- **冲突解法**：自研功能块原地保留 + 上游新增功能块整块并入；同函数内交织时以自研逻辑为主干、
  把上游的分支/参数并进去。**不整文件取一边**。
- **bundle 文件**：构建产物，冲突以上游为准，合并完跑 `pnpm run build:workers` 重新生成。
- **`index.html` / `vite.config.ts`**：自研定制项（Tailwind CDN config、`--safe-top/--safe-bottom`
  安全区变量、手写字体 `@font-face`、KaTeX、allowedHosts）逐条比对保留。
- **全程不推送**：`origin/main`、`deploy/main` 保持在 `8c313e5c`，等用户确认。
- **不顺手修既有报错**：只承认「合并前后逐字一致」的失败，避免扩大爆炸半径。
- **不改上游作者的 `progress.md`**：本轮一度追加了会话记录，已还原；进度只落在本文件 +
  `.codebuddy/sync-work/`（上一轮确立的分工）。

## 验证矩阵（每段后必跑）
- `npx tsc --noEmit` —— 对比预存在错误集，**不得新增**
- 关键守卫：`backupCoverage`、`backupLocalState`、`galleryBatchDelete`(+wiring)、
  `galleryGrouping`、`locationWiring`、`contentFavorites`
- 全量测试对比基线 **5972 总 / 37 failed / 5935 passed**，失败数不得上升
- `git rev-list --left-right --count upstream/master...HEAD`：落后递减，第 3 段后为 0

## 自研资产回归清单（合并后逐项确认）
`utils/backupLocalState.ts` 47 条登记（含 `techo_`/`sully_` 前缀族）·
`components/gallery/*` + `DB.deleteGalleryImages` + `utils/galleryGrouping.ts` ·
`utils/location/*`（插件串含 `AMap.Geolocation`、poi 全类别、`geolocateViaAmap`）·
`components/fanwai/*` + `utils/fanwaiGenerator.ts` · 拾光/来信/小说共读/现实桥/微信桥/
小游戏/生图设置/查手机等既有自研功能

---

## 分段验证汇总

| 指标 | 基线（合并前） | 第 1 段 | 第 2 段 | 第 3 段 |
|---|---|---|---|---|
| tsc 错误 | 26（9 预存在 + 17 上游噪音） | 26 | 26 | **26** |
| 关键守卫 | — | 5 文件 / 44 全过 | 5 文件 / 44 全过 | **5 文件 / 44 全过** |
| 全量测试 | 5972 / 37 failed / 5935 | 6197 / 29 / 6168 | 6206 / 29 / 6177 | **6268 / 29 / 6239** |
| 失败文件 | 15 | 11 | 11 | 11（同名同数） |
| 落后 / 领先 | 31 / 74 | 27 / 76 | 18 / 77 | **0 / 79** |

**最终提交链**（`8c313e5c` 为回退锚点）：
```
68f2b434  chore(sync): 重建 worker bundle（三段合并后）
018e3509  Merge commit '6dd60412'          ← 第 3 段（零冲突）
66f8e478  Merge commit 'd470e1bc'          ← 第 2 段（零冲突）
a63c6731  chore(sync): 第 1 段收尾 —— 消息卡 blob 化与预览样例对齐
10c98148  chore(sync): 合并上游第 1 段至 011d12d1
8c313e5c  （存档点 / 合并前 HEAD）
```
> 第 2、3 段均由 git 自动合并完成（零冲突），merge commit 信息是 git 默认的
> `Merge commit '<sha>'`。冲突只出现在第 1 段，共 2 处（`apps/Settings.tsx`、`apps/Chat.tsx`）。

### tsc 口径修正（重要）
上游第 1 段 `011d12d1` 新增 `art/chibi/bake-happy-wave.ts`、`art/chibi/happy-wave-qa.ts`
与 `test/fixtures/chibi-happy-wave.ts`，这三个文件引用 `apps/room3d/chibi/*` ——
**该目录上游 master 上也不存在**，且两边 `tsconfig.json` 逐字一致（`include: ["**/*.ts","**/*.tsx"]`、
`exclude: ["node_modules"]`，本次合并未改动）。**故上游自己跑 tsc 同样报这 17 个错**，
属上游自带噪音（`art/` 是美术辅助脚本目录，不参与 `vite build`）。
按「不顺手修既有报错」原则**不修**，仅记录。
预存在错误集（9 个错误 / 5 文件）：`NovelReaderPanel.tsx`(2)、
`utils/checkPhone/reverseTakeoverRunner.ts`(4)、`utils/novelReader.ts`(1)、
`utils/healthData.ts`(1)、`utils/checkPhone/reverseSampler.ts`(1)。

## 第 1 段执行记录（`011d12d1`，唯一有冲突的一段）

### 冲突与收尾改动
- **`apps/Settings.tsx`**：上游把实时感知测试状态从单变量 `rtTestStatus` 重构成
  `rtTestStatuses`（按 key 的 Record）+ `renderRtTestStatus(key)`。解冲突后仍残留
  **旧版单变量显示死块**（新版里该变量已不存在），已删除；上游新实现（L688-692、
  L5095/L5174/L5226/L5265 四处调用）保留。
- **`apps/Chat.tsx`**：补回 `import ScheduleChangeNotice`（L4141-4147 正在渲染它），
  并入上游美化分享系统的落地分支（`psyche-css` / `appearance-preset` /
  `character-card` / 世界书 四种 `artifact.kind`）。
- **收尾提交 `a63c6731`**（5 文件）：
  `MessageItem.tsx` 表情/图片消息改用 `TokenImg`（不再把 `m.content` 直塞 `<img src>`，
  令牌未解析会是裂图）+ 新增 `translationExpanded`；`chatPreviewFixtures.ts` 补 5 类
  自研卡片样例；`chatWhitebox.test.ts` 样例数 28 → 33；`decorationPreviewInteraction.test.ts`
  按本地「加号面板单页滚动」行为断言；`galleryBatchDelete.test.ts` 修 `spyOn` 类型。

### 失败测试归因（11 个文件，全部预存在）
| 文件 | 失败数 | 归因 |
|---|---|---|
| `utils/apiPresetSwitch.wiring.test.ts` | 11 | 上游结构断言 vs 自研改过的 `apps/Settings.tsx` |
| `utils/replySnapshotBlobRef.test.ts` | 5 | 上游 blob 化断言未满足（见「已知预存在缺陷」） |
| `utils/chatBackgroundBlobRef.test.ts` | 3 | 同上（合并前 `8c313e5c` 即失败，铁证见下） |
| `utils/messageItemPhotoBlobRef.test.ts` | 2 | 同上（该测试文件本次完全未被改动） |
| `utils/exportShareAudit.test.ts` | 2 | 同上（该测试文件本次完全未被改动） |
| `utils/collaborationWiring.test.ts` | 1 | 结构断言 |
| `utils/amsgStateSync.wiring.test.ts` | 1 | 结构断言 |
| `utils/activeMsgClient.wiring.test.ts` | 1 | 结构断言 |
| `utils/reportedIssuesRegression.wiring.test.ts` | 1 | 结构断言 |
| `utils/safeAreaApps.test.ts` | 1 | 上游「防漏登记」断言 vs 自研安全区实现 |
| `utils/contextPipeline.test.ts` | 1 | 自研 `fanwaiGenerator.ts` 架构违规（见下） |

**预存在的铁证**：`8c313e5c:apps/Chat.tsx` 中 `chatBackground: dataUrl` ×1、
`url(${char.chatBackground})` ×1、`url("${resolvedChatBackground}")` ×0；
而 `chatBackgroundBlobRef.test.ts` 的这两条断言在**旧版中逐字相同**（diff 只改了
`resolvedChatBackground` 的取值表达式与第 4 个 it 的对象），故合并前即必然失败。

## 已知预存在缺陷（合并前即存在，本次未引入，**待另开一轮处理**）

| 项 | 表现 | 证据 |
|---|---|---|
| **聊天背景未走 blob 化** | `apps/Chat.tsx` L2691-2699 `handleBgUpload` 仍写 `dataUrl`（base64 塞角色行）；L4066-4068 `chatRootStyle` 用未解析的 `char.chatBackground` 拼 CSS `url()`（令牌未解析 → **背景裂图**） | 上述铁证 |
| **`contextPipeline.test.ts` 架构守卫** | `utils/fanwaiGenerator.ts`（自研）从 `./worldbook` 导入内部函数，违反「只允许 ContextBuilder 调用」约定 | 上次同步 `SYNC_FINDINGS.md` 已记录「该 import 在 `320d08cb` 时已存在」 |
| **上游 blobref 系列断言未满足** | `replySnapshotBlobRef`(5)、`messageItemPhotoBlobRef`(2)、`exportShareAudit`(2)、`chatBackgroundBlobRef`(3) | 测试文件本次未被改动，自研侧对应实现写法未变 |

> 上游对聊天背景 blob 化有**现成正确实现**（`git show 011d12d1:apps/Chat.tsx` 的
> `handleBgUpload` 用 `processImageToBlob + putImageBlob` 存令牌、`chatRootStyle` 用
> `url("${resolvedChatBackground}")`），修复成本仅 2 处小改 + 1 个 import。
> 注意：第 1 段收尾已把 `MessageItem.tsx` 的表情/图片消息改为 `TokenImg`，
> `messageItemPhotoBlobRef.test.ts` 剩余 2 个失败涉及别的写法，需单独核对。

## ✅ 已完成：调休/节假日数据源统一（`89f8e28c`，2026-09-29）

### 注入侧：无需任何改动（复核确认全走上游）
- 本地上下文：`utils/context.ts:624` `getCachedUserHolidayReminder(user.name, ...)`
  → 挂到「### 互动对象 (User)」下，开关条件见 `context.ts:623`
  （`char.timeAwarenessEnabled !== false && !skipTimeAwareness && !skipUserHoliday`）；
- 云端：`worker/amsg/src/index.ts:2177`（`buildUserHolidayBlock`）、
  `:2260-2263` 与 `:2312`（`insertUserHolidayInProfile`）。
- 第 3 段还增强了它：`utils/userHolidays.ts` 支持马来西亚州属级
  （`utils/malaysiaHolidayRegions.ts`），并新增 `ContextBuilder` / `buildUserHolidayBlock`
  的断言与 `utils/malaysiaHolidays.test.ts`。
- **自研从未做过注入**：`utils/realtimeWorldCore.ts:631` 的 `dayStatusLine` 合并后仍
  **全仓无调用方**（死参数）。

### 日历侧：已改为官方内置表（提交 `89f8e28c`）
`utils/calendarFestivals.ts` 的「法定假/补班」改用上游 `presets/holidays/cn-2026.json`：
- 解析复用 `userHolidays.parseHolidayCalendar` 归一化（**未修改** `userHolidays.ts`，避免下次同步冲突）
- 补班名由 `isOffDay === false` 派生并拼「补班」后缀（维持月视图「班」标记与既有断言）
- 联网换上游同源 `NateScarlet/holiday-cn`；2026 年**短路不联网**
- 缓存加 `v: 2` 标记，旧结构读到即丢弃
- `getDayFestival` 保持同步；`checkSpecialDates` 的公历/农历节日名逻辑原样保留
- 修正旧占位表 6 处错误：`2026-02-15` 放假被标成补班（相反）、漏 `01-04`/`02-28`/`05-09`、
  凭空多 `04-11`/`09-13`
- 验证：测试 4 → 16 个全过；相关 3 文件 / 30 测试全过；tsc 26（零新增）；
  全量 6280 / 29 failed / 6251 passed（零新增）

### 仍待另开一轮
见下节「已知预存在缺陷」——聊天背景 blob 化、`contextPipeline` 架构违规、
上游 blobref 系列断言。

## Errors Encountered
| Error | 情形 | Resolution |
|---|---|---|
| `git fetch upstream` RPC failed (schannel) | 网络抖动，第 1 次失败 | 重试一次成功 |
| 6 个 bundle 显示 M | 实为 LF/CRLF 行尾差异（`git diff --stat` 无输出） | `git checkout --` 还原，无内容损失 |
| 命令审批超时 ×2 | 用户不在屏幕前 | 重试，第 3 次成功 |
| node 一行脚本统计 tsc 错误数为 0 | 正则未匹配相对路径，**差点漏报 26 个错误** | 改用 PowerShell 原生 `Select-String` + `Group-Object` |
| `npx vitest run $array` 报 No test files found | PowerShell 数组未正确展开 | 改回内联空格分隔文件名 |
| `git status --short` 输出被工具截断 | 漏看了 6 个未提交改动（含 `MessageItem.tsx` 70 行） | 单独 `git diff` 复核后再提交；提交后复查工作区 |
