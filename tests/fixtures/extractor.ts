import{campaignFixture}from"./campaign";
import{createCampaign,enterCampaign,stepCampaign,type CampaignWorld}from"../../src/sim/campaign/world";
import{createNativeBuilding,progressNativeBuilding}from"../../src/sim/mechanics/building-native";
import{initializeMuleNative}from"../../src/sim/mechanics/genepod";
import{groundHeight,worldCell}from"../../src/sim/mechanics/terrain";
import{put16 as write16,put32}from"../../src/sim/campaign/bytes";
import{insertSpatial}from"../../src/sim/campaign/spatial";
import{synchronizeCampaignLinks}from"../../src/sim/campaign/entity-view";
import{cleanupCampaignReferences}from"../../src/sim/campaign/cleanup";
const put16=(n:(number|null)[],p:number,v:number)=>write16(n as number[],p,v);
/** Invented content and disclosed prebuilt/grade/power grants. Actual retained
 * pool/constructor/progress/Mule factory APIs; no original data or acceptance. */
export function extractorFixture(){
 const pack=campaignFixture(),sha="0".repeat(64),frame=pack.assets.TEST.frames![0];
 pack.assets.EXTRACTOR_TEST={...pack.assets.TEST,frames:Array.from({length:66},(_,i)=>({...structuredClone(frame),rawFlags:[i===9?1:0,0,0]})),animations:[{first:0,last:2,rawTrailingWord:3},...[0,1,2].map(g=>({first:3+g*20,last:22+g*20,rawTrailingWord:20})),{first:63,last:65,rawTrailingWord:3}]};
 const holds=([0,1,2]as const).map(g=>Array.from({length:20},(_,i)=>3+g*20+i===9?1:0))as[number[],number[],number[]];
 pack.extractorRules={schemaVersion:1,contactOffset:[0,256],frameHolds:holds,provenance:{sourceVersion:"synthetic-extractor",executableSha256:sha,originalExecution:false,contactOffset:{object:3,objectOffset:0x4574,bytes:4,sha256:sha},animationProfiles:([0,1,2]as const).map(g=>({grade:g,action:g+1,resource:"BMINE.ANB"as const,resourceSha256:sha,resourceBytes:34955 as const,frameTableOffset:33981 as const,animationTableOffset:34905 as const,firstFrameOffset:(3+g*20)*14,lastFrameOffset:(22+g*20)*14,frameStride:14 as const,holdByteOffsetWithinFrame:10 as const,flags:0 as const}))as any}};
 pack.buildingRules={schemaVersion:1,resources:Array.from({length:14},(_,selector)=>({selector,path:`SYNTHETIC/${selector}.ANB`,assetKey:selector===11?"EXTRACTOR_TEST":"TEST"})).filter(v=>v.selector!==9),unsupportedSelectors:[9],upkeep:Array.from({length:14},(_,i)=>i===11?1:0),processingFrontOffset:[0,0],provenance:{executableSha256:sha,originalExecution:false}};
 /** Source-backed work delay (tools/import-original/economy_profile.py emits 5).
  * The inherited synthetic pack carried the legacy grade-zero value 1, which the
  * admitted callback rejects: base-grade must stay positive for grade 2. */
 pack.economyRules!.extractor.workDelay=5;
 for(const code of[6,32,33]){const count=code===6?13:code===32?10:4,eff=pack.assets.EFF;while(eff.animations!.length<=code)eff.animations!.push({first:0,last:1,rawTrailingWord:2});const first=eff.frames!.length;for(let i=0;i<count;i++)eff.frames!.push({...structuredClone(frame),rawFlags:[0,0,0]});eff.animations![code]={first,last:first+count-1,rawTrailingWord:count};}
 pack.effectRules={schemaVersion:1,descriptors:Array.from({length:71},(_,code)=>({code,retirementMode:0,gravity:false,priority:code===6?10:1,childCode:null,movable:false,waterResponse:false})),provenance:{executableSha256:sha,originalExecution:false}};
 pack.ecologyRules!.muleCombat={queryRadius:512,attack:1,defense:1,disposition:0,foodWeights:[1,1,1],attackChannel:41};
 const w=createCampaign(pack,"synthetic-complete-extractor");enterCampaign(w,pack);for(let i=0;i<200;i++)stepCampaign(w,pack);if(w.phase!=="active")throw Error(JSON.stringify(w.notices));
 const services={effectOptions:()=>({gravity:512,obstacleAt:()=>false,destructionObstacle:()=>null,cleanupReferences:cleanupCampaignReferences})};
 function addBuilding(slot=0,grade:0|1|2=0,position:[number,number]=[8192,8192],selector:0|3|6|11=11){
  const n=w.buildingNative[slot],owner=Math.floor(slot/64),made=createNativeBuilding(n,{slot,owner,selector,position,ground:groundHeight(w.terrain,...position),shade:32});if(!made.ok)throw Error(made.reason);n.splice(0,67,...made.value);const done=progressNativeBuilding(n,{increment:80,maximumHealth:80,loading:false});if(!done.ok)throw Error(done.reason);n.splice(0,67,...done.value.native);n[46]=n[47]=grade;n[25]=grade+1;n[51]=0;put16(n,49,5);put16(n,61,200);
  const b={id:1000+slot,slot,owner,selector,grade,x:position[0],y:position[1],health:80,complete:true,energy:200};w.buildings.push(b);w.economy.buildings.push({...b,slot:slot%64,powered:true,disabled:false,capacitySuppressed:false,hqUpgradeSuppressed:false,extraDrain:0,depleted:false,storedGoop:0,specialPowerDelivery:false,...(selector===11?{extractor:{cycle:0,frame:0,delay:0,hold:0,stepDelay:0,workAudioActive:false}}:{})});
  w.players[owner].raw[0x4a2]++;w.players[owner].completed[selector]++;w.players[owner].raw[0x600+selector]++;w.players[owner].owned|=1<<selector;put16(w.players[owner].raw,0x60e,w.players[owner].owned);if(selector===11){put32(w.players[owner].raw,0x5e6,600);w.economy.players[owner].capacity=600;}
  insertSpatial(w.spatial,w.terrain,`source:3:${slot}`,worldCell(...position));synchronizeCampaignLinks(w);return n;
 }
 function addMule(index=0,owner=4,position:[number,number]=[8192,8448]){
  const made=initializeMuleNative(w.creatureNative[index],w.rng,{slot:index,owner,position,quality:50},{terrain:w.terrain,tables:pack.rules!.tables});if(!made.ok)throw Error(made.reason);
  const native=made.value.native;native[94]=8;w.rng=made.value.rng;w.creatureNative[index]=native;const mule={id:`source:0:${index}`as const,index,native,pending:[]};w.ecology.mules.push(mule);insertSpatial(w.spatial,w.terrain,`source:0:${index}`,worldCell(...position));put16(w.missionPrefix,0x3550,w.ecology.mules.length);synchronizeCampaignLinks(w);return mule;
 }
 return{w,pack,services,addBuilding,addMule};
}
