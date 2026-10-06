import {readGlbMeshes} from './mesh-glb.js';

export const RAW_PREVIEW_VERSION='raw-1';

// Display the source triangles without requiring a closed or connected printable solid.
export async function createModelPreview(glb){
  const meshes=await readGlbMeshes(glb),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let size=0;
  for(const {positions,indices} of meshes){
    size+=indices.length*3;
    for(const vertex of indices)for(let axis=0;axis<3;axis++){
      const value=positions[vertex*3+axis];min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
    }
  }
  const extent=max.map((value,axis)=>value-min[axis]);
  const scale=60/(extent[0]||Math.max(...extent)||1),origin=[(min[0]+max[0])/2,min[1],min[2]];
  const mesh=new Array(size),originalColors=new Array(size);let offset=0;
  for(const {positions,indices,colors} of meshes)for(const vertex of indices)for(let axis=0;axis<3;axis++){
    mesh[offset]=(positions[vertex*3+axis]-origin[axis])*scale;
    originalColors[offset++]=Math.round(colors[vertex*3+axis]*255);
  }
  const [widthMm,heightMm,totalDepthMm]=extent.map(value=>value*scale);
  return {previewVersion:RAW_PREVIEW_VERSION,mesh,originalColors,widthMm,heightMm,totalDepthMm,centerY:heightMm/2,centerZ:totalDepthMm/2};
}
