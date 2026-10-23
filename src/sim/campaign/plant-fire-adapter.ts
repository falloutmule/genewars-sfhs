/** Source6C6B0 ordering inside an already complete host transaction. */
import type { Pack } from "../../content/types";
import {
  ignitePlantRecord,
  type PlantIgnition,
  type PlantIgnitionAudio,
} from "../mechanics/plant-fire";
import {
  createStagedPlantFireEffect,
  type EffectSchedulerWorld,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
export interface PlantIgnitionReceipt extends PlantIgnition {
  effectSlot: number | null;
}
/** Plant mutations precede allocation/recursive cleanup; source audio follows
 * the factory even on capacity failure. No standalone transaction is implied. */
export function igniteStagedPlant<W extends EffectSchedulerWorld>(
  w: W,
  index: number,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
  onAudio: (world: W, event: PlantIgnitionAudio) => void,
  out?: EffectSchedulerReceipt,
): PlantIgnitionReceipt {
  const plant = w.ecology.plants[index],
    row = pack.ecologyRules?.plants[plant?.selector];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 512 ||
    !plant?.active ||
    plant.index !== index ||
    plant.id !== `source:1:${index}` ||
    plant.native[43] === null ||
    (plant.native[43]! << 24) >> 24 !== plant.selector ||
    !row ||
    row.selector !== plant.selector ||
    typeof onAudio !== "function"
  )
    throw Error("Original plant ignition target/rules/audio port is required");
  const result = ignitePlantRecord(
    plant.native,
    w.terrain,
    row.retirementDelay,
  );
  if (result.audio.entity !== plant.id)
    throw Error("Original plant ignition native slot differs from its host");
  //The surrounding role/blast callback can retain this actual source slot.
  //Apply the numeric afterimage in place before any recursive allocation.
  plant.native.splice(0, plant.native.length, ...result.native);
  Object.assign(plant, {
    growth: 0,
    plantFlags: result.native[46]!,
    flags: result.native[21]!,
    animation: result.native[25]!,
    retirement: result.native[48]!,
  });
  const effectSlot = createStagedPlantFireEffect(
    w,
    result.effect,
    pack,
    options,
    out,
  );
  onAudio(w, result.audio);
  return { ...result, native: plant.native, effectSlot };
}
