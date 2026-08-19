---
name: 番外生成与拾光收藏App
overview: 实现私聊"番外"功能（打开独立页面，配置文风/字数/人称/世界设定，用副 API 结合角色与用户记忆生成小说式内容），并新建主界面"拾光"App 用于收藏番外作品与转发给角色。
design:
  architecture:
    framework: react
  styleKeywords:
    - 暖色治愈
    - 手帐感
    - 书卷气
    - 圆角卡片
    - 柔和渐变
    - 毛玻璃
    - 微动效
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 20px
      weight: 700
    subheading:
      size: 15px
      weight: 600
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#F0A93B"
      - "#E8845A"
      - "#C96F8A"
    background:
      - "#FDF8F0"
      - "#FFFDF9"
      - "#F6EDE3"
    text:
      - "#4A3F35"
      - "#8A7A6C"
      - "#FFFFFF"
    functional:
      - "#34C77B"
      - "#E8604C"
      - "#5B8DEF"
todos:
  - id: data-layer
    content: 新增 FanwaiStory 类型、IndexedDB store 及 OSContext 收藏状态与方法
    status: pending
  - id: generator
    content: 实现 fanwaiGenerator 副 API 生成与 prompt 拼装
    status: pending
    dependencies:
      - data-layer
  - id: fanwai-page
    content: 开发私聊内全屏番外生成页并绑定 Chat 入口动作
    status: pending
    dependencies:
      - generator
  - id: shiguang-app
    content: 开发拾光 App：书架列表、详情阅读、删除、空状态
    status: pending
    dependencies:
      - data-layer
  - id: forward
    content: 实现拾光转发给角色并跳转私聊
    status: pending
    dependencies:
      - shiguang-app
  - id: register
    content: 注册拾光到主界面（AppID/INSTALLED_APPS/PhoneShell）
    status: pending
    dependencies:
      - shiguang-app
---

## 产品概述
为私聊新增「番外」功能：私聊 + 面板的「番外」按钮（现为占位）点击后打开全屏新页面（非悬浮窗），配置文风、字数、第几人称、世界设定后，用副 API 读取当前角色设定与用户设定记忆，生成小说风格的番外内容；生成后可收藏到主界面新 App「拾光」，并可从「拾光」把番外转发给角色看。独立于「笔友会」，主 API 仅用于聊天。

## 核心功能
- 私聊「番外」入口：将现有占位按钮（🍉 番外）绑定动作，点击打开全屏番外生成页
- 生成设置页：文风（预设选项+自定义）、字数档位、第几人称（第一/第二/第三人称）、世界设定（粘贴文本），设置项本地记住上次选择
- 番外生成：使用副 API（subBaseUrl/subApiKey/subModel）非流式生成；prompt 融合文风/字数/人称/世界设定 + 当前角色人设（persona/systemPrompt/worldview/memories）+ 用户设定（userProfile）；副 API 未配置时提示去设置配置，不回落主 API
- 生成预览与收藏：生成后展示全文，可一键收藏到「拾光」
- 「拾光」App：主界面新应用，书架式列表展示已收藏番外（含所属角色、文风、生成时间），点击进入全文阅读页
- 转发给角色：在「拾光」详情页选择目标角色，将番外作为一条用户消息注入该角色私聊，角色可见并可继续对话；转发后跳转该角色私聊
- 删除与回看：拾光内可删除番外；转发仅复制进聊天，原文保留在拾光

## 技术选型
- 沿用项目现有技术栈：React + TypeScript + Tailwind CSS（项目自建组件体系，不引入新 UI 库）
- 数据持久化：IndexedDB（utils/db.ts 新增 store）+ OSContext 全局状态，与 novels 存储模式一致

## 实施思路
### 生成链路
参照 utils/theaterGenerator.ts 的非流式 OpenAI 兼容调用：POST {subBaseUrl}/chat/completions，body 含 model=subModel、messages=[system+user]，prompt 拼接文风/字数/人称/世界设定 + 角色人设 + 用户设定。副 API 未配置时 toast 提示「请先在设置 → 副 API 配置」，保持主 API 仅用于聊天。

### 入口与页面
- components/chat/ChatInputArea.tsx 番外按钮 onClick 改为 onPanelAction('fanwai')；apps/Chat.tsx 的 onPanelAction switch 新增 case 'fanwai'，setShowPanel('none') 后打开全屏生成页（fixed inset-0 覆盖整屏、顶部返回按钮，视觉上是独立新页面，区别于 ImageGenPanel 的居中悬浮卡片）

### 「拾光」App 注册链路
- types.ts AppID 枚举新增 Fanwai='fanwai'；constants.tsx INSTALLED_APPS 与图标映射新增「拾光」；components/PhoneShell.tsx 的 APP_BY_ID 懒加载表 + renderApp switch 新增 FanwaiApp

