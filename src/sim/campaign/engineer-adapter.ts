/** Native Engineer task0/1/4 over the current staged campaign pools. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  makeEngineerConstructionServices,
  planEngineerCompletedBuildingContribution,
  planEngineerBuildingContribution,
  planEngineerBuildingUpgrade,
  type EngineerTakeoverChargeRequest,
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
import {
  updateNativeBuildingCapacity,
  clearDestroyedFootprint,
  setNativeBuildingFootprint,
} from "../mechanics/building-damage";
import { updateLandingSite } from "../mechanics/landing-site";
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
  cloneEffectHost,
} from "./effect-scheduler";
import { campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { insertSpatial } from "./spatial";
import { i16, u16, u32, put16, put32 } from "./bytes";
import { planBotanistEconomy } from "../mechanics/botanist";
import { campaignBuildingAsset } from "./building-startup-adapter";

export interface CampaignEngineerServices extends CampaignSpecialistServices {
  placeTakeoverCharge?(
    world: CampaignWorld,
    request: EngineerTakeoverChargeRequest,
  ): boolean;
  setTakeoverChargePhase?(
    world: CampaignWorld,
    actor: number,
    phase: 1 | 2,
  ): void;
  /** Source MAINPANL-specific audio/UI condition; modern presentation policy
   * is explicit and has no authoritative effect. Absence does not claim it. */
  buildingPresentationActive?: boolean;
}

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
  services?: CampaignEngineerServices,
) {
  const n = w.buildingNative[slot],
    b = w.buildings.find((b) => b.slot === slot);
  if (!b || n?.[6] !== 4 || n[45] !== b.selector)
    throw Error("Current Engineer building projection missing");
  const targetGrade = n[47]!,
    general =
      targetGrade !== 0 ||
      n[46] !== 0 ||
      ![0, 1, 2, 3, 4, 5, 6, 11].includes(b.selector) ||
      (!(u16(n as number[], 49) & 1) && u16(n as number[], 49) !== 0),
    maximum = pack.rules!.tables.buildingHealth[b.selector * 3 + targetGrade],
    owner = n[24]!,
    events: ConstructionEvent[] = [],
    alreadyComplete = !!(u16(n as number[], 49) & 1);
  let completed: boolean,
    completionOffset: number | null,
    ownedBit: number | null,
    audio: number | null,
    attendedActor: number | null = null;
  if (general) {
    const plan = planEngineerBuildingContribution(n, increment, maximum);
    if (plan.damageRecoveryNative) {
      n.splice(0, n.length, ...plan.damageRecoveryNative);
      capacity(w, owner);
    }
    n.splice(0, n.length, ...plan.native);
    completed = plan.completed;
    completionOffset = plan.completedPlayerCountOffset;
    ownedBit = plan.acquiredOwnershipBit;
    audio = plan.firstCompletionAudio;
    attendedActor = plan.attendedActor;
  } else if (alreadyComplete) {
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
  b.grade = n[46]! as 0 | 1 | 2;
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
    if (attendedActor !== null) {
      if (!services)
        throw Error("Actual43F60 attended Engineer cancellation required");
      events.push({ type: "message", actorId: attendedActor, index: 17 });
      cancelStagedCampaignEngineer(w, attendedActor, pack, services);
    }
    if (general) capacity(w, owner);
    for (const m of w.ecology.mules)
      if (
        m.native[6] === 1 &&
        m.native[90] === 4 &&
        u16(m.native as number[], 88) === slot
      ) {
        m.native[90] = m.native[120] = m.native[95] = 0;
        m.native[96] = m.native[96]! & 239;
      }
    if (!general) capacity(w, owner);
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
        ...(general || b.selector === 4 || b.selector === 5
          ? {
              initialRatePercent:
                115 - pack.rules!.tables.buildingFootprints[b.selector] * 15,
            }
          : {}),
      });
  }
  mirrorExistingBuilding(w, slot, general);
  mirrorResources(w);
  return { completed, events };
}
function mirrorExistingBuilding(
  w: CampaignWorld,
  slot: number,
  requireEconomy = true,
): void {
  const n = w.buildingNative[slot],
    b = w.buildings.find((v) => v.slot === slot),
    e = w.economy.buildings.find((v) => v.owner * 64 + v.slot === slot),
    flags = u16(n as number[], 49);
  if (!b || (!e && requireEconomy))
    throw Error("Actual existing building host projection missing");
  b.grade = n[46]! as 0 | 1 | 2;
  b.health = i16(n as number[], 43);
  b.complete = !!(flags & 1);
  b.energy = i16(n as number[], 61);
  if (e) {
    e.grade = b.grade;
    e.complete = b.complete;
    e.energy = b.energy;
    e.disabled = !!(flags & 64);
    e.capacitySuppressed = !!(flags & 0x840);
    e.hqUpgradeSuppressed = !!(flags & 0x140);
  }
}
/**44F50 followed by44E50. No source resource debit is inserted here. */
export function startStagedCampaignEngineerUpgrade(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignEngineerServices,
): void {
  const n = w.buildingNative[slot];
  if (!n) throw Error("Actual44F50 building slot required");
  const plan = planEngineerBuildingUpgrade(n);
  n.splice(0, n.length, ...plan.native);
  capacity(w, n[24]!);
  if (plan.resetStoredGoop) put32(n as number[], 54, 0);
  if (services.buildingPresentationActive)
    requestAudio(w.audio, {
      frame: w.frame,
      entity: `source:3:${slot}`,
      cue: 78,
      mode: 2,
      parameter: 0,
      gain: 1,
      range: null,
      initialRatePercent:
        115 - pack.rules!.tables.buildingFootprints[n[45]!] * 15,
    });
  mirrorExistingBuilding(w, slot);
  mirrorResources(w);
}
/**44F20 starts the actual building takeover callback; it does not transfer
 * ownership in the Engineer command/callback. */
