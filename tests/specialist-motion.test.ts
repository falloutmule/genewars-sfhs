import { describe, it, expect } from "vitest";
import {
  stepSpecialistMotion,
  stepStagedSpecialistMotion,
  escapeSpecialistRay,
  escapeStagedSpecialistRay,
  findSpecialistIdleRelocation,
  specialistStraightRay,
  specialistApproachPoint,
  specialistVisibilityRay,
  specialistRevealRadius,
  specialistBlockerWeight,
  geneticistLineOfSight,
  type SpecialistMotionContext,
} from "../src/sim/mechanics/specialist-motion";
import {
  queueGeneticistInteraction,
  stepGeneticistCallback,
  type GeneticistWorld,
} from "../src/sim/mechanics/geneticist";
import { worldCell } from "../src/sim/mechanics/terrain";
type Native = (number | null)[];
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const word = (n: Native, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: Native, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
function fixture() {
  const n: Native = Array(200).fill(0);
  n.fill(null, 31, 39);
  n.fill(null, 176, 180);
  n.fill(null, 192, 200);
  n[6] = 3;
  n[28] = 1;
  n[85] = 11;
  n[88] = 1;
  n[112] = 1;
  n[73] = 20;
  n[84] = 20;
  n[67] = 157;
  n[68] = 93;
  for (const [p, v] of [
    [7, 1000],
    [9, 1000],
    [11, 4000],
    [13, 1000],
    [43, 50],
    [45, 100],
    [57, 512],
    [59, 512],
    [61, 100],
    [63, 700],
    [65, 100],
    [75, 512],
  ])
    put(n, p, v);
  put32(n, 17, 2048);
  put32(n, 39, 2048);
  const bytes = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    put(bytes, i * 14, 16384);
    put(bytes, i * 14 + 2, 1024);
    bytes[i * 14 + 5] = 2;
    bytes[i * 14 + 12] = 64;
  }
  const s: GeneticistWorld = {
    specialists: {
      schemaVersion: 1,
      records: Array.from({ length: 20 }, (_, i) =>
        i === 0 ? n : Array(200).fill(0),
      ),
      bindings: Array(20).fill(null),
    },
    players: Array.from({ length: 4 }, () => ({ raw: Array(1805).fill(0) })),
    ecology: {
      schemaVersion: 1,
      sourceSha256: "synthetic",
      ticks: 0,
      plantCursor: 0,
      plantCount: 0,
      ownerPlantCounts: [0, 0, 0, 0, 0],
      plants: [],
      mules: [],
      otherEntities: [],
      plantOrder: {},
      pending: [],
      unsupported: [],
    },
    terrain: { bytes, revision: 0 },
    rng: { seed: 0, ring: 31, draws: 0 },
    frame: 1,
    missionPrefix: Array(0x355e).fill(0),
  };
  s.specialists.bindings[0] = {
    owner: 0,
    blueprintIndex: 0,
    style: 0,
    category: 2,
    resourceKey: 2,
    assetKey: "SYNTHETIC",
    sourceName: "data/spec/synthetic.anb",
    classSpeed: 700,
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
  s.players[0].raw[22 + 22] = 2;
  s.players[0].raw[22 + 23] = 50;
  s.players[0].raw[22 + 25] = 100;
  s.players[0].raw[22 + 26] = 100;
  const tables = {
    atan: Array.from({ length: 257 }, (_, i) =>
      Math.round((Math.atan(i / 256) * 1024) / Math.PI),
    ),
    sine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
    ),
    cosine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
    ),
  };
  const c: SpecialistMotionContext<typeof s> = {
    tables,
    gravity: 1024,
    water: 1632,
    bounce: [128, 128, 128, 128, 128, 128, 128, 128],
    selectedPlayer: 0,
    obstacle: () => null,
    blockerWeight: () => 0,
  };
  return { s, c, n: () => s.specialists.records[0] };
}
describe("source category2 specialist6FB60 motion", () => {
  it("matches the public atomic motion on an already isolated world while retaining native identity", () => {
    const a = fixture(),
      b = fixture(),
      native = b.n();
    const expected = stepSpecialistMotion(a.s, 0, a.c),
      actual = stepStagedSpecialistMotion(b.s, 0, b.c);
    expect(b.s).toEqual(a.s);
    expect(actual).toEqual(expected);
    expect(b.n()).toBe(native);
  });
  it.each([0, 1, 2, 3])(
    "admits source common damaged/death motion for category%i with retained active-role flags",
    (category) => {
      for (const state of [4, 5]) {
        const reference = fixture();
        reference.s.specialists.records[0][85] = state;
        stepSpecialistMotion(reference.s, 0, reference.c);
        const f = fixture();
        f.s.specialists.bindings[0]!.category = category;
        f.s.players[0].raw[44] = category;
        f.s.specialists.records[0][85] = state;
        stepSpecialistMotion(f.s, 0, f.c);
        expect(f.s.specialists.records[0]).toEqual(
          reference.s.specialists.records[0],
        );
        expect(f.s.rng).toEqual(reference.s.rng);
      }
    },
  );
  it("admits the same established common numeric path for ordinary category0/1 idle/move only", () => {
    const expected = fixture();
    stepSpecialistMotion(expected.s, 0, expected.c);
    for (const category of [0, 1]) {
      const f = fixture();
      f.s.specialists.bindings[0]!.category = category;
      f.s.players[0].raw[44] = category;
      f.n()[85] = 1;
      f.n()[88] = 0;
      stepSpecialistMotion(f.s, 0, f.c);
      expect(f.n().slice(7, 85)).toEqual(expected.n().slice(7, 85));
      // Role states are admitted only for their actual category:0/9 and1/10.
      f.n()[85] = category === 0 ? 10 : 9;
      const before = structuredClone(f.s);
      expect(() => stepSpecialistMotion(f.s, 0, f.c)).toThrow(
        /ordinary idle\/move/,
      );
      expect(f.s).toEqual(before);
    }
  });
  it("uses retained fractions, contact65 and fixed integration without RNG or opaque-byte writes", () => {
    const f = fixture();
    f.n()[180] = 77;
    const r = stepSpecialistMotion(f.s, 0, f.c),
      n = f.n();
    expect([
      word(n, 7),
      word(n, 9),
      n[67],
      n[68],
      word(n, 61),
      word(n, 65),
      word(n, 63),
      word(n, 73),
    ]).toEqual([1002, 1000, 245, 93, 150, 150, 700, 16]);
    expect([n[31], n[176], n[180], f.s.rng.draws, r.arrived]).toEqual([
      null,
      null,
      77,
      0,
      false,
    ]);
  });
  it("snaps ordinary arrival, clears route/velocity/fractions and keeps native state55 for57A10", () => {
    const f = fixture();
    put(f.n(), 11, 1010);
    put(f.n(), 65, 0);
    const r = stepSpecialistMotion(f.s, 0, f.c),
      n = f.n();
    expect(r.arrived).toBe(true);
    expect([
      word(n, 7),
      word(n, 9),
      word(n, 65),
      word(n, 63),
      word(n, 61),
      word(n, 45),
      word(n, 73),
      n[67],
      n[68],
      n[85],
    ]).toEqual([1010, 1000, 0, 0, 0, 0, 0x220, 0, 0, 11]);
  });
  it("uses actual associated Mule coordinates and physical height for pursuit/contact", () => {
    const f = fixture();
    f.s.frame = 3;
    f.n()[82] = 1;
    put(f.n(), 80, 1);
    const target: Native = Array(124).fill(0);
    target[6] = 1;
    target[122] = 4;
    put(target, 15, 1);
    put(target, 7, 3500);
    put(target, 9, 1000);
    put32(target, 39, 6000);
    f.s.ecology.mules.push({
      id: "source:0:1",
      index: 1,
      native: target,
      pending: [],
    });
    stepSpecialistMotion(f.s, 0, f.c);
    expect([
      word(f.n(), 11),
      word(f.n(), 13),
      word(f.n(), 65),
      f.n()[82],
    ]).toEqual([3500, 1000, 150, 1]);
    const g = fixture();
    g.n()[82] = 1;
    put(g.n(), 80, 9);
    const before = structuredClone(g.s);
    expect(() => stepSpecialistMotion(g.s, 0, g.c)).toThrow(/unresolved/);
    expect(g.s).toEqual(before);
  });
  it("does not read an unused null-reference index", () => {
    const f = fixture();
    f.n()[80] = f.n()[81] = null;
    stepSpecialistMotion(f.s, 0, f.c);
    expect(f.n()[80]).toBe(null);
    expect(word(f.n(), 7)).toBe(1002);
  });
  it("handles source backoff parity and restores saved desired speed after stopped physics", () => {
    const f = fixture();
    f.n()[73] = 19;
    f.s.frame = 2;
    const r = stepSpecialistMotion(f.s, 0, f.c);
    expect(r.route).toBe("backoff");
    expect([
      f.n()[84],
      word(f.n(), 63),
      word(f.n(), 65),
      word(f.n(), 73) & 3,
    ]).toEqual([19, 700, 50, 3]);
    const g = fixture();
    g.n()[73] = 19;
    g.s.frame = 3;
    stepSpecialistMotion(g.s, 0, g.c);
    expect([g.n()[84], word(g.n(), 63), word(g.n(), 73) & 3]).toEqual([
      20, 700, 0,
    ]);
  });
  it("runs the entire current idle relocation group and queues the last accepted point without RNG", () => {
    const queries: [number, number][] = [];
    const found = findSpecialistIdleRelocation([1000, 1000], (p) => {
      queries.push(p);
      return p[0] !== 1000 || p[1] !== 1000;
    });
    expect(found).toEqual([1000, 1256]);
    expect(queries).toEqual([
      [1000, 1000],
      [1256, 1000],
      [1000, 744],
      [744, 1000],
      [1000, 1256],
    ]);
    const f = fixture();
    f.s.frame = 32;
    f.n()[73] = 0;
    put(f.n(), 63, 0);
    put(f.n(), 45, 0);
    f.n()[83] = 8;
    f.s.terrain.bytes[worldCell(1128, 1128) * 14 + 5] = 3;
    stepSpecialistMotion(f.s, 0, f.c);
    expect(f.n()[87]! & 2).toBe(2);
    expect(f.n()[91]).toBe(0);
    expect(f.s.rng.draws).toBe(0);
  });
  it("takes a real boundary waypoint around forbidden terrain without a generic grid path", () => {
    const f = fixture();
    f.n()[83] = 8;
    for (let y = 2; y < 7; y++) f.s.terrain.bytes[(y * 128 + 6) * 14 + 5] = 3;
    stepSpecialistMotion(f.s, 0, f.c);
    expect(word(f.n(), 73) & 3).not.toBe(0);
    expect([word(f.n(), 69), word(f.n(), 71)]).not.toEqual([0, 0]);
    expect(f.n()[84]).toBe(20);
    expect(f.s.rng.draws).toBe(0);
  });
  it("keeps the source initial-rejected-ray bypass and exact terminal query", () => {
    const f = fixture(),
      seen: [number, number][] = [];
    expect(
      specialistStraightRay([0, 0], [1000, 0], f.c.tables, () => false),
    ).toEqual({ clear: true, failure: null });
    expect(
      specialistStraightRay([0, 0], [32, 0], f.c.tables, (p) => {
        seen.push(p);
        return true;
      }).clear,
    ).toBe(true);
    expect(seen).toEqual([
      [0, 0],
      [32, 0],
    ]);
  });
  it("requires immediate shared cell relocation and calls it before water factories", () => {
    const f = fixture();
    for (const p of [45, 61, 63, 65]) put(f.n(), p, 2000);
    const before = structuredClone(f.s);
    expect(() => stepSpecialistMotion(f.s, 0, f.c)).toThrow(
      /spatial relocation/,
    );
    expect(f.s).toEqual(before);
    let relocation: unknown;
    f.c.relocate = (_s, _i, a, z, phase) => {
      relocation = { a, z, phase };
    };
    const r = stepSpecialistMotion(f.s, 0, f.c);
    expect(relocation).toEqual({
      a: [1000, 1000],
      z: [1032, 1000],
      phase: "physics",
    });
    expect(r.relocations.length).toBe(1);
  });
  it("creates real shallow/deep water requests and rejects a missing factory atomically", () => {
    for (const [height, code] of [
      [1400, 48],
      [600, 21],
    ] as const) {
      const f = fixture();
      f.s.frame = 3;
      for (let cell = 0; cell < 16384; cell++) {
        put(f.s.terrain.bytes, cell * 14 + 2, height / 2);
        f.s.terrain.bytes[cell * 14 + 5] = 0;
      }
      put32(f.n(), 17, height);
      put32(f.n(), 39, height);
      for (const p of [45, 61, 65]) put(f.n(), p, 200);
      const before = structuredClone(f.s);
      expect(() => stepSpecialistMotion(f.s, 0, f.c)).toThrow(/shared factory/);
      expect(f.s).toEqual(before);
      let request: unknown;
      f.c.waterEffect = (_s, r) => {
        request = r;
      };
      const result = stepSpecialistMotion(f.s, 0, f.c);
      expect(request).toMatchObject({
        code,
        height: code === 48 ? 1632 : height,
        angles: code === 48 ? [0, 0, 0] : [0, 0, 128],
      });
      expect(result.water).toEqual(request);
      expect(f.s.rng.draws).toBe(0);
    }
  });
  it("requires real zero-height water damage and preserves staged draw/order atomicity", () => {
    const f = fixture();
    f.s.frame = 3;
    for (let cell = 0; cell < 16384; cell++) {
      put(f.s.terrain.bytes, cell * 14 + 2, 0);
      f.s.terrain.bytes[cell * 14 + 5] = 0;
    }
    put32(f.n(), 17, 0);
    put32(f.n(), 39, 0);
    f.n()[83] = 1;
    f.c.waterEffect = () => {};
    const before = structuredClone(f.s);
    expect(() => stepSpecialistMotion(f.s, 0, f.c)).toThrow(/hit3/);
    expect(f.s).toEqual(before);
    let damage = 0;
    f.c.damage = (_s, i, amount) => {
      expect(i).toBe(0);
      damage = amount;
    };
    stepSpecialistMotion(f.s, 0, f.c);
    expect(damage).toBe(3);
  });
  it("performs707A0's own draw, sixteen candidates and exact success/failure flags", () => {
    const f = fixture();
    f.n()[22] = 128;
    const seen: [number, number][] = [];
    f.c.blockerWeight = (_s, _i, p) => {
      seen.push(p);
      return seen.length < 3 ? 10 : 0;
    };
    const okay = escapeSpecialistRay(f.s, 0, 512, 500, f.c);
    expect(okay).toBe(true);
    expect(seen.length).toBe(3);
    expect(f.s.rng.draws).toBe(1);
    expect(f.n()[22]! & 192).toBe(0);
    expect([word(f.n(), 11), word(f.n(), 13)]).toEqual(seen[2]);
    const g = fixture();
    let attempts = 0;
    g.c.blockerWeight = () => {
      attempts++;
      return 10;
    };
    expect(escapeSpecialistRay(g.s, 0, 512, 500, g.c)).toBe(false);
    expect(attempts).toBe(16);
    expect(word(g.n(), 73) & 0x140).toBe(0x140);
    expect(g.s.rng.draws).toBe(1);
  });
  it("binds in-place707A0 to the real role caller so its610 distance draw is retained", () => {
    const f = fixture(),
      target: Native = Array(124).fill(0);
    target[6] = 1;
    target[122] = 4;
    target[24] = 4;
    target[94] = 8;
    put(target, 15, 1);
    put(target, 7, 1100);
    put(target, 9, 1000);
    put32(target, 39, 2048);
    f.s.ecology.mules.push({
      id: "source:0:1",
      index: 1,
      native: target,
      pending: [],
    });
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.n()[73] = 0;
    put(f.n(), 63, 0);
    put32(f.n(), 100, 2);
    put(f.n(), 45, 0);
    const rules = {
      schemaVersion: 1 as const,
      projectiles: [0, 1, 2].map((i) => ({
        speedWord: 10,
        rangeFactor: 10000,
        cooldown: 7,
        effectCode: 41 + i,
      })),
    };
    const context = {
      rules,
      tables: f.c.tables,
      globalFlags: 0,
      cellOrder: () => ["source:0:1"],
      motion: () => {},
      runtimeMode: 0,
      override180d80: 0,
      runtimeCount11c2bc: 1,
      animation: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
      lineOfSight: () => true,
      escapeRay: (s: GeneticistWorld, i: number, h: number, d: number) => {
        expect(d).toBe(384);
        return escapeStagedSpecialistRay(s, i, h, d, f.c);
      },
    };
    queueGeneticistInteraction(
      f.s,
      0,
      { callerOwner: 0, target: 1, task: 0 },
      context,
    );
    stepGeneticistCallback(f.s, 0, context);
    expect(f.s.rng.draws).toBe(2);
    expect(f.n()[90]).toBe(5);
    expect(word(f.n(), 11)).toBeLessThan(1000);
    expect(target[94]).toBe(8);
  });
  it("leaves detached motion unchanged and refuses explicit unadmitted flight/unknown bytes atomically", () => {
    const f = fixture();
    f.n()[22] = 8;
    const before = structuredClone(f.s);
    const r = stepSpecialistMotion(f.s, 0, f.c);
    expect(r.route).toBe("detached");
    expect(f.s).toEqual(before);
    const g = fixture();
    put(g.n(), 73, 0x400);
    const original = structuredClone(g.s);
    expect(() => stepSpecialistMotion(g.s, 0, g.c)).toThrow(/flight/);
    expect(g.s).toEqual(original);
    const h = fixture();
    h.n()[67] = null;
    const snapshot = structuredClone(h.s);
    expect(() => stepSpecialistMotion(h.s, 0, h.c)).toThrow(/Unknown/);
    expect(h.s).toEqual(snapshot);
  });
});

