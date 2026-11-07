import {clamp} from './geo.js';
import {deadzone} from './controls.js';

// Each control owns one pointer. Lifting another finger cannot cancel a pedal.
export class TouchDriveInput {
  constructor(){this.owners=new Map();this.gas=0;this.brake=0;this.steer=0;}
  begin(channel,id){
    if(this.owners.has(channel)||[...this.owners.values()].includes(id))return false;
    this.owners.set(channel,id);return true;
  }
  move(channel,id,value){if(this.owners.get(channel)===id)this[channel]=clamp(value,channel==='steer'?-1:0,1);}
  end(id){for(const [channel,owner] of this.owners)if(owner===id){this[channel]=0;this.owners.delete(channel);}}
  reset(){this.owners.clear();this.gas=this.brake=this.steer=0;}
}

export function stickPosition(x,y,rect){
  const radius=rect.width*.27,dx=x-rect.left-rect.width/2,dy=y-rect.top-rect.height/2;
  const scale=Math.min(1,radius/(Math.hypot(dx,dy)||1));
  return {x:dx*scale,y:dy*scale,steer:deadzone(clamp(dx/radius,-1,1),.12)};
}
export function pedalPressure(y,rect){return clamp(1-(y-rect.top)/rect.height,.25,1);}

export function bindTouchControls(root,input,{canDrive}){
  const stick=root.querySelector('#touchSteer'),knob=root.querySelector('.stick-knob');
  const gas=root.querySelector('#touchGas'),brake=root.querySelector('#touchBrake');
  const controls=new Map([['steer',stick],['gas',gas],['brake',brake]]);
  let stickXY={x:0,y:0};
  function paint(){
    knob.style.transform=`translate(${stickXY.x}px,${stickXY.y}px)`;
    stick.classList.toggle('held',input.owners.has('steer'));
    stick.setAttribute('aria-valuenow',String(Math.round(input.steer*100)));
    for(const [channel,el] of [['gas',gas],['brake',brake]]){
      el.classList.toggle('held',input[channel]>0);el.style.setProperty('--pedal',input[channel]);
      el.setAttribute('aria-pressed',String(input[channel]>0));
    }
    root.querySelector('#touchGasValue').textContent=input.gas?Math.round(input.gas*100)+'%':'上滑加速';
  }
  function release(id){input.end(id);if(!input.owners.has('steer'))stickXY={x:0,y:0};paint();}
  function reset(){
    const held=[...input.owners];input.reset();stickXY={x:0,y:0};
    for(const [channel,id] of held){const el=controls.get(channel);if(typeof id==='number'&&el.hasPointerCapture(id))el.releasePointerCapture(id);}
    paint();
  }
  for(const [channel,el] of controls){
    let rect;
    const update=e=>{
      if(channel==='steer'){const p=stickPosition(e.clientX,e.clientY,rect);stickXY=p;input.move(channel,e.pointerId,p.steer);}
      else input.move(channel,e.pointerId,channel==='gas'?pedalPressure(e.clientY,rect):1);
      paint();
    };
    el.addEventListener('pointerdown',e=>{
      if(!canDrive()||e.button!==0||!input.begin(channel,e.pointerId))return;
      e.preventDefault();rect=el.getBoundingClientRect();el.setPointerCapture(e.pointerId);update(e);
    });
    el.addEventListener('pointermove',e=>{if(input.owners.get(channel)!==e.pointerId)return;e.preventDefault();if(!canDrive())reset();else update(e);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,e=>release(e.pointerId));
    // Hold-to-drive controls also work with a keyboard when focused.
    el.addEventListener('keydown',e=>{
      const accepted=channel==='steer'?['ArrowLeft','ArrowRight']:['Space','Enter'];
      if(!accepted.includes(e.code))return;e.preventDefault();e.stopPropagation();
      if(!canDrive())return;
      if(input.owners.get(channel)==='keyboard'||input.begin(channel,'keyboard')){
        input.move(channel,'keyboard',channel==='steer'?(e.code==='ArrowLeft'?-1:1):channel==='gas'?.65:1);
        if(channel==='steer')stickXY={x:input.steer*el.clientWidth*.27,y:0};paint();
      }
    });
    el.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','Space','Enter'].includes(e.code)){e.preventDefault();e.stopPropagation();release('keyboard');}});
    el.addEventListener('blur',()=>release('keyboard'));
    el.addEventListener('contextmenu',e=>e.preventDefault());
  }
  window.addEventListener('resize',reset);
  paint();return {reset};
}
