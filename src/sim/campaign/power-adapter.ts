/** Source-backed adapters between the normalized economy, shared effect slots
 * and spatial registry. All mutating entry points stage their own writes. */
import type { Pack } from "../../content/types";
import type { SourcePoolRegistry, SourceEntityId } from "./source-pools";
import { decodeBytes, i16 } from "./bytes";
import {
  cloneSpatial,
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  validateSpatial,
  type SpatialState,
} from "./spatial";
import {
  clonePowerEffectPool,
  createPowerEffectPool,
  launchPowerPackets,
  stepPowerPacketMotion,
  retirePowerPacketSlots,
  detachPowerPacketTargets,
  effectFactoryPrior,
  effectPriorByte,
  effectTerrainShade,
  putEffectWord,
  retireEffectPrior,
  validateEffectNativePrior,
  type PowerEffectPool,
} from "../mechanics/power-motion";
import {
  cloneEconomyState,
  stepEconomyPackets,
  type EconomyState,
  type EconomyReceipt,
  type EconomyBuilding,
  type EconomyRules,
  type PowerProducerAudio,
  type PowerProducerState,
} from "../mechanics/economy";
import {
  groundHeight,
  worldCell,
  type TerrainState,
} from "../mechanics/terrain";
import { createMotion, velocity } from "../mechanics/motion";
import {
  advanceAnimation,
  animationProfile,
  animationState,
} from "../mechanics/animation";
import { nextRandom, type GeneRng } from "../mechanics/random";
import {
  synchronizeLandingParticleNative,
  type LandingParticle,
  type LandingState,
} from "../mechanics/landing";

export interface PowerAdapterWorld {
  powerEffects: PowerEffectPool;
  landings: LandingState[];
  spatial: SpatialState;
  terrain: TerrainState;
  economy: EconomyState;
  rng: GeneRng;
  source: SourcePoolRegistry;
  frame: number;
}
type EffectSource = {
  source: {
    pools: readonly {
      family: number;
      capacity: number;
      packedStride: number;
      packedBase64: string;
    }[];
  };
};
const effectId = (slot: number): SourceEntityId => `source:4:${slot}`;
const take = <T>(
  r: { ok: true; value: T } | { ok: false; reason: string },
): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

/** No native-zero prior: source packed59/60 actually supplies fractions67/68. */
export function initializePowerAdapter(
  registry: EffectSource,
): PowerEffectPool {
  const source = registry.source.pools.find((p) => p.family === 4);
  if (!source || source.capacity !== 200 || source.packedStride !== 73)
    throw new Error("Original effect pool layout is required");
  const raw = decodeBytes(source.packedBase64);
  if (raw.length !== 200 * 73)
    throw new Error("Original effect pool byte extent is required");
  return take(
    createPowerEffectPool(
      Array.from({ length: 200 }, (_, slot) => ({
        fractionX: raw[slot * 73 + 59],
        fractionY: raw[slot * 73 + 60],
        occupied: raw[slot * 73 + 6] !== 0,
        nativePrior: Array.from({ length: 81 }, (_, n) =>
          n < 31 ? raw[slot * 73 + n] : n < 39 ? null : raw[slot * 73 + n - 8],
        ),
      })),
    ),
  );
}

/** Keep references to particle objects BEFORE stepLanding filters them: their
 * final movement mutates the object even when retirement removes the entry.
 * Pass removed records here AFTER spatial unlink, BEFORE another factory. */
