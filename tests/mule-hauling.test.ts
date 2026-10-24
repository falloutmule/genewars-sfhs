import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  chooseMuleMaterialBuilding,
  setMuleMaterialBuildingRoute,
  pickUpMuleMaterial,
  stepMuleMaterialWork,
  stepMuleMaterialTravel,
  finishMuleMaterialCut,
  queryMuleMaterial,
  idleMuleMaterial,
  resumeMuleMaterialTask,
  haulingWord as word,
  haulingPut as put,
  haulingPoint as point,
  type HaulingNative as Native,
  type MuleHaulingContext,
} from "../src/sim/mechanics/mule-hauling";
import { attachMuleMaterialPose } from "../src/sim/mechanics/mule-hauling-motion";
import { worldCell } from "../src/sim/mechanics/terrain";
import { createCampaign } from "../src/sim/campaign/world";
import { campaignCreatureServiceBuilding } from "../src/sim/campaign/creature-command-adapter";
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
function native(kind: number, index = 0, p: [number, number] = [8192, 8192]) {
  const n: Native = Array({ 1: 124, 2: 49, 4: 67, 5: 81 }[kind]!).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  put(n, 15, index);
  put(n, 7, p[0]);
  put(n, 9, p[1]);
  if (kind === 1) {
    n[122] = 4;
    n[94] = 8;
  }
  if (kind === 4) put(n, 43, 100);
  return n;
}
function fixture() {
  const pack = campaignFixture(),
    terrain = { bytes: Array(128 * 128 * 14).fill(0), revision: 0 },
    n = native(1),
    plant = native(2, 1),
    corpse = native(1, 1),
    pulper = native(4, 2),
    recycler = native(4, 4),
    effect = native(5, 3),
    rng = { seed: 1, draws: 0, ring: 0 };
  pulper[45] = 2;
  recycler[45] = 4;
  pulper[49] = recycler[49] = 1;
  effect[69] = 67;
  corpse[94] = 25;
  const records = new Map<string, Native>([
      ["1:0", n],
      ["1:1", corpse],
      ["2:1", plant],
      ["4:2", pulper],
      ["4:4", recycler],
      ["5:3", effect],
    ]),
    trace: string[] = [],
    cells = new Map<number, { kind: 1 | 2 | 3 | 4 | 5; index: number }[]>();
  const c: MuleHaulingContext = {
    terrain,
    rng,
    tables: pack.rules!.tables,
    queryRadius: 256,
    resolve: (r) => records.get(`${r.kind}:${r.index}`) ?? null,
    cell: (i) => cells.get(i) ?? [],
    serviceBuilding: (mask, flags) => {
      trace.push(`query:${mask}:${flags}`);
      return mask === 4 ? pulper : recycler;
    },
    storageFull: () => false,
    maximumBuildingHealth: () => 100,
    pointAccepted: () => true,
    footprintBuilding: () => null,
    target: (r) => {
      trace.push(`target:${r.kind}:${r.index}`);
      return true;
    },
    detach: () => {
      trace.push("detach");
      n[96] = n[96]! & 253;
      n[93] = 0;
    },
    release: () => {
      trace.push("release");
    },
    attach: () => {},
    occupied: () => false,
    idle: (delay) => {
      trace.push(`idle:${delay}`);
      idleMuleMaterial(n, delay, c);
    },
    speed: () => 333,
    ignite: (p) => {
      trace.push("ignite");
      p[46] = p[46]! | 8;
      put(p, 44, 0);
    },
    unlinkPlant: () => {
      trace.push("unlink");
    },
    createPlantCarrier: () => {
      trace.push("factory67");
      return { slot: 3, native: effect };
    },
    audio: (cue) => {
      trace.push(`audio:${cue}`);
    },
  };
  return {
    pack,
    terrain,
    n,
    plant,
    corpse,
    pulper,
    recycler,
    effect,
    rng,
    records,
    trace,
    c,
    cells,
  };
}
describe("Mule4 material work", () => {
  it("resumes the exact retained target and task after hit, including a missing binding", () => {
    const f = fixture(),
      seen: unknown[] = [];
    f.n[120] = 5;
    f.n[90] = 2;
    put(f.n, 88, 19);
    f.c.resumeTask = (reference, mode) => seen.push({ reference, mode });
    resumeMuleMaterialTask(f.n, f.c);
    f.n[90] = 0;
    resumeMuleMaterialTask(f.n, f.c);
    expect(seen).toEqual([
      { reference: { kind: 2, index: 19 }, mode: 5 },
      { reference: null, mode: 5 },
    ]);
    put(f.n, 73, 3);
    resumeMuleMaterialTask(f.n, f.c);
    expect(seen).toHaveLength(2);
    expect(f.rng.draws).toBe(0);
  });
  it("requires the actual81D30 service on entered hit resume", () => {
    const f = fixture();
    f.n[120] = 4;
    expect(() => resumeMuleMaterialTask(f.n, f.c)).toThrow(/81D30/);
  });
  it("uses carrying kind and signed processing score, with Recycler winning equal scores", () => {
    const f = fixture();
    f.n[93] = 1;
    expect(
      chooseMuleMaterialBuilding(f.n, f.pulper, f.recycler, f.terrain),
    ).toBe(f.recycler);
    f.n[93] = 3;
    expect(
      chooseMuleMaterialBuilding(f.n, f.pulper, f.recycler, f.terrain),
    ).toBeNull();
    f.n[93] = 2;
    expect(
      chooseMuleMaterialBuilding(f.n, f.pulper, f.recycler, f.terrain),
    ).toBe(f.pulper);
    put32(f.pulper, 54, 200);
    expect(
      chooseMuleMaterialBuilding(f.n, f.pulper, f.recycler, f.terrain),
    ).toBe(f.recycler);
    f.n[93] = 5;
    expect(chooseMuleMaterialBuilding(f.n, null, f.recycler, f.terrain)).toBe(
      f.recycler,
    );
  });
  it("installs58ED0 nominated route while retaining untouched bytes", () => {
    const f = fixture();
    f.n[22] = 255;
    f.n[73] = 255;
    f.n[74] = 255;
    f.n[84] = 7;
    f.n[82] = 5;
    f.n[30] = 91;
    setMuleMaterialBuildingRoute(f.n, f.recycler, [-193, 125]);
    expect(point(f.n.slice(4) as Native)).toEqual([7999, 8317]); //goal11/13
    expect([
      word(f.n, 73) & 0xffff,
      f.n[22],
      f.n[79],
      f.n[82],
      word(f.n, 77),
      f.n[30],
    ]).toEqual([0xeffc, 63, 4, 0, 4, 91]);
  });
  it("leaves all pickup flags and references untouched on full shared capacity", () => {
    const f = fixture();
    f.c.createPlantCarrier = () => null;
    const before = structuredClone({
      n: f.n,
      p: f.plant,
      e: f.effect,
      rng: f.rng,
    });
    expect(pickUpMuleMaterial(f.n, { kind: 2, index: 1 }, f.c)).toBe(false);
    expect({ n: f.n, p: f.plant, e: f.effect, rng: f.rng }).toEqual(before);
    expect(f.trace).toEqual([]);
  });
  it("publishes references before ignition and unlinks before setting carry flag", () => {
    const f = fixture();
    f.c.ignite = (p) => {
      expect([word(f.n, 91), f.n[93], f.n[96], f.effect[73]]).toEqual([
        3, 5, 0, 0,
      ]);
      f.trace.push("ignite");
      p[46] = 8;
    };
    f.c.unlinkPlant = (p) => {
      expect([p[46], word(f.effect, 71), f.effect[73], f.n[96]]).toEqual([
        24, 1, 2, 0,
      ]);
      f.trace.push("unlink");
    };
    expect(pickUpMuleMaterial(f.n, { kind: 2, index: 1 }, f.c)).toBe(true);
    expect(f.trace).toEqual(["factory67", "ignite", "unlink"]);
    expect(f.n[96]).toBe(2);
    expect(f.rng.draws).toBe(0);
  });
  it("does not ignite already cut plants and marks the actual retained corpse", () => {
    const f = fixture();
    f.plant[46] = 8;
    pickUpMuleMaterial(f.n, { kind: 2, index: 1 }, f.c);
    expect(f.trace).toEqual(["factory67", "unlink"]);
    const row = f.corpse;
    expect(pickUpMuleMaterial(f.n, { kind: 1, index: 1 }, f.c)).toBe(true);
    expect([row[97], f.n[93], word(f.n, 91)]).toEqual([1, 1, 1]);
  });
  it("requires a real live-creature release family rather than normalizing its state", () => {
    const f = fixture();
    f.corpse[94] = 8;
    const before = f.corpse.slice();
    expect(() => pickUpMuleMaterial(f.n, { kind: 1, index: 1 }, f.c)).toThrow(
      /Live creature/,
    );
    expect(f.corpse).toEqual(before);
  });
  it("starts action20 cutting only after virtualAC and preserves positive travel", () => {
    const f = fixture();
    f.n[95] = 1;
    f.n[96] = 64;
    f.n[87] = 2;
    put(f.n, 85, 1);
    put(f.plant, 44, 4);
    stepMuleMaterialWork(f.n, f.c);
    expect(f.n[94]).toBe(8);
    expect(f.n[96]).toBe(64);
    put(f.n, 73, 512);
    stepMuleMaterialWork(f.n, f.c);
    expect([f.n[94], word(f.n, 108), f.plant[46], f.n[96]]).toEqual([
      11, 32767, 4, 0,
    ]);
    expect(f.trace).toEqual(["audio:12"]);
  });
  it("finishes cutting only on the actual current cell chain and draws its idle once", () => {
    for (const local of [false, true]) {
      const f = fixture();
      f.n[87] = 2;
      put(f.n, 85, 1);
      if (local) f.cells.set(worldCell(...point(f.n)), [{ kind: 2, index: 1 }]);
      finishMuleMaterialCut(f.n, f.c);
      expect(f.trace[0]).toEqual(
        local ? "ignite" : expect.stringMatching(/^idle:/),
      );
      expect(f.rng.draws).toBe(1);
      expect(f.n[87]).toBe(local ? 0 : 2);
    }
  });
  it("excludes full-capacity Recycler from new work but still accepts delivery of a carried corpse", () => {
    const f = fixture();
    f.c.serviceBuilding = (mask) => (mask === 16 ? f.recycler : null);
    f.c.storageFull = () => true;
    stepMuleMaterialWork(f.n, f.c);
    expect(f.trace).toHaveLength(1);
    expect(f.trace[0]).toMatch(/^idle:/);
    expect(f.rng.draws).toBe(1);
    f.n[96] = 2;
    f.n[93] = 1;
    f.n[95] = 1;
    stepMuleMaterialWork(f.n, f.c);
    expect(f.n[87]).toBe(4);
    expect(word(f.n, 85)).toBe(4);
    expect(f.n[96]! & 2).toBe(2);
  });
  it("picks up actual arrived material, consumes exactly two offset draws and nominates the building", () => {
    const f = fixture();
    f.plant[46] = 8;
    f.n[95] = 1;
    f.n[93] = 2;
    put(f.n, 91, 1);
    put(f.n, 73, 512);
    f.cells.set(worldCell(...point(f.n)), [{ kind: 2, index: 1 }]);
    stepMuleMaterialWork(f.n, f.c);
    expect(f.n[96]! & 2).toBe(2);
    expect([f.n[93], f.n[79], f.n[95]]).toEqual([5, 4, 1]);
    expect(word(f.n, 11)).toBeGreaterThanOrEqual(8192 - 192);
    expect(word(f.n, 11)).toBeLessThanOrEqual(8192 - 65);
    expect(word(f.n, 13)).toBeGreaterThanOrEqual(8192 + 64);
    expect(word(f.n, 13)).toBeLessThanOrEqual(8192 + 191);
    expect([word(f.n, 110), word(f.n, 112), f.n[97]! & 128]).toEqual([
      8192, 8192, 128,
    ]);
    expect(f.rng.draws).toBe(2);
    expect(f.trace).toEqual([
      "query:4:48",
      "query:16:48",
      "factory67",
      "unlink",
    ]);
  });
  it("uses actual local corpse order and does not need a remote scan when a body is present", () => {
    const f = fixture();
    put(f.corpse, 104, 50);
    f.cells.set(worldCell(...point(f.n)), [
      { kind: 1, index: 1 },
      { kind: 2, index: 1 },
    ]);
    stepMuleMaterialWork(f.n, f.c);
    expect(f.trace.at(-1)).toBe("target:1:1");
    expect(f.n[95]).toBe(1);
    expect(f.rng.draws).toBe(0);
  });
  it("drops on low route bits3 before resuming the exact command anchor", () => {
    const f = fixture();
    f.n[95] = 1;
    f.n[96] = 2;
    f.n[93] = 1;
    f.n[97] = 128;
    put(f.n, 73, 3);
    put(f.n, 110, 1234);
    put(f.n, 112, 2345);
    stepMuleMaterialTravel(f.n, f.c);
    expect(f.trace).toEqual(["detach"]);
    expect([word(f.n, 11), word(f.n, 13), word(f.n, 108), f.n[96]]).toEqual([
      1234, 2345, 32767, 128,
    ]);
    expect(f.rng.draws).toBe(0);
  });
  it("preserves an uncut plant travel and cancels a cut/missing target with one draw", () => {
    const f = fixture();
    f.n[95] = 1;
    f.n[96] = 64;
    f.n[87] = 2;
    put(f.n, 85, 1);
    put(f.n, 108, 42);
    stepMuleMaterialTravel(f.n, f.c);
    expect(f.rng.draws).toBe(0);
    expect(word(f.n, 108)).toBe(42);
    f.plant[46] = 8;
    stepMuleMaterialTravel(f.n, f.c);
    expect(f.rng.draws).toBe(1);
    expect(f.n[96]).toBe(0);
    expect(word(f.n, 63)).toBe(0);
  });
  it("keeps builder2 explicitly separate and does not enter work for a commanded pending0 Mule", () => {
    const f = fixture();
    f.n[120] = 7;
    expect(stepMuleMaterialWork(f.n, f.c)).toBe(false);
    f.n[95] = 2;
    expect(() => stepMuleMaterialWork(f.n, f.c)).toThrow(/builder/);
    expect(f.trace).toEqual([]);
  });
  it("remote material queries skip center, reject reserved corpses and use a final tie draw only on candidates", () => {
    const f = fixture();
    f.n[97] = 0;
    f.c.cell = () => [];
    expect(queryMuleMaterial(f.n, f.c, true)).toBeNull();
    expect(f.rng.draws).toBe(4);
    const g = fixture();
    put(g.corpse, 7, 8448);
    g.corpse[96] = 32;
    g.c.cell = (cell) =>
      cell === worldCell(8448, 8192) ? [{ kind: 1, index: 1 }] : [];
    expect(queryMuleMaterial(g.n, g.c, true)).toBeNull();
    expect(g.rng.draws).toBe(4);
    g.corpse[96] = 0;
    expect(queryMuleMaterial(g.n, g.c, true)).toEqual({ kind: 1, index: 1 });
    expect(g.rng.draws).toBe(9);
  });
});
describe("Mule9C attachment", () => {
  it("copies signed velocity/acceleration, offsets physical pose and relinks exactly once", () => {
    const f = fixture();
    put(f.n, 45, 4096);
    put(f.n, 47, -2048);
    put(f.n, 49, 80);
    put(f.n, 51, 12);
    put(f.n, 53, -13);
    put(f.n, 55, 14);
    put(f.n, 65, -15);
    put32(f.n, 39, 1000);
    const old = point(f.effect),
      moves: number[][] = [];
    attachMuleMaterialPose(f.effect, f.n, {
      terrain: f.terrain,
      frame: 0,
      scrape: () => {
        throw Error("unexpected");
      },
      relocate: (_n, a, b) => moves.push([a, b]),
    });
    expect(point(f.effect)).toEqual([7936, 8320]);
    expect(word(f.effect, 39)).toBe(990);
    expect(f.effect.slice(45, 57)).toEqual(f.n.slice(45, 57));
    expect(word(f.effect, 65)).toBe(-15);
    expect(moves).toEqual([[worldCell(...old), worldCell(7936, 8320)]]);
  });
  it("clamps to terrain and uses actual carried-slot parity for the required smoke factory", () => {
    const f = fixture();
    f.terrain.bytes[worldCell(8192, 8192) * 14 + 5] = 3;
    put(f.n, 45, 1);
    put(f.n, 61, 777);
    put(f.n, 59, 300);
    put32(f.n, 39, -1);
    const requests: unknown[] = [];
    attachMuleMaterialPose(f.effect, f.n, {
      terrain: f.terrain,
      frame: 0,
      scrape: (r) => requests.push(r),
      relocate: () => {},
    });
    expect(word(f.effect, 39)).toBe(0);
    expect(requests).toEqual([
      {
        code: 6,
        position: [8192, 8192],
        height: 0,
        angles: [0, 44, 388],
        owner: 0,
        parameter: 0,
        delay: 8,
      },
    ]);
  });
  it("suppresses spatial work only for actual carried22bit20", () => {
    const f = fixture();
    f.effect[22] = 32;
    put(f.n, 45, 5000);
    let moves = 0;
    attachMuleMaterialPose(f.effect, f.n, {
      terrain: f.terrain,
      frame: 0,
      scrape: () => {},
      relocate: () => moves++,
    });
    expect(moves).toBe(0);
  });
});
describe("43130 material query admission", () => {
  it("distinguishes completed delivery10 from enabled new-work30 and preserves first ties", () => {
    const f = fixture(),
      w = createCampaign(f.pack, "hauling-query");
    w.creatureNative[0] = f.n;
    w.players[0].raw[0x4a1] = 0;
    w.players[0].raw[1] = 0;
    w.players[0].raw[0x6e5] = 0;
    w.buildingNative[1] = f.recycler;
    put(f.recycler, 15, 1);
    f.recycler[49] = 65;
    expect(
      campaignCreatureServiceBuilding(w, 0, {
        selectorMask: 16,
        requiredFlags: 0x10,
      }),
    ).toBe(1);
    expect(
      campaignCreatureServiceBuilding(w, 0, {
        selectorMask: 16,
        requiredFlags: 0x30,
      }),
    ).toBeNull();
    f.recycler[49] = 1;
    w.buildingNative[2] = f.recycler.slice();
    put(w.buildingNative[2], 15, 2);
    expect(
      campaignCreatureServiceBuilding(w, 0, {
        selectorMask: 16,
        requiredFlags: 0x30,
      }),
    ).toBe(1);
  });
});
