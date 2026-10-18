import {strict as assert} from 'node:assert';
import {NullEngine,Scene,MeshBuilder,StandardMaterial,Color3} from '@babylonjs/core';
import {rescueNeedsStretcher,permitRecoveryWork,RESCUE_PHASES} from '../src/cityEmergency.js';
import {siteMustPause,WorksiteVisuals} from '../src/worksiteVisuals.js';
assert(rescueNeedsStretcher({ragdoll:{},exposure:0}));
assert(rescueNeedsStretcher({injurySeverity:.83}));
assert(rescueNeedsStretcher({exposure:7}));
assert(!rescueNeedsStretcher({exposure:0,injurySeverity:.1}));
assert(RESCUE_PHASES.includes('load')&&RESCUE_PHASES.includes('evacuate'));
assert(permitRecoveryWork({}));
assert(!permitRecoveryWork({burning:true}));
assert(!permitRecoveryWork({victim:true}));
assert(!permitRecoveryWork({medics:true}));
assert(!permitRecoveryWork({heavyEquipment:true}));
const dispatcher={
 isSecuring:site=>site.key==='ambulance',
 isFireWorksite:site=>site.key==='fire-engine'
};
assert(siteMustPause({key:'ambulance',fire:false,victims:false},dispatcher));
assert(siteMustPause({key:'fire-engine',fire:false,victims:false},dispatcher));
assert(siteMustPause({key:'q',fire:true,victims:false},dispatcher));
assert(!siteMustPause({key:'safe',fire:false,victims:false},dispatcher));
const engine=new NullEngine(),scene=new Scene(engine);
const mats=new Map();
const material=(name,hex)=>{
 if(!mats.has(name)){
  const m=new StandardMaterial(name,scene);
  m.diffuseColor=Color3.FromHexString(hex);
  mats.set(name,m);
 }
 return mats.get(name);
};
const world={mobile:true,scene,mat:material,box:(name,sizes,position,mat,parent)=>{
 const mesh=MeshBuilder.CreateBox(name,{width:sizes[0],height:sizes[1],depth:sizes[2]},scene);
 mesh.position.copyFrom(position);mesh.material=mat;if(parent)mesh.parent=parent;
 return mesh;
},cylinder:(name,diameter,height,pos,mat,sides,parent)=>{
 const mesh=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:sides},scene);
 mesh.position.copyFrom(pos);mesh.material=mat;if(parent)mesh.parent=parent;
 return mesh;
}};
const worksites=new WorksiteVisuals(world);
const s={key:'b1',x:15,z:20,claimed:{fill:{}},fire:false,victims:false};
const recovery={sites:new Map([[s.key,s]])};
worksites.claim(s,'fill');worksites.update(.05,recovery);
assert.equal(worksites.active.size,1);
assert.equal(worksites.stats().workers,0);
s.claimed={build:{}};
worksites.claim(s,'build');worksites.update(.8,recovery);
assert.equal(worksites.stats().workers,2);
assert.equal(worksites.stats().barriers,4);
assert.equal(worksites.pool.length,1);
s.fire=true;worksites.update(.05,recovery);
assert.equal(worksites.active.size,0);
const site={key:'b2',x:-12,z:17,claimed:{build:{}},fire:false,victims:false};
recovery.sites.set(site.key,site);
worksites.claim(site,'build');worksites.update(.05,recovery);
assert.equal(worksites.pool.length,1,'Worksite meshes must be pooled, not multiplied per lot');
assert.equal(worksites.stats().workers,2);
scene.dispose();engine.dispose();
console.log('DISPATCH_COORDINATION_PASS: real triage, phase contracts, emergency cordon, reusable safety cones and builders');
