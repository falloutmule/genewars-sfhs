/** Source4E950 shared200-slot primary/newborn effect callback scheduler. */
import type { Pack } from "../../content/types";
import {
  stepLandingMain,
  stepLandingParticle,
  type LandingContext,
  type LandingEvent,
  type LandingState,
  type LandingParticle,
  createSourceParticle,
} from "../mechanics/landing";
import {
  cloneEcologyState,
  plantBlockerWeight,
  type EcologyState,
} from "../mechanics/ecology";
import { cloneWaterEffect, type EffectNative } from "../mechanics/water";
import { animationProfile } from "../mechanics/animation";
import { stepBuildingEffect } from "../mechanics/building-effect";
import { stepZoneEffectRecord } from "../mechanics/zones";
import {
  stepProductionEffectRecord,
  stepEffect26Record,
} from "../mechanics/production-effect";
import {
  stepRewardEffectRecord,
  makeRewardEffect,
  selectEffectSlot,
  type RewardTarget,
  type RewardEffectUpdate,
  type RewardEvent,
  type RewardParticleRequest,
  type RewardQuery,
} from "../mechanics/reward-effect";
import {
  validateEffectNativePrior,
  putEffectWord,
  effectTerrainShade,
} from "../mechanics/power-motion";
import {
  stepPowerEffects,
  synchronizePowerAdapter,
  type PowerAdapterWorld,
} from "./power-adapter";
import {
  runWaterEffectCallback,
  type WaterAdapterWorld,
  type WaterAdapterReceipt,
} from "./water-adapter";
import {
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  validateSpatial,
} from "./spatial";
import { worldCell } from "../mechanics/terrain";
import type { SourceEntityId } from "./source-pools";
import type { EconomyReceipt } from "../mechanics/economy";
export type EffectSchedulerWorld = PowerAdapterWorld &
  WaterAdapterWorld & {
    ecology: EcologyState;
    actors?: unknown;
    builders?: unknown;
    players?: unknown;
    notices?: unknown;
    audio?: unknown;
  };
export interface EffectSchedulerOptions<
  W extends EffectSchedulerWorld = EffectSchedulerWorld,
