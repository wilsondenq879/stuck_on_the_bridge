import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {Route,seeded} from '../dist/geo.js';
import {DrivingWorld} from '../dist/world.js';
import {bikeBranches} from '../dist/road-geometry.js';
import {interchangeRoads} from '../dist/interchange.js';
import {rollDay} from '../dist/day.js';
import {TrafficSimulation,VEHICLES} from '../dist/sim.js';

const read=name=>JSON.parse(readFileSync(new URL('../dist/data/'+name,import.meta.url)));
const interchange=read('overpasses.json');
const fixtures=new Map();
function worldFor(id){
  if(fixtures.has(id))return fixtures.get(id);
  const d=read('routes/'+id+'.json'),w=Object.create(DrivingWorld.prototype);
  w.route=new Route(d);
  w.bikeRoute=new Route({...d,points:d.bikePoints,lengthMeters:d.bikeLengthMeters});
  w.interchange=interchange; w.branches=bikeBranches(w.route,w.bikeRoute);
  w.scene=new THREE.Scene(); w.rng=seeded(12); w.makeSign=()=>{};
  w.mats=Object.fromEntries(['road','side','median','paint','yellow','metal','leaf','trunk']
    .map(key=>[key,new THREE.MeshStandardMaterial()]));
  w.prepareRoadClearance(); w.makeRoad(); w.makeFurniture(); w.makeOverpasses(interchange);
  w.scene.updateMatrixWorld(true);fixtures.set(id,w);return w;
}
const vertical=(x,y,z,dy,meshes,far=35)=>new THREE.Raycaster(new THREE.Vector3(x,y,z),
  new THREE.Vector3(0,dy,0),0,far).intersectObjects(meshes,false);
const matching=(w,name)=>w.scene.children.filter(m=>m.name===name);

test('full-width scooter branches stay free of actual tree meshes, light poles and sidewalks',()=>{
  for(const routeId of ['zhubei-tsmc','zhubei-mediatek','erchong-tsmc','erchong-mediatek']){
    const w=worldFor(routeId),path=w.bikeRoute,walk=matching(w,'人行道');
    let treesTested=0,laneSections=0;
    for(const [name,radius,bottom,top] of [['行道樹樹冠',2.7,1.7,8.9],['行道樹樹幹',.21,0,3.6],['路燈立桿',.08,0,8.8]]){
      const m=w.scene.getObjectByName(name),matrix=new THREE.Matrix4(),pos=new THREE.Vector3();
      assert.ok(m?.count>0);
      for(let i=0;i<m.count;i++){
        m.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);
        const nearest=path.nearest(pos.x,pos.z);
        if(!w.branches.some(b=>nearest.s>=b.bikeStartS&&nearest.s<=b.bikeEndS))continue;
        const base=pos.y-(bottom+top)/2,roadY=path.height(nearest.s);
        if(base+bottom>roadY+2.3||base+top<roadY)continue;
        treesTested++;
        assert.ok(nearest.d>=path.width(nearest.s)/2+radius-.035,routeId+' '+name+' '+nearest.s);
      }
    }
    for(const b of w.branches){
      for(let s=b.bikeStartS+4;s<b.bikeEndS-3;s+=5){
        const edge=path.width(s)/2-.12;
        for(const offset of [-edge,0,edge]){
          const q=path.sample(s,offset);
          assert.equal(vertical(q.x,q.y+.9,q.z,-1,walk,.85).length,0,routeId+' sidewalk '+s+'/'+offset);
        }
        laneSections++;
      }
    }
    assert.ok(treesTested>0 && laneSections>100);
  }
});

test('park flyover has a solid bottom and fascia from rider height on both approaches',()=>{
  for(const id of ['zhubei-tsmc','erchong-tsmc']){
    const w=worldFor(id),path=w.crossingViaduct??w.route,slabs=matching(w,'實體橋板與橋底');
    const {bridgeStartS:start,bridgeEndS:end}=path.data.elevatedRanges[0];
    const asphalt=matching(w,id.startsWith('erchong')?'光復路上方園區高架鋪面':'通勤路面');
    assert.equal(path.height(start),0);assert.equal(path.height(end),0);
    for(const s of [start+66,3580,3710,3830,end-58]){
      const p=path.sample(s),top=vertical(p.x,p.y+2,p.z,-1,asphalt)[0],bottom=vertical(p.x,1.5,p.z,1,slabs)[0];
      assert.ok(top && bottom,id+' '+s);
      assert.ok(Math.abs(top.point.y-(p.y+.06))<.05);
      assert.ok(bottom.face.normal.y<-.97 && top.point.y-bottom.point.y>.97 && top.point.y-bottom.point.y<1.08);
      assert.equal(bottom.object.material.transparent,false);
      const right=path.width(s)/2+.56;
      const ray=new THREE.Raycaster(new THREE.Vector3(p.x+p.rx*(right+3),p.y-.4,p.z+p.rz*(right+3)),
        new THREE.Vector3(-p.rx,0,-p.rz),0,5);
      assert.ok(ray.intersectObjects(slabs,false).length>0,'missing vertical fascia '+id+' '+s);
    }
    if(id.startsWith('erchong')){
      const cross=w.route.sample(4937);
      assert.equal(cross.y,0);
      assert.ok(vertical(cross.x,1.6,cross.z,1,slabs)[0]?.distance>4);
    }
  }
});

