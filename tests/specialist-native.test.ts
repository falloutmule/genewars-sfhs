import { describe, it, expect } from "vitest";
import {
  loadSpecialistPool,
  unknownSpecialistPriors,
  createSpecialist,
  createMissionSpecialists,
  bindSpecialistResources,
  projectSpecialistMotion,
  type SpecialistRules,
} from "../src/sim/mechanics/specialist-native";
const pointers = (p: number) =>
  (p >= 31 && p < 39) || (p >= 176 && p < 180) || p >= 192;
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  n[p]! | (n[p + 1]! << 8) | (n[p + 2]! << 16) | (n[p + 3]! << 24);
const put = (n: (number | null)[], p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const rules: SpecialistRules = {
  actorResourceNames: Array.from(
    { length: 16 },
    (_, i) => `DATA/SPEC/SYNTH${i}.ANB`,
  ),
  actorClassSpeeds: [960, 576, 1088, 832],
};
function player(owner = 0) {
  const p = Array(1805).fill(0);
  p[1] = owner;
  for (let i = 0; i < 20; i++) {
    const at = 0x16 + i * 36;
    p[at] = 65;
    p[at + 0x15] = i % 4;
    p[at + 0x16] = Math.floor(i / 5);
    p[at + 0x17] = 30;
    p[at + 0x19] = 40;
    p[at + 0x1a] = 40;
  }
  return p;
}
const request = {
  blueprintIndex: 10,
  origin: {
    position: [100, -200] as [number, number],
    height: 123456,
    shade: 37,
  },
  finalTarget: [777, -888] as [number, number],
};
describe("source specialist200-byte native pool/factory", () => {
  it("copies exactly20 packed140-byte records without reading adjacent slots or inventing a native tail", () => {
    const packed = Array.from({ length: 2800 }, (_, i) => i % 256);
    for (let i = 0; i < 20; i++) packed[i * 140 + 6] = 0;
    const saved = packed.slice(),
      pool = loadSpecialistPool(packed);
    for (let slot = 0; slot < 20; slot++) {
      const n = pool.records[slot];
      expect(n.slice(0, 31)).toEqual(packed.slice(slot * 140, slot * 140 + 31));
      expect(n.slice(39, 148)).toEqual(
        packed.slice(slot * 140 + 31, (slot + 1) * 140),
      );
      expect(n.slice(148)).toEqual(Array(52).fill(null));
      expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    }
    expect(packed).toEqual(saved);
    expect(pool.bindings).toEqual(Array(20).fill(null));
  });
  it("preserves explicit numeric priors, rejects process pointer bytes and sourceactive without a live roster", () => {
    const prior = unknownSpecialistPriors();
    prior[3][155] = 217;
    prior[19][190] = 93;
    const packed = Array(2800).fill(0),
      pool = loadSpecialistPool(packed, prior);
    expect(pool.records[3][155]).toBe(217);
    expect(pool.records[19][190]).toBe(93);
    expect(prior[3][6]).toBe(null);
    prior[0][31] = 0;
    expect(() => loadSpecialistPool(packed, prior)).toThrow("pointer");
    prior[0][31] = null;
    packed[6] = 3;
    expect(() => loadSpecialistPool(packed, prior)).toThrow("retained player");
  });
  it("rebinds active source actors through56E20 using retained blueprint/style/category rather than source defaults", () => {
    const packed = Array(2800).fill(0),
      p = player(),
      index = 2;
    packed[6] = 3;
    packed[24] = 0;
    packed[116 - 8] = index;
    const prior = unknownSpecialistPriors();
    prior[0][151] = 99;
    const pool = loadSpecialistPool(packed, prior, { players: [p], rules });
    expect(pool.bindings[0]).toMatchObject({
      owner: 0,
      blueprintIndex: index,
      style: 2,
      category: 0,
      resourceKey: 8,
      assetKey: "SYNTH8",
    });
    expect(pool.records[0][151]).toBe(0);
    expect(pool.records[0][176]).toBe(null);
    expect(pool.records[0][192]).toBe(null);
  });
  it("writes exact partial factory fields while preserving links/counter/desiredspeed/fractions and null handles", () => {
    const packed = Array.from({ length: 2800 }, (_, i) => (i * 11) & 255);
    for (let i = 0; i < 20; i++) packed[i * 140 + 6] = 0;
    const pool = loadSpecialistPool(packed),
      p = player(2),
      index = 10,
      n = pool.records[index];
    n[30] = 219;
    put(n, 63, 123);
    n[67] = 181;
    n[68] = 193;
    const before = structuredClone({ pool, p });
    const r = createSpecialist(pool, p, request, rules),
      a = r.pool.records[index];
    expect(r.created?.index).toBe(index);
    expect([
      a[6],
      word(a, 15),
      a[24],
      a[25],
      a[26],
      a[27],
      a[28],
      a[29],
      a[30],
      a[85],
      a[116],
    ]).toEqual([3, 10, 2, 8, 0, 0, 1, 0, 219, 1, 10]);
    expect([
      word(a, 7),
      word(a, 9),
      dword(a, 17),
      a[23],
      dword(a, 39),
      word(a, 43),
      word(a, 21),
      word(a, 112),
    ]).toEqual([777, -888, 123456, 37, 0, 50, 0x0a80, 0x0400]);
    expect([word(a, 63), a[67], a[68], word(a, 0), word(a, 3)]).toEqual([
      123,
      181,
      193,
      word(n, 0),
      word(n, 3),
    ]);
    expect(r.created?.motion).toMatchObject({
      height: 0,
      ground: 123456,
      desiredSpeed: 123,
      sourceClassSpeed: 1088,
    });
    for (let i = 0; i < 200; i++) if (pointers(i)) expect(a[i]).toBe(null);
    expect(r.player[3]).toBe(1);
    expect(r.player[4]).toBe(10);
    expect(r.player[0x16 + 10 * 36 + 0x20] & 1).toBe(1);
    expect({ pool, p }).toEqual(before);
    expect(r.activationPending).toBe(true);
  });
  it("binds all4styles×4categories and firstfree owner partitions with complete JSON-safe images", () => {
    for (let owner = 0; owner < 4; owner++)
      for (let style = 0; style < 4; style++)
        for (let category = 0; category < 4; category++) {
          const pool = loadSpecialistPool(Array(2800).fill(0)),
            p = player(owner),
            at = 0x16 + 10 * 36;
          p[at + 0x15] = style;
          p[at + 0x16] = category;
          pool.records[owner * 5][6] = 7;
          const r = createSpecialist(pool, p, request, rules),
            created = r.created!;
          expect(created.index).toBe(owner * 5 + 1);
          expect(created.binding.resourceKey).toBe(style * 4 + category);
          expect(created.binding.classSpeed).toBe(
            rules.actorClassSpeeds[style],
          );
          const saved = JSON.parse(JSON.stringify(r));
          expect(saved).toEqual(r);
          expect(
            projectSpecialistMotion(
              saved.pool.records[created.index],
              saved.created.binding,
            ),
          ).toEqual(created.motion);
        }
  });
  it("applies actual32record category order/gates and full-pool failure quotas without retries", () => {
    const pool = loadSpecialistPool(Array(2800).fill(0)),
      p = player(),
      input = {
        mask: 15,
        campaign: true,
        progress: 0,
        origin: request.origin,
        target: request.finalTarget,
      };
    const r = createMissionSpecialists(pool, p, input, rules);
    expect(r.created).toEqual([0, 1]);
    expect(r.attempts.map((a) => a.blueprintIndex)).toEqual([0, 10]);
    const all = createMissionSpecialists(
      pool,
      p,
      { ...input, progress: 4 },
      rules,
    );
    expect(all.created).toEqual([0, 1, 2, 3]);
    expect(all.attempts.map((a) => a.blueprintIndex)).toEqual([0, 5, 10, 15]);
    for (let i = 0; i < 5; i++) pool.records[i][6] = 7;
    const full = createMissionSpecialists(
      pool,
      p,
      { ...input, progress: 4 },
      rules,
    );
    expect(full.attempts.map((a) => a.index)).toEqual([null, null, null, null]);
    expect(full.created).toEqual([]);
    expect(full.player[3]).toBe(0);
  });
  it("rolls back an invalid later style, unknown required prior and roster overflow atomically", () => {
    const pool = loadSpecialistPool(Array(2800).fill(0)),
      p = player();
    p[0x16 + 10 * 36 + 0x15] = 255;
    const saved = structuredClone({ pool, p });
    expect(() =>
      createMissionSpecialists(
        pool,
        p,
        {
          mask: 5,
          campaign: true,
          progress: 0,
          origin: request.origin,
          target: request.finalTarget,
        },
        rules,
      ),
    ).toThrow("style");
    expect({ pool, p }).toEqual(saved);
    p[0x16 + 10 * 36 + 0x15] = 2;
    pool.records[0][74] = null;
    expect(() => createSpecialist(pool, p, request, rules)).toThrow("Unknown");
    pool.records[0][74] = 0;
    p[3] = 5;
    expect(() => createSpecialist(pool, p, request, rules)).toThrow(
      "list is full",
    );
  });
});
