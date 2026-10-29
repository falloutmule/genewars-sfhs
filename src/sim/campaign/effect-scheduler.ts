import { stepShieldEffect } from "../mechanics/shield-effect";
/** Source4E950 shared200-slot primary/newborn effect callback scheduler. */
import type { Pack } from "../../content/types";
import {
  stepLandingMain,
  stepLandingParticle,
  type LandingContext,
  type LandingEvent,
  type LandingState,
  type LandingParticle,
  type LandingBuildingRequest,
  createSourceParticle,
} from "../mechanics/landing";
import {
  cloneEcologyState,
  plantBlockerWeight,
  type EcologyState,
} from "../mechanics/ecology";
import {
  cloneWaterEffect,
  makeWaterEffect,
  type EffectNative,
} from "../mechanics/water";
import {
  makeDestructionEffect,
  runBlastArea,
  stepDestructionEffect,
  type DestructionRequest,
  type DestructionChildRequest,
  type DestructionAudio,
  type BlastAreaContext,
  type DestructionStep,
} from "../mechanics/destruction-effect";
import { animationProfile } from "../mechanics/animation";
import { stepBuildingEffectRecord } from "../mechanics/building-effect";
import { stepZoneEffectRecord } from "../mechanics/zones";
import {
  stepProductionEffectRecord,
  stepEffect26Record,
} from "../mechanics/production-effect";
import {
  stepRewardEffectRecord,
  makeRewardEffect,
  selectEffectSlot,
  establishedEffectPriorities,
  type RewardTarget,
  type RewardEffectUpdate,
  type RewardEvent,
  type RewardParticleRequest,
  type RewardQuery,
} from "../mechanics/reward-effect";
import {
  clonePowerEffectPool,
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
  cloneSpatial,
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  copySpatialLinks,
  validateSpatial,
} from "./spatial";
import { worldCell } from "../mechanics/terrain";
import type { SourceEntityId } from "./source-pools";
import { cloneEconomyState, type EconomyReceipt } from "../mechanics/economy";
import type { GeneticistProjectileStep } from "../mechanics/geneticist-projectile";
import {
  makePlantFireEffect,
  stepPlantFireEffectRecord,
  type PlantFireRequest,
} from "../mechanics/plant-fire";
import type { SpecialistCorpseRequest } from "../mechanics/specialist-damage";
import type { EngineerChargeUpdate } from "../mechanics/engineer-charge";
import type { SalvageEffectUpdate } from "../mechanics/salvage-effect";
import type { RecruitmentEffectUpdate } from "../mechanics/recruitment-effect";
import type { PlantCarrierUpdate } from "../mechanics/plant-carrier";
import {
  stepBotanistWorkEffectRecord,
  stepBotanistEconomyEffectRecord,
} from "../mechanics/botanist-effect";
import {
  makeSpecialistCorpseEffect,
  specialistCorpseBinding,
  stepSpecialistCorpseEffect,
} from "../mechanics/specialist-corpse";
export type EffectSchedulerWorld = PowerAdapterWorld &
  WaterAdapterWorld & {
    ecology: EcologyState;
    actors?: unknown;
    builders?: unknown;
    players?: unknown;
    notices?: unknown;
    audio?: unknown;
    missionPrefix?: number[];
    countdown?: number;
    shieldWaves?: EffectNative[];
  };
export interface EffectSchedulerOptions<
  W extends EffectSchedulerWorld = EffectSchedulerWorld,
