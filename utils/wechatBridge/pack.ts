/** 微信桥 · fire_pack 构建（前端唯一的「烤包」入口）。
 *
 * 目标：烤出**和本地聊天那轮一模一样的请求消息数组**，存进 pack 的 chat 段。
 * 云端 worker 拿它当即时对话的请求消息、只在末尾追加时效块——这正是 amsg 即时对话
 * 的同一条链路（见 worker/amsg/src/instantChat.ts 的注释：「这一轮要答的是用户刚说的话，
 * 本地生成那条路发出去的是什么，云端就该发一模一样的」）。
 *
 * 两个刻意的选择：
 *   1. `buildSystemPrompt(..., { timelyByWorker: true })` —— 上游为「prompt 交给
 *      worker 补时效」留的一等公民开关：裁掉当前时间块与【真实世界感知系统】，
 *      到点由 worker 的时效块补。和 amsg 即时对话同款，两条路不会一个报时一个不报。
 *   2. `buildFirePack(..., { templateStub: true })` —— worker 的即时对话路径**不渲染
 *      模板**（那是「到点主动找人说话」用的），所以模板用占位省掉最贵的三样
 *      （系统提示词 + 近史转写 + 表情全库读取）；tzId / userTzId / targetName / scene
 *      照常构建，时效块要用。系统提示词在这里只为 chat.messages 建一次，不做两遍。
 */

import type { AmsgFirePack } from '../amsgFirePack';
import { buildFirePack, resolveChatMessagesForUpload, toFirePackChatMessages } from '../activeMsgClient';
import { ChatPrompts } from '../chatPrompts';
import { loadCharacterContextMessages } from '../chatContextRange';
import { DB } from '../db';
import type { CharacterProfile, GroupProfile, RealtimeConfig, UserProfile } from '../../types';

/** 从 localStorage 读 RealtimeConfig —— 与 activeMsgRuntime / instantToolRunner 的私有
 *  实现同一份出处（os_realtime_config）。缺失返回 undefined 让消费方走 fallback。 */
const loadRealtimeConfig = (): RealtimeConfig | undefined => {
  try {
    const raw = localStorage.getItem('os_realtime_config');
    if (!raw) return undefined;
    return JSON.parse(raw) as RealtimeConfig;
  } catch {
    return undefined;
  }
};

export interface BuildPackResult {
  pack: AmsgFirePack;
  /** 烤进对话的消息条数（排障 / UI 展示用）。 */
  messageCount: number;
}

export const buildWechatFirePack = async (
  char: CharacterProfile,
  userProfile: UserProfile,
  groups: GroupProfile[],
): Promise<BuildPackResult> => {
  const contextMessages = await loadCharacterContextMessages(char);
  const [allEmojis, allCategories] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
  // 按角色可见性过滤表情包：与本地聊天 / amsg 打包同一道闸，名字冲突时不会把
  // A 名下的表情当成 B 的（见 activeMsgRuntime 同位置的注释）。
  const { emojis, categories } = ChatPrompts.filterVisibleEmojis(allEmojis, allCategories, char.id);
  const realtimeConfig = loadRealtimeConfig();

  const systemPrompt = await ChatPrompts.buildSystemPrompt(
    char,
    userProfile,
    groups,
    emojis,
    categories,
    contextMessages,
    realtimeConfig,
    undefined,
    undefined,
    undefined,
    undefined,
    // 时效内容（当前时间 / 真实世界）留到 worker 到点补，见 PromptBuildOptions.timelyByWorker。
    { timelyByWorker: true },
  );
  const { apiMessages } = ChatPrompts.buildMessageHistory(
    contextMessages,
    Math.max(1, contextMessages.length),
    char,
    userProfile,
    emojis,
  );
  // 本地生成 POST 出去的就是 [system, ...历史] 这一串。
  const chatMessages = [{ role: 'system', content: systemPrompt }, ...apiMessages];

  // 占位模板：即时对话路径不渲染它；tzId / userTzId / targetName / scene 照常要。
  const base = await buildFirePack(char, userProfile, groups, realtimeConfig, undefined, { templateStub: true });

  // 先还原图片令牌再算体积——顺序与 amsg 即时对话发送路径一致（反过来会让
  // 「看着没超」的包在云端胀成几 MB）。
  const pack: AmsgFirePack = {
    ...base,
    chat: {
      messages: toFirePackChatMessages(await resolveChatMessagesForUpload(chatMessages)),
      builtAt: Date.now(),
    },
  };
  return { pack, messageCount: pack.chat?.messages.length ?? 0 };
};
