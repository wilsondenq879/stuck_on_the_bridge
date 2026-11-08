import {loadHsr,RailView} from './hsr.js?v=099';
import {safeRoadStart} from './quick-start.js?v=0.9.3';
import {loadBlenderAssets,loadBlenderChapter} from './blender-assets.js?v=0.9.7';
import {BlenderRoads} from './blender-roads.js?v=0.9.8';
import {BlenderScenery} from './blender-scenery.js?v=hotel1';
import {WorldArchive} from './world-archive.js?v=hotel-trees2';
import {drawText,installGameText} from './game-text.js?v=0.8.2-puns';
import {Route,clamp,lerp} from './geo.js?v=0.9.8';
import {TrafficSimulation,VEHICLES} from './sim.js?v=0.9.8.1';
import {DrivingWorld} from './world.js?v=hotel1';
import {rollDay,dayLabels,LocalChallenge} from './day.js?v=0.8.0';
import {readGamepad,mergeControls} from './controls.js';
import {WEATHER,earthquakeAt} from './environment.js';
import {CommuteAudio} from './audio.js?v=0.9.7';
import {TouchDriveInput,bindTouchControls} from './touch-controls.js';

installGameText(document.body);

const $=id=>document.getElementById(id),keys=new Set(),touch=new TouchDriveInput();
const compactMedia=matchMedia('(any-pointer:coarse), (max-width:900px), (max-height:500px)');
let mobileControls;
let guanxinData=null;
const mobilePerformance=matchMedia('(any-pointer: coarse), (max-width: 700px)').matches;
let route,world,sim,data,day,terrainData,overpassData,lastFeedbackId=0,routeIndex=null,routeId='zhubei-tsmc',routeLoadToken=0,challenge=null,vehicle='car',scenario='normal';
let running=false,paused=false,ready=false,chase=false,timeScale=1,mapNear=false,last=0,hudTick=0,toastUntil=0,notice='';
let subtitleUntil=0, latestToast='';
let dragging=false,lookX=0,lookY=0,pointerX=0,pointerY=0,padState={buttons:[]},previousPad=[],padWasConnected=false,replayUsed=false;
const duration=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const currentPlayer=()=>challenge?.player||sim?.player;
function message(t,short=t){
 latestToast=compactMedia.matches?short:t;
 toastUntil=performance.now()+(compactMedia.matches?2600:4300);
 if(!subtitleUntil){
  $('toast').textContent=latestToast;
  $('toast').classList.add('show');
 }
}
function caption(text,kind,seconds){
 subtitleUntil=performance.now()+Math.max(1900,seconds*1000+250);
 $('rearWarning').hidden=true;
 $('toast').textContent=kind==='queue'?'後車「'+text+'」':text;
 $('toast').classList.add('show');
}
function updateToast(now){
 if(subtitleUntil){
  if(now<subtitleUntil) return;
  subtitleUntil=0;
  if(now<toastUntil) $('toast').textContent=latestToast;
 }
 if(now>=toastUntil) $('toast').classList.remove('show');
}
function clearInput(){mobileControls?.reset();touch.reset();keys.clear();dragging=false;}
function choice(){for(const btn of document.querySelectorAll('[data-vehicle]')){const on=btn.dataset.vehicle===vehicle;btn.classList.toggle('selected',on);btn.setAttribute('aria-pressed',String(on));}$('carModelChoices').hidden=vehicle!=='car';}
function applyCarModel(){if(world)world.carModel=$('carBrand').value+'_'+$('carBody').value;}
for(const id of ['carBrand','carBody'])$(id).addEventListener('change',applyCarModel);
function vehicleRouteNote(){
 return vehicle==='bus'?'大型交通車：關新路經國道一號、國道三號抵達糠橋水滴廣場，繞出後完成任務。':data?.direction==='return'?'回程從園區出發，經康橋、明湖路回關新路。':vehicle==='bike'?'白牌機車沿平面道路經康橋。':'去程行經國道一號、國道三號與茄苳交流道，經康橋再進園區。';
}
document.querySelectorAll('[data-vehicle]').forEach(b=>b.addEventListener('click',async()=>{
 vehicle=b.dataset.vehicle;choice();const bus=vehicle==='bus';
 for(const id of ['originChoice','destinationChoice','tripDirection'])$(id).disabled=bus;
 if(bus){$('originChoice').value='guanxin';$('tripDirection').value='outbound';}
 try{await loadRoute(selectedRoute());}catch(e){showError(e);}
}));
function toggleCamera(){chase=!chase;$('cameraBtn').textContent=chase?'車尾 ↔':'車內 ↔';$('touchCameraLabel').textContent=chase?'車尾':'車內';if(running)message(chase?'車尾跟拍視角':'車內視角 · 拖曳畫面察看左右');}
function toggleAuto(){if(!running||paused)return;const p=currentPlayer();p.auto=!p.auto;message(p.auto?'輔助跟車開啟 · 油門、煞車與轉向仍可介入':'回到手動油門',p.auto?'跟車已開啟':'手動油門');$('touchAuto').classList.toggle('selected',p.auto);$('touchAuto').setAttribute('aria-pressed',String(p.auto));}
function pause(){if(!running||paused)return;paused=true;clearInput();$('pauseDialog').showModal();audio.suspend();}
function resume(){if(!running)return;$('pauseDialog').close();paused=false;last=performance.now();audio.resume();}
function toMenu(){running=false;paused=false;challenge=null;clearInput();for(const id of['pauseDialog','resultDialog','dayDialog'])$(id).close();$('hud').hidden=true;$('menu').hidden=false;for(const id of['progressTrack','pauseBtn','cameraBtn'])$(id).hidden=true;document.body.classList.remove('playing');audio.suspend();$('start').disabled=false;$('start').firstElementChild.textContent='擲骰，發動今天';}
function freshSeed(){const replay=new URL(location.href).searchParams.get('replay');if(!replayUsed&&replay&&/^\d{1,10}$/.test(replay)){replayUsed=true;return Number(replay)>>>0;}return crypto.getRandomValues(new Uint32Array(1))[0];}

