import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  planEtherealAttack,
  makeEtherealAttackEffect,
  stepEtherealAttackEffectRecord,
} from "../mechanics/ethereal-attack";
import type { GeneticistProjectileAudio } from "../mechanics/geneticist-projectile";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  createStagedDestructionEffect,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
import {
  campaignEntity,
  campaignQueryEntities,
  synchronizeCampaignLinks,
} from "./entity-view";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { put16, i16 } from "./bytes";
import { sourceEntityId, type SourceEntityId } from "./source-pools";
function descriptor(pack: Pack) {
  const d = pack.effectRules?.descriptors[25];
  if (!d || d.code !== 25)
    throw Error("Original Ethereal attack descriptor missing");
  return {
    code: d.code,
    completion: d.retirementMode,
    gravity: d.gravity,
    priority: d.priority,
    childCode: d.childCode,
    obstacle: d.movable,
    water: d.waterResponse,
  };
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
/** Already inside the complete13780 visitor transaction. Aim occurs even on
 * shared capacity failure; failed48790 draws no RNG and emits no audio. */
export function createStagedEtherealAttack(
  w: CampaignWorld,
  parentSlot: number,
  targetId: SourceEntityId,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
) {
  if (!pack.rules) throw Error("Original Ethereal aim tables missing");
  const parent = campaignEntity(w, sourceEntityId(7, parentSlot)),
    target = campaignEntity(w, targetId);
  if (!parent || !target)
    throw Error("Live Ethereal attack endpoints required");
  const plan = planEtherealAttack(parent.native, target.native, {
      terrain: w.terrain,
      tables: pack.rules.tables,
    }),
    slot = allocateStagedSharedEffect(w, 25, pack, options);
  if (slot === null) return { ...plan, slot: null };
  const made = makeEtherealAttackEffect(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    plan.request,
    {
      terrain: w.terrain,
      tables: pack.rules.tables,
      descriptor: descriptor(pack),
      profile: animationProfile(pack.assets.EFF, 25),
    },
  );
  publish(w, slot, made.native);
  audio(w, made.events);
  return { ...plan, slot };
}
/** Concrete source4E950 callback. Child5 completes immediate ordered blast
 * damage before its newborn mark and before this parent is retired. */
export function stepCampaignEtherealAttackEffect(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
) {
  if (!pack.rules || !pack.zoneRules)
    throw Error("Original Ethereal projectile tables missing");
  const before = w.powerEffects.slots[slot].nativePrior!;
  const result = stepEtherealAttackEffectRecord(before, w.rng, {
    frame: w.frame,
    terrain: w.terrain,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    descriptor: descriptor(pack),
    profile: animationProfile(pack.assets.EFF, 25),
    players: w.players.map((p) => p.raw),
    speciesComponents: pack.zoneRules.speciesComponents as [number, number][],
    nearby: (q) => campaignQueryEntities(w, q.points),
    entity: (r) => campaignEntity(w, sourceEntityId(r.kind - 1, r.index)),
    obstacle: (p, height) => {
      const b = campaignAirborneBuilding(w, pack, p, height);
      return b ? { kind: 4, index: i16(b.native as number[], 15) } : null;
    },
    child(request, rng, parentNative) {
      if (rng !== w.rng)
        throw Error("Ethereal projectile child must use current staged RNG");
      publish(w, slot, parentNative);
      let made: number | null;
      if (request.code === 5) {
        const instigator = request.parent
          ? campaignEntity(
              w,
              sourceEntityId(request.parent.kind - 1, request.parent.index),
            )
          : null;
        made = createStagedDestructionEffect(
          w,
          {
            ...request,
            code: 5,
            instigator: instigator?.id ?? null,
            newborn: false,
          },
          pack,
          options,
        );
      } else if (request.code === 21 || request.code === 48)
        made = createStagedCampaignWater(
          w,
          { ...request, code: request.code },
          pack,
          options,
          out,
        );
      else throw Error("Ethereal attack cannot create capture20");
      const current = w.powerEffects.slots[slot].nativePrior!;
      if (made === slot || current[6] !== 5 || current[69] !== 25)
        throw Error(
          "Source Ethereal projectile inline factory replaced its executing record; same-slot continuation is not implemented",
        );
      parentNative.splice(0, 81, ...current);
      if (made !== null && request.newborn)
        w.powerEffects.slots[made].nativePrior![21] =
          w.powerEffects.slots[made].nativePrior![21]! | 1;
      put16(
        w.missionPrefix,
        0x3554,
        w.powerEffects.slots.filter((e) => e.occupied).length,
      );
      synchronizeCampaignLinks(w);
      return made !== null;
    },
  });
  audio(w, result.events);
  return result;
}
