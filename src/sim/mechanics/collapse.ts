/**Family6 building collapse:4EB80 selector3 and4F580→4EFE0/4F13D.
 * This static-position family is not inserted into the common spatial list. */
import { nextRandom, type GeneRng } from "./random";
import { groundHeight, type TerrainState } from "./terrain";
import { effectTerrainShade } from "./power-motion";
import type { DestructionRequest } from "./destruction-effect";
export type CollapseNative = (number | null)[];
export interface CollapsePool {
  records: CollapseNative[];
  count: number;
}
export interface CollapseWorld {
  collapse: CollapsePool;
  missionPrefix: number[];
  terrain: TerrainState;
  rng: GeneRng;
}
export interface CollapseRequest {
  code: 3;
  owner: 4;
  position: [number, number];
  buildingSlot: number;
  completed: boolean;
}
export interface CollapseContext<W extends CollapseWorld> {
  directions: readonly (readonly [number, number])[];
  /** Actual4EFE0 selectors4/5 in the same family6 slot order. */
  shieldWave?(world: W, slot: number): boolean;
  /**Real48790, including immediate ordered area damage. Receives staged world. */ effect(
    world: W,
    request: DestructionRequest,
  ): unknown;
  /**Clone/commit all additional roots affected by the actual shared factories. */ stageHost?(
    original: W,
    staged: W,
  ): void;
  commitHost?(target: W, staged: W): void;
}
export interface CollapseReceipt {
  callbacks: number[];
  retired: number[];
  effects: { parent: number; request: DestructionRequest }[];
  initialCount: number;
  finalCount: number;
}
const countAt = 0x3556,
  wrap = (v: number) => (v << 16) >> 16;
function byte(n: readonly (number | null)[], at: number) {
  const v = n[at];
  if (!Number.isInteger(v) || v! < 0 || v! > 255)
    throw Error("Original collapse numeric prior is uninitialized");
  return v!;
}
const word = (n: readonly (number | null)[], at: number) =>
    wrap(byte(n, at) | (byte(n, at + 1) << 8)),
  put = (n: (number | null)[], at: number, v: number) => {
    n[at] = v & 255;
    n[at + 1] = (v >> 8) & 255;
  },
  put32 = (n: (number | null)[], at: number, v: number) => {
    put(n, at, v);
    put(n, at + 2, v >> 16);
  };
function validatePrior(n: readonly (number | null)[]) {
  if (
    n.length !== 49 ||
    n.slice(31, 39).some((v) => v !== null) ||
    n.some(
      (v, i) =>
        (i < 31 || i >= 39) && (!Number.isInteger(v) || v! < 0 || v! > 255),
    )
  )
    throw Error(
      "Original49-byte collapse prior with null pointer gap required",
    );
}
export function makeCollapsePool(
  records: readonly (readonly (number | null)[])[],
  count: number,
): CollapsePool {
  if (
    records.length !== 32 ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 32
  )
    throw Error("Original collapse pool needs32 priors and count");
  for (const n of records) validatePrior(n);
  if (records.filter((n) => n[6] !== 0).length !== count)
    throw Error("Original collapse active count differs from priors");
  return { records: records.map((n) => n.slice()), count };
}
function validate(w: CollapseWorld) {
  if (
    w.missionPrefix.length < 0x355e ||
    word(w.missionPrefix, countAt) !== w.collapse.count
  )
    throw Error("Original family6 raw count3556 differs");
  makeCollapsePool(w.collapse.records, w.collapse.count);
}
/**4EB80 consumes no RNG and does not store the borrowed building reference.
 * The completed flag is read while the original building is still kind4. */
