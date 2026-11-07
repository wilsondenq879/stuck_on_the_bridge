import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {Route,seeded} from '../dist/geo.js';
import {RestaurantQueue,alignInterchange} from '../dist/restaurant-queues.js';
import {TrafficSimulation} from '../dist/sim.js';
import {DrivingWorld} from '../dist/world.js';
import {makeRestaurants} from '../dist/restaurant-world.js';
import {bikeBranches} from '../dist/road-geometry.js';
const read=id=>JSON.parse(fs.readFileSync(new URL('../dist/data/routes/'+id+'.json',import.meta.url)));

test('both requested stores use distinct actual footprints, addresses and northbound one-way driveways',()=>{
 for(const [id,osm,address] of [['zhubei-tsmc',367537870,'自強南路19號'],['guanxin-tsmc',523235237,'關新路26號']]){
  const d=read(id),r=new Route(d),shop=d.restaurants[0],path=new Route({points:shop.queuePath});
  assert.equal(shop.osmWayId,osm);assert.equal(shop.address,address);assert.ok(shop.driveway.length>=6);
  const at=path.sample(20),end=path.sample(path.length-6);assert.ok(at.tz<0&&end.tz<0,'drive-through approach and exit both travel north');
  assert.ok(r.nearest(shop.x,shop.z).d<65);assert.ok(shop.serviceS>120);
  const reverse=read(id==='guanxin-tsmc'?'tsmc-guanxin':'zhubei-mediatek').restaurants[0];assert.deepEqual(reverse.footprint,shop.footprint);assert.deepEqual(reverse.queuePath,shop.queuePath);
 }
});

test('Zhubei extension follows its directed OSM way, preserving car/bike crossings and route geography',()=>{
 const old=JSON.parse(fs.readFileSync(new URL('../dist/data/route.json',import.meta.url)));
 for(const id of ['zhubei-tsmc','zhubei-mediatek']){
  const d=read(id),r=new Route(d),prefix=d.routePrefixMeters;assert.ok(prefix>365&&prefix<375);assert.equal(d.points[0].osmWayId,327280714);
  const seam=d.points.findIndex(p=>p.osmWayId!==327280714);assert.equal(d.points[seam].s,prefix);assert.equal(d.points[seam].x,0);assert.equal(d.points[seam].z,0);
  for(const ps of [d.points,d.bikePoints])for(let i=1;i<ps.length;i++){assert.ok(ps[i].s>ps[i-1].s);assert.ok(Math.hypot(ps[i].x-ps[i-1].x,ps[i].z-ps[i-1].z)<8.02);}
  const before=new Route(old).sample(1300),after=r.sample(1300+prefix);assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<.01);assert.equal(after.y,before.y);
  assert.equal(d.bikeStationMappings[0].carStartS,0);assert.equal(d.bikeStationMappings[0].bikeStartS,0);
 }
});

test('restaurant queues creep, serve, replenish and replay the same daily seed without body overlaps',()=>{
 const d=read('guanxin-tsmc'),r=new Route(d),shop=d.restaurants[0],a=new RestaurantQueue(shop,r,911),b=new RestaurantQueue(shop,r,911);
 assert.ok(a.waiting>=17);const original=a.cars.map(c=>c.id);let moved=false;
 for(let i=0;i<2400;i++){
  a.step(.1);b.step(.1);
  assert.deepEqual(a.cars.map(c=>[c.id,c.queueS]),b.cars.map(c=>[c.id,c.queueS]));
  for(let j=1;j<a.cars.length;j++)assert.ok(a.cars[j-1].queueS-a.cars[j].queueS>=a.spacing-.0001);
  moved ||= a.cars.some(c=>c.speed>.3);
 }
 assert.ok(moved&&a.served>=12);assert.ok(a.waiting>=15);assert.ok(a.cars.some(c=>!original.includes(c.id)));assert.ok(a.cars.length<35);
 const sizes=new Set([1,2,3,4,5,6].map(seed=>new RestaurantQueue(shop,r,seed).target));assert.ok(sizes.size>1);
});

test('queue cars respect a physical blocker and do not spawn through it',()=>{
 const d=read('guanxin-tsmc'),q=new RestaurantQueue(d.restaurants[0],new Route(d),32),front=q.cars[0],s=front.queueS;
 front.collected=true;const pose=q.path.sample(s+5),blocker={world:pose,length:4.45,width:1.82};
 for(let i=0;i<80;i++)q.step(.1,[blocker]);assert.ok(front.queueS<=s+.2);
 q.cars=[];const tail=q.path.sample(2);q.step(.1,[{world:tail,length:4.45,width:1.82}]);assert.equal(q.cars.length,0);
});

