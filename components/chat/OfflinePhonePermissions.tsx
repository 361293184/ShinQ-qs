import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock } from '@phosphor-icons/react';
import {
    readUserPhonePermissions,
    patchUserPhonePermission,
    subscribeUserPhonePermissions,
    USER_PHONE_PERMISSION_ITEMS,
    type UserPhonePermissions,
} from '../../utils/offlineMode/userPhonePermissions';
import { invalidateUserPhoneDigest } from '../../utils/offlineMode/userPhoneDigest';

/**
 * 「给他看什么」—— 你的手机右上角齿轮进来的权限设置（方案 §5.26 F / J ③）。
 *
 * 三个设计点照抄文档：
 * 1. **你和他的对话锁死可见** —— 那是你们俩的，不存在"给不给看"。
 * 2. **事前配好，不临场问** —— 配一次，角色要看时直接按它执行，不打断对话。
 * 3. **他会通过"打不开"感知** —— 所以关掉的项要写清"他会发现打不开"，这不是 bug。
 */

interface Props {
    charId: string;
    charName: string;
    onBack: () => void;
}

const Toggle = ({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange?: () => void }) => (
    <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        className={`w-9 h-5 rounded-full transition-colors shrink-0 flex items-center px-0.5 ${on ? 'bg-emerald-500' : 'bg-slate-300'} ${disabled ? 'opacity-60' : 'active:scale-95'}`}
    >
        <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
);

export default function OfflinePhonePermissions({ charId, charName, onBack }: Props) {
    const [permissions, setPermissions] = useState<UserPhonePermissions>(() => readUserPhonePermissions(charId));

    useEffect(() => {
        setPermissions(readUserPhonePermissions(charId));
        return subscribeUserPhonePermissions((id) => {
            if (!id || id === charId) setPermissions(readUserPhonePermissions(charId));
        });
    }, [charId]);

    const toggle = (key: keyof UserPhonePermissions) => {
        const next = patchUserPhonePermission(charId, key, !permissions[key]);
        setPermissions(next);
        // 摘要按权限缓存，改了必须立刻失效，否则他还会按旧范围"看过"
        invalidateUserPhoneDigest(charId);
    };

    return (
        <div className="absolute inset-0 bg-slate-50 flex flex-col">
            <div className="shrink-0 h-10 flex items-center gap-1 px-2 bg-white border-b border-slate-100">
                <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-100">
                    <ArrowLeft className="w-4 h-4" weight="bold" />
                </button>
                <span className="text-[12px] font-bold text-slate-700">他能看到什么</span>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="px-3 pt-3 pb-2 text-[10px] leading-4 text-slate-400">
                    这里是「{charName}拿走你的手机之后」他能翻到的东西。你自己打开手机时，看到的永远是全部。
                </div>

                <div className="mx-3 rounded-xl bg-white divide-y divide-slate-50">
                    {USER_PHONE_PERMISSION_ITEMS.map((item) => {
                        const locked = !!item.locked;
                        const on = locked ? true : permissions[item.key as keyof UserPhonePermissions];
                        return (
                            <div key={item.key} className="flex items-start gap-2 px-3 py-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[12px] font-bold text-slate-700">{item.label}</span>
                                        {locked ? (
                                            <span className="flex items-center gap-0.5 px-1 rounded bg-slate-100 text-[8px] text-slate-500">
                                                <Lock className="w-2 h-2" weight="fill" />总是可见
                                            </span>
                                        ) : null}
                                        {item.sensitive ? (
                                            <span className="px-1 rounded bg-rose-50 text-[8px] text-rose-500">最敏感</span>
                                        ) : null}
                                    </div>
                                    <div className="text-[10px] leading-4 text-slate-400 mt-0.5">{item.desc}</div>
                                    {!locked && !on ? (
                                        <div className="text-[9px] leading-4 text-slate-400 mt-0.5">关掉后他会发现这一项打不开</div>
                                    ) : null}
                                </div>
                                <Toggle
                                    on={on}
                                    disabled={locked}
                                    onChange={locked ? undefined : () => toggle(item.key as keyof UserPhonePermissions)}
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="px-3 py-3 text-[9px] leading-4 text-slate-400">
                    这个设置只影响他：手机可以易手，但关掉的 App 他点不进去 —— 他会通过"打不开"感觉到你在守什么。
                    配好就不用再管，他翻的时候直接按这里执行，不会弹窗问你。
                </div>
            </div>
        </div>
    );
}
