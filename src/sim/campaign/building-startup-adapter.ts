import type { Pack } from "../../content/types";
import type { ConstructionBuilding } from "../mechanics/construction";
import type { EconomyBuilding, Grade } from "../mechanics/economy";
import { initializeSerializedBuildings } from "../mechanics/building-startup";
import type { SourcePoolRegistry } from "./source-pools";
import { initializeNativePool } from "./native-pools";
import { u32 } from "./bytes";

export type CampaignBuilding = Omit<
  ConstructionBuilding,
  "selector" | "grade"
> & { selector: number; grade: Grade };
const establishedAssets: Record<number, string> = {
  0: "BGENE",
  1: "BTURR",
  3: "BPOWE",
  6: "BSOLA",
  11: "BMINE",
};
/** Old development packs can resolve only their already-admitted resources. */
export function campaignBuildingAsset(pack: Pack, selector: number): string {
  const key = pack.buildingRules
    ? pack.buildingRules.resources.find((row) => row.selector === selector)
        ?.assetKey
    : establishedAssets[selector];
  if (!key || !pack.assets[key])
    throw Error(`Original building resource ${selector} is unavailable`);
  return key;
}
/** Actual45010/44FF0 priors, then read-only views of their retained state.
 * No factory, constructor, terrain refresh or player count reset occurs. */
export function initializeCampaignBuildings(
  source: SourcePoolRegistry,
  pack: Pack,
) {
  const original = initializeNativePool(source, 3);
  if (!original.some((n) => n[6] !== 0))
    return {
      records: original,
      buildings: [] as CampaignBuilding[],
      economyBuildings: [] as EconomyBuilding[],
    };
  if (!pack.buildingRules)
    throw Error("Original serialized building rules are required");
  const result = initializeSerializedBuildings(original, {
    rules: pack.buildingRules,
    hasResource: (key) => !!pack.assets[key],
  });
  if (!result.ok) throw Error(result.reason);
  const buildings: CampaignBuilding[] = [],
    economyBuildings: EconomyBuilding[] = [];
  for (const b of result.value.buildings) {
    if (![0, 1, 2].includes(b.grade))
      throw Error("Original building grade is unadmitted");
    const grade = b.grade as Grade,
      n = result.value.records[b.slot];
    buildings.push({
      id: 1000 + b.slot,
      slot: b.slot,
      owner: b.owner,
      selector: b.selector,
      x: b.x,
      y: b.y,
      grade,
      health: b.health,
      complete: b.complete,
      energy: b.energy,
    });
    economyBuildings.push({
      id: 1000 + b.slot,
      slot: b.slot % 64,
      owner: b.owner,
      selector: b.selector,
      grade,
      x: b.x,
      y: b.y,
      complete: b.complete,
      disabled: b.disabled,
      capacitySuppressed: !!(b.flags & 0x840),
      hqUpgradeSuppressed: !!(b.flags & 0x140),
      powered: b.powered,
      energy: b.energy,
      extraDrain: b.extraDrain,
      depleted: !!(b.flags & 0x200),
      storedGoop: u32(n as number[], 54) | 0,
      specialPowerDelivery: false,
      ...(b.selector === 11
        ? {
            extractor: {
              cycle: b.pendingMaterial,
              frame: b.animation.frame,
              delay: b.animation.counter,
              hold: b.animation.hold,
              stepDelay: b.animation.delay,
              workAudioActive: false,
            },
          }
        : {}),
      ...([3, 6].includes(b.selector)
        ? {
            producer: {
              animation: { ...b.animation },
              audioRequested: false,
              audioRequests: [],
              lastFrame: null,
              lastPulse: false,
              lastDraw: null,
            },
          }
        : {}),
    });
  }
  return { records: result.value.records, buildings, economyBuildings };
}
