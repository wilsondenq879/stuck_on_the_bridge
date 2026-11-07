import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { DRIVER_LINES, DriverLinePicker } from '../dist/driver-lines.js';
import { CommuteAudio } from '../dist/audio.js';
import { Route, seeded } from '../dist/geo.js';
import { TrafficSimulation } from '../dist/sim.js';

test('every line has its own playable 24 kHz recording and matching caption', () => {
  const lines = Object.values(DRIVER_LINES).flat();
  const texts = new Set(), recordings = new Set();
  for (const line of lines) {
    const bytes = fs.readFileSync(new URL('../dist/audio/'+line.id+'.wav', import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    let frames;
    for (let pos=12; pos+8<=bytes.length;) {
      const name=bytes.toString('ascii',pos,pos+4), size=bytes.readUInt32LE(pos+4);
      const data=bytes.subarray(pos+8,pos+8+size);
      if (name==='fmt ') {
        assert.equal(data.readUInt16LE(0), 1);
        assert.equal(data.readUInt16LE(2), 1);
        assert.equal(data.readUInt32LE(4), 24000);
        assert.equal(data.readUInt16LE(14), 16);
      }
      if (name==='data') frames=data;
      pos+=8+size+(size%2);
    }
    assert.ok(frames.length>48000, line.id);
    let voiced=0;
    for (let offset=0; offset<frames.length; offset+=2) {
      if (Math.abs(frames.readInt16LE(offset))>600) voiced++;
    }
    assert.ok(voiced>2400, line.id+' must contain audible speech');
    texts.add(line.text);
    recordings.add(createHash('sha256').update(frames).digest('hex'));
  }
  assert.equal(texts.size, lines.length);
  assert.equal(recordings.size, lines.length);
  assert.ok(DRIVER_LINES.slow.some(line=>line.text==='開這麼慢，車子壞了是不是？'));
});

test('a failed voice download shows the caption without substituting a different voice', async t => {
  const captions=[];const audio=new CommuteAudio((...args)=>captions.push(args));
  audio.active=true;audio.picker=new DriverLinePicker(()=>0);audio.ctx={decodeAudioData:async()=>{throw Error('bad audio')}};
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:503}));
  await audio.react('slow');assert.equal(captions[0][0],'開這麼慢，車子壞了是不是？');assert.equal(captions.length,1);
});

test('each situation uses a full round of lines before repeating, even at a round boundary', () => {
  const deck = new DriverLinePicker(seeded(251));
  for (const [kind, lines] of Object.entries(DRIVER_LINES)) {
    let previous;
    for (let round=0; round<8; round++) {
      const used = new Set();
      for (let i=0; i<lines.length; i++) {
        const line = deck.next(kind);
        assert.notEqual(previous, line.id);
        assert.ok(lines.includes(line));
        used.add(line.id);
        previous=line.id;
      }
      assert.equal(used.size, lines.length);
    }
  }
});

test('the selected file and subtitle agree, cooldown spans categories, and disabling cancels a pending voice', async t => {
  const captions=[], played=[], requested=[];
  const audio = new CommuteAudio((...args)=>captions.push(args));
  audio.active=true;
  audio.picker=new DriverLinePicker(()=>0);
  let stopped=0;
  audio.ctx={
    decodeAudioData: async bytes=>({ duration: 2.5, bytes }),
    createGain: ()=>({ gain: {}, connect(){}, disconnect(){} }),
    createBufferSource: ()=>({
      connect(){}, disconnect(){},
      start(){ played.push(this.buffer.bytes); },
      stop(){ stopped++; },
    }),
  };
  t.mock.method(globalThis,'fetch',async url=>{
    requested.push(url.pathname.split('/').at(-1));
    return new Response(fs.readFileSync(url));
  });
  await audio.react('slow');
  assert.equal(requested[0],'slow-broken.wav');
  assert.deepEqual(Buffer.from(played[0]),fs.readFileSync(new URL('../dist/audio/slow-broken.wav',import.meta.url)));
  assert.deepEqual(captions,[['開這麼慢，車子壞了是不是？','slow',2.5]]);
  await audio.react('cutin');
  assert.equal(captions.length,1);
  audio.lastReaction=-Infinity;
  let finishLoad;
  audio.clipFor=()=>new Promise(resolve=>{finishLoad=resolve;});
  const pending=audio.react('parking');
  audio.setVoice(false);
  finishLoad({duration:3});
  await pending;
  assert.equal(stopped,1);
  assert.equal(played.length,1);
  assert.equal(captions.length,1);
  audio.enabled=false;
  audio.setVoice(true);
  audio.beginTrip();
  await audio.react('queue');
  assert.equal(captions.at(-1)[1],'queue');
  assert.equal(played.length,1);
});

const road=new Route({
  points:[{s:0,x:0,z:0,lanes:2},{s:550,x:0,z:-550,lanes:2}],
  landmarks:[],bikeDivergenceRanges:[],
});
function emptyStreet(){
  const sim=new TrafficSimulation(road,{startS:100,seed:251});
  sim.cars=[];
  sim.pending=[];
  sim.signals=[];
  sim.rebuildBuckets();
  return sim;
}
function drive(sim,seconds){
  for(let i=0;i<Math.round(seconds*10);i++) sim.step(.1);
}
const spoken=sim=>sim.feedback.filter(event=>event.type==='reaction').map(event=>event.kind);

test('a steadily followed slow car on clear pavement draws one comment, a red light does not', () => {
  for(const red of [false,true]){
    const sim=emptyStreet(), p=sim.player;
    if(red) sim.signals=[{s:166,cycle:120,green:5,offset:12}];
    const front=sim.addCar(117,p.lane,'car',4.8);
    front.v0=4.8;
    p.speed=4.6;
    p.auto=true;
    drive(sim,4);
    assert.ok(!spoken(sim).includes('slow'));
    drive(sim,13);
    assert.equal(spoken(sim).filter(kind=>kind==='slow').length,red?0:1);
  }
});

test('a prolonged stationary queue gets a jam line while a single stopped car does not', () => {
  for(const hasFollower of [false,true]){
    const sim=emptyStreet(), lane=sim.player.lane;
    sim.signals=[{s:134,cycle:120,green:5,offset:14}];
    if(hasFollower) sim.addCar(111,lane,'car',0);
    sim.addCar(120,lane,'car',0);
    drive(sim,23);
    assert.ok(!spoken(sim).includes('jam'));
    drive(sim,10);
    assert.equal(spoken(sim).includes('jam'),hasFollower);
    assert.ok(!spoken(sim).includes('slow'));
  }
});

test('a confirmed contact creates one persistent feedback event between HUD updates', () => {
  const sim=emptyStreet();
  sim.addCar(107,sim.player.lane,'car',0).parkedUntil=900;
  sim.player.speed=12;
  drive(sim,1);
  assert.equal(sim.player.bumps,1);
  assert.deepEqual(spoken(sim),['bump']);
});
