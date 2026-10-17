import {Quaternion,Vector3} from '@babylonjs/core';

// The spectator has a fixed world-up vector: turning left/right or looking
// vertically can never roll the screen around its forward axis.
// Keep camera.rotation for instrumentation, but use a fresh, orthonormal
// quaternion for the actual view on EVERY update (including knockdown).
const MIN_PITCH=-1.43,MAX_PITCH=1.43;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function applyLevelLook(camera,yaw,pitch){
  const p=clamp(Number.isFinite(pitch)?pitch:0,MIN_PITCH,MAX_PITCH);
  const a=Number.isFinite(yaw)?yaw:0;
  camera.upVector.copyFromFloats(0,1,0);
  camera.rotation.set(p,a,0);
  // An explicit yaw (world Y) + pitch (local X) quaternion has zero roll.
  // Avoid look-direction matrices here: their up-basis may be reoriented
  // internally while the player turns and produce a tilted horizon.
  const q=Quaternion.RotationYawPitchRoll(a,p,0);
  if(camera.rotationQuaternion)camera.rotationQuaternion.copyFrom(q);
  else camera.rotationQuaternion=q;
  return camera;
}

export function applyLevelLookAt(camera,target){
  const delta=target.subtract(camera.position);
  const horizontal=Math.hypot(delta.x,delta.z);
  const yaw=horizontal>1e-6?Math.atan2(delta.x,delta.z):
    Number.isFinite(camera.rotation.y)?camera.rotation.y:0;
  const pitch=Math.atan2(-delta.y,Math.max(horizontal,1e-6));
  return applyLevelLook(camera,yaw,pitch);
}
