import React, { useEffect, useMemo, useRef, useState } from 'react';
import SARClubRoom from './SARClubRoom';
import {SARDialogueCast} from './SARNpcArt';
import {SARDialogueChoices} from './SARDialogueChoices';
import type {CharacterProfile} from '../../types';
import { CaretRight, X } from '@phosphor-icons/react';
import {
    getSARDialogueNode,
    type SARDialogueChoice,
    type SARIntroReaction,
    type SARNpcPreference,
} from '../../utils/vrWorld/sarClub';

const SAFE_TOP = 'var(--chrome-top)';

export const SARUpdateModal: React.FC<{
    step: 'update' | 'preference';
    onContinue: () => void;
    onChoose: (preference: SARNpcPreference) => void;
}> = ({ step, onContinue, onChoose }) => (
    <div className="fixed inset-0 z-[360] flex items-center justify-center px-6 bg-black/70 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="sar-update-title">
        <div className="relative w-full max-w-[340px] overflow-hidden rounded-[26px]" style={{ background: 'linear-gradient(165deg,#211d38 0%,#11101f 58%,#0a0a13 100%)', border: '1px solid rgba(203,198,255,.22)', boxShadow: '0 24px 80px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.07)' }}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28" style={{ background: 'radial-gradient(ellipse at 50% 0%,rgba(144,127,235,.3),transparent 72%)' }} />
            <div className="relative px-6 pt-6 pb-5">
                {step === 'update' ? (
                    <>
                        <div className="text-[9px] tracking-[0.36em] text-indigo-200/55">UPDATE</div>
                        <h2 id="sar-update-title" className="mt-2 text-[24px] tracking-[0.16em] text-white" style={{ fontFamily: `'Noto Serif SC',serif`, fontWeight: 500 }}>彼方活动室</h2>
                        <div className="mt-5 h-px" style={{ background: 'linear-gradient(90deg,rgba(196,190,255,.45),transparent)' }} />
                        <p className="mt-4 text-[12.5px] leading-7 text-white/68">彼方新增了独立的 SAR 活动空间。<br />里面似乎已经有人先到了。</p>
                        <button type="button" onClick={onContinue} className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full py-3 text-[13px] font-semibold text-[#171326] active:scale-[0.985] transition-transform" style={{ background: 'linear-gradient(120deg,#e8e4ff,#beb7ee)' }}>
                            查看更新 <CaretRight size={14} weight="bold" />
                        </button>
                    </>
                ) : (
                    <>
                        <div className="text-[9px] tracking-[0.32em] text-indigo-200/55">SAR CLUB ROOM</div>
                        <h2 id="sar-update-title" className="mt-2 text-[20px] tracking-[0.08em] text-white" style={{ fontFamily: `'Noto Serif SC',serif`, fontWeight: 500 }}>彼方迎来两名 NPC</h2>
                        <p className="mt-3 text-[12px] leading-6 text-white/58">凯恩与艾文会出现在活动室中，并提供固定剧情与功能引导。</p>
                        <div className="mt-5 space-y-2.5">
                            <button type="button" onClick={() => onChoose('show')} className="w-full rounded-full py-3 text-[13px] font-semibold text-[#171326] active:scale-[0.985] transition-transform" style={{ background: 'linear-gradient(120deg,#eeeaff,#c9c2f6)' }}>我很欢迎</button>
                            <button type="button" onClick={() => onChoose('hide')} className="w-full rounded-full py-3 text-[13px] text-white/72 active:bg-white/10" style={{ border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.035)' }}>我不想要 NPC</button>
                        </div>
                        <p className="mt-4 text-[10px] leading-5 text-white/38">不会影响活动室及其功能，只决定两名 NPC 和相关对白是否出现。之后可在「接入」中更改。</p>
                    </>
                )}
            </div>
        </div>
    </div>
);

export const SARClubStage: React.FC<{
    npcEnabled: boolean;
    caianMet: boolean;
    onTalkToCaian: () => void;
    onTalkToAiven?: () => void;
    occupants?: CharacterProfile[];
    onSelectCharacter?: (char:CharacterProfile) => void;
    onOpenGacha: () => void;
    onOpenCabinet: () => void;
    onOpenModuleShop: () => void;
    onOpenFishingMarket: (entry: 'water' | 'board' | 'garden') => void;
    fullPage?: boolean;
    labelsHidden?: boolean;
}> = ({fullPage:_,...props}) => <SARClubRoom {...props}/>;

export const SARCaianDialogue: React.FC<{
    onClose: () => void;
    onComplete: (reaction?: SARIntroReaction) => void;
}> = ({ onClose, onComplete }) => {
    const [nodeId, setNodeId] = useState('start');
    const [lineIndex, setLineIndex] = useState(0);
    const [mentionedCharacterCard, setMentionedCharacterCard] = useState(false);
    const [reaction, setReaction] = useState<SARIntroReaction | undefined>();
    const node = useMemo(() => getSARDialogueNode(nodeId, { mentionedCharacterCard }), [nodeId, mentionedCharacterCard]);
    const line = node.lines[Math.min(lineIndex, Math.max(0, node.lines.length - 1))];
    const isLastLine = lineIndex >= node.lines.length - 1;
    const choices = isLastLine ? node.choices || [] : [];
    const panel=useRef<HTMLDivElement>(null);
    useEffect(()=>{panel.current?.scrollTo(0,0);},[nodeId,lineIndex]);

    const goTo = (next: string) => {
        setNodeId(next);
        setLineIndex(0);
    };

    const choose = (choice: SARDialogueChoice) => {
        if (choice.reaction) setReaction(choice.reaction);
        if (choice.mentionsCharacterCard) setMentionedCharacterCard(true);
        goTo(choice.next);
    };

    const advance = () => {
        if (!isLastLine) { setLineIndex(index => index + 1); return; }
        if (choices.length > 0) return;
        if (node.next) { goTo(node.next); return; }
        if (node.completes) onComplete(reaction);
    };

    if (!line) return null;
    const speakerName = line.speaker === 'caian' ? '凯恩' : '艾文';
    return (
        <div className="sar-npc-dialogue fixed inset-0 z-[370] overflow-hidden bg-[#090a12]/78 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="凯恩初次见面对话">
            <button type="button" onClick={onClose} aria-label="暂时离开对话" className="absolute right-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white/65 backdrop-blur-md active:bg-white/15" style={{ top: `calc(${SAFE_TOP} + .5rem)` }}><X size={17} /></button>

            <div className="sar-dialogue-portraits">
                <SARDialogueCast speaker={line.speaker} expression={line.expression} castExpressions={line.castExpressions}/>
            </div>

            <div className="sar-dialogue-panel" ref={panel}>
                <div>
                    <button type="button" onClick={advance} className="block min-h-[132px] w-full px-5 pb-4 pt-4 text-left active:bg-white/[0.025]"
                        aria-label={choices.length ? undefined : node.completes && isLastLine ? '结束对话' : '继续对话'}>
                        <div className="mb-2 flex items-center gap-2">
                            <span className="text-[12px] font-bold tracking-[0.18em] text-indigo-100" style={{ fontFamily: `'Noto Serif SC',serif` }}>{speakerName}</span>
                            <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,rgba(190,185,255,.26),transparent)' }} />
                        </div>
                        <p className="text-[15px] leading-7 text-white/92">{line.text}</p>
                        {!choices.length && <div className="mt-2 flex items-center justify-end gap-1 text-[9px] tracking-[0.16em] text-white/28">{node.completes && isLastLine ? '结束对话' : '点击继续'} <CaretRight size={10} /></div>}
                    </button>
                </div>
            </div>
            {choices.length > 0 && <SARDialogueChoices key={nodeId}>
                {choices.map(choice=><button key={choice.label} type="button" onClick={()=>choose(choice)}>{choice.label}</button>)}
            </SARDialogueChoices>}
        </div>
    );
};
