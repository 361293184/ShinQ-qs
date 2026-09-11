import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Star } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { readFishingMarketState, type FishingMarketState } from '../../utils/vrWorld/fishingMarket';
import { familiarityScene, familiarityText } from '../../utils/vrWorld/sarFamiliarity/catalog';
import { advanceFamiliarity, deliverFamiliarityMessages, familiarityGreeting, familiarityProgress, readyFamiliarityEvent, saveFamiliarityDraft, startFamiliarity, visitFamiliarity } from '../../utils/vrWorld/sarFamiliarity/state';
import type { FamiliarityCursor } from '../../utils/vrWorld/sarFamiliarity/storageTypes';
import type { FamiliarityNpc } from '../../utils/vrWorld/sarFamiliarity/types';
import { SARDialogueCast, SARPortrait } from './SARNpcArt';
import { SARFamiliarityEffects } from './SARFamiliarityEffects';
import './sar-familiarity-dialog.css';

export function SARFamiliarityDialog({ npc, sceneId, onClose, onEditUserChibi, onOpenGuide }: {
    npc: FamiliarityNpc; sceneId?: string; onClose: () => void; onEditUserChibi: () => void; onOpenGuide: () => void;
}) {
    const { userProfile, characters } = useOS();
    const [market,setMarket]=useState<FishingMarketState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const [replay,setReplay]=useState<FamiliarityCursor|null>(null),[finished,setFinished]=useState(false),[draft,setDraft]=useState<Record<string,unknown>>({});
    const root=useRef<HTMLElement>(null),lock=useRef(false),mounted=useRef(true);
    const draftTimer=useRef<ReturnType<typeof setTimeout>|null>(null),draftWrite=useRef<{cursor:FamiliarityCursor;draft:Record<string,unknown>}|null>(null);
    const flushDraft=()=>{
        if(draftTimer.current)clearTimeout(draftTimer.current);draftTimer.current=null;
        const pending=draftWrite.current;draftWrite.current=null;
        if(pending)void saveFamiliarityDraft(npc,pending.cursor,pending.draft).catch(cause=>{if(mounted.current)setError((cause as Error).message);});
    };
    const userName=userProfile?.name||'我',sully=characters.find(c=>c.id==='preset-sully-v2')||characters.find(c=>c.name.trim().toLowerCase()==='sully');
    const options={userName,sullyId:sully?.id,sullyInSar:!!(sully?.vrState?.enabled&&sully.vrState.currentRoom==='sar'),legacyTitles:!!(userProfile?.vrState?.title||characters.some(c=>c.vrState?.title))};
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
            setMarket(current);setReplay({runId:'replay',sceneId,nodeId:s.start,line:0,revision:0,startedAt:past.at,flags:{...past.flags},drafts:{},userName});return;
        }
        let current=await visitFamiliarity(npc,options);
        const offer=current.sarFamiliarity?.npcs[npc].offerId;
        if(offer)current=await startFamiliarity(npc,offer,options);
        if(mounted.current)setMarket(current);
        void deliverFamiliarityMessages().catch(()=>{if(mounted.current)setError('回忆已保存，私聊彩蛋待下次打开时重试');});
    };
    useEffect(()=>{
        mounted.current=true;const prior=document.activeElement as HTMLElement|null;
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();void run(open);
        const refresh=()=>{try{setMarket(readFishingMarketState());}catch(cause){setError((cause as Error).message);}};
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
            const updated={...cursor,cast:{...cursor.cast,...spoken?.castExpressions,...(spoken?.speaker==='caian'||spoken?.speaker==='aiven'?{[spoken.speaker]:spoken.expression||'normal'}:{})},speaker:spoken?.speaker==='caian'||spoken?.speaker==='aiven'?spoken.speaker:cursor.speaker};
            if(cursor.line<node.lines.length-1){setReplay({...updated,line:cursor.line+1,revision:cursor.revision+1});return;}
            const selected=choice===undefined?undefined:node.choices?.[choice];
            if(node.choices?.length&&!selected)return;
            const next=selected?.next||node.next;
            if(next)setReplay({...updated,nodeId:next,line:0,revision:cursor.revision+1,flags:{...cursor.flags,...selected?.flags},drafts:{...cursor.drafts,[cursor.nodeId]:committedDraft}});
            else{setReplay(null);setFinished(true);}return;
        }
        const next=await advanceFamiliarity(npc,cursor,{choice,draft:committedDraft});setMarket(next);
        if(!next.sarFamiliarity?.npcs[npc].pending)setFinished(true);
        void deliverFamiliarityMessages().catch(()=>setError('回忆已保存，私聊彩蛋待重试'));
    });
    useEffect(()=>{
        const target=window as Window&{render_game_to_text?:()=>string;advanceTime?:(ms:number)=>void};
        const render=()=>JSON.stringify({mode:'sar-familiarity',npc,replay:!!sceneId,stars:progress?.stars,scene:scene?.id,node:cursor?.nodeId,line:cursor?.line,text:line?.text,choices:lastLine?node?.choices?.map(c=>c.label):[],effect:node?.effect?.kind,confirmed:!!draft.confirmed,busy,error,finished});
        target.render_game_to_text=render;return()=>{if(target.render_game_to_text===render)delete target.render_game_to_text;};
    },[npc,sceneId,progress?.stars,scene,cursor,line,lastLine,node,draft,busy,error,finished]);
    const event=market?.sarFamiliarity?readyFamiliarityEvent(market.sarFamiliarity,npc):undefined;
    const visual=node?.effect,castSpeaker=line?.speaker==='caian'||line?.speaker==='aiven'?line.speaker:cursor?.speaker||npc;
    const cast={...cursor?.cast,...line?.castExpressions,...(line?.speaker==='caian'||line?.speaker==='aiven'?{[line.speaker]:line.expression||'normal'}:{})};
    const expression=cast[castSpeaker]||'normal';
    const keyDown=(e:React.KeyboardEvent)=>{
        if(e.key==='Escape'){e.stopPropagation();onClose();}
        if(e.key!=='Tab')return;
        const focus=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,[tabindex="0"]')||[]),first=focus[0],last=focus.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    return <section ref={root} className={`srf-dialog srf-${npc} ${visual?'has-effect':''}`} role="dialog" aria-modal="true" aria-label={`${name}${sceneId?'的回忆':'的日常'}`} onKeyDown={keyDown}>
        <header className="srf-header"><button type="button" onClick={onClose} aria-label="离开对话"><ArrowLeft size={21}/></button><div><small>{sceneId?'MEMORIES · 回忆':'SAR · DAYS TOGETHER'}</small><strong>{scene?.title||`${name} · ${npc==='caian'?'Caian':'Aiven'}`}</strong></div><span className="srf-stars" aria-label={`${progress?.stars||0} 星，共五颗星`}>{[1,2,3,4,5].map(n=><Star key={n} size={15} weight={n<=(progress?.stars||0)?'fill':'regular'}/>)}</span></header>
        <div className="srf-body">
            <div className={`srf-stage ${visual?'with-effect':''}`}>
                {visual?<SARFamiliarityEffects key={`${cursor?.runId}:${cursor?.nodeId}`} effect={visual} npc={npc} flags={cursor?.flags||{}} userName={cursor?.userName||userName} userChibi={userProfile?.vrState?.chibi?.img}
                    characters={characters.map(c=>({id:c.id,name:c.name,chibi:c.vrState?.chibi?.img}))} draft={draft} onDraftChange={changeDraft} onEditUserChibi={onEditUserChibi} replay={!!sceneId}/>
                    :scene?<SARDialogueCast lead={npc} speaker={castSpeaker} expression={expression} castExpressions={cast}/>:<SARPortrait who={npc} expression={finished?'happy':'normal'}/>}
            </div>
            <div className="srf-script">
                {visual&&<div className="srf-mini-portrait"><SARPortrait who={castSpeaker} expression={expression}/></div>}
                <div className="srf-speaker"><b>{line?.speaker==='narrator'?'':line?.speaker==='sully'?'Sully':line?.speaker==='caian'?'凯恩':line?.speaker==='aiven'?'艾文':name}</b>{sceneId&&<small>回顾中</small>}</div>
                {node?<><p className={line?.speaker==='narrator'?'is-narration':''}>{line?familiarityText(line.text,cursor?.userName||userName,cursor?.flags):visual?.title||' '}</p>
                    <div className="srf-responses">{lastLine&&node.choices?.length?node.choices.map((choice,i)=><button type="button" key={i} disabled={busy||(!sceneId&&!!visual?.interactive&&!draft.confirmed)} onClick={()=>advance(i)}>{familiarityText(choice.label,userName,cursor?.flags)}<ArrowRight size={16}/></button>)
                        :<button className="srf-next" type="button" aria-label="继续对话" disabled={busy||(lastLine&&!sceneId&&!!visual?.interactive&&!draft.confirmed)} onClick={()=>advance()}>{busy?'保存中…':lastLine&&!node.next?'收好这段回忆':'继续'}<ArrowRight size={18}/></button>}</div>
                </>:<><p>{sceneId&&finished?'这段回忆，已经好好收在这里了。':market?familiarityGreeting(npc,market).join('\n'):'正在走进活动室…'}</p>
                    {finished&&!sceneId&&<small className="srf-collected">回忆已收入「图鉴 · 名册」</small>}
                    <div className="srf-responses">{!sceneId&&event&&<button disabled={busy} onClick={()=>void run(async()=>{setMarket(await startFamiliarity(npc,event.id,options));setFinished(false);})}>再待一会儿 · {event.title}<ArrowRight size={16}/></button>}
                        {!sceneId&&<button onClick={onOpenGuide}>{npc==='aiven'?'聊聊钓鱼和恐龙':'聊聊活动室'}<ArrowRight size={16}/></button>}
                        <button onClick={onClose}>{sceneId?'返回名册':'先在这里坐一会儿'}</button></div></>}
                {error&&<p className="srf-error" role="alert">{error}{!market&&<button disabled={busy} onClick={()=>void run(open)}>重新打开</button>}</p>}
            </div>
        </div>
    </section>;
}
