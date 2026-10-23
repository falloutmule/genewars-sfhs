import {describe,it,expect} from "vitest";
import {damageNativeBuilding,clearDestroyedFootprint,type BuildingDamageWorld,type BuildingDamageContext,type BuildingDamageEffect} from "../src/sim/mechanics/building-damage";
import {putEffectWord as put,putEffectDword as put32} from "../src/sim/mechanics/power-motion";
import {terrainFromBytes,worldCell} from "../src/sim/mechanics/terrain";
import {nextRandom} from "../src/sim/mechanics/random";
const word=(n:readonly(number|null)[],p:number)=>((n[p]!|(n[p+1]!<<8))<<16)>>16;
const dword=(n:readonly(number|null)[],p:number)=>(word(n,p)&65535)|(word(n,p+2)<<16);
function fixture(selector=3,footprint=1){const bytes=Array(229376).fill(0);for(let i=0;i<16384;i++){put(bytes,i*14+2,1000);bytes[i*14+5]=7;bytes[i*14+11]=0x31;}
  const world:BuildingDamageWorld={terrain:terrainFromBytes(bytes),rng:{seed:0,draws:0,ring:null},buildingNative:Array.from({length:256},()=>Array.from({length:67},(_,i)=>i>=31&&i<39?null:0)),players:Array.from({length:4},(_,id)=>{const raw=Array(1805).fill(0);raw[0x4a1]=id;return {raw};})},trace:string[]=[],factories:BuildingDamageEffect[]=[];
  for(const slot of[0,3]){const n=world.buildingNative[slot];n[6]=4;n[24]=0;n[45]=slot===0?selector:11;put(n,15,slot);put(n,7,slot===0?8192:12288);put(n,9,8192);put(n,43,900);put(n,49,1);world.players[0].raw[0x600+n[45]!]++;}world.players[0].raw[0x4a2]=2;
  const rules={buildingHealth:Array(42).fill(900),buildingFootprints:Array(14).fill(1),buildingNameIndices:Array.from({length:14},(_,i)=>i*3)};rules.buildingFootprints[selector]=footprint;
  const context:BuildingDamageContext<typeof world>={rules,gameplayRunning:true,selectedBuildingSlot:0,createEffect(w,r){factories.push(r);trace.push(`effect:${r.code}`);if(r.code>=27&&r.code<=31)nextRandom(w.rng);return 0;},createCollapse:(_w,r)=>trace.push(`collapse:${r.completed}`),unlinkBuilding:(w,slot)=>{expect(w.buildingNative[slot][6]).toBe(4);trace.push(`unlink:${slot}`);},createCrater:(w,r)=>{trace.push(`crater:${r.variant}`);for(let i=0;i<(r.variant===0?9:16);i++)nextRandom(w.rng);},onEvent:(_w,e)=>trace.push(e.type)};
  return {world,context,trace,factories};}
