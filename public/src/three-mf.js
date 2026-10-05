import { zipSync, strToU8 } from './fflate.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// Bambu TriangleSelector leaf states 1..4: two split bits, then state/overflow bits.
// https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/TriangleSelector.cpp
export function threeMf({mesh,palette,faceColors},{name='拾光纪念品'}={}){
  if(!mesh?.length||mesh.length%9||mesh.length>4_500_000||Array.from(mesh).some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw new Error('三维坐标无效');
  if(!Array.isArray(palette)||!palette.length||palette.length>4||palette.some(c=>!/^#[0-9a-f]{6}$/i.test(c))||faceColors?.length!==mesh.length/9||Array.from(faceColors).some(c=>!Number.isInteger(c)||c<0||c>=palette.length))throw new Error('模型缺少有效的颜色信息');
  const vertices=[],faces=[],ids=new Map(),paint=['4','8','0C','1C'];
  for(let i=0;i<mesh.length;i+=9){
    const face=[];
    for(let j=0;j<9;j+=3){const xyz=[mesh[i+j],mesh[i+j+1],mesh[i+j+2]],key=xyz.join(',');if(!ids.has(key)){ids.set(key,vertices.length);vertices.push(`<vertex x="${xyz[0]}" y="${xyz[1]}" z="${xyz[2]}"/>`);}face.push(ids.get(key));}
    const c=faceColors[i/9];faces.push(`<triangle v1="${face[0]}" v2="${face[1]}" v3="${face[2]}" pid="1" p1="${c}" p2="${c}" p3="${c}" paint_color="${paint[c]}"/>`);
  }
  // Bambu loads filament settings only with a recognized compatibility generator version.
  const xml=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"><metadata name="Application">BambuStudio-02.00.00.00</metadata><metadata name="Description">Exported by SHIGUANG for Bambu Studio compatibility; not sliced.</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="BambuStudio:MmPaintingVersion">0</metadata><metadata name="Title">${escape(name)}</metadata><resources><basematerials id="1">${palette.map((c,i)=>`<base name="Filament ${i+1}" displaycolor="${c}FF"/>`).join('')}</basematerials><object id="2" type="model" name="${escape(name)}" pid="1" pindex="0"><mesh><vertices>${vertices.join('')}</vertices><triangles>${faces.join('')}</triangles></mesh></object></resources><build><item objectid="2"/></build></model>`;
  return zipSync({
    '[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/></Types>'),
    '_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model':strToU8(xml),
    'Metadata/project_settings.config':strToU8(JSON.stringify({filament_colour:palette})),
    'Metadata/model_settings.config':strToU8(`<?xml version="1.0"?><config><object id="2"><metadata key="name" value="${escape(name)}"/><metadata key="extruder" value="1"/></object></config>`),
  },{level:6});
}
