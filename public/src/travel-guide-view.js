const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node;};
const text=value=>typeof value==='string'?value.slice(0,2400):'';
const safeLink=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};

export function advisorReplyText(value,research){
  const titles=new Map((research?.sources||[]).map(source=>[source.id,text(source.title).slice(0,60)||'参考来源']));
  return String(value||'').replace(/\bweb-[\w.-]+\b/g,id=>titles.has(id)?`《${titles.get(id)}》`:'参考来源').replace(/\bsearch-snippet\b/g,'搜索摘要').replace(/\bfetched\b/g,'已读取正文');
}

export function appendResearchSources(target,research){
  const sources=Array.isArray(research?.sources)?research.sources.slice(0,16):[];
  if(!sources.length)return;
  const details=el('details',null,'research-sources');details.append(el('summary',`参考来源（${sources.length}）`));
  for(const source of sources){
    const href=safeLink(source.url);if(!href)continue;
    const row=el('p'),link=el('a',text(source.title)||new URL(href).hostname);link.href=href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);
    const labels={read:'已读取正文',readable:'已读取正文',ok:'已读取正文',fetched:'已读取正文',snippet:'搜索摘要','search-snippet':'搜索摘要 · 未读取正文',search:'搜索摘要',blocked:'访问受限',unavailable:'暂不可读取',error:'读取失败'};
    row.append(el('small',` · ${labels[source.accessStatus]||'参考资料'}${source.retained?' · 此前查到的资料':''}${source.fetchedAt?' · '+String(source.fetchedAt).slice(0,10):''}`));details.append(row);
  }
  details.append(el('p','营业、预约、菜单和价格可能变化，出发前请向场所确认。','fine'));target.append(details);
}

function renderFood(food,city,sources){
  const card=el('article',null,'food-card');card.dataset.foodKind=food.kind||'legacy';
  const name=text(food.name).trim(),restaurant=food.kind==='restaurant';
  card.append(el('strong',name||'餐饮建议','food-name'));
  if(food.address)card.append(el('p',`地址：${text(food.address)}`,'food-address'));
  else if(restaurant)card.append(el('p','具体地址待核对，可按完整分店名搜索。','food-address'));
  if(food.mealTime)card.append(el('p',`就餐时机：${text(food.mealTime)}`,'food-meal-time'));
  if(Array.isArray(food.dishes)&&food.dishes.length)card.append(el('p',`点单参考：${food.dishes.map(text).filter(Boolean).join('、')}`,'food-dishes'));
  if(food.budgetNote)card.append(el('p',`预算提示：${text(food.budgetNote)}`,'food-budget'));
  if(food.note)card.append(el('p',text(food.note),'food-note'));
  const ids=new Set(food.sourceIds||[]);appendResearchSources(card,{sources:sources.filter(source=>ids.has(source.id))});
  if(restaurant&&name){
    const link=el('a','在高德搜索这家店 ↗','food-map-link');
    link.href=`https://uri.amap.com/search?keyword=${encodeURIComponent([city,name].filter(Boolean).join(' '))}`;
    link.target='_blank';link.rel='noopener noreferrer';card.append(link);
  }
  return card;
}

