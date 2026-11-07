import data from './corridor-data.js';
export function hillHeight(x,z){
 const u=(x-data.x0)/data.step,v=(z-data.z0)/data.step,i=Math.floor(u),j=Math.floor(v);
 if(i<0||j<0||i>=data.nx-1||j>=data.nz-1)return 0;
 const k=j*data.nx+i,t=u-i,f=v-j,a=data.cm;
 return ((1-f)*(a[k]*(1-t)+a[k+1]*t)+f*(a[k+data.nx]*(1-t)+a[k+data.nx+1]*t))*.01;
}
export const courtPoints=data.court.map(([x,z])=>({x,z,road:'水滴廣場',lanes:1}));
let distance=0;
for(let i=0;i<courtPoints.length;i++){
 const p=courtPoints[i],a=courtPoints[i-1];
 if(a)distance+=Math.hypot(a.x-p.x,a.z-p.z);
 p.s=distance;
}
export const courtStop=courtPoints.reduce((best,p)=>p.z>best.z?p:best).s;
