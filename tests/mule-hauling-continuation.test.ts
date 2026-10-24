import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { stepOwnedMule, type MuleContext } from "../src/sim/mechanics/mule";
import type { EcologyState } from "../src/sim/mechanics/ecology";
import {
  idleMuleMaterial,
  queryMuleMaterial,
  stepMuleMaterialWork,
  haulingPut as put,
  haulingWord as word,
  type HaulingNative as Native,
  type MuleHaulingContext,
} from "../src/sim/mechanics/mule-hauling";
import { worldCell } from "../src/sim/mechanics/terrain";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import {
  loadCampaign,
  recordCampaign,
  replayCampaign,
  saveCampaign,
  sealCampaignReplay,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import type { GeneRng } from "../src/sim/mechanics/random";

const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
function native(kind: 1 | 2 | 4, index: number) {
  const n: Native = Array({ 1: 124, 2: 49, 4: 67 }[kind]).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  put(n, 15, index);
  put(n, 7, 8192);
  put(n, 9, 8192);
  return n;
}

/**Synthetic pending1/task5 precondition isolates the work/common-choice join.
 * It does not reproduce the private campaign or assert mission acceptance. */
function fixture() {
  const pack = campaignFixture(),
    terrain = { bytes: Array(229376).fill(0), revision: 0 },
    n = native(1, 0),
    plant = native(2, 1),
    recycler = native(4, 4),
    rng: GeneRng = { seed: 5428, draws: 0, ring: 31 },
    trace: string[] = [];
  for (let c = 0; c < 16384; c++) {
    put(terrain.bytes, c * 14 + 2, 1024);
    terrain.bytes[c * 14 + 5] = 2;
  }
  pack.ecologyRules!.corpseFriction = Array(8).fill(512);
  n[24] = 0;
  n[94] = 8;
  n[95] = 1;
  n[96] = 8;
  n[97] = 128;
  n[118] = 100;
  n[120] = 5;
  n[122] = 4;
  n[123] = 255;
  put(n, 21, 0x280);
  put(n, 43, 50);
  put(n, 59, 512);
  put(n, 73, 0x100);
  put(n, 98, 100);
  put(n, 100, 60);
  put(n, 102, 9085);
  put(n, 104, 100);
  put(n, 106, 60);
  put(n, 110, 9000);
  put(n, 112, 8192);
  put(n, 114, 12000);
  put(n, 116, 8192);
  put32(n, 17, 2048);
  put32(n, 39, 2048);
  recycler[45] = 4;
  recycler[49] = 1;
  put(recycler, 43, 100);
  put(plant, 44, 5);
  const mule = { id: "source:0:0" as const, index: 0, native: n, pending: [] },
    state: EcologyState = {
      schemaVersion: 1,
      sourceSha256: "synthetic",
      ticks: 0,
      plantCursor: 0,
      plantCount: 0,
      ownerPlantCounts: [0, 0, 0, 0],
      plants: [],
      mules: [mule],
      otherEntities: [],
      pending: [],
      unsupported: [],
      plantOrder: {},
    };
  let afterIdleDraws = -1,
    enteredMaterial = false;
  const context: MuleContext = {
    terrain,
    tables: pack.rules!.tables,
    rules: pack.ecologyRules!,
    frame: 1,
    gravity: 1024,
    water: 0,
    climate: 106,
    bounce: Array(8).fill(0),
    profile: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
    bonesProfile: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
    obstacleAt: (point) => {
      if (enteredMaterial) trace.push(`accept:${point.join(",")}`);
      return false;
    },
    cellOrder: () => [mule.id],
    owned: {
      selectedPlayer: 0,
      globalFlags: 0,
      allianceMasks: [1, 2, 4, 8],
      buildings: [],
      operators: [],
    },
  };
  const makeMaterial = (
    current: Native,
    map = terrain,
    random = rng,
  ): MuleHaulingContext => {
    const c: MuleHaulingContext = {
      terrain: map,
      rng: random,
      tables: pack.rules!.tables,
      queryRadius: 512,
      resolve: (r) => (r.kind === 2 ? plant : recycler),
      cell: () => [],
      serviceBuilding: (mask, flags) => {
        enteredMaterial = true;
        trace.push(`building:${mask}:${flags}`);
        return null;
      },
      storageFull: () => false,
      maximumBuildingHealth: () => 100,
      pointAccepted: () => true,
      footprintBuilding: () => null,
      target: () => true,
      detach: () => {
        current[96] = current[96]! & 253;
        current[93] = 0;
      },
      release: () => {},
      attach: () => {},
      occupied: () => false,
      idle: (delay) => {
        trace.push(`idle:${delay}`);
        idleMuleMaterial(current, delay, c);
        afterIdleDraws = random.draws;
      },
      speed: () => 333,
      ignite: () => {},
      unlinkPlant: () => {},
      createPlantCarrier: () => null,
      audio: () => {},
    };
    return c;
  };
  context.material = (_state, map, random, self) =>
    makeMaterial(self.native, map, random);
  return {
    pack,
    terrain,
    n,
    plant,
    recycler,
    rng,
    state,
    context,
    makeMaterial,
    trace,
    idleDraws: () => afterIdleDraws,
  };
}

describe("Mule material work/common-choice source join", () => {
  it("returns DL0 after the work wait while retaining a real task5 pending byte", () => {
    const f = fixture();
    expect(stepMuleMaterialWork(f.n, f.makeMaterial(f.n))).toBe(false);
    expect(f.rng.draws).toBe(1);
    expect([f.n[94], f.n[95], f.n[120]]).toEqual([8, 1, 5]);
    expect(word(f.n, 108)).toBeGreaterThanOrEqual(10);
    expect(word(f.n, 108)).toBeLessThan(30);
    f.n[120] = 0;
    expect(stepMuleMaterialWork(f.n, f.makeMaterial(f.n))).toBe(false);
    expect(f.n[95]).toBe(0);
  });

  it("distinguishes cutting progress/success from an invalid cutting target", () => {
    const f = fixture(),
      c = f.makeMaterial(f.n);
    f.n[96] = 64;
    put(f.n, 85, 1);
    f.n[87] = 2;
    expect(stepMuleMaterialWork(f.n, c)).toBe(true);
    put(f.n, 73, 0x200);
    expect(stepMuleMaterialWork(f.n, c)).toBe(true);
    expect([f.n[94], f.plant[46]]).toEqual([11, 4]);
    f.n[94] = 8;
    f.n[96] = 64;
    f.plant[46] = 8;
    expect(stepMuleMaterialWork(f.n, c)).toBe(false);
    expect(f.n[96]! & 64).toBe(0);
    expect(f.rng.draws).toBe(1);
  });

  it("retains the zero-score boundary exclusion before entering the fallback", () => {
    const f = fixture(),
      c = f.makeMaterial(f.n),
      selected: unknown[] = [];
    put(f.plant, 9, 7168);
    c.cell = (cell) =>
      cell === worldCell(8192, 7168) ? [{ kind: 2, index: 1 }] : [];
    c.serviceBuilding = (mask) => (mask === 16 ? f.recycler : null);
    c.target = (ref) => {
      selected.push(ref);
      return true;
    };
    expect(queryMuleMaterial(f.n, c, false, true)).toBeNull();
    expect(stepMuleMaterialWork(f.n, c)).toBe(false);
    expect(selected).toEqual([]);
    expect(f.n[95]).toBe(1);
  });

  it("returns DL0 when capacity excludes the completed Recycler from a new search", () => {
    const f = fixture(),
      c = f.makeMaterial(f.n);
    c.serviceBuilding = (mask) => (mask === 16 ? f.recycler : null);
    c.storageFull = () => true;
    c.cell = () => {
      throw Error("Full storage must precede material queries");
    };
    expect(stepMuleMaterialWork(f.n, c)).toBe(false);
    expect(f.rng.draws).toBe(1);
  });

  it("joins the remembered-point decision after failed work without another idle draw", () => {
    const f = fixture(),
      result = stepOwnedMule(f.state, 0, f.rng, f.context),
      n = f.state.mules[0].native;
    expect(result.reason).toBeNull();
    expect([word(n, 11), word(n, 13)]).toEqual([9000, 8192]);
    expect(word(n, 73) & 0x10).toBe(0x10);
    expect(word(n, 108)).toBe(32766);
    expect(f.trace.filter((s) => s.startsWith("idle:"))).toHaveLength(1);
    expect(f.trace.at(-1)).toBe("accept:9000,8192");
    expect(f.rng.draws).toBe(f.idleDraws());
    expect(result.events.some((e) => e.kind === "mule-target")).toBe(true);
  });

  it("continues through all16 rejected candidates and the real anchor resolver", () => {
    const f = fixture();
    f.n[97] = 0;
    let calls = 0;
    f.context.obstacleAt = () => {
      if (f.idleDraws() < 0) return false;
      return ++calls <= 18;
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.context),
      n = f.state.mules[0].native;
    expect(r.reason).toBeNull();
    expect(calls).toBe(19);
    expect(f.rng.draws - f.idleDraws()).toBe(33);
    expect(word(n, 114)).toBeLessThan(12000);
    expect(word(n, 114)).toBeGreaterThan(8192);
    expect(word(n, 116)).toBe(8192);
    expect(word(n, 108)).toBeGreaterThanOrEqual(9);
    expect(word(n, 108)).toBeLessThan(29);
    expect(r.events.some((e) => e.kind === "mule-target")).toBe(false);
  });

  it("rolls back work afterimages, terrain and RNG when the late common query fails", () => {
    const f = fixture(),
      before = structuredClone({
        state: f.state,
        terrain: f.terrain,
        rng: f.rng,
      });
    f.context.material = (_state, map, random, self) => {
      const c = f.makeMaterial(self.native, map, random),
        idle = c.idle;
      c.idle = (delay) => {
        idle(delay);
        map.bytes[0] = 91;
        map.revision++;
      };
      return c;
    };
    f.context.obstacleAt = (at) => {
      if (at[0] === 9000) throw Error("Late source acceptance service failed");
      return false;
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.context);
    expect(r.committed).toBe(false);
    expect(r.reason).toContain("Late source acceptance");
    expect(r.events).toEqual([]);
    expect({ state: f.state, terrain: f.terrain, rng: f.rng }).toEqual(before);
  });
});

function campaignMaterialFixture() {
  const pack = campaignFixture();
  pack.ecologyRules!.corpseFriction = Array(8).fill(512);
  pack.ecologyRules!.muleCombat = {
    queryRadius: 512,
    attack: 1,
    defense: 1,
    disposition: 0,
    attackChannel: 41,
    foodWeights: [0, 0, 0],
  };
  const w = createCampaign(pack, "synthetic-material-continuation");
  enterCampaign(w, pack);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase).toBe("active");
  const made = initializeMuleNative(
    w.creatureNative[0],
    w.rng,
    { slot: 0, owner: 0, position: [11000, 11000], quality: 50 },
    { terrain: w.terrain, tables: pack.rules!.tables },
  );
  if (!made.ok) throw Error(made.reason);
  const n = made.value.native;
  //Only the initial pending-work precondition is arranged. No later writes.
  n[94] = 8;
  n[95] = 1;
  n[96] = 8;
  n[97] = 128;
  n[120] = 5;
  put(n, 73, 0x100);
  put(n, 108, 0);
  put(n, 110, 12024);
  put(n, 112, 11000);
  put(n, 114, 12024);
  put(n, 116, 11000);
  w.rng = made.value.rng;
  w.creatureNative[0] = n;
  w.ecology.mules.push({ id: "source:0:0", index: 0, native: n, pending: [] });
  put(w.missionPrefix, 0x3550, 1);
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(11000, 11000));
  synchronizeCampaignLinks(w);
  return { w, pack };
}