> {
  gravity: number;
  obstacleAt: (position: [number, number]) => boolean;
  cleanupReferences: (world: W, id: SourceEntityId) => number | void;
  /** Representation-specific complete copy of these optional host roots.
   * Generic hosts retain the structuredClone default. */
  cloneHostRoots?: (
    world: W,
  ) => Pick<
    EffectSchedulerWorld,
    "actors" | "builders" | "players" | "notices" | "audio"
  >;
  onLandingEvent?: (
    world: W,
    landing: LandingState,
    event: LandingEvent,
    context: LandingContext,
  ) => void;
  landingBuilding?: (world: W, request: LandingBuildingRequest) => void;
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
  /** Real current native target views, traversal and recursive damage ports. */
  blastArea?: (
    world: W,
    native: readonly (number | null)[],
    request: DestructionRequest,
  ) => BlastAreaContext;
  destructionObstacle?: (
    world: W,
    position: [number, number],
    height: number,
  ) => { position: [number, number]; ground: number } | null;
  onDestructionEvent?: (
    world: W,
    slot: number,
    event: DestructionAudio,
  ) => void;
  /** Actual20/41/42/43 callback, including inline factories and host ports.
   * It receives staged state; the scheduler publishes its numeric afterimage. */
  geneticistEffect?: (
    world: W,
    slot: number,
    receipt: EffectSchedulerReceipt,
  ) => GeneticistProjectileStep;
  /** Concrete37..40 callback with real inline blast0..3 and water children. */
  shepherdEffect?: (
    world: W,
    slot: number,
    receipt: EffectSchedulerReceipt,
  ) => GeneticistProjectileStep;
  /** Concrete25/0x19 callback, including real explosion5 and water factories. */
  etherealAttackEffect?: (
    world: W,
    slot: number,
    receipt: EffectSchedulerReceipt,
  ) => GeneticistProjectileStep;
  /** Actual planted50/0x32 and trigger51/0x33 or cancel10/0x0A feedback. */
  engineerChargeEffect?: (
    world: W,
    slot: number,
    receipt: EffectSchedulerReceipt,
  ) => EngineerChargeUpdate;
  /** Actual demolition salvage45/0x2D owner9, including common physics. */
  salvageEffect?: (world: W, slot: number, receipt: EffectSchedulerReceipt) => SalvageEffectUpdate;
  /** Actual64/0x40 mode6 marker and generic51/0x33 feedback. */
  recruitmentEffect?: (world: W, slot: number, receipt: EffectSchedulerReceipt) => RecruitmentEffectUpdate;
  /**Actual67 carried plant and68 retained-resource release/drop callbacks. */
  plantCarrierEffect?: (world: W, slot: number, receipt: EffectSchedulerReceipt) => PlantCarrierUpdate;
  /**Actual36/0x24 Pulper material, including full common motion and mode6. */
  buildingMaterialEffect?: (world: W, slot: number, receipt: EffectSchedulerReceipt) => DestructionStep;
}
export interface EffectSchedulerReceipt {
  callbacks: { phase: "primary" | "newborn"; slot: number; code: number }[];
  landingEvents: { slot: number; event: LandingEvent }[];
  water: WaterAdapterReceipt[];
  power: EconomyReceipt[];
  rewards: { slot: number; update: RewardEffectUpdate }[];
  geneticist: { slot: number; update: GeneticistProjectileStep }[];
  attacks?: { slot: number; update: GeneticistProjectileStep }[];
  shepherd?: { slot: number; update: GeneticistProjectileStep }[];
  engineerCharges?: { slot: number; update: EngineerChargeUpdate }[];
  salvage?: { slot: number; update: SalvageEffectUpdate }[];
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
  const host =
    options.cloneHostRoots?.(w) ??
    structuredClone({
      actors: w.actors,
      builders: w.builders,
      players: w.players,
      notices: w.notices,
      audio: w.audio,
    });
  const s = {
    ...w,
    ...host,
    ...(w.shieldWaves ? { shieldWaves: w.shieldWaves.map(n => n.slice()) } : {}),
    terrain: { bytes: w.terrain.bytes.slice(), revision: w.terrain.revision },
    spatial: cloneSpatial(w.spatial),
    powerEffects: clonePowerEffectPool(w.powerEffects),
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
    economy: cloneEconomyState(w.economy),
    rng: { ...w.rng },
    ...(w.missionPrefix ? { missionPrefix: w.missionPrefix.slice() } : {}),
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
    "missionPrefix",
    "countdown",
  ] as const)
    if (key in s) (w as Record<string, unknown>)[key] = s[key];
  if (s.shieldWaves) w.shieldWaves = s.shieldWaves;
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
      (p.occupied && p.nativePrior[69] !== 66) !== !!w.spatial.nodes[id(slot)] ||
      p.occupied !== (p.nativePrior[6] !== 0)
    )
      throw new Error("Shared source effect occupancy is inconsistent");
    if (p.occupied && p.nativePrior[6] !== 5)
      throw new Error("Shared effect source kind is invalid");
  }
  validateSpatial(w.spatial);
}
function links(w: EffectSchedulerWorld) {
  let occupied = 0;
  for (const [slot, p] of w.powerEffects.slots.entries()) {
    if (p.occupied) occupied++;
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
  //8AC60/8ACC0 also change adjacent plant/creature headers immediately.
  //Later callbacks in this same shared pass can read these retained records.
  for (const plant of w.ecology.plants) copySpatialLinks(w.spatial,plant.id,plant.native);
  for (const mule of w.ecology.mules) copySpatialLinks(w.spatial,mule.id,mule.native);
  if (w.missionPrefix) putEffectWord(w.missionPrefix, 0x3554, occupied);
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
    playerActorCount(owner) {
      const raw = (w.players as {raw: number[]}[] | undefined)?.[owner]?.raw,
        count = raw?.[3];
      if (count === undefined || !Number.isInteger(count)) throw Error("Actual landing player byte3 required");
      return (count << 24) >> 24;
    },
    building: options.landingBuilding ? (request) => options.landingBuilding!(w, request) : undefined,
    obstacle: options.destructionObstacle
      ? (point, height) => options.destructionObstacle!(w, point, height)
      : undefined,
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
  const held = w.powerEffects.slots[slot].nativePrior;
  if (held) held.splice(0, held.length, ...native);
  else w.powerEffects.slots[slot].nativePrior = native.slice();
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
  else if (native[69] !== 66) throw new Error("Retiring source effect is not spatially bound");
  // Numeric callback supplies final bytes. Restore kind only across724C0 so
  // matching self-references participate before the final native kind clear.
  native[6] = 5;
  publish(w, slot, native);
  out.cleanedReferenceBytes += options.cleanupReferences(w, id(slot)) ?? 0;
  native[6] = 0;
  const shared = w.powerEffects.slots[slot];
  if (shared.packet)
    w.economy.packets = w.economy.packets.filter(
      (p) => p.id !== shared.packet!.id,
    );
  if (shared.nativePrior) shared.nativePrior[6] = 0;
  shared.occupied = false;
  shared.packet = null;
  if (w.missionPrefix)
    putEffectWord(
      w.missionPrefix,
      0x3554,
      w.powerEffects.slots.filter((e) => e.occupied).length,
    );
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
  for (const l of w.landings) {
    if (l.slot === slot && l.phase !== 4) {
      l.phase = 4;
      l.native = w.powerEffects.slots[slot].nativePrior!.slice();
    }
    l.particles = l.particles.filter((p) => p.slot !== slot);
  }
  for (const e of w.waterEffects)
    if (e.slot === slot && e.active) {
      e.active = false;
      e.native = w.powerEffects.slots[slot].nativePrior!.slice();
    }
}
function emptyReceipt(): EffectSchedulerReceipt {
  return {
    callbacks: [],
    landingEvents: [],
    water: [],
    power: [],
    rewards: [],
    geneticist: [],
    createdNewborns: 0,
    retired: [],
    cleanedReferenceBytes: 0,
    queueCandidates: [],
  };
}
function effectPriority(pack: Pack, code: number): number | undefined {
  return (
    pack.effectRules?.descriptors[code]?.priority ??
    establishedEffectPriorities[code]
  );
}
function requireSharedSlot(w: EffectSchedulerWorld, slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 200)
    throw Error("Source shared effect slot is invalid");
  const shared = w.powerEffects.slots[slot];
  if (!shared?.nativePrior)
    throw Error("Source shared effect numeric prior is required");
  validateEffectNativePrior(shared.nativePrior);
  if (
    (shared.occupied && shared.nativePrior[69] !== 66) !== !!w.spatial.nodes[id(slot)] ||
    shared.occupied !== (shared.nativePrior[6] === 5) ||
    (!shared.occupied && shared.nativePrior[6] !== 0)
  )
    throw Error("Source shared effect occupancy is inconsistent");
  return shared;
}
/** Already-staged48790 allocation. No reservation or factory RNG is added:
 * callers must construct/publish immediately before another allocation. */
