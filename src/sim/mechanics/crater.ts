/** Source79160/77C60 crater creation and79220/78E30 terrain jobs.
 * Native176-byte priors, live linked records and imported tables are inputs. */
import { nextRandom, type GeneRng } from "./random";
import { terrainNormal, wrap16 } from "./motion";
import {
  cellIndex,
  integerSqrt,
  readWord,
  repairMaterials,
  worldCell,
  groundHeight,
  type TerrainState,
  MAP_BYTES,
} from "./terrain";
import { effectTerrainShade } from "./power-motion";

export const CRATER_JOB_BASE = 0x1ec7;
export const CRATER_JOB_STRIDE = 176;
export const CRATER_JOB_COUNT = 0x2ff7;
export interface CraterRules {
  /** Actual object3:4564 nine signed XY pairs. */
  directions: readonly (readonly number[])[];
  /** Actual first nine bytes at object3:4B44 /4B50. */
  largeTextures: readonly number[];
  largeFlags: readonly number[];
  terrainBorder: readonly number[];
  terrainLightVector: readonly number[];
}
export interface CraterWorld {
  missionPrefix: number[];
  terrain: TerrainState;
  rng: GeneRng;
}
export interface CraterLinkedRecord {
  id: string;
  native: (number | null)[];
}
export interface CraterContext<W extends CraterWorld> {
  rules: CraterRules;
  /** Complete actual shared head-to-tail list. Native images belong to staged W. */
  linkedRecords(world: W, cell: number): readonly CraterLinkedRecord[];
  /** Synchronize additional normalized mirrors after a real numeric write. */
  linkedChanged?(
    world: W,
    record: CraterLinkedRecord,
    operation: "shade" | "height",
  ): void;
  /** Actual79D50(activate=1) over positive active zones after any retirement. */
  refreshZones?(world: W, activeZones: readonly number[]): readonly number[];
}
export interface CraterReceipt {
  slot: number;
  before: number[];
  after: number[];
  retired: boolean;
  countBefore: number;
  countAfter: number;
  heightWrites: { cell: number; before: number; after: number }[];
  linkedWrites: { id: string; operation: "shade" | "height" }[];
  viewportInvalidations: number[];
}
export interface CraterAllocation {
  slot: number | null;
  viewportInvalidations: number[];
}
const corners = [
  [0, 0],
  [-1, 0],
  [-1, -1],
  [0, -1],
] as const;
const gridCorners = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;
function integer(v: number, lo: number, hi: number): boolean {
  return Number.isInteger(v) && v >= lo && v <= hi;
}
function byte(n: readonly (number | null)[], p: number): number {
  const v = n[p];
  if (v === null || !integer(v, 0, 255))
    throw new Error(`Unknown crater native byte ${p}`);
  return v;
}
function word(n: readonly (number | null)[], p: number): number {
  return ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
}
function dword(n: readonly (number | null)[], p: number): number {
  return (
    byte(n, p) |
    (byte(n, p + 1) << 8) |
    (byte(n, p + 2) << 16) |
    (byte(n, p + 3) << 24)
  );
}
function put(n: (number | null)[], p: number, v: number): void {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
}
function put32(n: (number | null)[], p: number, v: number): void {
  put(n, p, v);
  put(n, p + 2, v >> 16);
}
function validate(w: CraterWorld): void {
  if (
    w.terrain.bytes.length !== MAP_BYTES ||
    w.terrain.bytes.some((v) => !integer(v, 0, 255))
  )
    throw new Error("Original crater terrain image is required");
  if (
    w.missionPrefix.length <= CRATER_JOB_COUNT ||
    w.missionPrefix.some((v) => !integer(v, 0, 255))
  )
    throw new Error("Actual serialized crater job priors are required");
  let count = 0;
  for (let slot = 0; slot < 25; slot++)
    if (word(w.missionPrefix, CRATER_JOB_BASE + slot * 176 + 12) >= 0) count++;
  if (byte(w.missionPrefix, CRATER_JOB_COUNT) !== count)
    throw new Error("Crater native job count mismatch");
}
function rules(r: CraterRules): void {
  if (
    r.directions.length !== 9 ||
    r.directions.some(
      (p) => p.length !== 2 || p.some((v) => !integer(v, -32768, 32767)),
    ) ||
    r.largeTextures.length !== 9 ||
    r.largeFlags.length !== 9 ||
    [...r.largeTextures, ...r.largeFlags].some((v) => !integer(v, 0, 255)) ||
    r.terrainBorder.length !== 8192 ||
    r.terrainBorder.some((v) => !integer(v, 0, 255)) ||
    r.terrainLightVector.length !== 3 ||
    r.terrainLightVector.some((v) => !integer(v, -0x80000000, 0x7fffffff))
  )
    throw new Error("Admitted original crater tables are required");
}
function offset(
  point: readonly number[],
  delta: readonly number[],
  factor = 1,
): [number, number] {
  return [
    wrap16(point[0] + delta[0] * factor),
    wrap16(point[1] + delta[1] * factor),
  ];
}
/**8D1B0 preserves protected textures and ordered first/second passes. */
export function repairCraterRectangle(
  t: TerrainState,
  min: readonly number[],
  max: readonly number[],
  table: readonly number[],
): number[] {
  if (
    t.bytes.length !== MAP_BYTES ||
    table.length !== 8192 ||
    table.some((v) => !integer(v, 0, 255))
  )
    throw new Error("Admitted source crater border image is required");
  const width = Math.trunc(wrap16(max[0] * 2 - min[0] * 2) / 512),
    height = Math.trunc(wrap16(max[1] * 2 - min[1] * 2) / 512);
  if (width < 0 || height < 0 || width > 125 || height > 125)
    throw new Error("Unsupported source crater border extent");
  const x = (min[0] & 32767) >> 8,
    y = (min[1] & 32767) >> 8;
  for (let row = 0; row <= height; row++)
    for (let col = 0; col <= width; col++)
      for (const [dx, dy] of corners) {
        const p = cellIndex(x + col + dx, y + row + dy) * 14;
        if (!(t.bytes[p + 5] & 128)) t.bytes[p + 4] = 0x97;
      }
  const out: number[] = [];
  for (let row = -1; row <= height; row++)
    for (let col = -1; col <= width; col++) {
      const c = cellIndex(x + col, y + row),
        p = c * 14;
      if (t.bytes[p + 4] !== 0x97) continue;
      const materials = gridCorners.map(
          ([dx, dy]) =>
            t.bytes[cellIndex(x + col + dx, y + row + dy) * 14 + 5] & 7,
        ),
        key = materials.reduce((v, m) => (v << 3) | m, 0) * 2,
        texture = table[key];
      t.bytes[p + 4] = texture;
      t.bytes[p + 11] =
        materials.includes(0) && materials.some((v) => v !== 0)
          ? t.bytes[p + 11] | 2
          : t.bytes[p + 11] & 253;
      out.push(c);
      t.bytes[p + 5] &= 0x87;
      if (texture >= 8)
        t.bytes[p + 5] = (t.bytes[p + 5] + table[key + 1]) & 255;
    }
  return out;
}
function duration(job: number[], t: TerrainState): void {
  let remaining = 0;
  for (let row = 0; row < job[9]; row++)
    for (let col = 0; col < job[8]; col++) {
      const c = worldCell(
        wrap16(word(job, 0) + col * 256),
        wrap16(word(job, 2) + row * 256),
      );
      remaining = Math.max(
        remaining,
        Math.trunc(
          Math.abs(word(job, 14 + row * 18 + col * 2) - readWord(t, c, 2)) /
            word(job, 10),
        ),
      );
    }
  if (remaining >= 32767)
    throw new Error("Crater source duration overflows signed word");
  put(job, 12, remaining + 1);
}
/**79160 capacity check happens before77C60's map writes or RNG. */
export function createCraterJob<W extends CraterWorld>(
  world: W,
  point: [number, number],
  variant: 0 | 1,
  r: CraterRules,
): CraterAllocation {
  validate(world);
  if (
    point.some((v) => !integer(v, -32768, 32767)) ||
    (variant !== 0 && variant !== 1)
  )
    throw new Error("Unsupported original crater request");
  if (world.missionPrefix[CRATER_JOB_COUNT] >= 25)
    return { slot: null, viewportInvalidations: [] };
  rules(r);
  const s = structuredClone(world),
    slot = Array.from({ length: 25 }, (_, i) => i).find(
      (i) => word(s.missionPrefix, CRATER_JOB_BASE + i * 176 + 12) < 0,
    )!;
  const start = CRATER_JOB_BASE + slot * 176,
    job = s.missionPrefix.slice(start, start + 176),
    dim = variant + 3,
    anchor = variant === 1 ? point.map((v) => v & ~255) : point,
    min = offset(anchor, r.directions[7]),
    max = offset(anchor, r.directions[3], variant + 1);
  put(job, 0, min[0]);
  put(job, 2, min[1]);
  put(job, 4, max[0]);
  put(job, 6, max[1]);
  job[8] = job[9] = dim;
  put(job, 10, 640);
  for (let row = 0; row < dim; row++)
    for (let col = 0; col < dim; col++) {
      const c = worldCell(
          wrap16(min[0] + col * 256),
          wrap16(min[1] + row * 256),
        ),
        p = c * 14;
      put(job, 14 + row * 18 + col * 2, readWord(s.terrain, c, 2));
      s.terrain.bytes[p + 5] = (s.terrain.bytes[p + 5] & 248) | 7;
    }
  if (variant === 0) {
    let p = min;
    for (const [i, flag] of [0x87, 0x97, 0xb7, 0xa7].entries()) {
      const at = worldCell(...p) * 14;
      s.terrain.bytes[at + 4] = 32;
      s.terrain.bytes[at + 5] = flag;
      if (i < 3) p = offset(p, r.directions[[2, 4, 6][i]]);
    }
  } else
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const p =
          worldCell(wrap16(min[0] + col * 256), wrap16(min[1] + row * 256)) *
          14;
        s.terrain.bytes[p + 4] = r.largeTextures[row * 3 + col];
        s.terrain.bytes[p + 5] = r.largeFlags[row * 3 + col] | 0x87;
      }
  //8D580 uses contiguous records inside each row, unlike the wrapped grid capture.
  for (let row = 0; row < dim; row++) {
    const c = worldCell(min[0], wrap16(min[1] + row * 256));
    if (c + dim > 16384)
      throw new Error("Crater protected rectangle leaves original map storage");
    for (let col = 0; col < dim; col++)
      s.terrain.bytes[(c + col) * 14 + 11] |= 16;
  }
  const viewportInvalidations = repairCraterRectangle(
    s.terrain,
    min,
    max,
    r.terrainBorder,
  );
  const adjust = (at: number, sign: number, base: number, mod: number) =>
    put(
      job,
      at,
      word(job, at) + sign * (base + 64 * (nextRandom(s.rng) % mod)),
    );
  if (variant === 0) {
    adjust(34, -1, 640, 7);
    for (const at of [16, 32, 36, 52]) adjust(at, 1, 320, 5);
    for (const at of [14, 18, 50, 54]) adjust(at, 1, 128, 3);
  } else {
    for (const at of [34, 36, 52, 54]) adjust(at, -1, 640, 7);
    for (const at of [16, 18, 32, 38, 50, 56, 70, 72, 14, 20, 68, 74])
      adjust(at, 1, 128, 3);
  }
  duration(job, s.terrain);
  s.missionPrefix.splice(start, 176, ...job);
  s.missionPrefix[CRATER_JOB_COUNT]++;
  s.terrain.revision++;
  validate(s);
  Object.assign(world, s);
  return { slot, viewportInvalidations };
}
function linked<W extends CraterWorld>(
  s: W,
  cell: number,
  operation: "shade" | "height",
  c: CraterContext<W>,
  receipt: CraterReceipt,
): void {
  const records = c.linkedRecords(s, cell);
  let kind = s.terrain.bytes[cell * 14 + 8],
    index =
      s.terrain.bytes[cell * 14 + 6] | (s.terrain.bytes[cell * 14 + 7] << 8);
  const seen = new Set<string>();
  for (const record of records) {
    const n = record.native,
      nativeKind = byte(n, 6),
      nativeIndex = word(n, 15) & 65535;
    if (
      !kind ||
      nativeKind !== kind ||
      nativeIndex !== index ||
      seen.has(record.id)
    )
      throw new Error(
        "Crater actual linked list differs from native head/chain",
      );
    seen.add(record.id);
    kind = byte(n, 5);
    index = word(n, 3) & 65535;
    if (![1, 2, 3, 4, 5, 8].includes(nativeKind))
      throw new Error("Unsupported crater linked entity family");
    let changed = false;
    if (operation === "shade") {
      if ([2, 4].includes(nativeKind) && !(byte(n, 21) & 2)) {
        n[23] = effectTerrainShade(s.terrain, word(n, 7), word(n, 9));
        changed = true;
      }
    } else {
      const ground = groundHeight(s.terrain, word(n, 7), word(n, 9));
      put32(n, 17, ground);
      changed = true;
      if ([1, 3, 5, 8].includes(nativeKind)) {
        const height = dword(n, 39),
          forced = nativeKind === 5 && byte(n, 69) === 46;
        if (((height - ground) | 0) < 0 || forced) put32(n, 39, ground);
      }
    }
    if (changed) {
      receipt.linkedWrites.push({ id: record.id, operation });
      c.linkedChanged?.(s, record, operation);
    }
  }
  if (kind) throw new Error("Crater linked list is incomplete");
}
function refreshVertex<W extends CraterWorld>(
  s: W,
  x: number,
  y: number,
  slope: boolean,
  c: CraterContext<W>,
  r: CraterReceipt,
): void {
  r.viewportInvalidations.push(cellIndex(x, y));
  for (const [i, [dx, dy]] of corners.entries()) {
    const cell = cellIndex(x + dx, y + dy);
    s.terrain.bytes[cell * 14 + 11] |= slope ? 12 : [12, 8, 12, 4][i];
    linked(s, cell, "shade", c, r);
  }
}
function shade(
  s: CraterWorld,
  cell: number,
  sourceIndex: number,
  r: CraterRules,
): void {
  if (sourceIndex === -1) sourceIndex = cell;
  const p = cell * 14,
    water = word(s.missionPrefix, 0x1c63);
  let value: number;
  if (!(s.terrain.bytes[p + 5] & 7)) {
    if (water === 0) throw new Error("Crater water shade divisor is zero");
    value = wrap16(
      8192 - Math.trunc(((water - readWord(s.terrain, cell, 2)) << 12) / water),
    );
  } else {
    const x = wrap16((sourceIndex & 127) * 256 - 16),
      y = wrap16((sourceIndex >> 7) * 256 - 2),
      normals = [
        terrainNormal(s.terrain, x, y),
        terrainNormal(s.terrain, x, wrap16(y + 4)),
      ];
    let sum = 0;
    for (const n of normals)
      for (let axis = 0; axis < 3; axis++)
        sum = (sum + (Math.imul(n[axis], r.terrainLightVector[axis]) >> 8)) | 0;
    const average = Math.trunc(sum / 2);
    value =
      average < -164
        ? 8192
        : Math.max(
            0xf00,
            wrap16(
              8192 - Math.trunc((Math.imul(average + 256, 3) << 12) / 512),
            ),
          );
  }
  put(s.terrain.bytes, p, value);
}
function setHeight<W extends CraterWorld>(
  s: W,
  cell: number,
  requested: number,
  c: CraterContext<W>,
  r: CraterReceipt,
): void {
  const write = (index: number, height: number) => {
    const old = readWord(s.terrain, index, 2);
    put(s.terrain.bytes, index * 14 + 2, height);
    r.heightWrites.push({ cell: index, before: old, after: wrap16(height) });
  };
  const assigned = Math.max(0, wrap16(requested)),
    x = cell & 127,
    y = cell >> 7;
  write(cell, assigned);
  refreshVertex(s, x, y, false, c, r);
  for (const direction of [-1, 1]) {
    let previous = readWord(s.terrain, cell, 2);
    for (let distance = 1; distance <= 128; distance++) {
      const sx = x + direction * distance,
        sy = y + direction * distance,
        index = cellIndex(sx, sy),
        old = readWord(s.terrain, index, 2),
        bound = previous + direction * 832;
      if (direction < 0 ? old >= bound : old <= bound) break;
      const value = wrap16(bound - direction * (nextRandom(s.rng) % 8));
      write(index, value);
      shade(s, index, sy * 128 + sx, c.rules);
      refreshVertex(s, sx, sy, true, c, r);
      previous = value;
      if (distance === 128)
        throw new Error("Crater diagonal height repair did not converge");
    }
  }
  for (const [dx, dy] of corners)
    linked(s, cellIndex(x + dx, y + dy), "height", c, r);
}
function classify(s: CraterWorld, cell: number): void {
  const t = s.terrain,
    p = cell * 14,
    x = cell & 127,
    y = cell >> 7,
    dx = wrap16(word(s.missionPrefix, 0x1ea2) * 2 - x * 256 * 2) >> 1,
    dy = wrap16(word(s.missionPrefix, 0x1ea4) * 2 - y * 256 * 2) >> 1,
    root = integerSqrt((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0),
    water = word(s.missionPrefix, 0x1c63),
    term = wrap16(
      -(((32768 - root) >> 8) + ((readWord(t, cell, 2) - water) >> 8)),
    );
  put(t.bytes, p + 9, term);
  if (t.bytes[p + 11] & 16) return;
  const heights = gridCorners.map(([a, b]) =>
      readWord(t, cellIndex(x + a, y + b), 2),
    ),
    slope = wrap16(Math.max(...heights) - Math.min(...heights)),
    temperature = wrap16(word(s.missionPrefix, 0x1c61) + term);
  t.bytes[p + 5] =
    readWord(t, cell, 2) <= water
      ? 0
      : slope > 2560
        ? 7
        : temperature <= 25
          ? 6
          : temperature <= 35
            ? 7
            : temperature <= 75
              ? 3 + Number(slope >= 2048)
              : temperature <= 85
                ? 4
                : slope < 512
                  ? 2
                  : 5;
  t.bytes[p + 13] = 1;
}
function prepare(
  s: CraterWorld,
  cell: number,
  sourceIndex: number,
  r: CraterRules,
): number[] {
  if (sourceIndex === -1) sourceIndex = cell;
  const x = sourceIndex & 127,
    y = sourceIndex >> 7;
  for (const [dx, dy] of gridCorners) {
    const p = cellIndex(x + dx, y + dy) * 14 + 5;
    if (s.terrain.bytes[p] & 7)
      s.terrain.bytes[p] = (s.terrain.bytes[p] & 248) | 7;
  }
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      repairMaterials(s.terrain, cellIndex(x + dx, y + dy));
  return repairCraterRectangle(
    s.terrain,
    [wrap16((x - 1) * 256), wrap16((y - 1) * 256)],
    [wrap16((x + 1) * 256), wrap16((y + 1) * 256)],
    r.terrainBorder,
  );
}
/**78E30 sees each preceding height setter's slope changes.79220 retires in
 * ascending native slot order and runs one post-pass zone refresh. */
export function stepCraterJobs<W extends CraterWorld>(
  world: W,
  c: CraterContext<W>,
): CraterReceipt[] {
  validate(world);
  if (!world.missionPrefix[CRATER_JOB_COUNT]) return [];
  rules(c.rules);
  const s = structuredClone(world),
    out: CraterReceipt[] = [];
  for (let slot = 0; slot < 25; slot++) {
    const start = CRATER_JOB_BASE + slot * 176,
      before = s.missionPrefix.slice(start, start + 176);
    if (word(before, 12) < 0) continue;
    if (
      ![2, 3, 4].includes(before[8]) ||
      before[8] !== before[9] ||
      word(before, 10) <= 0 ||
      word(before, 12) <= 0
    )
      throw new Error("Unsupported original crater/terrain job prior");
    const job = before.slice(),
      r: CraterReceipt = {
        slot,
        before,
        after: job,
        retired: false,
        countBefore: s.missionPrefix[CRATER_JOB_COUNT],
        countAfter: s.missionPrefix[CRATER_JOB_COUNT],
        heightWrites: [],
        linkedWrites: [],
        viewportInvalidations: [],
      },
      min = [word(job, 0), word(job, 2)],
      max = [word(job, 4), word(job, 6)],
      step = word(job, 10);
    for (let row = 0; row < job[9]; row++)
      for (let col = 0; col < job[8]; col++) {
        const cell = worldCell(
            wrap16(min[0] + col * 256),
            wrap16(min[1] + row * 256),
          ),
          old = readWord(s.terrain, cell, 2),
          target = word(job, 14 + row * 18 + col * 2);
        if (old !== target)
          setHeight(
            s,
            cell,
            Math.abs(target - old) > step
              ? wrap16(old + Math.sign(target - old) * step)
              : target,
            c,
            r,
          );
      }
    const remaining = word(job, 12) - 1;
    put(job, 12, remaining);
    if (!(remaining & 1)) {
      for (let row = 0; row < job[9]; row++)
        for (let col = 0; col < job[8]; col++)
          classify(
            s,
            worldCell(wrap16(min[0] + col * 256), wrap16(min[1] + row * 256)),
          );
      const low = offset(min, c.rules.directions[7]),
        high = offset(max, c.rules.directions[3]);
      for (let row = 0; row < job[9] + 2; row++)
        for (let col = 0; col < job[8] + 2; col++)
          repairMaterials(
            s.terrain,
            worldCell(wrap16(low[0] + col * 256), wrap16(low[1] + row * 256)),
          );
      r.viewportInvalidations.push(
        ...repairCraterRectangle(s.terrain, low, high, c.rules.terrainBorder),
      );
      //8D660 uses signed coordinate shifts and source indices for the shader.
      const x = (low[0] >> 8) - 1,
        y = (low[1] >> 8) - 1,
        width = (high[0] >> 8) - (low[0] >> 8) + 2,
        height = (high[1] >> 8) - (low[1] >> 8) + 2;
      if (width > 130 || height > 130)
        throw new Error("Unsupported crater refresh extent");
      for (let row = 0; row < height; row++)
        for (let col = 0; col < width; col++) {
          const sx = x + col,
            sy = y + row,
            cell = cellIndex(sx, sy),
            p = cell * 14,
            sourceIndex = sy * 128 + sx;
          if (s.terrain.bytes[p + 4] === 0x97)
            r.viewportInvalidations.push(
              ...prepare(s, cell, sourceIndex, c.rules),
            );
          if (remaining === 0 && s.terrain.bytes[p + 11] & 2)
            for (const [dx, dy] of gridCorners) {
              const corner = cellIndex(sx + dx, sy + dy),
                at = corner * 14,
                water = word(s.missionPrefix, 0x1c63);
              if (
                !(s.terrain.bytes[at + 5] & 7) &&
                water - readWord(s.terrain, corner, 2) >= 384
              )
                setHeight(
                  s,
                  corner,
                  wrap16(water - (nextRandom(s.rng) % 384)),
                  c,
                  r,
                );
            }
          shade(s, cell, sourceIndex, c.rules);
        }
    }
    if (remaining <= 0) {
      put(job, 12, -1);
      s.missionPrefix[CRATER_JOB_COUNT]--;
      r.retired = true;
    }
    r.countAfter = s.missionPrefix[CRATER_JOB_COUNT];
    s.missionPrefix.splice(start, 176, ...job);
    out.push(r);
  }
  if (out.some((r) => r.retired)) {
    const count = byte(s.missionPrefix, 0x34b8),
      active: number[] = [];
    if (count > 64)
      throw new Error("Crater source terrain-zone table count exceeds64");
    for (let i = 0; i < count; i++)
      if (dword(s.missionPrefix, 0x2ff8 + i * 19 + 14) > 0) active.push(i);
    if (active.length) {
      if (!c.refreshZones)
        throw new Error(
          "Original crater retirement requires79D50 zone refresh",
        );
      out[out.length - 1].viewportInvalidations.push(
        ...c.refreshZones(s, active),
      );
    }
  }
  s.terrain.revision++;
  validate(s);
  Object.assign(world, s);
  return out;
}
