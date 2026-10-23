import { nextRandom, type GeneRng } from "./random";
export const MAP_BYTES = 128 * 128 * 14;
export interface TerrainState {
  bytes: number[];
  revision: number;
}
export interface TerrainClimate {
  water: number;
  climate: number;
  center: [number, number];
}
export interface SiteReservation {
  anchor: [number, number];
  footprint: number;
  cells: number[];
  vertices: number[];
  targetHeight: number;
}
export interface TerraformJob {
  id: number;
  /** Original shared25-slot terrain pool identity in the campaign host. */
  nativeSlot?: number;
  owner: number;
  reservation: SiteReservation;
  step: number;
  remaining: number;
  status: "working" | "complete" | "cancelled";
}
export function cellIndex(x: number, y: number): number {
  return (y & 127) * 128 + (x & 127);
}
export function worldCell(x: number, y: number): number {
  return cellIndex(x >> 8, y >> 8);
}
const at = (cell: number, offset: number) => (cell & 16383) * 14 + offset;
export function readWord(
  t: TerrainState,
  cell: number,
  offset: number,
): number {
  const p = at(cell, offset);
  return ((t.bytes[p] | (t.bytes[p + 1] << 8)) << 16) >> 16;
}
function writeWord(
  t: TerrainState,
  cell: number,
  offset: number,
  value: number,
): void {
  const p = at(cell, offset);
  t.bytes[p] = value & 255;
  t.bytes[p + 1] = (value >> 8) & 255;
}
export function terrainFromBytes(bytes: readonly number[]): TerrainState {
  if (
    bytes.length !== MAP_BYTES ||
    bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    throw new Error("Invalid original terrain extent");
  return { bytes: [...bytes], revision: 0 };
}
export function torusDelta(target: number, current: number): number {
  return (((target - current) * 2) << 16) >> 17;
}
export function groundHeight(t: TerrainState, x: number, y: number): number {
  const cx = (x >> 8) & 127,
    cy = (y >> 8) & 127,
    fx = x & 255,
    fy = y & 255;
  const h = (dx: number, dy: number) =>
    readWord(t, cellIndex(cx + dx, cy + dy), 2);
  return (
    2 * h(0, 0) +
    ((fx < fy
      ? (h(1, 1) - h(0, 1)) * fx + (h(0, 1) - h(0, 0)) * fy
      : (h(1, 0) - h(0, 0)) * fx + (h(1, 1) - h(1, 0)) * fy) >>
      7)
  );
}
export function integerSqrt(n: number): number {
  let remainder = n >>> 0,
    root = 0,
    bit = 0x40000000;
  while (bit > remainder) bit >>>= 2;
  while (bit) {
    if (remainder >= root + bit) {
      remainder -= root + bit;
      root = (root >>> 1) + bit;
    } else root >>>= 1;
    bit >>>= 2;
  }
  return root;
}
function vertexCells(anchor: [number, number], footprint: number): number[] {
  const shift = footprint === 1 ? 0 : -1,
    cx = (anchor[0] >> 8) + shift,
    cy = (anchor[1] >> 8) + shift;
  return Array.from({ length: (footprint + 1) ** 2 }, (_, i) =>
    cellIndex(cx + (i % (footprint + 1)), cy + Math.floor(i / (footprint + 1))),
  );
}
export function siteReason(
  t: TerrainState,
  anchor: [number, number],
  footprint: number,
  plants: ReadonlySet<number>,
  requireMineral = false,
): string | null {
  if (![1, 2, 3].includes(footprint)) return "Unsupported building footprint";
  const vertices = vertexCells(anchor, footprint),
    dim = footprint + 1;
  for (let y = 0; y < footprint; y++)
    for (let x = 0; x < footprint; x++) {
      const c = vertices[y * dim + x],
        p = c * 14;
      if (
        t.bytes[p + 11] & 1 ||
        (t.bytes[p + 4] >= 0x20 && t.bytes[p + 4] <= 0x22)
      )
        return "Site blocked";
      if (plants.has(c)) return "Site occupied by plants";
    }
  if (vertices.some((c) => (t.bytes[c * 14 + 5] & 7) <= 1))
    return "Site crosses water";
  if (requireMineral && !vertices.some((c) => t.bytes[c * 14 + 13] > 1))
    return "No mineral resources at site";
  return null;
}
/** Material boundary repair preserves the source's ordered corner dependency. */
export function repairMaterials(t: TerrainState, index: number): void {
  const x = index & 127,
    y = index >> 7,
    p = (dx: number, dy: number) => cellIndex(x + dx, y + dy) * 14 + 5;
  const corners = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)],
    counts = Array(7).fill(0);
  for (const i of corners) if (t.bytes[i] < 7) counts[t.bytes[i]]++;
  let first = corners[0],
    propagate = false;
  if (counts[2] && counts[2] + counts[5] !== 4) {
    for (const i of corners) if (t.bytes[i] === 2) t.bytes[i] = 5;
    counts[2] = 0;
    counts[5]++;
    first = corners[3];
  }
  if (counts[3] && (counts[5] || (counts[6] && counts[4]))) {
    [first, ...corners.slice(1)].forEach((i, n) => {
      if (t.bytes[i] === 3) {
        t.bytes[i] = 4;
        if (n < 2) propagate = true;
      }
    });
    first = corners[3];
  }
  if (counts[0] && (counts[5] || counts[3] || counts[2]))
    [first, ...corners.slice(1)].forEach((i, n) => {
      if (t.bytes[i] !== 0) {
        t.bytes[i] = 4;
        if (n < 2) propagate = true;
      }
    });
  if (propagate)
    for (const [dx, dy] of [
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [2, -1],
      [2, 0],
    ]) {
      const i = p(dx, dy);
      if (t.bytes[i] === 2) t.bytes[i] = 5;
    }
}
export function rebuildBorders(
  t: TerrainState,
  cells: readonly number[],
  table: readonly number[],
): void {
  if (table.length !== 8192)
    throw new Error("Initialized terrain border table is required");
  const changed = new Set<number>();
  for (const c of cells) {
    const x = c & 127,
      y = c >> 7;
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, -1],
    ]) {
      const index = cellIndex(x + dx, y + dy);
      if (!(t.bytes[index * 14 + 5] & 128)) changed.add(index);
    }
  }
  for (const c of changed) {
    const x = c & 127,
      y = c >> 7,
      p = c * 14,
      values = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([dx, dy]) => t.bytes[cellIndex(x + dx, y + dy) * 14 + 5] & 7);
    const key = values.reduce((a, v) => (a << 3) | v, 0) * 2,
      texture = table[key];
    t.bytes[p + 4] = texture;
    if (values.includes(0) && values.some((v) => v !== 0)) t.bytes[p + 11] |= 2;
    else t.bytes[p + 11] &= 253;
    t.bytes[p + 5] =
      (t.bytes[p + 5] & 0x87) + (texture >= 8 ? table[key + 1] : 0);
  }
  t.revision++;
}
export function reserveSite(
  t: TerrainState,
  anchor: [number, number],
  footprint: number,
  table: readonly number[],
): SiteReservation {
  if (![1, 2, 3].includes(footprint)) throw new Error("Unsupported footprint");
  const vertices = vertexCells(anchor, footprint),
    dim = footprint + 1,
    cells: number[] = [];
  for (let y = 0; y < footprint; y++)
    for (let x = 0; x < footprint; x++) cells.push(vertices[y * dim + x]);
  // Match source preparation's center/perimeter walk, not a reordered rectangle.
  const steps =
    footprint === 1
      ? []
      : footprint === 2
        ? [
            [-1, 0],
            [0, -1],
            [1, 0],
          ]
        : [
            [0, -1],
            [-1, 0],
            [0, 1],
            [0, 1],
            [1, 0],
            [1, 0],
            [0, -1],
            [0, -1],
          ];
  let cx = anchor[0] >> 8,
    cy = anchor[1] >> 8;
  for (let n = 0; n <= steps.length; n++) {
    const c = cellIndex(cx, cy);
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const p = cellIndex(cx + dx, cy + dy) * 14 + 5;
      if (t.bytes[p] & 7) t.bytes[p] = (t.bytes[p] & 248) | 7;
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        repairMaterials(t, cellIndex(cx + dx, cy + dy));
    rebuildBorders(
      t,
      Array.from({ length: 9 }, (_, i) =>
        cellIndex(cx + (i % 3) - 1, cy + Math.floor(i / 3) - 1),
      ),
      table,
    );
    t.bytes[c * 14 + 11] |= 1;
    if (n < steps.length) {
      cx += steps[n][0];
      cy += steps[n][1];
    }
  }
  for (const c of vertices) t.bytes[c * 14 + 11] |= 16;
  const perimeter = vertices.filter(
    (_, i) =>
      i < dim || i >= dim * (dim - 1) || i % dim === 0 || i % dim === dim - 1,
  );
  const sum = perimeter.reduce((s, c) => s + readWord(t, c, 2), 0);
  return {
    anchor: [anchor[0] & 0x7f00, anchor[1] & 0x7f00],
    footprint,
    cells,
    vertices,
    targetHeight:
      perimeter.length === 4
        ? sum >> 2
        : perimeter.length === 8
          ? sum >> 3
          : Math.trunc(sum / 12),
  };
}
export function classifyCell(
  t: TerrainState,
  index: number,
  environment: TerrainClimate,
): void {
  const x = index & 127,
    y = index >> 7,
    dx = torusDelta(environment.center[0], x << 8),
    dy = torusDelta(environment.center[1], y << 8);
  const root = integerSqrt((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0),
    h = readWord(t, index, 2);
  const term = -(((32768 - root) >> 8) + ((h - environment.water) >> 8));
  writeWord(t, index, 9, term);
  if (t.bytes[index * 14 + 11] & 16) return;
  const heights = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([a, b]) => readWord(t, cellIndex(x + a, y + b), 2));
  const slope = Math.max(...heights) - Math.min(...heights),
    temperature = environment.climate + term;
  t.bytes[index * 14 + 5] =
    h <= environment.water
      ? 0
      : slope > 0xa00
        ? 7
        : temperature <= 25
          ? 6
          : temperature <= 35
            ? 7
            : temperature <= 75
              ? 3 + Number(slope >= 0x800)
              : temperature <= 85
                ? 4
                : slope < 0x200
                  ? 2
                  : 5;
  t.bytes[index * 14 + 13] = 1;
}
export function changeHeight(
  t: TerrainState,
  index: number,
  requested: number,
  rng: GeneRng,
): number[] {
  writeWord(t, index, 2, Math.max(0, requested));
  const changed = [index],
    x = index & 127,
    y = index >> 7;
  for (const direction of [-1, 1]) {
    let previous = readWord(t, index, 2);
    for (let distance = 1; distance <= 128; distance++) {
      const c = cellIndex(x + direction * distance, y + direction * distance),
        old = readWord(t, c, 2),
        bound = previous + direction * 0x340;
      if (direction < 0 ? old >= bound : old <= bound) break;
      const value = bound - direction * (nextRandom(rng) % 8);
      writeWord(t, c, 2, value);
      changed.push(c);
      previous = value;
      if (distance === 128)
        throw new Error("Terrain diagonal repair failed to converge");
    }
  }
  t.revision++;
  return changed;
}
export function beginTerraform(
  id: number,
  owner: number,
  reservation: SiteReservation,
  skill: number,
  jobs: readonly TerraformJob[],
  t: TerrainState,
): TerraformJob | null {
  const step = skill >> 2;
  if (step <= 0) throw new Error("Engineer skill cannot perform terrain work");
  if (jobs.filter((j) => j.status === "working").length >= 25) return null;
  const remaining =
    Math.max(
      ...reservation.vertices.map((c) =>
        Math.trunc(
          Math.abs(reservation.targetHeight - readWord(t, c, 2)) / step,
        ),
      ),
    ) + 1;
  if (remaining > 32767)
    throw new Error("Terrain work duration exceeds source limit");
  return {
    id,
    owner,
    reservation: structuredClone(reservation),
    step,
    remaining,
    status: "working",
  };
}
export function stepTerraform(
  t: TerrainState,
  job: TerraformJob,
  rng: GeneRng,
  environment: TerrainClimate,
  table: readonly number[],
): number[] {
  if (job.status !== "working") return [];
  const changed: number[] = [];
  for (const c of job.reservation.vertices) {
    const old = readWord(t, c, 2),
      target = job.reservation.targetHeight;
    if (old !== target)
      changed.push(
        ...changeHeight(
          t,
          c,
          old +
            Math.sign(target - old) *
              Math.min(Math.abs(target - old), job.step),
          rng,
        ),
      );
  }
  job.remaining--;
  if (!(job.remaining & 1)) {
    const around = new Set<number>();
    for (const c of job.reservation.vertices) {
      classifyCell(t, c, environment);
      const x = c & 127,
        y = c >> 7;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) around.add(cellIndex(x + dx, y + dy));
    }
    for (const c of around) repairMaterials(t, c);
    rebuildBorders(t, [...around], table);
  }
  if (job.remaining <= 0) job.status = "complete";
  return changed;
}
export function releaseSite(
  t: TerrainState,
  reservation: SiteReservation,
  environment: TerrainClimate,
  table: readonly number[],
): void {
  for (const c of reservation.cells) t.bytes[c * 14 + 11] &= 254;
  for (const c of reservation.vertices) {
    const x = c & 127,
      y = c >> 7,
      stillReserved = [
        [0, 0],
        [-1, 0],
        [-1, -1],
        [0, -1],
      ].some(([dx, dy]) => t.bytes[cellIndex(x + dx, y + dy) * 14 + 11] & 1);
    if (!stillReserved) t.bytes[c * 14 + 11] &= 239;
    classifyCell(t, c, environment);
  }
  rebuildBorders(t, reservation.vertices, table);
}
