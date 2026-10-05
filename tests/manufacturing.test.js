import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMagnetModel, validatePrintSettings } from '../manufacturing.js';
import { readGlbMeshes } from '../mesh-glb.js';
import { Document, NodeIO } from '@gltf-transform/core';
import createManifold from 'manifold-3d';
import sharp from 'sharp';

// Independent vertical ray/triangle intersection: detects filled openings and through-holes.
function zHits(mesh, x, y) {
  const hits = [];
  for (let i = 0; i < mesh.length; i += 9) {
    const ax = mesh[i], ay = mesh[i + 1], bx = mesh[i + 3], by = mesh[i + 4], cx = mesh[i + 6], cy = mesh[i + 7];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-8) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) hits.push(u * mesh[i + 2] + v * mesh[i + 5] + (1 - u - v) * mesh[i + 8]);
  }
  return [...new Set(hits.map(z => +z.toFixed(4)))].sort((a, b) => a - b);
}

test('settings bound colour count and physical magnet fit', () => {
  assert.deepEqual(validatePrintSettings(), { colors: 1, widthMm: 60, magnetDiameter: 6, magnetDepth: 2, clearance: 0.2 });
  for (const input of [{ colors: 5 }, { colors: 1.5 }, { widthMm: 0 }, { magnetDiameter: -1 }, { magnetDepth: Infinity }, { clearance: -0.1 }, { widthMm: '60' }]) assert.throws(() => validatePrintSettings(input));
});

test('sample is connected and volumetric with open arches and exactly blind rear pockets', async () => {
  const result = await buildMagnetModel({ scene: { people: 0 } });
  assert.equal(result.report.connectedComponents, 1);
  assert.ok(result.report.volumeMm3 > 1000);
  assert.ok(result.totalDepthMm >= 10);
  assert.equal(result.report.checks.some(c => c.status === 'fail'), false);
  assert.equal(result.report.pocketRayChecks.length, 2);
  assert.ok(result.report.pocketRayChecks.every(check => check.rearOpen && Math.abs(check.floorZ - 2) < 0.001 && check.remainingFloorMm >= 1.2));
  assert.deepEqual(zHits(result.mesh, 0.123, 20.456), []);
  assert.ok(Math.abs(zHits(result.mesh,-27.35,20.456)[0])<.001,'arch wall shares the same flat rear plane as the rail');
  for (const pocket of result.report.magnetHoles) {
    const [x, y] = pocket.center;
    const hits = zHits(result.mesh, x + 0.11, y + 0.17);
    assert.ok(Math.abs(hits[0] - 2) < 0.001, `pocket floor: ${hits}`);
    assert.ok(hits.at(-1) - hits[0] >= 1.2);
    const outside = zHits(result.mesh, x + pocket.diameter / 2 + 0.2, y + 0.17);
    assert.equal(outside[0], 0);
  }
});

test('four colour parts conserve volume and remain manifold after pocket booleans', async () => {
  const result = await buildMagnetModel({ settings: { colors: 4 }, scene: { people: 2 } });
  assert.ok(Math.abs(zHits(result.mesh,-5,18.8)[0])<.001,'figure head has a flat rear face');
  assert.equal(result.parts.length, 4);
  assert.deepEqual(result.parts.map(p => p.colorIndex).sort(), [0, 1, 2, 3]);
  const sum = result.parts.reduce((v, p) => v + p.volumeMm3, 0);
  assert.ok(Math.abs(sum - result.report.volumeMm3) < 0.05);
  assert.ok(result.parts.every(p => p.mesh.length > 0 && p.manifold));
});

test('simplification removes measured fragile decorations', async () => {
  const detailed = await buildMagnetModel({ scene: { detail: 'detailed' } });
  const simple = await buildMagnetModel({ scene: { detail: 'simple' } });
  assert.ok(detailed.report.minFeatureMm < 1.2);
  assert.ok(simple.report.minFeatureMm >= 1.2);
  assert.ok(detailed.mesh.length > simple.mesh.length);
  assert.ok(Math.abs(zHits(detailed.mesh,0,47.3)[0])<.001,'ornament shares the flat rear plane');
});

