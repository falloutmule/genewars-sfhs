import { z } from "zod";
import type { Pack } from "../../content/types";
import { campaignEntity } from "./entity-view";
import type { SourceEntityId } from "./source-pools";
import { stepCampaignEconomyBuildings } from "./economy-adapter";
import {
  initializeCampaignBuildings,
  campaignBuildingAsset,
  type CampaignBuilding,
} from "./building-startup-adapter";
import {
  bootstrapCampaign,
  campaignPlayerInitialLanding,
  synchronizePlayer,
  type CampaignBootstrap,
  type CampaignActor,
  type CampaignPlayer,
} from "./bootstrap";
import {
  createSpatial,
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  validateSpatial,
  copySpatialLinks,
  type SpatialState,
} from "./spatial";
import { decodeBytes, i16, u16, u32, put16, put32 } from "./bytes";
import {
  createLanding,
  activationDestination,
  type LandingState,
} from "../mechanics/landing";
import {
  animationProfile,
  animationState,
  advanceAnimation,
} from "../mechanics/animation";
import {
  createEcologyState,
  stepPlants,
  sitePlantBlocked,
  plantBlockerWeight,
  ecologyTerrainClass,
  type EcologyState,
} from "../mechanics/ecology";
import { nextRandom } from "../mechanics/random";
import { assertOpponentStrategyImplemented } from "../mechanics/opponent-startup";
import { createCampaignStrategicStorage, cloneCampaignStrategicStorage, validateCampaignStrategicStorage,
  campaignStrategicAuxiliary, type CampaignStrategicStorage } from "./strategic-state";
import {
  findRoute,
  moveGoal,
  stepGroundMotion,
  resolveMovementTarget,
} from "../mechanics/motion";
import {
  stepNeutralMule,
  stepOwnedMule,
  requestOwnedMuleMove,
  type MuleEvent,
} from "../mechanics/mule";
import {
  synchronizePowerAdapter,
  initializePowerAdapter,
} from "./power-adapter";
import {
  groundHeight,
  worldCell,
  torusDelta,
  type TerraformJob,
} from "../mechanics/terrain";
import {
  beginConstruction,
  stepConstruction,
  cancelConstruction,
  constructionAvailable,
  type ConstructionState,
  type ConstructionActor,
  type ConstructionBuilding,
  type ConstructionContext,
  type ConstructionEvent,
  type ConstructionRules,
} from "../mechanics/construction";
import {
  stepEconomyPackets,
  type EconomyState,
  type EconomyBuilding,
} from "../mechanics/economy";
import {
  createPowerEffectPool,
  effectTerrainShade,
  type PowerEffectPool,
} from "../mechanics/power-motion";
import {
  stepCampaignResult,
  planCampaignPlayerCarry,
  projectCampaignAuxiliaryMetadata,
  type CampaignResultState,
  type ResultAction,
  type CampaignAuxiliaryMetadata,
} from "../mechanics/outcome";
import type { WaterEffect } from "../mechanics/water";
import { consumeMuleWaterEvents } from "./water-adapter";
import {
  stepEffectScheduler,
  cloneEffectHost,
  createStagedDestructionEffect,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import {
  createCampaignReward,
  createRewardSchedulerOptions,
} from "./reward-adapter";
import type { RewardEvent } from "../mechanics/reward-effect";
import { cleanupCampaignReferences } from "./cleanup";
import {
  requestAudio,
  requestAudioPlaybackRate,
  type AudioState,
} from "../mechanics/audio";
import { readMissionObjectiveContext } from "../mechanics/mission-objectives";
import {
  createNativeBuilding,
  progressNativeBuilding,
  stepIncompleteNativeBuilding,
  type BuildingNative,
} from "../mechanics/building-native";
import { initializeNativePool } from "./native-pools";
import { createBuildingEffect } from "../mechanics/building-effect";
import {
  createEtherealState,
  stepCountdownEthereals,
  type EtherealAdapterEvent,
} from "./ethereal-adapter";
import { cloneEthereals, type EtherealState } from "../mechanics/ethereal";
import {
  requestGenepodMule,
  stepGenepod,
  type GenepodState,
} from "../mechanics/genepod";
import { stepCampaignZones } from "./zone-adapter";
import {
  flushEatenPlantRetirements,
  synchronizeCampaignPlantCounts,
} from "./ecology-adapter";
import { consumeMuleEffects } from "./mule-effects";
import { stepCampaignCraters } from "./crater-adapter";
import { createMuleCombatTransaction } from "./mule-combat-adapter";
import {
  makeCollapsePool,
  stepCollapsePool,
  type CollapsePool,
} from "../mechanics/collapse";
import {
  loadSpecialistPool,
  createSpecialist,
  cloneSpecialistPool,
  validateSpecialistNative,
  type SpecialistPool,
} from "../mechanics/specialist-native";
import { readGeneticistMotion } from "../mechanics/geneticist";
import { readShepherdOperators } from "../mechanics/shepherd";
import { stepCampaignShepherd, requestCampaignShepherdControl, requestCampaignShepherdInteraction, moveCampaignShepherd, stopCampaignShepherd } from "./shepherd-adapter";
import { campaignBlastAreaContext, damageCampaignPlant } from "./blast-adapter";
import { damageCampaignBuilding } from "./building-damage-adapter";
import {
  campaignAirborneBuilding,
  campaignMuleCombatEntity,
  campaignMuleBuildingPointAccepted,
  damageCampaignMule,
} from "./mule-damage-adapter";
import { stepCampaignGeneticistEffect } from "./geneticist-effect-adapter";
import { stepCampaignShepherdEffect } from "./shepherd-effect-adapter";
import {
  createStagedEtherealAttack,
  stepCampaignEtherealAttackEffect,
} from "./ethereal-attack-adapter";
import { campaignPunishmentServices } from "./punishment-adapter";
import { cloneCampaignHostRoots } from "./clone-host";
import type { SpecialistVoiceRequest } from "../mechanics/specialist-voice";
import {
  stepCampaignEngineer,
  requestCampaignEngineer,
  moveCampaignEngineer,
  stopCampaignEngineer,
  cancelStagedCampaignEngineer,
} from "./engineer-adapter";
import { revealCampaignRadius } from "./reveal-adapter";
import {
  stepCampaignGeneticist,
  stepCampaignSpecialistMotion,
  requestCampaignGeneticist,
  stepCampaignSpecialistLifecycle,
  stepCampaignSpecialistAbduction,
  cancelStagedCampaignSpecialistWork,
  retireCampaignSpecialist,
  mirrorCampaignSpecialist,
  damageCampaignSpecialist,
  moveCampaignGeneticist,
  stopCampaignGeneticist,
  type CampaignSpecialistServices,
} from "./specialist-adapter";
import {
  stepCampaignBotanist,
  requestCampaignBotanist,
  moveCampaignBotanist,
  stopCampaignBotanist,
  cancelStagedCampaignBotanist,
} from "./botanist-adapter";
type CampaignCarry = NonNullable<Parameters<typeof bootstrapCampaign>[3]> & {
  specialistOrigin?: [number, number];
  creatureControl?: number[];
  controlProvenance?: string;
};

const point = z.tuple([
  z.number().int().min(0).max(32767),
  z.number().int().min(0).max(32767),
]);
export const CampaignCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("shepherd-interact"),
    actorId: z.number().int().min(0).max(19),
    task: z.union([z.literal(1), z.literal(2)]),
    target: z.object({ kind: z.union([z.literal(1), z.literal(3), z.literal(4)]), index: z.number().int().min(0).max(299) }),
  }),
  z.object({
    type: z.literal("shepherd-control"),
    actorId: z.number().int().min(0).max(19),
    point,
    mode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
  z.object({
    type: z.literal("botanist-work"),
    actorId: z.number().int().min(0).max(19),
    task: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    point,
    selector: z.number().int().min(0).max(11).optional(),
  }),
  z.object({
    type: z.literal("research-mule"),
    actorId: z.number().int().min(0).max(19),
    muleIndex: z.number().int().min(0).max(299),
  }),
  z.object({
    type: z.literal("heal-mule"),
    actorId: z.number().int().min(0).max(19),
    muleIndex: z.number().int().min(0).max(299),
  }),
  z.object({
    type: z.literal("move-mule"),
    muleIndex: z.number().int().min(0).max(299),
    point,
    queued: z.boolean(),
  }),
  z.object({
    type: z.literal("produce-mule"),
    buildingId: z.number().int().min(1000).max(1255),
  }),
  z.object({
    type: z.literal("move"),
    actorId: z.number().int().min(0).max(19),
    point,
    queued: z.boolean(),
  }),
  z.object({
    type: z.literal("construct"),
    actorId: z.number().int().min(0).max(19),
    selector: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(3),
      z.literal(6),
      z.literal(11),
    ]),
    point,
    queued: z.boolean(),
  }),
  z.object({
    type: z.literal("cancel"),
    actorId: z.number().int().min(0).max(19),
  }),
]);
export type CampaignCommand = z.infer<typeof CampaignCommandSchema>;
export interface CampaignNotice {
  frame: number;
  severity: "info" | "warning" | "error";
  text: string;
  entityId: number | null;
}
export interface CampaignWorld extends CampaignBootstrap {
  /** Present only after the imported cold/retained control image is established. */
  strategy?: CampaignStrategicStorage;
  entryCarry: CampaignCarry | null;
  specialists: SpecialistPool;
  collapse: CollapsePool;
  /** Explicit112D10 host scratch. Fresh admitted data is zero; carry retains
   * it. No factory silently resets it or resamples its final target. */
  specialistOrigin: [number, number];
  tick: number;
  powerEffects: PowerEffectPool;
  pendingEnvironmentEffects: MuleEvent[];
  waterEffects: WaterEffect[];
  audio: AudioState;
  ethereals: EtherealState;
  presentation: {
    uiFrame: number;
    voiceSequence?: number;
    pending: {
      frame: number;
      event:
        | EtherealAdapterEvent
        | {
            type: "specialist-voice";
            sequence: number;
            request: SpecialistVoiceRequest;
          }
        | { type: "reward"; slot: number; request: RewardEvent };
    }[];
  };
  phase: "briefing" | "active" | "result" | "blocked";
  spatial: SpatialState;
  ecology: EcologyState;
  landings: LandingState[];
  builders: ConstructionActor[];
  buildings: CampaignBuilding[];
  buildingNative: BuildingNative[];
  creatureNative: (number | null)[][];
  muleQueues: Record<string, [number, number][]>;
  jobs: TerraformJob[];
  nextJobId: number;
  terrainLastFrame: number | null;
  economy: EconomyState;
  result: CampaignResultState;
  auxiliary: CampaignAuxiliaryMetadata;
  pending: { frame: number; sequence: number; command: CampaignCommand }[];
  nextSequence: number;
  notices: CampaignNotice[];
}
export function createCampaign(
  pack: Pack,
  hash: string,
  missionId = 1,
  carry?: CampaignCarry,
): CampaignWorld {
  const b = bootstrapCampaign(pack, hash, missionId, carry),
    s = b.source.source;
  const effects = initializePowerAdapter(b.source);
  let specialists = loadSpecialistPool(
    decodeBytes(s.pools[2].packedBase64),
    undefined,
    {
      players: b.players.map((p) => p.raw),
      rules: pack.rules!.tables,
    },
  );
  const specialistOrigin: [number, number] =
    (carry?.specialistOrigin?.slice() as [number, number]) ?? [0, 0];
  const origin = {
    position: specialistOrigin,
    height: groundHeight(b.terrain, ...specialistOrigin),
    shade: effectTerrainShade(b.terrain, ...specialistOrigin),
  };
  for (const p of b.players) {
    const actors = b.actors.filter((a) => a.owner === p.id);
    if (!actors.length) continue;
    p.raw[3] = 0;
    for (const a of actors) {
      const created = createSpecialist(
        specialists,
        p.raw,
        {
          blueprintIndex: a.blueprintIndex,
          origin,
          finalTarget: [a.motion.x, a.motion.y],
        },
        pack.rules!.tables,
      );
      if (!created.created || created.created.index !== a.id)
        throw new Error(
          "Source specialist allocation differs from selected roster",
        );
      specialists = created.pool;
      p.raw = created.player;
      const m = created.created.motion;
      Object.assign(a.motion, {
        x: m.x,
        y: m.y,
        ground: m.ground,
        height: m.height,
        width: m.width,
        fractionX: m.fractionX,
        fractionY: m.fractionY,
        vx: m.velocity[0],
        vy: m.velocity[1],
        vz: m.velocity[2],
        yaw: m.yaw,
        pitch: m.pitch,
        speed: m.speed,
        desiredSpeed: m.desiredSpeed,
      });
    }
  }
  const initialBuildings = initializeCampaignBuildings(b.source, pack);
  if (pack.strategicAIRules?.creatureControlPrior && carry && !carry.creatureControl)
    throw Error("Campaign carry lacks its actual strategic creature control");
  const strategy = pack.strategicAIRules?.creatureControlPrior ? createCampaignStrategicStorage(s.extensionBase64,
    carry?.creatureControl ?? pack.strategicAIRules.creatureControlPrior,
    carry?.controlProvenance ?? "Hash-admitted cold creature control; source71B70 inline retention reset") : undefined;
  const w: CampaignWorld = {
    ...b,
    ...(strategy ? { strategy } : {}),
    specialists,
    collapse: makeCollapsePool(
      initializeNativePool(b.source, 5),
      u16(b.missionPrefix, 0x3556),
    ),
    specialistOrigin,
    entryCarry: carry ? structuredClone(carry) : null,
    tick: 0,
    powerEffects: effects,
    pendingEnvironmentEffects: [],
    waterEffects: [],
    audio: { nextSequence: 0, requests: [] },
    ethereals: createEtherealState(b.source),
    presentation: { uiFrame: -1, pending: [] },
    phase: "briefing",
    spatial: createSpatial(b.source),
    ecology: createEcologyState(b.source),
    landings: [],
    builders: b.actors
      .filter(
        (a) => b.players[a.owner].blueprints[a.blueprintIndex].category === 0,
      )
      .map((a) => {
        const bp = b.players[a.owner].blueprints[a.blueprintIndex];
        return {
          id: a.id,
          owner: a.owner,
          style: bp.style,
          category: bp.category,
          skill: (bp.skill << 24) >> 24,
          enabled: false,
          motion: a.motion,
          animation: {
            id: 8,
            frame: 0,
            hold: 0,
            direction: 1,
            delay: 0,
            counter: 0,
          },
          action: 13,
          facingFlip: false,
          status: "idle",
          task: null,
        };
      }),
    buildings: initialBuildings.buildings,
    buildingNative: initialBuildings.records,
    creatureNative: initializeNativePool(b.source, 0),
    muleQueues: {},
    jobs: [],
    nextJobId: 0,
    terrainLastFrame: null,
    economy: {
      width: 128,
      height: 128,
      resources: Array.from(
        { length: 16384 },
        (_, i) => b.terrain.bytes[i * 14 + 13],
      ),
      buildings: initialBuildings.economyBuildings,
      players: b.players.map((p) => ({
        id: p.id,
        goop: p.goop,
        capacity: u32(p.raw, 0x5e6),
        maxOperationalHQGrade: p.raw[0x6e1],
        generatedEnergy: 0,
        noPowerWarningTicks: 0,
        unusedGoopWarningTicks: 0,
      })),
      packets: [],
      nextPacketId: 0,
    },
    result: {
      schemaVersion: 1,
      phase: "running",
      players: b.players.map((p) => p.raw.slice()),
      context: {
        missionNumber: missionId,
        flags: b.flags,
        mode: 0,
        active: s.context.activePlayerCount,
        selected: b.selectedPlayer,
        frame: 0,
        missionCounter: s.context.specialActivation,
        targetCount: u16(decodeBytes(s.missionPrefixBase64), 0x1ea6),
        terrainCount: s.terrain.zoneCount,
      },
      savedFrame: 0,
      stage: 0,
      terminal: null,
    },
    auxiliary: {
      entries: Array.from({ length: 300 }, () => ({
        lowFlags: null,
        second: null,
      })),
      provenance:
        "Original184D7C table was not captured; normalized unknown prior, no gameplay consumer admitted",
    },
    pending: [],
    nextSequence: 0,
    notices: [],
  };
  put16(w.missionPrefix, 0x355c, w.countdown);
  if (strategy) w.auxiliary = campaignStrategicAuxiliary(strategy);
  return w;
}
export function restartCampaign(w: CampaignWorld, pack: Pack): CampaignWorld {
  return createCampaign(
    pack,
    w.contentHash,
    w.missionId,
    w.entryCarry ?? undefined,
  );
}
/** Lossless upgrade of an unreleased snapshot made before family6 existed.
 * Only an absent, provably empty pool may be restored from its retained source
 * priors. Live native state is never synthesized from a count or actor list. */
