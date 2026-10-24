import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  damageMuleEntity,
  applyMuleCaptureImpact,
  queryMuleAirborneBuilding,
  type MuleContext,
  type MuleEvent,
} from "../mechanics/mule";
import type { MuleDamageAttacker } from "../mechanics/mule-combat";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { groundHeight } from "../mechanics/terrain";
import { ecologyTerrainClass } from "../mechanics/ecology";
import { specialistBlockerWeight } from "../mechanics/specialist-motion";
import { campaignEntity, campaignQueryEntities } from "./entity-view";
import { consumeStagedMuleEffects } from "./mule-effects";
import { cleanupCampaignReferences } from "./cleanup";
import { copySpatialLinks, unlinkSpatial } from "./spatial";
import { i16, put16, put32, u16, u32 } from "./bytes";
import type { SourceEntityId } from "./source-pools";
import { readShepherdOperators } from "../mechanics/shepherd";
import { campaignBuildingAsset } from "./building-startup-adapter";

/** Current virtual0/68 and combat-only building reach. These are distinct
 * from74270 collision extents and from the construction footprint in cells. */
export function campaignMuleCombatEntity(
  w: CampaignWorld,
  pack: Pack,
  id: string,
) {
  if (!/^source:[0-7]:\d+$/.test(id))
    throw new Error("Invalid combat entity identity");
  const e = campaignEntity(w, id as SourceEntityId);
  if (!e || ![1, 2, 3, 4].includes(e.kind)) return null;
  let dead: boolean,
    specialistStyle: number | undefined,
    buildingHalfWidth: number | undefined;
  if (e.kind === 1) dead = e.native[94]! >= 24;
  else if (e.kind === 2) dead = i16(e.native as number[], 44) <= 0;
  else if (e.kind === 3) {
    const binding = w.specialists.bindings[e.index];
    if (!binding) throw new Error("Actual combat specialist binding missing");
    const raw = w.players[binding.owner].raw,
      at = 22 + binding.blueprintIndex * 36;
    specialistStyle = (raw[at + 21] << 24) >> 24;
    dead = (raw[at + 26] << 24) >> 24 <= 0;
  } else {
    dead = i16(e.native as number[], 43) <= 0;
    const shape = pack.rules?.tables.buildingFootprints[e.native[45]!],
      widths = pack.rules?.tables.buildingCombatHalfWidths;
    if (shape === undefined || !widths || !Number.isInteger(widths[shape]))
      throw new Error("Original building combat half-width table missing");
    buildingHalfWidth = widths[shape];
  }
  return {
    id: e.id,
    index: e.index,
    kind: e.kind as 1 | 2 | 3 | 4,
    owner: e.owner,
    native: e.native,
    physicalHeight: e.physicalHeight,
    dead,
    ...(specialistStyle !== undefined ? { specialistStyle } : {}),
    ...(buildingHalfWidth !== undefined ? { buildingHalfWidth } : {}),
  };
}

export function campaignMuleBuildingPointAccepted(
  w: CampaignWorld,
  pack: Pack,
  mule: { native: (number | null)[] },
  point: [number, number],
  buildingIndex: number,
): boolean {
  const obstacle = campaignAirborneBuilding(w, pack, point, -1),
    mask = mule.native[83];
  if (mask == null) throw new Error("Actual Mule terrain-class mask missing");
  if (obstacle && i16(obstacle.native as number[], 15) !== buildingIndex)
    return false;
  if (mask & (1 << ecologyTerrainClass(w.terrain, point))) return false;
  return (
    specialistBlockerWeight(
      mule.native,
      campaignQueryEntities(w, [point]).map((e) => e.native),
    ) < 10
  );
}
/** Exact74270 first-building semantics and current raw ANB height. */
export function campaignAirborneBuilding(
  w: CampaignWorld,
  pack: Pack,
  p: [number, number],
  height: number,
  mask: 0 | 1 = 1,
) {
  return queryMuleAirborneBuilding(
    w.terrain,
    p,
    height,
    (cell) => {
      let id = w.spatial.heads[cell];
      while (id) {
        const node = w.spatial.nodes[id];
        if (node.family === 3) return w.buildingNative[node.index];
        id = node.next;
      }
      return null;
    },
    (n) => {
      const asset = pack.assets[campaignBuildingAsset(pack, n[45]!)],
        a = asset?.animations?.[n[25]!],
        raw = a ? asset.frames?.[a.first + n[27]!]?.sourceSize?.[1] : undefined;
      if (raw === undefined)
        throw new Error("Original building current raw frame height missing");
      return raw;
    },
    mask,
    pack.creatureCommandRules?.footprintSearchOffsets,
  );
}
/** Full native-pool effects run inside the caller's already isolated host.
 * Inline factory ports keep every source-like array identity alive. */