test('malformed or externally dependent GLB is rejected', async () => {
  await assert.rejects(buildMagnetModel({ glb: Buffer.from('invalid') }), /GLB/i);
});

async function cubeGlb({ floating = false, open = false, transform = false, flap = 0, sideways=false, colored=false, textured=false,alphaTexture=false } = {}) {
  const doc = new Document(), buffer = doc.createBuffer();
  const position = doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array([
    0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1, ...(flap?[.5,-flap,0]:[]),
  ]));
  const faces = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
  if(flap)faces.push(0,1,8);
  const indices = doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint16Array(open ? faces.slice(3) : faces));
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices));
  if(colored){
    mesh.listPrimitives()[0].setAttribute('COLOR_0',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array([1,0,0, 1,0,0, 1,0,0, 1,0,0, 0,0,1, 0,0,1, 0,0,1, 0,0,1])));
  }
  if(textured){
    const bytes=await sharp(Buffer.from(alphaTexture?[255,0,0,0,0,0,255,0]:[255,0,0,0,0,255]),{raw:{width:2,height:1,channels:alphaTexture?4:3}}).png().toBuffer();
    const texture=doc.createTexture().setImage(bytes).setMimeType('image/png');
    mesh.listPrimitives()[0].setMaterial(doc.createMaterial().setBaseColorTexture(texture)).setAttribute('TEXCOORD_0',doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(new Float32Array([.25,.5,.25,.5,.25,.5,.25,.5,.75,.5,.75,.5,.75,.5,.75,.5])));
  }
  const parent = doc.createNode().setTranslation([10,20,30]);
  const child = doc.createNode().setMesh(mesh);
  if (transform) child.setScale([-2,3,2]);
  if(sideways)child.setScale([.3,1,1]);
  parent.addChild(child);
  const scene = doc.createScene().addChild(parent); doc.getRoot().setDefaultScene(scene);
  if (floating) scene.addChild(doc.createNode().setMesh(mesh).setScale([1,.2,1]).setTranslation([10,21.5,30]));
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

test('GLB imports actual transformed mesh and preserves mirrored winding', async () => {
  const glb = await cubeGlb({ transform: true });
  const [mesh] = await readGlbMeshes(glb);
  assert.deepEqual([...mesh.positions.slice(0, 6)], [10,20,30,8,20,30]);
  const result = await buildMagnetModel({ glb });
  assert.equal(result.report.source, 'glb');
  assert.equal(result.report.connectedComponents, 1);
  assert.equal(result.widthMm, 60);
});

test('imported model has one planar rear footprint with blind pockets cut into it',async()=>{
  const result=await buildMagnetModel({glb:await cubeGlb()});
  for(const [x,y] of [[0,42],[-20,42],[20,42]])assert.ok(Math.abs(zHits(result.mesh,x,y)[0])<.001,`rear at ${x},${y} must touch the same plane`);
  assert.equal(result.report.checks.find(item=>item.name==='flat-back')?.status,'pass');
  assert.ok(result.report.pocketRayChecks.every(item=>item.rearOpen&&item.floorZ===2));
});

test('confirmed reference keeps its original solid without an added backing or magnet holes',async()=>{
  const result=await buildMagnetModel({glb:await cubeGlb({colored:true}),settings:{colors:3},mounts:false});
  assert.equal(result.report.source,'glb');
  assert.equal(result.report.connectedComponents,1);
  assert.deepEqual(result.report.magnetHoles,[]);
  assert.deepEqual(result.report.pocketRayChecks,[]);
  assert.ok(Math.abs(result.report.volumeMm3-60**3)<.01,'no projected backing is added to the original cube');
  assert.ok(Math.abs(result.totalDepthMm-60)<.01,'no backing increases the original depth');
  assert.ok(new Set(result.faceColors).size>=2,'source colours survive without a backing group');
  assert.ok(result.report.checks.some(check=>check.name==='flat-back'&&check.status==='warn'));
  assert.equal(result.report.checks.some(check=>check.name.startsWith('magnet-')),false);
  assert.deepEqual(zHits(result.mesh,0,42).slice(0,1),[0]);
});

