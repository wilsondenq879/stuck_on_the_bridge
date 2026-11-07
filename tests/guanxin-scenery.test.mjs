import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {Route,seeded} from '../dist/geo.js';
import {DrivingWorld} from '../dist/world.js';
import {makeSouthHsinchu} from '../dist/south-hsinchu-world.js';
import {bikeBranches} from '../dist/road-geometry.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name,import.meta.url)));
test('Guanxin uses the mapped 23-storey reference tower and keeps curb parking out of both driving paths',()=>{
 const catalog=read('guanxin.json');
 for(const id of ['guanxin-tsmc','tsmc-guanxin']){
  const data=read('routes/'+id+'.json');data.guanxinBuildings=catalog.buildings;
  const w=Object.create(DrivingWorld.prototype);w.route=new Route(data);
  w.bikeRoute=new Route({...data,points:data.bikePoints,lengthMeters:data.bikeLengthMeters});
  w.branches=bikeBranches(w.route,w.bikeRoute);w.interchange=null;
  w.scene=new THREE.Scene();w.rng=seeded(12);w.makeSign=()=>{};
  w.mats=Object.fromEntries(['road','side','median','paint','yellow','metal','leaf','trunk'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  w.prepareRoadClearance();w.makeRoad();makeSouthHsinchu(w);w.scene.updateMatrixWorld(true);
  const group=w.scene.getObjectByName('關新路・實際街廓');assert.ok(group);
  const tower=group.children.find(o=>o.userData.osmWayId===827291354);
  assert.ok(tower,'reference tower missing');assert.equal(tower.userData.height,73.6);
  tower.geometry.computeBoundingBox();const box=tower.geometry.boundingBox;
  assert.ok(Math.abs((box.min.x+box.max.x)/2+717.98)<2);
  assert.ok(group.userData.buildingIds.length>15);
  const blueSea=group.children.find(o=>o.userData.osmWayId===363572242);
  assert.ok(blueSea,'the building beside Guanxin Road 21 must not disappear');
  assert.equal(blueSea.userData.height,57.6);
  assert.ok(blueSea.userData.footprintScale>=.75&&blueSea.userData.footprintScale<=1);
  assert.ok(group.userData.referenceGridFaces>=4,'the reference building should have its structural grid');
  assert.ok(group.userData.referenceFrontages>=4,'junction buildings should have street-level shop fronts');
  assert.ok(group.userData.medianTreeCenters.length>0,'the planted median should include trees');
  for(const p of group.userData.medianTreeCenters)
   assert.ok(w.clearance.free(p.x,p.z,.25,0,8),'a median tree trunk intrudes into a driving lane');
  const paint=w.scene.getObjectByName('關新路・路邊停車帶');assert.ok(paint);
  const wheels=group.children.filter(o=>o.name.endsWith('/wheel')||o.name.endsWith('・wheel'));
  assert.ok(wheels.reduce((sum,o)=>sum+o.count,0)>100);
  const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
  for(const mesh of wheels)for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);
   assert.ok(w.clearance.free(p.x,p.z,.18,0,.5),'parked scooter wheel is in a travel lane');
  }
  const sidewalk=w.scene.getObjectByName('關新路・鋪面人行道');
  assert.ok(sidewalk);
  for(const point of w.route.points.filter(p=>p.road==='關新路').filter((_,i)=>i%3===0)){
   const p=w.route.sample(point.s);
   const ray=new THREE.Raycaster(new THREE.Vector3(p.x,.8,p.z),new THREE.Vector3(0,-1,0),0,.7);
   assert.equal(ray.intersectObject(sidewalk,false).length,0,'sidewalk crosses road');
  }
 }
});
