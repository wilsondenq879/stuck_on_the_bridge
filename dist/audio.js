import {clamp,seeded} from './geo.js';
import {DRIVER_LINES, DriverLinePicker} from './driver-lines.js';

export class CommuteAudio {
 constructor(onCaption=()=>{}){
  this.enabled=true;this.bgm=true;this.voice=true;this.active=false;this.ctx=null;
  this.onCaption=onCaption;
  this.lastHorn=-Infinity;this.step=0;this.nextBeat=0;this.random=seeded(1947);
  this.lastReaction=-Infinity;
  this.picker=new DriverLinePicker();
  this.upNext=new Map();
  this.clips=new Map();
  this.voiceRequest=0;
  this.voiceSource=null;
 }
 init(){if(this.ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();const c=this.ctx;this.master=c.createGain();this.master.gain.value=0;const comp=c.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=5;this.master.connect(comp);comp.connect(c.destination);this.music=c.createGain();this.music.gain.value=.72;this.music.connect(this.master);
  this.engine=c.createOscillator();this.engine.type='sawtooth';this.engineGain=c.createGain();this.engineGain.gain.value=0;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=230;this.engine.connect(filter);filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
  const noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate),samples=noiseBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(this.random()-.5)*2;
  this.noise=c.createBufferSource();this.noise.buffer=noiseBuffer;this.noise.loop=true;const noiseFilter=c.createBiquadFilter();noiseFilter.type='lowpass';noiseFilter.frequency.value=2200;this.noiseGain=c.createGain();this.noiseGain.gain.value=0;this.noise.connect(noiseFilter);noiseFilter.connect(this.noiseGain);this.noiseGain.connect(this.master);this.noise.start();
  this.tire=c.createOscillator();this.tire.type='triangle';this.tire.frequency.value=1050;this.tireGain=c.createGain();this.tireGain.gain.value=0;this.tire.connect(this.tireGain);this.tireGain.connect(this.master);this.tire.start();
 }
 resume(){this.init();this.active=true;if(!this.ctx)return;this.ctx.resume().catch(()=>{});this.master.gain.setTargetAtTime(this.enabled?.65:0,this.ctx.currentTime,.08);this.nextBeat=this.ctx.currentTime+.05;this.warmVoices();}
 suspend(){this.active=false;if(this.ctx)this.master.gain.setTargetAtTime(0,this.ctx.currentTime,.08);this.stopVoice();}
 toggle(){this.enabled=!this.enabled;if(this.active&&this.ctx)this.master.gain.setTargetAtTime(this.enabled?.65:0,this.ctx.currentTime,.08);if(this.enabled)this.warmVoices();else this.stopVoice();}
 setVoice(enabled){
  this.voice=enabled;
  if(enabled) this.warmVoices();
  else this.stopVoice();
 }
 beginTrip(){
  this.stopVoice();
  this.lastReaction=-Infinity;
 }
 stopVoice(){
  this.voiceRequest++;
  this.voiceSource?.stop();
  this.voiceSource=null;
  if(this.utterance) window.speechSynthesis?.cancel();
  this.utterance=null;
 }
 clipFor(line){
  if(!this.ctx) return Promise.resolve(null);
  if(!this.clips.has(line.id)){
   const url=new URL('./audio/'+line.id+'.wav?v=0.9.4',import.meta.url);
   const load=fetch(url).then(async response=>{
    if(!response.ok) throw Error('Voice clip unavailable');
    return this.ctx.decodeAudioData(await response.arrayBuffer());
   }).catch(()=>{this.clips.delete(line.id);return null;});
   this.clips.set(line.id,load);
  }
  return this.clips.get(line.id);
 }
 nextLine(kind){
  if(!this.upNext.has(kind)) this.upNext.set(kind,this.picker.next(kind));
  return this.upNext.get(kind);
 }
 warmVoices(){
  if(!this.active||!this.enabled||!this.voice||!this.ctx) return;
  for(const kind of Object.keys(DRIVER_LINES)) this.clipFor(this.nextLine(kind));
 }
 note(midi,time,length,volume,type='triangle',destination=this.music){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.03);g.gain.exponentialRampToValueAtTime(.0001,time+length);o.connect(g);g.connect(destination);o.start(time);o.stop(time+length+.02);o.onended=()=>{o.disconnect();g.disconnect();};}
 scheduleMusic(){if(!this.ctx||!this.bgm||!this.enabled||!this.active)return;const t=this.ctx.currentTime,chords=[[57,60,64,67],[53,57,60,64],[48,52,55,59],[55,59,62,65]],beat=60/84/2;if(this.nextBeat<t-.5)this.nextBeat=t+.03;while(this.nextBeat<t+.18){const n=this.step%16,chord=chords[Math.floor(this.step/16)%4];if(n===0)for(const note of chord)this.note(note,this.nextBeat,2.7,.007);if(n%4===0)this.note(chord[0]-12,this.nextBeat,.55,.035,'sine');if(n%2===1)this.note(chord[[0,2,1,3,2,1,3,0][Math.floor(n/2)]]+12,this.nextBeat,.6,.009,'sine');if(n%8===0)this.note(30,this.nextBeat,.17,.045,'sine');this.nextBeat+=beat;this.step++;}}
 update(player,sim,challenge,input={}){if(!this.ctx||!this.active)return;const c=this.ctx,speed=Math.abs(player.speed),gas=Number(input.gas)||0,slip=challenge?.slip||0;this.engine.frequency.setTargetAtTime((player.vehicle==='bus'?21:player.vehicle==='bike'?47:29)+speed*(player.vehicle==='bus'?1.8:3)+gas*(player.vehicle==='bus'?13:22)+slip*90,c.currentTime,.09);this.engineGain.gain.setTargetAtTime(.022+gas*.023+speed*.001,c.currentTime,.12);const wet=sim.day?.weather==='rain'?.025:sim.day?.weather==='typhoon'?.06:0;this.noiseGain.gain.setTargetAtTime(speed*.0013+wet,c.currentTime,.2);this.tireGain.gain.setTargetAtTime(slip>.2?.024:(input.brake&&speed>9?.008:0),c.currentTime,.1);this.music.gain.setTargetAtTime(this.bgm?.72:0,c.currentTime,.12);this.scheduleMusic();}
 horn({external=false,pan=0,bus=false}={}){if(!this.enabled||!this.active||!this.ctx)return;const c=this.ctx,t=c.currentTime;if(!external&&t-this.lastHorn<.35)return;this.lastHorn=t;const p=c.createStereoPanner();p.pan.value=clamp(pan,-1,1);p.connect(this.master);for(const f of(bus?[196,247]:[440,554])){const o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.value=f*(external?.92:1);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(external?.018:.024,t+.025);g.gain.setValueAtTime(external?.018:.024,t+.22);g.gain.linearRampToValueAtTime(0,t+.32);o.connect(g);g.connect(p);o.start(t);o.stop(t+.35);o.onended=()=>{o.disconnect();g.disconnect();};}setTimeout(()=>p.disconnect(),450);}
 async react(kind){
  const now=performance.now();
  if(!this.active||!this.voice||!Object.hasOwn(DRIVER_LINES,kind)||now-this.lastReaction<12000) return;
  this.lastReaction=now;
  const line=this.nextLine(kind);
  this.upNext.delete(kind);
  const estimate=Math.max(1.8,line.text.length/5.3);
  if(!this.enabled){
   this.onCaption(line.text,kind,estimate);
   return;
  }
  const request=++this.voiceRequest;
  let timer;
  const buffer=await Promise.race([
   this.clipFor(line),
   new Promise(resolve=>{timer=setTimeout(()=>resolve(null),4500);}),
  ]);
  clearTimeout(timer);
  if(request!==this.voiceRequest) return;
  const rear=kind==='queue';
  if(buffer){
   const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
   source.buffer=buffer;
   gain.gain.value=rear?.65:.88;
   source.connect(gain);
   gain.connect(this.master);
   source.onended=()=>{
    source.disconnect();
    gain.disconnect();
    if(this.voiceSource===source) this.voiceSource=null;
   };
   this.voiceSource=source;
   source.start();
  }
  this.onCaption(line.text,kind,buffer?.duration??estimate);
  this.clipFor(this.nextLine(kind));
 }
}