export function upgradeEmptyCollapsePool(w: CampaignWorld): boolean {
  if (w.collapse) return false;
  if (
    u16(w.missionPrefix, 0x3556) !== 0 ||
    w.source.source.pools[5].activeCount !== 0
  )
    throw new Error("Earlier development snapshot lacks live collapse state");
  const records = initializeNativePool(w.source, 5);
  if (records.some((n) => n[6] !== 0))
    throw new Error("Collapse upgrade requires retained inactive priors");
  w.collapse = makeCollapsePool(records, 0);
  return true;
}
export function campaignObjectiveContext(w: CampaignWorld) {
  const result = readMissionObjectiveContext(w.missionPrefix, {
    flags: w.flags,
    mode: w.runtimeMode,
    active: w.source.source.context.activePlayerCount,
    selected: w.selectedPlayer,
    frame: w.frame,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
export function enterCampaign(w: CampaignWorld, pack?: Pack): void {
  if (w.phase !== "briefing")
    throw new Error("Campaign briefing entry required");
  if (w.missionPrefix[0x34b8] && !pack)
    throw new Error(
      "Original content required for campaign zone initialization",
    );
  const occupied = w.source.entities
    .filter((e) => e.family === 4)
    .map((e) => e.index);
  for (const p of w.players.filter(
    (p) =>
      p.id < w.source.source.context.activePlayerCount &&
      campaignPlayerInitialLanding(p.raw, w.flags, w.missionPrefix),
  )) {
    let slot = 0;
    while (occupied.includes(slot)) slot++;
    if (slot >= 200) throw new Error("Landing effect pool is full");
    occupied.push(slot);
    const target = w.source.source.targets[p.id] as [number, number];
    const landing = createLanding(
      p.id,
      target,
      w.terrain,
      slot,
      w.powerEffects.slots[slot].nativePrior,
    );
    w.powerEffects.slots[slot].nativePrior = landing.native?.slice();
    w.landings.push(landing);
    w.powerEffects.slots[slot].occupied = true;
    emitAudio(w, `source:4:${slot}`, 0x50, 2, 255, 180);
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:4:${slot}`,
      worldCell(...target),
    );
    put16(p.raw, 0x496, slot);
    p.raw[0x498] = 5;
  }
  // Ordinary72AD0 resets reveal, then source4096-radius reveal around target.
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((p) => p.occupied).length,
  );
  for (let i = 0; i < 16384; i++) w.terrain.bytes[i * 14 + 12] = 0;
  if (w.missionPrefix[0x34b8] && pack) {
    stepCampaignZones(
      w,
      pack,
      {
        gravity: context(w, pack).gravity,
        obstacleAt: (p) => buildingObstacle(w, p),
      },
      "initialize",
    );
  }
  reveal(w, w.source.source.targets[w.selectedPlayer] as [number, number]);
  //72960 refreshes every live entity after72AD0 zone/reveal initialization.
  const shadeNative = (n: (number | null)[]) => {
    if (n[6])
      n[23] = effectTerrainShade(
        w.terrain,
        i16(n as number[], 7),
        i16(n as number[], 9),
      );
  };
  for (const m of w.ecology.mules) shadeNative(m.native);
  for (const p of w.ecology.plants) {
    if (p.active) {
      shadeNative(p.native);
      p.shade = p.native[23]!;
    }
  }
  for (const n of w.specialists.records) shadeNative(n);
  for (const n of w.buildingNative) shadeNative(n);
  for (const p of w.powerEffects.slots)
    if (p.occupied && p.nativePrior) shadeNative(p.nativePrior);
  for (const v of w.ethereals.records) shadeNative(v.native);
  w.phase = "active";
}
function reveal(w: CampaignWorld, p: [number, number]): void {
  revealCampaignRadius(w, p, 4096);
}
function notice(
  w: CampaignWorld,
  text: string,
  severity: CampaignNotice["severity"] = "info",
  entityId: number | null = null,
): void {
  const old = w.notices.at(-1);
  if (old?.text === text && old.entityId === entityId) return;
  w.notices.push({ frame: w.frame, severity, text, entityId });
  if (w.notices.length > 40) w.notices.shift();
}
function emitAudio(
  w: CampaignWorld,
  entity: string,
  cue: number,
  mode = 2,
  parameter = 0,
  range: number | null = null,
): void {
  requestAudio(w.audio, {
    frame: w.frame,
    entity,
    cue,
    mode,
    parameter,
    range,
    gain: 1,
  });
}
function tables(pack: Pack): ConstructionRules {
  if (!pack.rules) throw new Error("Original numeric tables missing");
  return {
    ...pack.rules.tables,
    evidence: pack.rules.provenance.executableSha256,
  };
}
function projection(w: CampaignWorld): ConstructionState {
  if (
    w.buildings.some(
      (b) => ![0, 1, 3, 6, 11].includes(b.selector) || b.grade !== 0,
    )
  )
    throw Error(
      "Legacy construction projection cannot represent the current building pool",
    );
  return {
    frame: w.frame,
    terrain: w.terrain,
    rng: w.rng,
    actors: w.builders.map((a) => ({
      ...a,
      motion: w.actors.find((p) => p.id === a.id)!.motion,
    })),
    players: w.players.map((p) => ({
      id: p.id,
      progress: p.progress,
      primary: p.funds | 0,
      secondary: p.goop | 0,
      completed: p.completed,
      ownedMask: p.owned,
    })),
    buildings: w.buildings as ConstructionBuilding[],
    jobs: w.jobs,
    nextJobId: w.nextJobId,
    terrainLastFrame: w.terrainLastFrame,
    missionPrefix: w.missionPrefix,
  };
}
function applyConstruction(
  w: CampaignWorld,
  s: ConstructionState,
  events: ConstructionEvent[],
  pack: Pack,
): void {
  w.terrain = s.terrain;
  w.rng = s.rng;
  w.builders = s.actors;
  w.buildings = s.buildings;
  w.jobs = s.jobs;
  w.nextJobId = s.nextJobId;
  w.terrainLastFrame = s.terrainLastFrame;
  if (s.missionPrefix) w.missionPrefix = s.missionPrefix;
  for (const p of s.players) {
    const host = w.players[p.id];
    host.funds = p.primary >>> 0;
    host.goop = p.secondary >>> 0;
    host.completed = p.completed;
    host.owned = p.ownedMask;
  }
  for (const b of s.actors) {
    const a = w.actors.find((a) => a.id === b.id)!;
    a.motion = b.motion;
    if (b.task) {
      a.reason = b.task.phase;
      a.animation = { ...b.animation, action: b.animation.id };
    } else if (b.status === "cancelled") a.reason = "Finishing task";
    moveSpatial(
      w.spatial,
      w.terrain,
      a.sourceId as `source:2:${number}`,
      worldCell(a.motion.x, a.motion.y),
    );
  }
  for (const e of events) {
    if (e.type === "audio")
      emitAudio(w, `source:2:${e.actorId}`, e.channel, e.mode, e.parameter);
    if (e.type === "cancelled")
      notice(
        w,
        e.reason === "finished"
          ? "Construction complete"
          : `Construction stopped: ${e.reason}`,
        e.reason === "finished" ? "info" : "warning",
        e.actorId,
      );
    if (e.type === "building-created") {
      const b = w.buildings.find((v) => v.id === e.buildingId)!;
      const native = createNativeBuilding(w.buildingNative[b.slot], {
        slot: b.slot,
        owner: b.owner,
        selector: e.request.selector,
        position: [b.x, b.y],
        ground: groundHeight(w.terrain, b.x, b.y),
        shade: effectTerrainShade(w.terrain, b.x, b.y),
      });
      if (!native.ok) throw new Error(native.reason);
      w.buildingNative[b.slot] = native.value;
      insertSpatial(
        w.spatial,
        w.terrain,
        `source:3:${b.slot}`,
        worldCell(b.x, b.y),
      );
      copySpatialLinks(w.spatial, `source:3:${b.slot}`, native.value);
      const effect = w.powerEffects.slots[e.effectId];
      if (effect.occupied || !effect.nativePrior)
        throw new Error("Construction appearance slot is unavailable");
      effect.nativePrior = createBuildingEffect(effect.nativePrior, {
        slot: e.effectId,
        owner: b.owner,
        selector: b.selector,
        buildingSlot: b.slot,
        point: [b.x, b.y],
        ground: groundHeight(w.terrain, b.x, b.y),
        height: e.request.height,
        shade: effectTerrainShade(w.terrain, b.x, b.y),
      });
      effect.occupied = true;
      insertSpatial(
        w.spatial,
        w.terrain,
        `source:4:${e.effectId}`,
        worldCell(b.x + 64, b.y + 64),
      );
      copySpatialLinks(w.spatial, `source:4:${e.effectId}`, effect.nativePrior);
      emitAudio(w, `source:4:${e.effectId}`, 0x3f, 2, 0, 100);
      const ownerBuildings = w.buildings.filter((v) => v.owner === b.owner);
      w.players[b.owner].raw[0x4a2] = ownerBuildings.length;
      for (const [axis, field] of [
        ["x", 0x5fc],
        ["y", 0x5fe],
      ] as const) {
        const total = ownerBuildings.reduce(
          (sum, v) => sum + ((v[axis] >> 8) & 255),
          0,
        );
        put16(
          w.players[b.owner].raw,
          field,
          Math.trunc(total / ownerBuildings.length) << 8,
        );
      }
      notice(w, "Building placed; engineer contributing work", "info", b.id);
    }
    if (e.type === "building-progress") {
      const b = w.buildings.find((v) => v.id === e.buildingId)!;
      const native = progressNativeBuilding(w.buildingNative[b.slot], {
        increment: e.increment,
        maximumHealth: pack.rules!.tables.buildingHealth[b.selector * 3],
        loading: false,
      });
      if (!native.ok) throw new Error(native.reason);
      w.buildingNative[b.slot] = native.value.native;
    }
    if (e.type === "building-completed") {
      const b = w.buildings.find((v) => v.id === e.buildingId)!;
      for (const builder of w.builders)
        if (builder.task?.buildingId === b.id)
          w.actors.find((a) => a.id === builder.id)!.egressBuildingId = b.id;
      for (const m of w.ecology.mules)
        if (
          m.native[6] !== 0 &&
          m.native[0x5a] === 4 &&
          u16(m.native as number[], 0x58) === b.slot
        ) {
          m.native[0x5a] = m.native[0x78] = m.native[0x5f] = 0;
          if (m.native[0x60] === null)
            throw new Error("Unknown creature construction flags");
          m.native[0x60] &= ~16;
        }
      notice(w, "Building completed", "info", e.buildingId);
    }
  }
}
function blocked(
  w: CampaignWorld,
  cell: number,
  actorId: number,
  construction?: ConstructionState,
  proposed?: [number, number],
): boolean {
  const map = (construction?.terrain ?? w.terrain).bytes;
  if ((map[cell * 14 + 5] & 7) === 0) return true;
  if (plantBlockerWeight(w.ecology, cell) >= 10) return true;
  const task = (construction?.actors ?? w.builders).find(
    (a) => a.id === actorId,
  )?.task;
  return buildingObstacle(
    w,
    proposed ?? [(cell & 127) * 256 + 127, (cell >> 7) * 256 + 127],
    construction,
    task?.phase === "departure"
      ? task.buildingId
      : (w.actors.find((a) => a.id === actorId)?.egressBuildingId ?? null),
  );
}
/**74270/74160's ordered neighboring-cell query with mask1, negative-height
 * movement admission. Rejection of the first building never resumes scanning. */
function buildingObstacle(
  w: CampaignWorld,
  p: [number, number],
  s?: Readonly<ConstructionState>,
  nominated: number | null = null,
): boolean {
  const terrain = s?.terrain ?? w.terrain;
  if (!(terrain.bytes[worldCell(...p) * 14 + 11] & 1)) return false;
  const buildings = s?.buildings ?? w.buildings;
  const offsets = [
    [0, 0],
    [256, 0],
    [256, 256],
    [0, 256],
    [-256, 256],
    [-256, 0],
    [-256, -256],
    [256, -256],
    [7680, 0],
  ];
  const classes = [3, 1, 2, 3, 2, 2, 1, 2, 1, 2, 3, 3, 2, 1];
  for (let i = 0; i < offsets.length; i++) {
    const cell = worldCell(p[0] + offsets[i][0], p[1] + offsets[i][1]);
    let id = w.spatial.heads[cell];
    let found: CampaignBuilding | undefined;
    while (id) {
      const n = w.spatial.nodes[id];
      if (n.family === 3) {
        found = buildings.find((b) => b.slot === n.index);
        break;
      }
      id = n.next;
    }
    if (!found) continue;
    const kind = classes[found.selector];
    if (kind === 2 && i >= 4) continue;
    if (!found.complete) return false;
    const extent = kind === 1 ? 85 : kind === 2 ? 128 : 256;
    if (
      Math.abs(((found.x - p[0]) << 16) >> 16) > extent ||
      Math.abs(((found.y - p[1]) << 16) >> 16) > extent
    )
      return false;
    return found.id !== nominated;
  }
  return false;
}
function resolveTarget(
  w: CampaignWorld,
  a: Readonly<ConstructionActor>,
  p: [number, number],
  pack: Pack,
  s: Readonly<ConstructionState>,
): [number, number] {
  return resolveMovementTarget(
    [a.motion.x, a.motion.y],
    p,
    pack.rules!.tables,
    (v) =>
      ecologyTerrainClass(s.terrain, v) !== 0 &&
      plantBlockerWeight(w.ecology, worldCell(...v)) < 10 &&
      !buildingObstacle(
        w,
        v,
        s,
        a.task?.phase === "departure"
          ? a.task.buildingId
          : (w.actors.find((v) => v.id === a.id)?.egressBuildingId ?? null),
      ),
  );
}
function context(w: CampaignWorld, pack: Pack): ConstructionContext {
  const startup = w.source.source,
    prefix = w.missionPrefix;
  return {
    climate: {
      water: startup.terrain.rawWaterHeight,
      climate: startup.terrain.climate,
      center: startup.terrain.climateCenter as [number, number],
    },
    gravity: i16(prefix, 0x1c5d),
    resolveTarget: (a, p, s) => resolveTarget(w, a, p, pack, s),
    resolveTaskTarget: (a, p, s) => resolveTarget(w, a, p, pack, s),
    route: (a, p, s) => {
      const route = findRoute([a.motion.x, a.motion.y], p, (c) =>
        blocked(w, c, a.id, s, c === worldCell(...p) ? p : undefined),
      );
      if (!route) throw new Error("No traversable route to construction site");
      return route;
    },
    blocked: (cell, a, s, p) => blocked(w, cell, a.id, s, p),
    occupied: (cell) => sitePlantBlocked(w.ecology, cell),
    animation: (a, id) =>
      animationProfile(
        pack.assets[w.actors.find((v) => v.id === a.id)!.art],
        id,
      ),
    refill: (a) => w.players[a.owner].raw[2] !== 0,
    allocateBuilding: (request, s) => {
      let slot = request.owner * 64;
      while (
        s.buildings.some((b) => b.slot === slot) &&
        slot < request.owner * 64 + 64
      )
        slot++;
      if (slot === request.owner * 64 + 64) return null;
      const used = new Set(
        w.powerEffects.slots.flatMap((p, i) => (p.occupied ? [i] : [])),
      );
      let effectId = 0;
      while (used.has(effectId) && effectId < 200) effectId++;
      if (effectId === 200) return null;
      return { id: 1000 + slot, slot, effectId };
    },
  };
}
export function campaignBuildingAvailable(
  w: CampaignWorld,
  pack: Pack,
  selector: number,
): boolean {
  return constructionAvailable(
    projection(w).players[w.selectedPlayer],
    selector,
    tables(pack),
  );
}
export function queueCampaign(
  w: CampaignWorld,
  input: unknown,
): { ok: boolean; reason: string | null } {
  const c = CampaignCommandSchema.safeParse(input);
  if (!c.success) return { ok: false, reason: "Invalid campaign command" };
  const command = c.data;
  if (command.type === "move-mule") {
    const m = w.ecology.mules.find((m) => m.index === command.muleIndex);
    if (
      !m ||
      m.native[6] !== 1 ||
      m.native[24] !== w.selectedPlayer ||
      m.native[0x5e]! >= 24
    )
      return { ok: false, reason: "Select a living Mule you own" };
  } else if (command.type === "produce-mule") {
    const b = w.buildings.find((b) => b.id === command.buildingId);
    if (!b || b.owner !== w.selectedPlayer || !b.complete || b.selector !== 0)
      return { ok: false, reason: "Select a completed Genepod you own" };
  } else {
    const a = w.actors.find((a) => a.id === command.actorId);
    if (
      !a ||
      a.owner !== w.selectedPlayer ||
      !a.ready ||
      w.specialists.records[a.id][6] !== 3
    )
      return { ok: false, reason: "Select a landed specialist" };
    if (w.specialists.records[a.id][85] === 4)
      return { ok: false, reason: "This specialist is dying" };
    if (w.specialists.records[a.id][85] === 3)
      return { ok: false, reason: "This specialist is being abducted" };
    const category = w.players[a.owner].blueprints[a.blueprintIndex].category;
    if ((command.type === "shepherd-control" || command.type === "shepherd-interact") && category !== 3)
      return { ok: false, reason: "Select a landed Shepherd" };
    if (command.type === "shepherd-interact") {
      const target = command.target;
      if ((target.kind === 3 && target.index > 19) || (target.kind === 4 && target.index > 255) ||
          !campaignEntity(w, `source:${target.kind - 1}:${target.index}` as SourceEntityId))
        return { ok: false, reason: "Shepherd target is no longer available" };
    }
    if (command.type === "construct" && category !== 0)
      return { ok: false, reason: "Select a landed Engineer" };
    if (command.type === "botanist-work") {
      if (category !== 1)
        return { ok: false, reason: "Select a landed Botanist" };
      if (
        command.task === 1 &&
        (command.selector === undefined ||
          u32(w.players[a.owner].raw, 0x67e + command.selector * 4) === 0)
      )
        return {
          ok: false,
          reason: "Research this plant type before planting it",
        };
    }
    if (command.type === "research-mule" || command.type === "heal-mule") {
      const m = w.ecology.mules.find((m) => m.index === command.muleIndex);
      if (category !== 2)
        return { ok: false, reason: "Select a landed Geneticist" };
      if (!m || m.native[6] !== 1 || m.native[122] !== 4)
        return {
          ok: false,
          reason: "Select a Mule available for this interaction",
        };
      if (command.type === "heal-mule" && m.native[94]! >= 24)
        return { ok: false, reason: "A dead Mule cannot be healed" };
    }
  }
  if (w.phase !== "active")
    return { ok: false, reason: "Mission is not accepting orders" };
  w.pending.push({
    frame: w.frame,
    sequence: w.nextSequence++,
    command: c.data,
  });
  return { ok: true, reason: null };
}
function issue(w: CampaignWorld, c: CampaignCommand, pack: Pack): void {
  if (c.type === "move-mule") {
    const m = w.ecology.mules.find((m) => m.index === c.muleIndex);
    if (!m || m.native[24] !== w.selectedPlayer)
      throw new Error("Owned Mule required");
    if (c.queued && m.native[0x61]! & 0x80) {
      (w.muleQueues[c.muleIndex] ??= []).push(c.point);
    } else {
      if (!c.queued) w.muleQueues[c.muleIndex] = [];
      const result = requestOwnedMuleMove(w.ecology, c.muleIndex, c.point, {
        callerOwner: w.selectedPlayer,
        callerIsSelected: true,
        selectedPanelRefresh: true,
      });
      if (!result.committed)
        throw new Error(result.reason ?? "Mule move rejected");
      notice(
        w,
        result.outcome === "installed"
          ? "Mule move ordered"
          : "Mule cannot change its order in this state",
        "info",
        2000 + c.muleIndex,
      );
    }
    return;
  }
  if (c.type === "produce-mule") {
    const b = w.buildings.find((b) => b.id === c.buildingId);
    if (!b || !b.complete || b.selector !== 0 || b.owner !== w.selectedPlayer)
      throw new Error("Completed owned Genepod required");
    const result = requestGenepodMule(genepodState(w, b.slot), {
      selectedPlayer: w.selectedPlayer,
      panelState: 3,
      speciesListIndex: w.players[w.selectedPlayer].raw
        .slice(0x6ae, 0x6ae + w.players[w.selectedPlayer].raw[0x6e0])
        .indexOf(4),
      eventFlags: 8,
      capturedHit: true,
      selectedPanelRefreshEligible: true,
    });
    if (!result.ok) throw new Error(result.reason);
    commitGenepodState(w, b.slot, result.value.state);
    if (result.value.audioCue !== null)
      emitAudio(w, `source:3:${b.slot}`, result.value.audioCue);
    notice(
      w,
      result.value.disposition === "started"
        ? "Mule production started"
        : result.value.disposition === "cancelled"
          ? "Mule production cancelled; paid work refunded"
          : `Mule production: ${result.value.reason}`,
      result.value.disposition === "denied" ? "warning" : "info",
      b.id,
    );
    return;
  }
  const a = w.actors.find((a) => a.id === c.actorId)!;
  const category = w.players[a.owner].blueprints[a.blueprintIndex].category;
  if (c.type === "shepherd-interact") {
    requestCampaignShepherdInteraction(w, a.id, c.task, c.target, pack, specialistServices(pack));
    const current = w.actors.find(p => p.id === a.id)!;
    current.orders = []; current.goal = null; current.route = [];
    notice(w, c.task === 1 ? "Shepherd attack ordered" : "Shepherd stun ordered", "info", a.id);
    return;
  }
  if (c.type === "shepherd-control") {
    requestCampaignShepherdControl(w, a.id, c.point, c.mode);
    const current = w.actors.find(p => p.id === a.id)!;
    current.orders = []; current.goal = null; current.route = [];
    notice(w, "Shepherd control ordered", "info", a.id);
    return;
  }
  if (c.type === "botanist-work") {
    requestCampaignBotanist(
      w,
      a.id,
      c.task === 1
        ? {
            task: 1,
            selector: c.selector!,
            point: c.point,
            callerOwner: a.owner,
          }
        : { task: c.task, point: c.point, callerOwner: a.owner },
      pack,
      specialistServices(pack),
    );
    const current = w.actors.find((p) => p.id === a.id)!;
    current.orders = [];
    current.goal = null;
    current.route = [];
    notice(w, "Botanist work ordered", "info", a.id);
    return;
  }
  if (c.type === "research-mule" || c.type === "heal-mule") {
    requestCampaignGeneticist(
      w,
      a.id,
      c.type === "research-mule" ? 0 : 1,
      c.muleIndex,
      pack,
      specialistServices(pack),
    );
    const current = w.actors.find((p) => p.id === a.id)!;
    current.orders = [];
    current.goal = null;
    current.route = [];
    notice(
      w,
      c.type === "research-mule"
        ? "Mule research ordered"
        : "Mule healing ordered",
      "info",
      a.id,
    );
    return;
  }
  if (category === 1) {
    if (c.type === "cancel") {
      stopCampaignBotanist(w, a.id, pack, specialistServices(pack));
      const current = w.actors.find((p) => p.id === a.id)!;
      current.orders = [];
      current.goal = null;
      current.route = [];
      current.reason = "Stopped";
      return;
    }
    if (c.type !== "move")
      throw new Error("Botanist does not perform construction");
    if (c.queued) a.orders.push({ type: "move", point: c.point });
    else {
      moveCampaignBotanist(w, a.id, c.point, pack, specialistServices(pack));
      const current = w.actors.find((p) => p.id === a.id)!;
      current.orders = [];
      current.goal = null;
      current.route = [];
    }
    return;
  }
  if (category === 2) {
    if (c.type === "cancel") {
      stopCampaignGeneticist(w, a.id);
      const current = w.actors.find((p) => p.id === a.id)!;
      current.orders = [];
      current.goal = null;
      current.route = [];
      current.reason = "Stopped";
      return;
    }
    if (c.type !== "move")
      throw new Error("Geneticist does not perform construction");
    if (c.queued) a.orders.push({ type: "move", point: c.point });
    else {
      moveCampaignGeneticist(w, a.id, c.point, pack, specialistServices(pack));
      const current = w.actors.find((p) => p.id === a.id)!;
      current.orders = [];
      current.goal = null;
      current.route = [];
    }
    return;
  }
  if (category === 3) {
    if (c.type === "cancel") {
      stopCampaignShepherd(w, a.id);
      const current = w.actors.find(p => p.id === a.id)!;
      current.orders = []; current.goal = null; current.route = []; current.reason = "Stopped";
    } else {
      if (c.type !== "move") throw Error("Shepherd does not perform construction");
      if (c.queued) a.orders.push({ type: "move", point: c.point });
      else {
        moveCampaignShepherd(w, a.id, c.point, pack, specialistServices(pack));
        const current = w.actors.find(p => p.id === a.id)!;
        current.orders = []; current.goal = null; current.route = [];
      }
    }
    return;
  }
  if (category === 0) {
    const n = w.specialists.records[a.id];
    if (c.type === "cancel") {
      stopCampaignEngineer(w, a.id, pack, specialistServices(pack));
      const current = w.actors.find((v) => v.id === a.id)!;
      current.orders = [];
      current.goal = null;
      current.route = [];
      current.reason = "Stopped";
      return;
    }
    if (c.type !== "move" && c.type !== "construct")
      throw new Error("Unsupported Engineer command");
    if (c.queued)
      w.actors
        .find((v) => v.id === a.id)!
        .orders.push({
          type: c.type,
          point: c.point,
          ...(c.type === "construct" ? { selector: c.selector } : {}),
        });
    else if (c.type === "move") {
      moveCampaignEngineer(w, a.id, c.point, pack, specialistServices(pack));
      w.actors.find((v) => v.id === a.id)!.orders = [];
    } else if ([1, 8].includes(n[85]!) && n[130] === 0 && !(n[88]! & 1)) {
      requestCampaignEngineer(
        w,
        a.id,
        c.selector,
        c.point,
        pack,
        specialistServices(pack),
      );
      w.actors.find((v) => v.id === a.id)!.orders = [];
    } else {
      stopCampaignEngineer(w, a.id, pack, specialistServices(pack));
      w.actors.find((v) => v.id === a.id)!.orders = [
        { type: "construct", point: c.point, selector: c.selector },
      ];
    }
    return;
  }
  const builder = w.builders.find((b) => b.id === a.id);
  if (c.type === "cancel" || !c.queued) {
    if (builder?.task) {
      const r = cancelConstruction(
        projection(w),
        a.id,
        tables(pack),
        context(w, pack),
        "new-command",
      );
      applyConstruction(w, r.state, r.events, pack);
    }
    a.orders = [];
    a.goal = null;
    a.route = [];
  }
  if (c.type === "cancel") {
    a.reason = "Stopped";
    return;
  }
  a.orders.push({
    type: c.type,
    point: c.point,
    ...(c.type === "construct" ? { selector: c.selector } : {}),
  });
}
function genepodState(w: CampaignWorld, slot: number): GenepodState {
  for (const p of w.players) synchronizePlayer(p);
  return {
    schemaVersion: 1,
    building: w.buildingNative[slot],
    players: w.players.map((p) => p.raw),
    rng: w.rng,
  };
}
function commitGenepodState(
  w: CampaignWorld,
  slot: number,
  state: GenepodState,
): void {
  w.buildingNative[slot] = state.building;
  w.rng = state.rng;
  for (const [id, raw] of state.players.entries()) {
    const p = w.players[id];
    p.raw = raw;
    p.funds = u32(raw, 0x4a3);
    p.goop = u32(raw, 0x4a7);
    w.economy.players[id].goop = p.goop;
  }
}
function stepCampaignGenepod(
  w: CampaignWorld,
  b: EconomyBuilding,
  pack: Pack,
): void {
  const slot = b.owner * 64 + b.slot;
  const result = stepGenepod(genepodState(w, slot), {
    evidence: pack.source.executableSha256!,
    frame: w.frame,
    runningAnimation: animationProfile(pack.assets.BGENE, 1),
    terrain: w.terrain,
    tables: pack.rules!.tables,
    pools: {
      creatureCount: w.creatureNative.filter((n) => n[6] !== 0).length,
      creatures: w.creatureNative,
      effectCount: w.powerEffects.slots.filter((e) => e.occupied).length,
      effects: w.powerEffects.slots.map((e) => e.nativePrior!),
    },
  });
  if (!result.ok) throw new Error(result.reason);
  const receipt = result.value;
  commitGenepodState(w, slot, receipt.state);
  b.energy = i16(receipt.state.building as number[], 61);
  b.extraDrain = receipt.state.building[63]!;
  b.powered = !!(receipt.state.building[49]! & 4);
  if (receipt.pools) w.creatureNative = receipt.pools.creatures;
  for (const birth of receipt.births) {
    const id = `source:${birth.family}:${birth.slot}` as const;
    if (birth.family === 0) {
      const old = w.ecology.mules.find((m) => m.index === birth.slot);
      if (old) {
        old.native = birth.native;
        old.pending = [];
      } else
        w.ecology.mules.push({
          id,
          index: birth.slot,
          native: birth.native,
          pending: [],
        });
    } else {
      const effect = w.powerEffects.slots[birth.slot];
      effect.nativePrior = birth.native;
      effect.occupied = true;
      effect.packet = null;
      effect.fractionX = birth.native[67];
      effect.fractionY = birth.native[68];
    }
    insertSpatial(w.spatial, w.terrain, id, birth.cell);
    copySpatialLinks(w.spatial, id, birth.native);
  }
  for (const a of receipt.audio)
    emitAudio(w, `source:3:${slot}`, a.cue, a.mode, a.parameter ?? 0);
  if (receipt.status === "mule-born")
    notice(w, "Mule produced", "info", 1000 + slot);
  if (receipt.status === "quality-failed")
    notice(
      w,
      "Mule production failed its research quality check",
      "warning",
      1000 + slot,
    );
}
function idle(w: CampaignWorld, a: CampaignActor, pack: Pack): void {
  const bp = w.players[a.owner].blueprints[a.blueprintIndex];
  const chance = (bp.skill >> 1) * ([2, 3].includes(bp.category) ? 2 : 1);
  if (((w.frame + a.id) & 15) === 0 && nextRandom(w.rng) % 100 < chance) {
    const nearby = w.ecology.mules.some(
      (m) =>
        m.native[6] !== 0 &&
        torusDelta(i16(m.native as number[], 7), a.motion.x) ** 2 +
          torusDelta(i16(m.native as number[], 9), a.motion.y) ** 2 <=
          512 ** 2,
    );
    if (nearby) {
      a.reason =
        "Nearby creature interaction requires specialist role callback";
      notice(w, a.reason, "warning", a.id);
      return;
    }
    nextRandom(w.rng);
    nextRandom(w.rng);
  }
  if (--a.idleTimer <= 0) {
    const action = nextRandom(w.rng) % 10 < 6 ? 8 : 11;
    a.idleTimer = 20 + (nextRandom(w.rng) % 30);
    a.idleFacing = nextRandom(w.rng) % 4 < 2;
    if (a.animation.action !== action)
      a.animation = { ...a.animation, action, direction: 1, delay: 16 };
  }
  a.animation = advanceAnimation(
    a.animation,
    animationProfile(pack.assets[a.art], a.animation.action),
  );
  a.reason = "Idle";
}
function actorStep(w: CampaignWorld, a: CampaignActor, pack: Pack): void {
  if (!a.ready) return;
  if (w.specialists.records[a.id][6] !== 3) return;
  if (w.specialists.records[a.id][85] === 3) {
    stepCampaignSpecialistAbduction(w, a.id, pack, specialistServices(pack));
    return;
  }
  if ([4, 5].includes(w.specialists.records[a.id][85]!)) {
    stepCampaignSpecialistLifecycle(w, a.id, pack, specialistServices(pack));
    return;
  }
  const category = w.players[a.owner].blueprints[a.blueprintIndex].category;
  if (category === 0) {
    const n = w.specialists.records[a.id];
    if (
      a.orders.length &&
      n[85] === 1 &&
      n[130] === 0 &&
      n[88] === 0 &&
      !(n[87]! & 3)
    ) {
      const order = a.orders.shift()!;
      if (order.type === "construct")
        requestCampaignEngineer(
          w,
          a.id,
          order.selector!,
          order.point,
          pack,
          specialistServices(pack),
        );
      else
        moveCampaignEngineer(
          w,
          a.id,
          order.point,
          pack,
          specialistServices(pack),
        );
    }
    stepCampaignEngineer(w, a.id, pack, specialistServices(pack));
    return;
  }
  if (category === 1) {
    const n = w.specialists.records[a.id];
    if (a.orders.length && n[85] !== 8 && !(n[87]! & 3)) {
      const order = a.orders.shift()!;
      if (order.type !== "move")
        throw new Error("Unsupported Botanist queued order");
      moveCampaignBotanist(
        w,
        a.id,
        order.point,
        pack,
        specialistServices(pack),
      );
    }
    stepCampaignBotanist(w, a.id, pack, specialistServices(pack));
    return;
  }
  if (category === 2) {
    const n = w.specialists.records[a.id];
    if (a.orders.length && n[85] !== 8 && !(n[87]! & 3)) {
      const order = a.orders.shift()!;
      if (order.type !== "move")
        throw new Error("Unsupported Geneticist queued order");
      moveCampaignGeneticist(
        w,
        a.id,
        order.point,
        pack,
        specialistServices(pack),
      );
    }
    stepCampaignGeneticist(w, a.id, pack, specialistServices(pack));
    return;
  }
  if (category === 3) {
    const n = w.specialists.records[a.id];
    if (a.orders.length && n[85] === 1 && n[130] === 0 && !(n[87]! & 3)) {
      const order = a.orders.shift()!;
      if (order.type !== "move") throw Error("Unsupported Shepherd queued order");
      moveCampaignShepherd(w, a.id, order.point, pack, specialistServices(pack));
    }
    stepCampaignShepherd(w, a.id, pack, specialistServices(pack));
    return;
  }
  if (a.egressBuildingId !== null) {
    const completed = w.buildings.find((b) => b.id === a.egressBuildingId);
    const extent = completed
      ? completed.selector === 1
        ? 85
        : [3, 6, 11].includes(completed.selector)
          ? 128
          : 256
      : 0;
    if (
      !completed ||
      Math.abs(((completed.x - a.motion.x) << 16) >> 16) > extent ||
      Math.abs(((completed.y - a.motion.y) << 16) >> 16) > extent
    )
      a.egressBuildingId = null;
  }
  let b = w.builders.find((v) => v.id === a.id);
  if (b?.task || b?.status === "cancelled") {
    const r = stepConstruction(
      projection(w),
      a.id,
      tables(pack),
      context(w, pack),
    );
    applyConstruction(w, r.state, r.events, pack);
    return;
  }
  if (!a.goal && a.orders.length) {
    const order = a.orders.shift()!;
    if (order.type === "construct") {
      const r = beginConstruction(
        projection(w),
        a.id,
        order.selector!,
        order.point,
        tables(pack),
        context(w, pack),
      );
      applyConstruction(w, r.state, r.events, pack);
      return;
    }
    const route = findRoute([a.motion.x, a.motion.y], order.point, (c) =>
      blocked(w, c, a.id),
    );
    if (!route) {
      a.reason = "No traversable route";
      notice(w, a.reason, "warning", a.id);
      return;
    }
    a.route = route;
    a.goal = route.shift()!;
    a.motion.desiredSpeed = w.specialists.bindings[a.id]!.classSpeed;
    moveGoal(a.motion, a.goal, pack.rules!.tables);
  }
  if (a.goal) {
    const moved = stepGroundMotion(
      a.motion,
      a.goal,
      w.terrain,
      pack.rules!.tables,
      i16(w.missionPrefix, 0x1c5d),
      (cell, p) => blocked(w, cell, a.id, undefined, p),
    );
    moveSpatial(
      w.spatial,
      w.terrain,
      a.sourceId as `source:2:${number}`,
      worldCell(a.motion.x, a.motion.y),
    );
    if (moved.arrived) {
      a.goal = a.route.shift() ?? null;
      if (a.goal) moveGoal(a.motion, a.goal, pack.rules!.tables);
      else {
        a.idleFacing = nextRandom(w.rng) % 4 < 2;
        a.idleTimer = 0;
        a.reason = "Arrived";
      }
    } else a.reason = moved.blocked ?? "Moving";
    const action = (a.motion.yaw >>> 8) & 7;
    if (a.animation.action !== action)
      a.animation = {
        ...animationState(action),
        delay: Math.max(0, Math.trunc((1024 - a.motion.speed) / 256)),
      };
    a.animation = advanceAnimation(
      a.animation,
      animationProfile(pack.assets[a.art], action),
    );
  } else {
    stepCampaignSpecialistMotion(w, a.id, pack, specialistServices(pack));
    a = w.actors.find((current) => current.id === a.id)!;
    idle(w, a, pack);
  }
}
function syncEconomy(w: CampaignWorld): void {
  const old = new Map(w.economy.buildings.map((b) => [b.id, b]));
  w.economy.buildings = w.buildings.map((b) => {
    const prior = old.get(b.id);
    return prior
      ? {
          ...prior,
          complete: b.complete,
          energy: !prior.complete && b.complete ? b.energy : prior.energy,
        }
      : {
          id: b.id,
          slot: b.slot % 64,
          owner: b.owner,
          selector: b.selector,
          grade: 0,
          x: b.x,
          y: b.y,
          complete: b.complete,
          disabled: false,
          capacitySuppressed: false,
          hqUpgradeSuppressed: false,
          powered: false,
          energy: i16(w.buildingNative[b.slot] as number[], 61),
          extraDrain: w.buildingNative[b.slot][63]!,
          depleted: false,
          storedGoop: 0,
          specialPowerDelivery: false,
          ...(b.selector === 11
            ? {
                extractor: {
                  cycle: 0,
                  frame: 0,
                  delay: 0,
                  hold: 0,
                  stepDelay: 0,
                  workAudioActive: false,
                },
              }
            : {}),
        };
  });
  for (const p of w.economy.players) p.goop = w.players[p.id].goop;
  w.economy.resources = Array.from(
    { length: 16384 },
    (_, i) => w.terrain.bytes[i * 14 + 13],
  );
}
function stageNativeHost(original: CampaignWorld, staged: CampaignWorld): void {
  if (original.strategy) staged.strategy = cloneCampaignStrategicStorage(original.strategy);
  staged.buildingNative = original.buildingNative.map((n) => n.slice());
  staged.creatureNative = original.creatureNative.map((n) => n.slice());
  staged.ethereals = cloneEthereals(original.ethereals);
  staged.presentation = structuredClone(original.presentation);
  staged.specialists = cloneSpecialistPool(original.specialists);
  staged.collapse = {
    ...original.collapse,
    records: original.collapse.records.map((n) => n.slice()),
  };
  staged.buildings = structuredClone(original.buildings);
  staged.jobs = structuredClone(original.jobs);
  staged.muleQueues = structuredClone(original.muleQueues);
  staged.auxiliary = structuredClone(original.auxiliary);
}
function commitNativeHost(target: CampaignWorld, staged: CampaignWorld): void {
  if (staged.strategy) target.strategy = staged.strategy;
  target.buildingNative = staged.buildingNative;
  target.creatureNative = staged.creatureNative;
  target.ethereals = staged.ethereals;
  target.presentation = staged.presentation;
  target.specialists = staged.specialists;
  target.collapse = staged.collapse;
  target.buildings = staged.buildings;
  target.jobs = staged.jobs;
  target.muleQueues = staged.muleQueues;
  target.auxiliary = staged.auxiliary;
}
function rewardPresentation(
  w: CampaignWorld,
  slot: number,
  request: RewardEvent,
): void {
  w.presentation.pending.push({
    frame: w.frame,
    event: { type: "reward", slot, request: structuredClone(request) },
  });
  if (w.presentation.pending.length > 128) w.presentation.pending.shift();
  if (request.type === "research-message")
    notice(w, "Ethereal research reward received");
  if (request.type === "adjust-audio")
    requestAudioPlaybackRate(w.audio, {
      frame: w.frame,
      entity: `source:4:${slot}`,
      cue: request.channel,
      ratePercent: request.ratePercent,
    });
}
function rewardFactoryOptions(
  w: CampaignWorld,
  pack: Pack,
): EffectSchedulerOptions<CampaignWorld> {
  return {
    cloneHostRoots: cloneCampaignHostRoots,
    gravity: context(w, pack).gravity,
    obstacleAt: (p) => buildingObstacle(w, p),
    cleanupReferences: (s, id) => cleanupCampaignReferences(s, id),
    stageHost: stageNativeHost,
    commitHost: commitNativeHost,
    geneticistEffect: (staged, slot, out) =>
      stepCampaignGeneticistEffect(
        staged,
        slot,
        pack,
        rewardFactoryOptions(staged, pack),
        out,
      ),
    shepherdEffect: (staged, slot, out) =>
      stepCampaignShepherdEffect(staged, slot, pack, rewardFactoryOptions(staged, pack), out),
    etherealAttackEffect: (staged, slot, out) =>
      stepCampaignEtherealAttackEffect(
        staged,
        slot,
        pack,
        rewardFactoryOptions(staged, pack),
        out,
      ),
    blastArea: (staged) =>
      campaignBlastAreaContext(staged, pack, {
        effectOptions: (s) => rewardFactoryOptions(s, pack),
        damageSpecialist: (s, index, amount, attacker) =>
          damageCampaignSpecialist(
            s,
            index,
            amount,
            attacker,
            pack,
            specialistServices(pack),
          ),
        damageBuilding: (s, index, amount, attacker) =>
          damageCampaignBuilding(s, pack, index, amount, attacker, {
            effectOptions: (staged) => rewardFactoryOptions(staged, pack),
            cancelConstruction: (staged, actor) =>
              specialistServices(pack).cancelConstruction!(staged, actor),
            onEvent: (staged, event) => {
              if (event.type === "destroyed-message")
                notice(staged, "Building destroyed", "warning");
            },
          }),
      }),
    destructionObstacle: (staged, p, height) => {
      const b = campaignAirborneBuilding(staged, pack, p, height);
      return b ? { position: b.position, ground: b.ground } : null;
    },
  };
}
function specialistServices(pack: Pack): CampaignSpecialistServices {
  return {
    effectOptions: (staged) => rewardFactoryOptions(staged, pack),
    cancelRole: (s, index) =>
      cancelStagedCampaignBotanist(s, index, pack, specialistServices(pack)),
    damage: (s, index, amount) =>
      damageCampaignSpecialist(
        s,
        index,
        amount,
        null,
        pack,
        specialistServices(pack),
      ),
    cancelConstruction: (s, index) => {
      if (
        s.specialists.records[index][130] !== 0 ||
        s.specialists.records[index][88]! & 1
      ) {
        cancelStagedCampaignEngineer(s, index, pack, specialistServices(pack));
        return;
      }
      const terrain = s.terrain,
        rng = s.rng,
        prefix = s.missionPrefix;
      const r = cancelConstruction(
        projection(s),
        index,
        tables(pack),
        context(s, pack),
        "new-command",
      );
      applyConstruction(s, r.state, r.events, pack);
      //A creature/blast callback can retain these source-like roots.
      terrain.bytes = s.terrain.bytes;
      terrain.revision = s.terrain.revision;
      Object.assign(rng, s.rng);
      prefix.splice(0, prefix.length, ...s.missionPrefix);
      s.terrain = terrain;
      s.rng = rng;
      s.missionPrefix = prefix;
      for (const p of s.players) {
        put32(p.raw, 0x4a3, p.funds);
        put32(p.raw, 0x4a7, p.goop);
      }
    },
  };
}
function syncNativeBindings(w: CampaignWorld): void {
  // JSON saves preserve values, not object identity. Construction and ordinary
  // specialist travel must share the current motion explicitly after reload.
  for (const builder of w.builders)
    builder.motion = w.actors.find((a) => a.id === builder.id)!.motion;
  for (const a of w.actors) {
    if (!a.ready) continue;
    const n = w.specialists.records[a.id],
      m = a.motion;
    for (const [at, value] of [
      [7, m.x],
      [9, m.y],
      [43, m.width],
      [45, m.vx],
      [47, m.vy],
      [49, m.vz],
      [57, m.yaw],
      [59, m.pitch],
      [61, m.speed],
      [63, m.desiredSpeed],
    ] as const)
      put16(n as number[], at, value);
    put32(n as number[], 17, m.ground);
    put32(n as number[], 39, m.height);
    n[67] = m.fractionX;
    n[68] = m.fractionY;
    const anim = a.animation;
    n[25] = anim.action;
    n[26] = anim.hold;
    n[27] = anim.frame;
    n[28] = anim.direction & 255;
    n[29] = anim.delay & 255;
    n[30] = anim.counter & 255;
    copySpatialLinks(w.spatial, a.sourceId as `source:2:${number}`, n);
  }
  for (const b of w.economy.buildings) {
    const native = w.buildingNative[b.owner * 64 + b.slot];
    put16(native as number[], 61, b.energy);
    native[63] = b.extraDrain;
    const flags = u16(native as number[], 49);
    put16(native as number[], 49, b.powered ? flags | 4 : flags & ~4);
    if (b.complete && b.extractor) {
      native[25] = 1;
      native[26] = b.extractor.hold;
      native[27] = b.extractor.frame;
      native[29] = b.extractor.stepDelay;
      native[30] = b.extractor.delay & 255;
      native[51] = b.extractor.cycle;
    }
    if (b.producer) {
      const a = b.producer.animation;
      native[25] = a.action;
      native[26] = a.hold;
      native[27] = a.frame;
      native[28] = a.direction & 255;
      native[29] = a.delay & 255;
      native[30] = a.counter & 255;
    }
    copySpatialLinks(w.spatial, `source:3:${b.owner * 64 + b.slot}`, native);
  }
  for (const m of w.ecology.mules) w.creatureNative[m.index] = m.native.slice();
  put16(
    w.missionPrefix,
    0x3550,
    w.ecology.mules.filter((m) => m.native[6] !== 0).length,
  );
  synchronizeCampaignPlantCounts(w);
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((p) => p.occupied).length,
  );
}
export function stepCampaign(w: CampaignWorld, pack: Pack): void {
  if (w.phase !== "active") return;
  try {
    assertOpponentStrategyImplemented(
      w.players.map((p) => p.raw),
      {
        flags: w.flags,
        runtimeMode: w.runtimeMode,
        activePlayerCount: w.source.source.context.activePlayerCount,
      },
    );
    syncNativeBindings(w);
    stepCampaignZones(w, pack, {
      gravity: context(w, pack).gravity,
      obstacleAt: (p) => buildingObstacle(w, p),
      onEvent(staged, event) {
        if (event.type === "zone-audio")
          emitAudio(
            staged,
            `source:${event.family}:${event.index}`,
            event.channel,
            event.mode,
            event.parameter,
            event.duration,
          );
        if (event.type === "zone-completed")
          notice(staged, `Marked zone ${event.zone + 1} completed`);
        if (event.type === "zone-activated")
          notice(staged, `Marked zone ${event.zone + 1} activated`);
        if (event.type === "zone-warning")
          notice(staged, "Marked-zone score penalty", "warning");
      },
    });
    const ready = w.pending
      .filter((p) => p.frame <= w.frame)
      .sort((a, b) => a.sequence - b.sequence);
    w.pending = w.pending.filter((p) => p.frame > w.frame);
    for (const p of ready)
      try {
        issue(w, p.command, pack);
      } catch (e) {
        notice(
          w,
          String(e instanceof Error ? e.message : e),
          "warning",
          p.command.type === "move-mule"
            ? 2000 + p.command.muleIndex
            : p.command.type === "produce-mule"
              ? p.command.buildingId
              : p.command.actorId,
        );
      }
    for (let actorIndex = 0; actorIndex < 20; actorIndex++) {
      const a = w.actors.find((a) => a.id === actorIndex);
      if (!a) continue;
      try {
        actorStep(w, a, pack);
      } catch (e) {
        a.reason = String(e instanceof Error ? e.message : e);
        notice(w, a.reason, "error", a.id);
      }
    }
    syncEconomy(w);
    const economyReceipt = stepCampaignEconomyBuildings(
      w,
      pack,
      specialistServices(pack),
      {
        dispatchBuilding(staged, building) {
          const slot = building.owner * 64 + building.slot;
          if (!building.complete) {
            const result = stepIncompleteNativeBuilding(
              staged.buildingNative[slot],
              animationProfile(
                pack.assets[campaignBuildingAsset(pack, building.selector)],
                0,
              ),
            );
            if (!result.ok) throw new Error(result.reason);
            staged.buildingNative[slot] = result.value.native;
            building.energy = i16(result.value.native as number[], 61);
            if (result.value.stopAudio23)
              emitAudio(staged, `source:3:${slot}`, 0x23, 4);
            if (result.value.stopAudio2f)
              emitAudio(staged, `source:3:${slot}`, 0x2f, 4);
            return true;
          }
          if (building.selector === 0) {
            stepCampaignGenepod(staged, building, pack);
            return true;
          }
          if (![3, 6, 11].includes(building.selector))
            throw new Error(
              `Original completed building callback ${building.selector} is not implemented`,
            );
          return false;
        },
      },
    );
    syncNativeBindings(w);
    for (const e of economyReceipt.events)
      if (e.type === "audio") {
        const cue = {
          "work-start": 0x2f,
          "work-stop": 0x2f,
          "work-finish": 0x30,
          harvest: 0x32,
          empty: 0x4e,
        }[e.cue];
        emitAudio(
          w,
          `building:${e.buildingId}`,
          cue,
          e.cue === "work-stop" ? 4 : 2,
        );
      }
    for (let i = 0; i < 16384; i++)
      w.terrain.bytes[i * 14 + 13] = w.economy.resources[i];
    const ecologyContext = context(w, pack);
    w.ecology.otherEntities = [
      ...w.actors
        .filter((a) => a.ready)
        .map((a) => ({
          id: a.sourceId as `source:2:${number}`,
          kind: 3,
          owner: a.owner,
          position: [a.motion.x, a.motion.y] as [number, number],
        })),
      ...w.buildings.map((b) => ({
        id: `source:3:${b.slot}` as const,
        kind: 4,
        owner: b.owner,
        position: [b.x, b.y] as [number, number],
      })),
    ];
    for (let muleIndex = 0; muleIndex < 300; muleIndex++) {
      let mule = w.ecology.mules.find((m) => m.index === muleIndex);
      if (!mule || mule.native[6] === 0) continue;
      const queued = w.muleQueues[muleIndex];
      if (queued?.length && !(mule.native[0x61]! & 0x80)) {
        const result = requestOwnedMuleMove(w.ecology, muleIndex, queued[0], {
          callerOwner: w.selectedPlayer,
          callerIsSelected: true,
          selectedPanelRefresh: false,
        });
        if (!result.committed)
          throw new Error(result.reason ?? "Queued Mule move rejected");
        if (result.outcome === "installed") queued.shift();
        mule = w.ecology.mules.find((m) => m.index === muleIndex)!;
      }
      const callback = mule.native[24] === 4 ? stepNeutralMule : stepOwnedMule;
      const combatTransaction = createMuleCombatTransaction(
        w,
        pack,
        (original) =>
          cloneEffectHost(original, rewardFactoryOptions(original, pack)),
      );
      const r = callback(w.ecology, mule.index, w.rng, {
        terrain: w.terrain,
        tables: pack.rules!.tables,
        rules: pack.ecologyRules!,
        frame: w.frame,
        gravity: ecologyContext.gravity,
        water: w.source.source.terrain.loadedPhysicalWaterHeight,
        climate: w.source.source.terrain.climate,
        bounce: pack.rules!.tables.bounce,
        profile: (action) => animationProfile(pack.assets.MULE, action),
        bonesProfile: (action) => animationProfile(pack.assets.BONES, action),
        obstacleAt: (p) => buildingObstacle(combatTransaction.current(), p),
        creaturePriors: w.creatureNative,
        combat: pack.ecologyRules!.muleCombat,
        combatEntity: (state, terrain, rng, id) =>
          campaignMuleCombatEntity(
            combatTransaction.host(state, terrain, rng),
            pack,
            id,
          ),
        combatDamage: (state, terrain, rng, self, target, amount) => {
          const staged = combatTransaction.host(state, terrain, rng),
            attacker = self.id;
          if (target.kind === 3)
            return damageCampaignSpecialist(
              staged,
              target.index,
              amount,
              attacker,
              pack,
              specialistServices(pack),
            );
          if (target.kind === 4)
            return damageCampaignBuilding(
              staged,
              pack,
              target.index,
              amount,
              attacker,
              {
                effectOptions: (s) => rewardFactoryOptions(s, pack),
                cancelConstruction: (s, index) =>
                  specialistServices(pack).cancelConstruction!(s, index),
                onEvent: (s, e) => {
                  if (e.type === "destroyed-message")
                    notice(s, "Building destroyed", "warning");
                },
              },
            ).destroyed;
          if (target.kind === 1) {
            damageCampaignMule(staged, pack, target.index, amount, attacker);
            return (
              staged.ecology.mules.find((m) => m.index === target.index)!
                .native[94]! >= 24
            );
          }
          throw new Error("Unsupported Mule combat damage target");
        },
        combatBuildingAt: (state, terrain, rng, self) => {
          const staged = combatTransaction.host(state, terrain, rng),
            n = self.native,
            b = campaignAirborneBuilding(
              staged,
              pack,
              [i16(n as number[], 7), i16(n as number[], 9)],
              u32(n as number[], 39) | 0,
            );
          return b ? `source:3:${i16(b.native as number[], 15)}` : null;
        },
        combatBuildingPointAccepted: (state, terrain, self, point, index) =>
          campaignMuleBuildingPointAccepted(
            { ...combatTransaction.current(), ecology: state, terrain },
            pack,
            self,
            point,
            index,
          ),
        combatEffect: combatTransaction.effect,
        plantDamage: (state, terrain, rng, index, amount) =>
          damageCampaignPlant(
            combatTransaction.host(state, terrain, rng),
            pack,
            index,
            amount,
          ),
        relocate: combatTransaction.relocate,
        coldResponse: pack.ecologyRules!.muleCold,
        effectCode: (id) => {
          const slot = Number(id.split(":")[2]);
          const code =
            combatTransaction.current().powerEffects.slots[slot]
              ?.nativePrior?.[69];
          if (code === undefined || code === null)
            throw new Error("Source shared effect code is missing");
          return code;
        },
        cellOrder: (cell) => {
          const ids: string[] = [];
          const live = combatTransaction.current();
          let id = live.spatial.heads[cell];
          while (id) {
            ids.push(id);
            id = live.spatial.nodes[id].next;
          }
          return ids;
        },
        owned: {
          selectedPlayer: w.selectedPlayer,
          globalFlags: w.flags,
          allianceMasks: w.players.map((p) => p.raw[0x6e5]),
          players: w.players.map((p) => p.raw),
          buildings: w.buildingNative.map((native, index) => ({
            index,
            native,
          })),
          operators: readShepherdOperators(w),
        },
        airborneObstacle: (p, height) =>
          campaignAirborneBuilding(
            combatTransaction.current(),
            pack,
            p,
            height,
          ),
      });
      if (!r.committed) {
        throw new Error(`Mule ${muleIndex}: ${r.reason ?? "callback failed"}`);
      }
      combatTransaction.commit();
      for (const m of w.ecology.mules) w.creatureNative[m.index] = m.native;
      for (const event of r.events) {
        if (
          event.kind === "mule-combat-kill" &&
          event.attackerOwner !== undefined &&
          event.attackerOwner < 4
        )
          put32(
            w.players[event.attackerOwner].raw,
            0x6fd,
            u32(w.players[event.attackerOwner].raw, 0x6fd) + 1,
          );
        if (event.kind === "mule-reveal")
          for (const shade of event.buildingShades ?? [])
            w.buildingNative[shade.index][23] = shade.shade;
        if (event.kind === "mule-born" && event.newborn) {
          const birth = event.newborn;
          delete w.muleQueues[birth.index];
          w.creatureNative[birth.index] = birth.native;
          insertSpatial(
            w.spatial,
            w.terrain,
            `source:0:${birth.index}`,
            worldCell(
              i16(birth.native as number[], 7),
              i16(birth.native as number[], 9),
            ),
          );
          copySpatialLinks(w.spatial, `source:0:${birth.index}`, birth.native);
          if (birth.owner < 4)
            put32(
              w.players[birth.owner].raw,
              0x6f9,
              u32(w.players[birth.owner].raw, 0x6f9) +
                birth.bornCounterIncrement,
            );
        }
        if (event.kind === "mule-audio" && event.channel !== undefined)
          emitAudio(w, event.id, event.channel);
        // The staged relocation port already applied physics and any later
        // arrival snap in source order. A buffered physics receipt may describe
        // an earlier cell; replaying it here would undo the final relocation.
        if (event.kind === "mule-retired") {
          delete w.muleQueues[muleIndex];
          if (w.spatial.nodes[event.id])
            unlinkSpatial(
              w.spatial,
              w.terrain,
              event.id as `source:0:${number}`,
            );
          cleanupCampaignReferences(w, event.id as `source:0:${number}`);
          put16(
            w.missionPrefix,
            0x3550,
            (u16(w.missionPrefix, 0x3550) - 1) & 65535,
          );
        }
      }
      flushEatenPlantRetirements(w);
      synchronizeCampaignPlantCounts(w);
      if (r.events.some((e) => e.kind === "mule-effect")) {
        put16(
          w.missionPrefix,
          0x3554,
          w.powerEffects.slots.filter((p) => p.occupied).length,
        );
        consumeMuleEffects(w, r.events, pack, {
          cleanupReferences: (staged, id) =>
            cleanupCampaignReferences(staged, id),
        });
      }
      if (r.events.some((e) => e.kind === "mule-water-effect"))
        consumeMuleWaterEvents(w, r.events, pack, {
          obstacleAt: (p) => buildingObstacle(w, p),
          cleanupReferences: (s, id) =>
            cleanupCampaignReferences(
              {
                ecology: s.ecology!,
                source: s.source,
                waterEffects: s.waterEffects,
              },
              id,
            ),
        });
    }
    stepCountdownEthereals(w, pack, {
      cloneHostRoots: cloneCampaignHostRoots,
      gravity: context(w, pack).gravity,
      obstacleAt: (p) => buildingObstacle(w, p),
      cleanupReferences: (staged, id) => cleanupCampaignReferences(staged, id),
      stageHost: stageNativeHost,
      commitHost: commitNativeHost,
      punishmentServices: (s) =>
        campaignPunishmentServices(s, {
          cancelWork: (staged, index) =>
            cancelStagedCampaignSpecialistWork(
              staged,
              index,
              pack,
              specialistServices(pack),
            ),
          removeSpecialist: (staged, index) =>
            retireCampaignSpecialist(
              staged,
              index,
              pack,
              specialistServices(pack),
            ),
          damageBuilding: (staged, index, amount, attacker) => {
            damageCampaignBuilding(staged, pack, index, amount, attacker, {
              effectOptions: (world) => rewardFactoryOptions(world, pack),
              cancelConstruction: (world, actor) =>
                specialistServices(pack).cancelConstruction!(world, actor),
              onEvent: (world, event) => {
                if (event.type === "destroyed-message")
                  notice(world, "Building destroyed", "warning");
              },
            });
          },
          attack: (staged, parent, target) => {
            createStagedEtherealAttack(
              staged,
              parent.slot,
              target.id,
              pack,
              rewardFactoryOptions(staged, pack),
            );
          },
        }),
      rewardEffect(staged, _record, request) {
        createCampaignReward(
          staged,
          request,
          pack,
          rewardFactoryOptions(staged, pack),
          {
            presentation: rewardPresentation,
          },
        );
      },
      onEvent(staged, event) {
        if (
          event.type === "countdown" &&
          event.request.type === "advance-ui-animation"
        ) {
          staged.presentation.uiFrame = staged.frame;
          return;
        }
        staged.presentation.pending.push({
          frame: staged.frame,
          event: structuredClone(event),
        });
        if (staged.presentation.pending.length > 128)
          staged.presentation.pending.shift();
        if (event.type === "visitor") {
          const r = event.request;
          if (r.type === "audio-moving") {
            const entity = `source:7:${event.slot}`;
            requestAudio(staged.audio, {
              frame: staged.frame,
              entity,
              cue: r.channel,
              mode: r.mode,
              parameter: r.parameter,
              gain: r.volume / 127,
              range: null,
              initialRatePercent: r.initialRatePercent,
            });
            requestAudioPlaybackRate(staged.audio, {
              frame: staged.frame,
              entity,
              cue: r.channel,
              ratePercent: r.adjustedRatePercent,
            });
          } else if (r.type === "stop-if-playing" || r.type === "stop-audio")
            emitAudio(staged, `source:7:${event.slot}`, r.channel, 4);
          else if (r.type === "fade-audio")
            emitAudio(staged, `source:7:${event.slot}`, r.channel, r.mode);
          else if (r.type === "ui-message")
            notice(staged, "Ethereal transmission received");
        } else if (event.request.type === "expiry-narration")
          notice(staged, "Ethereals are arriving");
        else if (event.request.type === "start-narration")
          notice(staged, "Ethereal observation timer started");
      },
    });
    //13780 can change a held specialist's action, lift flags and physical
    //height after57A10. Keep the render/motion mirror current for next tick.
    for (const a of w.actors)
      if (
        a.ready &&
        w.specialists.records[a.id][6] === 3 &&
        w.specialists.records[a.id][85] === 3
      ) {
        mirrorCampaignSpecialist(w, a.id);
        a.reason = "Being abducted";
      }
    const plants = stepPlants(
      w.ecology,
      w.terrain,
      w.rng,
      pack.ecologyRules!,
      w.source.source.terrain.rawWaterHeight,
    );
    if (!plants.committed)
      throw new Error(plants.reason ?? "Plant callback failed");
    for (const event of plants.events) {
      if (event.kind === "plant-born")
        insertSpatial(
          w.spatial,
          w.terrain,
          event.id,
          worldCell(...event.position),
        );
      if (event.kind === "plant-retired" && w.spatial.nodes[event.id])
        unlinkSpatial(w.spatial, w.terrain, event.id);
      if (event.kind === "cleanup-required")
        cleanupCampaignReferences(w, event.id);
    }
    w.ecology.pending = w.ecology.pending.filter(
      (e) => e.kind !== "cleanup-required",
    );
    synchronizeCampaignPlantCounts(w);
    if (w.collapse.count)
      stepCollapsePool(w, {
        directions: pack.ecologyRules!.spreadDirections as [number, number][],
        stageHost: (original, staged) =>
          Object.assign(staged, structuredClone(original)),
        commitHost: (target, staged) => Object.assign(target, staged),
        effect: (staged, request) =>
          createStagedDestructionEffect(
            staged,
            request,
            pack,
            rewardFactoryOptions(staged, pack),
          ),
      });
    stepEffectScheduler(
      w,
      pack,
      createRewardSchedulerOptions(
        pack,
        {
          ...rewardFactoryOptions(w, pack),
          onLandingEvent(staged, landing, event, landingContext) {
            if (event.type === "audio") {
              emitAudio(staged, `source:4:${landing.slot}`, 0x50, 4);
              emitAudio(staged, `source:4:${landing.slot}`, event.channel);
            }
            if (event.type === "activate") {
              for (const a of staged.actors.filter(
                (a) => a.owner === event.owner && !(staged.specialists.records[a.id][112]! & 1),
              )) {
                a.ready = true;
                const native = staged.specialists.records[a.id];
                put16(
                  native as number[],
                  0x70,
                  (u16(native as number[], 0x70) & 0xfbfe) | 1,
                );
                native[0x16] = native[0x16]! & ~8;
                const candidate = activationDestination(
                  landing.point,
                  staged.rng,
                  landingContext,
                );
                put16(native as number[], 7, candidate[0]);
                put16(native as number[], 9, candidate[1]);
                a.motion = readGeneticistMotion(native);
                a.goal = null;
                a.route = [];
                staged.players[a.owner].blueprints[
                  a.blueprintIndex
                ].runtimeFlags |= 2;
                const bpAt = 0x16 + a.blueprintIndex * 36;
                const activationCount =
                  (u32(staged.players[a.owner].raw, bpAt + 0x1c) + 1) >>> 0;
                put32(
                  staged.players[a.owner].raw,
                  bpAt + 0x1c,
                  activationCount,
                );
                if (
                  activationCount === 1 &&
                  staged.players[a.owner].blueprints[a.blueprintIndex]
                    .category === 1
                )
                  native[0x72] = 40;
                insertSpatial(
                  staged.spatial,
                  staged.terrain,
                  a.sourceId as `source:2:${number}`,
                  worldCell(a.motion.x, a.motion.y),
                );
                const b = staged.builders.find((b) => b.id === a.id);
                if (b) b.enabled = true;
              }
              staged.players[event.owner].activationCount++;
              notice(staged, "Specialists have landed");
            }
            if (event.type === "message")
              notice(staged, "Landing transmission received");
            if (event.type === "retired") {
              const p = staged.players[event.owner];
              p.raw[0x498] = 0;
              put32(p.raw, 0x499, 700);
            }
          },
        },
        { presentation: rewardPresentation },
      ),
    );
    stepCampaignCraters(w, pack, {
      gravity: context(w, pack).gravity,
      obstacleAt: (p) => buildingObstacle(w, p),
    });
    for (const job of w.jobs)
      if (job.status === "working") {
        if (job.nativeSlot === undefined)
          throw new Error(
            "Unsupported earlier development terrain job without a native slot",
          );
        job.remaining = i16(
          w.missionPrefix,
          0x1ec7 + job.nativeSlot * 176 + 12,
        );
        if (job.remaining < 0) {
          job.remaining = 0;
          job.status = "complete";
        }
      }
    for (const p of w.economy.players) {
      w.players[p.id].goop = p.goop;
      put32(w.players[p.id].raw, 0x5e6, p.capacity);
    }
    for (const p of w.players) synchronizePlayer(p);
    const order: Record<string, number[]> = {};
    for (const plant of w.ecology.plants.filter((p) => p.active)) {
      copySpatialLinks(w.spatial, plant.id, plant.native);
      const cell = worldCell(...plant.position);
      if (order[cell]) continue;
      order[cell] = [];
      let id = w.spatial.heads[cell];
      while (id) {
        const n = w.spatial.nodes[id];
        if (n.family === 1) order[cell].push(n.index);
        id = n.next;
      }
    }
    w.ecology.plantOrder = order;
    for (const mule of w.ecology.mules)
      if (mule.native[6] !== 0)
        copySpatialLinks(w.spatial, mule.id, mule.native);
    syncNativeBindings(w);
    {
      w.result.players = w.players.map((p) => p.raw.slice());
      Object.assign(w.result.context, {
        ...campaignObjectiveContext(w),
      });
      const outcome = stepCampaignResult(w.result, {
        type: "evaluate",
        actors: w.actors
          .filter((a) => a.ready)
          .map((a) => ({
            id: a.id,
            owner: a.owner,
            category: w.players[a.owner].blueprints[a.blueprintIndex].category,
          })),
      });
      if (!outcome.ok) throw new Error(outcome.reason);
      w.result = outcome.value.state;
      w.flags = w.result.context.flags;
      for (let i = 0; i < 4; i++)
        w.players[i].raw = w.result.players[i].slice();
      if (w.result.terminal) w.phase = "result";
    }
    w.frame = (w.frame + 1) >>> 0;
    w.tick++;
  } catch (e) {
    w.phase = "blocked";
    notice(w, String(e instanceof Error ? e.message : e), "error");
  }
}
export function actOnCampaignResult(
  w: CampaignWorld,
  action: ResultAction,
): void {
  const receipt = stepCampaignResult(w.result, action);
  if (!receipt.ok) throw new Error(receipt.reason);
  w.result = receipt.value.state;
  w.flags = w.result.context.flags;
  w.runtimeMode = w.result.context.mode;
  w.frame = w.result.context.frame;
  for (let i = 0; i < 4; i++) {
    w.players[i].raw = w.result.players[i].slice();
    w.players[i].progress = (w.players[i].raw[0x6e7] << 24) >> 24;
  }
  w.tick++;
}
export function continueCampaign(w: CampaignWorld, pack: Pack): CampaignWorld {
  if (w.result.phase !== "campaign-view-queued")
    throw new Error("Original result confirmation required before continuing");
  const plan = planCampaignPlayerCarry(
    w.players.map((p) => p.raw),
    w.actors.map((a) => ({
      id: a.id,
      owner: a.owner,
      blueprintIndex: a.blueprintIndex,
    })),
    w.selectedPlayer,
    null,
  );
  if (!plan.ok) throw new Error(plan.reason);
  const players = w.players.map((p, i) => ({
    ...structuredClone(p),
    raw: plan.value.players[i],
    funds: 0,
    goop: 0,
    completed: Array(14).fill(0),
    owned: 0,
    activationCount: 0,
    blueprints: p.blueprints.map((b) => ({
      ...structuredClone(b),
      runtimeFlags: b.runtimeFlags & ~3,
    })),
  }));
  const auxiliary = projectCampaignAuxiliaryMetadata(w.auxiliary);
  if (!auxiliary.ok) throw new Error(auxiliary.reason);
  const next = createCampaign(pack, w.contentHash, w.missionId + 1, {
    players,
    selectedPlayer: w.selectedPlayer,
    world: w.missionPrefix.slice(0x34ba, 0x3550),
    rngRing: w.rng.ring,
    specialistOrigin: w.specialistOrigin,
    ...(w.strategy ? { creatureControl: w.strategy.creatureControl.slice(), controlProvenance: w.strategy.controlProvenance } : {}),
  });
  next.auxiliary = {
    entries: auxiliary.value.entries,
    provenance: auxiliary.value.provenance,
  };
  next.tick = w.tick + 1;
  // A missing next-mission family must leave the valid result save intact.
  // Retirement of the old map is committed only after the next startup exists.
  for (const id of plan.value.retiredActorIds) {
    const a = w.actors.find((a) => a.id === id)!;
    if (w.spatial.nodes[a.sourceId])
      unlinkSpatial(w.spatial, w.terrain, a.sourceId as `source:2:${number}`);
  }
  return next;
}
export function validateCampaignWorld(w: CampaignWorld, hash: string): void {
  if (w.strategy) {
    validateCampaignStrategicStorage(w.strategy);
    if (w.auxiliary.entries.length !== 300 || w.auxiliary.entries.some((e, i) =>
      e.lowFlags !== (w.strategy!.creatureControl[i * 2] & 7) || e.second !== w.strategy!.creatureControl[i * 2 + 1]))
      throw Error("Saved strategic control and carry projection differ");
  }
  if (
    w.version !== 2 ||
    w.contentHash !== hash ||
    w.engineVersion !== "0.2.0-campaign-development"
  )
    throw new Error("Incompatible campaign save");
  if (
    !Number.isInteger(w.frame) ||
    w.frame < 0 ||
    w.frame > 0xffffffff ||
    w.players.length !== 4 ||
    w.terrain.bytes.length !== 229376
  )
    throw new Error("Invalid campaign save state");
  const integer = (v: number, lo: number, hi: number) =>
    Number.isInteger(v) && v >= lo && v <= hi;
  const bytes = (v: unknown, n: number): v is number[] =>
    Array.isArray(v) && v.length === n && v.every((b) => integer(b, 0, 255));
  const pool = (v: unknown, rows: number, stride: number) =>
    Array.isArray(v) &&
    v.length === rows &&
    v.every(
      (row) =>
        Array.isArray(row) &&
        row.length === stride &&
        row.every((b, at) =>
          at >= 31 && at < 39 ? b === null : integer(b, 0, 255),
        ),
    );
  if (
    !integer(w.tick, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(w.missionId, 1, 24) ||
    !integer(w.selectedPlayer, 0, 3) ||
    !integer(w.flags, 0, 255) ||
    !integer(w.runtimeMode, 0, 255) ||
    !integer(w.countdown, 0, 65535) ||
    !["briefing", "active", "result", "blocked"].includes(w.phase) ||
    !bytes(w.missionPrefix, 0x355e) ||
    !bytes(w.terrain.bytes, 229376) ||
    !pool(w.buildingNative, 256, 67) ||
    !pool(w.creatureNative, 300, 124) ||
    !w.collapse ||
    !pool(w.collapse.records, 32, 49) ||
    w.collapse.count !== w.collapse.records.filter((n) => n[6] !== 0).length ||
    w.collapse.count !== u16(w.missionPrefix, 0x3556) ||
    !w.specialists ||
    w.specialists.records.length !== 20 ||
    w.specialists.bindings.length !== 20 ||
    !Array.isArray(w.specialistOrigin) ||
    w.specialistOrigin.length !== 2 ||
    w.specialistOrigin.some((v) => !integer(v, -32768, 32767)) ||
    w.players.some(
      (p, id) =>
        p.id !== id ||
        !bytes(p.raw, 1805) ||
        !integer(p.funds, 0, 0xffffffff) ||
        !integer(p.goop, 0, 0xffffffff),
    ) ||
    !w.ethereals ||
    w.ethereals.records.length !== 16 ||
    w.ethereals.count !==
      w.ethereals.records.filter((r) => r.native[6] !== 0).length ||
    !w.audio ||
    !integer(w.audio.nextSequence, 0, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(w.audio.requests) ||
    w.audio.requests.length > 256 ||
    !w.muleQueues ||
    Object.entries(w.muleQueues).some(
      ([index, orders]) =>
        !integer(Number(index), 0, 299) ||
        !Array.isArray(orders) ||
        orders.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            p.some((v) => !integer(v, 0, 32767)),
        ),
    )
  )
    throw new Error("Invalid complete campaign save state");
  validateSpatial(w.spatial);
  const nativeJobs = Array.from({ length: 25 }, (_, slot) =>
    i16(w.missionPrefix, 0x1ec7 + slot * 176 + 12),
  );
  if (nativeJobs.filter((v) => v >= 0).length !== w.missionPrefix[0x2ff7])
    throw new Error("Invalid shared terrain job save count");
  const workingJobs = w.jobs.filter((j) => j.status === "working");
  if (
    new Set(workingJobs.map((j) => j.nativeSlot)).size !== workingJobs.length ||
    workingJobs.some(
      (j) =>
        !integer(j.nativeSlot!, 0, 24) ||
        nativeJobs[j.nativeSlot!] < 0 ||
        j.remaining !== nativeJobs[j.nativeSlot!],
    )
  )
    throw new Error(
      "Unsupported or inconsistent development construction terrain job save",
    );
  for (const n of w.specialists.records) validateSpecialistNative(n);
  for (const a of w.actors) {
    if (
      a.owner !== Math.floor(a.id / 5) ||
      !w.players[a.owner]?.blueprints[a.blueprintIndex]
    )
      throw new Error("Invalid specialist save binding");
  }
  for (const b of w.buildings)
    if (
      !integer(b.slot, 0, 255) ||
      b.owner !== Math.floor(b.slot / 64) ||
      w.buildingNative[b.slot][6] !== 4 ||
      !w.spatial.nodes[`source:3:${b.slot}`]
    )
      throw new Error("Invalid building save binding");
  if (w.powerEffects.slots.length !== 200)
    throw new Error("Invalid effect save pool");
  for (const [slot, p] of w.powerEffects.slots.entries())
    if (
      p.occupied !== !!w.spatial.nodes[`source:4:${slot}`] ||
      !p.nativePrior ||
      p.nativePrior.length !== 81 ||
      (p.nativePrior[6] !== 0) !== p.occupied
    )
      throw new Error("Invalid effect save binding");
}
