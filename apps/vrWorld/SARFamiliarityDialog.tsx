import { sarGreetingExpression } from '../../utils/vrWorld/sarGreetingExpression';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { readFishingMarketState, type FishingMarketState } from '../../utils/vrWorld/fishingMarket';
import { familiarityScene, familiarityText } from '../../utils/vrWorld/sarFamiliarity/catalog';
import { advanceFamiliarity, deliverFamiliarityMessages, familiarityGreeting, familiarityProgress, saveFamiliarityDraft, startFamiliarity, visitFamiliarity } from '../../utils/vrWorld/sarFamiliarity/state';
import type { FamiliarityCursor } from '../../utils/vrWorld/sarFamiliarity/storageTypes';
import type { FamiliarityNpc } from '../../utils/vrWorld/sarFamiliarity/types';
import { SARDialogueCast, SARPortrait } from './SARNpcArt';
import { SARFamiliarityEffects } from './SARFamiliarityEffects';
import { SARDialogueChoices } from './SARDialogueChoices';
import { SARDialogueMeta } from './SARDialogueMeta';
import { SARDialogueBackdrop } from './SARDialogueBackdrop';
import { dialogueSentences } from '../../utils/vrWorld/sarFamiliarity/dialogueText';
import { keepDialogueGuest } from '../../utils/vrWorld/sarDialogueStaging';
import { isSARActivityOccupant } from '../../utils/vrWorld/participation';
import './sar-familiarity-dialog.css';

