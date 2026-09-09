import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/sar-art-qa';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),art=url.pathname.match(/SAR\/(Caian|Aiven)\/([^/]+\.png)$/);
    if(art){requests.push(url.href);return route.fulfill({status:200,contentType:'image/png',body:await fs.readFile(`${out}/assets/SAR_${art[1]}_${art[2]}`)});}
    return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.fulfill({status:200,body:'',headers:{'access-control-allow-origin':'*'}});
});
const imageReady=()=>page.waitForFunction(()=>{const box=document.querySelector('.is-speaking .sar-npc-portrait')||document.querySelector('.sar-npc-portrait');const img=box?.querySelector('img:not(.sar-npc-portrait__pending)');return box?.getAttribute('aria-busy')==='false'&&img?.complete&&img.naturalWidth>100;});
const frameGeometry=()=>page.evaluate(()=>['.sar-dialogue-portraits','.sar-dialogue-panel','.cast-caian','.cast-aiven'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
async function checkHeadroom(){
    const gaps=await page.evaluate(()=>{const top=document.querySelector('.sar-dialogue-portraits').getBoundingClientRect().top;return [...document.querySelectorAll('.sar-dialogue-cast__actor')].map(el=>el.getBoundingClientRect().top-top);});
    assert.ok(gaps.every(gap=>Math.abs(gap-24)<.1),'Both portraits keep 24px headroom at the approved layout.');
}
async function untilChoice(label){
    const initial=await frameGeometry();
    for(let i=0;i<55;i++){
        assert.deepEqual(await frameGeometry(),initial,'Dialogue text and choices must not move the stage or resize the dialogue box.');
        if(await page.getByRole('button',{name:label,exact:true}).count()){
            await page.waitForTimeout(220);
            const floating=await page.locator('.sar-dialogue-choices__list').evaluate(el=>{const r=el.getBoundingClientRect(),stage=el.closest('.sar-npc-dialogue').getBoundingClientRect();return {insideDialogue:!!el.closest('.sar-dialogue-panel'),dx:Math.abs(r.x+r.width/2-stage.x-stage.width/2),dy:Math.abs(r.y+r.height/2-stage.y-stage.height/2)};});
            assert.equal(floating.insideDialogue,false);assert.ok(floating.dx<1&&floating.dy<1);return;
        }
        await page.getByRole('button',{name:'继续对话',exact:true}).click();
    }
    throw Error('Missing dialogue choice: '+label);
}
async function inspectPlacement(){
    const state=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));assert.ok(state.actors.every(a=>a.valid));assert.equal(state.facilities.length,6);
    const alignment=await page.evaluate(()=>{
        const canvas=document.querySelector('.sar-room-canvas').getBoundingClientRect();return [...document.querySelectorAll('[data-actor-id]')].map(el=>{
            const rect=el.getBoundingClientRect();return {dx:Math.abs((rect.x+rect.width/2-canvas.x)/canvas.width*1348-Number(el.dataset.footX)),dy:Math.abs((rect.bottom-canvas.y)/canvas.height*2439-Number(el.dataset.footY))};
        });
    });assert.ok(alignment.every(p=>p.dx<1&&p.dy<1));
}
try{
    await page.goto('http://127.0.0.1:5182/prototypes/sar-art/index.html',{waitUntil:'domcontentloaded'});await page.locator('[data-actor-id]').first().waitFor();await page.waitForTimeout(200);
    await inspectPlacement();assert.equal(requests.length,0);await page.screenshot({path:`${out}/room-390.png`});
    for(const id of ['board','modules','cabinet','gacha','water','garden']){await page.locator(`[data-facility="${id}"]`).tap();assert.equal(await page.getByTestId('last-action').textContent(),id);}
    await page.getByRole('button',{name:'与凯恩交谈',exact:true}).tap();await imageReady();await page.screenshot({path:`${out}/caian-happy-390.png`});
    await untilChoice('你谁啊');await page.screenshot({path:`${out}/centered-choices-390.png`});await page.getByRole('button',{name:'你谁啊',exact:true}).click();await untilChoice('SAR 是什么？');await page.getByRole('button',{name:'SAR 是什么？',exact:true}).click();
    for(let i=0;i<3;i++)await page.getByRole('button',{name:'继续对话',exact:true}).click();await imageReady();assert.equal(await page.locator('.is-speaking .sar-npc-portrait').getAttribute('data-speaker'),'aiven');await page.screenshot({path:`${out}/aiven-in-intro.png`});
    // The listening character reacts during Aiven's line, not one click later.
    for(let i=0;i<4;i++)await page.getByRole('button',{name:'继续对话',exact:true}).click();
    assert.equal(await page.locator('.sar-dialogue-panel p').textContent(),'这里似乎没有仿生人。');
    await page.waitForFunction(()=>{const face=document.querySelector('.cast-caian .sar-npc-portrait');const img=face?.querySelector('img:not(.sar-npc-portrait__pending)');return face?.dataset.expression==='embarrassed'&&img?.src.endsWith('/embarrassed.png')&&img.complete;});
    assert.equal(await page.locator('.cast-caian.is-speaking').count(),0);await page.screenshot({path:`${out}/caian-listening-embarrassed.png`});
    await page.getByRole('button',{name:'继续对话',exact:true}).click();assert.equal(await page.locator('.cast-caian .sar-npc-portrait').getAttribute('data-expression'),'embarrassed');
    await untilChoice('仿生人是什么？');await page.getByRole('button',{name:'仿生人是什么？',exact:true}).click();await untilChoice('是什么样的仿生人？');await page.getByRole('button',{name:'是什么样的仿生人？',exact:true}).click();await imageReady();
    await page.waitForFunction(()=>document.querySelector('.is-speaking .sar-npc-portrait img:not(.sar-npc-portrait__pending)')?.src.includes('aboutaster.png'));
    await page.waitForFunction(()=>{const face=document.querySelector('.cast-aiven .sar-npc-portrait');return face?.dataset.expression==='sad'&&face.querySelector('img:not(.sar-npc-portrait__pending)')?.src.endsWith('/sad.png');});await page.screenshot({path:`${out}/caian-aboutaster-390.png`});
    await checkHeadroom();const portraitWidth=await page.locator('.cast-caian').evaluate(el=>el.getBoundingClientRect().width);
    await page.setViewportSize({width:600,height:844});await checkHeadroom();assert.ok(Math.abs(await page.locator('.cast-caian').evaluate(el=>el.getBoundingClientRect().width)-portraitWidth)<.1,'Width-only resizing must not enlarge the portraits.');
    await page.setViewportSize({width:320,height:740});await checkHeadroom();await page.screenshot({path:`${out}/dialogue-320.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
    await page.setViewportSize({width:844,height:390});await checkHeadroom();await page.screenshot({path:`${out}/dialogue-landscape.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),844);
    await page.getByRole('button',{name:'暂时离开对话'}).click();await page.setViewportSize({width:320,height:740});await page.waitForTimeout(100);await inspectPlacement();await page.screenshot({path:`${out}/room-320.png`});
    for(const id of ['cabinet','gacha','garden']){await page.locator(`[data-facility="${id}"]`).tap();assert.equal(await page.getByTestId('last-action').textContent(),id);}
    await page.getByRole('button',{name:'与艾文交谈',exact:true}).tap();await imageReady();await page.getByRole('button',{name:'聊聊恐龙',exact:true}).click();await imageReady();await page.screenshot({path:`${out}/aiven-garden-320.png`});await page.getByRole('button',{name:'看看恐龙箱庭',exact:true}).click();assert.equal(await page.getByTestId('last-action').textContent(),'garden');
    await page.getByRole('button',{name:'NPC 显示',exact:true}).click();assert.equal(await page.locator('.sar-room-person.is-npc').count(),0);
    // Every supplied image is addressable without preloading the whole pack in the room.
    for(const who of ['caian','aiven']){
        await page.goto(`http://127.0.0.1:5182/prototypes/sar-art/index.html?portrait=${who}`);const expressions=await page.getByRole('button').allTextContents();
        for(const expression of expressions){await page.getByRole('button',{name:expression,exact:true}).click();await page.waitForFunction(e=>document.querySelector('.sar-npc-portrait img:not(.sar-npc-portrait__pending)')?.src.endsWith('/'+e+'.png'),expression);await page.screenshot({path:`${out}/${who}-${expression}.png`});}
    }
    // Complete provider-based entry: these are the same callbacks shipped in VRWorldApp.
    await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5182/test/fixtures/kanata.html?npcs=show',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'下一页房间',exact:true}).click({timeout:60000});await page.locator('.sar-room-person.is-npc').first().waitFor();await page.screenshot({path:`${out}/integrated-room.png`});
    await page.getByRole('button',{name:'与艾文交谈',exact:true}).tap();await imageReady();await page.getByRole('button',{name:'聊聊恐龙',exact:true}).click();await page.getByRole('button',{name:'看看恐龙箱庭',exact:true}).click();await page.waitForSelector('.clay-app[data-ready="true"]',{timeout:60000});await page.getByRole('button',{name:'返回 SAR 活动室'}).click();
    await page.getByRole('button',{name:'与凯恩交谈',exact:true}).tap();await imageReady();await page.getByRole('button',{name:'暂时离开对话'}).click();
    await page.getByRole('button',{name:'进入模块购买'}).tap();await page.locator('.sar-module-shop__guide img').waitFor();await page.screenshot({path:`${out}/integrated-modules.png`});
    assert.deepEqual(errors,[]);console.log('SAR artwork, all 13 expressions, mask alignment, six hotspots, NPC toggles and integrated dialogue → garden verified.');
}finally{await fs.writeFile(`${out}/qa-result.json`,JSON.stringify({errors,requestedPortraits:[...new Set(requests)]},null,2));await page.screenshot({path:`${out}/last.png`}).catch(()=>{});await browser.close();}
