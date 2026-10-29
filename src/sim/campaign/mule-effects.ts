/**48790 code32 emission after Mule corpse consumption. The gameplay callback
 * already consumed its three parameter draws; this factory draws no RNG. */
import type { Pack } from "../../content/types";
import type { MuleEvent } from "../mechanics/mule";
import type {
  EffectNativePrior,
  PowerEffectPool,
} from "../mechanics/power-motion";
import {
  effectFactoryPrior,
  effectPriorByte,
  effectTerrainShade,
  putEffectWord,
  validateEffectNativePrior,
} from "../mechanics/power-motion";
import { animationProfile } from "../mechanics/animation";
import { createMotion, velocity } from "../mechanics/motion";
import {
  groundHeight,
  worldCell,
  type TerrainState,
} from "../mechanics/terrain";
import { selectEffectSlot } from "../mechanics/reward-effect";
import type { SourceEntityId } from "./source-pools";
import type { SpatialState } from "./spatial";
import {
  copySpatialLinks,
  insertSpatial,
  unlinkSpatial,
  validateSpatial,
} from "./spatial";
import type { CleanupWorld } from "./cleanup";
import type { LandingState } from "../mechanics/landing";
import type { WaterEffect } from "../mechanics/water";
import type { EconomyState } from "../mechanics/economy";
import { put16, u16 } from "./bytes";
type Native = EffectNativePrior;
export interface MuleEffectRequest {
  code: 32;
  position: [number, number];
  height: number;
  angles: [number, number, number];
}
export interface MuleEffectWorld extends CleanupWorld {
  powerEffects: PowerEffectPool;
  spatial: SpatialState;
  terrain: TerrainState;
  landings?: LandingState[];
  waterEffects?: WaterEffect[];
  economy?: EconomyState;
  /** Actual runtime source counter image, if the host owns one. */
  missionPrefix?: number[];
  creatureNative?: Native[];
}
export interface MuleEffectOptions<W extends MuleEffectWorld> {
  /** Runs on the complete staged host after unlink and before kind clear. */
  cleanupReferences(world: W, id: SourceEntityId): number | void;
  /** Admitted104EB6 priority for live selectors outside the established set. */
  priority?(selector: number): number | undefined;
  /** Source49D30 special17/landing49 status1/2 continuation, if encountered. */
  onSpecialRetirement?(world: W, slot: number, native: Native): void;
}
export interface MuleEffectReceipt {
  created: { slot: number; code: 32; native: Native }[];
  failedFactories: 32[];
  retired: {
    id: SourceEntityId;
    slot: number;
    code: number;
    cleanupTarget: { index: number; kind: 5 };
    countDelta: -1;
    displayPhase: 12;
    moduleCleanup: true;
  }[];
  cleanedReferenceBytes: number;
  countDelta: number;
}
const id = (slot: number): SourceEntityId => `source:4:${slot}`;
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
export function createMuleConsumptionEffect(
  prior: readonly (number | null)[],
  slot: number,
  request: MuleEffectRequest,
  terrain: TerrainState,
  pack: Pack,
): Native {
  validateEffectNativePrior(prior);
  if (
    prior[6] !== 0 ||
    !integer(slot, 0, 199) ||
    request.code !== 32 ||
    request.position.some((v) => !integer(v, -32768, 32767)) ||
    !integer(request.height, -0x80000000, 0x7fffffff) ||
    request.angles.some((v, i) => !integer(v, 0, i === 2 ? 32767 : 2047))
  )
    throw new Error("Invalid original Mule consumption effect request");
  if (!pack.rules || !pack.assets.EFF)
    throw new Error("Original Mule effect motion/EFF profile is required");
  const profile = animationProfile(pack.assets.EFF, 32);
  if (
    profile.flags !== 0 ||
    profile.holds.length !== 10 ||
    profile.holds.some((v) => v !== 0)
  )
    throw new Error("Original selector32 ten zero-hold frames required");
  effectPriorByte(prior, 67);
  effectPriorByte(prior, 68);
  const [yaw, pitch, speed] = request.angles,
    motion = createMotion(0, 0, 0, 0);
  motion.yaw = yaw;
  motion.pitch = pitch;
  motion.speed = speed;
  velocity(motion, pack.rules.tables);
  const native = effectFactoryPrior(prior, {
    slot,
    code: 32,
    owner: 0,
    x: request.position[0],
    y: request.position[1],
    ground: groundHeight(terrain, ...request.position),
    height: request.height,
    shade: effectTerrainShade(terrain, ...request.position),
    vx: motion.vx,
    vy: motion.vy,
    vz: motion.vz,
    accelerationZ: 0,
    yaw,
    pitch,
    speed,
    delay: 0,
  });
  putEffectWord(native, 21, 0);
  native[73] = 0;
  return native;
}
function validate(w: MuleEffectWorld): void {
  if (w.powerEffects.slots.length !== 200)
    throw new Error("Original Mule effect pool requires200slots");
  for (const [slot, p] of w.powerEffects.slots.entries()) {
    if (!p.nativePrior)
      throw new Error("Actual shared effect native prior is required");
    validateEffectNativePrior(p.nativePrior);
    if (
      p.nativePrior[6] === null ||
      p.occupied !== (p.nativePrior[6] !== 0) ||
      (p.occupied && p.nativePrior[69] !== 66) !== !!w.spatial.nodes[id(slot)] ||
      (p.occupied && p.nativePrior[6] !== 5)
    )
      throw new Error(
        "Mule effect pool occupancy differs from actual native/spatial state",
      );
  }
  if (
    w.missionPrefix &&
    u16(w.missionPrefix, 0x3554) !==
      w.powerEffects.slots.filter((s) => s.occupied).length
  )
    throw new Error(
      "Mule effect source counter differs from actual shared occupancy",
    );
  validateSpatial(w.spatial);
}
function synchronizeLinks(w: MuleEffectWorld): void {
  const update = (identity: SourceEntityId, native: Native) =>
    copySpatialLinks(w.spatial, identity, native);
  for (const [slot, p] of w.powerEffects.slots.entries())
    if (p.occupied) update(id(slot), p.nativePrior!);
  for (const m of w.ecology.mules)
    if (m.native[6] !== 0)
      update(
        `source:0:${effectPriorByte(m.native, 15) | (effectPriorByte(m.native, 16) << 8)}`,
        m.native,
      );
  for (const e of w.source.entities)
    if (e.nativeBytes[6] !== 0 && (e.family !== 6 || !w.collectors))
      update(`source:${e.family}:${e.index}`, e.nativeBytes);
  for (const [slot, n] of (w.collectors?.records ?? []).entries())
    if (n[6] !== 0) update(`source:6:${slot}`, n);
  for (const [slot, n] of (w.buildingNative ?? []).entries())
    if (n[6] !== 0) update(`source:3:${slot}`, n);
  for (const [slot, n] of (w.specialists?.records ?? []).entries())
    if (n[6] !== 0 && w.spatial.nodes[`source:2:${slot}`])
      update(`source:2:${slot}`, n);
  for (const [slot, n] of (w.creatureNative ?? []).entries())
    if (n[6] !== 0) update(`source:0:${slot}`, n);
  for (const e of w.ethereals?.records ?? [])
    if (e.native[6] !== 0)
      update(
        `source:7:${effectPriorByte(e.native, 15) | (effectPriorByte(e.native, 16) << 8)}`,
        e.native,
      );
  for (const l of w.landings ?? []) {
    if (l.native && l.phase !== 4)
      l.native = w.powerEffects.slots[l.slot].nativePrior!.slice();
    for (const p of l.particles)
      if (p.native)
        p.native = w.powerEffects.slots[p.slot].nativePrior!.slice();
  }
  for (const e of w.waterEffects ?? [])
    if (e.active) e.native = w.powerEffects.slots[e.slot].nativePrior!.slice();
}
/** Complete event batch commits atomically, including priority cleanup and
 * all supplied serializable host fields. No synthetic inactive record exists. */
