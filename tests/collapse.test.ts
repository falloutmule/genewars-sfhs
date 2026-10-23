import { describe, it, expect } from "vitest";
import {
  createCollapse,
  makeCollapsePool,
  stepCollapsePool,
  type CollapseWorld,
  type CollapseContext,
} from "../src/sim/mechanics/collapse";
import { terrainFromBytes } from "../src/sim/mechanics/terrain";
import { putEffectWord as put } from "../src/sim/mechanics/power-motion";
import { nextRandom } from "../src/sim/mechanics/random";
import type { DestructionRequest } from "../src/sim/mechanics/destruction-effect";
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function fixture() {
  const prior = Array.from({ length: 49 }, (_, i) =>
    i >= 31 && i < 39 ? null : (i * 13) & 255,
  );
  prior[6] = 0;
  const prefix = Array(0x355e).fill(0),
    bytes = Array(229376).fill(0);
  for (let cell = 0; cell < 16384; cell++) {
    put(bytes, cell * 14 + 2, 1000);
    bytes[cell * 14 + 5] = 7;
  }
  const w: CollapseWorld & { events: DestructionRequest[] } = {
      collapse: makeCollapsePool(
        Array.from({ length: 32 }, () => prior),
        0,
      ),
      missionPrefix: prefix,
      terrain: terrainFromBytes(bytes),
      rng: { seed: 5428, draws: 0, ring: 31 },
      events: [],
    },
    c: CollapseContext<typeof w> = {
      directions: [
        [-256, -256],
        [-256, 0],
        [-256, 256],
        [0, -256],
        [0, 0],
        [0, 256],
        [256, -256],
        [256, 0],
        [256, 256],
      ],
      effect(w, r) {
        w.events.push(r);
        if (r.code === 5) nextRandom(w.rng);
        return 0;
      },
      stageHost(o, s) {
        s.events = structuredClone(o.events);
      },
      commitHost(o, s) {
        o.events = s.events;
      },
    };
  const request = {
    code: 3 as const,
    owner: 4 as const,
    position: [1024, 1024] as [number, number],
    buildingSlot: 10,
    completed: true,
  };
  return { w, c, prior, request };
}
function hole(f: ReturnType<typeof fixture>) {
  createCollapse(f.w, f.request);
  createCollapse(f.w, f.request);
  f.w.collapse.records[2] = f.w.collapse.records[1];
  put(f.w.collapse.records[2], 15, 2);
  f.w.collapse.records[1] = f.prior.slice();
}
describe("source family6 building collapse", () => {
  it("retains actual static priors and borrows only building completion, without RNG or spatial references", () => {
    const f = fixture(),
      before = f.w.terrain.bytes.slice(),
      slot = createCollapse(f.w, f.request),
      n = f.w.collapse.records[slot!];
    expect(slot).toBe(0);
    for (const i of [0, 1, 3, 4, 30, 43, 44, 45, 46, 47, 48])
      expect(n[i]).toBe(f.prior[i]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect([n[2], n[5], n[6], n[24], n[39], n[40], word(n, 41)]).toEqual([
      0, 0, 6, 4, 3, 0, 0,
    ]);
    expect(f.w.collapse.count).toBe(1);
    expect(word(f.w.missionPrefix, 0x3556)).toBe(1);
    expect(f.w.rng.draws).toBe(0);
    expect(f.w.terrain.bytes).toEqual(before);
  });
  it("returns actual32-slot capacity failure without RNG or terrain/resource access", () => {
    const f = fixture();
    for (let i = 0; i < 32; i++) expect(createCollapse(f.w, f.request)).toBe(i);
    f.w.terrain.bytes = [];
    const before = JSON.stringify(f.w);
    expect(createCollapse(f.w, f.request)).toBeNull();
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("runs all nine lifetime callbacks and emits real unmarked blast requests in source order", () => {
    const f = fixture();
    createCollapse(f.w, f.request);
    const callbacks: number[] = [];
    for (let i = 0; i < 9; i++)
      callbacks.push(...stepCollapsePool(f.w, f.c).callbacks);
    expect(callbacks).toEqual(Array(9).fill(0));
    expect(f.w.events.map((r) => r.code)).toEqual([5, ...Array(24).fill(2)]);
    expect(
      f.w.events.every(
        (r) => r.newborn === false && r.owner === 0 && r.parameter === 0,
      ),
    ).toBe(true);
    expect(f.w.rng.draws).toBe(25);
    expect(f.w.collapse.count).toBe(0);
    expect(word(f.w.missionPrefix, 0x3556)).toBe(0);
    expect(word(f.w.collapse.records[0], 41)).toBe(9);
    expect(f.w.collapse.records[0][6]).toBe(0);
  });
  it("preserves incomplete blast parameter1 and complete serializable continuation", () => {
    const f = fixture();
    createCollapse(f.w, { ...f.request, completed: false });
    for (let i = 0; i < 4; i++) stepCollapsePool(f.w, f.c);
    const replay = structuredClone(f.w);
    for (let i = 0; i < 5; i++) {
      stepCollapsePool(f.w, f.c);
      stepCollapsePool(replay, f.c);
    }
    expect(replay).toEqual(f.w);
    expect(
      f.w.events.filter((r) => r.code === 2).every((r) => r.parameter === 1),
    ).toBe(true);
  });
  it("uses the source initial count and current ascending records when recursion creates an intervening slot", () => {
    const f = fixture();
    hole(f);
    let made = false;
    f.c.effect = (w, r) => {
      w.events.push(r);
      if (!made && r.code === 5) {
        made = true;
        expect(createCollapse(w, f.request)).toBe(1);
      }
    };
    const out = stepCollapsePool(f.w, f.c);
    expect(out.callbacks).toEqual([0, 1]);
    expect(out.initialCount).toBe(2);
    expect(out.finalCount).toBe(3);
    expect(word(f.w.collapse.records[2], 41)).toBe(0);
  });
  it("waits until the next pass for lower-slot collapse created after that slot retires", () => {
    const f = fixture();
    hole(f);
    put(f.w.collapse.records[0], 41, 8);
    f.c.effect = (w, r) => {
      w.events.push(r);
      if (r.code === 5) expect(createCollapse(w, f.request)).toBe(0);
    };
    const out = stepCollapsePool(f.w, f.c);
    expect(out.callbacks).toEqual([0, 2]);
    expect(out.retired).toEqual([0]);
    expect(f.w.collapse.count).toBe(2);
    expect(word(f.w.collapse.records[0], 41)).toBe(0);
  });
  it("rolls back earlier factories, native counters, terrain, host events and RNG on a later unadmitted selector", () => {
    const f = fixture();
    hole(f);
    f.w.collapse.records[2][39] = 2;
    f.c.effect = (w, r) => {
      w.events.push(r);
      nextRandom(w.rng);
      w.terrain.bytes[0] ^= 1;
    };
    const before = JSON.stringify(f.w);
    expect(() => stepCollapsePool(f.w, f.c)).toThrow(
      /Unsupported active family6/,
    );
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("keeps marked-record and inconsistent-count source scans explicit and atomic", () => {
    const f = fixture();
    createCollapse(f.w, f.request);
    f.w.collapse.records[0][21] = 1;
    const before = JSON.stringify(f.w);
    expect(() => stepCollapsePool(f.w, f.c)).toThrow(/leave its32-slot pool/);
    expect(JSON.stringify(f.w)).toBe(before);
    f.w.collapse.count = 2;
    expect(() => stepCollapsePool(f.w, f.c)).toThrow(/raw count3556/);
  });
});
