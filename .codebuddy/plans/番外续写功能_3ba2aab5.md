---
name: 番外续写功能
overview: 为纯文字番外在正文末尾加「续写」入口：点开可输入续写走向（可选），AI 接续生成并追加进同一篇番外，可反复续写，解决 AI 生成截断。
todos:
  - id: llm-refactor
    content: 重构 fanwaiGenerator：抽公共 callFanwaiLLM 供 generateFanwai/continueFanwai 复用
    status: completed
  - id: continue-fn
    content: 新增 buildContinueFanwaiPrompt + continueFanwai（末尾2000字上下文+走向，纯文字专用）
    status: completed
    dependencies:
      - llm-refactor
  - id: oscontext
    content: OSContext 新增 updateFanwaiStory 接口/实现/暴露
    status: completed
  - id: fanwai-ui
    content: FanwaiApp 详情页加续写入口/弹框/续写中状态/handleContinue（仅纯文字番外）
    status: completed
    dependencies:
      - continue-fn
      - oscontext
  - id: types-field
    content: types.ts 的 FanwaiStory 加可选 continuedAt 字段
    status: completed
  - id: verify
    content: 验证：lint + tsc + 编译 fanwaiGenerator/FanwaiApp
    status: completed
    dependencies:
      - fanwai-ui
      - types-field
---

## 需求概述

解决 AI 生成番外时可能**截断**的问题（内容超长被截/API 截断，读一半就断掉）。在纯文字番外正文末尾提供「续写」功能：点击后弹框可填写续写走向（可选），AI 接续生成，内容**追加进同一篇番外正文末尾**，支持反复续写。

## 核心功能

- **续写入口**：纯文字番外（format='text'）正文末尾显示「✍️ 续写」按钮；HTML 番外不显示（标签结构断点难续写，避开）
- **续写弹框**：续写走向输入（可选，限 100 字内）；不填 = 默认接前文自然写
- **续写中状态**：入口变「✍️ 续写中…」并禁用（防连点）
- **续写调用**：取原文末尾 2000 字左右为上下文 + 人物/文风/视角/世界观保持 + 续写走向 → 副 API 生成
- **续写后**：新内容无缝追加进正文末尾，像一篇完整小说；入口仍在，可反复续写
- **失败处理**：提示「续写失败，重试？」
- **截断提示**：生成结果异常结尾时提示可续写

## 边界

- 仅纯文字番外；HTML 番外不做续写
- 续写用副 API（与生成同通道）
- 不动记忆系统、其他 App、HTML 番外渲染


## 技术栈
沿用现有 React + TypeScript + IndexedDB 架构，改动集中在番外续写链路：`utils/fanwaiGenerator.ts`（续写调用）、`context/OSContext.tsx`（更新方法）、`apps/FanwaiApp.tsx`（续写 UI）、`types.ts`（可选字段）。

## 实现方案

### 1. `utils/fanwaiGenerator.ts`：续写函数 + 复用底层
- **抽公共 `callFanwaiLLM(prompt, subApi, meta)`**：封装 fetch subApi `/chat/completions` + safeResponseJson + extractContent + 判空 + stripFence，返回 `FanwaiGenResult`。重构 `generateFanwai` 复用，避免两处重复 fetch/解析。
- **新增 `buildContinueFanwaiPrompt(char, story, direction?)`**：输入原文末尾 2000 字（`story.content.slice(-2000)`）+ char 人物设定（保持文风）+ 视角（story.pov）+ 世界观（story.worldSetting）+ 续写走向（direction 可选）。指令强调：自然接续展开，保持人物/文风/视角/世界观一致，**不重复/不改写已写内容**；走向非空注入「后续走向：xxx」，空则「接着前文自然写」；输出**直接接续正文**，不要重复上文末尾、不要加标题、不要前言后记。
- **新增 `continueFanwai(char, story, subApi, direction?)`**：调 `buildContinueFanwaiPrompt` + `callFanwaiLLM`，返回 `FanwaiGenResult`（content 为续写片段，不含原文）。纯文字专用，不经过 `detectHtmlFormat`。

### 2. `context/OSContext.tsx`：新增 updateFanwaiStory
- 接口（line 323-324 附近）加 `updateFanwaiStory: (id: string, story: FanwaiStory) => void`
- 实现（line 3387 附近）：`setFanwaiStories(prev => prev.map(s => s.id === id ? story : s))` + `await DB.saveFanwaiStory(story)`
- 在返回值（line 5067-5069）暴露

### 3. `apps/FanwaiApp.tsx`：续写 UI
- line 51 补解构 `apiConfig`、`updateFanwaiStory`
- 纯文字 `<article>`（line 188-190）之后、卡片内加「✍️ 续写」入口，仅 `detail.format !== 'html'` 时显示
- 续写弹框（走向输入限 100 字 + 开始续写/取消），复用现有 modal 样式
- `continuing` state：续写中禁用入口、显示「✍️ 续写中…」
- `handleContinue`：组装 subApi（同 FanwaiGeneratePage line 89-93）→ `continueFanwai` → 成功后 `content += '\n\n' + result.content` → `updateFanwaiStory` + `setDetail` 刷新；失败提示「续写失败，重试？」
- 反复续写（入口一直在）；走向输入限长

### 4. `types.ts`（可选）
- 加 `continuedAt?: number` 记录最近续写时间（展示用，非必需）

## 关键落点
- `utils/fanwaiGenerator.ts`：callFanwaiLLM 抽取 + buildContinueFanwaiPrompt + continueFanwai
- `context/OSContext.tsx`：updateFanwaiStory 接口/实现/暴露
- `apps/FanwaiApp.tsx`：续写入口/弹框/续写中状态/handleContinue
- `types.ts`：FanwaiStory 加 continuedAt（可选）

## 注意
- HTML 番外（iframe 渲染）不显示续写入口
- 追加到 content 末尾，storyParts 提取标题不受影响
- 续写用副 API，无需主 API
- 不动记忆系统、其他 App、HTML 渲染


## Agent Extensions
### SubAgent
- **code-explorer**
  - 用途：在实施前核对 `buildContinueFanwaiPrompt` 可复用的 char 设定块、`FanwaiApp.tsx` 详情页 modal 样式复用点、`OSContext.tsx` updateFanwaiStory 的精确插入位置，以及 `continueFanwai` 与 `generateFanwai` 共用 `callFanwaiLLM` 的抽取方式，确保改动精准落在现有结构
  - 预期产出：精确到行号/函数签名/可复用样式的落点清单，确认续写链路与现有副 API 调用一致
