/** 现实桥 · 快捷动作 / 数据项 / 屏幕速聊 三个分区（各含创建向导）。
 *  与 rules-section 分开文件，控制单文件长度。
 */
import React, { useState } from 'react';
import { Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import { BridgeDataItem, BridgeShortcutAction, ScreenChatSettings } from '../../utils/realityBridge/types';
import { StepWizardShell, WizardFooter, Field, Hint, CopyBlock, inputCls, StepDots } from './step-wizard';

/* ════════════ 快捷动作 ════════════ */

const ACTION_WIZ_STEPS = ['接通通道', '动作是什么', '触发方式', '参数与结果', '创建快捷指令', '测试与保存'] as const;

function newAction(): BridgeShortcutAction {
    return {
        id: `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: '', shortcutName: '', description: '', parameterSchema: '{}', resultMode: 'none',
        expiresInSeconds: 120, enabled: true, createdAt: new Date().toISOString(),
    };
}

export function ActionsSection({ actions, onChange }: {
    actions: BridgeShortcutAction[];
    onChange: (next: BridgeShortcutAction[]) => void;
}): React.ReactElement {
    const [editing, setEditing] = useState<BridgeShortcutAction | null>(null);
    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState<BridgeShortcutAction | null>(null);

    const open = (a: BridgeShortcutAction) => { setDraft({ ...a }); setStep(1); setEditing(a); };
    const close = () => { setEditing(null); setDraft(null); setStep(1); };
    const save = () => {
        if (!draft) return;
        if (!actions.some(a => a.id === draft.id)) onChange([...actions, draft]);
        else onChange(actions.map(a => (a.id === draft.id ? draft : a)));
        close();
    };
    const remove = (id: string) => onChange(actions.filter(a => a.id !== id));
    const toggle = (id: string) => onChange(actions.map(a => (a.id === id ? { ...a, enabled: !a.enabled } : a)));

    return (
        <div>
            <div className="flex items-center justify-between px-1 py-2">
                <span className="text-[11px] font-bold text-[#A89B7F] uppercase tracking-wide">快捷动作</span>
                <button onClick={() => open(newAction())} className="inline-flex items-center gap-1 rounded-full bg-[#7F8C52] text-white px-3 py-1.5 text-[11px] font-bold hover:bg-[#71804A] active:scale-95 transition-all cursor-pointer">
                    <Plus className="w-3.5 h-3.5" weight="bold" /> 新建动作
                </button>
            </div>

            {actions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D8D2BE] bg-[#FCF9F2] px-4 py-8 text-center">
                    <p className="text-xs text-[#A89B7F] leading-relaxed">登记角色可调用的 iPhone 快捷指令。<br />快捷指令本体由你自己在 iPhone 上创建。</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {actions.map(a => (
                        <div key={a.id} className="rounded-2xl border bg-white border-[#E5E0D2] px-3.5 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <button onClick={() => toggle(a.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                                    <p className="text-[13px] font-bold text-[#3A3A38] truncate">{a.name}</p>
                                    <p className="text-[11px] text-[#A89B7F] truncate">{a.shortcutName || '（未填快捷指令名）'}</p>
                                </button>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => open(a)} aria-label="编辑" className="p-1.5 rounded-full hover:bg-[#F1EDE3] cursor-pointer"><PencilSimple className="w-3.5 h-3.5 text-[#A89B7F]" /></button>
                                    <button onClick={() => remove(a.id)} aria-label="删除" className="p-1.5 rounded-full hover:bg-[#FDEDEA] cursor-pointer"><Trash className="w-3.5 h-3.5 text-[#E8845A]" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing && draft && (
                <StepWizardShell
                    title={draft.name || '新建快捷动作'}
                    stepNames={ACTION_WIZ_STEPS}
                    step={step - 1}
                    onBack={() => setStep(s => Math.max(1, s - 1))}
                    onClose={close}
                    footer={<WizardFooter onBack={step === 1 ? close : () => setStep(s => Math.max(1, s - 1))} onNext={() => { if (step === 5) save(); else setStep(step + 1); }} canNext={step === 3 ? !!draft.name.trim() && !!draft.shortcutName.trim() : true} nextLabel={step === 5 ? '保存' : '下一步'} />}
                >
                    <div className="flex items-center gap-2 mb-4"><StepDots current={step - 1} total={ACTION_WIZ_STEPS.length} /><span className="text-[11px] text-[#7F8C52] font-bold">{ACTION_WIZ_STEPS[step - 1]}</span></div>

                    {step === 1 && (
                        <div className="space-y-3">
                            <Hint>快捷动作 = 角色在对话里说「想帮你做个事」时，能真的调用你 iPhone 上的一条「快捷指令」。创建后需要在现实桥内让它能被角色用到。</Hint>
                            <div className="rounded-xl border border-[#E5E0D2] bg-white p-3">
                                <p className="text-[12px] font-bold text-[#6F7C54]">通道说明</p>
                                <p className="text-[10px] text-[#A89B7F] mt-1 leading-relaxed">v1：登记动作供现实桥页面使用；快捷指令由你导入并配置到同一 Cloudflare Worker。投递推送随 push-merge 版本开放。</p>
                            </div>
                        </div>
                    )}
                    {step === 2 && (
                        <div className="space-y-3">
                            <Field label="动作名字（给角色看）"><input className={inputCls} value={draft.name} placeholder="如：打开微信并截图" onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
                            <Field label="iPhone 快捷指令里的准确名称"><input className={inputCls} value={draft.shortcutName} placeholder="与你在快捷指令 App 里建的名称一致" onChange={e => setDraft({ ...draft, shortcutName: e.target.value })} /></Field>
                            <Field label="告诉角色何时用"><textarea className={inputCls} rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field>
                        </div>
                    )}
                    {step === 3 && (
                        <div className="space-y-3">
                            <Field label="结果回传模式">
                                <div className="grid grid-cols-3 gap-2">
                                    {(['none', 'text', 'image'] as const).map(m => (
                                        <button key={m} onClick={() => setDraft({ ...draft, resultMode: m })} className={`rounded-xl border px-2 py-2 text-[11px] font-bold cursor-pointer ${draft.resultMode === m ? 'bg-[#7F8C52] text-white border-[#7F8C52]' : 'bg-white text-[#6F7C54] border-[#D8D2BE]'}`}>
                                            {m === 'none' ? '不取回' : m === 'text' ? '回传文本' : '回传图片'}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            <Field label="等待结果的超时（秒）"><input className={inputCls} type="number" min={30} max={900} value={draft.expiresInSeconds} onChange={e => setDraft({ ...draft, expiresInSeconds: Math.max(30, Math.min(900, Number(e.target.value) || 120)) })} /></Field>
                        </div>
                    )}
                    {step === 4 && <Hint>参数 Schema 保持 JSON 格式编辑：{'{ "type": "object", "properties": { "content": { "type": "string" } } }'}。留空表示无参数。</Hint>}
                    {step === 5 && <Hint>保存后即可在现实桥页面看到这条动作。iPhone 侧记得把同名的快捷指令建好。</Hint>}
                </StepWizardShell>
            )}
        </div>
    );
}

/* ════════════ 数据项 ════════════ */

const ITEM_WIZ_STEPS = ['接通通道', '数据项是什么', '创建上传快捷指令', '测试与保存'] as const;

function newItem(): BridgeDataItem {
    return { id: `di_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: '', key: '', description: '', createdAt: new Date().toISOString() };
}

export function DataItemsSection({ items, onChange, workerUrl, token }: {
    items: BridgeDataItem[];
    onChange: (next: BridgeDataItem[]) => void;
    workerUrl: string;
    token: string;
}): React.ReactElement {
    const [draft, setDraft] = useState<BridgeDataItem | null>(null);
    const [step, setStep] = useState(1);

    const close = () => { setDraft(null); setStep(1); };
    const save = () => {
        if (!draft) return;
        if (!items.some(i => i.id === draft.id)) onChange([...items, draft]);
        else onChange(items.map(i => (i.id === draft.id ? draft : i)));
        close();
    };

    return (
        <div>
            <div className="flex items-center justify-between px-1 py-2">
                <span className="text-[11px] font-bold text-[#A89B7F] uppercase tracking-wide">数据项</span>
                <button onClick={() => { setDraft(newItem()); setStep(1); }} className="inline-flex items-center gap-1 rounded-full bg-[#7F8C52] text-white px-3 py-1.5 text-[11px] font-bold hover:bg-[#71804A] active:scale-95 transition-all cursor-pointer">
                    <Plus className="w-3.5 h-3.5" weight="bold" /> 新建数据项
                </button>
            </div>

            {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D8D2BE] bg-[#FCF9F2] px-4 py-8 text-center">
                    <p className="text-xs text-[#A89B7F] leading-relaxed">数据项是角色的「手机数据快照」读取工具。<br />快捷指令把状态写进云端，角色需要时读。</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map(i => (
                        <div key={i.id} className="rounded-2xl border bg-white border-[#E5E0D2] px-3.5 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <button onClick={() => { setDraft({ ...i }); setStep(1); }} className="min-w-0 flex-1 text-left cursor-pointer">
                                    <p className="text-[13px] font-bold text-[#3A3A38]">{i.name}</p>
                                    <p className="text-[11px] text-[#A89B7F] truncate">{i.key} · {i.description || '未填说明'}</p>
                                </button>
                                <button onClick={() => onChange(items.filter(x => x.id !== i.id))} aria-label="删除" className="p-1.5 rounded-full hover:bg-[#FDEDEA] cursor-pointer"><Trash className="w-3.5 h-3.5 text-[#E8845A]" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {draft && (
                <StepWizardShell
                    title={draft.name || '新建数据项'}
                    stepNames={ITEM_WIZ_STEPS}
                    step={step - 1}
                    onBack={() => setStep(s => Math.max(1, s - 1))}
                    onClose={close}
                    footer={<WizardFooter onBack={step === 1 ? close : () => setStep(s => Math.max(1, s - 1))} onNext={() => { if (step === 3) save(); else setStep(step + 1); }} canNext={step === 1 ? !!draft.name.trim() && !!draft.key.trim() : true} nextLabel={step === 3 ? '保存' : '下一步'} />}
                >
                    <div className="flex items-center gap-2 mb-4"><StepDots current={step - 1} total={ITEM_WIZ_STEPS.length} /><span className="text-[11px] text-[#7F8C52] font-bold">{ITEM_WIZ_STEPS[step - 1]}</span></div>

                    {step === 1 && (
                        <div className="space-y-3">
                            <Hint>数据项 = 你手机上的某类「状态」，快捷指令定期把它覆盖写到云端。角色想「看看你的健康数据 / 步数 / 附近天气」时从这里读。</Hint>
                            <Field label="名字（给角色看）"><input className={inputCls} value={draft.name} placeholder="如：健康数据" onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
                            <Field label="标识 key（小写英文/数字，云端存 bridge-state/&lt;key&gt;.json）"><input className={inputCls} value={draft.key} placeholder="如 health" onChange={e => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /></Field>
                            <Field label="说明（写给你角色的格式提示）"><textarea className={inputCls} rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field>
                        </div>
                    )}
                    {step === 2 && <Hint>保存后，这条数据会作为角色可读的状态注册进现实桥。角色主动查看的能力随后续版本开放。</Hint>}
                    {step === 3 && (
                        <div className="space-y-3">
                            <Hint>用快捷指令把当前值发送到云端（覆盖写入该 key）：</Hint>
                            <CopyBlock text={workerUrl
                                ? `URL: ${workerUrl.replace(/\/+$/, '')}/bridge/inbox\n方法: POST\n请求体: { "token": "${token}", "type": "state:${draft.key}", "payload": "这里放实际数据" }`
                                : '先在底部配置 Worker 地址与 Token。'} />
                        </div>
                    )}
                </StepWizardShell>
            )}
        </div>
    );
}

/* ════════════ 屏幕速聊 ════════════ */

const SCREEN_WIZ_STEPS = ['接通通道', '选择角色', '创建快捷指令', '确认与启用'] as const;

export function ScreenChatSection({ screenChat, characters, onChange, workerUrl, token }: {
    screenChat: ScreenChatSettings;
    characters: Array<{ id: string; name: string; avatar?: string }>;
    onChange: (next: ScreenChatSettings) => void;
    workerUrl: string;
    token: string;
}): React.ReactElement {
    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState<ScreenChatSettings | null>(null);

    const open = (existing: boolean) => {
        setDraft({ enabled: existing ? screenChat.enabled : true, characterId: existing ? screenChat.characterId : '' });
        setStep(1);
    };

    return (
        <div>
            <div className="flex items-center justify-between px-1 py-2">
                <span className="text-[11px] font-bold text-[#A89B7F] uppercase tracking-wide">屏幕速聊</span>
                <button onClick={() => open(!!screenChat.characterId)} className="inline-flex items-center gap-1 rounded-full bg-[#7F8C52] text-white px-3 py-1.5 text-[11px] font-bold hover:bg-[#71804A] active:scale-95 transition-all cursor-pointer">
                    <Plus className="w-3.5 h-3.5" weight="bold" /> 配置速聊
                </button>
            </div>

            <div className="rounded-2xl border bg-white border-[#E5E0D2] px-3.5 py-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[13px] font-bold text-[#3A3A38]">屏幕速聊</p>
                        <p className="text-[11px] text-[#A89B7F] mt-0.5">
                            {screenChat.characterId
                                ? `绑定角色：${characters.find(c => c.id === screenChat.characterId)?.name || '（未知）'}${screenChat.enabled ? ' · 已开启' : ' · 已停用'}`
                                : '未配置'}
                        </p>
                    </div>
                    <button onClick={() => { const ch = screenChat.characterId; onChange({ ...screenChat, enabled: !!ch && !screenChat.enabled }); }} disabled={!screenChat.characterId} className="w-10 h-6 rounded-full p-1 transition-colors flex items-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: screenChat.enabled ? '#7F8C52' : '#E0DACB' }}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${screenChat.enabled ? 'translate-x-4' : ''}`} />
                    </button>
                </div>
            </div>

            {draft && (
                <StepWizardShell
                    title="配置屏幕速聊"
                    stepNames={SCREEN_WIZ_STEPS}
                    step={step - 1}
                    onBack={() => setStep(s => Math.max(1, s - 1))}
                    onClose={() => { setDraft(null); setStep(1); }}
                    footer={<WizardFooter onBack={step === 1 ? () => { setDraft(null); setStep(1); } : () => setStep(s => Math.max(1, s - 1))} onNext={() => {
                        if (step === 3) { onChange({ ...draft, enabled: true }); setDraft(null); setStep(1); }
                        else setStep(step + 1);
                    }} canNext={step === 1 ? !!draft.characterId : true} nextLabel={step === 3 ? '启用' : '下一步'} />}
                >
                    <div className="flex items-center gap-2 mb-4"><StepDots current={step - 1} total={SCREEN_WIZ_STEPS.length} /><span className="text-[11px] text-[#7F8C52] font-bold">{SCREEN_WIZ_STEPS[step - 1]}</span></div>

                    {step === 1 && (
                        <div className="space-y-3">
                            <Hint>屏幕速聊：截下当前屏幕，让角色「看到」并同步回聊天窗口。v1 走 Worker 同步端点，快捷指令由你在 iPhone 上自建。</Hint>
                            <div className="rounded-xl border border-[#E5E0D2] bg-white p-3">
                                <p className="text-[12px] font-bold text-[#6F7C54]">通道说明</p>
                                <p className="text-[10px] text-[#A89B7F] mt-1 leading-relaxed">需要在 Worker 已上传该角色配置（含 LLM 凭据）时可用；截屏内容只经 Worker 内存处理，不落库。</p>
                            </div>
                        </div>
                    )}
                    {step === 1 ? null : step === 2 ? (
                        <div className="space-y-2">
                            {characters.length === 0 && <p className="text-center text-xs text-[#A89B7F] py-6">还没有角色</p>}
                            {characters.map(c => (
                                <button key={c.id} onClick={() => setDraft({ ...draft, characterId: c.id })} className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 border cursor-pointer transition-all ${draft.characterId === c.id ? 'bg-[#ECEFDF] border-[#B4C198]' : 'bg-white border-[#E5E0D2] hover:bg-[#F7F4EC]'}`}>
                                    {c.avatar ? <img src={c.avatar} alt="" className="w-9 h-9 rounded-full object-cover" /> : <span className="w-9 h-9 rounded-full bg-[#E5E0D2]" />}
                                    <span className="flex-1 text-left text-[13px] font-bold text-[#3A3A38]">{c.name}</span>
                                </button>
                            ))}
                        </div>
                    ) : step === 3 ? (
                        <div className="space-y-3">
                            <Hint>用快捷指令截屏/取屏幕文本，POST 到 Worker 同步端点即可得到角色回应：</Hint>
                            <CopyBlock text={workerUrl
                                ? `URL: ${workerUrl.replace(/\/+$/, '')}/screen-chat\n方法: POST\n请求体: { "token": "${token}", "charId": "${draft.characterId}", "text": "屏幕上的文字内容" }\n\n返回: { "ok": true, "reply": "角色的回应" }`
                                : '先在底部配置 Worker 地址与 Token。'} />
                        </div>
                    ) : null}
                </StepWizardShell>
            )}
        </div>
    );
}
