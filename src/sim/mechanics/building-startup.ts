/** Source45010/44FF0 serialized rebind and451F0 selector4 processing.
 * Runtime resource pointers are logical bindings, never invented native bytes. */
import {
  advanceAnimation,
  type AnimationProfile,
  type AnimationState,
} from "./animation";
import type { BuildingNative } from "./building-native";

export interface BuildingStartupRules {
  schemaVersion: 1;
  resources: readonly { selector: number; path: string; assetKey: string }[];
  unsupportedSelectors: readonly number[];
  upkeep: readonly number[];
  processingFrontOffset: readonly [number, number];
}
export interface SerializedBuildingBinding {
  slot: number;
  selector: number;
  assetKey: string;
  path: string;
}
export interface SerializedBuildingProjection {
  id: `source:3:${number}`;
  slot: number;
  owner: number;
  selector: number;
  x: number;
  y: number;
  ground: number;
  shade: number;
  health: number;
  grade: number;
  targetGrade: number;
  complete: boolean;
  disabled: boolean;
  powered: boolean;
  flags: number;
  energy: number;
  extraDrain: number;
  pendingMaterial: number;
  animation: AnimationState;
}
export type BuildingStartupResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
const int = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
function byte(n: readonly (number | null)[], at: number): number {
  const v = n[at];
  if (v === null || v === undefined || !int(v, 0, 255))
    throw new Error(`unknown-building-byte-${at}`);
  return v;
}
function signed(v: number) {
  return (v << 24) >> 24;
}
function u16(n: readonly (number | null)[], at: number) {
  return byte(n, at) | (byte(n, at + 1) << 8);
}
function i16(n: readonly (number | null)[], at: number) {
  return (u16(n, at) << 16) >> 16;
}
function i32(n: readonly (number | null)[], at: number) {
  return u16(n, at) | (u16(n, at + 2) << 16);
}
function set16(n: BuildingNative, at: number, v: number) {
  n[at] = v & 255;
  n[at + 1] = (v >>> 8) & 255;
}
function set32(n: BuildingNative, at: number, v: number) {
  set16(n, at, v);
  set16(n, at + 2, v >>> 16);
}
function validate(n: readonly (number | null)[]) {
  if (
    n.length !== 67 ||
    n.some((v) => v !== null && !int(v, 0, 255)) ||
    n.slice(31, 39).some((v) => v !== null)
  )
    throw new Error("invalid-building-native67");
}
function attempt<T>(f: () => T): BuildingStartupResult<T> {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "invalid-building-startup",
    };
  }
}
function readAnimation(n: readonly (number | null)[]): AnimationState {
  return {
    action: byte(n, 25),
    hold: byte(n, 26),
    frame: byte(n, 27),
    direction: signed(byte(n, 28)),
    delay: signed(byte(n, 29)),
    counter: signed(byte(n, 30)),
  };
}
function writeAnimation(n: BuildingNative, a: AnimationState) {
  n[25] = a.action & 255;
  n[26] = a.hold & 255;
  n[27] = a.frame & 255;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
}

/** No constructor is run. Accept initializeNativePool(source,3)'s actual
 * records; inactive retained bytes remain unchanged, including unknowns.
 * No link/count/player reset, animation reset, energy seed or terrain resample. */
