/** 现实桥 · 联动规则分区：规则列表 + 六步创建/编辑向导。 */
import React, { useMemo, useState } from 'react';
import { Plus, PencilSimple, Trash, Flask, ArrowRight } from '@phosphor-icons/react';
import { BridgeRule } from '../../utils/realityBridge/types';
import { inCooldown } from '../../utils/realityBridge/rules';
import { StepWizardShell, WizardFooter, Field, Hint, CopyBlock, inputCls, StepDots } from './step-wizard';

const RULE_WIZ_STEPS = ['接通管道', '创建快捷指令', '选择信号', '加工内容', '决定动作', '测试与保存'] as const;

function newRule(): BridgeRule {
    return {
        id: `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        matchType: '',
        enabled: true,
        process: { mode: 'raw', template: '', prompt: '' },
        actions: {},
        createdAt: new Date().toISOString(),
    };
}

export function RulesSection({ rules, onChange, workerUrl, token }: {
    rules: BridgeRule[];
    onChange: (next: BridgeRule[]) => void;
    workerUrl: string;
    token: string;
}): React.ReactElement {
    const [editing, setEditing] = useState<BridgeRule | null>(null);
    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState<BridgeRule | null>(null);

    const feedTypes = useMemo(() => ['剪贴板', '定位', '天气', '健康', '通知', '*'], []);

    const openNew = () => { setDraft(newRule()); setStep(1); setEditing(newRule()); };
    const openEdit = (r: BridgeRule) => { setDraft({ ...r }); setStep(1); setEditing(r); };
    const close = () => { setEditing(null); setDraft(null); setStep(1); };

    const setField = <K extends keyof BridgeRule>(key: K, value: BridgeRule[K]) => {
        if (draft) setDraft({ ...draft, [key]: value });
    };

    const save = () => {
        if (!draft) return;
        if (editing && !rules.some(r => r.id === draft.id)) {
            onChange([...rules, draft]);
        } else {
            onChange(rules.map(r => (r.id === draft.id ? draft : r)));
        }
        close();
    };
    const remove = (id: string) => onChange(rules.filter(r => r.id !== id));
    const toggle = (id: string) => onChange(rules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)));

    return (
        <div>
            <div className="flex items-center justify-between px-1 py-2">
                <span className="text-[11px] font-bold text-[#A89B7F] uppercase tracking-wide">联动规则</span>
                <button onClick={openNew} className="inline-flex items-center gap-1 rounded-full bg-[#7F8C52] text-white px-3 py-1.5 text-[11px] font-bold hover:bg-[#71804A] active:scale-95 transition-all cursor-pointer">
                    <Plus className="w-3.5 h-3.5" weight="bold" /> 新建联动
                </button>
            </div>

            {rules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D8D2BE] bg-[#FCF9F2] px-4 py-8 text-center">
                    <p className="text-xs text-[#A89B7F] leading-relaxed">还没有联动规则。<br />新建一条规则，决定收到什么数据时怎么处理。</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {rules.map(rule => {
                        const isRuleActive = rule.enabled && !inCooldown(rule, 0);
                        return (
                            <div key={rule.id} className={`rounded-2xl border px-3.5 py-3 ${rule.enabled ? 'bg-white border-[#E5E0D2]' : 'bg-[#F5F2EA] border-[#E5E0D2] opacity-70'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <button onClick={() => toggle(rule.id)} className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer text-left">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${isRuleActive ? 'bg-[#7F8C52]' : 'bg-[#D3CDBC]'}`} />
                                        <span className="text-[13px] font-bold text-[#3A3A38] truncate">{rule.name || '未命名规则'}</span>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-[10px] text-[#A89B7F] bg-[#F1EDE3] px-1.5 py-0.5 rounded-full">{rule.matchType || '*'}</span>
                                        <button onClick={() => openEdit(rule)} aria-label="编辑" className="p-1.5 rounded-full hover:bg-[#F1EDE3] cursor-pointer"><PencilSimple className="w-3.5 h-3.5 text-[#A89B7F]" /></button>
                                        <button onClick={() => remove(rule.id)} aria-label="删除" className="p-1.5 rounded-full hover:bg-[#FDEDEA] cursor-pointer"><Trash className="w-3.5 h-3.5 text-[#E8845A]" /></button>
                                    </div>
                                </div>
                                <p className="mt-1 text-[11px] text-[#A89B7F] truncate pl-4">
                                    加工 {rule.process.mode} · 动作 {Object.keys(rule.actions).length ? Object.keys(rule.actions).join('/') : '（未选动作）'}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {editing && draft && (
                <RuleWizard
                    rule={draft}
                    setField={setField}
                    step={step}
                    setStep={setStep}
                    feedTypes={feedTypes}
                    onBack={() => setStep(s => Math.max(1, s - 1))}
                    onClose={close}
                    onSave={save}
                    workerUrl={workerUrl}
                    token={token}
                />
            )}
        </div>
    );
}

function RuleWizard({ rule, setField, step, setStep, feedTypes, onBack, onClose, onSave, workerUrl, token }: {
    rule: BridgeRule;
    setField: <K extends keyof BridgeRule>(key: K, value: BridgeRule[K]) => void;
    step: number;
    setStep: (n: number) => void;
    feedTypes: string[];
    onBack: () => void;
    onClose: () => void;
    onSave: () => void;
    workerUrl: string;
    token: string;
}): React.ReactElement {
    const canNext = step === 1 ? true : step === 2 ? true : step === 3 ? !!rule.matchType.trim() : step === 4 ? true : step === 5 ? !!rule.name.trim() : true;

    const next = () => {
        if (step === 5) { onSave(); return; }
        setStep(step + 1);
    };

    const body = (() => {
        if (step === 1) return (
            <div className="space-y-3">
                <Field label="这条联动的名字">
                    <input className={inputCls} value={rule.name} placeholder="如：剪贴板里的地址" onChange={e => setField('name', e.target.value)} />
                </Field>
                <Field label="匹配的信号类型（收到这类数据才触发；填 * 匹配全部）">
                    <div className="flex flex-wrap gap-1.5">
                        {feedTypes.map(t => (
                            <button key={t} onClick={() => setField('matchType', t === '*' ? '' : t)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ${(rule.matchType || '') === (t === '*' ? '' : t) ? 'bg-[#7F8C52] text-white border-[#7F8C52]' : 'bg-white text-[#6F7C54] border-[#D8D2BE]'}`}>{t}</button>
                        ))}
                    </div>
                </Field>
            </div>
        );
        if (step === 2) return (
            <div className="space-y-3">
                <Hint>在 iPhone「快捷指令」里，让它在合适时机把真实数据 POST 到现实桥收件箱。下面的格式可直接复制进快捷指令的「获取 URL 内容」。</Hint>
                <CopyBlock text={workerUrl
                    ? `URL: ${workerUrl.replace(/\/+$/, '')}/bridge/inbox\n方法: POST\n请求体: { "token": "${token}", "type": "${rule.matchType || '剪贴板'}", "payload": "把快捷指令的内容变量放这里" }`
                    : '先在底部「Worker 配置」填写地址与 Token，这里会生成可复制的请求体。'} />
                <Hint>type 要与上面「选择信号」一致；快捷指令运行时自动把 payload 换成当次真实内容。</Hint>
            </div>
        );
        if (step === 3) return (
            <div className="space-y-3">
                <Field label="收到数据后怎么加工">
                    <div className="grid grid-cols-3 gap-2">
                        {(['raw', 'template', 'ai'] as const).map(m => (
                            <button key={m} onClick={() => setField('process', { ...rule.process, mode: m })} className={`rounded-xl border px-2 py-2 text-[11px] font-bold cursor-pointer ${rule.process.mode === m ? 'bg-[#7F8C52] text-white border-[#7F8C52]' : 'bg-white text-[#6F7C54] border-[#D8D2BE]'}`}>
                                {m === 'raw' ? '原样' : m === 'template' ? '模板' : 'AI 加工'}
                            </button>
                        ))}
                    </div>
                </Field>
                {rule.process.mode === 'template' && (
                    <Field label="模板（{payload} / {type} 占位）"><input className={inputCls} value={rule.process.template || ''} onChange={e => setField('process', { ...rule.process, template: e.target.value })} /></Field>
                )}
                {rule.process.mode === 'ai' && (
                    <Field label="加工指令（{payload} 会被替换成收到的内容）"><textarea className={inputCls} rows={3} value={rule.process.prompt || ''} onChange={e => setField('process', { ...rule.process, prompt: e.target.value })} /></Field>
                )}
            </div>
        );
        if (step === 4) return (
            <div className="space-y-3">
                <Hint>决定这条数据「进到哪个角色的对话里」以及要不要让 TA 自然回应。</Hint>
                <div className="rounded-xl border border-[#E5E0D2] bg-white p-3">
                    <p className="text-[12px] font-bold text-[#6F7C54]">动作（v1：进角色对话）</p>
                    <p className="text-[10px] text-[#A89B7F] mt-1">现实桥 v1 的主动作是把事件作为一条消息写进某角色会话、角色自然回应；记忆/日历/卡片/通知等扩展动作后续随角色开关一起开放。</p>
                </div>
                <Field label="触发间隔（分钟，0 = 每次都触发）">
                    <input className={inputCls} type="number" min={0} value={rule.cooldownMinutes || 0} onChange={e => setField('cooldownMinutes', Math.max(0, Number(e.target.value) || 0))} />
                </Field>
            </div>
        );
        if (step === 5) return (
            <div className="space-y-3">
                <Hint>校验无误后保存。若想立刻验证整条链路，保存后在下方历史区发一条测试即可。</Hint>
                <div className="rounded-xl border border-[#E5E0D2] bg-white p-3 flex items-center gap-3">
                    <Flask className="w-5 h-5 text-[#C08A5A]" weight="fill" />
                    <div>
                        <p className="text-[12px] font-bold text-[#3A3A38]">{rule.name || '这条联动'}</p>
                        <p className="text-[10px] text-[#A89B7F]">匹配「{rule.matchType || '*'}」 · {rule.process.mode}</p>
                    </div>
                </div>
            </div>
        );
        return null;
    })();

    return (
        <StepWizardShell
            title={rule.name || '新建联动'}
            stepNames={RULE_WIZ_STEPS}
            step={step - 1}
            onBack={onBack}
            onClose={onClose}
            footer={<WizardFooter onBack={step === 1 ? onClose : onBack} onNext={next} canNext={canNext} nextLabel={step === 5 ? '保存' : '下一步'} />}
        >
            <div className="flex items-center gap-2 mb-4">
                <StepDots current={step - 1} total={RULE_WIZ_STEPS.length} />
                <span className="text-[11px] text-[#7F8C52] font-bold flex-1">{RULE_WIZ_STEPS[step - 1]} <ArrowRight className="w-3 h-3 inline" weight="bold" /></span>
            </div>
            {body}
        </StepWizardShell>
    );
}