it("runs the join through normal campaign callbacks, JSON continuation and a full sealed replay", () => {
  const { w, pack } = campaignMaterialFixture(),
    replay = recordCampaign(w, null);
  let resumed: ReturnType<typeof loadCampaign>["world"] | null = null,
    joined = false;
  for (let i = 0; i < 24; i++) {
    stepCampaign(w, pack);
    if (resumed) stepCampaign(resumed, pack);
    expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
    if (!resumed && word(w.creatureNative[0], 73) & 0x10) {
      joined = true;
      expect([
        word(w.creatureNative[0], 11),
        word(w.creatureNative[0], 13),
      ]).toEqual([12024, 11000]);
      resumed = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    }
  }
  expect(joined).toBe(true);
  expect(word(w.creatureNative[0], 7)).toBeGreaterThan(11000);
  expect(checksum(resumed)).toBe(checksum(w));
  expect(
    checksum(
      replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
    ),
  ).toBe(checksum(w));
});

it("does not publish failed-work or common-choice changes when the host animation fails late", () => {
  const { w, pack } = campaignMaterialFixture();
  //The first callback is even phase. The next ordinary callback enters work.
  stepCampaign(w, pack);
  expect(w.frame & 1).toBe(1);
  const before = structuredClone({
      native: w.creatureNative[0],
      rng: w.rng,
      players: w.players,
      effects: w.powerEffects,
      spatial: w.spatial,
    }),
    action = ((((word(w.creatureNative[0], 57) >> 7) + 1) >> 1) + 1) & 7;
  pack.assets.MULE = structuredClone(pack.assets.MULE);
  pack.assets.MULE.animations![action] = {
    first: 0,
    last: 99,
    rawTrailingWord: 100,
  };
  stepCampaign(w, pack);
  expect(w.phase).toBe("blocked");
  expect(w.notices.at(-1)?.text).toContain("Missing original animation");
  expect(w.creatureNative[0]).toEqual(before.native);
  expect(w.ecology.mules[0].native).toEqual(before.native);
  expect(w.rng).toEqual(before.rng);
  expect(w.players).toEqual(before.players);
  expect(w.powerEffects).toEqual(before.effects);
  expect(w.spatial).toEqual(before.spatial);
});
