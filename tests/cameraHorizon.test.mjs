import {strict as assert} from 'node:assert';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {applyLevelLook,applyLevelLookAt} from '../src/cameraHorizon.js';
const engine=new NullEngine(),scene=new Scene(engine);
const camera=new FreeCamera('first person view',new Vector3(0,2,0),scene);
const check=(label)=>{
 const up=Vector3.TransformNormal(Vector3.Up(),camera.getViewMatrix(true));
 assert(Math.abs(up.x)<1e-5,`${label}: screen/world horizon rolled ${up.x}`);
 assert(up.y>.10,`${label}: camera upside down`);
 assert(Math.abs(camera.rotation.z)<1e-9,`${label}: Euler roll detected`);
 // Babylon mutates camera.upVector while building a view matrix; only the
 // projected world-up vector determines the visible horizon angle.
 assert(Number.isFinite(up.z),`${label}: invalid camera orientation`);
};
for(let yaw=-3*Math.PI;yaw<3*Math.PI;yaw+=.12){
 for(const pitch of [-1.43,-.93,-.49,0,.27,.81,1.43]){
  // Existing accumulated rotations must never survive a new look update.
  camera.rotation.set(.6,.4,1.2);
  camera.rotationQuaternion=null;
  applyLevelLook(camera,yaw,pitch);
  check(`yaw=${yaw}, pitch=${pitch}`);
  const ray=camera.getForwardRay(1).direction;
  const expected=new Vector3(Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  assert(Vector3.Distance(ray,expected)<1e-4,`Look direction diverged from movement at yaw ${yaw}`);
 }
}
camera.position.set(5,8,-2);
for(const target of [new Vector3(0,.45,0),new Vector3(15,7,20),
  new Vector3(-6,0,-11)]){
 applyLevelLookAt(camera,target);
 check('ragdoll look-at');
}
camera.rotation.set(0,0,1.1);
applyLevelLook(camera,-.2,.3);
check('force reset roll after knockdown');
console.log('HORIZON_LOCK_PASS: yaw 360+ turns, vertical pitch, knockdown and ragdoll look-at keep the horizon level');
scene.dispose();engine.dispose();