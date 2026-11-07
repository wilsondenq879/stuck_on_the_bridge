import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TouchDriveInput,stickPosition,pedalPressure} from '../dist/touch-controls.js';
import {mergeControls} from '../dist/controls.js';
import {Route} from '../dist/geo.js';
import {TrafficSimulation} from '../dist/sim.js';

test('two thumbs can steer and accelerate independently; an unrelated lift cannot release either',()=>{
  const input=new TouchDriveInput();
  input.begin('steer',11);input.move('steer',11,-.6);
  input.begin('gas',22);input.move('gas',22,.65);
  assert.equal(input.begin('gas',33),false);input.move('gas',33,1);input.end(33);
  assert.deepEqual(mergeControls({},input,{}),{gas:.65,brake:0,steer:-.6});
  input.end(11);assert.equal(input.steer,0);assert.equal(input.gas,.65);
  input.begin('brake',44);input.move('brake',44,1);
  assert.equal(input.brake,1);assert.equal(input.gas,.65);
  input.end(22);assert.equal(input.gas,0);assert.equal(input.brake,1);
  input.end(44);assert.equal(input.brake,0);
});

test('pause, rotation and lost captures cannot leave a stale throttle or steering input',()=>{
  const input=new TouchDriveInput();input.begin('gas',2);input.move('gas',2,1);
  input.begin('steer',3);input.move('steer',3,1);input.reset();
  input.move('gas',2,1);input.move('steer',3,-1);
  assert.deepEqual(mergeControls({},input,{}),{gas:0,brake:0,steer:0});
  input.begin('gas',4);input.move('gas',4,.4);input.end(2);
  assert.equal(input.gas,.4);input.end(4);assert.equal(input.gas,0);
});

test('joystick center has a dead zone and the pedal permits a stable light throttle',()=>{
  const rect={left:10,top:20,width:144,height:144};
  assert.equal(stickPosition(82,92,rect).steer,0);
  assert.equal(stickPosition(85,92,rect).steer,0);
  assert.equal(stickPosition(-400,92,rect).steer,-1);
  assert.equal(stickPosition(400,92,rect).steer,1);
  assert.ok(Math.abs(stickPosition(400,400,rect).x)<144*.27);
  assert.equal(stickPosition(82,40,rect).steer,0);
  const pedal={top:100,height:100};
  assert.equal(pedalPressure(135,pedal),.65);
  assert.equal(pedalPressure(80,pedal),1);assert.equal(pedalPressure(240,pedal),.25);
});

test('analog touch steering moves both vehicles laterally without turning the camera or drifting after release',()=>{
  const route=new Route(JSON.parse(fs.readFileSync(new URL('../dist/data/route.json',import.meta.url))));
  for(const vehicle of ['car','bike']){
    const sim=new TrafficSimulation(route,{vehicle,startS:1100});sim.cars=[];sim.pending=[];sim.rebuildBuckets();sim.signals=[];
    const input=new TouchDriveInput(),start=sim.player.offset;
    input.begin('steer',1);input.move('steer',1,.5);
    for(let i=0;i<10;i++)sim.step(.05,mergeControls({},input,{}));
    assert.ok(sim.player.offset>start);assert.equal(sim.player.heading,0);
    input.end(1);const stopped=sim.player.offset;
    for(let i=0;i<10;i++)sim.step(.05,mergeControls({},input,{}));
    assert.equal(sim.player.offset,stopped);
  }
});
