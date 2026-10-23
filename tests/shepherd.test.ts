import { describe, expect, it } from "vitest";
import {
  queueShepherdControl,
  queueShepherdInteraction,
  queueShepherdMove,
  cancelShepherdWork,
  cancelStagedShepherdWork,
  stepShepherdCallback,
  stepShepherdRole,
  stepStagedShepherdRole,
  tryShepherdIdleAcquisition,
  readShepherdOperators,
  type ShepherdCallbackContext,
  type ShepherdReference,
  type ShepherdTarget,
} from "../src/sim/mechanics/shepherd";
import type { GeneticistWorld } from "../src/sim/mechanics/geneticist";
import { originalAngle } from "../src/sim/mechanics/motion";
import { planBotanistEconomy } from "../src/sim/mechanics/botanist";
type Native = (number | null)[];
interface World extends GeneticistWorld {
  log: string[];
  targets: Record<string, Native>;
}
const put = (n: Native, at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >>> 8) & 255;
};
const put32 = (n: Native, at: number, v: number) => {
  put(n, at, v);
  put(n, at + 2, v >>> 16);
};
const word = (n: Native, at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
const dword = (n: Native, at: number) =>
  n[at]! | (n[at + 1]! << 8) | (n[at + 2]! << 16) | (n[at + 3]! << 24);
function fixture(skill = 50) {
  const n: Native = Array(200).fill(0);
  n.fill(null, 31, 39);
  n.fill(null, 176, 180);
  n.fill(null, 192, 200);
  n[6] = 3;
  n[25] = 8;
  n[28] = 1;
  n[85] = 1;
  n[112] = 1;
  n[126] = 255;
  put(n, 7, 1000);
  put(n, 9, 1000);
  put32(n, 104, 50);
  const target: Native = Array(124).fill(0);
  target.fill(null, 31, 39);
  target[6] = 1;
  target[24] = 4;
  target[94] = 8;
  target[122] = 4;
  put(target, 15, 1);
  put(target, 7, 1100);
  put(target, 9, 1000);
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
  put(n, 57, originalAngle(200, 0, tables.atan));
  const w: World = {
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
      mules: [{ id: "source:0:1", index: 1, native: target, pending: [] }],
      otherEntities: [],
      plantOrder: {},
      pending: [],
      unsupported: [],
    },
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    missionPrefix: Array(0x355e).fill(0),
    rng: { seed: 0, draws: 0, ring: 31 },
    frame: 1,
    log: [],
    targets: { "1:1": target },
  };
  w.specialists.bindings[0] = {
    owner: 0,
    blueprintIndex: 0,
    style: 0,
    category: 3,
    resourceKey: 3,
    assetKey: "SYNTHETIC",
    sourceName: "synthetic.anb",
    classSpeed: 700,
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
  const raw = w.players[0].raw;
  raw[3] = 1;
  raw[4] = 0;
  raw[0x16 + 22] = 3;
  raw[0x16 + 23] = skill;
  raw[0x16 + 25] = raw[0x16 + 26] = 100;
  put32(raw, 0x49d, 1);
  put(w.missionPrefix, 0x1c78, 5000);
  const resolve = (
    s: World,
    _i: number,
    ref: ShepherdReference,
  ): ShepherdTarget | null => {
    const t = s.targets[`${ref.kind}:${ref.index}`];
    return t ? { ...ref, native: t, physicalHeight: dword(t, 39) } : null;
  };
  const c: ShepherdCallbackContext<World> = {
    rules: {
      schemaVersion: 1,
      projectiles: Array.from({ length: 7 }, (_, i) => ({
        speedWord: 10 + i,
        rangeFactor: 1000,
        cooldown: 7 + i,
        effectCode: 37 + i,
      })),
    },
    tables,
    cellOrder: () => ["source:0:1"],
    globalFlags: 0,
    motion: (s) => {
      s.log.push("motion");
    },
    runtimeMode: 0,
    runtimeCount11c2bc: 1,
    override180d80: 0,
    animation: (s, _i, action) => {
      s.log.push(`animation:${action}`);
      return { first: 0, last: 1, holds: [0, 0], flags: 0 };
    },
    terrainClass: () => 0,
    resolveMovePoint: (_s, _i, p) => p,
    resolveTarget: resolve,
    protectedTarget: () => false,
    deadTarget: () => false,
    targetVisible: () => true,
    findHostile: (s, i) => resolve(s, i, { kind: 1, index: 1 }),
    launchProjectile: (s, q) => {
      s.log.push(`factory:${q.profile.effectCode}:${q.target.kind}`);
      return true;
    },
    debit: (s, i, amount, show) => {
      s.log.push(`debit:${amount}:${show}`);
      const p = s.players[0].raw,
        r = planBotanistEconomy(p, s.missionPrefix, {
          operation: "debit",
          amount,
          entity: show ? `source:2:${i}` : null,
        });
      p.splice(0, p.length, ...r.raw);
    },
    escapeRay: (s, _i, _angle, distance) => {
      s.log.push(`ray:${distance}`);
      return false;
    },
  };
  return {
    w,
    c,
    n: () => w.specialists.records[0],
    target: () => w.targets["1:1"],
    raw: () => w.players[0].raw,
  };
}
function active(
  f: ReturnType<typeof fixture>,
  task: 1 | 2 = 1,
  projectile = 1,
) {
  const n = f.n();
  n[85] = 12;
  n[88] = 1;
  n[126] = task;
  n[130] = 1;
  n[129] = 1;
  put(n, 127, 1);
  n[131] = projectile;
  put(n, 138, 512);
  put32(n, 140, 10000);
  n[89] = 17;
}
describe("native Shepherd commands/control", () => {
  it("queues real51960 control fields, activates state12 and runs one motion/ANB tail", () => {
    const f = fixture();
    queueShepherdControl(f.w, 0, {
      callerOwner: 0,
      point: [2200, 2300],
      mode: 2,
    });
    expect(f.n()[87]! & 1).toBe(1);
    expect(f.n()[126]).toBe(0);
    expect(f.n()[130]).toBe(1);
    expect(f.n()[139]).toBe(2);
    expect(dword(f.n(), 135)).toBe(1536);
    const r = stepShepherdCallback(f.w, 0, f.c);
    expect(r.status).toBe("active");
    expect(f.n()[85]).toBe(12);
    expect(f.n()[89]).toBe(13);
    expect(f.n()[25]).toBe(13);
    expect([word(f.n(), 131), word(f.n(), 133)]).toEqual([1000, 1000]);
    expect(f.n()[112]! & 128).toBe(128);
    expect(f.w.log).toEqual(["motion", "animation:13"]);
    expect(f.w.rng.draws).toBe(0);
  });
  it("publishes source operator fields only through actual player roster order", () => {
    const f = fixture();
    queueShepherdControl(f.w, 0, { callerOwner: 0, point: [0, 0], mode: 1 });
    stepShepherdCallback(f.w, 0, f.c);
    expect(readShepherdOperators(f.w)).toEqual([
      {
        index: 0,
        owner: 0,
        position: [1000, 1000],
        enabled: 1,
        commandState: 0,
        flags70: 129,
        mode: 1,
        range: 1536,
        attackBonus: 50,
      },
    ]);
    f.raw()[3] = 0;
    expect(readShepherdOperators(f.w)).toEqual([]);
  });
  it("cancels active control by clearing135 dword, while preserving stale control point/mode and retained identities", () => {
    const f = fixture();
    queueShepherdControl(f.w, 0, {
      callerOwner: 0,
      point: [2000, 3000],
      mode: 3,
    });
    stepShepherdCallback(f.w, 0, f.c);
    const n = f.n(),
      p = f.raw(),
      binding = f.w.specialists.bindings[0],
      prior = n.slice();
    cancelStagedShepherdWork(f.w, 0, 0);
    expect(f.n()).toBe(n);
    expect(f.raw()).toBe(p);
    expect(f.w.specialists.bindings[0]).toBe(binding);
    expect(dword(n, 135)).toBe(0);
    expect(n[139]).toBe(3);
    expect(n.slice(131, 135)).toEqual(prior.slice(131, 135));
    expect(n[126]).toBe(255);
    expect(n[130]).toBe(0);
  });
  it("retains queued-control range when cancelled before source active58-bit0, then disables its command", () => {
    const f = fixture();
    queueShepherdControl(f.w, 0, {
      callerOwner: 0,
      point: [2000, 3000],
      mode: 0,
    });
    cancelShepherdWork(f.w, 0, 0);
    expect(dword(f.n(), 135)).toBe(1536);
    expect(f.n()[130]).toBe(0);
    expect(f.n()[126]).toBe(255);
  });
  it("queues actual80FC0 move and releases old control without a second motion step", () => {
    const f = fixture();
    queueShepherdControl(f.w, 0, { callerOwner: 0, point: [0, 0], mode: 0 });
    stepShepherdCallback(f.w, 0, f.c);
    f.w.log = [];
    queueShepherdMove(f.w, 0, { callerOwner: 0, point: [4000, 5000] }, f.c);
    expect(f.w.log).toEqual([]);
    expect(f.n()[87]! & 2).toBe(2);
    expect(f.n()[126]).toBe(255);
    expect(word(f.n(), 11)).toBe(4000);
    stepShepherdCallback(f.w, 0, f.c);
    expect(f.n()[85]).toBe(8);
    expect(word(f.n(), 63)).toBe(700);
    expect(f.w.log.filter((s) => s === "motion")).toHaveLength(1);
  });
  it("rejects foreign/wrong-category commands atomically and guards move resolver identity", () => {
    const f = fixture(),
      before = structuredClone(f.w);
    expect(() =>
      queueShepherdControl(f.w, 0, { callerOwner: 1, point: [0, 0], mode: 0 }),
    ).toThrow("owner differs");
    expect(f.w).toEqual(before);
    expect(() =>
      queueShepherdMove(
        f.w,
        0,
        { callerOwner: 0, point: [1, 2] },
        {
          ...f.c,
          resolveMovePoint(w, i, p) {
            w.players[0].raw = w.players[0].raw.slice();
            return p;
          },
        },
      ),
    ).toThrow("retained actor/player/binding");
    expect(f.w).toEqual(before);
    f.w.specialists.bindings[0]!.category = 2;
    f.raw()[44] = 2;
    expect(() =>
      queueShepherdControl(f.w, 0, { callerOwner: 0, point: [0, 0], mode: 0 }),
    ).toThrow("category3");
  });
});
describe("Shepherd interaction and54E80/54B10", () => {
  it("chooses attack/capture projectile rows by signed skill and exact integer thresholds", () => {
    for (const [skill, task, expected] of [
      [1, 1, 0],
      [25, 1, 0],
      [26, 1, 1],
      [100, 1, 3],
      [33, 2, 4],
      [34, 2, 5],
      [100, 2, 6],
    ] as const) {
      const f = fixture(skill);
      queueShepherdInteraction(
        f.w,
        0,
        { callerOwner: 0, task, target: { kind: 1, index: 1 } },
        f.c,
      );
      stepShepherdCallback(f.w, 0, f.c);
      expect(f.n()[85]).toBe(12);
      expect(f.n()[131]).toBe(expected);
      expect(dword(f.n(), 140)).toBe((10 + expected) * 1000);
    }
  });
  it("launches a real37..40 request, debits only after successful creation, and sets cooldown/count/ANB", () => {
    const f = fixture();
    active(f);
    const r = stepShepherdRole(f.w, 0, f.c);
    expect(f.w.log).toEqual(["factory:38:1", "debit:80:true"]);
    expect(dword(f.raw(), 17)).toBe(-80);
    expect(dword(f.n(), 100)).toBe(8);
    expect(word(f.n(), 136)).toBe(1);
    expect(f.n()[112]! & 128).toBe(128);
    expect(f.n()[89]).toBe(17);
    expect(r.events).toContainEqual({
      type: "shot",
      actor: 0,
      target: 1,
      code: 38,
      created: true,
    });
  });
  it("kind3 damage costs source400 perprojectile tier and suppresses the floating debit entity", () => {
    const f = fixture();
    active(f);
    const t = Array<number | null>(200).fill(0);
    t[6] = 3;
    put(t, 15, 1);
    put(t, 7, 1100);
    put(t, 9, 1000);
    f.w.targets["3:1"] = t;
    f.n()[129] = 3;
    stepShepherdRole(f.w, 0, f.c);
    expect(f.w.log).toEqual(["factory:38:3", "debit:800:false"]);
  });
  it("factory capacity failure still plays source firing motion but has no debit, cooldown or shot-count increment", () => {
    const f = fixture();
    active(f);
    stepShepherdRole(f.w, 0, {
      ...f.c,
      launchProjectile: () => false,
      debit: undefined,
    });
    expect(dword(f.n(), 100)).toBe(0);
    expect(word(f.n(), 136)).toBe(0);
    expect(f.n()[112]! & 128).toBe(128);
  });
  it("capture41..43 allocation never invents a debit or direct creature stun/ownership", () => {
    const f = fixture();
    active(f, 2, 5);
    const before = f.target().slice();
    stepShepherdRole(f.w, 0, { ...f.c, debit: undefined });
    expect(f.w.log).toEqual(["factory:42:1"]);
    expect(f.target()).toEqual(before);
    expect(f.n()[89]).toBe(25);
  });
  it("turns first when outside aiming tolerance without a factory/debit", () => {
    const f = fixture();
    active(f);
    put(f.n(), 57, 0);
    put(f.n(), 138, 1);
    stepShepherdRole(f.w, 0, f.c);
    expect(f.w.log).toEqual([]);
    expect(word(f.n(), 75)).toBe(512);
    expect(word(f.n(), 136)).toBe(0);
  });
  it("uses generic source target references for kind4 pursuit", () => {
    const f = fixture();
    active(f);
    const t = Array<number | null>(67).fill(0);
    t[6] = 4;
    put(t, 15, 7);
    put(t, 7, 3000);
    put(t, 9, 1000);
    f.w.targets["4:7"] = t;
    f.n()[129] = 4;
    put(f.n(), 127, 7);
    put32(f.n(), 140, 20);
    stepShepherdRole(f.w, 0, f.c);
    expect(f.n()[90]).toBe(4);
    expect(f.n()[82]).toBe(4);
    expect(word(f.n(), 80)).toBe(7);
    expect(f.n()[112]! & 16).toBe(16);
  });
  it("keeps cooldown/close-range escape on exact526C0 RNG/target reference continuation", () => {
    const f = fixture();
    active(f);
    put32(f.n(), 100, 3);
    stepShepherdRole(f.w, 0, f.c);
    expect(f.n()[90]).toBe(5);
    expect(f.w.rng.draws).toBe(1);
    expect(f.w.log.some((s) => s.startsWith("ray:"))).toBe(true);
    expect(word(f.n(), 136)).toBe(0);
  });
  it("source task1 can switch to2 on its fourtick gate without reselection of its existing projectile", () => {
    const f = fixture();
    active(f);
    f.w.frame = 3;
    f.c.runtimeCount11c2bc = 0;
    stepShepherdRole(f.w, 0, f.c);
    expect(f.n()[126]).toBe(2);
    expect(f.n()[131]).toBe(1);
    expect(f.w.rng.draws).toBe(1);
  });
  it("reacquires after protected/dead targets only after source movement gates allow the scan", () => {
    const f = fixture();
    active(f, 2, 4);
    let scans = 0;
    const c = {
      ...f.c,
      protectedTarget: () => true,
      findHostile: () => {
        scans++;
        return null;
      },
    };
    f.n()[112] = 17;
    put(f.n(), 73, 32);
    stepShepherdRole(f.w, 0, c);
    expect(scans).toBe(0);
    expect(f.n()[126]).toBe(2);
    stepShepherdRole(f.w, 0, c);
    expect(scans).toBe(1);
    expect(f.n()[126]).toBe(255);
    expect(f.n()[129]).toBe(0);
  });
  it("rolls back late missing debit and retained-target replacement after an actual factory port", () => {
    const f = fixture();
    active(f);
    const before = structuredClone(f.w);
    expect(() =>
      stepShepherdRole(f.w, 0, { ...f.c, debit: undefined }),
    ).toThrow("806E0 projectile debit");
    expect(f.w).toEqual(before);
    expect(() =>
      stepShepherdRole(f.w, 0, {
        ...f.c,
        launchProjectile(w) {
          w.targets["1:1"] = w.targets["1:1"].slice();
          return true;
        },
      }),
    ).toThrow("retained target");
    expect(f.w).toEqual(before);
  });
  it("idle acquisition uses one source draw and stages the category3 task2 interaction", () => {
    const f = fixture();
    f.w.frame = 16;
    const r = tryShepherdIdleAcquisition(f.w, 0, f.c);
    expect(r.status).toBe("pending");
    expect(f.w.rng.draws).toBe(1);
    expect(f.n()[126]).toBe(2);
    expect(f.n()[87]! & 1).toBe(1);
    expect(f.n()[112]! & 2).toBe(2);
  });
  it("JSON continuation preserves cooldown, control/target fields, RNG and ordered service effects", () => {
    const f = fixture();
    active(f);
    stepShepherdRole(f.w, 0, f.c);
    const copy: World = JSON.parse(JSON.stringify(f.w));
    for (let i = 0; i < 3; i++) {
      f.w.frame++;
      copy.frame++;
      stepShepherdCallback(f.w, 0, f.c);
      stepShepherdCallback(copy, 0, f.c);
    }
    expect(copy).toEqual(JSON.parse(JSON.stringify(f.w)));
  });
  it("staged role keeps actor/player/binding identities", () => {
    const f = fixture();
    active(f);
    const n = f.n(),
      p = f.raw(),
      binding = f.w.specialists.bindings[0];
    stepStagedShepherdRole(f.w, 0, f.c);
    expect(f.n()).toBe(n);
    expect(f.raw()).toBe(p);
    expect(f.w.specialists.bindings[0]).toBe(binding);
  });
  it("operator projection filters retained category before live actor validation and uses source control gates", () => {
    const f = fixture();
    f.raw()[3] = 2;
    f.raw()[5] = 1;
    f.w.specialists.bindings[1] = {
      ...f.w.specialists.bindings[0]!,
      blueprintIndex: 1,
      category: 0,
    };
    f.raw()[0x16 + 36 + 22] = 0;
    f.raw()[0x16 + 36 + 23] = 255;
    f.w.specialists.records[1].fill(null);
    expect(readShepherdOperators(f.w)).toEqual([]);
    queueShepherdControl(f.w, 0, { callerOwner: 0, point: [2, 3], mode: 1 });
    stepShepherdCallback(f.w, 0, f.c);
    // Source5D700 has no kind/health gate, even with a retained inactive C0.
    f.n()[6] = 0;
    f.raw()[0x16 + 26] = 0;
    expect(readShepherdOperators(f.w)).toHaveLength(1);
    f.n()[126] = 2;
    expect(readShepherdOperators(f.w)).toEqual([]);
  });
});
