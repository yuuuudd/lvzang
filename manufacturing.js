import createManifold from 'manifold-3d';
import { readGlbMeshes } from './mesh-glb.js';
import { validatePrintSettings } from './public/src/print-settings.js';
export { validatePrintSettings } from './public/src/print-settings.js';

const kernel = createManifold().then(module => { module.setup(); return module; });
export const FILAMENT_PALETTE=['#F0EBDD','#A34029','#294A5E','#789163'];
const paletteRgb=FILAMENT_PALETTE.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));

function surfaceColors(solid,count){
  const mesh=solid.getMesh(),colors=new Uint8Array(mesh.triVerts.length/3),original=new Uint8Array(mesh.triVerts.length*3);
  for(let face=0;face<colors.length;face++){
    const rgb=[0,0,0];for(let v=0;v<3;v++)for(let c=0;c<3;c++){const value=mesh.vertProperties[mesh.triVerts[face*3+v]*mesh.numProp+3+c]??paletteRgb[0][c];rgb[c]+=value/3;original[face*9+v*3+c]=Math.round(Math.max(0,Math.min(1,value))*255);}
    let best=Infinity;for(let c=0;c<count;c++){const distance=rgb.reduce((sum,value,j)=>sum+(value-paletteRgb[c][j])**2,0);if(distance<best){best=distance;colors[face]=c;}}
  }
  return {faceColors:colors,originalColors:original};
}

function triangles(solid) {
  const mesh = solid.getMesh();
  const output = new Float32Array(mesh.triVerts.length * 3);
  for (let i = 0; i < mesh.triVerts.length; i++) {
    const offset = mesh.triVerts[i] * mesh.numProp;
    output.set(mesh.vertProperties.subarray(offset, offset + 3), i * 3);
  }
  return output;
}

// Only trim tiny open sheet artifacts attached to an otherwise closed surface.
// Larger defects, holes and disconnected objects still require another model.
function cleanFlaps(positions,indices){
  const vertices=new Map(),ids=new Uint32Array(positions.length/3),edges=new Map(),faces=[];
  for(let i=0;i<positions.length;i+=3){const key=`${positions[i]},${positions[i+1]},${positions[i+2]}`;if(!vertices.has(key))vertices.set(key,i/3);ids[i/3]=vertices.get(key);}
  for(let i=0;i<indices.length;i+=3){
    const face=Array.from(indices.slice(i,i+3),index=>ids[index]),keys=[];
    for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;keys.push(key);edges.set(key,(edges.get(key)||0)+1);}
    const [a,b,c]=face.map(index=>positions.slice(index*3,index*3+3)),u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
    const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
    faces.push({face:Array.from(indices.slice(i,i+3)),keys,area});
  }
  const isFlap=f=>f.keys.some(key=>edges.get(key)===1)&&f.keys.some(key=>edges.get(key)>2);
  const discarded=faces.filter(isFlap),area=discarded.reduce((sum,f)=>sum+f.area,0),total=faces.reduce((sum,f)=>sum+f.area,0);
  if(!discarded.length||discarded.length>64||area>total*.005)return null;
  return {indices:Uint32Array.from(faces.filter(f=>!isFlap(f)).flatMap(f=>f.face)),removed:discarded.length};
}