> {
  gravity: number;
  obstacleAt: (position: [number, number]) => boolean;
  cleanupReferences: (world: W, id: SourceEntityId) => number | void;
  onLandingEvent?: (
    world: W,
    landing: LandingState,
    event: LandingEvent,
    context: LandingContext,
  ) => void;
  stageHost?: (original: W, staged: W) => void;
  commitHost?: (target: W, staged: W) => void;
  rewardTarget?: (
    world: W,
    native: readonly (number | null)[],
    query: RewardQuery,
  ) => RewardTarget | null;
  onRewardEvent?: (world: W, slot: number, event: RewardEvent) => void;
  /**35F90 registers nonzero-owner effects in the real AI order slots. */
  onRewardFactory?: (world: W, slot: number) => void;
}
export interface EffectSchedulerReceipt {
  callbacks: { phase: "primary" | "newborn"; slot: number; code: number }[];
  landingEvents: { slot: number; event: LandingEvent }[];
  water: WaterAdapterReceipt[];
  power: EconomyReceipt[];
  rewards: { slot: number; update: RewardEffectUpdate }[];
  createdNewborns: number;
  retired: SourceEntityId[];
  cleanedReferenceBytes: number;
  queueCandidates: number[];
}
const id = (slot: number): SourceEntityId => `source:4:${slot}`;
export function cloneEffectHost<W extends EffectSchedulerWorld>(
  w: W,
  options: EffectSchedulerOptions<W>,
): W {
  const host = structuredClone({
    actors: w.actors,
    builders: w.builders,
    players: w.players,
    notices: w.notices,
    audio: w.audio,
  });
  const s = {
    ...w,
    ...host,
    terrain: { bytes: w.terrain.bytes.slice(), revision: w.terrain.revision },
    spatial: structuredClone(w.spatial),
    powerEffects: {
      slots: w.powerEffects.slots.map((p) => ({
        ...p,
        packet: p.packet ? { ...p.packet } : null,
        nativePrior: p.nativePrior?.slice(),
      })),
    },
    waterEffects: w.waterEffects.map(cloneWaterEffect),
    landings: w.landings.map((l) => ({
      ...l,
      point: [...l.point],
      native: l.native?.slice(),
      particles: l.particles.map((p) => ({
        ...p,
        native: p.native?.slice(),
        animation: { ...p.animation },
      })),
    })),
    economy: structuredClone(w.economy),
    rng: { ...w.rng },
    source: {
      ...w.source,
      entities: w.source.entities.map((e) => ({
        ...e,
        nativeBytes: e.nativeBytes.slice(),
      })),
    },
    ecology: cloneEcologyState(w.ecology),
  } as W;
  options.stageHost?.(w, s);
  return s;
}
export function commitEffectHost<W extends EffectSchedulerWorld>(
  w: W,
  s: W,
  options: EffectSchedulerOptions<W>,
) {
  for (const key of [
    "terrain",
    "spatial",
    "powerEffects",
    "waterEffects",
    "landings",
    "economy",
    "rng",
    "source",
    "ecology",
    "actors",
    "builders",
    "players",
    "notices",
    "audio",
  ] as const)
    if (key in s) (w as Record<string, unknown>)[key] = s[key];
  options.commitHost?.(w, s);
}
function validate(w: EffectSchedulerWorld) {
  if (w.powerEffects.slots.length !== 200)
    throw new Error("Source effect scheduler needs200slots");
  for (const [slot, p] of w.powerEffects.slots.entries()) {
    if (!p.nativePrior)
      throw new Error("Source effect scheduler native prior is missing");
    validateEffectNativePrior(p.nativePrior);
    if (p.nativePrior[6] === null)
      throw new Error("Source effect scheduler kind is unknown");
    if (
      p.occupied !== !!w.spatial.nodes[id(slot)] ||
      p.occupied !== (p.nativePrior[6] !== 0)
    )
      throw new Error("Shared source effect occupancy is inconsistent");
    if (p.occupied && p.nativePrior[6] !== 5)
      throw new Error("Shared effect source kind is invalid");
  }
  validateSpatial(w.spatial);
}
function links(w: EffectSchedulerWorld) {
  for (const [slot, p] of w.powerEffects.slots.entries()) {
    const n = p.nativePrior,
      node = w.spatial.nodes[id(slot)];
    if (!n || !node) continue;
    const previous = node.previous ? w.spatial.nodes[node.previous] : null,
      next = node.next ? w.spatial.nodes[node.next] : null;
    putEffectWord(n, 0, previous ? previous.index : node.cell);
    n[2] = previous ? previous.family + 1 : 0;
    if (next) putEffectWord(n, 3, next.index);
    n[5] = next ? next.family + 1 : 0;
  }
  for (const landing of w.landings) {
    if (landing.phase !== 4 && landing.native)
      landing.native = w.powerEffects.slots[landing.slot].nativePrior?.slice();
    for (const p of landing.particles)
      if (p.native)
        p.native = w.powerEffects.slots[p.slot].nativePrior?.slice();
  }
  for (const e of w.waterEffects)
    if (e.active) e.native = w.powerEffects.slots[e.slot].nativePrior!.slice();
}
function landingContext<W extends EffectSchedulerWorld>(
  w: W,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
): LandingContext {
  if (!pack.rules || !pack.assets.EFF)
    throw new Error("Source effect tables/EFF binding is required");
  return {
    terrain: w.terrain,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    gravity: options.gravity,
    frame: w.frame,
    profile: (code) => animationProfile(pack.assets.EFF, code),
    plantBlockerWeight: (cell) => plantBlockerWeight(w.ecology, cell),
    occupiedEffectSlots: w.powerEffects.slots.flatMap((p, i) =>
      p.occupied ? [i] : [],
    ),
    slotPriors: w.powerEffects.slots,
  };
}
function publish(w: EffectSchedulerWorld, slot: number, native: EffectNative) {
  validateEffectNativePrior(native);
  w.powerEffects.slots[slot].nativePrior = native.slice();
  w.powerEffects.slots[slot].fractionX = native[67];
  w.powerEffects.slots[slot].fractionY = native[68];
}
function retire<W extends EffectSchedulerWorld>(
  w: W,
  slot: number,
  native: EffectNative,
  out: EffectSchedulerReceipt,
  options: EffectSchedulerOptions<W>,
) {
  if (w.spatial.nodes[id(slot)]) unlinkSpatial(w.spatial, w.terrain, id(slot));
  else throw new Error("Retiring source effect is not spatially bound");
  // Numeric callback supplies final bytes. Restore kind only across724C0 so
  // matching self-references participate before the final native kind clear.
  native[6] = 5;
  publish(w, slot, native);
  out.cleanedReferenceBytes += options.cleanupReferences(w, id(slot)) ?? 0;
  native[6] = 0;
  const shared = w.powerEffects.slots[slot];
  if (shared.nativePrior) shared.nativePrior[6] = 0;
  shared.occupied = false;
  shared.packet = null;
  out.retired.push(id(slot));
}
function clearNewborn(w: EffectSchedulerWorld, slot: number) {
  const n = w.powerEffects.slots[slot].nativePrior!;
  if (n[21] === null) throw new Error("Source newborn flag is unknown");
  n[21] &= 0xfe;
  for (const l of w.landings) {
    if (l.slot === slot && l.native) l.native[21] = n[21];
    for (const p of l.particles)
      if (p.slot === slot && p.native) p.native[21] = n[21];
  }
  const water = w.waterEffects.find((e) => e.slot === slot && e.active);
  if (water) {
    water.flags &= 0xfffe;
    water.native[21] = water.flags & 255;
  }
}
function removeReplacedHost(w: EffectSchedulerWorld, slot: number) {
  for (const l of w.landings)
    l.particles = l.particles.filter((p) => p.slot !== slot);
  for (const e of w.waterEffects)
    if (e.slot === slot && e.active) {
      e.active = false;
      e.native = w.powerEffects.slots[slot].nativePrior!.slice();
    }
}
/**48790 code59, including source shared capacity/replacement and actual raw
 * component geometry. Called on the staged13780 world by its state6 port. */
