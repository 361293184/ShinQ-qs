import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='output/dino-garden-qa';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
await page.goto('http://127.0.0.1:5182/prototypes/dino-cafe/index.html');await page.waitForSelector('.clay-app[data-ready="true"]',{timeout:60000});await page.waitForTimeout(400);
await page.screenshot({path:`${dir}/grassland-390.png`});
await page.getByRole('button',{name:'换色 ◌',exact:true}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'配色蓝莓酪',exact:true}).click();await page.waitForTimeout(150);await page.screenshot({path:`${dir}/paint-390.png`});
await page.getByRole('button',{name:'就用这个颜色'}).click();
await page.getByRole('button',{name:'正在做…',exact:true}).click();await page.getByRole('button',{name:'等待',exact:true}).click();await page.getByLabel('小剧场描述',{exact:true}).fill('坚信薄荷欠自己一块饼干。');await page.getByRole('button',{name:'把这句留在桌上'}).click();
await page.reload();await page.waitForSelector('.clay-app[data-ready="true"]');
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));let s=await state();assert.equal(s.residents.find(t=>t.id===s.selected).paint.body,'#9295bf');assert.match(s.residents.find(t=>t.id===s.selected).stage.text,/饼干/);
async function moveAndRestoreOnMap(){
  const current=await state(),id=current.selected,old=current.residents.find(t=>t.id===id).pose;
  const destination=current.floorTargets.find(c=>c.available&&c.id!==old.slotId&&c.screen.x>70&&c.screen.x<310&&c.screen.y>230&&c.screen.y<520);
  assert.ok(destination);
  for(const cell of [destination,current.floorTargets.find(c=>c.id===old.slotId)]){
    await page.getByRole('button',{name:'挪个位置',exact:true}).click();
    await page.touchscreen.tap(cell.screen.x,cell.screen.y);
    await page.waitForFunction(({id,slot})=>JSON.parse(window.render_game_to_text()).residents.find(t=>t.id===id)?.pose.slotId===slot,{id,slot:cell.id});
  }
}
await page.getByRole('button',{name:'来访',exact:true}).click();await page.getByLabel('共同摆弄',{exact:true}).click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).visits===true);await page.getByLabel('选择来访角色',{exact:true}).selectOption('sample-visitor');await page.getByRole('button',{name:'请 ta 来看看'}).click();await page.waitForTimeout(200);s=await state();assert.equal(s.events.at(-1).actorKind,'character');
await page.getByRole('button',{name:/件新变化/}).click();await page.screenshot({path:`${dir}/visit-390.png`});await page.getByRole('button',{name:'还原这次改动'}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).last().click();s=await state();assert.match(s.residents.find(t=>t.id===s.selected).stage.text,/饼干/);
await page.getByRole('button',{name:'溪边草原 ⌄',exact:true}).click();await page.getByRole('button',{name:/贝壳海岸/}).click();await page.waitForTimeout(250);await page.screenshot({path:`${dir}/coast-390.png`});
assert.equal((await state()).floorTargets.find(c=>c.id==='E1').available,false);await moveAndRestoreOnMap();
await page.getByRole('button',{name:'贝壳海岸 ⌄',exact:true}).click();await page.getByRole('button',{name:/火山探险/}).click();await page.waitForTimeout(350);await page.screenshot({path:`${dir}/volcano-390.png`});
await moveAndRestoreOnMap();
await page.getByRole('button',{name:'火山探险 ⌄',exact:true}).click();await page.getByRole('button',{name:/溪边草原/}).click();await page.waitForTimeout(250);
s=await state();const moving=s.selected,old=s.residents.find(t=>t.id===moving).pose;const cell=s.floorTargets.find(c=>c.available&&c.id!==old.slotId&&c.screen.y>230&&c.screen.y<540);
assert.ok(cell);await page.getByRole('button',{name:'挪个位置',exact:true}).click();await page.waitForTimeout(100);await page.screenshot({path:`${dir}/hidden-grid-390.png`});await page.touchscreen.tap(cell.screen.x,cell.screen.y);await page.waitForTimeout(150);s=await state();assert.equal(s.residents.find(t=>t.id===moving).pose.slotId,cell.id);
await page.getByRole('button',{name:'转向 ↻',exact:true}).click();await page.waitForTimeout(100);s=await state();assert.ok(Math.abs(s.residents.find(t=>t.id===moving).pose.rotation/(Math.PI/4)-Math.round(s.residents.find(t=>t.id===moving).pose.rotation/(Math.PI/4)))<1e-8);
await page.reload();await page.waitForSelector('.clay-app[data-ready="true"]');s=await state();assert.equal(s.residents.find(t=>t.id===moving).pose.slotId,cell.id);assert.equal(s.maps.length,3);assert.ok(s.maps.every(m=>m.count<=6));
// Cancelling a colour preview must restore the saved material, including after a map move.
const saved=s.residents.find(t=>t.id===s.selected).paint;
await page.getByRole('button',{name:'换色 ◌',exact:true}).click();await page.getByRole('button',{name:'配色可可豆',exact:true}).click();await page.getByRole('button',{name:'关闭面板',exact:true}).last().click();s=await state();assert.deepEqual(s.residents.find(t=>t.id===s.selected).paint,saved);
await page.getByRole('button',{name:'图鉴',exact:true}).first().click();await page.screenshot({path:`${dir}/catalog-390.png`});
for(const name of ['迅猛龙','棘龙','副栉龙','无齿翼龙','蛇颈龙','恐龙蛋','恐龙骨架']){await page.getByRole('button',{name:new RegExp(`^${name}`)}).click();await page.waitForTimeout(250);await page.screenshot({path:`${dir}/model-${name}.png`});await page.getByRole('button',{name:'关闭面板',exact:true}).last().click();}
await page.getByRole('button',{name:'箱庭',exact:true}).click();await page.setViewportSize({width:320,height:740});await page.waitForTimeout(200);await page.screenshot({path:`${dir}/garden-320.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);await page.screenshot({path:`${dir}/garden-landscape.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),844);
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'还原视角'}).click();await page.waitForTimeout(150);s=await state();
const azimuth=s.render.azimuth;const touch=await page.context().newCDPSession(page);
await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:420}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:270,y:430}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);assert.notEqual((await state()).render.azimuth,azimuth);
await fs.writeFile(`${dir}/state.json`,JSON.stringify({state:await state(),errors},null,2));assert.deepEqual(errors,[]);console.log('Garden mobile save, paint, stage, visit, undo, themes and collection checks passed.');
}finally{if(errors.length)console.log(errors);await browser.close();}
