import { describe, expect, it } from 'vitest';
import { applyShieldImpulse, collideShieldEntity, predictShieldPosition } from '../src/sim/mechanics/shield-response';
import { put16, put32, i16 } from '../src/sim/campaign/bytes';
const tables = {
 atan: Array.from({length:257},(_,i)=>Math.trunc(Math.atan(i/256)*1024/Math.PI)),
 sine: Array.from({length:2048},(_,i)=>Math.trunc(Math.sin(i*Math.PI/1024)*65536)),
 cosine: Array.from({length:2048},(_,i)=>Math.trunc(Math.cos(i*Math.PI/1024)*65536)),
};
function fixture(kind=1) {
 const shield=Array(67).fill(0), target=Array(200).fill(0), events:unknown[]=[];
 shield[6]=4;shield[45]=12;target[6]=kind;target[24]=1;
 put16(shield,7,4096);put16(shield,9,4096);put32(shield,17,2000);
 put16(target,7,5633);put16(target,9,4096);put32(target,39,2000);
 put16(target,45,-128);put16(target,61,100);
 const ports={physicalHeight:2000,movable:true,alliedOwners:0,
  effect:(code:number,owner:number)=>events.push(['effect',code,owner]),
  audio:(cue:number)=>events.push(['audio',cue]),
  damage:(amount:number)=>events.push(['damage',amount]),
  retire:()=>{events.push(['retire']);target[6]=0;},
 };
 return {shield,target,events,ports};
}
describe('source shield crossing response',()=>{
 it('predicts native fractional movement and signed height without moving the entity',()=>{
  const {target}=fixture();target[67]=255;put16(target,45,-1);put16(target,49,-9);
  const before=target.slice();
  expect(predictShieldPosition(target)).toEqual({position:[5633,4096],height:1998});
  expect(target).toEqual(before);
 });
 it('pushes hostile entering creatures outward and applies ordered feedback then damage',()=>{
  const f=fixture();
  expect(collideShieldEntity(f.shield,f.target,tables,f.ports)).toBe(true);
  expect(i16(f.target,45)).toBe(3968);
  expect(f.shield[63]).toBe(4);
  expect(f.events).toEqual([['effect',65,0],['audio',13],['damage',3]]);
 });
 it('allows allied crossings with feedback but without an impulse or damage',()=>{
  const f=fixture();f.ports.alliedOwners=2;
  const before=f.target.slice();collideShieldEntity(f.shield,f.target,tables,f.ports);
  expect(f.target).toEqual(before);expect(f.shield[63]).toBe(0);
  expect(f.events).toEqual([['effect',65,1],['audio',14]]);
 });
 it('ignores noncrossings and the hostile creature immunity flag',()=>{
  for(const immune of [false,true]) {
   const f=fixture();if(immune)f.target[97]=1;else put16(f.target,45,128);
   expect(collideShieldEntity(f.shield,f.target,tables,f.ports)).toBe(false);
   expect(f.events).toEqual([]);
  }
 });
 it('retires projectile11 before its impulse feedback and never invokes unit damage',()=>{
  const f=fixture(5);f.target[69]=11;
  collideShieldEntity(f.shield,f.target,tables,f.ports);
  expect(f.events).toEqual([['effect',5,0],['retire'],['effect',65,0],['audio',13]]);
 });
 it('excludes protected projectile classes and admits stationary49 feedback',()=>{
  for(const code of [6,26,32,49]) {
   const f=fixture(5);f.target[69]=code;f.ports.movable=false;
   collideShieldEntity(f.shield,f.target,tables,f.ports);
   expect(f.events).toEqual(code===49?[['effect',65,1],['audio',14]]:[]);
  }
 });
 it('wraps the specialist drain byte and keeps unrelated target data',()=>{
  const f=fixture(3);f.shield[63]=255;f.target[100]=77;
  applyShieldImpulse(f.shield,f.target,false,tables);
  expect(f.shield[63]).toBe(0);expect(f.target[100]).toBe(77);
 });
});
