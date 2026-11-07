import {Route,lerp,seeded} from './geo.js';

// Independent one-way driveway coordinates; route stations are collision proxies
// only. In particular an outbound commute must not reverse a northbound queue.
export class RestaurantQueue {
 constructor(shop,route,seed=1){
  this.shop=shop;this.route=route;this.path=new Route({points:shop.queuePath,lengthMeters:shop.queuePath.at(-1).s});
  this.projections=shop.queuePath.map(p=>route.nearest(p.x,p.z));
  this.rng=seeded(Math.imul(seed,2654435761)^shop.osmWayId);this.spacing=6.8;this.target=Math.min(Math.floor((shop.serviceS-7)/this.spacing)+1,17+Math.floor(this.rng()*7));
  this.cars=[];this.serial=0;this.served=0;this.time=0;this.nextArrival=0;
  for(let i=0;i<this.target;i++)this.add(shop.serviceS-i*this.spacing);
 }
 add(position){
  const c={id:-1000000-this.shop.osmWayId-++this.serial,kind:'car',length:4.45,width:1.82,color:Math.floor(this.rng()*7),queueS:position,speed:0,braking:true,restaurant:this.shop.id};
  this.project(c);this.cars.push(c);return c;
 }
 project(c){const p=this.path.sample(c.queueS),ps=this.path.points;let l=0,r=ps.length-1;while(r-l>1){const m=(l+r)>>1;if(ps[m].s>c.queueS)r=m;else l=m;}const t=(c.queueS-ps[l].s)/(ps[r].s-ps[l].s||1),a=this.projections[l],b=this.projections[r];c.world=p;c.s=lerp(a.s,b.s,t);c.offset=lerp(a.offset,b.offset,t);c.station=c.s;}
 blocked(c,next,blockers){
  const p=this.path.sample((c.queueS+next)/2),front=(c.length/2+.8);
  return blockers.some(o=>{
   const q=o.world||this.route.sample(o.s,o.offset),dx=q.x-p.x,dz=q.z-p.z;
   const along=dx*p.tx+dz*p.tz,across=dx*p.rx+dz*p.rz;
   return along>-front-(o.length||4.45)/2&&along<front+(o.length||4.45)/2
    && Math.abs(across)<(c.width+(o.width||1.82))/2+.12;
  });
 }
 step(dt,blockers=[]){
  this.time+=dt;this.cars.sort((a,b)=>b.queueS-a.queueS);
  let lead=null;
  for(const c of this.cars){
   const before=c.queueS;
   let limit=lead?lead.queueS-this.spacing:this.path.length;
   if(!c.collected){
    limit=Math.min(limit,this.shop.serviceS);
    if(c.queueS>=this.shop.serviceS-.015){
     c.serviceUntil??=this.time+8+this.rng()*5;
     if(this.time>=c.serviceUntil){c.collected=true;this.served++;limit=lead?lead.queueS-this.spacing:this.path.length;}
    }
   }
   const v=Math.min(2.2,c.speed+dt*1.1),next=Math.max(before,Math.min(limit,before+v*dt));
   if(!this.blocked(c,next,blockers))c.queueS=next;
   c.speed=(c.queueS-before)/dt;c.braking=c.speed<.3;this.project(c);lead=c;
  }
  this.cars=this.cars.filter(c=>c.queueS<this.path.length-.1);
  const waiting=this.cars.filter(c=>!c.collected).length,tail=this.cars.at(-1);
  if(this.time>=this.nextArrival&&waiting<this.target&&(!tail||tail.queueS>this.spacing+2)){
   const candidate={queueS:2,length:4.45,width:1.82};
   if(!this.blocked(candidate,2,blockers)){this.add(2);this.nextArrival=this.time+2+this.rng()*3;}
  }
 }
 get waiting(){return this.cars.filter(c=>!c.collected).length;}
}

// The interchange asset is shared with Erchong and the original route. Rebase
// only references to the Zhubei station axis, never a ramp's own local length.
export function alignInterchange(data,prefix=0){
 if(!data||!prefix||data.stationPrefix===prefix)return data;
 const copy=structuredClone(data),delta=prefix-(data.stationPrefix||0);
 const add=(o,keys)=>{for(const k of keys)if(Number.isFinite(o[k]))o[k]+=delta;};
 add(copy.northboundAlignment,['fromS','toS','blendInEndS','blendOutStartS']);
 for(const p of copy.northboundAlignment?.points||[])add(p,['southboundS']);
 for(const p of copy.guardrailOpenings||[])add(p,['fromS','toS','joinS']);
 for(const p of [...(copy.opposedSharedNodes||[]),...(copy.crossings||[])])add(p,['southboundS']);
 copy.stationPrefix=prefix;return copy;
}

export function restaurantActors(sim){return (sim.restaurantQueues||[]).flatMap(q=>q.cars);}
