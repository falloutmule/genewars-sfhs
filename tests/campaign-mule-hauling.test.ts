import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { planBotanistPlantCreation } from "../src/sim/mechanics/botanist";
import {
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
} from "../src/sim/campaign/engineer-adapter";
import { damageCampaignMule } from "../src/sim/campaign/mule-damage-adapter";
import { setNativeBuildingFootprint } from "../src/sim/mechanics/building-damage";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { classifyCampaignHumanMuleTarget } from "../src/sim/campaign/human-creature-command-adapter";
import {
  synchronizeCampaignLinks,
  campaignQueryEntities,
} from "../src/sim/campaign/entity-view";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { i16, put16 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import { makeCampaignMuleMaterialServices } from "../src/sim/campaign/mule-adapter";
import { pickUpMuleMaterial } from "../src/sim/mechanics/mule-hauling";

/**Prebuilt/powered synthetic Recycler isolates ordinary source material work.
 * Artwork and priors are synthetic; this does not accept a campaign mission. */
function fixture() {
  const pack = campaignFixture(),
    sha = "0".repeat(64),
    frame = structuredClone(pack.assets.TEST.frames![0]);
  pack.assets.MULE = structuredClone(pack.assets.MULE);
  pack.assets.EFF = structuredClone(pack.assets.EFF);
  pack.assets.RECYCLE_TEST = {
    ...structuredClone(pack.assets.TEST),
    frames: Array.from({ length: 6 }, () => ({
      ...structuredClone(frame),
      rawFlags: [0, 0, 0],
      sourceSize: [8, 8],
    })),
    animations: Array.from({ length: 5 }, () => ({
      first: 0,
      last: 5,
      rawTrailingWord: 6,
    })),
  };
  pack.buildingRules = {
    schemaVersion: 1,
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      path: `SYNTHETIC/${selector}.ANB`,
      assetKey: selector === 4 ? "RECYCLE_TEST" : "TEST",
    })).filter((r) => r.selector !== 9),
    unsupportedSelectors: [9],
    upkeep: Array(14).fill(1),
    processingFrontOffset: [-256, 0],
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.rules!.tables.buildingFootprints[4] = 2;
  const offsets: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] = [
    [0, 0],
    [256, 0],
    [-256, 0],
    [0, 256],
    [0, -256],
    [256, 256],
    [-256, 256],
    [256, -256],
    [-256, -256],
  ];
  pack.creatureCommandRules = {
    schemaVersion: 1,
    corpseDepositOffset: [-256, 0],
    footprintSearchOffsets: offsets,
    provenance: {
      executableSha256: sha,
      originalExecution: false,
      corpseDepositOffset: {
        object: 3,
        objectOffset: 0x457c,
        bytes: 4,
        sha256: sha,
      },
      footprintSearchOffsets: {
        object: 3,
        orderOffset: 0x60b8,
        orderBytes: 9,
        indexedBase: 0x4564,
        joinedBytes: 36,
        orderSha256: sha,
        sha256: sha,
      },
    },
  };
  const eff = pack.assets.EFF;
  while (eff.animations!.length < 71)
    eff.animations!.push({ first: 0, last: 1, rawTrailingWord: 2 });
  for (const [code, count] of [
    [6, 13],
    [8, 13],
    [32, 10],
    [44, 9],
    [60, 6],
    [61, 9],
    [67, 1],
  ] as const) {
    const first = eff.frames!.length;
    for (let i = 0; i < count; i++)
      eff.frames!.push({ ...structuredClone(frame), rawFlags: [0, 0, 0] });
    eff.animations![code] = {
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    };
  }
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 67 || code === 68 ? 5 : 0,
      gravity: code === 67 || code === 68,
      priority: 1,
      childCode: null,
      movable: code === 67 || code === 68,
      waterResponse: code === 67 || code === 68,
    })),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.ecologyRules!.corpseFriction = Array(8).fill(512);
  pack.ecologyRules!.muleCombat = {
    queryRadius: 512,
    attack: 1,
    defense: 1,
    disposition: 0,
    foodWeights: [1, 1, 1],
    attackChannel: 41,
  };
  const w = createCampaign(pack, "synthetic-campaign-hauling");
  enterCampaign(w, pack);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase, JSON.stringify(w.notices)).toBe("active");
  const services = {
      effectOptions: () => ({
        gravity: 512,
        obstacleAt: () => false,
        destructionObstacle: () => null,
        cleanupReferences: cleanupCampaignReferences,
      }),
    },
    buildingPoint: [number, number] = [10240, 10240];
  setNativeBuildingFootprint(
    w.terrain,
    buildingPoint,
    2,
    pack.rules!.tables.terrainBorder,
  );
  const building = createStagedCampaignEngineerBuilding(w, pack, services, {
    code: 44,
    owner: 0,
    selector: 4,
    point: buildingPoint,
    height: groundHeight(w.terrain, ...buildingPoint),
  });
  expect(building).not.toBeNull();
  expect(
    progressCampaignEngineerBuilding(
      w,
      pack,
      building!.buildingSlot,
      80,
      services,
    ).completed,
  ).toBe(true);
  const bn = w.buildingNative[building!.buildingSlot];
  put16(bn as number[], 49, 5);
  put16(bn as number[], 61, 200);
  const completed = w.buildings.find((b) => b.slot === building!.buildingSlot)!;
  completed.energy = 200;
  //The prebuilt fixture supplies the same powered view as its native flag;
  //ordinary completion alone does not imply a delivered power packet.
  w.economy.buildings.push({
    ...completed,
    slot: completed.slot % 64,
    disabled: false,
    capacitySuppressed: false,
    hqUpgradeSuppressed: false,
    powered: true,
    extraDrain: 0,
    depleted: false,
    storedGoop: 0,
    specialPowerDelivery: false,
  });
  const position: [number, number] = [9344, 10240],
    made = initializeMuleNative(
      w.creatureNative[0],
      w.rng,
      { slot: 0, owner: 0, position, quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
  if (!made.ok) throw Error(made.reason);
  const native = made.value.native;
  native[94] = 8;
  w.rng = made.value.rng;
  w.creatureNative[0] = native;
  w.ecology.mules.push({ id: "source:0:0", index: 0, native, pending: [] });
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...position));
  put16(w.missionPrefix, 0x3550, w.ecology.mules.length);
  const p = w.ecology.plants[0],
    plan = planBotanistPlantCreation(
      p.native,
      0,
      4,
      0,
      [9472, 10240],
      w.terrain,
    );
  p.native.splice(0, p.native.length, ...plan.native);
  p.native[48] = 7;
  Object.assign(p, {
    active: true,
    owner: 4,
    position: plan.position,
    selector: 0,
    growth: 4,
    flags: 4,
    plantFlags: 0,
    updateCounter: 0,
    retirement: 7,
    animation: 0,
    frame: 0,
    shade: p.native[23],
    height: plan.height,
  });
  w.ecology.plantCount++;
  put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
  insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
  synchronizeCampaignLinks(w);
  return { w, pack, buildingSlot: building!.buildingSlot };
}

