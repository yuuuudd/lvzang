const root=document.documentElement;
const tripTitle=document.querySelector('#trip-heading');
const objectTitle=document.querySelector('.section-heading h2');
const previewTitle=document.querySelector('.preview-heading h2');
const originalTitles=[tripTitle.textContent,objectTitle.textContent,previewTitle.textContent];
const photoLabel=document.querySelector('.editor .photo-heading label');
const storyLabel=document.querySelector('.editor>label[for=story]');
const story=document.getElementById('story');
const originalFields=[photoLabel.textContent,storyLabel.textContent,story.placeholder];
const tripStatus=document.getElementById('trip-status');
const initialTripStatus=tripStatus.textContent;
const flow=document.getElementById('creation-flow');
let priorFlow=flow.value;

function loadFonts(){
  if(document.getElementById('simple-fonts'))return;
  const link=document.createElement('link');
  link.id='simple-fonts';link.rel='stylesheet';
  link.href='https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@400;500;600&display=swap';
  document.head.append(link);
}

function setPage(page){
  root.dataset.simplePage=page;
  for(const link of document.querySelectorAll('.simple-tab')){
    if(link.dataset.page===page)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
}

function setVersion(simple,page='trip',navigate=false){
  if(simple){
    if(!root.classList.contains('simple-ui'))priorFlow=flow.value;
    root.classList.add('simple-ui');
    setPage(page);loadFonts();flow.value='auto';
    [tripTitle.textContent,objectTitle.textContent,previewTitle.textContent]=['把一趟旅行，画成回忆。','把这一刻，留在手里。','作品预览'];
    [photoLabel.textContent,storyLabel.textContent,story.placeholder]=['照片','这一刻的故事','写下这一刻的故事…'];
    if(tripStatus.textContent===initialTripStatus)tripStatus.textContent='添加至少两张照片，开始创作。';
    document.querySelector('.brand').href='/simple.html';
    document.getElementById('color-view').click();
  }else{
    root.classList.remove('simple-ui');delete root.dataset.simplePage;
    flow.value=priorFlow;
    [tripTitle.textContent,objectTitle.textContent,previewTitle.textContent]=originalTitles;
    [photoLabel.textContent,storyLabel.textContent,story.placeholder]=originalFields;
    if(tripStatus.textContent==='添加至少两张照片，开始创作。')tripStatus.textContent=initialTripStatus;
    document.querySelector('.brand').href='/index.html';
  }
  if(navigate){
    const hash=page==='object'?'#single-create':'#trip-section';
    history.pushState(null,'',`${simple?'/simple.html':'/index.html'}${hash}`);
    requestAnimationFrame(()=>document.querySelector(hash)?.scrollIntoView({block:'start'}));
  }
}

for(const link of document.querySelectorAll('[data-version]'))link.addEventListener('click',event=>{
  event.preventDefault();
  setVersion(link.dataset.version==='simple',root.dataset.simplePage==='object'||location.hash==='#single-create'?'object':'trip',true);
});
for(const link of document.querySelectorAll('.simple-tab'))link.addEventListener('click',event=>{
  event.preventDefault();setPage(link.dataset.page);
  history.pushState(null,'',`/simple.html${link.getAttribute('href')}`);
  requestAnimationFrame(()=>document.querySelector(link.getAttribute('href'))?.scrollIntoView({block:'start'}));
});
document.querySelector('.brand').addEventListener('click',event=>{
  if(!root.classList.contains('simple-ui'))return;
  event.preventDefault();setPage('trip');history.pushState(null,'','/simple.html#trip-section');
  requestAnimationFrame(()=>document.getElementById('trip-section').scrollIntoView({block:'start'}));
});
window.addEventListener('trip-create-object',()=>{if(root.classList.contains('simple-ui')){setPage('object');history.replaceState(null,'','/simple.html#single-create');}});
window.addEventListener('trip-open-artwork',()=>{if(root.classList.contains('simple-ui')){setPage('object');history.replaceState(null,'','/simple.html#single-create');}});
window.addEventListener('trip-return',()=>{if(root.classList.contains('simple-ui')){setPage('trip');history.replaceState(null,'','/simple.html#trip-section');}});
window.addEventListener('popstate',()=>setVersion(location.pathname==='/simple.html',location.hash==='#single-create'?'object':'trip'));
setVersion(root.classList.contains('simple-ui'),location.hash==='#single-create'?'object':'trip');
