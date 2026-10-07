import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const generated='C:/Users/王🐟哒/.codex/generated_images/01a10a19-5332-7ec0-a0f9-f3edf39dbbba/';
await mkdir('public/assets/magnets',{recursive:true});await mkdir('public/assets/keepsakes',{recursive:true});
await sharp(generated+'exec-2a9af781-30ae-485a-a916-ce8cf8800fcc.png').trim().resize({height:900}).png().toFile('public/assets/magnets/gz.png');
const pair=generated+'exec-1b7d2aed-74bd-4011-bf95-93d29ccfac2f.png',pm=await sharp(pair).metadata();
for(const [ref,start,end] of [['hz',0,.47],['sz',.47,1]]){const cell=await sharp(pair).extract({left:Math.round(pm.width*start),top:0,width:Math.round(pm.width*end)-Math.round(pm.width*start),height:pm.height}).png().toBuffer();await sharp(cell).trim().resize({height:700}).png().toFile(`public/assets/magnets/${ref}.png`);}
const atlas=generated+'exec-29438a9f-c448-4395-8cdb-9f2fbc5bf116.png',am=await sharp(atlas).metadata();
for(const [ref,start,end] of [['gz',0,.423],['hz',.423,.697],['sz',.697,1]]){const cell=await sharp(atlas).extract({left:Math.round(am.width*start),top:0,width:Math.round(am.width*end)-Math.round(am.width*start),height:am.height}).png().toBuffer();await sharp(cell).trim().resize({width:1000}).png().toFile(`public/assets/keepsakes/${ref}.png`);}
const photos=generated+'exec-81d59f57-d1ec-4388-9d07-857426fc50ae.png',ph=await sharp(photos).metadata();
for(let i=0;i<3;i++)await sharp(photos).extract({left:Math.round(ph.width*i/3),top:0,width:Math.round(ph.width*(i+1)/3)-Math.round(ph.width*i/3),height:ph.height}).resize(800,800,{fit:'cover'}).webp({quality:86}).toFile(`public/assets/keepsakes/memory-${i+1}.webp`);
const geoPath='public/assets/keepsakes/china-provinces.json';let geo;
try{geo=JSON.parse(await readFile(geoPath,'utf8'));}catch{const r=await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json');if(!r.ok)throw new Error('map source '+r.status);geo=await r.json();await writeFile(geoPath,JSON.stringify(geo));}
const project=([lon,lat])=>[(lon-73)*14.5, (54-lat)*18];
const paths=geo.features.map(f=>{const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];const d=polygons.map(p=>p.map(ring=>ring.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('')+'Z').join('')).join('');return `<path d="${d}"/>`;}).join('');
await writeFile('public/assets/china-collection-map.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 880"><title>中国旅行收藏示意</title><g fill="#f3ead9" stroke="#d9c8a8" stroke-width=".8" stroke-linejoin="round">${paths}</g></svg>`);
await writeFile('public/assets/keepsakes/SOURCES.md','# 收藏素材来源\n\n城市冰箱贴、微缩摆件与示例照片：本项目2026-10-05使用内置ImageGen依据已批准概念图生成。示例照片中的人物与故事均为虚构。\n\n中国省级轮廓：DataV.GeoAtlas公开数据 https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json ，用于本机收藏位置示意，非导航。SVG由scripts/prepare-keepsake-assets.mjs投影生成。\n');
console.log('Prepared 6 product assets, 3 demo photos and province map.');
