// One persistent toolbar controls the accepted map and itinerary together.
// Merely editing this input never changes the accepted plan or saved preferences.
export function installTravelRefresh(onRefresh){
  const slot=document.getElementById('route-refresh-slot')||document.querySelector('#route-section .itinerary-content');
  const form=document.createElement('form');form.id='route-refresh-form';form.className='route-refresh-form';
  const label=document.createElement('label');label.htmlFor='route-destination';label.textContent='旅行目的地';
  const row=document.createElement('div');row.className='route-refresh-row';
  const input=document.createElement('input');input.id='route-destination';input.type='text';input.maxLength=40;input.required=true;input.placeholder='城市或地区，如杭州、西藏';input.setAttribute('list','city-options');
  const button=document.createElement('button');button.type='submit';button.id='route-refresh';button.className='primary';button.textContent='刷新攻略';
  const current=document.createElement('span');current.id='route-current-destination';current.className='route-current-destination';
  const note=document.createElement('p');note.id='route-refresh-note';note.className='fine';note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  const help='重新开始这次旅行的16个问题，答完后交给 DeepSeek 规划。';note.textContent=help;
  row.append(input,button);form.append(label,row,current,note);slot.prepend(form);
  let busy=false,acceptedCity='',interviewStatus;
  const labelForButton=()=>['active','paused'].includes(interviewStatus)?'继续问答':interviewStatus==='ready'?'查看问答':'刷新攻略';
  form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;const city=input.value.trim();if(!city){input.setCustomValidity('请输入想去的城市或地区。');input.reportValidity();return;}onRefresh(city);});
  input.addEventListener('input',()=>{input.setCustomValidity('');if(!busy)button.textContent=input.value.trim()===acceptedCity?labelForButton():'刷新攻略';});
  return {
    sync(city,displayedDestination=city,options={}){const value=String(city||'');if(value!==acceptedCity){acceptedCity=value;input.value=value;}interviewStatus=options.isPrevious?options.interviewStatus:undefined;current.textContent=displayedDestination?`${options.isPrevious?'上一份方案':'当前显示'}：${displayedDestination}`:'还没有旅行方案';if(!busy)button.textContent=input.value.trim()===acceptedCity?labelForButton():'刷新攻略';},
    setBusy(value){busy=Boolean(value);button.disabled=busy;input.disabled=busy;button.textContent=busy?'正在处理…':labelForButton();form.setAttribute('aria-busy',String(busy));},
    status(message,error=false){note.textContent=message||help;note.classList.toggle('error',error);}
  };
}
