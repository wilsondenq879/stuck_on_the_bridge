import {hillHeight} from './corridor.js';
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a,b,t) => a+(b-a)*t;
// Positive steering/offset means the driver's right. Three.js positive yaw is left.
export const steeredYaw = (roadYaw,rightHeading) => roadYaw-rightHeading;
export function seeded(seed=20261107) { let n=seed>>>0; return () => { n=(1664525*n+1013904223)>>>0; return n/4294967296; }; }
export class Route {
  constructor(data) {
    this.data=data; this.points=data.points; this.length=data.lengthMeters||this.points.at(-1).s;
    this.bridges=[];let start=null;
    for(let i=0;i<this.points.length;i++) {let p=this.points[i]; if(p.bridge&&start===null)start=p.s;if(start!==null&&(!p.bridge||i===this.points.length-1)){this.bridges.push([start,p.s]);start=null;}}
    const profiles=data.points===data.bikePoints?data.bikeBridgeProfiles:data.bridgeProfiles;
    this.spans=this.bridges.filter(([a,b])=>b-a>=100).map(([a,b])=>{
      const flyover=data.elevatedRanges?.find(e=>Math.abs(e.bridgeStartS-a)<20);
      const profile=profiles?.find(p=>Math.abs(p.start-a)<35);
      // The ground-level fork and merge are outside the structural span.
      return {from:flyover?.bridgeStartS??profile?.start??a,
        to:flyover?.bridgeEndS??profile?.end??b,height:profile?.height??7,ramp:profile?.ramp??100};
    });
    this.narrowings=[];let before=this.lanes(0);for(const p of this.points){const after=this.lanes(p.s+.01);if(after<before)this.narrowings.push({s:p.s,lanes:after});before=after;}
  }
  sample(s,offset=0) {
    s=clamp(s,0,this.length);const ps=this.points;let l=0,r=ps.length-1;
    while(r-l>1){let m=(l+r)>>1;if(ps[m].s>s)r=m;else l=m;}
    const a=ps[l],b=ps[r],t=clamp((s-a.s)/(b.s-a.s||1),0,1);
    let tx=b.x-a.x,tz=b.z-a.z,dist=Math.hypot(tx,tz)||1;tx/=dist;tz/=dist;
    const x=lerp(a.x,b.x,t)-tz*offset,z=lerp(a.z,b.z,t)+tx*offset;
    const rise=this.height(s+4)-this.height(s-4)+hillHeight(x+tx*4,z+tz*4)-hillHeight(x-tx*4,z-tz*4);
    return {x,z,y:this.height(s)+hillHeight(x,z),pitch:Math.atan2(rise,8),tx,tz,rx:-tz,rz:tx,yaw:Math.atan2(-tx,-tz),road:a.road||'通勤路線',bridge:!!a.bridge,s};
  }
  height(s){
    for(const span of this.spans) if(s>span.from && s<span.to){
      const q=clamp(Math.min(s-span.from,span.to-s)/span.ramp,0,1);
      return span.height*q*q*(3-2*q);
    }
    return 0;
  }
  highway(s){let l=0,r=this.points.length-1;while(r-l>1){const m=(l+r)>>1;if(this.points[m].s<=s)l=m;else r=m;}return this.points[l].highway||'';}
  lanes(s){const ps=this.points;let l=0,r=ps.length-1;s=clamp(s,0,this.length);while(r-l>1){const m=(l+r)>>1;if(ps[m].s>s)r=m;else l=m;}return ps[l].motorcycleLane?1:clamp(Number(ps[l].lanes)||2,1,3);}
  width(s){return this.lanes(s)*3.35;}
  laneOffset(s,lane){const n=this.lanes(s);return (clamp(lane,0,n-1)-(n-1)/2)*3.35;}
  nearest(x,z){let best={s:0,d:Infinity,offset:0};for(let i=0;i<this.points.length-1;i++){const a=this.points[i],b=this.points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(!len)continue;const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(len*len),0,1),px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(x-px,z-pz);if(d<best.d)best={s:lerp(a.s,b.s,t),d,offset:((x-px)*-dz+(z-pz)*dx)/len};}return best;}
}
