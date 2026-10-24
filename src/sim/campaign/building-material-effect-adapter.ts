/**Already-staged shared36 material factory and full callback. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  makeBuildingMaterialEffect,
  stepBuildingMaterialEffectRecord,
  validateBuildingMaterialDescriptor,
  type BuildingMaterialRequest,
} from "../mechanics/building-material-effect";
import { animationProfile } from "../mechanics/animation";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
import { synchronizeCampaignLinks } from "./entity-view";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import { u32 } from "./bytes";
import type { EffectNativePrior } from "../mechanics/power-motion";

function publish(
  w: CampaignWorld,
  slot: number,
  n: readonly (number | null)[],
  held?: EffectNativePrior,
) {
  const prior = held ?? w.powerEffects.slots[slot].nativePrior!;
  publishStagedSharedEffect(w, slot, n);
  prior.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
  w.powerEffects.slots[slot].nativePrior = prior;
  synchronizeCampaignLinks(w);
  return prior;
}
export function createStagedCampaignBuildingMaterial(
  w: CampaignWorld,
  pack: Pack,
  q: BuildingMaterialRequest,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): { slot: number; native: EffectNativePrior } | null {
  validateBuildingMaterialDescriptor(pack.effectRules?.descriptors[36]);
  const priors = w.powerEffects.slots.map((s) => s.nativePrior),
    slot = allocateStagedSharedEffect(w, 36, pack, options, out);
  if (slot === null) return null;
  if (!pack.rules || !pack.assets.EFF)
    throw Error("Actual material36 EFF/motion data required");
  const parent = w.buildingNative[q.parentBuilding],
    result = makeBuildingMaterialEffect(
      w.powerEffects.slots[slot].nativePrior!,
      slot,
      q,
      parent,
      w.terrain,
      pack.rules.tables,
      animationProfile(pack.assets.EFF, 36),
    );
  //Keep the parent record held by the already executing source work callback.
  for (let at = 54; at < 58; at++) parent[at] = result.parent[at];
  const economy = w.economy.buildings.find(
    (b) => b.owner * 64 + b.slot === q.parentBuilding,
  );
  if (economy) economy.storedGoop = u32(parent as number[], 54) | 0;
  return { slot, native: publish(w, slot, result.native, priors[slot]!) };
}
export function createCampaignBuildingMaterial(
  w: CampaignWorld,
  pack: Pack,
  q: BuildingMaterialRequest,
  options: EffectSchedulerOptions<CampaignWorld>,
) {
  const staged = structuredClone(w);
  options.stageHost?.(w, staged);
  for (const m of staged.ecology.mules)
    staged.creatureNative[m.index] = m.native;
  const result = createStagedCampaignBuildingMaterial(staged, pack, q, options);
  Object.assign(w, staged);
  options.commitHost?.(w, staged);
  return result;
}
/**Scheduler owns final publication and actual shared retirement. */
export function stepCampaignBuildingMaterial(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
) {
  validateBuildingMaterialDescriptor(pack.effectRules?.descriptors[36]);
  if (!pack.rules) throw Error("Material36 motion tables required");
  return stepBuildingMaterialEffectRecord(
    w.powerEffects.slots[slot].nativePrior!,
    w.rng,
    {
      profile: animationProfile(pack.assets.EFF, 36),
      terrain: w.terrain,
      tables: pack.rules.tables,
      bounce: pack.rules.tables.bounce,
      friction: pack.ecologyRules?.corpseFriction ?? [],
      gravity: options.gravity,
      water: w.source.source.terrain.loadedPhysicalWaterHeight,
      frame: w.frame,
      obstacle: options.destructionObstacle
        ? (p, h) => options.destructionObstacle!(w, p, h)
        : undefined,
      publishMotion(n) {
        const current = publish(w, slot, n);
        n.splice(0, 81, ...current);
      },
      particle(q, _rng, parent) {
        if (q.code !== 21 && q.code !== 48)
          throw Error("Unexpected material36 water child");
        publish(w, slot, parent);
        return (
          createStagedCampaignWater(
            w,
            { ...q, code: q.code },
            pack,
            options,
            out,
          ) !== null
        );
      },
    },
  );
}