$('start').addEventListener('click',async()=>{
 if(!ready)return;subtitleUntil=0;audio.beginTrip();audio.resume();$('start').disabled=true;$('start').firstElementChild.textContent='正在發動…';
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 try{
  day=rollDay(freshSeed(),route);scenario=day.scenario;
  const choice=$('startPoint').value;const erchong=data.originLabel?.startsWith('二重埔');let startS=choice==='bridge'?(data.landmarks.find(x=>x.kind==='bridge')?.s||705)+20:choice==='city'?(erchong?(data.landmarks.find(x=>x.name==='關東橋')?.s||3000):(data.eventRegions?.urbanStartS||2476))+15:choice==='shops'?(data.retailLandmarks?.[0]?.s||3032)-180:choice==='park'?(data.elevatedRanges?.[0]?.startS||data.eventRegions?.parkEntryS||3779)-60:choice==='arrival'?Math.max(0,data.lengthMeters-650):0;
  if(choice==='skywalk'){
   const path=sim.pathFor(vehicle);
   const approach=path.nearest(-1418.70,2945.98).s-72;
   startS=safeRoadStart(approach,vehicle==='bike'?data.bikeIntersections:data.intersections,VEHICLES[vehicle].length);
  }
  if(choice==='hsr'&&world.hsr)startS=safeRoadStart(world.hsr.stations[vehicle]-113,vehicle==='bike'?data.bikeIntersections:data.intersections,VEHICLES[vehicle].length);
  if(choice==='guanxinPark'){const path=vehicle==='bike'?sim?.bikeRoute:route,area=data.landscapeAreas?.find(a=>a.osmId===134204596);if(area){const center=area.points.reduce((p,q)=>({x:p.x+q.x/area.points.length,z:p.z+q.z/area.points.length}),{x:0,z:0});startS=Math.max(0,path.nearest(center.x,center.z).s-18);}}
  if(choice==='guanxinGuangfu'){const path=vehicle==='bike'?sim?.bikeRoute:route;startS=Math.max(0,path.nearest(-810.72,3767.13).s-48);}
  if(choice==='jieshou'){const path=vehicle==='bike'?sim.bikeRoute:route;startS=Math.max(0,path.nearest(-499.45,3909.19).s-22);}
  if(choice==='restaurant'){const shop=data.restaurants?.[0];if(shop)startS=safeRoadStart(Math.max(0,(vehicle==='bike'?shop.bikeS:shop.s)-65),vehicle==='bike'?data.bikeIntersections:data.intersections,VEHICLES[vehicle].length);}
  const quick=data.quickStarts?.find(q=>q.value===choice);if(quick)startS=vehicle==='bike'?(quick.bikeS??quick.s):quick.s;
  sim=new TrafficSimulation(route,{vehicle,scenario,startS,day,seed:day.seed,warmupSteps:mobilePerformance?360:2400});sim.startS=startS;
  const spawn=sim.pathFor(vehicle).sample(startS,sim.player.offset);await Promise.all([world.blenderRoads.ensureNear(spawn.x,spawn.z),world.blenderScenery?.ensureNear(spawn.x,spawn.z)]);
  challenge=choice==='0'&&day.chapter?new LocalChallenge(day,vehicle):null;
  if(day.chapter&&!challenge)day.log.push('快速起點：本次略過地方序章。');
  world.makeCockpit(vehicle);world.configureDay(sim);if(challenge)world.makeChallenge(challenge,await loadBlenderChapter(challenge));
  running=true;paused=false;lookX=lookY=0;notice='';lastFeedbackId=0;timeScale=Number($('timeScale').value);clearInput();
  $('menu').hidden=true;for(const id of['hud','pauseBtn','cameraBtn','progressTrack'])$(id).hidden=false;
  $('vehicleName').textContent=VEHICLES[vehicle].label;$('scenarioTag').textContent=WEATHER[day.weather].name+' · '+(scenario==='incident'?'事故日':'通勤日');
  $('touchAuto').classList.remove('selected');$('touchAuto').setAttribute('aria-pressed','false');document.body.classList.add('playing');last=performance.now();updateHUD();world.draw(sim,0,{chase,challenge});audio.resume();
  message('今日六骰 '+day.dice.map(x=>'⚀⚁⚂⚃⚄⚅'[x-1]).join(' ')+' · '+(challenge?'先完成地方序章，再接回所選通勤路線':'今天遇到什麼，已由骰子決定'),challenge?'今日出發：地方序章':'已出發 · 點地圖可看今日路況');
 }catch(e){showError(e);}
});
$('pauseBtn').addEventListener('click',pause);$('resume').addEventListener('click',resume);$('restart').addEventListener('click',toMenu);$('again').addEventListener('click',toMenu);
$('touchAuto').addEventListener('click',toggleAuto);$('cameraBtn').addEventListener('click',toggleCamera);
$('touchCamera').addEventListener('click',toggleCamera);
$('mobilePause').addEventListener('click',pause);
$('mapToggle').addEventListener('click',()=>{mapNear=!mapNear;$('mapToggle').textContent=mapNear?'附近':'全程';drawMap();});
$('timeScale').addEventListener('change',()=>timeScale=Number($('timeScale').value));
let dialogResume=false;
// Reuse the live map and incident card in the mobile sheet, then return them to the desktop HUD.
const movablePanels=['mapPanel','incidentNote'].map(id=>{const node=$(id),mark=document.createComment(id);node.before(mark);return {node,mark};});
function mountTraffic(open){for(const {node,mark} of movablePanels){if(open)$('trafficPanels').append(node);else mark.after(node);}for(const id of ['mobileDetails','mobileEvent'])$(id).setAttribute('aria-expanded',String(open));}
function openTraffic(){if(!running||paused)return;mountTraffic(true);openInfo('trafficDialog');updateHUD();}
function openInfo(id){dialogResume=running&&!paused;if(dialogResume){paused=true;clearInput();audio.suspend();}$(id).showModal();}
function closeInfo(id){$(id).close();if(id==='trafficDialog')mountTraffic(false);if(dialogResume){paused=false;last=performance.now();audio.resume();}dialogResume=false;}
$('mobileDetails').addEventListener('click',openTraffic);$('mobileEvent').addEventListener('click',openTraffic);
for(const id of ['closeTraffic','trafficResume'])$(id).addEventListener('click',()=>closeInfo('trafficDialog'));
$('detailDice').addEventListener('click',()=>{closeInfo('trafficDialog');$('dayBadge').click();});
$('info').addEventListener('click',()=>openInfo('infoDialog'));$('closeInfo').addEventListener('click',()=>closeInfo('infoDialog'));
$('dayBadge').addEventListener('click',()=>{if(!day)return;$('diceResult').textContent=day.dice.map(x=>'⚀⚁⚂⚃⚄⚅'[x-1]).join(' ');$('dayList').textContent=dayLabels(day).join(' · ');$('violationList').textContent=day.violations.length?day.violations.map(x=>x.label+' +'+x.points).join('／'):'目前沒有照相取締或黃網線停等扣分。';$('seedLabel').textContent=`骰子編號 ${day.seed} · 所有機率與取締點位都是遊戲設定。`;const u=new URL(location.href);u.searchParams.set('replay',day.seed);u.searchParams.set('route',routeId);$('replayLink').href=u.href;openInfo('dayDialog');});
$('closeDay').addEventListener('click',()=>closeInfo('dayDialog'));
for(const id of['infoDialog','dayDialog','trafficDialog'])$(id).addEventListener('cancel',e=>{e.preventDefault();closeInfo(id);});
$('pauseDialog').addEventListener('cancel',e=>{e.preventDefault();resume();});$('resultDialog').addEventListener('cancel',e=>e.preventDefault());

