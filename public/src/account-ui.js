export * from './identity-menu.js';
import {accountInfo,accountApi} from './account-client.js';
if(accountInfo.enabled){
 const checkSession=async()=>{try{const info=await accountApi('/api/auth/me');if(info.user?.id!==accountInfo.user?.id||info.user?.activeRole!==accountInfo.user?.activeRole)location.reload();}catch{}};
 window.addEventListener('pageshow',checkSession);window.addEventListener('focus',checkSession);
 // Old task ownership recovery can retry next visit; it must not block page startup.
 if(accountInfo.user?.workspaceOwner)void(async()=>{const key='lvzang-tasks-adopted:'+accountInfo.user.id;if(!localStorage.getItem(key)){try{const {listHistory,listTrips}=await import('./history.js'),{openKeepsakeStore}=await import('./travel-keepsake-store.js'),s=await openKeepsakeStore();let data;try{data=await s.dump();}finally{s.close();}const works=await listHistory(),trips=await listTrips(),ids=[...new Set([...works.flatMap(w=>[w.modelTaskId,w.artworkTaskId]),...trips.flatMap(t=>[t.painting?.taskId]),...data.meta.flatMap(m=>m.value?.creationJob?.id?[m.value.creationJob.id]:[])].filter(v=>typeof v==='string'&&/^[a-zA-Z0-9_.-]{1,200}$/.test(v)))];if(ids.length)await accountApi('/api/auth/adopt-local',{ids:ids.slice(0,200)});localStorage.setItem(key,'1');}catch{}}})();
}
