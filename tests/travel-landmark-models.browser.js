import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server.js';

const rows=[
 ['杭州','雷峰塔','hz-leifeng-tower'],['杭州','保俶塔','hz-baochu-pagoda'],['杭州','三潭印月','hz-three-pools'],['杭州','灵隐寺','hz-lingyin-temple'],
 ['苏州','虎丘塔','sz-tiger-hill'],['苏州','苏州博物馆','sz-museum'],['苏州','北寺塔','sz-north-temple-pagoda'],['苏州','东方之门','sz-gate-east'],
 ['北京','天坛祈年殿','bj-temple-heaven'],['北京','故宫博物院','bj-palace-museum'],['北京','国家体育场(鸟巢)','bj-birds-nest'],
 ['上海','东方明珠','sh-oriental-pearl'],['上海','上海中心大厦','sh-shanghai-tower'],['上海','上海海关大楼','sh-customs-house'],['上海','中华艺术宫','sh-china-art-museum'],
 ['成都','天府熊猫塔','cd-panda-tower'],['成都','安顺廊桥','cd-anshun-bridge'],['成都','望江楼','cd-wangjiang-tower'],['成都','文殊院','cd-wenshu-monastery'],
 ['拉萨','布达拉宫','xz-potala-palace'],['拉萨','大昭寺','xz-jokhang-temple'],['拉萨','罗布林卡','xz-norbulingka'],['日喀则','扎什伦布寺','xz-tashilhunpo'],
 ['广州','广东省博物馆','gz-museum'],['广州','广州塔','gz-tower'],['广州','广州大剧院','gz-opera'],['广州','广州国际金融中心','gz-ifc']
];
const app=createApp({key:'',accountsEnabled:false,fetchImpl:async()=>{throw Error('No external request in model preview');}});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}),origin=`http://127.0.0.1:${app.address().port}`;
try{
 const page=await browser.newPage({viewport:{width:1180,height:1400},deviceScaleFactor:1}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
 await page.route(origin+'/landmark-preview',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh"><meta charset="utf-8"><title>城市微缩建筑总览</title><style>body{margin:0;background:#edf2ef;color:#263a31;font:15px "Microsoft YaHei",sans-serif}h1{margin:24px 24px 4px;font-size:24px}p{margin:0 24px 18px;color:#596d61}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:0 24px 24px}.tile{background:white;border:1px solid #d8e2db;border-radius:12px;text-align:center;padding:12px 8px}.map-marker{position:static;border:0;background:none;color:inherit;width:100%;font:inherit}.landmark-model,.landmark-label,.landmark-name,.landmark-day{display:block}.landmark-canvas{width:128px;height:124px}.landmark-name{font-weight:650;margin:6px 0}.landmark-day{font-size:11px;color:#85948b}.identity{font-size:11px;color:#65746c;overflow-wrap:anywhere;margin-top:8px}</style><h1>城市招牌建筑 · 微缩示意</h1><p>仅为地图识别轮廓；坐标仍由地图服务定位。</p><main class="grid"></main></html>'}));
 await page.goto(origin+'/landmark-preview');
 const models=await page.evaluate(async rows=>{
   const {createLandmarkMarker}=await import('/src/travel-map-landmarks.js');
   return rows.map(([city,name,expected],index)=>{
     const card=document.createElement('article');card.className='tile';const marker=createLandmarkMarker({id:`ai-random-${index}`,city,name,kind:'suggested'},{index});
     const caption=document.createElement('div');caption.className='identity';caption.textContent=`${city} · ${marker.dataset.landmarkKind}`;card.append(marker,caption);document.querySelector('.grid').append(card);
     const canvas=marker.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])painted++;
     return {city,name,expected,kind:marker.dataset.landmarkKind,painted,noModel:marker.classList.contains('has-no-model'),image:canvas.toDataURL()};
   });
 },rows);
 await mkdir('artifacts/landmark-models',{recursive:true});await page.screenshot({path:'artifacts/landmark-models/contact-sheet.png',fullPage:true});
 for(const model of models){assert.equal(model.kind,model.expected,`${model.city} ${model.name}: random IDs must resolve to the dedicated model`);assert.equal(model.noModel,false,model.name);assert.ok(model.painted>250,`${model.name}: model is not blank`);}
 assert.equal(new Set(models.slice(0,23).map(model=>model.image)).size,23,'Each new landmark has a distinct rendered silhouette');
 const fallback=await page.evaluate(async()=>{const {createLandmarkMarker}=await import('/src/travel-map-landmarks.js');return createLandmarkMarker({id:'unknown-random',city:'未知城市',name:'未收录的地点'}).dataset.landmarkKind;});assert.equal(fallback,'place');
 assert.deepEqual(errors,[]);console.log(`PASS: ${models.length} dedicated landmark renders, random-ID city/name resolution, distinct nonblank silhouettes and generic fallback; contact sheet saved.`);
}finally{await browser.close();await new Promise(resolve=>app.close(resolve));}
