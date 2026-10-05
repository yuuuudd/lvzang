import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

export async function readGlbMeshes(input) {
  const data = Buffer.isBuffer(input) ? input : input instanceof Uint8Array ? Buffer.from(input) : null;
  const invalid = reason => { throw new Error(`GLB 无法导入：${reason}`); };
  if (!data || data.length < 28 || data.length > 40_000_000 || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) invalid('文件头或大小无效');
  const jsonLength = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a || jsonLength < 2 || jsonLength > 2 * 1024 * 1024 || 20 + jsonLength + 8 > data.length) invalid('JSON 数据块无效');
  let json;
  try { json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8')); } catch { invalid('JSON 解析失败'); }
  const binStart = 20 + jsonLength;
  if (data.readUInt32LE(binStart + 4) !== 0x004e4942 || binStart + 8 + data.readUInt32LE(binStart) !== data.length) invalid('必须包含一个内嵌二进制数据块');
  const binLength = data.readUInt32LE(binStart);
  if (json.asset?.version !== '2.0' || json.buffers?.length !== 1 || json.buffers[0].uri || !Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength > binLength) invalid('只接受内嵌 GLB 2.0');
  if ((json.extensionsRequired?.length ?? 0) || (json.skins?.length ?? 0) || (json.animations?.length ?? 0)) invalid('仅接受无压缩、无骨骼的静态模型');
  if((json.images?.length??0)>8)invalid('纹理数量过多');
  for(const image of json.images??[])if(image.uri||!Number.isInteger(image.bufferView)||!['image/png','image/jpeg'].includes(image.mimeType))invalid('纹理必须是内嵌 PNG 或 JPEG');
  for (const collection of ['nodes', 'meshes', 'accessors', 'bufferViews']) if (!Array.isArray(json[collection]) || json[collection].length > 2048) invalid(`${collection} 数量无效`);
  for (const view of json.bufferViews) if (view.buffer !== 0 || !Number.isInteger(view.byteLength) || view.byteLength < 0 || !Number.isInteger(view.byteOffset ?? 0) || (view.byteOffset ?? 0) < 0 || (view.byteOffset ?? 0) + view.byteLength > binLength) invalid('bufferView 越界');
  let elementCount = 0;
  for (const accessor of json.accessors) {
    const bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
    const view = json.bufferViews[accessor.bufferView], offset = accessor.byteOffset ?? 0;
    if (!bytes || !components || !view || accessor.sparse || !Number.isInteger(accessor.count) || accessor.count < 1 || !Number.isInteger(offset) || offset < 0) invalid('accessor 无效');
    const stride = view.byteStride ?? bytes * components;
    if (!Number.isInteger(stride) || stride < bytes * components || offset + (accessor.count - 1) * stride + bytes * components > view.byteLength) invalid('accessor 越界');
    elementCount += accessor.count * components;
    if (elementCount > 3000000) invalid('顶点数据过多');
  }
  const visiting = new Set(), visited = new Set();
  function visit(index, depth) {
    if (!Number.isInteger(index) || !json.nodes[index] || depth > 64 || visiting.has(index)) invalid('节点层级无效');
    if (visited.has(index)) return;
    const node = json.nodes[index];
    for (const [key, length] of [['matrix', 16], ['translation', 3], ['rotation', 4], ['scale', 3]]) if (node[key] && (!Array.isArray(node[key]) || node[key].length !== length || node[key].some(n => !Number.isFinite(n)))) invalid('节点变换无效');
    visiting.add(index);
    for (const child of node.children ?? []) visit(child, depth + 1);
    visiting.delete(index); visited.add(index);
  }
  json.nodes.forEach((_, i) => visit(i, 0));
  const document = await new NodeIO().readBinary(new Uint8Array(data));
  const root = document.getRoot(), scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) invalid('缺少场景');
  const textures=new Map();let texturePixels=0;
  for(const texture of root.listTextures()){
    try{
      const bitmap=await sharp(Buffer.from(texture.getImage()),{limitInputPixels:16_777_216}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      texturePixels+=bitmap.info.width*bitmap.info.height;if(texturePixels>16_777_216)invalid('纹理总像素过多');
      textures.set(texture,bitmap);
    }
    catch{invalid('纹理解码失败或尺寸过大');}
  }
  const output = [];
  let triangles = 0;
  scene.traverse(node => {
    const matrix = node.getWorldMatrix();
    const determinant = matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) - matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) + matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) invalid('节点缩放退化');
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== 4 || primitive.listTargets().length) invalid('只支持静态三角网格');
      const attribute = primitive.getAttribute('POSITION');
      if (!attribute || attribute.getType() !== 'VEC3' || attribute.getComponentType() !== 5126) invalid('缺少浮点位置数据');
      const values = attribute.getArray(), positions = new Float32Array(values.length);
      for (let i = 0; i < values.length; i += 3) {
        const x = values[i], y = values[i + 1], z = values[i + 2];
        for (let j = 0; j < 3; j++) positions[i + j] = matrix[j] * x + matrix[4 + j] * y + matrix[8 + j] * z + matrix[12 + j];
      }
      if (positions.some(v => !Number.isFinite(v) || Math.abs(v) > 1e9)) invalid('坐标无效');
      const accessor = primitive.getIndices();
      if (accessor && (accessor.getType() !== 'SCALAR' || ![5121, 5123, 5125].includes(accessor.getComponentType()))) invalid('索引类型无效');
      const indices = accessor ? Uint32Array.from(accessor.getArray()) : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
      triangles += indices.length / 3;
      if (!indices.length || indices.length % 3 || triangles > 150000 || indices.some(i => i >= positions.length / 3)) invalid('三角形数量或索引无效');
      if (determinant < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      const material=primitive.getMaterial(),texture=material?.getBaseColorTexture(),bitmap=textures.get(texture);
      const factor=material?.getBaseColorFactor()??[1,1,1,1],attributeColor=primitive.getAttribute('COLOR_0');
      const uv=primitive.getAttribute('TEXCOORD_'+(material?.getBaseColorTextureInfo()?.getTexCoord()??0));
      if(texture&&!uv)invalid('带颜色纹理的模型缺少 UV');
      if(uv&&(uv.getType()!=='VEC2'||uv.getCount()!==attribute.getCount()))invalid('UV 数量无效');
      if(attributeColor&&(!['VEC3','VEC4'].includes(attributeColor.getType())||attributeColor.getCount()!==attribute.getCount()))invalid('顶点颜色无效');
      const colors=new Float32Array(positions.length),color=[1,1,1,1],point=[0,0];
      // glTF factors/vertex colors are linear; texture bytes are sRGB.
      const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
      const srgb=x=>x<=.0031308?x*12.92:1.055*x**(1/2.4)-.055;
      for(let i=0;i<positions.length/3;i++){
        if(attributeColor)attributeColor.getElement(i,color);
        let pixel;
        if(bitmap){uv.getElement(i,point);if(point.some(v=>!Number.isFinite(v)))invalid('UV 坐标无效');
          const wrap=(v,mode)=>mode===33071?Math.max(0,Math.min(1,v)):mode===33648?1-Math.abs(((v%2)+2)%2-1):((v%1)+1)%1;
          const info=material.getBaseColorTextureInfo(),x=Math.min(bitmap.info.width-1,Math.floor(wrap(point[0],info.getWrapS())*bitmap.info.width)),y=Math.min(bitmap.info.height-1,Math.floor(wrap(point[1],info.getWrapT())*bitmap.info.height));
          pixel=(y*bitmap.info.width+x)*bitmap.info.channels;
        }
        let alpha=material?.getAlphaMode()==='OPAQUE'||!material?1:factor[3]*(attributeColor&&attributeColor.getType()==='VEC4'?color[3]:1)*(bitmap?bitmap.data[pixel+3]/255:1);
        if(material?.getAlphaMode()==='MASK')alpha=alpha>=material.getAlphaCutoff()?1:0;
        for(let c=0;c<3;c++){const value=srgb(alpha*factor[c]*(attributeColor?color[c]:1)*(bitmap?linear(bitmap.data[pixel+c]/255):1)+1-alpha);if(!Number.isFinite(value))invalid('颜色数据无效');colors[i*3+c]=Math.max(0,Math.min(1,value));}
      }
      output.push({ positions, indices, colors, hasColor:Boolean(bitmap||attributeColor||factor.slice(0,3).some(v=>v!==1)) });
    }
  });
  if (!output.length) invalid('场景没有三角网格');
  return output;
}
