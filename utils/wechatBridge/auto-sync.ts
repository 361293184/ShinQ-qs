/** 微信桥 · 上下文自动同步。
 *
 * 规则（用户定的体验，别改回去）：**平时你正常聊就行，不用点按钮**——
 *   · App 里和 ta 聊过 → 云端上下文自动跟上（这里的触发点）
 *   · 云端还没有上下文（比如刚扫码）→ 自动补传一次
 *   · 微信里聊来聊去 → **不触发**（Worker 自己会追加云端对话，天然不失忆）
 *   · 改了人设 / 世界书 → 这类变化没有时间戳信号，走卡片里的手动按钮兜底
 *
 * 成本控制：新鲜度检查 = 一次 /wx/status + 每角色一次 limit=1 的本地读；
 * 重活（烤包 buildSystemPrompt）只在判定「确实需要」时才做。
 * 节流：同一角色至少间隔 5 分钟；进行中互斥；任何失败静默，绝不打扰聊天。
 */

import { DB } from '../db';
import type { WechatStatusInfo } from './types';
import { loadWechatSettings } from './settings';
import { uploadWechatPack, wechatStatus } from './sync';
import { buildWechatFirePack } from './pack';

/** 同一角色两次自动同步的最小间隔。 */
const MIN_INTERVAL_MS = 5 * 60 * 1000;
/** 时间戳容差：本地只比云端新一点点（几秒内的写库时差）不算「聊过」。 */
const FRESHNESS_TOLERANCE_MS = 5 * 1000;

const lastAutoSyncAt = new Map<string, number>();
let inFlight = false;

/** 该角色本地聊天记录里最新一条的时间戳（没有消息 = 0）。 */
async function newestLocalMessageAt(charId: string): Promise<number> {
  const recent = await DB.getRecentMessagesByCharId(charId, 1);
  let max = 0;
  for (const m of recent) max = Math.max(max, m.timestamp || 0);
  return max;
}

/** 对一个角色做判定 + 重传。返回是否真的传了。 */
async function syncOne(charId: string, info: WechatStatusInfo): Promise<boolean> {
  const last = lastAutoSyncAt.get(charId) || 0;
  if (Date.now() - last < MIN_INTERVAL_MS) return false;

  const pack = info.packs?.[charId];
  const cloudAt = pack?.chatBuiltAt ?? 0;
  const localAt = await newestLocalMessageAt(charId);
  // 云端还没有 pack → 首次自动补传；本地比云端新 → App 里聊过，要跟上。
  // 微信里聊天不会进来：Worker 追加时 chatBuiltAt 已更新到当下，比本地新。
  const needed = !pack || localAt > cloudAt + FRESHNESS_TOLERANCE_MS;
  if (!needed) return false;

  const char = await DB.getCharacter(charId);
  if (!char) return false;
  const userProfile = (await DB.getUserProfile()) ?? { name: 'User', avatar: '', bio: '' };
  const groups = await DB.getGroups();

  const { pack: built } = await buildWechatFirePack(char, userProfile, groups);
  const res = await uploadWechatPack(charId, built);
  lastAutoSyncAt.set(charId, Date.now());
  if (res.ok) {
    console.log(`[wechat-bridge] 自动同步角色上下文（${charId}，${built.chat?.messages.length ?? 0} 条）`);
  } else {
    console.warn('[wechat-bridge] 自动同步上传失败（下次节流窗口后再试）', res.error);
  }
  return res.ok;
}

/** 自动同步入口：检查所有已绑定 bot 的角色，需要就重传。失败静默。 */
export async function autoRefreshContexts(): Promise<void> {
  if (inFlight) return;
  if (!loadWechatSettings().workerUrl) return;
  inFlight = true;
  try {
    const status = await wechatStatus();
    if (!status.ok || !status.info) return;
    for (const bot of status.info.bots ?? []) {
      if (!bot.charId || bot.expired) continue;
      try {
        await syncOne(bot.charId, status.info);
      } catch (err) {
        console.warn('[wechat-bridge] 自动同步跳过（下一轮再试）', err);
      }
    }
  } catch (err) {
    console.warn('[wechat-bridge] 自动同步状态检查失败', err);
  } finally {
    inFlight = false;
  }
}
