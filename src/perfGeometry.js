import {Mesh,VertexData} from '@babylonjs/core';

// Four facade surfaces as ONE child mesh per structural floor.
// They inherit the floor transform and disappear with the collider on rupture.
export function makeFacadeWindows(scene,parent,material,width,depth,floorHeight){
  const positions=[],indices=[],uvs=[];
  function quad(a,b,c,d){
    const base=positions.length/3;
    for(const p of [a,b,c,d])positions.push(...p);
    uvs.push(0,0,1,0,1,1,0,1);
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const hh=floorHeight*.52*.5,hw=width*.83*.5,hd=depth*.81*.5;
  for(const side of [-1,1]){
    const z=side*(depth*.5+.022);
    quad([-hw,-hh,z],[hw,-hh,z],[hw,hh,z],[-hw,hh,z]);
    const x=side*(width*.5+.022);
    quad([x,-hh,-hd],[x,-hh,hd],[x,hh,hd],[x,hh,-hd]);
  }
  const data=new VertexData(),normals=[];
  VertexData.ComputeNormals(positions,indices,normals);
  data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=uvs;
  const mesh=new Mesh('batched floor window facades',scene);
  data.applyToMesh(mesh);
  mesh.material=material;mesh.parent=parent;mesh.isPickable=false;
  return mesh;
}

// Only bake OLD, collider-free fragments. Keep recent debris as separate
// meshes, so a tornado still has dozens of physical pieces to re-activate.
// Spatially bounded groups prevent one giant citywide draw that cannot cull.
export function compactSettledRubble(world){
  const loose=world.rubble;
  const reserve=world.mobile?28:60;
  if(loose.length<reserve+12)return 0;
  const groups=new Map();
  const candidates=loose.slice(0,Math.max(0,loose.length-reserve));
  for(const mesh of candidates){
    if(!mesh||mesh.isDisposed()||mesh.parent||mesh.physicsBody||!mesh.geometry)continue;
    if(mesh.getChildMeshes(false).length)continue; // don't orphan fractured glass
    if(mesh.metadata?.windReactivated||mesh.metadata?.pendingVisualFracture)continue;
    if(mesh.name==='batched static city geometry')continue;
    const p=mesh.getAbsolutePosition();
    const key=Math.floor(p.x/20)+'/'+Math.floor(p.z/20)+'/'+(mesh.material?.uniqueId??'none');
    const bucket=groups.get(key)||[];
    bucket.push(mesh);groups.set(key,bucket);
  }
  const eligible=[...groups.values()].filter(g=>g.length>=6)
    .sort((a,b)=>b.length-a.length);
  if(!eligible.length)return 0;
  // Merge at most one nearby group per interval to avoid frame-time spikes.
  const group=eligible[0].slice(0,22);
  try{
    const merged=Mesh.MergeMeshes(group,true,true,undefined,false,false);
    if(!merged)return 0;
    merged.name='baked settled rubble';
    merged.metadata={bakedRubble:true};
    merged.isPickable=false;merged.receiveShadows=true;
    merged.freezeWorldMatrix();
    const removed=new Set(group);
    world.rubble=world.rubble.filter(m=>!removed.has(m));
    world.staticRubbleBatches.push(merged);
    world.bakedRubbleMeshes+=group.length;
    return group.length-1;
  }catch(error){
    console.warn('Rubble batch skipped',error);
    return 0;
  }
}