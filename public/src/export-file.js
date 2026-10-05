export async function download(blob,name){
  if(matchMedia('(pointer:coarse)').matches&&navigator.share){
    const file=new File([blob],name,{type:blob.type});
    if(navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:name});return 'shared';}
      catch(error){if(error.name==='AbortError')return 'cancelled';}
    }
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
  return 'downloaded';
}