describe("source specialist query services", () => {
  it("computes73AC0 standoff with doubled wrapped words, including identical points and map seam", () => {
    const f = fixture();
    expect(
      specialistApproachPoint([1000, 1000], [3000, 1000], 728, f.c.tables),
    ).toEqual([2272, 1000]);
    expect(
      specialistApproachPoint([32760, 1000], [1010, 1000], 728, f.c.tables),
    ).toEqual([282, 1000]);
    expect(
      specialistApproachPoint([1000, 1000], [1000, 1000], 728, f.c.tables),
    ).toEqual([1000, 1728]);
    expect(f.s.rng.draws).toBe(0);
  });
  it("counts only eligible source plants in the actual chain and retains the0800 bypass", () => {
    const f = fixture(),
      plant: Native = Array(49).fill(0),
      other: Native = Array(200).fill(null);
    plant[6] = 2;
    other[6] = 3;
    const walkthrough = plant.slice();
    walkthrough[46] = 8;
    expect(
      specialistBlockerWeight(f.n(), [other, plant, walkthrough, plant]),
    ).toBe(20);
    put(f.n(), 73, 0x800);
    expect(specialistBlockerWeight(f.n(), [Array(49).fill(null)])).toBe(0);
  });
  it("uses75890's alternating obstacle samples and terrain rejection without RNG", () => {
    const f = fixture(),
      samples: { p: [number, number]; height: number }[] = [];
    expect(
      specialistVisibilityRay(
        f.s.terrain,
        [1000, 1000],
        [3000, 1000],
        3328,
        2048,
        f.c.tables,
        (p, height) => {
          samples.push({ p, height });
          return false;
        },
      ),
    ).toBe(true);
    expect(samples.length).toBeGreaterThan(10);
    expect(samples[0].height).toBeLessThan(3328);
    expect(
      samples
        .slice(1)
        .every(
          (q, i) =>
            q.p[0] - samples[i].p[0] >= 120 && q.p[0] - samples[i].p[0] <= 130,
        ),
    ).toBe(true);
    let calls = 0;
    expect(
      specialistVisibilityRay(
        f.s.terrain,
        [1000, 1000],
        [3000, 1000],
        3328,
        2048,
        f.c.tables,
        () => ++calls === 2,
      ),
    ).toBe(false);
    expect(calls).toBe(2);
    for (let y = 0; y < 128; y++)
      put(f.s.terrain.bytes, (y * 128 + 7) * 14 + 2, 5000);
    expect(
      specialistVisibilityRay(
        f.s.terrain,
        [1000, 1000],
        [3000, 1000],
        3328,
        2048,
        f.c.tables,
        () => false,
      ),
    ).toBe(false);
    expect(f.s.rng.draws).toBe(0);
  });
  it("uses fresh ground heights for the capture caller and class-specific admitted reveal radii", () => {
    const f = fixture(),
      m: Native = Array(124).fill(0);
    m[6] = 1;
    put(m, 15, 1);
    put(m, 7, 3000);
    put(m, 9, 1000);
    put32(m, 39, -5000);
    f.s.ecology.mules.push({
      id: "source:0:1",
      index: 1,
      native: m,
      pending: [],
    });
    put32(f.n(), 39, 999999);
    expect(geneticistLineOfSight(f.s, 0, 1, f.c)).toBe(true);
    const rules = { revealRadii: [100, 200, 300, 400] };
    f.n()[115] = null;
    expect(specialistRevealRadius(f.s, 0, rules)).toBe(100);
    f.s.specialists.bindings[0]!.style = 3;
    f.s.players[0].raw[43] = 3;
    f.n()[115] = 0;
    expect(specialistRevealRadius(f.s, 0, rules)).toBe(654);
    f.n()[115] = 128;
    expect(specialistRevealRadius(f.s, 0, rules)).toBe(454);
    f.n()[115] = 255;
    expect(specialistRevealRadius(f.s, 0, rules)).toBe(256);
  });
});