export function renderTravelGuide(plan,dayIndex,onAsk,{isExample=false,onEnrich}={}){
  document.getElementById('travel-guide-overview')?.remove();
  const guide=plan.guide,day=guide?.days?.find(item=>item.dayIndex===dayIndex);
  const scheduledDay=plan.days?.find(item=>item.dayIndex===dayIndex);
  const missingDay=scheduledDay&&!scheduledDay.stops.length&&!plan.planningCoverage?.freeDays?.includes(dayIndex);
  const overview=el('section',null,'travel-guide-overview');overview.id='travel-guide-overview';
  overview.dataset.guideStatus=guide?.status||'missing';
  if(!guide&&!isExample){
    const note=el('div',null,'guide-enrich-note');
    note.append(el('p','当前保留的是之前方案，可以沿用这条路线补充玩法、附近餐饮、交通和预约提醒。'));
    if(onEnrich){const enrich=el('button','补充这份路线的详细攻略 →','text-button');enrich.type='button';enrich.onclick=onEnrich;note.append(enrich);}
    overview.append(note);
  }
  if(missingDay)overview.append(el('p','这一天尚待补齐具体安排。'));
  else if(day?.overview)overview.append(el('p',text(day.overview)));
  else if(guide?.summary)overview.append(el('p',text(guide.summary)));
  const diningPending=guide?.diningStatus==='partial';
  if(diningPending){
    const missingDays=(guide.diningMissingDays||[]).filter(index=>Number.isInteger(index)&&index>0).map(index=>`第${index}天`).join('、');
    const retainedDays=(guide.diningRetainedDays||[]).filter(index=>Number.isInteger(index)&&index>0).map(index=>`第${index}天`).join('、');
    overview.append(el('strong',retainedDays&&!missingDays?'餐饮待更新':'餐饮待补充'));
    const incomplete=guide.diningRequiredFields?.length?'的具体店家及所需餐饮信息还未补齐':'尚未取得可引用的具体餐厅资料';
    if(missingDays||!retainedDays)overview.append(el('p',`${missingDays||'部分日期'}${incomplete}；已有玩法与路线仍可查看。`,'dining-status'));
    if(retainedDays)overview.append(el('p',`${retainedDays}本次餐饮更新未完成，已保留上一版店家与参考资料，可稍后继续调整。`,'dining-status'));
  }else if(['unavailable','partial'].includes(guide?.status))overview.append(el('strong','详细攻略待补充'));
  if(guide?.status==='unavailable')overview.append(el('p','详细攻略暂未生成，当前路线已保留。你可以继续问具体地点怎么玩或附近吃什么。'));
  const hasSources=Boolean(guide?.sources?.some(source=>['read','readable','ok','fetched','snippet','search-snippet','search'].includes(source.accessStatus)));
  if(Array.isArray(guide?.warnings))for(const warning of guide.warnings.slice(0,4))overview.append(el('p',hasSources?text(warning).replace('本次检索未找到可引用的公开旅行网页','部分检索未取得可引用资料，已取得的资料见下方来源'):text(warning),'fine'));
  const container=document.getElementById('route-stops');container.before(overview);
  const cards=[...container.querySelectorAll('[data-stop-card]')];
  for(const card of cards){
    const stop=plan.stops.find(item=>item.id===card.dataset.stopCard);if(!stop)continue;
    const detail=day?.stops?.find(item=>item.stopId===stop.id);
    if(detail){
      const body=el('section',null,'stop-guide');
      if(detail.howToPlay){body.append(el('h4','怎么玩'),el('p',text(detail.howToPlay)));}
      if(Array.isArray(detail.highlights)&&detail.highlights.length){const list=el('ul');for(const item of detail.highlights.slice(0,5))list.append(el('li',text(item)));body.append(list);}
      if(Array.isArray(detail.food)&&detail.food.length){
        const completeness=food=>(food.kind==='restaurant'?4:0)+(food.address?1:0)+(food.dishes?.length?1:0);
        const suggestions=[...detail.food].sort((a,b)=>completeness(b)-completeness(a));
        body.append(el('h4','附近吃什么'));for(const food of suggestions.slice(0,4))body.append(renderFood(food,stop.city||plan.city,guide.sources||[]));
      }
      for(const [field,label]of [['transport','怎么到下一站'],['reservation','预约与注意事项'],['rainyAlternative','下雨或太累时']])if(detail[field]){body.append(el('h4',label),el('p',text(detail[field])));}
      const sourceIds=new Set(detail.sourceIds||[]);
      appendResearchSources(body,{sources:(guide.sources||[]).filter(source=>sourceIds.has(source.id))});
      card.querySelector('.stop-actions')?.before(body);
    }
    const ask=el('button','问问怎么玩、附近吃什么','text-button ask-stop-guide');ask.type='button';
    ask.onclick=()=>onAsk(`结合已保存的行程和我的饮食偏好，详细说说${stop.name}怎么玩、有什么值得看、附近吃什么。请给出资料来源；先回答，不改动路线。`);
    card.append(ask);
  }
  if(guide?.sources?.length)appendResearchSources(document.getElementById('analysis-content'),{sources:guide.sources});
}

export function installChatReturn(){
  const input=document.getElementById('travel-brief'),composer=document.querySelector('.composer');
  const back=el('button','继续和旅行顾问聊','return-to-chat');back.id='return-to-chat';back.type='button';back.hidden=true;
  back.onclick=()=>{input.scrollIntoView({block:'center',behavior:'instant'});input.focus({preventScroll:true});};document.body.append(back);
  const observer=new IntersectionObserver(entries=>{back.hidden=entries[0].isIntersecting;},{threshold:.35});observer.observe(composer);
}
