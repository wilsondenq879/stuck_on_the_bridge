// Follow mapped bends without snapping at road geometry vertices.
export function smoothCameraYaw(current,target,dt,reset=false){
 if(reset||!Number.isFinite(current))return target;
 const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
 return current+delta*(1-Math.exp(-8*Math.max(0,Math.min(dt,.1))));
}
