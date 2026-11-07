import {courtPoints,courtStop} from './corridor.js';
import {RestaurantQueue,restaurantActors} from './restaurant-queues.js?v=0.9.3';
import {Route,clamp,lerp,seeded} from './geo.js?v=0.9.8';
import {recordViolation} from './day.js';
import {WEATHER,earthquakeAt,windAt} from './environment.js';

export const VEHICLES={car:{width:1.82,length:4.45,accel:2.8,brake:7.4,maxSpeed:16.7,steer:0.34,label:'汽車'},bus:{width:2.45,length:9.8,accel:1.5,brake:5.3,maxSpeed:16.7,steer:.25,label:'糠橋交通車'},bike:{width:.76,length:1.95,accel:3.5,brake:6.2,maxSpeed:16.7,steer:.48,label:'機車'}};
export class TrafficSimulation {
  constructor(route,{scenario='normal',seed=7301,vehicle='car',startS=0,day=null,warmupSteps=2400}={}) {
    this.route=route;this.trafficSeed=seed;this.mainlineDepartures=[];this.mainlinePaths=new Map();this.routeExits=route.data.sceneryProfile==='south-hsinchu'?route.points.filter((p,i)=>i&&p.highway==='motorway_link'&&route.points[i-1].highway==='motorway').map(p=>p.s):[];this.stationRanges=[...(route.data.bikeStationMappings||[]),...(route.data.bikeDivergenceRanges||[])];this.bikeRoute=route.data.bikePoints?new Route({...route.data,points:route.data.bikePoints,lengthMeters:route.data.bikePoints.at(-1).s}):route;this.bikeSplit=route.data.bikeSplitS??4164.04;this.day=day;this.tripEndS=vehicle==='bus'&&route.data.schoolStop&&route.data.direction!=='return'?route.data.schoolStop.s-6:vehicle==='bike'?this.bikeRoute.length:route.length;this.weather=WEATHER[day?.weather||'sunny'];this.flashAt=-100;this.feedback=[];this.feedbackId=0;this.greenIdle=0;this.rearPressureUntil=0;this.lastRear=-100;this.nextAmbientHorn=14;this.boxWait=0;this.scenario=scenario;this.rng=seeded(seed);this.time=0;this.id=0;this.cars=[];this.spawned=0;this.exited=0;this.pending=[];
    this.highwayQueue=scenario==='incident'?135:8;this.diverted=0;this.entered=0;this.accumulators=[0,0];this.sideQueue=0;
    const raw=vehicle==='bike'?(route.data.bikeIntersections||route.data.intersections||[]):route.data.intersections||[];const signalRoute=vehicle==='bike'?this.bikeRoute:route;
    this.signals=[];
    for(const p of [...raw].sort((a,b)=>a.s-b.s)) if(p.signalTagged&&p.s>70&&p.s<route.length-60&&!signalRoute.sample(p.s).bridge&&(!this.signals.length||p.s-this.signals.at(-1).s>100))this.signals.push({...p,cycle:86,green:48,offset:(this.signals.length*19+30)%86});
    if(this.signals.length===0)for(let s=300;s<route.length-100;s+=600)if(!route.sample(s).bridge)this.signals.push({name:'路口號誌（示意）',s,cycle:86,green:48,offset:this.signals.length*19});
    this.carSignals=this.signals;this.bikeSignals=this.signals;
    this.feedS=route.data.eventRegions?.feedS??Math.min(route.length-250,this.signals.find(v=>v.name?.includes('公道五'))?.s+35||route.length*.62);
    for(let s=45;s<route.length-40;s+=34) for(let lane=0;lane<route.lanes(s);lane++) {
      if(this.rng()<=.22) continue;
      const station=s+this.rng()*12, kind=this.trafficKind(s), speed=8+this.rng()*4;
      const path=this.pathFor(kind),neck=path.narrowings.find(n=>n.s>station&&n.s-station<85),safeN=Math.min(path.lanes(station),neck?.lanes??3);
      if(lane<safeN){const car=this.addCar(station,lane,kind,speed);car.offset=(lane-(safeN-1)/2)*3.35;}
    }
    const playerPath=this.pathFor(vehicle);
    startS=clamp(startS,0,playerPath.length-20);
    const initialLane=Math.floor(playerPath.lanes(startS)/2);
    this.player={s:startS,offset:playerPath.laneOffset(startS,initialLane),lane:initialLane,speed:0,heading:0,vehicle,auto:false,wait:0,bumps:0,red:0,done:false,steering:0,braking:false};
    this.initialCount=this.cars.length;this.totalTime=0;this.lastBump=-100;this.lastRed=-100;this.lastMessage='';
    this.followedId=null;
    this.slowSeconds=0;
    this.commentedDrivers=new Set();
    this.jamSeconds=0;
    this.lastJamLine=-Infinity;
    this.encounterRoll=seeded(Math.imul(day?.seed??seed,2654435761)^0x51b7);
    this.nextSlowAt=day && this.encounterRoll()<.8 ? 5+this.encounterRoll()*16 : Infinity;
    // Pre-roll traffic; the player is inserted only after network queues settle.
    for(let i=0;i<warmupSteps;i++)this.stepTraffic(.05,false);
    this.time=0;this.totalTime=0;this.cars=this.cars.filter(v=>{if(Math.abs(v.s-this.player.s)<12){this.exited++;return false;}return true;});
    if(day){
      this.signals.forEach((s,i)=>{s.offset=(s.offset+day.phaseShift)%s.cycle;s.camera=day.redCameras&&i%2===0;s.yellowBox=day.yellowBox;});
      if(day.bridgeSignal)this.signals.push({name:'經國大橋入口・短綠長紅挑戰',s:day.bridgeSignalS??660,cycle:77,green:19,offset:60,fictional:true});
      this.signals.sort((a,b)=>a.s-b.s);
    }
    this.court=route.data.schoolStop&&route.data.direction==='outbound'?new Route({points:courtPoints}):null;
    this.courtExit=this.court?route.data.schoolStop.s+28:0;
    this.schoolQueue=null;
    if(route.data.schoolStop)this.initSchoolQueue(startS);
    // Keep vehicle-specific light positions when the car crosses the viaduct.
    const otherKind=vehicle!=='bike'?'bike':'car',otherRoute=otherKind==='bike'?this.bikeRoute:route;
    const otherRaw=otherKind==='bike'?(route.data.bikeIntersections||route.data.intersections):route.data.intersections;
    const other=[];
    for(const q of [...(otherRaw||[])].sort((a,b)=>a.s-b.s))if(q.signalTagged&&q.s>70&&q.s<otherRoute.length-60&&!otherRoute.sample(q.s).bridge&&(!other.length||q.s-other.at(-1).s>100))other.push({...q,cycle:86,green:48,offset:(other.length*19+30+(day?.phaseShift||0))%86,yellowBox:!!day?.yellowBox});
    if(day?.bridgeSignal)other.push({...this.signals.find(x=>x.fictional)});
    if(vehicle!=='bike')this.bikeSignals=other;else this.carSignals=other;
    for(const light of other){const match=this.signals.find(p=>p.osmId&&p.osmId===light.osmId);if(match){light.offset=match.offset;light.cycle=match.cycle;light.green=match.green;}}
    this.restaurantQueues=(route.data.restaurants||[]).map(shop=>new RestaurantQueue(shop,route,day?.seed??seed));
    // Keep the seeded scene free of overlapping vehicles at the driveway tail.
    const own={...this.player,length:VEHICLES[vehicle].length,width:VEHICLES[vehicle].width,world:playerPath.sample(startS,this.player.offset)};
    for(const q of this.restaurantQueues)q.cars=q.cars.filter(c=>!q.blocked(c,c.queueS,[own]));
    this.cars=this.cars.filter(c=>{const pose=this.pathFor(c.kind).sample(c.s,c.offset),hit=restaurantActors(this).some(r=>Math.hypot(pose.x-r.world.x,pose.z-r.world.z)<(c.length+r.length)/2+.5);if(hit)this.exited++;return !hit;});
    this.rebuildBuckets();
  }
  mainlinePath(exit){
    if(this.mainlinePaths.has(exit))return this.mainlinePaths.get(exit);
    const heading=this.route.sample(exit-18),position=this.route.sample(exit),roads=(this.route.data.surroundingRoads||[]).filter(r=>r.highway==='motorway'&&!r.bridge&&r.name===heading.road&&r.points?.length>1);
    const make=points=>{let s=0;return new Route({points:points.map((p,i)=>{if(i)s+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);return {...p,s,highway:'motorway',lanes:3};}),lengthMeters:s});};
    let best=null;
    for(const road of roads){const path=make(road.points),near=path.nearest(position.x,position.z),p=path.sample(near.s),dot=p.tx*heading.tx+p.tz*heading.tz;if(dot<.5||near.d>45)continue;const score=near.d+(path.length-near.s<20?40:0);if(!best||score<best.score)best={road,path,near,score};}
    if(best){const points=[...best.road.points],used=new Set([best.road]);
      for(let i=0;i<8;i++){const path=make(points);if(path.length-best.near.s>450)break;const end=points.at(-1),next=roads.find(r=>!used.has(r)&&Math.hypot(r.points[0].x-end.x,r.points[0].z-end.z)<3);if(!next)break;points.push(...next.points.slice(1));used.add(next);}
      best=make(points);if(best.length-best.nearest(position.x,position.z).s<25)best=null;
    }
    this.mainlinePaths.set(exit,best);return best;
  }
  trafficKind(s){const value=this.rng(),nearNeck=this.route.narrowings.some(n=>n.s>s&&n.s-s<95);return value<.045&&!nearNeck?'bus':value>=.045&&value<.22?'bike':'car';}
  pathFor(kind){return kind==='bike'?this.bikeRoute:this.route;}
  addCar(s,lane,kind='car',speed=0){
    const path=this.pathFor(kind),lanes=path.lanes(s);
    lane=clamp(lane,0,lanes-1);
    const v={id:++this.id,s,lane,knownLanes:lanes,nextRouteExit:this.routeExits.find(s0=>s0>s+5),kind,offset:path.laneOffset(s,lane),speed,length:kind==='bus'?9.8:kind==='bike'?2:4.4+this.rng()*1.2,width:kind==='bus'?2.45:kind==='bike'?.73:1.85,v0:(kind==='bus'?9.5:11)+this.rng()*3.5,color:Math.floor(this.rng()*7),braking:false};
    this.cars.push(v);this.spawned++;
    if(this.buckets){v.station=this.sharedStation(s,kind);const k=Math.floor(v.station/25);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(v);}
    return v;
  }
  initSchoolQueue(startS){
    const gate=this.route.data.schoolStop.s,rng=seeded((this.day?.seed||7301)^0x5c4001),count=18+Math.floor(rng()*11);
    this.schoolQueue={gate,count,served:0,releaseEvery:4.5+rng()*3,nextArrival:5,rng};
    const extent=count*8.3+25;
    this.cars=this.cars.filter(c=>{if(c.kind!=='bike'&&c.s>gate-extent-20&&c.s<gate+16){this.exited++;return false;}return true;});
    let s=gate-17;
    for(let i=0;i<count;i++){const kind=i%9===5?'bus':'car',length=kind==='bus'?9.8:4.8;
      if(Math.abs(s-startS)>length/2+VEHICLES[this.player.vehicle].length/2+3){const c=this.addCar(s,this.route.lanes(s)-1,kind,0);c.length=length;c.schoolQueue=true;c.v0=4.5;c.schoolGate=gate;}
      s-=length+3.3;
    }
    this.initialCount=this.cars.length;this.rebuildBuckets();
  }
  feedSchoolQueue(includePlayer){
    const q=this.schoolQueue;if(!q||this.time<q.nextArrival)return;
    q.nextArrival=this.time+2.5+q.rng()*2.5;
    const queue=this.cars.filter(c=>c.schoolQueue&&c.schoolTurningAt===undefined);
    if(queue.length>=q.count)return;
    const kind=q.rng()<.12?'bus':'car',length=kind==='bus'?9.8:4.8;
    const tail=queue.reduce((a,b)=>a.s<b.s?a:b,{s:q.gate-40,length:4.8});
    const s=Math.max(5,tail.s-(tail.length+length)/2-3.5),lane=this.route.lanes(s)-1,offset=this.route.laneOffset(s,lane);
    if(this.nearby(s,15,15,'car').some(c=>c.kind!=='bike'&&Math.abs(c.s-s)<(c.length+length)/2+2&&Math.abs(c.offset-offset)<2.6))return;
    const p=this.player;if(includePlayer&&Math.abs(this.longitudinalGap(s,'car',p))<(length+VEHICLES[p.vehicle].length)/2+3&&Math.abs(p.offset-offset)<2.6)return;
    const c=this.addCar(s,lane,kind,0);c.length=length;c.schoolQueue=true;c.v0=4.5;c.schoolGate=q.gate;
  }
  rebuildBuckets(){this.buckets=new Map();for(const c of [...this.cars,...restaurantActors(this)]){if(c.schoolTurningAt!==undefined)continue;c.station=this.sharedStation(c.s,c.kind);const k=Math.floor(c.station/25);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(c);}}
  nearby(s,behind=15,ahead=15,kind=this.player?.vehicle||'car'){if(!this.buckets)return this.cars;s=this.sharedStation(s,kind);const found=[];for(let k=Math.floor((s-behind-30)/25);k<=Math.floor((s+ahead+30)/25);k++){const b=this.buckets.get(k);if(b)found.push(...b);}return found;}
  phase(signal){const t=(this.time+signal.offset)%signal.cycle;
    const blocked=(this.scenario==='incident'&&this.sideQueue>15&&Math.abs(signal.s-this.feedS)<100&&t<Math.min(14,this.sideQueue*.3))||(signal.yellowBox&&Math.abs(signal.s-this.feedS)<130&&t<12);
    return {state:blocked?'blocked':t<signal.green?'green':t<signal.green+3?'yellow':'red',remaining:Math.ceil(t<signal.green?signal.green-t:signal.cycle-t),blocked};
  }
  stopAt(s,kind=this.player?.vehicle||'car'){if(!this.court&&kind==='bus'&&this.player?.vehicle==='bus'&&Math.abs(s-this.player.s)<.02&&this.tripEndS<this.route.length&&this.tripEndS-s<90)return {gap:Math.max(0,this.tripEndS-s)+VEHICLES.bus.length/2,signal:{name:'交通車接送停靠',s:this.tripEndS},phase:{state:'red',remaining:0}};for(const signal of kind===this.player?.vehicle?this.signals:((kind==='bike'?this.bikeSignals:this.carSignals)||this.signals)){let gap=signal.s-8-s;if(gap>0&&gap<150){const p=this.phase(signal);if(p.state!=='green')return{gap,signal,phase:p};}}return null;}
  sharedStation(s,kind){if(kind!=='bike')return s;const r=this.stationRanges.find(v=>s>=v.bikeStartS&&s<=v.bikeEndS);return r?r.carStartS+(s-r.bikeStartS)*(r.carEndS-r.carStartS)/(r.bikeEndS-r.bikeStartS||1):s;}
  longitudinalGap(s,kind,c){const other=c.kind||c.vehicle;return kind===other?c.s-s:this.sharedStation(c.s,other)-this.sharedStation(s,kind);}
  isSeparate(a,kind,b,other){kind=kind==='bike'?'bike':'car';other=other==='bike'?'bike':'car';if(kind===other)return false;const ranges=this.route.data.bikeDivergenceRanges;if(!ranges)return a>this.bikeSplit&&b>this.bikeSplit;return ranges.some(r=>{const car=kind==='car'?a:b,bike=kind==='bike'?a:b;return(car>=r.carStartS&&car<=r.carEndS)||(bike>=r.bikeStartS&&bike<=r.bikeEndS);});}
  closest(s,offset,width,excludeId=null,includePlayer=true){let best=null;const kind=width<1?'bike':'car',station=this.sharedStation(s,kind);for(const c of this.nearby(s,40,180,kind)){if(c.leavingRoute||c.id===excludeId||this.isSeparate(s,kind,c.s,c.kind))continue;const gap=kind===c.kind?c.s-s:(c.station??this.sharedStation(c.s,c.kind))-station;if(gap<=0||gap>140)continue;const candidateS=c.kind===kind?c.s:s+gap;if(Math.abs(c.offset-offset)<(c.width+width)/2+.25&&(!best||candidateS<best.s))best=c.kind===kind?c:{...c,s:candidateS};}
    const p=this.player;if(includePlayer&&p&&p.courtDistance==null&&!p.done&&!this.isSeparate(s,kind,p.s,p.vehicle)){const gap=this.longitudinalGap(s,kind,p);if(gap>0&&gap<140&&Math.abs(p.offset-offset)<(VEHICLES[p.vehicle].width+width)/2+.25&&(!best||s+gap<best.s))best={...p,s:s+gap,length:VEHICLES[p.vehicle].length,width:VEHICLES[p.vehicle].width,id:-1};}return best;}

  incidentState(){if(this.scenario!=='incident')return{label:'一般早尖峰',stage:'normal',capacity:1.55};if(this.time<360)return{label:'國1南下事故處理中',stage:'active',capacity:.35};if(this.time<540)return{label:'事故排除，車流恢復中',stage:'recovering',capacity:lerp(.35,1.55,(this.time-360)/180)};return{label:'國道恢復通行，市區仍在消化車流',stage:'cleared',capacity:1.55};}
  stepTraffic(dt,includePlayer=true){
    for(const q of this.restaurantQueues||[]){
      const blockers=this.cars.filter(c=>Math.abs(c.s-q.shop.s)<220).map(c=>({...c,world:this.pathFor(c.kind).sample(c.s,c.offset)}));
      if(includePlayer){const p=this.player;blockers.push({...p,...VEHICLES[p.vehicle],world:this.pathFor(p.vehicle).sample(p.s,p.offset)});}
      q.step(dt,blockers);
    }
    this.time+=dt;for(const c of this.mainlineDepartures)c.age+=dt;this.mainlineDepartures=this.mainlineDepartures.filter(c=>c.age<18&&(!c.mainlinePath||c.mainlineS+c.age*c.speed<c.mainlinePath.length-3));this.rebuildBuckets();this.feedSchoolQueue(includePlayer);const incident=this.incidentState();
    const diversion=this.scenario==='incident'?Math.min(.63,Math.max(0,this.highwayQueue-18)*.006):.025;
    this.highwayQueue=Math.max(0,this.highwayQueue+(1.02-incident.capacity-diversion)*dt);
    this.sideQueue=Math.max(0,this.sideQueue+(diversion*.63-.14)*dt);
    const rates=[.28+diversion*.65,.08+diversion*.35];
    for(let k=0;k<2;k++){this.accumulators[k]+=rates[k]*dt;while(this.accumulators[k]>=1){this.pending.push({s:k?this.feedS:3,diverted:this.rng()<diversion/(rates[k]||1),kind:this.trafficKind(k?this.feedS:3)});this.accumulators[k]-=1;}}
    for(let k=this.pending.length-1;k>=0;k--){
      const p=this.pending[k],path=this.pathFor(p.kind);
      const neck=path.narrowings.find(n=>n.s>p.s&&n.s-p.s<85),safeN=Math.min(path.lanes(p.s),neck?.lanes??3),lane=Math.floor(this.rng()*safeN),offset=(lane-(safeN-1)/2)*3.35;
      const conflicts=(other,kind,space)=>!this.isSeparate(p.s,p.kind,other.s,kind)
        && Math.abs(this.longitudinalGap(p.s,p.kind,other))<space && Math.abs(other.offset-offset)<2.5;
      if(this.cars.length>=900 || this.nearby(p.s,15,15,p.kind).some(c=>conflicts(c,c.kind,12))) continue;
      if(includePlayer && conflicts(this.player,this.player.vehicle,15)) continue;
      const entered=this.addCar(p.s,lane,p.kind,3);entered.offset=offset;
      if(p.diverted)this.diverted++;
      this.entered++;
      this.pending.splice(k,1);
    }
    this.cars.sort((a,b)=>b.s-a.s);
    for(const c of this.cars){
      if(c.schoolTurningAt!==undefined){
        c.courtDistance+=this.court?this.courtAdvance(c,dt):0;
        if(this.court){
          const approach=c.courtDistance<0;
          c.world=approach?this.route.sample(this.schoolQueue.gate-7+c.courtDistance,c.offset):this.court.sample(c.courtDistance);
        }
        continue;
      }
      if(c.schoolQueue&&c.s>=c.schoolGate-17.3){c.schoolServiceUntil??=this.time+this.schoolQueue.releaseEvery;if(this.time<c.schoolServiceUntil){c.speed=0;c.braking=true;continue;}c.schoolTurningAt=this.time;c.courtDistance=Math.min(0,c.s-(this.schoolQueue.gate-7));this.schoolQueue.served++;continue;}
      if(c.parkedUntil>this.time){c.speed=0;c.braking=true;c.clearAhead=false;c.hasQueueAhead=false;continue;}const localRoute=c.kind==='bike'?this.bikeRoute:this.route;const nowN=localRoute.lanes(c.s),lookahead=c.kind==='bus'?80:45,neck=localRoute.narrowings.find(n=>n.s>c.s&&n.s-c.s<lookahead),futureN=Math.min(nowN,localRoute.lanes(Math.min(localRoute.length,c.s+lookahead)),neck?.lanes??3);if(nowN>c.knownLanes)c.lane=c.id%nowN;c.knownLanes=nowN;c.lane=Math.min(c.lane,futureN-1);let target=(c.lane-(futureN-1)/2)*3.35;
      if(c.kind==='bike')target+=.65;
      const stoppedAhead=this.closest(c.s+.01,c.offset,c.width,c.id,includePlayer);
      if(stoppedAhead?.parkedUntil>this.time&&stoppedAhead.s-c.s<48&&nowN>1){const alternative=c.lane===nowN-1?c.lane-1:c.lane+1;const altOffset=localRoute.laneOffset(c.s,alternative);if(!this.nearby(c.s,12,16,c.kind).some(o=>o.id!==c.id&&Math.abs(o.offset-altOffset)<2))c.lane=alternative;target=localRoute.laneOffset(c.s,c.lane);}
      if(c.cutInUntil>this.time)target=c.cutInTarget;

      const lateralStep=clamp(target-c.offset,-dt*(c.cutInUntil>this.time?2.5:.9),dt*(c.cutInUntil>this.time?2.5:.9));
      const sideConflicts=this.nearby(c.s,22,22,c.kind).filter(o=>!o.leavingRoute&&o.id!==c.id&&!this.isSeparate(c.s,c.kind,o.s,o.kind)&&Math.abs(this.longitudinalGap(c.s,c.kind,o))<(o.length+c.length)*.5+1&&Math.abs(o.offset-(c.offset+lateralStep))<(o.width+c.width)*.5+.16);
      let sideBlocked=sideConflicts.length>0;
      const mergeYield=Math.abs(target-c.offset)>.25&&sideConflicts.some(o=>{const gap=this.longitudinalGap(c.s,c.kind,o);return gap>.00001||(Math.abs(gap)<=.00001&&o.id<c.id);});
      if(includePlayer){const p=this.player,sp=VEHICLES[p.vehicle];if(!this.isSeparate(c.s,c.kind,p.s,p.vehicle)&&Math.abs(this.longitudinalGap(c.s,c.kind,p))<(sp.length+c.length)/2+1&&Math.abs(p.offset-c.offset-lateralStep)<(sp.width+c.width)/2+.22)sideBlocked=true;}
      if(!sideBlocked)c.offset+=lateralStep;
      const lead=this.closest(c.s+.01,c.offset,c.width,c.id,includePlayer);let gap=lead?lead.s-c.s-(lead.length+c.length)/2:1e5,leadV=lead?.speed||0;
      const stop=this.stopAt(c.s,c.kind);if(stop&&stop.gap-c.length*.5<gap){gap=stop.gap-c.length*.5;leadV=0;}
      const narrowing=localRoute.narrowings.find(n=>n.s>c.s&&n.s-c.s<65);if(narrowing&&Math.abs(c.offset)>narrowing.lanes*3.35/2-c.width/2-.08){const endGap=narrowing.s-c.s-c.length/2;if(endGap<gap){gap=endGap;leadV=0;}}
      const isMerging=Math.abs(target-c.offset)>1.2;const quake=earthquakeAt(this.day,this.totalTime);
      const cruising=this.time<c.slowUntil ? Math.max(4.8,c.v0-(this.time-c.slowSince)*1.1) : c.v0+(c.kind!=='bike'&&localRoute.highway(c.s)==='motorway'?13:0);
      const v0=Math.min((isMerging?7:cruising)*this.weather.trafficSpeed,quake>0?3.5:100);
      const a=c.kind==='bus'?.85:c.kind==='bike'?1.9:1.35,b=2.8,T=c.kind==='bus'?1.7:c.kind==='bike'?.85:1.2;const desired=2+Math.max(0,c.speed*T+c.speed*(c.speed-leadV)/(2*Math.sqrt(a*b)));
      let accel=a*(1-(c.speed/v0)**4-(desired/Math.max(.1,gap))**2);accel=clamp(mergeYield?Math.min(accel,-2.5):accel,-6,a);
      c.braking=accel<-.4||c.speed<.4;c.speed=clamp(c.speed+accel*dt,0,v0+1);
      const step=Math.max(0,Math.min(c.speed*dt,gap-.65));c.s+=step;if(step<c.speed*dt*.5)c.speed=0;
      if(c.kind!=='bike'&&c.nextRouteExit!==undefined&&c.s>=c.nextRouteExit){
        const exit=c.nextRouteExit,follow=seeded(Math.imul(c.id,2654435761)^this.trafficSeed^Math.round(exit))()<.30;
        c.nextRouteExit=this.routeExits.find(x=>x>exit+20);
        if(!follow){const position=localRoute.sample(c.s,c.offset),heading=localRoute.sample(Math.max(0,exit-18));
          const mainlinePath=this.mainlinePath(exit),match=mainlinePath?.nearest(position.x,position.z);
          if(mainlinePath&&match.d<5)this.mainlineDepartures.push({...c,mainlinePath,mainlineS:match?.s??0,mainlineOffset:match?.offset??0,age:0,origin:position,tx:heading.tx,tz:heading.tz,yaw:heading.yaw,speed:Math.max(9,c.speed)});c.leavingRoute=true;
        }
      }
      c.clearAhead=c.kind==='car' && gap>30 && (!lead || lead.speed>5.6 || lead.s-c.s>60)
        && (!stop || stop.gap>75) && !narrowing && !isMerging && !(c.cutInUntil>this.time)
        && !quake && this.day?.weather!=='typhoon';
      c.hasQueueAhead=!!lead && lead.id!==-1 && lead.speed<1.5 && lead.s-c.s<22;
    }
    this.cars=this.cars.filter(c=>{if(c.leavingRoute||(c.schoolTurningAt!==undefined&&(this.court?c.courtDistance>=this.court.length-.01:this.time-c.schoolTurningAt>1))||c.s>(c.kind==='bike'?this.bikeRoute.length:this.route.length)+8){this.exited++;return false;}return true;});
  }
  courtAdvance(c,dt){
    const traffic=this.cars.filter(v=>v!==c&&v.courtDistance!=null);
    if(c!==this.player&&this.player.courtDistance!=null)traffic.push(this.player);
    let gap=Infinity;
    for(const v of traffic){
      const distance=v.courtDistance-c.courtDistance;
      if(distance>0)gap=Math.min(gap,distance-((v.length||VEHICLES[v.vehicle]?.length||5)+(c.length||VEHICLES[c.vehicle]?.length||5))/2-1.5);
    }
    return Math.max(0,Math.min(dt*3.5,gap));
  }
  driveCourt(dt,gas,brake,steer){
    const p=this.player;
    const gap=this.courtAdvance(p,dt),remain=courtStop-p.courtDistance;
    if(p.auto){gas=1;brake=!p.unloaded&&remain<Math.max(2,p.speed*p.speed/5)?1:0;}
    p.speed=clamp(p.speed+(gas*2-brake*5-.28)*dt,0,4);
    p.courtDistance+=Math.min(p.speed*dt,gap, p.unloaded?Infinity:Math.max(0,remain));
    p.offset=clamp(p.offset+steer*dt,-.55,.55);
    if(!p.unloaded&&courtStop-p.courtDistance<2.2){
      p.speed=0;p.dwell=(p.dwell||0)+dt;
      if(p.dwell>=2)p.unloaded=true;
    }
    p.world=this.court.sample(p.courtDistance,p.offset);
    this.lastMessage=p.unloaded?'接送完成，繞出廣場回柴喬路':'水滴廣場接送，請在彎道前停靠';
    if(p.courtDistance>=this.court.length-.1){
      p.courtDistance=null;p.world=null;p.courtComplete=true;p.offset=0;p.s=this.courtExit;
      if(p.vehicle==='bus'){p.done=true;p.speed=0;}
    }
  }
  step(dt,input={}){if(this.player.done)return;dt=Math.min(dt,.1);this.totalTime+=dt;this.updateDay();this.stepTraffic(dt);const p=this.player,spec=VEHICLES[p.vehicle],localRoute=p.vehicle==='bike'?this.bikeRoute:this.route;let gas=clamp(Number(input.gas)||0,0,1),brake=clamp(Number(input.brake)||0,0,1),steer=clamp(Number(input.steer)||((input.right?1:0)-(input.left?1:0)),-1,1);
    if(p.courtDistance!=null){this.driveCourt(dt,gas,brake,steer);return;}
    if(steer)p.lane=clamp(Math.round(p.offset/3.35+(localRoute.lanes(p.s)-1)/2),0,localRoute.lanes(p.s)-1);
    else if(p.auto){const ahead=this.closest(p.s+.01,p.offset,spec.width,null,false);if(ahead?.parkedUntil>this.time&&ahead.s-p.s<60&&localRoute.lanes(p.s)>1){const n=localRoute.lanes(p.s),lane=p.lane===n-1?p.lane-1:p.lane+1,off=localRoute.laneOffset(p.s,lane);if(!this.nearby(p.s,12,15).some(v=>Math.abs(v.offset-off)<2))p.lane=lane;}const lookahead=p.vehicle==='bus'?80:45,neck=localRoute.narrowings.find(n=>n.s>p.s&&n.s-p.s<lookahead),n=Math.min(localRoute.lanes(p.s),localRoute.lanes(p.s+lookahead),neck?.lanes??3);p.lane=Math.min(p.lane,n-1);const desired=(p.lane-(n-1)/2)*3.35+(p.vehicle==='bike'?.55:0);steer=clamp((desired-p.offset)*.4-p.heading*2.5,-1,1);}
    p.steering=lerp(p.steering,steer,Math.min(1,dt*5));p.heading=0;
    let front=this.closest(p.s+.01,p.offset,spec.width,null,false),gap=front?front.s-p.s-(front.length+spec.length)/2:1e5,stop=this.stopAt(p.s);if(p.auto){const box=this.signals.find(l=>l.yellowBox&&l.s-8>p.s&&l.s-p.s<120&&front&&front.s<l.s+25+spec.length&&front.speed<1.8);if(box&&(!stop||box.s-8-p.s<stop.gap))stop={gap:box.s-8-p.s,signal:box};}
    if(p.auto&&!gas&&!brake){const cameraNear=this.day?.cameras.some(c=>c.s-p.s>-5&&c.s-p.s<160);gas=p.speed<(cameraNear?10.4:(p.vehicle!=='bike'&&localRoute.highway(p.s)==='motorway'?25:11.2))?1:0;const distance=Math.min(gap,stop?stop.gap-spec.length/2:1e5);if(distance<Math.max(5,p.speed*p.speed/(7*this.weather.grip)+3)){gas=0;brake=1;}}
    const onMotorway=p.vehicle!=='bike'&&localRoute.highway(p.s)==='motorway',maximum=onMotorway?(p.vehicle==='bus'?22.2:27.8):spec.maxSpeed;
    const hillStation=p.vehicle==='bike'?this.route.data.schoolStop?.bikeS:this.route.data.schoolStop?.s;
    const slope=Math.abs(p.s-hillStation)<1800?localRoute.sample(p.s).pitch:0;
    const resistance=.25+p.speed*.026+9.81*Math.sin(slope);let accel=gas*spec.accel*this.weather.grip-brake*spec.brake*this.weather.grip-resistance;if(p.speed===0&&gas===0)accel=0;p.speed=clamp(p.speed+accel*dt,0,maximum);p.braking=!!brake;
    let newOffset=p.offset+steer*(p.vehicle==='bike'?2.8:p.vehicle==='bus'?1.45:2.25)*dt+windAt(this.day,this.totalTime,p.vehicle)*Math.min(1,p.speed/5)*dt;
    const edge=localRoute.width(p.s+p.speed*dt)/2-spec.width/2-.05;
    if(Math.abs(newOffset)>edge){newOffset=clamp(newOffset,-edge,edge);this.lastMessage='已到路緣，請回正方向';}
    const obstacle=this.nearby(p.s).find(c=>!this.isSeparate(p.s,p.vehicle,c.s,c.kind)
      && Math.abs(this.longitudinalGap(p.s,p.vehicle,c))<(spec.length+c.length)/2+.25
      && Math.abs(c.offset-newOffset)<(spec.width+c.width)/2+.12
      && Math.abs(c.offset-newOffset)<Math.abs(c.offset-p.offset));
    if(obstacle){const approaching=Math.abs(newOffset-obstacle.offset)<Math.abs(p.offset-obstacle.offset)-.002;newOffset=p.offset;if(approaching&&!p.auto&&this.totalTime-this.lastBump>3)this.recordContact('與車輛接觸，請保持間距');}
    p.offset=newOffset;front=this.closest(p.s+.01,p.offset,spec.width,null,false);gap=front?front.s-p.s-(front.length+spec.length)/2:1e5;
    let ds=p.speed*Math.cos(p.heading)*dt;const blockedBox=this.signals.find(s=>this.phase(s).blocked&&p.s>s.s&&p.s<s.s+20);if(blockedBox){ds=0;p.speed=0;}if(ds>gap-.25){ds=Math.max(0,gap-.25);if(p.speed>(front?.speed||0)+1.5&&this.totalTime-this.lastBump>3)this.recordContact('追近前車，請提早煞車');p.speed=Math.min(p.speed,front?.speed||0);}
    const oldS=p.s;p.s=Math.min(this.tripEndS,p.s+ds);
    if(this.court&&p.vehicle!=='bike'&&!p.courtComplete&&oldS<=this.route.data.schoolStop.s-7&&p.s>=this.route.data.schoolStop.s-7){
      p.courtDistance=0;p.offset=0;p.speed=Math.min(p.speed,3);p.world=this.court.sample(0);return;
    }
    for(const light of this.signals)if(oldS<light.s-8&&p.s>=light.s-8&&this.phase(light).state==='red'){p.red++;this.lastRed=this.totalTime;this.lastMessage='通過紅燈，請留意號誌';if(this.day&&light.camera){this.lastMessage=recordViolation(this.day,'red','闖紅燈照相',this.totalTime,3);this.flashAt=this.totalTime;}}
    if(this.day){
      for(const cam of this.day.cameras)if(oldS<cam.s&&p.s>=cam.s&&p.speed*3.6>cam.limit){this.lastMessage=recordViolation(this.day,'speed',`測速照相：${Math.round(p.speed*3.6)} / ${cam.limit} km/h`,this.totalTime,2);this.flashAt=this.totalTime;}
      const inBox=this.signals.find(l=>l.yellowBox&&p.s>l.s-2&&p.s<l.s+20);
      this.boxWait=inBox&&p.speed<.5?this.boxWait+dt:0;
      if(inBox&&this.boxWait>3&&!this.day.seen.has('box'+inBox.s)){this.day.seen.add('box'+inBox.s);this.lastMessage=recordViolation(this.day,'box','黃網線未淨空：路口內停等超過 3 秒',this.totalTime,2);this.flashAt=this.totalTime;}
    }
    this.updateFollowing(dt,front,gap,stop);
    this.updateRearPressure(dt,input);if(p.speed<.5)p.wait+=dt;if(p.vehicle==='bus'&&this.tripEndS<localRoute.length){if(!this.court&&p.s>=this.tripEndS-8&&p.speed<.5){p.done=true;p.speed=0;}else if(this.tripEndS-p.s<60)this.lastMessage='交通車停靠點：緩慢靠近，煞停後完成接送。';}else if(p.s>=localRoute.length-5){p.done=true;p.speed=0;}
  }
  recordContact(message){
    this.player.bumps++;
    this.lastBump=this.totalTime;
    this.lastMessage=message;
    this.emitFeedback('reaction','bump');
  }
  updateFollowing(dt,front,gap,stop){
    const p=this.player;
    const following=front?.clearAhead && p.speed>1.2 && (!stop || stop.gap>65);
    // Let a real lead car ease off for one short stretch on a rolled day.
    if(following && gap>2 && gap<40 && !front.slowUntil && this.time>=this.nextSlowAt){
      const car=this.cars.find(c=>c.id===front.id);
      if(car){
        car.slowSince=this.time;
        car.slowUntil=this.time+36;
        this.nextSlowAt=this.time+180+this.encounterRoll()*85;
      }
    }
    const slow=following && gap<25 && front.speed>1.4 && front.speed<5.6;
    if(!slow || front.id!==this.followedId) this.slowSeconds=0;
    this.followedId=slow ? front.id : null;
    if(slow && !this.commentedDrivers.has(front.id)){
      this.slowSeconds+=dt;
      if(this.slowSeconds>=5){
        this.emitFeedback('reaction','slow');
        this.commentedDrivers.add(front.id);
      }
    }
    const inQueue=front?.hasQueueAhead && gap<16 && front.speed<1.5 && p.speed<1.5;
    this.jamSeconds=inQueue ? this.jamSeconds+dt : 0;
    if(this.jamSeconds>=25 && this.totalTime-this.lastJamLine>=120){
      this.emitFeedback('reaction','jam');
      this.lastJamLine=this.totalTime;
    }
  }
  updateDay(){
    const d=this.day;if(!d)return;const p=this.player;if(earthquakeAt(d,this.totalTime)>0&&!d.seen.has('quake')){d.seen.add('quake');this.lastMessage='地震事件！車流正在減速，握穩方向並煞車。';d.log.push(this.lastMessage);}
    for(const e of d.parking){const key='parking'+e.s;if(!d.seen.has(key)&&e.s>p.s+8&&e.s<p.s+120){d.seen.add(key);const lane=this.route.lanes(e.s)-1;const van=this.addCar(e.s,lane,'car',0);van.parkedUntil=this.time+110;van.offset=this.route.width(e.s)/2-1;van.delivery=e.delivery;const bike=this.addCar(e.s+9,lane,'bike',0);bike.delivery=e.delivery;bike.parkedUntil=this.time+36;bike.offset=this.bikeRoute.width(bike.s)/2-.5;this.lastMessage=e.delivery+' 外送停靠、路邊違停，外側車道縮減。';this.emitFeedback('reaction','parking');d.log.push(this.lastMessage);}}
    for(const s of d.cutIns){const key='cutIn'+s;if(!d.seen.has(key)&&s>p.s&&s<p.s+45){d.seen.add(key);const bike=this.addCar(Math.max(s,p.s+18),Math.min(this.bikeRoute.lanes(s)-1,p.lane+1),'bike',Math.max(4,p.speed*.7));const edge=this.bikeRoute.width(bike.s)/2-.6;bike.offset=clamp(p.offset+2.4,-edge,edge);bike.cutInTarget=clamp(p.offset,-edge,edge);bike.cutInUntil=this.time+9;this.lastMessage='注意！右側機車突然切入，先放油門。';this.emitFeedback('reaction','cutin');d.log.push(this.lastMessage);}}
  }
  emitFeedback(type,kind,pan=0){this.feedback.push({id:++this.feedbackId,type,kind,pan,time:this.totalTime});if(this.feedback.length>24)this.feedback.shift();}
  updateRearPressure(dt,input){
    const p=this.player,light=this.signals.find(l=>l.s-p.s>-12&&l.s-p.s<70),lead=this.closest(p.s+.01,p.offset,VEHICLES[p.vehicle].width,null,false);
    const rear=this.nearby(p.s,32,0).find(c=>{
      if(c.kind!=='car'||this.isSeparate(p.s,p.vehicle,c.s,c.kind)||Math.abs(c.offset-p.offset)>=2) return false;
      const gap=this.longitudinalGap(p.s,p.vehicle,c);
      return gap < -3 && gap >= -32;
    });
    const openRoad=!lead||lead.s-p.s>18;
    this.greenIdle=light&&this.phase(light).state==='green'&&openRoad&&rear&&p.speed<.5&&!input.gas?this.greenIdle+dt:0;
    if(this.greenIdle>4&&this.totalTime-this.lastRear>9){
      this.lastRear=this.totalTime;
      this.rearPressureUntil=this.totalTime+4;
      rear.flashUntil=this.time+4;
      this.emitFeedback('horn','rear',clamp(rear.offset-p.offset,-1,1));
      this.emitFeedback('reaction','queue');
      this.lastMessage='綠燈了！後車正在閃大燈、按喇叭催促。';
    }
    if(this.day&&this.totalTime>this.nextAmbientHorn){this.nextAmbientHorn=this.totalTime+18+this.rng()*14;const nearby=this.nearby(p.s,35,50);if(nearby.some(c=>c.speed<2))this.emitFeedback('horn','ambient',this.rng()*1.6-.8);}
  }
  metrics(){let stopped=0;for(const c of this.cars)if(c.speed<1)stopped++;return{time:this.totalTime,waiting:this.player.wait,stopped,vehicles:this.cars.length,pending:this.pending.length,highwayQueue:Math.round(this.highwayQueue),diverted:this.diverted,progress:this.player.s/this.tripEndS};}
}