### 转发机制
参照 GameApp.handleForwardToChat（DB.saveMessage 注入 user 消息）+ Character.tsx 的 setActiveCharacterId + openApp(AppID.Chat) 模式：拾光选择角色 → DB.saveMessage({charId, role:'user', type:'text', content: 番外全文}) 注入 → setActiveCharacterId(角色) + openApp(AppID.Chat) 跳转，角色读到后由用户继续对话触发回复

## 实施注意
- 副 API 字段已在 types.ts（subBaseUrl/subApiKey/subModel，第 272-275 行）与 Settings 中存在，直接复用，勿新增配置项
- 转发只注入消息、原文保留在拾光；消息 content 存番外全文，type 用 'text'
- 生成页设置用 localStorage 记忆（键 os_fanwai_form_*），提升复用体验
- 新 IndexedDB store 'fanwai_stories' 需在 utils/db.ts createStore 注册，并参照 novels 加入 OSContext 备份导出 store 清单（第 3716-3719 行区域）
- 番外文本可能较长，收藏列表卡片只显示摘要，全文在详情页渲染（保留换行 white-space: pre-wrap）
- 生成请求非流式、单次调用，无需节流；长文可提示生成耗时

## 目录结构
```
project-root/
├── types.ts                        # [MODIFY] AppID 新增 Fanwai='fanwai'；新增 FanwaiStory 接口（id/charId/charName/style/wordCount/pov/worldSetting/content/createdAt）
├── constants.tsx                   # [MODIFY] INSTALLED_APPS 新增「拾光」+ 图标映射
├── utils/
│   └── fanwaiGenerator.ts          # [NEW] 番外生成器：副 API 非流式调用 + prompt 拼装（文风/字数/人称/世界设定/角色/用户）+ 收藏数据读写 helper
├── utils/db.ts                     # [MODIFY] 新增 STORE_FANWAI_STORIES store（keyPath: id）
├── context/OSContext.tsx           # [MODIFY] fanwaiStories 状态 + addFanwaiStory/deleteFanwaiStory 方法 + 备份导出清单
├── components/chat/ChatInputArea.tsx  # [MODIFY] 番外按钮 onClick 绑定 onPanelAction('fanwai')，去掉 aria-disabled
├── components/fanwai/
│   └── FanwaiGeneratePage.tsx      # [NEW] 全屏生成页：文风/字数/人称/世界设定表单 + 生成加载态 + 全文预览 + 收藏按钮
├── apps/Chat.tsx                   # [MODIFY] case 'fanwai' 打开生成页 + 渲染 FanwaiGeneratePage（传副 API 配置、当前角色、userProfile）
├── apps/FanwaiApp.tsx              # [NEW] 拾光 App：书架列表 + 全文详情页 + 转发给角色弹层 + 删除
└── components/PhoneShell.tsx       # [MODIFY] APP_BY_ID + renderApp switch 注册 FanwaiApp
```

## 设计风格
延续 SullyOS 手机壳的现代暖色 OS 风格，圆角卡片、柔和渐变、毛玻璃质感，营造温柔治愈的手帐氛围。

### 番外生成页（私聊内全屏）
- 顶部导航栏：返回箭头 + 标题「番外」+ 暖金主题点缀，营造进入独立页面的感觉
- 设置表单区：文风用横向滑动的预设 chip（温柔治愈/古风/悬疑/日常甜宠/自定义），选中高亮；字数档位（500/1000/2000/5000 字）用分段按钮；人称三选一胶囊；世界设定为大圆角 textarea，浅米色底
- 生成按钮：底部通栏渐变按钮（琥珀→玫瑰），点击进入加载态（旋转光晕 + 「正在为 ta 编织故事…」）
- 预览区：生成结果以书籍排版展示（衬线标题、正文 1.6 行高、首行缩进、white-space: pre-wrap），底部「收藏到拾光」渐变按钮

### 拾光 App
- 书架式网格：每张卡片为迷你书封面（渐变底色 + 书名/角色名/文风标签），点击进入详情
- 详情页：书名式大标题 + 元信息行（角色 · 文风 · 字数 · 日期）+ 全文阅读（纸张质感背景）+ 底部操作栏（转发给角色 / 删除）
- 转发弹层：角色列表（头像+名字+简介），点击确认转发后 toast 反馈并跳转私聊
- 空状态：暖色插画风提示「还没有收藏的番外，去私聊生成一篇吧」

### 视觉基调
暖金（琥珀）为主色，米白/暖灰为底，玫瑰/莓果色点缀，整体温柔、治愈、有手帐感；动效以淡入、上滑、卡片按压缩放为主，轻量不打扰。

## Agent Extensions
### Skill
- **frontend-design**
  - Purpose: 为番外生成页与拾光 App 提供视觉设计指导，确保暖色治愈风格不落俗套
  - Expected outcome: 生成符合用户预期的差异化视觉方案（配色、排版、组件细节）
- **code-explorer**（SubAgent）
  - Purpose: 实施前辅助确认 Chat.tsx 渲染区插入点、OSContext 备份清单格式等细节
  - Expected outcome: 精确定位各文件修改点，避免计划落地时的遗漏与返工
