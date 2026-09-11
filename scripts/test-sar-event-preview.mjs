import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const out='output/sar-event-preview';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
await context.addInitScript(()=>['gacha','water','garden','warehouse','shop','board','cabinet'].forEach(id=>localStorage.setItem('sar-facility-guide-'+id+'-v1','done')));
await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.fulfill({status:200,body:'',headers:{'access-control-allow-origin':'*'}}));
page.on('pageerror',e=>errors.push(e.message));
const button=name=>page.getByRole('button',{name,exact:true});
const view=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
try{
    await page.goto((process.env.SAR_QA_URL||'http://127.0.0.1:5173')+'/test/fixtures/kanata.html?npcs=show');
    await button('SAR').waitFor();
    const events=await page.evaluate(async()=>{
        const m=await import('/utils/vrWorld/fishingMarket.ts'),c=await import('/utils/vrWorld/sarFamiliarity/catalog.ts');
        localStorage.setItem('vr_sar_club_state_v1',JSON.stringify({version:1,updateSeenVersion:1,npcPreference:'show',caianMet:true}));
        m.saveFishingMarketState(m.createFishingMarketState(17));
        return c.FAMILIARITY_SCENES.filter(s=>s.kind==='event').map(s=>({npc:s.npc,id:s.id,title:s.title}));
    });
    assert.equal(events.length,6);
    await page.reload();await button('SAR').click();await button('打开仓库').click();await button('打开收集图鉴').click();await button('名册').click();
    for(const scene of events){
        await page.locator('.sar-roster-person-tabs button').filter({hasText:scene.npc==='caian'?'凯恩':'艾文'}).click();
        await page.getByRole('button',{name:/^回忆/}).click();
        assert.equal(await page.locator('.sar-roster-memory:enabled').count(),3);
        assert.equal(await page.locator('.sar-roster-topic-group .sar-roster-memory:enabled').count(),0);
        await page.screenshot({path:out+'/'+scene.npc+'-roster.png',animations:'disabled'});
        const saved=await page.evaluate(()=>localStorage.getItem('vr_fishing_market_v1'));
        await button('回顾'+scene.title).click();
        await page.waitForFunction(id=>{const s=JSON.parse(window.render_game_to_text());return s.mode==='sar-familiarity'&&s.scene===id&&!s.busy;},scene.id);
        assert.equal((await view()).preview,true);
        // Read one complete authored route, including membership and photo interactions.
        let steps=0;
        while(await page.locator('.srf-dialog').count()){
            assert(++steps<600,'preview must terminate');
            const state=await view();assert.equal(state.error,'');
            if(await page.locator('.sar-dialogue-choices__list button').count())await page.locator('.sar-dialogue-choices__list button').first().click();
            else if(await button('就用这个形象').count())await button('就用这个形象').click();
            else if(await button('拍好了').count())await button('拍好了').click();
            else if(await button('按下神秘按钮').count())await button('按下神秘按钮').click();
            else await button('继续对话').click();
            await page.waitForFunction(()=>!document.querySelector('.srf-dialog')||!JSON.parse(window.render_game_to_text()).busy);
        }
        assert.equal(await page.evaluate(()=>localStorage.getItem('vr_fishing_market_v1')),saved,'test replay must not grant rewards, save drafts, or complete events');
        console.log(scene.id+' complete: '+steps+' steps, no save changes');
    }
    assert.deepEqual(errors,[]);
    writeFileSync(out+'/report.json',JSON.stringify({events,errors,readOnly:true},null,2));
    console.log('Six temporary event previews passed, with real roster entry and interaction.');
}finally{await browser.close();}
