import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {Route,seeded} from '../dist/geo.js';
import {TrafficSimulation,VEHICLES} from '../dist/sim.js';
import {DrivingWorld} from '../dist/world.js';
import {makeSouthHsinchu} from '../dist/south-hsinchu-world.js';
import {makeBusParts} from '../dist/bus-world.js';
import {bikeBranches} from '../dist/road-geometry.js';
const read=id=>JSON.parse(fs.readFileSync(new URL('../dist/data/routes/'+id+'.json',import.meta.url)));

test('adding a school bus destination preserves the longer scooter route endpoint',()=>{
 const data=read('zhubei-tsmc'),sim=new TrafficSimulation(new Route(data),{vehicle:'bike'});
 assert.ok(sim.bikeRoute.length>sim.route.length);assert.equal(sim.tripEndS,sim.bikeRoute.length);
 sim.cars=[];sim.pending=[];sim.player.s=sim.bikeRoute.length-4;sim.rebuildBuckets();sim.step(.1,{brake:1});
 assert.equal(sim.player.done,true);
});

test('two large buses zipper into one lane without overlapping or blocking each other forever',()=>{
 const points=[0,190,200,215,500].map(s=>({s,x:0,z:-s,lanes:s>=200&&s<215?1:2,road:'測試併道'}));
 const sim=new TrafficSimulation(new Route({points,lengthMeters:500,bikeSplitS:Infinity}),{startS:5});
 sim.cars=[];sim.pending=[];sim.spawned=sim.exited=0;sim.rebuildBuckets();
 const a=sim.addCar(135,0,'bus',7),b=sim.addCar(135,1,'bus',7);
 for(let i=0;i<1800;i++){
  sim.stepTraffic(.1,false);
  if(sim.cars.includes(a)&&sim.cars.includes(b)&&Math.max(a.s,b.s)<500&&Math.abs(a.s-b.s)<9.7)assert.ok(Math.abs(a.offset-b.offset)>=2.35,'bus bodies overlap during the merge');
 }
 assert.ok(a.s>260&&b.s>260,`parallel buses blocked at ${a.s}/${b.s}`);
});

test('a bus a few centimetres ahead of a car does not yield into a circular following dependency',()=>{
 const points=[0,190,200,215,500].map(s=>({s,x:0,z:-s,lanes:s>=200&&s<215?1:2,road:'短瓶頸'}));
 const sim=new TrafficSimulation(new Route({points,lengthMeters:500,bikeSplitS:Infinity}),{startS:5});sim.cars=[];sim.pending=[];sim.rebuildBuckets();
 const car=sim.addCar(135,1,'car',0),bus=sim.addCar(135.031,0,'bus',0);bus.offset=-.685;
 for(let i=0;i<1800;i++)sim.stepTraffic(.1,false);
 assert.ok(bus.s>260&&car.s>260,`mixed merge blocked at ${bus.s}/${car.s}`);
});

test('school bus follows car geometry, respects its full size and finishes only after stopping at school',()=>{
 const d=read('guanxin-tsmc'),r=new Route(d),sim=new TrafficSimulation(r,{vehicle:'bus',startS:d.schoolStop.s-130,seed:127});
 assert.equal(sim.pathFor('bus'),r);assert.ok(VEHICLES.bus.length>VEHICLES.car.length*2);assert.ok(VEHICLES.bus.accel<VEHICLES.car.accel);
 assert.equal(sim.isSeparate(100,'bus',100,'car'),false);
 sim.player.auto=true;
 for(let i=0;i<5000&&!sim.player.done;i++)sim.step(.1);
 assert.ok(sim.player.done,'bus must clear the queue and reach its school stop');
 assert.equal(sim.player.speed,0);assert.ok(Math.abs(sim.player.s-(d.schoolStop.s-6))<9);
 assert.ok(sim.schoolQueue.served>0,'queue must actually drain through the school entrance');
 assert.ok(sim.cars.some(c=>c.kind==='bus'));
});

