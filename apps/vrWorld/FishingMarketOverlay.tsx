import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X, Fish, BookOpen, Storefront, Archive, Plus, CaretRight } from '@phosphor-icons/react';
import type { CharacterProfile, RealtimeConfig, UserProfile } from '../../types';
import {
    FISH_CATALOG, WEATHER_LABELS, FISHING_MARKET_STORAGE_KEY, addCatchToState, availableCatches, buyListing, catchValue,
    commentOnPost, createFishingMarketState, createListing, createRequest, ensureActorAccounts, ensureMarketDay,
    fulfillRequest, handleCollection, hatchEgg, listMarketActors, mutateFishingMarket, readFishingMarketState,
    removeMarketPost, resolveFishingWeather, rollFishingCatch, runLocalMarketPulse, speciesById,
    type FishingCatch, type FishingMarketState, type FishingWeather, type MarketActor, type MarketListing, type MarketRequest,
} from '../../utils/vrWorld/fishingMarket';
import { flushMarketReceipts } from '../../utils/vrWorld/fishingCharacter';
import { FishingGame } from './FishingGame';
import { FishArt } from './FishArt';
import './fishing.css';

type Tab = 'water' | 'catalog' | 'board' | 'archive';
type Compose = 'listing' | 'item' | 'favor' | 'tip';
type BoardPost = MarketListing | MarketRequest;
const rarityLabel: Record<string,string> = {common:'常见',uncommon:'少见',rare:'稀有',epic:'奇珍',relic:'时层遗物'};
const statusLabel: Record<string,string> = {open:'展板中',sold:'已售出',fulfilled:'已完成',removed:'主动撤下',expired:'已到期'};
const ownerId = (p:BoardPost) => 'sellerId' in p ? p.sellerId : p.authorId;
const ownerName = (p:BoardPost) => p.alias || ('sellerName' in p ? p.sellerName : p.authorName);
const countdown = (deadline:number,now:number) => {
    const s=Math.max(0,Math.ceil((deadline-now)/1000)); return Math.floor(s/3600)+'h '+String(Math.floor(s/60)%60).padStart(2,'0')+'m';
};
const WeatherBadge: React.FC<{weather:FishingWeather|null}> = ({weather}) => <div className="flex items-center justify-between gap-3 pb-3">
    <div><div className="text-[14px] font-medium">{weather?.label || '感知天气中…'} <span className="ml-1 text-[10px] text-[#abc7bd]">{weather ? weather.source==='real'?'同步真实天气':'彼方模拟天气':''}</span></div><p className="fish-note mt-0.5">{weather?.detail || '正在辨认水面'}</p></div>
    <span aria-hidden className="text-[25px] text-[#c8dfd5]">{weather?.kind==='clear'?'☀':weather?.kind==='snow'?'❄':weather?.kind==='storm'?'ϟ':'☁'}</span>
</div>;

