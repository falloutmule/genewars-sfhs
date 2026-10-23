/** Campaign32E60/4FD30/80830/7F3B0 recruitment with retained host records. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  prepareStrategicRoster,
  type StrategicRecruitServices,
  type StrategicSpecialistFactoryRequest,
  type StrategicLandingRequest,
} from "../mechanics/strategic-ai-recruit";
import {
  aiByte,
  aiDword,
  aiWord,
  aiSWord,
  type StrategicAIState,
} from "../mechanics/strategic-ai-state";
import {
  initializeSpecialistNative,
  bindSpecialistResources,
} from "../mechanics/specialist-native";
import { readGeneticistMotion } from "../mechanics/geneticist";
import {
  resolveSpecialistMovePoint,
  specialistBlockerWeight,
} from "../mechanics/specialist-motion";
import { ecologyTerrainClass } from "../mechanics/ecology";
import { nextRandom } from "../mechanics/random";
import { createLanding } from "../mechanics/landing";
import { groundHeight, worldCell } from "../mechanics/terrain";
import { effectTerrainShade } from "../mechanics/power-motion";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import {
  bindCampaignStrategicState,
  publishCampaignStrategicState,
} from "./strategic-state";
import { campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import { insertSpatial } from "./spatial";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
} from "./effect-scheduler";
import {
  campaignSpecialistMotionContext,
  cancelStagedCampaignSpecialistWork,
  synchronizeCampaignSpecialistBlueprints,
  type CampaignSpecialistServices,
} from "./specialist-adapter";
import { revealCampaignRadius } from "./reveal-adapter";
import { put16, put32, u32 } from "./bytes";
import type { CampaignActor } from "./bootstrap";

type Point = [number, number];
export type CampaignRecruitEvent =
  | {
      type: "specialist-created";
      owner: number;
      slot: number;
      blueprint: number;
    }
  | { type: "landing-created"; owner: number; slot: number }
  | { type: "landing-capacity"; owner: number }
  | {
      type: "specialists-activated";
      owner: number;
      slots: number[];
      immediate: boolean;
    };
function checkHost(w: CampaignWorld, s: StrategicAIState): void {
  if (
    !w.strategy ||
    s.records !== w.strategy.records ||
    s.creatures !== w.creatureNative ||
    s.buildings !== w.buildingNative ||
    s.rng !== w.rng ||
    s.missionPrefix !== w.missionPrefix ||
    s.players.some((raw, i) => raw !== w.players[i].raw) ||
    s.specialists.some((entry, i) => entry.native !== w.specialists.records[i])
  )
    throw Error(
      "Strategic recruit requires the actual retained campaign state",
    );
}
function project(
  w: CampaignWorld,
  slot: number,
  ready: boolean,
): CampaignActor {
  const native = w.specialists.records[slot],
    binding = w.specialists.bindings[slot];
  if (!binding) throw Error("Actual recruited specialist binding required");
  const motion = readGeneticistMotion(native),
    after: CampaignActor = {
      id: slot,
      sourceId: `source:2:${slot}`,
      owner: binding.owner,
      blueprintIndex: binding.blueprintIndex,
      art: binding.assetKey,
      motion,
      ready,
      goal: null,
      route: [],
      animation: {
        action: aiByte(native, 25),
        hold: aiByte(native, 26),
        frame: aiByte(native, 27),
        direction: (aiByte(native, 28) << 24) >> 24,
        delay: (aiByte(native, 29) << 24) >> 24,
        counter: (aiByte(native, 30) << 24) >> 24,
      },
      idleTimer: 0,
      idleFacing: false,
      egressBuildingId: null,
      reason: ready ? "Ready" : "Awaiting landing",
      orders: [],
    },
    existing = w.actors.find((a) => a.id === slot);
  const actor = existing ? Object.assign(existing, after) : after;
  if (!existing) w.actors.push(actor);
  const oldBuilder = w.builders.find((b) => b.id === slot);
  if (binding.category === 0) {
    const direction = actor.animation.direction;
    if (direction !== 1 && direction !== -1)
      throw Error("Actual Engineer animation direction required");
    const raw = w.players[binding.owner].raw,
      bp = 0x16 + binding.blueprintIndex * 36,
      builder = {
        id: slot,
        owner: binding.owner,
        style: binding.style,
        category: binding.category,
        skill: (aiByte(raw, bp + 23) << 24) >> 24,
        enabled: ready,
        motion: actor.motion,
        animation: {
          id: actor.animation.action,
          frame: actor.animation.frame,
          hold: actor.animation.hold,
          direction: direction as 1 | -1,
          delay: actor.animation.delay,
          counter: actor.animation.counter,
        },
        action: 13 as const,
        facingFlip: false,
        status: "idle" as const,
        task: null,
      };
    if (oldBuilder) Object.assign(oldBuilder, builder);
    else w.builders.push(builder);
  } else if (oldBuilder) w.builders.splice(w.builders.indexOf(oldBuilder), 1);
  return actor;
}
function ensureResource(pack: Pack, key: string): void {
  if (!pack.assets[key])
    throw Error(`Original recruited specialist resource ${key} missing`);
}
function create(
  w: CampaignWorld,
  s: StrategicAIState,
  request: StrategicSpecialistFactoryRequest,
  pack: Pack,
) {
  checkHost(w, s);
  if (!pack.rules)
    throw Error("Original strategic specialist resource tables required");
  const held = s.specialists[request.slot].native;
  if (aiByte(held, 6) !== 0)
    throw Error("Strategic specialist factory slot is already active");
  const point = w.specialistOrigin,
    result = initializeSpecialistNative(
      held,
      s.players[request.player],
      {
        slot: request.slot,
        blueprintIndex: request.blueprint,
        origin: {
          position: [...point],
          height: groundHeight(w.terrain, ...point),
          shade: effectTerrainShade(w.terrain, ...point),
        },
      },
      pack.rules.tables,
    );
  ensureResource(pack, result.binding.assetKey);
  held.splice(0, held.length, ...result.native);
  w.specialists.bindings[request.slot] = result.binding;
  s.specialists[request.slot].blueprint = {
    player: request.player,
    index: request.blueprint,
  };
  project(w, request.slot, false);
  return request;
}
function placement(
  w: CampaignWorld,
  index: number,
  center: Point,
  pack: Pack,
): Point {
  if (!pack.rules) throw Error("Original specialist placement tables required");
  const n = w.specialists.records[index],
    binding = w.specialists.bindings[index];
  if (!binding) throw Error("Actual activation blueprint binding required");
  for (let attempt = 0; attempt < 16384; attempt++) {
    const angle = (nextRandom(w.rng) * 8 - 512) & 2047,
      dx = (1024 * pack.rules.tables.cosine[angle]) >> 16,
      dy = (1024 * pack.rules.tables.sine[angle]) >> 16,
      signed = (v: number) => (v << 16) >> 16,
      p: Point = [
        (signed(center[0] * 2 + dx) >> 1) & 32767,
        (signed(center[1] * 2 + dy) >> 1) & 32767,
      ];
    if (aiByte(n, 83) & (1 << ecologyTerrainClass(w.terrain, p))) continue;
    if (binding.category === 1 && aiByte(n, 129) === 2) {
      const plant = w.ecology.plants[aiSWord(n, 127)];
      if (!plant)
        throw Error("Actual retained Botanist activation target required");
      if (
        worldCell(aiSWord(plant.native, 7), aiSWord(plant.native, 9)) ===
        worldCell(...p)
      )
        return p;
    }
    if (
      specialistBlockerWeight(
        n,
        campaignQueryEntities(w, [p]).map((e) => e.native),
      ) < 10
    )
      return p;
  }
  throw Error("Source73E00/74CC0 activation placement exhausted");
}
/**80AE0 eligible71bit2 pass. Associated kind5 starts at the actual carrier
 * point and queues the accepted candidate through74A50/80FC0's numeric body. */
