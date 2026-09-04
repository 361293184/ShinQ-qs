---
name: reverse-takeover-ui-fix
overview: 修复反查手机接管的两个问题：(1) 顶部控制条改为悬浮的、有呼吸感的、椭圆形长条（不占满顶部）；(2) 修复接管自动导航不工作的 bug——角色不滑动、屏幕不变、点结束不生成记忆卡片。
todos:
  - id: runner-module
    content: "[subagent:code-explorer] 探查 openApp 来源、CheckPhone 卸载时机与 effect cleanup、finalizeReverse/cancelReverse 现有实现，给出模块级 runner 的最小侵入接入点"
    status: pending
  - id: reverse-runner-ts
    content: 新建 utils/checkPhone/reverseTakeoverRunner.ts：模块级状态机（plan/idx/timer/logItemsRef）+ startTakeoverRunner(char, openApp, deps) + stopTakeoverRunner(opts) + finalizeRunner() 统一写记录/记忆/总结
    status: pending
    dependencies:
      - runner-module
  - id: overlay-redesign
    content: 重构 components/checkPhone/ReverseOverlay.tsx 为悬浮椭圆胶囊 + 呼吸动画 + 极简内容（不显示 App 名）+ 顶部安全区避让
    status: pending
  - id: checkphone-handoff
    content: 改 apps/CheckPhone.tsx：移除内部 reverseChar/reversePlanIdx/reversePlanRef 等状态机 state 和接管导航 effect，改为 effect 调 startTakeoverRunner(char, openApp, { finalize, addToast, characters, stopReverseTakeover, reloadLogs, setView })
    status: pending
    dependencies:
      - reverse-runner-ts
  - id: phoneshell-wiring
    content: "改 components/PhoneShell.tsx：ReverseOverlay onClose 调 stopTakeoverRunner({ interrupted: true }) 而非直接 stopReverseTakeover；确保 finalize 跑完再 stopReverseTakeover"
    status: pending
    dependencies:
      - reverse-runner-ts
      - checkphone-handoff
  - id: build-verify
    content: pnpm run build 验证通过；检查 reverseTakeoverRunner/ReverseOverlay/CheckPhone/PhoneShell 无 lint 错误
    status: pending
    dependencies:
      - overlay-redesign
      - checkphone-handoff
      - phoneshell-wiring
---

## 需求概述
用户测试反查手机「面板发起」功能后反馈三个问题：

1. **顶部控制条太靠顶端**（贴在"New Character"标题栏下，遮住状态栏）→ 需要改为**悬浮的、有呼吸感的、横着的椭圆形长条**，不占满顶部一整条。
2. **接管了但屏幕没变化**：控制条出现但真实界面没动（自动浏览/滑动没效果）。
3. **手动点结束没生成记忆卡片**：点"关闭"按钮后没生成总结卡片进私聊、记忆宫殿无节点、反查记录无新增。

## 核心功能
- **UI 重构**：ReverseOverlay 从「占满顶部一整条」改为「顶部居中悬浮椭圆胶囊 + 呼吸动画 + 安全区避让」。
- **修复接管自动导航**：控制条出现但屏幕不动的根因排查与修复，确保计划能真正 openApp 切到各个有权限的 App。
- **修复结束未生成记忆**：接管停止时（无论自然结束还是用户点关闭）自动触发 `finalizeReverse`，写反查记录 + 记忆节点 + 总结卡片。

## 边界
- 不动已提交的两个 backup commit（5140df2 反查基础 / 8bf2dfb 概率主动触发）。
- 不改 triggerReverseRequest / 接管核心链路逻辑（triggerReverseRequest → setActiveApp(CheckPhone) → 警示 → startReverseTakeover）。
- 不改权限 / 记录 / 记忆 API 接口。
- 不改 Chat.tsx 的私聊触发（用户没反映私聊问题）。
- 不动 CheckPhone 里的「反查手机面板」三个 Tab。

## 技术栈
- React 18 + TypeScript + Vite + pnpm，无新增依赖
- 复用现有接管链路：`triggerReverseRequest` → PhoneShell 全局 ReverseAccessModal → `startReverseTakeover` → CheckPhone effect 监听接管 → `beginReverseTakeover` 自动导航
- 复用 `reverseTakeover.active` 作为接管进行中的全局信号
- 复用 `finalizeReverse`（已有，写记录/记忆/总结）+ `cancelReverse`（已有，清理状态）

## 关键修改

### 1. ReverseOverlay UI 重构（悬浮椭圆 + 呼吸）
**文件**：`components/checkPhone/ReverseOverlay.tsx`

容器从 `fixed top-0 left-0 right-0 z-[80]` 改为 `fixed top-3 left-1/2 -translate-x-1/2 z-[80]`（顶部居中悬浮），留 12px 安全区避让状态栏/标题栏。

