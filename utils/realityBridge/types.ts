/** 现实桥 · 类型定义（移植自 ai-virtual-phone reality-bridge，裁剪 Supabase/邮件/微信后精简）。 */

/** iPhone 快捷指令 POST 到云 Worker 的原始桥条目。 */
export type BridgeItem = {
    id: string;
    /** 用户在快捷指令里自定的类型名，规则按它匹配 */
    type: string;
    /** 原始数据（文本或任意 JSON 序列化后的字符串） */
    payload: string;
    createdAt: string;
};

/** 加工方式：raw 原样 / template 模板占位 / ai 交给模型加工 */
export type BridgeProcessMode = 'raw' | 'template' | 'ai';

export type BridgeRuleActions = {
    /** 写进与某角色的聊天：role 决定聊天室显示身份；historyRole 决定角色记忆里算谁说的 */
    chat?: { characterId: string; role: 'user' | 'assistant' | 'system'; historyRole?: 'user' | 'assistant' | 'system'; requestReply: boolean };
    /** 写入角色长期记忆（Sully char.memories，type 仅 long_term 落地；core 归入 long_term） */
    memory?: { characterId: string; type: 'long_term' | 'core' };
    /** 浏览器系统通知 */
    notify?: boolean;
    /** 写入用户日历（触发时刻锚点，direction 前后铺 durationMinutes 分钟） */
    calendar?: { direction?: 'past' | 'future'; durationMinutes?: number };
    /** 以卡片形式发进聊天 */
    card?: { characterId: string };
    /** 执行一个已配置的快捷动作（创建命令并推送运行通知） */
    shortcut?: { actionId: string };
    /** 回传 iPhone 发件箱 */
    outbox?: { type: string };
};

export type BridgeRule = {
    id: string;
    name: string;
    /** 匹配的数据类型；'*' 匹配全部 */
    matchType: string;
    enabled: boolean;
    process: { mode: BridgeProcessMode; template?: string; prompt?: string };
    actions: BridgeRuleActions;
    /** 触发间隔（分钟）：间隔内再次收到同信号只存档不执行 */
    cooldownMinutes?: number;
    createdAt: string;
};

export type BridgeFeedEntry = {
    id: string;
    type: string;
    payload: string;
    processed?: string;
    rules: string[];
    actions: string[];
    error?: string;
    receivedAt: string;
};

export type BridgeOutboxEntry = {
    id: string;
    type: string;
    payload: string;
    createdAt: string;
    source: 'rule' | 'tool' | 'manual' | 'app';
};

/** 快捷动作：登记 iPhone「快捷指令」App 的准确名称供角色触发 */
export type BridgeShortcutResultMode = 'none' | 'text' | 'image';
export type BridgeShortcutAction = {
    id: string;
    name: string;
    shortcutName: string;
    description: string;
    parameterSchema: string;
    resultMode: BridgeShortcutResultMode;
    expiresInSeconds: number;
    enabled: boolean;
    createdAt: string;
};

/** 数据项：用户手机状态快照（云端 bridge-state/<key>.json）映射给角色的读取工具 */
export type BridgeDataItem = {
    id: string;
    name: string;
    key: string;
    description: string;
    createdAt: string;
};

/** 屏幕速聊设置（本版为同步端点模式，快捷指令由用户自建） */
export type ScreenChatSettings = {
    enabled: boolean;
    characterId: string;
};

/** 每角色开关：默认关；开了可选自动回应 */
export type CharacterBridgePref = {
    enabled: boolean;
    autoReply: boolean;
};

/** 现实桥本地全局设置 */
export type BridgeSettings = {
    /** Cloudflare Worker 地址（如 https://bridge.xxx.workers.dev） */
    workerUrl: string;
    /** Worker token（快捷指令 URL 里也要带） */
    token: string;
    /** 轮询秒数 */
    pollSeconds: number;
    /** 自动接收（App 打开时轮询） */
    enabled: boolean;
    /** 各角色开关 */
    perChar: Record<string, CharacterBridgePref>;
    /** 上报给 Worker 的 apiUrl/apiKey/model（角色回应由 Worker 跑 LLM） */
    llm?: { apiUrl: string; apiKey: string; model: string };
};

export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
    workerUrl: '',
    token: '',
    pollSeconds: 20,
    enabled: true,
    perChar: {},
};

/** 云端推送内容：事件 + 可选角色回应，按 eventId+charId 幂等合并 */
export type BridgePushBundle = {
    kind: 'bridge-event';
    eventId: string;
    charId: string;
    itemType: string;
    /** 事件消息正文（进聊天 user 侧，标注来源现实桥） */
    eventText: string;
    /** 角色回应（assistant 侧）；缺省表示无自动回应，只注入事件 */
    replyText?: string;
    /** 动作摘要，供流水显示 */
    actions?: string[];
    /** 需 App 端本地执行的动作请求（云端不写本地，由 App 侧落地到 Sully 各表） */
    actionRequests?: BridgeActionRequest[];
    createdAt: string;
};

/** 云端要求 App 端本地落地的动作请求。 */
export type BridgeActionRequest =
    | { kind: 'chat'; characterId: string; role: 'user' | 'assistant' | 'system'; text: string; reply?: boolean }
    | { kind: 'memory'; characterId: string; text: string }
    | { kind: 'calendar'; text: string }
    | { kind: 'card'; characterId: string; title: string; text: string }
    | { kind: 'notify'; title: string; body: string }
    | { kind: 'outbox'; type: string; payload: string }
    | { kind: 'shortcut'; actionId: string; args?: Record<string, unknown> };
