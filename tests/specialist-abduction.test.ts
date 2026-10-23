import { describe, expect, it } from "vitest";
import {
  cancelSpecialistWithoutActiveRole,
  setupStagedSpecialistAbduction,
  stepSpecialistAbductionCallback,
  type SpecialistAbductionCallbackContext,
} from "../src/sim/mechanics/specialist-abduction";
import {
  stepStagedSpecialistMotion,
  type SpecialistMotionContext,
} from "../src/sim/mechanics/specialist-motion";
import type { GeneticistWorld } from "../src/sim/mechanics/geneticist";
import { campaignFixture } from "./fixtures/campaign";
import { nextRandom } from "../src/sim/mechanics/random";
import { createSourceParticle } from "../src/sim/mechanics/landing";
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
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
function fixture(category = 0, style = 0) {
  const pack = campaignFixture(),
    n: N = Array(200).fill(0);
  for (const [a, b] of [
    [31, 39],
    [176, 180],
    [192, 200],
  ])
    n.fill(null, a, b);
  n[6] = 3;
  n[28] = 1;
  n[85] = 3;
  n[89] = 8;
  n[112] = 1;
  n[129] = 8;
  put32(n, 104, 10);
  for (const [p, v] of [
    [7, 1000],
    [9, 1000],
    [11, 1000],
    [13, 1000],
    [43, 50],
    [57, 512],
    [59, 512],
    [75, 512],
  ])
    put(n, p, v);
  put32(n, 17, 2048);
  put32(n, 39, 2048);
  const w: GeneticistWorld = {
    specialists: {
      schemaVersion: 1,
      records: Array.from({ length: 20 }, (_, i) =>
        i === 0 ? n : Array(200).fill(0),
      ),
      bindings: Array(20).fill(null),
    },
    players: Array.from({ length: 4 }, () => ({ raw: Array(1805).fill(0) })),
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    rng: { seed: 5428, ring: 31, draws: 0 },
    frame: 1,
    missionPrefix: Array(0x355e).fill(0),
    ecology: {
      schemaVersion: 1,
      sourceSha256: "synthetic",
      ticks: 0,
      plantCursor: 0,
      plantCount: 0,
      ownerPlantCounts: [0, 0, 0, 0],
      plants: [],
      mules: [],
      otherEntities: [],
      pending: [],
      unsupported: [],
    },
  };
  for (let i = 0; i < 16384; i++) {
    put(w.terrain.bytes, i * 14 + 2, 1024);
    w.terrain.bytes[i * 14 + 5] = 2;
    w.terrain.bytes[i * 14 + 12] = 64;
  }
  w.specialists.bindings[0] = {
    owner: 0,
    blueprintIndex: 0,
    category,
    style,
    resourceKey: 4 * style + category,
    assetKey: "SYNTHETIC",
    sourceName: "data/spec/synthetic.anb",
    classSpeed: 700,
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
  const raw = w.players[0].raw;
  raw[22 + 21] = style;
  raw[22 + 22] = category;
  raw[22 + 23] = 50;
  raw[22 + 24] = 40;
  raw[22 + 25] = 100;
  raw[22 + 26] = 100;
  raw[22 + 27] = 40;
  const motion: SpecialistMotionContext<GeneticistWorld> = {
    tables: pack.rules!.tables,
    gravity: 1024,
    water: 0,
    bounce: Array(8).fill(128),
    selectedPlayer: 0,
    obstacle: () => null,
    blockerWeight: () => 0,
  };
  const parent: N = Array(102).fill(0);
  parent[6] = 8;
  parent[87] = 2;
  const c: SpecialistAbductionCallbackContext<GeneticistWorld> = {
    tables: pack.rules!.tables,
    globalFlags: 56,
    runtimeMode: 0,
    override180d80: 0,
    runtimeCount11c2bc: 1000,
    cellOrder: () => [],
    motion: (s, i) => {
      stepStagedSpecialistMotion(s, i, motion);
    },
    animation: () => ({ first: 0, last: 2, flags: 0, holds: [0, 0, 0] }),
    abductionServices: { parent: () => parent, particle: () => null },
  };
  return {
    w,
    c,
    motion,
    n: () => w.specialists.records[0],
    raw: () => w.players[0].raw,
    parent,
  };
}
describe("specialist Ethereal abduction51E30/57A10", () => {
  it("preserves the source stage4/5 actions, timer behavior and exact draw counts", () => {
    const f = fixture();
    f.parent[87] = 4;
    const r = stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(f.n()[89]).toBe(11);
    expect(f.n()[25]).toBe(11);
    expect(dword(f.n(), 104)).toBe(10);
    expect(f.w.rng.draws).toBe(1);
    expect(r.abduction?.parentStage).toBe(4);
    f.parent[87] = 5;
    const before = { ...f.w.rng };
    stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(f.n()[89]).toBe(10);
    expect(f.n()[25]).toBe(10);
    expect(dword(f.n(), 104)).toBe(10);
    expect(f.w.rng).toEqual(before);
  });
  it("orders periodic feedback height/Y/X draws before the three expiry draws, even on capacity failure", () => {
    const f = fixture();
    f.w.frame = 8;
    put32(f.n(), 104, 1);
    const rng = { ...f.w.rng },
      height = 2048 + 640 + (nextRandom(rng) % 20 << 6),
      dy = nextRandom(rng) % 32,
      dx = nextRandom(rng) % 32;
    const action = nextRandom(rng) % 10 < 3 ? 8 : 11,
      timer = 20 + (nextRandom(rng) % 30),
      flag = nextRandom(rng) % 4 < 2;
    const r = stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(r.abduction?.particle).toEqual({
      slot: null,
      request: {
        code: 26,
        owner: 0,
        position: [1000 + dx, 1000 + dy],
        height,
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        parent: null,
        newborn: false,
      },
    });
    expect(f.w.rng).toEqual(rng);
    expect(f.n()[89]).toBe(action);
    expect(dword(f.n(), 104)).toBe(timer);
    expect(!!(f.n()[112]! & 4)).toBe(flag);
  });
  it("uses the actual unmarked26 constructor's one successful delay draw", () => {
    const f = fixture();
    f.w.frame = 8;
    const priors = Array.from({ length: 200 }, () => {
      const n: N = Array(81).fill(0);
      n.fill(null, 31, 39);
      n[67] = 17;
      n[68] = 93;
      return { fractionX: 17, fractionY: 93, occupied: false, nativePrior: n };
    });
    let made: ReturnType<typeof createSourceParticle> = null;
    f.c.abductionServices!.particle = (w, r) => {
      made = createSourceParticle(r, w.rng, {
        terrain: w.terrain,
        tables: f.c.tables,
        gravity: 1024,
        water: 0,
        bounce: Array(8).fill(128),
        frame: w.frame,
        profile: () => ({
          first: 0,
          last: 4,
          holds: [1, 1, 1, 1, 1],
          flags: 0,
        }),
        occupiedEffectSlots: [],
        slotPriors: priors,
        plantBlockerWeight: () => 0,
      });
      return made?.slot ?? null;
    };
    const r = stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(r.abduction?.particle?.slot).toBe(0);
    expect(f.w.rng.draws).toBe(4);
    expect(made).not.toBeNull();
    expect((made as unknown as { native: N }).native[21]! & 1).toBe(0);
    expect((made as unknown as { native: N }).native.slice(67, 69)).toEqual([
      17, 93,
    ]);
  });
  it("runs exact no-role51E80 cancellation without clearing queued bits or physical velocity", () => {
    const f = fixture(),
      n = f.n();
    n[85] = 1;
    n[87] = 3;
    n[88] = 2;
    n[126] = 4;
    n[130] = 8;
    n[22] = 255;
    put(n, 112, 65535);
    put(n, 73, 65535);
    put(n, 63, 700);
    put(n, 45, 123);
    n[84] = 20;
    const after = cancelSpecialistWithoutActiveRole(n);
    expect(after[126]).toBe(255);
    expect(after[130]).toBe(0);
    expect(word(after, 112) & 65535).toBe(0xee69);
    expect(word(after, 73) & 65535).toBe(0xefe8);
    expect(after[22]).toBe(63);
    expect(word(after, 63)).toBe(0);
    expect(word(after, 45)).toBe(123);
    expect(after[87]).toBe(3);
    expect(after[88]).toBe(2);
    expect(n[130]).toBe(8);
    n[88] = 1;
    expect(() => cancelSpecialistWithoutActiveRole(n)).toThrow(
      /category task release/,
    );
  });
  it("cancels actual work before setup and retains native/player identities", () => {
    const f = fixture(),
      n = f.n(),
      raw = f.raw(),
      parent: N = Array(102).fill(0);
    parent[6] = 8;
    put(parent, 15, 9);
    n[85] = 1;
    put(n, 63, 700);
    setupStagedSpecialistAbduction(f.w, 0, parent, {
      cancelWork(w, i, mode) {
        expect(mode).toBe(1);
        expect(w.specialists.records[i][85]).toBe(1);
        n.splice(0, 200, ...cancelSpecialistWithoutActiveRole(n));
      },
    });
    expect(f.n()).toBe(n);
    expect(f.raw()).toBe(raw);
    expect(n[85]).toBe(3);
    expect(word(n, 127)).toBe(9);
    expect(n[129]).toBe(8);
    expect(n[25]).toBe(8);
    expect(dword(n, 104)).toBe(10);
    expect(word(n, 63)).toBe(0);
  });
  it.each([0, 1, 2, 3])(
    "runs state3 common physics and ANB for category%i without role dispatch",
    (category) => {
      const f = fixture(category);
      put32(f.n(), 100, 5);
      f.n()[89] = 11;
      f.n()[27] = 2;
      const r = stepSpecialistAbductionCallback(f.w, 0, f.c);
      expect(r.status).toBe("active");
      expect(r.events).toContainEqual({
        type: "presentation",
        actor: 0,
        selectedState: 3,
        action: 11,
      });
      expect(f.n()[25]).toBe(11);
      expect(f.n()[27]).toBe(0);
      expect(dword(f.n(), 104)).toBe(9);
      expect(dword(f.n(), 100)).toBe(category >= 2 ? 4 : 5);
      expect(f.w.rng.draws).toBe(0);
      f.n()[129] = 0;
      expect(() => stepSpecialistAbductionCallback(f.w, 0, f.c)).toThrow(
        /Ethereal-associated/,
      );
      expect(f.n()[85]).toBe(3);
    },
  );
  it("retains parent-controlled free height and advances real residual velocity/obstacle impulse", () => {
    const f = fixture(),
      n = f.n();
    n[21] = 32;
    put32(n, 39, 10000);
    put(n, 45, 256);
    put(n, 49, 128);
    let queries = 0;
    f.motion.obstacle = (_w, _p, _mask, height) => {
      if (height >= 0) {
        queries++;
        return { index: 0, position: [900, 900], ground: 2048 };
      }
      return null;
    };
    stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(queries).toBe(1);
    expect(word(f.n(), 7)).toBeGreaterThan(1000);
    expect(dword(f.n(), 39)).toBe(10016);
    expect(word(f.n(), 45)).not.toBe(256);
    expect(word(f.n(), 49)).not.toBe(128);
    expect(dword(f.n(), 104)).toBe(9);
  });
  it("keeps gravity before the visitor sets source flag20 and stops only on an actual detached motion flag", () => {
    const f = fixture();
    put32(f.n(), 39, 10000);
    stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(dword(f.n(), 39)).toBe(9872);
    const g = fixture();
    g.n()[22] = 8;
    put32(g.n(), 39, 10000);
    put(g.n(), 45, 256);
    stepSpecialistAbductionCallback(g.w, 0, g.c);
    expect(dword(g.n(), 39)).toBe(10000);
    expect(word(g.n(), 7)).toBe(1000);
  });
  it("preserves source health regeneration, skill recovery and powered class3 charge tail", () => {
    const f = fixture(0, 2);
    f.w.frame = 128;
    f.raw()[48] = 99;
    f.raw()[49] = 39;
    stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(f.raw()[48]).toBe(100);
    expect(f.raw()[49]).toBe(40);
    const g = fixture(0, 3);
    g.raw()[0x610] = 1;
    g.n()[115] = 223;
    let charged = 0;
    g.c.charge = (_w, i) => {
      expect(i).toBe(0);
      charged++;
    };
    stepSpecialistAbductionCallback(g.w, 0, g.c);
    expect(charged).toBe(1);
    expect(g.n()[115]).toBe(224);
  });
  it("isolates optional host staging and matches the default full transaction", () => {
    const a = fixture(),
      b = fixture();
    let staged = 0;
    b.c.stageWorld = (w) => {
      staged++;
      return {
        ...w,
        specialists: {
          ...w.specialists,
          records: w.specialists.records.map((n) => n.slice()),
          bindings: w.specialists.bindings.map((b) => (b ? { ...b } : null)),
        },
        players: w.players.map((p) => ({ raw: p.raw.slice() })),
        terrain: {
          bytes: w.terrain.bytes.slice(),
          revision: w.terrain.revision,
        },
        rng: { ...w.rng },
        missionPrefix: w.missionPrefix.slice(),
        ecology: structuredClone(w.ecology),
      };
    };
    expect(stepSpecialistAbductionCallback(b.w, 0, b.c)).toEqual(
      stepSpecialistAbductionCallback(a.w, 0, a.c),
    );
    expect(staged).toBe(1);
    expect(b.w).toEqual(a.w);
    const before = JSON.stringify(b.w);
    b.c.animation = () => {
      throw Error("synthetic late ANB service failure");
    };
    expect(() => stepSpecialistAbductionCallback(b.w, 0, b.c)).toThrow(
      /late ANB/,
    );
    expect(JSON.stringify(b.w)).toBe(before);
  });
  it("rejects unsupported associations and missing required real charge with atomic rollback", () => {
    const f = fixture();
    f.n()[129] = 4;
    const before = JSON.stringify(f.w);
    expect(() => stepSpecialistAbductionCallback(f.w, 0, f.c)).toThrow(
      /Ethereal-associated/,
    );
    expect(JSON.stringify(f.w)).toBe(before);
    const g = fixture(0, 3);
    g.n()[115] = 223;
    g.raw()[0x610] = 1;
    const snapshot = JSON.stringify(g.w);
    expect(() => stepSpecialistAbductionCallback(g.w, 0, g.c)).toThrow(/57860/);
    expect(JSON.stringify(g.w)).toBe(snapshot);
  });
  it("resolves the actual visitor lazily and rolls back earlier motion if it is absent", () => {
    const f = fixture();
    put32(f.n(), 39, 10000);
    f.c.abductionServices!.parent = () => null;
    const before = JSON.stringify(f.w);
    expect(() => stepSpecialistAbductionCallback(f.w, 0, f.c)).toThrow(
      /parent reference is unresolved/,
    );
    expect(JSON.stringify(f.w)).toBe(before);
    f.n()[112] = 0;
    f.c.abductionServices = undefined;
    const r = stepSpecialistAbductionCallback(f.w, 0, f.c);
    expect(r.status).toBe("ignored");
    expect(r.abduction).toBeNull();
  });
});
