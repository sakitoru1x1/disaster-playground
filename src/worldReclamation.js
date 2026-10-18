// Hard world-reclamation boundary. Out-of-play rigid bodies, visual rubble,
// animals and casualties must not continue consuming Havok and draw calls.
import {CITY_HALF_SIZE} from './cityLayout.js';
export const OUT_OF_PLAY=CITY_HALF_SIZE+43;
export const outsideCity=p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
  !Number.isFinite(p.z)||Math.abs(p.x)>OUT_OF_PLAY||
  Math.abs(p.z)>OUT_OF_PLAY||p.y>240||p.y< -65;
const position=m=>m?.getAbsolutePosition?.()||m?.position;
const exists=m=>m&&!m.isDisposed?.();
export function cullOutOfBounds(world){
 let removed=0,bodies=0;
 const gone=new Set();
 function drop(mesh,aggregate=null){
  if(!exists(mesh))return;
  aggregate?.dispose?.();if(aggregate)bodies++;
  else mesh.physicsBody?.dispose?.();
  gone.add(mesh);mesh.dispose();removed++;
 }
 for(const group of ['fragments','debris']){
  const arr=world[group]||[];
  for(let i=arr.length-1;i>=0;i--){
   const item=arr[i],mesh=item.mesh;
   if(!mesh||!outsideCity(position(mesh)))continue;
   if(item.collisionObserver&&item.collisionObservable)
    item.collisionObservable.remove(item.collisionObserver);
   drop(mesh,item.aggregate);
   item.aggregate=null;arr.splice(i,1);
   world.activeBodies=Math.max(0,world.activeBodies-1);
  }
 }
 for(const group of ['rubble','staticRubbleBatches','visualFragments']){
  const arr=world[group]||[];
  for(let i=arr.length-1;i>=0;i--){
   const item=arr[i],mesh=item.mesh||item;
   if(!mesh||!outsideCity(position(mesh)))continue;
   drop(mesh,item.aggregate);arr.splice(i,1);
  }
 }
 for(let i=(world.props||[]).length-1;i>=0;i--){
  const item=world.props[i],mesh=item.mesh;
  if(!mesh||!outsideCity(position(mesh)))continue;
  drop(mesh,item.aggregate);world.props.splice(i,1);
  if(item.type==='car')world.windCarsLifted?.delete(mesh.uniqueId);
 }
 for(let i=(world.pets||[]).length-1;i>=0;i--){
  const item=world.pets[i];
  if(!outsideCity(item.root.position))continue;
  drop(item.root);world.pets.splice(i,1);
 }
 for(let i=(world.trees||[]).length-1;i>=0;i--){
  const tree=world.trees[i];
  if(!tree.airborne||!outsideCity(tree.root.position))continue;
  drop(tree.root);world.trees.splice(i,1);
 }
 for(let i=(world.civilians||[]).length-1;i>=0;i--){
  const citizen=world.civilians[i];
  const where=citizen.ragdoll?.torso?.position||citizen.root.position;
  if(!outsideCity(where))continue;
  citizen.ragdoll?.dispose();
  citizen.ragdoll=null;
  drop(citizen.root);world.civilians.splice(i,1);
 }
 // Physically flying building floors also leave the playable island. Keep
 // only their lightweight floor-entry metadata for the rebuilding crane.
 for(const entry of world.structures||[]){
  if(!entry.active||!exists(entry.mesh)||!outsideCity(position(entry.mesh)))continue;
  entry.aggregate?.dispose();entry.aggregate=null;bodies++;
  entry.mesh.setEnabled(false);
  if(entry.homePosition)entry.mesh.position.copyFrom(entry.homePosition);
  // Original floor geometry remains available for reconstruction but doesn't
  // render or collide until the crane repairs it.
  entry.health=0;
  removed++;
 }
 if(gone.size){
  world.pendingSecondary=(world.pendingSecondary||[]).filter(j=>
    j.fragment?.mesh&&!gone.has(j.fragment.mesh)&&exists(j.fragment.mesh));
  world.visualFractureQueue=(world.visualFractureQueue||[]).filter(j=>
    j.part?.mesh&&!gone.has(j.part.mesh)&&exists(j.part.mesh));
  world.pendingFailures=(world.pendingFailures||[]).filter(j=>
    j.entry?.mesh&&exists(j.entry.mesh));
 }
 world.offMapRemoved=(world.offMapRemoved||0)+removed;
 world.offMapBodiesFreed=(world.offMapBodiesFreed||0)+bodies;
 return {removed,bodies,activeBodies:world.activeBodies};
}