interface Props {
    initialEntry?:'water'|'board';
    characters:CharacterProfile[]; userProfile:UserProfile; realtimeConfig?:RealtimeConfig;
    addToast?:(message:string,type?:any)=>void; onClose:()=>void;
    onCharacterTrip:(char:CharacterProfile,mode:'fishing'|'market')=>Promise<{ok:boolean;reason?:string}>;
}
export const FishingMarketOverlay:React.FC<Props> = ({initialEntry='water',characters,userProfile,realtimeConfig,addToast,onClose,onCharacterTrip}) => {
    const actors=useMemo(()=>listMarketActors(userProfile,characters),[userProfile.name,characters]);
    const user=actors[0];
    const [state,setState]=useState<FishingMarketState>(()=>{try{return ensureMarketDay(readFishingMarketState());}catch{return createFishingMarketState();}});
    const [error,setError]=useState('');
    const [weather,setWeather]=useState<FishingWeather|null>(null);
    const [tab,setTab]=useState<Tab>(initialEntry);
    const atWater=tab==='water'||tab==='catalog';
    const [boardTab,setBoardTab]=useState<'prices'|'listings'|'requests'>('prices');
    const [viewer,setViewer]=useState('user');
    const [busy,setBusy]=useState(false);
    const [trip,setTrip]=useState<string|null>(null);
    const [tripChar,setTripChar]=useState('');
    const [lastCatch,setLastCatch]=useState<FishingCatch|null>(null);
    const [selectedCatch,setSelectedCatch]=useState<FishingCatch|null>(null);
    const [compose,setCompose]=useState<Compose|null>(null);
    const [selectedPost,setSelectedPost]=useState<BoardPost|null>(null);
    const [postText,setPostText]=useState('');
    const [now,setNow]=useState(Date.now());
    const [archivePage,setArchivePage]=useState(0);
    const [inventoryPage,setInventoryPage]=useState(0);
    const [draft,setDraft]=useState({catchId:'',speciesId:'dinosaur-egg',label:'',price:'0',body:'',alias:''});
    const actor=actors.find(a=>a.id===viewer)||user;
    const report=(e:unknown)=>{const message=e instanceof Error?e.message:String(e);setError(message);addToast?.(message,'error');};
    const refresh=useCallback(()=>{try{setState(ensureMarketDay(readFishingMarketState()));}catch(e){setError(e instanceof Error?e.message:String(e));}},[]);
    useEffect(()=>{
        let alive=true;
        void mutateFishingMarket(s=>ensureActorAccounts(s,actors)).then(async s=>{
            if(alive)setState(s);
            if(initialEntry==='water'){
                const value=await resolveFishingWeather(realtimeConfig,s.seed);if(alive)setWeather(value);
            }
            await flushMarketReceipts(characters);
        }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});
        const onStorage=(e:StorageEvent)=>{if(e.key===FISHING_MARKET_STORAGE_KEY)refresh();};
        window.addEventListener('vr-fishing-market-updated',refresh);window.addEventListener('storage',onStorage);
        const timer=setInterval(()=>{setNow(Date.now());refresh();},30_000);
        return()=>{alive=false;clearInterval(timer);window.removeEventListener('vr-fishing-market-updated',refresh);window.removeEventListener('storage',onStorage);};
    },[actors,realtimeConfig,refresh,characters,initialEntry]);
    const commit=async(change:(s:FishingMarketState)=>FishingMarketState)=>{
        const next=await mutateFishingMarket(change);setState(next);
        try{await flushMarketReceipts(characters);}catch{setError('交易已保存；角色回执暂未同步，下次进入水域或布告板会重试。');}
        return next;
    };
    const act=async(change:(s:FishingMarketState)=>FishingMarketState,after?:()=>void)=>{
        if(busy)return;setBusy(true);setError('');
        try{await commit(change);after?.();}catch(e){report(e);}finally{setBusy(false);}
    };
    const onCaught=async(c:FishingCatch)=>{await commit(s=>addCatchToState(s,c));setLastCatch(c);};
    const beginPost=(mode:Compose,catchId='')=>{
        const c=state.inventory.find(c=>c.id===catchId);
        setDraft({catchId,speciesId:'dinosaur-egg',label:'',price:c?String(catchValue(state,c)):mode==='tip'?'10':'0',body:'',alias:''});setCompose(mode);setError('');
    };
    const publish=()=>void act(s=>{
        const price=Number(draft.price);if(!draft.price.trim())throw new Error('请填写金额');
        if(compose==='listing'){
            const caught=draft.catchId?s.inventory.find(c=>c.id===draft.catchId):null;
            if(draft.catchId&&!caught)throw new Error('选中的藏品已经不在手中');
            return createListing(s,user,caught||null,price,draft.body,Date.now(),draft.label,draft.alias);
        }
        const species=speciesById(draft.speciesId);
        return createRequest(s,user,compose==='item'?species?.id:undefined,compose==='item'?species!.name:draft.label||'给我钱',
            price,draft.body,Date.now(),compose==='tip'?'tip':compose==='item'?'item':'favor',draft.alias);
    },()=>{setCompose(null);setTab('board');setBoardTab(compose==='listing'?'listings':'requests');});
    const runTrip=async(mode:'fishing'|'market')=>{
        const char=characters.find(c=>c.id===tripChar);if(!char||trip)return;
        setTrip(char.id);setError('');
        try{const result=await onCharacterTrip(char,mode);if(!result.ok)throw new Error(result.reason==='no-api'?'尚未配置角色或彼方 API':result.reason==='busy'?'角色正在进行另一项活动':result.reason==='empty'?'角色的回复没有给出可执行结果，这轮没有替角色编造行动':'这次活动未完成，请查看彼方调用记录');refresh();}
        catch(e){report(e);}finally{setTrip(null);}
    };
    useEffect(()=>{
        if(tab==='water'&&weather)return;
        const target=window as Window & {render_game_to_text?:()=>string;advanceTime?:(ms:number)=>void};
        const render=()=>JSON.stringify({mode:'fishing-market',tab,boardTab,viewer,balance:state.accounts[viewer],inventory:state.inventory.filter(c=>c.ownerId===viewer).map(c=>({id:c.id,speciesId:c.speciesId})),openListings:state.listings.filter(p=>p.status==='open').length,openRequests:state.requests.filter(p=>p.status==='open').length,compose});
        const advance=()=>{};target.render_game_to_text=render;target.advanceTime=advance;
        return()=>{if(target.render_game_to_text===render)delete target.render_game_to_text;if(target.advanceTime===advance)delete target.advanceTime;};
    },[tab,boardTab,viewer,state,compose,weather]);
    const owned=state.inventory.filter(c=>c.ownerId===actor.id);
    const archive=[...state.listings,...state.requests].filter(p=>p.status!=='open'&&ownerId(p)===actor.id).sort((a,b)=>(b.closedAt||b.createdAt)-(a.closedAt||a.createdAt));
    const activePost=selectedPost?[...state.listings,...state.requests].find(p=>p.id===selectedPost.id):null;
    const list=state.listings.filter(p=>p.status==='open').slice().reverse();
    const requests=state.requests.filter(p=>p.status==='open').slice().reverse();
    const viewPicker=<select aria-label="查看谁的钱包和收藏" className="fish-input" value={viewer} onChange={e=>{setViewer(e.target.value);setInventoryPage(0);setArchivePage(0);}}>{actors.map(a=><option key={a.id} value={a.id}>{a.name} · {state.accounts[a.id]||0} 鳞币</option>)}</select>;
    const characterTripControls=(mode:'fishing'|'market')=><section className="fish-divider mt-5 pt-4">
        <div className="mb-2 text-[13px]">角色自己的闲暇</div>
        <p className="fish-note mb-3">{mode==='fishing'?'让 ta 自己钓一竿，决定鱼获的去向。':'让 ta 看看行情、交易或留句话。'}每次活动调用一次模型，并保留经历与原话。</p>
        <select className="fish-input" aria-label={mode==='fishing'?'选择去水域的角色':'选择逛布告板的角色'} value={tripChar} onChange={e=>setTripChar(e.target.value)}><option value="">选择已接入彼方的角色</option>{characters.filter(c=>c.vrState?.enabled).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select>
        <button disabled={!tripChar||!!trip} className="fish-action mt-2 w-full" onClick={()=>void runTrip(mode)}>{trip?'活动进行中…':mode==='fishing'?'让 ta 去钓鱼':'让 ta 逛布告板'}</button>
    </section>;
    const postRow=(p:BoardPost)=><button key={p.id} type="button" onClick={()=>{setSelectedPost(p);setPostText('');setError('');}} className="fish-board-paper w-full text-left">
        <div className="flex items-start justify-between gap-3"><div><div className="text-[14px] font-semibold">{'price' in p?'出售':p.kind==='tip'?'求打赏':p.kind==='favor'?'招募':'求购'} · {p.itemLabel}</div><p className="fish-note mt-1">{ownerName(p)} · {p.status==='open'?countdown(p.expiresAt,now):statusLabel[p.status]}</p></div><span className="shrink-0 text-[17px] font-semibold tabular-nums">{'price' in p?p.price:p.offer}<span className="ml-1 text-[10px] font-normal">鳞币</span></span></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-6">{('note' in p?p.note:(p as MarketRequest).body)||'没有附言。'}</p>
        <div className="mt-2 flex items-center justify-between text-[10px] text-[#738074]"><span>{p.comments.length} 条回复</span><span>{'price' in p&&!p.catchId?'文字商品 · 自愿交易':p.status==='open'?'查看便笺 →':'查看存档 →'}</span></div>
    </button>;
    return <div className="fishing-shell fixed inset-0 z-[380] flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label={atWater?'彼方水域':'彼方布告板'}>
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3" style={{paddingTop:'calc(var(--chrome-top) + .5rem)'}}>
            <button className="fish-action !border-0 !p-2" onClick={onClose} aria-label={atWater?'离开水域':'离开布告板'}><ArrowLeft size={20}/></button>
            <div className="flex-1"><div className="text-[19px] tracking-[.16em]" style={{fontFamily:"'Noto Serif SC',serif"}}>{atWater?'彼方水域':'彼方布告板'}</div><div className="text-[8px] tracking-[.25em] text-[#8eaaa9]">{atWater?'WATERSIDE':'MARKET'} / SAR</div></div>
            <span className="text-[15px] tabular-nums text-[#d4c4a4]">{state.accounts.user||0}<small className="ml-1 text-[10px]">鳞币</small></span>
        </header>
        <nav className="fish-divider grid shrink-0 grid-cols-2 border-b border-[#c8e0ea21] px-3">
            {(atWater?[['water','钓鱼',Fish],['catalog','图鉴',BookOpen]] as const:[['board','布告板',Storefront],['archive','档案',Archive]] as const).map(([id,label,Icon])=><button key={id} aria-current={tab===id?'page':undefined} className={`flex items-center justify-center gap-1.5 border-b-2 py-3 ${tab===id?'border-[#a7cebd] text-[#dfeee4]':'border-transparent text-[#8a9eab]'}`} onClick={()=>{setTab(id);setError('');}}><Icon size={15}/>{label}</button>)}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 vr-reader-scroll" style={{paddingBottom:'calc(var(--safe-bottom) + 1.5rem)'}}>
            <div className="mx-auto w-full max-w-[560px]">
                {error&&<p role="alert" className="mb-3 rounded-lg bg-amber-200/10 px-3 py-2 text-[12px] leading-6 text-amber-100">{error}</p>}
                {tab==='water'&&<>
                    <WeatherBadge weather={weather}/>
                    {weather?<FishingGame weather={weather} onCast={()=>rollFishingCatch(user,weather)} onCaught={onCaught}/>:<div className="grid h-64 place-items-center fish-note">水面正在醒来……</div>}
                    {lastCatch&&<div className="fish-reveal mt-4 flex items-center gap-4 rounded-xl bg-[#203844] p-3"><FishArt speciesId={lastCatch.speciesId} size={112} animated/><div><div className="text-[15px] font-medium">{speciesById(lastCatch.speciesId)?.name}</div><div className="fish-note">{lastCatch.sizeCm} cm · {'✦'.repeat(lastCatch.quality)}</div><button className="mt-1 text-[11px] text-[#badbcc]" onClick={()=>{setTab('catalog');setViewer('user');}}>查看收藏 →</button></div></div>}
                    {characterTripControls('fishing')}
                </>}
                {tab==='catalog'&&<>
                    {viewPicker}
                    <div className="mt-4 flex items-center justify-between"><h2 className="text-[14px]">{actor.name} 的收藏</h2><span className="fish-note">{owned.length} 件 · 研究 {state.research[actor.id]||0}</span></div>
                    {actor.id!=='user'&&<p className="fish-note mt-1">你可以回看 ta 的收藏；鱼获和交易由 ta 在自己的活动中决定。</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">{owned.slice().reverse().slice(inventoryPage*12,inventoryPage*12+12).map(c=><button className="rounded-xl bg-[#c8e0ea08] p-3 text-left" key={c.id} onClick={()=>{setSelectedCatch(c);setError('');}}><div className="flex justify-center"><FishArt speciesId={c.speciesId} size={118}/></div><div className="mt-1 text-[12px]">{speciesById(c.speciesId)?.name}</div><div className="fish-note">{'✦'.repeat(c.quality)} · {c.sizeCm} cm{c.displayed?' · 陈列中':''}{c.incubatingUntil?' · 孵化中':''}</div></button>)}</div>
                    {!owned.length&&<p className="fish-note py-7 text-center">水箱还空着。收藏从第一竿开始。</p>}
                    {owned.length>12&&<div className="mt-3 flex justify-between"><button className="fish-action" disabled={inventoryPage===0} onClick={()=>setInventoryPage(p=>p-1)}>上一页</button><span className="fish-note">{inventoryPage+1} / {Math.ceil(owned.length/12)}</span><button className="fish-action" disabled={(inventoryPage+1)*12>=owned.length} onClick={()=>setInventoryPage(p=>p+1)}>下一页</button></div>}
                    <div className="fish-divider mt-5 flex items-center justify-between pt-4"><h2 className="text-[14px]">水域图鉴</h2><span className="fish-note">{state.discovered.length} / {FISH_CATALOG.length}</span></div>
                    <p className="fish-note mt-1">亮起的天气是今天；匹配时更容易钓到。恐龙属于时层漂流物。</p>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">{FISH_CATALOG.map(f=>{const seen=state.discovered.includes(f.id);return <div key={f.id}><div className="flex h-24 items-center justify-center rounded-xl bg-[#c8e0ea04]"><FishArt speciesId={f.id} size={130} silhouette={!seen}/></div><div className="mt-2 text-[12px]">{seen?f.name:'未发现 · '+rarityLabel[f.rarity]}</div><div className="mt-1 flex flex-wrap gap-x-2 text-[10px]">{f.weathers.map(w=><span className={weather?.kind===w?'text-[#bcdfbc]':'text-[#8096a1]'} key={w}>{WEATHER_LABELS[w]}{weather?.kind===w?' · 活跃':''}</span>)}</div>{seen&&<p className="fish-note mt-1">{f.blurb}</p>}</div>;})}</div>
                </>}
                {tab==='board'&&<>
                    <div className="flex gap-4">{([['prices','鱼类行情'],['listings','挂板出售'],['requests','需求区']] as const).map(([id,label])=><button className={`border-b pb-2 ${boardTab===id?'border-[#a7cebd] text-[#dfeee4]':'border-transparent text-[#8096a1]'}`} key={id} onClick={()=>setBoardTab(id)}>{label}</button>)}</div>
                    <p className="fish-note mt-3">这张板只属于你和你的角色。每人初始 1,000 鳞币，各自消费；不会与其他用户连通。</p>
                    {boardTab==='prices'?<div className="mt-4">
                        <div className="mb-3 flex items-center justify-between"><span className="text-[12px]">今日参考收购价</span><span className="fish-note">{new Date(now).toLocaleDateString()} · 每日结算</span></div>
                        {FISH_CATALOG.filter(f=>f.category==='fish').map(f=>{const price=state.prices[f.id]||f.basePrice;const before=state.previousPrices[f.id]||price;const delta=Math.round((price/before-1)*100);return <div className="flex items-center gap-3 border-t border-[#c8e0ea15] py-2.5" key={f.id}><FishArt speciesId={f.id} size={78}/><div className="flex-1"><div className="text-[12px]">{f.name}</div><div className="fish-note">{rarityLabel[f.rarity]}</div></div><div className="text-right"><div className="text-[17px] tabular-nums text-[#d8c7a9]">{price}</div><div className={`text-[10px] ${delta>0?'text-[#daa58d]':delta<0?'text-[#a9c5b3]':'text-[#8b9fa9]'}`}>{delta>0?'↑':delta<0?'↓':'—'} {Math.abs(delta)}% 昨日</div></div></div>;})}
                        <p className="fish-note mt-3">参考价每天变化，各家的市场独立演算。二星与三星鱼获按品质加价；在收藏里可直接按行情卖出。</p>
                    </div>:<>
                        <div className="my-4 flex items-center justify-between gap-2"><button className="fish-action primary" onClick={()=>beginPost(boardTab==='listings'?'listing':'item')}><Plus size={14}/>{boardTab==='listings'?'挂一件东西':'发一张需求'}</button><button className="fish-action" disabled={busy||now-(state.lastPulseAt||0)<1_800_000} onClick={()=>void act(s=>runLocalMarketPulse(s),()=>setNow(Date.now()))}>看看路人</button></div>
                        <div className="space-y-3">{(boardTab==='listings'?list:requests).map(postRow)}</div>
                        {!(boardTab==='listings'?list:requests).length&&<p className="fish-note py-10 text-center">还没有便笺，来贴第一张吧。</p>}
                        <p className="fish-note mt-4">便笺在成交、主动撤下或 24 小时后收入发帖方档案。路人每半小时最多出现一次；回复只聊天，不会自动扣钱。</p>
                    </>}
                    {characterTripControls('market')}
                </>}
                {tab==='archive'&&<>
                    {viewPicker}
                    <h2 className="mt-4 text-[14px]">{actor.name} 的往期便笺</h2>
                    <p className="fish-note mt-1">已下板的原文、回复和结果都留在这里。</p>
                    <div className="mt-4 space-y-3">{archive.slice(archivePage*12,archivePage*12+12).map(postRow)}</div>
                    {!archive.length&&<p className="fish-note py-7 text-center">暂时没有封存便笺。</p>}
                    {archive.length>12&&<div className="mt-3 flex justify-between"><button className="fish-action" disabled={archivePage===0} onClick={()=>setArchivePage(p=>p-1)}>上一页</button><button className="fish-action" disabled={(archivePage+1)*12>=archive.length} onClick={()=>setArchivePage(p=>p+1)}>下一页</button></div>}
                    <h2 className="fish-divider mt-5 pt-4 text-[14px]">最近事件</h2>
                    <div className="mt-2 divide-y divide-[#c8e0ea12]">{state.ledger.filter(e=>e.participants.includes(actor.id)).slice(-30).reverse().map(e=><div className="py-3" key={e.id}><p className="text-[12px] leading-6">{e.text}</p><div className="fish-note">{new Date(e.at).toLocaleString()}</div></div>)}</div>
                </>}
            </div>
        </main>
        {selectedCatch&&(()=>{const c=state.inventory.find(item=>item.id===selectedCatch.id);if(!c)return null;const f=speciesById(c.speciesId)!;const mine=c.ownerId==='user';const free=availableCatches(state,'user').some(item=>item.id===c.id);
            const collectionAct=(action:'sell'|'release'|'display'|'study'|'incubate')=>void act(s=>handleCollection(s,user,c.id,action),()=>setSelectedCatch(null));
            return <Sheet title={f.name} onClose={()=>setSelectedCatch(null)}>
                <div className="flex justify-center py-2"><FishArt speciesId={c.speciesId} size={240} animated/></div>
                <div className="text-center text-[13px]">{rarityLabel[f.rarity]} · {c.sizeCm} cm · {'✦'.repeat(c.quality)}</div><p className="fish-note mt-2 text-center">{f.blurb}</p>
                <p className="fish-note mt-3">{c.ownerName} 的收藏 · {c.weatherLabel} · {c.weatherSource==='real'?'真实天气':'模拟天气'}</p>
                {error&&<p role="alert" className="mt-2 text-[12px] text-amber-100">{error}</p>}
                {mine&&<div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={busy||!free} className="fish-action primary" onClick={()=>collectionAct('sell')}>按行情卖出 · {catchValue(state,c)}</button>
                    <button disabled={busy||!free} className="fish-action" onClick={()=>{setSelectedCatch(null);beginPost('listing',c.id);}}>自己定价挂板</button>
                    <button disabled={busy||!free} className="fish-action" onClick={()=>collectionAct('display')}>{c.displayed?'收起陈列':'放进陈列'}</button>
                    {f.category==='time-relic'&&<button disabled={busy||!free||c.studied} className="fish-action" onClick={()=>collectionAct('study')}>{c.studied?'已记录观察':'制作观察记录'}</button>}
                    {c.speciesId==='dinosaur-egg'&&(c.incubatingUntil?<button disabled={busy||c.incubatingUntil>now} className="fish-action" onClick={()=>void act(s=>hatchEgg(s,user,c.id),()=>setSelectedCatch(null))}>{c.incubatingUntil>now?'孵化剩余 '+countdown(c.incubatingUntil,now):'揭晓孵化结果'}</button>:<button disabled={busy||!free} className="fish-action" onClick={()=>collectionAct('incubate')}>孵化 · 6 小时</button>)}
                    <button disabled={busy||!free} className="fish-action" onClick={()=>collectionAct('release')}>放生</button>
                </div>}
                {c.displayed&&<p className="fish-note mt-3">已放在自己的水域陈列架。</p>}
            </Sheet>;
        })()}
        {compose&&<Sheet title={compose==='listing'?'挂一件东西':'贴一张需求'} onClose={()=>setCompose(null)}>
            {compose!=='listing'&&<div className="mb-3 flex gap-2">{([['item','求鱼 / 恐龙'],['favor','招募 / 玩笑'],['tip','给我钱']] as const).map(([id,label])=><button className={`fish-action ${compose===id?'primary':''}`} key={id} onClick={()=>{setCompose(id);setDraft(d=>({...d,price:id==='tip'?'10':'0'}));}}>{label}</button>)}</div>}
            <div className="space-y-3">
                {compose==='listing'?<label className="block fish-note">商品<select className="fish-input mt-1" value={draft.catchId} onChange={e=>{const c=state.inventory.find(c=>c.id===e.target.value);setDraft(d=>({...d,catchId:e.target.value,price:c?String(catchValue(state,c)):'0'}));}}><option value="">自定义文字商品（没有实物）</option>{availableCatches(state,'user').map(c=><option key={c.id} value={c.id}>{speciesById(c.speciesId)?.name} · {c.sizeCm}cm</option>)}</select></label>:compose==='item'?<label className="block fish-note">需要的物种<select className="fish-input mt-1" value={draft.speciesId} onChange={e=>setDraft(d=>({...d,speciesId:e.target.value}))}>{FISH_CATALOG.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>:null}
                {(compose==='listing'&&!draft.catchId||compose==='favor'||compose==='tip')&&<label className="block fish-note">便笺标题<input className="fish-input mt-1" maxLength={40} value={draft.label} placeholder={compose==='tip'?'给我钱':'例如：出售一个响指 / 求一句鼓励'} onChange={e=>setDraft(d=>({...d,label:e.target.value}))}/></label>}
                <label className="block fish-note">{compose==='tip'?'希望收到的打赏（对方付款）':'金额（鳞币，可以 0）'}<input aria-label="金额" className="fish-input mt-1" type="number" min={0} max={1000000} step={1} value={draft.price} onChange={e=>setDraft(d=>({...d,price:e.target.value}))}/></label>
                <textarea aria-label="便笺正文" className="fish-input" rows={3} maxLength={240} value={draft.body} placeholder="想说什么都可以，交易员也会破防。" onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/>
                <input aria-label="匿名笔名" className="fish-input" maxLength={24} value={draft.alias} placeholder="匿名笔名（留空显示自己的名字）" onChange={e=>setDraft(d=>({...d,alias:e.target.value}))}/>
                <p className="fish-note">{compose==='tip'?'有人响应时，对方把这笔鳞币转给你。':compose==='favor'?'有人提交文字后，你按出价付款；没有凭空创建道具。':'实体藏品按库存交付，自定义商品只是一段自愿的文字约定。'} · 有效期 24 小时。</p>
                {error&&<p role="alert" className="text-[12px] text-amber-100">{error}</p>}
                <button className="fish-action primary w-full" disabled={busy} onClick={publish}>贴上布告板</button>
            </div>
        </Sheet>}
        {activePost&&<Sheet title={activePost.itemLabel} onClose={()=>setSelectedPost(null)}>
            <div className="fish-note">{ownerName(activePost)} · {activePost.status==='open'?countdown(activePost.expiresAt,now)+' 后封存':statusLabel[activePost.status]}</div>
            <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-7">{'price' in activePost?activePost.note:activePost.body}</p>
            <div className="mt-3 text-[19px] text-[#d4c4a4]">{'price' in activePost?activePost.price:activePost.offer} <small className="text-[11px]">鳞币</small></div>
            {'submission' in activePost&&activePost.submission&&<p className="fish-note mt-2">交付内容：{activePost.submission}</p>}
            <div className="fish-divider mt-4 space-y-3 pt-3">{activePost.comments.map(c=><div key={c.id} className="text-[12px] leading-6"><span className="text-[#acd1bf]">{c.alias||c.authorName}</span>：<span className="whitespace-pre-wrap break-words">{c.content}</span></div>)}</div>
            {activePost.status==='open'&&<><textarea aria-label="回复或交付内容" className="fish-input mt-3" rows={2} value={postText} maxLength={240} placeholder="回复一句；招募需求也用这里填写交付内容。" onChange={e=>setPostText(e.target.value)}/>
                <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy||!postText.trim()} className="fish-action" onClick={()=>void act(s=>commentOnPost(s,activePost.id,user,postText),()=>setPostText(''))}>回复</button>
                {ownerId(activePost)==='user'?<button disabled={busy} className="fish-action" onClick={()=>void act(s=>removeMarketPost(s,activePost.id,'user'))}>撤下并存档</button>:<button disabled={busy} className="fish-action primary" onClick={()=>void act(s=>'price' in activePost?buyListing(s,activePost.id,user):fulfillRequest(s,activePost.id,user,postText))}>{'price' in activePost?'买下':activePost.kind==='tip'?'给 ta 鳞币':activePost.kind==='favor'?'交付这段内容':'交付藏品'}</button>}</div></>}
            {error&&<p role="alert" className="mt-3 text-[12px] text-amber-100">{error}</p>}
            {activePost.alias&&ownerId(activePost)==='user'&&<p className="fish-note mt-3">你的匿名发帖。角色在板上只看到笔名。</p>}
        </Sheet>}
    </div>;
};
const Sheet:React.FC<{title:string;onClose:()=>void;children:React.ReactNode}> = ({title,onClose,children})=><div className="absolute inset-0 z-30 flex items-end justify-center bg-[#02080cb3] px-2 pt-16" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <section className="fish-reveal max-h-full w-full max-w-[540px] overflow-y-auto rounded-t-2xl bg-[#1b303d] px-5 pt-4" style={{paddingBottom:'calc(var(--safe-bottom) + 1.5rem)'}} onClick={e=>e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[16px]">{title}</h2><button className="fish-action !border-0 !p-2" aria-label="关闭详情" onClick={onClose}><X size={18}/></button></div>{children}
    </section>
</div>;
export default FishingMarketOverlay;