export function synchronizePowerAdapter(
  w: PowerAdapterWorld,
  retiredParticles: readonly LandingParticle[] = [],
): void {
  const pool = clonePowerEffectPool(w.powerEffects);
  if (pool.slots.length !== 200)
    throw new Error("Shared effect pool must have200slots");
  for (const slot of pool.slots)
    if (slot.nativePrior) validateEffectNativePrior(slot.nativePrior);
  const occupied = new Set<number>();
  for (const node of Object.values(w.spatial.nodes))
    if (node.family === 4) occupied.add(node.index);
  const live = new Map<number, LandingParticle>();
  for (const landing of w.landings) {
    if (landing.phase !== 4) occupied.add(landing.slot);
    const shared = pool.slots[landing.slot];
    if (!shared) throw new Error("Invalid shared landing slot");
    if (
      landing.native &&
      (landing.phase !== 4 ||
        (shared.nativePrior?.[6] === 5 && shared.nativePrior[69] === 0x31))
    ) {
      if (shared.packet) throw new Error("Landing conflicts with a power slot");
      validateEffectNativePrior(landing.native);
      shared.nativePrior = landing.native.slice();
      shared.fractionX = landing.native[67];
      shared.fractionY = landing.native[68];
    }
    for (const particle of landing.particles) {
      if (live.has(particle.slot))
        throw new Error("Duplicate shared particle slot");
      live.set(particle.slot, particle);
      occupied.add(particle.slot);
    }
  }
  for (const p of retiredParticles)
    if (!live.has(p.slot)) {
      const slot = pool.slots[p.slot];
      if (!slot || slot.packet)
        throw new Error("Retired particle conflicts with a power slot");
      slot.fractionX = p.fractionX;
      slot.fractionY = p.fractionY;
      if (p.native) {
        validateEffectNativePrior(p.native);
        slot.nativePrior = p.native.slice();
      }
      if (slot.nativePrior) {
        const stagedParticle = { ...p, native: slot.nativePrior };
        synchronizeLandingParticleNative(stagedParticle, w.terrain, false);
        slot.nativePrior[69] = p.code;
        slot.nativePrior = retireEffectPrior(slot.nativePrior, p.slot);
      }
    }
  for (const [index, slot] of pool.slots.entries()) {
    const particle = live.get(index);
    if (slot.packet) {
      if (particle || w.landings.some((l) => l.phase !== 4 && l.slot === index))
        throw new Error("Power packet conflicts with another shared effect");
      if (!w.spatial.nodes[effectId(index)])
        throw new Error("Power packet spatial binding is missing");
      slot.occupied = true;
    } else {
      slot.occupied = occupied.has(index);
      if (particle) {
        slot.fractionX = particle.fractionX;
        slot.fractionY = particle.fractionY;
        if (particle.native) {
          validateEffectNativePrior(particle.native);
          slot.nativePrior = particle.native.slice();
        }
        if (slot.nativePrior) {
          synchronizeLandingParticleNative(
            { ...particle, native: slot.nativePrior },
            w.terrain,
            false,
          );
          slot.nativePrior[6] = 5;
          slot.nativePrior[69] = particle.code;
        }
      }
    }
  }
  synchronizeEffectLinks(pool, w.spatial);
  w.powerEffects = pool;
}
/**8AC60/8AD00 current numeric link identities. Pointer gap remains null.
 * Include other family4 images because insertion changes neighbor links. */
function synchronizeEffectLinks(
  pool: PowerEffectPool,
  spatial: SpatialState,
): void {
  for (const [slot, item] of pool.slots.entries()) {
    const n = item.nativePrior,
      node = spatial.nodes[effectId(slot)];
    if (!n || !node) continue;
    const previous = node.previous ? spatial.nodes[node.previous] : null,
      next = node.next ? spatial.nodes[node.next] : null;
    putEffectWord(n, 0, previous ? previous.index : node.cell);
    n[2] = previous ? previous.family + 1 : 0;
    if (next) putEffectWord(n, 3, next.index);
    n[5] = next ? next.family + 1 : 0;
  }
}
function staged(w: PowerAdapterWorld, particles = false): PowerAdapterWorld {
  return {
    ...w,
    powerEffects: clonePowerEffectPool(w.powerEffects),
    spatial: cloneSpatial(w.spatial),
    terrain: { ...w.terrain, bytes: [...w.terrain.bytes] },
    economy: cloneEconomyState(w.economy),
    rng: { ...w.rng },
    landings: particles ? structuredClone(w.landings) : w.landings,
  };
}
function commit(w: PowerAdapterWorld, s: PowerAdapterWorld, particles = false) {
  w.powerEffects = s.powerEffects;
  w.spatial = s.spatial;
  w.terrain = s.terrain;
  w.economy = s.economy;
  if (particles) {
    w.landings = s.landings;
    w.rng = s.rng;
  }
}
function requiredRules(pack: Pack) {
  if (!pack.rules || !pack.economyRules)
    throw new Error("Original power rules and motion tables are required");
  return { tables: pack.rules.tables, economy: pack.economyRules };
}