export function createCampaignRewardEffect<W extends EffectSchedulerWorld>(
  w: W,
  request: {
    owner: number;
    position: [number, number];
    height: number;
    angles: [0, 0, 0];
  },
  pack: Pack,
  options: EffectSchedulerOptions<W>,
): number | null {
  const s = cloneEffectHost(w, options);
  validate(s);
  if (!pack.rules) throw new Error("Source reward motion tables are required");
  const profile = animationProfile(pack.assets.EFF, 59),
    component = pack.assets.EFF.frames?.[profile.first].sourceComponents?.[0];
  if (!component)
    throw new Error("Source reward raw component coordinate is required");
  const allocation = selectEffectSlot(s.powerEffects, 59);
  if (!allocation) return null;
  const out: EffectSchedulerReceipt = {
    callbacks: [],
    landingEvents: [],
    water: [],
    power: [],
    rewards: [],
    createdNewborns: 0,
    retired: [],
    cleanedReferenceBytes: 0,
    queueCandidates: [],
  };
  if (allocation.replace) {
    retire(
      s,
      allocation.slot,
      s.powerEffects.slots[allocation.slot].nativePrior!,
      out,
      options,
    );
    removeReplacedHost(s, allocation.slot);
  }
  const n = makeRewardEffect(
    s.powerEffects.slots[allocation.slot].nativePrior!,
    { ...request, slot: allocation.slot, firstComponentY: component[2] },
    s.terrain,
    pack.rules.tables,
    profile,
  );
  s.powerEffects.slots[allocation.slot].occupied = true;
  publish(s, allocation.slot, n);
  insertSpatial(
    s.spatial,
    s.terrain,
    id(allocation.slot),
    worldCell(...request.position),
  );
  links(s);
  if (request.owner !== 0) {
    if (!options.onRewardFactory)
      throw new Error("Source reward35F90 AI registration service is required");
    options.onRewardFactory(s, allocation.slot);
  }
  validate(s);
  commitEffectHost(w, s, options);
  return allocation.slot;
}
/** All host callbacks receive staged state. Unknown source selectors abort
 * the whole pass, including preceding RNG/activation/retirement mutations. */
