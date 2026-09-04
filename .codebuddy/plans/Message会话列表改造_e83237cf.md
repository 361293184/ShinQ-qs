---
name: Message会话列表改造
overview: 在 SullyOS 的 Message App（apps/Chat.tsx）落地「先会话列表、再进对话框」的两级导航：新增 components/chat/ChatList.tsx，Chat.tsx 加 view 状态与列表分支，OSContext.tsx 加 chatDeepLink 标志供通知/主动消息直达对话框，并修复文档未覆盖的 clearUnread 误清与登场动画误播两个副作用。
design:
  architecture:
    framework: react
  styleKeywords:
    - Glassmorphism
    - 半透明白底
    - 细分割线
    - 红色未读角标
    - 微交互按压反馈
    - 极简留白
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 17px
      weight: 600
    subheading:
      size: 15px
      weight: 600
    body:
      size: 13px
      weight: 400
  colorSystem:
    primary:
      - "#22C55E"
      - "#16A34A"
    background:
      - "#FFFFFF"
      - "#F8FAFC"
    text:
      - "#0F172A"
      - "#64748B"
      - "#94A3B8"
    functional:
      - "#EF4444"
      - "#DC2626"
      - "#E2E8F0"
todos:
  - id: backup-commit
    content: "打 backup: 备份 commit（含当前 16 个未提交改动），确保可回退"
    status: completed
  - id: create-chatlist
    content: 用 [skill:frontend-design] 与 [subagent:code-explorer] 新建 components/chat/ChatList.tsx 会话列表页
    status: completed
    dependencies:
      - backup-commit
  - id: context-deeplink
    content: 在 OSContext.tsx 加 chatDeepLinkCharId 与 consumeChatDeepLink，并在通知、主动消息两处打标志
    status: completed
    dependencies:
      - backup-commit
  - id: chat-view-switch
    content: 改造 Chat.tsx：加 view 状态、消费 deep link、返回键回列表、插入列表分支
    status: completed
    dependencies:
      - context-deeplink
  - id: fix-side-effects
    content: 修复副作用：clearUnread 与 showEntry 加 view==='chat' 守卫，新增独立清未读 effect
    status: completed
    dependencies:
      - chat-view-switch
  - id: verify
    content: 用 [skill:vercel-react-best-practices] 审查性能，跑 pnpm vitest run 与类型检查并逐条走验收清单
    status: completed
    dependencies:
      - create-chatlist
      - fix-side-effects
---


## 产品概述
改造 SullyOS 桌面「Message」App（`AppID.Chat` / `apps/Chat.tsx`）的进入路径：从"打开即进入上次联系人的私聊"改为"先展示联系人/会话列表，点选后再进入私聊"。

## 核心功能
1. **会话列表页**：桌面点 Message 先看到联系人列表，每行显示头像、名字、最后一条消息预览、时间、未读角标。
2. **两级导航**：点选联系人进入该角色私聊；私聊页顶部返回键（←）回到列表；列表页返回键关闭 Message 回桌面。
3. **排序与未读**：有未读的会话排最前，其余按最近消息时间倒序，从未聊过的角色垫底；未读角标 >99 显示 99+。
4. **外部唤起直达**：点击系统通知、角色主动消息进来时，直接落到对应角色的私聊页（跳过列表）；此时返回键仍先回列表，再返回才关 App，语义统一。
5. **实时刷新**：停留在列表页时收到新消息，预览、时间、排序、未读角标自动更新。
6. **空状态**：无联系人时提示「还没有联系人，去『神经链接』新建一个角色吧」。

## 范围边界
- 不做群聊会话（群聊是独立 App）；不改私聊页内部任何功能；不做角色分组筛选。
- 私聊页内的「切换会话」面板保留不动。
- 视觉：列表页顶栏「Message」标题居中，返回键固定左侧，半透明白底玻璃拟态，与聊天界面风格一致。



## 技术栈
沿用现有项目栈：React 18 + TypeScript + Tailwind CSS，图标 `@phosphor-icons/react`，状态走现有 `OSContext`（`useOS()`），消息数据走 IndexedDB 封装 `utils/db.ts`。新增组件不引入任何新依赖、不使用 mui/shadcn/tdesign（本项目为自研 Tailwind 组件体系）。

## 实现思路
用**组件内视图状态** `view: 'list' | 'chat'` 做两级导航，配合 `OSContext` 新增的**一次性 deep link 标志**区分"用户普通打开"和"外部指定角色唤起"。列表页作为独立组件 `ChatList.tsx`，从 `DB.getRecentMessagesWithCount(c.id, 1)` 异步取各角色最近一条消息做预览，靠 `lastMsgTimestamp` 驱动刷新。

关键点：`PhoneShell.tsx:861` 是 `case AppID.Chat: return <Chat />;`（**实测无 `key={activeApp}`，与文档 5.3 描述不符**），切走 App 时 Chat 卸载、再进入重新挂载，所以 `view` 状态天然不跨次保留，每次打开 Message 都回列表，符合预期；deep link 标志在 mount 时读取一次即可，但需**额外加 effect 兜底**"Chat 已挂载时又来了一次通知点击"的场景。