/** Commit the building receipt and all its ordered real packet factories as
 * one adapter transaction. Spatial insertion uses the source shared slot. */
export function applyPowerBuildingEvents(
  w: PowerAdapterWorld,
  receipt: EconomyReceipt,
  pack: Pack,
): { packetId: number; slot: number }[] {
  const rules = requiredRules(pack),
    s = staged(w);
  synchronizePowerAdapter(s);
  const requests = receipt.events.flatMap((event) => {
    if (event.type !== "packet-launched") return [];
    const target = receipt.state.buildings.find(
      (b) => b.id === event.packet.targetId,
    );
    if (!target) throw new Error("Power factory destination is missing");
    return [
      {
        ...event.packet,
        targetX: target.x,
        targetY: target.y,
        destinationIndex: target.owner * 64 + target.slot,
      },
    ];
  });
  const launched = take(
    launchPowerPackets(
      s.powerEffects,
      requests,
      rules.tables,
      (x, y) => groundHeight(s.terrain, x, y),
      (x, y) => effectTerrainShade(s.terrain, x, y),
    ),
  );
  s.powerEffects = launched.pool;
  s.economy = cloneEconomyState(receipt.state);
  for (const allocation of launched.allocated) {
    const p = s.powerEffects.slots[allocation.slot].packet!;
    insertSpatial(
      s.spatial,
      s.terrain,
      effectId(allocation.slot),
      worldCell(p.x, p.y),
    );
  }
  validateSpatial(s.spatial);
  synchronizeEffectLinks(s.powerEffects, s.spatial);
  commit(w, s);
  return launched.allocated;
}

/** Run only effect33 callbacks after the host building/plant phases. Target
 * destruction clears its destination kind before possible building reuse. */
export function stepPowerEffects(
  w: PowerAdapterWorld,
  pack: Pack,
  onlySlot?: number,
): EconomyReceipt {
  const rules = requiredRules(pack),
    s = staged(w);
  synchronizePowerAdapter(s);
  if (
    onlySlot !== undefined &&
    (!Number.isInteger(onlySlot) ||
      onlySlot < 0 ||
      onlySlot >= 200 ||
      !s.powerEffects.slots[onlySlot].packet)
  )
    throw new Error("Power callback slot binding is missing");
  const targets = new Set(s.economy.buildings.map((b) => b.id));
  for (const slot of s.powerEffects.slots)
    if (
      slot.packet &&
      slot.packet.targetId !== null &&
      !targets.has(slot.packet.targetId)
    )
      s.powerEffects = take(
        detachPowerPacketTargets(s.powerEffects, slot.packet.targetId),
      );
  const motionIds = s.powerEffects.slots.flatMap((slot) =>
    slot.packet ? [slot.packet.id] : [],
  );
  if (
    motionIds.length !== s.economy.packets.length ||
    s.economy.packets.some((p) => !motionIds.includes(p.id))
  )
    throw new Error("Power motion/economy packet identities differ");
  const moved = take(
    stepPowerPacketMotion(
      s.powerEffects,
      (x, y) => groundHeight(s.terrain, x, y),
      (x, y) => effectTerrainShade(s.terrain, x, y),
      onlySlot === undefined ? undefined : [onlySlot],
    ),
  );
  s.powerEffects = moved.pool;
  for (const event of moved.moved)
    moveSpatial(s.spatial, s.terrain, effectId(event.slot), event.newCell);
  const delivered = stepEconomyPackets(s.economy, moved.samples, rules.economy);
  if (!delivered.ok) throw new Error(delivered.reason);
  s.economy = delivered.receipt.state;
  for (const slot of s.powerEffects.slots) {
    if (!slot.packet || !slot.nativePrior) continue;
    const active = s.economy.packets.find((p) => p.id === slot.packet!.id),
      delivery = delivered.receipt.events.find(
        (event) =>
          event.type === "packet-delivered" &&
          event.packetId === slot.packet!.id,
      ),
      expired = delivered.receipt.events.some(
        (event) =>
          event.type === "packet-expired" && event.packetId === slot.packet!.id,
      );
    if (active) slot.nativePrior[76] = active.payload;
    else if (delivery?.type === "packet-delivered")
      slot.nativePrior[76] = delivery.payload;
    else if (expired) slot.nativePrior[76] = 0;
  }
  const remaining = new Set(s.economy.packets.map((p) => p.id));
  const retired = motionIds.filter((id) => !remaining.has(id));
  for (const id of retired) {
    const slot = s.powerEffects.slots.findIndex((v) => v.packet?.id === id);
    unlinkSpatial(s.spatial, s.terrain, effectId(slot));
  }
  s.powerEffects = take(retirePowerPacketSlots(s.powerEffects, retired));
  validateSpatial(s.spatial);
  synchronizeEffectLinks(s.powerEffects, s.spatial);
  commit(w, s);
  return delivered.receipt;
}

