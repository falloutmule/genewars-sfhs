/**451F0 demolition at the real interleaved owner/slot callback position. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { SourceEntityId } from "./source-pools";
import {
  stepStagedBuildingDemolition,
  type DemolitionSalvageRequest,
  type BuildingDemolitionReceipt,
  type DemolitionEvent,
} from "../mechanics/building-demolition";
import {
  makeSalvageEffect,
  stepSalvageEffect,
  validateSalvageDescriptor,
  type SalvageEffectUpdate,
  type SalvageContact,
} from "../mechanics/salvage-effect";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  cloneEffectHost,
  commitEffectHost,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import { campaignEntity, synchronizeCampaignLinks } from "./entity-view";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { campaignBuildingAsset } from "./building-startup-adapter";
import {
  clearDestroyedFootprint,
  updateNativeBuildingCapacity,
} from "../mechanics/building-damage";
import { animationProfile } from "../mechanics/animation";
import { worldCell } from "../mechanics/terrain";
import { cleanupCampaignReferences } from "./cleanup";
import { unlinkSpatial } from "./spatial";
import { requestAudio } from "../mechanics/audio";
import { i16, u16, u32, put16, put32 } from "./bytes";
export interface CampaignDemolitionServices {
  effectOptions(w: CampaignWorld): EffectSchedulerOptions<CampaignWorld>;
  cancelConstruction?(w: CampaignWorld, actorId: number): void;
  selectedBuildingSlot?(w: CampaignWorld): number | null;
  onEvent?(
    w: CampaignWorld,
    event: DemolitionEvent | { type: "selection-cleared"; slot: number },
  ): void;
}
export interface CampaignDemolitionReceipt extends BuildingDemolitionReceipt {
  cleanedReferenceBytes: number;
  clearedFrontReferences: SourceEntityId[];
  cancelledActorIds: number[];
}
function publish(
  w: CampaignWorld,
  slot: number,
  n: readonly (number | null)[],
) {
  publishStagedSharedEffect(w, slot, n);
  synchronizeCampaignLinks(w);
}
/** Source owner9/parameter5000 exact factory. Capacity false precedes ANB access. */
export function createStagedCampaignSalvage(
  w: CampaignWorld,
  q: DemolitionSalvageRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): number | null {
  const d = pack.effectRules?.descriptors[45];
  validateSalvageDescriptor(d);
  const slot = allocateStagedSharedEffect(w, 45, pack, options, out);
  if (slot === null) return null;
  publish(
    w,
    slot,
    makeSalvageEffect(
      w.powerEffects.slots[slot].nativePrior!,
      slot,
      q,
      w.terrain,
      animationProfile(pack.assets.EFF, 45),
      d!,
    ),
  );
  return slot;
}
/** Exact own-cell first admissible kind; traversal stops before later rows are read. */
function firstContact(
  w: CampaignWorld,
  point: [number, number],
): SalvageContact | null {
  let id = w.spatial.heads[worldCell(...point)];
  const seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw Error("Salvage cell chain has a cycle");
    seen.add(id);
    const e = campaignEntity(w, id),
      node = w.spatial.nodes[id];
    if (!e || !node)
      throw Error("Salvage linked entity is inactive or missing");
    if (e.kind === 1 || e.kind === 3 || e.kind === 4) {
      let category: number | null = null;
      if (e.kind === 3) {
        const b = w.specialists.bindings[e.index];
        if (!b)
          throw Error("Actual salvage specialist blueprint binding missing");
        category = w.players[b.owner].raw[22 + b.blueprintIndex * 36 + 22];
      }
      return {
        id: e.id,
        kind: e.kind,
        index: e.index,
        owner: e.owner,
        category,
      };
    }
    id = node.next;
  }
  return null;
}
/** Already-staged4E950 callback. Numeric result is published/retired by scheduler. */
export function stepCampaignSalvageEffect(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
): SalvageEffectUpdate {
  if (!pack.rules || !pack.ecologyRules?.corpseFriction)
    throw Error("Original salvage motion/friction tables required");
  validateSalvageDescriptor(pack.effectRules?.descriptors[45]);
  const before = w.powerEffects.slots[slot]?.nativePrior;
  if (!before) throw Error("Actual salvage carrier missing");
  return stepSalvageEffect(before, {
    frame: w.frame,
    gravity: options.gravity,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    terrain: w.terrain,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    friction: pack.ecologyRules.corpseFriction,
    profile: animationProfile(pack.assets.EFF, 45),
    obstacle: (point, height) => {
      const b = campaignAirborneBuilding(w, pack, point, height);
      return b ? { position: b.position, ground: b.ground } : null;
    },
    child(q, parent) {
      publish(w, slot, parent);
      if (q.code !== 21 && q.code !== 48)
        throw Error("Unexpected salvage common water child");
      const made = createStagedCampaignWater(
          w,
          { ...q, code: q.code },
          pack,
          options,
          out,
        ),
        current = w.powerEffects.slots[slot].nativePrior!;
      if (made === slot || current[6] !== 5 || current[69] !== 45)
        throw Error("Water factory replaced its executing salvage carrier");
      parent.splice(0, 81, ...current);
      return made !== null;
    },
    contact(point, parent) {
      publish(w, slot, parent);
      parent.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
      return firstContact(w, point);
    },
    credit(target, amount, parent) {
      const e = campaignEntity(w, target.id);
      if (!e || e.kind !== 3 || e.owner !== target.owner)
        throw Error("Salvage pickup target changed before credit");
      const player = w.players[e.owner];
      if (!player || player.raw.length !== 1805)
        throw Error("Actual salvage funds owner required");
      put32(player.raw, 0x4a3, (u32(player.raw, 0x4a3) + amount) >>> 0);
      player.funds = u32(player.raw, 0x4a3);
      parent.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
    },
  });
}
function mirror(w: CampaignWorld) {
  for (const p of w.players) {
    p.funds = u32(p.raw, 0x4a3);
    p.goop = u32(p.raw, 0x4a7);
    for (let selector = 0; selector < 14; selector++)
      p.completed[selector] = p.raw[0x600 + selector];
    p.owned = u16(p.raw, 0x60e);
    const e = w.economy.players[p.id];
    e.goop = p.goop;
    e.capacity = u32(p.raw, 0x5e6);
    e.maxOperationalHQGrade = p.raw[0x6e1];
  }
  for (const b of w.buildings) {
    const n = w.buildingNative[b.slot];
    if (n[6] !== 4) throw Error("Demolition live building projection differs");
    b.health = i16(n as number[], 43);
    b.energy = i16(n as number[], 61);
    b.complete = !!(n[49]! & 1);
    const e = w.economy.buildings.find((e) => e.id === b.id);
    if (!e) throw Error("Demolition economy building missing");
    const flags = u16(n as number[], 49);
    e.energy = b.energy;
    e.complete = b.complete;
    e.disabled = !!(flags & 0x40);
    e.powered = !!(flags & 4);
    e.capacitySuppressed = !!(flags & 0x840);
    e.hqUpgradeSuppressed = !!(flags & 0x140);
    e.depleted = !!(flags & 0x200);
    e.extraDrain = n[63]!;
  }
}
function remove<T>(rows: T[], test: (row: T) => boolean) {
  for (let i = rows.length - 1; i >= 0; i--)
    if (test(rows[i])) rows.splice(i, 1);
}
/**44380 selector2/4 front scan,8B2A0 operation0/1. This clears only the
 * processing reservation bits; it neither retires entities nor changes counts. */
