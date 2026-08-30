/**
 * 番外 HTML 三套预置模板骨架。
 * 每套返回一个「完整 HTML 骨架」字符串（含 <style> + 结构 + {{占位符}}）。
 * 生成时把这些骨架注入 prompt，让 AI **保留结构与样式、只替换占位符为剧情内容**，
 * 从而产出稳定、美观、无脚本、宽度自适应的 HTML（沙盒 iframe 渲染，纯 CSS 互动）。
 */

export type FanwaiHtmlType = 'phone' | 'forum' | 'statusbar' | 'custom';

export interface HtmlTemplateAssets {
    charName: string;
    userName: string;
    /** 角色头像 data URL（blob 转好），可能为空字符串（用首字母圆降级）。 */
    charAvatar?: string;
    userAvatar?: string;
}

/** 首字母圆降级用：头像加载失败时换成首字母。 */
function fallbackChar(name: string): string {
    return (name || '?').trim().charAt(0) || '?';
}

/**
 * 小手机模板：圆角细边框手机机身 + 状态栏 + 聊天标题 + 左右气泡 + 底部输入框占位。
 * 占位符：{{title}} 聊天标题、{{status_time}} 状态栏时间、{{chat_content}} 对话正文（AI 按气泡结构填）。
 */
export function buildPhoneTemplate(a: HtmlTemplateAssets): string {
    const ca = a.charAvatar || '';
    const ua = a.userAvatar || '';
    const cfc = fallbackChar(a.charName);
    const ufc = fallbackChar(a.userName);
    return `<div style="font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif;background:#F5F7FB;border-radius:20px;padding:16px;max-width:360px;margin:0 auto;box-sizing:border-box;height:100%;display:flex;flex-direction:column;">
  <div style="background:#fff;border:1px solid #E4E8F0;border-radius:22px;overflow:hidden;box-shadow:0 2px 12px rgba(31,41,55,0.06);flex:1;display:flex;flex-direction:column;min-height:0;">
    <!-- 状态栏 -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 6px;font-size:11px;color:#6B7280;background:#fff;">
      <span>9:41</span><span style="font-weight:600;color:#1F2937;">{{title}}</span><span>●●●</span>
    </div>
    <!-- 聊天标题栏 -->
    <div style="text-align:center;padding:8px 0 10px;font-size:13px;font-weight:600;color:#1F2937;border-bottom:1px solid #F0F2F7;">{{title}}</div>
    <!-- 对话区 -->
    <div style="padding:12px 12px 16px;flex:1;overflow-y:auto;min-height:0;">
      {{chat_content}}
    </div>
    <!-- 底部输入框占位 -->
    <div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid #F0F2F7;align-items:center;">
      <div style="flex:1;height:30px;border-radius:15px;background:#F5F7FB;border:1px solid #E4E8F0;"></div>
      <div style="width:44px;height:30px;border-radius:15px;background:linear-gradient(135deg,#4F7CFF,#6C8CFF);"></div>
    </div>
  </div>
</div>
<style>
  .fw-msg{display:flex;align-items:flex-start;gap:8px;margin:8px 0;}
  .fw-msg.fw-user{flex-direction:row-reverse;}
  .fw-av{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#EDF0F7;color:#8A94A6;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .fw-bubble{max-width:72%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.5;color:#1F2937;word-break:break-word;transition:transform .12s ease;}
  .fw-msg:not(.fw-user) .fw-bubble{background:#F0F2F7;border-bottom-left-radius:4px;}
  .fw-msg.fw-user .fw-bubble{background:linear-gradient(135deg,#4F7CFF,#6C8CFF);color:#fff;border-bottom-right-radius:4px;}
  .fw-msg:hover .fw-bubble{transform:scale(1.04);}
</style>`;
}

/**
 * 论坛模板：顶部导航 + 标题/楼主/时间 + 正文 + details 折叠回复 + 楼层首字圆 + 点赞 :checked。
 * 占位符：{{forum_name}} 论坛名、{{title}} 帖子标题、{{author}} 楼主、{{body}} 正文、
 *         {{replies}} 回复折叠区（AI 按 .fw-floor 结构填）。
 */
