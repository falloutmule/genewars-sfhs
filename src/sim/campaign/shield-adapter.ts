/** Native shield callbacks inside the existing campaign owner transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import { stepShieldBuilding } from "../mechanics/shield-building";
import { collideShieldEntity } from "../mechanics/shield-response";
import { makeShieldEffect, type ShieldEffectInput } from "../mechanics/shield-effect";
import { createShieldWave, type ShieldWaveWorld } from "../mechanics/shield-wave";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { groundHeight, worldCell } from "../mechanics/terrain";
import { effectTerrainShade } from "../mechanics/power-motion";
import { campaignBuildingAsset } from "./building-startup-adapter";
import { campaignEntity, campaignBlastTarget, synchronizeCampaignLinks } from "./entity-view";
import { allocateStagedSharedEffect, publishStagedSharedEffect, retireStagedSharedEffect, createStagedDestructionEffect } from "./effect-scheduler";
import { damageCampaignBuilding } from "./building-damage-adapter";
import { damageCampaignMule } from "./mule-damage-adapter";
import { damageCampaignSpecialist, mirrorCampaignSpecialist, type CampaignSpecialistServices } from "./specialist-adapter";
import type { SourceEntityId } from "./source-pools";
import { i16, u16 } from "./bytes";

function waves(w: CampaignWorld): ShieldWaveWorld {
  if (!w.shieldWaves) {
    if (w.collapse.records.some(n => n[6] !== 0 && [4, 5].includes(n[39]!)) ||
        w.powerEffects.slots.some(s => s.occupied && s.nativePrior?.[69] === 66))
      throw Error("Live shield waves cannot be reconstructed from an absent pool");
    // Verified cold object3 range114D50..115B57 is entirely zero. Earlier
    // runtime versions could not create these waves. Retain every later byte.
    w.shieldWaves = Array.from({length:8},()=>Array(449).fill(0));
  }
  return w as CampaignWorld & ShieldWaveWorld;
}
export function createCampaignShieldWave(w: CampaignWorld, pack: Pack,
  services: CampaignSpecialistServices, code: 4 | 5, owner: number,
  position: [number, number], grade: number) {
  if (!pack.rules) throw Error("Original shield wave tables required");
  return createShieldWave(waves(w), code, owner, position, grade, pack.rules.tables,
    (wave, segment, at, height) => {
      createCampaignShieldEffect(w, pack, services, {code:66,owner:wave,position:at,height,delay:segment});
    });
}
export function createCampaignShieldEffect(w: CampaignWorld, pack: Pack,
  services: CampaignSpecialistServices,
  request: Omit<ShieldEffectInput, "slot" | "ground" | "shade">) {
  if (!pack.rules) throw Error("Original shield effect tables required");
  const options=services.effectOptions(w),slot=allocateStagedSharedEffect(w,request.code,pack,options);
  if(slot===null)return null;
  makeShieldEffect(w.powerEffects.slots[slot].nativePrior!,{
    ...request,slot,ground:groundHeight(w.terrain,...request.position),
    shade:effectTerrainShade(w.terrain,...request.position),
  },w.rng,pack.rules.tables,n=>publishStagedSharedEffect(w,slot,n),
  (code,owner,at,grade)=>{createCampaignShieldWave(w,pack,services,code,owner,at,grade);});
  return slot;
}
export function stepStagedCampaignShield(w: CampaignWorld,slot:number,pack:Pack,services:CampaignSpecialistServices) {
  const n=w.buildingNative[slot],b=w.buildings.find(b=>b.slot===slot),
    e=w.economy.buildings.find(b=>b.owner*64+b.slot===slot);
  if(!pack.buildingRules||!pack.rules||!n||!b||!e||n[45]!==12||b.selector!==12||e.selector!==12)
    throw Error("Actual shield building host binding required");
  const owner=n[24]!,player=w.players.find(p=>p.id===owner);
  if(!player)throw Error("Actual shield owner required");
  const audio=(id:SourceEntityId,cue:number,range:number)=>requestAudio(w.audio,{
    frame:w.frame,entity:id,cue,mode:2,parameter:0,gain:1,range,
  });
  let queueRequested=false;
  stepShieldBuilding(n,{
    upkeep:pack.buildingRules.upkeep[12],tables:pack.rules.tables,rng:w.rng,player:player.raw,
    profile:action=>animationProfile(pack.assets[campaignBuildingAsset(pack,12)],action),
    query(points) {
      for(const point of points) {
        let id=w.spatial.heads[worldCell(...point)],visited=0;
        while(id) {
          if(++visited>2048)throw Error("Shield query spatial chain did not terminate");
          const entity=campaignEntity(w,id);
          if(!entity)throw Error("Actual shield spatial entity missing");
          const target=entity.native;
          if([1,3,5,8].includes(entity.kind)) {
            const view=campaignBlastTarget(w,pack,id),targetId=id;
            collideShieldEntity(n,target,pack.rules!.tables,{
              physicalHeight:view.height,movable:view.movable,alliedOwners:player.raw[0x6e5],
              effect(code,effectOwner,position,height) {
                if(code===5)createStagedDestructionEffect(w,{code:5,owner:0,position,height,angles:[0,0,0],parameter:0,delay:0},pack,services.effectOptions(w));
                else createCampaignShieldEffect(w,pack,services,{code:65,owner:effectOwner,position,height,delay:64,shield:n});
              },
              audio:cue=>audio(targetId, cue,75),
              damage:amount=>{
                if(entity.kind===1)damageCampaignMule(w,pack,entity.index,amount,null);
                else if(entity.kind===3)damageCampaignSpecialist(w,entity.index,amount,null,pack,services);
                else throw Error("Unexpected shield target damage family");
              },
              retire:()=>retireStagedSharedEffect(w,entity.index,services.effectOptions(w)),
            });
            if(entity.kind===3 && target[6]===3)mirrorCampaignSpecialist(w,entity.index);
          }
          // Source advances through the held record after all immediate ports,
          // including a retired record's retained successor link.
          const kind=target[5]!;
          id=kind ? `source:${kind-1}:${u16(target as number[],3)}` as SourceEntityId : null;
        }
      }
    },
    damage:amount=>{damageCampaignBuilding(w,pack,slot,amount,null,{effectOptions:services.effectOptions,cancelConstruction:services.cancelConstruction});},
    wave:code=>{createCampaignShieldWave(w,pack,services,code,owner,[i16(n as number[],7),i16(n as number[],9)],n[46]!);},
    orbit:position=>{createCampaignShieldEffect(w,pack,services,{code:9,owner:0,position,height:groundHeight(w.terrain,...position),delay:0});},
    audio:()=>audio(`source:3:${slot}`,62,100),
    queue:()=>{queueRequested=true;}, //83140 request; renderer reads native dirty state.
  });
  if(n[6]===4) {
    b.energy=e.energy=i16(n as number[],61);b.health=i16(n as number[],43);
    e.powered=!!(u16(n as number[],49)&4);e.extraDrain=n[63]!;
  }
  const ep=w.economy.players.find(p=>p.id===owner);
  if(ep)ep.noPowerWarningTicks=i16(player.raw,0x5ea);
  synchronizeCampaignLinks(w);
  return {queueRequested};
}