export function initializeSerializedBuildings(
  actualNative67Pool: readonly (readonly (number | null)[])[],
  context: {
    rules: BuildingStartupRules;
    /** Presence checks only: resource data and live animation are not mutated. */
    hasResource(assetKey: string): boolean;
  },
): BuildingStartupResult<{
  records: BuildingNative[];
  bindings: SerializedBuildingBinding[];
  buildings: SerializedBuildingProjection[];
  ownerCounts: number[];
  completedCounts: number[][];
}> {
  return attempt(() => {
    if (actualNative67Pool.length !== 256 || context.rules.schemaVersion !== 1)
      throw new Error("invalid-serialized-building-pool");
    const rows = new Map<number, BuildingStartupRules["resources"][number]>();
    for (const row of context.rules.resources) {
      if (
        !int(row.selector, 0, 13) ||
        rows.has(row.selector) ||
        !row.assetKey ||
        !row.path
      )
        throw new Error("invalid-building-resource-profile");
      rows.set(row.selector, row);
    }
    const records = actualNative67Pool.map((n) => {
      validate(n);
      return n.slice();
    });
    const bindings: SerializedBuildingBinding[] = [],
      buildings: SerializedBuildingProjection[] = [];
    const ownerCounts = [0, 0, 0, 0],
      completedCounts = Array.from({ length: 4 }, () =>
        Array<number>(14).fill(0),
      );
    records.forEach((n, slot) => {
      const kind = byte(n, 6);
      if (!kind) return;
      if (
        kind !== 4 ||
        i16(n, 15) !== slot ||
        byte(n, 24) !== Math.floor(slot / 64)
      )
        throw new Error("invalid-active-building-slot-owner");
      const selector = signed(byte(n, 45)),
        row = rows.get(selector);
      if (
        !int(selector, 0, 13) ||
        !row ||
        context.rules.unsupportedSelectors.includes(selector)
      )
        throw new Error(`unsupported-building-resource-selector-${selector}`);
      if (!context.hasResource(row.assetKey))
        throw new Error(`missing-building-resource-${row.assetKey}`);
      // Active virtual44FF0 only clears this dword and binds native31 logically.
      n.fill(0, 39, 43);
      const owner = byte(n, 24),
        flags = u16(n, 49);
      const building: SerializedBuildingProjection = {
        id: `source:3:${slot}`,
        slot,
        owner,
        selector,
        x: i16(n, 7),
        y: i16(n, 9),
        ground: i32(n, 17),
        shade: byte(n, 23),
        health: i16(n, 43),
        grade: byte(n, 46),
        targetGrade: byte(n, 47),
        complete: !!(flags & 1),
        disabled: !!(flags & 0x40),
        powered: !!(flags & 4),
        flags,
        energy: i16(n, 61),
        extraDrain: byte(n, 63),
        pendingMaterial: byte(n, 51),
        animation: readAnimation(n),
      };
      buildings.push(building);
      bindings.push({ slot, selector, assetKey: row.assetKey, path: row.path });
      ownerCounts[owner]++;
      if (building.complete) completedCounts[owner][selector]++;
    });
    return { records, bindings, buildings, ownerCounts, completedCounts };
  });
}

export interface RecyclingMaterial {
  /** Real source pool slot, not a synthesized entity. */
  slot: number;
  native: readonly (number | null)[];
}
/** Source8B300(cell,0), in the actual intrusive cell order. */
export function selectRecyclingPlant(
  cellOrder: readonly RecyclingMaterial[],
): RecyclingMaterial | null {
  return cellOrder.find((m) => byte(m.native, 6) === 2) ?? null;
}
/** Source8B0E0 chooses the greatest signed104 word, strictly above-128.
 * Equal candidates retain the first chain entry. Fresh state24 corpses are
 * ineligible: this query requires signed state94>=25 and native97 bit0 clear. */
export function selectRecyclingCorpse(
  cellOrder: readonly RecyclingMaterial[],
): RecyclingMaterial | null {
  let best: RecyclingMaterial | null = null,
    weight = -128;
  for (const material of cellOrder) {
    const n = material.native;
    if (byte(n, 6) !== 1 || signed(byte(n, 94)) < 25 || byte(n, 97) & 1)
      continue;
    const candidate = i16(n, 104);
    if (candidate > weight) {
      weight = candidate;
      best = material;
    }
  }
  return best;
}
export type RecyclingEvent =
  | {
      type: "recycling-deposit";
      owner: number;
      amount: number;
      stored: number;
      discarded: number;
      credit: 20;
    }
  | { type: "recycling-consumed"; kind: 1 | 2; slot: number; payload: number }
  | {
      type: "recycling-research";
      owner: number;
      species: number;
      before: number;
      after: number;
    }
  | { type: "recycling-power-lost"; owner: number; warningStarted: boolean }
  | { type: "recycling-collection"; range: 1024 | 1536; dispatched: boolean };