export function createCollapse<W extends CollapseWorld>(
  w: W,
  r: CollapseRequest,
): number | null {
  validate(w);
  if (
    r.code !== 3 ||
    r.owner !== 4 ||
    typeof r.completed !== "boolean" ||
    !Number.isInteger(r.buildingSlot) ||
    r.buildingSlot < 0 ||
    r.buildingSlot >= 256 ||
    r.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Unsupported original collapse factory request");
  if (w.collapse.count >= 32) return null;
  const slot = w.collapse.records.findIndex((n) => n[6] === 0);
  if (slot < 0)
    throw Error("Original collapse count/free slot is inconsistent");
  const n = w.collapse.records[slot].slice();
  n[2] = n[5] = 0;
  n[6] = 6;
  put(n, 7, r.position[0]);
  put(n, 9, r.position[1]);
  n.fill(0, 11, 15);
  put(n, 15, slot);
  put32(n, 17, groundHeight(w.terrain, ...r.position));
  put(n, 21, 0);
  n[23] = effectTerrainShade(w.terrain, ...r.position);
  n[24] = 4;
  n[25] = n[26] = n[27] = n[29] = 0;
  n[28] = 1;
  n[39] = 3;
  n[40] = r.completed ? 0 : 1;
  put(n, 41, 0);
  w.collapse.records[slot] = n;
  w.collapse.count++;
  put(w.missionPrefix, countAt, w.collapse.count);
  return slot;
}
/**Source4F580 uses its initial active count and current ascending records.
 * Shared2/5 requests are unmarked and execute later in source4E950's pass. */
export function stepCollapsePool<W extends CollapseWorld>(
  w: W,
  c: CollapseContext<W>,
): CollapseReceipt {
  validate(w);
  if (
    c.directions.length !== 9 ||
    c.directions.some(
      (d) =>
        d.length !== 2 ||
        d.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767),
    )
  )
    throw Error("Original collapse nine direction table required");
  const s = { ...w } as W;
  c.stageHost?.(w, s);
  s.collapse = {
    count: w.collapse.count,
    records: w.collapse.records.map((n) => n.slice()),
  };
  s.missionPrefix = w.missionPrefix.slice();
  s.terrain = { bytes: w.terrain.bytes.slice(), revision: w.terrain.revision };
  s.rng = { ...w.rng };
  const out: CollapseReceipt = {
    callbacks: [],
    retired: [],
    effects: [],
    initialCount: s.collapse.count,
    finalCount: s.collapse.count,
  };
  let remaining = out.initialCount;
  for (let slot = 0; slot < 32 && remaining > 0; slot++) {
    const n = s.collapse.records[slot];
    if (n[6] === 0) continue;
    if (byte(n, 21) & 1) continue;
    if (n[6] === 6 && [4, 5].includes(byte(n, 39))) {
      if (!c.shieldWave) throw Error("Actual family6 shield wave callback required");
      out.callbacks.push(slot); remaining--;
      if (c.shieldWave(s, slot)) out.retired.push(slot);
      continue;
    }
    if (
      n[6] !== 6 ||
      n[39] !== 3 ||
      n[24] !== 4 ||
      ![0, 1].includes(byte(n, 40)) ||
      word(n, 15) !== slot
    )
      throw Error("Unsupported active family6 collapse selector/identity");
    out.callbacks.push(slot);
    remaining--;
    const old = word(n, 41),
      next = wrap(old + 1);
    put(n, 41, next);
    const emit = (code: 2 | 5, at: [number, number], parameter: number) => {
      if (!c.effect)
        throw Error("Original collapse shared48790 blast factory is required");
      const request: DestructionRequest = {
        code,
        owner: 0,
        position: at,
        height: groundHeight(s.terrain, ...at),
        angles: [0, 0, 0],
        parameter,
        delay: 0,
        newborn: false,
      };
      out.effects.push({ parent: slot, request });
      c.effect(s, request);
    };
    if (old !== 0 && next > 8) {
      s.collapse.records[slot][6] = 0;
      s.collapse.count--;
      put(s.missionPrefix, countAt, s.collapse.count);
      out.retired.push(slot);
      continue;
    }
    if (old === 0) {
      const current = s.collapse.records[slot];
      emit(5, [word(current, 7), word(current, 9)], 0);
    }
    for (let i = 0; i < 3; i++) {
      const offset = c.directions[nextRandom(s.rng) % 9],
        current = s.collapse.records[slot],
        at: [number, number] = [
          wrap(word(current, 7) + offset[0]),
          wrap(word(current, 9) + offset[1]),
        ];
      emit(2, at, byte(current, 40));
    }
  }
  if (remaining > 0)
    throw Error("Original family6 callback scan would leave its32-slot pool");
  validate(s);
  out.finalCount = s.collapse.count;
  w.collapse = s.collapse;
  w.missionPrefix = s.missionPrefix;
  w.terrain = s.terrain;
  w.rng = s.rng;
  c.commitHost?.(w, s);
  return out;
}
