/** Complete11 inside the existing owner/slot transaction. Old packs retain
 * their separately bounded legacy callback; no new profile is synthesized. */
import type {Pack} from "../../content/types";
import type {CampaignWorld} from "./world";
import type {CampaignSpecialistServices} from "./specialist-adapter";
import type {EconomyEvent,EconomyReason} from "../mechanics/economy";
import {stepStagedNativeExtractor,type NativeExtractorReceipt,type ExtractorAudio} from "../mechanics/extractor";
import {prepareExtractorDepletedCell} from "../mechanics/extractor-material";
import {animationProfile} from "../mechanics/animation";
import {requestAudio,requestAudioIfPlayingStopPlay} from "../mechanics/audio";
import {updateNativeBuildingCapacity} from "../mechanics/building-damage";
import {createStagedSmokeEffect} from "./effect-scheduler";
import {damageCampaignMule} from "./mule-damage-adapter";
import {campaignBuildingAsset} from "./building-startup-adapter";
import {campaignEntity,synchronizeCampaignLinks} from "./entity-view";
import {worldCell} from "../mechanics/terrain";
import {i16,u16,u32} from "./bytes";
import type {SourceEntityId} from "./source-pools";

export type CampaignExtractorServices=Pick<CampaignSpecialistServices,"effectOptions">;
export interface ExtractorPresentationRequest {
  type:"building-queue-request"|"terrain-dirty-request"|"extractor-empty"|"selection-refresh";
  entry:number;
  slot:number;
  point?:[number,number];
  action?:number;
  animationFrame?:number;
  sourceCapacity?:256;
  originalQueueOutcome?:"not-modeled";
}
export interface CampaignExtractorReceipt extends NativeExtractorReceipt {
  events:EconomyEvent[];
  reasons:{buildingId:number;reason:EconomyReason}[];
  factoriesAlreadyApplied:true;
  terrainAlreadyApplied:true;
  presentationRequests:ExtractorPresentationRequest[];
}
export function hasNativeExtractorProfile(pack:Pack):boolean{return pack.extractorRules!==undefined;}
function current(w:CampaignWorld,slot:number){
  const n=w.buildingNative[slot],b=w.buildings.find(v=>v.slot===slot),e=w.economy.buildings.find(v=>v.owner*64+v.slot===slot);
  if(!Number.isInteger(slot)||slot<0||slot>255||!n||n.length!==67||n[6]!==4||n[45]!==11||n[24]!==Math.floor(slot/64)||i16(n as number[],15)!==slot||!b||!e||b.id!==e.id||b.selector!==11||e.selector!==11||b.owner!==n[24]||e.owner!==n[24])throw Error("Actual Extractor native/building/economy binding required");
  if([...n.slice(7,11),...n.slice(25,31),...n.slice(43,52),...n.slice(54,58),...n.slice(61,64)].some(v=>v===null))throw Error("Actual Extractor numeric prior required");
  return{n,b,e};
}
/** Hydrate actual native priors; this entry does not assign audio status. */
export function refreshStagedCampaignExtractor(w:CampaignWorld,slot:number):void{
  const{n,b,e}=current(w,slot),flags=u16(n as number[],49),grade=n[46]!;
  if(grade>2||!e.extractor)throw Error("Actual Extractor grade/cycle projection required");
  b.x=e.x=i16(n as number[],7);b.y=e.y=i16(n as number[],9);b.grade=e.grade=grade as 0|1|2;b.health=i16(n as number[],43);b.complete=e.complete=!!(flags&1);b.energy=e.energy=i16(n as number[],61);
  e.powered=!!(flags&4);e.disabled=!!(flags&0x40);e.capacitySuppressed=!!(flags&0x840);e.hqUpgradeSuppressed=!!(flags&0x140);e.depleted=!!(flags&0x200);e.extraDrain=n[63]!;e.storedGoop=u32(n as number[],54)|0;
  Object.assign(e.extractor,{cycle:n[51]!,hold:n[26]!,frame:n[27]!,stepDelay:(n[29]!<<24)>>24,delay:(n[30]!<<24)>>24});
  if(e.producer)Object.assign(e.producer.animation,{action:n[25]!,hold:n[26]!,frame:n[27]!,direction:(n[28]!<<24)>>24,delay:(n[29]!<<24)>>24,counter:(n[30]!<<24)>>24});
  const p=w.players[e.owner],ep=w.economy.players.find(v=>v.id===e.owner);
  if(!p||!ep||p.raw.length!==1805||p.raw[1]!==e.owner||p.raw[0x4a1]!==e.owner)throw Error("Actual Extractor raw player required");
  p.goop=ep.goop=u32(p.raw,0x4a7);ep.capacity=u32(p.raw,0x5e6);ep.noPowerWarningTicks=i16(p.raw,0x5ea);
}
function virtual68(w:CampaignWorld,index:number):boolean{
  const e=campaignEntity(w,`source:0:${index}`);
  if(!e||e.kind!==1||e.native[94]===null)throw Error("Actual kind1 Extractor virtual68 required");
  return e.native[94]!>=24;
}
/** Exact single-cell head→next8B000/8B080 selection. Own is a separate lazy call. */
export function queryExtractorContact(w:CampaignWorld,point:readonly[number,number],owner:number,mode:"foreign"|"own"):number|null{
  const raw=w.players[owner]?.raw;
  if(!raw||raw.length!==1805||!Number.isInteger(raw[1])||!Number.isInteger(raw[0x6e5]))throw Error("Actual Extractor contact player identity/alliance required");
  let id=w.spatial.heads[worldCell(...point)];const seen=new Set<SourceEntityId>();
  while(id){
    if(seen.has(id))throw Error("Extractor contact spatial cycle");seen.add(id);
    const node=w.spatial.nodes[id],e=campaignEntity(w,id);
    if(!node||!e)throw Error("Actual Extractor contact spatial binding required");
    if(e.kind===1){const targetOwner=e.native[24];if(targetOwner===null||targetOwner===undefined)throw Error("Extractor target owner is unknown");const eligible=mode==="own"?targetOwner===raw[1]:targetOwner!==raw[1]&&!(raw[0x6e5]&(1<<targetOwner));if(eligible&&!virtual68(w,e.index))return e.index;}
    id=node.next;
  }
  return null;
}
function admitted(w:CampaignWorld,slot:number,pack:Pack){
  if(!pack.extractorRules||!pack.economyRules||!pack.buildingRules||!pack.rules)throw Error("Complete additive Extractor profile is required");
  const key=campaignBuildingAsset(pack,11),asset=pack.assets[key];
  if(!asset)throw Error("Actual Extractor building resource required");
  for(let g=0;g<3;g++){const p=pack.extractorRules.provenance.animationProfiles[g],profile=animationProfile(asset,g+1);if(p.grade!==g||p.action!==g+1||profile.flags!==p.flags||profile.holds.length!==20||profile.holds.some((v,i)=>v!==pack.extractorRules!.frameHolds[g][i]))throw Error("Additive Extractor profile/resource admission differs");}
  current(w,slot);
  return{key,rules:pack.extractorRules};
}
/** In-place complete callback. The outer owner pass supplies transactionality. */
export function stepStagedCampaignExtractor(w:CampaignWorld,slot:number,pack:Pack,services:CampaignExtractorServices):CampaignExtractorReceipt{
  const{key,rules}=admitted(w,slot,pack);refreshStagedCampaignExtractor(w,slot);
  const{n,b,e}=current(w,slot),oldPower=e.powered,events:EconomyEvent[]=[],presentationRequests:ExtractorPresentationRequest[]=[],ecology=w.ecology,resources=w.economy.resources,heldPlayers=w.players.map(p=>p.raw),heldMules=w.ecology.mules.map(m=>({m,n:m.native}));
  const check=()=>{if(w.buildingNative[slot]!==n||w.buildings.find(v=>v.slot===slot)!==b||w.economy.buildings.find(v=>v.id===e.id)!==e||w.ecology!==ecology||w.economy.resources!==resources||w.players.some((p,i)=>p.raw!==heldPlayers[i])||heldMules.some(v=>!w.ecology.mules.includes(v.m)||v.m.native!==v.n))throw Error("Extractor service replaced held host/native/player aliases");};
  const audio=(q:ExtractorAudio)=>requestAudio(w.audio,{frame:w.frame,entity:`building:${b.id}`,cue:q.cue,mode:q.type==="stop"?4:2,parameter:q.parameter??0,gain:q.type==="stop"?1:(q.volume??127)/127,range:q.type==="stop"?null:q.range??100,...(q.initialRatePercent===undefined?{}:{initialRatePercent:q.initialRatePercent})});
  const r=stepStagedNativeExtractor(w,slot,{
    upkeep:pack.buildingRules!.upkeep,contactOffset:rules.contactOffset,workDelayBase:pack.economyRules!.extractor.workDelay,
    profile:(_s,_i,action)=>animationProfile(pack.assets[key],action),audio:(_s,q)=>audio(q),
    conditionalAudio:(_s,q)=>requestAudioIfPlayingStopPlay(w.audio,{frame:w.frame,entity:`building:${b.id}`,cue:q.cue,nextCue:q.nextCue,nextParameter:q.nextParameter,nextRange:q.nextRange,nextGain:q.nextGain}),
    createSmoke(s,q){if(!s.landings.length)throw Error("Actual Extractor smoke particle host required");const priors=s.powerEffects.slots.map(v=>v.nativePrior),made=createStagedSmokeEffect(s,q,pack,services.effectOptions(s));if(made!==null){const native=s.powerEffects.slots[made].nativePrior,held=priors[made];if(!native||!held)throw Error("Actual smoke retained native prior required");held.splice(0,held.length,...native);s.powerEffects.slots[made].nativePrior=held;for(const landing of s.landings)for(const p of landing.particles)if(p.slot===made)p.native=held as number[];}check();return made;},
    firstForeignCreature:(s,p,o)=>queryExtractorContact(s,p,o,"foreign"),firstOwnCreature:(s,p,o)=>queryExtractorContact(s,p,o,"own"),creatureVirtual68:virtual68,
    damageCreature(s,index,amount,attacker){damageCampaignMule(s,pack,index,amount,attacker);check();},
    depleteCell(s,cell){const result=prepareExtractorDepletedCell(s.terrain,cell,pack.rules!.tables.terrainBorder);for(const point of result.dirtyPoints)presentationRequests.push({type:"terrain-dirty-request",entry:0x84e10,slot,point});},
    resourceChanged(s,cell){resources[cell]=s.terrain.bytes[cell*14+13];},
    exhausted(s,i){updateNativeBuildingCapacity(s,e.owner);refreshStagedCampaignExtractor(s,i);presentationRequests.push({type:"extractor-empty",entry:0x44e50,slot:i});if(s.phase==="active"){const footprint=pack.rules!.tables.buildingFootprints[11];if(!Number.isInteger(footprint))throw Error("Actual Extractor footprint required");audio({type:"play",slot:i,cue:78,mode:2,parameter:0,volume:127,range:100,initialRatePercent:115-footprint*15});presentationRequests.push({type:"selection-refresh",entry:0x44e50,slot:i});}},
    dirtyScanEndpoint:(_s,point)=>{presentationRequests.push({type:"terrain-dirty-request",entry:0x84e10,slot,point});},
    queueBuilding(s,i){presentationRequests.push({type:"building-queue-request",entry:0x83140,slot:i,action:s.buildingNative[i][25]!,animationFrame:s.buildingNative[i][27]!,sourceCapacity:256,originalQueueOutcome:"not-modeled"});},
  });
  check();refreshStagedCampaignExtractor(w,slot);synchronizeCampaignLinks(w);
  if(r.harvested)events.push({type:"goop-harvested",buildingId:b.id,cell:r.selectedCell!,consumed:r.harvested,credited:r.credited});
  if(oldPower!==e.powered)events.push({type:e.powered?"power-restored":"power-lost",buildingId:b.id});
  const reason:EconomyReason=!e.complete?"under-construction":r.empty?"resource-exhausted":r.harvested?"harvesting":!r.operational?"unpowered":w.economy.players[e.owner].goop>=w.economy.players[e.owner].capacity?"capacity-full":"cycle-wait";
  return{...r,events,reasons:[{buildingId:b.id,reason}],factoriesAlreadyApplied:true,terrainAlreadyApplied:true,presentationRequests};
}
export function stepCampaignExtractor(w:CampaignWorld,slot:number,pack:Pack,services:CampaignExtractorServices):CampaignExtractorReceipt{
  const staged=structuredClone(w),options=services.effectOptions(w);options.stageHost?.(w,staged);for(const m of staged.ecology.mules)staged.creatureNative[m.index]=m.native;
  const r=stepStagedCampaignExtractor(staged,slot,pack,services);Object.assign(w,staged);options.commitHost?.(w,staged);return r;
}