test('source colors survive geometry processing and are mapped to at most the selected filament colors',async()=>{
  const glb=await cubeGlb({colored:true});
  const whitePrint=await buildMagnetModel({glb,settings:{colors:1},mounts:false});
  assert.equal(whitePrint.originalColors.length,whitePrint.mesh.length);
  assert.ok(new Set(whitePrint.originalColors).has(0)&&new Set(whitePrint.originalColors).has(255));
  assert.deepEqual([...new Set(whitePrint.faceColors)],[0],'white print remains a separate one-color export');
  const result=await buildMagnetModel({glb,settings:{colors:3}});
  assert.equal(result.colorMode,'surface');
  assert.equal(result.faceColors.length,result.mesh.length/9);
  assert.equal(result.palette.length,3);
  assert.ok(new Set(result.faceColors).size>=2);
  assert.ok(result.faceColors.every(c=>Number.isInteger(c)&&c>=0&&c<3));
  assert.equal(result.parts.length,0,'surface colors must not be mislabeled as separable solid parts');
  const legacy=await buildMagnetModel({glb:await cubeGlb(),settings:{colors:4}});
  assert.equal(legacy.colorMode,'missing');
  assert.ok(legacy.report.checks.some(c=>c.name==='color'&&c.status==='warn'));
});

test('embedded GLB texture colors are sampled by UV and survive magnet manufacture',async()=>{
  const glb=await cubeGlb({textured:true}),[part]=await readGlbMeshes(glb);
  assert.equal(part.hasColor,true);assert.deepEqual([...part.colors.slice(0,3)],[1,0,0]);assert.deepEqual([...part.colors.slice(12,15)],[0,0,1]);
  const result=await buildMagnetModel({glb,settings:{colors:3}});
  assert.equal(result.colorMode,'surface');assert.ok(new Set(result.faceColors).size>=2);
  const [opaque]=await readGlbMeshes(await cubeGlb({textured:true,alphaTexture:true}));
  assert.deepEqual([...opaque.colors.slice(0,3)],[1,0,0],'OPAQUE materials must ignore texture alpha');
});

test('side-facing generated models are oriented by their horizontal extent without flattening',async()=>{
  const result=await buildMagnetModel({glb:await cubeGlb({sideways:true})});
  assert.equal(result.widthMm,60);assert.ok(Math.abs(result.totalDepthMm-(18+3.2))<.01);
  assert.ok(Math.abs(result.heightMm-60)<.01,'rear mounting rail must overlap the lower model, not lift it onto a pedestal');
});

async function steppedGlb(unsafe=false){
  const kernel=await createManifold();kernel.setup();const {Manifold}=kernel;
  const low=Manifold.cube([60,10,unsafe?8:3]),moved=low.translate([0,0,unsafe?10:0]),top=Manifold.cube([60,50,18]),upper=top.translate([0,10,0]),whole=moved.add(upper);
  try{
    const mesh=whole.getMesh(),doc=new Document(),buffer=doc.createBuffer();
    const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(mesh.vertProperties)).setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(mesh.triVerts));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    return Buffer.from(await new NodeIO().writeBinary(doc));
  }finally{for(const item of [whole,upper,top,moved,low])item.delete();}
}

test('rear mounting cannot poke through a thin lower body and relocates to actual rear contact',async()=>{
  const result=await buildMagnetModel({glb:await steppedGlb()});
  const hits=zHits(result.mesh,.12,4.13);
  assert.ok(Math.abs(hits.at(-1)-6.2)<.001,'retain 3 mm source thickness, translated 3.2 mm clear of magnet cutters');
  assert.ok(result.report.mountOverlapMm<=.8+.001);
  const raised=await buildMagnetModel({glb:await steppedGlb(true)});
  assert.ok(raised.report.magnetHoles[0].center[1]>10,'mount must move above the unsupported lower overhang');
  assert.ok(raised.report.mountOverlapMm<=.801);
  assert.equal(raised.report.checks.find(item=>item.name==='overhang')?.status,'fail');
});

