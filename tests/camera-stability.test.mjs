import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {EnvironmentWorld} from '../dist/environment-world.js';
import {smoothCameraYaw} from '../dist/camera-stability.js';
import {Route} from '../dist/geo.js';

test('stationary view stays still during sunny, rainy, typhoon and earthquake events',()=>{
 const camera=new THREE.PerspectiveCamera();camera.position.set(.4,1.6,0);camera.rotation.set(.1,.2,0);
 const world={camera,wipers:[],guanxinRoadMaterial:null};
 const env={w:world,weather:'',time:0,sky:{position:{set(){}},rotation:{y:0}},rain:{visible:false,position:{set(){}},geometry:{setDrawRange(){},attributes:{position:{needsUpdate:false}}}},rainPositions:new Float32Array(1600*6),drops:Array.from({length:1600},()=>({x:0,y:20,z:0})),random:()=>.5,labels:[]};
 const initial={position:camera.position.clone(),rotation:camera.rotation.clone()};
 for(const weather of ['sunny','rain','typhoon']){
  env.weather=weather;
  const sim={day:{weather,quake:{enabled:true,at:0,duration:12,power:.65}},totalTime:6};
  for(let i=0;i<60;i++)EnvironmentWorld.prototype.update.call(env,sim,{x:0,y:0,z:0},1/30,null);
  assert.ok(camera.position.distanceTo(initial.position)<1e-9,weather+' moved a stationary camera');
  assert.equal(camera.rotation.x,initial.rotation.x);assert.equal(camera.rotation.y,initial.rotation.y);assert.equal(camera.rotation.z,initial.rotation.z);
 }
});

test('camera follows real road corners gradually and uses the short turn across the angle boundary',()=>{
 const d=JSON.parse(fs.readFileSync(new URL('../dist/data/routes/guanxin-tsmc.json',import.meta.url))),r=new Route(d);
 const before=r.sample(504.5).yaw,after=r.sample(505).yaw,delta=Math.atan2(Math.sin(after-before),Math.cos(after-before));
 assert.ok(Math.abs(delta)>.3,'fixture must include a meaningful real junction angle');
 let yaw=smoothCameraYaw(before,after,1/30);assert.ok(Math.abs(yaw-before)<Math.abs(delta)*.3);
 for(let i=0;i<90;i++)yaw=smoothCameraYaw(yaw,after,1/30);
 assert.ok(Math.abs(Math.atan2(Math.sin(yaw-after),Math.cos(yaw-after)))<.001);
 const wrapped=smoothCameraYaw(Math.PI-.01,-Math.PI+.01,1/30);assert.ok(wrapped>Math.PI-.01);
 assert.equal(smoothCameraYaw(0,2,0,true),2,'teleports must reset the camera');
});
