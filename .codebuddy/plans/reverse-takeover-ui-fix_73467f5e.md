---
name: reverse-takeover-ui-fix
overview: 修复反查手机接管的三个问题：(1) 顶部控制条改为悬浮有呼吸感的横条；(2) 修复接管自动导航不工作（角色不滑动、屏幕不变）；(3) 修复结束不生成记忆卡片。并新增「接管时模拟滑动滚屏」效果——既自动切 App，又在 App 内部模拟手指滚屏。
design:
  architecture:
    framework: react
    component: mui
  styleKeywords:
    - 玻璃拟态
    - 呼吸光晕
    - 悬浮胶囊
    - 深色监视感
    - 微动效
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 13px
      weight: 600
    subheading:
      size: 12px
      weight: 500
    body:
      size: 12px
      weight: 400
  colorSystem:
    primary:
      - "#F43F5E"
      - "#9F1239"
      - "#0F172A"
    background:
      - "#0F172A"
      - rgba(15,23,42,0.8)
    text:
      - "#FFFFFF"
      - "#F1F5F9"
      - rgba(255,255,255,0.6)
    functional:
      - "#F59E0B"
      - "#10B981"
      - "#E11D48"
todos:
  - id: runner-module
    content: 用 [subagent:code-explorer] 确认 openApp 来源、PhoneShell runner 挂载点、CheckPhone 卸载时机、各 App 可滚动容器 class 特征
    status: completed
  - id: reverse-runner-ts
    content: 新建 utils/checkPhone/reverseTakeoverRunner.ts：模块级状态机（plan/idx/timer/logItemsRef/charId守卫/finalized）+ startTakeoverRunner/stopTakeoverRunner/finalizeRunner + simulateScrollInApp 滚动模拟
    status: completed
    dependencies:
      - runner-module
  - id: overlay-redesign
    content: 重构 components/checkPhone/ReverseOverlay.tsx 为顶部居中悬浮椭圆胶囊 + 呼吸动画 + 极简内容 + 顶部安全区避让
    status: completed
  - id: checkphone-handoff
    content: 改 apps/CheckPhone.tsx：移除内部 reverseChar/reversePlanIdx/reversePlanRef/reverseTimerRef 状态机 state 和接管导航 effect，改为监听 reverseTakeover.active 调 startTakeoverRunner
    status: completed
    dependencies:
      - reverse-runner-ts
  - id: phoneshell-wiring
    content: 改 components/PhoneShell.tsx：ReverseOverlay onClose 改调 stopTakeoverRunner({interrupted:true})，确保 finalize 跑完再 stopReverseTakeover；接入 runner 所需依赖
    status: completed
    dependencies:
      - reverse-runner-ts
      - checkphone-handoff
  - id: build-verify
    content: 运行 pnpm run build 验证构建；检查 reverseTakeoverRunner/ReverseOverlay/CheckPhone/PhoneShell 无 lint 错误
    status: completed
    dependencies:
      - overlay-redesign
      - checkphone-handoff
      - phoneshell-wiring
---

## 需求概述

修复反查手机「面板发起」功能在本地开发版的三个问题，并增强接管体验：

1. **顶部控制条太靠顶端**：贴在"New Character"标题栏下、遮住状态栏。需要改为**顶部居中悬浮的、有呼吸感的、横着的椭圆形长条**，不占满顶部一整条。

2. **接管了但屏幕没变化**：控制条出现，但真实界面不动（角色不滑动、不自动切换 App）。这是纯代码 bug，与电脑/手机设备无关。

3. **手动点结束没生成记忆**：点"关闭"后没有生成总结卡片进私聊、记忆宫殿无节点、反查记录无新增。

用户多选确认的接管效果：**两者都要** —— 既自动切换 App（openApp 到聊天/相册/朋友圈等），又能在 App 内部**模拟手指滑动滚屏**（像真人在滑手机）。

## 核心功能

- **UI 重构**：ReverseOverlay 改为顶部居中悬浮椭圆胶囊 + 呼吸动画 + 顶部安全区避让。
- **修复接管不动**：把接管状态机从 CheckPhone 组件内拆到模块级 runner，解决 openApp 切 App 导致 CheckPhone 卸载、接管中断的 bug。
- **修复结束不生成记忆**：接管停止时（无论自然结束还是用户点关闭）统一由 runner 收尾，写反查记录 + 记忆节点 + 总结卡片。
- **新增 App 内滚动模拟**：接管某个 App 期间，对该 App 的可滚动容器分段平滑滚动（顶部→中间→底部），营造"角色在滑手机"的效果。

## 边界

