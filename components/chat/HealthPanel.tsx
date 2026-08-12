import React, { useState, useEffect } from 'react';
import { Heart, X, ArrowsClockwise, Lightning, Moon, GearSix, CaretRight, CheckCircle, Sparkle } from '@phosphor-icons/react';
import type { HealthSnapshot } from '../../types';
import { fetchRemoteHealthData } from '../../utils/healthData';

interface HealthPanelProps {
    open: boolean;
    onClose: () => void;
    onSave: (snapshot: HealthSnapshot) => void;
    syncMinutes?: number;
    onSyncMinutesChange?: (mins: number) => void;
}

// ── 圆环进度组件（同心嵌套） ──
const RingProgress = ({ value, max, size = 120, strokeWidth = 10, color, bgColor = '#f0f0f0', rotate = 0 }: {
    value: number; max: number; size?: number; strokeWidth?: number; color: string; bgColor?: string; rotate?: number;
}) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(value / max, 1);
    const offset = circumference * (1 - progress);

    return (
        <svg width={size} height={size} className="absolute" style={{
            left: '50%', top: '50%',
            transform: `translate(-50%, -50%) rotate(${rotate - 90}deg)`,
        }}>
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={bgColor} strokeWidth={strokeWidth} opacity={0.3} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
        </svg>
    );
};

// ── 数据卡片 ──
const MetricCard = ({ icon: Icon, label, value, unit, subValue, subLabel, color, bgClass }: {
    icon: React.ElementType; label: string; value: string | number | undefined; unit?: string;
    subValue?: string | number | undefined; subLabel?: string; color: string; bgClass?: string;
}) => (
    <div className={`${bgClass || 'bg-white'} border border-slate-100/80 rounded-2xl p-3.5 shadow-sm`}>
        <div className="flex items-center gap-1.5 mb-2">
            <Icon weight="fill" className="w-4 h-4" style={{ color }} />
            <span className="text-[11px] text-slate-400 font-medium">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-800">{value ?? '--'}</span>
            {unit && <span className="text-[11px] text-slate-400">{unit}</span>}
        </div>
        {(subValue !== undefined || subLabel) && (
            <div className="flex items-center gap-1 mt-1">
                <span className={`text-[11px] font-medium ${subValue ? 'text-slate-500' : 'text-slate-300'}`}>
                    {subValue ?? subLabel ?? ''}
                </span>
                {subValue !== undefined && subLabel && (
                    <span className="text-[10px] text-slate-300">{subLabel}</span>
                )}
            </div>
        )}
    </div>
);

