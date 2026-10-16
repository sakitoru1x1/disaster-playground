import {Color3,DynamicTexture,Texture,Mesh,MeshBuilder,StandardMaterial,VertexData,Vector3} from '@babylonjs/core';

// Stylized city diorama art direction. Procedural, small shared textures:
// no large image downloads, normal-map shaders or extra shadow passes.
const hex=s=>Color3.FromHexString(s);
const rgba=(c)=>[c.r,c.g,c.b,1];
function grain(world,name,base,seed,amount=650){
  const tex=new DynamicTexture(name,{width:256,height:256},world.scene,false);
  const c=tex.getContext();c.fillStyle=base;c.fillRect(0,0,256,256);
  let state=seed;
  const next=()=>((state=(1664525*state+1013904223)>>>0)/4294967296);
  for(let i=0;i<amount;i++){
    const v=next()>.54?255:9,alpha=.018+next()*.075;
    c.fillStyle='rgba('+v+','+v+','+v+','+alpha.toFixed(3)+')';
    const x=next()*256,y=next()*256,w=.6+next()*2.2;
    c.fillRect(x,y,w,w*(.24+next()*1.2));
  }
  tex.update();tex.wrapU=Texture.WRAP_ADDRESSMODE;tex.wrapV=Texture.WRAP_ADDRESSMODE;
  return tex;
}
export function applyVisualArtDirection(world){
  const m=world.materials,s=world.scene;
  // Slightly warm sun and balanced blue ambient for readable face colors.
  s.clearColor.set(.60,.74,.79,1);
  s.ambientColor=hex('#bdc9ce');
  world.hemi.intensity=.70;
  world.hemi.diffuse=hex('#dfebf2');
  world.hemi.groundColor=hex('#8e8b84');
  world.sun.intensity=1.02;
  world.sun.diffuse=hex('#ffead0');

  const palette={
    road:'#404e5b',sidewalk:'#b4b7ad',island:'#91a88b',
    grass:'#82a991',soil:'#bca88f',water:'#377d94',
    dark:'#455461',trim:'#e8dec8',tree:'#4b917e',tree2:'#83b391'
  };
  for(const [name,color]of Object.entries(palette))m[name].diffuseColor=hex(color);
  m.road.diffuseTexture=grain(world,'asphalt fine grain','#495866',0x2ab7,1350);
  m.road.diffuseColor=Color3.White();m.road.diffuseTexture.uScale=8;m.road.diffuseTexture.vScale=18;
  m.sidewalk.diffuseTexture=grain(world,'stone paving grain','#b5b9b0',0x4212,520);
  m.sidewalk.diffuseColor=Color3.White();m.sidewalk.diffuseTexture.uScale=8;m.sidewalk.diffuseTexture.vScale=8;
  m.island.diffuseTexture=grain(world,'miniature island land grain','#91a88b',0x4ac9,1300);
  m.island.diffuseColor=Color3.White();m.island.diffuseTexture.uScale=10;m.island.diffuseTexture.vScale=10;
  m.grass.diffuseTexture=grain(world,'garden grass detail','#80a88e',0x98af,1100);
  m.grass.diffuseColor=Color3.White();m.grass.diffuseTexture.uScale=6;m.grass.diffuseTexture.vScale=6;
  m.roofTerrace=world.mat('showcase roof masonry','#85918d');
  m.showcaseTrim=world.mat('showcase stonework color vertex tint','#ffffff');
  m.showcaseTrim.specularColor=hex('#26333c');
  m.gardenPlanter=world.mat('fountain landscaping', '#658d79');
  m.gardenBrick=world.mat('garden edging', '#d7c5a6');
}