/** Optional explicit destruction hook where IDs may be reused before the next
 * effect phase. Source delivery receives targetValid=false thereafter. */
export function detachDestroyedPowerTarget(
  w: PowerAdapterWorld,
  targetId: number,
): void {
  w.powerEffects = take(detachPowerPacketTargets(w.powerEffects, targetId));
}

/** Resolve source timer/cycle gates before the ordered Extractor contact pass. */
export function extractorNeedsContact(
  b: EconomyBuilding,
  goop: number,
  capacity: number,
  rules: EconomyRules,
): boolean {
  if (b.selector !== 11 || !b.complete || b.disabled || !b.extractor)
    return false;
  const energy =
    ((b.energy - rules.extractor.upkeep - b.extraDrain) << 16) >> 16;
  if (energy <= 0) return false;
  let frame = b.extractor.frame;
  if (frame === rules.extractor.resetFrame) frame = 0;
  if (b.extractor.cycle >= rules.extractor.cycleLength && goop >>> 0 < capacity)
    frame = rules.extractor.startFrame;
  return rules.extractor.harvestFrames.includes(frame);
}

/** Read-only preflight of the two ordered contact queries. A live result
 *requires the real kind1 virtual34 callback even when grade0 requests zero;
 *this helper never claims that numeric zero made the side effects disappear. */
export function planExtractorContactQueries(
  spatial: SpatialState,
  b: EconomyBuilding,
  allianceMask: number,
  creature: (sourceIndex: number) => { owner: number; state: number } | null,
): {
  cell: number;
  queries: {
    source: "foreign8B000" | "own8B080";
    targetIndex: number | null;
    damage: number;
    virtual34Required: boolean;
  }[];
} {
  const y = ((b.y + 256) << 16) >> 16,
    cell = worldCell(b.x, y);
  const candidates: { index: number; owner: number; state: number }[] = [];
  let id = spatial.heads[cell];
  const seen = new Set<string>();
  while (id) {
    if (seen.has(id)) throw new Error("Extractor contact spatial cycle");
    seen.add(id);
    const node = spatial.nodes[id];
    if (!node || node.cell !== cell)
      throw new Error("Extractor contact spatial binding is missing");
    if (node.family === 0) {
      const target = creature(node.index);
      if (
        !target ||
        !Number.isInteger(target.owner) ||
        !Number.isInteger(target.state)
      )
        throw new Error("Extractor kind1 contact state is unresolved");
      candidates.push({ index: node.index, ...target });
    }
    id = node.next;
  }
  const foreign = candidates.find(
    (target) =>
      target.state < 24 &&
      target.owner !== b.owner &&
      (allianceMask & (1 << (target.owner & 31))) === 0,
  );
  const own = candidates.find(
    (target) => target.state < 24 && target.owner === b.owner,
  );
  return {
    cell,
    queries: [
      {
        source: "foreign8B000",
        targetIndex: foreign?.index ?? null,
        damage: b.grade * 8,
        virtual34Required: foreign !== undefined,
      },
      {
        source: "own8B080",
        targetIndex: own?.index ?? null,
        damage: b.grade * 8,
        virtual34Required: own !== undefined,
      },
    ],
  };
}