export function allocateStagedSharedEffect<W extends EffectSchedulerWorld>(
  w: W,
  code: number,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
  out: EffectSchedulerReceipt = emptyReceipt(),
): number | null {
  if (
    !Number.isInteger(code) ||
    code < 0 ||
    code > 255 ||
    effectPriority(pack, code) === undefined
  )
    throw Error("Original requested shared effect descriptor is required");
  const allocation = selectEffectSlot(w.powerEffects, code, (selector) =>
    effectPriority(pack, selector),
  );
  if (!allocation) return null;
  requireSharedSlot(w, allocation.slot);
  if (allocation.replace)
    retireStagedSharedEffect(w, allocation.slot, options, out);
  return allocation.slot;
}
/** Publishes a real factory/callback image, then rebinds logical spatial links.
 * It does not run a constructor, set newborn flags, register AI or draw RNG. */
export function publishStagedSharedEffect(
  w: EffectSchedulerWorld,
  slot: number,
  native: readonly (number | null)[],
): void {
  const shared = requireSharedSlot(w, slot);
  validateEffectNativePrior(native);
  const word = (at: number) => {
    if (native[at] === null || native[at + 1] === null)
      throw Error("Source shared effect identity/position is unknown");
    return ((native[at]! | (native[at + 1]! << 8)) << 16) >> 16;
  };
  if (native[6] !== 5 || word(15) !== slot || native[69] === null)
    throw Error("Source shared effect publication has invalid identity");
  const cell = worldCell(word(7), word(9));
  publish(w, slot, native.slice());
  shared.occupied = true;
  if (native[69] === 66) {
    if (w.spatial.nodes[id(slot)]) throw Error("Shield66 must not have a spatial node");
  } else moveSpatial(w.spatial, w.terrain, id(slot), cell);
  links(w);
}
/**49D30 over the current published carrier. Callback callers must publish
 * their final kind5 image first; cleanup therefore sees the real afterimage. */
