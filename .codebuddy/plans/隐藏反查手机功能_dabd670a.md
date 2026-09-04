---
name: 隐藏反查手机功能
overview: 用注释法隐藏反查手机功能：注释掉 5 处用户可见/可触发的入口（对话自动触发、默认桌面图标、手游皮肤、乙女皮肤、Companion HUD），使反查手机从桌面上消失、角色对话也不再触发反查弹窗。代码结构不做重构（模块化以后单独做）。
todos:
  - id: hide-reverse-entries
    content: 注释 5 处核心入口：applyAssistantPostProcessing:552 对话触发、constants:96 桌面、MobileGameHome:130、OtomeCompanionChrome:34、CompanionHome:2332（隐藏反查手机全部入口）
    status: completed
  - id: hide-defensive
    content: 注释防御入口：OSContext:5118-5128 事件监听 + PersonaSimIndicator:16 点击入口，防漏网触发
    status: completed
    dependencies:
      - hide-reverse-entries
  - id: verify-hide
    content: 跑 lint + tsc（过滤改动文件）+ 反查手机测试，确认无新增错误、测试仍通过
    status: completed
    dependencies:
      - hide-defensive
  - id: commit-hide
    content: 单独提交反查隐藏改动，不混入 Message 3 个未提交文件（types.ts/Appearance.tsx/ChatList.tsx）
    status: completed
    dependencies:
      - verify-hide
---

## 需求概述
用户希望**暂时隐藏反查手机功能**（功能还没完全做完，不想上线暴露）。已确认采用**注释法**隐藏（与代码库既有注释隐藏惯例一致），本次**只隐藏、不重构模块化**（"每次功能单独划分区域"以后单独做）。

## 核心功能
- 隐藏反查手机的所有对外可见/可触发入口，让用户完全看不到、角色对话也不再触发反查
- 保留反查相关代码文件（apps/CheckPhone.tsx、utils/checkPhone/*、components/checkPhone/*）不动，仅注释入口
- 确保反查状态的弹窗/接管/胶囊组件（依赖 reverseTakeover.active / reverseRequest）因状态永不触发而自动隐藏

## 隐藏目标
1. 角色对话不再触发反查弹窗
2. 各皮肤桌面（默认/手游/乙女/Companion）都没有反查入口
3. 用户无法从任何入口打开反查手机

## 技术栈
沿用现有代码库（React + TypeScript + Tailwind）的注释隐藏惯例，不引入新依赖、不重构结构。

## 实现方案
基于 code-explorer 全量调研，反查手机有 5 处核心对外入口 + 2 处防御入口。采用注释法逐一关闭，让反查状态永不触发、自动隐藏所有相关 Overlay 组件。

### 关键决策
- **根治点**：注释 `applyAssistantPostProcessing.ts:552` 的 `tryReverseCheckFromReply(...)` 调用。这是"对话不触发反查"的根本——切断后 `sullyos-reverse-request` 事件永不派发，`reverseTakeover`/`reverseRequest` 状态永不 set，PhoneShell 的所有反查 Overlay（ReverseOverlay/ReverseDanmaku/ReverseAccessModal/ReverseRejectPopup）自动 return null。
- **各皮肤入口**：默认桌面（constants.tsx:96）、手游（MobileGameHome:130）、乙女（OtomeCompanionChrome:34）、Companion HUD（CompanionHome:2332）4 处注释/移除，让各皮肤均无入口。
- **防御纵深**（可选）：注释 OSContext:5118-5128 事件监听 + PersonaSimIndicator:16 点击入口，防漏网。

### 性能与可靠性
- 纯注释/移除入口，无新增逻辑、无性能影响
- 反查相关文件保留，日后改回注释即可恢复，可回退
- 注意 `tryReverseCheckFromReply` 注释调用后可能触发 unused 警告——保留函数定义（含调用点注释时，若 lint 报 unused 则同样注释函数体顶部 return 兜底，不删除 import）

### 验证
- lint 无新增错误（若 `tryReverseCheckFromReply` unused 警告，注释函数体兜底 return 而非删函数）
- tsc 过滤改动文件无新增错误
- 反查手机测试应仍通过（测试不依赖入口）
- 提交时**不混入**工作区已有的 Message 3 个未提交文件（types.ts/Appearance.tsx/ChatList.tsx）

## 目录结构（改动文件）
```
utils/applyAssistantPostProcessing.ts   # [MODIFY] 注释 :552 tryReverseCheckFromReply 调用（根治对话不触发）
constants.tsx                           # [MODIFY] 注释 :96 AppID.CheckPhone 桌面注册（移除默认桌面图标）
components/os/MobileGameHome.tsx        # [MODIFY] 移除 :130 GRID_CARDS 里的 CheckPhone 卡片（手游皮肤）
components/os/OtomeCompanionChrome.tsx  # [MODIFY] 移除 :34 顶部 CheckPhone 书签（乙女皮肤）
components/os/CompanionHome.tsx         # [MODIFY] 注释 :2332 HUD「当前心声」按钮 onClick openApp(CheckPhone)
context/OSContext.tsx                   # [MODIFY][可选] 注释 :5118-5128 sullyos-reverse-request 事件监听（防御纵深）
components/os/PersonaSimIndicator.tsx   # [MODIFY][可选] :16 点击不再 openApp(CheckPhone)
```

## Agent 扩展
### SubAgent
- **code-explorer**
  - Purpose: 已完成反查手机 5 处核心入口 + 2 处防御入口的全量定位（constants.tsx、applyAssistantPostProcessing.ts、各皮肤组件、OSContext 事件监听、PersonaSimIndicator），产出精确行号和最小改动集
  - Expected outcome: 为隐藏方案提供准确的文件路径/行号依据，避免遗漏入口或误改无关代码