## 已核实的代码位置（文档行号有偏移，以下为实测）
| 目标 | 实测位置 |
|---|---|
| `useOS()` 解构（已含 `unreadMessages`/`lastMsgTimestamp`/`clearUnread`） | `apps/Chat.tsx:94` |
| `char` 定义（有 fallback，无 early return） | `apps/Chat.tsx:240` |
| 挂载加载 effect（含 `clearUnread(char.id)`） | `apps/Chat.tsx:~840-857`（856 行） |
| 登场动画开关 `if (activeCharacterId) setShowEntry(true)` | `apps/Chat.tsx:898-900` |
| 新消息重载 + 清未读 effect | `apps/Chat.tsx:992-998` |
| 主 `return (`（所有 hooks 之后） | `apps/Chat.tsx:3375` |
| `CharacterEntryTransition` 渲染 | `apps/Chat.tsx:3388-3395` |
| 坏 CSS 守护样式（`sully-chat-back`） | `apps/Chat.tsx:3407-3413` |
| `<ChatHeader ... onClose={closeApp}>` | `apps/Chat.tsx:3703` |
| `setActiveCharacterId` interface 声明 / state / value 导出 | `context/OSContext.tsx:305 / 903 / 5257` |
| 通知 `notif.onclick` 唤起 | `context/OSContext.tsx:1881-1885` |
| 主动消息 `openHandler` 唤起 | `context/OSContext.tsx:2007-2012` |
| `DB.getRecentMessagesWithCount` | `utils/db.ts:742`（已存在，直接复用） |
| `ChatHeaderShell` 返回键（`useCenteredLayout` 分支 / 默认分支共用同一 `onClose` prop） | `components/chat/ChatHeaderShell.tsx:418 / 443` |

**重要发现**：全仓库只有上述 2 处 `setActiveApp(AppID.Chat)` 真正打开 Message（番外/日程/日期/桌面皮肤均无跳转代码，`utils/checkPhone/reverseTakeover.ts` 里的 `AppID.Chat` 只是生成"浏览计划"的数据描述）。因此打标志只需做这 2 处，即 100% 覆盖外部唤起场景。

## 文档未覆盖的两个副作用（必须一并修复，否则改造会引入 bug）
1. **列表页会误清未读角标（严重）**：`Chat.tsx:992-998` 的 effect 依赖 `[lastMsgTimestamp, activeCharacterId]`，而 `activeCharacterId` 在 Chat 挂载时已被 `OSContext:1724-1736` 从 localStorage 恢复为"上次聊的角色"。改造后用户停在列表页时，该 effect 会持续 `clearUnread`，把没点进去看的角色的未读**错误清零**，通知/主动消息的未读提示失效。856 行同类问题。
   - 修法：给 992 与 856 两处 `clearUnread` 加 `view === 'chat'` 守卫；并**新增一个独立 effect** `useEffect(() => { if (view === 'chat' && activeCharacterId) clearUnread(activeCharacterId); }, [view, activeCharacterId, clearUnread])`，专门覆盖"点选的就是当前 activeCharacterId 那个角色"（此时 `activeCharacterId` 不变、挂载 effect 不重跑）导致角标清不掉的反向 bug。
2. **列表页会误播「登场」过场动画**：898-900 行只看 `activeCharacterId`，打开 Message 进列表页时它会为真 → `CharacterEntryTransition` 覆盖层盖住整个列表播动画。
   - 修法：改为 `if (activeCharacterId && view === 'chat') setShowEntry(true)`，依赖数组加 `view`（这样"点选同一角色"时 view 变化也能触发动画）。

## 实现注意事项
- **list 分支的 return 必须放在所有 hooks 之后**（3375 行主 return 之前），保证 hooks 调用顺序稳定；因此上述副作用**无法靠提前 return 规避，只能显式加守卫**。
- **性能**：角色数为 N 时，每次 `lastMsgTimestamp` 变化会触发 N 次 IDB 查询。用 `Promise.all` 并行 + `cancelled` 标志防竞态；对 `refreshKey` 做约 300ms 防抖，避免消息密集到达时反复全量刷预览。预览文案处理：`content.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()`，>30 字截断，撤回/图片走特殊文案。
- **状态粒度**：`view` 只在 Chat 组件内，不进 `OSContext`，避免污染全局；deep link 标志是一次性的，消费后立即置 null。
- **兼容**：不改 `ChatInputArea.tsx`、不改 `ChatHeaderShell.tsx` 内部结构（返回键两处分支共用 `onClose` prop，改 `Chat.tsx` 传参即可同时生效）。
- **已知取舍（本次不处理）**：`OSContext.tsx:1828` 的 `setChatViewSnapshot(activeApp === AppID.Chat, activeCharacterId)` 在列表页时仍会认为"用户正看着该角色会话"从而抑制全局横幅。影响很小（仅列表页停留时少弹一次横幅），为避免把视图状态反向耦合进全局，本次保持原样，留作后续优化。
- **回退**：按用户约定，动手前先打一个 `backup:` 前缀的备份 commit（注意工作区已有 16 个未提交改动会一并进入该备份点）。部署只用 `deploy` 远端。

