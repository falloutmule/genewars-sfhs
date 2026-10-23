/** Source13780 countdown/16 live-family8 callbacks and logical host ports. */
import type { Pack } from "../../content/types";
import {
  cloneEffectHost,
  commitEffectHost,
  type EffectSchedulerWorld,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import {
  createEtherealState,
  cloneEthereals,
  makeEtherealRecord,
  updateEtherealRecord,
  etherealWord,
  etherealDword,
  etherealPosition,
  putEtherealWord,
  type EtherealState,
  type EtherealSpawn,
  type EtherealRecord,
  type EtherealContext,
  type EtherealZone,
  type EtherealEvent,
  type EtherealBuilding,
  type EtherealRewardEffect,
} from "../mechanics/ethereal";
import {
  countdownTransition,
  countdownPresentation,
  countdownAnimationRequests,
  countdownExpiryRequests,
  type CountdownTransition,
  type CountdownPresentation,
} from "../mechanics/countdown";
import {
  createSourceParticle,
  type LandingContext,
} from "../mechanics/landing";
import { animationProfile } from "../mechanics/animation";
import { groundHeight, worldCell } from "../mechanics/terrain";
import { ecologyTerrainClass, plantBlockerWeight } from "../mechanics/ecology";
import {
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  validateSpatial,
} from "./spatial";
import type { SourceEntityId } from "./source-pools";
import type {EtherealPunishmentServices} from "../mechanics/ethereal-punishment";
export type EtherealAdapterWorld = EffectSchedulerWorld & {
  ethereals: EtherealState;
  missionPrefix: number[];
  countdown: number;
  selectedPlayer: number;
  flags: number;
  players: { raw: number[]; progress: number }[];
  buildingNative: (number | null)[][];
};
export type EtherealAdapterEvent =
  | { type: "countdown"; request: CountdownPresentation }
  | { type: "visitor"; slot: number; request: EtherealEvent };
export interface EtherealAdapterOptions<
  W extends EtherealAdapterWorld = EtherealAdapterWorld,
> {
  gravity: number;
  obstacleAt: (position: [number, number]) => boolean;
  cleanupReferences: (world: W, id: SourceEntityId) => number | void;
  onEvent?: (world: W, event: EtherealAdapterEvent) => void;
  stageHost?: (original: W, staged: W) => void;
  commitHost?: (target: W, staged: W) => void;
  rewardEffect?: (
    world: W,
    record: EtherealRecord,
    request: EtherealRewardEffect,
  ) => void;
  punishmentServices?: (world:W)=>EtherealPunishmentServices;
}
export interface EtherealPassReceipt {
  countdown: CountdownTransition;
  spawnAttempts: { request: EtherealSpawn; slot: number | null }[];
  callbacks: {
    slot: number;
    selector: number;
    stateBefore: number;
    stateAfter: number;
  }[];
  created: number[];
  retired: number[];
  particles: number[];
  events: EtherealAdapterEvent[];
  queueCandidates: number[];
  cleanedReferenceBytes: number;
}
const identity = (slot: number): SourceEntityId => `source:7:${slot}`;
const uw = (raw: readonly number[], at: number) =>
    (raw[at] | (raw[at + 1] << 8)) & 65535,
  sw = (raw: readonly number[], at: number) => (uw(raw, at) << 16) >> 16,
  sd = (raw: readonly number[], at: number) =>
    uw(raw, at) | (uw(raw, at + 2) << 16);
const put16 = (raw: number[], at: number, v: number) => {
    raw[at] = v & 255;
    raw[at + 1] = (v >> 8) & 255;
  },
  put32 = (raw: number[], at: number, v: number) => {
    put16(raw, at, v);
    put16(raw, at + 2, v >> 16);
  };
export { createEtherealState };
function shell<W extends EtherealAdapterWorld>(
  options: EtherealAdapterOptions<W>,
): EffectSchedulerOptions<W> {
  return {
    gravity: options.gravity,
    obstacleAt: options.obstacleAt,
    cleanupReferences: options.cleanupReferences,
    stageHost: (w, s) => {
      s.ethereals = cloneEthereals(w.ethereals);
      s.missionPrefix = w.missionPrefix.slice();
      s.buildingNative = w.buildingNative.map((n) => n.slice());
      options.stageHost?.(w, s);
    },
    commitHost: (w, s) => {
      w.ethereals = s.ethereals;
      w.missionPrefix = s.missionPrefix;
      w.countdown = s.countdown;
      w.buildingNative = s.buildingNative;
      options.commitHost?.(w, s);
    },
  };
}
function validate(w: EtherealAdapterWorld) {
  if (
    w.ethereals.records.length !== 16 ||
    w.ethereals.count !==
      w.ethereals.records.filter((r) => r.native[6] !== 0).length
  )
    throw new Error("Source family8 count/extent is inconsistent");
  for (const [slot, r] of w.ethereals.records.entries())
    if (
      r.slot !== slot ||
      r.native.length !== 102 ||
      (r.native[6] !== 0) !== !!w.spatial.nodes[identity(slot)]
    )
      throw new Error("Source family8 identity/spatial state differs");
  validateSpatial(w.spatial);
}
function links(w: EtherealAdapterWorld) {
  for (const r of w.ethereals.records) {
    if (r.native[6] === 0) continue;
    const node = w.spatial.nodes[identity(r.slot)];
    if (!node) throw new Error("Ethereal spatial link is missing");
    const previous = node.previous ? w.spatial.nodes[node.previous] : null,
      next = node.next ? w.spatial.nodes[node.next] : null;
    putEtherealWord(r.native, 0, previous ? previous.index : node.cell);
    r.native[2] = previous ? previous.family + 1 : 0;
    if (next) putEtherealWord(r.native, 3, next.index);
    r.native[5] = next ? next.family + 1 : 0;
  }
}
function create(
  w: EtherealAdapterWorld,
  request: EtherealSpawn,
): number | null {
  const slot = w.ethereals.records.findIndex((r) => r.native[6] === 0);
  if (slot < 0) return null;
  const record = makeEtherealRecord(w.ethereals.records[slot], request, {
    terrain: w.terrain,
  });
  w.ethereals.records[slot] = record;
  insertSpatial(
    w.spatial,
    w.terrain,
    identity(slot),
    worldCell(...etherealPosition(record)),
  );
  w.ethereals.count++;
  w.missionPrefix[0x3559] = w.ethereals.count;
  links(w);
  return slot;
}
function zoneViews(w: EtherealAdapterWorld): EtherealZone[] {
  const count = w.missionPrefix[0x34b8];
  if (!Number.isInteger(count) || count < 0 || count > 64)
    throw new Error("Ethereal zone count exceeds source bound");
  return Array.from({ length: count }, (_, index) => {
    const at = 0x2ff8 + index * 19;
    return {
      index,
      center: [sw(w.missionPrefix, at), sw(w.missionPrefix, at + 2)],
      initialQuota: sd(w.missionPrefix, at + 10),
      remainingQuota: sd(w.missionPrefix, at + 14),
      observerCount: w.missionPrefix[at + 18],
    };
  });
}
function writeZones(w: EtherealAdapterWorld, zones: EtherealZone[]) {
  for (const z of zones) {
    const at = 0x2ff8 + z.index * 19;
    put32(w.missionPrefix, at + 10, z.initialQuota);
    put32(w.missionPrefix, at + 14, z.remainingQuota);
    w.missionPrefix[at + 18] = z.observerCount;
  }
}
function buildings(w: EtherealAdapterWorld, owner: number): EtherealBuilding[] {
  if (w.buildingNative.length !== 256)
    throw new Error("Ethereal needs actual256-building native priors");
  return Array.from({ length: 64 }, (_, i) => {
    const slot = owner * 64 + i,
      n = w.buildingNative[slot];
    if (n.length !== 67)
      throw new Error("Ethereal building native stride is invalid");
    const active = n[6] !== 0;
    if (!active)
      return {
        slot,
        owner,
        active: false,
        complete: false,
        selector: 0,
        x: 0,
        y: 0,
        flags0100: false,
      };
    if (n[6] !== 4 || n[24] !== owner)
      throw new Error("Ethereal building owner partition is invalid");
    const flags = etherealWord(n, 49) & 65535;
    return {
      slot,
      owner,
      active: true,
      complete: !!(flags & 1),
      selector: n[45]!,
      x: etherealWord(n, 7),
      y: etherealWord(n, 9),
      flags0100: !!(flags & 0x100),
    };
  });
}
function particleContext<W extends EtherealAdapterWorld>(
  w: W,
  pack: Pack,
  options: EtherealAdapterOptions<W>,
): LandingContext {
  if (!pack.rules) throw new Error("Ethereal motion tables are required");
  return {
    terrain: w.terrain,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    gravity: options.gravity,
    frame: w.frame,
    profile: (code) => animationProfile(pack.assets.EFF, code),
    plantBlockerWeight: (cell) => plantBlockerWeight(w.ecology, cell),
    occupiedEffectSlots: w.powerEffects.slots.flatMap((s, i) =>
      s.occupied ? [i] : [],
    ),
    slotPriors: w.powerEffects.slots,
  };
}
function context<W extends EtherealAdapterWorld>(
  w: W,
  pack: Pack,
  options: EtherealAdapterOptions<W>,
  receipt: EtherealPassReceipt,
): EtherealContext {
  if (!pack.rules || !pack.assets.ETHEREAL || !pack.etherealRules)
    throw new Error("Original Ethereal resources/rules are required");
  return {
    terrain: w.terrain,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    frame: w.frame,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    profile: (selector, action) =>
      animationProfile(
        pack.assets.ETHEREAL,
        selector === 1 ? action : 8 + action,
      ),
    currentPointAccepted: (r) => {
      const at = etherealPosition(r),
        obstacle = options.obstacleAt(at),
        terrainClass = ecologyTerrainClass(w.terrain, at);
      if (r.native[0x53] === null)
        throw new Error("Ethereal avoidance mask is unknown");
      if (r.native[0x53]! & (1 << terrainClass) || obstacle) return false;
      if (r.native[0x4a] === null)
        throw new Error("Ethereal blocker flag is unknown");
      return (
        !!(r.native[0x4a]! & 8) ||
        plantBlockerWeight(w.ecology, worldCell(...at)) < 10
      );
    },
    buildings: (owner) => buildings(w, owner),
    playerTarget: (owner) => [
      sw(w.players[owner].raw, 9),
      sw(w.players[owner].raw, 11),
    ],
    zones: zoneViews(w),
    playerCounter: (owner) => sd(w.players[owner].raw, 17),
    responseThreshold: uw(w.missionPrefix, 0x1c7c),
    punishmentDivisor: uw(w.missionPrefix, 0x1c78),
    observationThresholds: pack.etherealRules.observationThresholds,
    rewardSiteAccepted: (position) =>
      !options.obstacleAt(position) &&
      ecologyTerrainClass(w.terrain, position) > 1,
    playerInactive: (owner) => w.players[owner].raw[0x6e3] !== 0,
    playerRaw: (owner)=>w.players[owner].raw,
    punishment: options.punishmentServices?.(w),
    createParticle: (parent, request, rng) => {
      const current = w.ethereals.records[parent.slot],
        next = { ...parent, native: parent.native.slice() };
      next.native.splice(0, 6, ...current.native.slice(0, 6));
      w.ethereals.records[parent.slot] = next;
      moveSpatial(
        w.spatial,
        w.terrain,
        identity(parent.slot),
        worldCell(...etherealPosition(next)),
      );
      links(w);
      const created = createSourceParticle(
        {
          code: 26,
          owner: 0,
          position: request.position,
          height: request.height,
          angles: request.angles,
          newborn: false,
        },
        rng,
        particleContext(w, pack, options),
      );
      if (!created) return;
      if (!created.native)
        throw new Error("Ethereal particle numeric image is missing");
      const container =
        w.landings.find((l) => l.owner === parent.native[24]) ?? w.landings[0];
      if (!container)
        throw new Error("Ethereal particle callback host is missing");
      container.particles.push(created);
      const shared = w.powerEffects.slots[created.slot];
      shared.occupied = true;
      shared.nativePrior = created.native.slice();
      shared.fractionX = created.fractionX;
      shared.fractionY = created.fractionY;
      insertSpatial(
        w.spatial,
        w.terrain,
        `source:4:${created.slot}`,
        worldCell(created.x, created.y),
      );
      links(w);
      receipt.particles.push(created.slot);
    },
    rewardEffect: options.rewardEffect
      ? (record, request) => options.rewardEffect!(w, record, request)
      : undefined,
  };
}
/** Direct source101D0 creation for expiry or real zone activation. No RNG. */
export function createCampaignEthereal<W extends EtherealAdapterWorld>(
  w: W,
  request: EtherealSpawn,
  pack: Pack,
  options: EtherealAdapterOptions<W>,
): number | null {
  const hooks = shell(options),
    s = cloneEffectHost(w, hooks);
  validate(s);
  if (!pack.assets.ETHEREAL)
    throw new Error("Original Ethereal resource is missing");
  const slot = create(s, request);
  validate(s);
  commitEffectHost(w, s, hooks);
  return slot;
}
/** Whole13780 pass. A higher newly-created slot runs later in the same pass. */
export function stepCountdownEthereals<W extends EtherealAdapterWorld>(
  w: W,
  pack: Pack,
  options: EtherealAdapterOptions<W>,
): EtherealPassReceipt {
  const hooks = shell(options),
    s = cloneEffectHost(w, hooks);
  validate(s);
  const selected = s.players[s.selectedPlayer];
  if (!selected || selected.raw.length !== 1805)
    throw new Error("Ethereal countdown selected player is invalid");
  const transition = countdownTransition({
      count: s.countdown,
      period: uw(s.missionPrefix, 0x1c7a),
      progress: selected.progress,
      playerByte607: selected.raw[0x607],
      runtimeFlags: s.flags,
      activeSelector0: s.ethereals.records.some(
        (r) => r.native[6] !== 0 && r.native[0x55] === 0,
      ),
    }),
    out: EtherealPassReceipt = {
      countdown: transition,
      spawnAttempts: [],
      callbacks: [],
      created: [],
      retired: [],
      particles: [],
      events: [],
      queueCandidates: [],
      cleanedReferenceBytes: 0,
    };
  s.countdown = transition.after;
  put16(s.missionPrefix, 0x355c, s.countdown);
  const emit = (event: EtherealAdapterEvent) => {
    out.events.push(event);
    options.onEvent?.(s, event);
  };
  for (const request of countdownPresentation(transition, s.selectedPlayer))
    emit({ type: "countdown", request });
  if (transition.expired) {
    const count = s.source.source.context.activePlayerCount,
      requests = countdownExpiryRequests(
        s.players.slice(0, count).map((p) => p.raw),
        (at) => groundHeight(s.terrain, ...at),
      );
    for (const request of requests) {
      const slot = create(s, request);
      out.spawnAttempts.push({ request, slot });
      if (slot !== null) out.created.push(slot);
    }
  }
  for (let slot = 0; slot < 16; slot++) {
    const before = s.ethereals.records[slot];
    if (before.native[6] === 0) continue;
    const c = context(s, pack, options, out),
      stateBefore = before.native[0x56]!,
      update = updateEtherealRecord(before, s.ethereals, c, s.rng),
      current = s.ethereals.records[slot];
    update.after.native.splice(0, 6, ...current.native.slice(0, 6));
    s.ethereals.records[slot] = update.after;
    moveSpatial(
      s.spatial,
      s.terrain,
      identity(slot),
      worldCell(...etherealPosition(update.after)),
    );
    links(s);
    writeZones(s, c.zones);
    if (update.playerCounterAfter !== null)
      put32(
        s.players[update.after.native[24]!].raw,
        17,
        update.playerCounterAfter,
      );
    if (update.playerFundsDelta !== 0) {
      const player = s.players[update.after.native[24]!],
        value = (sd(player.raw, 0x4a3) + update.playerFundsDelta) | 0;
      put32(player.raw, 0x4a3, value);
      if ("funds" in player) (player as { funds: number }).funds = value;
    }
    if (update.child) {
      const child = create(s, update.child);
      if (child !== null) out.created.push(child);
    }
    for (const request of update.events)
      emit({ type: "visitor", slot, request });
    if (update.retire) {
      unlinkSpatial(s.spatial, s.terrain, identity(slot));
      out.cleanedReferenceBytes +=
        options.cleanupReferences(s, identity(slot)) ?? 0;
      s.ethereals.records[slot].native[6] = 0;
      s.ethereals.count--;
      s.missionPrefix[0x3559] = s.ethereals.count;
      out.retired.push(slot);
      if (update.notifyParent !== null)
        s.ethereals.records[update.notifyParent].native[0x57] = 1;
      links(s);
    } else if (update.queue) out.queueCandidates.push(slot);
    out.callbacks.push({
      slot,
      selector: before.native[0x55]!,
      stateBefore,
      stateAfter: update.after.native[0x56]!,
    });
  }
  for (const request of countdownAnimationRequests())
    emit({ type: "countdown", request });
  validate(s);
  commitEffectHost(w, s, hooks);
  return out;
}
