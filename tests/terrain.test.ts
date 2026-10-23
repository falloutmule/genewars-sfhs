import { describe, it, expect } from "vitest";
import {
  MAP_BYTES,
  terrainFromBytes,
  groundHeight,
  torusDelta,
  integerSqrt,
  cellIndex,
  readWord,
  siteReason,
  reserveSite,
  beginTerraform,
  stepTerraform,
  changeHeight,
  releaseSite,
  type TerrainClimate,
} from "../src/sim/mechanics/terrain";
const border = Array(8192).fill(0),
  climate: TerrainClimate = { water: 0, climate: 140, center: [0, 0] };
function flat(height = 1000) {
  const bytes = Array(MAP_BYTES).fill(0);
  for (let i = 0; i < 16384; i++) {
    bytes[i * 14 + 2] = height & 255;
    bytes[i * 14 + 3] = height >> 8;
    bytes[i * 14 + 5] = 2;
    bytes[i * 14 + 4] = 5;
  }
  return terrainFromBytes(bytes);
}
describe("source terrain and terraform lifecycle", () => {
  it("uses 15-bit torus deltas and doubled signed piecewise heights", () => {
    const t = flat();
    expect(groundHeight(t, 32767, 0)).toBe(2000);
    expect(torusDelta(0, 32767)).toBe(1);
    expect(torusDelta(32767, 0)).toBe(-1);
    expect(integerSqrt(0xffffffff)).toBe(65535);
  });
  it("reports water, plant occupancy and reservations independently", () => {
    const t = flat(),
      c = cellIndex(8, 8);
    expect(siteReason(t, [2048, 2048], 1, new Set())).toBeNull();
    expect(siteReason(t, [2048, 2048], 1, new Set([c]))).toContain("plants");
    t.bytes[c * 14 + 11] = 1;
    expect(siteReason(t, [2048, 2048], 1, new Set())).toBe("Site blocked");
    t.bytes[c * 14 + 11] = 0;
    t.bytes[c * 14 + 5] = 0;
    expect(siteReason(t, [2048, 2048], 1, new Set())).toContain("water");
  });
  it("reserves source-centered cells/vertices and averages perimeter heights", () => {
    const t = flat(),
      r = reserveSite(t, [8 * 256 + 127, 8 * 256 + 127], 3, border);
    expect(r.cells).toHaveLength(9);
    expect(r.vertices).toHaveLength(16);
    expect(r.targetHeight).toBe(1000);
    expect(r.cells.every((c) => t.bytes[c * 14 + 11] & 1)).toBe(true);
    expect(r.vertices.every((c) => t.bytes[c * 14 + 11] & 16)).toBe(true);
  });
  it("limits shared jobs, uses skill quarters and completes flat work in one callback", () => {
    const t = flat(),
      r = reserveSite(t, [2048, 2048], 1, border),
      job = beginTerraform(1, 1, r, 31, [], t)!;
    expect(job.step).toBe(7);
    expect(job.remaining).toBe(1);
    expect(beginTerraform(2, 1, r, 31, Array(25).fill(job), t)).toBeNull();
    stepTerraform(t, job, { seed: 1, draws: 0, ring: 0 }, climate, border);
    expect(job.status).toBe("complete");
  });
  it("saves and deterministically continues active terrain work", () => {
    const t = flat(),
      r = reserveSite(t, [2048, 2048], 1, border);
    r.targetHeight = 1050;
    const job = beginTerraform(1, 1, r, 28, [], t)!,
      rng = { seed: 5428, draws: 0, ring: 0 };
    stepTerraform(t, job, rng, climate, border);
    const restored = JSON.parse(JSON.stringify({ t, job, rng }));
    while (job.status === "working")
      stepTerraform(t, job, rng, climate, border);
    while (restored.job.status === "working")
      stepTerraform(restored.t, restored.job, restored.rng, climate, border);
    expect(restored).toEqual({ t, job, rng });
    expect(r.vertices.every((c) => readWord(t, c, 2) === 1050)).toBe(true);
  });
  it("repairs extreme diagonal slopes with the shared deterministic RNG", () => {
    const t = flat(5000),
      rng = { seed: 5428, draws: 0, ring: 0 };
    const cells = changeHeight(t, cellIndex(8, 8), 0, rng);
    expect(cells.length).toBeGreaterThan(1);
    expect(rng.draws).toBe(cells.length - 1);
    expect(readWord(t, cellIndex(9, 9), 2)).toBeLessThanOrEqual(0x340);
  });
  it("releases cancellation reservations while preserving a neighboring site", () => {
    const t = flat(),
      a = reserveSite(t, [2048, 2048], 1, border),
      b = reserveSite(t, [2304, 2048], 1, border);
    releaseSite(t, a, climate, border);
    expect(t.bytes[b.cells[0] * 14 + 11] & 1).toBe(1);
    expect(t.bytes[cellIndex(9, 8) * 14 + 11] & 16).toBe(16);
  });
});
