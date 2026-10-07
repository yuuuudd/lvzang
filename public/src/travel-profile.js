import {places} from './travel-catalog.js';

// User requirements are independent of the bounded chat history and the last plan.
const legacyFieldNames=['destination','dayCount','dailyHours','startTime','companions','budget','interests','pace','requiredPlaces','excludedPlaces'];
const detailFieldNames=['crowdPreference','diet','stayArea','startArea','transport','travelDates'];
const fieldNames=[...legacyFieldNames,...detailFieldNames];
const statuses=['confirmed','tentative','missing'];
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>JSON.parse(JSON.stringify(value));
const placeKey=value=>{const key=String(value).trim().replace(/\s/g,'');return places.find(place=>[place.name,...place.aliases,place.id].some(name=>name.replace(/\s/g,'')===key))?.id??key;};
const conditionClause=value=>/少走|多走|轻松|慢游|慢慢|休闲|不要太累|不能久走|轮椅|徒步|紧凑|充实|暴走|正常节奏|普通节奏|^(?:预算|人均|每人|全团|每天|每日|我们|同行|带|喜欢|偏好|兴趣|下午|上午|早上|晚上|住宿|出发|开始)/.test(value.trim());

function boundedText(value,max,label){
  if(typeof value!=='string'||value.length>max)throw new Error(`${label}格式无效`);
  return value.trim();
}
function number(value,min,max,label,integer=false){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw new Error(`${label}需要在 ${min}–${max} 之间`);
  return value;
}
function names(value,max=12){
  if(!Array.isArray(value)||value.length>max)throw new Error('旅行偏好或地点名单格式无效');
  return [...new Set(value.map(item=>{const name=boundedText(item,80,'地点或偏好');if(!name)throw new Error('地点或偏好不能为空');return name;}))];
}
function normalizeValue(field,value){
  if(value===null)return null;
  if(field==='destination'){const result=boundedText(value,40,'目的地').replace(/市$/,'');if(!result)throw new Error('目的地不能为空');return result;}
  if(field==='dayCount')return number(value,1,7,'旅行天数',true);
  if(field==='dailyHours')return number(value,1,12,'每日可用时间');
  if(field==='startTime'){const result=boundedText(value,5,'开始时间');if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result))throw new Error('开始时间格式无效');return result;}
  if(field==='pace'){if(!['easy','normal','active'].includes(value))throw new Error('旅行节奏格式无效');return value;}
  if(field==='interests')return names(value,16);
  if(['requiredPlaces','excludedPlaces'].includes(field)){
    const seen=new Set();return names(value).filter(name=>{
      const matched=placeKey(name),key=places.some(place=>place.id===matched)?matched:name;
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  if(field==='crowdPreference'){if(!['popular','niche','mixed'].includes(value))throw new Error('热门与小众偏好格式无效');return value;}
  if(field==='transport'){if(!['walk','transit','drive','taxi','bike','mixed'].includes(value))throw new Error('出行方式格式无效');return value;}
  if(['stayArea','startArea'].includes(field)){const result=boundedText(value,80,'住宿或出发区域');if(!result)throw new Error('住宿或出发区域不能为空');return result;}
  if(field==='diet'){
    if(!object(value)||Object.keys(value).some(key=>!['preferences','restrictions'].includes(key)))throw new Error('饮食偏好格式无效');
    return {preferences:names(value.preferences??[],8),restrictions:value.restrictions==null?null:names(value.restrictions,8)};
  }
  if(field==='travelDates'){
    if(!object(value)||Object.keys(value).some(key=>!['start','end'].includes(key)))throw new Error('旅行日期格式无效');
    const result={start:null,end:null,...value};
    for(const date of Object.values(result))if(date!==null&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('请填写有效的旅行日期');
    if(result.end!==null&&(result.start===null||result.end<result.start))throw new Error('结束日期不能早于出发日期');
    return result;
  }
  if(field==='companions'){
    if(!object(value))throw new Error('同行情况格式无效');
    for(const key of Object.keys(value))if(!['count','description','adults','children','seniors'].includes(key))throw new Error('同行情况字段无效');
    const result={count:null,description:'',adults:null,children:null,seniors:null,...value};
    if(result.description===null)result.description='';
    result.description=boundedText(result.description,300,'同行描述');
    for(const key of ['count','adults','children','seniors'])if(result[key]!==null)number(result[key],key==='count'?1:0,100,'同行人数',true);
    const known=[result.adults,result.children,result.seniors].filter(item=>item!==null);
    // Seniors may be included in the stated adult count. Do not invent a total
    // by adding overlapping descriptions supplied by the traveler.
    if(result.count!==null&&known.some(item=>item>result.count))throw new Error('同行分类人数不能超过总人数');
    if(result.count!==null&&result.adults!==null&&result.children!==null&&result.adults+result.children>result.count)throw new Error('成人与儿童人数不能超过总人数');
    return result;
  }
  if(field==='budget'){
    if(!object(value))throw new Error('预算格式无效');
    for(const key of Object.keys(value))if(!['amount','currency','scope','period','includes'].includes(key))throw new Error('预算字段无效');
    const result={amount:null,currency:'CNY',scope:'unknown',period:'unknown',includes:[],...value};
    if(result.amount!==null)number(result.amount,0,100000000,'预算金额');
    if(result.currency!=='CNY'||!['per-person','group','unknown'].includes(result.scope)||!['trip','day','unknown'].includes(result.period))throw new Error('预算口径格式无效');
    result.includes=names(result.includes,8);return result;
  }
  throw new Error('旅行需求字段无效');
}
function normalizeField(field,record){
  if(!object(record)||!own(record,'value')||!statuses.includes(record.status))throw new Error('旅行需求字段状态无效');
  for(const key of Object.keys(record))if(!['value','status'].includes(key))throw new Error('旅行需求字段格式无效');
  const value=normalizeValue(field,record.value);
  if(record.status==='missing'&&value!==null)throw new Error('待补充字段不能携带已知值');
  if(record.status!=='missing'&&value===null)throw new Error('已填写字段不能是空值');
  return {value,status:record.status};
}

export function emptyTravelProfile(){
  return {version:1,revision:0,fields:Object.fromEntries(fieldNames.map(field=>[field,{value:null,status:'missing'}])),followUps:[]};
}

export function normalizeTravelProfile(value){
  if(!object(value)||value.version!==1||!Number.isInteger(value.revision)||value.revision<0||value.revision>1000000||!object(value.fields))throw new Error('旅行需求档案格式无效');
  for(const key of Object.keys(value))if(!['version','revision','fields','followUps'].includes(key))throw new Error('旅行需求档案字段无效');
  for(const field of Object.keys(value.fields))if(!fieldNames.includes(field))throw new Error('旅行需求档案字段无效');
  const result=emptyTravelProfile();result.revision=value.revision;
  for(const field of fieldNames){if(!own(value.fields,field)){if(legacyFieldNames.includes(field))throw new Error('旅行需求档案缺少字段');continue;}result.fields[field]=normalizeField(field,value.fields[field]);}
  const followUps=value.followUps??[];
  if(!Array.isArray(followUps)||followUps.length>3)throw new Error('旅行追问格式无效');
  result.followUps=followUps.map(item=>{
    if(!object(item)||!fieldNames.includes(item.field))throw new Error('旅行追问字段无效');
    const question=boundedText(item.question,240,'旅行追问');if(!question)throw new Error('旅行追问不能为空');
    return {field:item.field,question};
  });
  return result;
}

function chineseNumber(value){
  if(/^\d+(?:\.\d+)?$/.test(value))return Number(value);
  const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  if(value.includes('万')){const [a,b]=value.split('万');return chineseNumber(a)*10000+(b?chineseNumber(b):0);}
  if(/[十百千]/.test(value)){const units={十:10,百:100,千:1000};let total=0,current=0;for(const char of value){if(own(digits,char))current=digits[char];else if(own(units,char)){total+=(current||1)*units[char];current=0;}else return undefined;}return total+current;}
  return digits[value];
}
const quantity='([零一二两三四五六七八九十\\d]+(?:\\.\\d+)?)';
function foundNumber(text,pattern){const match=text.match(new RegExp(pattern));return match?chineseNumber(match[1]):undefined;}
function cleanPlace(name){return name.trim().replace(/^(?:我(?:们)?(?:想|要)?|(?:还|也|只)?(?:一定要去|必须去|必去|想去|保留|加上|加入|改去|不想去|不去|不要去|避开|去掉|删除|取消))\s*/, '').replace(/(?:了|吧|即可|就行|就好|看看|参观|游玩|打卡)$/,'').trim();}
function parsePlaceChanges(text,protectedNames=[]){
  const required=[],excluded=[];
  const protectedSet=new Set(protectedNames),masks={和:'\uE000',及:'\uE001',与:'\uE002'},unmask={'\uE000':'和','\uE001':'及','\uE002':'与'};
  const splitNames=body=>{
    for(const name of [...protectedNames].sort((a,b)=>b.length-a.length))if(name)body=body.replaceAll(name,name.replace(/[和及与]/g,char=>masks[char]));
    return body.split(/、|\s+(?:和|及|与)\s+/).flatMap(part=>{
      const pieces=part.split(/[和及与]/).map(piece=>piece.replace(/[\uE000-\uE002]/g,char=>unmask[char]));
      // Unspaced conjunctions may be inside a proper name (颐和园、雍和宫).
      // Split them only when both sides are accepted complete place names.
      return pieces.length>1&&pieces.every(piece=>protectedSet.has(cleanPlace(piece)))?pieces:[part.replace(/[\uE000-\uE002]/g,char=>unmask[char])];
    });
  };
  let lastNegative=null;
  for(const segment of text.split(/[，。；,;\n]/)){
    const matches=[...segment.matchAll(/(?:一定要去|必须去|必去(?:地点|景点)?(?:改成|改为|换成)?|只去|想去|保留|加上|加入|改去|不想去|不要去|不去|避开|去掉|删除|取消)\s*([^，。；,;\n]+)/g)];
    if(!matches.length){
      const continuation=segment.trim();
      if(lastNegative!==null&&!conditionClause(continuation)&&/^(?:[\p{Script=Han}A-Za-z·\s]+)(?:宫|园|馆|广场|塔|街|路|寺|河|湖|山|景区|公园|城|院|坊|桥|故居|陵|殿|坛|遗址|中心)$/u.test(continuation))for(const part of splitNames(continuation))(lastNegative?excluded:required).push(cleanPlace(part));
      else lastNegative=null;
    }
    for(const match of matches){
      const negative=/^(?:不想去|不要去|不去|避开|去掉|删除|取消)/.test(match[0]);
      lastNegative=negative;
      const body=match[1].split(/(?:但|但是|不过|然后|现在|还是|改为|改成)(?=.+)/)[0];
      for(const part of splitNames(body)){const name=cleanPlace(part);if(!name||name.length>80||/^(?:安排|方案|行程|预算|小时|天数|地点|全部|所有|全部必去|所有必去|全部排除|所有排除)$/.test(name))continue;(negative?excluded:required).push(name);}
    }
  }
  return {required:[...new Set(required)],excluded:[...new Set(excluded)]};
}
function parsedDetails(text,previous){
  const result={},pending=new Set(previous.followUps.map(item=>item.field));
  if(/(?:热门|大众).{0,10}(?:小众|冷门).{0,8}(?:都|兼顾|结合|一起)|(?:小众|冷门).{0,10}(?:热门|大众).{0,8}(?:都|兼顾|结合|一起)|大众小众都可以/.test(text))result.crowdPreference='mixed';
  else if(/喜欢|偏好|想要|更想|希望|想去/.test(text)||pending.has('crowdPreference')){
    if(/小众|冷门|人少|避开人群/.test(text))result.crowdPreference='niche';else if(/热门|大众|经典地标/.test(text))result.crowdPreference='popular';else if(pending.has('crowdPreference')&&/都可以|无所谓|不挑|随意/.test(text))result.crowdPreference='mixed';
  }
  const preferences=['粤菜','川菜','湘菜','清淡','辣味','甜食','素食','地方小吃','咖啡','海鲜'].filter(item=>new RegExp(`(?<!不)(?:喜欢|爱吃|偏好|想吃|口味)[^，。；,;]{0,15}${item}`).test(text));
  const restrictions=[];
  for(const match of text.matchAll(/(?:不吃|不能吃|忌口(?:是|为)?|忌(?!口)|对)([^，。；,;\n]{1,24}?)(?:过敏|$|(?=[，。；,;\n]))/g)){
    const value=match[1].trim().replace(/(?:的东西|食品|食物)$/,'');if(value&&!/太累|走路|旅行|预算/.test(value))restrictions.push(value);
  }
  if(/不吃辣|不能吃辣/.test(text)&&!restrictions.includes('辣'))restrictions.push('辣');
  if(preferences.length||restrictions.length)result.diet={...(preferences.length?{preferences}:{}),...(restrictions.length?{restrictions:[...new Set([...(previous.fields.diet?.value?.restrictions??[]),...restrictions])]}:{})};
  if(/(?:没有|没|无|不)(?:饮食)?(?:禁忌|忌口)|取消(?:饮食)?(?:禁忌|忌口)/.test(text))result.diet={...(result.diet??{}),restrictions:[]};
  const stay=text.match(/(?:住在|住宿(?:区域|地点)?(?:是|为|选|改为|改成)|酒店(?:在|位于))\s*([^，。；,;\n]{1,80})/);
  if(stay)result.stayArea=stay[1].trim();
  const start=text.match(/(?:从|出发区域(?:是|为|改为)?|出发地点(?:是|为|改为)?)\s*([^，。；,;\n]{2,80}?)(?:出发|开始游玩)(?=[，。；,;\n]|$)/);
  if(start&&!/^(?:上午|下午|早上|晚上)?(?:\d|[一二两三四五六七八九十]).*(?:点|小时|:\d{2})$/.test(start[1]))result.startArea=start[1].trim();
  if(/(?:住宿|酒店|住哪).{0,8}(?:未定|没定|不确定|没想好)/.test(text))result.stayArea='未定';
  if(/(?:出发地点|出发区域).{0,8}(?:未定|没定|不确定)/.test(text))result.startArea='未定';
  const mixedTransport=text.split(/[，。；,;\n]/).some(clause=>/结合|混合|配合|搭配|加|和|及|与|或|\+|＋/.test(clause)&&[/步行/,/地铁|公交|公共交通/,/自驾|开车/,/打车|出租车|网约车/,/骑车|骑行/].filter(pattern=>pattern.test(clause)).length>=2);
  const mode=mixedTransport?'mixed':/(?:自驾|开车)(?:为主|出行|游玩)?/.test(text)?'drive':/(?:打车|出租车|网约车)(?:为主|出行)?/.test(text)?'taxi':/(?:公共交通|公交地铁|地铁)(?:为主|出行)?/.test(text)?'transit':/(?:骑行|骑车)(?:为主|出行)?/.test(text)?'bike':/(?:全程|主要|优先)步行|步行(?:为主|游玩|出行)/.test(text)?'walk':/(?:交通|出行方式).{0,8}(?:都可以|混合|灵活|不限)/.test(text)?'mixed':null;
  if(mode&&!/(?:不|不能|不要|不想)(?:自驾|开车|打车|骑车|骑行|步行|公共交通|地铁)/.test(text))result.transport=mode;
  const dates=[...text.matchAll(/(?<!\d)(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?!\d)/g)].map(match=>`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`);
  if(dates.length&&/日期|出发|到|至|旅行|旅游/.test(text))result.travelDates={start:dates[0],...(dates[1]?{end:dates[1]}:{})};
  if(/(?:日期|哪天|出发日).{0,8}(?:未定|没定|不确定|没想好)/.test(text))result.travelDates={start:null,end:null};
  return result;
}
function parsedText(text,previous){
  const result=parsedDetails(text,previous),pending=new Set(previous.followUps.map(item=>item.field));
  const cityPattern='广州|苏州|杭州|北京|上海|成都|重庆|深圳|西安|南京|青岛|厦门|武汉|长沙|珠海|云南|日本|巴黎';
  const explicitCity=text.match(new RegExp(`(?:换成|改成|改为|目的地(?:是|为)?|(?<!不)(?<!不想)(?<!不要)(?<!必)(?<!要)去|到)\\s*(${cityPattern})(?:市)?(?=[\\s，。；,;一二两三四五六七八九十\\d]|半天|旅游|旅行|玩|游|$)`));
  const beginningCity=text.match(new RegExp(`^(?:帮我(?:安排|规划)?|安排|规划|计划|想去|去)?\\s*(${cityPattern})(?:市)?(?=[\\s，。；,;一二两三四五六七八九十\\d]|半天|旅游|旅行|玩|游|$)`));
  const directional=text.match(/(?:换成|目的地(?:是|为)?|(?<!不)(?<!不想)(?<!不要)(?<!必)(?<!要)去|到|安排|规划)\s*([\p{Script=Han}A-Za-z·]{2,20}?)(?:市)?(?=\s*(?:[一二两三四五六七八九十\d]+(?:天|日)|半天|[，。；,;\s]|旅游|旅行|玩|游|$))/u);
  if(explicitCity||beginningCity)result.destination=(explicitCity??beginningCity)[1];
  else if(directional){const destination=directional[1].replace(/^(?:帮我|我们|我想|计划|准备)/,'');if(destination.length>=2&&!/^(?:方案|行程|路线|地点|计划|旅行|旅游|哪里|什么|博物馆|预算)$/.test(destination)&&!/^(?:[零一二两三四五六七八九十\d]+(?:天|日)|半天)(?:路线|行程|计划|方案|旅行|旅游)?$/.test(destination)&&!places.some(place=>[place.name,...place.aliases].includes(destination))&&!/必去|排除|不去/.test(text.slice(0,directional.index)))result.destination=destination;}
  else if(pending.has('destination')&&/^[\p{Script=Han}A-Za-z·]{2,20}(?:市)?$/u.test(text)&&!/^(?:不知道|你推荐|随便|先安排|先给方案|你先安排)$/.test(text))result.destination=text;
  const durationQuestion=/[？?]|吗|多久|多长/.test(text)&&!/(?:安排|规划|制定|改为|改成|改到|调整|只有|总共|我们.*(?:玩|旅行)|旅行.*天)/.test(text);
  if(!durationQuestion&&!/第\s*[一二两三四五六七八九十\d]+\s*天/.test(text)){
    const durationText=text.replace(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/g,'');
    const days=foundNumber(durationText,`(?<!每)${quantity}\\s*(?:天|日)(?!常)`);
    if(days!==undefined)result.dayCount=days;
    const daily=foundNumber(text,`(?:每天|每日|一天)(?:大概|约|有|可用|能玩|玩|逛|安排|只玩|只有|能安排|最多)?\\s*${quantity}\\s*(?:个)?小时`);
    const hours=daily??foundNumber(text,`${quantity}\\s*(?:个)?小时`);
    if(hours!==undefined)result.dailyHours=hours;
    else if(/半天/.test(text)){result.dailyHours=4;if(days===undefined&&!/每天|每日/.test(text)&&previous.fields.dayCount.status==='missing')result.dayCount=1;}
    if(hours!==undefined&&days===undefined&&!pending.has('dailyHours')&&previous.fields.dayCount.status==='missing')result.dayCount=1;
    if(pending.has('dayCount')&&/^[一二两三四五六七\d]+$/.test(text))result.dayCount=chineseNumber(text);
    if(pending.has('dailyHours')&&/^[一二两三四五六七八九十\d]+$/.test(text))result.dailyHours=chineseNumber(text);
    const clock=text.match(/(?:每天|每日|从|出发|开始|改为|改成|上午|下午|早上|晚上)?\s*(\d{1,2})[:：](\d{2})/);
    const chineseClock=text.match(new RegExp(`(?:每天|每日|从|出发|开始|上午|下午|早上|晚上)\\s*${quantity}\\s*点(?:([一二三四五六七八九十\\d]+)分?|(半))?`));
    if(clock)result.startTime=`${clock[1].padStart(2,'0')}:${clock[2]}`;
    else if(chineseClock){let hour=chineseNumber(chineseClock[1]);if(/下午|晚上/.test(chineseClock[0])&&hour<12)hour+=12;result.startTime=`${String(hour).padStart(2,'0')}:${String(chineseClock[3]?30:chineseNumber(chineseClock[2]??'零')).padStart(2,'0')}`;}
  }
  let count=foundNumber(text,`(?:我们|一共|共|同行|总共|有)?\\s*${quantity}\\s*(?:个)?人(?!均)`)??foundNumber(text,`一家${quantity}口`);
  const adults=foundNumber(text,`${quantity}\\s*(?:位|个|名)?(?:成人|成年人|大人)`),children=foundNumber(text,`${quantity}\\s*(?:位|个|名)?(?:儿童|孩子|小孩|宝宝)`),seniors=foundNumber(text,`${quantity}\\s*(?:位|个|名)?(?:老人|长者|老年人)`);
  if(count===undefined&&adults!==undefined&&children===undefined&&seniors===undefined&&!/其中|包括|包含|新增|增加|加上|再来|还有/.test(text))count=adults;
  const companionDescription=text.match(/(?:和|带|跟|陪|与)\s*(?:父母|爸妈|孩子|老人|朋友|家人|伴侣|女友|男友|同学|同事)/u)?.[0];
  if(count!==undefined||adults!==undefined||children!==undefined||seniors!==undefined||companionDescription){result.companions={};if(count!==undefined)result.companions.count=count;if(adults!==undefined)result.companions.adults=adults;if(children!==undefined)result.companions.children=children;if(seniors!==undefined)result.companions.seniors=seniors;if(companionDescription)result.companions.description=companionDescription;}
  if(/独自|一个人|自己一个人/.test(text))result.companions={...(result.companions??{}),count:1,description:'独自旅行'};
  const budgetContext=/预算|人均|每人|全团|总共.*元|不超过|控制在|全程.*元|每天.*元/.test(text)||pending.has('budget')||(previous.fields.budget.value&&(/(?:改|降|提高|增加|减少).*\d+\s*(?:元|块)/.test(text)||/(?:不包括|不包含|不含|包括|包含|含).*(?:门票|交通|餐饮|住宿|纪念品)/.test(text)));
  if(budgetContext){
    const amount=text.match(/(?:预算|人均|每人|全团|总预算|总共|不超过|控制在|全程|每天|每日)[^，。；,;\n\d]{0,18}[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:元|块)/)?.[1]??text.match(/[¥￥]\s*(\d+(?:\.\d+)?)/)?.[1]??text.match(/([零一二两三四五六七八九十百千万]+)\s*(?:元|块)/)?.[1]??text.match(/(?:预算|人均|每人|全团|总预算|总共|不超过|控制在|全程)[^，。；,;\n\d]{0,18}(\d+(?:\.\d+)?)(?![\d.]|\s*(?:个?小时|分钟|天|日|点|人|位))/)?.[1]??text.match(/(?:改为|改成|改到|调到|降到|降至|提高到|增加到|减少到)\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:元|块)/)?.[1]??(pending.has('budget')?text.match(/^[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:元|块)?$/)?.[1]:undefined);
    // Scope and period belong to the money clause. A daily visit duration or
    // the head count elsewhere in the message is not a budget declaration.
    const budgetFacts=text.split(/[，。；,;\n]/).filter(segment=>{
      if(/预算|[¥￥]|(?:\d+(?:\.\d+)?|[零一二两三四五六七八九十百千万]+)\s*(?:元|块)/.test(segment))return true;
      if(/(?:不包括|不包含|不含|包含|包括|含).*(?:门票|交通|餐饮|住宿|纪念品)/.test(segment))return true;
      return !/小时|分钟|点/.test(segment)&&/^(?:是|算|按|口径(?:是|为)?|预算(?:是|为)?)?\s*(?:人均|每人|全团|全组|全体|所有人|全程|整趟|每天|每日|一天)[^\d]{0,12}$/.test(segment.trim());
    }).map(segment=>segment.replace(new RegExp(`(?:每天|每日|一天)(?:大概|约|有|可用|能玩|玩|逛|安排|只玩|只有|能安排|最多|改为)?\\s*${quantity}\\s*(?:个)?小时`,'g'),'').replace(new RegExp(`(?:我们)?\\s*(?:一共|总共|共|有)?\\s*${quantity}\\s*(?:个)?人(?!均)`,'g'),'')).join('，');
    const scope=/人均|每人|一个人/.test(budgetFacts)?'per-person':/全团|全组|全体|所有人|总预算|一共|总共|总计|共同|我们.*合计/.test(budgetFacts)?'group':undefined;
    const period=/全程|整趟|整个旅行|总预算|整次|全部天数/.test(budgetFacts)?'trip':/每天|每日|一天/.test(budgetFacts)?'day':undefined;
    const categories=['门票','交通','餐饮','住宿','纪念品'];
    const included=categories.filter(item=>new RegExp(`(?:(?<!不)(?:包含|包括)|(?<!不)(?<!包)含)[^，。；,;]{0,30}${item}`).test(budgetFacts));
    const excluded=categories.filter(item=>new RegExp(`不(?:包含|包括|含)[^，。；,;]{0,30}${item}`).test(budgetFacts));
    if(amount!==undefined||scope||period||included.length||excluded.length||/预算不限|不限预算|不限制预算/.test(text)){
      result.budget={};if(amount!==undefined)result.budget.amount=chineseNumber(amount);if(scope)result.budget.scope=scope;if(period)result.budget.period=period;
      // A bare revised amount retains an already stated scope/period. A first amount
      // receives unknown components from normalization rather than invented ones.
      if(/预算不限|不限预算|不限制预算/.test(text))result.budget={amount:null,currency:'CNY',scope:'unknown',period:'unknown',includes:[]};
      if(included.length||excluded.length)result.budget.includes=(included.length?included:previous.fields.budget.value?.includes??[]).filter(item=>!excluded.includes(item));
    }
  }
  if(!/第\s*[一二两三四五六七八九十\d]+\s*天/.test(text)){if(/少走|轻松|慢游|慢慢|休闲|不要太累|不能久走|轮椅/.test(text))result.pace='easy';else if(/多走|徒步|紧凑|充实|暴走/.test(text))result.pace='active';else if(/正常节奏|普通节奏|正常走|节奏适中|适中(?:强度|节奏)/.test(text)||pending.has('pace')&&/^(?:正常|适中|一般)$/.test(text))result.pace='normal';}
  const interests=['文化','建筑','室内','风景','拍照','园林','美食','手作','历史','自然','购物','夜景','亲子','美术','音乐','徒步','咖啡'].filter(item=>new RegExp(`(?:喜欢|偏好|爱看|兴趣|想看|想体验)[^，。；,;]{0,20}${item}`).test(text));if(interests.length)result.interests=interests;
  return result;
}

export function updateTravelProfile(previous,{text='',patch={},destination,hours}={}){
  const original=previous==null?emptyTravelProfile():normalizeTravelProfile(previous),profile=copy(original);
  if(typeof text!=='string'||text.length>2000)throw new Error('旅行需求文字格式无效');text=text.trim();
  if(!object(patch))throw new Error('旅行需求修改格式无效');
  if(own(patch,'fields')){if(!object(patch.fields))throw new Error('旅行需求修改字段无效');patch=patch.fields;}
  for(const field of Object.keys(patch))if(!fieldNames.includes(field))throw new Error('旅行需求修改字段无效');
  const apply=(field,proposal,status='confirmed',replaceList=false)=>{
    let value=proposal;
    if(object(proposal)&&own(proposal,'value')){if(!statuses.includes(proposal.status))throw new Error('旅行需求修改状态无效');status=proposal.status;value=proposal.value;}
    if(value===null){profile.fields[field]={value:null,status:'missing'};return;}
    if(['budget','companions','diet','travelDates'].includes(field)&&object(value)){
      const old=profile.fields[field].value;
      value={...(object(old)?old:{}),...value};
    }
    if(!replaceList&&['requiredPlaces','excludedPlaces'].includes(field)&&Array.isArray(value)&&value.length){
      const replace=field==='requiredPlaces'?/必去(?:地点|景点)?(?:改成|改为|换成)|只去/.test(text):/(?:排除|避开)(?:地点|景点)?(?:改成|改为|换成)|只(?:排除|避开)/.test(text);
      if(!replace)value=[...new Set([...(profile.fields[field].value??[]),...value])];
    }
    const record=normalizeField(field,{value,status});
    if(status==='tentative'&&profile.fields[field].status==='confirmed')return;
    profile.fields[field]=record;
  };
  const explicit=parsedText(text,original);
  const durationQuestion=/[？?]|吗|多久|多长/.test(text)&&!/(?:安排|规划|制定|改为|改成|改到|调整|只有|总共|我们.*(?:玩|旅行)|旅行.*天)/.test(text);
  const safeProposal=(field,proposal)=>{
    if(/第\s*[一二两三四五六七八九十\d]+\s*天/.test(text)&&['dayCount','dailyHours','startTime','pace'].includes(field))return undefined;
    if(proposal===null){if(detailFieldNames.includes(field)&&!/取消|清空|删除|去掉|不设置|不限制/.test(text))return undefined;return proposal;}
    if(durationQuestion&&['dayCount','dailyHours','startTime'].includes(field))return undefined;
    const wrapped=object(proposal)&&own(proposal,'value'),proposalStatus=wrapped?proposal.status:'confirmed';
    if(wrapped){if(!statuses.includes(proposalStatus))throw new Error('旅行需求修改状态无效');proposal=proposal.value;if(proposal===null)return {value:null,status:'missing'};}
    if(field==='destination'&&typeof proposal==='string'&&/^(?:[零一二两三四五六七八九十\d]+(?:天|日)|半天)(?:路线|行程|计划|方案|旅行|旅游)?$/.test(proposal))return undefined;
    if(field==='companions'&&object(proposal)){
      const supported=explicit.companions??{},safe={};
      // A model may describe the stated group but must not infer its size or age classes.
      for(const key of ['count','adults','children','seniors'])if(own(supported,key)&&own(proposal,key))safe[key]=proposal[key];
      if(typeof proposal.description==='string'&&proposal.description.trim()&&/同行|我们|父母|爸妈|朋友|伴侣|孩子|老人|家人|独自|一个人/.test(text))safe.description=proposal.description;
      return Object.keys(safe).length?{value:safe,status:proposalStatus}:undefined;
    }
    if(detailFieldNames.includes(field)){
      const dietarySupport=object(proposal)&&Object.entries(proposal).every(([part,items])=>Array.isArray(items)&&items.length>0&&items.every(item=>{
        if(typeof item!=='string'||!text.includes(item))return false;
        return text.split(/[，。；,;\n]/).some(clause=>clause.includes(item)&&(part==='restrictions'?/不吃|不能吃|忌口|忌|过敏/.test(clause):/(?<!不)喜欢|爱吃|偏好|想吃|口味/.test(clause)));
      }));
      const supported=field==='diet'?dietarySupport:
        ['stayArea','startArea'].includes(field)?typeof proposal==='string'&&text.includes(proposal):
        field==='travelDates'?false:
        field==='crowdPreference'?/热门|大众|小众|冷门|人少/.test(text):/交通|地铁|自驾|开车|打车|骑行|步行/.test(text);
      // Explicit deterministic extraction above outranks this cautious model fallback.
      return {value:proposal,status:supported?proposalStatus:'tentative'};
    }
    if(['dayCount','dailyHours','startTime','budget'].includes(field))return {value:proposal,status:'tentative'};
    if(['requiredPlaces','excludedPlaces'].includes(field)&&Array.isArray(proposal)){
      const prior=profile.fields[field].value??[],grounded=proposal.filter(name=>typeof name==='string'&&!conditionClause(name)&&(prior.some(old=>placeKey(old)===placeKey(name))||text.includes(name)||places.some(place=>place.id===placeKey(name)&&[place.name,...place.aliases].some(alias=>text.includes(alias)))));
      if(proposal.length&&!grounded.length)return undefined;
      proposal=grounded;
    }
    // A patch is an extraction proposal. Values with no visible support are assumptions.
    const support={destination:typeof proposal==='string'&&text.includes(proposal)&&!places.some(place=>[place.name,...place.aliases].includes(proposal))&&!new RegExp(`(?:不去|不想去|不要去|避开|必去)\\s*${proposal.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`).test(text),pace:/走|轻松|慢游|紧凑|休闲|徒步|累/.test(text),interests:/喜欢|兴趣|偏好|爱看|想看|想体验/.test(text),requiredPlaces:/必去|必须|一定|保留|想去|加上|加入/.test(text),excludedPlaces:/不去|不想去|不要|避开|去掉|删除|取消/.test(text)};
    return {value:proposal,status:support[field]?proposalStatus:'tentative'};
  };
  // Destination clears the old city's named constraints before the new patch is applied.
  const proposedDestination=explicit.destination??(object(patch.destination)&&own(patch.destination,'value')?patch.destination.value:patch.destination);
  if(proposedDestination!==undefined&&proposedDestination!==null){
    const normalized=normalizeValue('destination',proposedDestination);
    if(original.fields.destination.value&&normalized!==original.fields.destination.value){profile.fields.requiredPlaces={value:null,status:'missing'};profile.fields.excludedPlaces={value:null,status:'missing'};profile.fields.stayArea={value:null,status:'missing'};profile.fields.startArea={value:null,status:'missing'};}
  }
  for(const [field,value] of Object.entries(patch))if(!own(explicit,field)){const proposal=safeProposal(field,value);if(proposal!==undefined)apply(field,proposal);}
  for(const [field,value] of Object.entries(explicit))apply(field,value);
  // UI defaults are assumptions, never evidence that the traveler chose Guangzhou or four hours.
  if(destination!==undefined&&profile.fields.destination.status==='missing'&&!own(patch,'destination')&&!own(explicit,'destination'))apply('destination',destination,'tentative');
  if(hours!==undefined&&profile.fields.dailyHours.status==='missing'&&!own(patch,'dailyHours')&&!own(explicit,'dailyHours'))apply('dailyHours',hours,'tentative');
  const placeChanges=parsePlaceChanges(text,[...(profile.fields.requiredPlaces.value??[]),...(profile.fields.excludedPlaces.value??[]),...places.flatMap(place=>[place.name,...place.aliases])]);
  if(placeChanges.required.length||placeChanges.excluded.length){
    const replaceRequired=/必去(?:地点|景点)?(?:改成|改为|换成)|只去/.test(text),replaceExcluded=/(?:排除|避开)(?:地点|景点)?(?:改成|改为|换成)|只(?:排除|避开)/.test(text);
    const required=new Set(replaceRequired?[]:profile.fields.requiredPlaces.value??[]),excluded=new Set(replaceExcluded?[]:profile.fields.excludedPlaces.value??[]);
    for(const name of placeChanges.excluded){excluded.add(name);for(const old of required)if(placeKey(old)===placeKey(name))required.delete(old);}
    for(const name of placeChanges.required){required.add(name);for(const old of excluded)if(placeKey(old)===placeKey(name))excluded.delete(old);}
    if(placeChanges.required.length)apply('requiredPlaces',[...required],'confirmed',true);if(placeChanges.excluded.length)apply('excludedPlaces',[...excluded],'confirmed',true);
    if(placeChanges.required.length&&original.fields.excludedPlaces.value?.some(name=>placeChanges.required.some(next=>placeKey(next)===placeKey(name))))apply('excludedPlaces',[...excluded],'confirmed',true);
    if(placeChanges.excluded.length&&original.fields.requiredPlaces.value?.some(name=>placeChanges.excluded.some(next=>placeKey(next)===placeKey(name))))apply('requiredPlaces',[...required],'confirmed',true);
  }
  if(/(?:没有|无|暂无|不要|取消|清空|去掉|删除)(?:全部|所有|特别)?必去(?:地点|景点)?/.test(text))apply('requiredPlaces',[]);
  if(/(?:没有|无|暂无|取消|清空|去掉|删除)(?:全部|所有|要|想|特别)?(?:排除|避开)(?:地点|景点)?/.test(text))apply('excludedPlaces',[]);
  if(/清空预算|取消预算(?:限制)?|不限制预算|预算不限|不限预算/.test(text))apply('budget',{amount:null,currency:'CNY',scope:'unknown',period:'unknown',includes:[]});
  const allowDefaults=/先给(?:个|一个)?(?:方案|行程)|你先安排|先安排|按默认|先推荐|先给建议/.test(text);
  if(allowDefaults){
    if(profile.fields.dayCount.status==='missing')apply('dayCount',1,'tentative');
    if(profile.fields.dailyHours.status==='missing')apply('dailyHours',8,'tentative');
    if(profile.fields.startTime.status==='missing')apply('startTime',/下午(?:出发|开始|游玩)|(?:从|开始|出发|安排在|改到)\s*下午/.test(text)?'13:00':/晚上(?:出发|开始|游玩)|(?:从|开始|出发|安排在|改到)\s*晚上/.test(text)?'18:00':'09:00','tentative');
  }
  const changes=fieldNames.filter(field=>!same(original.fields[field],profile.fields[field]));
  if(changes.length)profile.revision=original.revision+1;
  profile.followUps=travelFollowUps(profile,{allowDefaults});
  return {profile:normalizeTravelProfile(profile),changed:changes.length>0,changes};
}

// Structured form values are explicit user input, unlike model extraction proposals.
// Only these three fields are accepted; omitted fields retain both value and status.
export function applyTravelSettings(previous,settings){
  if(!object(settings)||!Object.keys(settings).length)throw new Error('请先修改旅行天数、每日时间或游玩强度');
  const original=normalizeTravelProfile(previous),profile=copy(original),changes=[];
  for(const [field,value] of Object.entries(settings)){
    if(!['dayCount','dailyHours','pace'].includes(field))throw new Error('旅行设置包含不支持的字段');
    if(value===null)throw new Error('旅行设置不能为空');
    const normalized=normalizeValue(field,value);
    if(field==='dailyHours'&&!Number.isInteger(normalized*2))throw new Error('每日时间请按半小时调整');
    const next={value:normalized,status:'confirmed'};
    if(!same(original.fields[field],next)){profile.fields[field]=next;changes.push(field);}
  }
  if(changes.length)profile.revision=original.revision+1;
  profile.followUps=travelFollowUps(profile);
  return {profile:normalizeTravelProfile(profile),changed:changes.length>0,changes};
}

export function travelFollowUps(value,{allowDefaults=false,detailed=false}={}){
  const profile=normalizeTravelProfile(value),fields=profile.fields,result=[];
  if(fields.destination.status==='missing'||(!allowDefaults&&fields.destination.status==='tentative'))result.push({field:'destination',question:'你想去哪个城市？也可以说一个喜欢的文化主题。'});
  if(fields.dayCount.status!=='confirmed'&&!allowDefaults)result.push({field:'dayCount',question:'这次准备玩几天？如果只安排半天或几小时，也可以直接告诉我。'});
  const budget=fields.budget.value;
  if(!allowDefaults&&budget?.amount!==null&&budget?.amount!==undefined){
    const scope=budget.scope==='unknown',period=budget.period==='unknown';
    if(scope||period)result.push({field:'budget',question:scope&&period?'这笔预算是每人还是全团、全程还是每天的预算？':scope?'这笔预算是每人还是全团的预算？':'这笔预算是全程还是每天的预算？'});
  }
  if(!allowDefaults&&budget?.amount===null&&(budget.scope!=='unknown'||budget.period!=='unknown'))result.push({field:'budget',question:'预算金额大概是多少？也可以先不设上限。'});
  if(!result.length&&fields.dailyHours.status==='missing'&&!allowDefaults)result.push({field:'dailyHours',question:'每天大概能安排几小时游览？未确定时可以让我先按每天 8 小时给一个暂定方案。'});
  const companions=fields.companions.value;
  if(result.length<2&&!allowDefaults&&budget?.scope==='group'&&budget.amount!==null&&companions?.count==null)result.push({field:'companions',question:'这笔全团预算供几个人使用？不知道人数也可以先保留全团上限。'});
  // Individual needs matter more than inferred ages; ask only when an easy group trip hints at them.
  if(!result.length&&!allowDefaults&&fields.pace.value==='easy'&&companions?.description&&companions.count==null)result.push({field:'companions',question:'同行几个人，有没有需要特别减少步行或照顾的需求？也可以让我先给一份轻松方案。'});
  if(detailed&&!allowDefaults){
    const details=[['companions','这次和谁同行、几个人？有没有需要照顾的步行或休息需求？'],['crowdPreference','更偏向经典热门景点、小众人少的地方，还是两种都要？'],['interests','这次最想体验什么：文化建筑、自然风景、美食、购物，或其他兴趣？'],['requiredPlaces','有没有特别想去、一定要保留的地方？没有必去地点也可以直接说。'],['excludedPlaces','有没有不想去、希望避开的地方？没有排除地点也可以直接说。'],['budget','旅行预算大概多少？请说明人均或全团、全程或每天；也可以不设预算上限。'],['pace','希望轻松少走、适中安排，还是紧凑多玩？'],['diet',fields.diet.value?.restrictions===null?'口味已记下。还有什么饮食忌口或过敏吗？没有忌口也可以直接说。':'吃东西有什么偏好和禁忌？没有忌口也可以直接说。'],['stayArea','大概住在哪个区域？还没订住宿也可以说未定。'],['startArea','每天从哪里出发？可以填酒店区域、车站或大致位置。'],['transport','主要步行、公共交通、自驾、打车还是混合出行？'],['travelDates','预计哪天出发、哪天结束？日期未定可以先留空。']];
    for(const [field,question] of details){if(result.length>=3)break;if((fields[field].status!=='confirmed'||field==='diet'&&fields.diet.value?.restrictions===null)&&!result.some(item=>item.field===field))result.push({field,question});}
  }
  return result.slice(0,detailed?3:2);
}

function budgetText(record){
  if(!record.value)return '';
  const {amount,scope,period,includes}=record.value;
  if(amount===null)return scope==='unknown'&&period==='unknown'&&record.status==='confirmed'?'不限':`${scope==='per-person'?'每人':scope==='group'?'全团':''}${period==='trip'?'全程':period==='day'?'每天':''}金额待确认`;
  return `${scope==='per-person'?'每人':scope==='group'?'全团':'口径待确认'}${period==='trip'?'全程':period==='day'?'每天':'时段待确认'} ${amount} 元${includes.length?`（含${includes.join('、')}）`:''}`;
}
export function travelProfileInput(value,baseInput={}){
  const profile=normalizeTravelProfile(value),f=profile.fields,destination=f.destination.value??baseInput.destination??'';
  const dailyHours=f.dailyHours.value??baseInput.dailyHours??baseInput.hours??8;
  const input={...baseInput,profile,destination,dayCount:f.dayCount.value??1,dailyHours,hours:dailyHours,startTime:f.startTime.value??baseInput.startTime??'09:00',companions:f.companions.value,interests:f.interests.value??baseInput.interests??[],easy:f.pace.value==='easy'?true:f.pace.value?false:Boolean(baseInput.easy),budget:budgetText(f.budget),placeConstraints:{city:destination,required:f.requiredPlaces.value??[],excluded:f.excludedPlaces.value??[]},crowdPreference:f.crowdPreference.value,diet:f.diet.value,stayArea:f.stayArea.value,startArea:f.startArea.value,transport:f.transport.value,travelDates:f.travelDates.value};
  return input;
}
export function travelProfileSummary(value){
  const profile=normalizeTravelProfile(value),f=profile.fields;
  const formatted={destination:f.destination.value,dayCount:f.dayCount.value==null?null:`${f.dayCount.value} 天`,dailyHours:f.dailyHours.value==null?null:`每天 ${f.dailyHours.value} 小时`,startTime:f.startTime.value,companions:f.companions.value?`${f.companions.value.count==null?'人数待确认':`${f.companions.value.count} 人`}${f.companions.value.description?` · ${f.companions.value.description}`:''}`:null,budget:budgetText(f.budget)||null,interests:f.interests.value?.join('、'),pace:{easy:'轻松慢游',normal:'正常节奏',active:'充实紧凑'}[f.pace.value],requiredPlaces:f.requiredPlaces.value?.join('、'),excludedPlaces:f.excludedPlaces.value?.join('、'),crowdPreference:{popular:'经典热门',niche:'小众人少',mixed:'热门与小众结合'}[f.crowdPreference.value],diet:f.diet.value?`口味：${f.diet.value.preferences.join('、')||'未限定'}；忌口：${(f.diet.value.restrictions===null?'未记录忌口':f.diet.value.restrictions.join('、')||'无')}`:null,stayArea:f.stayArea.value,startArea:f.startArea.value,transport:{walk:'步行为主',transit:'公共交通',drive:'自驾',taxi:'打车为主',bike:'骑行',mixed:'灵活混合'}[f.transport.value],travelDates:f.travelDates.value?(f.travelDates.value.start?`${f.travelDates.value.start}${f.travelDates.value.end?` 至 ${f.travelDates.value.end}`:''}`:'日期未定'):null};
  const labels={destination:'目的地',dayCount:'旅行天数',dailyHours:'每日时间',startTime:'开始时间',companions:'同行情况',budget:'预算',interests:'兴趣',pace:'旅行节奏',requiredPlaces:'必去',excludedPlaces:'避开',crowdPreference:'热门 / 小众',diet:'饮食偏好',stayArea:'住宿区域',startArea:'出发区域',transport:'出行方式',travelDates:'旅行日期'};
  return fieldNames.map(field=>({label:labels[field],value:formatted[field]||(['requiredPlaces','excludedPlaces','interests'].includes(field)&&f[field].status==='confirmed'?'暂无':'待补充'),status:f[field].status}));
}
