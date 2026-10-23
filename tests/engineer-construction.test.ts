import { describe, expect, it } from "vitest";
import {
  makeEngineerConstructionServices,
  planEngineerCompletedBuildingContribution,
  type EngineerNativeConstructionContext,
} from "../src/sim/mechanics/engineer-construction";
import {
  cancelEngineerWork,
  stepEngineerCallback,
  stepStagedEngineerRole,
  type EngineerCallbackContext,
} from "../src/sim/mechanics/engineer";
import {
  stepStagedSpecialistMotion,
  type SpecialistMotionContext,
} from "../src/sim/mechanics/specialist-motion";
import type { GeneticistWorld } from "../src/sim/mechanics/geneticist";
import { CRATER_JOB_BASE, CRATER_JOB_COUNT } from "../src/sim/mechanics/crater";
import { nextRandom } from "../src/sim/mechanics/random";
type Native = (number | null)[];
type World = GeneticistWorld & {
  buildings: Native[];
  reserved: boolean;
  releases: number;
  contributions: number[];
};
const put = (n: Native, at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, at: number, v: number) => {
  put(n, at, v);
  put(n, at + 2, v >> 16);
};
const word = (n: Native, at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
const dword = (n: Native, at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
function building(slot = 2): Native {
  const n: Native = Array(67).fill(0);
  n.fill(null, 31, 39);
  n[6] = 4;
  n[45] = 1;
  put(n, 15, slot);
  put(n, 7, 1500);
  put(n, 9, 1600);
  put(n, 43, 1);
  return n;
}
function fixture(stage = 0) {
  const n: Native = Array(200).fill(0);
  n.fill(null, 31, 39);
  n.fill(null, 176, 180);
  n.fill(null, 192, 200);
  n[6] = 3;
  n[25] = 13;
  n[28] = 1;
  n[85] = 9;
  n[88] = 1;
  n[89] = 13;
  n[90] = 1;
  n[112] = 129;
  n[126] = 0;
  n[130] = 1;
  n[131] = 1;
  for (const [at, value] of [
    [7, 1023],
    [9, 2047],
    [11, 1023],
    [13, 2047],
    [43, 50],
    [63, 700],
    [96, 1023],
    [98, 2047],
    [132, 12],
    [136, stage],
    [138, 1024],
    [140, 1023],
    [142, 2047],
  ])
    put(n, at, value);
  put32(n, 17, 2048);
  put32(n, 39, 2048);
  put32(n, 144, -1);
  const w: World = {
    specialists: {
      schemaVersion: 1,
      records: Array.from({ length: 20 }, (_, i) =>
        i ? Array(200).fill(0) : n,
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
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    missionPrefix: Array(0x355e).fill(0),
    rng: { seed: 131, ring: 31, draws: 0 },
    frame: 1,
    buildings: [building()],
    reserved: true,
    releases: 0,
    contributions: [],
  };
  w.specialists.bindings[0] = {
    owner: 0,
    blueprintIndex: 0,
    style: 0,
    category: 0,
    resourceKey: 0,
    assetKey: "SYNTHETIC",
    sourceName: "data/spec/synthetic.anb",
    classSpeed: 700,
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
  w.players[0].raw[45] = 50;
  for (let i = 0; i < 25; i++)
    put(w.missionPrefix, CRATER_JOB_BASE + i * 176 + 12, -1);
  for (let i = 0; i < 16384; i++) {
    put(w.terrain.bytes, i * 14, 16384);
    put(w.terrain.bytes, i * 14 + 2, 1024);
    w.terrain.bytes[i * 14 + 5] = 2;
    w.terrain.bytes[i * 14 + 12] = 64;
  }
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
  const primitive: EngineerNativeConstructionContext<World> = {
    tables,
    constructionCosts: [600, 750, 0, 900, 0, 0, 250, 0, 0, 0, 0, 500, 0, 0],
    siteClass: () => 0,
    reserveSite: (s, p) => {
      s.reserved = true;
      return {
        point: p.map((v) => (v & ~255) | 127) as [number, number],
        targetHeight: 1024,
        events: [],
      };
    },
    releaseSite: (s) => {
      s.reserved = false;
      s.releases++;
      return [];
    },
    building: (s, slot) =>
      s.buildings.find((v) => v[6] === 4 && word(v, 15) === slot) ?? null,
    createBuildingEffect: (s, q) => {
      const target = building();
      put(target, 7, q.point[0]);
      put(target, 9, q.point[1]);
      target[45] = q.selector;
      target[24] = q.owner;
      put(target, 43, 0);
      s.buildings = [target];
      return { effectSlot: 3, buildingSlot: 2 };
    },
    progressBuilding: (s, slot, increment) => {
      const target = s.buildings.find((v) => word(v, 15) === slot)!;
      s.contributions.push(increment);
      const health = word(target, 43) + increment,
        completed = health >= 120;
      put(target, 43, Math.min(health, 120));
      if (completed) put(target, 49, 1);
      return {
        completed,
        events: [
          {
            type: "building-progress",
            buildingId: slot,
            increment,
            health: word(target, 43),
          },
        ],
      };
    },
    animation: () => ({ first: 0, last: 2, holds: [0, 0, 0], flags: 0 }),
  };
  const c: EngineerCallbackContext<World> = {
    tables,
    cellOrder: () => [],
    globalFlags: 0,
    motion: () => {},
    runtimeMode: 0,
    override180d80: 0,
    runtimeCount11c2bc: 1,
    animation: () => ({ first: 0, last: 2, holds: [0, 0, 0], flags: 0 }),
    construction: makeEngineerConstructionServices(primitive),
  };
  return { w, c, primitive, n: () => w.specialists.records[0] };
}
function job(f: ReturnType<typeof fixture>, remaining = 1) {
  put32(f.n(), 144, 0);
  put(f.w.missionPrefix, CRATER_JOB_BASE + 12, remaining);
  f.w.missionPrefix[CRATER_JOB_COUNT] = remaining < 0 ? 0 : 1;
}
function target(f: ReturnType<typeof fixture>) {
  put(f.n(), 127, 2);
  f.n()[129] = 4;
  return f.w.buildings[0];
}
describe("native534D0 ordinary Engineer task0", () => {
  it("sets actual site task bytes after507D0 and uses actual perimeter result", () => {
    const f = fixture();
    put(f.n(), 11, -1);
    put(f.n(), 13, -2);
    f.n()[112] = 1;
    f.n()[129] = 0;
    let input: number[] = [];
    f.primitive.reserveSite = (_w, p, size) => {
      input = [...p, size];
      return {
        point: [895, 1919],
        targetHeight: 777,
        events: [{ type: "terrain", cells: [4] }],
      };
    };
    f.c.construction = makeEngineerConstructionServices(f.primitive);
    const out = f.c.construction.activate(f.w, 0);
    expect(input).toEqual([1023, 2047, 1]);
    expect([
      word(f.n(), 11),
      word(f.n(), 13),
      word(f.n(), 132),
      word(f.n(), 134),
      word(f.n(), 138),
      word(f.n(), 140),
      word(f.n(), 142),
      dword(f.n(), 144),
      word(f.n(), 96),
      word(f.n(), 98),
      f.n()[74],
    ]).toEqual([32767, 32766, 12, 0, 777, 895, 1919, -1, 895, 1919, 8]);
    expect(out.events).toEqual([
      { type: "terrain", cells: [4] },
      { type: "message", actorId: 0, index: 15 },
    ]);
  });
  it.each([1, 2, 3, 4] as const)(
    "retains source site rejection%i/cancelled state9 rather than doing idle recovery",
    (site) => {
      const f = fixture();
      f.primitive.siteClass = () => site;
      f.c.construction = makeEngineerConstructionServices(f.primitive);
      f.n()[112] = 1;
      f.n()[129] = 0;
      const out = f.c.construction.activate(f.w, 0);
      expect(out.status).toBe("rejected");
      expect([
        f.n()[85],
        f.n()[126],
        f.n()[130],
        f.n()[88],
        f.n()[122],
        f.w.rng.draws,
      ]).toEqual([9, 255, 0, 0, [0, 6, 5, 7, 2][site], 0]);
      expect(f.w.releases).toBe(1);
    },
  );
  it("allocates from actual shared25 priors, preserves retained bytes and emits native job metadata", () => {
    const f = fixture();
    f.n()[73] = 32;
    f.w.missionPrefix[CRATER_JOB_BASE + 175] = 77;
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect([
      word(f.n(), 136),
      dword(f.n(), 144),
      f.w.missionPrefix[CRATER_JOB_COUNT],
      f.w.missionPrefix[CRATER_JOB_BASE + 175],
      f.w.rng.draws,
    ]).toEqual([1, 0, 1, 77, 0]);
    expect(out.terrainJobs).toEqual([
      {
        operation: "allocated",
        slot: 0,
        remaining: 1,
        countBefore: 0,
        countAfter: 1,
      },
    ]);
    expect(out.constructionEvents).toContainEqual({
      type: "audio",
      actorId: 0,
      channel: 41,
      mode: 2,
      parameter: 255,
    });
  });
  it("retains stage0 retry and no RNG/payment on actual pool capacity failure", () => {
    const f = fixture();
    f.n()[73] = 32;
    f.w.missionPrefix[CRATER_JOB_COUNT] = 25;
    for (let i = 0; i < 25; i++)
      put(f.w.missionPrefix, CRATER_JOB_BASE + i * 176 + 12, 1);
    const prefix = f.w.missionPrefix.slice();
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect(f.w.missionPrefix).toEqual(prefix);
    expect([
      word(f.n(), 136),
      dword(f.n(), 144),
      f.n()[89],
      f.n()[112],
      f.w.rng.draws,
    ]).toEqual([0, -1, 13, 129, 0]);
    expect(out.terrainJobs).toEqual([]);
  });
  it("uses planar-only terrain waiting and retries original site after exact65536 distance gate", () => {
    const near = fixture(1);
    job(near);
    put32(near.n(), 39, 200000);
    stepStagedEngineerRole(near.w, 0, near.c);
    expect(word(near.n(), 136)).toBe(1);
    const far = fixture(1);
    job(far);
    put(far.n(), 11, 1279);
    far.n()[112] = 145;
    const out = stepStagedEngineerRole(far.w, 0, far.c);
    expect([
      word(far.n(), 136),
      dword(far.n(), 144),
      far.w.missionPrefix[CRATER_JOB_COUNT],
      word(far.n(), 96),
      word(far.n(), 98),
      far.n()[126],
      far.n()[130],
      far.n()[88],
      far.w.releases,
    ]).toEqual([0, -1, 0, 1023, 2047, 0, 1, 1, 0]);
    expect(out.reason).toBe("native-terraform-restart-distance");
    expect(out.terrainJobs).toEqual([
      {
        operation: "retired",
        slot: 0,
        remaining: -1,
        countBefore: 1,
        countAfter: 0,
      },
    ]);
    expect(out.constructionEvents.some((v) => v.type === "audio")).toBe(false);
  });
  it("completes terrain with ordered message/diagonal draws then actual526C0 continuation", () => {
    const f = fixture(1);
    job(f, -1);
    f.n()[73] = 32;
    f.n()[27] = 2;
    const rng = structuredClone(f.w.rng);
    nextRandom(rng);
    const sign = nextRandom(rng) % 10 < 5 ? -1 : 1;
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect([
      word(f.n(), 136),
      word(f.n(), 96),
      word(f.n(), 98),
      f.n()[112]! & 144,
    ]).toEqual([3, 1023 + sign * 256, 2047 - sign * 256, 0]);
    expect(f.w.rng).toEqual(rng);
    expect(
      out.constructionEvents
        .filter((v) => v.type === "rng")
        .map((v) => v.journal),
    ).toEqual([0x78b, 0x7b2]);
  });
  it("pays original two pools and selected resource-owner refill before action14", () => {
    const f = fixture(3);
    f.n()[73] = 32;
    put32(f.w.players[0].raw, 0x4a3, 500);
    put32(f.w.players[0].raw, 0x4a7, 500);
    f.w.players[0].raw[0x4a1] = 2;
    f.w.players[2].raw[2] = 1;
    stepStagedEngineerRole(f.w, 0, f.c);
    expect([
      dword(f.w.players[0].raw, 0x4a3),
      dword(f.w.players[0].raw, 0x4a7),
      word(f.n(), 136),
      f.n()[89],
      f.n()[27],
      f.n()[28],
      f.n()[29],
      f.w.rng.draws,
    ]).toEqual([0, 1000, 4, 14, 0, 1, 0, 0]);
  });
  it("releases insufficient stage3 without resetting animation/RNG or refunding", () => {
    const f = fixture(3);
    f.n()[73] = 32;
    f.n()[25] = 13;
    put(f.n(), 45, 91);
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect(out.status).toBe("released");
    expect([
      f.n()[122],
      f.n()[85],
      f.n()[126],
      f.n()[130],
      f.n()[25],
      word(f.n(), 45),
      f.w.releases,
      f.w.rng.draws,
    ]).toEqual([8, 9, 255, 0, 13, 91, 1, 0]);
  });
  it("reads pre-tail action14 completion and retries actual44 capacity with bit74 cleared", () => {
    const f = fixture(4);
    f.n()[25] = 14;
    f.n()[89] = 14;
    f.n()[27] = 2;
    f.n()[74] = 8;
    f.primitive.createBuildingEffect = () => null;
    f.c.construction = makeEngineerConstructionServices(f.primitive);
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect(out.reason).toBe("native-building-effect-capacity");
    expect([
      word(f.n(), 136),
      f.n()[74],
      f.w.rng.draws,
      f.w.contributions.length,
    ]).toEqual([4, 0, 0, 0]);
  });
  it("creates real child/contributes1 before installing native building ref and stage5 movement", () => {
    const f = fixture(4);
    f.n()[25] = 14;
    f.n()[89] = 14;
    f.n()[27] = 2;
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect([
      word(f.n(), 127),
      f.n()[129],
      word(f.n(), 136),
      f.n()[89],
      word(f.n(), 96),
      word(f.n(), 98),
      f.n()[112]! & 132,
    ]).toEqual([2, 4, 5, 15, 1023, 2047, 0]);
    expect(f.w.contributions).toEqual([1]);
    expect(
      out.constructionEvents.some((v) => v.type === "building-created"),
    ).toBe(true);
  });
  it("starts work only on actual arrival, then clocks once and consumes odd-frame/audio draw before work-point draws", () => {
    const f = fixture(5);
    target(f);
    f.n()[73] = 32;
    stepStagedEngineerRole(f.w, 0, f.c);
    expect([
      word(f.n(), 132),
      word(f.n(), 134),
      f.n()[112]! & 144,
      f.w.rng.draws,
    ]).toEqual([60, 60, 128, 0]);
    f.n()[73] = 0;
    put(f.n(), 134, 1);
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect(f.w.contributions).toEqual([100]);
    expect([word(f.n(), 134), f.n()[112]! & 144, f.w.rng.draws]).toEqual([
      60, 16, 3,
    ]);
    expect(
      out.constructionEvents
        .filter((v) => v.type === "rng")
        .map((v) => v.journal),
    ).toEqual([0x833, 0x59c, 0x59d]);
  });
  it("completes contribution then installs actual referenced departure without teleport/extra movement", () => {
    const f = fixture(5),
      b = target(f);
    put(b, 43, 30);
    put(f.n(), 132, 60);
    put(f.n(), 134, 1);
    f.n()[22] = 255;
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect([
      word(f.n(), 96),
      word(f.n(), 98),
      word(f.n(), 11),
      word(f.n(), 13),
      word(f.n(), 77),
      f.n()[79],
      f.n()[82],
      f.n()[22],
      f.n()[73]! & 128,
      word(f.n(), 136),
    ]).toEqual([1884, 1984, 1884, 1984, 2, 4, 0, 63, 128, 5]);
    expect(f.w.contributions).toEqual([100]);
    expect(out.constructionEvents.filter((v) => v.type === "rng")).toHaveLength(
      1,
    );
  });
  it("uses completed building repair cost120-skill before actual441C0 and keeps stage5 footprint on final arrival", () => {
    const f = fixture(5),
      b = target(f);
    put(b, 49, 1);
    put(b, 43, 110);
    put(f.n(), 134, 1);
    put32(f.w.players[0].raw, 0x4a3, 100);
    stepStagedEngineerRole(f.w, 0, f.c);
    expect(dword(f.w.players[0].raw, 0x4a3)).toBe(30);
    f.n()[73] = 32;
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect(out.reason).toBe("native-construction-finished");
    expect([
      f.n()[126],
      f.n()[130],
      f.w.reserved,
      f.w.releases,
      word(f.w.buildings[0], 49),
    ]).toEqual([255, 0, true, 0, 1]);
    expect(out.constructionEvents).toContainEqual({
      type: "message",
      actorId: 0,
      index: 17,
    });
  });
  it("cancels active native job with exact byte count decrement and retained slot word", () => {
    const f = fixture(1);
    job(f);
    const out = cancelEngineerWork(f.w, 0, 0, f.c);
    expect([
      word(f.w.missionPrefix, CRATER_JOB_BASE + 12),
      f.w.missionPrefix[CRATER_JOB_COUNT],
      dword(f.n(), 144),
      f.w.releases,
    ]).toEqual([-1, 0, 0, 1]);
    expect(out.terrainJobs[0].operation).toBe("retired");
    const retired = fixture(1);
    job(retired, -1);
    cancelEngineerWork(retired.w, 0, 0, retired.c);
    expect(retired.w.missionPrefix[CRATER_JOB_COUNT]).toBe(255);
  });
  it("keeps stage5 missing-building cancellation explicit and rejects unimplemented selector5", () => {
    const f = fixture(5);
    f.n()[129] = 0;
    const out = stepStagedEngineerRole(f.w, 0, f.c);
    expect([out.status, f.n()[122], f.w.releases]).toEqual(["released", 3, 0]);
    const other = fixture();
    other.n()[131] = 5;
    expect(() => stepStagedEngineerRole(other.w, 0, other.c)).toThrow(
      /unimplemented construction family/,
    );
  });
  it("rolls back all native/building/prefix/player/RNG writes on a late actual contribution failure", () => {
    const f = fixture(4);
    f.n()[25] = 14;
    f.n()[89] = 14;
    f.n()[27] = 2;
    const before = structuredClone(f.w);
    f.primitive.progressBuilding = (w) => {
      w.missionPrefix[CRATER_JOB_COUNT] = 9;
      put32(w.players[0].raw, 0x4a3, 22);
      nextRandom(w.rng);
      throw Error("actual contribution failed");
    };
    f.c.construction = makeEngineerConstructionServices(f.primitive);
    expect(() => stepEngineerCallback(f.w, 0, f.c)).toThrow(
      /contribution failed/,
    );
    expect(f.w).toEqual(before);
  });
  it("admits one actual category0 state9 common6FB60 followed by one ANB tail", () => {
    const f = fixture(0),
      order: string[] = [];
    f.n()[112] = 17;
    f.n()[73] = 20;
    f.n()[84] = 20;
    put(f.n(), 11, 4000);
    put(f.n(), 13, 2047);
    put(f.n(), 96, 4000);
    put(f.n(), 98, 2047);
    put(f.n(), 45, 100);
    put(f.n(), 61, 100);
    put(f.n(), 65, 100);
    put(f.n(), 57, 512);
    put(f.n(), 75, 512);
    const motion: SpecialistMotionContext<World> = {
      tables: f.c.tables,
      gravity: 1024,
      water: 1632,
      bounce: Array(8).fill(128),
      selectedPlayer: 0,
      obstacle: () => null,
      blockerWeight: () => 0,
      relocate: (_w, _i, _before, _after, phase) => {
        order.push(`relocate-${phase}`);
      },
      reveal: () => {},
    };
    f.c.motion = (w, i) => {
      order.push("6FB60");
      stepStagedSpecialistMotion(w, i, motion);
    };
    f.c.animation = () => {
      order.push("7AC00");
      return { first: 0, last: 2, holds: [0, 0, 0], flags: 0 };
    };
    stepEngineerCallback(f.w, 0, f.c);
    expect(order).toEqual(["6FB60", "relocate-physics", "7AC00"]);
    expect(word(f.n(), 7)).not.toBe(1023);
    expect(word(f.n(), 136)).toBe(0);
  });
  it("retains native state9 work timers/RNG/building after JSON reload", () => {
    const f = fixture(5);
    target(f);
    put(f.n(), 132, 60);
    put(f.n(), 134, 3);
    const loaded = JSON.parse(JSON.stringify(f.w)) as World;
    for (let frame = 1; frame <= 3; frame++) {
      f.w.frame = loaded.frame = frame;
      stepEngineerCallback(f.w, 0, f.c);
      stepEngineerCallback(loaded, 0, f.c);
      expect(loaded).toEqual(f.w);
    }
  });
});
describe("source441C0 completed grade0 repair numeric obligations", () => {
  it("heals below maximum without repeating completion or dirty/capacity effects", () => {
    const b = building();
    put(b, 49, 1);
    put(b, 43, 20);
    const q = planEngineerCompletedBuildingContribution(b, 10, 120);
    expect([
      word(q.native, 43),
      q.completed,
      q.damageRecoveryNative,
      q.completedPlayerCountOffset,
      q.changedUiAudioCondition,
    ]).toEqual([30, false, null, null, false]);
    expect(word(b, 43)).toBe(20);
  });
  it("restores damaged capacity above max/3 then repeats source43F60 grade0 completion at maximum", () => {
    const b = building();
    put(b, 49, 0x141);
    put(b, 43, 30);
    b[30] = 219;
    b[48] = 71;
    b[63] = 33;
    const q = planEngineerCompletedBuildingContribution(b, 100, 120);
    expect(q.damageRecoveryNative).not.toBeNull();
    expect([
      word(q.damageRecoveryNative!, 43),
      word(q.damageRecoveryNative!, 49),
      q.damageRecoveryNative![21],
    ]).toEqual([130, 1, 0]);
    expect([
      word(q.native, 43),
      word(q.native, 49),
      word(q.native, 61),
      q.native[21],
      q.native[30],
      q.native[48],
      q.native[63],
      q.completed,
      q.completedPlayerCountOffset,
      q.acquiredOwnershipBit,
      q.firstCompletionAudio,
    ]).toEqual([120, 1, 200, 4, 219, 71, 33, true, 0x601, 2, null]);
  });
  it("retains exact strict damage-recovery threshold, signed word overflow and admission guards", () => {
    const b = building();
    put(b, 49, 0x41);
    put(b, 43, 30);
    expect(
      planEngineerCompletedBuildingContribution(b, 10, 120)
        .damageRecoveryNative,
    ).toBeNull();
    expect(
      planEngineerCompletedBuildingContribution(b, 11, 120)
        .damageRecoveryNative,
    ).not.toBeNull();
    put(b, 43, 120);
    expect(
      planEngineerCompletedBuildingContribution(b, 32767, 120).completed,
    ).toBe(false);
    put(b, 49, 0);
    expect(() => planEngineerCompletedBuildingContribution(b, 10, 120)).toThrow(
      /completed grade0/,
    );
  });
});