- 不动已提交的两个 backup commit（反查基础 / 概率主动触发）。
- 不改 triggerReverseRequest / 接管核心链路逻辑。
- 不改权限 / 记录 / 记忆 API 接口。
- 不改 Chat.tsx 的私聊触发。
- 不动 CheckPhone 里的「反查手机面板」三个 Tab。
- 状态机迁移到模块级后，浏览器刷新页面会丢失接管状态（可接受，接管本就短时）。


## 技术栈

- React 18 + TypeScript + Vite + pnpm，无新增依赖
- 复用现有接管链路：`triggerReverseRequest` → PhoneShell 全局 ReverseAccessModal → `startReverseTakeover` → 接管 runner
- 复用 `reverseTakeover.active` 作为接管进行中的全局信号
- 复用 `openApp`（来自 useOS）、`buildBrowsePlan`（reverseTakeover.ts）、`appendReverseLog`/`writeReverseMemoryNodes`/`createReverseSummaryMessage`（reverseLogs.ts）

## 核心架构决策

### 1. 状态机拆到模块级 runner（修复"屏幕不动"根因）

**根因**：接管状态机在 CheckPhone 组件内（React state `reverseChar`/`reversePlanIdx` + refs）。接管时 `beginReverseTakeover` 调 `openApp` 切到其他 App → PhoneShell 切换渲染 → **CheckPhone 被卸载** → 内部接管 effect 的 cleanup 清掉 setTimeout → 后续 plan 步骤不执行，屏幕停住。

**修复**：新建 `utils/checkPhone/reverseTakeoverRunner.ts`，把状态机放到**模块级**（普通 JS 变量 + setTimeout，不依赖 React 生命周期）：
- 模块级 state：`plan`、`idx`、`timerId`、`logItemsRef`、`charId` 守卫、`finalized` 标记、`paused` 标记
- `startTakeoverRunner(char, openApp, deps)`：生成计划 → 逐步 openApp → 每步停留 durationMs 后推进 → 每步触发滚动模拟 → 计划走完调 finalize
- `stopTakeoverRunner({ interrupted })`：清理 timer + 按需 finalize + 回调 `deps.onFinished`（调 stopReverseTakeover）
- `finalizeRunner()`：用模块级 logItemsRef 统一写记录 + 记忆 + 总结
- charId 守卫防多角色冲突；重复启动同角色先清理旧的

这样无论 CheckPhone 是否在前台，状态机都在模块里跑，openApp 切换 App 不会打断接管。

### 2. 修复"点结束不生成记忆"

**根因**：PhoneShell ReverseOverlay 的 `onClose` 当前是 `onClose={stopReverseTakeover}`，只 setActive=false，不触发 finalizeReverse。

**修复**：PhoneShell 的 onClose 改为调 `stopTakeoverRunner({ interrupted: true })`。runner 内部：
- logItemsRef 有浏览明细 → finalize 写记录/记忆/总结
- 无明细 → 也写一条"想看但被打断/什么也没看到"记录（避免用户白等）
- 自然结束（计划走完）→ runner 内部 finalize 后回调 stopReverseTakeover

### 3. 新增"App 内模拟滑动滚屏"

- 新增 `simulateScrollInApp()`（在 runner 内或独立 util）：接管某个 App 期间，找到该 App 的可滚动容器（`.sully-shell-content` 内 `overflow-y-auto`/`no-scrollbar`），用 `setInterval`/`requestAnimationFrame` 分段 `scrollTo({ top, behavior: 'smooth' })`（顶部→中间→底部→回顶部循环），营造手指滚动效果。
- 暂停时停止滚动；恢复继续。
- 纯原生 scrollTo 平滑滚动，不引入额外库；不改各 App 内部结构（通过 DOM 查询滚动容器）。

### 4. ReverseOverlay UI 重构（悬浮椭圆 + 呼吸）

- 容器从 `fixed top-0 left-0 right-0` 改为 `fixed top-3 left-1/2 -translate-x-1/2 z-[80]`（顶部居中悬浮，12px 安全区避让状态栏/标题栏）。
- `rounded-full` 椭圆胶囊 + `bg-slate-900/80 backdrop-blur-xl border border-rose-500/30` + `px-4 py-2` + 红晕阴影。
- 呼吸动画：自定义 keyframes `reverseTakeoverPulse`（2s ease-in-out infinite，控制 box-shadow 红色光晕 + 微小 scale 1→1.03 呼吸）。
- 内容极简化：左红圆点（脉冲）+ 中间文字（"TA 在看你手机"/暂停态）+ 右暂停/继续 + 右关闭；不显示当前 App 名。
- 手机安全区适配：用 `env(safe-area-inset-top)`，不可用则 fallback `top-3`。

