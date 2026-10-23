import { describe, expect, it } from "vitest";
import {
  cancelEngineerWork,
  engineerPlacementPoint,
  queueEngineerAssignment,
  queueEngineerMove,
  queueEngineerPlacement,
  stepEngineerCallback,
  stepStagedEngineerRole,
  tryEngineerIdleAcquisition,
  type EngineerCallbackContext,
  type EngineerConstructionServices,
} from "../src/sim/mechanics/engineer";
import type { GeneticistWorld } from "../src/sim/mechanics/geneticist";
import { nextRandom } from "../src/sim/mechanics/random";

type Native = (number | null)[];
const put = (n: Native, at: number, value: number) => {
  n[at] = value & 255;
  n[at + 1] = (value >> 8) & 255;
};
const word = (n: Native, at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
function fixture(state = 1) {
  const n: Native = Array(200).fill(0);
  n.fill(null, 31, 39);
  n.fill(null, 176, 180);
  n.fill(null, 192, 200);
  n[6] = 3;
  n[25] = 8;
  n[28] = 1;
  n[85] = state;
  n[112] = 1;
  n[126] = 255;
  put(n, 7, 1000);
  put(n, 9, 2000);
  const w: GeneticistWorld = {
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
    frame: 1,
    rng: { seed: 131, ring: 31, draws: 0 },
  };
  w.specialists.bindings[0] = {
    owner: 0,
    blueprintIndex: 0,
    style: 0,
    category: 0,
    resourceKey: 1,
    assetKey: "SYNTHETIC",
    sourceName: "data/spec/synthetic.anb",
    classSpeed: 700,
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
  w.players[0].raw[22 + 23] = 50;
  const c: EngineerCallbackContext<GeneticistWorld> = {
    tables: {
      atan: Array(257).fill(0),
      cosine: Array(2048).fill(0),
      sine: Array(2048).fill(0),
    },
    cellOrder: () => [],
    globalFlags: 0,
    motion: () => {},
    runtimeMode: 0,
    runtimeCount11c2bc: 1,
    override180d80: 0,
    animation: () => ({ first: 0, last: 2, holds: [0, 0, 0], flags: 0 }),
    resolveMovePoint: (_w, _i, p) => p,
    resolvePlacementPoint: (_w, _i, _from, p) => p,
  };
  return { w, c, n: () => w.specialists.records[0] };
}
function active(f: ReturnType<typeof fixture>, stage = 0) {
  const n = f.n();
  n[85] = 9;
  n[88] = 1;
  n[112] = 129;
  n[89] = 13;
  n[126] = 0;
  n[130] = 1;
  n[131] = 1;
  put(n, 136, stage);
}
function ports(): EngineerConstructionServices<GeneticistWorld> {
  return {
    activate: (w, i) => {
      const n = w.specialists.records[i];
      n[90] = 1;
      put(n, 132, w.players[0].raw[45] >> 2);
      put(n, 134, 0);
      put(n, 144, -1);
      put(n, 146, -1);
      put(n, 96, (word(n, 7) & ~255) | 127);
      put(n, 98, (word(n, 9) & ~255) | 127);
      const p = engineerPlacementPoint([word(n, 7), word(n, 9)], n[131]!);
      put(n, 140, p[0]);
      put(n, 142, p[1]);
      n[74] = n[74]! | 8;
      n[112] = n[112]! | 128;
      n[89] = 13;
      return {
        status: "active",
        reason: "prepared",
        events: [{ type: "message", actorId: i, index: 15 }],
      };
    },
    step: () => ({ status: "active", reason: "construction-step", events: [] }),
    release: (w, i) => {
      w.specialists.records[i][88] = w.specialists.records[i][88]! & 254;
      return { status: "released", reason: "resource-release", events: [] };
    },
  };
}
describe("source category0 Engineer control boundary", () => {
  it("queues exact idle opcode5 bytes without motion, setup, animation or draws", () => {
    const f = fixture(),
      before = structuredClone(f.w);
    const out = queueEngineerAssignment(f.w, 0, {
      callerOwner: 0,
      selector: 11,
    });
    expect(out.status).toBe("pending");
    const expected = before.specialists.records[0];
    expected[87] = 1;
    expected[126] = 0;
    expected[130] = 1;
    expected[131] = 11;
    expect(f.w).toEqual(before);
  });
  it("keeps signed placement alignment and admits all14 table entries explicitly", () => {
    expect(engineerPlacementPoint([-1, -32768], 2)).toEqual([-256, -32768]);
    expect(engineerPlacementPoint([-1, -32768], 1)).toEqual([-129, -32641]);
    expect(engineerPlacementPoint([32767, 0], 13)).toEqual([32639, 127]);
    expect(() => engineerPlacementPoint([0, 0], 14)).toThrow(/selector/);
  });
  it("retains both resolver calls and their discriminator/write ordering", () => {
    const f = fixture(8),
      seen: unknown[] = [];
    f.n()[90] = 4;
    f.n()[91] = 5;
    f.c.resolvePlacementPoint = (w, i, origin, requested) => {
      const n = w.specialists.records[i];
      seen.push([origin, requested, n[90], n[91], word(n, 92), n[126], n[87]]);
      return seen.length === 1 ? [200, 300] : [400, 500];
    };
    queueEngineerPlacement(
      f.w,
      0,
      { callerOwner: 0, selector: 1, point: [1000, 2000] },
      f.c,
    );
    expect(seen).toEqual([
      [[1000, 2000], [895, 1919], 4, 5, 895, 0, 1],
      [[1000, 2000], [200, 300], 4, 0, 200, 0, 1],
    ]);
    expect([
      word(f.n(), 11),
      word(f.n(), 13),
      word(f.n(), 92),
      word(f.n(), 94),
    ]).toEqual([400, 500, 400, 500]);
    expect([
      f.n()[85],
      f.n()[87],
      f.n()[88],
      f.n()[90],
      f.n()[91],
      f.n()[130],
      f.n()[131],
    ]).toEqual([8, 3, 2, 0, 0, 1, 1]);
    expect(f.w.rng.draws).toBe(0);
  });
  it("rejects a late resolver failure atomically after source-first query mutations", () => {
    const f = fixture(),
      before = structuredClone(f.w);
    let calls = 0;
    f.c.resolvePlacementPoint = (w, _i, _from, requested) => {
      w.terrain.bytes[5] = 99;
      nextRandom(w.rng);
      if (++calls === 2) throw Error("actual resolver rejected");
      return requested;
    };
    expect(() =>
      queueEngineerPlacement(
        f.w,
        0,
        { callerOwner: 0, selector: 1, point: [0, 0] },
        f.c,
      ),
    ).toThrow(/resolver rejected/);
    expect(f.w).toEqual(before);
  });
  it("runs one common motion,507D0 prefix,534D0 and one common ANB tail in order", () => {
    const f = fixture(),
      trace: string[] = [],
      service = ports();
    queueEngineerAssignment(f.w, 0, { callerOwner: 0, selector: 1 });
    f.n()[112] = 5;
    f.n()[129] = 8;
    put(f.n(), 136, 73);
    f.c.motion = () => {
      trace.push("motion");
    };
    f.c.construction = {
      ...service,
      activate: (w, i) => {
        const n = w.specialists.records[i];
        trace.push("activate");
        expect([n[85], n[112], n[129], word(n, 136), n[88], n[87]]).toEqual([
          9, 1, 0, 0, 1, 0,
        ]);
        return service.activate(w, i);
      },
      step: () => {
        trace.push("role");
        return { status: "active", reason: "role", events: [] };
      },
    };
    f.c.animation = (_w, _i, action) => {
      trace.push(`ANB${action}`);
      return { first: 0, last: 2, holds: [0, 0, 0], flags: 0 };
    };
    const out = stepEngineerCallback(f.w, 0, f.c);
    expect(trace).toEqual(["motion", "activate", "role", "ANB13"]);
    expect(out.constructionEvents).toEqual([
      { type: "message", actorId: 0, index: 15 },
    ]);
    expect([f.n()[25], f.n()[27], f.w.rng.draws]).toEqual([13, 1, 0]);
  });
  it("rolls back the entire callback when its real role-only port is missing", () => {
    const f = fixture();
    active(f);
    const before = structuredClone(f.w);
    f.c.motion = (w, i) => {
      w.specialists.records[i][7] = 17;
      w.terrain.bytes[0] = 9;
      nextRandom(w.rng);
    };
    expect(() => stepEngineerCallback(f.w, 0, f.c)).toThrow(
      /role-only construction service/,
    );
    expect(f.w).toEqual(before);
  });
  it("releases category resources before common stop, retaining state, timer and physical velocity", () => {
    const f = fixture();
    active(f, 5);
    f.n()[74] = 8;
    f.n()[22] = 255;
    put(f.n(), 63, 700);
    put(f.n(), 45, 91);
    put(f.n(), 104, 30);
    const native = f.n(),
      raw = f.w.players[0].raw,
      binding = f.w.specialists.bindings[0];
    f.c.construction = {
      ...ports(),
      release: (w, i, request) => {
        expect(request).toEqual({
          mode: 1,
          task: 0,
          selector: 1,
          stage: 5,
          active: true,
        });
        expect([
          w.specialists.records[i][74],
          word(w.specialists.records[i], 63),
        ]).toEqual([0, 700]);
        w.specialists.records[i][88] = 0;
        return {
          status: "released",
          reason: "retained-incomplete-building",
          events: [],
        };
      },
    };
    // The staged entry retains source pointers; the atomic wrapper commits a new isolated graph.
    cancelEngineerWork(f.w, 0, 0, f.c);
    expect([
      f.n()[85],
      f.n()[126],
      f.n()[130],
      word(f.n(), 63),
      word(f.n(), 45),
      word(f.n(), 104),
      f.n()[22],
    ]).toEqual([9, 255, 0, 0, 91, 30, 63]);
    expect([native[126], raw.length, binding!.category, f.w.rng.draws]).toEqual(
      [0, 1805, 0, 0],
    );
  });
  it("queues ordinary movement only after releasing queued construction without inventing an active footprint", () => {
    const f = fixture();
    queueEngineerAssignment(f.w, 0, { callerOwner: 0, selector: 3 });
    let activeFlag: boolean | undefined;
    f.c.construction = {
      ...ports(),
      release: (_w, _i, q) => {
        activeFlag = q.active;
        return {
          status: "released",
          reason: "pending-travel-cancelled",
          events: [],
        };
      },
    };
    queueEngineerMove(f.w, 0, { callerOwner: 0, point: [32, 64] }, f.c);
    expect(activeFlag).toBe(false);
    expect([
      f.n()[87],
      f.n()[130],
      f.n()[126],
      word(f.n(), 11),
      word(f.n(), 13),
    ]).toEqual([2, 0, 255, 32, 64]);
  });
  it("rejects replacement of a held service record and an unfulfilled native release", () => {
    for (const replace of [false, true]) {
      const f = fixture();
      active(f);
      const before = structuredClone(f.w);
      f.c.construction = {
        ...ports(),
        release: (w, i) => {
          if (replace)
            w.specialists.records[i] = w.specialists.records[i].slice();
          return { status: "released", reason: "invalid", events: [] };
        },
      };
      expect(() => cancelEngineerWork(f.w, 0, 0, f.c)).toThrow(
        replace ? /retained/ : /did not release/,
      );
      expect(f.w).toEqual(before);
    }
  });
  it("executes idle pulses only at source cadence and never makes a construction task from no target", () => {
    const f = fixture();
    tryEngineerIdleAcquisition(f.w, 0, f.c);
    expect(f.w.rng.draws).toBe(0);
    f.w.frame = 16;
    f.w.players[0].raw[22 + 23] = 0;
    tryEngineerIdleAcquisition(f.w, 0, f.c);
    expect(f.w.rng.draws).toBe(1);
    expect([f.n()[126], f.n()[130], f.n()[87]]).toEqual([255, 0, 0]);
  });
  it("keeps save/reload command/native/ANB/RNG continuation identical", () => {
    const a = fixture();
    a.c.construction = ports();
    queueEngineerAssignment(a.w, 0, { callerOwner: 0, selector: 1 });
    const reloaded = JSON.parse(JSON.stringify(a.w)) as GeneticistWorld;
    for (let tick = 0; tick < 6; tick++) {
      stepEngineerCallback(a.w, 0, a.c);
      stepEngineerCallback(reloaded, 0, a.c);
      expect(reloaded).toEqual(a.w);
      a.w.frame++;
      reloaded.frame++;
    }
  });
  it("rejects unsupported active tasks but preserves cancelled534D0 direct return", () => {
    const f = fixture();
    active(f);
    f.n()[126] = 1;
    expect(() => stepStagedEngineerRole(f.w, 0, f.c)).toThrow(/task0/);
    f.n()[126] = 255;
    f.n()[130] = 0;
    f.n()[88] = 0;
    expect(stepStagedEngineerRole(f.w, 0, f.c).reason).toBe(
      "cancelled-construction-return",
    );
  });
  it("uses actual lifecycle ports and keeps category0 out of category2 cooldown decrement", () => {
    const f = fixture(4);
    put(f.n(), 100, 10);
    f.c.lifecycle = (w, i) => {
      expect(w.specialists.records[i][85]).toBe(4);
      return { handled: true, retired: false };
    };
    stepEngineerCallback(f.w, 0, f.c);
    expect([f.n()[25], word(f.n(), 100)]).toEqual([9, 10]);
  });
});
