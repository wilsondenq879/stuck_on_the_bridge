import {makeRestaurants} from './restaurant-world.js?v=0.9.3';
import {visibleRestaurantActors,alignInterchange} from './restaurant-queues.js?v=0.9.3';
import {makeBusParts} from './bus-world.js?v=0.9.3';
import {drawText} from './game-text.js?v=0.8.2-puns';
import {onGuanxin} from './guanxin-world.js?v=0.9.3';
import * as THREE from './vendor/three.module.js';
import {Route,clamp,lerp,seeded,steeredYaw} from './geo.js?v=0.8.0';
import {buildInterchange,interchangeRoads} from './interchange.js';
import {alignmentAt,appendRibbon,bikeBranches,ribbonRuns,roadFrames,routeFrames,RoadClearance} from './road-geometry.js';
import {WEATHER,earthquakeAt,geographicPoint,intrudesRoad,rectangleFootprint} from './environment.js';
import {EnvironmentWorld} from './environment-world.js?v=0.8.2-puns';
import {isErchong,streetDistrict,mappedBuildingStyle} from './neighborhood.js';
import {makeSouthHsinchu} from './south-hsinchu-world.js?v=0.9.3';
import {makeErchongStreets,makeCommunityExit} from './neighborhood-world.js?v=0.8.2-puns';

const COLORS=[0xd7d9d7,0x384f56,0x8b969b,0x202d35,0xb3aa91,0x7c4c43,0xe0e3dc];
const Y=new THREE.Vector3(0,1,0);
function mesh(g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);return o;}
function box(w,h,d,mat,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

class TrafficBatch {
 constructor(scene,kind,count=180){this.kind=kind;this.count=count;this.parts=[];this.dummy=new THREE.Object3D();const body=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.43,metalness:.3}),glass=new THREE.MeshStandardMaterial({color:0x385157,roughness:.26,metalness:.65}),rubber=new THREE.MeshStandardMaterial({color:0x152025,roughness:.93}),chrome=new THREE.MeshStandardMaterial({color:0xb9c4c2,metalness:.6,roughness:.3}),red=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x710705,emissiveIntensity:.8}),white=new THREE.MeshStandardMaterial({color:0xf1e4b8,emissive:0xa39b6e,emissiveIntensity:.25});
 const part=(g,mat,pos,scale=[1,1,1],rot=[0,0,0],color=false)=>{const im=new THREE.InstancedMesh(g,mat,count);im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.castShadow=true;im.frustumCulled=false;scene.add(im);this.parts.push({im,pos,scale,rot,color});};
 if(kind==='bus'){makeBusParts(part,{body,glass,rubber,chrome,red,white});}else if(kind==='car'){
 part(new THREE.BoxGeometry(1,1,1),body,[0,.62,0],[1.8,.63,4.4],[0,0,0],true);
 part(new THREE.BoxGeometry(1,1,1),glass,[0,1.13,.05],[1.57,.59,2.25]);
 part(new THREE.BoxGeometry(1,1,1),body,[0,1.47,.12],[1.61,.095,2.22],[0,0,0],true);
 part(new THREE.BoxGeometry(1,1,1),chrome,[0,.34,2.18],[1.6,.10,.12]);
 for(const x of[-.73,.73]){part(new THREE.BoxGeometry(.38,.15,.07),red,[x,.76,2.23],[1,1,1],[0,0,0],'brake');part(new THREE.BoxGeometry(.42,.14,.07),white,[x,.76,-2.23],[1,1,1],[0,0,0],'headlight');}
 for(const x of[-.91,.91])for(const z of[-1.34,1.33])part(new THREE.CylinderGeometry(.34,.34,.19,10),rubber,[x,.36,z],[1,1,1],[0,0,Math.PI/2]);
 part(new THREE.PlaneGeometry(.43,.19),new THREE.MeshBasicMaterial({color:0xe2e5dd}),[0,.57,2.237]);
 }else{
 part(new THREE.BoxGeometry(.5,.64,1.35),body,[0,.63,0],[1,1,1],[0,0,0],true);
 part(new THREE.BoxGeometry(.55,.72,.48),body,[0,1.32,.1],[1,1,1],[.11,0,0],true);
 part(new THREE.SphereGeometry(.23,10,8),chrome,[0,1.92,.03]);
 part(new THREE.BoxGeometry(.38,.11,.28),glass,[0,1.94,-.15]);
 for(const z of[-.68,.65])part(new THREE.CylinderGeometry(.26,.26,.14,10),rubber,[0,.28,z],[1,1,1],[0,0,Math.PI/2]);
 part(new THREE.BoxGeometry(.55,.52,.52),body,[0,1.1,.65],[1,1,1],[0,0,0],'delivery');
 part(new THREE.BoxGeometry(.18,.12,.05),red,[0,.8,.72],[1,1,1],[0,0,0],'brake');
 }
 }
 update(cars,route){const tmp=this.dummy;for(const part of this.parts){part.im.count=Math.min(cars.length,this.count);for(let i=0;i<part.im.count;i++){const c=cars[i],p=c.world||route.sample(c.s,c.offset),yaw=p.yaw+(c.reverse?Math.PI:0);tmp.position.set(p.x,p.y,p.z);tmp.rotation.set(p.pitch||0,yaw,0,'YXZ');tmp.scale.set(1,1,1);tmp.updateMatrix();const base=tmp.matrix.clone();tmp.position.set(...part.pos);tmp.rotation.set(...part.rot);tmp.scale.set(...part.scale);if(part.color==='delivery'&&!c.delivery)tmp.scale.set(0,0,0);tmp.updateMatrix();tmp.matrix.premultiply(base);part.im.setMatrixAt(i,tmp.matrix);if(part.color)part.im.setColorAt(i,new THREE.Color(part.color==='brake'?(c.braking?0xff3827:0x7b2421):part.color==='headlight'?(c.flashing?0xffffff:0x66828a):(c.paint||(c.delivery?(c.delivery==='foodpanda'?0xdf397e:0x39a774):COLORS[c.color%COLORS.length]))));}part.im.instanceMatrix.needsUpdate=true;if(part.im.instanceColor)part.im.instanceColor.needsUpdate=true;}}
}

