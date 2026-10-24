/**Actual selector2 callback over the enclosing owner/slot host transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import type { SourceEntityId } from "./source-pools";
import { stepStagedPulper, type PulperReceipt } from "../mechanics/pulper";
import {
  selectRecyclingPlant,
  type RecyclingMaterial,
} from "../mechanics/building-startup";
import { campaignBuildingAsset } from "./building-startup-adapter";
import {
  campaignEntity,
  campaignQueryEntities,
  synchronizeCampaignLinks,
} from "./entity-view";
import { cleanupCampaignReferences } from "./cleanup";
import { copySpatialLinks, unlinkSpatial } from "./spatial";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { i16, u16, u32, put16 } from "./bytes";

export interface CampaignPulperServices extends CampaignSpecialistServices {
  /**Real112728/484E0 scan and14040; supplied by the processor-collector adapter. */
  dispatchCollection?(
    world: CampaignWorld,
    slot: number,
    range: 1024 | 2048,
  ): boolean;
}
export interface CampaignPulperReceipt extends PulperReceipt {
  retired: SourceEntityId[];
  cleanedReferenceBytes: number;
}
export function stepStagedCampaignPulper(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignPulperServices,
): CampaignPulperReceipt {
  if (!pack.buildingRules) throw Error("Actual Pulper building rules required");
  const n = w.buildingNative[slot],
    owner = n?.[24],
    p = owner == null ? undefined : w.players[owner]?.raw,
    asset = pack.assets[campaignBuildingAsset(pack, 2)],
    retired: SourceEntityId[] = [];
  let cleanedReferenceBytes = 0;
  const held = () => {
    if (w.buildingNative[slot] !== n || w.players[owner!]?.raw !== p)
      throw Error("Pulper service replaced a held native/player array");
  };
  function current(plant: RecyclingMaterial) {
    const e = campaignEntity(w, `source:1:${plant.slot}`);
    if (!e || e.kind !== 2 || e.native !== plant.native)
      throw Error("Pulper retained plant identity differs");
    return e;
  }
  const receipt = stepStagedPulper(w, slot, {
    rules: pack.buildingRules,
    frame: w.frame,
    native: (s, i) => s.buildingNative[i],
    player: (s, i) => s.players[i].raw,
    profile: (_s, _i, action) => animationProfile(asset, action),
    findPlant(s, cell) {
      return selectRecyclingPlant(
        campaignQueryEntities(s, [[(cell & 127) << 8, (cell >> 7) << 8]]).map(
          (e) => ({ slot: e.index, native: e.native }),
        ),
      );
    },
    unlinkPlant(s, plant) {
      const e = current(plant);
      if (!s.spatial.nodes[e.id]) throw Error("Pulper plant is not linked");
      copySpatialLinks(s.spatial, e.id, e.native);
      unlinkSpatial(s.spatial, s.terrain, e.id);
      synchronizeCampaignLinks(s);
    },
    retirePlant(s, plant) {
      const e = current(plant),
        count = u16(s.missionPrefix, 0x3552),
        projection = s.ecology.plants[plant.slot];
      if (
        s.spatial.nodes[e.id] ||
        !projection?.active ||
        projection.native !== e.native ||
        !count ||
        count !== s.ecology.plantCount ||
        count !== s.ecology.plants.filter((p) => p.active).length
      )
        throw Error("Pulper plant retirement/count order differs");
      cleanedReferenceBytes += cleanupCampaignReferences(s, e.id);
      e.native[6] = 0;
      projection.active = false;
      s.ecology.plantCount = count - 1;
      put16(s.missionPrefix, 0x3552, count - 1);
      if (s.ecology.plantOrder)
        for (const key of Object.keys(s.ecology.plantOrder))
          s.ecology.plantOrder[key] = s.ecology.plantOrder[key].filter(
            (i) => i !== plant.slot,
          );
      const overlay = s.source.entities.find((v) => v.id === e.id);
      if (overlay)
        overlay.nativeBytes.splice(0, overlay.nativeBytes.length, ...e.native);
      s.ecology.otherEntities = s.ecology.otherEntities.filter(
        (v) => v.id !== e.id,
      );
      retired.push(e.id);
    },
    ...(services.dispatchCollection
      ? {
          dispatchCollection(s: CampaignWorld, i: number, range: 1024 | 2048) {
            const result = services.dispatchCollection!(s, i, range);
            held();
            return result;
          },
        }
      : {}),
  });
  held();
  const b = w.buildings.find((b) => b.slot === slot),
    e = w.economy.buildings.find((b) => b.owner * 64 + b.slot === slot);
  if (
    !b ||
    !e ||
    b.selector !== 2 ||
    e.selector !== 2 ||
    b.owner !== owner ||
    e.owner !== owner ||
    b.id !== e.id
  )
    throw Error("Actual Pulper building/economy projections required");
  const flags = u16(n as number[], 49);
  b.x = e.x = i16(n as number[], 7);
  b.y = e.y = i16(n as number[], 9);
  b.grade = e.grade = n[46] as 0 | 1 | 2;
  b.health = i16(n as number[], 43);
  b.complete = e.complete = !!(flags & 1);
  b.energy = e.energy = i16(n as number[], 61);
  e.powered = !!(flags & 4);
  e.disabled = !!(flags & 64);
  e.capacitySuppressed = !!(flags & 0x840);
  e.hqUpgradeSuppressed = !!(flags & 0x140);
  e.depleted = !!(flags & 0x200);
  e.extraDrain = n[63]!;
  e.storedGoop = u32(n as number[], 54) | 0;
  for (const player of w.players) {
    player.funds = u32(player.raw, 0x4a3);
    player.goop = u32(player.raw, 0x4a7);
    const ep = w.economy.players[player.id];
    ep.goop = player.goop;
    ep.capacity = u32(player.raw, 0x5e6);
    ep.maxOperationalHQGrade = player.raw[0x6e1];
    ep.noPowerWarningTicks = i16(player.raw, 0x5ea);
    w.ecology.ownerPlantCounts[player.id] = u16(player.raw, 0x5fa);
  }
  for (const event of receipt.events)
    if (event.type === "pulper-audio")
      requestAudio(w.audio, {
        frame: w.frame,
        entity: `source:3:${slot}`,
        cue: event.cue,
        mode: event.operation === "stop" ? 4 : 2,
        parameter: event.parameter,
        gain: 1,
        range: null,
      });
  for (const m of w.ecology.mules) w.creatureNative[m.index] = m.native;
  synchronizeCampaignLinks(w);
  return { ...receipt, retired, cleanedReferenceBytes };
}

/**Standalone full-host atomic entry; ordinary economy uses the staged entry. */
export function stepCampaignPulper(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignPulperServices,
) {
  const staged = structuredClone(w),
    options = services.effectOptions(w);
  options.stageHost?.(w, staged);
  for (const m of staged.ecology.mules)
    staged.creatureNative[m.index] = m.native;
  const receipt = stepStagedCampaignPulper(staged, slot, pack, services);
  Object.assign(w, staged);
  options.commitHost?.(w, staged);
  return receipt;
}
