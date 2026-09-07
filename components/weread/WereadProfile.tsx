/**
 * 微信读书「我」页（按接入设计方案 §3.1 ③ 的个人中心布局）。
 * 纯展示页：头像/昵称来自配置；统计数字由父组件传入真实数据；
 * 会员/余额/榜单/时长等接口暂未接入 → 用「—」占位；底部引导去 SullyOS 设置补 cookie。
 */
import React from 'react';
import { getWereadConfig, getWereadCookieValue } from '../../utils/weread/wereadConfig';

interface Props {
  /** 昵称（cookie 里的 wr_name，通常由父级传入展示） */
  nickname?: string;
  inReadCount: number;
  finishedCount: number;
  noteCount: number;
  /** 打开 SullyOS 设置 → 实时感知（补 cookie / 角色感知开关） */
  onOpenSettings: () => void;
}

function LabeledDash({ label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-white border border-emerald-100 px-3 py-3 text-center">
      <p className="text-lg font-bold text-slate-300">—</p>
      <p className="mt-1 text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

function StatCell({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-3 text-center ${accent ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-900'}`}>
      <p className={`text-2xl font-extrabold leading-none ${accent ? 'text-white' : 'text-emerald-700'}`}>{value}</p>
      <p className={`mt-1.5 text-[10px] font-medium ${accent ? 'text-emerald-50/80' : 'text-emerald-700/60'}`}>{label}</p>
    </div>
  );
}

export default function WereadProfile({ nickname: nicknameProp, inReadCount, finishedCount, noteCount, onOpenSettings }: Props) {
  const profile = getWereadConfig();
  const cookieName = getWereadCookieValue(profile.cookie, 'wr_name');
  const nickname = (nicknameProp || profile.nickname || cookieName || '').trim();
  const displayName = nickname || '微信读书';
  const initial = nickname ? nickname.slice(0, 1).toUpperCase() : '书';
  const roleAware = profile.roleAwareEnabled && !!profile.cookie;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-[#F7F8F6]">
      {/* 顶部头像区 */}
      <div
        className="relative mx-3 mt-3 rounded-3xl px-4 pt-8 pb-5 overflow-hidden"
        style={{ background: 'linear-gradient(160deg,#E7F6EE 0%,#FFFFFF 70%)' }}
      >
        <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-emerald-200/30 blur-2xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600/15 border border-emerald-200 flex items-center justify-center text-emerald-700 font-extrabold text-2xl shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-emerald-950 leading-tight truncate">{displayName}</p>
            <p className="text-[11px] text-emerald-700/60 mt-0.5">微信读书 · {roleAware ? '角色感知已开启' : '账号未连接'}</p>
          </div>
          {roleAware && (
            <span className="px-2 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold shrink-0">🧠 感知中</span>
          )}
        </div>
      </div>

      {/* 统计卡 */}
      <div className="mx-3 mt-3 grid grid-cols-3 gap-2">
        <StatCell value={inReadCount} label="在读" accent />
        <StatCell value={finishedCount} label="读完" />
        <StatCell value={noteCount} label="笔记" />
      </div>

      {/* 会员/余额/榜单等（接口暂未接入 → 占位） */}
      <div className="mx-3 mt-3 grid grid-cols-2 gap-2">
        <LabeledDash label="会员" />
        <LabeledDash label="勋章" />
        <LabeledDash label="充值币（余额）" />
        <LabeledDash label="福利（赠币）" />
        <LabeledDash label="读书排行榜" />
        <LabeledDash label="阅读时长" />
        <LabeledDash label="订阅" />
        <LabeledDash label="书单" />
      </div>

      <p className="mx-4 mt-2 text-[10px] text-slate-300 leading-relaxed text-center">
        会员/余额/榜单等接口暂未接入，后续补 worker 路由后展示真实数据
      </p>

      {/* 打开设置 */}
      <div className="mx-3 mt-3 pb-6">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full py-3 rounded-2xl bg-white border border-emerald-200 text-emerald-700 text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          {profile.cookie ? '在设置里管理账号 / 角色感知' : '去设置里登录微信读书'}
        </button>
      </div>
    </div>
  );
}