export function buildForumTemplate(a: HtmlTemplateAssets): string {
    const cfc = fallbackChar(a.charName);
    const ufc = fallbackChar(a.userName);
    return `<div style="font-family:-apple-system,'PingFang SC',sans-serif;background:#fff;border:1px solid #E4E8F0;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden;box-shadow:0 2px 12px rgba(31,41,55,0.06);height:100%;display:flex;flex-direction:column;min-height:0;">
  <!-- 顶部导航 -->
  <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid #F0F2F7;">
    <span style="font-size:13px;color:#6B7280;">‹</span>
    <span style="font-size:13px;font-weight:600;color:#1F2937;">{{forum_name}}</span>
    <span style="margin-left:auto;font-size:13px;color:#6B7280;">🔍</span>
  </div>
  <!-- 帖子头 -->
  <div style="padding:12px 16px;">
    <div style="font-size:16px;font-weight:600;color:#1F2937;line-height:1.4;">{{title}}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <div class="fw-floor-av" style="width:22px;height:22px;border-radius:50%;background:#EDF0F7;color:#8A94A6;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">${cfc}</div>
      <span style="font-size:12px;color:#6B7280;">{{author}}</span>
      <span style="font-size:11px;color:#9AA1AF;">· 楼主</span>
    </div>
  </div>
  <!-- 正文 -->
  <div style="padding:4px 16px 12px;font-size:13px;line-height:1.7;color:#1F2937;white-space:pre-wrap;flex:1;overflow-y:auto;min-height:0;">{{body}}</div>
  <!-- 回复区（可折叠）：{{replies}} 需按下方【楼层结构】从 1 楼逐层完整生成到指令要求的楼层数，
       每层独立 .fw-floor 结构，编号连续（1楼、2楼、3楼……），绝不合并、绝不省略、绝不用"其余楼层类似"。
       示例（实际生成时请替换为剧情内容，并按此结构逐层 +1 复制，一直生成到指令要求的总楼层数）： -->
  <details style="padding:0 16px 12px;">
    <summary style="font-size:12px;color:#4F7CFF;cursor:pointer;padding:4px 0;">展开回复</summary>
    <div style="margin-top:8px;">
      <div class="fw-floor">
        <div class="fw-floor-av">路</div>
        <div class="fw-floor-body">
          <div class="fw-floor-meta">路人甲 · 1楼</div>
          这也太搞笑了吧，一个视频把你们看乐成这样。
          <div class="fw-like"><input type="checkbox" id="l1"><label for="l1"><span>👍 128</span></label></div>
        </div>
      </div>
      <!-- 在此从 2 楼开始继续逐层生成，直到指令要求的总楼层数，编号依次递增 -->
      {{replies}}
    </div>
  </details>
</div>
<style>
  .fw-floor{display:flex;gap:8px;padding:8px 0;border-top:1px solid #F6F7FA;font-size:12px;}
  .fw-floor-av{width:24px;height:24px;border-radius:50%;background:#EDF0F7;color:#8A94A6;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  /* 楼层头像按楼层序号循环换色（沙盒禁脚本，纯 CSS）。!important 覆盖可能的残留内联色 */
  .fw-floor:nth-child(5n+1) .fw-floor-av{background:#EDF0F7!important;color:#8A94A6!important;}
  .fw-floor:nth-child(5n+2) .fw-floor-av{background:#DBEAFE!important;color:#1D4ED8!important;}
  .fw-floor:nth-child(5n+3) .fw-floor-av{background:#DCFCE7!important;color:#15803D!important;}
  .fw-floor:nth-child(5n+4) .fw-floor-av{background:#FFEDD5!important;color:#C2410C!important;}
  .fw-floor:nth-child(5n+5) .fw-floor-av{background:#EDE9FE!important;color:#6D28D9!important;}
  .fw-floor-body{flex:1;color:#374151;line-height:1.6;}
  .fw-floor-meta{font-size:11px;color:#9AA1AF;margin-bottom:2px;}
  .fw-like input{display:none;}
  .fw-like span{color:#9AA1AF;font-size:12px;cursor:pointer;}
  .fw-like input:checked + span{color:#EF4444;}
</style>`;
}

/**
 * 状态栏模板：状态胶囊标签（头像+名字+状态描述），穿插正文前/中。
 * 占位符：{{statuses}} 状态胶囊（AI 按 .fw-status 结构填）、{{body}} 正文。
 */
export function buildStatusbarTemplate(a: HtmlTemplateAssets): string {
    const ca = a.charAvatar || '';
    const cfc = fallbackChar(a.charName);
    const ufc = fallbackChar(a.userName);
    return `<div style="font-family:-apple-system,'PingFang SC',sans-serif;background:#fff;border:1px solid #E4E8F0;border-radius:16px;max-width:480px;margin:0 auto;padding:16px;box-shadow:0 2px 12px rgba(31,41,55,0.06);height:100%;display:flex;flex-direction:column;min-height:0;">
  <!-- 状态胶囊区 -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
    {{statuses}}
  </div>
  <!-- 正文 -->
  <div style="font-size:13px;line-height:1.75;color:#1F2937;white-space:pre-wrap;flex:1;overflow-y:auto;min-height:0;">{{body}}</div>
</div>
<style>
  .fw-status{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:16px;background:#F5F7FB;border:1px solid #E4E8F0;font-size:12px;color:#374151;max-width:100%;}
  .fw-status .fw-av{width:20px;height:20px;border-radius:50%;object-fit:cover;background:#EDF0F7;color:#8A94A6;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .fw-status .fw-name{font-weight:600;color:#1F2937;}
</style>`;
}

/** 根据模板类型返回对应骨架；custom 或未知返回 undefined（走 AI 自由生成）。 */
export function buildTemplate(type: FanwaiHtmlType | undefined, a: HtmlTemplateAssets): string | undefined {
    switch (type) {
        case 'phone': return buildPhoneTemplate(a);
        case 'forum': return buildForumTemplate(a);
        case 'statusbar': return buildStatusbarTemplate(a);
        default: return undefined;
    }
}
