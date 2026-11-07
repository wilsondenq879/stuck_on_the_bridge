import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Route} from '../dist/geo.js';
import {TrafficSimulation} from '../dist/sim.js';
import {rollDay,LocalChallenge} from '../dist/day.js';
import {readGamepad,mergeControls} from '../dist/controls.js';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data/route.json',import.meta.url))),route=new Route(data);
function emptySim(day,startS=100){day.parking=[];day.cutIns=[];const s=new TrafficSimulation(route,{day,startS,seed:day.seed,scenario:day.scenario});s.cars=[];s.pending=[];s.rebuildBuckets();s.signals=[];return s;}

test('dice replay is deterministic and the event pool includes both local challenges',()=>{
 assert.deepEqual(rollDay(358883,route),rollDay(358883,route));
 const days=Array.from({length:100},(_,i)=>rollDay((i*7919+54321)>>>0,route));
 for(const kind of ['garage','sinkhole',null])assert.ok(days.some(d=>d.chapter===kind));
 for(const scenario of ['incident','normal'])assert.ok(days.some(d=>d.scenario===scenario));
 assert.ok(days.some(d=>d.parking.length&&d.cutIns.length&&d.cameras.length&&d.bridgeSignal&&d.yellowBox));
 assert.ok(days.every(d=>d.dice.length===6&&d.dice.every(x=>x>=1&&x<=6)));
});

test('car viaduct rises after the branch; bike remains at street level; shops are correctly on left',()=>{
 const bike=new Route({...data,points:data.bikePoints,lengthMeters:data.bikeLengthMeters});
 assert.equal(route.height(data.bikeSplitS-1),0);assert.ok(route.height(3600)>6);assert.equal(bike.height(3600),0);
 assert.ok(data.retailLandmarks.every(s=>s.offset<0&&s.s<data.bikeSplitS));
 assert.ok(data.retailLandmarks.find(s=>s.brand==='Costco').s<data.retailLandmarks.find(s=>s.brand==='Decathlon').s);
});

test('speed and red-light cameras record once when the driver actually crosses',()=>{
 const d=rollDay(1,route),s=emptySim(d);d.cameras=[{s:100.5,limit:40}];s.player.speed=15;s.step(.1,{});assert.equal(d.violations[0]?.kind,'speed');
 s.signals=[{s:s.player.s+8.4,cycle:200,green:1,offset:50,camera:true}];s.step(.1,{});assert.equal(s.player.red,1);assert.equal(d.violations[1]?.kind,'red');
 assert.equal(d.points,5);for(let i=0;i<30;i++)s.step(.1,{brake:1});assert.equal(d.violations.length,2);
});

test('green light with blocked yellow box is not miscounted as a red-light violation',()=>{
 const d=rollDay(1,route),s=emptySim(d,120);s.feedS=120;s.signals=[{s:118,cycle:100,green:40,offset:0,yellowBox:true,camera:true}];
 for(let i=0;i<40;i++)s.step(.1,{});assert.equal(s.player.red,0);assert.equal(d.violations.length,1);assert.equal(d.violations[0].kind,'box');
});

test('parked delivery vehicles are physical blockers and cut-in scooters change lateral position',()=>{
 const d=rollDay(1,route),s=emptySim(d,2500);d.parking=[{s:2540,delivery:'foodpanda'}];d.cutIns=[2528];s.step(.1,{});
 const van=s.cars.find(c=>c.delivery==='foodpanda'&&c.kind==='car'),cut=s.cars.find(c=>c.cutInUntil);assert.ok(van&&cut);assert.equal(van.speed,0);
 const before=Math.abs(cut.offset-cut.cutInTarget);for(let i=0;i<10;i++)s.step(.1,{});assert.ok(Math.abs(cut.offset-cut.cutInTarget)<before);assert.equal(s.cars.filter(c=>c.delivery).length,2);
});

test('steep garage allows wheelspin, partial throttle, and eventual exit without a soft lock',()=>{
 const d1=rollDay(2,route),d2=rollDay(2,route),full=new LocalChallenge(d1),light=new LocalChallenge(d2);full.player.s=light.player.s=20;
 for(let i=0;i<3600&&!full.done;i++)full.step(.05,{gas:1});
 for(let i=0;i<3600&&!light.done;i++)light.step(.05,{gas:.65});
 assert.ok(full.done&&light.done);assert.ok(full.spin>10);assert.equal(light.spin,0);assert.ok(full.time>light.time);
});

test('sinkhole can be avoided; falling recovers instead of ending the run',()=>{
 const hitDay=rollDay(5,route),safeDay=rollDay(5,route);assert.equal(hitDay.chapter,'sinkhole');assert.ok(hitDay.collapse);
 const hit=new LocalChallenge(hitDay),safe=new LocalChallenge(safeDay);safe.player.auto=true;
 for(let i=0;i<1500&&!hit.done;i++)hit.step(.05,{gas:1});for(let i=0;i<1500&&!safe.done;i++)safe.step(.05,{});
 assert.ok(hit.done&&safe.done);assert.equal(hitDay.rescues,1);assert.equal(safeDay.rescues,0);assert.ok(hit.time>safe.time+80);
});

test('standard gamepad preserves analog triggers, dead zone and keyboard/touch fallback',()=>{
 const pad={connected:true,mapping:'standard',axes:[.06,0,.5,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};pad.buttons[7].value=.62;pad.buttons[6].value=.2;
 const input=readGamepad(pad);assert.equal(input.steer,0);assert.equal(input.gas,.62);assert.equal(input.brake,.2);assert.ok(input.lookX>0);
 assert.deepEqual(mergeControls({left:true},{brake:1},input),{gas:.62,brake:1,steer:-1});
 assert.equal(readGamepad({...pad,connected:false}).gas,0);assert.equal(readGamepad({...pad,mapping:''}).connected,false);
});

test('rolled incident days still allow both vehicles to finish after obstructions clear',()=>{
 for(const vehicle of ['car','bike']){const day=rollDay(54321,route),s=new TrafficSimulation(route,{day,seed:day.seed,scenario:day.scenario,vehicle});s.player.auto=true;
 for(let i=0;i<36000&&!s.player.done;i++)s.step(.1);
 assert.ok(s.player.done,`${vehicle} stopped at ${s.player.s}`);assert.equal(s.player.red,0);assert.equal(day.points,0);}
});
