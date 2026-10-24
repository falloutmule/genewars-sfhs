import { describe, it, expect } from "vitest";
import {
  stepPulper,
  stepStagedPulper,
  type PulperContext,
} from "../src/sim/mechanics/pulper";
import { put16, put32, i16, u32 } from "../src/sim/campaign/bytes";
type N = (number | null)[];
type World = { n: N; p: N; plants: N[]; trace: string[] };
function fixture(grade = 0) {
  const n: N = Array(67).fill(0),
    p: N = Array(1805).fill(0);
  n.fill(null, 31, 39);
  n[6] = 4;
  n[45] = 2;
  n[46] = grade;
  n[25] = grade + 1;
  put16(n as number[], 7, 8448);
  put16(n as number[], 9, 8192);
  put16(n as number[], 43, 160);
  put16(n as number[], 49, 5);
  put16(n as number[], 61, 200);
  const w: World = { n, p, plants: [], trace: [] };
  const c: PulperContext<World> = {
    frame: 1,
    rules: {
      schemaVersion: 1,
      resources: [],
      unsupportedSelectors: [],
      upkeep: Array(14).fill(1),
      processingFrontOffset: [-256, 0],
    },
    native: (s) => s.n,
    player: (s) => s.p,
    profile: (_s, _i, action) => ({
      first: 0,
      last: action === 0 || action === 4 ? 2 : 9,
      flags: 0,
      holds: Array(action === 0 || action === 4 ? 3 : 10).fill(0),
    }),
    findPlant: (s, cell) => {
      s.trace.push(`query:${cell}`);
      const slot = s.plants.findIndex((p) => p[6] === 2);
      return slot < 0 ? null : { slot, native: s.plants[slot] };
    },
    unlinkPlant: (s, p) => {
      s.trace.push(`unlink:${p.slot}:${s.n[51]}`);
    },
    retirePlant: (s, p) => {
      s.trace.push(`cleanup:${p.slot}`);
      s.plants[p.slot][6] = 0;
    },
  };
  const plant: N = Array(49).fill(0);
  plant[6] = 2;
  plant[48] = 13;
  return { w, c, plant };
}
describe("Pulper2 complete ordinary callback", () => {
  it("credits pending construction stock before energy gating, without GOOP or funds", () => {
    const { w, c } = fixture();
    w.n[51] = 90;
    put32(w.n as number[], 54, 75);
    put16(w.n as number[], 61, 0);
    put32(w.p as number[], 0x4a3, 800);
    put32(w.p as number[], 0x4a7, 17);
    stepStagedPulper(w, 0, c);
    expect([
      u32(w.n as number[], 54),
      w.n[51],
      u32(w.p as number[], 0x4a3),
      u32(w.p as number[], 0x4a7),
    ]).toEqual([165, 0, 800, 17]);
    expect(w.trace).toEqual([]);
    expect(i16(w.p as number[], 0x5ea)).toBe(1000);
  });
  it.each([0, 1, 2])(
    "clamps operational material to the grade%d limit only",
    (grade) => {
      const { w, c } = fixture(grade);
      put32(w.n as number[], 54, 0xffffffff);
      stepStagedPulper(w, 0, c);
      expect(u32(w.n as number[], 54)).toBe(40 * (grade + 2));
      expect(w.trace).toEqual([]);
    },
  );
  it("starts processing at the actual front cell but consumes only on frame5", () => {
    const { w, c, plant } = fixture();
    w.plants.push(plant);
    const first = stepStagedPulper(w, 0, c);
    expect(w.trace).toEqual(["query:4128"]);
    expect(plant[6]).toBe(2);
    expect([w.n[27], w.n[28], w.n[63]]).toEqual([1, 0, 7]);
    expect(first.events).toContainEqual({
      type: "pulper-audio",
      cue: 47,
      operation: "play",
      parameter: 255,
    });
    w.n[27] = 5;
    w.n[30] = 0;
    const receipt = stepStagedPulper(w, 0, c);
    expect(w.trace.slice(-3)).toEqual([
      "query:4128",
      "unlink:0:13",
      "cleanup:0",
    ]);
    expect(w.n[51]).toBe(13);
    expect(plant[6]).toBe(0);
    expect(u32(w.n as number[], 54)).toBe(0);
    expect(receipt.events).toContainEqual({
      type: "pulper-consumed",
      plant: 0,
      amount: 13,
    });
  });
  it("stops processing sound and requests finish cue at frame7", () => {
    const { w, c } = fixture();
    w.n[27] = 7;
    expect(stepStagedPulper(w, 0, c).events).toEqual([
      { type: "pulper-audio", cue: 47, operation: "stop", parameter: 0 },
      { type: "pulper-audio", cue: 49, operation: "play", parameter: 0 },
    ]);
    expect([w.n[27], w.n[29]]).toEqual([8, 5]);
  });
  it.each([1, 2])(
    "dispatches the actual grade%d collector only on its cadence",
    (grade) => {
      const { w, c } = fixture(grade);
      c.frame = 255;
      c.dispatchCollection = (s) => {
        s.trace.push("collect");
        return true;
      };
      stepStagedPulper(w, 0, c);
      expect(w.trace).toEqual(["query:4128"]);
      c.frame = 256;
      const r = stepStagedPulper(w, 0, c);
      expect(r.events).toContainEqual({
        type: "pulper-collection",
        range: grade === 1 ? 1024 : 2048,
        dispatched: true,
      });
      expect(w.trace.at(-1)).toBe("collect");
      expect(w.n[63]).toBe(15);
    },
  );
  it("requires the real reached collector service and rolls back pending deposit and native animation", () => {
    const { w, c } = fixture(1);
    c.frame = 256;
    w.n[51] = 3;
    const before = structuredClone(w);
    expect(() => stepPulper(w, 0, c)).toThrow("112728/14040");
    expect(w).toEqual(before);
  });
  it("normal collector pool capacity failure adds no drain", () => {
    const { w, c } = fixture(2);
    c.frame = 256;
    c.dispatchCollection = () => false;
    stepStagedPulper(w, 0, c);
    expect(w.n[63]).toBe(0);
  });
  it("keeps pending material when disabled and uses exact inactive energy/ANB tail", () => {
    const { w, c } = fixture(2);
    put16(w.n as number[], 49, 0x45);
    w.n[51] = 13;
    w.n[30] = 99;
    const r = stepStagedPulper(w, 0, c);
    expect([
      w.n[25],
      w.n[27],
      w.n[28],
      w.n[51],
      i16(w.n as number[], 61),
    ]).toEqual([4, 2, 0, 13, 199]);
    expect(r.events).toContainEqual({
      type: "pulper-audio",
      cue: 47,
      operation: "stop",
      parameter: 0,
    });
  });
  it("preserves incomplete dirty timer and held counter before real common animation", () => {
    const { w, c } = fixture();
    put16(w.n as number[], 49, 0);
    w.n[47] = 2;
    w.n[48] = 3;
    w.n[30] = 99;
    w.n[29] = 7;
    stepStagedPulper(w, 0, c);
    expect([
      w.n[25],
      w.n[27],
      w.n[28],
      w.n[30],
      w.n[48],
      i16(w.n as number[], 61),
    ]).toEqual([0, 2, 0, 6, 2, 199]);
  });
  it("returns before draw/ANB for incomplete zero health", () => {
    const { w, c } = fixture();
    put16(w.n as number[], 49, 0);
    put16(w.n as number[], 43, 0);
    w.n[30] = 88;
    c.profile = () => {
      throw Error("unreached");
    };
    expect(stepStagedPulper(w, 0, c).queueDraw).toBe(false);
    expect(w.n[30]).toBe(88);
  });
  it("JSON continuation through an in-progress frame reproduces all native and receipt state", () => {
    const { w, c, plant } = fixture();
    w.plants.push(plant);
    stepStagedPulper(w, 0, c);
    const restored = JSON.parse(JSON.stringify(w)) as World;
    for (let f = 0; f < 80; f++) {
      expect(stepStagedPulper(restored, 0, c)).toEqual(
        stepStagedPulper(w, 0, c),
      );
      expect(restored).toEqual(w);
    }
  });
  it("late missing ANB rolls back plant retirement and every staged root", () => {
    const { w, c, plant } = fixture();
    w.plants.push(plant);
    w.n[27] = 5;
    c.profile = () => {
      throw Error("late profile");
    };
    const before = structuredClone(w);
    expect(() => stepPulper(w, 0, c)).toThrow("late profile");
    expect(w).toEqual(before);
  });
});
