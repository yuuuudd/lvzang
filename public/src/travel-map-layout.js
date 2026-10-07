const EPSILON=1e-7;
const rectangle=(item,position)=>({left:position.x-item.width/2,right:position.x+item.width/2,top:position.y-item.height,bottom:position.y});
const intersects=(a,b,gap)=>!(a.right+gap<=b.left+EPSILON||b.right+gap<=a.left+EPSILON||a.bottom+gap<=b.top+EPSILON||b.bottom+gap<=a.top+EPSILON);
const inside=(rect,area)=>rect.left>=-EPSILON&&rect.right<=area.width+EPSILON&&rect.top>=area.top-EPSILON&&rect.bottom<=area.bottom+EPSILON;
const distance=(item,position)=>(item.x-position.x)**2+(item.y-position.y)**2;
const compare=(a,b)=>a.x-b.x||a.y-b.y||(a.id<b.id?-1:a.id>b.id?1:0);

function bounded(item,area){
  const x=item.width<=area.width?Math.max(item.width/2,Math.min(area.width-item.width/2,item.x)):area.width/2;
  const y=item.height<=area.bottom-area.top?Math.max(area.top+item.height,Math.min(area.bottom,item.y)):(area.top+area.bottom+item.height)/2;
  return {x,y};
}

function score(items,positions,area,gap,fixed){
  let overlaps=0,overflow=0,cost=0;
  const rects=items.map(item=>rectangle(item,positions.get(item)));
  for(let index=0;index<items.length;index++){
    if(!inside(rects[index],area))overflow++;
    cost+=distance(items[index],positions.get(items[index]))*(fixed.has(items[index])?4:1);
    for(let next=index+1;next<items.length;next++)if(intersects(rects[index],rects[next],gap))overlaps++;
  }
  return {overlaps,overflow,cost};
}
const better=(next,current)=>next.overflow<current.overflow||next.overflow===current.overflow&&(next.overlaps<current.overlaps||next.overlaps===current.overlaps&&next.cost<current.cost-EPSILON);

function greedy(items,area,gap,fixed,base,order){
  const positions=new Map([...fixed].map(item=>[item,base.get(item)]));
  for(const item of order){
    const home=base.get(item),xs=new Set([home.x,item.width/2,area.width-item.width/2]),ys=new Set([home.y,area.top+item.height,area.bottom]);
    // Every obstacle contributes the nearest possible placement on each side.
    for(const other of items){if(other===item)continue;const rect=rectangle(other,positions.get(other)||base.get(other));xs.add(rect.left-gap-item.width/2);xs.add(rect.right+gap+item.width/2);ys.add(rect.top-gap);ys.add(rect.bottom+gap+item.height);}
    const candidates=[];
    for(const x of xs)for(const y of ys){const position={x,y};if(inside(rectangle(item,position),area))candidates.push(position);}
    candidates.sort((a,b)=>distance(item,a)-distance(item,b)||a.x-b.x||a.y-b.y);
    const chosen=candidates.find(position=>[...positions].every(([other,placed])=>!intersects(rectangle(item,position),rectangle(other,placed),gap)));
    positions.set(item,chosen||home);
  }
  return positions;
}

// Rectangular minimum-cost assignment. Bounds are small (normally <=12 landmarks),
// and each loop has a finite item/slot limit; no iterative physics or randomness.
function assignment(items,slots,fixed){
  const count=items.length,total=slots.length;if(count>total)return null;
  const u=Array(count+1).fill(0),v=Array(total+1).fill(0),p=Array(total+1).fill(0),way=Array(total+1).fill(0);
  for(let index=1;index<=count;index++){
    p[0]=index;let column=0,hops=0;
    const minimum=Array(total+1).fill(Infinity),used=Array(total+1).fill(false);
    do{
      if(++hops>total+1)return null;
      used[column]=true;const row=p[column];let delta=Infinity,next=0;
      for(let candidate=1;candidate<=total;candidate++)if(!used[candidate]){
        const cost=distance(items[row-1],slots[candidate-1])*(fixed.has(items[row-1])?4:1)-u[row]-v[candidate];
        if(cost<minimum[candidate]-EPSILON){minimum[candidate]=cost;way[candidate]=column;}
        if(minimum[candidate]<delta-EPSILON){delta=minimum[candidate];next=candidate;}
      }
      if(!Number.isFinite(delta)||!next)return null;
      for(let candidate=0;candidate<=total;candidate++){if(used[candidate]){u[p[candidate]]+=delta;v[candidate]-=delta;}else minimum[candidate]-=delta;}
      column=next;
    }while(p[column]!==0);
    do{const previous=way[column];p[column]=p[previous];column=previous;}while(column!==0);
  }
  const result=new Map();for(let column=1;column<=total;column++)if(p[column])result.set(items[p[column]-1],slots[column-1]);return result;
}