export interface RecyclingContext<W> {
  rules: BuildingStartupRules;
  frame: number;
  native(w: W, slot: number): BuildingNative;
  /** Actual source player1805 record, mutable within the caller's transaction. */
  player(w: W, owner: number): BuildingNative;
  profile(w: W, slot: number, action: number): AnimationProfile;
  /** Source8B300(cell,0): first kind2 in the actual cell chain; mask0 excludes none. */
  findPlant?(w: W, cell: number): RecyclingMaterial | null;
  /** Source8B0E0: selectRecyclingCorpse over the real cell chain. */
  findCorpse?(w: W, cell: number): RecyclingMaterial | null;
  /** Immediate source8ACC0. Corpse research occurs after unlink, before cleanup. */
  unlinkMaterial?(w: W, material: RecyclingMaterial, kind: 1 | 2): void;
  /** Immediate source724C0→kind0→global family count--, after unlink. */
  retireMaterial?(w: W, material: RecyclingMaterial, kind: 1 | 2): void;
  /** Actual80780, including funds cap, audio/floating effect and its RNG. */
  credit?(w: W, owner: number, amount: 20): void;
  /** Grade1/2 periodic8D930 descriptor112724 then14040 collector factory.
   * Return actual allocation success; capacity failure is normal and costs0. */
  dispatchCollection?(w: W, slot: number, range: 1024 | 1536): boolean;
}
export interface RecyclingReceipt {
  events: RecyclingEvent[];
  queueDraw: boolean;
  contextKind: 4;
}
function requirePort<T>(port: T | undefined, name: string): T {
  if (port === undefined) throw new Error(`missing-recycling-service-${name}`);
  return port;
}
function validatePlayer(p: BuildingNative) {
  if (p.length !== 1805 || p.some((v) => v !== null && !int(v, 0, 255)))
    throw new Error("invalid-recycling-player1805");
}

/** In-place only inside an already-isolated host transaction. This is the full
 * ordinary selector4 callback, including upkeep and common tail; do not also
 * run generic economy upkeep on this building. Collapse belongs to its real
 * shared family and is rejected before mutation. */