export function retireStagedSharedEffect<W extends EffectSchedulerWorld>(
  w: W,
  slot: number,
  options: EffectSchedulerOptions<W>,
  out: EffectSchedulerReceipt = emptyReceipt(),
): void {
  const shared = requireSharedSlot(w, slot);
  if (!shared.occupied)
    throw Error("Retiring source shared effect is inactive");
  retire(w, slot, shared.nativePrior!, out, options);
  removeReplacedHost(w, slot);
  links(w);
}
/** Already-staged6C6B0 fire8 factory. The plant state is committed by its
 * caller before this attempt; shared capacity failure leaves that state. */
export function createStagedPlantFireEffect<W extends EffectSchedulerWorld>(
  w: W,
  request: PlantFireRequest,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
  out: EffectSchedulerReceipt = emptyReceipt(),
): number | null {
  if (
    request.code !== 8 ||
    request.owner !== 0 ||
    request.parameter !== 0 ||
    request.delay !== 0 ||
    request.newborn !== false ||
    request.angles.length !== 3 ||
    request.angles.some((value) => value !== 0)
  )
    throw Error("Original plant fire request is invalid");
  const slot = allocateStagedSharedEffect(w, 8, pack, options, out);
  if (slot === null) return null;
  const native = makePlantFireEffect(
    w.powerEffects.slots[slot].nativePrior!,
    { slot, position: request.position, height: request.height },
    w.terrain,
    animationProfile(pack.assets.EFF, 8),
  );
  publishStagedSharedEffect(w, slot, native);
  return slot;
}
/** Successful57FD8 state4 corpse factory. Full capacity returns null before
 * resource access; the caller still owns specialist death/count/retirement. */
export function createStagedSpecialistCorpseEffect<
  W extends EffectSchedulerWorld,
>(
  w: W,
  request: SpecialistCorpseRequest,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
  out: EffectSchedulerReceipt = emptyReceipt(),
): number | null {
  const slot = allocateStagedSharedEffect(w, 69, pack, options, out);
  if (slot === null) return null;
  if (!pack.rules || !pack.assets[request.assetKey])
    throw Error("Original specialist corpse resource/rules are required");
  const native = makeSpecialistCorpseEffect(
    w.powerEffects.slots[slot].nativePrior!,
    { ...request, slot },
    w.terrain,
    pack.rules.tables,
    animationProfile(pack.assets[request.assetKey], 9),
  );
  const binding = specialistCorpseBinding(native, pack.rules.tables);
  if (binding.assetKey !== request.assetKey)
    throw Error("Original specialist corpse packed/resource binding differs");
  publishStagedSharedEffect(w, slot, native);
  return slot;
}
/** Runs on an already staged world. Shared allocation occurs before every
 * factory's RNG, and real recursive area damage completes before returning. */