export function clearStagedCampaignBuildingProcessingFront(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
): SourceEntityId[] {
  const n = w.buildingNative[slot],
    selector = n?.[45];
  if (n?.[6] !== 4 || (selector !== 2 && selector !== 4))
    throw Error("Actual selector2/4 processing-front building required");
  const offset = pack.buildingRules?.processingFrontOffset;
  if (!offset) throw Error("Original processing front offset required");
  const point: [number, number] = [
    ((i16(n as number[], 7) + offset[0]) << 16) >> 16,
    ((i16(n as number[], 9) + offset[1]) << 16) >> 16,
  ];
  let id = w.spatial.heads[worldCell(...point)];
  const seen = new Set<string>(),
    cleared: SourceEntityId[] = [];
  while (id) {
    if (seen.has(id)) throw Error("Demolition processing chain cycle");
    seen.add(id);
    const e = campaignEntity(w, id),
      node = w.spatial.nodes[id];
    if (!e || !node) throw Error("Demolition processing entity is inactive");
    if (e.kind === 2 && i16(e.native as number[], 44) <= 0) {
      e.native[46] = e.native[46]! & 251;
      w.ecology.plants[e.index].plantFlags = e.native[46]!;
      cleared.push(e.id);
    } else if (selector === 4 && e.kind === 1 && e.native[94]! >= 24) {
      //JSON saves preserve both serialized images, not their object alias.
      //Validate the actual current binding before clearing only this source
      //bit in each held image; never copy other possibly stale fields.
      const canonical = w.creatureNative[e.index];
      if (
        !canonical ||
        canonical.length !== e.native.length ||
        canonical.some((v, i) => v !== e.native[i])
      )
        throw Error("Processing-front creature native images differ");
      e.native[96] = e.native[96]! & 223;
      canonical[96] = canonical[96]! & 223;
      cleared.push(e.id);
    }
    id = node.next;
  }
  return cleared;
}
/** Complete44380 path for admitted selectors. No damage/debris/crater is added. */
function retire(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignDemolitionServices,
  detail: Pick<
    CampaignDemolitionReceipt,
    "cleanedReferenceBytes" | "clearedFrontReferences" | "cancelledActorIds"
  >,
) {
  const n = w.buildingNative[slot],
    owner = n[24]!,
    selector = n[45]!,
    p = w.players[owner],
    position: [number, number] = [i16(n as number[], 7), i16(n as number[], 9)],
    footprint = pack.rules!.tables.buildingFootprints[selector];
  //Selector5 needs its independent extra launch footprint;12/9 are not admitted
  //by this bounded host's current ordinary building families.
  if (
    ![0, 1, 2, 3, 4, 6, 7, 8, 10, 11, 13].includes(selector) ||
    ![1, 2, 3].includes(footprint)
  )
    throw Error(
      "Demolition selector retirement requires its separate source family",
    );
  //44380 calls753F0 with EBX=0/ECX=0: clear1/16 only. No construction
  //classification/border rebuild or crater is performed by timed demolition.
  clearDestroyedFootprint(w.terrain, position, footprint);
  if (n[49]! & 1) p.raw[0x600 + selector] = (p.raw[0x600 + selector] - 1) & 255;
  if (selector === 2 || selector === 4) {
    detail.clearedFrontReferences.push(
      ...clearStagedCampaignBuildingProcessingFront(w, slot, pack),
    );
  } else if (selector === 13)
    put32(p.raw, 0x4a7, (u32(p.raw, 0x4a7) - u32(n as number[], 54)) >>> 0);
  if (services.selectedBuildingSlot?.(w) === slot)
    services.onEvent?.(w, { type: "selection-cleared", slot });
  const id: SourceEntityId = `source:3:${slot}`,
    view = w.buildings.find((b) => b.slot === slot);
  if (!view) throw Error("Demolition actual building view missing");
  unlinkSpatial(w.spatial, w.terrain, id);
  synchronizeCampaignLinks(w);
  detail.cleanedReferenceBytes += cleanupCampaignReferences(w, id);
  n[6] = 0;
  p.raw[0x4a2] = (p.raw[0x4a2] - 1) & 255;
  const count = (p.raw[0x4a2] << 24) >> 24;
  if (count > 0) {
    const live = w.buildingNative
      .slice(owner * 64, owner * 64 + 64)
      .filter((n) => n[6] !== 0);
    if (live.length !== count)
      throw Error("Demolition source owner count differs");
    put16(
      p.raw,
      0x5fc,
      Math.trunc(
        live.reduce((s, n) => s + ((i16(n as number[], 7) >> 8) & 255), 0) /
          count,
      ) << 8,
    );
    put16(
      p.raw,
      0x5fe,
      Math.trunc(
        live.reduce((s, n) => s + ((i16(n as number[], 9) >> 8) & 255), 0) /
          count,
      ) << 8,
    );
  }
  for (const effect of w.powerEffects.slots)
    if (effect.packet?.targetId === view.id) effect.packet.targetId = null;
  for (const b of w.builders)
    if (b.task?.buildingId === view.id) {
      if (!services.cancelConstruction)
        throw Error(
          "Demolition normalized builder cancellation service required",
        );
      services.cancelConstruction(w, b.id);
      detail.cancelledActorIds.push(b.id);
    }
  for (const actor of w.actors)
    if (actor.egressBuildingId === view.id) actor.egressBuildingId = null;
  remove(w.buildings, (b) => b.slot === slot);
  remove(w.economy.buildings, (b) => b.owner * 64 + b.slot === slot);
  remove(w.ecology.otherEntities, (e) => e.id === id);
}
/** Staged complete callback; preserves held world/economy/building/player roots. */
export function stepStagedCampaignBuildingDemolition(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignDemolitionServices,
): CampaignDemolitionReceipt {
  if (!pack.rules || !pack.buildingRules)
    throw Error("Original demolition building tables/resources required");
  const detail = {
    cleanedReferenceBytes: 0,
    clearedFrontReferences: [] as SourceEntityId[],
    cancelledActorIds: [] as number[],
  };
  const receipt = stepStagedBuildingDemolition(w, slot, {
    native: (s, i) => s.buildingNative[i],
    constructionCosts: pack.rules.tables.constructionCosts,
    actor(s, i) {
      const native = s.specialists.records[i],
        binding = s.specialists.bindings[i];
      if (!native || !binding || i < 0 || i >= 20)
        throw Error("Actual retained demolition specialist blueprint required");
      return {
        index: i,
        native,
        skill:
          (s.players[binding.owner].raw[
            22 + binding.blueprintIndex * 36 + 23
          ] <<
            24) >>
          24,
      };
    },
    profile: (_s, _i, action) =>
      animationProfile(
        pack.assets[campaignBuildingAsset(pack, w.buildingNative[slot][45]!)],
        action,
      ),
    salvage: (s, q) =>
      createStagedCampaignSalvage(s, q, pack, services.effectOptions(s)),
    capacity: (s, owner) => {
      updateNativeBuildingCapacity(s, owner);
    },
    retire: (s, i) => retire(s, i, pack, services, detail),
    onEvent: (s, event) => {
      requestAudio(s.audio, {
        frame: s.frame,
        entity: `source:3:${slot}`,
        cue: event.channel,
        mode: 4,
        parameter: 0,
        gain: 1,
        range: null,
      });
      services.onEvent?.(s, event);
    },
  });
  mirror(w);
  synchronizeCampaignLinks(w);
  return { ...receipt, ...detail };
}
const roots = [
  "buildingNative",
  "creatureNative",
  "specialists",
  "collapse",
  "ethereals",
  "presentation",
  "buildings",
  "jobs",
  "muleQueues",
  "auxiliary",
  "pendingEnvironmentEffects",
  "strategy",
] as const;
/** Standalone atomic entry; economy callers use the staged entry above. */
export function stepCampaignBuildingDemolition(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignDemolitionServices,
): CampaignDemolitionReceipt {
  const options = services.effectOptions(w),
    s = cloneEffectHost(w, options);
  if (roots.some((k) => w[k] && s[k] === w[k])) {
    Object.assign(
      s,
      structuredClone(
        Object.fromEntries(roots.filter((k) => k in w).map((k) => [k, w[k]])),
      ),
    );
    for (const m of s.ecology.mules) s.creatureNative[m.index] = m.native;
  }
  const result = stepStagedCampaignBuildingDemolition(s, slot, pack, services);
  commitEffectHost(w, s, options);
  for (const k of roots)
    if (k in s) (w as unknown as Record<string, unknown>)[k] = s[k];
  return result;
}
