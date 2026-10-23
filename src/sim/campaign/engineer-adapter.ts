/** Native Engineer task0 over the current staged campaign pools. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  makeEngineerConstructionServices,
  planEngineerCompletedBuildingContribution,
} from "../mechanics/engineer-construction";
import {
  stepEngineerCallback,
  queueEngineerPlacement,
  queueEngineerMove,
  cancelEngineerWork,
  cancelStagedEngineerWork,
  type EngineerCallbackContext,
  type EngineerReceipt,
} from "../mechanics/engineer";
import {
  classifyConstructionSite,
  type ConstructionEvent,
  type ConstructionBuildingRequest,
} from "../mechanics/construction";
import {
  reserveSite,
  readSiteReservation,
  releaseSite,
  worldCell,
  groundHeight,
} from "../mechanics/terrain";
import { ecologyTerrainClass, sitePlantBlocked } from "../mechanics/ecology";
import { resolveMovementTarget } from "../mechanics/motion";
import { animationProfile } from "../mechanics/animation";
import {
  createNativeBuilding,
  progressNativeBuilding,
  type NativeBuildingSelector,
} from "../mechanics/building-native";
import { createBuildingEffect } from "../mechanics/building-effect";
import { updateNativeBuildingCapacity } from "../mechanics/building-damage";
import { specialistBlockerWeight } from "../mechanics/specialist-motion";
import { requestAudio } from "../mechanics/audio";
import { effectTerrainShade } from "../mechanics/power-motion";
import {
  campaignGeneticistContext,
  consumeCampaignGeneticistReceipt,
  type CampaignSpecialistServices,
} from "./specialist-adapter";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
} from "./effect-scheduler";
import { campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { insertSpatial } from "./spatial";
import { i16, u16, u32, put16, put32 } from "./bytes";

function capacity(w: CampaignWorld, owner: number) {
  const after = updateNativeBuildingCapacity(w, owner),
    p = w.economy.players[owner];
  p.capacity = after.capacity;
  p.maxOperationalHQGrade = after.maximumGenepodGrade;
}
function mirrorResources(w: CampaignWorld) {
  for (const p of w.players) {
    p.funds = u32(p.raw, 0x4a3);
    p.goop = u32(p.raw, 0x4a7);
    p.completed = p.raw.slice(0x600, 0x60e);
    p.owned = u16(p.raw, 0x60e);
    w.economy.players[p.id].goop = p.goop;
  }
}
/** Immediate441C0 effects; retain the native building array held by534D0. */
export function progressCampaignEngineerBuilding(
  w: CampaignWorld,
  pack: Pack,
  slot: number,
  increment: number,
) {
  const n = w.buildingNative[slot],
    b = w.buildings.find((b) => b.slot === slot);
  if (!b || n?.[6] !== 4 || n[45] !== b.selector)
    throw Error("Current Engineer building projection missing");
  const maximum = pack.rules!.tables.buildingHealth[b.selector * 3],
    owner = n[24]!,
    events: ConstructionEvent[] = [],
    alreadyComplete = !!(u16(n as number[], 49) & 1);
  let completed: boolean,
    completionOffset: number | null,
    ownedBit: number | null,
    audio: number | null;
  if (alreadyComplete) {
    const plan = planEngineerCompletedBuildingContribution(
      n,
      increment,
      maximum,
    );
    if (plan.damageRecoveryNative) {
      n.splice(0, n.length, ...plan.damageRecoveryNative);
      capacity(w, owner);
    }
    n.splice(0, n.length, ...plan.native);
    completed = plan.completed;
    completionOffset = plan.completedPlayerCountOffset;
    ownedBit = plan.acquiredOwnershipBit;
    audio = null;
  } else {
    const plan = progressNativeBuilding(n, {
      increment,
      maximumHealth: maximum,
      loading: false,
    });
    if (!plan.ok) throw Error(plan.reason);
    n.splice(0, n.length, ...plan.value.native);
    completed = plan.value.completed;
    completionOffset = plan.value.completedPlayerCountOffset;
    ownedBit = plan.value.acquiredOwnershipBit;
    audio = plan.value.completionAudioCue;
  }
  b.health = i16(n as number[], 43);
  b.complete = !!(u16(n as number[], 49) & 1);
  b.energy = i16(n as number[], 61);
  events.push({
    type: "building-progress",
    buildingId: slot,
    increment,
    health: b.health,
  });
  if (completed) {
    const raw = w.players[owner].raw;
    if (completionOffset !== null)
      raw[completionOffset] = (raw[completionOffset] + 1) & 255;
    if (ownedBit !== null) put16(raw, 0x60e, u16(raw, 0x60e) | ownedBit);
    for (const m of w.ecology.mules)
      if (
        m.native[6] === 1 &&
        m.native[90] === 4 &&
        u16(m.native as number[], 88) === slot
      ) {
        m.native[90] = m.native[120] = m.native[95] = 0;
        m.native[96] = m.native[96]! & 239;
      }
    capacity(w, owner);
    events.push({
      type: "building-completed",
      buildingId: slot,
      clearCreatureTargets: true,
      refreshCapacity: true,
    });
    if (audio !== null)
      requestAudio(w.audio, {
        frame: w.frame,
        entity: `source:3:${slot}`,
        cue: audio,
        mode: 2,
        parameter: 0,
        gain: 1,
        range: null,
      });
  }
  mirrorResources(w);
  return { completed, events };
}
/** Real shared44 plus immediate kind4 child creation. Allocation capacity
 * remains distinct from construction payment;534D0 retries on null. */
