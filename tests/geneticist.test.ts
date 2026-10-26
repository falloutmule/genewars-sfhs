import { describe, it, expect, vi } from "vitest";
import {
  requestGeneticistInteraction,
  stepGeneticistRole,
  tryGeneticistIdleAcquisition,
  queueGeneticistInteraction,
  stepGeneticistCallback,
  readGeneticistMotion,
  writeGeneticistMotion,
  queueGeneticistMove,
  cancelGeneticistWork,
  cancelStagedGeneticistWork,
  continueSpecialistMovement,
  stepSpecialistLifecycleCallback,
  type GeneticistCallbackContext,
  type GeneticistContext,
  type GeneticistWorld,
  type GeneticistRules,
} from "../src/sim/mechanics/geneticist";
import { originalAngle, type MotionTables } from "../src/sim/mechanics/motion";
type Native = (number | null)[];
function put(n: Native, p: number, v: number) {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
}
function put32(n: Native, p: number, v: number) {
  put(n, p, v);
  put(n, p + 2, v >> 16);
}
const word = (n: Native, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: Native, p: number) =>
  n[p]! | (n[p + 1]! << 8) | (n[p + 2]! << 16) | (n[p + 3]! << 24);
function fixture(skill = 50) {
  const tables: MotionTables = {
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
  const rules: GeneticistRules = {
    schemaVersion: 1,
    projectiles: [0, 1, 2].map((i) => ({
      speedWord: 10 + i,
      rangeFactor: 10000,
      cooldown: 7 + i,
      effectCode: 41 + i,
    })),
  };
  const n: Native = Array(200).fill(0);
  n.fill(null, 31, 39);
  n.fill(null, 176, 180);
  n.fill(null, 192, 200);
  n[6] = 3;
  n[24] = 0;
  n[85] = 11;
  n[88] = 1;
  n[112] = 1;
  n[126] = 0;
  n[129] = 1;
  put(n, 127, 1);
  put(n, 7, 1000);
  put(n, 9, 1000);
  put(n, 138, 512);
  n[131] = 5;
  n[144] = 4;
  put32(n, 140, 1000000);
  const m: Native = Array(124).fill(0);
  m.fill(null, 31, 39);
  m[6] = 1;
  m[24] = 4;
  m[94] = 18;
  m[119] = 255;
  m[122] = 4;
  put(m, 15, 1);
  put(m, 7, 1100);
  put(m, 9, 1000);
  put(m, 98, 100);
  put(m, 100, 100);
  put(m, 102, 1000);
  put(m, 104, 30);
  put(m, 106, 80);
  put(m, 108, 50);
  put(n, 57, originalAngle(200, 0, tables.atan));
  const w: GeneticistWorld = {
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
      plantCount: 0,
      ownerPlantCounts: [0, 0, 0, 0, 0],
      pending: [],
      unsupported: [],
      plants: [],
      mules: [{ id: "source:0:1", index: 1, native: m, pending: [] }],
      otherEntities: [],
      plantOrder: {},
      plantCursor: 0,
    },
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    rng: { seed: 0, draws: 0, ring: 31 },
    frame: 0,
    missionPrefix: Array(0x355e).fill(0),
  };
  w.specialists.bindings[0] = {
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
  const raw = w.players[0].raw;
  raw[0x16 + 22] = 2;
  raw[0x16 + 23] = skill;
  raw[0x16 + 25] = 100;
  raw[0x16 + 26] = 100;
  raw[0x6e5] = 1;
  const c: GeneticistContext<typeof w> = {
    rules,
    tables,
    globalFlags: 0,
    cellOrder: () => ["source:0:1"],
  };
  return {
    w,
    c,
    rules,
    n: () => w.specialists.records[0],
    m: () => w.ecology.mules[0].native,
    raw: () => w.players[0].raw,
  };
}
describe("source Geneticist capture/research/healing role", () => {
  it("admits real target/task bytes and projectile tier without moving, drawing RNG or granting research", () => {
    const f = fixture(100),
      position = f.n().slice(7, 11);
    f.n()[144] = 19;
    const r = requestGeneticistInteraction(
        f.w,
        0,
        { task: 0, target: 1, callerOwner: 0 },
        f.c,
      ),
      n = f.n();
    expect(r.status).toBe("active");
    expect([
      n[85],
      n[88],
      n[126],
      n[129],
      n[131],
      n[144],
      word(n, 138),
      dword(n, 140),
    ]).toEqual([11, 1, 0, 1, 6, 4, 512, 120000]);
    expect(n.slice(7, 11)).toEqual(position);
    expect(f.w.rng.draws).toBe(0);
    expect(dword(f.raw(), 0x62a)).toBe(0);
    expect(f.raw()[0x6e0]).toBe(0);
  });
  it("rejects unauthorized and inactive targets atomically", () => {
    const f = fixture(),
      before = structuredClone(f.w);
    expect(() =>
      requestGeneticistInteraction(
        f.w,
        0,
        { task: 0, target: 1, callerOwner: 1 },
        f.c,
      ),
    ).toThrow(/owner differs/);
    expect(f.w).toEqual(before);
    f.m()[6] = 0;
    const inactive = structuredClone(f.w);
    expect(() =>
      requestGeneticistInteraction(
        f.w,
        0,
        { task: 0, target: 1, callerOwner: 0 },
        f.c,
      ),
    ).toThrow(/inactive/);
    expect(f.w).toEqual(inactive);
  });
  it("runs the actual hostile idle query and leaves an automatic pending healing request, without DNA", () => {
    const f = fixture(100);
    f.m()[94] = 8;
    f.n()[85] = 1;
    const r = tryGeneticistIdleAcquisition(f.w, 0, f.c);
    expect([
      r.status,
      r.reason,
      f.w.rng.draws,
      f.n()[87],
      f.n()[126],
      f.n()[129],
      f.n()[112],
      word(f.n(), 138),
    ]).toEqual(["pending", "automatic-healing-request", 3, 1, 1, 1, 3, 512]);
    expect(dword(f.raw(), 0x62a)).toBe(0);
  });
  it("uses the exact positive state18 predicate for the idle escape request and skips real allied targets", () => {
    const f = fixture(100);
    const r = tryGeneticistIdleAcquisition(f.w, 0, f.c);
    expect(r.reason).toBe("stunned-target-escape");
    expect([f.n()[87], f.n()[90], f.n()[91], word(f.n(), 63)]).toEqual([
      2, 5, 5, 700,
    ]);
    const g = fixture(100);
    g.raw()[0x6e5] |= 16;
    expect(tryGeneticistIdleAcquisition(g.w, 0, g.c).status).toBe("ignored");
    expect(g.w.rng.draws).toBe(3);
  });
  it("increments exact player research and the new species list/counter once while retaining target native state", () => {
    const f = fixture();
    const target = f.m().slice(),
      first = stepGeneticistRole(f.w, 0, f.c);
    expect(first.events.find((e) => e.type === "research")).toMatchObject({
      before: 0,
      after: 200,
      cap: 102400,
      newSpecies: true,
    });
    expect([
      dword(f.raw(), 0x62a),
      f.raw()[0x6ae],
      f.raw()[0x6e0],
      dword(f.raw(), 0x705),
    ]).toEqual([200, 4, 1, 1]);
    expect(f.m()).toEqual(target);
    expect(f.w.rng.draws).toBe(0);
    stepGeneticistRole(f.w, 0, f.c);
    expect(dword(f.raw(), 0x62a)).toBe(400);
    expect(dword(f.raw(), 0x705)).toBe(1);
    expect(f.n()[89]).toBe(13);
  });
  it("halves source research rates for the real runtime flag and dead targets, with minimum one on dead zero-skill", () => {
    const f = fixture();
    f.c.globalFlags = 32;
    stepGeneticistRole(f.w, 0, f.c);
    expect(dword(f.raw(), 0x62a)).toBe(100);
    const g = fixture();
    g.m()[94] = 24;
    stepGeneticistRole(g.w, 0, g.c);
    expect(dword(g.raw(), 0x62a)).toBe(100);
    const h = fixture(0);
    h.m()[94] = 24;
    stepGeneticistRole(h.w, 0, h.c);
    expect(dword(h.raw(), 0x62a)).toBe(1);
  });
  it("caps source progress and releases sound/motion while retaining unknown pointers, physical velocity and reference operands", () => {
    const f = fixture();
    put32(f.raw(), 0x62a, 102300);
    put(f.n(), 63, 700);
    put(f.n(), 45, 123);
    put(f.n(), 73, 0x800);
    const before = f.n().slice(31, 39),
      r = stepGeneticistRole(f.w, 0, f.c);
    expect(r.status).toBe("released");
    expect(dword(f.raw(), 0x62a)).toBe(102400);
    expect([
      f.n()[126],
      f.n()[129],
      word(f.n(), 127),
      word(f.n(), 63),
      word(f.n(), 45),
    ]).toEqual([255, 1, 1, 0, 123]);
    expect(f.n().slice(31, 39)).toEqual(before);
    expect(
      r.events
        .filter((e) => e.type === "audio" && e.mode === "stop")
        .map((e) => (e.type === "audio" ? e.cue : 0)),
    ).toEqual([87, 86]);
  });
  it("rolls back all research, list and RNG writes when live research damage service is absent", () => {
    const f = fixture(100);
    f.w.frame = 3;
    const before = structuredClone(f.w);
    expect(() => stepGeneticistRole(f.w, 0, f.c)).toThrow(/virtual34 damage/);
    expect(f.w).toEqual(before);
    let calls = 0;
    const r = stepGeneticistRole(f.w, 0, {
      ...f.c,
      damageMule: (s, target, amount, attacker) => {
        expect([target, amount, attacker]).toEqual([1, 5, 0]);
        put(s.ecology.mules[0].native, 106, 75);
        calls++;
      },
    });
    expect(calls).toBe(1);
    expect(word(f.m(), 106)).toBe(75);
    expect(dword(f.raw(), 0x62a)).toBe(400);
    expect(f.w.rng.draws).toBe(4);
    expect(r.status).toBe("active");
  });
  it("pursues a distant live target through the actual kind1 association without demanding an unused shot port", () => {
    const f = fixture();
    f.m()[94] = 8;
    put(f.m(), 7, 4000);
    put32(f.n(), 140, 1);
    const r = stepGeneticistRole(f.w, 0, f.c);
    expect(r.reason).toBe("capture-controller");
    expect([
      f.n()[90],
      word(f.n(), 63),
      word(f.n(), 80),
      f.n()[82],
      f.n()[112]! & 16,
    ]).toEqual([4, 700, 1, 1, 16]);
    expect(f.w.rng.draws).toBe(0);
    expect(dword(f.raw(), 0x62a)).toBe(0);
  });
  it("requires real projectile creation in range, emits its exact request, and only success applies cooldown and shot count", () => {
    const f = fixture();
    f.m()[94] = 8;
    const before = structuredClone(f.w);
    expect(() =>
      stepGeneticistRole(f.w, 0, { ...f.c, lineOfSight: () => true }),
    ).toThrow(/factory\/lifecycle/);
    expect(f.w).toEqual(before);
    let request: unknown;
    const r = stepGeneticistRole(f.w, 0, {
      ...f.c,
      lineOfSight: () => true,
      fireShot: (_s, q) => {
        request = q;
        return true;
      },
    });
    expect(request).toMatchObject({
      actor: 0,
      target: 1,
      projectileIndex: 5,
      position: [1000, 1000],
      height: 1280,
      owner: 0,
      aimSpeed: 704,
      aimHeightOffset: 1280,
      parameter: 32,
      delay: 0,
      profile: { effectCode: 42, cooldown: 8 },
    });
    expect([dword(f.n(), 100), word(f.n(), 136), f.n()[112]! & 128]).toEqual([
      8, 1, 128,
    ]);
    expect(f.m()[94]).toBe(8);
    expect(dword(f.raw(), 0x62a)).toBe(0);
    expect(r.events.find((e) => e.type === "shot")).toMatchObject({
      created: true,
      code: 42,
    });
    const g = fixture();
    g.m()[94] = 8;
    stepGeneticistRole(g.w, 0, {
      ...g.c,
      lineOfSight: () => true,
      fireShot: () => false,
    });
    expect([dword(g.n(), 100), word(g.n(), 136)]).toEqual([0, 0]);
    expect(g.m()[94]).toBe(8);
  });
  it("requires an actual approach result before researching an out-of-range stunned target", () => {
    const f = fixture();
    put(f.m(), 7, 4000);
    const before = structuredClone(f.w);
    expect(() => stepGeneticistRole(f.w, 0, f.c)).toThrow(/73AC0/);
    expect(f.w).toEqual(before);
    stepGeneticistRole(f.w, 0, { ...f.c, approachPoint: () => [3000, 1000] });
    expect([
      f.n()[90],
      word(f.n(), 96),
      word(f.n(), 98),
      word(f.n(), 63),
      f.n()[112]! & 16,
    ]).toEqual([1, 3000, 1000, 700, 16]);
    expect(dword(f.raw(), 0x62a)).toBe(0);
  });
  it("heals only on the source eight-phase cadence with actual health/nutrition and young energy costs", () => {
    const f = fixture();
    f.n()[126] = 1;
    f.m()[119] = 0;
    const r = stepGeneticistRole(f.w, 0, f.c);
    expect([word(f.m(), 106), word(f.m(), 104), word(f.m(), 102)]).toEqual([
      85, 41, 978,
    ]);
    expect(r.events.find((e) => e.type === "healing")).toMatchObject({
      healthBefore: 80,
      healthAfter: 85,
      reserveBefore: 30,
      reserveAfter: 41,
    });
    expect(dword(f.raw(), 0x62a)).toBe(0);
    const g = fixture();
    g.n()[126] = 1;
    g.w.frame = 1;
    stepGeneticistRole(g.w, 0, g.c);
    expect([word(g.m(), 106), word(g.m(), 104)]).toEqual([80, 30]);
  });
  it("releases through the real research-disabled gate and rejects omitted query candidates atomically", () => {
    const f = fixture();
    f.c.globalFlags = 64;
    const r = stepGeneticistRole(f.w, 0, f.c);
    expect(r.reason).toBe("research-disabled");
    expect(f.w.rng.draws).toBe(0);
    expect(dword(f.raw(), 0x62a)).toBe(0);
    const g = fixture(100);
    g.m()[94] = 8;
    const before = structuredClone(g.w);
    expect(() =>
      tryGeneticistIdleAcquisition(g.w, 0, { ...g.c, cellOrder: () => [] }),
    ).toThrow(/actual shared-cell order/);
    expect(g.w).toEqual(before);
  });
});

function callback(
  f: ReturnType<typeof fixture>,
): GeneticistCallbackContext<GeneticistWorld> {
  return {
    ...f.c,
    motion: () => {},
    runtimeMode: 0,
    override180d80: 0,
    runtimeCount11c2bc: 1,
    animation: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
  };
}
describe("shared specialist source526C0 target movement", () => {
  it.each([1, 3, 4] as const)("retains the real kind%i target for task4 pursuit", (kind) => {
    const f = fixture(), target: Native = Array(kind === 1 ? 124 : kind === 3 ? 200 : 67).fill(0);
    f.w.specialists.bindings[0]!.category = 3;
    f.raw()[0x16 + 22] = 3;
    f.n()[90] = 4; f.n()[129] = kind; put(f.n(), 127, 7);
    target[6] = kind; put(target, 15, 7);
    expect(continueSpecialistMovement(f.w, 0, 1, {
      tables: f.c.tables,
      movementTarget: (_s, actor, ref) => {
        expect([actor, ref]).toEqual([0, { kind, index: 7 }]); return target;
      },
    })).toBe(false);
    expect([word(f.n(), 80), f.n()[82], f.n()[84], word(f.n(), 73)]).toEqual([7, kind, 20, 20]);
  });
  it("uses a kind4 target pose and one source draw before the real escape ray", () => {
    const f = fixture(), target: Native = Array(67).fill(0);
    f.n()[90] = 5; f.n()[129] = 4; put(f.n(), 127, 2);
    target[6] = 4; put(target, 15, 2); put(target, 7, 2000); put(target, 9, 1000);
    const escape = vi.fn((_s, actor, heading, distance) => {
      expect([actor, heading, distance, f.w.rng.draws]).toEqual([0, 1536, 384, 1]); return true;
    });
    continueSpecialistMovement(f.w, 0, 0, { tables: f.c.tables, movementTarget: () => target, escapeRay: escape });
    expect([word(f.n(), 11), word(f.n(), 13), word(f.n(), 75)]).toEqual([2000, 1000, 1536]);
    expect(escape).toHaveBeenCalledTimes(1);
  });
  it("rejects an absent resolver for noncreature targets and validates native identity", () => {
    const f = fixture(); f.n()[90] = 4; f.n()[129] = 3; put(f.n(), 127, 2);
    expect(() => continueSpecialistMovement(f.w, 0, 0, f.c)).toThrow(/6D390/);
    expect(() => continueSpecialistMovement(f.w, 0, 0, { ...f.c, movementTarget: () => f.m() })).toThrow(/identity differs/);
    expect(f.w.rng.draws).toBe(0);
  });
  it("rejects an escape service that replaces its held target", () => {
    const f = fixture(); f.n()[90] = 5;
    let target = f.m();
    expect(() => continueSpecialistMovement(f.w, 0, 0, {
      tables: f.c.tables, movementTarget: () => target,
      escapeRay: () => { target = target.slice(); return true; },
    })).toThrow(/replaced its held target/);
  });
});
describe("source57A10 Geneticist callback envelope", () => {
  it("keeps one outer rollback transaction across staged idle and role dispatch without nested copies", () => {
    for (const idle of [true, false]) {
      const f = fixture();
      f.w.frame = 1;
      f.n()[85] = idle ? 1 : 11;
      f.n()[88] = idle ? 0 : 1;
      f.n()[126] = 1;
      f.n()[28] = 1;
      const clone = vi.spyOn(globalThis, "structuredClone");
      try {
        stepGeneticistCallback(f.w, 0, callback(f));
        expect(clone).toHaveBeenCalledTimes(1);
      } finally {
        clone.mockRestore();
      }
    }
  });
  it.each([0, 1, 2, 3])(
    "uses the same source lifecycle envelope for category%i without admitting its role",
    (category) => {
      const f = fixture();
      f.w.specialists.bindings[0]!.category = category;
      f.raw()[0x16 + 22] = category;
      f.n()[85] = 5;
      f.n()[28] = 1;
      put32(f.n(), 100, 8);
      const c = callback(f);
      c.lifecycle = () => ({ handled: true, retired: false });
      stepSpecialistLifecycleCallback(f.w, 0, c);
      expect([f.n()[25], dword(f.n(), 100)]).toEqual([
        10,
        category >= 2 ? 7 : 8,
      ]);
      f.n()[85] = 1;
      expect(() => stepSpecialistLifecycleCallback(f.w, 0, c)).toThrow(
        /state4\/5/,
      );
    },
  );
  it("releases51E80 in an already isolated transaction without replacing held native/player/binding identities", () => {
    const f = fixture(),
      n = f.n(),
      raw = f.raw(),
      binding = f.w.specialists.bindings[0];
    n[87] = 3;
    const r = cancelStagedGeneticistWork(f.w, 0, 0);
    expect(f.n()).toBe(n);
    expect(f.raw()).toBe(raw);
    expect(f.w.specialists.bindings[0]).toBe(binding);
    expect([n[87], n[88]! & 1, n[126], f.w.rng.draws]).toEqual([3, 0, 255, 0]);
    expect(r.status).toBe("released");
  });
  it("retains the native pointer after a real death dispatch deletes its blueprint and skips the ordinary tail", () => {
    const f = fixture();
    f.n()[85] = 4;
    f.w.specialists.bindings[0]!.style = 3;
    f.raw()[0x16 + 21] = 3;
    f.raw()[0x610] = 1;
    f.n()[115] = 223;
    f.w.frame = 1;
    let calls = 0;
    const c = callback(f);
    c.lifecycle = (s, index) => {
      calls++;
      expect(index).toBe(0);
      s.specialists.records[index][6] = 0;
      // The source retains binding/C0 identity after actual BP deletion.
      s.players[0].raw.fill(0, 0x16, 0x16 + 36);
      return { handled: true, retired: true };
    };
    c.charge = () => {
      throw Error("deleted BP cannot select class3 charge");
    };
    c.animation = () => {
      throw Error("retired actor cannot advance ANB");
    };
    const r = stepGeneticistCallback(f.w, 0, c);
    expect([calls, f.n()[6], f.n()[115], f.w.rng.draws]).toEqual([
      1, 0, 223, 0,
    ]);
    expect(f.w.specialists.bindings[0]).not.toBeNull();
    expect(r).toMatchObject({
      status: "released",
      reason: "specialist-retired",
    });
  });
  it("queues80FC0 before its resolver, defers ordinary active release to57A10, and honors inhibited commands", () => {
    const f = fixture();
    const c = callback(f);
    c.resolveMovePoint = (s, _i, p) => {
      const n = s.specialists.records[0];
      expect([n[87]! & 2, n[91], word(n, 92), word(n, 94)]).toEqual([
        2,
        0,
        ...p,
      ]);
      return [1800, 1900];
    };
    queueGeneticistMove(f.w, 0, { callerOwner: 0, point: [2000, 2000] }, c);
    expect([
      f.n()[88]! & 1,
      f.n()[126],
      word(f.n(), 11),
      word(f.n(), 13),
    ]).toEqual([1, 0, 1800, 1900]);
    const motionFlags: number[] = [];
    c.motion = (s) => motionFlags.push(s.specialists.records[0][88]! & 1);
    f.w.frame = 1;
    stepGeneticistCallback(f.w, 0, c);
    expect(motionFlags).toEqual([1]);
    expect([f.n()[88]! & 1, f.n()[85], f.n()[126]]).toEqual([0, 8, 255]);
    const g = fixture();
    g.n()[113] = 16;
    const before = structuredClone(g.w);
    expect(
      queueGeneticistMove(g.w, 0, { callerOwner: 0, point: [2000, 2000] }, g.c)
        .status,
    ).toBe("ignored");
    expect(g.w).toEqual(before);
  });
  it("releases80FC0's pending task gate immediately and exposes51E80 cancellation without clearing retained pending bits", () => {
    const f = fixture();
    f.n()[87] = 1;
    f.n()[130] = 1;
    const c = {
      ...f.c,
      resolveMovePoint: () => [1800, 1900] as [number, number],
    };
    queueGeneticistMove(f.w, 0, { callerOwner: 0, point: [2000, 2000] }, c);
    expect([f.n()[87], f.n()[88]! & 1, f.n()[130], f.n()[126]]).toEqual([
      2, 0, 0, 255,
    ]);
    f.n()[87] = 3;
    cancelGeneticistWork(f.w, 0, 0);
    expect(f.n()[87]).toBe(3);
    expect(f.w.rng.draws).toBe(0);
  });
  it("queues51960 independently and activates507D0 after real motion, before role work and animation", () => {
    const f = fixture();
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.n()[28] = 1;
    const q = queueGeneticistInteraction(
      f.w,
      0,
      { task: 1, target: 1, callerOwner: 0 },
      f.c,
    );
    expect(q.status).toBe("pending");
    expect([f.n()[85], f.n()[88], f.n()[87]! & 1, f.n()[126]]).toEqual([
      1, 0, 1, 1,
    ]);
    expect(f.w.rng.draws).toBe(0);
    const seen: string[] = [];
    const c = callback(f);
    c.motion = (s) => {
      seen.push("motion");
      expect(s.specialists.records[0][85]).toBe(1);
      put32(s.specialists.records[0], 100, 2);
    };
    c.animation = (s, _i, action) => {
      seen.push("animation");
      expect(word(s.ecology.mules[0].native, 106)).toBe(85);
      expect(action).toBe(14);
      return { holds: [0, 0], flags: 0, first: 0, last: 1 };
    };
    const r = stepGeneticistCallback(f.w, 0, c);
    expect(seen).toEqual(["motion", "animation"]);
    expect([
      f.n()[85],
      f.n()[88]! & 1,
      f.n()[87]! & 1,
      dword(f.n(), 100),
      word(f.n(), 138),
    ]).toEqual([11, 1, 0, 1, 331]);
    expect(word(f.m(), 106)).toBe(85);
    expect(r.events.map((e) => e.type)).toContain("presentation");
    expect(f.n()[27]).toBe(1);
  });
  it("retargets an ordinary moving Geneticist through81080, then activates the pending role after JSON continuation", () => {
    const f = fixture();
    f.n()[85] = 8;
    f.n()[88] = 2;
    f.n()[130] = 0;
    put(f.n(), 63, 700);
    put(f.n(), 45, 29);
    put(f.n(), 73, 0x214);
    const position = f.n().slice(7, 11), rng = structuredClone(f.w.rng);
    const out = queueGeneticistInteraction(f.w, 0, { task: 0, target: 1, callerOwner: 0 }, f.c);
    expect(out.events.filter(e => e.type === "released")).toEqual([]);
    expect([f.n()[85], f.n()[88], f.n()[87]! & 1, f.n()[130], word(f.n(), 63), word(f.n(), 45)]).toEqual([8, 0, 1, 1, 0, 29]);
    expect(f.n().slice(7, 11)).toEqual(position);
    expect(f.w.rng).toEqual(rng);
    const loaded: GeneticistWorld = JSON.parse(JSON.stringify(f.w));
    const c = callback(f);
    stepGeneticistCallback(f.w, 0, c);
    stepGeneticistCallback(loaded, 0, c);
    expect(loaded).toEqual(f.w);
    expect([f.n()[85], f.n()[87]! & 1, f.n()[88]! & 1]).toEqual([11, 0, 1]);
    expect(f.raw()[0x62a] | f.raw()[0x62b] << 8).toBeGreaterThan(0);
  });
  it("81080 releases a stamped prior task before installing the new one, while preserving pending flags and physical momentum", () => {
    const f = fixture();
    f.n()[130] = 1;
    f.n()[87] = 2;
    put(f.n(), 45, -31);
    const out = queueGeneticistInteraction(f.w, 0, { task: 1, target: 1, callerOwner: 0 }, f.c);
    expect(out.events.filter(e => e.type === "audio").map(e => e.type === "audio" && e.cue)).toEqual([87, 86]);
    expect([f.n()[87], f.n()[88], f.n()[130], f.n()[126], word(f.n(), 45)]).toEqual([3, 0, 1, 1, -31]);
  });
  it("rolls back the complete81080 admission and prior task release when the required projectile profile is unavailable", () => {
    const f = fixture();
    f.n()[130] = 1;
    const before = structuredClone(f.w);
    expect(() => queueGeneticistInteraction(f.w, 0, { task: 0, target: 1, callerOwner: 0 },
      { ...f.c, rules: { schemaVersion: 1, projectiles: [] } })).toThrow(/projectile profile/);
    expect(f.w).toEqual(before);
  });
  it("runs the exact idle timer draws only after a failed or ineligible acquisition pulse", () => {
    const f = fixture();
    f.w.frame = 1;
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.n()[28] = 1;
    put32(f.n(), 104, 0);
    const c = callback(f);
    c.runtimeCount11c2bc = 0;
    stepGeneticistCallback(f.w, 0, c);
    expect([
      f.w.rng.draws,
      dword(f.n(), 104),
      f.n()[25],
      f.n()[112]! & 4,
    ]).toEqual([3, 20, 8, 4]);
    const g = fixture();
    g.w.frame = 1;
    g.n()[85] = 1;
    g.n()[88] = 0;
    g.n()[28] = 1;
    put32(g.n(), 104, 9);
    const d = callback(g);
    stepGeneticistCallback(g.w, 0, d);
    expect([g.w.rng.draws, dword(g.n(), 104), g.n()[25]]).toEqual([0, 9, 8]);
  });
  it("defers automatic idle acquisition activation until the following callback", () => {
    const f = fixture(100);
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.n()[28] = 1;
    f.m()[94] = 8;
    const c = callback(f);
    c.lineOfSight = () => true;
    c.fireShot = () => false;
    const first = stepGeneticistCallback(f.w, 0, c);
    expect(first.status).toBe("pending");
    expect([f.n()[85], f.n()[87]! & 1, f.n()[88], f.w.rng.draws]).toEqual([
      1, 1, 0, 3,
    ]);
    f.w.frame = 1;
    stepGeneticistCallback(f.w, 0, c);
    expect([f.n()[85], f.n()[87]! & 1, f.n()[88]! & 1, f.n()[126]]).toEqual([
      11, 0, 1, 1,
    ]);
    expect(dword(f.raw(), 0x62a)).toBe(0);
  });
  it("resets an arrived moving actor before its idle callback and consumes one reset draw", () => {
    const f = fixture();
    f.w.frame = 1;
    f.n()[85] = 8;
    f.n()[88] = 2;
    f.n()[28] = 1;
    put(f.n(), 73, 32);
    put32(f.n(), 104, 99);
    const r = stepGeneticistCallback(f.w, 0, callback(f));
    expect([
      f.n()[85],
      f.n()[88],
      f.n()[25],
      f.n()[29],
      f.w.rng.draws,
      dword(f.n(), 104),
    ]).toEqual([1, 0, 8, 16, 1, 0]);
    expect(r.events.at(-1)).toMatchObject({
      type: "presentation",
      selectedState: 1,
    });
  });
  it("consumes a native pending move after motion, preserving held physical velocity and selecting directional animation", () => {
    const f = fixture();
    f.w.frame = 1;
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.n()[28] = 1;
    f.n()[87] = 2;
    f.n()[91] = 0;
    put(f.n(), 92, 1200);
    put(f.n(), 94, 1000);
    put(f.n(), 45, 50);
    put(f.n(), 65, 600);
    stepGeneticistCallback(f.w, 0, callback(f));
    expect([
      f.n()[85],
      f.n()[90],
      word(f.n(), 11),
      word(f.n(), 13),
      word(f.n(), 63),
      word(f.n(), 45),
      f.n()[29],
      f.n()[87]! & 2,
    ]).toEqual([8, 0, 1200, 1000, 700, 50, 1, 0]);
    expect(f.w.rng.draws).toBe(0);
  });
  it("keeps known motion mirrors exact while preserving contact speed, opaque bytes and routing flags", () => {
    const f = fixture(),
      n = f.n();
    put(n, 65, 321);
    put(n, 73, 0x8201);
    n[180] = 91;
    n[67] = 244;
    n[68] = 32;
    const m = readGeneticistMotion(n);
    m.x = 32000;
    m.height = 987654;
    m.ground = -400;
    m.vx = -900;
    m.turnBraking = true;
    writeGeneticistMotion(n, m);
    expect(readGeneticistMotion(n)).toEqual(m);
    expect([word(n, 65), word(n, 73) & 65535, n[180], n[31], n[176]]).toEqual([
      321,
      0xa201,
      91,
      null,
      null,
    ]);
    n[67] = null;
    expect(() => readGeneticistMotion(n)).toThrow(/Unknown/);
  });
  it("orders presentation/animation before real terrain footstep and code6 factory, with no fabricated draws", () => {
    const f = fixture();
    f.w.frame = 3;
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.n()[28] = 1;
    put(f.n(), 45, 1);
    put(f.n(), 59, 300);
    put(f.n(), 61, 100);
    const c = callback(f),
      seen: string[] = [];
    c.animation = () => {
      seen.push("animation");
      return { holds: [0, 0], flags: 0, first: 0, last: 1 };
    };
    c.terrainClass = () => {
      seen.push("terrain");
      return 2;
    };
    c.footstep = (s, r) => {
      seen.push("factory");
      expect(s.specialists.records[0][27]).toBe(1);
      expect(r).toMatchObject({ code: 6, angles: [512, 44, 50], height: 0 });
    };
    const r = stepGeneticistCallback(f.w, 0, c);
    expect(seen).toEqual(["animation", "terrain", "factory"]);
    expect(f.w.rng.draws).toBe(0);
    expect(r.events.at(-1)).toMatchObject({
      type: "audio",
      cue: 75,
      parameter: 127,
    });
  });
  it("rolls back motion, RNG, pending activation and role work if a lazily required service is absent", () => {
    const f = fixture();
    f.m()[94] = 8;
    f.n()[28] = 1;
    const c = callback(f);
    c.motion = (s) => {
      s.rng.draws++;
      put32(s.specialists.records[0], 100, 0);
    };
    const before = structuredClone(f.w);
    expect(() => stepGeneticistCallback(f.w, 0, c)).toThrow(/75890/);
    expect(f.w).toEqual(before);
    const g = fixture();
    g.m()[94] = 8;
    const beforeG = structuredClone(g.w);
    expect(() =>
      stepGeneticistRole(g.w, 0, {
        ...g.c,
        lineOfSight: () => true,
        fireShot: (s) => {
          s.specialists.records[0] = s.specialists.records[0].slice();
          return true;
        },
      }),
    ).toThrow(/replaced retained/);
    expect(g.w).toEqual(beforeG);
    expect([dword(g.n(), 100), word(g.n(), 136), g.w.rng.draws]).toEqual([
      0, 0, 0,
    ]);
  });
});

describe("all25 Geneticist target species",()=>{
  it.each(Array.from({length:25},(_,i)=>i))("researches only actual species %i and discovers it once",species=>{const f=fixture();f.m()[122]=species;f.n()[144]=species;for(let i=0;i<25;i++)put32(f.raw(),0x61a+i*4,1000+i);const first=stepGeneticistRole(f.w,0,f.c);expect(first.events.find(e=>e.type==="research")).toMatchObject({species,before:1000+species,after:1200+species,newSpecies:true});stepGeneticistRole(f.w,0,f.c);for(let i=0;i<25;i++)expect(dword(f.raw(),0x61a+i*4)).toBe(1000+i+(i===species?400:0));expect(f.raw()[0x6ae]).toBe(species);expect(f.raw()[0x6e0]).toBe(1);expect(dword(f.raw(),0x705)).toBe(1);});
  it("admits a Crab command without granting contact or research",()=>{const f=fixture();f.m()[122]=1;f.m()[94]=8;const pos=f.n().slice(7,11),r=requestGeneticistInteraction(f.w,0,{task:0,target:1,callerOwner:0},f.c);expect(r.status).toBe("active");expect(f.n()[144]).toBe(1);expect(f.n().slice(7,11)).toEqual(pos);expect(dword(f.raw(),0x61e)).toBe(0);expect(f.w.rng.draws).toBe(0);});
  it("heals a Crab without changing any research entry",()=>{const f=fixture();f.m()[122]=1;f.n()[126]=1;const r=stepGeneticistRole(f.w,0,f.c);expect(r.events.find(e=>e.type==="healing")).toMatchObject({target:1,healthBefore:80,healthAfter:85});expect(f.raw().slice(0x61a,0x67e)).toEqual(Array(100).fill(0));});
  it("rejects an invalid species atomically",()=>{const f=fixture();f.m()[122]=25;f.n()[144]=25;const before=structuredClone(f.w);expect(()=>stepGeneticistRole(f.w,0,f.c)).toThrow(/species0..24/);expect(f.w).toEqual(before);});
});