function boxData(positions,indices,colors,cx,cy,cz,sx,sy,sz,color){
  const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2;
  const faces=[
    [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
    [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],
    [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
    [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],
    [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]]
  ];
  for(const face of faces){
    const off=positions.length/3;
    for(const xyz of face){positions.push(...xyz);colors.push(...color)}
    indices.push(off,off+1,off+2,off,off+2,off+3);
  }
}
function batch(world,name,group,material,parent=null){
  const positions=[],indices=[],colors=[];
  for(const p of group)boxData(positions,indices,colors,...p);
  if(!positions.length)return null;
  const normals=[];VertexData.ComputeNormals(positions,indices,normals);
  const data=new VertexData();data.positions=positions;data.indices=indices;data.colors=colors;data.normals=normals;
  const mesh=new Mesh(name,world.scene);
  data.applyToMesh(mesh);mesh.material=material;
  mesh.useVertexColors=true;mesh.isPickable=false;
  mesh.receiveShadows=true;if(parent)mesh.parent=parent;
  return mesh;
}
export function addShowcaseFloor(world,mesh,width,depth,fh,isRoof,style){
  const main=rgba(world.materials.walls[style].diffuseColor),
    accent=rgba(world.materials.wallsAccent[style].diffuseColor),
    warm=rgba(world.materials.trim.diffuseColor);
  const stone=[...main];stone[0]=Math.min(1,stone[0]*1.05);stone[1]=Math.min(1,stone[1]*1.03);
  const g=[];
  const push=(x,y,z,w,h,d,c)=>g.push([x,y,z,w,h,d,c]);
  const yTop=fh*.5-.26,ySill=-fh*.31;
  for(const s of [-1,1]){
    for(const x of [-width*.5+.46,width*.5-.46]){
      push(x,0,s*(depth*.5+.14),.18,fh-.34,.16,accent);
    }
    for(const z of [-depth*.5+.46,depth*.5-.46]){
      push(s*(width*.5+.14),0,z,.16,fh-.34,.18,accent);
    }
    push(0,yTop,s*(depth*.5+.11),width-.23,.12,.18,warm);
    push(s*(width*.5+.11),yTop,0,.18,.12,depth-.23,warm);
    // Distinctive sill below the glazed face without obscuring windows.
    push(0,ySill,s*(depth*.5+.13),width*.78,.09,.23,stone);
    push(s*(width*.5+.13),ySill,0,.23,.09,depth*.78,stone);
  }
  if(isRoof){
    for(const s of [-1,1]){
      push(0,fh*.5+.36,s*(depth*.5-.18),width,.39,.30,accent);
      push(s*(width*.5-.18),fh*.5+.36,0,.30,.39,depth,accent);
    }
    push(width*.14,fh*.5+.27,depth*.14,1.65,.17,2.10,stone);
    push(-width*.22,fh*.5+.27,-depth*.21,1.15,.17,1.65,warm);
  }
  return batch(world,'showcase facade cornices and pilasters',g,world.materials.showcaseTrim,mesh);
}

let shadowMat=null;
function contactMaterial(world){
  if(shadowMat&&shadowMat.getScene()===world.scene)return shadowMat;
  const tex=new DynamicTexture('soft foundation contact',{width:64,height:64},world.scene,false);
  const ctx=tex.getContext();
  const grad=ctx.createRadialGradient(32,32,7,32,32,32);
  grad.addColorStop(0,'rgba(22,33,40,.52)');
  grad.addColorStop(.55,'rgba(22,33,40,.30)');
  grad.addColorStop(1,'rgba(22,33,40,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);tex.hasAlpha=true;tex.update();
  shadowMat=new StandardMaterial('stylized foundation soft shadow',world.scene);
  shadowMat.diffuseTexture=tex;
  shadowMat.useAlphaFromDiffuseTexture=true;
  shadowMat.disableLighting=true;shadowMat.backFaceCulling=false;
  shadowMat.disableDepthWrite=true;
  return shadowMat;
}
export function addShowcaseEntrance(world,parent,width,depth,fh,style){
  // A single pair of painted shopfront canopies, parented to the foundation.
  const trim=rgba(world.materials.wallsAccent[style].diffuseColor);
  const shadow=rgba(world.materials.dark.diffuseColor);
  const pieces=[
    [0,-fh*.5+2.72,depth*.5+.65,Math.min(4.4,width*.48),.22,1.15,shadow],
    [0,-fh*.5+2.57,depth*.5+.83,Math.min(4,width*.44),.12,.89,trim]
  ];
  return batch(world,'showcase lobby awning',pieces,world.materials.showcaseTrim,parent);
}
export function addShowcaseContact(world,x,z,width,depth){
  const p=MeshBuilder.CreateGround('showcase ambient contact',{width:width+3,height:depth+3},world.scene);
  p.position=new Vector3(x,.302,z);p.material=contactMaterial(world);
  p.isPickable=false;p.receiveShadows=false;
  return p;
}
export function addShowcasePlaza(world){
  const m=world.materials;const wood=rgba(m.trim.diffuseColor);
  const planter=rgba(m.gardenPlanter.diffuseColor),brick=rgba(m.gardenBrick.diffuseColor);
  const metal=rgba(m.dark.diffuseColor),foliage=rgba(m.tree2.diffuseColor);
  const group=[];
  const push=(x,y,z,w,h,d,c)=>group.push([x,y,z,w,h,d,c]);
  // Four low benches with small evergreen planters frame the fountain.
  // Entire plaza decor is ONE mesh and never becomes a Havok body.
  for(const s of [-1,1]){
    push(s*6.45,.74,0,.8,.14,2.8,wood);
    push(s*6.45,.98,s*.98,.22,.7,.18,metal);
    for(const z of [-2.45,2.45]){
      push(s*6.4,.55,z,1,.40,1,brick);
      push(s*6.4,.86,z,.70,.22,.70,planter);
      push(s*6.4,1.14,z,.63,.39,.63,foliage);
    }
    push(0,.74,s*6.45,2.8,.14,.8,wood);
    push(s*.98,.98,s*6.45,.18,.7,.22,metal);
  }
  // Zebra crossings at the streets bordering the fountain plaza.
  const roadPaint=rgba(m.marking.diffuseColor);
  for(const x of [-13,13])for(let i=0;i<6;i++)
    push(x-2.65+i*1.0,.184,0,.48,.025,5.5,roadPaint);
  const mesh=batch(world,'showcase central plaza details',group,m.showcaseTrim);
  mesh.position.y=0;mesh.freezeWorldMatrix();
  return mesh;
}