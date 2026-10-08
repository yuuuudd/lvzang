// The itinerary owns a visible destination and a deliberate regeneration action.
// Merely editing this input never changes the accepted plan or saved preferences.
export function installTravelRefresh(onRefresh){
  const slot=document.getElementById('route-refresh-slot')||document.querySelector('#route-section .itinerary-content');
  const form=document.createElement('form');form.id='route-refresh-form';form.className='route-refresh-form';
  const label=document.createElement('label');label.htmlFor='route-destination';label.textContent='旅行目的地';
  const row=document.createElement('div');row.className='route-refresh-row';
  const input=document.createElement('input');input.id='route-destination';input.type='text';input.maxLength=40;input.required=true;input.placeholder='输入想去的城市';input.setAttribute('list','city-options');
  const button=document.createElement('button');button.type='submit';button.id='route-refresh';button.className='secondary';button.textContent='重新生成攻略';
  const note=document.createElement('p');note.id='route-refresh-note';note.className='fine';note.setAttribute('role','status');note.setAttribute('aria-live','polite');
  note.textContent='换个城市，或按已有偏好重新安排。';
  row.append(input,button);form.append(label,row,note);slot.prepend(form);
  let busy=false,acceptedCity='';
  form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;const city=input.value.trim();if(!city){input.setCustomValidity('请输入想去的城市。');input.reportValidity();return;}onRefresh(city);});
  input.addEventListener('input',()=>input.setCustomValidity(''));
  return {
    sync(city){const value=String(city||'');if(value!==acceptedCity){acceptedCity=value;input.value=value;}},
    setBusy(value){busy=Boolean(value);button.disabled=busy;input.disabled=busy;button.textContent=busy?'正在重新生成…':'重新生成攻略';form.setAttribute('aria-busy',String(busy));},
    status(message,error=false){note.textContent=message||'换个城市，或按已有偏好重新安排。';note.classList.toggle('error',error);}
  };
}