/** The actual source contact3draws then code6 factory1draw. This only handles
 * its smoke port; host foreign/own kind1 queries and damage still must resolve
 * in source order before the enclosing economy callback commits. */
export function createExtractorContactSmoke(
  w: PowerAdapterWorld,
  b: EconomyBuilding,
  pack: Pack,
): { created: boolean; slot: number | null } {
  const rules = requiredRules(pack),
    player = w.economy.players.find((p) => p.id === b.owner);
  if (
    !player ||
    !extractorNeedsContact(b, player.goop, player.capacity, rules.economy) ||
    ((w.frame + b.slot) & 1) === 0
  )
    return { created: false, slot: null };
  // Validate the imported effect animation before any draw/allocation commit.
  animationProfile(pack.assets.EFF, 6);
  const s = staged(w, true);
  synchronizePowerAdapter(s);
  const container = s.landings.find((l) => l.owner === b.owner);
  if (!container)
    throw new Error("Extractor smoke requires the established particle host");
  const speed = nextRandom(s.rng) % 30 << 6,
    pitch = (nextRandom(s.rng) % 160) - 80,
    yaw = nextRandom(s.rng) % 2045;
  const slot = s.powerEffects.slots.findIndex((v) => !v.occupied);
  if (slot < 0)
    throw new Error("Extractor smoke full-pool replacement requires admission");
  const prior = s.powerEffects.slots[slot];
  if (prior.fractionX === null || prior.fractionY === null)
    throw new Error("Extractor smoke fraction prior is unknown");
  if (prior.nativePrior) validateEffectNativePrior(prior.nativePrior);
  const counter = prior.nativePrior
    ? (effectPriorByte(prior.nativePrior, 30) << 24) >> 24
    : 0;
  const x = b.x,
    y = ((b.y + 256) << 16) >> 16,
    ground = groundHeight(s.terrain, x, y);
  const m = createMotion(x, y, ground, 0);
  m.yaw = yaw;
  m.pitch = pitch;
  m.speed = speed;
  velocity(m, rules.tables);
  const gravity = i16(decodeBytes(s.source.source.missionPrefixBase64), 0x1c5d);
  const particle: LandingParticle = {
    slot,
    code: 6,
    x,
    y,
    fractionX: prior.fractionX,
    fractionY: prior.fractionY,
    ground,
    height: ground,
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    accelerationZ: -(gravity >> 6),
    animation: { ...animationState(6, 1 + (nextRandom(s.rng) % 3)), counter },
  };
  if (prior.nativePrior) {
    particle.native = effectFactoryPrior(prior.nativePrior, {
      slot,
      code: 6,
      owner: 0,
      x,
      y,
      ground,
      height: particle.height,
      shade: effectTerrainShade(s.terrain, x, y),
      vx: m.vx,
      vy: m.vy,
      vz: m.vz,
      accelerationZ: particle.accelerationZ,
      yaw,
      pitch,
      speed,
      delay: particle.animation.delay,
    });
    particle.native[67] = prior.fractionX;
    particle.native[68] = prior.fractionY;
    prior.nativePrior = particle.native.slice();
  }
  container.particles.push(particle);
  prior.occupied = true;
  insertSpatial(s.spatial, s.terrain, effectId(slot), worldCell(x, y));
  validateSpatial(s.spatial);
  synchronizeEffectLinks(s.powerEffects, s.spatial);
  commit(w, s, true);
  return { created: true, slot };
}

/** Source451F0 producer RNG/audio/7AC00 animation. Call in native building
 * order, interleaved with Extractor contact callbacks, BEFORE numeric economy
 * generation consumes/stores its afterimage. The pulse draw happens even when
 * no recipient is found; packet factories themselves consume no RNG. */
