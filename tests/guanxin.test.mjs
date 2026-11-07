import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Route} from '../dist/geo.js';
import {TrafficSimulation} from '../dist/sim.js';
import {rollDay} from '../dist/day.js';
const directory=new URL('../dist/data/routes/',import.meta.url);
const read=id=>JSON.parse(fs.readFileSync(new URL(id+'.json',directory)));
const ids=['guanxin-tsmc','guanxin-mediatek','tsmc-guanxin','mediatek-guanxin'];

test('Guanxin school journeys use continuous real roads, legal scooter paths and distinct return routing',()=>{
 for(const id of ids){
  const d=read(id),outbound=id.startsWith('guanxin-');
  assert.equal(d.sceneryProfile,'south-hsinchu');
  assert.equal(d.direction,outbound?'outbound':'return');
  assert.equal(rollDay(54321,new Route(d)).chapter,null);
  for(const path of [d.points,d.bikePoints]){
   assert.ok(path.length>300);
   for(let i=1;i<path.length;i++){
    assert.ok(path[i].s>path[i-1].s);
    assert.ok(Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z)<8.05);
    assert.ok(path[i].osmWayId);
   }
  }
  assert.ok(d.bikePoints.every(p=>!p.highway?.startsWith('motorway')));
  if(outbound){
   const first=d.points.find(p=>p.highway==='motorway'&&p.ref==='1');
   const second=d.points.find(p=>p.highway==='motorway'&&p.ref==='3');
   assert.ok(first&&second&&first.s<second.s);
   assert.ok(d.landmarks.some(l=>l.name.includes('康橋')&&l.s>second.s));
  }else{
   assert.ok(d.points.filter(p=>p.road.includes('明湖路')).length>30);
   assert.ok(!d.points.some(p=>p.highway==='motorway'));
  }
  const end=d.points.at(-1),other=read(outbound?id.split('-')[1]+'-guanxin':'guanxin-'+id.split('-')[0]);
  assert.ok(Math.hypot(end.x-other.points[0].x,end.z-other.points[0].z)<20);
 }
});

test('motorway acceleration and post-diversion vehicle detection use the active road',()=>{
 const d=read('guanxin-tsmc'),r=new Route(d),segment=d.points.find(p=>p.highway==='motorway'&&p.ref==='1');
 assert.ok(segment);
 const sim=new TrafficSimulation(r,{startS:segment.s+100,vehicle:'car'});
 sim.cars=[];sim.pending=[];sim.rebuildBuckets();sim.signals=[];
 for(let i=0;i<400;i++)sim.step(.05,{gas:1});
 assert.ok(sim.player.speed*3.6>70);
 const maps=d.bikeStationMappings??[];
 const m=maps.find(m=>m.carStartS>segment.s&&Math.abs(m.carStartS-m.bikeStartS)>100&&m.carEndS-m.carStartS>35);
 assert.ok(m,'shared geometry after the long motorway/surface diversion must be mapped');
 const carS=m.carStartS+8,bikeS=m.bikeStartS+8;
 sim.cars=[];sim.pending=[];sim.rebuildBuckets();
 sim.player.vehicle='bike';sim.player.s=bikeS;sim.player.offset=0;
 sim.addCar(carS+15,0,'car',0).offset=0;sim.rebuildBuckets();
 const lead=sim.closest(bikeS+.01,0,.76,null,false);
 assert.ok(lead&&lead.kind==='car');
 assert.ok(Math.abs(lead.s-(bikeS+15))<2);
});

test('each new journey can finish through its normal vehicle-specific final approach',()=>{
 for(const id of ids)for(const vehicle of ['car','bike']){
  const d=read(id),r=new Route(d),length=vehicle==='bike'?d.bikeLengthMeters:d.lengthMeters;
  const day=rollDay(54321,r),sim=new TrafficSimulation(r,{vehicle,startS:length-260,day,scenario:'incident',seed:day.seed});
  sim.player.auto=true;
  for(let i=0;i<3500&&!sim.player.done;i++)sim.step(.1);
  assert.ok(sim.player.done,id+'/'+vehicle+' stopped at '+sim.player.s);
  assert.equal(sim.player.red,0);
 }
});
