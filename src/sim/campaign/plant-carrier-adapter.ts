/**Already-staged carrier67/0x43 factory and67/68 retained-plant callbacks. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  makeMulePlantCarrier,
  stepPlantCarrierRecord,
  validatePlantCarrierDescriptor,
  type MulePlantCarrierRequest,
  type PlantCarrierUpdate,
} from "../mechanics/plant-carrier";
import { animationProfile } from "../mechanics/animation";
import { worldCell } from "../mechanics/terrain";
import { i16 } from "./bytes";
import { insertSpatial } from "./spatial";
import { synchronizeCampaignLinks } from "./entity-view";
import { campaignCreatureFootprintBuilding } from "./creature-command-adapter";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
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
/**Caller owns5D1C0 reference/ignition/unlink writes and its outer transaction.
 * Allocation false precedes EFF67/motion-resource access. */
export function createStagedCampaignMulePlantCarrier(
  w: CampaignWorld,
  pack: Pack,
  request: MulePlantCarrierRequest,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): { slot: number; native: EffectNativePrior } | null {
  validatePlantCarrierDescriptor(pack.effectRules?.descriptors[67], 67);
  const priors = w.powerEffects.slots.map((s) => s.nativePrior),
    slot = allocateStagedSharedEffect(w, 67, pack, options, out);
  if (slot === null) return null;
  if (!pack.rules || !pack.assets.EFF)
    throw Error("Original carrier67 EFF/motion resource required");
  const native = makeMulePlantCarrier(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    request,
    w.terrain,
    pack.rules.tables,
    animationProfile(pack.assets.EFF, 67),
  );
  return { slot, native: publish(w, slot, native, priors[slot]!) };
}
/**Convenience transaction; staged callers must use the entry above. */
export function createCampaignMulePlantCarrier(
  w: CampaignWorld,
  pack: Pack,
  request: MulePlantCarrierRequest,
  options: EffectSchedulerOptions<CampaignWorld>,
) {
  const staged = structuredClone(w);
  options.stageHost?.(w, staged);
  const result = createStagedCampaignMulePlantCarrier(
    staged,
    pack,
    request,
    options,
  );
  Object.assign(w, staged);
  options.commitHost?.(w, staged);
  return result;
}
function mirrorPlant(w: CampaignWorld, index: number) {
  const p = w.ecology.plants[index],
    n = p.native;
  p.position = [i16(n as number[], 7), i16(n as number[], 9)];
  p.plantFlags = n[46]!;
  p.shade = n[23]!;
}
/**Root shared scheduler publishes/retire-cleans the returned current effect.
 * Plant arrays/identity and all other staged roots remain held in place. */
export function stepCampaignPlantCarrier(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
): PlantCarrierUpdate {
  const before = w.powerEffects.slots[slot]?.nativePrior,
    code = before?.[69];
  if (!before || before[6] !== 5 || (code !== 67 && code !== 68) || !pack.rules)
    throw Error("Actual campaign plant carrier67/68 required");
  validatePlantCarrierDescriptor(pack.effectRules?.descriptors[code], code);
  const touched = new Set<number>(),
    result = stepPlantCarrierRecord(before, w.rng, {
      terrain: w.terrain,
      tables: pack.rules.tables,
      bounce: pack.rules.tables.bounce,
      friction: pack.ecologyRules?.corpseFriction ?? [],
      gravity: options.gravity,
      water: w.source.source.terrain.loadedPhysicalWaterHeight,
      frame: w.frame,
      publishMotion(n) {
        const current = publish(w, slot, n);
        n.splice(0, 81, ...current);
      },
      obstacle: options.destructionObstacle
        ? (p, h) => options.destructionObstacle!(w, p, h)
        : undefined,
      particle(q, _rng, parent) {
        if (q.code !== 21 && q.code !== 48)
          throw Error("Unexpected plant carrier water child");
        publish(w, slot, parent);
        const made = createStagedCampaignWater(
          w,
          { ...q, code: q.code },
          pack,
          options,
          out,
        );
        const current = w.powerEffects.slots[slot].nativePrior!;
        if (current[6] !== 5 || current[69] !== code)
          throw Error(
            "Plant carrier water factory replaced its executing parent",
          );
        parent.splice(0, 81, ...current);
        return made !== null;
      },
      plant(index) {
        const plant = w.ecology.plants[index];
        if (!plant || plant.index !== index || plant.id !== `source:1:${index}`)
          throw Error("Actual retained campaign plant required");
        touched.add(index);
        return plant.native;
      },
      footprintBuilding(position) {
        const index = campaignCreatureFootprintBuilding(w, pack, position, 0);
        if (index === null) return null;
        const n = w.buildingNative[index];
        return {
          selector: n[45]!,
          position: [i16(n as number[], 7), i16(n as number[], 9)],
        };
      },
      depositOffset: pack.creatureCommandRules?.corpseDepositOffset,
      relinkPlant(index, native) {
        const p = w.ecology.plants[index],
          id = p.id;
        if (p.native !== native || native[6] !== 2 || !p.active)
          throw Error(
            "Source plant relink requires the same live plant record",
          );
        if (w.spatial.nodes[id])
          throw Error("Source plant drop would duplicate its linked record");
        const cell = worldCell(
          i16(native as number[], 7),
          i16(native as number[], 9),
        );
        insertSpatial(w.spatial, w.terrain, id, cell);
        if (w.ecology.plantOrder) {
          for (const key of Object.keys(w.ecology.plantOrder))
            w.ecology.plantOrder[key] = w.ecology.plantOrder[key].filter(
              (i) => i !== index,
            );
          (w.ecology.plantOrder[String(cell)] ??= []).unshift(index);
        }
        synchronizeCampaignLinks(w);
      },
    });
  for (const index of touched) mirrorPlant(w, index);
  //Plant insertion may change this effect's next/previous links. Preserve the
  //selector afterimage while taking only those actual current linkage bytes.
  result.native.splice(
    0,
    6,
    ...w.powerEffects.slots[slot].nativePrior!.slice(0, 6),
  );
  return result;
}
