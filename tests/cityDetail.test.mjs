import {strict as assert} from 'node:assert';
import {NullEngine,Scene,MeshBuilder,StandardMaterial,VertexBuffer,Vector3} from '@babylonjs/core';
import {
  prepareCityDetails,detailBuildingFloor,detailStreets,detailVehicle
} from '../src/cityDetail.js';
const engine=new NullEngine();
const scene=new Scene(engine);
const world={scene,materials:{},mobile:false};
prepareCityDetails(world);
assert(world.materials.cityDetail,'Shared vertex-tinted material missing');
for(const mobile of [false,true]){
  world.mobile=mobile;
  for(const n of [0,1,3]){
    const floor=MeshBuilder.CreateBox('test floor',{width:11,height:3.44,depth:11},scene);
    floor.position=new Vector3(25,8,25);
    const entry={mesh:floor,size:{x:11,y:3.44,z:11},storey:n,
      building:{id:2,style:1}};
    const detail=detailBuildingFloor(world,entry,{modern:n%2===0,isTop:n===3});
    assert.equal(detail.parent,floor,'Detail must stay with destroyed storey');
    assert.equal(detail.isPickable,false);
    assert(detail.getTotalVertices()>300,'Not enough facade detail vertices');
    assert(detail.getVerticesData(VertexBuffer.ColorKind).length>=detail.getTotalVertices()*4);
    assert(!detail.physicsBody,'Cosmetic facade cannot own Havok body');
    floor.setEnabled(false);
    assert.equal(detail.isEnabled(),false,'Facade not removed on building destruction');
    floor.dispose();
  }
}
const street=detailStreets(world);
assert(street.getTotalVertices()>3000,'Street detail too simple');
assert(!street.parent&&street.isPickable===false);
const car=MeshBuilder.CreateBox('test car',{width:3.65,height:1.15,depth:1.8},scene);
const details=detailVehicle(world,car);
assert.equal(details.parent,car);
assert(details.getTotalVertices()>100);
car.dispose();
scene.dispose();engine.dispose();
console.log('CITY_DETAIL_PASS: batched geometry, parent destruction, per-vehicle trim, detailed streets');
