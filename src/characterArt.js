import {MeshBuilder,TransformNode,Vector3,Mesh,VertexData} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
const COLORS={
 skin:['#edc5a4','#cf9477','#a96d53','#f1d6c0','#bd8b6d'],
 shirt:['#cf6d52','#518cad','#e2bd5d','#6c9b7a','#a76c9c','#4b6c9a','#cb8872','#88a7a1'],
 pants:['#344052','#495063','#786c58','#4c5e5f','#293344'],
 hair:['#292a2d','#664a35','#aa7047','#d6af6e','#6b6261'],
 shoes:['#30333b','#71534b','#d2c6af'],
 accent:['#fff3dd','#f3d05f','#4d718d']
};
const mod=(n,l)=>((n%l)+l)%l;
function material(world,name,color){
 return world.mat('CHARACTER STYLE '+name,color);
}
function master(scene,name,kind,options,mat){
 const mesh=kind==='sphere'?MeshBuilder.CreateSphere(name,{diameter:1,segments:9},scene):
   kind==='cylinder'?MeshBuilder.CreateCylinder(name,{height:1,diameterTop:options.top??1,
     diameterBottom:options.bottom??1,tessellation:9},scene):
   MeshBuilder.CreateBox(name,{size:1},scene);
 mesh.material=mat;mesh.isVisible=true;mesh.isPickable=false;
 // Babylon renders InstancedMesh through its source's draw list. A hidden
 // master can inadvertently hide every pedestrian too. Keep masters
 // active off-stage, with live instances having their own transform.
 mesh.position.y=-1500;mesh.alwaysSelectAsActiveMesh=true;
 return mesh;
}
export function createCharacterLibrary(world){
 const scene=world.scene,meshes=[];
 const add=(id,kind,options,color)=>{
  const mesh=master(scene,'CHARACTER MASTER '+id,kind,options,color);
  meshes.push(mesh);return mesh;
 };
 const palette={};
 for(const [key,colors] of Object.entries(COLORS))
  palette[key]=colors.map((c,i)=>material(world,key+' '+i,c));
 const assets={
  head:palette.skin.map((m,i)=>add('head '+i,'sphere',{},m)),
  nose:palette.skin.map((m,i)=>add('nose '+i,'sphere',{},m)),
  hands:palette.skin.map((m,i)=>add('hands '+i,'sphere',{},m)),
  ear:palette.skin.map((m,i)=>add('ear '+i,'sphere',{},m)),
  hair:palette.hair.map((m,i)=>add('hair '+i,'sphere',{},m)),
  bangs:palette.hair.map((m,i)=>add('bangs '+i,'sphere',{},m)),
  ponytail:palette.hair.map((m,i)=>add('ponytail '+i,'sphere',{},m)),
  shirt:palette.shirt.map((m,i)=>add('shirt '+i,'cylinder',{top:1.04,bottom:.69},m)),
  coat:palette.shirt.map((m,i)=>add('coat '+i,'cylinder',{top:.75,bottom:1},m)),
  sleeves:palette.shirt.map((m,i)=>add('sleeve '+i,'cylinder',{top:.92,bottom:.77},m)),
  pants:palette.pants.map((m,i)=>add('trousers '+i,'cylinder',{top:1.01,bottom:.83},m)),
  shoes:palette.shoes.map((m,i)=>add('shoe '+i,'sphere',{},m)),
  eyes:add('eyes','sphere',{},material(world,'face ink','#2e2928')),
  mouth:add('mouth','box',{},material(world,'mouth','#a3675e')),
  belt:add('belt','cylinder',{top:1,bottom:1},material(world,'belt','#454451')),
  eyewhite:add('eye reflection','sphere',{},material(world,'eye glint','#ffffff')),
  helmet:add('safety helmet','cylinder',{top:.9,bottom:1.16},material(world,'yellow hard hat','#f4c742')),
  visor:add('helmet visor','box',{},material(world,'helmet visor','#f2d990'))
 };
 return {assets,meshes,palette,world};
}
function put(template,label,parent,pos,scale){
 const m=template.createInstance(label);
 m.parent=parent;m.position=V(...pos);m.scaling=V(...scale);m.isPickable=false;
 return m;
}
function rig(name,root,pos){
 const node=new TransformNode(name,root.getScene());
 node.parent=root;node.position=V(...pos);return node;
}
function customMaterial(world,role){
 const pal={
  medic:{shirt:'#e4f0ef',pants:'#427786',hair:'#5a4035',trim:'#e54d56',hat:'#f4fafb',shoes:'#303e46'},
  fire:{shirt:'#d0a33f',pants:'#3f4039',hair:'#493c31',trim:'#f9e390',hat:'#f7d147',shoes:'#302f30'},
  builder:{shirt:'#e88b32',pants:'#384852',hair:'#644d39',trim:'#fff394',hat:'#f3c33c',shoes:'#4d3e34'}
 };
 const c=pal[role];if(!c)return null;
 return Object.fromEntries(Object.entries(c).map(([k,color])=>[
  k,world.mat('CHARACTER '+role+' '+k,color)]));
}
export function createCharacter(world,root,index,{role='civilian',age=null,library=null,lod='full'}={}){
 const lib=library||world.characterLibrary||(world.characterLibrary=createCharacterLibrary(world));
 const A=lib.assets;
 const adult=age||['adult','adult','teen','adult','elder','child','adult','adult'][index%8];
 const type=role==='civilian'?['casual','casual','dress','jacket','casual','hoodie'][index%6]:role;
 const skin=mod(index*7+Math.floor(index/8),A.head.length);
 const hair=mod(Math.floor(index/3)+index*3,A.hair.length);
 const shirt=mod(index*13,A.shirt.length);
 const pants=mod(index*5,A.pants.length);
 const shoe=mod(index*11,A.shoes.length);
 const child=adult==='child',teen=adult==='teen',elder=adult==='elder';
 const slim=(index%7===1),shoulders=child?.78:slim?.89:1.0;
 const scale=child?.78:teen?.90:elder?.95:1;
 const uniform=customMaterial(world,role);
 const source=(kind,idx,overrideMaterial)=>{
  if(!overrideMaterial)return Array.isArray(A[kind])?A[kind][idx]:A[kind];
  const base=Array.isArray(A[kind])?A[kind][idx]:A[kind];
  if(!lib.roleMasters)lib.roleMasters=new Map();
  const key=role+':'+kind;
  if(!lib.roleMasters.has(key)){
   const master=base.clone('CHARACTER MASTER '+key);
   master.material=overrideMaterial;master.isVisible=true;master.isPickable=false;
   master.position.y=-1500;master.alwaysSelectAsActiveMesh=true;
   lib.roleMasters.set(key,master);lib.meshes.push(master);
  }
  return lib.roleMasters.get(key);
 };
 root.scaling=V(scale,scale,scale);
 // Smooth, tapered body: no square Minecraft chest or cubic face.
 const torso=put(source('shirt',shirt,uniform?.shirt),'person torso '+index,root,
   [0,1.29,0],[.57*shoulders,.86,.37]);
 put(A.belt,'person belt '+index,root,[0,.94,0],[.41,.065,.33]);
 const neck=put(A.head[skin],'person neck '+index,root,[0,1.76,0],[.17,.23,.17]);
 const headRig=rig('person articulated head '+index,root,[0,1.86,0]);
 const head=put(A.head[skin],'person head '+index,headRig,[0,.10,0],[.49,.54,.46]);
 const nose=put(A.nose[skin],'person face nose '+index,headRig,
   [0,.065,.24],[.105,.13,.14]);
 const ears=[],details=[nose];
 for(const side of [-1,1]){
  const ear=put(A.ear[skin],'person ear '+index,headRig,
    [side*.255,.075,0],[.11,.18,.14]);ears.push(ear);details.push(ear);
  const eye=put(A.eyes,'person eye '+index,headRig,
    [side*.116,.14,.235],[.067,.075,.035]);details.push(eye);
 }
 const mouth=put(A.mouth,'person mouth '+index,headRig,[0,-.09,.25],[.112,.026,.023]);
 details.push(mouth);
 const hairstyle=role==='fire'||role==='builder'?'helmet':mod(index*17,5)===0?'long':
   mod(index*17,5)===1?'swept':mod(index*17,5)===2?'bun':
   mod(index*17,5)===3?'short':'crop';
 let hairCap=null;
 if(hairstyle==='helmet'){
  const helmetMat=uniform?.hat||A.helmet.material;
  hairCap=put(source('hair',hair,helmetMat),'person protective helmet '+index,headRig,
    [0,.31,0],[.53,.24,.49]);
  put(A.visor,'person helmet brim '+index,headRig,[0,.28,.27],[.54,.08,.26]);
 }else{
  hairCap=put(A.hair[hair],'person hairstyle '+index,headRig,[0,.33,-.045],
    [.50,hairstyle==='crop'?.19:.27,.49]);
  if(hairstyle==='long'||hairstyle==='bun'){
   put(A.ponytail[hair],'person long hair '+index,headRig,
     [0,hairstyle==='long'?.02:.16,-.28],[.42,hairstyle==='long'?.43:.27,.23]);
  }else if(hairstyle==='swept'){
   put(A.bangs[hair],'person swept fringe '+index,headRig,
     [-.18,.22,.22],[.25,.18,.23]);
  }
 }
 const legs=[],arms=[];
 for(const side of [-1,1]){
  const l=rig('person leg pivot '+index,root,[side*.16,.85,0]);
  put(source('pants',pants,uniform?.pants),'person leg '+index,l,
    [0,-.39,0],[.21,.76,.24]);
  put(source('shoes',shoe,uniform?.shoes),'person walking shoe '+index,l,
    [0,-.81,.09],[.29,.22,.43]);
  legs.push(l);
  const shoulder=rig('person arm pivot '+index,root,[side*.36*shoulders,1.65,0]);
  put(source('sleeves',shirt,uniform?.shirt),'person arm '+index,shoulder,
    [side*.025,-.32,0],[.20,.61,.22]);
  const hand=put(A.hands[skin],'person bare hand '+index,shoulder,
    [side*.03,-.69,0],[.17,.22,.17]);details.push(hand);
  arms.push(shoulder);
 }
 if(type==='dress'||type==='jacket'){
  const hem=put(source('coat',shirt,uniform?.shirt),'person outfit hem '+index,
    root,[0,.94,0],[type==='dress'?.52:.44,type==='dress'?.56:.18,.42]);
 }
 if(role==='medic'||role==='fire'||role==='builder'){
  const stripe=uniform.trim;
  // Reflective chest patch, backpack, uniform belt and a recognizable
  // equipment silhouette, with the same low-cost instanced primitives.
  const mark=source('belt',0,stripe);
  put(mark,'person hi visibility stripes '+index,root,[0,1.3,.20],
    [.44,.11,.085]);
  if(role==='medic'){
   put(mark,'person medical shoulder patch '+index,root,
    [.25,1.52,.18],[.13,.14,.09]);
  }
  if(role==='fire'){
   put(source('coat',shirt,uniform?.shirt),'person fire protective coat '+index,
    root,[0,.99,0],[.51,.26,.39]);
  }
 }
 return {torso,head,headRig,legs,arms,age:adult,role,neck,hairCap,details,
   get material(){return {torso:torso.material,head:head.material,
     arms:source('sleeves',shirt,uniform?.shirt).material,
     legs:source('pants',pants,uniform?.pants).material}}};
}
