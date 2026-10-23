import {describe,it,expect} from "vitest";
import {campaignFixture} from "./fixtures/campaign";
import {makeEtherealRecord,updateEtherealRecord,putEtherealWord as put,putEtherealDword as put32,etherealWord as word,etherealDword as dword,type EtherealRecord,type EtherealState,type EtherealContext} from "../src/sim/mechanics/ethereal";
import type {PunishmentTarget,EtherealPunishmentServices} from "../src/sim/mechanics/ethereal-punishment";
import {terrainFromBytes,groundHeight} from "../src/sim/mechanics/terrain";
function fixture(){const pack=campaignFixture(),raw=Array(229376).fill(0);for(let i=0;i<16384;i++){put(raw,i*14+2,1000);raw[i*14+5]=2;}const terrain=terrainFromBytes(raw),g=groundHeight(terrain,8192,8192),prior={slot:0,native:Array.from({length:102},(_,i)=>i>=31&&i<39?null:0),binding:null} as EtherealRecord,
    parent=makeEtherealRecord(prior,{selector:0,owner:0,position:[8192,8192],initialHeight:g+12800},{terrain}),state:EtherealState={schemaVersion:1,records:[parent],count:1},player=Array(1805).fill(0),targets=new Map<string,PunishmentTarget>(),trace:string[]=[];
  parent.native[0x56]=7;parent.native[0x57]=1;parent.native[0x58]=2;parent.native[0x16]=0;parent.native[0x49]=0;put(parent.native,0x3f,0);put(parent.native,0x41,0);put32(parent.native,0x45,512);put(parent.native,0x3b,512);put32(player,17,-1000);
  const services:EtherealPunishmentServices={resolve:(kind,index)=>targets.get(`${kind}:${index}`)??null,nearby:()=>Array(7).fill(null),cancelUnitWork:(_p,t)=>{trace.push(`cancel:${t.index}:${t.native[0x55]}`);},removeUnit:(_p,t)=>{trace.push(`remove:${t.index}`);t.native[6]=0;player[3]--;},damageBuilding:(_p,t,damage)=>{trace.push(`damage:${t.index}:${damage}`);t.health=0;t.native[6]=0;player[0x4a2]--;},attack:(_p,t)=>{trace.push(`attack:${t.kind}:${t.index}`);}};
  const c:EtherealContext={terrain,tables:pack.rules!.tables,bounce:pack.rules!.tables.bounce,frame:0,water:0,profile:()=>({holds:Array(11).fill(0),flags:1,first:8,last:18}),currentPointAccepted:()=>true,buildings:(owner)=>Array.from({length:64},(_,i)=>{const t=targets.get(`4:${owner*64+i}`);return {slot:owner*64+i,owner,active:!!t&&t.native[6]!==0,complete:true,selector:i===3?1:0,x:t?.position[0]??0,y:t?.position[1]??0,flags0100:false};}),playerTarget:()=>[8192,8192],zones:[],playerCounter:()=>dword(player,17),responseThreshold:100,punishmentDivisor:256,observationThresholds:[16,64,128],rewardSiteAccepted:()=>true,playerInactive:()=>false,playerRaw:()=>player,punishment:services};
  const rng={seed:5428,draws:0,ring:null};
  const step=()=>{const out=updateEtherealRecord(state.records[0],state,c,rng);state.records[0]=out.after;if(out.playerCounterAfter!==null)put32(player,17,out.playerCounterAfter);c.frame++;return out;};
  const add=(kind:1|3|4,index:number)=>{const n:Array<number|null>=Array(kind===3?200:kind===4?67:124).fill(0);n[6]=kind;put(n,15,index);const target:PunishmentTarget={id:`source:${kind-1}:${index}`,kind,index,owner:0,position:[8192,8192],ground:g,height:g,health:100,native:n};targets.set(`${kind}:${index}`,target);return target;};
  const arrive=()=>{const n=state.records[0].native;put(n,7,word(n,11));put(n,9,word(n,13));put32(n,0x27,dword(n,0x60));n[0x16]=n[0x16]!&0x3f;n[0x49]=n[0x49]!|0x10;};
  return {state,c,rng,player,trace,services,step,add,arrive};
}
describe("source state7 Ethereal punishment orchestration",()=>{
  it("selects a real owner building, channels100, destroys at current health and credits after50",()=>{
    const f=fixture();f.player[0x4a2]=1;const building=f.add(4,3);f.player[0x601]=1;
    f.step();let n=f.state.records[0].native;expect(n[0x57]).toBe(2);expect([word(n,0x59),n[0x5b]]).toEqual([3,4]);expect([word(n,11),word(n,13),dword(n,0x60)]).toEqual([8224,8224,14800]);expect(f.rng.draws).toBe(2);
    f.arrive();f.step();expect(word(f.state.records[0].native,0x64)).toBe(100);
    for(let i=0;i<99;i++)f.step();expect(f.trace).toEqual([]);f.step();expect(f.trace).toEqual(["damage:3:100"]);expect(building.health).toBe(0);expect(f.state.records[0].native[0x57]).toBe(4);expect(word(f.state.records[0].native,0x64)).toBe(50);
    for(let i=0;i<50;i++)f.step();expect(f.state.records[0].native[0x57]).toBe(0);expect(dword(f.player,17)).toBe(-936);expect(f.rng.draws).toBe(2);
  });
  it("uses30 attempts for abduction-ineligible units without canceling or fabricating a target",()=>{
    const f=fixture();f.state.records[0].native[0x58]=3;f.player[3]=1;f.player[4]=2;f.add(3,2).native[0x71]=4;
    f.step();expect(f.state.records[0].native[0x57]).toBe(0);expect(f.rng.draws).toBe(30);expect(f.trace).toEqual([]);
  });
  it("performs actual cancel binding,30/40/120 phases, unit lift and required removal before credit",()=>{
    const f=fixture();f.state.records[0].native[0x58]=3;f.player[3]=1;f.player[4]=2;const unit=f.add(3,2);unit.native[0x55]=9;
    f.step();expect(f.trace).toEqual(["cancel:2:9"]);expect([unit.native[0x55],unit.native[25],word(unit.native,0x7f),unit.native[0x81],dword(unit.native,0x68)]).toEqual([3,8,0,8,10]);
    f.arrive();f.step();for(let i=0;i<30;i++)f.step();expect(f.state.records[0].native[0x57]).toBe(4);for(let i=0;i<40;i++)f.step();expect(f.state.records[0].native[0x57]).toBe(5);expect(unit.native[0x15]!&32).toBe(32);
    f.step();expect(dword(unit.native,0x27)).toBeGreaterThan(unit.ground);for(let i=0;i<119;i++)f.step();expect(f.trace).toEqual(["cancel:2:9","remove:2"]);expect(f.player[3]).toBe(0);expect(dword(f.player,17)).toBe(-872);expect(f.rng.draws).toBe(1);
  });
  it("uses the randomized source query then stable per-kind choice and real following reference",()=>{
    const f=fixture();f.state.records[0].native[0x58]=1;const unit=f.add(3,2);let count=0;
    f.services.nearby=(_parent,q)=>{count=q.points.length;expect(q.radius).toBe(2048);const result=Array(7).fill(null);result[3]=unit;return result;};
    f.step();const n=f.state.records[0].native;expect(count).toBe(197);expect(f.rng.draws).toBe(3);expect([word(n,0x50),n[0x52],word(n,0x64),dword(n,0x60)]).toEqual([2,3,30,12800]);
    unit.position=[8195,8197];f.step();expect([word(f.state.records[0].native,11),word(f.state.records[0].native,13)]).toEqual(unit.position);
    for(let i=0;i<29;i++)f.step();expect(f.trace).toEqual([]);f.step();expect(f.trace).toEqual(["attack:3:2"]);expect(dword(f.player,17)).toBe(-984);expect(word(f.state.records[0].native,0x3f)).toBe(0);
  });
  it("requires destructive services on the exact call instead of advancing a fake successful damage",()=>{
    const f=fixture();f.add(4,3);let n=f.state.records[0].native;n[0x58]=2;n[0x57]=3;put(n,0x64,1);put(n,0x59,3);n[0x5b]=4;
    f.services.damageBuilding=undefined as never;const before=JSON.stringify(n);expect(f.step).toThrow(/446D0/);expect(JSON.stringify(f.state.records[0].native)).toBe(before);expect(f.trace).toEqual([]);
  });
});
