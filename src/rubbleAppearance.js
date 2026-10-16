import {VertexBuffer} from '@babylonjs/core';

// A single shared material + per-face vertex colors makes painted facades,
// glass remnants and exposed concrete survive every fracture generation
// without adding draw calls or allocating a material per fragment.
const rgb=material=>material?.diffuseColor ?
  [material.diffuseColor.r,material.diffuseColor.g,material.diffuseColor.b] : [.72,.68,.61];
const mix=(a,b,t)=>a.map((c,i)=>c*(1-t)+b[i]*t);
const shade=(a,k)=>a.map(v=>Math.max(.018,Math.min(1,v*k)));

export function facadeAppearance(world,entry,kind){
  const accent=world.materials.wallsAccent[entry.building.style||0];
  return {paint:rgb(entry.mesh.material),accent:rgb(accent),
    concrete:rgb(world.materials.concrete),glass:rgb(world.materials.glass),
    kind,buildingId:entry.building.id};
}
export function paintFragment(world,mesh,appearance,generation=0){
  if(!appearance)return mesh;
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  if(!normals)return mesh;
  const source={...appearance};
  const kind=source.kind||mesh.metadata?.kind||'slab';
  const size=mesh.metadata?.fragmentSize||[1,1,1];
  const thicknessAxis=size.indexOf(Math.min(...size));
  const tint=source.paint||[.73,.73,.7],raw=source.concrete||[.55,.56,.54];
  const accent=source.accent||tint,glass=source.glass||[.29,.52,.64];
  const colors=[];
  // MeshBuilder.CreateBox creates separate vertices for each face. Sample
  // a palette once per face to avoid color noise or gray cloned materials.
  let faceColors=[];
  for(let i=0;i<normals.length;i+=3){
    const n=[normals[i],normals[i+1],normals[i+2]];
    const faceIndex=Math.floor(i/12);
    if(!faceColors[faceIndex]){
      const exposed=n[thicknessAxis]<-.2;
      let base;
      if(kind==='slab'){
        // Concrete section faces, but a portion of every painted floor plate
        // still carries its original facade/trim pigment.
        base=(n[1]>.5 ? mix(raw,tint,.32+Math.random()*.22):
          Math.random()<.62?mix(raw,accent,.32+Math.random()*.36):raw);
      }else if(kind==='wall'){
        // Inner broken edges are concrete; exterior retains paint/window patches.
        base=exposed?raw:
          Math.random()<.18+generation*.04?mix(tint,glass,.6):mix(tint,accent,Math.random()*.35);
      }else base=Math.random()<.58?mix(tint,accent,.18):raw;
      if(generation)base=mix(base,raw,Math.min(.27,generation*.11));
      faceColors[faceIndex]=shade(base,.89+Math.random()*.17);
    }
    const color=faceColors[faceIndex];
    colors.push(color[0],color[1],color[2],1);
  }
  mesh.material=world.materials.rubbleSurface;
  mesh.useVertexColors=true;
  mesh.setVerticesData(VertexBuffer.ColorKind,colors);
  mesh.metadata={...(mesh.metadata||{}),rubbleAppearance:source,
    secondaryGeneration:generation};
  return mesh;
}