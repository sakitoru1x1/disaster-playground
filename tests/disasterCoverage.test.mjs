import assert from 'node:assert/strict';
import {NullEngine,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {DisasterSystem} from '../src/disasters.js';
import {CITY_HALF_SIZE} from '../src/cityLayout.js';

const v=(x,y,z)=>new Vector3(x,y,z);
const engine=new NullEngine(),scene=new Scene(engine);
const buildings=(n,offset=0)=>Array.from({length:n},(_,i)=>({
 x:-119+((i*23+offset)%10)*26,z:-119+Math.floor(((i*3+offset)%10))*26,
 floors:Array.from({length:6},(_,storey)=>({storey,active:false,
   mesh:{getAbsolutePosition:()=>v(-119+((i*23+offset)%10)*26,2+storey*3.6,-119+Math.floor(((i*3+offset)%10))*26)}}))
}));
const impact=[];
const world={
 mobile:false,buildings:buildings(20),districtBuildings:buildings(67,3),
 structures:[],fragments:[],props:[],debris:[],trees:[],visualFragments:[],
 terrainCraters:[],materials:{crack:new StandardMaterial('crack',scene)},damageTerrain(){},soil:{},massBlastActive:false,
 createBurst(){},trackDecorativeMark(){},affectLife(kind,center){impact.push({kind,x:center.x,z:center.z})}
};
const fake={scene,world,effects:[],shake:0,time:0,emitSound(){},events:{},
 waveRing(){},spark(){}};
DisasterSystem.prototype.quake.call(fake,v(118,0,120),.9);
const quake=fake.effects.at(-1);
assert(quake.targets.length>world.buildings.length*2,
 'Earthquake forgot to include the expanded 67 district buildings');
assert(quake.targets.some(e=>world.districtBuildings.some(b=>b.floors.includes(e))),
 'Outer buildings missing from earthquake targets');
assert(quake.radius>CITY_HALF_SIZE,'Earthquake radius still based on old city');
world.damageStructure=(entry,amount)=>{assert(amount>=0,'Negative seismic damage');return false};
world.mobile=true;
const fx={type:'tornado',root:{position:v(0,0,0)},origin:v(125,0,-125),
 noise:0,cone:{rotation:{y:0}},rings:[],clouds:[],strength:.5,age:0,lastPulse:0,visualFragments:[],physicsAccumulator:0};
DisasterSystem.prototype.tickTornado.call(fake,fx,.02);
assert(fx.root.position.x>100&&fx.root.position.z< -100,
 'Peripheral tornado teleported to the old central boundary');
DisasterSystem.prototype.tickQuake.call(fake,{...quake,pulse:.11,targetIndex:0},.03);
assert(impact.some(e=>e.kind==='tornado'&&e.x>100&&e.z< -100),
 'Tornado did not affect life near the requested outskirts');
const logs=[];
function drivingCar(x,z){
 const body={setMotionType(type){logs.push('motion');this.motion=type},
  getLinearVelocity(){return v(0,0,0)},getAngularVelocity(){return v(0,0,0)},
  setLinearVelocity(velocity){this.velocity=velocity;logs.push('velocity')},
  setAngularVelocity(){},applyForce(){logs.push('force');assert.equal(car.traffic.state,'released') }};
 const car={type:'car',mesh:{position:v(x,1,z),getAbsolutePosition(){return this.position},uniqueId:515},
  aggregate:{body},traffic:{state:'driving',heading:0,speed:9}};
 return car;
}
let car=drivingCar(125,-125);
world.props=[car];world.windCarsLifted=new Set();world.windLifted=0;
world.windEjected=0;world.maxFragmentBodies=90;
const storm={type:'tornado',root:{position:v(0,0,0)},origin:v(125,0,-125),
 noise:0,cone:{rotation:{y:0}},rings:[],clouds:[],strength:.8,age:0,
 lastPulse:0,physicsAccumulator:0,windTracks:new Map(),world};
DisasterSystem.prototype.tickTornado.call(fake,storm,.06);
assert.equal(car.traffic.state,'released','Tornado did not release kinematic car');
assert(logs.includes('velocity'),'Tornado did not impart physical velocity');
car=drivingCar(120,0);world.props=[car];logs.length=0;
const wave={type:'tsunami',root:{position:v(0,0,0)},face:{rotation:{z:0}},
 lip:{position:{y:0}},flood:{position:{x:0},scaling:{x:1}},
 age:(120+CITY_HALF_SIZE)/(CITY_HALF_SIZE*2)*10,
 duration:10,strength:.8,waveHeight:13,lastX:110,lastSpray:0,
 damaged:new Set(),broken:0};
DisasterSystem.prototype.tickTsunami.call(fake,wave,.04);
assert.equal(car.traffic.state,'released','Tsunami did not release kinematic car');
assert(logs.includes('force'),'Tsunami did not apply water force');
console.log('DISASTER_COVERAGE_PASS: outer-district quake/tornado, storm-displaced real-physics cars, tsunami car force');
scene.dispose();engine.dispose();