export function campaignMuleDamageContext(
  w: CampaignWorld,
  pack: Pack,
): MuleContext {
  if (!pack.rules || !pack.ecologyRules)
    throw new Error("Original Mule damage rules missing");
  return {
    terrain: w.terrain,
    tables: pack.rules.tables,
    rules: pack.ecologyRules,
    frame: w.frame,
    gravity: i16(w.missionPrefix, 0x1c5d),
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    climate: w.source.source.terrain.climate,
    bounce: pack.rules.tables.bounce,
    combat: pack.ecologyRules.muleCombat,
    coldResponse: pack.ecologyRules.muleCold,
    profile: (action) => animationProfile(pack.assets.MULE, action),
    bonesProfile: (action) => animationProfile(pack.assets.BONES, action),
    obstacleAt: (p) => campaignAirborneBuilding(w, pack, p, -1) !== null,
    airborneObstacle: (p, height) =>
      campaignAirborneBuilding(w, pack, p, height),
    cellOrder: (cell) => {
      const ids: string[] = [];
      let id = w.spatial.heads[cell];
      while (id) {
        ids.push(id);
        id = w.spatial.nodes[id].next;
      }
      return ids;
    },
    effectCode: (id) => {
      const e = campaignEntity(w, id as SourceEntityId);
      if (e?.kind !== 5)
        throw new Error("Mule damage effect query binding differs");
      return e.native[69]!;
    },
    owned: {
      selectedPlayer: w.selectedPlayer,
      globalFlags: w.flags,
      allianceMasks: w.players.map((p) => p.raw[0x6e5]),
      players: w.players.map((p) => p.raw),
      buildings: w.buildingNative.map((native, index) => ({ index, native })),
      operators: readShepherdOperators(w),
    },
    combatEffect(state, terrain, rng, request) {
      if (state !== w.ecology || terrain !== w.terrain || rng !== w.rng)
        throw new Error(
          "Mule damage factory must use the isolated current host",
        );
      for (const m of state.mules) w.creatureNative[m.index] = m.native;
      put16(
        w.missionPrefix,
        0x3554,
        w.powerEffects.slots.filter((e) => e.occupied).length,
      );
      consumeStagedMuleEffects(
        w,
        [
          {
            kind: "mule-effect",
            id: request.source,
            code: 32,
            position: request.position,
            height: groundHeight(terrain, ...request.position),
            angles: request.angles,
          },
        ],
        pack,
        {
          cleanupReferences: cleanupCampaignReferences,
          priority: (code) => pack.effectRules?.descriptors[code]?.priority,
        },
      );
    },
  };
}
/** Consume5CDB0/6CBA0 receipts before another source query; death itself keeps
 * its corpse and owner creature count until actual retirement. */
export function consumeCampaignMuleDamageEvents(
  w: CampaignWorld,
  events: readonly MuleEvent[],
): void {
  for (const e of events) {
    if (
      e.kind === "mule-combat-kill" &&
      e.attackerOwner !== undefined &&
      e.attackerOwner < 4
    )
      put32(
        w.players[e.attackerOwner].raw,
        0x6fd,
        u32(w.players[e.attackerOwner].raw, 0x6fd) + 1,
      );
    if (e.kind === "mule-retired") {
      const id = e.id as SourceEntityId,
        index = Number(id.split(":")[2]);
      delete w.muleQueues[index];
      if (w.spatial.nodes[id]) unlinkSpatial(w.spatial, w.terrain, id);
      cleanupCampaignReferences(w, id);
      put16(w.missionPrefix, 0x3550, u16(w.missionPrefix, 0x3550) - 1);
    }
    if (e.kind === "mule-audio" && e.channel !== undefined) {
      requestAudio(w.audio, {
        frame: w.frame,
        entity: e.id,
        cue: e.channel,
        mode: 2,
        parameter: 0,
        gain: 1,
        range: null,
      });
    }
  }
  for (const m of w.ecology.mules) {
    w.creatureNative[m.index] = m.native;
    if (m.native[6] !== 0) copySpatialLinks(w.spatial, m.id, m.native);
  }
}
export function damageCampaignMule(
  w: CampaignWorld,
  pack: Pack,
  index: number,
  amount: number,
  attacker: SourceEntityId | null,
): MuleEvent[] {
  let source: MuleDamageAttacker | null = null;
  if (attacker) {
    const e = campaignEntity(w, attacker);
    if (!e || ![1, 3, 4, 5, 7, 8].includes(e.kind))
      throw new Error("Mule damage attacker binding differs");
    const classes =
      e.kind === 1
        ? pack.zoneRules?.speciesComponents[e.native[122]!]
        : undefined;
    if (e.kind === 1 && !classes)
      throw new Error("Actual creature component classes missing");
    source = {
      index: e.index,
      kind: e.kind as MuleDamageAttacker["kind"],
      owner: e.owner,
      native: e.native,
      ...(classes
        ? { primaryClass: classes[0], secondaryClass: classes[1] }
        : {}),
    };
  }
  const events = damageMuleEntity(
    w.ecology,
    index,
    amount,
    source,
    w.rng,
    campaignMuleDamageContext(w, pack),
  );
  consumeCampaignMuleDamageEvents(w, events);
  return events;
}
export function captureCampaignMule(
  w: CampaignWorld,
  pack: Pack,
  index: number,
  effect: (number | null)[],
  request: { damage: 1; duration: number; capturedByActor: number | null },
): MuleEvent[] {
  const events = applyMuleCaptureImpact(
    w.ecology,
    index,
    effect,
    w.rng,
    campaignMuleDamageContext(w, pack),
    request,
  );
  consumeCampaignMuleDamageEvents(w, events);
  return events;
}