export function createStagedCampaignEngineerBuilding(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
  request: ConstructionBuildingRequest,
) {
  let slot = request.owner * 64;
  while (slot < request.owner * 64 + 64 && w.buildingNative[slot][6] !== 0)
    slot++;
  if (slot === request.owner * 64 + 64) return null;
  const effectSlot = allocateStagedSharedEffect(
    w,
    44,
    pack,
    services.effectOptions(w),
  );
  if (effectSlot === null) return null;
  const ground = groundHeight(w.terrain, ...request.point),
    made = createNativeBuilding(w.buildingNative[slot], {
      slot,
      owner: request.owner,
      selector: request.selector as NativeBuildingSelector,
      position: request.point,
      ground,
      shade: effectTerrainShade(w.terrain, ...request.point),
    });
  if (!made.ok) throw Error(made.reason);
  const n = w.buildingNative[slot];
  n.splice(0, n.length, ...made.value);
  w.buildings.push({
    id: 1000 + slot,
    slot,
    owner: request.owner,
    selector: request.selector,
    x: request.point[0],
    y: request.point[1],
    grade: 0,
    health: 0,
    complete: false,
    energy: 0,
  });
  insertSpatial(
    w.spatial,
    w.terrain,
    `source:3:${slot}`,
    worldCell(...request.point),
  );
  const effect = createBuildingEffect(
    w.powerEffects.slots[effectSlot].nativePrior!,
    {
      slot: effectSlot,
      owner: request.owner,
      selector: request.selector,
      buildingSlot: slot,
      point: request.point,
      ground,
      height: request.height,
      shade: n[23]!,
    },
  );
  publishStagedSharedEffect(w, effectSlot, effect);
  const owned = w.buildings.filter((b) => b.owner === request.owner),
    raw = w.players[request.owner].raw;
  raw[0x4a2] = owned.length;
  for (const [axis, field] of [
    ["x", 0x5fc],
    ["y", 0x5fe],
  ] as const)
    put16(
      raw,
      field,
      Math.trunc(
        owned.reduce((s, b) => s + ((b[axis] >> 8) & 255), 0) / owned.length,
      ) << 8,
    );
  capacity(w, request.owner);
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((s) => s.occupied).length,
  );
  synchronizeCampaignLinks(w);
  requestAudio(w.audio, {
    frame: w.frame,
    entity: `source:4:${effectSlot}`,
    cue: 0x3f,
    mode: 2,
    parameter: 0,
    gain: 1,
    range: 100,
  });
  return { buildingSlot: slot, effectSlot };
}
export function campaignEngineerContext(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): EngineerCallbackContext<CampaignWorld> {
  const common = campaignGeneticistContext(w, pack, services),
    tables = pack.rules!.tables;
  return {
    ...common,
    resolvePlacementPoint: (s, index, origin, requested) =>
      resolveMovementTarget(origin, requested, tables, (p) => {
        const n = s.specialists.records[index],
          cls = ecologyTerrainClass(s.terrain, p);
        return (
          !(n[83]! & (1 << cls)) &&
          !campaignAirborneBuilding(s, pack, p, -1, 0) &&
          specialistBlockerWeight(
            n,
            campaignQueryEntities(s, [p])
              .filter((e) => e.id !== `source:2:${index}`)
              .map((e) => e.native),
          ) < 10
        );
      }),
    construction: makeEngineerConstructionServices({
      tables,
      escapeRay: common.escapeRay,
      constructionCosts: tables.constructionCosts,
      siteClass: (s, p, size) =>
        (
          ({ valid: 0, blocked: 1, water: 2, occupied: 3, mineral: 4 }) as const
        )[
          classifyConstructionSite(s.terrain, p, size, 100, (cell) =>
            sitePlantBlocked(s.ecology, cell),
          )
        ],
      reserveSite: (s, p, size) => {
        const r = reserveSite(s.terrain, p, size, tables.terrainBorder);
        return {
          point: [(p[0] & ~255) | 127, (p[1] & ~255) | 127],
          targetHeight: r.targetHeight,
          events: [{ type: "terrain", cells: r.vertices }],
        };
      },
      releaseSite: (s, r) => {
        const geometry = readSiteReservation(s.terrain, r.point, r.footprint),
          source = s.source.source.terrain;
        releaseSite(
          s.terrain,
          geometry,
          {
            water: source.rawWaterHeight,
            climate: source.climate,
            center: source.climateCenter as [number, number],
          },
          tables.terrainBorder,
        );
        return [{ type: "terrain", cells: geometry.vertices }];
      },
      building: (s, slot) =>
        s.buildingNative[slot]?.[6] === 4 ? s.buildingNative[slot] : null,
      createBuildingEffect: (s, r) =>
        createStagedCampaignEngineerBuilding(s, pack, services, r),
      progressBuilding: (s, slot, increment) =>
        progressCampaignEngineerBuilding(s, pack, slot, increment),
      animation: (s, index, action) =>
        animationProfile(
          pack.assets[s.specialists.bindings[index]!.assetKey],
          action,
        ),
    }),
  };
}
function consume(w: CampaignWorld, index: number, r: EngineerReceipt) {
  mirrorResources(w);
  consumeCampaignGeneticistReceipt(w, index, r);
  for (const e of r.constructionEvents) {
    if (e.type === "audio")
      requestAudio(w.audio, {
        frame: w.frame,
        entity: `source:2:${index}`,
        cue: e.channel,
        mode: e.mode,
        parameter: e.parameter,
        gain: 1,
        range: null,
      });
    if (
      e.type === "building-completed" ||
      e.type === "building-created" ||
      e.type === "cancelled"
    ) {
      const text =
        e.type === "building-completed"
          ? "Building completed"
          : e.type === "building-created"
            ? "Building placed; engineer contributing work"
            : e.reason === "native-construction-finished"
              ? "Construction complete"
              : `Construction stopped: ${e.reason}`;
      w.notices.push({
        frame: w.frame,
        severity:
          e.type === "cancelled" && e.reason !== "native-construction-finished"
            ? "warning"
            : "info",
        text,
        entityId: index,
      });
      if (w.notices.length > 40) w.notices.shift();
    }
  }
  const n = w.specialists.records[index],
    a = w.actors.find((a) => a.id === index)!;
  if (n[6] === 3 && n[85] === 9 && n[88]! & 1)
    a.reason =
      [
        "Approaching terrain work",
        "Terraforming",
        "Terraforming",
        "Approaching construction site",
        "Placing building",
        "Building",
      ][i16(n as number[], 136)] ?? r.reason;
}
export function stepCampaignEngineer(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  consume(
    w,
    index,
    stepEngineerCallback(w, index, campaignEngineerContext(w, pack, services)),
  );
}
export function requestCampaignEngineer(
  w: CampaignWorld,
  index: number,
  selector: number,
  point: [number, number],
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  consume(
    w,
    index,
    queueEngineerPlacement(
      w,
      index,
      { callerOwner: w.selectedPlayer, selector, point },
      campaignEngineerContext(w, pack, services),
    ),
  );
}
export function moveCampaignEngineer(
  w: CampaignWorld,
  index: number,
  point: [number, number],
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  consume(
    w,
    index,
    queueEngineerMove(
      w,
      index,
      { callerOwner: w.selectedPlayer, point },
      campaignEngineerContext(w, pack, services),
    ),
  );
}
export function cancelStagedCampaignEngineer(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  consume(
    w,
    index,
    cancelStagedEngineerWork(
      w,
      index,
      w.specialists.bindings[index]!.owner,
      campaignEngineerContext(w, pack, services),
    ),
  );
}
export function stopCampaignEngineer(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  consume(
    w,
    index,
    cancelEngineerWork(
      w,
      index,
      w.selectedPlayer,
      campaignEngineerContext(w, pack, services),
    ),
  );
  const n = w.specialists.records[index];
  n[87] = n[87]! & 252;
}
