import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gameText,drawText} from '../dist/game-text.js';
import {NAME_ALIASES} from '../dist/name-aliases.js';
import {Route} from '../dist/geo.js';

test('homophone names are consistent and stable across repeated display updates',()=>{
 for(const [original,alias] of Object.entries(NAME_ALIASES)){
  assert.notEqual(original,alias);
  assert.equal(gameText(original),alias,original);
  assert.equal(gameText(alias),alias,alias);
 }
 assert.equal(gameText('關新路 → 康橋 → 台積電12廠'),'關薪路 → 糠橋 → 抬雞店12廠');
 assert.equal(gameText('明湖路 → 聯發科'),'名糊路 → 連發瞌');
});
test('canvas and UI captions use the same aliases while data keys and URLs retain their meaning',()=>{
 const calls=[],ctx={fillText:(...args)=>calls.push(args)};
 drawText(ctx,'經國大橋',12,24,300);
 assert.deepEqual(calls,[['驚幗大橋',12,24,300]]);
 const d=JSON.parse(fs.readFileSync(new URL('../dist/data/routes/guanxin-tsmc.json',import.meta.url)));
 const road=new Route(d);
 assert.equal(road.sample(0).road,'關新路');
 assert.equal(gameText(road.sample(0).road),'關薪路');
 assert.equal(d.id,'guanxin-tsmc');
 assert.ok(d.destination.sourceUrl.startsWith('https://www.tsmc.com/'));
});
