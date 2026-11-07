import {appendRibbon,ribbonRuns,roadFrames} from './road-geometry.js';

export function interchangeRoads(data){
  if(!data)return [];
  return [...data.structures,...data.mainlineRoads,...(data.surfaceRoads??[])]
    .filter(road=>road.renderOwner==='interchange');
}

// Fill the small space between independently mapped ribbons at a real road
// junction. Include interior OSM nodes as ramps also join mid-way along a way.
function joinPatch(vertices,points,lift,depth=0){
  if(points.length<3)return;
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z);
  function chain(list){
    const edge=[];
    for(const p of list){
      while(edge.length>=2&&cross(edge.at(-2),edge.at(-1),p)<=.00001)edge.pop();
      edge.push(p);
    }
    edge.pop();return edge;
  }
  const hull=[...chain(sorted),...chain(sorted.reverse())];
  const xyz=(p,d=0)=>[p.x,p.y+lift-d,p.z];
  for(let i=1;i+1<hull.length;i++){
    vertices.push(...xyz(hull[0]),...xyz(hull[i+1]),...xyz(hull[i]));
    if(depth)vertices.push(...xyz(hull[0],depth),...xyz(hull[i],depth),...xyz(hull[i+1],depth));
  }
  if(depth)for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length];
    vertices.push(...xyz(a),...xyz(b),...xyz(a,depth),...xyz(a,depth),...xyz(b),...xyz(b,depth));
  }
}

export function buildInterchange(data,clearance){
  const decks=[],asphalt=[],rails=[],paint=[];
  const roads=interchangeRoads(data);
  const frames=new Map(roads.map(road=>[road.osmWayId,{road,frames:roadFrames(road.points)}]));
  const gaps=new Map();
  for(const joint of data.junctions??[]){
    const branch=joint.links.reduce((n,l)=>n+Number(l.incoming)+Number(l.outgoing),0)>2;
    const footprint=[];
    let depth=Infinity;
    for(const link of joint.links){
      const entry=frames.get(link.osmWayId);
      if(!entry)continue;
      const {road,frames:row}=entry;
      const i=row.findIndex(p=>p.osmNodeId===joint.osmNodeId);
      if(i<0)continue;
      const p=row[i],half=road.width/2;
      depth=Math.min(depth,road.deckDepth);
      for(const q of [row[i-1],row[i+1]]){
        if(!q)continue;
        const t=Math.min(1,half/Math.max(.01,Math.abs(q.s-p.s)));
        for(const side of [-1,1])for(const f of [0,t]){
          footprint.push({x:p.x+(q.x-p.x)*f+side*half*(p.rx+(q.rx-p.rx)*f),
            z:p.z+(q.z-p.z)*f+side*half*(p.rz+(q.rz-p.rz)*f),y:p.y+(q.y-p.y)*f});
        }
      }
      if(branch){
        if(!gaps.has(road.osmWayId))gaps.set(road.osmWayId,[]);
        gaps.get(road.osmWayId).push(p.s);
      }
    }
    if(footprint.length){
      joinPatch(decks,footprint,.034,depth);
      joinPatch(asphalt,footprint,.071);
    }
  }
  for(const {road,frames:row} of frames.values()){
    const half=road.width/2;
    appendRibbon(decks,row,-half,half,.032,road.deckDepth);
    appendRibbon(asphalt,row,-half+.04,half-.04,.065);
    const openings=gaps.get(road.osmWayId)??[];
    const outsideJoin=(a,b)=>!openings.some(s=>b.s>=s-18 && a.s<=s+18);
    for(const side of [-1,1]){
      const edge=side*(half-.17);
      const rampOpenings=(data.guardrailOpenings??[]).filter(o=>o.rampWayId===road.osmWayId &&
        o.rampOpenSide===(side>0?'right':'left'));
      const openEdge=(a,b)=>outsideJoin(a,b)&&!rampOpenings.some(o=>b.s>=o.rampOpenFromS&&a.s<=o.rampOpenToS);
      const safe=p=>!clearance||clearance.free(p.x+p.rx*edge,p.z+p.rz*edge,.32,p.y+.05,p.y+.86,'ramp:'+road.osmWayId);
      const guardRuns=ribbonRuns(row,(a,b)=>Math.min(a.y,b.y)>1.35 && openEdge(a,b) && safe(a) && safe(b));
      for(const run of guardRuns)appendRibbon(rails,run,edge-.15,edge+.15,.85,.82);
      const marking=side*(half-.49);
      for(const run of ribbonRuns(row,openEdge))appendRibbon(paint,run,marking-.07,marking+.07,.087);
    }
  }
  return {decks,asphalt,rails,paint};
}