function packedPlans(items,area,gap,fixed,base){
  const width=Math.max(...items.map(item=>item.width)),height=Math.max(...items.map(item=>item.height)),columns=Math.min(12,Math.floor((area.width+gap)/(width+gap))),rows=Math.min(12,Math.floor((area.bottom-area.top+gap)/(height+gap)));
  if(!columns||!rows||columns*rows<items.length)return [];
  const spareX=area.width-columns*width-(columns-1)*gap,spareY=area.bottom-area.top-rows*height-(rows-1)*gap,plans=[];
  for(const horizontal of [0,.5,1])for(const vertical of [0,.5,1]){
    const slots=[];
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)slots.push({x:width/2+spareX*horizontal+column*(width+gap),y:area.top+height+spareY*vertical+row*(height+gap)});
    const moving=items.filter(item=>!fixed.has(item));
    const open=slots.filter(slot=>[...fixed].every(item=>!intersects(rectangle({width,height},slot),rectangle(item,base.get(item)),gap)));
    const partial=assignment(moving,open,fixed);if(partial)plans.push(new Map([...fixed].map(item=>[item,base.get(item)]).concat([...partial])));
    const complete=assignment(items,slots,fixed);if(complete)plans.push(complete);
  }
  return plans;
}

/**
 * Offset bottom-center landmark buttons in map pixels, never their POI coordinates.
 * Draw leaders from the shifted bottom-center to the original x/y in the controller.
 * Fully offscreen markers keep zero offsets. When the region cannot fit all models,
 * placements stay bounded where their dimensions permit; overlap remains explicit.
 */
export function layoutLandmarks(items,{width,height,top=90,bottom=32,gap=12}={}){
  if(!Array.isArray(items))return [];
  const result=items.map(item=>({id:item?.id??'',dx:0,dy:0}));
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return result;
  top=Number.isFinite(top)?Math.max(0,top):90;bottom=Number.isFinite(bottom)?Math.max(0,bottom):32;gap=Number.isFinite(gap)?Math.max(0,gap):12;
  const area={width,top:Math.min(top,height),bottom:Math.max(Math.min(top,height),height-bottom)};
  const visible=[];
  items.forEach((item,index)=>{
    if(!item||![item.x,item.y,item.width,item.height].every(Number.isFinite)||item.width<=0||item.height<=0)return;
    const rect=rectangle(item,item);
    if(rect.right<-gap||rect.left>width+gap||rect.bottom<-gap||rect.top>height+gap)return;
    visible.push({...item,index,id:String(item.id??'')});
  });
  if(!visible.length)return result;
  visible.sort(compare);const base=new Map(visible.map(item=>[item,bounded(item,area)])),fixed=new Set();
  for(const item of visible){const rect=rectangle(item,item);if(inside(rect,area)&&visible.every(other=>other===item||!intersects(rect,rectangle(other,base.get(other)),gap)))fixed.add(item);}
  let best=base,bestScore=score(visible,best,area,gap,fixed);
  if(bestScore.overlaps||bestScore.overflow){
    const moving=visible.filter(item=>!fixed.has(item)),orders=[moving,[...moving].sort((a,b)=>a.y-b.y||compare(a,b)),[...moving].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:compare(a,b))];
    const plans=[...orders.map(order=>greedy(visible,area,gap,fixed,base,order)),...packedPlans(visible,area,gap,fixed,base)];
    for(const plan of plans){const next=score(visible,plan,area,gap,fixed);if(better(next,bestScore)){best=plan;bestScore=next;}}
  }
  for(const item of visible){const position=best.get(item),dx=position.x-item.x,dy=position.y-item.y;result[item.index].dx=Number.isFinite(dx)&&Math.abs(dx)>EPSILON?dx:0;result[item.index].dy=Number.isFinite(dy)&&Math.abs(dy)>EPSILON?dy:0;}
  return result;
}
