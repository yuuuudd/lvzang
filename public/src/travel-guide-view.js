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

export function renderTravelGuide(plan,dayIndex,onAsk){
  document.getElementById('travel-guide-overview')?.remove();
  const guide=plan.guide,day=guide?.days?.find(item=>item.dayIndex===dayIndex);
  const overview=el('section',null,'travel-guide-overview');overview.id='travel-guide-overview';
  if(day?.overview)overview.append(el('p',text(day.overview)));
  else if(guide?.summary)overview.append(el('p',text(guide.summary)));
  if(guide?.status==='unavailable')overview.append(el('p','详细攻略暂未生成，当前路线已保留。你可以继续问具体地点怎么玩或附近吃什么。','fine'));
  if(Array.isArray(guide?.warnings))for(const warning of guide.warnings.slice(0,4))overview.append(el('p',text(warning),'fine'));
  const container=document.getElementById('route-stops');container.before(overview);
  const cards=[...container.querySelectorAll('[data-stop-card]')];
  for(const card of cards){
    const stop=plan.stops.find(item=>item.id===card.dataset.stopCard);if(!stop)continue;
    const detail=day?.stops?.find(item=>item.stopId===stop.id);
    if(detail){
      const body=el('section',null,'stop-guide');
      if(detail.howToPlay){body.append(el('h4','怎么玩'),el('p',text(detail.howToPlay)));}
      if(Array.isArray(detail.highlights)&&detail.highlights.length){const list=el('ul');for(const item of detail.highlights.slice(0,5))list.append(el('li',text(item)));body.append(list);}
      if(Array.isArray(detail.food)&&detail.food.length){body.append(el('h4','附近吃什么'));for(const food of detail.food.slice(0,4))body.append(el('p',[text(food.name),text(food.note)].filter(Boolean).join(' · ')));}
      for(const [field,label]of [['transport','怎么到下一站'],['reservation','预约与注意事项'],['rainyAlternative','下雨或太累时']])if(detail[field]){body.append(el('h4',label),el('p',text(detail[field])));}
      const sourceIds=new Set([...(detail.sourceIds||[]),...(detail.food||[]).flatMap(food=>food.sourceIds||[])]);
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
