/** Complete451F0 selector4 callback over one isolated campaign transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { SourceEntityId } from "./source-pools";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import {
  stepStagedRecyclingPlant,
  selectRecyclingPlant,
  selectRecyclingCorpse,
  type RecyclingMaterial,
  type RecyclingReceipt,
} from "../mechanics/building-startup";
import {
  cloneEffectHost,
  commitEffectHost,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import { applyCampaignBotanistEconomy } from "./botanist-adapter";
import { campaignBuildingAsset } from "./building-startup-adapter";
import {
  campaignEntity,
  campaignQueryEntities,
  synchronizeCampaignLinks,
} from "./entity-view";
import { cleanupCampaignReferences } from "./cleanup";
import { copySpatialLinks, unlinkSpatial } from "./spatial";
import { animationProfile } from "../mechanics/animation";
import { i16, put16, u16, u32 } from "./bytes";

export interface CampaignRecyclingServices extends CampaignSpecialistServices {
  /** Actual8D7B0/8D930 scan and14040 collector factory, already staged.
   * Must mutate only this world, retain its native/player array identities,
   * and return the actual allocation result. Missing is an explicit boundary. */
  dispatchCollection?(
    staged: CampaignWorld,
    slot: number,
    range: 1024 | 1536,
  ): boolean;
}
export interface CampaignRecyclingReceipt extends RecyclingReceipt {
  retired: SourceEntityId[];
  cleanedReferenceBytes: number;
}

/** cloneEffectHost owns its generic mutable roots. These are the additional
 * concrete campaign roots that recursive allocation/724C0 can touch. */
const extraRoots = [
  "buildingNative",
  "creatureNative",
  "specialists",
  "collapse",
  "collectors",
  "ethereals",
  "presentation",
  "buildings",
  "jobs",
  "muleQueues",
  "auxiliary",
  "pendingEnvironmentEffects",
] as const;
function transactionHooks(
  options: EffectSchedulerOptions<CampaignWorld>,
): EffectSchedulerOptions<CampaignWorld> {
  return {
    ...options,
    stageHost(original, staged) {
      options.stageHost?.(original, staged);
      // One clone retains aliases within the extra host roots. No caller-owned
      // native buffer can escape a late query/profile/factory failure.
      const roots = structuredClone(
        Object.fromEntries(extraRoots.map((key) => [key, original[key]])),
      );
      Object.assign(staged, roots);
      for (const mule of staged.ecology.mules)
        staged.creatureNative[mule.index] = mule.native;
    },
    commitHost(target, staged) {
      for (const key of extraRoots)
        (target as unknown as Record<string, unknown>)[key] = staged[key];
      options.commitHost?.(target, staged);
    },
  };
}
function chain(w: CampaignWorld, cell: number): RecyclingMaterial[] {
  return campaignQueryEntities(w, [[(cell & 127) << 8, (cell >>> 7) << 8]]).map(
    (e) => ({ slot: e.index, native: e.native }),
  );
}
function materialId(kind: 1 | 2, slot: number): SourceEntityId {
  return `source:${kind - 1}:${slot}`;
}
function currentMaterial(w: CampaignWorld, m: RecyclingMaterial, kind: 1 | 2) {
  const id = materialId(kind, m.slot),
    e = campaignEntity(w, id);
  if (!e || e.kind !== kind || e.native !== m.native)
    throw Error("Recycling material changed its actual native identity");
  return e;
}
/** Read native afterimages into views. Byte51 is deliberately not mapped to
 * extractor.cycle: for selector4 it is pending recycled material. */
function synchronizeViews(w: CampaignWorld, slot: number): void {
  for (const p of w.players) {
    p.funds = u32(p.raw, 0x4a3);
    p.goop = u32(p.raw, 0x4a7);
    const economy = w.economy.players.find((v) => v.id === p.id);
    if (!economy) throw Error("Recycling player economy binding missing");
    economy.goop = p.goop;
    economy.capacity = u32(p.raw, 0x5e6);
    economy.maxOperationalHQGrade = p.raw[0x6e1];
    economy.noPowerWarningTicks = i16(p.raw, 0x5ea);
    //451F0 does not decrement5FA when directly consuming an owned plant.
    w.ecology.ownerPlantCounts[p.id] = u16(p.raw, 0x5fa);
  }
  const n = w.buildingNative[slot],
    building = w.buildings.find((b) => b.slot === slot),
    economy = w.economy.buildings.find((b) => b.owner * 64 + b.slot === slot);
  if (
    !building ||
    !economy ||
    building.id !== economy.id ||
    building.owner !== n[24] ||
    building.selector !== 4 ||
    economy.selector !== 4 ||
    economy.owner !== n[24]
  )
    throw Error("Recycling normalized building/economy binding missing");
  const raw = n as number[],
    flags = u16(raw, 49);
  building.x = economy.x = i16(raw, 7);
  building.y = economy.y = i16(raw, 9);
  building.grade = economy.grade = n[46] as 0 | 1 | 2;
  building.health = i16(raw, 43);
  building.complete = economy.complete = !!(flags & 1);
  building.energy = economy.energy = i16(raw, 61);
  economy.disabled = !!(flags & 0x40);
  economy.capacitySuppressed = !!(flags & 0x840);
  economy.hqUpgradeSuppressed = !!(flags & 0x140);
  economy.powered = !!(flags & 4);
  economy.depleted = !!(flags & 0x200);
  economy.extraDrain = n[63]!;
  economy.storedGoop = u32(raw, 54) | 0;
  for (const mule of w.ecology.mules)
    w.creatureNative[mule.index] = mule.native;
  synchronizeCampaignLinks(w);
}

