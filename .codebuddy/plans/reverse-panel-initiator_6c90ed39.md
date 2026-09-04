---
name: reverse-panel-initiator
overview: 给「反查手机」面板加「选角色主动查」入口：用户可在反查面板选一个角色，该角色直接弹警示窗→同意后接管真实界面（不拒绝）。同时修复/确认私聊里让角色查手机时角色可拒绝的触发链路，确保用户能在本地开发版完整测试反查手机功能。
todos:
  - id: reverse-panel-launch
    content: 在 ReversePanel 新增「发起」Tab，展示角色列表并接入 onRequestReverse prop（点角色直接触发接管）
    status: completed
  - id: checkphone-wiring
    content: 在 CheckPhone 渲染 ReversePanel 时传入 chars={characters} 和 onRequestReverse 回调
    status: completed
    dependencies:
      - reverse-panel-launch
  - id: expand-intent-regex
    content: 扩宽 reverseTrigger.ts 的 REVERSE_USER_ASK_RE 用户意图正则，并补充 reverseTrigger.test.ts 测试用例
    status: completed
  - id: build-test
    content: 运行 pnpm run build 验证构建，运行 vitest reverseTrigger 测试确认意图识别与既有逻辑正确
    status: completed
    dependencies:
      - reverse-panel-launch
      - checkphone-wiring
      - expand-intent-regex
---

## 需求概述

修复「反查手机」功能在本地开发版测不出真实接管的问题。用户澄清了两点核心诉求：

1. **反查手机面板加「选角色主动查」入口**：目前面板只有「记录 + 权限设置」两个 Tab，用户无法从这里触发真实接管。期望在面板里能选一个角色，选了后该角色**直接接管**（弹警示窗 → 同意后接管真实 SullyOS 界面，角色不拒绝）。

2. **私聊里让角色查手机，角色有权拒绝**：私聊触发保留"角色可拒绝"逻辑（低倾向角色拒绝回话，高倾向角色同意后接管）。但当前私聊触发命中率低，需要扩宽用户意图识别，确保用户说"你查我手机吧"这类话能稳定触发。

两种触发方式并存，反查面板"直接查"、私聊"角色可拒绝"。

## 核心功能
- **面板「发起反查」Tab**：展示角色列表，点角色 → 直接弹警示窗 → 同意后接管真实界面（角色不拒绝）
- **私聊触发优化**：扩宽 `isUserAskingReverse` 意图识别正则，覆盖更多用户表达
- 本地开发版能明确测出真实接管（需用户重启 dev server 加载新代码）


## 技术栈
- React 18 + TypeScript + Vite + pnpm，无新增依赖
- 复用现有接管链路：`sullyos-reverse-request` 事件 → OSContext 监听 → `triggerReverseRequest(char)` → PhoneShell 全局 ReverseAccessModal 警示 → 同意后 `startReverseTakeover` → CheckPhone effect 启动接管自动导航

## 核心架构决策

### 1. ReversePanel 新增「发起反查」Tab
- 在 `components/checkPhone/ReversePanel.tsx` 新增第三个 Tab「发起」（`tab: 'logs' | 'perms' | 'launch'`）
- 新增两个 props：
  - `chars: CharacterProfile[]`（角色列表，供选角色）
  - `onRequestReverse: (char: CharacterProfile) => void`（点角色触发）
- 「发起」Tab 展示角色列表（复用现有深色风格 + 头像 + 卡片），点角色 → 调 `onRequestReverse(char)`
- 复用现有 tab 切换 UI 模式（logs/perms 已有的按钮样式）

### 2. CheckPhone 接线「选角色主动查」
- `apps/CheckPhone.tsx` 渲染 ReversePanel 时传入：
  - `chars={characters}`
  - `onRequestReverse={(c) => triggerReverseRequest(c)}`
- `triggerReverseRequest` 已解构（CheckPhone:261），会弹全局警示窗 → 用户同意 → 接管。这满足"反查里角色就直接查"（弹警示确认后接管，角色不拒绝）
- 复用现有接管链路，不改动核心接管逻辑

### 3. 扩宽私聊用户意图识别
- `utils/checkPhone/reverseTrigger.ts` 的 `REVERSE_USER_ASK_RE` 正则扩宽，覆盖更多用户常用表达：
  - 现有：你查/看/翻/检查手机、让你看看、给你看、手机给你、查我手机、看我的手机
  - 新增：你查一下我手机、你来翻我手机、你随便看、手机你拿去查、你查查我、让你查、我手机给你看、你翻翻我手机 等
- 同步更新 `reverseTrigger.test.ts` 覆盖新表达（新增测试用例）
- 保留角色可拒绝逻辑不变（`roleConsentToReverse`）

### 4. 不改动接管核心链路
- 事件 → 警示 → 接管链路已跑通（OSContext:5083-5093、PhoneShell ReverseAccessModal、CheckPhone effect），不动

## 架构图
```mermaid
flowchart TD
    A[ReversePanel 新增「发起」Tab] --> B[展示角色列表 chars]
    B --> C[点角色 → onRequestReverse(char)]
    C --> D[CheckPhone → triggerReverseRequest(char)]
    D --> E[OSContext → 全局 ReverseAccessModal 警示]
    E -->|同意| F[startReverseTakeover → 接管真实界面]
    E -->|拒绝| G[rejectReverseRequest 意见弹窗]
    H[私聊输入「你查我手机吧」] --> I[isUserAskingReverse 扩宽正则]
    I --> J[roleConsentToReverse 角色意愿]
    J -->|agree| E
    J -->|decline| K[角色本地拒绝语 + 记录]
```

## 目录结构
```
SullyOS-master/
├── components/checkPhone/
│   └── ReversePanel.tsx        # [MODIFY] 新增「发起」Tab + 角色列表 + onRequestReverse prop
├── apps/CheckPhone.tsx         # [MODIFY] 传 chars + onRequestReverse 给 ReversePanel
├── utils/checkPhone/
│   ├── reverseTrigger.ts       # [MODIFY] 扩宽 REVERSE_USER_ASK_RE 用户意图正则
│   └── reverseTrigger.test.ts  # [MODIFY] 补充新意图表达测试用例
```

## 实施注意（执行细节）
- ReversePanel「发起」Tab 用现有深色风格（bg-[#0a0b10] 白字），角色卡片复用 logs 页的圆角卡片样式
- 点角色直接触发 `onRequestReverse(char)`，不弹二次确认（警示窗本身就是确认）
- 扩宽正则时注意避免过度宽松误触发（限定在"手机/聊天/翻查"语境）
- 本地开发版需重启 dev server 或热更新后，才会加载新代码
- 不改动已提交的 backup commit（5140df2），新改动独立可回退


## Agent Extensions
- **code-explorer**
  - Purpose: 已用于定位 ReversePanel 结构、CheckPhone 渲染与 useOS 解构、sullyos-reverse-request 事件链路、reverseTrigger 正则。实施时如确认角色列表样式或 CheckPhone 角色数据来源，复用该 subagent 深入定位。
  - Expected outcome: 精确锁定 ReversePanel「发起」Tab 插入点、CheckPhone onRequestReverse 接线位置，确保与现有接管链路无缝衔接。
