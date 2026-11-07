import {seeded,clamp} from './geo.js';
import {GARAGE_EXTERIOR_END} from './neighborhood.js';

// These probabilities describe this game, never real-world incident rates.
export function rollDay(seed, route) {
  const random=seeded(seed),dice=Array.from({length:6},()=>1+Math.floor(random()*6));
  const city=route.data.eventRegions?.urbanStartS??(route.data.landmarks.find(p=>p.name==='慈雲路')?.s||2476);
  const cityEnd=Math.min(route.length-900,city+900);
  const at=(a,b)=>Math.round(clamp(a+random()*(b-a),60,route.length-80));
  const chapterRoll=1+Math.floor(random()*6),skyRandom=seeded(seed^0x9e3779b9),weatherRoll=skyRandom(),weather=weatherRoll<.56?'sunny':weatherRoll<.86?'rain':'typhoon';
  return {seed:seed>>>0,dice,scenario:dice[0]>=3?'incident':'normal',
    cameras:dice[1]>=2?[{s:at(170,420),limit:40},{s:at(city+80,city+320),limit:40}]:[],
    redCameras:dice[1]>=2,phaseShift:Math.floor(random()*86),
    parking:dice[2]>=3?[{s:at(city+90,city+210),delivery:'Uber Eats'},{s:at(city+510,city+660),delivery:'foodpanda'}]:[],
    cutIns:dice[3]>=2?[at(200,500),at(city+280,cityEnd)]:[],
    bridgeSignal:dice[4]>=4&&route.data.eventRegions?.bridgeSignalS!==null,bridgeSignalS:route.data.eventRegions?.bridgeSignalS??660,yellowBox:dice[5]>=3,
    chapter:route.data.allowLocalChapter===false?null:route.data.originLabel?(route.data.originLabel.startsWith('二重埔')?(chapterRoll<=3?'garage':null):(chapterRoll<=3?'sinkhole':null)):(chapterRoll<=2?'garage':chapterRoll<=4?'sinkhole':null),
    collapse:random()<.55,weather,quake:{enabled:skyRandom()<.18,at:65+skyRandom()*115,duration:12,power:.65},seen:new Set(),log:[],violations:[],points:0,
    chapterTime:0,spinTime:0,rescues:0};
}

export function dayLabels(day) {
  return [{sunny:'晴天',rain:'雨天',typhoon:'颱風天'}[day.weather],day.quake.enabled?'可能遇到地震':null,day.scenario==='incident'?'國道事故分流':'一般車潮',
    day.cameras.length?'測速與闖燈照相':null,day.parking.length?'違停／外送停靠':null,
    day.cutIns.length?'機車突然切入':null,day.bridgeSignal?'橋頭短綠長紅':null,
    day.yellowBox?'黃網線回堵':null,day.chapter==='garage'?'二重埔陡坡序章':day.chapter==='sinkhole'?'喜來登周邊天坑序章':null].filter(Boolean);
}

export function recordViolation(day,kind,label,time,points=1) {
  day.violations.push({kind,label,time,points});day.points+=points;
  return label+' · 通勤扣分 +'+points;
}

// Two deliberately fictional, geographically separate prologues. They never
// alter or claim to extend the surveyed Zhubei–Science Park route.
export class LocalChallenge {
  constructor(day,vehicle='car') {
    this.day=day;this.kind=day.chapter;this.vehicle=vehicle;
    this.player={s:0,offset:this.kind==='sinkhole'?1.3:0,speed:0,heading:0,steering:0,braking:false,auto:false};
    this.length=this.kind==='garage'?GARAGE_EXTERIOR_END:108;this.time=0;this.slip=0;this.spin=0;
    this.fall=0;this.recovered=false;this.done=false;this.message='';
  }
  height(s=this.player.s) {return this.kind==='garage'?clamp((s-15)/43,0,1)*15.5:0;}
  step(dt,input={}) {
    if(this.done)return;this.time+=dt;const p=this.player;
    if(this.fall){this.fall+=dt;p.speed=0;if(this.fall>5){this.fall=0;this.recovered=true;p.s=77;p.offset=-1.8;this.day.rescues++;this.time+=90;this.message='拖吊救援完成，通勤多花了 90 秒。';}return;}
    let gas=clamp(Number(input.gas)||0,0,1),brake=clamp(Number(input.brake)||0,0,1);
    let steer=clamp(Number(input.steer)||((input.right?1:0)-(input.left?1:0)),-1,1);
    if(p.auto&&!gas&&!brake){gas=this.kind==='garage'?.65:.62;steer=clamp(((this.kind==='sinkhole'?-1.9:0)-p.offset)*.7-p.heading*2,-1,1);}
    const slope=this.kind==='garage'&&p.s>15&&p.s<58;
    this.slip=slope&&gas>.78&&p.speed<4?clamp((gas-.7)/.3,0,1):0;
    if(this.slip>.2){this.spin+=dt;this.day.spinTime+=dt;}
    const grip=this.slip?clamp(.43+Math.max(0,this.spin-10)*.022,.43,.92):1;
    let acc=gas*(this.vehicle==='bike'?6.8:6.5)*grip-(slope?3.7:.3);
    if(brake>.1){const braking=brake*9*dt;p.speed=Math.sign(p.speed)*Math.max(0,Math.abs(p.speed)-braking);if(Math.abs(p.speed)<.15)p.speed=0;}
    else p.speed=clamp(p.speed+acc*dt,slope?-1.8:0,this.kind==='garage'&&p.s<60?2.8:9);
    p.steering=steer;p.braking=brake>.1;p.heading=0;
    p.offset=clamp(p.offset+steer*2.25*dt,-2.5,2.5);
    p.s=Math.max(0,p.s+p.speed*dt);
    if(this.kind==='sinkhole'&&this.day.collapse&&!this.recovered&&p.s>52&&p.s<62&&Math.abs(p.offset-1.3)<1.8){this.fall=.01;this.message='路面塌陷！正在等待拖吊救援…';}
    if(this.kind==='garage')this.message=this.slip>.2?'輪胎空轉！試著鬆到約六成油門，或繼續燒胎等待抓地。':slope?'陡坡上行 · 穩定油門，煞車可以防止倒退。':p.s>125?'已出社區：沿低樓層透天街廓接往中興路。':p.s>60?'二重埔集合住宅 · 經過社區大門，前方接老街屋。':'前方是社區地下室陡坡，準備控制油門。';
    else if(!this.recovered)this.message=p.s>35?(this.day.collapse?'右側路面塌陷，減速向左避開！':'路面暫時沒有塌陷，仍請減速通過。'):'道路下陷警示 · 保持左側，慢慢通過。';
    if(p.s>=this.length){this.done=true;this.day.chapterTime=this.time;}
  }
}
