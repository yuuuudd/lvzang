import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../server.js';

// Each identity belongs to this temporary server, never the user's workspace.
const dir=await mkdtemp(join(tmpdir(),'travel-identity-menu-'));
const server=createApp({accountsEnabled:true,testRoles:true,accountDir:dir,key:'',tripoKey:'',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{throw Error('Menu regression forbids external requests');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const artifacts='artifacts/map-advisor';await mkdir(artifacts,{recursive:true});

try{
  for(const [width,height] of [[1146,704],[580,704],[390,360]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    const login=await context.request.post(origin+'/api/auth/experience',{headers:{Origin:origin},data:{role:'user'}});
    assert.equal(login.status(),200);
    const page=await context.newPage(),errors=[],mutations=[];
    page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST')mutations.push(new URL(request.url()).pathname);});
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/travel.html');
    const summary=page.locator('.identity-menu > summary'),panel=page.locator('.identity-panel');
    await summary.waitFor();await page.locator('#route-refresh').waitFor();
    await page.evaluate(()=>localStorage.setItem('identity-menu-regression','keep this local draft'));

    const geometry=()=>panel.evaluate(node=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
      const heading=node.querySelector(':scope > strong'),r=heading.getBoundingClientRect();
      const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
      return {viewport:{width:innerWidth,height:innerHeight},pageScroll:scrollY,panel:rect(node),toolbar:rect(document.getElementById('route-refresh-slot')),headingReceivesPointer:!!hit&&node.contains(hit),headingHit:hit?.id||hit?.className||hit?.tagName,scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight};
    });
    const checkVisiblePart=async label=>{
      const state=await geometry();console.log(JSON.stringify({width,height,label,...state}));
      assert.ok(state.headingReceivesPointer,`${label}: menu heading is covered by ${state.headingHit}`);
      assert.ok(state.panel.left>=0&&state.panel.right<=width+1,`${label}: menu stays inside viewport horizontally`);
      assert.ok(state.panel.top>=0&&state.panel.bottom<=height+1,`${label}: menu stays inside viewport vertically`);
    };
    await summary.click();
    assert.equal(await page.locator('.identity-menu').getAttribute('open'),'','The existing top control opens the identity menu');
    assert.equal(new URL(page.url()).pathname,'/travel.html','Opening the menu does not navigate');
    await checkVisiblePart('initial');
    for(const selector of ['[data-identity-role=user]','[data-identity-role=operator]','.identity-panel a[href="/collection.html#world/canvas"]','.identity-panel a[href="/orders.html"]','.identity-exit']){
      const item=page.locator(selector);
      // Real wheel input exposes items in the short-screen menu, without
      // manipulating scrollTop or forcing a click through another element.
      for(let attempt=0;attempt<6;attempt++){
        const visible=await item.evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('.identity-panel').getBoundingClientRect();return r.top>=Math.max(0,p.top)&&r.bottom<=Math.min(innerHeight,p.bottom);});
        if(visible)break;
        const box=await panel.boundingBox();await page.mouse.move(box.x+box.width/2,Math.min(height-8,box.y+box.height/2));await page.mouse.wheel(0,150);await page.waitForTimeout(80);
      }
      const reachable=await item.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return y>=0&&y<innerHeight&&!!hit&&(hit===node||node.contains(hit));});
      assert.ok(reachable,`${width}x${height}: ${selector} receives pointer input`);
      await item.click({trial:true});
    }
    if(height<500)assert.ok((await geometry()).scrollTop>0,'A short-screen user can wheel to the last menu option');
    await page.keyboard.press('Escape');assert.equal(await page.locator('.identity-menu').getAttribute('open'),null);
    assert.equal(await summary.evaluate(node=>node===document.activeElement),true,'Escape returns keyboard focus to the existing identity control');

    // Exercise the surrounding scroll path, then let the ordinary summary
    // click reveal the header. The non-sticky header need not stay onscreen.
    await page.mouse.move(Math.floor(width/2),height-30);await page.mouse.wheel(0,550);await page.waitForTimeout(120);
    await summary.click();
    await panel.evaluate(node=>node.querySelector(':scope > strong').scrollIntoView({block:'nearest'}));
    await checkVisiblePart('after page wheel and reopening');
    await page.screenshot({path:`${artifacts}/identity-menu-${width}x${height}.png`});
    assert.equal(await page.evaluate(()=>localStorage.getItem('identity-menu-regression')),'keep this local draft');
    assert.deepEqual(mutations,[],'Opening, scrolling and inspecting the menu does not change identity or submit planning requests');
    assert.deepEqual(errors,[]);
    // Keep the existing memories menu action usable; no new navigation rule
    // is imposed on the top-level summary.
    const memories=page.locator('.identity-panel a[href="/collection.html#world/canvas"]');
    await memories.click();await page.waitForURL('**/collection.html#world/canvas');
    await context.close();
  }
  console.log('PASS identity menu: unoccluded at 1146/580, scrollable at 390x360, existing navigation and keyboard dismissal preserved');
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
}
