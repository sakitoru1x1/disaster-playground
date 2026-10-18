import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,Vector3} from '@babylonjs/core';
import {CityFires,supportedFireAnchor} from '../src/cityFires.js';
import {RecordedSoundscape,petHearingGain,PET_AUDIO_RANGE} from '../src/recordedAudio.js';
const V=(x,y,z)=>new Vector3(x,y,z);
assert.equal(petHearingGain(V(0,0,0),V(20,0,0)),0);
assert.equal(petHearingGain(V(0,0,0),V(0,19,0)),0);
assert.equal(petHearingGain(V(0,0,0),V(0,0,18)),0);
assert.equal(petHearingGain(V(0,0,0),V(0,0,0)),1);
assert(petHearingGain(V(5,0,0),V(0,0,0))>
  petHearingGain(V(10,0,0),V(0,0,0)));
assert.equal(PET_AUDIO_RANGE,18);
assert.equal(petHearingGain(V(0,0,0),null),0);

const engine=new NullEngine(),scene=new Scene(engine);
const b={id:44,x:12,z:4,floors:[]};
for(let i=0;i<4;i++){
 const mesh=MeshBuilder.CreateBox('floor '+i,{width:9,height:3.4,depth:9},scene);
 mesh.position=V(12,2+i*3.6,4);
 b.floors.push({mesh,size:V(9,3.4,9),active:false,maxHealth:100,health:100});
}
const anchored=supportedFireAnchor(b,-1);
assert(anchored.y>=2&&anchored.y<=13,'Fire must attach to standing facade');
assert(anchored.x>b.x);
const world={scene,mobile:true,terrainCraters:[],buildings:[b],districtBuildings:[],
 damageStructure(){throw Error('Unexpected fire damage in short smoke test')},audio:{play(){} }};
const fires=new CityFires(world);
assert(fires.ignite(b,.7));
const fire=fires.fires.get(b.id);
assert.equal(fire.anchor.y,anchored.y);
fires.tick(.12);
assert(Math.abs(fire.flames[0].position.y-fire.anchor.y)<2);
assert(Math.abs(fire.smoke[0].position.z-(fire.anchor.z-.5))<.01);
// The upper block vanishes first. Fire now comes down to a surviving facade.
b.floors[2].active=true;
fires.tick(.12);
assert(fire.anchor.y<=b.floors[1].mesh.position.y,'Fire stayed on collapsed upper floor');
assert.equal(fire.flames[0].position.x,fire.anchor.x-.9);
// If the foundation collapses, no higher floor is supported: ground fire.
b.floors[0].active=true;
fires.tick(.12);
assert(fire.anchor.y<1.7,'Detached skyscraper must not burn in midair');
assert(fire.flames.every(m=>m.position.y<4),'Flames stuck above collapsed building');
assert(fire.smoke.every(m=>m.position.y<9),'Smoke plume stayed in sky');
b.floors[0].active=false;b.floors[2].active=false;
fires.tick(.12);
assert(fire.anchor.y>=2,'Fire did not re-anchor to reconstructed building');
assert(fires.suppress(fire,2));
assert.equal(fires.fires.size,0);
scene.dispose();engine.dispose();

// Camera-relative hard gate, with recheck when sample decoding completes.
let played=0;
const camera={position:V(0,1,0),getForwardRay:()=>({direction:V(0,0,1)})};
const audio=new RecordedSoundscape({mobile:true,Context:null});
audio.ctx={state:'running',currentTime:5,createBufferSource:()=>({
 playbackRate:{value:1},buffer:null,connect(){},start(){played++},
 disconnect(){},onended:null})};
audio.world={scene:{activeCamera:camera},props:[],time:4};
audio.effectsBus={};
let requests=0,resolveLoad;
audio.load=()=>{requests++;return new Promise(resolve=>{resolveLoad=resolve})};
audio.route=()=>({volume:{gain:{value:0,setTargetAtTime(v){this.value=v}}},
 pan:{pan:{value:0}},stop(){}});
assert.equal(audio.play('catMeow',V(29,1,0)),false,'Far cat should not be sampled');
assert.equal(audio.play('dogPanic',V(0,1,22)),false,'Far dog yelp should never play');
assert.equal(requests,0,'Distant pets must not download audio samples');
assert.equal(audio.play('dogBark',V(1,1,1)),true,'Nearby dog should be audible');
camera.position=V(150,1,0);
resolveLoad({duration:.5});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(played,0,'An asynchronous meow began AFTER moving away');
audio.ctx.currentTime=7;
camera.position=V(0,1,0);
audio.load=async()=>({duration:.5});
assert.equal(audio.play('catMeow',V(2,1,0)),true);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(played,1,'Near cat should play');
assert.equal(audio.petVoices.size,1);
camera.position=V(120,1,0);
audio.loop=()=>{};
audio.update({world:audio.world});
assert.equal([...audio.petVoices][0].volume.gain.value,0,
 'Pet sound must fade out as soon as the camera leaves');
console.log('FIRE_PET_AUDIO_PASS: no burning facade in sky; hard 18m pet hearing, delayed sample cancellation and fade');
