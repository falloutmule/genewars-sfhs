/** Shared source-family4 allocation, ordered water callbacks and cleanup. */
import type { Pack } from "../../content/types";
import type { SourcePoolRegistry, SourceEntityId } from "./source-pools";
import type {
  PowerEffectPool,
  PowerEffectSlot,
} from "../mechanics/power-motion";
import type { LandingState } from "../mechanics/landing";
import type { GeneRng } from "../mechanics/random";
import type { TerrainState } from "../mechanics/terrain";
import { worldCell } from "../mechanics/terrain";
import { animationProfile } from "../mechanics/animation";
import {
  cloneWaterEffect,
  makeWaterEffect,
  updateWaterEffect,
  retireWaterEffect,
  type WaterEffect,
  type WaterCode,
  type WaterContext,
  type WaterRequest,
  type EffectNative,
} from "../mechanics/water";
import type { MuleEvent } from "../mechanics/mule";
import {
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  validateSpatial,
  type SpatialState,
} from "./spatial";
export interface WaterAdapterWorld {
  waterEffects: WaterEffect[];
  powerEffects: PowerEffectPool;
  spatial: SpatialState;
  terrain: TerrainState;
  rng: GeneRng;
  source: SourcePoolRegistry;
  frame: number;
  landings?: LandingState[];
  ecology?: { mules: { native: (number | null)[] }[] };
}
export interface WaterAdapterOptions {
  obstacleAt?: (position: [number, number]) => boolean;
  /** Runs on staged roots after unlink, BEFORE kind clear/slot reuse. */
  cleanupReferences?: (
    world: WaterAdapterWorld,
    id: SourceEntityId,
  ) => number | void;
}
export interface WaterAdapterReceipt {
  created: { slot: number; code: WaterCode }[];
  failedFactories: WaterCode[];
  retired: SourceEntityId[];
  audio: {
    channel: number;
    mode: number;
    parameter: number;
    volume: number;
    range: number;
  }[];
  primary: number[];
  newborn: number[];
  cleanedReferenceBytes: number;
  cleanupRequired: SourceEntityId[];
}
type SharedSlot = PowerEffectSlot & { nativePrior?: EffectNative };
const identity = (slot: number): SourceEntityId => `source:4:${slot}`;
const receipt = (): WaterAdapterReceipt => ({
  created: [],
  failedFactories: [],
  retired: [],
  audio: [],
  primary: [],
  newborn: [],
  cleanedReferenceBytes: 0,
  cleanupRequired: [],
});
function stage(w: WaterAdapterWorld): WaterAdapterWorld {
  return {
    ...w,
    waterEffects: w.waterEffects.map(cloneWaterEffect),
    powerEffects: {
      slots: w.powerEffects.slots.map((s) => ({
        ...s,
        packet: s.packet ? { ...s.packet } : null,
        nativePrior: (s as SharedSlot).nativePrior?.slice(),
      })),
    },
    spatial: structuredClone(w.spatial),
    terrain: { bytes: w.terrain.bytes.slice(), revision: w.terrain.revision },
    rng: { ...w.rng },
    source: {
      ...w.source,
      entities: w.source.entities.map((e) => ({
        ...e,
        nativeBytes: e.nativeBytes.slice(),
      })),
    },
    landings: w.landings?.map((l) => ({
      ...l,
      native: l.native?.slice(),
      point: [...l.point],
      particles: l.particles.map((p) => ({
        ...p,
        native: p.native?.slice(),
        animation: { ...p.animation },
      })),
    })),
    ecology: w.ecology
      ? {
          ...w.ecology,
          mules: w.ecology.mules.map((m) => ({
            ...m,
            native: m.native.slice(),
          })),
        }
      : undefined,
  };
}
function commit(w: WaterAdapterWorld, s: WaterAdapterWorld) {
  w.waterEffects = s.waterEffects;
  w.powerEffects = s.powerEffects;
  w.spatial = s.spatial;
  w.terrain = s.terrain;
  w.source = s.source;
  if (s.landings) w.landings = s.landings;
  if (s.ecology) w.ecology = s.ecology;
}
function context(
  w: WaterAdapterWorld,
  pack: Pack,
  options: WaterAdapterOptions,
): WaterContext {
  if (!pack.rules || !pack.assets.EFF)
    throw new Error("Original water tables/EFF resource are required");
  return {
    terrain: w.terrain,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    rawWaterHeight: w.source.source.terrain.rawWaterHeight,
    profile: (code) =>
      animationProfile(pack.assets.EFF, code === 0x30 ? 48 : code),
    obstacleAt: options.obstacleAt,
  };
}
function validate(w: WaterAdapterWorld) {
  if (w.powerEffects.slots.length !== 200)
    throw new Error("Original shared effect pool must have200slots");
  const seen = new Set<number>();
  for (const e of w.waterEffects) {
    if (seen.has(e.slot) || e.slot < 0 || e.slot >= 200)
      throw new Error("Duplicate/invalid water slot");
    seen.add(e.slot);
    if (e.active) {
      const p = w.powerEffects.slots[e.slot];
      if (!p?.occupied || p.packet || !w.spatial.nodes[identity(e.slot)])
        throw new Error("Water shared slot/spatial identity is inconsistent");
    }
  }
  for (const [i, s] of w.powerEffects.slots.entries())
    if (s.occupied !== !!w.spatial.nodes[identity(i)])
      throw new Error("Shared effect occupancy/spatial identity differs");
  validateSpatial(w.spatial);
}
function updateNativeLinks(w: WaterAdapterWorld) {
  for (const e of w.waterEffects) {
    if (!e.active) continue;
    const node = w.spatial.nodes[identity(e.slot)];
    if (!node) throw new Error("Water common link is missing");
    const previous = node.previous ? w.spatial.nodes[node.previous] : null,
      next = node.next ? w.spatial.nodes[node.next] : null;
    const put = (at: number, v: number) => {
      e.native[at] = v & 255;
      e.native[at + 1] = (v >> 8) & 255;
    };
    put(0, previous ? previous.index : node.cell);
    e.native[2] = previous ? previous.family + 1 : 0;
    if (next) put(3, next.index);
    e.native[5] = next ? next.family + 1 : 0;
    const prior = w.powerEffects.slots[e.slot] as SharedSlot;
    prior.nativePrior = e.native.slice();
  }
}
function retire(
  w: WaterAdapterWorld,
  slot: number,
  out: WaterAdapterReceipt,
  options: WaterAdapterOptions,
) {
  const id = identity(slot),
    effect = w.waterEffects.find((e) => e.slot === slot && e.active),
    prior = w.powerEffects.slots[slot] as SharedSlot;
  if (!w.spatial.nodes[id] || !prior.occupied)
    throw new Error("Water retirement shared identity is missing");
  unlinkSpatial(w.spatial, w.terrain, id);
  if (options.cleanupReferences)
    out.cleanedReferenceBytes += options.cleanupReferences(w, id) ?? 0;
  else out.cleanupRequired.push(id);
  if (effect) {
    const retired = retireWaterEffect(effect);
    Object.assign(effect, retired);
    prior.nativePrior = retired.native.slice();
    prior.fractionX = retired.fractionX;
    prior.fractionY = retired.fractionY;
  } else {
    let found = false;
    for (const landing of w.landings ?? []) {
      const at = landing.particles.findIndex((p) => p.slot === slot);
      if (at >= 0) {
        const particle = landing.particles[at];
        prior.fractionX = particle.fractionX;
        prior.fractionY = particle.fractionY;
        landing.particles.splice(at, 1);
        found = true;
        break;
      }
    }
    if (!found)
      throw new Error(
        "Water replacement target needs its original callback host",
      );
    if (!prior.nativePrior)
      throw new Error("Shared replacement numeric prior is unknown");
    prior.nativePrior[6] = 0;
  }
  prior.occupied = false;
  out.retired.push(id);
  updateNativeLinks(w);
}
const priorities: Record<number, number> = {
  6: 27,
  0x15: 19,
  0x16: 20,
  0x30: 20,
  0x1a: 35,
  0x2f: 35,
  0x21: 1,
  0x31: 1,
};
function allocate(
  w: WaterAdapterWorld,
  code: WaterCode,
  out: WaterAdapterReceipt,
  options: WaterAdapterOptions,
): number | null {
  const free = w.powerEffects.slots.findIndex((s) => !s.occupied);
  if (free >= 0) return free;
  let priority = code === 0x15 ? 19 : 20,
    selected: number | null = null;
  for (let i = 0; i < 200; i++) {
    const prior = (w.powerEffects.slots[i] as SharedSlot).nativePrior;
    if (!prior || prior[69] === null || prior[21] === null)
      throw new Error(
        "Full-pool water priority needs original live effect selectors/flags",
      );
    const rank = priorities[prior[69]!];
    if (rank === undefined)
      throw new Error(
        "Water replacement priority for this effect is not admitted",
      );
    if (rank > priority && !(prior[21]! & 1)) {
      priority = rank;
      selected = i;
    }
  }
  if (selected === null) return null;
  retire(w, selected, out, options);
  return selected;
}
function create(
  w: WaterAdapterWorld,
  request: WaterRequest,
  pack: Pack,
  out: WaterAdapterReceipt,
  options: WaterAdapterOptions,
  newborn = false,
): WaterEffect | null {
  const c = context(w, pack, options);
  // Validate required resource before allocating/retiring another effect.
  const p = c.profile(request.code);
  if (
    p.flags !== 0 ||
    p.holds.length !==
      (request.code === 0x15 ? 2 : request.code === 0x16 ? 3 : 12) ||
    p.holds.some((v) => v !== 0)
  )
    throw new Error("Original water animation profile is not admitted");
  const slot = allocate(w, request.code, out, options);
  if (slot === null) {
    out.failedFactories.push(request.code);
    return null;
  }
  const shared = w.powerEffects.slots[slot] as SharedSlot;
  if (
    !shared.nativePrior ||
    shared.nativePrior.length !== 81 ||
    shared.fractionX === null ||
    shared.fractionY === null
  )
    throw new Error("Water factory requires the current shared native prior");
  const prior = shared.nativePrior.slice();
  prior[67] = shared.fractionX;
  prior[68] = shared.fractionY;
  const e = makeWaterEffect(slot, request, prior, c);
  if (newborn) {
    e.flags |= 1;
    e.native[21] = e.flags & 255;
  }
  const at = w.waterEffects.findIndex((old) => old.slot === slot);
  if (at < 0) w.waterEffects.push(e);
  else w.waterEffects[at] = e;
  shared.occupied = true;
  shared.packet = null;
  shared.nativePrior = e.native.slice();
  shared.fractionX = e.fractionX;
  shared.fractionY = e.fractionY;
  insertSpatial(w.spatial, w.terrain, identity(slot), worldCell(e.x, e.y));
  updateNativeLinks(w);
  out.created.push({ slot, code: e.code });
  if (e.code === 0x30)
    out.audio.push({
      channel: 0x3b,
      mode: 2,
      parameter: 0,
      volume: 127,
      range: 100,
    });
  return e;
}
/** Source48790 ordered factories, all-or-nothing writes and zero RNG draws. */
export function createWaterEffect(
  w: WaterAdapterWorld,
  request: WaterRequest,
  pack: Pack,
  options: WaterAdapterOptions = {},
): WaterAdapterReceipt {
  const s = stage(w),
    out = receipt();
  validate(s);
  create(s, request, pack, out, options);
  validate(s);
  commit(w, s);
  return out;
}
export function consumeMuleWaterEvents(
  w: WaterAdapterWorld,
  events: readonly MuleEvent[],
  pack: Pack,
  options: WaterAdapterOptions = {},
): WaterAdapterReceipt {
  const s = stage(w),
    out = receipt();
  validate(s);
  for (const event of events) {
    if (event.kind !== "mule-water-effect") continue;
    if (
      ![0x15, 0x30].includes(event.code ?? -1) ||
      !event.position ||
      event.height === undefined ||
      !event.angles
    )
      throw new Error("Incomplete source Mule water factory request");
    create(
      s,
      {
        code: event.code as WaterCode,
        owner: 0,
        position: event.position,
        height: event.height,
        angles: event.angles,
      },
      pack,
      out,
      options,
    );
  }
  validate(s);
  commit(w, s);
  return out;
}
/** One source callback on an already staged scheduler world. */
export function runWaterEffectCallback(
  w: WaterAdapterWorld,
  slot: number,
  pack: Pack,
  options: WaterAdapterOptions = {},
): WaterAdapterReceipt {
  const out = receipt(),
    c = context(w, pack, options);
  let children = 0;

  const at = w.waterEffects.findIndex((e) => e.slot === slot && e.active);
  if (at < 0) throw new Error("Water callback identity disappeared");
  const update = updateWaterEffect(w.waterEffects[at], c);
  w.waterEffects[at] = update.effect;
  const shared = w.powerEffects.slots[slot] as SharedSlot;
  shared.fractionX = update.effect.fractionX;
  shared.fractionY = update.effect.fractionY;
  shared.nativePrior = update.effect.native.slice();
  if (update.oldCell !== update.newCell)
    moveSpatial(w.spatial, w.terrain, identity(slot), update.newCell);
  updateNativeLinks(w);
  if (update.createChild) {
    const p = update.effect;
    if (
      create(
        w,
        {
          code: 0x16,
          owner: p.owner,
          position: [p.x, p.y],
          height: p.height,
          angles: [0, 0, 0],
        },
        pack,
        out,
        options,
        true,
      )
    )
      children++;
  }
  if (update.retire) retire(w, slot, out, options);
  out.primary.push(slot);
  return out;
}
/** Public atomic one-slot port; marked children are left for the global pass. */
export function stepWaterEffectAt(
  w: WaterAdapterWorld,
  slot: number,
  pack: Pack,
  options: WaterAdapterOptions = {},
): WaterAdapterReceipt {
  const s = stage(w);
  validate(s);
  const out = runWaterEffectCallback(s, slot, pack, options);
  validate(s);
  commit(w, s);
  return out;
}
/** Compatibility water-only pass. Canonical host uses the global scheduler. */
export function stepWaterEffects(
  w: WaterAdapterWorld,
  pack: Pack,
  options: WaterAdapterOptions = {},
): WaterAdapterReceipt {
  const s = stage(w),
    out = receipt();
  validate(s);
  let childCount = 0;
  const callback = (slot: number) => {
    const r = runWaterEffectCallback(s, slot, pack, options);
    childCount += r.created.length;
    out.created.push(...r.created);
    out.failedFactories.push(...r.failedFactories);
    out.retired.push(...r.retired);
    out.audio.push(...r.audio);
    out.cleanedReferenceBytes += r.cleanedReferenceBytes;
    out.cleanupRequired.push(...r.cleanupRequired);
  };
  for (let slot = 0; slot < 200; slot++) {
    const e = s.waterEffects.find((e) => e.slot === slot && e.active);
    if (!e || e.flags & 1) continue;
    callback(slot);
    out.primary.push(slot);
  }
  for (let slot = 0; slot < 200 && childCount > 0; slot++) {
    const e = s.waterEffects.find((e) => e.slot === slot && e.active);
    if (!e || !(e.flags & 1)) continue;
    e.flags &= 0xfffe;
    e.native[21] = e.flags & 255;
    childCount--;
    callback(slot);
    out.newborn.push(slot);
  }
  if (childCount)
    throw new Error("Water newborn count does not match shared marked slots");
  validate(s);
  commit(w, s);
  return out;
}
