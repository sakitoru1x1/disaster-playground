import {VertexBuffer} from '@babylonjs/core';

// One shared vertex-coloured material for ALL rubble generations. A coloured
// top surface identifies the parent building; grey is reserved for broken
// concrete edges. Colour survives secondary/tertiary splits via mesh metadata.
const rgb=material=>material?.diffuseColor?
  [material.diffuseColor.r,material.diffuseColor.g,material.diffuseColor.b]:[.72,.68,.61];
const mix=(a,b,t)=>a.map((c,i)=>c*(1-t)+b[i]*t);
const shade=(a,k)=>a.map(v=>Math.max(.018,Math.min(1,v*k)));

export function facadeAppearance(world,entry,kind){
  const style=entry.building.style||0;
  return {paint:rgb(world.materials.walls[style]),
    floorPaint:rgb(entry.mesh.material),
    accent:rgb(world.materials.wallsAccent[style]),
    concrete:rgb(world.materials.concrete),glass:rgb(world.materials.glass),
    kind,buildingId:entry.building.id,storey:entry.storey,style};
}
export function paintFragment(world,mesh,appearance,generation=0){
  if(!appearance)return mesh;
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  if(!normals)return mesh;
  const source={...appearance};
  const kind=source.kind||mesh.metadata?.kind||'slab';
  const size=mesh.metadata?.fragmentSize||[1,1,1];
  const topAxis=size.indexOf(Math.min(...size));
  const paint=source.paint||[.73,.73,.7],floor=source.floorPaint||paint;
  const raw=source.concrete||[.55,.56,.54],accent=source.accent||paint;
  const glass=source.glass||[.29,.52,.64];
  const regions=mesh.metadata?.slabRegions;
  const colors=[],faces=new Map();
  const fade=Math.min(.08,generation*.035);
  const muted=mix(paint,raw,fade);
  for(let i=0;i<normals.length;i+=3){
    const v=i/3,n=[normals[i],normals[i+1],normals[i+2]];
    let color;
    if(kind==='slab'){
      const zone=regions?.[v]??(n[topAxis]>.5?1:n[topAxis]<-.5?4:5);
      if(zone===1){
        // Broad, clearly identifiable top paint from the actual floor.
        color=mix(muted,floor,.24);
      }else if(zone===2){
        // Strong accent coloured trim still attached to the slab.
        color=mix(accent,paint,.12);
      }else if(zone===3){
        // Chipped paint transitions to exposed cement.
        color=mix(raw,paint,.26);
      }else if(zone===4){
        // The former interior ceiling is painted/plastered. When a floor
        // plate lands upside-down it should still clearly match its building.
        // The broken side walls remain exposed concrete.
        color=mix(raw,paint,.68);
      }else if(zone===6){
        color=mix(paint,accent,.28);
      }else if(zone===7){
        // Identifiable original building color across the visible rim.
        // The lower vertices fade into fractured bare concrete.
        color=mix(paint,accent,.16);
      }else{
        color=mix(raw,paint,.12);
      }
      // Deterministic per-face shading avoids the colour-mottled gray
      // appearance previously caused by sampling each tiny face randomly.
      const multiplier=zone===1?1.08:zone===2?1.02:zone===3?.86:zone===4?.99:zone===6?1.00:zone===7?1.00:.91;
      color=shade(color,multiplier);
    }else{
      // Other rubble keeps existing facade colours and glazed fragments.
      const faceIndex=Math.floor(v/4);
      if(!faces.has(faceIndex)){
        const exposed=n[topAxis]<-.2;
        let c=kind==='wall'?
          (exposed?mix(raw,paint,.15):
            Math.random()<.20?mix(paint,glass,.6):mix(paint,accent,.25)):
          mix(paint,accent,.18);
        if(generation)c=mix(c,raw,Math.min(.19,generation*.08));
        faces.set(faceIndex,shade(c,.90+Math.random()*.13));
      }
      color=faces.get(faceIndex);
    }
    colors.push(color[0],color[1],color[2],1);
  }
  mesh.material=world.materials.rubbleSurface;
  mesh.useVertexColors=true;
  mesh.setVerticesData(VertexBuffer.ColorKind,colors);
  mesh.metadata={...(mesh.metadata||{}),rubbleAppearance:source,
    secondaryGeneration:generation};
  return mesh;
}