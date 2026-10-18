import {MeshBuilder,PhysicsAggregate,PhysicsShapeType,BallAndSocketConstraint,Vector3} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
// A bounded seven-part articulated Havok body, spawned for hard knocks/death.
// Normal walking remains the inexpensive single-capsule controller.
export class PhysicalRagdoll {
 constructor(scene,at,velocity,style=null){
  this.scene=scene;this.parts=[];this.joints=[];this.age=0;
  const pieces=[
   ['torso',[.68,.85,.36],[0,.12,0],12],
   ['head',[.38,.38,.36],[0,.77,0],3],
   ['left arm',[.23,.70,.26],[-.57,.12,0],3],
   ['right arm',[.23,.70,.26],[.57,.12,0],3],
   ['left leg',[.25,.86,.27],[-.20,-.66,0],6],
   ['right leg',[.25,.86,.27],[.20,-.66,0],6]
  ];
  for(let i=0;i<pieces.length;i++){
   const [name,size,offset,mass]=pieces[i];
   const mesh=MeshBuilder.CreateBox('ragdoll '+name,
    {width:size[0],height:size[1],depth:size[2]},scene);
   mesh.position=at.add(V(...offset));
   const mat=style?.[i===0?'torso':i===1?'head':i<4?'arms':'legs']||
     scene.getMaterialByName(i===1?'citizen skin':
       i<=3?'citizen jacket 0':'citizen trousers');
   if(mat)mesh.material=mat;
   mesh.isPickable=false;
   const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,
    {mass,friction:.77,restitution:.10},scene);
   aggregate.body.setLinearDamping(.24);
   aggregate.body.setAngularDamping(.36);
   aggregate.body.setLinearVelocity(velocity);
   this.parts.push({mesh,aggregate});
  }
  // Local anchors are near the center of each joint and share a world-space
  // center at construction, producing articulated constraints instead of a rigid bar.
  const attach=(index,anchorA,anchorB)=>{
   const joint=new BallAndSocketConstraint(V(...anchorA),V(...anchorB),
     V(0,1,0),V(0,1,0),scene);
   this.parts[0].aggregate.body.addConstraint(this.parts[index].aggregate.body,joint);
   this.joints.push(joint);
  };
  attach(1,[0,.44,0],[0,-.21,0]);
  attach(2,[-.42,.26,0],[.15,.26,0]);
  attach(3,[.42,.26,0],[-.15,.26,0]);
  attach(4,[-.21,-.39,0],[0,.38,0]);
  attach(5,[.21,-.39,0],[0,.38,0]);
  this.parts[0].aggregate.body.applyImpulse(V(velocity.x*3,2,velocity.z*3),
   this.parts[0].mesh.position);
 }
 get torso(){return this.parts[0].mesh}
 update(dt){this.age+=dt}
 dispose(){
  for(const p of this.parts)p.aggregate.dispose();
  for(const p of this.parts)p.mesh.dispose();
  this.parts.length=0;this.joints.length=0;
 }
}