export async function buildMagnetModel({ glb, settings, scene = {}, mounts = true } = {}) {
  const config = validatePrintSettings(settings);
  if(typeof mounts!=='boolean'||!mounts&&glb===undefined)throw new Error('无孔模式只支持导入的三维模型');
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) throw new Error('场景必须为对象');
  const people = scene.people ?? 2, archCount = scene.archCount ?? 3;
  if (!Number.isInteger(people) || people < 0 || people > 4 || !Number.isInteger(archCount) || archCount < 1 || archCount > 5) throw new Error('人数应为 0–4，拱门应为 1–5');
  if (scene.detail !== undefined && !['simple', 'detailed'].includes(scene.detail)) throw new Error('detail 必须为 simple 或 detailed');
  if (scene.strengthened !== undefined && typeof scene.strengthened !== 'boolean') throw new Error('strengthened 必须为布尔值');
  const { Manifold, Mesh } = await kernel;
  const owned = [];
  const keep = value => { owned.push(value); return value; };
  const box = (size, at) => keep(keep(Manifold.cube(size)).translate(at));
  const union = solids => keep(Manifold.union(solids));
  const cut = (a, b) => keep(a.subtract(b));
  const cylinder = (height, radius, at) => keep(keep(Manifold.cylinder(height, radius, radius, 64)).translate(at));
  const sphere = (radius, scale, at) => keep(keep(keep(Manifold.sphere(radius, 32)).scale(scale)).translate(at));
  const w = config.widthMm, holeDiameter = config.magnetDiameter + config.clearance;
  const railHeight = holeDiameter + 3.2, railDepth = !mounts?0:glb!==undefined?config.magnetDepth+1.2+.8:Math.max(12, config.magnetDepth + 1.2);
  const holes = [-w * 0.28, w * 0.28].map(x => ({ center: [x, railHeight / 2], diameter: holeDiameter, depth: config.magnetDepth }));
  try {
    let groups, minFeatureMm = null, cleanedTriangles=0,hasSourceColor=false,mountOverlapMm=null;
    if (glb !== undefined) {
      const inputMeshes = await readGlbMeshes(glb);
      // Material primitives may each be open: join their shared positions before solid validation.
      const positions=new Float32Array(inputMeshes.reduce((sum,m)=>sum+m.positions.length,0));
      const properties=new Float32Array(positions.length*2),indices=new Uint32Array(inputMeshes.reduce((sum,m)=>sum+m.indices.length,0));
      let vertexOffset=0,indexOffset=0;
      for(const part of inputMeshes){
        hasSourceColor ||= part.hasColor;
        positions.set(part.positions,vertexOffset*3);
        for(let i=0;i<part.positions.length/3;i++){properties.set(part.positions.subarray(i*3,i*3+3),(vertexOffset+i)*6);properties.set(part.colors.subarray(i*3,i*3+3),(vertexOffset+i)*6+3);}
        for(const index of part.indices)indices[indexOffset++]=vertexOffset+index;
        vertexOffset+=part.positions.length/3;
      }
        const mesh = new Mesh({ numProp: 6, vertProperties: properties, triVerts: indices });
        mesh.merge();
        let solid;
        try { solid = keep(new Manifold(mesh)); } catch {
          const cleaned=cleanFlaps(positions,indices);
          if(cleaned)try{
            const repaired=new Mesh({numProp:6,vertProperties:properties,triVerts:cleaned.indices});repaired.merge();
            solid=keep(new Manifold(repaired));cleanedTriangles+=cleaned.removed;
          }catch{}
          if(!solid)throw new Error('返回网格不是封闭定向实体；参考图已保留，请调整参考图后重新建模');
        }
        if (solid.status() !== 'NoError' || solid.volume() <= 0) throw new Error('返回网格不是封闭定向实体；参考图已保留，请调整参考图后重新建模');
      const pieces=solid.decompose();pieces.forEach(keep);
      let raw = union(pieces), bounds = raw.boundingBox();
      // Tripo may return a side-facing model. Rotate rigidly; never squeeze depth into a relief.
      if(bounds.max[2]-bounds.min[2]>(bounds.max[0]-bounds.min[0])*1.25){raw=keep(raw.rotate([0,-90,0]));bounds=raw.boundingBox();}
      // ponytail: sample-based back detection; use an explicit front direction if both sides are similarly flat.
      // Find the broad, nearly planar side; isolated rear standoffs are not the back plane.
      const samples=[[],[]],span=bounds.max.map((v,i)=>v-bounds.min[i]);
      for(let ix=0;ix<16;ix++)for(let iy=0;iy<16;iy++){
        const x=bounds.min[0]+span[0]*(ix+.5)/16,y=bounds.min[1]+span[1]*(iy+.5)/16;
        const hits=raw.rayCast([x,y,bounds.min[2]-1],[x,y,bounds.max[2]+1]);
        if(hits.length<2)continue;
        const depths=hits.map(hit=>hit.position[2]);samples[0].push(Math.min(...depths));samples[1].push(Math.max(...depths));
      }
      const tolerance=Math.max(span[2]*.02,1e-6);
      const planes=samples.map(values=>{
        const sorted=values.toSorted((a,b)=>a-b),plane=sorted[Math.floor(sorted.length/2)];
        const outliers=sorted.filter(z=>Math.abs(z-plane)>tolerance).length;
        return {plane,flatness:sorted.length?1-outliers/sorted.length:0,outliers};
      });
      const rearReach=[planes[0].plane-bounds.min[2],bounds.max[2]-planes[1].plane];
      const flip=planes[1].flatness>=.75&&(planes[1].flatness>planes[0].flatness+.2||planes[1].outliers>=4&&rearReach[1]>rearReach[0]+tolerance);
      if(flip){
        raw=keep(raw.scale([1,1,-1]));bounds=raw.boundingBox();
      }
      const selectedPlane=planes[flip?1:0],backPlane=flip?-selectedPlane.plane:selectedPlane.plane;
      if(selectedPlane.flatness>=.75&&backPlane-bounds.min[2]>tolerance){
        const size=bounds.max.map((v,i)=>v-bounds.min[i]),pad=Math.max(size[0],size[1])*.01;
        raw=keep(raw.intersect(box([size[0]+pad*2,size[1]+pad*2,bounds.max[2]-backPlane+pad],[bounds.min[0]-pad,bounds.min[1]-pad,backPlane])));
        bounds=raw.boundingBox();
      }
      const ext = bounds.max.map((v, i) => v - bounds.min[i]);
      if (ext.some(v => !Number.isFinite(v) || v <= 0) || ext[1] / ext[0] > 2 || ext[1] / ext[0] < 0.1 || ext[2] / ext[0] < 0.08 || ext[2] / ext[0] > 1.25) throw new Error('GLB 模型比例不适合立体冰箱贴；需重新生成有厚度的紧凑实体');
      const scale = w / ext[0];
      const positioned = keep(keep(keep(raw.translate([-bounds.min[0], -bounds.min[1], -bounds.min[2]])).scale(scale)).translate([-w / 2, 0, mounts?railDepth-.8:0]));
      if(mounts){
      const height=ext[1]*scale,radius=holeDiameter/2+1.6,spacing=radius*2+1;
      const cache=new Map();
      const seatAt=(x,y)=>{
        if(Math.abs(x)+radius>w/2||y-radius<0||y+radius>height||y>height*.65)return null;
        const key=`${x},${y}`;if(cache.has(key))return cache.get(key);
        const region=keep(positioned.intersect(cylinder(ext[2]*scale+1,radius,[x,y,railDepth-.8])));
        if(region.volume()<=0){cache.set(key,null);return null;}
        const depth=region.boundingBox().min[2]+.8,seat=cylinder(depth,radius,[x,y,0]),contact=keep(seat.intersect(positioned));
        if(contact.volume()<8){cache.set(key,null);return null;}
        const overlap=contact.boundingBox();
        if(overlap.max[2]-overlap.min[2]>.801){cache.set(key,null);return null;}
        // The whole seat must be behind source material when viewed from the front, including open gaps.
        const forward=keep(positioned.trimByPlane([0,0,1],depth+.01));
        const exposed=keep(keep(seat.project()).subtract(keep(forward.project())));
        if(exposed.area()>.05){cache.set(key,null);return null;}
        const result={seat,contact,center:[x,y]};cache.set(key,result);return result;
      };
      const ys=[.38,.52,.26,.62,.18].map(f=>height*f),xs=[.18,.26,.12,.34,.42];
      let selected;
      for(const y of ys){
        for(const fraction of xs){
          const x=w*fraction;if(x*2<spacing)continue;
          const left=seatAt(-x,y),right=seatAt(x,y);
          if(left&&right){selected=[left,right];break;}
        }
        if(selected)break;
      }
      if(!selected){
        const choices=[];
        for(const y of ys)for(const x of [0,...xs.flatMap(f=>[-w*f,w*f])]){const seat=seatAt(x,y);if(seat)choices.push(seat);}
        let best=-Infinity;
        for(let i=0;i<choices.length;i++)for(let j=i+1;j<choices.length;j++){
          const [a,b]=[choices[i],choices[j]],distance=Math.hypot(a.center[0]-b.center[0],a.center[1]-b.center[1]);
          if(distance<spacing)continue;
          const score=distance-Math.abs(a.center[0]+b.center[0])*.2-Math.abs(a.center[1]-b.center[1])*.1;
          if(score>best){best=score;selected=[a,b];}
        }
      }
      if(!selected)throw new Error('模型背部中下区域找不到两个能被主体遮住的磁铁位置；已保留参考图，请检查三维背部实体');
      holes.forEach((hole,index)=>{hole.center=selected[index].center;});
      mountOverlapMm=Math.max(...selected.map(item=>{const bounds=item.contact.boundingBox();return bounds.max[2]-bounds.min[2];}));
      }
      if(mounts){
        const footprint=keep(positioned.project());
        const backing=keep(footprint.extrude(railDepth));
        groups = [{ name: 'flat-backing', solid: backing }, { name: 'generated-model', solid: positioned }];
      }else groups = [{ name: 'generated-model', solid: positioned }];
    } else {
      const rail = box([w, railHeight, railDepth], [-w / 2, 0, 0]);
      const wall = scene.strengthened ? 3 : 2;
      const buildingHeight = w * 0.54, top = railHeight + buildingHeight;
      const shell = box([w - 4, buildingHeight + 1, 9], [-w / 2 + 2, railHeight - 1, 0]);
      const cell = (w - 4) / archCount, radius = (cell - wall * 2) / 2;
      if (radius < 2) throw new Error('当前宽度无法容纳所选拱门数量及安全墙厚');
      const openingTop = top - 6, openingBottom = railHeight + 0.8;
      const spring = Math.max(openingBottom + 2, openingTop - radius);
      const openings = [];
      for (let i = 0; i < archCount; i++) {
        const x = -w / 2 + 2 + cell * (i + 0.5);
        openings.push(box([radius * 2, spring - openingBottom, 12], [x - radius, openingBottom, -1]));
        openings.push(cylinder(12, radius, [x, spring, -1]));
      }
      const architecture = cut(shell, union(openings));
      const roofPieces = [box([w, 2.5, 10], [-w / 2, top - 0.5, 0]), box([w - 5, 1.5, 9], [-w / 2 + 2.5, top + 1.5, 0])];
      minFeatureMm = Math.min(wall, 1.5);
      if (scene.detail === 'detailed') {
        const radius = scene.strengthened ? 0.8 : 0.5;
        minFeatureMm = radius * 2;
        // Vertical ornamental finials are deliberately measured, so repair removes real thin features.
        for (const x of [-w * 0.3, 0, w * 0.3]) {
          roofPieces.push(keep(keep(keep(Manifold.cylinder(4, radius, radius, 24)).rotate([-90, 0, 0])).translate([x, top + 2.5, 5])));
          roofPieces.push(box([radius*2,4,5],[x-radius,top+2.5,0]));
        }
      }
      const figures = [];
      for (let i = 0; i < people; i++) {
        const x = (i - (people - 1) / 2) * Math.min(10, w / (people + 1));
        const y = railHeight;
        for(const [radius,stretch,offset,depth] of [[3.2,1.5,3.8,.95],[2.3,1,9.4,1]]){
          figures.push(sphere(radius,[1,stretch,depth],[x,y+offset,10]));
          figures.push(keep(keep(keep(Manifold.cylinder(10,radius*1.01,radius*1.01,32)).scale([1,stretch,1])).translate([x,y+offset,0])));
        }
      }
      groups = [{ name: 'mounting-rail', solid: rail }, { name: 'open-arch-architecture', solid: architecture }, { name: 'roof-and-ornaments', solid: union(roofPieces) }];
      if (figures.length) groups.push({ name: 'rounded-people', solid: union(figures) });
    }
    const cutters = mounts?union(holes.map(h => cylinder(h.depth + 0.1, h.diameter / 2, [h.center[0], h.center[1], -0.1]))):null;
    // The manufactured back and pocket interiors use the first filament.
    if(mounts)groups[0].solid=keep(groups[0].solid.setProperties(3,p=>{for(let c=0;c<3;c++)p[c]=paletteRgb[0][c];}));
    const coloredCutters=mounts?keep(cutters.setProperties(3,p=>{for(let c=0;c<3;c++)p[c]=paletteRgb[0][c];})):null;
    const complete = mounts?cut(union(groups.map(g => g.solid)), coloredCutters):union(groups.map(g => g.solid));
    const status = complete.status(), components = complete.decompose();
    components.forEach(keep);
    if (status !== 'NoError' || components.length !== 1 || complete.volume() <= 0) throw new Error('模型存在非实体或断开的部分；无法安全自动连接，请重新生成');
    const parts = [];
    // Assign intersections to the earlier colour. The parts share faces, never volume.
    let occupied;
    for (let colorIndex = 0; colorIndex < (glb!==undefined&&config.colors>1?0:config.colors); colorIndex++) {
      const assigned = groups.filter((g, i) => i % config.colors === colorIndex);
      if (!assigned.length) continue;
      const colored = mounts?cut(union(assigned.map(g => g.solid)), cutters):union(assigned.map(g => g.solid));
      const disjoint = occupied ? cut(colored, occupied) : colored;
      occupied = occupied ? union([occupied, colored]) : colored;
      if (disjoint.volume() <= 1e-6) continue;
      parts.push({ name: assigned.map(g => g.name).join('+'), colorIndex, mesh: triangles(disjoint), volumeMm3: disjoint.volume(), manifold: disjoint.status() === 'NoError' });
    }
    const bounds = complete.boundingBox();
    const pocketRayChecks = (mounts?holes:[]).map(hole => {
      const [x, y] = hole.center;
      const hits = complete.rayCast([x + 0.11, y + 0.17, -1], [x + 0.11, y + 0.17, bounds.max[2] + 1]);
      const surfaces = [...new Set(hits.map(hit => +hit.position[2].toFixed(5)))].sort((a, b) => a - b);
      const floorZ = surfaces[0];
      return { center: hole.center, rearOpen: floorZ > 0.001, floorZ, remainingFloorMm: surfaces[1] - floorZ };
    });
    if (mounts&&pocketRayChecks.some((check, index) => !check.rearOpen || Math.abs(check.floorZ - holes[index].depth) > 0.001 || !Number.isFinite(check.remainingFloorMm) || check.remainingFloorMm < 1.2 - 0.001)) throw new Error('磁铁孔射线检查失败：后孔未打开或前侧孔底不足');
    const modelMesh=triangles(complete);
    let overhangAreaMm2=0;
    if(glb!==undefined)for(let i=0;i<modelMesh.length;i+=9){
      if(Math.min(modelMesh[i+2],modelMesh[i+5],modelMesh[i+8])<=railDepth+.1)continue;
      const ax=modelMesh[i+3]-modelMesh[i],ay=modelMesh[i+4]-modelMesh[i+1],az=modelMesh[i+5]-modelMesh[i+2];
      const bx=modelMesh[i+6]-modelMesh[i],by=modelMesh[i+7]-modelMesh[i+1],bz=modelMesh[i+8]-modelMesh[i+2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
      if(nz<-.7071*Math.hypot(nx,ny,nz))overhangAreaMm2-=nz/2;
    }
    const checks = [
      ...(glb!==undefined?[{name:'color',status:config.colors>1&&!hasSourceColor?'warn':'pass',detail:config.colors>1?(hasSourceColor?`源模型颜色已量化到最多 ${config.colors} 色；3MF 保存表面涂色，STL 仅保存形状。`:'源文件没有颜色信息，无法从白模恢复原始配色；请重新生成带纹理三维。'):'单色白色模型。'},
        ...(mounts?[{name:'mount-overlap',status:'pass',detail:`两孔位于背部中下区域，正面投影由原模型遮住；原模型在孔位与背板重叠最多 ${mountOverlapMm.toFixed(2)} mm。`}]:[]),
        // ponytail: conservative face-angle screen; replace with slicer support analysis before claiming support-free printing.
        {name:'overhang',status:overhangAreaMm2>5?'fail':overhangAreaMm2>.5?'warn':'pass',detail:overhangAreaMm2>5?`检测到约 ${overhangAreaMm2.toFixed(1)} mm² 向下悬空面（含手指等细节）；需合并或加粗后重新建模，再用切片器确认支撑。`:`向下悬空面约 ${overhangAreaMm2.toFixed(1)} mm²；仍需切片确认。`},
        {name:'self-intersection',status:'warn',detail:'封闭性不代表人物、背包和肩带无穿插；未完成全局自相交和语义遮挡检测，请旋转对照参考图。'}]:[]),
      {name:'flat-back',status:mounts?'pass':'warn',detail:!mounts?'保留原模型背面，未增加背板或磁铁孔；背面平整度需切片确认。':glb!==undefined?'按模型外形投影增加同一平面的背板，再从背面向内切出两个磁铁盲孔。':'拱廊、人物和装饰背侧处于同一平面；磁铁盲孔从背面向内切出。'},
      ...(cleanedTriangles?[{name:'mesh-cleanup',status:'warn',detail:`已清理 ${cleanedTriangles} 个附着的非实体薄片三角形（面积占比不超过 0.5%），随后重新验证封闭性；请对照参考图检查细节。`}]:[]),
      { name: 'topology', status: 'pass', detail: 'Manifold 实体布尔运算成功，闭合定向表面' },
      { name: 'connected', status: 'pass', detail: '最终实体连通分量：1' },
      ...(mounts?[
        { name: 'magnet-floor', status: 'pass', detail: `两孔后向射线验证通过，最小孔底厚 ${Math.min(...pocketRayChecks.map(c => c.remainingFloorMm)).toFixed(2)} mm（要求 ≥1.2 mm）` },
        { name: 'magnet-wall', status: 'pass', detail: glb!==undefined?'两个磁铁座的径向孔壁 1.60 mm（要求 ≥1.5 mm）':'安装底座孔上下壁 1.60 mm（要求 ≥1.5 mm）' }
      ]:[]),
      { name: 'min-feature', status: minFeatureMm === null || minFeatureMm < 1.2 ? 'warn' : 'pass', detail: minFeatureMm === null ? '导入网格尚未完成全局薄壁检测，需切片检查' : `参数化最小设计特征 ${minFeatureMm.toFixed(2)} mm（建议 ≥1.2 mm）` },
      { name: 'slicing', status: 'warn', detail: '未切片或实打验证；悬空、支撑、耗材重量与成本需切片确认' },
    ];
    const colorData=glb!==undefined?surfaceColors(complete,hasSourceColor?config.colors:1):null;
    return { mesh: modelMesh, ...(glb!==undefined?{colorMode:config.colors===1?'single':hasSourceColor?'surface':'missing',palette:FILAMENT_PALETTE.slice(0,config.colors),faceColors:colorData.faceColors,...(hasSourceColor?{originalColors:colorData.originalColors}:{})}:{}),widthMm: bounds.max[0] - bounds.min[0], heightMm: bounds.max[1] - bounds.min[1], totalDepthMm: bounds.max[2] - bounds.min[2], parts,
      report: { source: glb !== undefined ? 'glb' : 'parametric', checks, mountOverlapMm,overhangAreaMm2,connectedComponents: components.length, volumeMm3: complete.volume(), triangleCount: complete.numTri(), minFeatureMm, magnetHoles: mounts?holes:[], pocketRayChecks, magnetFloorMm: mounts?Math.min(...pocketRayChecks.map(c => c.remainingFloorMm)):null, magnetWallMm: mounts?1.6:null, watertight: true, inspectedBy: 'manifold-3d', printabilityVerified: false } };
  } finally {
    for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
  }
}