export class DrivingWorld {
 constructor(container,route,signals,terrain=null,overpasses=null){this.container=container;this.route=route;this.bikeRoute=route.data.bikePoints?new Route({...route.data,points:route.data.bikePoints,lengthMeters:route.data.bikePoints.at(-1).s}):route;this.signalModels=[];this.lookYaw=0;this.lookPitch=0;this.lastMirror=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.lowPower=matchMedia('(any-pointer: coarse), (max-width: 700px)').matches;this.rng=seeded(12);
 this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xc7d4d2);this.scene.fog=new THREE.FogExp2(0xc7d4d2,.00128);
 this.renderer=new THREE.WebGLRenderer({antialias:!this.lowPower,powerPreference:this.lowPower?'low-power':'high-performance',logarithmicDepthBuffer:true});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.lowPower?1:1.6));this.renderer.shadowMap.enabled=!this.lowPower;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','新竹通勤雙視角三維駕駛畫面');
 this.camera=new THREE.PerspectiveCamera(66,1,.055,50000);this.rig=new THREE.Group();this.rig.add(this.camera);this.scene.add(this.rig);
 this.hemi=new THREE.HemisphereLight(0xcfe5ef,0x7c8269,2.1);this.scene.add(this.hemi);this.sun=new THREE.DirectionalLight(0xffe9b9,3.0);this.sun.castShadow=true;this.sun.shadow.mapSize.set(window.innerWidth<700?1024:2048,window.innerWidth<700?1024:2048);Object.assign(this.sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:400});this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.04;this.scene.add(this.sun,this.sun.target);
 this.mats={road:new THREE.MeshStandardMaterial({color:0x465051,roughness:.96}),side:new THREE.MeshStandardMaterial({color:0x979f93,roughness:.92}),median:new THREE.MeshStandardMaterial({color:0xc4c4ae,roughness:.9}),paint:new THREE.MeshStandardMaterial({color:0xe1e0cb,roughness:.8}),yellow:new THREE.MeshStandardMaterial({color:0xdbb755,roughness:.85}),metal:new THREE.MeshStandardMaterial({color:0x737d76,roughness:.65,metalness:.3}),leaf:new THREE.MeshStandardMaterial({color:0x62785b,roughness:.9}),trunk:new THREE.MeshStandardMaterial({color:0x77705c,roughness:1})};
 this.branches=bikeBranches(route,this.bikeRoute);
 this.interchange=overpasses;
 this.prepareRoadClearance();
 this.makeTerrain();this.makeRoad();this.makeBuildings();makeErchongStreets(this);makeSouthHsinchu(this);this.makeRetail();makeRestaurants(this);this.makeFurniture();this.makeSignals(signals);this.carBatch=new TrafficBatch(this.scene,'car',160);this.bikeBatch=new TrafficBatch(this.scene,'bike',90);this.busBatch=new TrafficBatch(this.scene,'bus',45);this.playerCars=new TrafficBatch(this.scene,'car',1);this.playerBikes=new TrafficBatch(this.scene,'bike',1);this.playerBuses=new TrafficBatch(this.scene,'bus',1);this.makeCockpit('car');this.challengeOrigin=new THREE.Vector3(-90000,0,-90000);this.environment=new EnvironmentWorld(this,terrain);if(overpasses)this.makeOverpasses(overpasses);
 this.rearTarget=new THREE.WebGLRenderTarget(320,100);this.rearCamera=new THREE.PerspectiveCamera(60,3.2,.1,800);this.mirrorMat.map=this.rearTarget.texture;
 this.resize();this.resizeHandler=()=>this.resize();window.addEventListener('resize',this.resizeHandler);if(typeof ResizeObserver!=='undefined'){this.sizeObserver=new ResizeObserver(this.resizeHandler);this.sizeObserver.observe(container);}
 }
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h||w===this.viewWidth&&h===this.viewHeight)return;this.viewWidth=w;this.viewHeight=h;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.fov=w/h<1?79:66;this.camera.updateProjectionMatrix();this.layoutCockpit();}
 layoutCockpit(){const compact=matchMedia('(any-pointer:coarse), (max-width:900px), (max-height:500px)').matches;if(this.dialFace)this.dialFace.visible=!compact;if(!this.dashboardGroup||!this.carMirror)return;const a=this.camera.aspect,portrait=a<1&&compact;const bus=this.kind==='bus';this.dashboardGroup.position.y=(bus?1.12:0)+(portrait?(bus?-.38:-.20):0);this.carMirror.position.set(portrait?(bus?-.54+.12*a:-.36+.46*a):-.22,(bus?1.12:0)+(portrait?1.68:1.59),(bus?-3.2:0)+(portrait?-1:-.85));this.carMirror.scale.setScalar(portrait?Math.min(.7,.84*a):1);}
 roadMesh(vertices,material,name,shadow=false){
   if(!vertices.length)return;
   const geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
   const m=mesh(geo,material);m.name=name;m.receiveShadow=true;m.castShadow=shadow;this.scene.add(m);return m;
 }
 opposingAt(s){
   const path=this.route,width=this.opposingWidth(s);
   const base=path.sample(s,-path.width(s)/2-this.medianWidth(s)-width/2);
   base.width=width;
   const local=this.restaurantOpposing;const exactLocal=local?.length?alignmentAt(local,s):null;
   if(exactLocal)return {...base,...exactLocal};
   const points=this.northbound;
   if(!points?.length)return base;
   const exact=alignmentAt(points,s);
   if(exact)return {...base,...exact};
   // Fade back to the ordinary opposite carriageway beyond the mapped approaches.
   const end=s<points[0].southboundS?points[0]:points.at(-1),dist=Math.abs(s-end.southboundS);
   if(dist>=70)return base;
   const at=end.southboundS,w=this.opposingWidth(at),original=path.sample(at,-path.width(at)/2-this.medianWidth(at)-w/2);
   const t=1-dist/70,blend=t*t*(3-2*t);
   base.x+=(end.x-original.x)*blend;base.z+=(end.z-original.z)*blend;
   base.width=lerp(width,end.width??(end.lanes||2)*3.35,blend);
   return base;
 }
 prepareRoadClearance(){
   this.interchange=alignInterchange(this.interchange,this.route.data.routePrefixMeters||0);
   this.northbound=isErchong(this.route)?null:this.interchange?.northboundAlignment?.points;
   const viaduct=this.interchange?.parkViaduct;
   this.crossingViaduct=isErchong(this.route)&&viaduct ? new Route(viaduct) : null;
   const local=[];
   if(this.route.data.direction!=='return')for(const shop of this.route.data.restaurants||[])for(const p of shop.northboundRoad){
     const n=this.route.nearest(p.x,p.z);if(n.d<35&&n.s>.1&&n.s<this.route.length-.1)local.push({x:p.x,z:p.z,y:0,southboundS:n.s,lanes:shop.id==='ziqiang'?3:2,width:(shop.id==='ziqiang'?3:2)*3.35});
   }
   this.restaurantOpposing=local.sort((a,b)=>a.southboundS-b.southboundS);
   this.carFrames=routeFrames(this.route);
   const stations=new Set(this.carFrames.map(p=>p.s));
   for(const p of this.northbound??[]) if(p.southboundS>=0 && p.southboundS<=this.route.length)stations.add(p.southboundS);
   for(const p of this.restaurantOpposing)stations.add(p.southboundS);
   this.opposingFrames=[...stations].sort((a,b)=>a-b).map(s=>this.opposingAt(s));
   this.clearance=new RoadClearance();
   for(const shop of this.route.data.restaurants||[])this.clearance.add(roadFrames(shop.queuePath.map(p=>({...p,y:0}))),-1.65,1.65,'restaurant:'+shop.id);
   const half=p=>this.route.width(p.s)/2;
   this.clearance.add(this.carFrames,p=>-half(p),half,'car');
   this.clearance.add(this.opposingFrames,p=>-p.width/2,p=>p.width/2,'opposing');
   for(const r of this.branches){
     const frames=routeFrames(this.bikeRoute,r.bikeStartS,r.bikeEndS),edge=p=>this.bikeRoute.width(p.s)/2;
     this.clearance.add(frames,p=>-edge(p),edge,'bike');
   }
   for(const road of interchangeRoads(this.interchange)){
     this.clearance.add(roadFrames(road.points),-road.width/2,road.width/2,'ramp:'+road.osmWayId);
   }
   if(this.crossingViaduct){
     const path=this.crossingViaduct,range=path.data.elevatedRanges[0];
     this.clearance.add(routeFrames(path,range.startS,range.endS),p=>-path.width(p.s)/2-.3-3.35,p=>path.width(p.s)/2,'viaduct');
   }
 }
 roadLine(points,width,mat,y=.0){if(points.length<2)return;const positions=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],len=Math.hypot(b.x-a.x,b.z-a.z)||1,rx=-(b.z-a.z)/len*width/2,rz=(b.x-a.x)/len*width/2;const q=[[a.x-rx,y,a.z-rz],[a.x+rx,y,a.z+rz],[b.x-rx,y,b.z-rz],[b.x+rx,y,b.z+rz]];for(const j of[0,1,2,2,1,3])positions.push(...q[j]);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const m=mesh(g,mat);m.receiveShadow=true;this.scene.add(m);}
 makeTerrain(){const center=this.route.sample(this.route.length/2);const ground=box(11000,3,11000,new THREE.MeshStandardMaterial({color:0x929c80,roughness:1}),center.x,-1.6,center.z);ground.receiveShadow=true;this.scene.add(ground);
 for(const water of(this.route.data.waterAreas||[])){const points=water.points||water;if(!Array.isArray(points)||points.length<3)continue;const shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));const m=mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:0x739c9f,roughness:.26,metalness:.25,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=.025;this.scene.add(m);}
 const built=new Set([...interchangeRoads(this.interchange),...(this.route.data.segments??[]),...(this.route.data.bikeSegments??[])].map(r=>r.osmWayId));
 for(const id of this.crossingViaduct?.data.sourceWayIds??[])built.add(id);
 if(this.northbound)for(const id of this.interchange.renderOwnership?.skipDuplicateContextWayIds??[])built.add(id);
 for(const road of(this.route.data.surroundingRoads||[])){if(this.route.data.sceneryProfile==='south-hsinchu'&&road.highway==='motorway'&&!road.bridge){this.roadLine(road.points,3.35*(Number(road.lanes)||3),this.mats.road,-.05);continue;}if(built.has(road.osmWayId)||road.bridge||(road.distance<7&&!road.name?.includes('機車')))continue;const w=road.highway?.includes('trunk')?12:['secondary','primary'].includes(road.highway)?9:5.5;this.roadLine(road.points,w,this.mats.road,-.05);}
 // A distant skyline gives depth while the street footprints stay tied to OSM.
 }
 makeRoad(){
 const car=this.carFrames,half=p=>this.route.width(p.s)/2;
 const asphalt=[],walk=[],paint=[],yellow=[],median=[];
 appendRibbon(asphalt,car,p=>-half(p),half,.06);
 const highwayRuns=ribbonRuns(car,(a,b)=>this.route.highway(a.s).startsWith('motorway'));
 for(const run of highwayRuns)appendRibbon(asphalt,run,half,p=>half(p)+1.1,.06);
 const motorwayRails=[];
 for(const side of [-1,1]){
   const edge=p=>side>0?half(p)+.96:-half(p)-.28;
   const safe=p=>this.clearance.free(p.x+p.rx*edge(p),p.z+p.rz*edge(p),.19,p.y+.08,p.y+.91);
   const runs=ribbonRuns(car,(a,b)=>this.route.highway(a.s).startsWith('motorway')&&safe(a)&&safe(b));
   for(const run of runs)appendRibbon(motorwayRails,run,p=>edge(p)-.15,p=>edge(p)+.15,.9,.84);
 }
 this.roadMesh(motorwayRails,this.mats.median,'國道混凝土護欄',true);
 appendRibbon(asphalt,this.opposingFrames,p=>-p.width/2,p=>p.width/2,.055);
 const medianRuns=ribbonRuns(car,(a,b)=>(!onGuanxin(this.route,a.s)||!(this.route.data.intersections??[]).some(i=>Math.abs(i.s-(a.s+b.s)/2)<17))&&!this.inOpening(a.s,b.s,'southbound','left'));
 for(const run of medianRuns)appendRibbon(median,run,p=>-half(p)-this.medianWidth(p.s),p=>-half(p),.18,.12);
 const insideCurb=ribbonRuns(car,(a,b)=>!onGuanxin(this.route,a.s)&&!this.route.highway(a.s).startsWith('motorway')&&!this.branches.some(r=>b.s>=r.carStartS-5&&a.s<=r.carEndS+5)
   && !this.inOpening(a.s,b.s,'southbound','right'));
 for(const run of insideCurb)appendRibbon(walk,run,half,p=>half(p)+2.4,.15,.1);
 for(const run of ribbonRuns(car,(a,b)=>!this.inOpening(a.s,b.s,'southbound','right')))
   appendRibbon(paint,run,p=>half(p)-.18,p=>half(p)-.06,.083);
 for(const run of medianRuns)appendRibbon(yellow,run,p=>-half(p)+.06,p=>-half(p)+.18,.084);
 for(const r of this.branches){
   const frames=routeFrames(this.bikeRoute,r.bikeStartS,r.bikeEndS),edge=p=>this.bikeRoute.width(p.s)/2;
   appendRibbon(asphalt,frames,p=>-edge(p),edge,.075);
   appendRibbon(paint,frames,p=>edge(p)-.16,p=>edge(p)-.04,.094);
   const outerCurb=ribbonRuns(frames,(a,b)=>[a,b].every(p=>{
     const offset=edge(p)+.8;
     return this.clearance.free(p.x+p.rx*offset,p.z+p.rz*offset,.77,p.y+.06,p.y+.16);
   }));
   for(const run of outerCurb)appendRibbon(walk,run,edge,p=>edge(p)+1.6,.15,.07);
 }
 this.roadMesh(asphalt,this.mats.road,'通勤路面');this.roadMesh(walk,this.mats.side,'人行道');
 this.roadMesh(median,this.mats.median,'分隔島');this.roadMesh(paint,this.mats.paint,'白色邊線');
 this.roadMesh(yellow,this.mats.yellow,'黃色邊線');
 const dashes=[];for(let s=0;s<this.route.length;s+=12){const n=this.route.lanes(s);for(let k=1;k<n;k++)dashes.push({s,offset:(k-n/2)*3.35,w:.12,h:.015,d:4});}
 this.instances(new THREE.BoxGeometry(1,1,1),this.mats.paint,dashes.map(v=>{const p=this.route.sample(v.s,v.offset);return{p:[p.x,p.y+.09,p.z],scale:[v.w,v.h,v.d],yaw:p.yaw};}));
 for(const span of this.route.spans)this.makeBridge(span);
 if(this.crossingViaduct){
   const path=this.crossingViaduct,range=path.data.elevatedRanges[0];
   const rows=routeFrames(path,range.startS,range.endS),surface=[],divider=[];
   appendRibbon(surface,rows,p=>-path.width(p.s)/2-.3-3.35,p=>path.width(p.s)/2,.06);
   appendRibbon(divider,rows,p=>-path.width(p.s)/2-.28,p=>-path.width(p.s)/2-.04,.084);
   this.roadMesh(surface,this.mats.road,'光復路上方園區高架鋪面');
   this.roadMesh(divider,this.mats.yellow,'園區高架中心線');
   for(const span of path.spans)this.makeBridge(span,path);
 }
 }
 inOpening(a,b,carriageway,side){
   if(isErchong(this.route))return false;
   return this.interchange?.guardrailOpenings?.some(o=>o.carriageway===carriageway && o.side===side && b>=o.fromS && a<=o.toS)??false;
 }
 makeBridge(span,path=this.route){
   const frames=routeFrames(path,span.from,span.to);
   const mappedOpposite=path===this.route&&this.northbound?.some(p=>p.southboundS>=span.from && p.southboundS<=span.to);
   const onFlyover=(path.data.elevatedRanges??[]).some(r=>Math.abs(r.bridgeStartS-span.from)<1);
   const left=p=>-path.width(p.s)/2-(onFlyover?.3:this.medianWidth(p.s))-(mappedOpposite?0:(onFlyover?3.35:this.opposingWidth(p.s))+.45);
   const right=p=>path.width(p.s)/2+(onFlyover?.56:2.4);
   const shell=[],barriers=[],piers=[],depth=1.0;
   const addDeck=(rows,l,r,carriageway)=>{
     appendRibbon(shell,rows,l,r,.033,depth);
     for(const [index,edge]of [[-1,l],[1,r]]){
       const side=(index>0)===(carriageway==='southbound')?'right':'left';
       const runs=ribbonRuns(rows,(a,b)=>Math.min(a.y,b.y)>.16 && !this.inOpening(a.s,b.s,carriageway,side));
       for(const run of runs)appendRibbon(barriers,run,
         p=>edge(p)-(index>0?.33:0),p=>edge(p)+(index<0?.33:0),.85,.82);
     }
     let next=span.from+38;
     for(const p of rows){
       if(p.s<next||p.y<4.9)continue;
       const offset=(l(p)+r(p))/2,x=p.x+p.rx*offset,z=p.z+p.rz*offset,h=p.y+.033-depth;
       if(!this.clearance.free(x,z,1.55,-.1,h))continue;
       piers.push({p:[x,(h-.1)/2,z],scale:[2.35,h+.1,1.8],yaw:p.yaw});next=p.s+52;
     }
   };
   addDeck(frames,left,right,'southbound');
   if(mappedOpposite){
     const rows=this.opposingFrames.filter(p=>p.s>span.from&&p.s<span.to);
     rows.unshift(this.opposingAt(span.from));rows.push(this.opposingAt(span.to));
     addDeck(rows,p=>-p.width/2-.35,p=>p.width/2+.35,'northbound');
   }
   this.roadMesh(shell,this.mats.side,'實體橋板與橋底',true);
   this.roadMesh(barriers,this.mats.median,'橋側護欄',true);
   this.instances(new THREE.BoxGeometry(1,1,1),this.mats.side,piers);
 }
 instances(geo,mat,items){if(!items.length)return;const im=new THREE.InstancedMesh(geo,mat,items.length),o=new THREE.Object3D();for(let i=0;i<items.length;i++){const v=items[i];o.position.set(...v.p);o.scale.set(...(v.scale||[1,1,1]));o.rotation.set(0,v.yaw||0,0);o.updateMatrix();im.setMatrixAt(i,o.matrix);if(v.color)im.setColorAt(i,new THREE.Color(v.color));}im.castShadow=true;im.receiveShadow=true;this.scene.add(im);return im;}
 makeBuildings(){if(this.route.data.sceneryProfile==='south-hsinchu')return;const win=texture(256,512,(c,w,h)=>{c.fillStyle='#c2c6bd';c.fillRect(0,0,w,h);for(let y=12;y<h;y+=48)for(let x=10;x<w;x+=42){c.fillStyle=this.rng()>.5?'#758e93':'#536c75';c.fillRect(x,y,25,31);c.fillStyle='#d3d5c8';c.fillRect(x+12,y,2,31);c.fillStyle='#e2dfc9';c.fillRect(x,y+33,27,3);}});win.wrapS=win.wrapT=THREE.RepeatWrapping;win.anisotropy=4;
 const facade=new THREE.MeshStandardMaterial({map:win,color:0xe3e1d3,roughness:.8});const roof=new THREE.MeshStandardMaterial({color:0x949f98,roughness:1});
 this.clearanceRemoved=0;const palette=[0xd7c5a7,0xb4c4cb,0xcbbaa9,0x839f98,0xa98974,0xe2dfd2,0xb8ac9b,0x8fa1b2];for(const b of this.route.data.buildings||[]){if((this.route.data.restaurants||[]).some(s=>s.osmWayId===b.osmWayId)||!b.points?.length)continue;if(intrudesRoad(b.points,[this.route,this.bikeRoute],3)){this.clearanceRemoved++;continue;}const shape=new THREE.Shape();b.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));const spec=mappedBuildingStyle(this.route,b);if(spec.hidden)continue;const h=spec.height;const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/12,uv.getY(i)/32);uv.needsUpdate=true;const skin=facade.clone();skin.color.setHex(palette[b.osmWayId%palette.length]);const top=roof.clone();top.color.setHex(palette[(b.osmWayId+3)%palette.length]);const m=mesh(g,[top,skin]);m.castShadow=true;m.receiveShadow=true;this.scene.add(m);}
 // Procedural facade massing only fills un-mapped distant blocks.
 const blocks=[];for(let s=0;s<this.route.length;s+=60){const p=this.route.sample(s);if(p.bridge||streetDistrict(this.route,s)!=='other')continue;for(const side of[-1,1]){let o=side*(42+this.rng()*34),q=this.route.sample(s,o);let nearby=(this.route.data.buildings||[]).some(b=>b.points?.some(v=>Math.hypot(v.x-q.x,v.z-q.z)<24));if(nearby)continue;let h=s<700?25+this.rng()*50:10+this.rng()*25;const bw=15+this.rng()*15,bd=15+this.rng()*16;if(intrudesRoad(rectangleFootprint(q.x,q.z,bw,bd,q.yaw),[this.route,this.bikeRoute],5))continue;blocks.push({p:[q.x,h/2,q.z],scale:[bw,h,bd],yaw:q.yaw,color:palette[Math.floor(this.rng()*palette.length)]});}}
 this.instances(new THREE.BoxGeometry(1,1,1),facade,blocks);
 }
 makeFurniture(){
   const poles=[],lamps=[],trunks=[],crowns=[];
   for(let s=20;s<this.route.length;s+=42){
     if(this.route.highway(s).startsWith('motorway')||onGuanxin(this.route,s))continue;
     const half=this.route.width(s)/2,height=this.route.height(s);
     const elevated=height>.15;
     const p=this.clearance.roadside(this.route,s,half+(elevated?.48:1.6),.10,8.9,elevated?0:22);
     if(p){
       poles.push({p:[p.x,p.y+4.4,p.z],scale:[.11,8.8,.11]});
       lamps.push({p:[p.x-p.rx*1.5,p.y+8.8,p.z-p.rz*1.5],scale:[3.2,.12,.18],yaw:p.yaw});
     }
     const treeS=s+12;
     if(this.route.data.sceneryProfile==='south-hsinchu'&&Math.abs(treeS-this.route.data.schoolStop.s)<185)continue;
     if(this.route.height(treeS)>.08||this.route.sample(treeS).bridge||
       (isErchong(this.route)&&streetDistrict(this.route,treeS)!=='other'))continue;
     for(const offset of [this.route.width(treeS)/2+3.2,-this.route.width(treeS)*1.5-4]){
       const t=this.clearance.roadside(this.route,treeS,offset,2.7,8.9);
       if(!t)continue;
       trunks.push({p:[t.x,t.y+1.8,t.z],scale:[.42,3.6,.42]});
       crowns.push({p:[t.x,t.y+5.3,t.z],scale:[2.7,3.6,2.7],color:this.rng()>.5?0x5e7c55:0x7c8e65});
     }
   }
   const batches=[
     ['路燈立桿',new THREE.BoxGeometry(1,1,1),this.mats.metal,poles],
     ['路燈燈臂',new THREE.BoxGeometry(1,1,1),this.mats.metal,lamps],
     ['行道樹樹幹',new THREE.CylinderGeometry(.5,.5,1,6),this.mats.trunk,trunks],
     ['行道樹樹冠',new THREE.IcosahedronGeometry(1,1),this.mats.leaf,crowns],
   ];
   for(const [name,geometry,material,placements] of batches){
     const group=this.instances(geometry,material,placements);
     if(group)group.name=name;
   }
 const marks=this.route.data.landmarks||[];for(let i=1;i<marks.length;i++){const m=marks[i];this.makeSign(Math.max(40,m.s-140),m.name.replace('竹科・','').replace('（新安路口前）',''),i===marks.length-1?'HSINCHU SCIENCE PARK':m.kind==='bridge'?'JINGGUO BRIDGE':'SCIENCE PARK');}
 if(this.route.data.sceneryProfile!=='south-hsinchu')this.makeSign(120,this.route.data.originLabel?.startsWith('二重埔')?'竹科　光復路':'竹科　經國大橋','HSINCHU SCIENCE PARK');
 }
 makeSign(s,title,sub){const p=this.clearance.roadside(this.route,s,this.route.width(s)/2+.65,.12,6.5,this.route.height(s)>.2?0:22);if(!p)return;const group=new THREE.Group();group.position.set(p.x,p.y,p.z);group.rotation.y=p.yaw;group.add(box(.16,6.5,.16,this.mats.metal,0,3.25,0));group.add(box(6.0,.13,.13,this.mats.metal,-2.8,6.4,0));const signTex=texture(1024,300,(c,w,h)=>{c.fillStyle='#285f50';c.fillRect(0,0,w,h);c.strokeStyle='#e6eadc';c.lineWidth=7;c.strokeRect(14,14,w-28,h-28);c.fillStyle='#f5f4e7';c.font='bold 69px "PingFang TC",sans-serif';drawText(c,title,42,113,860);c.font='30px sans-serif';drawText(c,sub,45,174);c.font='54px sans-serif';drawText(c,'↑',920,190);c.font='28px sans-serif';drawText(c,this.route.data.direction==='return'?'往關新路':'往竹科',48,250);});const m=new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide});const plate=mesh(new THREE.PlaneGeometry(6.2,1.82),m,-2.6,5.65,.03);group.add(plate);this.scene.add(group);}
 makeOverpasses(data){
   const concrete=new THREE.MeshStandardMaterial({color:0xb0b5ab,roughness:.9});
   const {decks,asphalt,rails,paint}=buildInterchange(data,this.clearance);
   this.roadMesh(decks,concrete,'台68連續橋板與匝道',true);
   this.roadMesh(asphalt,this.mats.road,'台68鋪面與匯入口');
   this.roadMesh(rails,concrete,'台68匝道護欄',true);
   this.roadMesh(paint,this.mats.paint,'台68邊線');
   const piers=[];
   for(const road of interchangeRoads(data))for(const p of road.piers??[]){
     const h=p.y+.032-road.deckDepth;
     if(h>1.3 && this.clearance.free(p.x,p.z,1.42,-.1,h)){
       piers.push({p:[p.x,(h-.1)/2,p.z],scale:[1.95,h+.1,1.95]});
     }
   }
   this.instances(new THREE.BoxGeometry(1,1,1),concrete,piers);
   if(!isErchong(this.route))this.makeSign(1390,'台68竹科交流道','RAMP ABOVE / EXPRESSWAY BELOW');
 }
 dispose(){this.sizeObserver?.disconnect();window.removeEventListener('resize',this.resizeHandler);const geometries=new Set(),materials=new Set(),textures=new Set();this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(o.material?(Array.isArray(o.material)?o.material:[o.material]):[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const m of materials)m.dispose();this.rearTarget.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
 opposingWidth(s){return (this.route.data.elevatedRanges||[]).some(e=>s>=e.startS&&s<=e.endS)?3.35:this.route.width(s);}
 medianWidth(s){if(onGuanxin(this.route,s))return 2.6;return (this.route.data.elevatedRanges||[]).some(e=>s>=e.startS&&s<=e.endS)?.3:1.5;}
 makeRetail(){const dest=this.route.data.destination;if(dest){const b=this.route.data.buildings.find(x=>x.osmWayId===dest.osmBuildingId);if(b){const center=b.points.reduce((a,p)=>({x:a.x+p.x/b.points.length,z:a.z+p.z/b.points.length}),{x:0,z:0}),road=this.route.sample(this.route.length),dir=new THREE.Vector3(road.x-center.x,0,road.z-center.z).normalize(),front=Math.max(...b.points.map(p=>(p.x-center.x)*dir.x+(p.z-center.z)*dir.z))+1;const g=new THREE.Group();g.position.set(center.x+dir.x*front,8,center.z+dir.z*front);g.rotation.y=Math.atan2(dir.x,dir.z);const t=texture(1024,220,(c,w,h)=>{c.fillStyle='#edece2';c.fillRect(0,0,w,h);c.fillStyle=dest.name.includes('聯發科')?'#9e6227':'#a73329';c.textAlign='center';c.font='bold 83px "PingFang TC",sans-serif';drawText(c,dest.name.includes('聯發科')?'MediaTek　聯發科':'TSMC　台積電 12A',w/2,100,970);c.fillStyle='#385052';c.font='34px "PingFang TC",sans-serif';drawText(c,'公司外側公共道路抵達點',w/2,173);});g.add(mesh(new THREE.PlaneGeometry(25,5.3),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide})));this.scene.add(g);}}
 for(const shop of this.route.data.retailLandmarks||[]){
   const near=this.route.sample(shop.s-20),dir=new THREE.Vector3(near.x-shop.x,0,near.z-shop.z).normalize(),group=new THREE.Group();
   const front=Math.max(...shop.footprint.map(q=>(q.x-shop.x)*dir.x+(q.z-shop.z)*dir.z))+1;group.position.set(shop.x+dir.x*front,0,shop.z+dir.z*front);group.rotation.y=Math.atan2(dir.x,dir.z);
   const costco=shop.brand==='Costco',tex=texture(1024,260,(c,w,h)=>{c.fillStyle=costco?'#f4f2e8':'#0867b4';c.fillRect(0,0,w,h);c.fillStyle=costco?'#d42528':'#ffffff';c.font='italic bold 115px Arial';c.textAlign='center';drawText(c,costco?'COSTCO':'DECATHLON',w/2,130,950);c.font='46px "PingFang TC",sans-serif';c.fillStyle=costco?'#195184':'#ffffff';drawText(c,shop.name,w/2,215);});
   group.add(box(24,5.8,1.4,new THREE.MeshStandardMaterial({color:costco?0xd2d4cd:0x0867b4}),0,11,-.8));group.add(mesh(new THREE.PlaneGeometry(23,5.5),new THREE.MeshBasicMaterial({map:tex}),0,11,0));
   group.add(box(34,1.2,8,this.mats.median,0,3,-4));for(const x of[-14,14])group.add(box(.5,6,.5,this.mats.metal,x,3,-2));this.scene.add(group);
 }}
 disposeGroup(group){if(!group)return;this.scene.remove(group);const kept=new Set(Object.values(this.mats));group.traverse(o=>{o.geometry?.dispose();for(const m of (o.material?(Array.isArray(o.material)?o.material:[o.material]):[])){if(!kept.has(m)){m.map?.dispose();m.dispose();}}});}
 configureDay(sim){
   for(const model of this.signalModels)this.disposeGroup(model.group);this.signalModels=[];
   const path=sim.player.vehicle==='bike'?this.bikeRoute:this.route;this.makeSignals(sim.signals,path);
   this.disposeGroup(this.dayGroup);this.dayGroup=new THREE.Group();this.scene.add(this.dayGroup);
   if(!sim.day)return;
   const poleMat=new THREE.MeshStandardMaterial({color:0xd2cbb7,roughness:.7});
   for(const cam of sim.day.cameras){const p=this.clearance.roadside(path,cam.s,path.width(cam.s)/2+1.6,.36,4.2,path.height(cam.s)>.2?0:22);if(!p)continue;const g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=p.yaw;
     g.add(box(.18,4,.18,this.mats.metal,0,2,0));g.add(box(.55,.55,.65,poleMat,0,3.9,0));g.add(mesh(new THREE.CircleGeometry(.14,16),new THREE.MeshBasicMaterial({color:0x14252b}),0,3.9,.33));
     const t=texture(256,256,c=>{c.fillStyle='#e8e7d7';c.fillRect(0,0,256,256);c.strokeStyle='#ae4033';c.lineWidth=17;c.beginPath();c.arc(128,128,106,0,Math.PI*2);c.stroke();c.fillStyle='#203135';c.textAlign='center';c.font='bold 116px sans-serif';drawText(c,cam.limit,128,169);});g.add(mesh(new THREE.PlaneGeometry(1.05,1.05),new THREE.MeshBasicMaterial({map:t}),0,2.5,.15));this.dayGroup.add(g);
   }
   for(const light of sim.signals){const p=path.sample(light.s+8),g=new THREE.Group();g.position.set(p.x,p.y+.12,p.z);g.rotation.y=p.yaw;const width=path.width(light.s);
     if(light.yellowBox){const line=(x1,z1,x2,z2)=>{const o=box(.11,.02,Math.hypot(x2-x1,z2-z1),this.mats.yellow,(x1+x2)/2,0,(z1+z2)/2);o.rotation.y=Math.atan2(x2-x1,z2-z1);g.add(o);};for(const side of[-1,1])line(side*width/2,-10,side*width/2,10);line(-width/2,-10,width/2,-10);line(-width/2,10,width/2,10);for(let k=-12;k<=12;k+=3)for(const dir of[-1,1]){let a=Math.max(-width/2,(-10-k)/dir),b=Math.min(width/2,(10-k)/dir);if(dir<0){a=Math.max(-width/2,(10-k)/dir);b=Math.min(width/2,(-10-k)/dir);}if(b>a)line(a,dir*a+k,b,dir*b+k);}}
     if(light.camera){const anchor=this.clearance.roadside(path,light.s+8,width/2+.75,.32,4.3,path.height(light.s+8)>.2?0:22);if(anchor){g.add(box(.2,4,.2,this.mats.metal,anchor.offset,2,0));g.add(box(.5,.4,.6,poleMat,anchor.offset,4,0));}}
     this.dayGroup.add(g);
   }
 }
 makeChallenge(challenge){
   this.disposeGroup(this.challengeGroup);const g=new THREE.Group();this.challengeGroup=g;g.position.copy(this.challengeOrigin);this.scene.add(g);
   const concrete=new THREE.MeshStandardMaterial({color:0x93998e,roughness:1}),dark=new THREE.MeshStandardMaterial({color:0x15212a,roughness:1}),brick=new THREE.MeshStandardMaterial({color:0xb4aa94,roughness:.9});
   const pos=[];for(let s=0;s<challenge.length+20;s+=2){const y=challenge.height(s),y2=challenge.height(s+2),spans=challenge.kind==='sinkhole'&&challenge.day.collapse&&s>=52&&s<62?[[-4.2,-1.05],[3.65,4.2]]:[[-4.2,4.2]];for(const[a,b]of spans)for(const q of[[a,y,-s],[b,y,-s],[a,y2,-s-2],[a,y2,-s-2],[b,y,-s],[b,y2,-s-2]])pos.push(...q);}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();const road=mesh(geo,this.mats.road);road.receiveShadow=true;g.add(road);
   this.hole=new THREE.Group();this.hole.visible=false;this.hole.position.set(1.3,.03,-57);this.holeCover=box(4.7,.035,10,this.mats.road,1.3,.015,-57);this.holeCover.visible=challenge.kind==='sinkhole'&&challenge.day.collapse;g.add(this.holeCover);for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=2.4;const stone=box(.5,.24,.6,concrete,Math.cos(a)*r,.08,Math.sin(a)*r);stone.rotation.y=a;this.hole.add(stone);}const inside=mesh(new THREE.CylinderGeometry(2.25,2.1,10,18,1,true),new THREE.MeshStandardMaterial({color:0x493f33,side:THREE.BackSide,roughness:1}),0,-5,0);this.hole.add(inside);const bottom=mesh(new THREE.CircleGeometry(2.15,18),dark,0,-9.9,0);bottom.rotation.x=-Math.PI/2;this.hole.add(bottom);g.add(this.hole);
   this.smoke=[];for(let i=0;i<10;i++){const cloud=mesh(new THREE.IcosahedronGeometry(.5,1),new THREE.MeshBasicMaterial({color:0xe1e0d5,transparent:true,opacity:.25,depthWrite:false}));cloud.visible=false;g.add(cloud);this.smoke.push(cloud);}
   if(challenge.kind==='garage'){
     for(let s=0;s<60;s+=5)for(const side of[-1,1]){const y=challenge.height(s);g.add(box(.5,4.5,5,concrete,side*4.5,y+2,-s));if(s<12)g.add(box(4.5,.25,5,concrete,side*2.2,4.2,-s));const warn=box(.05,.4,3.2,this.mats.yellow,side*4.23,y+.7,-s);g.add(warn);}
     makeCommunityExit(g);
     this.challengeSign(g,'二重埔・集合住宅地下室','社區通勤 / 出口 ↑',0,7,-14);
     this.challengeSign(g,'社區出口　EXIT','集合住宅 → 透天街廓 → 中興路',0,21,-118);
   }else{
     for(let s=0;s<120;s+=18)for(const side of[-1,1]){g.add(box(9,side<0?16:22,14,brick,side*10,side<0?8:11,-s));g.add(box(8,1,15,this.mats.median,side*9,.3,-s));}
     for(const z of[-40,-69])for(const x of[-3.4,3.4]){g.add(mesh(new THREE.ConeGeometry(.35,.8,8),new THREE.MeshStandardMaterial({color:0xe2a157}),x,.4,z));}
     this.challengeSign(g,'喜來登周邊・天坑支線','虛構道路挑戰 / 非飯店事故還原',0,6,-23);
   }
 }
 challengeSign(group,title,sub,x,y,z){const t=texture(1024,256,(c,w,h)=>{c.fillStyle='#234742';c.fillRect(0,0,w,h);c.fillStyle='#f2ebcc';c.textAlign='center';c.font='bold 72px "PingFang TC",sans-serif';drawText(c,title,w/2,105,970);c.font='36px "PingFang TC",sans-serif';drawText(c,sub,w/2,190,960);});group.add(mesh(new THREE.PlaneGeometry(9,2.25),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}),x,y,z));}
 updateChallenge(c){if(this.hole)this.hole.visible=c.kind==='sinkhole'&&c.day.collapse&&c.player.s>35;if(this.holeCover)this.holeCover.visible=c.kind==='sinkhole'&&c.day.collapse&&!this.hole.visible;for(let i=0;i<(this.smoke?.length||0);i++){const o=this.smoke[i];o.visible=c.slip>.2;if(o.visible){const t=(c.time*1.6+i*.2)%2;o.position.set(c.player.offset+(i%2?.9:-.9),c.height()+.2+t*.65,-c.player.s+1.5+t);o.scale.setScalar(.35+t*.7);o.material.opacity=(1-t/2)*.3;}}}
 makeSignals(signals,pathRoute=this.route){for(const signal of signals){const p=pathRoute.sample(signal.s-8),group=new THREE.Group();group.position.set(p.x,p.y,p.z);group.rotation.y=p.yaw;const anchor=this.clearance.roadside(pathRoute,signal.s-8,pathRoute.width(signal.s)/2+.9,.12,6.1,p.y>.2?0:22);const right=anchor?.offset??pathRoute.width(signal.s)/2+.9;if(anchor)group.add(box(.15,6.1,.15,this.mats.metal,right,3.05,0));group.add(box(right+2,.12,.12,this.mats.metal,(right-2)/2,6.05,0));group.add(box(1.24,.47,.27,new THREE.MeshStandardMaterial({color:0x222d29}),0,5.77,0));const bulbs=[];for(let i=0;i<3;i++){const mat=new THREE.MeshStandardMaterial({color:0x21302a,emissive:0x000000});const bulb=mesh(new THREE.CircleGeometry(.155,14),mat,-.4+i*.4,5.77,.145);group.add(bulb);bulbs.push(mat);}this.scene.add(group);this.signalModels.push({signal,bulbs,group});
 const roadW=pathRoute.width(signal.s);const stop=box(roadW,.014,.4,this.mats.paint,0,.085,1.7);group.add(stop);for(let x=-roadW/2+.44;x<=roadW/2-.24;x+=.86){const stripe=box(.44,.012,3.1,this.mats.paint,x,.096,-5);group.add(stripe);}}
 }
 makeCockpit(kind){this.kind=kind;this.dialFace=null;this.dashboardGroup=null;this.carMirror=null;this.lastMirror=-1;if(this.dialTexture)this.dialTexture.dispose();if(this.cockpit){this.rig.remove(this.cockpit);this.cockpit.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}this.cockpit=new THREE.Group();this.rig.add(this.cockpit);const dark=new THREE.MeshStandardMaterial({color:0x17292d,roughness:.8}),soft=new THREE.MeshStandardMaterial({color:0x28383b,roughness:.86}),metal=new THREE.MeshStandardMaterial({color:0x9bada9,metalness:.6,roughness:.35});this.mirrorMat=new THREE.MeshBasicMaterial({color:0xc9dddc,side:THREE.DoubleSide});if(this.rearTarget)this.mirrorMat.map=this.rearTarget.texture;
 this.dialCanvas=document.createElement('canvas');this.dialCanvas.width=512;this.dialCanvas.height=256;this.dialTexture=new THREE.CanvasTexture(this.dialCanvas);this.dialTexture.colorSpace=THREE.SRGBColorSpace;const dialmat=new THREE.MeshBasicMaterial({map:this.dialTexture});
 if(kind!=='bike'){
 this.dashboardGroup=new THREE.Group();this.cockpit.add(this.dashboardGroup);
 this.camera.position.set(-.36,1.23,.0);this.dashboardGroup.add(box(2.2,.24,.65,soft,0,.75,-1.08));this.dashboardGroup.add(box(2.15,.09,.9,dark,0,.91,-1.21));this.dashboardGroup.add(box(1.83,.1,1.6,new THREE.MeshStandardMaterial({color:0x34565a,metalness:.4,roughness:.35}),0,.82,-2.05));
 for(const side of[-1,1]){const pillar=box(.09,1.25,.12,soft,side*.98,1.43,-.55);pillar.rotation.x=-.24;this.cockpit.add(pillar);}
 this.wheel=new THREE.Group();this.wheel.position.set(-.36,.84,-.54);this.wheel.rotation.x=-.24;this.wheel.add(mesh(new THREE.TorusGeometry(.205,.028,8,36),dark));for(let i=0;i<3;i++){const spoke=box(.035,.18,.025,metal,0,.085,0);spoke.rotation.z=i*Math.PI*2/3;spoke.position.x=Math.sin(-spoke.rotation.z)*.08;spoke.position.y=Math.cos(spoke.rotation.z)*.08;this.wheel.add(spoke);}this.wheel.add(mesh(new THREE.CylinderGeometry(.065,.065,.05,20),soft));this.dashboardGroup.add(this.wheel);
 this.dialFace=mesh(new THREE.PlaneGeometry(.52,.26),dialmat,-.36,.87,-.735);this.dashboardGroup.add(this.dialFace);this.carMirror=new THREE.Group();this.carMirror.add(box(.47,.125,.035,dark,0,0,0),mesh(new THREE.PlaneGeometry(.44,.105),this.mirrorMat,0,0,.025));this.cockpit.add(this.carMirror);
 }else{
 this.camera.position.set(0,1.58,0);this.wheel=new THREE.Group();this.wheel.position.set(0,1.18,-.7);this.wheel.add(box(.8,.06,.07,metal,0,0,0));for(const side of[-1,1]){this.wheel.add(box(.18,.08,.1,dark,side*.4,0,0));const stalk=box(.025,.35,.025,metal,side*.43,.18,-.02);stalk.rotation.z=side*-.25;this.wheel.add(stalk);this.wheel.add(box(.24,.15,.04,dark,side*.49,.38,-.02));this.wheel.add(mesh(new THREE.PlaneGeometry(.215,.125),this.mirrorMat,side*.49,.38,.006));}
 this.wheel.add(box(.35,.13,.25,soft,0,-.01,-.06));const dial=mesh(new THREE.PlaneGeometry(.30,.15),dialmat,0,.07,.055);dial.rotation.x=-.55;this.dialFace=dial;this.wheel.add(dial);this.cockpit.add(this.wheel);this.cockpit.add(box(.48,.65,.4,new THREE.MeshStandardMaterial({color:0x587d73,roughness:.4,metalness:.3}),0,.63,-.65));
 }
 if(kind==='bus'){this.dashboardGroup.position.set(-.12,1.12,-3.2);this.dashboardGroup.scale.set(1.15,1,1.1);for(const node of this.cockpit.children)if(node!==this.dashboardGroup){node.position.y+=1.12;node.position.z-=3.2;}}
 this.wipers=[];if(kind!=='bike')for(const side of[-1,1]){const pivot=new THREE.Group();pivot.position.set(side*.52,(kind==='bus'?1.12:0)+.94,(kind==='bus'?-3.2:0)-1.35);pivot.add(box(.025,.7,.02,dark,0,.35,0));pivot.visible=false;this.cockpit.add(pivot);this.wipers.push(pivot);}this.layoutCockpit();this.updateDial(0,false,'D');
 }
 updateDial(speed,auto,gear){if(this.dialFace&&!this.dialFace.visible)return;const c=this.dialCanvas.getContext('2d');c.fillStyle='#102427';c.fillRect(0,0,512,256);c.strokeStyle='#4b6d6c';c.lineWidth=3;c.beginPath();c.arc(256,170,130,Math.PI,Math.PI*2);c.stroke();c.strokeStyle='#d9e5ca';c.lineWidth=7;c.beginPath();c.arc(256,170,130,Math.PI,Math.PI+Math.min(speed/80,1)*Math.PI);c.stroke();c.fillStyle='#eef1db';c.textAlign='center';c.font='100 106px monospace';drawText(c,Math.round(speed),256,177);c.font='20px sans-serif';drawText(c,'km/h',256,216);c.font='27px monospace';c.fillStyle=auto?'#9fc6a4':'#abbcb0';drawText(c,auto?'ACC':gear,70,197);drawText(c,'07:45',425,197);this.dialTexture.needsUpdate=true;}
 draw(sim,dt,{menu=false,look=0,pitch=0,chase=false,challenge=null}={}){const player=challenge?.player||sim.player;
 const p=challenge?{x:this.challengeOrigin.x+player.offset,z:this.challengeOrigin.z-player.s,y:challenge.height()-(challenge.fall?Math.min(7,challenge.fall*3):0),yaw:0,pitch:challenge.kind==='garage'&&player.s>15&&player.s<58?.346:0}:(this.kind==='bike'?this.bikeRoute:this.route).sample(player.s,player.offset);
 if(this.challengeGroup)this.challengeGroup.visible=!!challenge;if(challenge)this.updateChallenge(challenge);
 this.rig.position.set(p.x,p.y,p.z);this.rig.rotation.set(p.pitch||0,steeredYaw(p.yaw,player.heading),challenge?.fall?Math.min(.5,challenge.fall*.2):0,'YXZ');
 this.camera.rotation.set(pitch+(chase?-.16:0),look,0,'YXZ');this.camera.position.set(chase?0:this.kind==='bus'?-.54:this.kind==='car'?-.36:0,chase?(this.kind==='bus'?5.6:3.5):(this.kind==='bus'?2.45:this.kind==='car'?1.23:1.58)+(this.reduced?0:Math.sin(sim.totalTime*8)*Math.min(.006,player.speed*.0005)),chase?(this.kind==='bus'?14:8.2):this.kind==='bus'?-3.2:0);this.cockpit.visible=!chase;if(chase&&challenge?.fall){this.camera.position.set(0,4+Math.min(7,challenge.fall*3),3.5);this.camera.rotation.x=-.9;}
 const own={s:player.s,offset:player.offset,color:4,paint:0xd3b557,braking:player.braking,world:{...p,yaw:steeredYaw(p.yaw,player.heading)}};this.playerCars.update(chase&&this.kind==='car'?[own]:[],this.route);this.playerBikes.update(chase&&this.kind==='bike'?[own]:[],this.route);this.playerBuses.update(chase&&this.kind==='bus'?[own]:[],this.route);
 this.wheel.rotation.z=-player.steering*(this.kind!=='bike'?.9:.15);
 this.sun.position.set(p.x-100,p.y+160,p.z-100);this.sun.target.position.set(p.x,p.y,p.z);this.sun.target.updateMatrixWorld();
 for(const c of sim.cars){if(c.schoolTurningAt!==undefined){const p=this.route.sample(c.s,c.offset);c.world={...p,yaw:p.yaw-Math.min(1.3,(sim.time-c.schoolTurningAt)*.4)};}}
 for(const c of sim.cars)c.flashing=c.flashUntil>sim.time&&Math.sin(sim.time*15)>0;
 const visible=challenge?[]:sim.cars.filter(c=>Math.abs(c.s-player.s)<570 && !(chase&&c.s<player.s&&c.s>player.s-15));
 visible.sort((a,b)=>Math.abs(a.s-player.s)-Math.abs(b.s-player.s));
 const opposing=[];
 const restaurantCars=challenge?[]:visibleRestaurantActors(sim,p,chase);
 for(let i=0;i<45;i++){
   const s=(i*109-sim.time*10+this.route.length*100)%this.route.length;
   if(!challenge&&Math.abs(s-player.s)<450&&!restaurantCars.some(c=>{const a=this.opposingAt(s);return Math.hypot(a.x-c.world.x,a.z-c.world.z)<8;}))opposing.push({s,world:this.opposingAt(s),color:i%7,reverse:true,braking:false,kind:'car'});
 }
 const continuing=challenge?[]:(sim.mainlineDepartures||[]).filter(c=>Math.abs(c.s-player.s)<700).map(c=>{const p=c.mainlinePath?.sample(c.mainlineS+c.speed*c.age,c.mainlineOffset);return {...c,world:{x:p?.x??c.origin.x+c.tx*c.speed*c.age,z:p?.z??c.origin.z+c.tz*c.speed*c.age,y:c.origin.y,yaw:p?.yaw??c.yaw}};});
 const crossing=[];for(const light of sim.signals){if(challenge||Math.abs(light.s-player.s)>450||light.fictional)continue;const ph=sim.phase(light);if(!['red','blocked'].includes(ph.state))continue;const at=sim.pathFor(sim.player.vehicle).sample(light.s);for(let i=0;i<5;i++){const along=((sim.time*(ph.blocked?.6:5)+i*9)%75)-37.5;crossing.push({s:light.s,offset:0,color:i+1,braking:ph.blocked,world:{x:at.x+at.rx*along,y:at.y+.02,z:at.z+at.rz*along,yaw:at.yaw+Math.PI/2}});}}this.carBatch.update([...restaurantCars,...visible.filter(c=>c.kind==='car'),...continuing.filter(c=>c.kind==='car'),...opposing,...crossing],this.route);this.bikeBatch.update(visible.filter(c=>c.kind==='bike'),this.bikeRoute);this.busBatch.update([...visible.filter(c=>c.kind==='bus'),...continuing.filter(c=>c.kind==='bus')],this.route);
 for(const m of this.signalModels){const state=sim.phase(m.signal).state;for(let i=0;i<3;i++){const active=(['green','blocked'].includes(state)&&i===2)||(state==='yellow'&&i===1)||(state==='red'&&i===0);const color=[0xf45843,0xffbf52,0x8ce4ad][i];m.bulbs[i].color.setHex(active?color:0x263831);m.bulbs[i].emissive.setHex(active?color:0);m.bulbs[i].emissiveIntensity=active?1.7:0;}}
 if(!chase&&!challenge&&!menu&&sim.totalTime-this.lastMirror>(this.lowPower?.5:.14)){const mirrorRoute=this.kind==='bike'?this.bikeRoute:this.route;const back=mirrorRoute.sample(Math.max(0,player.s-4),player.offset);this.rearCamera.position.set(back.x,back.y+(this.kind==='bus'?2.7:1.65),back.z);const target=mirrorRoute.sample(Math.max(0,player.s-80),player.offset);this.rearCamera.lookAt(target.x,target.y+1.5,target.z);this.cockpit.visible=false;this.renderer.setRenderTarget(this.rearTarget);this.renderer.render(this.scene,this.rearCamera);this.renderer.setRenderTarget(null);this.cockpit.visible=!chase;this.lastMirror=sim.totalTime;}
 this.environment?.update(sim,p,dt,challenge);this.renderer.render(this.scene,this.camera);
 }
}