describe("ordinary campaign Mule material hauling", () => {
  let initial: ReturnType<typeof fixture>;
  beforeAll(() => {
    initial = fixture();
  });
  it("cleans up a real carried plant before acquiring new food, through save and replay", () => {
    const { w, pack } = structuredClone(initial),
      mule = w.ecology.mules.find((m) => m.index === 0)!,
      n = mule.native,
      material = makeCampaignMuleMaterialServices(pack, () => w, {
        gravity: 512,
        obstacleAt: () => false,
        destructionObstacle: () => null,
        cleanupReferences: cleanupCampaignReferences,
      })(w.ecology, w.terrain, w.rng, mule);
    expect(pickUpMuleMaterial(n, { kind: 2, index: 0 }, material)).toBe(true);
    const carrier = n[91]! | (n[92]! << 8),
      p = w.ecology.plants[1],
      made = planBotanistPlantCreation(
        p.native,
        1,
        4,
        0,
        [9600, 10240],
        w.terrain,
      );
    Object.assign(p, structuredClone(w.ecology.plants[0]), {
      id: "source:1:1",
      index: 1,
      native: made.native,
      position: made.position,
      plantFlags: 0,
      height: made.height,
    });
    p.native[48] = 7;
    p.native[46] = 0;
    put16(p.native as number[], 44, 10);
    p.growth = 10;
    w.ecology.plantCount++;
    put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
    insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
    synchronizeCampaignLinks(w);
    put16(n as number[], 104, 0);
    put16(n as number[], 108, 0);
    n[94] = 8;
    n[95] = 1;
    n[120] = 0;
    const replay = recordCampaign(w, null),
      resumed = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    for (
      let tick = 0;
      tick < 4 && (w.creatureNative[0][96]! & 2) !== 0;
      tick++
    ) {
      stepCampaign(w, pack);
      stepCampaign(resumed, pack);
    }
    expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
    expect(w.creatureNative[0][96]! & 2).toBe(0);
    expect([w.creatureNative[0][85], w.creatureNative[0][87]]).toEqual([1, 2]);
    expect(w.powerEffects.slots[carrier].nativePrior![69]).toBe(68);
    expect(() => validateSpatial(w.spatial)).not.toThrow();
    expect(checksum(resumed)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
  it("consumes a carried plant in shared state13 work and preserves save/replay and pool aliases", () => {
    const { w, pack, buildingSlot } = structuredClone(initial),
      mule = w.ecology.mules.find((m) => m.index === 0)!,
      n = mule.native,
      material = makeCampaignMuleMaterialServices(pack, () => w, {
        gravity: 512,
        obstacleAt: () => false,
        destructionObstacle: () => null,
        cleanupReferences: cleanupCampaignReferences,
      })(w.ecology, w.terrain, w.rng, mule);
    expect(pickUpMuleMaterial(n, { kind: 2, index: 0 }, material)).toBe(true);
    expect(w.spatial.nodes["source:1:0"]).toBeUndefined();
    put16(n as number[], 85, buildingSlot);
    n[87] = 4;
    n[94] = 13;
    n[95] = 2;
    put16(n as number[], 108, 0);
    const bn = w.buildingNative[buildingSlot];
    put16(bn as number[], 43, 20);
    w.buildings.find((b) => b.slot === buildingSlot)!.health = 20;
    const replay = recordCampaign(w, null),
      resumed = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    const before = i16(bn as number[], 43),
      amount = w.ecology.plants[0].native[48]! * 8;
    for (let tick = 0; tick < 4 && w.ecology.plants[0].active; tick++) {
      stepCampaign(w, pack);
      stepCampaign(resumed, pack);
    }
    expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
    expect(i16(w.buildingNative[buildingSlot] as number[], 43)).toBe(
      before + amount,
    );
    expect(w.ecology.plants[0].active).toBe(false);
    expect(w.ecology.plantCount).toBe(0);
    expect(w.creatureNative[0][93]).toBe(0);
    expect(w.creatureNative[0][96]! & 2).toBe(0);
    expect(w.creatureNative[0]).toEqual(
      w.ecology.mules.find((m) => m.index === 0)!.native,
    );
    expect(() => validateSpatial(w.spatial)).not.toThrow();
    expect(checksum(resumed)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
  it("cuts and carries a real plant to the Recycler, deposits GOOP and continues a carrying save/replay", () => {
    const { w, pack, buildingSlot } = structuredClone(initial),
      replay = recordCampaign(w, null),
      target = { kind: 2 as const, index: 0 };
    const mode = classifyCampaignHumanMuleTarget(
      w,
      0,
      target,
      { force: false, bypassVisibility: false },
      pack,
    );
    expect(mode).toBe(5);
    const command = {
      type: "target-mule" as const,
      muleIndex: 0,
      target,
      mode,
    };
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    let resumed: CampaignWorld | null = null,
      carryingFrame: number | null = null;
    const states = new Set<number>(),
      effects = new Set<number>(),
      trace: unknown[] = [];
    let prior = "";
    for (let i = 0; i < 600; i++) {
      stepCampaign(w, pack);
      if (resumed) stepCampaign(resumed, pack);
      expect(w.phase, JSON.stringify(w.notices.slice(-6))).toBe("active");
      states.add(w.creatureNative[0][94]!);
      for (const e of w.powerEffects.slots)
        if (e.occupied) effects.add(e.nativePrior![69]!);
      const mn = w.creatureNative[0],
        pn = w.ecology.plants[0].native,
        signature = JSON.stringify([
          mn[94],
          mn[95],
          mn[96],
          mn[97],
          pn[46],
          pn[6],
          w.buildingNative[buildingSlot][51],
        ]);
      if (signature !== prior) {
        if (trace.length < 30)
          trace.push({
            frame: w.frame,
            state: JSON.parse(signature),
            mule: [i16(mn as number[], 7), i16(mn as number[], 9)],
            goal: [i16(mn as number[], 11), i16(mn as number[], 13)],
            plant: [i16(pn as number[], 7), i16(pn as number[], 9)],
            energy: i16(w.buildingNative[buildingSlot] as number[], 61),
          });
        prior = signature;
      }
      if (
        !resumed &&
        w.creatureNative[0][96]! & 2 &&
        w.creatureNative[0][93] === 5
      ) {
        carryingFrame = w.frame;
        expect(w.spatial.nodes["source:1:0"]).toBeUndefined();
        resumed = loadCampaign(
          saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
          w.contentHash,
        ).world;
      }
      if (w.players[0].goop > 0) break;
    }
    expect(states.has(11)).toBe(true);
    expect(effects.has(67)).toBe(true);
    expect(effects.has(68)).toBe(true);
    expect(carryingFrame).not.toBeNull();
    expect(resumed).not.toBeNull();
    expect(
      w.players[0].goop,
      JSON.stringify({
        trace,
        building: w.buildingNative[buildingSlot],
        plant: w.ecology.plants[0],
        front: campaignQueryEntities(w, [[9984, 10240]]).map((e) => ({
          kind: e.kind,
          index: e.index,
        })),
        economy: w.economy.buildings,
      }),
    ).toBeGreaterThan(0);
    expect(w.ecology.plants[0].active).toBe(false);
    expect(w.buildingNative[buildingSlot][51]).toBe(0);
    expect(w.ecology.plantCount).toBe(0);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(() => validateSpatial(w.spatial)).not.toThrow();
    expect(checksum(resumed)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
    expect(i16(w.creatureNative[0] as number[], 15)).toBe(0);
  }, 60000);
  for (const amount of [1, 1000])
    it(`releases the actual carried plant on damage${amount} after JSON continuation`, () => {
      const { w, pack } = structuredClone(initial),
        target = { kind: 2 as const, index: 0 };
      expect(
        queueCampaign(w, { type: "target-mule", muleIndex: 0, target, mode: 5 })
          .ok,
      ).toBe(true);
      for (let i = 0; i < 200 && !(w.creatureNative[0][96]! & 2); i++)
        stepCampaign(w, pack);
      expect(w.phase, JSON.stringify(w.notices)).toBe("active");
      expect(w.creatureNative[0][96]! & 2).toBe(2);
      const slot = i16(w.creatureNative[0] as number[], 91),
        health = i16(w.creatureNative[0] as number[], 106),
        loaded = loadCampaign(
          saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
          w.contentHash,
        ).world;
      damageCampaignMule(w, pack, 0, amount, null);
      damageCampaignMule(loaded, pack, 0, amount, null);
      expect(w.creatureNative[0][96]! & 2).toBe(0);
      expect(w.powerEffects.slots[slot].nativePrior![69]).toBe(68);
      expect(i16(w.creatureNative[0] as number[], 106)).toBeLessThan(health);
      expect(w.creatureNative[0][94]! >= 24).toBe(amount === 1000);
      expect(checksum(loaded)).toBe(checksum(w));
      expect(w.ecology.plants[0].active).toBe(true);
      expect(w.spatial.nodes["source:1:0"]).toBeUndefined();
      for (let i = 0; i < 4; i++) {
        stepCampaign(w, pack);
        stepCampaign(loaded, pack);
      }
      expect(w.phase, JSON.stringify(w.notices)).toBe("active");
      expect(checksum(loaded)).toBe(checksum(w));
      //A surviving Mule can resume ordinary work and legitimately pick it up
      //again; either outcome must retain the actual carrier/spatial ownership.
      if (w.ecology.plants[0].native[46]! & 16) {
        const current = w.creatureNative[0],
          carried =
            w.powerEffects.slots[i16(current as number[], 91)].nativePrior!;
        expect(current[96]! & 2).toBe(2);
        expect(current[93]).toBe(5);
        expect(carried[69]).toBe(67);
        expect([carried[73], i16(carried as number[], 71)]).toEqual([2, 0]);
        expect(w.spatial.nodes["source:1:0"]).toBeUndefined();
      } else expect(w.spatial.nodes["source:1:0"]).toBeDefined();
    });
});