## 架构图

```mermaid
flowchart TD
    A[PhoneShell 全局 ReverseAccessModal 同意] --> B[startReverseTakeover 设置 active]
    B --> C[CheckPhone effect 监听 reverseTakeover.active]
    C --> D[startTakeoverRunner char openApp deps]
    D --> E[模块级状态机 plan/idx/timer]
    E -->|逐步| F[openApp 切真实 App]
    F --> G[simulateScrollInApp 模拟滚屏]
    E -->|计划走完| H[finalizeRunner 写记录+记忆+总结]
    D -.-> I[stopTakeoverRunner 关闭/中断]
    I -->|logItemsRef 有明细| H
    I -->|无明细| J[写"想看但被打断"记录]
    H --> K[回调 stopReverseTakeover 清 active]
    J --> K
```

## 目录结构

```
SullyOS-master/
├── utils/checkPhone/
│   ├── reverseTakeoverRunner.ts        # [NEW] 模块级接管状态机：start/stop/finalize + 滚动模拟
│   └── reverseTakeover.ts              # [MODIFY] 复用 buildBrowsePlan（如需补充滚动容器工具函数）
├── components/checkPhone/
│   └── ReverseOverlay.tsx              # [MODIFY] 改为悬浮椭圆胶囊 + 呼吸动画 + 极简内容
├── apps/CheckPhone.tsx                 # [MODIFY] 移除内部状态机 state/effect，改为调 startTakeoverRunner
├── context/OSContext.tsx               # [MODIFY] 暴露 startTakeoverRunner 所需依赖（如需要），或由 PhoneShell 接线
└── components/PhoneShell.tsx           # [MODIFY] ReverseOverlay onClose 改调 stopTakeoverRunner，接入 runner 启动/停止
```

## 实施注意

- `openApp` 来自 useOS，模块级 runner 需接受 openApp 作为参数（从 PhoneShell 或 CheckPhone 传入）。
- 接管 runner 用 charId 作为 key，防多角色冲突；重复启动同角色先清理旧的。
- 模块级 setTimeout 在组件卸载时仍会跑，runner 需自跟踪 timerId 并提供 stop。
- 滚动模拟用原生 scrollTo 平滑滚动，兼容 `overflow-y-auto`/`no-scrollbar` 容器，不改各 App 内部结构。
- 浏览器刷新页面时模块 state 丢失，反查被中断（可接受）。
- 先提交一个备份点（commit message 以 backup: 开头），保证可回退；慢慢来，每阶段验证。


## 设计风格
接管控制条重构为顶部居中的**悬浮椭圆胶囊**，采用深色毛玻璃（glassmorphism）+ 红色呼吸光晕的"正在监视/偷看"氛围，与反查手机的红色预警主题一致。
## 布局
- 容器固定顶部居中悬浮（top-3，左侧 50% + translateX(-50%)），与状态栏/标题栏留出 12px 安全区，不遮挡。
- 胶囊本体：`rounded-full` 椭圆、`px-4 py-2`、`bg-slate-900/80 backdrop-blur-xl border border-rose-500/30`。
- 内容一行排列：左侧红色脉冲圆点 → 中间文字 → 右侧暂停/继续 + 关闭两个小圆钮。
## 呼吸动画
自定义 keyframes `reverseTakeoverPulse`（2s ease-in-out infinite）：box-shadow 红色光晕在 0/100% 柔和、50% 增强，并叠加微小 scale(1→1.03) 呼吸，营造"活着的监视感"。
## 交互
- 暂停/继续按钮：amber 色暂停、emerald 色继续。
- 关闭按钮：rose 红色，点击后 runner 收尾写记录+记忆+总结。
- hover 时胶囊轻微提亮/阴影增强，点击按钮有 scale 反馈。
## 移动端适配
顶部 inset 用 `env(safe-area-inset-top)`，不可用时 fallback `top-3`；胶囊宽度自适应（max-w 限制），内容可省略号截断。

## Agent Extensions

### SubAgent
- **code-explorer**
  - Purpose: 实施前精确确认 openApp 来源（useOS 暴露方式）、PhoneShell 挂载 runner 的位置、CheckPhone 卸载时机、以及各 App 可滚动容器的 class 特征（`.sully-shell-content` 内 overflow-y-auto/no-scrollbar），确保模块级 runner 和滚动模拟的最小侵入接入点准确。
  - Expected outcome: 给出精确文件:行号、函数签名、可直接复用的 openApp 引用方式、可滚动容器选择器，让 runner 设计与现有接线无缝衔接、不破坏现有结构。
