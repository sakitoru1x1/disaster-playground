import {strict as assert} from 'node:assert';
import {AudioPass,spatialGain,decideAudioMix} from '../src/audioPass.js';

assert.equal(spatialGain(null,null),1);
assert.equal(spatialGain({x:0,y:0,z:0},{x:0,y:0,z:0}),1);
assert(spatialGain({x:15,y:0,z:0},{x:0,y:0,z:0})>
 spatialGain({x:135,y:0,z:0},{x:0,y:0,z:0}));
assert(spatialGain({x:0,y:0,z:0},{x:0,y:0,z:0})>
 spatialGain({x:0,y:70,z:0},{x:0,y:0,z:0}));
const quiet=decideAudioMix({muted:true,carCount:10,recovery:{stage:'sweep',phase:'collect'},danger:1});
assert(Object.values(quiet).every(x=>x===0),'Muted must silence everything');
const paused=decideAudioMix({paused:true,carCount:7});
const active=decideAudioMix({carCount:7});
assert(paused.music<active.music&&paused.city<active.city);
const flight=decideAudioMix({recovery:{stage:'sweep',phase:'lift'},carCount:4});
assert(flight.helicopter>.5&&flight.crane===0&&flight.mixer===0);
const pouring=decideAudioMix({recovery:{stage:'fill',phase:'pour'}});
assert(pouring.mixer>0&&pouring.pour>0&&pouring.helicopter===0);
const construction=decideAudioMix({recovery:{stage:'build',phase:'construct'}});
assert(construction.crane>0&&construction.helicopter===0&&construction.truck===0);

const nodes=[];
class Param{constructor(){this.value=1}setValueAtTime(x){this.value=x}
 linearRampToValueAtTime(x){this.value=x}exponentialRampToValueAtTime(x){this.value=x}
 setTargetAtTime(x){this.value=x}}
class Node{
 constructor(){this.gain=new Param();this.pan=new Param();this.frequency=new Param();
  this.playbackRate=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();
  this.attack=new Param();this.release=new Param();nodes.push(this)}
 connect(){return this}disconnect(){}
 start(){this.started=true}stop(){this.stopped=true;this.onended?.()}
}
class Context{
 constructor(){this.currentTime=0;this.sampleRate=24000;this.state='suspended';this.destination=new Node()}
 createDynamicsCompressor(){return new Node()}
 createGain(){return new Node()}
 createBuffer(channels,frames){const arr=new Float32Array(frames);return {duration:frames/24000,getChannelData:()=>arr}}
 createOscillator(){const node=new Node();node.type='sine';return node}
 createBufferSource(){return new Node()}
 createStereoPanner(){return new Node()}
 resume(){this.state='running';return Promise.resolve()}
 close(){this.state='closed';return Promise.resolve()}
}
const bus=new AudioPass({contextFactory:Context,mobile:true});
assert.equal(bus.getState().unlocked,false,'Must not play before a user gesture');
assert.equal(bus.play('boom'),false,'Autoplay bypassed');
await bus.unlock();
assert.equal(bus.getState().unlocked,true);
assert(bus.play('crack',{x:0,y:0,z:0},1));
assert(bus.play('crack',{x:0,y:0,z:0},1)===false,'Sound cooldown failed');
const stateBefore=bus.getState();
assert(stateBefore.played>=2,'Activation and structural cracking should be audible');
const world={
 scene:{activeCamera:{name:'free orbit camera',position:{x:300,y:120,z:300},
  target:{x:0,y:0,z:0}}},
 props:[{type:'car',mesh:{position:{x:5,y:1,z:5}},traffic:{state:'driving',speed:13}}],
 progression:{lightPhase:1,recovery:{stage:'sweep',phase:'lower',
  heli:{root:{position:{x:10,y:28,z:10}}}}},
 integrity:()=>81,time:55
};
bus.bindWorld(world);
bus.ctx.currentTime=.5;
bus.update({world,disasters:{effects:[],meteors:[]},walk:null,dt:.05});
let state=bus.getState();
assert(state.loops>=14,'Missed environment / vehicle / construction loops');
assert(state.musicNotes>0,'No background music is scheduled');
assert(state.bufferCount>=15,'Procedural sound cache was not populated');
bus.setMusicVolume(.25);bus.setEffectsVolume(.15);bus.setAmbienceVolume(.7);
assert.equal(bus.getState().musicLevel,.25);
assert.equal(bus.getState().effectsLevel,.15);
assert.equal(bus.getState().ambientLevel,.7);
bus.setEnabled(false);assert.equal(bus.play('carCrash'),false);
assert.equal(bus.getState().enabled,false);
bus.setEnabled(true);
bus.resetScene();
assert.equal(bus.getState().loops,state.loops,'Scene reset should reuse existing loops');
bus.dispose();assert.equal(bus.getState().contextState,'none');
console.log('AUDIO_PASS_UNIT_PASS: music score, spatial panning, traffic, rotor, crane, mixer, sound budget, mute, mixer, reset');