test('hidden magnet seats find a recessed solid back beyond a small rear protrusion',async()=>{
  const kernel=await createManifold();kernel.setup();const {Manifold}=kernel;
  const plaque=Manifold.cube([60,60,10]).translate([0,0,5]);
  const nub=Manifold.cube([2,2,5]).translate([29,0,0]);
  const whole=plaque.add(nub);
  let glb;
  try{
    const mesh=whole.getMesh(),doc=new Document(),buffer=doc.createBuffer();
    const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(mesh.vertProperties)).setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(mesh.triVerts));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    glb=Buffer.from(await new NodeIO().writeBinary(doc));
  }finally{for(const item of [whole,nub,plaque])item.delete();}
  const result=await buildMagnetModel({glb});
  assert.equal(result.report.magnetHoles.length,2);
  assert.ok(result.report.mountOverlapMm<=.801);
  assert.ok(result.report.pocketRayChecks.every(check=>check.rearOpen&&check.remainingFloorMm>=1.2));
});

test('imported rear standoffs are removed before cutting two flush blind pockets',async()=>{
  const kernel=await createManifold();kernel.setup();const {Manifold}=kernel;
  const solids=[Manifold.cube([60,60,8]).translate([-30,0,0]),
    Manifold.cube([60,20,3.5]).translate([-30,0,-3]),
    Manifold.cube([60,20,6.5]).translate([-30,20,-6]),
    Manifold.cube([60,20,2]).translate([-30,40,-1.5]),
    ...[-16,16].map(x=>Manifold.cylinder(12.5,3.1,3.1,48).translate([x,25,7.5]))];
  const whole=Manifold.union(solids);
  let glb;
  try{
    const mesh=whole.getMesh(),doc=new Document(),buffer=doc.createBuffer();
    const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(mesh.vertProperties)).setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(mesh.triVerts));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    glb=Buffer.from(await new NodeIO().writeBinary(doc));
  }finally{whole.delete();solids.forEach(s=>s.delete());}
  const result=await buildMagnetModel({glb});
  assert.equal(result.report.connectedComponents,1);
  assert.equal(result.report.magnetHoles.length,2);
  assert.ok(result.report.pocketRayChecks.every(c=>c.rearOpen&&Math.abs(c.floorZ-2)<.001&&c.remainingFloorMm>=1.2));
  for(const x of [-16,16])assert.ok(Math.abs(zHits(result.mesh,x+.11,25.17).at(-1)-zHits(result.mesh,0,25.17).at(-1))<.01,'source rear tubes must not remain exposed');
  for(const hole of result.report.magnetHoles){
    const [x,y]=hole.center;
    assert.ok(Math.abs(zHits(result.mesh,x+.11,y+.17)[0]-2)<.001);
    assert.ok(Math.abs(zHits(result.mesh,x+hole.diameter/2+.25,y+.17)[0])<.001);
  }
});

test('two rear standoffs identify the back when both main faces are flat',async()=>{
  const kernel=await createManifold();kernel.setup();const {Manifold}=kernel;
  const solids=[Manifold.cube([60,60,8]).translate([-30,0,0]),...[-16,16].map(x=>Manifold.cylinder(12.5,3.1,3.1,48).translate([x,25,7.5]))];
  const whole=Manifold.union(solids);
  let glb;
  try{
    const mesh=whole.getMesh(),doc=new Document(),buffer=doc.createBuffer();
    const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(mesh.vertProperties)).setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(mesh.triVerts));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    glb=Buffer.from(await new NodeIO().writeBinary(doc));
  }finally{whole.delete();solids.forEach(s=>s.delete());}
  const result=await buildMagnetModel({glb});
  assert.equal(result.report.magnetHoles.length,2);
  assert.ok(result.report.pocketRayChecks.every(c=>c.floorZ===2&&c.remainingFloorMm>=1.2));
  for(const x of [-16,16])assert.ok(Math.abs(zHits(result.mesh,x+.11,25.17).at(-1)-zHits(result.mesh,0,25.17).at(-1))<.01,'rear tubes must be removed even when the other face is planar');
});

