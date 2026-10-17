import {PhysicsAggregate, PhysicsShapeType, Vector3} from '@babylonjs/core';
import {districtPlots, planCity} from './cityLayout.js';

const V = (x,y,z) => new Vector3(x,y,z);
const hash = (i,j) => {
  const n = Math.sin((i+13)*127.1 + (j+7)*311.7)*43758.5453;
  return n-Math.floor(n);
};
// Lightweight single-body skyline fills the new peripheral blocks. Downtown
// towers retain the original independent destructible floors and facades.
// One Havok body per shell, never one physics body per painted window.
export function buildDistrictShells(world) {
  const reserved = new Set(planCity(30).map(p => p.x+','+p.z));
  const shells = [];
  for (const p of districtPlots()) {
    if (reserved.has(p.x+','+p.z)) continue;
    if (Math.hypot(p.x-73,p.z+53)<17) continue; // keep working crane clear
    const seed=hash(p.i,p.j);
    if (seed>(world.mobile?.48:.76)) continue;
    const industrial=p.district==='industrial',harbor=p.district==='harbor';
    const downtown=p.district==='downtown',residential=p.district==='residential';
    const width=industrial?12:10+seed*2.3;
    const depth=harbor?11:10+hash(p.j,p.i)*2.3;
    const height=downtown?15+seed*17:industrial?9+seed*7:
      residential?9+seed*11:harbor?8+seed*13:13+seed*13;
    const materialIndex=p.district==='industrial'?4:
      p.district==='harbor'?5:p.district==='uptown'?2:p.district==='residential'?1:0;
    const mesh=world.box('district shell', [width,height,depth],
      V(p.x,.4+height*.5,p.z),world.materials.walls[materialIndex]);
    mesh.receiveShadows=true;
    mesh.metadata={districtShell:true,district:p.district};
    // Two economical glazing panels instead of hundreds of window meshes.
    if (!industrial) {
      for (const side of [-1,1]) {
        world.box('district window panel',[width*.83,height*.58,.06],
          V(0,0,side*(depth*.5+.035)),world.windowMat,mesh);
      }
    }
    world.box('district roof',[width+.2,.34,depth+.2],
      V(0,height*.5+.06,0),world.materials.dark,mesh);
    const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,
      {mass:0,friction:.87,restitution:.05},world.scene);
    shells.push({mesh,aggregate,x:p.x,z:p.z,district:p.district,
      height,damage:0,ruined:false,dynamic:false});
  }
  world.districtShells=shells;
  world.districtShellsCollapsed=0;
  world.districtDynamicBodies=0;
  return shells;
}
// Disaster callbacks are intentionally bounded: even a max-strength quake
// cannot turn the whole expanded skyline into hundreds of rigid bodies.
export function damageDistrictShells(world,kind,center,power,radius,dt=0) {
  if (!world.districtShells?.length||power<.18) return;
  let changed=0;
  for (const shell of world.districtShells) {
    if (shell.ruined||changed>=3) continue;
    const dx=shell.x-center.x,dz=shell.z-center.z;
    const d=kind==='tsunami'?Math.abs(dx):Math.hypot(dx,dz);
    if (d>radius+8) continue;
    const proximity=1-Math.max(0,d-5)/(radius+5);
    const impact=power*Math.max(0,proximity);
    shell.damage+=(kind==='meteor'?1.2:kind==='tsunami'?.20:.12+Math.min(.4,dt))*impact;
    if (shell.damage<(kind==='meteor'?.55:.88)) continue;
    shell.ruined=true;changed++;world.districtShellsCollapsed++;
    shell.aggregate?.dispose();
    shell.aggregate=null;
    const limit=world.mobile?9:24;
    if (world.districtDynamicBodies<limit) {
      shell.aggregate=new PhysicsAggregate(shell.mesh,PhysicsShapeType.BOX,
        {mass:28+shell.height*.8,friction:.79,restitution:.08},world.scene);
      shell.aggregate.body.applyImpulse(V(Math.sign(dx||1)*(8+14*power),
        6+10*power,Math.sign(dz||1)*(8+14*power)),shell.mesh.getAbsolutePosition());
      shell.dynamic=true;world.districtDynamicBodies++;
    } else {
      // Distant destruction becomes a low-cost squat ruin, not an invisible
      // intact collider after a disaster or an unbounded Havok body.
      shell.mesh.scaling.y=.16;
      shell.mesh.position.y=1.1;
      shell.mesh.rotation.z=.12*(dx<0?-1:1);
    }
    if (changed===1)world.createBurst?.(V(shell.x,1,shell.z),'dust',
      world.mobile?9:15,.42);
  }
}