export function startStagedCampaignEngineerTakeover(
  w: CampaignWorld,
  slot: number,
  actor: number,
): void {
  const n = w.buildingNative[slot],
    a = w.specialists.records[actor];
  if (n?.[6] !== 4 || a?.[6] !== 3)
    throw Error("Actual44F20 building/actor required");
  put16(n as number[], 64, i16(a as number[], 15));
  n[66] = a[6];
  put32(n as number[], 54, 256);
  n[50] = n[50]! | 8;
  mirrorExistingBuilding(w, slot);
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
  //43E30's virtual60 binds the actual resource. Selectors2/4/5/13 require their
  //imported resource profile; no synthetic artwork or source-table fallback.
  if ([2, 4, 5, 13].includes(request.selector)) {
    if (!pack.buildingRules)
      throw Error("Original constructed building resource profile required");
    if (pack.buildingRules.unsupportedSelectors.includes(request.selector))
      throw Error("Unadmitted constructed building resource profile");
    campaignBuildingAsset(pack, request.selector);
  }
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
    energy: [5, 13].includes(request.selector) ? i16(n as number[], 61) : 0,
  });
  if (request.selector === 5 || request.selector === 13) {
    if (n[63] == null)
      throw Error("Actual retained building drain required");
    w.economy.buildings.push({
      id: 1000 + slot,
      slot: slot % 64,
      owner: request.owner,
      selector: request.selector,
      grade: 0,
      x: request.point[0],
      y: request.point[1],
      complete: false,
      disabled: false,
      capacitySuppressed: false,
      hqUpgradeSuppressed: false,
      powered: false,
      energy: i16(n as number[], 61),
      extraDrain: n[63],
      depleted: false,
      storedGoop: 0,
      specialPowerDelivery: false,
    });
  }
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
  services: CampaignEngineerServices,
): EngineerCallbackContext<CampaignWorld> {
  const common = campaignGeneticistContext(w, pack, services),
    tables = pack.rules!.tables;
  return {
    ...common,
    //57A10 is an outer callback transaction. Existing-building work can touch
    //building/specialist pools and recursive effects beyond the generic effect
    //host roots. Stage those too, preserving their shared aliases.
    stageWorld: (original) => {
      const staged = cloneEffectHost(
        original,
        services.effectOptions(original),
      );
      const keys = [
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
        "strategy",
      ] as const;
      //The normal host already stages these. Supply complete mutable isolation
      //for public callers with bare effect options, without recloning content.
      if (keys.some((key) => original[key] && staged[key] === original[key])) {
        const extra = structuredClone(
          Object.fromEntries(
            keys
              .filter((key) => key in original)
              .map((key) => [key, original[key]]),
          ),
        );
        Object.assign(staged, extra);
        for (const mule of staged.ecology.mules)
          staged.creatureNative[mule.index] = mule.native;
      }
      return staged;
    },
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
      buildingFootprints: tables.buildingFootprints,
      buildingHealth: tables.buildingHealth,
      buildingHalfWidths: tables.buildingCombatHalfWidths,
      buildingFrontOffset: pack.buildingRules?.processingFrontOffset,
      recruitmentLandingOffset:
        pack.specialistRecruitmentRules?.associatedLandingOffset,
      releaseRecruitmentSite: (s, point, size) => [
        {
          type: "terrain",
          cells: clearDestroyedFootprint(s.terrain, point, size),
        },
      ],
      prepareRecruitmentSite: (s, point) => {
        const profile = pack.specialistRecruitmentRules?.landingSite;
        if (!profile)
          throw Error("Original75240 landing-site profile required");
        return [
          {
            type: "terrain",
            cells: updateLandingSite(
              s.terrain,
              null,
              point,
              s.frame,
              0,
              0,
              profile,
            ).cells,
          },
        ];
      },
      startUpgrade: (s, slot) =>
        startStagedCampaignEngineerUpgrade(s, slot, pack, services),
      startTakeover: startStagedCampaignEngineerTakeover,
      placeTakeoverCharge: (s, request) => {
        if (!services.placeTakeoverCharge)
          throw Error("Actual code50 planted charge host required");
        return services.placeTakeoverCharge(s, request);
      },
      setTakeoverChargePhase: (s, actor, phase) => {
        if (!services.setTakeoverChargePhase)
          throw Error("Actual code50 charge phase host required");
        services.setTakeoverChargePhase(s, actor, phase);
      },
      debitTakeoverScore: (s, actor, amount) => {
        const raw = s.players[s.specialists.bindings[actor]!.owner].raw,
          r = planBotanistEconomy(raw, s.missionPrefix, {
            operation: "debit",
            amount,
            entity: null,
          });
        raw.splice(0, raw.length, ...r.raw);
      },
      takeoverAnimation: (s, actor) =>
        animationProfile(
          pack.assets[s.specialists.bindings[actor]!.assetKey],
          17,
        ),
      siteClass: (s, p, size) =>
        (
          ({ valid: 0, blocked: 1, water: 2, occupied: 3, mineral: 4 }) as const
        )[
          // Plants do not occupy a site. footprint(4)=2 places a 2x2 whose footprint spans
          // (cx-1..cx, cy-1..cy) (clearDestroyedFootprint's shift=-1), while the pack's
          // processingFrontOffset is [-256,0]: the Recycling Plant's processing cell is one of
          // its own four cells. That is only reachable if the plant sits under the building,
          // so a plant must not reject the site. Building-blocking still comes from the terrain
          // occupancy bit inside classifyConstructionSite.
          classifyConstructionSite(s.terrain, p, size, 100, () => false)
        ],
      reserveSite: (s, p, size, selector) => {
        //42B90 calls753F0(BL1,ECX0). For5 retain the native X borrow/carry
        //material-repair origin before reading the perimeter-average height.
        const vertices =
          selector === 5
            ? setNativeBuildingFootprint(s.terrain, p, 2, tables.terrainBorder)
            : undefined;
        const r =
          vertices === undefined
            ? reserveSite(s.terrain, p, size, tables.terrainBorder)
            : readSiteReservation(s.terrain, p, size);
        return {
          point: [
            (p[0] & ~255) | (size === 2 ? 0 : 127),
            (p[1] & ~255) | (size === 2 ? 0 : 127),
          ],
          targetHeight: r.targetHeight,
          events: [{ type: "terrain", cells: vertices ?? r.vertices }],
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
        progressCampaignEngineerBuilding(s, pack, slot, increment, services),
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