export function activateStagedCampaignSpecialists(
  w: CampaignWorld,
  owner: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  const raw = w.players[owner]?.raw;
  if (!raw || aiByte(raw, 1) !== owner)
    throw Error("Actual activation player required");
  const activated: number[] = [],
    candidates: { slot: number; point: Point }[] = [],
    associated =
      aiByte(raw, 0x498) === 5
        ? w.powerEffects.slots[aiSWord(raw, 0x496)]?.nativePrior
        : null;
  if (aiByte(raw, 0x498) === 5 && !associated)
    throw Error("Actual retained activation carrier required");
  const center: Point = associated
    ? [aiSWord(associated, 7), aiSWord(associated, 9)]
    : [aiSWord(raw, 9), aiSWord(raw, 11)];
  for (let slot = owner * 5; slot < owner * 5 + 5; slot++) {
    const n = w.specialists.records[slot];
    if (!aiByte(n, 6) || !(aiByte(n, 113) & 4)) continue;
    const binding = w.specialists.bindings[slot];
    if (!binding || binding.owner !== owner || aiSWord(n, 15) !== slot)
      throw Error("Actual activation specialist identity required");
    put16(n as number[], 112, (aiWord(n, 112) & 0xfbfe) | 1);
    n[22] = aiByte(n, 22) & 247;
    const destination = placement(w, slot, center, pack);
    candidates.push({ slot, point: destination });
    const point = associated ? center : destination;
    put16(n as number[], 7, point[0]);
    put16(n as number[], 9, point[1]);
    if (associated && !(aiByte(n, 113) & 16)) {
      n[87] = aiByte(n, 87) | 2;
      put16(n as number[], 92, destination[0]);
      put16(n as number[], 94, destination[1]);
      n[91] = 0;
      const resolved = resolveSpecialistMovePoint(
        w,
        slot,
        destination,
        campaignSpecialistMotionContext(w, pack, services),
      );
      put16(n as number[], 92, resolved[0]);
      put16(n as number[], 94, resolved[1]);
      put16(n as number[], 11, resolved[0]);
      put16(n as number[], 13, resolved[1]);
      if (aiByte(n, 130) !== 0 || aiByte(n, 87) & 1) {
        n[87] = aiByte(n, 87) & 254;
        cancelStagedCampaignSpecialistWork(w, slot, pack, services);
      }
    }
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:2:${slot}`,
      worldCell(...point),
    );
    const bp = 0x16 + binding.blueprintIndex * 36;
    raw[bp + 27] = aiByte(raw, bp + 24);
    raw[bp + 32] = aiByte(raw, bp + 32) | 2;
    put32(raw, bp + 28, (u32(raw, bp + 28) + 1) >>> 0);
    if (u32(raw, bp + 28) === 1 && aiByte(raw, bp + 22) === 1) n[114] = 40;
    project(w, slot, true);
    activated.push(slot);
  }
  put32(raw, 0x49d, (u32(raw, 0x49d) + 1) >>> 0);
  w.players[owner].activationCount = u32(raw, 0x49d);
  synchronizeCampaignSpecialistBlueprints(w);
  synchronizeCampaignLinks(w);
  return { routine: 0x80ae0 as const, owner, activated, candidates };
}
function landing(
  w: CampaignWorld,
  s: StrategicAIState,
  request: StrategicLandingRequest,
  pack: Pack,
  services: CampaignSpecialistServices,
  events: CampaignRecruitEvent[],
) {
  checkHost(w, s);
  if (!pack.rules)
    throw Error("Original landing specialist resources required");
  const raw = s.players[request.player],
    point: Point = [aiSWord(raw, 9), aiSWord(raw, 11)];
  //80830(-1) prefix executes even when the later48790 capacity attempt fails.
  for (let slot = request.player * 5; slot < request.player * 5 + 5; slot++) {
    const n = s.specialists[slot].native;
    if (!aiByte(n, 6) || aiByte(n, 112) & 1) continue;
    n[113] = aiByte(n, 113) | 4;
    put16(n as number[], 7, point[0]);
    put16(n as number[], 9, point[1]);
    n[22] = aiByte(n, 22) | 8;
    const initialized = bindSpecialistResources(n, raw, pack.rules.tables);
    ensureResource(pack, initialized.binding.assetKey);
    n.splice(0, n.length, ...initialized.native);
    w.specialists.bindings[slot] = initialized.binding;
    s.specialists[slot].blueprint = {
      player: request.player,
      index: initialized.binding.blueprintIndex,
    };
    n[27] = n[29] = 0;
    n[28] = 1;
    n[25] = 8;
    project(w, slot, false);
  }
  const special = aiDword(w.missionPrefix, 0x1ec2);
  if (aiByte(raw, 2) === 0 && w.frame === 0 && special !== 0) {
    const out = activateStagedCampaignSpecialists(
      w,
      request.player,
      pack,
      services,
    );
    put32(raw, 0x49d, 1);
    w.players[request.player].activationCount = 1;
    events.push({
      type: "specialists-activated",
      owner: request.player,
      slots: out.activated,
      immediate: true,
    });
    return request;
  }
  if (aiByte(raw, 2) === 0 && special !== 0)
    throw Error(
      "Source7F3B0 parameter1 requires actual selector64 factory-return family",
    );
  if (
    aiWord(w.missionPrefix, 0x3554) !==
    w.powerEffects.slots.filter((p) => p.occupied).length
  )
    throw Error("Actual48790 shared pool count differs from retained slots");
  const heldPriors = w.powerEffects.slots.map((p) => p.nativePrior),
    slot = allocateStagedSharedEffect(w, 49, pack, services.effectOptions(w));
  if (slot === null) {
    events.push({ type: "landing-capacity", owner: request.player });
    return request;
  }
  if (!pack.assets.EFF) throw Error("Original EFF landing resource required");
  animationProfile(pack.assets.EFF, 49);
  const prior = w.powerEffects.slots[slot].nativePrior!,
    held = heldPriors[slot]!,
    created = createLanding(request.player, point, w.terrain, slot, prior);
  if (!created.native)
    throw Error("Actual landing factory native afterimage required");
  publishStagedSharedEffect(w, slot, created.native);
  //The allocator/publisher can hold prior aliases: retain this slot record too.
  held.splice(0, held.length, ...w.powerEffects.slots[slot].nativePrior!);
  w.powerEffects.slots[slot].nativePrior = held;
  created.native = held;
  w.landings.push(created);
  requestAudio(w.audio, {
    frame: w.frame,
    entity: `source:4:${slot}`,
    cue: 0x50,
    mode: 2,
    parameter: 255,
    gain: 127,
    range: 180,
  });
  put16(raw, 0x496, slot);
  raw[0x498] = 5;
  if (request.player === w.selectedPlayer) revealCampaignRadius(w, point, 4096);
  synchronizeCampaignLinks(w);
  events.push({ type: "landing-created", owner: request.player, slot });
  return request;
}
/**Install inside the same staged host as bindCampaignStrategicState. */
export function campaignStrategicRecruitServices(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
  events: CampaignRecruitEvent[] = [],
): StrategicRecruitServices {
  return {
    createSpecialist: (s, request) => {
      const out = create(w, s, request, pack);
      events.push({
        type: "specialist-created",
        owner: request.player,
        slot: request.slot,
        blueprint: request.blueprint,
      });
      return out;
    },
    createLanding: (s, request) =>
      landing(w, s, request, pack, services, events),
  };
}
export function prepareStagedCampaignStrategicRoster(
  w: CampaignWorld,
  owner: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  const s = bindCampaignStrategicState(w),
    events: CampaignRecruitEvent[] = [],
    out = prepareStrategicRoster(
      s,
      owner,
      campaignStrategicRecruitServices(w, pack, services, events),
    );
  publishCampaignStrategicState(w, s);
  return { ...out, events };
}
/**Source capacityfailure commits prefix/AIquota; thrown unavailable services
 * roll back the full host, including real allocations, cleanup, audio and RNG. */
export function prepareCampaignStrategicRoster(
  w: CampaignWorld,
  owner: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  const staged = structuredClone(w),
    out = prepareStagedCampaignStrategicRoster(staged, owner, pack, services);
  Object.assign(w, staged);
  return out;
}