window.addEventListener('keydown',e=>{
 if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||!running)return;
 if(e.code==='KeyP'||e.code==='Escape'){if(e.repeat||$('infoDialog').open||$('dayDialog').open||$('trafficDialog').open||$('resultDialog').open)return;paused?resume():pause();e.preventDefault();return;}
 if(paused)return;keys.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(!e.repeat&&e.code==='KeyC')toggleAuto();if(!e.repeat&&e.code==='KeyV')toggleCamera();if(!e.repeat&&e.code==='KeyH')honk();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(running&&!paused&&!sim?.player.done)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)pause();});
mobileControls=bindTouchControls($('touchControls'),touch,{canDrive:()=>running&&!paused});
$('scene').addEventListener('pointerdown',e=>{if(!running||paused)return;dragging=true;pointerX=e.clientX;pointerY=e.clientY;$('scene').setPointerCapture(e.pointerId);});
$('scene').addEventListener('pointermove',e=>{if(!dragging)return;lookX=clamp(lookX-(e.clientX-pointerX)*.003,-1.35,1.35);lookY=clamp(lookY-(e.clientY-pointerY)*.002,-.34,.3);pointerX=e.clientX;pointerY=e.clientY;});
for(const type of['pointerup','pointercancel'])$('scene').addEventListener(type,()=>dragging=false);
function pollPad(){
 let pads=[];try{pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean);}catch{}
 padState=readGamepad(pads.find(p=>p.mapping==='standard')||pads[0]);
 if(padWasConnected&&!padState.connected&&running&&!paused){pause();message('手把已斷線，通勤已暫停。');}
 if(padState.connected&&!padWasConnected)message('手把已連接 · RT 油門、LT 煞車、Y 視角、X 跟車');
 padWasConnected=padState.connected;
 $('padStatus').textContent=padState.connected?'手把已連接 · RT 油門 / LT 煞車 / Y 視角':padState.unsupported?'手把未提供標準配置，請使用觸控或鍵盤':'手把：配對後回到遊戲按任一鍵';
 const edge=i=>padState.buttons[i]&&!previousPad[i];
 if(edge(0)){if(!running&&ready)$('start').click();else if($('trafficDialog').open)closeInfo('trafficDialog');else if($('dayDialog').open)closeInfo('dayDialog');else if($('infoDialog').open)closeInfo('infoDialog');else if($('resultDialog').open)toMenu();else if(paused)resume();}
 if(edge(9)||edge(1)){if($('trafficDialog').open)closeInfo('trafficDialog');else if(running&&!$('dayDialog').open&&!$('infoDialog').open&&!$('resultDialog').open)paused?resume():pause();}
 if(!paused&&running){if(edge(2))toggleAuto();if(edge(3))toggleCamera();if(edge(5))honk();}
 previousPad=padState.buttons;
}
function controls(){return mergeControls({gas:keys.has('KeyW')||keys.has('ArrowUp')?(keys.has('ShiftLeft')||keys.has('ShiftRight')?.65:1):0,brake:keys.has('KeyS')||keys.has('ArrowDown')||keys.has('Space')?1:0,left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight')},touch,padState);}

const audio=new CommuteAudio(caption);
function honk(){if(!running||paused)return;audio.horn({bus:vehicle==='bus'});message('叭—');}
$('hornBtn').addEventListener('click',honk);
$('touchHorn').addEventListener('click',honk);
function toggleSound(){if(!audio.ctx)audio.resume();audio.toggle();for(const id of ['sound','masterSoundBtn'])$(id).textContent=`聲音 ${audio.enabled?'開':'關'}`;if(paused)audio.suspend();}
$('sound').addEventListener('click',toggleSound);$('masterSoundBtn').addEventListener('click',toggleSound);
$('bgmBtn').addEventListener('click',()=>{audio.bgm=!audio.bgm;$('bgmBtn').textContent=`BGM ${audio.bgm?'開':'關'}`;});
$('rageBtn').addEventListener('click',()=>{audio.setVoice(!audio.voice);$('rageBtn').textContent=`怒罵 ${audio.voice?'開':'關'}`;});

function drawMap(){
 if(!sim||!world||(compactMedia.matches&&running&&!$('trafficDialog').open))return;const canvas=$('map'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
 if(challenge){ctx.fillStyle='#244944';ctx.fillRect(w*.4,30,w*.2,h-60);ctx.setLineDash([8,9]);ctx.strokeStyle='#b7c3a1';ctx.beginPath();ctx.moveTo(w/2,30);ctx.lineTo(w/2,h-30);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#f0dba0';ctx.beginPath();ctx.arc(w/2+challenge.player.offset*10,h-30-(h-60)*challenge.player.s/challenge.length,8,0,Math.PI*2);ctx.fill();ctx.font='20px sans-serif';ctx.fillStyle='#dce5cc';drawText(ctx,'獨立虛構序章',18,30);ctx.font='16px sans-serif';drawText(ctx,'完成後接回所選通勤路線',18,h-10);return;}
 const path=vehicle==='bike'?world.bikeRoute:route,p=sim.player.world||path.sample(sim.player.s,sim.player.offset),points=vehicle==='bus'?path.points.filter(p=>p.s<=sim.tripEndS):path.points;
 const xs=points.map(p=>p.x),zs=points.map(p=>p.z);let minX=Math.min(...xs)-140,maxX=Math.max(...xs)+140,minZ=Math.min(...zs)-120,maxZ=Math.max(...zs)+120;
 if(mapNear){minX=p.x-450;maxX=p.x+450;minZ=p.z-460;maxZ=p.z+340;}
 const scale=Math.min((w-40)/(maxX-minX),(h-26)/(maxZ-minZ)),cx=w/2-(minX+maxX)/2*scale,cy=h/2-(minZ+maxZ)/2*scale,project=p=>[cx+p.x*scale,cy+p.z*scale];
 const line=(ps,color,width)=>{ctx.beginPath();ps.forEach((q,i)=>i?ctx.lineTo(...project(q)):ctx.moveTo(...project(q)));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();};
 for(const water of data.waterAreas||[]){ctx.beginPath();water.points.forEach((q,i)=>i?ctx.lineTo(...project(q)):ctx.moveTo(...project(q)));ctx.fillStyle='#325d61';ctx.fill();}
 for(const road of data.surroundingRoads||[])line(road.points,'#42605d',mapNear?2:1);
 if(sim.court&&vehicle!=='bike')line(sim.court.points,'#d5b873',3);
 line(points,'#849d8b',5);line(points.filter(v=>v.s<=sim.player.s),'#d8d4a0',5);
 for(const car of sim.cars){if(car.speed>2)continue;const q=car.world||(car.kind==='bike'?world.bikeRoute:route).sample(car.s,car.offset),[x,y]=project(q);ctx.fillStyle=scenario==='incident'?'#e4aa71':'#d2b789';ctx.fillRect(x-1.7,y-1.7,3.4,3.4);}
 ctx.font='17px "PingFang TC",sans-serif';ctx.fillStyle='#d5e2d1';if(!mapNear)for(const m of data.landmarks.filter(m=>vehicle!=='bus'||m.s<=sim.tripEndS+10).filter((m,i,a)=>i===0||i===a.length-1||(m.s-a[i-1].s>850))){const[x,y]=project(route.sample(m.s));drawText(ctx,data.mapLabels?.[m.kind]??(m.kind==='start'?(data.originLabel?.startsWith('二重埔')?'二重埔':'竹北'):m.kind==='finish'?(data.destinationLabel?.includes('聯發科')?'聯發科':'台積12A'):m.name),x+12,clamp(y+4,19,h-9));}
 const[x,y]=project(p);ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(p.tz,p.tx)+Math.PI/2);ctx.fillStyle='#f3eed0';ctx.strokeStyle='#193438';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();ctx.font='15px sans-serif';ctx.fillStyle='#9ab7aa';drawText(ctx,'N ↑',w-45,22);
}

function updateHUD(){
 const p=currentPlayer(),m=sim.metrics(),localRoute=vehicle==='bike'?world.bikeRoute:route,current=localRoute.sample(sim.player.s);
 const name=challenge?(challenge.kind==='garage'?(p.s<60?'二重埔・社區地下室':p.s<125?'二重埔・集合住宅社區':'二重埔・透天街廓'):'喜來登周邊・天坑支線'):p.courtDistance!=null?(p.unloaded?'水滴廣場・出口':'水滴廣場・接送'):current.road;
 $('weatherLine').textContent=earthquakeAt(day,sim.totalTime)>0?'地震事件 · 握穩、減速':WEATHER[day?.weather||'sunny'].name+(day?.weather==='typhoon'?' · 強側風 / 濕滑路面':day?.weather==='rain'?' · 雨刷自動 / 煞車距離加長':' · 真實地形遠山');$('rearWarning').hidden=!!subtitleUntil||!(sim.rearPressureUntil>sim.totalTime);$('roadLabel').textContent=name;$('segment').textContent=name;$('speed').textContent=Math.round(Math.abs(p.speed)*3.6);
 $('travelled').textContent=((sim.player.s-(sim.startS||0))/1000).toFixed(2);$('waiting').textContent=duration(sim.player.wait);
 const end=vehicle==='bus'?sim.tripEndS:localRoute.length;
 $('distance').textContent=challenge?Math.max(0,Math.round(challenge.length-p.s))+' m':((p.courtDistance!=null?sim.court.length-p.courtDistance:Math.max(0,end-p.s))/1000).toFixed(2)+' km';
 $('autoState').textContent=(p.auto?'輔助跟車 開':'手動油門')+(timeScale>1?` · ${timeScale}×`:'');$('progressFill').style.width=(challenge?p.s/challenge.length:sim.player.s/end)*100+'%';
 const minutes=(data.direction==='return'?16*60+40:7*60+45)+(sim.totalTime+(challenge?.time||day?.chapterTime||0))/60;$('clock').textContent=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(Math.floor(minutes%60)).padStart(2,'0')}`;
 $('dayBadge').textContent=`⚄ ${day?.dice.join(' · ')||''}　扣分 ${day?.points||0}`;
 $('incidentNote').hidden=!challenge&&scenario!=='incident';
 if(challenge){$('signalNote').hidden=true;$('nextLabel').textContent='擲骰觸發的虛構序章 · 完成後接回主線';$('incidentTitle').textContent=challenge.kind==='garage'?(p.s<60?'穩定油門，爬出地下室':'開出集合住宅，接往中興路'):'減速，留意右側路面';$('incidentDetail').textContent=challenge.message;$('highwayQueue').textContent=Math.floor(challenge.time);$('diverted').textContent=Math.floor(challenge.spin);document.querySelector('.incident-meter').hidden=true;document.querySelector('#incidentNote small').textContent=challenge.kind==='garage'?(p.s<60?'Shift+W 六成油門 / 手機油門下滑 / RT 輕壓':'集合住宅外觀參考 / 坡道及配置為遊戲重建'):'獨立虛構場景，非飯店事故重現';}
 else{
  document.querySelector('.incident-meter').hidden=false;document.querySelector('#incidentNote small').textContent='事故、流量與號誌時制為遊戲參數';
  const next=sim.signals.find(s=>s.s>p.s+4);
  if(next&&next.s-p.s<400){const phase=sim.phase(next);$('signalNote').hidden=false;$('signalLight').style.background=['green','blocked'].includes(phase.state)?'#a5d9b0':phase.state==='yellow'?'#f0c77a':'#f08f78';$('signalText').textContent=`${Math.round(next.s-p.s)} m · ${phase.blocked?'綠燈但路口未清空':phase.state==='green'?'綠燈':phase.state==='yellow'?'黃燈':'紅燈'} ${phase.remaining}s`;$('nextLabel').textContent=next.name;}
  else{$('signalNote').hidden=true;const mark=data.landmarks.find(l=>l.s>p.s+30);$('nextLabel').textContent=mark?`前往 ${mark.name}`:`前往 ${data.destinationLabel}`;}
  if(scenario==='incident'){$('incidentTitle').textContent=sim.incidentState().label;$('highwayQueue').textContent=m.highwayQueue;$('diverted').textContent=m.diverted;$('incidentDetail').textContent=`通勤路線 ${m.stopped} 輛停等；市區入口 ${m.pending} 輛待進入`;}
 }
 const quake=earthquakeAt(day,sim.totalTime)>0;
 if(p.courtDistance!=null){
  $('signalNote').hidden=true;
  $('nextLabel').textContent=p.unloaded?'沿單行車道返回柴喬路':'水滴廣場停靠，接送後繞出';
 }
 const schoolNear=!challenge&&sim.schoolQueue&&Math.abs(p.s-(vehicle==='bike'?data.schoolStop.bikeS:data.schoolStop.s))<380;
 const restaurantNear=!challenge&&(sim.restaurantQueues||[]).find(q=>Math.abs(p.s-(vehicle==='bike'?q.shop.bikeS:q.shop.s))<180);
 const chip=quake?'地震 · 減速':restaurantNear?'麥當勞 · '+restaurantNear.waiting+' 輛排隊':schoolNear?'糠橋接送車隊 · 緩慢通過':challenge?.kind==='garage'?(p.s<60?'陡坡 · 輕油門':'社區出口'):challenge?.kind==='sinkhole'?'留意路面':scenario==='incident'?sim.incidentState().label:day.weather==='typhoon'?'強風 · 路滑':'';
 $('mobileEvent').hidden=!chip;$('mobileEventText').textContent=chip;
 if($('trafficDialog').open){$('detailRoute').textContent=name+' → '+data.destinationLabel;$('detailDistance').textContent=$('travelled').textContent+' km';$('detailWait').textContent=duration(p.wait||0);$('detailPoints').textContent=day.points;$('detailContext').textContent=$('weatherLine').textContent+' · '+$('autoState').textContent;}
 const newNotice=challenge?.fall?challenge.message:sim.lastMessage;if(newNotice&&newNotice!==notice){notice=newNotice;message(notice);}
 $('cameraFlash').classList.toggle('flash',sim.totalTime-sim.flashAt<.22);
 for(const f of sim.feedback){
  if(f.id<=lastFeedbackId)continue;
  lastFeedbackId=f.id;
  if(f.type==='horn') audio.horn({external:true,pan:f.pan});
  else audio.react(f.kind);
 }
 world.updateDial(Math.abs(p.speed)*3.6,p.auto,p.speed<0?'R':'D');drawMap();
}
function finish(){
 paused=true;clearInput();audio.suspend();$('resultTitle').textContent='到了，'+((vehicle==='bus'?'糠橋交通車接送點':data.destinationLabel)||'竹科')+'。';$('resultSubtitle').textContent=`${VEHICLES[vehicle].label} · 骰子 #${day.seed} · ${((sim.player.s-(sim.startS||0))/1000).toFixed(2)} km`;
 const items=[['通勤時間',duration(sim.totalTime+day.chapterTime)],['停等時間',duration(sim.player.wait)],['車輛接觸',sim.player.bumps],['取締扣分',day.points],['空轉秒數',Math.round(day.spinTime)],['拖吊次數',day.rescues]];
 $('results').replaceChildren(...items.map(([label,value])=>{const div=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;div.append(small,strong);return div;}));
 $('resultEvents').textContent=dayLabels(day).join(' · ')+(sim.startS>0&&day.chapter?'（快速起點：略過序章）':'')+(day.violations.length?'／'+day.violations.map(v=>v.label).join('、'):'');$('returnTrip').hidden=vehicle==='bus'||!(data.sceneryProfile==='south-hsinchu'&&data.direction==='outbound');$('resultDialog').showModal();
}
let lastMobileFrame=0;
function frame(t){
 requestAnimationFrame(frame);if(!world||!sim)return;if(mobilePerformance&&t-lastMobileFrame<33)return;lastMobileFrame=t;let dt=Math.min((t-last)/1000||0,.08);last=t;if(document.hidden)return;pollPad();
 if(running&&!paused){const input=controls();let remaining=dt*timeScale;while(remaining>0){const step=Math.min(remaining,1/40);if(challenge){challenge.step(step,input);if(challenge.done){const follow=challenge.player.auto;challenge=null;sim.player.auto=follow;message('序章完成，從'+data.originLabel+'前往'+data.destinationLabel+'。');}}else sim.step(step,input);remaining-=step;}if(sim.player.done)finish();}
 else if(!running)sim.stepTraffic(Math.min(dt,.04),false);
 if(!dragging){lookX=lerp(lookX,padState.lookX?-padState.lookX:keys.has('KeyQ')?.8:keys.has('KeyE')?-.8:0,Math.min(1,dt*4));lookY=lerp(lookY,-(padState.lookY||0)*.3,Math.min(1,dt*3));}
 world.hsr?.update(sim,running&&!challenge);
 world.draw(sim,dt,{menu:!running,look:lookX,pitch:lookY,chase:!running||chase,challenge});
 hudTick+=dt;if(hudTick>.12){hudTick=0;if(running)updateHUD();if(running&&!paused)audio.update(currentPlayer(),sim,challenge,controls());}updateToast(t);
}
function showError(e){console.error(e);$('errorText').textContent=`無法載入 3D 原型：${e.message}。請使用支援 WebGL 2 的瀏覽器並開啟硬體加速。`;$('error').hidden=false;}
async function loadRoute(id){
 const token=++routeLoadToken;ready=false;$('start').disabled=true;$('start').firstElementChild.textContent='正在建構實際路線…';
 const entry=routeIndex.routes.find(r=>r.id===id);if(!entry)throw new Error('找不到路線');
 const response=await fetch('data/routes/'+entry.file+'?v=0.9.3');if(!response.ok)throw new Error('路線資料讀取失敗');const next=await response.json();if(token!==routeLoadToken)return;
 if(next.sceneryProfile==='south-hsinchu'){
  guanxinData??=await fetch('data/guanxin.json?v=0.8.1').then(r=>{if(!r.ok)throw new Error('關新街廓讀取失敗');return r.json();});
  next.guanxinBuildings=guanxinData.buildings;
 }
 if(token!==routeLoadToken)return;
 if(mobilePerformance&&world){world.dispose();world=null;}
 const assets=await loadBlenderAssets(),nextRoute=new Route(next),initial=nextRoute.sample(entry.originKey==='zhubei'?760:280);let roads,scenery,rail;
 try{const archive=await WorldArchive.create(id);roads=await BlenderRoads.create(archive,nextRoute);scenery=await BlenderScenery.create(archive,roads.texture);[rail]=await Promise.all([entry.originKey==='erchong'?loadHsr():null,roads.ensureNear(initial.x,initial.z),scenery.ensureNear(initial.x,initial.z)]);}catch(e){scenery?.dispose();roads?.dispose();throw e;}if(token!==routeLoadToken){if(rail)scenery.destroy(rail);scenery.dispose();roads.dispose();return;}
 world?.dispose();data=next;routeId=id;route=nextRoute;sim=new TrafficSimulation(route,{vehicle,startS:entry.originKey==='zhubei'?760:280,warmupSteps:mobilePerformance?360:2400});world=new DrivingWorld($('scene'),route,sim.signals,terrainData,(data.sceneryProfile==='south-hsinchu'||data.opposingAlignment)?null:overpassData,assets,roads,scenery);if(rail){world.hsr=new RailView(rail,route,world.bikeRoute);world.scene.add(world.hsr.root);world.hsr.root.visible=false;}applyCarModel();world.makeCockpit(vehicle);
 $('originChoice').value=entry.originKey;
 const destinations=routeIndex.routes.filter(r=>r.originKey===entry.originKey && r.direction!=='return');
 $('destinationChoice').replaceChildren(...destinations.map(r=>new Option(r.destinationLabel,r.destinationKey)));
 $('destinationChoice').value=entry.destinationKey;
 $('directionRow').hidden=vehicle==='bus'||entry.originKey!=='guanxin';$('destinationChoice').closest('label').hidden=vehicle==='bus';$('tripDirection').value=entry.direction??'outbound';
 $('routeVehicleNote').hidden=entry.originKey!=='guanxin';$('routeVehicleNote').textContent=vehicleRouteNote();
 const options=[['0',data.sceneryProfile==='south-hsinchu'?(data.direction==='return'?'完整回程 · 經康橋、明湖路':'完整去程 · 經康橋再進園區'):'完整通勤 · 含隨機序章']];if(entry.originKey==='zhubei')options.push(['bridge','經國大橋 · 略過序章'],['city','慈雲路 · 略過序章'],['shops','Costco／迪卡儂 · 略過序章']);else if(entry.originKey==='erchong')options.push(['city','關東橋／光復路 · 略過序章']);options.push(['park','園區入口 · 略過序章'],['arrival','公司前 650 m · 略過序章']);
 if(data.quickStarts)options.splice(1,options.length-1,...data.quickStarts.filter(q=>vehicle!=='bus'||q.s<data.schoolStop.s).map(q=>[q.value,q.label]));if(entry.originKey==='guanxin'){options.splice(1,0,['guanxinPark','關新公園・遊戲場旁']);if(data.direction!=='return')options.splice(1,0,['yiji','壹集・關薪路社區旁'],['guanxinGuangfu','關新路・往光復路'],['jieshou','介壽路・園區入口牌樓']);}if(entry.originKey==='erchong')options.splice(1,0,['hsr','糕鐵過橋・東科路口前']);if(data.restaurants?.length)options.splice(1,0,['restaurant','麥當勞・得來速車龍旁']);if(vehicle==='bus')options[0][1]='完整交通車任務・關新路 → 糠橋';
 if(entry.originKey==='decathlon')options[0][1]='完整通勤 · 迪卡儂到喜來登';
 if(entry.originKey==='zhubei')options.splice(1,0,['skywalk','慈雲路・商圈空橋前']);
 $('startPoint').replaceChildren(...options.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;}));
 const quickLink=new URLSearchParams(location.search).get('start');
 if(['hsr','skywalk','hotel'].includes(quickLink)&&options.some(([value])=>value===quickLink))$('startPoint').value=quickLink;
 $('routeSummary').textContent=vehicle==='bus'?'關新路 → 國道一號・國道三號 → 糠橋水滴廣場':entry.originKey==='guanxin'?(data.direction==='return'?data.originLabel+' → 康橋 → 明湖路 → 關新路':'關新路 → '+(vehicle==='bike'?'寶山平面道路':'國道一號・國道三號')+' → 康橋 → '+data.destinationLabel):data.routeSummary||entry.routeSummary||(entry.originKey==='zhubei'?'經國大橋 → 慈雲路':'中興路四段 → 光復路')+' → '+entry.destinationLabel;
 $('routeDescription').textContent=data.originLabel+' → '+data.landmarks.filter(x=>x.s>0&&x.s<data.lengthMeters-50).map(x=>x.name).join(' → ')+' → '+data.destinationLabel+'。汽車 '+(data.lengthMeters/1000).toFixed(2)+' km；機車 '+(data.bikeLengthMeters/1000).toFixed(2)+' km。';
 $('routeDestination').textContent=vehicle==='bus'?'駛入水滴廣場停靠兩秒，繞回柴喬路完成接送。':data.sceneryProfile==='south-hsinchu'?(data.direction==='return'?'經康橋校外接送點、明湖路回關新路。':'經康橋校外接送點後，前往'+data.destinationLabel+'。'):data.destination.address+'；終點位於廠區外的公共道路接入點，非警衛門實測。'+(entry.destinationKey==='tsmc'?'12廠選用12A／總部。':'');
 if(entry.destinationKey==='sheraton')$('routeDestination').textContent=data.destination.address+'。沿自強南路北上，左轉光明六路東一段，抵達飯店前方公共道路。';
 $('start').disabled=false;$('start').firstElementChild.textContent='擲骰，發動今天';ready=true;last=performance.now();
}
function selectedRoute(){
 const origin=$('originChoice').value;
 const available=routeIndex.routes.filter(r=>r.originKey===origin && r.direction!=='return');
 const dest=available.find(r=>r.destinationKey===$('destinationChoice').value)?.destinationKey ?? available[0].destinationKey;
 return origin==='guanxin'&&$('tripDirection').value==='return'?dest+'-guanxin':origin+'-'+dest;
}
for(const id of ['originChoice','destinationChoice','tripDirection'])$(id).addEventListener('change',()=>loadRoute(selectedRoute()).catch(showError));
$('returnTrip').addEventListener('click',async()=>{
 const dest=$('destinationChoice').value;toMenu();
 try{await loadRoute(dest+'-guanxin');$('startPoint').value='0';}catch(e){showError(e);}
});
try{[routeIndex,terrainData,overpassData]=await Promise.all([fetch('data/routes/index.json?v=hotel1').then(r=>r.json()),fetch('data/terrain.json').then(r=>r.json()),fetch('data/overpasses.json?v=0.8.0').then(r=>r.json())]);const requested=new URL(location.href).searchParams.get('route');await loadRoute(routeIndex.routes.some(r=>r.id===requested)?requested:routeIndex.defaultRouteId);requestAnimationFrame(frame);}catch(e){showError(e);}
