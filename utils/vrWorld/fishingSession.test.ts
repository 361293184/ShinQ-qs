import { beforeEach, expect, it, vi } from 'vitest';
import { runVRSession } from './runSession';
import { DB } from '../db';
import { safeFetchJson } from '../safeApi';
import { buildChatRequestPayload } from '../chatRequestPayload';
import { createFishingMarketState, ensureActorAccounts, createRequest, readFishingMarketState, saveFishingMarketState } from './fishingMarket';
import { collectSARLocalBackup, restoreSARLocalBackup } from './sarBackup';
import {ensureDinosaurGarden,setGardenVisits,editDino,gardenResidents,findGardenSpace} from './dinosaurGarden';
const mocks=vi.hoisted(()=>({messages:[] as any[],board:{id:'board',messages:[] as any[],updatedAt:0}}));
vi.mock('../db',()=>({DB:{
    getVRNovels:vi.fn(async()=>[]),getVRMusicRoom:vi.fn(async()=>null),getEmojis:vi.fn(async()=>[]),getEmojiCategories:vi.fn(async()=>[]),
    getRecentMessagesByCharId:vi.fn(async(id:string)=>mocks.messages.filter(m=>m.charId===id)),getVRCardsByCharId:vi.fn(async(id:string)=>mocks.messages.filter(m=>m.charId===id)),
    saveMessage:vi.fn(async(m:any)=>{mocks.messages.push(m);return 1;}),getVRGuestbook:vi.fn(async()=>mocks.board),saveVRGuestbook:vi.fn(async(b:any)=>{mocks.board=b;}),
}}));
vi.mock('../chatRequestPayload',()=>({buildChatRequestPayload:vi.fn(async()=>({systemPrompt:'ORIGINAL PERSONA',cleanedApiMessages:[]}))}));
vi.mock('../safeApi',()=>({safeFetchJson:vi.fn()}));
vi.mock('../memoryPalace/autoArchive',()=>({processNewMessagesWithAutoArchive:vi.fn(async()=>{})}));
vi.mock('../../context/MusicContext',()=>({loadMusicCfgStandalone:vi.fn(()=>({}))}));
vi.mock('./vrApi',()=>({getVRApi:vi.fn(async()=>null),logVRApiCall:vi.fn()}));
const a={id:'a',name:'艾文',vrState:{enabled:true,intervalMinutes:120},memoryPalaceEnabled:false} as any;
const b={id:'b',name:'旁边那位',vrState:{enabled:true,intervalMinutes:120}} as any;
const deps={char:a,characters:[a,b],userProfile:{name:'用户'} as any,apiConfig:{baseUrl:'https://model.invalid/v1',apiKey:'fake',model:'test'} as any,groups:[],updateCharacter:vi.fn(),forcedRoom:'sar' as const,manual:true};
const answer=(text:string)=>vi.mocked(safeFetchJson).mockResolvedValue({choices:[{message:{content:text}}]});
beforeEach(()=>{localStorage.clear();mocks.messages=[];mocks.board={id:'board',messages:[],updatedAt:0};vi.clearAllMocks();saveFishingMarketState({...ensureActorAccounts(createFishingMarketState(42),[{id:'a',name:'艾文',kind:'character'},{id:'b',name:'旁边那位',kind:'character'},{id:'user',name:'用户',kind:'user'}]),lastPulseAt:Date.now()});});
it('one fishing call decides catch reaction and guestbook; quoted brag cannot replace canonical catch',async()=>{
    answer('<NOTE>鱼线抖了一下。</NOTE><DECISION>guestbook</DECISION><WORDS>我钓起了整个太阳！</WORDS>');
    expect(await runVRSession({...deps,forcedSARActivity:'fishing'})).toMatchObject({ok:true});expect(safeFetchJson).toHaveBeenCalledTimes(1);
    const s=readFishingMarketState();expect(s.inventory.filter(c=>c.ownerId==='a')).toHaveLength(1);expect(mocks.board.messages[0].content).toBe('我钓起了整个太阳！');
    const card=mocks.messages.find(m=>m.metadata?.fishing);expect(card.metadata.fishing.speciesId).toBe(s.inventory[0].speciesId);expect(card.content).toContain('非事实断言');expect(card.content).toContain('我钓起了整个太阳！');
    const payload=JSON.parse((vi.mocked(safeFetchJson).mock.calls[0][1] as any).body);expect(payload.messages[0].content).toContain('ORIGINAL PERSONA');expect(payload.messages.at(-1).content).toContain('程序判定的唯一鱼获');
});
it('same fishing call can zero-price list, privately share or release',async()=>{
    for(const decision of ['market','dm','release']){
        answer(`<NOTE>这一竿有意思。</NOTE><DECISION>${decision}</DECISION><PRICE>0</PRICE><WORDS>快看！</WORDS>`);
        expect((await runVRSession({...deps,forcedSARActivity:'fishing'})).ok).toBe(true);
    }
    expect(safeFetchJson).toHaveBeenCalledTimes(3);const s=readFishingMarketState();expect(s.inventory).toHaveLength(2);expect(s.listings[0].price).toBe(0);
    expect(mocks.messages.some(m=>m.metadata?.privateWords==='快看！')).toBe(true);
});
it('completed tip reaches both characters and the next call can react to what actually happened',async()=>{
    let s=readFishingMarketState();s=createRequest(s,{id:'b',name:'旁边那位',kind:'character'},undefined,'给我钱',30,'给我钱！！',Date.now(),'tip');saveFishingMarketState(s);
    answer(`<NOTE>还真敢要钱。</NOTE><ACTION>fulfill</ACTION><TARGET>${s.requests[0].id}</TARGET><WORDS>拿好</WORDS><SHARE>none</SHARE>`);
    expect((await runVRSession({...deps,forcedSARActivity:'market'})).ok).toBe(true);
    expect(readFishingMarketState().accounts).toMatchObject({a:970,b:1030});
    expect(mocks.messages.some(m=>m.charId==='b'&&m.content.includes('真的给')&&m.content.includes('给我钱！！'))).toBe(true);
    answer('<NOTE>居然真有人给了！</NOTE><ACTION>browse</ACTION><SHARE>guestbook</SHARE><SHARE_WORDS>我要了30块，居然真收到了！</SHARE_WORDS>');
    expect((await runVRSession({...deps,char:b,forcedSARActivity:'market'})).ok).toBe(true);
    const body=JSON.parse((vi.mocked(safeFetchJson).mock.calls[1][1] as any).body);expect(body.messages.at(-1).content).toContain('打赏了 30');
    expect(vi.mocked(buildChatRequestPayload).mock.calls[1][0].historyMsgs.some(m=>m.content.includes('打赏了 30'))).toBe(true);
    expect(mocks.board.messages.at(-1)?.content).toContain('居然真收到了');expect(safeFetchJson).toHaveBeenCalledTimes(2);
});
it('invalid action does not pay or broadcast an invented success',async()=>{
    answer('<NOTE>我要买</NOTE><ACTION>buy</ACTION><TARGET>nonexistent</TARGET><SHARE>guestbook</SHARE><SHARE_WORDS>我已买走整个世界！</SHARE_WORDS>');
    expect((await runVRSession({...deps,forcedSARActivity:'market'})).ok).toBe(true);expect(mocks.board.messages).toHaveLength(0);
    expect(readFishingMarketState().accounts.a).toBe(1000);expect(mocks.messages.at(-1).content).toContain('未成交');
});
it('empty model output never mints a fish or fabricates a character decision',async()=>{
    answer('');expect((await runVRSession({...deps,forcedSARActivity:'fishing'})).ok).toBe(false);expect(readFishingMarketState().inventory).toHaveLength(0);
});
it('preserves original no-water room prompt behavior and does not initialize fishing storage',async()=>{
    localStorage.clear();answer('<ACTIVITY>散步</ACTIVITY>');await runVRSession({...deps,forcedRoom:'gym'});
    expect(localStorage.getItem('vr_fishing_market_v1')).toBeNull();const payload=JSON.parse((vi.mocked(safeFetchJson).mock.calls[0][1] as any).body);expect(payload.messages[0].content).not.toContain('鳞币');expect(payload.messages[0].content).not.toContain('布告板');
});
it('backups preserve valid and malformed fishing data without blocking recovery exports',()=>{
    const s=readFishingMarketState();const backup=collectSARLocalBackup();localStorage.clear();restoreSARLocalBackup(backup,{replaceMissing:false});expect(readFishingMarketState()).toEqual(s);
    localStorage.setItem('vr_fishing_market_v1','corrupt-data');const corrupt=collectSARLocalBackup();expect(corrupt.fishingMarketRaw).toBe('corrupt-data');localStorage.clear();restoreSARLocalBackup(corrupt,{replaceMissing:false});expect(localStorage.getItem('vr_fishing_market_v1')).toBe('corrupt-data');
});
it('garden uses the real persona flow for one grid action and saves its factual event',async()=>{
    const user={id:'user',name:'用户',kind:'user' as const};let s=setGardenVisits(ensureDinosaurGarden(readFishingMarketState(),user),true,user);
    const id=gardenResidents(s)[0].catchId,spot=findGardenSpace(s,'new');saveFishingMarketState(s);
    answer(JSON.stringify({action:'move',toyId:id,slotId:spot.slotId,words:'去桥边等吧。'}));
    expect(await runVRSession({...deps,forcedSARActivity:'garden'})).toMatchObject({ok:true});expect(safeFetchJson).toHaveBeenCalledTimes(1);
    s=readFishingMarketState();expect(s.dinosaurGarden!.toys[id].pose?.slotId).toBe(spot.slotId);
    expect(mocks.messages.some(m=>m.content.includes('去桥边等吧。'))).toBe(true);
    const body=JSON.parse((vi.mocked(safeFetchJson).mock.calls[0][1] as any).body);expect(body.messages[0].content).toContain('ORIGINAL PERSONA');expect(body.messages.at(-1).content).toContain('隐藏棋盘');expect(body.messages.at(-1).content).not.toContain('钱包');
});
it('garden rejects malformed output without a fake visit, and disabled co-editing does not call a model',async()=>{
    const user={id:'user',name:'用户',kind:'user' as const};let s=ensureDinosaurGarden(readFishingMarketState(),user);saveFishingMarketState(s);
    expect((await runVRSession({...deps,forcedSARActivity:'garden'})).ok).toBe(false);expect(safeFetchJson).not.toHaveBeenCalled();
    s=setGardenVisits(s,true,user);saveFishingMarketState(s);const count=s.dinosaurGarden!.events.length;
    answer('我已经把整张桌子卖掉了！');expect((await runVRSession({...deps,forcedSARActivity:'garden'})).ok).toBe(false);
    expect(readFishingMarketState().dinosaurGarden!.events).toHaveLength(count);
});
