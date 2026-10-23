import { describe, expect, it } from "vitest";
import {
  createCraterJob,
  stepCraterJobs,
  CRATER_JOB_BASE as BASE,
  CRATER_JOB_COUNT as COUNT,
  type CraterContext,
  type CraterWorld,
  type CraterRules,
} from "../src/sim/mechanics/crater";
import { cellIndex, readWord, worldCell } from "../src/sim/mechanics/terrain";
type Native = (number | null)[];
function put(n: Native, p: number, v: number) {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
}
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  n[p]! | (n[p + 1]! << 8) | (n[p + 2]! << 16) | (n[p + 3]! << 24);
function fixture() {
  const w: CraterWorld & {
    records: { id: string; native: Native }[];
    zoneRefreshes: number;
  } = {
    missionPrefix: Array(0x355e).fill(0),
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    rng: { seed: 0, draws: 0, ring: 31 },
    records: [],
    zoneRefreshes: 0,
  };
  for (let slot = 0; slot < 25; slot++) {
    w.missionPrefix.fill(165, BASE + slot * 176, BASE + (slot + 1) * 176);
    put(w.missionPrefix, BASE + slot * 176 + 12, -1);
  }
  for (let cell = 0; cell < 16384; cell++) {
    put(w.terrain.bytes, cell * 14 + 2, 2048);
    w.terrain.bytes[cell * 14 + 5] = 3;
  }
  put(w.missionPrefix, 0x1c63, 512);
  put(w.missionPrefix, 0x1c61, 100);
  const rules: CraterRules = {
    directions: [
      [0, -256],
      [256, -256],
      [256, 0],
      [256, 256],
      [0, 256],
      [-256, 256],
      [-256, 0],
      [-256, -256],
      [0, 0],
    ],
    largeTextures: [40, 41, 42, 43, 44, 45, 46, 47, 48],
    largeFlags: [0, 16, 32, 48, 64, 80, 96, 112, 0],
    terrainBorder: Array(8192).fill(0),
    terrainLightVector: [0, 0, -256],
  };
  const context: CraterContext<typeof w> = {
    rules,
    linkedRecords: (s, cell) =>
      s.records.filter(
        (r) => worldCell(word(r.native, 7), word(r.native, 9)) === cell,
      ),
  };
  const install = (
    slot: number,
    remaining = 1,
    target = 2048,
    point: [number, number] = [20 * 256, 20 * 256],
  ) => {
    const p = BASE + slot * 176;
    put(w.missionPrefix, p, point[0]);
    put(w.missionPrefix, p + 2, point[1]);
    put(w.missionPrefix, p + 4, point[0] + 256);
    put(w.missionPrefix, p + 6, point[1] + 256);
    w.missionPrefix[p + 8] = w.missionPrefix[p + 9] = 2;
    put(w.missionPrefix, p + 10, 128);
    put(w.missionPrefix, p + 12, remaining);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++)
        put(w.missionPrefix, p + 14 + row * 18 + col * 2, target);
    w.missionPrefix[COUNT]++;
  };
  const record = (kind: number, index: number, cell: number, physical = 0) => {
    const n: Native = Array(124).fill(0);
    n[6] = kind;
    put(n, 15, index);
    put(n, 7, (cell & 127) * 256);
    put(n, 9, (cell >> 7) * 256);
    put(n, 39, physical);
    n[69] = 32;
    const r = { id: `synthetic:${kind}:${index}`, native: n };
    w.records.push(r);
    put(w.terrain.bytes, cell * 14 + 6, index);
    w.terrain.bytes[cell * 14 + 8] = kind;
    return r;
  };
  return { w, rules, context, install, record };
}
describe("source crater creation and terrain job lifecycle", () => {
  it("uses the lowest retained native slot and exact small crater grid, nine draws and protected texture orientation", () => {
    const f = fixture();
    f.install(0, 4);
    const prior = f.w.missionPrefix.slice(BASE + 176, BASE + 352),
      point: [number, number] = [40 * 256 + 127, 50 * 256 + 127];
    const out = createCraterJob(f.w, point, 0, f.rules),
      job = f.w.missionPrefix.slice(BASE + 176, BASE + 352);
    expect(out.slot).toBe(1);
    expect(f.w.missionPrefix[COUNT]).toBe(2);
    expect(f.w.rng).toEqual({ seed: 0, draws: 9, ring: 8 });
    expect([
      word(job, 0),
      word(job, 2),
      word(job, 4),
      word(job, 6),
      job[8],
      job[9],
      word(job, 10),
      word(job, 12),
    ]).toEqual([
      39 * 256 + 127,
      49 * 256 + 127,
      41 * 256 + 127,
      51 * 256 + 127,
      3,
      3,
      640,
      2,
    ]);
    expect(
      [14, 16, 18, 32, 34, 36, 50, 52, 54].map((p) => word(job, p)),
    ).toEqual([2176, 2368, 2176, 2368, 1408, 2368, 2176, 2368, 2176]);
    for (const [i, orientation] of [0x87, 0x97, 0xb7, 0xa7].entries()) {
      const c = cellIndex(39 + [0, 1, 1, 0][i], 49 + [0, 0, 1, 1][i]);
      expect(f.w.terrain.bytes.slice(c * 14 + 4, c * 14 + 6)).toEqual([
        32,
        orientation,
      ]);
    }
    expect(job[20]).toBe(prior[20]);
    expect(job.slice(76)).toEqual(prior.slice(76));
    expect(readWord(f.w.terrain, cellIndex(40, 50), 2)).toBe(2048);
  });
  it("rounds the large anchor and applies all sixteen independent target draws plus only imported 3x3 textures", () => {
    const f = fixture();
    const out = createCraterJob(
        f.w,
        [40 * 256 + 127, 50 * 256 + 127],
        1,
        f.rules,
      ),
      job = f.w.missionPrefix.slice(BASE, BASE + 176);
    expect(out.slot).toBe(0);
    expect([
      word(job, 0),
      word(job, 2),
      word(job, 4),
      word(job, 6),
      job[8],
      job[9],
      word(job, 12),
    ]).toEqual([39 * 256, 49 * 256, 42 * 256, 52 * 256, 4, 4, 2]);
    expect(f.w.rng).toEqual({ seed: 0, draws: 16, ring: 15 });
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++)
        expect(word(job, 14 + row * 18 + col * 2)).toBe(
          row > 0 && row < 3 && col > 0 && col < 3 ? 1408 : 2176,
        );
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const p = cellIndex(39 + col, 49 + row) * 14;
        expect([f.w.terrain.bytes[p + 4], f.w.terrain.bytes[p + 5]]).toEqual([
          40 + row * 3 + col,
          f.rules.largeFlags[row * 3 + col] | 0x87,
        ]);
      }
  });
  it("fails capacity without consuming RNG, touching map or requiring unused tables", () => {
    const f = fixture();
    for (let i = 0; i < 25; i++) f.install(i, 2);
    const before = structuredClone(f.w);
    expect(createCraterJob(f.w, [0, 0], 0, {} as CraterRules)).toEqual({
      slot: null,
      viewportInvalidations: [],
    });
    expect(f.w).toEqual(before);
  });
  it("keeps signed targets while the height setter clamps a crater below zero", () => {
    const f = fixture();
    for (let c = 0; c < 16384; c++) put(f.w.terrain.bytes, c * 14 + 2, 0);
    createCraterJob(f.w, [40 * 256, 40 * 256], 0, f.rules);
    expect(word(f.w.missionPrefix, BASE + 34)).toBe(-640);
    stepCraterJobs(f.w, f.context);
    expect(readWord(f.w.terrain, cellIndex(40, 40), 2)).toBe(0);
  });
  it("steps sparse slots in order, preserves opaque priors and retires to -1 with exact count", () => {
    const f = fixture();
    f.install(1, 2, 2176);
    f.install(24, 1, 1920);
    const saved = structuredClone(f.w),
      first = stepCraterJobs(f.w, f.context);
    expect(
      first.map((r) => [r.slot, r.retired, r.countBefore, r.countAfter]),
    ).toEqual([
      [1, false, 2, 2],
      [24, true, 2, 1],
    ]);
    expect(readWord(f.w.terrain, cellIndex(20, 20), 2)).toBe(2048);
    expect(word(f.w.missionPrefix, BASE + 24 * 176 + 12)).toBe(-1);
    expect(f.w.missionPrefix[BASE + 24 * 176 + 175]).toBe(165);
    expect(f.w.missionPrefix.slice(BASE, BASE + 176)).toEqual(
      saved.missionPrefix.slice(BASE, BASE + 176),
    );
    expect(f.w.rng.draws).toBe(0);
    expect(first[0].viewportInvalidations.length).toBe(4);
    const second = stepCraterJobs(f.w, f.context);
    expect(second.map((r) => r.slot)).toEqual([1]);
    expect(f.w.missionPrefix[COUNT]).toBe(0);
    expect(stepCraterJobs(f.w, {} as typeof f.context)).toEqual([]);
  });
  it("updates actual linked ground and physical height, preserving airborne altitude and the source forced code46 behavior", () => {
    for (const [kind, code, physical, expected] of [
      [1, 0, 0, 4352],
      [1, 0, 6000, 6000],
      [2, 0, 0, 0],
      [5, 46, 6000, 4352],
      [5, 32, 6000, 6000],
    ] as const) {
      const f = fixture();
      f.install(0, 2, 2176);
      const n = f.record(kind, 3, cellIndex(20, 20), physical).native;
      n[69] = code;
      let writes = 0;
      const result = stepCraterJobs(f.w, {
          ...f.context,
          linkedChanged: () => {
            writes++;
          },
        }),
        after = f.w.records[0].native;
      expect(dword(after, 17)).toBe(4352);
      expect(dword(after, 39)).toBe(expected);
      expect(writes).toBeGreaterThan(0);
      expect(result[0].linkedWrites.some((r) => r.operation === "height")).toBe(
        true,
      );
    }
  });
  it("rejects an omitted actual cell chain and rolls back every earlier job and RNG write", () => {
    const f = fixture();
    f.install(0, 1, 2176);
    f.install(24, 2, 2176, [40 * 256, 40 * 256]);
    f.record(1, 7, cellIndex(40, 40));
    const before = structuredClone(f.w);
    expect(() =>
      stepCraterJobs(f.w, { ...f.context, linkedRecords: () => [] }),
    ).toThrow(/incomplete/);
    expect(f.w).toEqual(before);
  });
  it("requires real post-retirement zone work, once after all active jobs, and rolls it back on failure", () => {
    const f = fixture();
    f.install(1);
    f.install(24);
    f.w.missionPrefix[0x34b8] = 1;
    put(f.w.missionPrefix, 0x2ff8 + 14, 1);
    const before = structuredClone(f.w);
    expect(() => stepCraterJobs(f.w, f.context)).toThrow(/zone refresh/);
    expect(f.w).toEqual(before);
    expect(() =>
      stepCraterJobs(f.w, {
        ...f.context,
        refreshZones: (s) => {
          s.zoneRefreshes++;
          throw Error("zone rejected");
        },
      }),
    ).toThrow(/zone rejected/);
    expect(f.w).toEqual(before);
    const out = stepCraterJobs(f.w, {
      ...f.context,
      refreshZones: (s, active) => {
        expect(active).toEqual([0]);
        expect(s.missionPrefix[COUNT]).toBe(0);
        s.zoneRefreshes++;
        return [123];
      },
    });
    expect(f.w.zoneRefreshes).toBe(1);
    expect(out.at(-1)!.viewportInvalidations.at(-1)).toBe(123);
  });
  it("rejects missing priors and unknown required native bytes without inventing a height", () => {
    const f = fixture();
    f.install(0, 1, 2176);
    const n = f.record(1, 2, cellIndex(20, 20)).native;
    n[39] = null;
    const before = structuredClone(f.w);
    expect(() => stepCraterJobs(f.w, f.context)).toThrow(/byte 39/);
    expect(f.w).toEqual(before);
    f.w.missionPrefix[COUNT] = 2;
    expect(() => createCraterJob(f.w, [0, 0], 0, f.rules)).toThrow(
      /count mismatch/,
    );
  });
});
