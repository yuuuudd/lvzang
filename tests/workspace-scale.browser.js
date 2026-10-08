import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {mkdir} from 'node:fs/promises';

const server=createApp({key:''});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('artifacts/workspace-scale',{recursive:true});
const failures=[];
try {
  const page=await browser.newPage({viewport:{width:1920,height:900},reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  await page.waitForFunction(()=>document.getElementById('canvas-world').style.transform.includes('scale'));
  const frame=()=>page.evaluate(()=>{
    const viewport=document.getElementById('canvas-viewport'),world=document.getElementById('canvas-world');
    const nodes=[...world.querySelectorAll('.canvas-node')],rects=nodes.map(n=>n.getBoundingClientRect());
    return {width:viewport.clientWidth,contentWidth:Math.max(...rects.map(r=>r.right))-Math.min(...rects.map(r=>r.left)),transform:world.style.transform,zoom:document.getElementById('zoom-value').textContent};
  });
  await page.screenshot({path:'artifacts/workspace-scale/initial.png',animations:'disabled'});
  const initial=await frame();
  if(initial.contentWidth<initial.width-60)failures.push(`Default canvas leaves ${Math.round(initial.width-initial.contentWidth)}px unused horizontally (${initial.zoom}).`);

  await page.getByRole('button',{name:'放大画布',exact:true}).click();
  const manual=await frame();
  // Isolate the real ResizeObserver seam: late provider details make this node taller.
  // No SDK/network timing is required to exercise the canvas camera regression.
  await page.locator('#map-node').evaluate(node=>{
    const details=document.createElement('section');details.textContent='地点核实与交通结果';
    details.style.minHeight='240px';node.append(details);
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const expanded=await frame();
  if(expanded.transform!==manual.transform)failures.push(`Map content resize overwrites manual view: ${manual.transform} -> ${expanded.transform}.`);

  await page.setViewportSize({width:1600,height:900});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const resized=await frame();
  if(resized.transform!==expanded.transform)failures.push('Viewport resize overwrites a manually chosen canvas view.');

  await page.getByRole('button',{name:'适应所有节点',exact:true}).click();
  const all=await page.evaluate(()=>{
    const v=document.getElementById('canvas-viewport').getBoundingClientRect();
    return [...document.querySelectorAll('.canvas-node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=v.left&&r.top>=v.top&&r.right<=v.right&&r.bottom<=v.bottom;});
  });
  assert.ok(all,'Explicit overview must still show every node.');
  await page.getByRole('button',{name:'重置布局',exact:true}).click();
  const reset=await frame();
  if(reset.contentWidth<reset.width-60)failures.push('Reset layout restores the shrunken overview instead of the readable width view.');
  await page.screenshot({path:'artifacts/workspace-scale/desktop.png',animations:'disabled'});
  const lowerRow=await page.evaluate(()=>{
    const v=document.getElementById('canvas-viewport').getBoundingClientRect();
    const bottom=Math.max(...['time-node','budget-node','preferences-node'].map(id=>document.getElementById(id).getBoundingClientRect().bottom));
    return {x:v.left+12,y:v.top+100,delta:Math.max(0,bottom-v.bottom+20)};
  });
  await page.mouse.move(lowerRow.x,lowerRow.y);await page.mouse.wheel(0,lowerRow.delta);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.ok(await page.evaluate(()=>{
    const v=document.getElementById('canvas-viewport').getBoundingClientRect();
    return ['time-node','budget-node','preferences-node'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top>=v.top&&r.bottom<=v.bottom;});
  }),'Normal wheel over the canvas background must bring lower cards into view.');
  assert.equal((await frame()).zoom,reset.zoom,'Reaching lower cards must not shrink them.');
  await page.setViewportSize({width:565,height:704});
  assert.equal(await page.locator('#canvas-world').evaluate(e=>getComputedStyle(e).transform),'none');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'artifacts/workspace-scale/mobile.png',fullPage:true,animations:'disabled'});
  console.log(JSON.stringify({initial,manual,expanded,resized,reset,failures},null,2));
  assert.deepEqual(failures,[]);
  console.log('PASS: readable width view, content/viewport resize preserves manual camera, explicit overview, reset, native wheel reaches lower cards and mobile layout.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
