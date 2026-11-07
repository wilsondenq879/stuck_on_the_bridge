import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Route} from '../dist/geo.js';
import {TrafficSimulation,VEHICLES} from '../dist/sim.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/route.json',import.meta.url)));
const route=new Route(data);

test('OSM route is continuous, southbound, and excludes freeway edges',()=>{
 assert.ok(route.length>4600&&route.length<4750);
 for(let i=1;i<data.points.length;i++){const a=data.points[i-1],b=data.points[i];assert.ok(b.s>a.s);assert.ok(Math.hypot(b.x-a.x,b.z-a.z)<8.1);assert.ok(b.osmWayId);}
 assert.ok(data.points[0].lat>data.points.at(-1).lat);
 for(const s of data.segments)assert.ok(!['motorway','trunk','motorway_link','trunk_link'].includes(s.tags.highway));
 assert.ok(data.source.wayIds.includes(371699430));assert.equal(data.source.license,'Open Database License (ODbL) 1.0');
});

test('bike uses separately sourced final lane, not a cosmetic vehicle swap',()=>{
 assert.ok(data.bikePoints.some(p=>p.motorcycleLane&&p.osmWayId===286645379));
 const bike=new Route({...data,points:data.bikePoints,lengthMeters:data.bikeLengthMeters});
 const a=route.sample(4500),b=bike.sample(4500);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>3);assert.equal(bike.lanes(4500),1);assert.ok(VEHICLES.bike.width<VEHICLES.car.width/2);
});

test('only OSM-tagged signal intersections receive simulated red lights',()=>{
 const sim=new TrafficSimulation(route);assert.ok(sim.signals.length>=4);assert.ok(sim.signals.every(p=>p.signalTagged));assert.ok(sim.signals.some(p=>p.name.includes('公道五')));assert.ok(!sim.signals.some(p=>p.name.includes('成功六街')));assert.ok(!sim.signals.some(p=>p.name.includes('光復')));assert.ok(sim.bikeSignals.some(p=>p.name.includes('光復')));
});

test('traffic conserves vehicles; queue does not disappear when offscreen',()=>{
 const sim=new TrafficSimulation(route,{scenario:'incident'});
 for(let i=0;i<3000;i++){sim.stepTraffic(.1,false);if(i%250===0){assert.equal(sim.spawned-sim.exited,sim.cars.length);assert.ok(sim.pending.length>=0);assert.ok(sim.cars.every(c=>Number.isFinite(c.s)&&c.speed>=0));}}
 assert.ok(sim.diverted>100);assert.ok(sim.pending.length>0);
});

test('incident creates extra route demand and longer stop queues with identical seed',()=>{
 const a=new TrafficSimulation(route),b=new TrafficSimulation(route,{scenario:'incident'});
 let waitingA=0,waitingB=0;
 for(let i=0;i<3000;i++){a.stepTraffic(.1,false);b.stepTraffic(.1,false);if(i%50===0){waitingA+=a.metrics().stopped;waitingB+=b.metrics().stopped;}}
 assert.ok(b.diverted>a.diverted+100);assert.ok(waitingB>waitingA*1.2);assert.ok(b.spawned+b.pending.length>a.spawned+a.pending.length);
 b.time=360;assert.equal(b.incidentState().stage,'recovering');b.time=600;assert.equal(b.incidentState().stage,'cleared');assert.ok(b.cars.length>0,'existing queues remain after incident clears');
});

test('accelerator moves, brakes stop, and auto-follow respects a red stop line',()=>{
 const sim=new TrafficSimulation(route,{startS:1000});sim.cars=[];sim.pending=[];sim.rebuildBuckets();
 for(let i=0;i<50;i++)sim.step(.1,{gas:true});assert.ok(sim.player.s>1010);assert.ok(sim.player.speed>5);
 const brakingStart=sim.player.s;for(let i=0;i<40;i++)sim.step(.1,{brake:true});assert.equal(sim.player.speed,0);assert.ok(sim.player.s-brakingStart<30);
 const red=new TrafficSimulation(route,{startS:200});red.cars=[];red.pending=[];red.rebuildBuckets();red.signals=[{name:'test',s:254.09,cycle:200,green:1,offset:3}];red.player.auto=true;
 for(let i=0;i<300;i++)red.step(.1);assert.ok(red.player.s<246.09);assert.equal(red.player.red,0);
});

test('car and bike complete both normal and incident trips without permanent merge deadlock',()=>{
 const results={};for(const scenario of ['normal','incident'])for(const vehicle of ['car','bike']){
  const sim=new TrafficSimulation(route,{scenario,vehicle});sim.player.auto=true;
  for(let i=0;i<36000&&!sim.player.done;i++)sim.step(.1);
  assert.equal(sim.player.done,true,`${scenario}/${vehicle} stuck at ${sim.player.s}`);assert.equal(sim.player.red,0);assert.ok(sim.player.bumps<=3);assert.ok(sim.player.s>(vehicle==='bike'?data.bikeLengthMeters:route.length)-5.1);results[`${scenario}-${vehicle}`]={seconds:sim.totalTime,waiting:sim.player.wait};
 }
 for(const vehicle of ['car','bike']){assert.ok(results[`incident-${vehicle}`].seconds>results[`normal-${vehicle}`].seconds);assert.ok(results[`incident-${vehicle}`].waiting>results[`normal-${vehicle}`].waiting);}
 console.log('Scenario regression results (model values, not measured commute times):',JSON.stringify(results));
});
