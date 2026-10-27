import { describe, expect, it } from "vitest";
import {
  aimGeneticistProjectile,
  createGeneticistProjectileRecord,
  createGeneticistProjectileNative,
  createGeneticistCaptureEffectRecord,
  applyGeneticistCaptureEffect,
  geneticistProjectileQuery,
  stepGeneticistProjectileRecord,
  type GeneticistEffectDescriptor,
  type GeneticistEffectEntity,
  type GeneticistEffectChildRequest,
  type GeneticistProjectileStepContext,
} from "../src/sim/mechanics/geneticist-projectile";
import {
  applyMuleCaptureImpact,
  damageMuleEntity,
  stepNeutralMule,
  stepOwnedMule,
  type MuleContext,
  type MuleEvent,
} from "../src/sim/mechanics/mule";
import type { EcologyState } from "../src/sim/mechanics/ecology";
import type { GeneRng } from "../src/sim/mechanics/random";
import { originalAngle } from "../src/sim/mechanics/motion";

type N = (number | null)[];
const put = (n: N, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const put32 = (n: N, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const dword = (n: N, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const tables = {
  atan: Array.from({ length: 257 }, (_, i) =>
    Math.round((Math.atan(i / 256) * 1024) / Math.PI),
  ),
  sine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
  ),
  cosine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
  ),
};
const descriptor = (code: number): GeneticistEffectDescriptor => ({
  code,
  completion: code === 20 ? 0 : 4,
  gravity: false,
  priority: code === 20 ? 12 : 9,
  childCode: code === 20 ? null : 20,
  obstacle: true,
  water: true,
});
const profile = (code: number) => ({
  first: 0,
  last: code === 20 ? 6 : 0,
  flags: 0,
  holds: Array(code === 20 ? 7 : 1).fill(0),
});
function setup(code: 20 | 41 | 42 | 43 = 41) {
  const terrain = { bytes: Array(229376).fill(0), revision: 0 };
  for (let c = 0; c < 16384; c++) {
    put(terrain.bytes, c * 14 + 2, 1024);
    terrain.bytes[c * 14 + 5] = 2;
  }
  const prior: N = Array(81).fill(0);
  prior.fill(null, 31, 39);
  prior[30] = 37;
  prior[67] = 3;
  prior[68] = 5;
  prior[73] = 7;
  prior[76] = 91;
  const rng: GeneRng = { seed: 5428, ring: 31, draws: 0 },
    children: GeneticistEffectChildRequest[] = [];
  const c: GeneticistProjectileStepContext = {
    terrain,
    tables,
    bounce: Array(8).fill(128),
    water: 0,
    frame: 0,
    descriptor: descriptor(code),
    profile: profile(code),
    players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    speciesComponents: Array.from({ length: 25 }, () => [4, 4]),
    nearby: () => [],
    entity: () => null,
    specialistSkill: () => {
      throw Error("unexpected skill");
    },
    impact: () => {
      throw Error("unexpected impact");
    },
    obstacle: () => null,
    child: (r) => {
      children.push(r);
      return true;
    },
  };
  const native =
    code === 20
      ? createGeneticistCaptureEffectRecord(
          prior,
          0,
          {
            code: 20,
            owner: 0,
            position: [16384, 16384],
            height: 4096,
            angles: [0, 0, 0],
            parameter: 0,
            delay: 0,
            parent: { index: 2, kind: 3 },
            newborn: true,
          },
          c,
        )
      : createGeneticistProjectileNative(
          prior,
          0,
          {
            code,
            owner: 0,
            position: [16384, 16384],
            height: 4096,
            angles: [512, 512, 6400],
            parameter: 32,
            delay: 0,
            parent: { index: 2, kind: 3 },
          },
          c,
        ).native;
  return { terrain, prior, rng, c, native, children };
}
function mule(index = 0, owner = 4): GeneticistEffectEntity & { native: N } {
  const n: N = Array(124).fill(0);
  n.fill(null, 31, 39);
  n[6] = 1;
  n[24] = owner;
  n[94] = 8;
  n[118] = 50;
  n[119] = 255;
  n[122] = 4;
  n[123] = 255;
  n[83] = 1;
  put(n, 15, index);
  put(n, 7, 16484);
  put(n, 9, 16384);
  put32(n, 17, 2048);
  put32(n, 39, 4096);
  put(n, 98, 100);
  put(n, 100, 100);
  put(n, 102, 9000);
  put(n, 104, 50);
  put(n, 106, 100);
  put(n, 108, 100);
  put(n, 59, 512);
  put(n, 21, 0x280);
  put(n, 43, 50);
  return {
    id: `source:0:${index}`,
    index,
    kind: 1,
    owner,
    position: [16484, 16384],
    physicalHeight: 4096,
    native: n,
  };
}
function ecology(target: ReturnType<typeof mule>): EcologyState {
  return {
    schemaVersion: 1,
    sourceSha256: "synthetic",
    ticks: 0,
    plantCursor: 0,
    plantCount: 0,
    ownerPlantCounts: [0, 0, 0, 0],
    plants: [],
    mules: [
      {
        id: target.id as `source:0:${number}`,
        index: target.index,
        native: target.native,
        pending: [],
      },
    ],
    otherEntities: [],
    pending: [],
    unsupported: [],
  };
}
function muleContext(f: ReturnType<typeof setup>): MuleContext {
  return {
    terrain: f.terrain,
    tables,
    frame: 1,
    gravity: 1024,
    water: 0,
    climate: 106,
    bounce: Array(8).fill(128),
    profile: () => ({ first: 0, last: 3, flags: 0, holds: [0, 0, 0, 0] }),
    obstacleAt: () => false,
    combat: {
      queryRadius: 512,
      attack: 20,
      defense: 8,
      disposition: 100,
      foodWeights: [1, 2, 3],
      attackChannel: 20,
    },
    rules: {
      schemaVersion: 1,
      plants: [],
      spreadDirections: [],
      plantResources: [],
      mule: {
        selector: 4,
        baseSpeed: 704,
        lifetimeScale: 19000,
        reserveScale: 160,
        healthScale: 80,
        healthRecoveryPeriod: 20,
        warmThreshold: 25,
      },
    },
  };
}
describe("original Geneticist projectile factories and aim", () => {
  it("initializes all three selectors with exact timer/parent writes and retained slot counter/fractions", () => {
    for (const code of [41, 42, 43] as const) {
      const f = setup(code),
        n = f.native;
      expect([n[6], n[69], n[73], word(n, 71), word(n, 74), n[76]]).toEqual([
        5,
        code,
        3,
        2,
        32,
        0,
      ]);
      expect([n[30], n[67], n[68]]).toEqual([37, 3, 5]);
      expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
      expect(f.rng.draws).toBe(0);
      expect(f.prior[6]).toBe(0);
    }
  });
  it("retains capture20 parent-kind/index/payload from its allocated prior, not projectile parent", () => {
    const f = setup(20);
    expect([f.native[73], f.native[76], word(f.native, 74)]).toEqual([
      7, 91, -1,
    ]);
    f.prior[73] = null;
    const n = createGeneticistCaptureEffectRecord(
      f.prior,
      3,
      {
        code: 20,
        owner: 0,
        position: [100, 200],
        height: 2048,
        angles: [0, 0, 0],
        parameter: 7,
        delay: 0,
        parent: { index: 2, kind: 3 },
        newborn: true,
      },
      f.c,
    );
    expect(n[73]).toBeNull();
    expect(word(n, 74)).toBe(7);
  });
  it("uses actual stationary target height, source muzzle1280 and no aim RNG", () => {
    const f = setup(),
      a: N = Array(200).fill(0),
      t = mule();
    a[6] = 3;
    a[24] = 0;
    put(a, 15, 2);
    put(a, 7, 16384);
    put(a, 9, 16384);
    put32(a, 39, 4096);
    put(t.native, 7, 17408);
    put32(t.native, 39, 4096);
    const before = JSON.stringify([a, t.native]),
      aim = aimGeneticistProjectile(a, t.native, 100, f.c);
    expect(aim).toEqual([512, originalAngle(1024, 160, tables.atan), 6400]);
    const made = createGeneticistProjectileRecord(
      f.prior,
      0,
      {
        actor: 2,
        target: 0,
        projectileIndex: 4,
        profile: {
          speedWord: 100,
          rangeFactor: 1,
          cooldown: 5,
          effectCode: 41,
        },
        position: [16384, 16384],
        height: 5376,
        owner: 0,
        aimSpeed: 6400,
        aimHeightOffset: 1280,
        parameter: 32,
        delay: 0,
      },
      a,
      t.native,
      f.c,
    );
    expect(made.aim).toEqual(aim);
    expect(made.events.map((e) => [e.cue, e.mode, e.ratePercent])).toEqual([
      [33, 2, 100],
    ]);
    expect(JSON.stringify([a, t.native])).toBe(before);
    put(t.native, 45, 2000);
    //First estimate2621 -> predicted range1343 -> second3438 -> average3029.
    //The final wrapped fixed offset is369, so73A50 must use distance1393.
    expect(aimGeneticistProjectile(a, t.native, 100, f.c)).toEqual([
      512,
      originalAngle(1393, 160, tables.atan),
      6400,
    ]);
  });
  it("rejects uninitialized required slot bytes before producing a record", () => {
    const f = setup();
    f.prior[67] = null;
    expect(() =>
      createGeneticistProjectileNative(
        f.prior,
        0,
        {
          code: 41,
          owner: 0,
          position: [1, 2],
          height: 4096,
          angles: [512, 512, 6400],
          parameter: 32,
          delay: 0,
          parent: null,
        },
        f.c,
      ),
    ).toThrow(/prior|initialized/i);
  });
});
describe("original41/42/43 and20 callbacks", () => {
  it("moves by source fixed fractions, decrements range timer, scans with exactly two draws", () => {
    const f = setup(),
      before = JSON.stringify(f.native),
      r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
    expect(word(r.native, 7)).toBe(16484);
    expect(r.native[67]).toBe(3);
    expect(word(r.native, 74)).toBe(31);
    expect(f.rng.draws).toBe(2);
    expect(r.query?.points).toHaveLength(5);
    expect(r.retirementRequired).toBe(false);
    expect(JSON.stringify(f.native)).toBe(before);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  it("requests marked child20 before source parent retirement, including failed allocation", () => {
    for (const allocated of [false, true]) {
      const f = setup();
      put(f.native, 74, 0);
      f.c.child = (r, _rng, parent) => {
        expect(parent[6]).toBe(5);
        expect(parent[69]).toBe(41);
        expect(word(parent, 74)).toBe(-1);
        f.children.push(r);
        return allocated;
      };
      const r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
      expect(r.retirementRequired).toBe(true);
      expect(r.newborns).toBe(+allocated);
      expect(r.native[6]).toBe(5);
      expect(f.children[0]).toMatchObject({
        code: 20,
        owner: 0,
        parameter: 0,
        parent: { kind: 3, index: 2 },
        newborn: true,
      });
      expect(f.rng.draws).toBe(0);
    }
  });
  it("marks actual odd-phase building impact in76, ignoring its nominated building parent", () => {
    for (const own of [false, true]) {
      const f = setup();
      f.c.frame = 1;
      f.c.obstacle = () => ({ index: 6, kind: 4 });
      if (own) {
        put(f.native, 71, 6);
        f.native[73] = 4;
      }
      const r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
      expect(r.retirementRequired).toBe(!own);
      expect(r.native[76]).toBe(own ? 0 : 7);
      if (!own) expect(f.children[0].parameter).toBe(7);
    }
  });
  it("uses inclusive64 physical range and strict first linked tie, never the broad256 scan radius", () => {
    for (const offset of [64, 65]) {
      const f = setup(),
        first = mule(1),
        second = mule(2);
      first.position = [16484 + offset, 16384];
      second.position = [16484 + offset, 16384];
      f.c.nearby = () => [first, second];
      const r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
      expect(r.retirementRequired).toBe(offset === 64);
      expect(f.rng.draws).toBe(2);
    }
  });
  it("deflects only source-capable hostile species and consumes three response draws", () => {
    const f = setup(),
      t = mule(1);
    t.native[122] = 19;
    t.native[118] = 100;
    f.c.nearby = () => [t];
    f.c.entity = () => ({
      id: "source:1:2",
      index: 2,
      kind: 3,
      owner: 0,
      position: [16384, 16384],
      physicalHeight: 4096,
    });
    const r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
    expect(r.retirementRequired).toBe(false);
    expect(r.events[0]).toMatchObject({ entity: t.id, cue: 97 });
    expect(r.events[0].ratePercent).toBeGreaterThanOrEqual(80);
    expect(f.rng.draws).toBe(5);
    expect(word(r.native, 61)).toBe(6400);
    expect(f.children).toEqual([]);
    const g = setup();
    t.native[122] = 4;
    g.c.nearby = () => [t];
    expect(
      stepGeneticistProjectileRecord(g.native, g.rng, g.c).retirementRequired,
    ).toBe(true);
    expect(g.rng.draws).toBe(2);
  });
  it("creates water feedback unmarked before projectile completion", () => {
    const f = setup();
    f.c.frame = 3;
    f.c.water = 4096;
    for (let c = 0; c < 16384; c++) f.terrain.bytes[c * 14 + 5] = 0;
    const r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
    expect(f.children[0]).toMatchObject({
      code: 48,
      owner: 0,
      height: 4096,
      newborn: false,
    });
    expect(r.retirementRequired).toBe(false);
    expect(r.newborns).toBe(0);
  });
  it("uses ground first-contact bounce, then requests the capture child", () => {
    const f = setup();
    put32(f.native, 39, 2050);
    put(f.native, 49, -64);
    const r = stepGeneticistProjectileRecord(f.native, f.rng, f.c);
    expect(dword(r.native, 39)).toBe(2048);
    expect(word(r.native, 49)).toBe(32);
    expect(r.retirementRequired).toBe(true);
    expect(f.rng.draws).toBe(0);
  });
  it("retires20 only after its actual seven-frame animation plus timer, with no proximity query", () => {
    const f = setup(20);
    f.native[30] = 0;
    let n = f.native;
    for (let i = 0; i < 6; i++) {
      const r = stepGeneticistProjectileRecord(n, f.rng, f.c);
      expect(r.retirementRequired).toBe(i === 5);
      expect(r.query).toBeNull();
      n = r.native;
    }
    expect(f.rng.draws).toBe(0);
    expect(f.children).toEqual([]);
  });
  it("rejects unsupported common-physics flags without mutating its input or RNG", () => {
    const f = setup();
    put(f.native, 21, 0);
    const before = JSON.stringify([f.native, f.rng]);
    expect(() => stepGeneticistProjectileRecord(f.native, f.rng, f.c)).toThrow(
      /state/,
    );
    expect(JSON.stringify([f.native, f.rng])).toBe(before);
  });
});
describe("immediate capture20 and concrete Mule reaction", () => {
  it("runs source5B260 waypoint entry while state21 coasts into an occupied cell", () => {
    const f = setup(),
      t = mule(0, 0),
      peer = mule(1),
      state = ecology(t),
      c = muleContext(f);
    state.mules.push({
      id: "source:0:1",
      index: 1,
      native: peer.native,
      pending: [],
    });
    const n = t.native;
    put(n, 7, 257);
    put(n, 9, 16384);
    put32(n, 39, 2048);
    put(peer.native, 7, 200);
    put(peer.native, 9, 16384);
    put32(peer.native, 39, 2048);
    n[94] = 21;
    put(n, 63, 0);
    put(n, 65, 704);
    put(n, 61, 704);
    put(n, 45, -704);
    put(n, 57, 1536);
    put(n, 75, 1536);
    put(n, 108, 32767);
    put(n, 11, 100);
    put(n, 13, 16384);
    c.owned = {
      selectedPlayer: 0,
      globalFlags: 0,
      allianceMasks: [1, 2, 4, 8],
      buildings: [],
      operators: [],
      players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    };
    let relocated = false;
    c.cellOrder = () =>
      relocated ? ["source:0:0", "source:0:1"] : ["source:0:1"];
    c.relocate = (_s, _t, r, m, oldCell, newCell) => {
      expect([oldCell, newCell]).toEqual([8193, 8192]);
      expect(word(m.native, 7)).toBeLessThan(256);
      expect(r.draws).toBe(0);
      relocated = true;
    };
    const r = stepOwnedMule(state, 0, f.rng, c);
    expect(r.reason).toBeNull();
    expect(word(state.mules[0].native, 7)).toBeLessThan(256);
    expect(state.mules[0].native[94]).toBe(21);
    expect(state.mules[0].native[73]! & 1).toBe(1);
    expect(f.rng.draws).toBe(1);
    expect(relocated).toBe(true);
  });
  it("source6E9E0 relinks to arrival cell before final position assignment and its entry callback", () => {
    const f = setup(),
      t = mule(),
      peer = mule(1),
      state = ecology(t),
      c = muleContext(f);
    state.mules.push({
      id: "source:0:1",
      index: 1,
      native: peer.native,
      pending: [],
    });
    const n = t.native;
    put(n, 7, 255);
    put(n, 9, 16384);
    put32(n, 39, 2048);
    put(n, 11, 257);
    put(n, 13, 16384);
    put(n, 73, 0x10);
    put(n, 108, 100);
    put(peer.native, 7, 300);
    put(peer.native, 9, 16384);
    put32(peer.native, 39, 2048);
    let relocated = false;
    c.cellOrder = (cell) =>
      cell === 8193
        ? relocated
          ? ["source:0:0", "source:0:1"]
          : ["source:0:1"]
        : ["source:0:0"];
    c.relocate = (_s, _t, r, m, before, after) => {
      expect([before, after]).toEqual([8192, 8193]);
      expect(word(m.native, 7)).toBe(255);
      expect(r.draws).toBe(0);
      relocated = true;
    };
    const r = stepNeutralMule(state, 0, f.rng, c);
    expect(r.reason).toBeNull();
    expect(relocated).toBe(true);
    expect(word(state.mules[0].native, 7)).toBe(257);
    expect(r.events.some((e) => e.kind === "mule-moved")).toBe(true);
    expect(f.rng.draws).toBe(1);
  });
  it("uses retained specialist71/73 skill and applies damage before capture, preserving native aliases", () => {
    const f = setup(20),
      t = mule(),
      state = ecology(t),
      c = muleContext(f),
      events: MuleEvent[] = [];
    put(f.native, 7, t.position[0]);
    put(f.native, 71, 7);
    f.native[73] = 3;
    const n = t.native;
    const r = applyGeneticistCaptureEffect(f.native, f.rng, {
      nearby: () => [t],
      entity: () => ({
        id: "source:1:7",
        index: 7,
        kind: 3,
        owner: 0,
        position: [0, 0],
        physicalHeight: 0,
      }),
      specialistSkill: () => 10,
      impact: (target, e, r, request) =>
        events.push(
          ...applyMuleCaptureImpact(state, target.index, e, r, c, request),
        ),
    });
    expect(state.mules[0].native).toBe(n);
    expect([
      word(n, 106),
      n[94],
      word(n, 108),
      word(n, 88),
      n[90],
      n[87],
    ]).toEqual([99, 18, 72, 7, 3, 0]);
    expect(events.filter((e) => e.kind === "mule-audio").at(-1)?.channel).toBe(
      57,
    );
    expect(r.events[0].cue).toBe(57);
    expect(f.rng.draws).toBeGreaterThanOrEqual(3);
  });
  it("keeps the source lethal health0/state18 result and attacker kill credit", () => {
    const f = setup(20),
      t = mule(),
      state = ecology(t);
    put(t.native, 106, 1);
    f.native[24] = 2;
    const events = applyMuleCaptureImpact(
      state,
      0,
      f.native,
      f.rng,
      muleContext(f),
      { damage: 1, duration: 64, capturedByActor: null },
    );
    expect([
      word(t.native, 106),
      t.native[94],
      word(t.native, 102),
      word(t.native, 108),
    ]).toEqual([0, 18, 0, 64]);
    expect(
      events.find((e) => e.kind === "mule-combat-kill")?.attackerOwner,
    ).toBe(2);
  });
  it("skips dead/cold/out-of-range recipients and rejects unknown retained parent only on actual eligible impact", () => {
    const f = setup(20),
      t = mule();
    put(f.native, 7, t.position[0]);
    f.native[73] = null;
    for (const state of [15, 24]) {
      t.native[94] = state;
      const r = applyGeneticistCaptureEffect(f.native, f.rng, {
        ...f.c,
        nearby: () => [t],
      });
      expect(r.targets).toEqual([]);
      expect(r.events[0].cue).toBe(13);
    }
    t.native[94] = 8;
    expect(() =>
      applyGeneticistCaptureEffect(f.native, f.rng, {
        ...f.c,
        nearby: () => [t],
      }),
    ).toThrow(/prior/);
  });
  it("retains stunned references and timer during research damage, and recovers only through odd-phase expiry", () => {
    const f = setup(),
      t = mule(),
      state = ecology(t),
      c = muleContext(f);
    put32(t.native, 39, 2048);
    t.native[94] = 18;
    put(t.native, 108, 2);
    put(t.native, 85, 7);
    t.native[87] = 3;
    const events = damageMuleEntity(
      state,
      0,
      5,
      { kind: 3, index: 2, owner: 0 },
      f.rng,
      c,
    );
    expect(word(t.native, 108)).toBe(2);
    expect(t.native[94]).toBe(18);
    expect(events.some((e) => e.kind === "mule-audio")).toBe(false);
    expect(t.native[87]).toBe(3);
    expect(stepNeutralMule(state, 0, f.rng, c).committed).toBe(true);
    expect(word(state.mules[0].native, 108)).toBe(1);
    c.frame = 3;
    expect(stepNeutralMule(state, 0, f.rng, c).committed).toBe(true);
    expect(word(state.mules[0].native, 108)).toBe(0);
    const draws = f.rng.draws;
    c.frame = 5;
    expect(stepNeutralMule(state, 0, f.rng, c).committed).toBe(true);
    expect(state.mules[0].native[94]).toBe(8);
    expect(f.rng.draws).toBe(draws + 1);
  });
  it("uses admitted signed cold losses, freezes500 and preserves an already-cold source prefix guard", () => {
    const f = setup(),
      t = mule(0, 0),
      state = ecology(t),
      c = muleContext(f);
    put32(t.native, 39, 2048);
    t.native[123] = 1;
    c.climate = 25;
    c.coldResponse = { primaryLoss: 1, secondaryLoss: 0 };
    c.owned = {
      selectedPlayer: 0,
      globalFlags: 0,
      allianceMasks: [1, 2, 4, 8],
      buildings: [],
      operators: [],
      players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    };
    const r = stepOwnedMule(state, 0, f.rng, c);
    expect(r.reason).toBeNull();
    expect([
      state.mules[0].native[94],
      state.mules[0].native[123],
      word(state.mules[0].native, 108),
    ]).toEqual([15, 0, 499]);
    expect(r.events.some((e) => e.kind === "mule-portrait-refresh")).toBe(true);
    c.climate = 106;
    c.frame = 17;
    const before = word(state.mules[0].native, 102);
    expect(stepOwnedMule(state, 0, f.rng, c).committed).toBe(true);
    expect(state.mules[0].native[94]).toBe(15);
    expect(state.mules[0].native[123]).toBe(0);
    expect(word(state.mules[0].native, 102)).toBe(before - 1);
  });
  it("requires the actual cold14 burst before unlink receipt and never fabricates particles", () => {
    const f = setup(),
      t = mule(),
      state = ecology(t),
      c = muleContext(f);
    t.native[94] = 15;
    const before = JSON.stringify([state, f.rng]);
    expect(() => damageMuleEntity(state, 0, 1, null, f.rng, c)).toThrow(
      /burst14/,
    );
    expect(JSON.stringify([state, f.rng])).toBe(before);
    let count = 0;
    c.coldBurst = (_s, _t, _r, m, request) => {
      expect(m.native[6]).toBe(1);
      expect(request).toMatchObject({
        code: 14,
        parameter1: 80,
        parameter2: 70,
        owner: -1,
      });
      count = request.count;
    };
    const r = damageMuleEntity(state, 0, 1, null, f.rng, c);
    expect(count).toBeGreaterThanOrEqual(10);
    expect(count).toBeLessThanOrEqual(19);
    expect(t.native[6]).toBe(0);
    expect(f.rng.draws).toBe(1);
    expect(r[0].retirement?.countDelta).toBe(-1);
  });
});

describe("generic kind1 capture impact",()=>{
  it("dispatches the actual Crab reference and retains physical/identity gates",()=>{const f=setup(20),t=mule(),requests:unknown[]=[];t.native![122]=1;put(f.native,7,t.position[0]);put32(f.native,39,t.physicalHeight);f.native[73]=0;const c={...f.c,nearby:()=>[t],impact:(target:GeneticistEffectEntity,_e:N,_r:GeneRng,request:unknown)=>{requests.push({index:target.index,species:target.native![122],request});}};const r=applyGeneticistCaptureEffect(f.native,f.rng,c);expect(r.targets).toEqual([t.index]);expect(requests).toEqual([{index:t.index,species:1,request:{damage:1,duration:64,capturedByActor:null}}]);t.native![122]=25;expect(()=>applyGeneticistCaptureEffect(f.native,f.rng,c)).toThrow(/species0..24/);expect(requests).toHaveLength(1);});
});
