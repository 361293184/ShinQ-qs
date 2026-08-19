---
name: 番外随机生成与收藏落盘修复
overview: 新增番外"随机生成"模式（文风/字数/视角全由 AI 决定），修复拾光番外刷新后消失的根因（IndexedDB 写入未等事务落盘），并强化人设/用户不搞反约束。
todos:
  - id: fix-db-persist
    content: 修复 utils/db.ts 的 saveFanwaiStory 与 deleteFanwaiStory：put/delete 后监听 transaction.oncomplete 才 resolve，onerror/onabort 时 reject，确保收藏写入真正落盘
    status: completed
  - id: add-random-prompt
    content: 在 utils/fanwaiGenerator.ts 的 buildFanwaiPrompt 增加 randomMode 分支：不注入固定文风/字数/视角，改为引导 AI 自主决定并强化人设/用户不搞反约束
    status: completed
  - id: wire-random-entry
    content: 在 FanwaiGeneratePage 写番外按钮上方加"随机生成：字数、风格、视角全由 AI 决定"可点小字，handleGenerate/handleCollect 支持随机模式并收藏 style='random'
    status: completed
    dependencies:
      - add-random-prompt
  - id: display-random-style
    content: 在 FanwaiApp.tsx 的 STYLE_NAMES/STYLE_GRADIENTS 增加 'random' 映射（中性渐变 + "随机"名称），确保随机番外卡片正常展示
    status: completed
    dependencies:
      - wire-random-entry
---

## 需求概述

在番外生成功能上做两件事：

### 1. 新增"随机生成"模式
在"开始写这篇番外"按钮上方加一排可点击的小字提示"随机生成：字数、风格、视角全由 AI 决定"，点击后进入随机生成：
- **字数、文风、视角全部交给 AI 决定**，不套用页面当前选中的配置。
- 无世界设定时，AI 依据角色人设、记忆、最近聊天记录自然发挥，可参照任意古今中外作家笔调。
- **用户与角色的设定都要读取，且不能搞反**：角色视角归属角色、用户称呼必须正确。

### 2. 修复拾光番外刷新后消失
用户确认未点删除，但收藏的番外刷新后消失。根因定位为 IndexedDB 写入未等待事务落盘。

## 核心特性
- 随机生成入口（写番外按钮上方的一行可点小字）
- 随机模式下 prompt 引导 AI 自主决定文风/字数/视角
- 人设与用户视角严格区分、不搞反
- 拾光收藏写入真正落盘（等事务 oncomplete）


## 技术栈
- 现有项目（React + TypeScript + Vite），复用当前架构
- IndexedDB（utils/db.ts）番外收藏持久化
- 副 API（subBaseUrl/subApiKey/subModel）非流式生成番外
- 角色上下文复用 ContextBuilder.buildCoreContext 全量输出

## 实现思路

### 1) 修复 DB 写入不落盘（拾光消失根因）
`utils/db.ts` 的 `saveFanwaiStory`（约 2150 行）与 `deleteFanwaiStory`（约 2156 行）当前用 `put`/`delete` 发起写入后没有等待事务 `oncomplete` 就 resolve。IndexedDB 事务异步落盘，若在 commit 前刷新页面，浏览器会回滚丢弃该写入，导致收藏的番外没真正写进 DB。
修复：两个函数改为返回一个 Promise，`put`/`delete` 之后监听 `transaction.oncomplete` 才 resolve；`transaction.onerror`/`onabort` 时 reject。这样收藏/删除都确保落盘后才算完成。

### 2) 随机生成模式
- **入口**：`FanwaiGeneratePage.tsx` 底部"开始写这篇番外"按钮上方加一行可点小字。
- **buildFanwaiPrompt 加 randomMode 分支**：为 true 时——
  - 不注入具体文风预设、固定字数档、固定视角指令；
  - 改为 prompt 引导"由你决定合适的文风、篇幅与视角（可参考古今中外作家的笔调），并保持文学质量；字数自行拿捏在短篇范围内（约 500~3000 字）"；
  - 仍注入角色全量人设 + 记忆 + 世界书 + 最近聊天上下文 + 用户设定；
  - 加强"人设/用户不搞反"约束："你是{char.name}，对面是{uname}，视角归属绝不能互换，称呼关系必须保持正确"；
  - 无世界设定时明确"基于角色人设、你的记忆与最近聊天自然发挥"。
- **收藏存储**：随机模式 `FanwaiStory.style='random'`，`wordCount` 存 0，`pov` 存 'third'（占位展示）。
- **拾光显示**：`FanwaiApp.tsx` 的 `STYLE_NAMES['random']='随机'`、`STYLE_GRADIENTS['random']` 用中性渐变。

### 3) 边界与兼容
- `saveFanwaiStory`/`deleteFanwaiStory` 改等待 oncomplete 后返回 Promise，调用方兼容：`OSContext.addFanwaiStory` 已 await；软删除里 `DB.deleteFanwaiStory(id).catch(()=>{})` 不 await，改为返回 promise 后仍兼容（结果忽略）。
- 随机模式复用现有 `generateFanwai`，不新增副 API 参数。

## 架构设计
改动集中、低侵入，四个文件：

```mermaid
flowchart LR
    A[FanwaiGeneratePage 随机小字入口] --> B[generateFanwai randomMode=true]
    B --> C[buildFanwaiPrompt randomMode 分支]
    C --> D[副API fetch]
    D --> E[番外正文]
    E --> F[收藏 style='random']
    F --> G[db.saveFanwaiStory 等 oncomplete 落盘]
    G --> H[刷新不丢]
```

## 目录结构
```
project-root/
├── utils/
│   ├── db.ts                     # [MODIFY] saveFanwaiStory / deleteFanwaiStory 改为等待事务 oncomplete 才 resolve
│   └── fanwaiGenerator.ts        # [MODIFY] buildFanwaiPrompt 增加 randomMode 分支（AI 自主决定文风/字数/视角，强化人设用户不搞反）
└── components/
    └── fanwai/
        └── FanwaiGeneratePage.tsx # [MODIFY] 写番外按钮上方加随机入口小字；handleGenerate/handleCollect 支持随机模式（style='random'）
        └── FanwaiApp.tsx          # [MODIFY] STYLE_NAMES / STYLE_GRADIENTS 增加 'random' 映射（中性渐变 + "随机"名称）
```


## Agent Extensions
### SubAgent
- **code-explorer**
  - 用途：在实现随机生成模式前，辅助核对 FanwaiGeneratePage 的 handleGenerate/handleCollect 结构、buildFanwaiPrompt 现有 opts 字段，以及 db.ts 中 saveFanwaiStory/deleteFanwaiStory 的精确行号与调用方（OSContext.addFanwaiStory / deleteFanwaiStory 软删除），确保落盘修复不破坏现有调用。
  - 预期结果：确认全部改动点与调用链，保证 saveFanwaiStory 改为等待 oncomplete 后所有调用方仍兼容，随机模式 style='random' 能正确驱动拾光展示。
