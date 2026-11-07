import {clamp} from './geo.js?v=0.8.0';

// One cross-section per mapped vertex. Include the exact ends of a branch.
export function routeFrames(route, from=0, to=route.length) {
  const stations=[from];
  for(const point of route.points) {
    if(point.s<=from+.001 || point.s>=to-.001)continue;
    // Lane count changes at the mapped vertex. Preserve the old road width
    // up to the junction instead of sweeping the curb across the preceding lane.
    if(point.s-.025>stations.at(-1) && route.lanes(point.s-.025)!==route.lanes(point.s))stations.push(point.s-.025);
    stations.push(point.s);
  }
  stations.push(to);
  const rows=stations.map(s=>route.sample(s));
  const miters=roadFrames(rows);
  return rows.map((p,i)=>({...p,rx:miters[i].rx,rz:miters[i].rz}));
}

// Miter adjacent spans at the same vertex so a curved ramp has no wedge-shaped seams.
export function roadFrames(points) {
  let station=0;
  return points.map((point,i)=>{
    const prev=points[Math.max(0,i-1)], next=points[Math.min(points.length-1,i+1)];
    const before=Math.hypot(point.x-prev.x,point.z-prev.z);
    const after=Math.hypot(next.x-point.x,next.z-point.z);
    const ax=before ? -(point.z-prev.z)/before : -(next.z-point.z)/after;
    const az=before ? (point.x-prev.x)/before : (next.x-point.x)/after;
    const bx=after ? -(next.z-point.z)/after : ax;
    const bz=after ? (next.x-point.x)/after : az;
    const scale=1/Math.max(.55,1+ax*bx+az*bz);
    station+=before;
    return {...point,s:station,rx:(ax+bx)*scale,rz:(az+bz)*scale};
  });
}

const at=(value,frame)=>typeof value==='function' ? value(frame) : value;
const quad=(out,a,b,c,d)=>out.push(...a,...b,...c,...c,...b,...d);

export function appendRibbon(out, frames, left, right, lift=0, depth=0) {
  if(frames.length<2) return;
  let last;
  for(let i=0;i<frames.length;i++) {
    const p=frames[i], l=at(left,p), r=at(right,p), y=p.y+lift;
    const a=[p.x+p.rx*l,y,p.z+p.rz*l], b=[p.x+p.rx*r,y,p.z+p.rz*r];
    const c=[a[0],y-depth,a[2]], d=[b[0],y-depth,b[2]];
    if(last) {
      quad(out,last.a,last.b,a,b);
      if(depth>0) {
        quad(out,last.d,last.c,d,c);
        quad(out,last.c,last.a,c,a);
        quad(out,last.b,last.d,b,d);
      }
    }
    if(depth>0 && i===0) quad(out,b,a,d,c);
    if(depth>0 && i===frames.length-1) quad(out,a,b,c,d);
    last={a,b,c,d};
  }
}

export function ribbonRuns(frames,include) {
  const runs=[];
  let run=[];
  for(let i=1;i<frames.length;i++) {
    if(include(frames[i-1],frames[i])){
      if(!run.length) run.push(frames[i-1]);
      run.push(frames[i]);
    }else if(run.length){runs.push(run);run=[];}
  }
  if(run.length) runs.push(run);
  return runs;
}

export function alignmentAt(points,s) {
  if(!points?.length || s<points[0].southboundS || s>points.at(-1).southboundS) return null;
  let lo=0,hi=points.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].southboundS<=s)lo=mid;else hi=mid;}
  const a=points[lo],b=points[hi],t=clamp((s-a.southboundS)/(b.southboundS-a.southboundS||1),0,1);
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  return {x:a.x+t*dx,z:a.z+t*dz,y:a.y+(b.y-a.y)*t,rx:-dz/len,rz:dx/len,yaw:Math.atan2(-dx,-dz),
    width:(a.width??(a.lanes||2)*3.35)*(1-t)+(b.width??(b.lanes||2)*3.35)*t};
}

export function bikeBranches(route,bikeRoute) {
  if(route===bikeRoute) return [];
  return route.data.bikeDivergenceRanges ?? [{
    carStartS:route.data.bikeSplitS??4164,carEndS:route.length,
    bikeStartS:route.data.bikeSplitS??4164,bikeEndS:bikeRoute.length,
  }];
}

// Index the full width and height of each road. At an overpass more than one
// segment can be at the same x/z, so a nearest-centerline test is insufficient.
export class RoadClearance {
  constructor() { this.cells=new Map(); }
  add(frames,left,right,owner='road') {
    const centers=frames.map(p=>{
      const l=at(left,p),r=at(right,p),middle=(l+r)/2;
      return {x:p.x+p.rx*middle,z:p.z+p.rz*middle,y:p.y,r:(r-l)/2};
    });
    for(let i=1;i<centers.length;i++) {
      const a=centers[i-1],b=centers[i],w=Math.max(a.r,b.r);
      const segment={a,b,dx:b.x-a.x,dz:b.z-a.z,owner};
      segment.length2=segment.dx**2+segment.dz**2;
      for(let x=Math.floor((Math.min(a.x,b.x)-w)/32);x<=Math.floor((Math.max(a.x,b.x)+w)/32);x++){
        for(let z=Math.floor((Math.min(a.z,b.z)-w)/32);z<=Math.floor((Math.max(a.z,b.z)+w)/32);z++){
          const key=x+','+z;
          if(!this.cells.has(key)) this.cells.set(key,[]);
          this.cells.get(key).push(segment);
        }
      }
    }
  }
  free(x,z,radius,bottom,top,ignore=null) {
    for(let col=Math.floor((x-radius)/32);col<=Math.floor((x+radius)/32);col++){
      for(let row=Math.floor((z-radius)/32);row<=Math.floor((z+radius)/32);row++){
        for(const {a,b,dx,dz,length2,owner} of this.cells.get(col+','+row)??[]) {
          if(owner===ignore) continue;
          const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(length2||1),0,1);
          const y=a.y+(b.y-a.y)*t;
          if(top<y-.12 || bottom>y+4.15) continue;
          const width=a.r+(b.r-a.r)*t+radius;
          if((x-a.x-t*dx)**2+(z-a.z-t*dz)**2<width**2) return false;
        }
      }
    }
    return true;
  }
  roadside(route,s,offset,radius,height,maxShift=22) {
    const center=route.sample(s),direction=Math.sign(offset)||1;
    for(let shift=0;shift<=maxShift;shift+=1.25){
      const lateral=offset+direction*shift;
      const x=center.x+center.rx*lateral,z=center.z+center.rz*lateral;
      if(this.free(x,z,radius+.35,center.y,center.y+height)) return {...center,x,z,offset:lateral};
    }
    return null;
  }
}