test('a bus can finish its complete Guanxin to school trip through the motorway junctions',()=>{
 const data=read('guanxin-tsmc'),sim=new TrafficSimulation(new Route(data),{vehicle:'bus',startS:0,seed:807});sim.player.auto=true;
 let sawContinuing=false,sawMappedMainline=false;
 for(let i=0;i<24000&&!sim.player.done;i++){sim.step(.1);sawContinuing ||= sim.mainlineDepartures.length>0;sawMappedMainline ||= sim.mainlineDepartures.some(c=>c.mainlinePath?.length>50);}
 assert.ok(sawContinuing&&sawMappedMainline,'through traffic must continue on the mapped motorway rather than all taking the school exit');
 assert.ok(sim.player.done,`full bus journey stopped at ${sim.player.s}`);
 assert.equal(sim.player.red,0);assert.equal(sim.player.speed,0);
 assert.ok(sim.schoolQueue.served>20,'school intake remains active by the time the full journey arrives');
});

test('school intake remains present after a long approach and never inserts a vehicle through the player',()=>{
 const d=read('guanxin-tsmc'),sim=new TrafficSimulation(new Route(d),{vehicle:'car',startS:d.schoolStop.s-140,seed:313});
 const q=sim.schoolQueue;sim.time=1300;q.nextArrival=1299;
 sim.cars=sim.cars.filter(c=>!c.schoolQueue);sim.rebuildBuckets();
 sim.stepTraffic(.1,true);
 const queue=sim.cars.filter(c=>c.schoolQueue);assert.ok(queue.length>0,'parents still arrive after the journey has taken over 20 minutes');
 for(const c of queue)assert.ok(Math.abs(c.s-sim.player.s)>(c.length+VEHICLES.car.length)/2);
 assert.ok(queue.every(c=>c.s<d.schoolStop.s&&c.kind!=='bike'));
 sim.cars=[];sim.rebuildBuckets();for(let i=0;i<2000;i++)sim.stepTraffic(.1,true);
 assert.ok(sim.cars.filter(c=>c.schoolQueue&&c.schoolTurningAt===undefined).length>=6,'school drop-off queue must replenish during a long approach');
});

test('the rendered bus matches its physical dimensions and includes front and rear lighting',()=>{
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial(),materials=Object.fromEntries(['body','glass','rubber','chrome','red','white'].map(k=>[k,material]));
 let lights=0;
 makeBusParts((g,m,pos,scale,rot,color)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(...pos);mesh.scale.set(...scale);mesh.rotation.set(...rot);group.add(mesh);if(color==='brake'||color==='headlight')lights++;},materials);
 group.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
 assert.ok(size.z>9.8&&size.z<10.1);assert.ok(size.x>2.45&&size.x<3.2);assert.ok(size.y>2.9&&size.y<3.3);assert.equal(lights,4);
});

test('both approaches render north and south park play zones inside the real park, with detailed shared facilities',()=>{
 for(const id of ['guanxin-tsmc','tsmc-guanxin']){
  const data=read(id),w=Object.create(DrivingWorld.prototype);w.route=new Route(data);w.bikeRoute=new Route({...data,points:data.bikePoints,lengthMeters:data.bikeLengthMeters});w.branches=bikeBranches(w.route,w.bikeRoute);w.interchange=null;w.scene=new THREE.Scene();w.rng=seeded(12);w.makeSign=()=>{};
  w.mats=Object.fromEntries(['road','side','median','paint','yellow','metal','leaf','trunk'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  w.prepareRoadClearance();w.makeRoad();makeSouthHsinchu(w);w.scene.updateMatrixWorld(true);
  const group=w.scene.getObjectByName('關新公園・日光公園');assert.equal(group.userData.osmWayId,134204596);
  for(const name of ['北側磨石子寬滑梯','南側草坡小滑梯','共融沙坑','共融沙桌','塗鴉黑板牆','攀爬遊戲台','林蔭景觀棚架','中央大草坪'])assert.ok(group.userData.facilities.includes(name),name);
  const north=group.getObjectByName('北側磨石子寬滑梯'),south=group.getObjectByName('南側草坡小滑梯');assert.ok(north.position.z<south.position.z);
  for(const mesh of [north,south]){const a=mesh.geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);assert.ok(w.clearance.free(v.x,v.z,.1,v.y,v.y+.1),'slide intrudes on a driving path');}}
 }
});
