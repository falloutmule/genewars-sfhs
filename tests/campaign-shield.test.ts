import { describe, expect, it } from 'vitest';
import { processorFixture } from './fixtures/processor';
import { stepCampaign, continueCampaign } from '../src/sim/campaign/world';
import { loadCampaign, saveCampaign, recordCampaign, sealCampaignReplay, replayCampaign } from '../src/sim/campaign/persistence';
import { put16 } from '../src/sim/campaign/bytes';
import { checksum } from '../src/sim/checksum';
import { synchronizePowerAdapter } from '../src/sim/campaign/power-adapter';
function fixture(energy:number) {
 const {w,pack}=processorFixture(4);
 // Explicit synthetic completed12 state; construction is not exercised here.
 w.buildingNative[0][45]=12;w.buildings[0].selector=w.economy.buildings[0].selector=12;
 w.players[0].completed[4]=w.players[0].raw[0x604]=0;
 w.players[0].completed[12]=w.players[0].raw[0x60c]=1;
 w.players[0].owned=1<<12;put16(w.players[0].raw,0x60e,1<<12);
 put16(w.buildingNative[0] as number[],61,energy);
 w.buildings[0].energy=w.economy.buildings[0].energy=energy;
 w.rng.seed=0;
 for(const [code,length,mode,priority] of [[9,5,0,15],[65,1,5,10],[66,1,5,11]]) {
  pack.assets.EFF.animations![code]={first:0,last:length-1,rawTrailingWord:length};
  Object.assign(pack.effectRules!.descriptors[code],{retirementMode:mode,priority,movable:false,gravity:false,waterResponse:false});
 }
 return {w,pack};
}
describe('campaign shield building and ring effects',()=>{
 it('preserves the result when ring cleanup for mission carry is not established',()=>{
  const {w,pack}=fixture(200);
  stepCampaign(w,pack);
  w.result.phase='campaign-view-queued';
  const before=checksum(w);
  expect(()=>continueCampaign(w,pack)).toThrow(/Shield ring mission carry/);
  expect(checksum(w)).toBe(before);
 });
 it.each([200,0])('runs powered/shutdown energy%s with live rings through save and replay',(energy)=>{
  const {w,pack}=fixture(energy),recording=recordCampaign(w,null);
  stepCampaign(w,pack);
  expect(w.notices.filter(n=>n.severity==='error')).toEqual([]);
  expect(w.phase).toBe('active');
  expect(w.shieldWaves?.some(n=>n[448]===1)).toBe(true);
  expect(w.collapse.records.some(n=>n[6]===6&&[4,5].includes(n[39]!))).toBe(true);
  const segments=w.powerEffects.slots.flatMap((s,i)=>s.occupied&&s.nativePrior?.[69]===66?[i]:[]);
  expect(segments.length).toBeGreaterThan(0);
  for(const i of segments)expect(w.spatial.nodes[`source:4:${i}`]).toBeUndefined();
  const beforeSync=checksum(w.powerEffects);
  synchronizePowerAdapter(w);
  expect(checksum(w.powerEffects)).toBe(beforeSync);
  for(const i of segments)expect(w.powerEffects.slots[i].occupied).toBe(true);
  const resumed=loadCampaign(saveCampaign(w,{paused:true,speed:1,accumulator:0}),w.contentHash).world;
  for(let i=0;i<96;i++) {
   stepCampaign(w,pack);stepCampaign(resumed,pack);
   expect(w.phase).toBe('active');
   if(i%16===0)expect(checksum(resumed)).toBe(checksum(w));
  }
  expect(checksum(resumed)).toBe(checksum(w));
  expect(checksum(replayCampaign(sealCampaignReplay(recording,w),pack,w.contentHash))).toBe(checksum(w));
  expect(w.notices.filter(n=>n.severity==='error')).toEqual([]);
 },30000);
});