test('interchange ramps follow eight directed movements and reconnect at real, paved, driveable elevations',()=>{
  const w=worldFor('zhubei-tsmc');
  const all=[...interchangeRoads(interchange),...interchange.carrierRoads];
  const ways=new Map(all.map(road=>[road.osmWayId,road]));
  const junctions=new Map(interchange.junctions.map(j=>[j.osmNodeId,j]));
  const pavement=[...matching(w,'台68鋪面與匯入口'),...matching(w,'通勤路面')];
  const guard=[...matching(w,'橋側護欄'),...matching(w,'台68匝道護欄')];
  assert.equal(interchange.routeTraces.slice(0,8).length,8);
  assert.equal(junctions.size,39);
  for(const trace of interchange.routeTraces){
    let node=trace.fromNode;
    for(const s of trace.sections){
      assert.equal(s.fromNode,node);
      const way=ways.get(s.osmWayId),nodes=way.points.map(p=>p.osmNodeId);
      assert.ok(nodes.indexOf(s.fromNode)>=0&&nodes.indexOf(s.toNode)>nodes.indexOf(s.fromNode),trace.name);
      node=s.toNode;
    }
    assert.equal(node,trace.toNode);
    if(trace.name.includes('公共地面'))assert.equal(ways.get(trace.sections.at(-1).osmWayId).points.find(p=>p.osmNodeId===node).y,0);
  }
  for(const j of junctions.values()){
    for(const l of j.links){
      const p=ways.get(l.osmWayId).points.find(p=>p.osmNodeId===j.osmNodeId);
      assert.ok(p&&Math.hypot(j.x-p.x,j.y-p.y,j.z-p.z)<.005);
    }
    if(j.links.some(l=>l.renderOwner==='interchange')){
      for(const [dx,dz] of [[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8]]){
        const h=vertical(j.x+dx,j.y+.7,j.z+dz,-1,pavement,1.1);
        assert.ok(h.length && Math.abs(h[0].point.y-j.y)<.26,'unjoined asphalt '+j.osmNodeId);
      }
    }
  }
  for(const o of interchange.guardrailOpenings){
    const p=o.carriageway==='northbound'?w.opposingAt(o.joinS):w.route.sample(o.joinS);
    assert.ok(Math.hypot(p.x-o.x,p.y-o.y,p.z-o.z)<.03);
    assert.ok(w.inOpening(o.joinS,o.joinS,o.carriageway,o.side));
    assert.equal(vertical(o.x,o.y+1.6,o.z,-1,guard,1.51).length,0);
  }
  for(const c of interchange.crossings)assert.ok(c.modelClearance>=5.39);
});

function quietRide(seed){
  const route=worldFor('zhubei-tsmc').route,day=rollDay(seed,route);
  const sim=new TrafficSimulation(route,{vehicle:'bike',scenario:day.scenario,day,seed,startS:4394.489});
  sim.cars=[];sim.pending=[];sim.rebuildBuckets();return sim;
}
test('scooter starts within the bike lane and wet curb contact preserves forward motion',()=>{
  for(const [seed,weather] of [[39596,'rain'],[15839,'typhoon']]){
    const sim=quietRide(seed),p=sim.player;
    const start=p.s,edge=sim.bikeRoute.width(start)/2-VEHICLES.bike.width/2-.05;
    assert.equal(sim.day.weather,weather);assert.equal(p.lane,0);assert.equal(p.offset,0);
    const run=(offset,steer)=>{
      Object.assign(p,{s:start,speed:0,offset});sim.time=0;sim.totalTime=0;
      for(let i=0;i<320;i++)sim.step(.025,{gas:.25,steer});
      assert.ok(Math.abs(p.offset)<=edge+.001);return p.s-start;
    };
    const center=run(0,0);assert.ok(center>8);
    for(const [offset,held] of [[edge,1],[-edge,-1],[edge,0]])assert.ok(Math.abs(run(offset,held)-center)<.05);
  }
});
test('a scooter can move away from an existing side overlap while a stopped vehicle ahead still stops it',()=>{
  const sim=quietRide(39596),p=sim.player,initial=p.s;
  const blocker=sim.addCar(initial+.2,0,'bike',0);blocker.offset=.75;blocker.parkedUntil=999;
  for(let i=0;i<120;i++)sim.step(.025,{gas:.65,steer:-1});
  assert.ok(p.offset<-1 && p.s>initial+4);
  p.s=initial-7;p.offset=.75;p.speed=4;const stop=p.s;
  for(let i=0;i<120;i++)sim.step(.025,{gas:1});
  assert.ok(p.s>stop && p.s<=blocker.s-(blocker.length+VEHICLES.bike.length)/2);
});
