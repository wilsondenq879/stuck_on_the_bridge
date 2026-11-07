import {clamp} from './geo.js';
export const WEATHER={
 sunny:{name:'晴天',grip:1,trafficSpeed:1,rain:0,wind:0,fog:.000025,sky:0xffffff,sun:3.0,ambient:2.0},
 rain:{name:'雨天',grip:.78,trafficSpeed:.82,rain:1,wind:.05,fog:.00014,sky:0x8d9ba8,sun:.7,ambient:1.65},
 typhoon:{name:'颱風天',grip:.62,trafficSpeed:.68,rain:2,wind:.19,fog:.00043,sky:0x566571,sun:.28,ambient:1.3}
};
export function earthquakeAt(day,time){if(!day?.quake?.enabled)return 0;const t=(time-day.quake.at)/day.quake.duration;return t>0&&t<1?Math.sin(t*Math.PI)*day.quake.power:0;}
export function windAt(day,time,vehicle='car'){const w=WEATHER[day?.weather||'sunny'];return w.wind*(Math.sin(time*.53+(day?.seed||1)%19)+.42*Math.sin(time*1.31))*(vehicle==='bike'?1.65:1);}
export function geographicPoint(origin,lat,lon){return {x:(lon-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180),z:(origin.lat-lat)*111320};}
export function bearingFrom(a,b){return (Math.atan2(b.x-a.x,-(b.z-a.z))*180/Math.PI+360)%360;}
export function cardinal(b){return ['北','東北','東','東南','南','西南','西','西北'][Math.round(b/45)%8];}
export function pointInPolygon(x,z,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.z>z)!==(b.z>z))&&(x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x))inside=!inside;}return inside;}
function segmentDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
export function intrudesRoad(poly,routes,padding=2.2){
 const minX=Math.min(...poly.map(p=>p.x))-20,maxX=Math.max(...poly.map(p=>p.x))+20,minZ=Math.min(...poly.map(p=>p.z))-20,maxZ=Math.max(...poly.map(p=>p.z))+20;
 for(const route of routes)for(const p of route.points){if(p.x<minX||p.x>maxX||p.z<minZ||p.z>maxZ)continue;const gap=route.width(p.s)/2+padding;if(pointInPolygon(p.x,p.z,poly))return true;for(let i=1;i<poly.length;i++)if(segmentDistance(p.x,p.z,poly[i-1],poly[i])<gap)return true;}
 return false;
}
export function rectangleFootprint(x,z,w,d,yaw){return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2],[-w/2,-d/2]].map(([a,b])=>({x:x+a*Math.cos(yaw)+b*Math.sin(yaw),z:z-a*Math.sin(yaw)+b*Math.cos(yaw)}));}