test('generated arch gets two hidden mid-lower magnet seats without a visible crossbar',async()=>{
  const kernel=await createManifold();kernel.setup();const {Manifold}=kernel;
  const left=Manifold.cube([10,60,10]),right=left.translate([50,0,0]),top=Manifold.cube([60,10,10]).translate([0,50,0]),whole=Manifold.union([left,right,top]);
  let glb;
  try{
    const mesh=whole.getMesh(),doc=new Document(),buffer=doc.createBuffer();
    const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(mesh.vertProperties)).setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(mesh.triVerts));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    glb=Buffer.from(await new NodeIO().writeBinary(doc));
  }finally{for(const item of [whole,top,right,left])item.delete();}
  const result=await buildMagnetModel({glb});
  assert.equal(result.report.magnetHoles.length,2);
  assert.ok(result.report.magnetHoles.every(h=>h.center[1]>=9&&h.center[1]<=39));
  for(const y of [10,20,30])assert.deepEqual(zHits(result.mesh,0,y),[],'front opening must stay open');
  assert.ok(result.report.pocketRayChecks.every(c=>c.rearOpen&&c.remainingFloorMm>=1.2));
});

test('thin mid-back rejects exposed magnet seats instead of adding a front-visible bar',async()=>{
  const kernel=await createManifold();kernel.setup();const {Manifold}=kernel;
  const spine=Manifold.cube([4,60,10]).translate([28,0,0]),top=Manifold.cube([60,10,10]).translate([0,50,0]),whole=spine.add(top);
  let glb;
  try{
    const mesh=whole.getMesh(),doc=new Document(),buffer=doc.createBuffer();
    const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(mesh.vertProperties)).setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(mesh.triVerts));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    glb=Buffer.from(await new NodeIO().writeBinary(doc));
  }finally{for(const item of [whole,top,spine])item.delete();}
  await assert.rejects(buildMagnetModel({glb}),/中下区域.*遮住/);
});

test('GLB refuses open surfaces and floating components instead of approving export', async () => {
  await assert.rejects(buildMagnetModel({ glb: await cubeGlb({ open: true }) }), /封闭|实体/);
  await assert.rejects(buildMagnetModel({ glb: await cubeGlb({ floating: true }) }), /断开/);
});

test('tiny non-solid mesh flaps are cleaned and reported, while large geometry is not silently removed',async()=>{
  const result=await buildMagnetModel({glb:await cubeGlb({flap:.005})});
  assert.equal(result.report.connectedComponents,1);
  assert.match(result.report.checks.find(c=>c.name==='mesh-cleanup').detail,/1/);
  await assert.rejects(buildMagnetModel({glb:await cubeGlb({flap:.5})}),/实体/);
});

test('mesh manifold has paired oppositely directed edges and positive signed volume', async () => {
  const result = await buildMagnetModel({ settings: { magnetDepth: 8, magnetDiameter: 12, colors: 4 }, scene: { strengthened: true } });
  const edges = new Map(); let volume = 0;
  const key = (mesh, i) => `${mesh[i].toFixed(4)},${mesh[i + 1].toFixed(4)},${mesh[i + 2].toFixed(4)}`;
  for (let i = 0; i < result.mesh.length; i += 9) {
    const m = result.mesh, a = m.slice(i,i+3), b = m.slice(i+3,i+6), c = m.slice(i+6,i+9);
    volume += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0])) / 6;
    for (let j = 0; j < 3; j++) {
      const from = key(m, i + j * 3), to = key(m, i + ((j + 1) % 3) * 3);
      const sorted = from < to ? `${from}|${to}` : `${to}|${from}`;
      const entry = edges.get(sorted) ?? { count: 0, orientation: 0 };
      entry.count++; entry.orientation += from < to ? 1 : -1; edges.set(sorted, entry);
    }
  }
  assert.ok([...edges.values()].every(e => e.count === 2 && e.orientation === 0));
  assert.ok(volume > 0 && Math.abs(volume - result.report.volumeMm3) < 0.01);
  for (const h of result.report.magnetHoles) assert.equal(zHits(result.mesh, h.center[0] + .12, h.center[1] + .13)[0], 8);
});