export function stepStagedRecyclingPlant<W>(
  w: W,
  slot: number,
  c: RecyclingContext<W>,
): RecyclingReceipt {
  const n = c.native(w, slot);
  validate(n);
  if (
    byte(n, 6) !== 4 ||
    byte(n, 45) !== 4 ||
    i16(n, 15) !== slot ||
    !int(slot, 0, 255)
  )
    throw new Error("invalid-recycling-building");
  const owner = byte(n, 24),
    grade = byte(n, 46),
    p = c.player(w, owner);
  validatePlayer(p);
  if (
    !int(owner, 0, 3) ||
    Math.floor(slot / 64) !== owner ||
    !int(grade, 0, 2) ||
    c.rules.schemaVersion !== 1 ||
    c.rules.upkeep.length !== 14 ||
    !int(c.rules.upkeep[4], 0, 255) ||
    c.rules.processingFrontOffset.length !== 2 ||
    c.rules.processingFrontOffset.some((v) => !int(v, -32768, 32767)) ||
    !int(c.frame, 0, 0x7fffffff)
  )
    throw new Error("invalid-recycling-rules-context");
  let flags = u16(n, 49);
  if (flags & 0x800)
    throw new Error("recycling-collapse-requires-shared-callback");
  const oldAction = byte(n, 25),
    oldPower = flags & 4,
    events: RecyclingEvent[] = [];
  const complete = !!(flags & 1),
    disabled = !!(flags & 0x40);
  if (complete && !disabled) {
    set16(n, 61, i16(n, 61) - c.rules.upkeep[4] - byte(n, 63));
    if (i16(n, 61) < 1) {
      set16(n, 61, 0);
      if (!(flags & 0x100)) {
        flags &= ~4;
        set16(n, 49, flags);
        const warningStarted = i16(p, 0x5ea) === 0;
        if (warningStarted) set16(p, 0x5ea, 1000);
        events.push({ type: "recycling-power-lost", owner, warningStarted });
      }
    }
    if (flags & 4 && !(flags & 0x100)) {
      if (byte(n, 27) === 0) {
        n[28] = 0;
        const pending = byte(n, 51);
        if (pending) {
          const before = i32(p, 0x4a7) >>> 0,
            capacity = i32(p, 0x5e6) >>> 0;
          const sum = (before + pending) >>> 0,
            after = sum < capacity ? sum : capacity;
          set32(p, 0x4a7, after);
          n[63] = 4;
          n[51] = 0;
          requirePort(c.credit, "80780-credit")(w, owner, 20);
          events.push({
            type: "recycling-deposit",
            owner,
            amount: pending,
            stored: after - before,
            discarded: before + pending - after,
            credit: 20,
          });
        }
        const x = ((i16(n, 7) + c.rules.processingFrontOffset[0]) << 16) >> 16;
        const y = ((i16(n, 9) + c.rules.processingFrontOffset[1]) << 16) >> 16;
        const cell = ((y >> 8) & 127) * 128 + ((x >> 8) & 127);
        const plant = requirePort(c.findPlant, "8B300-plant-query")(w, cell);
        if (plant) {
          if (byte(plant.native, 6) !== 2)
            throw new Error("invalid-recycling-plant-result");
          n[27] = 1;
          n[63] = 4;
          n[51] = (byte(plant.native, 48) * 4 + grade + 2) & 255;
          requirePort(c.unlinkMaterial, "material-unlink")(w, plant, 2);
          requirePort(c.retireMaterial, "material-retirement")(w, plant, 2);
          events.push({
            type: "recycling-consumed",
            kind: 2,
            slot: plant.slot,
            payload: byte(n, 51),
          });
        } else {
          const corpse = requirePort(c.findCorpse, "8B0E0-corpse-query")(
            w,
            cell,
          );
          if (corpse) {
            if (byte(corpse.native, 6) !== 1)
              throw new Error("invalid-recycling-corpse-result");
            n[27] = 1;
            n[63] = 4;
            n[51] = (byte(corpse.native, 104) * 2 * (grade + 2) + 50) & 255;
            requirePort(c.unlinkMaterial, "material-unlink")(w, corpse, 1);
            const species = signed(byte(corpse.native, 122)),
              at = 0x61a + species * 4;
            if (species < 0 || at + 3 >= p.length)
              throw new Error("invalid-recycling-corpse-species");
            const before = i32(p, at),
              cap = (byte(p, 0x6e1) * 25 + 50) * 2048;
            if (before < cap) {
              const after = Math.min((before + grade * 32 + 32) | 0, cap);
              set32(p, at, after);
              events.push({
                type: "recycling-research",
                owner,
                species,
                before,
                after,
              });
            }
            requirePort(c.retireMaterial, "material-retirement")(w, corpse, 1);
            events.push({
              type: "recycling-consumed",
              kind: 1,
              slot: corpse.slot,
              payload: byte(n, 51),
            });
          } else if (grade !== 0 && ((slot + c.frame) & 255) === 0) {
            const range = grade === 1 ? 1024 : 1536;
            const dispatched = requirePort(
              c.dispatchCollection,
              "8D930-14040-collection",
            )(w, slot, range);
            if (dispatched) n[63] = (byte(n, 63) + 16) & 255;
            events.push({ type: "recycling-collection", range, dispatched });
          }
        }
      } else {
        n[28] = 1;
        n[63] = 2;
        n[29] = (3 - grade) & 255;
      }
    } else n[28] = 0;
    if (i16(n, 61) > 200) set16(n, 61, 200);
    if (byte(n, 63)) n[63] = byte(n, 63) - 1;
  }
  // Incomplete and disabled cases bypass the selector switch and extra-drain
  // decrement, then share inactive energy decay and ANB selection.
  if ((flags & 0x100 || disabled || !complete) && i16(n, 61) > 0)
    set16(n, 61, i16(n, 61) - 1);
  if (
    oldAction !== byte(n, 25) ||
    byte(n, 28) !== 0 ||
    oldPower !== (u16(n, 49) & 4) ||
    byte(n, 48)
  )
    n[21] = byte(n, 21) | 4;
  if (byte(n, 48)) n[48] = byte(n, 48) - 1;
  if (!complete && i16(n, 43) < 1)
    return { events, queueDraw: false, contextKind: 4 };
  if (!complete) {
    n[25] = 0;
    n[28] = 0;
    n[27] = byte(n, 47);
  } else if (!disabled) n[25] = grade + 1;
  else {
    n[25] = 4;
    n[28] = 0;
    n[27] = grade;
  }
  writeAnimation(
    n,
    advanceAnimation(readAnimation(n), c.profile(w, slot, byte(n, 25))),
  );
  return { events, queueDraw: true, contextKind: 4 };
}

/** Atomic standalone entry. Cross-pool services receive only the staged world;
 * a missing late query/factory rolls back deposits, RNG and retirements too. */
export function stepRecyclingPlant<W>(
  before: W,
  slot: number,
  context: RecyclingContext<W> & {
    stageWorld?(w: W): W;
  },
): BuildingStartupResult<{ world: W; receipt: RecyclingReceipt }> {
  return attempt(() => {
    const world = context.stageWorld
      ? context.stageWorld(before)
      : structuredClone(before);
    return { world, receipt: stepStagedRecyclingPlant(world, slot, context) };
  });
}