/** Already isolated: preserves current economy/native/player arrays. The
 * enclosing source owner/slot pass owns transaction commit and rollback.
 * Includes all upkeep/ANB; do not also run generic selector4 economy upkeep. */
export function stepStagedCampaignRecyclingPlant(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignRecyclingServices,
): CampaignRecyclingReceipt {
  if (!pack.buildingRules || !Number.isInteger(slot) || slot < 0 || slot > 255)
    throw Error("Original recycling building rules/slot required");
  const asset = pack.assets[campaignBuildingAsset(pack, 4)],
    staged = w,
    native = staged.buildingNative[slot],
    owner = native?.[24],
    player =
      owner === null || owner === undefined
        ? undefined
        : staged.players[owner]?.raw,
    retired: SourceEntityId[] = [];
  let cleanedReferenceBytes = 0;
  const held = () => {
    if (
      staged.buildingNative[slot] !== native ||
      staged.players[owner!]?.raw !== player
    )
      throw Error("Recycling service replaced a held native/player array");
  };
  const receipt = stepStagedRecyclingPlant(staged, slot, {
    rules: pack.buildingRules,
    frame: staged.frame,
    native: (s, index) => s.buildingNative[index],
    player: (s, index) => s.players[index].raw,
    profile: (_s, _index, action) => animationProfile(asset, action),
    findPlant: (s, cell) => selectRecyclingPlant(chain(s, cell)),
    findCorpse: (s, cell) => selectRecyclingCorpse(chain(s, cell)),
    unlinkMaterial(s, material, kind) {
      const e = currentMaterial(s, material, kind);
      if (!s.spatial.nodes[e.id])
        throw Error("Recycling material has no spatial link");
      //8ACC0 leaves this record's own previous/next operands intact.
      copySpatialLinks(s.spatial, e.id, e.native);
      unlinkSpatial(s.spatial, s.terrain, e.id);
      synchronizeCampaignLinks(s);
    },
    retireMaterial(s, material, kind) {
      const e = currentMaterial(s, material, kind);
      if (s.spatial.nodes[e.id])
        throw Error("Recycling cleanup preceded material unlink");
      const at = kind === 2 ? 0x3552 : 0x3550,
        count = u16(s.missionPrefix, at),
        actual =
          kind === 2
            ? s.ecology.plants.filter((p) => p.active).length
            : s.ecology.mules.filter((m) => m.native[6] === 1).length;
      if (
        !count ||
        count !== actual ||
        (kind === 2 && count !== s.ecology.plantCount)
      )
        throw Error("Recycling global material count differs from native pool");
      cleanedReferenceBytes += cleanupCampaignReferences(s, e.id);
      e.native[6] = 0;
      put16(s.missionPrefix, at, count - 1);
      if (kind === 2) {
        const plant = s.ecology.plants[material.slot];
        if (!plant?.active || plant.native !== material.native)
          throw Error("Recycling live plant projection differs");
        plant.active = false;
        s.ecology.plantCount = count - 1;
        if (s.ecology.plantOrder)
          for (const key of Object.keys(s.ecology.plantOrder))
            s.ecology.plantOrder[key] = s.ecology.plantOrder[key].filter(
              (index) => index !== material.slot,
            );
      } else {
        s.creatureNative[material.slot] = e.native;
        delete s.muleQueues[material.slot];
      }
      const overlay = s.source.entities.find((entry) => entry.id === e.id);
      if (overlay)
        overlay.nativeBytes.splice(0, overlay.nativeBytes.length, ...e.native);
      s.ecology.otherEntities = s.ecology.otherEntities.filter(
        (entry) => entry.id !== e.id,
      );
      retired.push(e.id);
    },
    credit(s, creditOwner, amount) {
      if (creditOwner !== owner) throw Error("Recycling credit owner changed");
      applyCampaignBotanistEconomy(
        s,
        pack,
        `source:3:${slot}`,
        "credit",
        amount,
        services,
      );
      held();
    },
    ...(services.dispatchCollection
      ? {
          dispatchCollection(
            s: CampaignWorld,
            index: number,
            range: 1024 | 1536,
          ) {
            const result = services.dispatchCollection!(s, index, range);
            held();
            return result;
          },
        }
      : {}),
  });
  held();
  synchronizeViews(staged, slot);
  return { ...receipt, retired, cleanedReferenceBytes };
}

/** Atomic standalone dispatch. For the ordinary complete owner/slot economy
 * pass use the staged entry so later437A0 sees this callback immediately. */
export function stepCampaignRecyclingPlant(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignRecyclingServices,
): CampaignRecyclingReceipt {
  const hooks = transactionHooks(services.effectOptions(w)),
    staged = cloneEffectHost(w, hooks),
    receipt = stepStagedCampaignRecyclingPlant(staged, slot, pack, services);
  commitEffectHost(w, staged, hooks);
  return receipt;
}