export function consumeMuleEffects<W extends MuleEffectWorld>(
  w: W,
  events: readonly MuleEvent[],
  pack: Pack,
  options: MuleEffectOptions<W>,
): MuleEffectReceipt {
  if (!events.some((e) => e.kind === "mule-effect"))
    return consumeStagedMuleEffects(w, events, pack, options);
  const staged = structuredClone(w),
    out = consumeStagedMuleEffects(staged, events, pack, options);
  Object.assign(w, staged);
  return out;
}
/** Same ordered source factories inside an enclosing host transaction. This
 * port preserves caller-held actor/player/creature arrays across blood
 * emission. Its caller owns rollback if a later callback or factory fails. */
export function consumeStagedMuleEffects<W extends MuleEffectWorld>(
  w: W,
  events: readonly MuleEvent[],
  pack: Pack,
  options: MuleEffectOptions<W>,
): MuleEffectReceipt {
  const requests = events.filter((e) => e.kind === "mule-effect");
  const out: MuleEffectReceipt = {
    created: [],
    failedFactories: [],
    retired: [],
    cleanedReferenceBytes: 0,
    countDelta: 0,
  };
  if (!requests.length) return out;
  const s = w;
  validate(s);
  for (const request of requests) {
    if (
      request.code !== 32 ||
      !request.position ||
      request.height === undefined ||
      !request.angles
    )
      throw new Error("Incomplete Mule effect event");
    const allocation = selectEffectSlot(s.powerEffects, 32, options.priority);
    if (!allocation) {
      out.failedFactories.push(32);
      continue;
    }
    const slot = allocation.slot,
      shared = s.powerEffects.slots[slot];
    if (allocation.replace) {
      const n = shared.nativePrior!,
        code = effectPriorByte(n, 69);
      if (
        code === 17 ||
        (code === 49 && [1, 2].includes(effectPriorByte(n, 76)))
      ) {
        if (!options.onSpecialRetirement)
          throw new Error(
            "Mule replacement requires original special effect retirement",
          );
        options.onSpecialRetirement(s, slot, n);
      }
      if (code !== 66) unlinkSpatial(s.spatial, s.terrain, id(slot));
      out.cleanedReferenceBytes += options.cleanupReferences(s, id(slot)) ?? 0;
      n[6] = 0;
      shared.occupied = false;
      if (shared.packet && s.economy)
        s.economy.packets = s.economy.packets.filter(
          (p) => p.id !== shared.packet!.id,
        );
      shared.packet = null;
      for (const l of s.landings ?? []) {
        if (l.slot === slot && l.phase !== 4) {
          l.phase = 4;
          if (l.native) l.native[6] = 0;
        }
        l.particles = l.particles.filter((p) => p.slot !== slot);
      }
      for (const e of s.waterEffects ?? [])
        if (e.slot === slot && e.active) {
          e.active = false;
          e.native = n.slice();
        }
      out.retired.push({
        id: id(slot),
        slot,
        code,
        cleanupTarget: { index: slot, kind: 5 },
        countDelta: -1,
        displayPhase: 12,
        moduleCleanup: true,
      });
      out.countDelta--;
    }
    const native = createMuleConsumptionEffect(
      shared.nativePrior!,
      slot,
      {
        code: 32,
        position: request.position,
        height: request.height,
        angles: request.angles,
      },
      s.terrain,
      pack,
    );
    shared.nativePrior = native;
    shared.occupied = true;
    shared.packet = null;
    shared.fractionX = native[67];
    shared.fractionY = native[68];
    insertSpatial(
      s.spatial,
      s.terrain,
      id(slot),
      worldCell(...request.position),
    );
    out.created.push({ slot, code: 32, native });
    out.countDelta++;
    synchronizeLinks(s);
  }
  if (s.missionPrefix)
    put16(
      s.missionPrefix,
      0x3554,
      s.powerEffects.slots.filter((p) => p.occupied).length,
    );
  validate(s);
  return out;
}