function destructionFactory<W extends EffectSchedulerWorld>(
  w: W,
  request: DestructionChildRequest,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
  out: EffectSchedulerReceipt,
): number | null {
  if (!pack.rules)
    throw Error("Original destruction motion rules are required");
  const allocation = selectEffectSlot(w.powerEffects, request.code, (code) =>
    effectPriority(pack, code),
  );
  if (!allocation) return null;
  const slot = allocation.slot;
  if (allocation.replace) {
    retire(w, slot, w.powerEffects.slots[slot].nativePrior!, out, options);
    removeReplacedHost(w, slot);
  }
  if (request.code === 6) {
    const p = createSourceParticle(
      { ...request, code: 6, newborn: !!request.newborn },
      w.rng,
      landingContext(w, pack, options),
    );
    if (!p?.native || p.slot !== slot)
      throw Error("Source destruction smoke allocation differs");
    w.landings[0]?.particles.push(p);
    w.powerEffects.slots[slot].occupied = true;
    publish(w, slot, p.native);
    insertSpatial(w.spatial, w.terrain, id(slot), worldCell(p.x, p.y));
    links(w);
    return slot;
  }
  if (request.code === 21 || request.code === 48) {
    const water = makeWaterEffect(
      slot,
      { ...request, code: request.code },
      w.powerEffects.slots[slot].nativePrior!,
      {
        terrain: w.terrain,
        tables: pack.rules.tables,
        bounce: pack.rules.tables.bounce,
        rawWaterHeight: w.source.source.terrain.rawWaterHeight,
        profile: (code) => animationProfile(pack.assets.EFF, code),
        obstacleAt: options.obstacleAt,
      },
    );
    if (request.newborn) {
      water.flags |= 1;
      water.native[21] = water.flags & 255;
    }
    const old = w.waterEffects.findIndex((e) => e.slot === slot);
    if (old < 0) w.waterEffects.push(water);
    else w.waterEffects[old] = water;
    w.powerEffects.slots[slot].occupied = true;
    publish(w, slot, water.native);
    insertSpatial(w.spatial, w.terrain, id(slot), worldCell(water.x, water.y));
    links(w);
    return slot;
  }
  const concrete: DestructionRequest = { ...request, code: request.code };
  const r = makeDestructionEffect(
    w.powerEffects.slots[slot].nativePrior!,
    { ...concrete, slot },
    w.terrain,
    w.rng,
    pack.rules.tables,
    animationProfile(pack.assets.EFF, request.code),
  );
  w.powerEffects.slots[slot].occupied = true;
  publish(w, slot, r.native);
  insertSpatial(w.spatial, w.terrain, id(slot), worldCell(...request.position));
  links(w);
  for (const e of r.events) options.onDestructionEvent?.(w, slot, e);
  if (r.areaRequired) {
    if (!options.blastArea)
      throw Error("Original destruction blast area services are required");
    const area = options.blastArea(
      w,
      w.powerEffects.slots[slot].nativePrior!,
      concrete,
    );
    runBlastArea(
      w.powerEffects.slots[slot].nativePrior!,
      request.parameter,
      request.instigator ?? null,
      w.rng,
      { ...area, currentRng: () => w.rng },
    );
    links(w);
  }
  return slot;
}
/** Use only inside an existing complete host transaction, including recursive
 * virtual damage. The outer caller owns rollback and final validation. */
export function createStagedDestructionEffect<W extends EffectSchedulerWorld>(
  w: W,
  request: DestructionRequest,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
): number | null {
  return destructionFactory(w, request, pack, options, emptyReceipt());
}
/**Already-staged code6 entry for the source carried-target ground scrape.
 * Reuses the complete shared allocation/particle factory above. */
