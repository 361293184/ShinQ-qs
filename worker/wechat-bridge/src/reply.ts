/**
 * 微信桥 · 回复整理（模型的原始输出 → 几条能直接发出去的微信消息）。
 *
 * 这层必须在云端做：回复是在 Worker 里生成的（App 被杀也要能回话），前端没有机会碰它。
 *
 * **气泡边界 = 显式换行**，与客户端 `ChatParser.chunkText` 同一语义（那边注释写得很清楚：
 * "Only explicit line breaks are bubble boundaries. Ordinary whitespace must stay in the same
 * bubble"——中日混排里的普通空格不是换行）。曾经按 `---` 分段，但模型基本不写 `---`，
 * 结果整段回复挤成一条超长消息（用户 2026-09-13 反馈"一长串不分气泡"）。
 *
 * 令牌语法与 utils/applyAssistantPostProcessing.ts / ChatParser 对齐（那边是唯一真相）：
 *   <inner_voice>…</inner_voice>  心声：客户端剥出来存 metadata，**绝不能发出去**
 *   [[SEND_EMOJI: 名字]]          表情包，客户端拆成独立气泡
 *   [[INNER_STATE: ...]]          内心状态，客户端兜底剥掉
 *   [html]...[/html]              卡片
 *   [[...]]                       其余一律剥
 *
 * 这份是**刻意重复**的最小实现：worker bundle 不能把前端那套后处理（带浏览器依赖、
 * 还要二次调 LLM、还有 amsg-instant 依赖的横幅管线）整个搬进来。改动那边时这里要跟着看。
 * 唯一例外是心声剥离——那份实现零依赖且是客户端唯一真相，直接 import 共用（见下）。
 *
 * 零浏览器依赖。
 */

import { extractInnerVoice } from '../../../utils/innerVoice';

/** 换行 = 气泡边界（与客户端 chunkText 同一组字符）。 */
const LINE_BREAK_RE = /(?:\r\n|\r|\n|\u2028|\u2029)+/;
/** 整行只有分隔线（`---` / `***` / `___`）时丢掉：微信里它就是一行乱码。 */
const DIVIDER_ONLY_RE = /^[\s\-*_—–]{3,}$/;
/** 一次回复最多拆几条。拆太碎在微信里就是刷屏；超出的**并进最后一条**（绝不丢正文）。 */
const MAX_SEGMENTS = 8;

export interface NormalizedReply {
  /** 按顺序发出去的几条正文（每段一条微信消息）。 */
  segments: string[];
  /** 输出里出现过的表情包名字（客户端会拆成独立气泡；P0 先不发图，只记账）。 */
  emojiNames: string[];
}

/**
 * 模型的原始输出 → 可直接发出的微信消息数组。
 *
 * 顺序是死的，别调换：
 *   0. 剥 `<inner_voice>`（心声是"角色的内心"，客户端只存 metadata——漏进微信就是
 *      "角色把心里话说出声了"，用户 2026-09-13 反馈过）；
 *   1. 剥 `<think>`（思考链同理，更不能漏）；
 *   2. 收走 `[[SEND_EMOJI:]]`（将来要发图的话得靠它，先取出来）；
 *   3. 剥 `[html]`（微信没有卡片，留着就是一串标签）；
 *   4. 剥其余 `[[...]]`（INNER_STATE / QUOTE / MUSIC 之类）；
 *   5. 双语标签拆成两段（原文、译文各一条，和客户端两个气泡的行为对齐）；
 *   6. 按**换行**切气泡；
 *   7. 去空、丢分隔线、限条数（超出的并进最后一条）。
 *
 * 全程**只删令牌本身**，不碰正常正文——删错正文是静默损坏，用户根本发现不了。
 */
export const normalizeReplyForWechat = (raw: string): NormalizedReply => {
  let text = String(raw ?? '');

  // 0. 心声：与客户端共用同一份剥离实现（唯一真相），别在这里另写正则。
  text = extractInnerVoice(text).clean;

  // 1. 思考链
  text = text.replace(/<think[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '');

  // 2. 表情包令牌：收名字，正文里删掉
  const emojiNames: string[] = [];
  text = text.replace(/\[\[\s*SEND_EMOJI:\s*([\s\S]*?)\]\]/gi, (_all, name: string) => {
    const clean = String(name).trim();
    if (clean) emojiNames.push(clean);
    return '';
  });

  // 3. 卡片
  text = text.replace(/\[html\][\s\S]*?\[\/html\]/gi, '');

  // 4. 其余 [[...]]
  text = text.replace(/\[\[[\s\S]*?\]\]/g, '');

  // 5. 双语：`<翻译><原文>X</原文><译文>Y</译文></翻译>` → 原文、译文各一条
  const bilingual = /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>([\s\S]*?)<\/译文>\s*<\/翻译>/i.exec(text);
  const blocks = bilingual
    ? [
      text.slice(0, bilingual.index),
      bilingual[1],
      bilingual[2],
      text.slice(bilingual.index + bilingual[0].length),
    ]
    : [text];

  // 6. 清洗 + 按换行切泡 + 去空
  const segments = blocks
    .flatMap((block) => block
      .replace(/<翻译>|<\/翻译>|<原文>|<\/原文>|<译文>|<\/译文>/gi, '')
      .replace(/%%BILINGUAL%%/g, '')
      .split(LINE_BREAK_RE))
    .map((line) => line.replace(/[ \t]+$/g, '').trim())
    .filter((line) => line.length > 0 && !DIVIDER_ONLY_RE.test(line));

  // 7. 限条数：超出部分并进最后一条（合成一条长消息，也比分段丢失正文好）
  if (segments.length <= MAX_SEGMENTS) return { segments, emojiNames };
  return {
    segments: [...segments.slice(0, MAX_SEGMENTS - 1), segments.slice(MAX_SEGMENTS - 1).join('\n')],
    emojiNames,
  };
};
