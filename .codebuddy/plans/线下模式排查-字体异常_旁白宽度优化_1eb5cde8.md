---
name: 线下模式排查-字体异常+旁白宽度优化
overview: 修复线下模式 bug（HTML 卡片后处理未看 offlineConfig，导致模型输出的 HTML 仍按大字号卡片渲染），并优化旁白宽度和默认字号。
todos:
  - id: fix-html-card-cond
    content: 修复 applyAssistantPostProcessing.ts 第 2042 行 HTML 卡片识别条件，补 isOfflineEnabled import
    status: completed
  - id: widen-narration
    content: MessageItem.tsx 旁白 max-w-[70%] → max-w-[80%]
    status: completed
  - id: default-narration-size
    content: offlineSettings.ts 默认 narrationSize 14 → 15
    status: completed
  - id: update-tests
    content: 更新 offlineParser.test.ts 中 narrationSize 默认值断言（如有）
    status: completed
    dependencies:
      - default-narration-size
  - id: verify
    content: 跑 tsc + offlineParser 测试，确认无回归
    status: completed
    dependencies:
      - fix-html-card-cond
      - widen-narration
      - default-narration-size
      - update-tests
  - id: commit
    content: git 提交（不推送）
    status: completed
    dependencies:
      - verify
---

## 需求概述
线下模式（已上线）用户实测发现 3 个问题，定位了根因：

1. **HTML 卡片大字号 bug**：线下模式开启后，部分角色叙述气泡出现大字号+卡片背景渲染。
   - 根因：`utils/applyAssistantPostProcessing.ts` 第 2042 行 HTML 卡片识别条件只查 `char.htmlModeEnabled`，没看 `char.offlineConfig.enabled`。模型一旦输出 `[html]...[/html]` 标签，即使主路径 prompt 已关 HTML，仍被识别成 `type:'html_card'`，触发 `MessageItem` 普通卡片分支（大字号渲染），不走我的离线旁白/台词分支。
   - 修法：2042 行条件加 `!isOfflineEnabled(char.offlineConfig)`，让 `[html]...[/html]` 标签在线下开启时作为普通文本保留到 cleanedContent，最终落库 `type:'text'` + `offline:true`，被离线分支按旁白/台词解析。

2. **旁白左右拉长**：上一轮已改 `max-w-[70%]`，用户仍嫌窄。
   - 修法：`max-w-[70%]` → `max-w-[80%]`。

3. **默认旁白字号偏小**：`DEFAULT_OFFLINE_CONFIG.narrationSize: 14`，比普通气泡的 `text-[15px]` 还小。
   - 修法：默认 14 → 15（与普通气泡一致）；OFFLINE_SIZE_MIN=11、MAX=22、clamp 不动。

## 涉及文件
- `utils/applyAssistantPostProcessing.ts`：第 2042 行条件 + 补 `isOfflineEnabled` import
- `components/chat/MessageItem.tsx`：旁白 div className `max-w-[70%]` → `max-w-[80%]`
- `utils/offlineMode/offlineSettings.ts`：`DEFAULT_OFFLINE_CONFIG.narrationSize: 14 → 15`
- `utils/offlineMode/offlineParser.test.ts`（可能）：narrationSize 默认值断言需更新

## 验证
- `npx tsc --noEmit` 筛选本次文件无新错误
- `npx vitest run utils/offlineMode/offlineParser.test.ts` 全绿（解析逻辑不动，但 `isOfflineEnabled` 间接被覆盖时可顺便跑）
- 手动：开线下 + 开 HTML 模式 → 角色输出 HTML 时不再按卡片渲染，落回旁白解析；旁白宽度更宽；旁白默认字号 15


## 技术方案

### 改动 1：HTML 卡片识别条件叠加 offline 检查
**文件**：`utils/applyAssistantPostProcessing.ts`
**位置**：第 2042 行
**当前代码**：
```ts
if ((char as any).htmlModeEnabled && /\[html\]/i.test(aiContent)) {
```
**改为**：
```ts
const htmlModeOn = (char as any).htmlModeEnabled && !isOfflineEnabled(char.offlineConfig);
if (htmlModeOn && /\[html\]/i.test(aiContent)) {
```

**补 import**：第 53-55 行附近的 `isOfflineEnabled` 来自 `./offlineMode/offlineSettings`（已存在的依赖，确认补上 import）。

**效果**：线下开启时，`/\[html\]/i.test(aiContent)` 整段走 else if（2064 行）——把 `[html]...[/html]` 替换成 `[HTML 卡片]` 占位文本，最终走 `persistMessage` 落 `type:'text'` 助手消息（带 `offline:true`），触发离线分支旁白/台词解析。

**注意**：不影响线上已部署版本——新消息会按修复后走旁白解析；老 HTML 卡片消息（已落库 type='html_card'）仍按卡片渲染（历史数据，不改）。

### 改动 2：旁白宽度
**文件**：`components/chat/MessageItem.tsx`
**位置**：离线分支旁白 div className（约 3785 行）
**当前**：`className="w-full max-w-[70%] mx-auto text-center italic select-text px-1"`
**改为**：`className="w-full max-w-[80%] mx-auto text-center italic select-text px-1"`

### 改动 3：默认旁白字号
**文件**：`utils/offlineMode/offlineSettings.ts`
**位置**：`DEFAULT_OFFLINE_CONFIG.narrationSize: 14` → `15`

### 改动 4：测试更新（如有）
**文件**：`utils/offlineMode/offlineParser.test.ts`
**位置**：所有断言 `narrationSize` 默认值的测试
**检查**：搜 `14` / `13` / `DEFAULT_OFFLINE_CONFIG.narrationSize`，把硬编码默认值改成 15。

### 性能/质量考虑
- 改动极小（3 个文件，6 行内），无新依赖
- 验证用现有 offlineParser 测试 + tsc 筛选
- 备份点：62f04a0（恢复长按 interactionProps）可回退

