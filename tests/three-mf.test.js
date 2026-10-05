import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

test('3MF retains aligned geometry and Bambu face-paint filament assignments including slots three and four',async()=>{
  const {threeMf}=await import('../public/src/three-mf.js');
  const mesh=[0,0,0,1,0,0,0,1,0, 0,0,0,0,1,0,0,0,1, 0,0,0,0,0,1,1,0,0, 1,0,0,0,0,1,0,1,0];
  const palette=['#FFFFFF','#FF0000','#0000FF','#00FF00'];
  const files=unzipSync(threeMf({mesh,palette,faceColors:[0,1,2,3]},{name:'旅行 & <回忆>'}));
  const xml=strFromU8(files['3D/3dmodel.model']);
  assert.equal((xml.match(/<vertex /g)||[]).length,4);assert.equal((xml.match(/<triangle /g)||[]).length,4);
  for(const code of ['4','8','0C','1C'])assert.ok(xml.includes(`paint_color="${code}"`));
  assert.match(xml,/旅行 &amp; &lt;回忆&gt;/);assert.match(xml,/unit="millimeter"/);
  assert.match(xml,/<metadata name="Application">BambuStudio-/,'Bambu only loads filament config for recognized project generator metadata');
  assert.deepEqual(JSON.parse(strFromU8(files['Metadata/project_settings.config'])).filament_colour,palette);
  assert.throws(()=>threeMf({mesh,palette,faceColors:[4,1,2,3]}),/颜色/);
  assert.throws(()=>threeMf({mesh:[NaN,...mesh.slice(1)],palette,faceColors:[0,1,2,3]}),/坐标/);
});
