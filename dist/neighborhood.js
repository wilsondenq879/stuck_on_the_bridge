import {seeded} from './geo.js';
import {intrudesRoad,rectangleFootprint} from './environment.js';

// Architectural reconstruction from the supplied photos and sampled Apr/May
// 2026 Street View. These are visual massing rules, not surveyed building data.
export const STOREY=3.2;
export const ERCHONG_MAX_STOREYS=14;
export const GARAGE_EXTERIOR_END=190;
export const isErchong=route=>route.data.originLabel?.startsWith('二重埔')||false;
export const parkStation=route=>route.data.landmarks?.find(p=>p.name==='園區一路')?.s||4962;
export function streetDistrict(route,s){
 if(!isErchong(route)||s>=parkStation(route))return 'other';
 if(s<380)return 'gateway';
 if(s>=1300&&s<2200)return 'fields';
 return s<3055?'old-town':'guangfu';
}
export function mappedBuildingStyle(route,b){
 const center=b.points.reduce((v,p)=>({x:v.x+p.x/b.points.length,z:v.z+p.z/b.points.length}),{x:0,z:0});
 const near=route.nearest(center.x,center.z),district=streetDistrict(route,near.s);
 let height=Math.min(Number(b.height)||12,95),hidden=false;
 if(district!=='other'){
  // Replace the immediate frontage with correctly scaled narrow shophouses.
  // Preserve mapped buildings further back rather than duplicating both layers.
  hidden=near.d<85&&!b.destinationBuilding;
  if(near.s<3055)height=Math.min(height,ERCHONG_MAX_STOREYS*STOREY);
 }
 return {height,hidden,district,station:near.s,distance:near.d};
}
export function streetHousePlan(route,bikeRoute=route){
 if(!isErchong(route))return [];
 const random=seeded(604122),houses=[],end=parkStation(route)-30;
 for(let s=25;s<end;s+=8.3){
  const district=streetDistrict(route,s);
  if(route.sample(s).bridge||(route.data.intersections||[]).some(i=>Math.abs(i.s-s)<18))continue;
  for(const side of[-1,1]){
   if(district==='fields'||district==='gateway'&&side<0)continue;
   if(district==='gateway'&&s<180)continue;
   if(district==='old-town'&&(Math.floor(s/70)%5===0||random()<.1))continue;
   const floors=district==='guangfu'?3+Math.floor(random()*3):2+Math.floor(random()*3);
   const width=6.4+random()*1.5,depth=10+random()*3,edge=route.width(s)/2+(side<0?route.width(s)+1.5:0);
   const p=route.sample(s,side*(edge+4.1+depth/2)),yaw=p.yaw-side*Math.PI/2;
   const footprint=rectangleFootprint(p.x,p.z,width,depth,yaw);
   if(intrudesRoad(footprint,[route,bikeRoute],3))continue;
   houses.push({x:p.x,y:0,z:p.z,yaw,width,depth,floors,height:floors*STOREY,variant:Math.floor(random()*6),side,s,district,footprint});
  }
 }
 return houses;
}
export const communityBlocks=[
 {x:-26,z:-38,width:24,depth:24,floors:14},
 {x:26,z:-38,width:24,depth:24,floors:14},
 {x:-30,z:-92,width:24,depth:29,floors:14},
 {x:30,z:-92,width:24,depth:29,floors:14},
 {x:-62,z:-129,width:25,depth:27,floors:14},
 {x:62,z:-129,width:25,depth:27,floors:14}
];
