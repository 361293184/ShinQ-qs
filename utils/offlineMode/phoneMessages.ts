/**
 * 手机道具里的「真实聊天」只同步最近一段（需求：**每个会话最多 100 条**）。
 *
 * 为什么要有上限：
 * - 一个聊了几千条的会话，全量塞进手机界面既卡（渲染）又没意义 —— 你翻手机也只会看最近几句；
 * - 用户手机的私聊要遍历所有角色，不截断的话打开一次要读全库。
 *
 * 口径统一走这里，别再各处写 `.slice(-N)`，免得两个手机（他的/你的）条数不一致。
 */

export const RECENT_MESSAGE_LIMIT = 100;

interface Timestamped {
    timestamp?: number;
}

/**
 * 取最近的 N 条，**保持原有顺序**（旧 → 新）。
 * DB 返回本身就按时间正序，但这里仍排一次，避免别处的插入顺序把它搞乱。
 */
export const takeRecentMessages = <T extends Timestamped>(messages: T[], limit = RECENT_MESSAGE_LIMIT): T[] => {
    if (!Array.isArray(messages) || !messages.length) return [];
    const safeLimit = Math.max(1, limit);
    if (messages.length <= safeLimit) {
        // 条数本来就少：只做一次轻量校验，避免多余排序开销
        return messages;
    }
    return [...messages]
        .sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0))
        .slice(-safeLimit);
};