export function SARFamiliarityDialog({ npc, sceneId, onClose, onEditUserChibi }: {
    npc: FamiliarityNpc; sceneId?: string; onClose: () => void; onEditUserChibi: () => void;
}) {
    const { userProfile, characters } = useOS();
    const [market,setMarket]=useState<FishingMarketState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const [replay,setReplay]=useState<FamiliarityCursor|null>(null),[finished,setFinished]=useState(false),[draft,setDraft]=useState<Record<string,unknown>>({});
    const [page,setPage]=useState({key:'',index:0});
    const root=useRef<HTMLElement>(null),lock=useRef(false),mounted=useRef(true),opened=useRef(false);
    const draftTimer=useRef<ReturnType<typeof setTimeout>|null>(null),draftWrite=useRef<{cursor:FamiliarityCursor;draft:Record<string,unknown>}|null>(null);
    const flushDraft=()=>{
        if(draftTimer.current)clearTimeout(draftTimer.current);draftTimer.current=null;
        const pending=draftWrite.current;draftWrite.current=null;
        if(pending)void saveFamiliarityDraft(npc,pending.cursor,pending.draft).catch(cause=>{if(mounted.current)setError((cause as Error).message);});
    };
    const userName=userProfile?.name||'我',sully=characters.find(c=>c.id==='preset-sully-v2')||characters.find(c=>c.name.trim().toLowerCase()==='sully');
    const options={userName,sullyId:sully?.id,sullyInSar:!!sully&&isSARActivityOccupant(sully),legacyTitles:!!(userProfile?.vrState?.title||characters.some(c=>c.vrState?.title))};
    const progress=market?familiarityProgress(market,npc):undefined;
    const cursor=sceneId?replay:progress?.pending;
    const scene=cursor?familiarityScene(cursor.sceneId):undefined,node=scene&&cursor?scene.nodes[cursor.nodeId]:undefined;
    const line=node?.lines[cursor?.line||0],lastLine=!!node&&(!node.lines.length||(cursor?.line||0)>=node.lines.length-1);
    const name=npc==='caian'?'凯恩':'艾文';
    const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'没有保存成功，请重试');}finally{lock.current=false;if(mounted.current)setBusy(false);}};
    const open=async()=>{
        if(sceneId){
            const current=readFishingMarketState(),past=familiarityProgress(current,npc).completed[sceneId],s=familiarityScene(sceneId);
            if(!past||!s||s.npc!==npc)throw new Error('这段回忆还没有解锁');
            setMarket(current);setReplay({runId:'replay',sceneId,nodeId:s.start,line:0,revision:0,startedAt:past.at,flags:{...past.flags},drafts:{},userName});opened.current=true;return;
        }
        let current=await visitFamiliarity(npc,options);
        const offer=current.sarFamiliarity?.npcs[npc].offerId;
        if(offer)current=await startFamiliarity(npc,offer,options);
        if(mounted.current){setMarket(current);opened.current=true;}
        void deliverFamiliarityMessages().catch(()=>{if(mounted.current)setError('回忆已保存，私聊彩蛋待下次打开时重试');});
    };
    useEffect(()=>{
        mounted.current=true;opened.current=false;const prior=document.activeElement as HTMLElement|null;
        root.current?.querySelector<HTMLButtonElement>('.srf-close')?.focus();void run(open);
        // Opening prepares commerce and resets interrupted progress in separate transactions.
        // Do not paint an intermediate snapshot containing the previous conversation's cast.
        const refresh=()=>{if(!opened.current)return;try{setMarket(readFishingMarketState());}catch(cause){setError((cause as Error).message);}};
        window.addEventListener('vr-fishing-market-updated',refresh);window.addEventListener('storage',refresh);
        return()=>{flushDraft();mounted.current=false;window.removeEventListener('vr-fishing-market-updated',refresh);window.removeEventListener('storage',refresh);prior?.focus();};
    },[npc,sceneId]);
    useEffect(()=>{
        if(!cursor)return;
        const saved=sceneId?market?.sarFamiliarity?.souvenirs.find(s=>s.sceneId===sceneId&&s.nodeId===cursor.nodeId)?.draft:undefined;
        setDraft({...cursor.drafts[cursor.nodeId]||saved||{date:new Date(sceneId?cursor.startedAt:Date.now()).toLocaleDateString('zh-CN')},...(sceneId?{confirmed:true}:{})});
    },[cursor?.runId,cursor?.nodeId]);
    const changeDraft=(value:Record<string,unknown>)=>{
        setDraft(value);
        if(node?.effect?.kind==='mystery-button'&&value.mysteryPressed&&!draft.mysteryPressed){advance(undefined,value);return;}
        if(cursor&&!sceneId){
            draftWrite.current={cursor,draft:value};
            if(draftTimer.current)clearTimeout(draftTimer.current);
            draftTimer.current=setTimeout(flushDraft,120);
        }
    };
    const advance=(choice?:number,committedDraft=draft)=>void run(async()=>{
        if(!cursor||!node||!scene)return;
        // The advance transaction includes the latest draft, so a drag never queues dozens of full saves.
        if(draftTimer.current)clearTimeout(draftTimer.current);draftTimer.current=null;draftWrite.current=null;
        if(sceneId){
            const spoken=node.lines[cursor.line];
            const updated={...cursor,guestPresent:keepGuest,cast:{...cursor.cast,...spoken?.castExpressions,...(spoken?.speaker==='caian'||spoken?.speaker==='aiven'?{[spoken.speaker]:spoken.expression||'normal'}:{})},speaker:spoken?.speaker==='caian'||spoken?.speaker==='aiven'?spoken.speaker:cursor.speaker};
            if(cursor.line<node.lines.length-1){setReplay({...updated,line:cursor.line+1,revision:cursor.revision+1});return;}
            const selected=choice===undefined?undefined:node.choices?.[choice];
            if(node.choices?.length&&!selected)return;
            const next=selected?.next||node.next;
            if(next)setReplay({...updated,nodeId:next,line:0,revision:cursor.revision+1,flags:{...cursor.flags,...selected?.flags},drafts:{...cursor.drafts,[cursor.nodeId]:committedDraft}});
            else{setReplay(null);setFinished(true);onClose();}return;
        }
        const next=await advanceFamiliarity(npc,cursor,{choice,draft:committedDraft});setMarket(next);
        if(!next.sarFamiliarity?.npcs[npc].pending){setFinished(true);onClose();}
        void deliverFamiliarityMessages().catch(()=>setError('回忆已保存，私聊彩蛋待重试'));
    });
    const visual=node?.effect;
    // Freeze greetings for this visit; storage refreshes must not replace a sentence mid-read.
    const greetings=useMemo(()=>market?familiarityGreeting(npc,market):[],[npc,market?.seed,!!node,finished]);
    const sentences=node?dialogueSentences(line?familiarityText(line.text,cursor?.userName||userName,cursor?.flags):visual?.title||' ')
        :sceneId&&finished?['这段回忆，已经好好收在这里了。']:greetings.flatMap(dialogueSentences);
    const pageKey=`${npc}:${sceneId||''}:${cursor?.runId||'greeting'}:${cursor?.nodeId||''}:${cursor?.line||0}:${finished}`;
    const pageIndex=page.key===pageKey?Math.min(page.index,Math.max(0,sentences.length-1)):0;
    const lastSentence=pageIndex>=sentences.length-1;
    const waitingForEffect=!!node&&lastLine&&!sceneId&&!!visual?.interactive&&!draft.confirmed;
    const showChoices=!!market&&lastSentence&&!waitingForEffect&&!!node&&lastLine&&!!node.choices?.length;
    const text=sentences[pageIndex]||(market?' ':'正在走进活动室…');
    const continueDialogue=()=>{
        if(busy||showChoices)return;
        if(!lastSentence)setPage({key:pageKey,index:pageIndex+1});
        else if(node&&!waitingForEffect)advance();
        else if(!node)onClose();
    };
    const nextHint=busy?'保存中…':waitingForEffect&&lastSentence?'先完成上方操作':node&&lastLine&&lastSentence&&!node.next&&!node.choices?.length?'点击收好这段回忆':'点击继续';
    useEffect(()=>{
        const target=window as Window&{render_game_to_text?:()=>string;advanceTime?:(ms:number)=>void};
        const render=()=>JSON.stringify({mode:'sar-familiarity',npc,replay:!!sceneId,stars:progress?.stars,scene:scene?.id,node:cursor?.nodeId,line:cursor?.line,sentence:pageIndex,text,choices:showChoices?node?.choices?.map(c=>familiarityText(c.label,userName,cursor?.flags)):[],effect:visual?.kind,confirmed:!!draft.confirmed,busy,error,finished});
        target.render_game_to_text=render;return()=>{if(target.render_game_to_text===render)delete target.render_game_to_text;};
    },[npc,sceneId,progress?.stars,scene,cursor,pageIndex,text,showChoices,node,draft,busy,error,finished,visual,userName]);
    const keepGuest=!!scene&&!!cursor&&keepDialogueGuest(scene.nodes,cursor.nodeId,cursor.line,npc,cursor.guestPresent??!!cursor.cast?.[npc==='caian'?'aiven':'caian']);
    const castSpeaker=line?.speaker==='caian'||line?.speaker==='aiven'?line.speaker:keepGuest?cursor?.speaker||npc:npc;
    const cast={...cursor?.cast,...line?.castExpressions,...(line?.speaker==='caian'||line?.speaker==='aiven'?{[line.speaker]:line.expression||'normal'}:{})};
    const expression=cast[castSpeaker]||'normal';
    const keyDown=(e:React.KeyboardEvent)=>{
        if(e.key==='Escape'){e.stopPropagation();onClose();}
        if(e.key!=='Tab')return;
        const focus=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,[tabindex="0"]')||[]),first=focus[0],last=focus.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    return <section ref={root} className={`srf-dialog srf-${npc} ${visual?'has-effect':''}`} role="dialog" aria-modal="true" aria-label={`${name}${sceneId?'的回忆':'的日常'}`} onKeyDown={keyDown}>
        <SARDialogueBackdrop/>
        <div className="srf-body">
            <div className={`srf-stage ${visual?'with-effect':''}`}>
                {visual?<SARFamiliarityEffects key={`${cursor?.runId}:${cursor?.nodeId}`} effect={visual} npc={npc} flags={cursor?.flags||{}} userName={cursor?.userName||userName} userChibi={userProfile?.vrState?.chibi?.img}
                    characters={characters.map(c=>({id:c.id,name:c.name,chibi:c.vrState?.chibi?.img}))} draft={draft} onDraftChange={changeDraft} onEditUserChibi={onEditUserChibi} replay={!!sceneId}/>
                    :<SARDialogueCast lead={npc} speaker={castSpeaker} expression={scene?expression:finished?'happy':sentences.slice(0,pageIndex+1).reduce<ReturnType<typeof sarGreetingExpression>|undefined>((previous,sentence,index)=>sarGreetingExpression(npc,sentence,index,previous),undefined)} castExpressions={cast} keepGuest={keepGuest}/>}
            </div>
            <div className="srf-script">
                <SARDialogueMeta npc={npc} speaker={line?.speaker==='narrator'?'旁白':line?.speaker==='sully'?'Sully':line?.speaker==='caian'?'凯恩':line?.speaker==='aiven'?'艾文':name}
                    stars={progress?.stars||0} replayTitle={sceneId?scene?.title:undefined} onClose={onClose}/>
                <button className="srf-bubble" type="button" aria-label="继续对话" disabled={busy||!market||showChoices||(lastSentence&&waitingForEffect)} onClick={continueDialogue}>
                    <span className={`srf-line ${line?.speaker==='narrator'?'is-narration':''}`}>{text}</span>
                    {finished&&!sceneId&&<small className="srf-collected">回忆已收入「图鉴 · 名册」</small>}
                    <span className="srf-next">{showChoices?'请选择回应':nextHint}<ArrowRight size={16}/></span>
                </button>
                {visual&&<div className="srf-mini-portrait"><SARPortrait who={castSpeaker} expression={expression}/></div>}
                {error&&<p className="srf-error" role="alert">{error}{!market&&<button disabled={busy} onClick={()=>void run(open)}>重新打开</button>}</p>}
            </div>
        </div>
        {showChoices&&<SARDialogueChoices key={pageKey}>
            {node?.choices?.map((choice,i)=><button type="button" key={i} disabled={busy} onClick={()=>advance(i)}>{familiarityText(choice.label,userName,cursor?.flags)}</button>)}
        </SARDialogueChoices>}
    </section>;
}