## 目录结构
```
apps/
└── Chat.tsx                        # [MODIFY] 新增 view 状态与列表分支；消费 deep link 标志；
                                    #   ChatHeader 的 onClose 由 closeApp 改为回列表；
                                    #   showEntry / clearUnread / reloadMessages 加 view==='chat' 守卫；
                                    #   新增独立的 clearUnread effect 覆盖"点选同一角色"场景。
components/chat/
└── ChatList.tsx                    # [NEW] 会话列表页。接收 characters / unreadMessages / refreshKey /
                                    #   onSelect / onClose；异步取各角色最近 1 条消息做预览；
                                    #   useMemo 排序（未读优先 → 时间倒序 → 无消息垫底）；
                                    #   顶栏居中标题「Message」+ 左侧返回键；空状态提示；React.memo 包裹。
context/
└── OSContext.tsx                   # [MODIFY] interface 与 value 新增 chatDeepLinkCharId、consumeChatDeepLink；
                                    #   在通知 onclick(1881) 与主动消息 openHandler(2007) 打标志。
```

## 关键接口
```tsx
interface ChatListProps {
    characters: CharacterProfile[];
    unreadMessages: Record<string, number>;
    refreshKey: number;                 // 来自 OSContext 的 lastMsgTimestamp
    onSelect: (charId: string) => void;
    onClose: () => void;
}
```
```tsx
// OSContextType 新增
chatDeepLinkCharId: string | null;   // 外部唤起直达标志（一次性）
consumeChatDeepLink: () => void;
```



## 设计风格
延续 SullyOS 聊天界面的**玻璃拟态（Glassmorphism）**基调：半透明白底 + 细分割线 + 轻微背景模糊，与 `ChatHeaderShell` 视觉语言一致，让用户感觉列表页和私聊页是同一个 App 的两层。

## 页面结构（自上而下）
1. **顶栏**：固定顶部，高度约 56px，`sticky top-0 z-10`，`bg-white/70 backdrop-blur` + 底部 `border-b border-slate-200/60`。左侧返回键用 `CaretLeft` 图标（沿用 `sully-chat-back` class 以继承坏 CSS 守护样式），标题「Message」绝对居中（`relative w-full flex justify-center` + 返回键 `absolute left-0`，参照 `ChatHeaderShell.tsx:416-440` 的 `useCenteredLayout` 分支写法），小字号加粗、字距略宽。
2. **会话列表**：可滚动容器（`overflow-y-auto` + 隐藏滚动条 `no-scrollbar`），每行 72px 高，左右留白 16px。
3. **会话行**：左侧 52px `rounded-2xl` 圆角头像（`object-cover`，与「切换会话」面板风格统一）；右侧两行——上行为角色名（加粗、单行 `truncate`）+ 右侧时间（浅灰小字），下行为消息预览（浅灰、`truncate`）+ 右侧未读角标。未读角标为红色圆角胶囊，白字，`>99` 显示 `99+`。行间用 1px 浅色分割线，左缩进对齐头像右侧。
4. **交互**：整行可点，`active:bg-slate-100/70` 按压反馈 + `transition-colors`；头像 hover 微放大；未读行角色名与预览文字加深一档以突出重点。
5. **空状态**：居中垂直居中布局，淡灰色图标 + 「还没有联系人，去『神经链接』新建一个角色吧」，次级灰字。

## 响应式
沿用手机屏幕容器（PhoneShell 内），按 100% 宽度自适应，不做多断点；长名字/长预览一律 `truncate` 单行截断。


## Agent Extensions
### Skill
- **frontend-design**
  - Purpose: 为新增的 `ChatList.tsx` 会话列表页提供视觉设计指导，确保与既有聊天界面的玻璃拟态风格统一、不出现模板化观感
  - Expected outcome: 列表页在顶栏、会话行、未读角标、空状态上的排版与配色决策明确且可落地
- **vercel-react-best-practices**
  - Purpose: 审查 `ChatList.tsx` 的异步取数、memo 化与 effect 依赖写法，避免不必要的重渲染与 IDB 重复查询
  - Expected outcome: N 个角色的预览查询有防抖与竞态保护，列表滚动与刷新不掉帧
### SubAgent
- **code-explorer**
  - Purpose: 确认项目内是否已有可复用的相对时间格式化工具（避免重复造轮子），并核对 `ChatHeaderShell.tsx` 居中布局的具体 class 写法
  - Expected outcome: 明确是复用现有 util 还是在 ChatList 内本地定义，顶栏实现与既有写法一致