const HealthPanel: React.FC<HealthPanelProps> = ({
    open,
    onClose,
    onSave,
    syncMinutes = 60,
    onSyncMinutesChange,
}) => {
    const [remoteData, setRemoteData] = useState<HealthSnapshot | null>(null);
    const [fetching, setFetching] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualSteps, setManualSteps] = useState('');
    const [manualHeartRate, setManualHeartRate] = useState('');
    const [manualSleep, setManualSleep] = useState('');
    const [manualCalories, setManualCalories] = useState('');
    const [manualSyncing, setManualSyncing] = useState(false);

    useEffect(() => {
        if (open) {
            fetchRemoteData();
        }
    }, [open]);

    const fetchRemoteData = async () => {
        const WORKER_URL = 'https://qs.qiana-s.workers.dev/health';
        setFetching(true);
        try {
            const data = await fetchRemoteHealthData(WORKER_URL);
            if (data) setRemoteData(data);
        } catch {}
        setFetching(false);
    };

    if (!open) return null;

    const handleSave = () => {
        if (remoteData) onSave(remoteData);
        onClose();
    };

    const handleManualSync = async () => {
        const WORKER_URL = 'https://qs.qiana-s.workers.dev/health';
        setManualSyncing(true);
        try {
            const payload = {
                steps: parseInt(manualSteps, 10) || 0,
                heartRate: parseInt(manualHeartRate, 10) || 0,
                sleepHours: parseFloat(manualSleep) || 0,
                calories: parseInt(manualCalories, 10) || 0,
                source: 'Mi Fitness',
                updatedAt: new Date().toISOString(),
            };
            await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            // 推送成功后立即刷新远程数据
            await fetchRemoteData();
            setShowManualInput(false);
        } catch (e) {
            console.error('手动同步失败:', e);
        }
        setManualSyncing(false);
    };

    // 显示的数据：来自远程 Worker 同步
    const displaySteps = remoteData?.steps;
    const displayCalories = remoteData?.calories;
    const displayHeartRate = remoteData?.heartRate;
    const displayHeartRateAvg = remoteData?.heartRateAvg;
    const displaySleepHours = remoteData?.sleepHours;
    const displayDeepSleep = remoteData?.deepSleepHours;
    const displayStress = remoteData?.stress;
    const displayWeight = remoteData?.weightKg;

    // 圆环目标值
    const stepsGoal = 8000;
    const caloriesGoal = 500;

    // 来源标签
    const dataSource = remoteData?.source || '';

    const hasAnyData = !!(displaySteps || displayCalories || displayHeartRate || displaySleepHours || displayStress || displayWeight);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
            onClick={onClose}>
            <div
                className="bg-[#f5f6fa] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '88vh' }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 shrink-0"
                    style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #ff4500 100%)' }}>
                    <div className="flex items-center gap-2 text-white">
                        <Heart className="w-5 h-5" weight="fill" />
                        <span className="font-bold text-base">健康</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {dataSource && (
                            <span className="text-[10px] text-white/70 bg-white/15 px-2 py-0.5 rounded-full">
                                {dataSource}
                            </span>
                        )}
                        <button onClick={() => setShowSettings(!showSettings)}
                            className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors">
                            <GearSix className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">

                    {/* 设置面板（可折叠） */}
                    {showSettings && (
                        <div className="bg-white rounded-2xl p-3.5 space-y-3 border border-slate-100/80 mb-1">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-1 block">
                                    ⏱ 刷新间隔：{syncMinutes} 分钟
                                </label>
                                <input
                                    type="range" min={5} max={180} step={5} value={syncMinutes}
                                    onChange={e => onSyncMinutesChange?.(parseInt(e.target.value, 10))}
                                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-[#ff6b35]"
                                />
                                <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                                    <span>5分钟</span><span>3小时</span>
                                </div>
                            </div>
                            <button
                                onClick={fetchRemoteData}
                                disabled={fetching}
                                className="flex items-center justify-center gap-1 w-full h-9 rounded-lg bg-orange-50 text-orange-600 text-xs font-bold hover:bg-orange-100 disabled:opacity-50 transition-colors"
                            >
                                <ArrowsClockwise className={fetching ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
                                {fetching ? '拉取中...' : '刷新远程数据'}
                            </button>
                        </div>
                    )}

                    {/* 活动圆环区 */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-100/80 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-orange-50/60 to-transparent rounded-bl-3xl pointer-events-none" />
                        <div className="flex items-start gap-5">
                            {/* 三圆环（同心嵌套，类似小米运动健康） */}
                            <div className="relative w-[110px] h-[110px] shrink-0">
                                {/* 卡路里 - 外圈（橙红） */}
                                <RingProgress value={displayCalories || 0} max={caloriesGoal} size={110} strokeWidth={10} color="#ff6b35" rotate={0} />
                                {/* 步数 - 中圈（黄） */}
                                <RingProgress value={displaySteps || 0} max={stepsGoal} size={84} strokeWidth={9} color="#ffc107" rotate={0} />
                                {/* 运动 - 内圈（蓝） */}
                                <RingProgress value={displayStress ? Math.max(0, 100-displayStress*2) : 0} max={100} size={58} strokeWidth={7} color="#4fc3f7" rotate={0} />

                                {/* 中心数字 */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                                    <span className="text-lg font-black text-slate-800 leading-tight">{displaySteps ?? 0}</span>
                                    <span className="text-[9px] text-slate-400">步</span>
                                </div>
                            </div>

                            {/* 右侧指标 */}
                            <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                                <div>
                                    <div className="flex items-center gap-1">
                                        <Sparkle weight="fill" className="w-3.5 h-3.5 text-orange-500" />
                                        <span className="text-[10px] text-slate-400">卡路里</span>
                                        <CaretRight className="w-3 h-3 text-slate-200" weight="bold" />
                                    </div>
                                    <div className="mt-0.5">
                                        <span className="text-base font-bold text-slate-800">{displayCalories ?? '--'}</span>
                                        <span className="text-[10px] text-slate-300 ml-0.5">/{caloriesGoal}千卡</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1">
                                        <Lightning weight="fill" className="w-3.5 h-3.5 text-yellow-500" />
                                        <span className="text-[10px] text-slate-400">步数</span>
                                        <CaretRight className="w-3 h-3 text-slate-200" weight="bold" />
                                    </div>
                                    <div className="mt-0.5">
                                        <span className="text-base font-bold text-slate-800">{displaySteps ?? '--'}</span>
                                        <span className="text-[10px] text-slate-300 ml-0.5">/{stepsGoal}步</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1">
                                        <Lightning weight="fill" className="w-3.5 h-3.5 text-sky-400" />
                                        <span className="text-[10px] text-slate-400">中高强度</span>
                                        <CaretRight className="w-3 h-3 text-slate-200" weight="bold" />
                                    </div>
                                    <div className="mt-0.5">
                                        <span className="text-base font-bold text-slate-800">{displayStress ? Math.max(0, 100-displayStress*2) : '--'}</span>
                                        <span className="text-[10px] text-slate-300 ml-0.5">/30分</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 数据卡片网格 */}
                    <div className="grid grid-cols-2 gap-2.5">
                        {/* 睡眠 */}
                        <MetricCard
                            icon={Moon} label="睡眠" color="#a78bfa" bgClass="bg-purple-50/40"
                            value={displaySleepHours ? `${Math.floor(displaySleepHours)}h${Math.round((displaySleepHours % 1) * 60)}m` : undefined}
                            subValue={displayDeepSleep ? `深睡${Math.floor(displayDeepSleep)}h` : undefined}
                            subLabel={!displayDeepSleep ? '暂无数据' : undefined}
                        />

                        {/* 心率 */}
                        <MetricCard
                            icon={Heart} label="心率" color="#ef4444" bgClass="bg-red-50/40"
                            value={displayHeartRate}
                            unit={displayHeartRateAvg ? `/均${displayHeartRateAvg}` : 'bpm'}
                            subValue={remoteData?.updatedAt ? new Date(remoteData.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined}
                            subLabel={!remoteData?.updatedAt ? '暂无数据' : undefined}
                        />

                        {/* 压力 */}
                        <MetricCard
                            icon={Sparkle} label="压力" color="#14b8a6" bgClass="bg-teal-50/40"
                            value={displayStress ?? '--'}
                            unit=""
                            subValue={!displayStress ? '暂无数据' : displayStress <= 25 ? '放松' : displayStress <= 50 ? '正常' : displayStress <= 75 ? '中等' : '偏高'}
                        />

                        {/* 体重 */}
                        <MetricCard
                            icon={CheckCircle} label="体重" color="#06b6d4" bgClass="bg-cyan-50/40"
                            value={displayWeight}
                            unit="kg"
                            subValue={!displayWeight ? '未录入' : undefined}
                        />
                    </div>

                    {/* iOS 快捷指令安装（跟随滚动） */}
                    <div className="bg-gradient-to-r from-orange-50/80 to-yellow-50/80 rounded-2xl p-3.5 border border-orange-200/50 space-y-2">
                        <p className="text-[11px] text-slate-600 font-bold leading-snug">
                            📲 安装快捷指令，自动同步 Apple Health 数据
                        </p>
                        <button
                            onClick={() => {
                                window.open('https://www.icloud.com/shortcuts/849dc9dbf39845cf8924b0de0d1ec392', '_blank');
                            }}
                            className="flex items-center justify-center gap-1.5 w-full h-9 rounded-xl bg-[#ff6b35] text-white text-xs font-bold active:scale-[0.97] transition-all"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            安装健康同步快捷指令
                        </button>
                        <p className="text-[9px] text-slate-400 text-center leading-relaxed">
                            点按自动跳转「快捷指令」App → 点击「添加」→ 首次运行需授权健康数据
                        </p>
                        <a href="/shortcuts/" target="_blank" rel="noopener noreferrer" className="block text-center text-[9px] text-orange-400 underline">
                            打不开？戳我查看手动配置指南
                        </a>
                    </div>

                    {/* 手动输入数据（不依赖快捷指令） */}
                    <div className="bg-white rounded-2xl p-3.5 border border-slate-100/80 space-y-2">
                        <p className="text-[11px] text-slate-600 font-bold leading-snug flex items-center gap-1">
                            ✏️ 手动输入数据
                        </p>
                        <p className="text-[9px] text-slate-400 leading-relaxed">
                            如果快捷指令无法使用，可手动输入今日数据推送给角色
                        </p>
                        <button
                            onClick={() => setShowManualInput(!showManualInput)}
                            className="flex items-center justify-center gap-1.5 w-full h-9 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold active:scale-[0.97] transition-all"
                        >
                            {showManualInput ? '收起' : '展开输入表单'}
                        </button>
                        {showManualInput && (
                            <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold block mb-1">步数</label>
                                        <input
                                            type="number"
                                            value={manualSteps}
                                            onChange={e => setManualSteps(e.target.value)}
                                            placeholder="0"
                                            className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold block mb-1">心率</label>
                                        <input
                                            type="number"
                                            value={manualHeartRate}
                                            onChange={e => setManualHeartRate(e.target.value)}
                                            placeholder="0"
                                            className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold block mb-1">睡眠(小时)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={manualSleep}
                                            onChange={e => setManualSleep(e.target.value)}
                                            placeholder="0"
                                            className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 font-bold block mb-1">卡路里</label>
                                        <input
                                            type="number"
                                            value={manualCalories}
                                            onChange={e => setManualCalories(e.target.value)}
                                            placeholder="0"
                                            className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:border-orange-300"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleManualSync}
                                    disabled={manualSyncing}
                                    className="flex items-center justify-center gap-1.5 w-full h-9 rounded-xl bg-[#ff6b35] text-white text-xs font-bold active:scale-[0.97] transition-all disabled:opacity-50"
                                >
                                    {manualSyncing ? '推送中...' : '推送数据到 Worker'}
                                </button>
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-3 pb-10 border-t border-slate-100/80 bg-white/80 shrink-0">
                    {!hasAnyData && (
                        <p className="text-center text-xs text-slate-400 mb-2">
                            暂无远程数据，请先在 iPhone 上配置快捷指令同步
                        </p>
                    )}
                    <button
                        onClick={handleSave}
                        className="w-full h-11 rounded-2xl font-bold text-sm text-white active:scale-[0.98] transition-all shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #ff6b35, #ff4500)' }}
                    >
                        同步数据给角色
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HealthPanel;
