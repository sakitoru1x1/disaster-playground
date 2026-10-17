import {strict as assert} from 'node:assert';
import {Vector3} from '@babylonjs/core';
import {groundHeightAt} from '../src/terrainDamage.js';
import {affectCityLife,updateCityLife} from '../src/cityLife.js';
import {CityProgression} from '../src/cityProgression.js';
import {planCity} from '../src/cityLayout.js';
const V=(x,y,z)=>new Vector3(x,y,z);
const crater={x:0,z:0,radius:17,depth:3,kind:'meteor'};
assert.equal(groundHeightAt(100,100,[crater]),-.035);
assert(groundHeightAt(0,0,[crater])<-2.9,'Crater floor must be below sidewalk');
assert(groundHeightAt(17,0,[crater])>-.03,'Crater must have ejecta rim');
assert(groundHeightAt(30,0,[crater])===-.035,'Outside impact is unchanged');
assert(groundHeightAt(0,0,[crater,crater])<groundHeightAt(0,0,[crater]),'Repeated impacts compound, bounded');
const root=(id,x,z)=>({uniqueId:id,position:V(x,.215,z),rotation:{x:0,y:0,z:0}});
const dummy=(id,x,z)=>({
 root:root(id,x,z),state:'walking',panic:0,exposure:0,role:null,
 threat:V(2,0,2),legs:[{rotation:{x:0}},{rotation:{x:0}}],
 arms:[{rotation:{x:0}},{rotation:{x:0}}],
 speed:1.6,walkPhase:0,node:[0,0],target:[0,1],previous:null,walked:0
});
const shelter=dummy(6,0,0);
const injury=dummy(1,1,1);
const medic=dummy(2,1,1.9);medic.role='medic';
const w={civilians:[shelter,injury,medic],props:[],fragments:[],time:0,
 sun:{intensity:1},hemi:{intensity:1},pendingFailures:[],buildings:[],
 integrity:()=>100};
affectCityLife(w,'quake',V(0,0,0),.5,160,.3);
assert.equal(shelter.state,'sheltering','Moderate quake should trigger cover');
updateCityLife(w,.5);
assert.equal(shelter.state,'sheltering','Person must stay in cover');
affectCityLife(w,'quake',V(0,0,0),.9,160,1.2);
assert.equal(injury.state,'injured','Strong disaster should yield treatable injury');
assert.equal(shelter.state,'injured','Extreme exposure can injure sheltered citizen');
// Newly dispatched medics come from healthy survivors after the threat passes.
medic.state='walking';medic.exposure=0;medic.root.rotation.z=0;
const c=new CityProgression(w);c.active=true;c.lastDisaster=0;
for(let n=0;n<5;n++){w.time+=.5;c.update(.5,{effects:[],blastWaves:[],meteors:[]})}
assert(c.rescued>=1,'Medic must reach and treat nearby injured person');
const manual=dummy(11,8,8);manual.state='injured';w.civilians.push(manual);
assert(c.helpNearest(V(8,1,8)),'Player nearby must be able to rescue victim');
assert.equal(manual.state,'walking');
const growthPlan=planCity(10),worldLots=growthPlan.flatMap(p=>p.buildings.map(s=>({
 x:s.x,z:s.z,floors:[{active:false}]})));
const grow={time:100,mobile:true,buildings:worldLots,civilians:[],props:[],
 sun:{intensity:1},hemi:{intensity:1},pendingFailures:[],
 integrity:()=>100,makeBuilding(x,z,i,j,size){this.buildings.push({x,z,floors:[{active:false}]})}};
const growth=new CityProgression(grow);
assert(growth.tryBuildNewBlock(100),'City should expand into open plots');
assert.equal(grow.buildings.length,11);
console.log('CITY_EVOLUTION_PASS: physical crater curve, shelter, injuries, medic treatment, player aid, organic growth');