test('driveway traffic participates in collision detection without replacing the normal commute',()=>{
 const d=read('tsmc-guanxin'),r=new Route(d),shop=d.restaurants[0],sim=new TrafficSimulation(r,{startS:shop.s-100});
 const proxy=sim.restaurantQueues[0].cars.find(c=>c.queueS<70);assert.ok(proxy);
 assert.ok(sim.nearby(proxy.s,1,1,'car').some(c=>c.id===proxy.id));
 const front=sim.closest(proxy.s-6,proxy.offset,1.82,null,false);assert.equal(front.id,proxy.id);
 sim.player.auto=true;for(let i=0;i<9000&&!sim.player.done;i++)sim.step(.1);
 assert.ok(sim.player.done,`return trip stuck by restaurant at ${sim.player.s}`);assert.ok(sim.restaurantQueues[0].served>5);
});

test('store shells and queue lanes leave scooter corridors clear, and interchange rebasing is isolated',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../dist/data/overpasses.json',import.meta.url))),copy=alignInterchange(original,370.968);
 assert.equal(copy.guardrailOpenings[0].joinS,original.guardrailOpenings[0].joinS+370.968);assert.deepEqual(copy.structures,original.structures);assert.equal(alignInterchange(copy,370.968),copy);
 for(const id of ['zhubei-tsmc','guanxin-tsmc','tsmc-guanxin']){
  const d=read(id),w=Object.create(DrivingWorld.prototype);w.route=new Route(d);w.bikeRoute=new Route({...d,points:d.bikePoints,lengthMeters:d.bikeLengthMeters});w.branches=bikeBranches(w.route,w.bikeRoute);w.interchange=id.startsWith('zhubei')?original:null;w.scene=new THREE.Scene();w.rng=seeded(12);w.mats={road:new THREE.MeshStandardMaterial()};w.prepareRoadClearance();makeRestaurants(w);w.scene.updateMatrixWorld(true);
  const shell=w.scene.getObjectByName('實際餐廳輪廓');assert.ok(shell);const shop=d.restaurants[0];
  for(let s=Math.max(0,shop.bikeS-100);s<Math.min(w.bikeRoute.length,shop.bikeS+100);s+=4){const p=w.bikeRoute.sample(s);for(const offset of [-w.bikeRoute.width(s)/2+.2,0,w.bikeRoute.width(s)/2-.2]){const ray=new THREE.Raycaster(new THREE.Vector3(p.x+p.rx*offset,1.5,p.z+p.rz*offset),new THREE.Vector3(0,-1,0),0,1.6);assert.equal(ray.intersectObject(shell).length,0);}}
  const tree=w.route.data.restaurants[0].queuePath[10];assert.equal(w.clearance.free(tree.x,tree.z,.3,0,3),false);
 }
});

test('chase cameras see the queue ahead without entering a rear car; cockpit and opposite-side traffic remain visible',async()=>{
 const {visibleRestaurantActors}=await import('../dist/restaurant-queues.js');
 const d=read('tsmc-guanxin'),r=new Route(d),q=new RestaurantQueue(d.restaurants[0],r,7301),rear=q.cars.find(c=>c.queueS<70);
 const pose=q.path.sample(rear.queueS+7),sim={restaurantQueues:[q]},all=q.cars.map(c=>c.id);
 assert.ok(!visibleRestaurantActors(sim,pose,true).some(c=>c.id===rear.id));
 assert.ok(visibleRestaurantActors(sim,pose,false).some(c=>c.id===rear.id));
 assert.ok(visibleRestaurantActors(sim,pose,true).some(c=>c.queueS>rear.queueS+15));
 assert.deepEqual(q.cars.map(c=>c.id),all,'camera filtering must not delete physical traffic');
 const outbound=read('guanxin-tsmc'),or=new Route(outbound),oq=new RestaurantQueue(outbound.restaurants[0],or,7301);
 assert.equal(visibleRestaurantActors({restaurantQueues:[oq]},or.sample(outbound.restaurants[0].s-45),true).length,oq.cars.length,'opposite-side drive-through must remain visible');
});

test('restaurant previews start upstream of yellow boxes and never penalize a newly spawned waiting player',async()=>{
 const {safeRoadStart}=await import('../dist/quick-start.js'),{rollDay}=await import('../dist/day.js');
 for(const id of ['guanxin-tsmc','tsmc-guanxin']){
  const d=read(id),r=new Route(d),start=safeRoadStart(d.restaurants[0].s-65,d.intersections),day=rollDay(7301,r),sim=new TrafficSimulation(r,{startS:start,day,seed:day.seed});
  assert.ok(day.yellowBox);
  for(let i=0;i<100;i++)sim.step(.1,{brake:1});
  assert.equal(day.points,0);assert.equal(sim.player.s,start);assert.ok(!sim.signals.some(l=>sim.player.s>l.s-2&&sim.player.s<l.s+20));
 }
 assert.equal(safeRoadStart(98,[{s:100,signalTagged:true}],9.8),75.1);
});