export function advancePowerProducerRng(
  w: PowerAdapterWorld,
  requested: EconomyBuilding,
  pack: Pack,
): {
  pulse: boolean;
  draw: number | null;
  audio: PowerProducerAudio[];
} {
  const b = w.economy.buildings.find(
    (candidate) => candidate.id === requested.id,
  );
  if (!b) throw new Error("Power producer identity is missing");
  if (!b.complete || b.disabled || ![3, 6].includes(b.selector))
    return { pulse: false, draw: null, audio: [] };
  if (b.grade !== 0)
    throw new Error("Power producer grade animation is not admitted");
  if (b.capacitySuppressed || b.hqUpgradeSuppressed)
    throw new Error("Power producer flag branch is not admitted");
  if (b.producer?.lastFrame === w.frame)
    return {
      pulse: b.producer.lastPulse,
      draw: b.producer.lastDraw,
      audio: [],
    };
  const rules = requiredRules(pack),
    distributor = b.selector === 3;
  const profile = animationProfile(
    pack.assets[distributor ? "BPOWE" : "BSOLA"],
    b.grade + 1,
  );
  if (profile.flags !== 0 || profile.holds.length !== (distributor ? 9 : 10))
    throw new Error("Power producer animation profile is not admitted");
  const previous: PowerProducerState = b.producer
    ? structuredClone(b.producer)
    : {
        //42FA0 creates delay0 and the construction callback clamps/resets counter0;
        //43F60 resets frame0. The admitted running frame0 has hold0, eliminating
        //any preceding construction hold before this first completed update.
        animation: animationState(b.grade + 1, 0),
        audioRequested: false,
        audioRequests: [],
        lastFrame: null,
        lastPulse: false,
        lastDraw: null,
      };
  if (!b.producer && profile.holds[0] !== 0)
    throw new Error("Power producer completion animation prior is required");
  const animation = previous.animation;
  if (
    ![animation.frame, animation.hold].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 255,
    ) ||
    ![animation.delay, animation.counter].every(
      (n) => Number.isInteger(n) && n >= -128 && n <= 127,
    )
  )
    throw new Error("Invalid saved power producer animation");
  const rng = { ...w.rng },
    audio: PowerProducerAudio[] = [];
  const wrap = (n: number) => (n << 16) >> 16;
  const generated = distributor
    ? rules.economy.power.distributorGeneration[b.grade]
    : wrap(w.source.source.terrain.solarGeneration + b.grade);
  let energy = wrap(wrap(b.energy - b.extraDrain) + generated);
  if (distributor)
    energy = Math.min(energy, rules.economy.power.distributorCapacity);
  const pulse = distributor
    ? w.frame % rules.economy.power.distributorPulsePeriod ===
        rules.economy.power.distributorPulsePhase[b.grade] ||
      energy === rules.economy.power.distributorCapacity
    : energy > rules.economy.power.photonReleaseThreshold;
  //Direction comes from OLD frame before a random idle→frame1 kick.
  animation.direction = Number(animation.frame !== 0);
  if (!distributor) {
    animation.delay = 3;
    if (animation.frame === 0) {
      audio.push({ type: "stop", channel: 35 });
      previous.audioRequested = false;
    }
  }
  let draw: number | null = null;
  if (pulse) {
    draw = nextRandom(rng);
    if (distributor && draw % 7 === 0) {
      animation.frame = 1;
      previous.audioRequested = true;
      audio.push({
        type: "play",
        channel: 61,
        mode: 2,
        parameter: 0,
        volume: 127,
        range: 100,
      });
    } else if (!distributor && draw % 50 === 0 && animation.frame === 0) {
      animation.frame = 1;
      previous.audioRequested = true;
      audio.push({
        type: "play",
        channel: 35,
        mode: 2,
        parameter: 255,
        volume: 90,
        range: 400 - b.grade * 40,
      });
    }
  }
  animation.action = b.grade + 1;
  previous.animation = advanceAnimation(animation, profile);
  previous.lastFrame = w.frame;
  previous.lastPulse = pulse;
  previous.lastDraw = draw;
  previous.audioRequests = audio;
  b.producer = previous;
  w.rng = rng;
  return { pulse, draw, audio };
}