外层：圆角 `rounded-full`（椭圆胶囊）、`bg-slate-900/80 backdrop-blur-xl border border-rose-500/30`、内边距 `px-4 py-2`、阴影 `shadow-[0_8px_30px_rgba(239,68,68,0.35)]`。
呼吸动画：包裹层加自定义 keyframes `reverseTakeoverPulse`（2s ease-in-out infinite，控制 `box-shadow` 红色光晕 + 微小 `scale(1 → 1.03)` 呼吸），实现"有呼吸感"。
内容极简化：左红圆点（脉冲）+ 中间文字（"TA 在看你手机" 或暂停态文字）+ 右暂停/继续 + 右关闭按钮；不显示当前 App 名（避免冗长）。
手机安全区适配：用 `env(safe-area-inset-top)` 顶部 inset（如果不可用就 fallback top-3）。

### 2. 修复接管自动导航不工作
**根因**（code-explorer / 推测）：`beginReverseTakeover` 内的 `openApp(step.appId)` 在 CheckPhone 里调用，但 CheckPhone 的渲染由 `PhoneShell` 的 `renderApp()` 根据 `activeApp` 切换。当 `triggerReverseRequest` 已 setActiveApp(CheckPhone) 后，CheckPhone 渲染中；当 `beginReverseTakeover` 调 `openApp(Chat)` 时，PhoneShell 切到 Chat，**CheckPhone 被卸载**，它内部的接管导航 effect 跟着 cleanup（清理 setTimeout），导致后续 plan 步骤不执行。
**修复**：
- 把接管自动导航的**状态机**和**执行**拆离 CheckPhone，放到 OSContext 或一个独立的全局模块（不被 activeApp 卸载）
- 新建 `utils/checkPhone/reverseTakeoverRunner.ts`：模块级 state（plan、idx、timer、logItemsRef），导出 `startTakeoverRunner(char)` 和 `stopTakeoverRunner()`。`startTakeoverRunner` 负责生成计划 + 按步骤 openApp + 计时推进 + 计划走完调 finalize。
- CheckPhone 的 effect 改为只调 `startTakeoverRunner(char)`，不再自己管状态机。
- OSContext 的 `stopReverseTakeover` 或 PhoneShell 的 onClose 调 `stopTakeoverRunner()` 清理。
- 这样无论 CheckPhone 是否在前台，状态机都在模块里跑，openApp 切换 App 不会打断它。
- 记忆 / 记录 / 总结写入用模块级 `logItemsRef`，finalize 时统一写。

### 3. 修复"点结束不生成记忆"
**根因**：PhoneShell ReverseOverlay 的 `onClose` 当前只调 `stopReverseTakeover`（只 setActive=false），CheckPhone 的 effect 只在 active 变 true 时启动接管，没在 active 变 false 时调 finalizeReverse。
**修复**：
- 在模块级 `reverseTakeoverRunner` 里跟踪"是否已 finalize"标记。
- `stopTakeoverRunner()` 检测：如果有浏览明细（logItemsRef 非空）就调 finalize 写记录/记忆/总结；如果为空也写一条"想看但被打断"或"想看但什么也没看到"记录（避免用户白等）。
- PhoneShell ReverseOverlay 的 onClose 改为调 `stopTakeoverRunner()` 而非直接 `stopReverseTakeover`；runner 内部按需 finalize 后再 `stopReverseTakeover`。
- 自然结束（计划走完）路径：runner 内部 finalize 完成后自动 stopReverseTakeover（保留现有）。

### 4. 验证
- pnpm run build 通过
- 本地 dev server 重启后：面板"发起" → 选角色 → 警示 → 同意 → 看到悬浮椭圆控制条（呼吸感） + 真实界面在动（自动切到 Chat 等 App）
- 等计划走完或点关闭 → 私聊收到总结卡片 + 记忆宫殿有节点 + 反查记录多一条
- vitest 不需新增（UI 改动 + 状态机迁移不易单测；通过构建 + 手动验证）

## 实施注意
- `openApp` 来自 useOS / OSContext；模块级 runner 需接受 openApp 作为参数或从全局拿（OSContext 已暴露在 PhoneShell 树里，可在 PhoneShell 启动 runner 时传入）
- 模块级状态在多个角色同时被触发时可能冲突（但实际反查一次只有一个角色，加 charId 守卫）
- 接管 runner 用 `charId` 作为 key，重复启动同角色先清理旧的
- 浏览器刷新页面时模块 state 丢失，反查会被中断（可接受；接管本就短时）
- 模块级 setTimeout 在组件卸载时仍跑，需要 runner 自己跟踪 timerId 并提供 stop

## Agent Extensions
### SubAgent
- **code-explorer**
  - Purpose: 在实施前快速定位 CheckPhone 接管 effect、`beginReverseTakeover`、`finalizeReverse`、PhoneShell onClose 接线、openApp 来源（useOS 解构）、以及现有 useEffect cleanup 行为，确认状态机迁移到模块级的最小侵入点和参数需求。
  - Expected outcome: 给出精确文件:行号、函数签名、可直接复用的 openApp 引用方式，让模块级 runner 设计不破坏现有接线。
