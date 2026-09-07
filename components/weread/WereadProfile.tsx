/**
 * 微信读书「我」页：cookie 登录（手动粘贴 + 引导扫码）、角色感知开关、登录态/昵称展示。
 */
import React, { useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { loadWereadProfile, saveWereadProfile, isPlausibleWereadCookie } from '../../utils/weread/wereadConfig';
import { verifyWereadCookie } from '../../utils/weread/wereadApi';
import type { WereadProfile } from '../../utils/weread/types';

interface Props {
  /** 配置变化后通知父级（刷新书架/感知注入等） */
  onChanged?: (p: WereadProfile) => void;
}

export default function WereadProfile({ onChanged }: Props) {
  const { addToast } = useOS();
  const initial = useMemo(() => loadWereadProfile(), []);
  const [cookieDraft, setCookieDraft] = useState(initial.cookie);
  const [roleAware, setRoleAware] = useState(initial.roleAwareEnabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const canSave = isPlausibleWereadCookie(cookieDraft);

  const apply = (p: WereadProfile) => {
    onChanged?.(p);
  };

  const saveOnly = () => {
    const next = saveWereadProfile({ cookie: cookieDraft.trim(), roleAwareEnabled: roleAware });
    addToast(roleAware ? '已保存，角色可感知你的读书' : '已保存', 'success');
    apply(next);
  };

  const handleSaveAndTest = async () => {
    if (!canSave) {
      addToast('Cookie 太短或不像登录态，请粘贴完整 Cookie', 'error');
      return;
    }
    saveWereadProfile({ cookie: cookieDraft.trim() });
    setTesting(true);
    const r = await verifyWereadCookie();
    setTesting(false);
    if (r.ok) {
      const next = saveWereadProfile({
        verified: true,
        nickname: r.nickname || initial.nickname,
        vid: r.vid || initial.vid,
      });
      addToast(r.nickname ? `连接成功，欢迎回来 ${r.nickname}` : '连接成功', 'success');
      apply(next);
    } else {
      const next = saveWereadProfile({ verified: false });
      apply(next);
      addToast(r.message || '连接失败', 'error');
    }
  };

  const openLogin = () => {
    addToast('网页版登录后复制整串 Cookie（F12 → Network → weread.qq.com 请求里的 Cookie）', 'info');
    window.open('https://weread.qq.com/', '_blank');
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#F7F8F6]">
      {/* 角色感知卡片 */}
      <div className="mx-3 mt-3 rounded-2xl bg-white border border-emerald-100 overflow-hidden">
        <button
          type="button"
          onClick={() => { setRoleAware(v => { const nv = !v; saveWereadProfile({ roleAwareEnabled: nv }); apply(loadWereadProfile()); return nv; }); }}
          className="w-full flex items-center gap-3 p-4 text-left active:bg-emerald-50/40 transition-colors"
        >
          <span className="w-11 h-11 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center text-xl">🧠</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-emerald-950">让角色感知我的读书</span>
            <span className="block text-[11px] text-emerald-800/55 mt-0.5 leading-relaxed">
              开启后，角色能在聊天里自然提起你最近在读的书和划线（不主动发消息）
            </span>
          </span>
          <span
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${roleAware ? 'bg-emerald-500' : 'bg-slate-200'}`}
            aria-hidden
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${roleAware ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </button>
      </div>

      {/* 账号与登录 */}
      <div className="mx-3 mt-3 rounded-2xl bg-white border border-emerald-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-emerald-950">账号登录</h2>
          {initial.verified && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
              ✓ {initial.nickname || '已连接'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-emerald-800/55 leading-relaxed mb-3">
          登录后读取你自己的真实书架、笔记与正文（个人自用）。Cookie 只在本地保存，仅随请求转发给代理。
        </p>
        <textarea
          value={cookieDraft}
          onChange={e => setCookieDraft(e.target.value)}
          rows={3}
          placeholder={'整串 Cookie，例如：wr_vid=123; wr_name=…; wr_skey=…'}
          className="w-full px-3 py-2.5 rounded-xl bg-emerald-50/40 border border-emerald-200/70 text-xs font-mono text-emerald-950 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent placeholder:text-emerald-800/30"
        />
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={handleSaveAndTest}
            disabled={saving || testing || !canSave}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none"
          >
            {testing ? '连接中…' : '保存并连接'}
          </button>
          <button
            type="button"
            onClick={openLogin}
            className="px-3 py-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold active:scale-[0.98] transition-transform"
          >
            打开网页版登录
          </button>
        </div>
        <button
          type="button"
          onClick={saveOnly}
          className="mt-2 w-full py-2 rounded-xl text-emerald-700 bg-emerald-50 text-[11px] font-semibold active:scale-[0.99] transition-transform"
        >
          仅保存（不测试）
        </button>
      </div>

      {/* 权限说明 */}
      <div className="mx-3 mt-3 rounded-2xl bg-white border border-emerald-100 p-4">
        <h3 className="text-xs font-semibold text-emerald-950 mb-2">角色能看到什么</h3>
        <ul className="text-[11px] text-emerald-800/60 leading-relaxed space-y-1.5">
          <li>· 你最近在读 / 读完的书名与进度</li>
          <li>· 你在书里划的句子与想法</li>
          <li>· 只在你开启「角色感知」开关时注入，关闭即视为角色不知道</li>
        </ul>
      </div>
    </div>
  );
}