export function createStagedSmokeEffect<W extends EffectSchedulerWorld>(
  w: W,
  request: Omit<DestructionChildRequest,"code"> & {code:6},
  pack: Pack,
  options: EffectSchedulerOptions<W>,
): number | null {
  if (request.code !== 6) throw Error("Source smoke6 factory required");
  return destructionFactory(w,request,pack,options,emptyReceipt());
}
export function createCampaignDestructionEffect<W extends EffectSchedulerWorld>(
  w: W,
  request: DestructionRequest,
  pack: Pack,
  options: EffectSchedulerOptions<W>,
): number | null {
  const s = cloneEffectHost(w, options);
  validate(s);
  const result = destructionFactory(s, request, pack, options, emptyReceipt());
  if (result === null) return null;
  validate(s);
  commitEffectHost(w, s, options);
  return result;
}
function projectedParticle(n: EffectNative): LandingParticle {
  validateEffectNativePrior(n);
  const word = (p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16,
    dword = (p: number) => (word(p) & 65535) | (word(p + 2) << 16);
  if (n[6] !== 5 || n[69] !== 6)
    throw Error("Source native smoke projection needs selector6");
  return {
    native: n.slice(),
    slot: word(15),
    code: 6,
    x: word(7),
    y: word(9),
    fractionX: n[67]!,
    fractionY: n[68]!,
    height: dword(39),
    ground: dword(17),
    vx: word(45),
    vy: word(47),
    vz: word(49),
    accelerationZ: word(55),
    animation: {
      action: n[25]!,
      hold: n[26]!,
      frame: n[27]!,
      direction: (n[28]! << 24) >> 24,
      delay: (n[29]! << 24) >> 24,
      counter: (n[30]! << 24) >> 24,
    },
  };
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
  const allocation = selectEffectSlot(s.powerEffects, 59, (code) =>
    effectPriority(pack, code),
  );
  if (!allocation) return null;
  const out: EffectSchedulerReceipt = {
    callbacks: [],
    landingEvents: [],
    water: [],
    power: [],
    rewards: [],
    geneticist: [],
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
      geneticist: [],
      createdNewborns: 0,
      retired: [],
      cleanedReferenceBytes: 0,
      queueCandidates: [],
    };
  validate(s);
  const rewardParticle = (request: RewardParticleRequest): boolean => {
    const allocation = selectEffectSlot(s.powerEffects, request.code, (code) =>
      effectPriority(pack, code),
    );
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
    s.landings[0]?.particles.push(p);
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
        c = landingContext(s, pack, options);
      const publishedParticles = new Set<LandingParticle>();
      c.particleFactory = (request, rng, current) => {
        publishStagedSharedEffect(s, slot, current.native!);
        const heldPriors = s.powerEffects.slots.map((p) => p.nativePrior!),
          childSlot = allocateStagedSharedEffect(s, request.code, pack, options, out);
        if (childSlot === null) return null;
        if (childSlot === slot) throw Error("Landing particle replaced its executing parent");
        const child = createSourceParticle(request, rng, landingContext(s, pack, options));
        if (!child?.native || child.slot !== childSlot)
          throw Error("Source landing particle allocation differs");
        publishStagedSharedEffect(s, childSlot, child.native);
        heldPriors[childSlot].splice(0, 81, ...s.powerEffects.slots[childSlot].nativePrior!);
        s.powerEffects.slots[childSlot].nativePrior = child.native = heldPriors[childSlot];
        current.native!.splice(0, 81, ...s.powerEffects.slots[slot].nativePrior!);
        publishedParticles.add(child);
        return child;
      };
      if (options.onLandingEvent) c.onEvent = (current, event) => {
        publish(s, slot, current.native!);
        links(s);
        options.onLandingEvent!(s, current, event, c);
      };
      const events = stepLandingMain(landing, s.rng, c);
      const current = landing.native.slice();
      current[6] = 5;
      publish(s, slot, current);
      for (const p of landing.particles)
        if (publishedParticles.has(p)) {
          if (!p.native || !(p.native[21]! & 1) ||
            !s.powerEffects.slots[p.slot].occupied)
            throw Error("Source landing newborn publication differs");
          created++;
        } else if (!existing.has(p.slot)) {
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
      }
      if (landing.phase === 4) retire(s, slot, landing.native, out, options);
      else publish(s, slot, landing.native);
    } else if (code === 69) {
      if (!pack.rules)
        throw Error("Original specialist corpse resource/rules are required");
      const binding = specialistCorpseBinding(n, pack.rules.tables);
      if (!pack.assets[binding.assetKey])
        throw Error("Original specialist corpse actor resource is missing");
      const result = stepSpecialistCorpseEffect(n, s.terrain, {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        tables: pack.rules.tables,
        bounce: pack.rules.tables.bounce,
        profile: animationProfile(pack.assets[binding.assetKey], 9),
        obstacle: options.destructionObstacle
          ? (point, height) => options.destructionObstacle!(s, point, height)
          : undefined,
        child(request, parentNative) {
          publishStagedSharedEffect(s, slot, parentNative);
          parentNative.splice(
            0,
            81,
            ...s.powerEffects.slots[slot].nativePrior!,
          );
          const child = destructionFactory(s, request, pack, options, out);
          parentNative.splice(
            0,
            81,
            ...s.powerEffects.slots[slot].nativePrior!,
          );
          return child !== null;
        },
      });
      publishStagedSharedEffect(s, slot, result.native);
      if (result.retirementRequired)
        retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 7 || code === 60 || code === 61) {
      const c = {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        profile: animationProfile(pack.assets.EFF, code),
        obstacleAt: options.obstacleAt,
      };
      const result =
        code === 7
          ? stepBotanistWorkEffectRecord(n, s.terrain, c)
          : stepBotanistEconomyEffectRecord(n, s.terrain, c, code);
      publishStagedSharedEffect(s, slot, result.native);
      if (result.retirementRequired)
        retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 8) {
      const result = stepPlantFireEffectRecord(n, s.terrain, {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        profile: animationProfile(pack.assets.EFF, 8),
        obstacleAt: (point) => options.obstacleAt(point),
      });
      publishStagedSharedEffect(s, slot, result.native);
      if (result.retirementRequired)
        retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 64 || (code === 51 && options.recruitmentEffect)) {
      if (!options.recruitmentEffect) throw Error("Original recruitment64 callback service is required");
      const result = options.recruitmentEffect(s, slot, out);
      if (!result || typeof result.retirementRequired !== "boolean" ||
        !Number.isInteger(result.newborns) || result.newborns < 0 || result.newborns > 1)
        throw Error("Original recruitment callback receipt is invalid");
      publishStagedSharedEffect(s, slot, result.native);
      created = result.newborns;
      if (result.retirementRequired) retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 36) {
      if (!options.buildingMaterialEffect) throw Error("Original building material36 callback service is required");
      const result = options.buildingMaterialEffect(s, slot, out);
      if (!result || typeof result.retirementRequired !== "boolean" || !Number.isInteger(result.newborns) || result.newborns < 0)
        throw Error("Original building material36 callback receipt is invalid");
      publishStagedSharedEffect(s, slot, result.native);
      created = result.newborns;
      if (result.retirementRequired) retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 67 || code === 68) {
      if (!options.plantCarrierEffect) throw Error("Original plant carrier67/68 callback service is required");
      const result = options.plantCarrierEffect(s, slot, out);
      if (!result || typeof result.retirementRequired !== "boolean" || !Number.isInteger(result.newborns) || result.newborns < 0)
        throw Error("Original plant carrier67/68 callback receipt is invalid");
      publishStagedSharedEffect(s, slot, result.native);
      created = result.newborns;
      if (result.retirementRequired) retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 45) {
      if (!options.salvageEffect) throw Error("Original salvage45 callback service is required");
      const result = options.salvageEffect(s, slot, out);
      if (!result || typeof result.retirementRequired !== "boolean" || result.newborns !== 0)
        throw Error("Original salvage45 callback receipt is invalid");
      publishStagedSharedEffect(s, slot, result.native);
      (out.salvage ??= []).push({slot, update: result});
      if (result.retirementRequired) retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 50 || code === 10 || code === 51) {
      if (!options.engineerChargeEffect)
        throw Error(
          "Original Engineer charge/feedback callback service is required",
        );
      const result = options.engineerChargeEffect(s, slot, out);
      if (
        !result ||
        typeof result.retirementRequired !== "boolean" ||
        !Number.isInteger(result.newborns) ||
        result.newborns < 0 ||
        result.newborns > 1
      )
        throw Error("Original Engineer charge callback receipt is invalid");
      publishStagedSharedEffect(s, slot, result.native);
      (out.engineerCharges ??= []).push({ slot, update: result });
      created = result.newborns;
      if (result.retirementRequired)
        retireStagedSharedEffect(s, slot, options, out);
    } else if (code === 25 || [20, 37, 38, 39, 40, 41, 42, 43].includes(code)) {
      const provider =
        code === 25
          ? options.etherealAttackEffect
          : code >= 37 && code <= 40
            ? options.shepherdEffect
            : options.geneticistEffect;
      if (!provider)
        throw Error(
          code === 25
            ? "Original Ethereal attack callback service is required"
            : code >= 37 && code <= 40
              ? "Original Shepherd effect callback service is required"
              : "Original Geneticist effect callback service is required",
        );
      const result = provider(s, slot, out);
      if (
        !result ||
        typeof result.retirementRequired !== "boolean" ||
        !Number.isInteger(result.newborns) ||
        result.newborns < 0 ||
        result.newborns > 255 ||
        !Array.isArray(result.events) ||
        !Array.isArray(result.samples) ||
        (result.query !== null && typeof result.query !== "object")
      )
        throw Error("Original Geneticist effect callback receipt is invalid");
      publishStagedSharedEffect(s, slot, result.native);
      if (code === 25) (out.attacks ??= []).push({ slot, update: result });
      else if (code >= 37 && code <= 40)
        (out.shepherd ??= []).push({ slot, update: result });
      else out.geneticist.push({ slot, update: result });
      created = result.newborns;
      if (result.retirementRequired)
        retireStagedSharedEffect(s, slot, options, out);
    } else if ([0, 1, 2, 3, 5, 14, 27, 28, 29, 30, 31, 46].includes(code)) {
      if (!pack.ecologyRules)
        throw Error("Original destruction ecology motion tables are required");
      const result = stepDestructionEffect(n, s.rng, {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        terrain: s.terrain,
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        friction: pack.ecologyRules.corpseFriction ?? [],
        profile: (selector) => animationProfile(pack.assets.EFF, selector),
        obstacle: options.destructionObstacle
          ? (p, h) => options.destructionObstacle!(s, p, h)
          : undefined,
        particle(request, _rng, parentNative) {
          publish(s, slot, parentNative);
          moveSpatial(
            s.spatial,
            s.terrain,
            id(slot),
            worldCell(
              ((parentNative[7]! | (parentNative[8]! << 8)) << 16) >> 16,
              ((parentNative[9]! | (parentNative[10]! << 8)) << 16) >> 16,
            ),
          );
          links(s);
          parentNative.splice(
            0,
            81,
            ...s.powerEffects.slots[slot].nativePrior!,
          );
          const child = destructionFactory(s, request, pack, options, out);
          parentNative.splice(
            0,
            81,
            ...s.powerEffects.slots[slot].nativePrior!,
          );
          return child !== null;
        },
      });
      moveSpatial(
        s.spatial,
        s.terrain,
        id(slot),
        worldCell(
          ((result.native[7]! | (result.native[8]! << 8)) << 16) >> 16,
          ((result.native[9]! | (result.native[10]! << 8)) << 16) >> 16,
        ),
      );
      publish(s, slot, result.native);
      created = result.newborns;
      if (result.retirementRequired)
        retire(s, slot, result.native, out, options);
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
      if (!particle && code === 6) particle = projectedParticle(n);
      if (!particle || particle.code !== code || !particle.native)
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
        if (host) host.particles = host.particles.filter((p) => p !== particle);
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
    } else if (code === 9 || code === 65 || code === 66) {
      const result = stepShieldEffect(n, s.rng, {
        frame: s.frame, gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        terrain: s.terrain, tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        friction: pack.ecologyRules?.corpseFriction ?? [],
        profile: animationProfile(pack.assets.EFF, code),
        waves: s.shieldWaves ?? [],
        particle: () => { throw Error("Unexpected shield effect water child"); },
        obstacle: options.destructionObstacle
          ? (point, height) => options.destructionObstacle!(s, point, height)
          : undefined,
      });
      publishStagedSharedEffect(s, slot, result.native);
      if (result.retirementRequired) retireStagedSharedEffect(s, slot, options, out);
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
      const result = stepBuildingEffectRecord(n, s.rng, {
        frame: s.frame,
        gravity: options.gravity,
        water: s.source.source.terrain.loadedPhysicalWaterHeight,
        terrain: s.terrain,
        tables: pack.rules!.tables,
        bounce: pack.rules!.tables.bounce,
        friction: pack.ecologyRules?.corpseFriction ?? [],
        profile: animationProfile(pack.assets.EFF, 44),
        obstacle: options.destructionObstacle
          ? (point, height) => options.destructionObstacle!(s, point, height)
          : undefined,
        particle: () => {
          throw Error("Unexpected building44 child factory");
        },
      });
      publishStagedSharedEffect(s, slot, result.native);
      if (result.retirementRequired)
        retireStagedSharedEffect(s, slot, options, out);
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
