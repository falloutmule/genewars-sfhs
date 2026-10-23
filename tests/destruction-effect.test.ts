import { describe, it, expect } from "vitest";
import {
  makeDestructionEffect,
  runBlastArea,
  stepDestructionEffect,
  type BlastTarget,
  type BlastAreaContext,
  type DestructionCode,
  type DestructionChildRequest,
} from "../src/sim/mechanics/destruction-effect";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import { terrainFromBytes } from "../src/sim/mechanics/terrain";
import { nextRandom } from "../src/sim/mechanics/random";
import type { SourceEntityId } from "../src/sim/campaign/source-pools";
const counts: Record<DestructionCode, number> = {
    2: 10,
    3: 9,
    5: 14,
    27: 8,
    28: 7,
    29: 7,
    30: 4,
    31: 3,
    46: 5,
  },
  profile = (code: DestructionCode) => ({
    holds: Array(counts[code]).fill(0),
    flags: 0,
    first: 0,
    last: counts[code] - 1,
  });
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
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function fixture(code: DestructionCode = 5) {
  const raw = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    put(raw, i * 14 + 2, 1000);
    raw[i * 14 + 5] = 7;
  }
  const terrain = terrainFromBytes(raw),
    rng = { seed: 0, draws: 0, ring: 31 },
    prior = Array.from({ length: 81 }, (_, i) =>
      i >= 31 && i < 39 ? null : (i * 7) & 255,
    );
  prior[6] = 0;
  const result = makeDestructionEffect(
    prior,
    {
      slot: 0,
      code,
      owner: 4,
      position: [1024, 1024],
      height: 2000,
      angles: [0, 0, 0],
      parameter: code >= 27 ? 80 : 0,
      delay: 0,
    },
    terrain,
    rng,
    tables,
    profile(code),
  );
  return { terrain, rng, prior, n: result.native, result };
}
function target(
  kind: number,
  index = 0,
  position: [number, number] = [1024, 1024],
): BlastTarget {
  const native: (number | null)[] = Array.from(
    { length: kind === 3 ? 200 : kind === 1 ? 124 : kind === 4 ? 67 : 97 },
    (_, i) => (i >= 31 && i < 39 ? null : 0),
  );
  native[6] = kind;
  put(native, 15, index);
  put(native, 7, position[0]);
  put(native, 9, position[1]);
  put32(native, 17, 2000);
  put32(native, 39, 2000);
  put(native, 43, 900);
  return {
    id: `source:${kind - 1}:${index}`,
    kind,
    index,
    owner: 4,
    position,
    height: 2000,
    relativeHeight: 0,
    movable: false,
    native,
    plantProtected: false,
  };
}
function area(list: BlastTarget[]) {
  let countdown = 1200;
  const calls: {
      target: SourceEntityId;
      damage: number;
      attacker: SourceEntityId | null;
    }[] = [],
    plants: string[] = [],
    directions: [number, number][] = [
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
    c: BlastAreaContext = {
      directions,
      tables,
      readCountdown: () => countdown,
      writeCountdown: (v) => {
        countdown = v;
      },
      head: (p) =>
        p[0] === 1024 && p[1] === 1024 ? (list[0]?.id ?? null) : null,
      resolve: (id) => {
        const t = list.find((t) => t.id === id);
        if (!t) throw Error("unknown target");
        return t;
      },
      next: (id) => list[list.findIndex((t) => t.id === id) + 1]?.id ?? null,
      damage: (id, damage, attacker) =>
        calls.push({ target: id, damage, attacker }),
      plantDamage: (id, d) => plants.push(`damage:${id}:${d}`),
      plantIgnite: (id) => plants.push(`ignite:${id}`),
    };
  return {
    c,
    calls,
    plants,
    get countdown() {
      return countdown;
    },
  };
}
describe("source shared destruction effects", () => {
  it("preserves real numeric priors and uses only established factory draws", () => {
    for (const code of [2, 3, 5, 27, 28, 29, 30, 31, 46] as const) {
      const f = fixture(code);
      for (const i of [30, 67, 68, 71, 72, 73, 77, 78, 79, 80])
        expect(f.n[i]).toBe(f.prior[i]);
      expect(f.n.slice(31, 39)).toEqual(Array(8).fill(null));
      expect(f.rng.draws).toBe(
        code === 5 || (code >= 27 && code <= 31) ? 1 : 0,
      );
      expect(word(f.n, 21)).toBe(
        code === 46 ? 0x820 : code >= 27 ? 0x180 : 0x20,
      );
      expect(f.n[76]).toBe(code === 46 ? 0 : f.prior[76]);
    }
  });
  it("shortens only an actual countdown above600 and requires ordered real target damage", () => {
    const f = fixture(),
      t = target(4),
      a = area([t]);
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.countdown).toBe(1190);
    expect(a.calls).toEqual([
      { target: t.id, damage: 48, attacker: "source:4:0" },
    ]);
    a.c.writeCountdown(600);
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.countdown).toBe(600);
  });
  it("applies forced building parameters and preserves far-hit null attacker attribution", () => {
    const f = fixture(),
      t = target(4);
    t.height = 10000;
    const a = area([t]);
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.calls).toEqual([]);
    runBlastArea(f.n, 1, null, f.rng, a.c);
    expect(a.calls).toEqual([{ target: t.id, damage: 24, attacker: null }]);
  });
  it("uses actual fixed direction order and current next links after recursive mutation", () => {
    const f = fixture(),
      one = target(4, 0),
      two = target(4, 1),
      three = target(4, 2),
      a = area([one, two, three]);
    let changed = false;
    a.c.next = (id) => (id === one.id ? (changed ? three.id : two.id) : null);
    a.c.damage = (id, damage, attacker) => {
      a.calls.push({ target: id, damage, attacker });
      changed = true;
    };
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.calls.map((x) => x.target)).toEqual([one.id, three.id]);
    const seen: [number, number][] = [];
    a.c.head = (p) => {
      seen.push(p);
      return null;
    };
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(seen).toEqual(a.c.directions.map((d) => [1024 + d[0], 1024 + d[1]]));
  });
  it("runs plant damage/ignition only through their actual random and protection branches", () => {
    const f = fixture(),
      t = target(2),
      a = area([t]);
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.plants).toEqual([`damage:${t.id}:20`]);
    a.plants.length = 0;
    let seed = 1;
    while (((Math.imul(seed, 0xe62d) & 65535) >>> 8) % 20 < 5) seed++;
    f.rng.seed = seed;
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.plants).toEqual([`ignite:${t.id}`]);
    t.plantProtected = true;
    const draws = f.rng.draws;
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(f.rng.draws).toBe(draws);
  });
  it("uses distinct creature/specialist/family7 damage and cumulative instigator counters", () => {
    const f = fixture(),
      creature = target(1),
      specialist = target(3),
      other = target(7),
      actor = target(3, 7),
      a = area([creature, specialist, other, actor]);
    actor.native[129] = 1;
    put(actor.native, 127, 0);
    a.c.resolve = (id) =>
      [creature, specialist, other, actor].find((t) => t.id === id)!;
    a.c.next = (id) =>
      id === creature.id
        ? specialist.id
        : id === specialist.id
          ? other.id
          : null;
    runBlastArea(f.n, 1, actor.id, f.rng, a.c);
    expect(a.calls.map((x) => [x.damage, x.attacker])).toEqual([
      [160, "source:4:0"],
      [16, "source:4:0"],
      [1, null],
    ]);
    expect(word(actor.native, 132) + word(actor.native, 134)).toBe(9);
  });
  it("rejects a missing real damage service inside an outer transaction", () => {
    const f = fixture(),
      t = target(4),
      a = area([t]),
      before = JSON.stringify({ n: f.n, rng: f.rng });
    a.c.damage = undefined as never;
    const rng = { ...f.rng };
    expect(() => runBlastArea(f.n.slice(), 0, null, rng, a.c)).toThrow(
      /damage virtual/,
    );
    expect(JSON.stringify({ n: f.n, rng: f.rng })).toBe(before);
  });
  it("creates marked smoke before the actual ground blast and retires once", () => {
    const f = fixture(30);
    f.n[70] = 1;
    f.n[67] = f.n[68] = 0;
    f.n[30] = 0;
    f.rng.draws = 0;
    put(f.n, 61, 0);
    const requests: DestructionChildRequest[] = [],
      r = stepDestructionEffect(f.n, f.rng, {
        frame: 2,
        gravity: 1024,
        water: 1632,
        terrain: f.terrain,
        tables,
        bounce: Array(8).fill(64),
        friction: Array(8).fill(32),
        profile,
        obstacle: () => null,
        particle(q, rng) {
          requests.push(q);
          if (q.code === 6) nextRandom(rng);
          return true;
        },
      });
    expect(requests.map((r) => [r.code, r.newborn])).toEqual([
      [6, true],
      [3, true],
    ]);
    expect(r.newborns).toBe(2);
    expect(r.retirementRequired).toBe(true);
    expect(f.rng.draws).toBe(3);
  });
  it("retires an expired debris timer before smoke/contact factories or draws", () => {
    const f = fixture(27);
    f.n[70] = 1;
    put(f.n, 74, 0);
    const draws = f.rng.draws,
      r = stepDestructionEffect(f.n, f.rng, {
        frame: 2,
        gravity: 1024,
        water: 1632,
        terrain: f.terrain,
        tables,
        bounce: Array(8).fill(64),
        friction: Array(8).fill(32),
        profile,
        obstacle: () => null,
        particle() {
          throw Error("must not create");
        },
      });
    expect(r.retirementRequired).toBe(true);
    expect(f.rng.draws).toBe(draws);
  });
  it("freezes46 physics while preserving its timer and payload lifecycle", () => {
    const f = fixture(46);
    put(f.n, 74, 20);
    const before = f.n.slice(),
      r = stepDestructionEffect(f.n, f.rng, {
        frame: 0,
        gravity: 1024,
        water: 1632,
        terrain: f.terrain,
        tables,
        bounce: [],
        friction: [],
        profile,
        particle: () => false,
      });
    expect(r.samples).toEqual([]);
    expect(r.native.slice(39, 69)).toEqual(before.slice(39, 69));
    expect(word(r.native, 74)).toBe(19);
    expect(r.native[76]).toBe(1);
    expect(r.retirementRequired).toBe(false);
  });
});