export function stepEffectScheduler<W extends EffectSchedulerWorld>(
  w: W,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
): EffectSchedulerReceipt {
  const s = cloneEffectHost(w, options),
    out: EffectSchedulerReceipt = {
      callbacks: [],
      landingEvents: [],
      water: [],
      power: [],
      rewards: [],
      createdNewborns: 0,
      retired: [],
      cleanedReferenceBytes: 0,
      queueCandidates: [],
    };
  validate(s);
  const rewardParticle = (request: RewardParticleRequest): boolean => {
    const allocation = selectEffectSlot(s.powerEffects, request.code);
    if (!allocation) return false;
    if (allocation.replace) {
      const replaced = allocation.slot;
      retire(
        s,
        replaced,
        s.powerEffects.slots[replaced].nativePrior!,
        out,
        options,
      );
      removeReplacedHost(s, replaced);
    }
    const p = createSourceParticle(
      request,
      s.rng,
      landingContext(s, pack, options),
    );
    if (!p || !p.native || p.slot !== allocation.slot)
      throw new Error("Source reward particle allocation differs");
    const container = s.landings[0];
    if (!container)
      throw new Error("Source reward particle callback host is missing");
    container.particles.push(p);
    s.powerEffects.slots[p.slot].occupied = true;
    publish(s, p.slot, p.native);
    insertSpatial(s.spatial, s.terrain, id(p.slot), worldCell(p.x, p.y));
    links(s);
    return true;
  };
  const callback = (slot: number, phase: "primary" | "newborn"): number => {
    const shared = s.powerEffects.slots[slot],
      n = shared.nativePrior!,
      code = n[69];
    if (code === null) throw new Error("Source effect selector is unknown");
    let created = 0;
    out.callbacks.push({ phase, slot, code });
    if (code === 0x31) {
      const landing = s.landings.find((l) => l.slot === slot && l.phase !== 4);
      if (!landing || !landing.native)
        throw new Error("Source landing callback binding is missing");
      const existing = new Set(landing.particles.map((p) => p.slot)),
        c = landingContext(s, pack, options),
        events = stepLandingMain(landing, s.rng, c);
      const current = landing.native.slice();
      current[6] = 5;
      publish(s, slot, current);
      for (const p of landing.particles)
        if (!existing.has(p.slot)) {
          if (!p.native || !(p.native[21]! & 1))
            throw new Error("Source landing factory did not mark its newborn");
          if (s.powerEffects.slots[p.slot].occupied)
            throw new Error("Source landing factory reused an occupied slot");
          insertSpatial(s.spatial, s.terrain, id(p.slot), worldCell(p.x, p.y));
          s.powerEffects.slots[p.slot].occupied = true;
          publish(s, p.slot, p.native);
          created++;
        }
      links(s);
      for (const event of events) {
        out.landingEvents.push({ slot, event });
        if (
          (event.type === "activate" || event.type === "retired") &&
          !options.onLandingEvent
        )
          throw new Error("Source landing event needs its host callback");
        options.onLandingEvent?.(s, landing, event, c);
      }
      if (landing.phase === 4) retire(s, slot, landing.native, out, options);
      else publish(s, slot, landing.native);
    } else if (
      code === 60 ||
      (code === 47 &&
        !s.landings.some((l) => l.particles.some((p) => p.slot === slot)))
    ) {
      const result = stepZoneEffectRecord(n, code, s.terrain, {
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        profile: (selector) => animationProfile(pack.assets.EFF, selector),
      });
      const x = ((result.native[7]! | (result.native[8]! << 8)) << 16) >> 16,
        y = ((result.native[9]! | (result.native[10]! << 8)) << 16) >> 16;
      moveSpatial(s.spatial, s.terrain, id(slot), worldCell(x, y));
      publish(s, slot, result.native);
      if (result.retirementRequired)
        retire(s, slot, result.native, out, options);
    } else if (code === 26) {
      const result = stepEffect26Record(n, s.terrain, {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        profile: animationProfile(pack.assets.EFF, 26),
      });
      const word = (at: number) =>
          ((result.native[at]! | (result.native[at + 1]! << 8)) << 16) >> 16,
        dword = (at: number) => (word(at) & 65535) | (word(at + 2) << 16),
        x = word(7),
        y = word(9);
      moveSpatial(s.spatial, s.terrain, id(slot), worldCell(x, y));
      publish(s, slot, result.native);
      for (const l of s.landings) {
        for (const p of l.particles)
          if (p.slot === slot) {
            p.native = result.native.slice();
            p.x = x;
            p.y = y;
            p.fractionX = result.native[67]!;
            p.fractionY = result.native[68]!;
            p.ground = dword(17);
            p.height = dword(39);
            p.vx = word(45);
            p.vy = word(47);
            p.vz = word(49);
            p.accelerationZ = word(55);
            p.animation = {
              action: 26,
              hold: result.native[26]!,
              frame: result.native[27]!,
              direction: (result.native[28]! << 24) >> 24,
              delay: (result.native[29]! << 24) >> 24,
              counter: (result.native[30]! << 24) >> 24,
            };
          }
        if (result.retirementRequired)
          l.particles = l.particles.filter((p) => p.slot !== slot);
      }
      if (result.retirementRequired)
        retire(s, slot, result.native, out, options);
    } else if (code === 6 || code === 0x2f) {
      let host: LandingState | undefined, particle: LandingParticle | undefined;
      for (const l of s.landings) {
        const p = l.particles.find((p) => p.slot === slot);
        if (p) {
          if (particle) throw new Error("Duplicate source particle host");
          host = l;
          particle = p;
        }
      }
      if (!host || !particle || particle.code !== code || !particle.native)
        throw new Error("Source landing particle binding is missing");
      const oldCell = worldCell(particle.x, particle.y),
        alive = stepLandingParticle(particle, landingContext(s, pack, options));
      if (oldCell !== worldCell(particle.x, particle.y))
        moveSpatial(
          s.spatial,
          s.terrain,
          id(slot),
          worldCell(particle.x, particle.y),
        );
      const numeric = particle.native;
      numeric[6] = 5;
      publish(s, slot, numeric);
      links(s);
      if (!alive) {
        retire(s, slot, particle.native!, out, options);
        host.particles = host.particles.filter((p) => p !== particle);
      }
    } else if (code === 32) {
      const result = stepProductionEffectRecord(n, s.terrain, {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        profile: animationProfile(pack.assets.EFF, 32),
        obstacleAt: options.obstacleAt,
      });
      const x = ((result.native[7]! | (result.native[8]! << 8)) << 16) >> 16,
        y = ((result.native[9]! | (result.native[10]! << 8)) << 16) >> 16;
      moveSpatial(s.spatial, s.terrain, id(slot), worldCell(x, y));
      publish(s, slot, result.native);
      if (result.retirementRequired)
        retire(s, slot, result.native, out, options);
    } else if (code === 59) {
      const players = s.players as { raw: number[] }[];
      const result = stepRewardEffectRecord(n, s.rng, {
        frame: s.frame,
        selectedPlayer: (s as W & { selectedPlayer: number }).selectedPlayer,
        players,
        skillCaps: pack.rules!.tables.blueprintStat17Caps,
        healthCaps: pack.rules!.tables.blueprintStat19Caps,
        nearestTarget: (native, query) => {
          if (!options.rewardTarget)
            throw new Error("Source reward4F7C0 target query is required");
          return options.rewardTarget(s, native, query);
        },
        particle: (request) => rewardParticle(request),
      });
      result.native.splice(
        0,
        6,
        ...s.powerEffects.slots[slot].nativePrior!.slice(0, 6),
      );
      publish(s, slot, result.native);
      out.rewards.push({ slot, update: result });
      created = result.newborns;
      for (const event of result.events)
        options.onRewardEvent?.(s, slot, event);
      if (result.retirementRequired)
        retire(s, slot, result.native, out, options);
    } else if (code === 44) {
      const x = ((n[7]! | (n[8]! << 8)) << 16) >> 16,
        y = ((n[9]! | (n[10]! << 8)) << 16) >> 16;
      const result = stepBuildingEffect(
        n,
        s.terrain,
        s.source.source.terrain.loadedPhysicalWaterHeight,
        effectTerrainShade(s.terrain, x, y),
        animationProfile(pack.assets.EFF, 44),
      );
      publish(s, slot, result.native);
      if (result.retired) retire(s, slot, result.native, out, options);
    } else if (code === 0x21) {
      const receipt = stepPowerEffects(s, pack, slot);
      out.power.push(receipt);
      if (!s.powerEffects.slots[slot].occupied) {
        const prior = s.powerEffects.slots[slot].nativePrior!;
        prior[6] = 5;
        out.cleanedReferenceBytes +=
          options.cleanupReferences(s, id(slot)) ?? 0;
        prior[6] = 0;
        out.retired.push(id(slot));
      }
    } else if (code === 0x15 || code === 0x16 || code === 0x30) {
      const water = runWaterEffectCallback(s, slot, pack, {
        obstacleAt: options.obstacleAt,
        cleanupReferences: (staged, identity) =>
          options.cleanupReferences(staged as W, identity),
      });
      out.water.push(water);
      out.retired.push(...water.retired);
      out.cleanedReferenceBytes += water.cleanedReferenceBytes;
      created = water.created.length;
    } else
      throw new Error(
        `Source effect callback selector ${code} is not admitted`,
      );
    links(s);
    return created;
  };
  let newborns = 0;
  for (let slot = 0; slot < 200; slot++) {
    const p = s.powerEffects.slots[slot];
    if (!p.occupied) continue;
    const flags = p.nativePrior![21];
    if (flags === null)
      throw new Error("Source effect newborn flag is unknown");
    if (flags & 1) continue;
    newborns += callback(slot, "primary");
  }
  out.createdNewborns = newborns;
  for (let slot = 0; slot < 200 && newborns > 0; slot++) {
    const p = s.powerEffects.slots[slot];
    if (!p.occupied) continue;
    const flags = p.nativePrior![21];
    if (flags === null)
      throw new Error("Source effect newborn flag is unknown");
    if (!(flags & 1)) continue;
    clearNewborn(s, slot);
    newborns--;
    callback(slot, "newborn");
  }
  if (newborns)
    throw new Error("Source shared effect newborn count has no marked records");
  for (const [slot, p] of s.powerEffects.slots.entries())
    if (p.occupied && p.nativePrior![69] !== 0x46)
      out.queueCandidates.push(slot);
  validate(s);
  commitEffectHost(w, s, options);
  return out;
}
