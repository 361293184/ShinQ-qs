/** 微信桥 · 增量合并进角色主时间线（chat-glue）。
 *
 * 与现实桥的 chat-glue.ts 同一套幂等写法：**重复合并无副作用**，靠
 * `metadata.wechat_bridge_msg_id` 在最近消息里认领已落库的气泡。
 *
 * 时间线合一（方案里的设计点①）：微信消息就是一条普通的 user/assistant 消息，
 * 和 App 里聊的混在同一条线上。**content 里不带任何「微信」字样**——角色读的
 * 就是 SullyOS 上下文，微信是运输层，不该让它知道消息是打哪儿来的（否则角色
 * 会开始扮演「微信里的我」，和 App 里的语气分叉）。来源标记只放 metadata，
 * UI 想加小图标时从那里读。
 */

import { DB } from '../db';
import { CHAT_GEN_EVENTS, announceChatGen } from '../chatGenEvents';
import type { WechatOutboxEntry } from './types';

/** 幂等标记：一条微信消息（含多段回复的每一段）一个 id。 */
export const WECHAT_MSG_MARK = 'wechat_bridge_msg_id';

/** 扫最近 200 条：多段回复 + 补收重放都够用，再往前就该靠云端游标了。 */
const DEDUP_SCAN_DEPTH = 200;

export async function isWechatMsgAlreadyMerged(charId: string, msgId: string): Promise<boolean> {
  const recent = await DB.getRecentMessagesByCharId(charId, DEDUP_SCAN_DEPTH);
  return recent.some((m) => m.metadata?.[WECHAT_MSG_MARK] === msgId);
}

/**
 * 把一条增量落进角色主时间线。返回 true = 真的写了（调用方据此刷新 UI）。
 *
 * `persistTimestamp` 缺省走 DB.saveMessage 默认（写库当刻）；离线补收传 entry.at
 * （云端真正发出那一刻），气泡显示的时间才对得上「这条是昨天在微信里聊的」。
 */
export async function mergeWechatOutboxEntry(
  entry: WechatOutboxEntry,
  persistTimestamp?: number,
): Promise<boolean> {
  if (!entry?.charId || !entry?.msgId || !entry?.content) return false;
  if (await isWechatMsgAlreadyMerged(entry.charId, entry.msgId)) return false;

  await DB.saveMessage({
    charId: entry.charId,
    role: entry.role,
    type: 'text',
    content: String(entry.content).slice(0, 4000),
    ...(persistTimestamp ? { timestamp: persistTimestamp } : {}),
    metadata: {
      source: 'wechat_bridge',
      [WECHAT_MSG_MARK]: entry.msgId,
      wechatBridge: true,
      wechatSentAt: entry.at,
    },
  } as Parameters<typeof DB.saveMessage>[0]);
  return true;
}

/** 通知 UI：当前挂载的 Chat reload；不在会话时 OSContext 补未读 + toast。 */
export function announceWechatRefresh(charId: string, charName?: string): void {
  announceChatGen(CHAT_GEN_EVENTS.replyArrived, { charId, charName: charName || '角色' });
}
