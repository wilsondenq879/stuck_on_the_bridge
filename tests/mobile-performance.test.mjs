import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {Route,seeded} from '../dist/geo.js';
import {TrafficSimulation} from '../dist/sim.js';
import {DrivingWorld} from '../dist/world.js';
import {makeSouthHsinchu} from '../dist/south-hsinchu-world.js';
import {bikeBranches} from '../dist/road-geometry.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name,import.meta.url)));
test('mobile Guanxin facades reuse small textures across the mapped buildings',()=>{
 const old=globalThis.document;
 const ctx=new Proxy({}, {get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx,addEventListener(){},removeEventListener(){}})};
 try{
  const d=read('routes/guanxin-tsmc.json');d.guanxinBuildings=read('guanxin.json').buildings;
  const w=Object.create(DrivingWorld.prototype);w.lowPower=true;w.route=new Route(d);w.bikeRoute=new Route({...d,points:d.bikePoints,lengthMeters:d.bikeLengthMeters});w.branches=bikeBranches(w.route,w.bikeRoute);w.interchange=null;w.scene=new THREE.Scene();w.rng=seeded(12);w.makeSign=()=>{};
  w.mats=Object.fromEntries(['road','side','median','paint','yellow','metal','leaf','trunk'].map(k=>[k,new THREE.MeshStandardMaterial()]));w.prepareRoadClearance();makeSouthHsinchu(w);
  const g=w.scene.getObjectByName('關新路・實際街廓'),faces=g.children.filter(m=>m.name==='灰褐窗框立面');const maps=new Set(faces.map(m=>m.material.map));
  assert.ok(faces.length>50);assert.ok(maps.size<faces.length,'facades should reuse textures');
  assert.ok([...maps].every(m=>m.image.width===64&&m.image.height===128));
  assert.ok([...maps].reduce((n,m)=>n+m.image.width*m.image.height,0)<faces.length*512*1024/32);
 }finally{globalThis.document=old;}
});
test('short mobile traffic warmup still creates a seeded commute and the restaurant queue',()=>{
 const d=read('routes/guanxin-tsmc.json'),s=new TrafficSimulation(new Route(d),{warmupSteps:360,seed:123});
 assert.ok(s.cars.length>30);assert.ok(s.restaurantQueues[0].waiting>=15);assert.equal(s.time,0);
 s.player.auto=true;const start=s.player.s;for(let i=0;i<600;i++)s.step(.1);assert.ok(s.player.s>start+50);
});