describe("source building damage and destruction",()=>{
  it("retains the source dead health afterimage and ordered real effect/retirement calls",()=>{
    const f=fixture(),before=f.world.terrain.bytes.slice(),out=damageNativeBuilding(f.world,0,900,{id:"source:7:0",owner:1},f.context);
    expect(out.destroyed).toBe(true);expect(f.world.buildingNative[0][6]).toBe(0);expect(word(f.world.buildingNative[0],43)).toBe(900);
    expect(f.trace).toEqual(["collapse:true","effect:46","destroyed-message","selection-cleared","unlink:0","effect:27","effect:27","effect:27","effect:5"]);
    expect(f.world.players[0].raw[0x4a2]).toBe(1);expect(f.world.players[0].raw[0x603]).toBe(0);expect([word(f.world.players[0].raw,0x5fc),word(f.world.players[0].raw,0x5fe)]).toEqual([12288,8192]);expect(dword(f.world.players[1].raw,0x701)).toBe(1);
    expect(f.world.rng.draws).toBe(15);expect(f.factories.at(-1)).toMatchObject({code:5,owner:4,parameter:0});expect(f.world.terrain.bytes[worldCell(8192,8192)*14+11]).toBe(0x20);expect(f.world.terrain.bytes[worldCell(8192,8192)*14+5]).toBe(before[worldCell(8192,8192)*14+5]);
  });
  it("creates the actual crater before fragment draws and permits each source capacity failure",()=>{
    const f=fixture(6,3);f.context.createEffect=(w,r)=>{f.factories.push(r);f.trace.push(`effect:${r.code}`);return null;};
    const out=damageNativeBuilding(f.world,0,900,null,f.context);expect(out.crater).toEqual({position:[8192,8192],variant:1});expect(f.trace.indexOf("crater:1")).toBeLessThan(f.trace.indexOf("effect:27"));expect(f.factories.filter(r=>r.code>=27&&r.code<=31)).toHaveLength(9);expect(f.world.rng.draws).toBe(16+9*4);expect(out.capacityAfter).toBe(600);
  });
  it("keeps incomplete completion counts and passes explosion parameter1",()=>{
    const f=fixture(1,2);put(f.world.buildingNative[0],49,0);f.world.players[0].raw[0x601]=0;
    damageNativeBuilding(f.world,0,900,null,f.context);expect(f.world.players[0].raw[0x601]).toBe(0);expect(f.factories.at(-1)).toMatchObject({code:5,parameter:1});expect(f.trace).toContain("stop-audio");expect(f.trace).toContain("collapse:false");
  });
  it("applies partial damage, depletion capacity and exact random fragment chance",()=>{
    const f=fixture(0);put(f.world.buildingNative[0],43,310);put32(f.world.buildingNative[0],54,12345);
    const out=damageNativeBuilding(f.world,0,20,null,f.context),n=f.world.buildingNative[0];expect(out.destroyed).toBe(false);expect(word(n,43)).toBe(290);expect(word(n,49)&0x140).toBe(0x140);expect(n[21]!&4).toBe(4);expect(dword(n,54)).toBe(0);expect(n[48]).toBe(11);expect(word(f.world.players[0].raw,0x5ec)).toBe(1000);expect(word(f.world.players[0].raw,0x5f4)).toBe(100);expect(f.factories).toHaveLength(1);expect(f.factories[0]).toMatchObject({code:27,angles:[0,-160,5120],parameter:80});expect(f.world.rng.draws).toBe(6);expect(f.trace).toContain("depleted-audio");
  });
  it("writes current roots after a real nested factory rebinds serializable world objects",()=>{
    const f=fixture(),original=f.context.createEffect;f.context.createEffect=(w,r)=>{const result=original(w,r);w.players=structuredClone(w.players);w.buildingNative=w.buildingNative.map(n=>n.slice());return result;};
    damageNativeBuilding(f.world,0,900,null,f.context);expect(f.world.players[0].raw[0x603]).toBe(0);expect(f.world.players[0].raw[0x4a2]).toBe(1);expect(f.world.buildingNative[0][6]).toBe(0);
  });
  it("requires real dependent factories and keeps an outer source transaction reviewable",()=>{
    const f=fixture(),before=JSON.stringify(f.world),staged=structuredClone(f.world);f.context.createCollapse=undefined as never;
    expect(()=>damageNativeBuilding(staged,0,900,null,f.context)).toThrow(/4EB80/);expect(JSON.stringify(f.world)).toBe(before);expect(f.factories).toEqual([]);
  });
  it("preserves source pointer-linear vertex clearing at X127 and rejects crossing another pool",()=>{
    const f=fixture();const cells=clearDestroyedFootprint(f.world.terrain,[32767,10*256],1);expect(cells).toContain(11*128);expect(f.world.terrain.bytes[11*128*14+11]&16).toBe(0);expect(f.world.terrain.bytes[10*128*14+11]&16).toBe(16);
    expect(()=>clearDestroyedFootprint(f.world.terrain,[32767,127*256],1)).toThrow(/another source pool/);
  });
});
