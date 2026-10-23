import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { ShepherdShot, ShepherdTarget } from "../mechanics/shepherd";
import { aimShepherdProjectile, createShepherdProjectileNative, stepShepherdProjectileRecord, type ShepherdProjectileCode } from "../mechanics/shepherd-projectile";
import { createGeneticistProjectileNative, type GeneticistProjectileAudio, type GeneticistProjectileCode } from "../mechanics/geneticist-projectile";
import { allocateStagedSharedEffect, publishStagedSharedEffect, createStagedDestructionEffect, type EffectSchedulerOptions, type EffectSchedulerReceipt } from "./effect-scheduler";
import { campaignEntity, campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import { sourceEntityId } from "./source-pools";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { i16, put16 } from "./bytes";
function descriptor(pack: Pack, code: number) {
  const d = pack.effectRules?.descriptors[code];
  if (!d || d.code !== code) throw Error("Original Shepherd effect descriptor missing");
  return { code, completion: d.retirementMode, gravity: d.gravity, priority: d.priority,
    childCode: d.childCode, obstacle: d.movable, water: d.waterResponse };
}
function audio(w: CampaignWorld, events: readonly GeneticistProjectileAudio[]) {
  for (const e of events) requestAudio(w.audio, { frame: w.frame, entity: e.entity, cue: e.cue,
    mode: e.mode, parameter: e.parameter, gain: 1, range: null, initialRatePercent: e.ratePercent });
}
function publish(w: CampaignWorld, slot: number, native: readonly (number | null)[]) {
  publishStagedSharedEffect(w, slot, native);
  put16(w.missionPrefix, 0x3554, w.powerEffects.slots.filter(e => e.occupied).length);
  synchronizeCampaignLinks(w);
}
/** Actual54A00/6D830. Leading aim runs before shared capacity selection. */
export function createStagedShepherdShot(w: CampaignWorld, shot: ShepherdShot, pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>): boolean {
  if (!pack.rules) throw Error("Original Shepherd motion tables missing");
  const actor = campaignEntity(w, sourceEntityId(2, shot.actor)), target = campaignEntity(w, sourceEntityId(shot.target.kind - 1, shot.target.index));
  if (!actor || !target) throw Error("Live Shepherd projectile endpoints required");
  const code = shot.profile.effectCode;
  if (code < 37 || code > 43 || code !== shot.projectileIndex + 37 || shot.owner !== actor.owner ||
      shot.position[0] !== actor.position[0] || shot.position[1] !== actor.position[1] || shot.height !== actor.physicalHeight ||
      shot.aimSpeed !== shot.profile.speedWord << 6 || shot.aimHeightOffset !== 1280 || shot.parameter !== 32 || shot.delay !== 0)
    throw Error("Actual Shepherd shot differs from retained actor/profile");
  const aimedTarget: ShepherdTarget = { ...shot.target, native: target.native, physicalHeight: target.physicalHeight },
    angles = aimShepherdProjectile(actor.native, aimedTarget, shot.profile.speedWord, { terrain: w.terrain, tables: pack.rules.tables }),
    slot = allocateStagedSharedEffect(w, code, pack, options);
  if (slot === null) return false;
  const request = { owner: shot.owner, position: shot.position, height: (shot.height + 1280) | 0,
    angles, parameter: 32, delay: 0 as const, parent: { kind: 3, index: shot.actor } },
    context = { terrain: w.terrain, tables: pack.rules.tables, descriptor: descriptor(pack, code), profile: animationProfile(pack.assets.EFF, code) },
    made = code < 41 ? createShepherdProjectileNative(w.powerEffects.slots[slot].nativePrior!, slot, { ...request, code: code as ShepherdProjectileCode }, context)
      : createGeneticistProjectileNative(w.powerEffects.slots[slot].nativePrior!, slot, { ...request, code: code as GeneticistProjectileCode }, context);
  publish(w, slot, made.native); audio(w, made.events); return true;
}
/** Source4E950 callback. Each child completes real recursive damage before the
 * parent is retired; the enclosing scheduler transaction owns every failure. */
export function stepCampaignShepherdEffect(w: CampaignWorld, slot: number, pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>, out: EffectSchedulerReceipt) {
  if (!pack.rules || !pack.zoneRules) throw Error("Original Shepherd projectile tables missing");
  const before = w.powerEffects.slots[slot].nativePrior!, code = before[69]!;
  const result = stepShepherdProjectileRecord(before, w.rng, {
    frame: w.frame, terrain: w.terrain, water: w.source.source.terrain.loadedPhysicalWaterHeight,
    tables: pack.rules.tables, bounce: pack.rules.tables.bounce, descriptor: descriptor(pack, code),
    profile: animationProfile(pack.assets.EFF, code), players: w.players.map(p => p.raw),
    speciesComponents: pack.zoneRules.speciesComponents as [number, number][],
    nearby: q => campaignQueryEntities(w, q.points), entity: r => campaignEntity(w, sourceEntityId(r.kind - 1, r.index)),
    obstacle: (point, height) => { const b = campaignAirborneBuilding(w, pack, point, height); return b ? { kind: 4, index: i16(b.native as number[], 15) } : null; },
    child(request, rng, parentNative) {
      if (rng !== w.rng) throw Error("Shepherd projectile must retain its staged RNG");
      publish(w, slot, parentNative);
      let made: number | null;
      if (request.code === 0 || request.code === 1 || request.code === 2 || request.code === 3) {
        const instigator = request.parent ? campaignEntity(w, sourceEntityId(request.parent.kind - 1, request.parent.index)) : null;
        made = createStagedDestructionEffect(w, { ...request, code: request.code, instigator: instigator?.id ?? null, newborn: false }, pack, options);
      } else if (request.code === 21 || request.code === 48)
        made = createStagedCampaignWater(w, { ...request, code: request.code }, pack, options, out);
      else throw Error("Shepherd37..40 projectile child differs from its real descriptor");
      const current = w.powerEffects.slots[slot].nativePrior!;
      if (made === slot || current[6] !== 5 || current[69] !== code)
        throw Error("Shepherd inline factory replaced its executing projectile record");
      parentNative.splice(0, 81, ...current);
      if (made !== null && request.newborn) w.powerEffects.slots[made].nativePrior![21] = w.powerEffects.slots[made].nativePrior![21]! | 1;
      put16(w.missionPrefix, 0x3554, w.powerEffects.slots.filter(e => e.occupied).length); synchronizeCampaignLinks(w);
      return made !== null;
    },
  });
  audio(w, result.events); return result;
}
