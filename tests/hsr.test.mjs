import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {Route} from '../dist/geo.js';
import {RailView,crossingStation,trackPoint} from '../dist/hsr.js';
const bytes=fs.readFileSync(new URL('../dist/assets/hsr.glb',import.meta.url));
const asset=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
for(const dest of ['tsmc','mediatek']){
 const d=JSON.parse(fs.readFileSync(new URL('../dist/data/routes/erchong-'+dest+'.json',import.meta.url)));const car=new Route(d),bike=new Route({...d,points:d.bikePoints,lengthMeters:d.bikeLengthMeters});
 for(const [kind,path] of [['car',car],['bike',bike]])test(dest+' '+kind+' crosses the mapped HSR and sees 12 cars before passing beneath it',()=>{
  const s=crossingStation(path),p=path.sample(s),c=trackPoint(0),v=new RailView(asset,car,bike);
  assert.ok(Math.hypot(c.x-p.x,c.z-p.z)<8);assert.ok(s>2240&&s<2270);assert.equal(p.road,'中興路四段');
  const glass=asset.getObjectByName('Span').geometry;glass.computeBoundingBox();assert.ok(glass.boundingBox.min.y-p.y>7);
  for(const speed of [0,8,26]){
   const sim={totalTime:0,player:{vehicle:kind,s:s-158,speed}};let seen=false,tail=false;
   for(let i=0;i<65*10;i++){sim.totalTime=i/10;sim.player.s=s-158+speed*sim.totalTime;v.update(sim,true);
    if(sim.player.s<s-12&&v.cabs.count===2&&v.coaches.count===10&&Math.abs(v.cabs.instanceMatrix.array[12]-c.x)<12&&Math.abs(v.cabs.instanceMatrix.array[14]-c.z)<45)seen=true;
    if(!speed&&i>330&&v.cabs.count===2&&Math.abs(v.cabs.instanceMatrix.array[14]-c.z)<45)tail=true;
   }assert.ok(seen,'visible approach at '+speed);if(!speed)assert.ok(tail,'another train while stopped');
  }
  const sim={totalTime:1,player:{vehicle:kind,s:s-100,speed:0}};v.update(sim,true);const a=v.cabs.instanceMatrix.array.slice();v.update(sim,true);assert.deepEqual(v.cabs.instanceMatrix.array,a);
  v.update(sim,false);assert.equal(v.root.visible,false);
 });
}
