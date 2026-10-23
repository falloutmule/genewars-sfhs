import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { GeneticistShot } from "../mechanics/geneticist";
import {
  createGeneticistProjectileRecord,
  createGeneticistCaptureEffectRecord,
  applyGeneticistCaptureEffect,
  stepGeneticistProjectileRecord,
  type GeneticistEffectChildRequest,
  type GeneticistCaptureEffectContext,
  type GeneticistProjectileAudio,
} from "../mechanics/geneticist-projectile";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
import {
  campaignEntity,
  campaignQueryEntities,
  synchronizeCampaignLinks,
} from "./entity-view";
import {
  campaignAirborneBuilding,
  captureCampaignMule,
} from "./mule-damage-adapter";
import { makeWaterEffect, type WaterRequest } from "../mechanics/water";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { i16, put16 } from "./bytes";
import { sourceEntityId } from "./source-pools";

function descriptor(pack: Pack, code: number) {
  const d = pack.geneticistRules?.effectDescriptors.find(
    (d) => d.code === code,
  );
  if (!d) throw new Error("Admitted Geneticist effect descriptor missing");
  return d;
}
function audio(w: CampaignWorld, events: readonly GeneticistProjectileAudio[]) {
  for (const e of events)
    requestAudio(w.audio, {
      frame: w.frame,
      entity: e.entity,
      cue: e.cue,
      mode: e.mode,
      parameter: e.parameter,
      gain: 1,
      range: null,
      initialRatePercent: e.ratePercent,
    });
}
function publish(
  w: CampaignWorld,
  slot: number,
  native: readonly (number | null)[],
) {
  publishStagedSharedEffect(w, slot, native);
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((e) => e.occupied).length,
  );
  synchronizeCampaignLinks(w);
}
function captureContext(
  w: CampaignWorld,
  pack: Pack,
): GeneticistCaptureEffectContext {
  return {
    nearby: (q) => campaignQueryEntities(w, q.points),
    entity: (r) => campaignEntity(w, sourceEntityId(r.kind - 1, r.index)),
    specialistSkill: (e) => {
      const b = w.specialists.bindings[e.index];
      if (e.kind !== 3 || !b || b.owner !== e.owner)
        throw new Error("Capture specialist binding missing");
      return (
        (w.players[b.owner].raw[22 + b.blueprintIndex * 36 + 23] << 24) >> 24
      );
    },
    impact: (target, effect, rng, request) => {
      if (rng !== w.rng)
        throw new Error("Capture must retain current staged RNG");
      captureCampaignMule(w, pack, target.index, effect, request);
    },
  };
}
export function createStagedCampaignWater(
  w: CampaignWorld,
  request: WaterRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): number | null {
  if (!pack.rules) throw new Error("Original water tables missing");
  const slot = allocateStagedSharedEffect(w, request.code, pack, options, out);
  if (slot === null) return null;
  const water = makeWaterEffect(
    slot,
    request,
    w.powerEffects.slots[slot].nativePrior!,
    {
      terrain: w.terrain,
      tables: pack.rules.tables,
      bounce: pack.rules.tables.bounce,
      rawWaterHeight: w.source.source.terrain.rawWaterHeight,
      profile: (code) => animationProfile(pack.assets.EFF, code),
      obstacleAt: (p) => campaignAirborneBuilding(w, pack, p, -1) !== null,
    },
  );
  const old = w.waterEffects.findIndex((e) => e.slot === slot);
  if (old < 0) w.waterEffects.push(water);
  else w.waterEffects[old] = water;
  publish(w, slot, water.native);
  return slot;
}
export function createStagedGeneticistShot(
  w: CampaignWorld,
  shot: GeneticistShot,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
): boolean {
  if (!pack.rules) throw new Error("Original projectile tables missing");
  const actor = campaignEntity(w, `source:2:${shot.actor}`),
    target = campaignEntity(w, `source:0:${shot.target}`);
  if (!actor || !target)
    throw new Error("Live Geneticist projectile endpoints required");
  const slot = allocateStagedSharedEffect(
    w,
    shot.profile.effectCode,
    pack,
    options,
  );
  if (slot === null) return false;
  const result = createGeneticistProjectileRecord(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    shot,
    actor.native,
    target.native,
    {
      terrain: w.terrain,
      tables: pack.rules.tables,
      descriptor: descriptor(pack, shot.profile.effectCode),
    },
  );
  publish(w, slot, result.native);
  audio(w, result.events);
  return true;
}
export function createStagedGeneticistEffectChild(
  w: CampaignWorld,
  request: GeneticistEffectChildRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): boolean {
  if (request.code !== 20)
    return (
      createStagedCampaignWater(
        w,
        { ...request, code: request.code },
        pack,
        options,
        out,
      ) !== null
    );
  if (!pack.rules) throw new Error("Original capture tables missing");
  const slot = allocateStagedSharedEffect(w, 20, pack, options, out);
  if (slot === null) return false;
  const native = createGeneticistCaptureEffectRecord(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    request,
    {
      terrain: w.terrain,
      tables: pack.rules.tables,
      descriptor: descriptor(pack, 20),
    },
  );
  publish(w, slot, native);
  const result = applyGeneticistCaptureEffect(
    w.powerEffects.slots[slot].nativePrior!,
    w.rng,
    captureContext(w, pack),
  );
  if (request.newborn)
    w.powerEffects.slots[slot].nativePrior![21] =
      w.powerEffects.slots[slot].nativePrior![21]! | 1;
  audio(w, result.events);
  return true;
}
/** Concrete20/41..43 callback hook for the ordinary source4E950 pass. */
export function stepCampaignGeneticistEffect(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
) {
  if (!pack.rules || !pack.zoneRules)
    throw new Error("Original projectile tables missing");
  const before = w.powerEffects.slots[slot].nativePrior!,
    code = before[69]!;
  const result = stepGeneticistProjectileRecord(before, w.rng, {
    ...captureContext(w, pack),
    frame: w.frame,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    terrain: w.terrain,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    descriptor: descriptor(pack, code),
    profile: animationProfile(pack.assets.EFF, code),
    players: w.players.map((p) => p.raw),
    speciesComponents: pack.zoneRules.speciesComponents as [number, number][],
    obstacle: (p, height) => {
      const b = campaignAirborneBuilding(w, pack, p, height);
      return b ? { index: i16(b.native as number[], 15), kind: 4 } : null;
    },
    child(request, rng, parentNative) {
      if (rng !== w.rng)
        throw new Error("Projectile child must use current staged RNG");
      publish(w, slot, parentNative);
      const made = createStagedGeneticistEffectChild(
          w,
          request,
          pack,
          options,
          out,
        ),
        current = w.powerEffects.slots[slot].nativePrior!;
      parentNative.splice(0, parentNative.length, ...current);
      return made;
    },
  });
  audio(w, result.events);
  return result;
}
