import {clamp} from './geo.js';
export function deadzone(v,threshold=.16){return Math.abs(v)<=threshold?0:Math.sign(v)*(Math.abs(v)-threshold)/(1-threshold);}
export function readGamepad(pad) {
  if(!pad||pad.connected===false||pad.mapping!=='standard')return {connected:false,unsupported:!!pad,gas:0,brake:0,steer:0,lookX:0,lookY:0,buttons:[]};
  const b=(i)=>pad.buttons[i]?.value||0;
  return {connected:true,id:pad.id,gas:clamp(b(7),0,1),brake:clamp(b(6),0,1),
    steer:clamp(deadzone(pad.axes[0]||0)+b(15)-b(14),-1,1),
    lookX:deadzone(pad.axes[2]||0),lookY:deadzone(pad.axes[3]||0),
    buttons:pad.buttons.map(x=>x.pressed||x.value>.5)};
}
export function mergeControls(keyboard,touch,pad) {
  return {gas:Math.max(keyboard.gas||0,touch.gas||0,pad.gas||0),brake:Math.max(keyboard.brake||0,touch.brake||0,pad.brake||0),
    steer:clamp((keyboard.right?1:0)-(keyboard.left?1:0)+(touch.steer||0)+(touch.right?1:0)-(touch.left?1:0)+(pad.steer||0),-1,1)};
}
