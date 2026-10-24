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
import {
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
} from "../src/sim/campaign/engineer-adapter";
import { setNativeBuildingFootprint } from "../src/sim/mechanics/building-damage";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { classifyCampaignHumanMuleTarget } from "../src/sim/campaign/human-creature-command-adapter";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { i16, u16, u32, put16, put32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/**Prebuilt/powered synthetic Recycler isolates ordinary source corpse material work.
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
  const w = createCampaign(pack, "synthetic-campaign-corpse-hauling");
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
  //This initial prebuilt/powered fixture includes the matching economy view.
  //Construction completion itself does not deliver a real power packet.
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
  //Synthetic admitted corpse precondition: death mechanics are tested elsewhere.
  const corpsePosition: [number, number] = [9472, 10240],
    dead = initializeMuleNative(
      w.creatureNative[1],
      w.rng,
      { slot: 1, owner: 4, position: corpsePosition, quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
  if (!dead.ok) throw Error(dead.reason);
  const corpse = dead.value.native;
  w.rng = dead.value.rng;
  corpse[94] = 25;
  corpse[25] = 18;
  corpse[26] = corpse[27] = corpse[28] = corpse[29] = corpse[30] = 0;
  corpse[96] = 8;
  corpse[97] = 0;
  put16(corpse as number[], 21, 0x280);
  put16(corpse as number[], 43, 0);
  put16(corpse as number[], 63, -1);
  put16(corpse as number[], 73, 0x220);
  put16(corpse as number[], 104, 100);
  put16(corpse as number[], 106, 0);
  put16(corpse as number[], 108, 32767);
  for (const at of [45, 47, 49, 51, 53, 55, 61])
    put16(corpse as number[], at, 0);
  const h = groundHeight(w.terrain, ...corpsePosition);
  put32(corpse as number[], 17, h);
  put32(corpse as number[], 39, h);
  w.creatureNative[1] = corpse;
  w.ecology.mules.push({
    id: "source:0:1",
    index: 1,
    native: corpse,
    pending: [],
  });
  insertSpatial(
    w.spatial,
    w.terrain,
    "source:0:1",
    worldCell(...corpsePosition),
  );
  put16(w.missionPrefix, 0x3550, 2);
  synchronizeCampaignLinks(w);
  return { w, pack, buildingSlot: building!.buildingSlot };
}

describe("ordinary campaign Mule corpse hauling", () => {
  let initial: ReturnType<typeof fixture>;
  beforeAll(() => {
    initial = fixture();
  });
  it("targets a real corpse, preserves its attached callback, unloads and recycles through save/replay", () => {
    const { w, pack, buildingSlot } = structuredClone(initial),
      replay = recordCampaign(w, null),
      target = { kind: 1 as const, index: 1 };
    const mode = classifyCampaignHumanMuleTarget(
      w,
      0,
      target,
      { force: false, bypassVisibility: false },
      pack,
    );
    expect(mode).toBe(4);
    expect(w.players[0].raw[0x604]).toBe(1);
    const command = {
      type: "target-mule" as const,
      muleIndex: 0,
      target,
      mode,
    };
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    let resumed: CampaignWorld | null = null,
      carryingFrame: number | null = null,
      attachedTicks = 0,
      carriedTimer: number | null = null,
      carriedReserve: number | null = null,
      dropped = false,
      consumed = false,
      pendingPayload: number | null = null;
    const poses = new Set<string>(),
      trace: unknown[] = [];
    let prior = "";
    const initialGoop = w.players[0].goop,
      initialResearch = u32(w.players[0].raw, 0x61a + 4 * 4);
    for (let i = 0; i < 600; i++) {
      const wasCarried = !!(w.creatureNative[1][97]! & 1);
      stepCampaign(w, pack);
      if (resumed) stepCampaign(resumed, pack);
      expect(w.phase, JSON.stringify(w.notices.slice(-6))).toBe("active");
      const mn = w.creatureNative[0],
        cn = w.creatureNative[1],
        attached = !!(cn[97]! & 1) && cn[6] === 1;
      const signature = JSON.stringify([
        mn[94],
        mn[95],
        mn[96],
        mn[93],
        cn[94],
        cn[97],
        cn[6],
        w.buildingNative[buildingSlot][51],
      ]);
      if (signature !== prior) {
        if (trace.length < 40)
          trace.push({
            frame: w.frame,
            state: JSON.parse(signature),
            mule: [i16(mn as number[], 7), i16(mn as number[], 9)],
            goal: [i16(mn as number[], 11), i16(mn as number[], 13)],
            corpse: [i16(cn as number[], 7), i16(cn as number[], 9)],
            timer: i16(cn as number[], 108),
            reserve: i16(cn as number[], 104),
            energy: i16(w.buildingNative[buildingSlot] as number[], 61),
          });
        prior = signature;
      }
      if (attached) {
        attachedTicks++;
        expect(mn[96]! & 2).toBe(2);
        expect(mn[93]).toBe(1);
        expect(i16(mn as number[], 91)).toBe(1);
        expect(cn[94]).toBe(25);
        expect(cn[25]).toBe(18);
        expect(w.spatial.nodes["source:0:1"].cell).toBe(
          worldCell(i16(cn as number[], 7), i16(cn as number[], 9)),
        );
        poses.add(`${i16(cn as number[], 7)},${i16(cn as number[], 9)}`);
        if (carriedTimer === null) {
          carriedTimer = i16(cn as number[], 108);
          carriedReserve = i16(cn as number[], 104);
        } else {
          expect(i16(cn as number[], 108)).toBe(carriedTimer);
          expect(i16(cn as number[], 104)).toBe(carriedReserve);
        }
        if (!resumed) {
          carryingFrame = w.frame;
          resumed = loadCampaign(
            saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
            w.contentHash,
          ).world;
        }
      }
      if (wasCarried && !attached) {
        dropped = true;
        expect(mn[96]! & 2).toBe(0);
        expect(mn[93]).toBe(0);
        if (cn[6] === 1) {
          expect(w.spatial.nodes["source:0:1"]).toBeDefined();
          expect(cn[97]! & 1).toBe(0);
        }
      }
      if (cn[6] === 0) {
        consumed = true;
        if (w.buildingNative[buildingSlot][51])
          pendingPayload = w.buildingNative[buildingSlot][51]!;
        expect(w.spatial.nodes["source:0:1"]).toBeUndefined();
        expect(u16(w.missionPrefix, 0x3550)).toBe(1);
        for (const at of [77, 80, 85, 88, 91])
          expect(mn[at + 2] === 1 && i16(mn as number[], at) === 1).toBe(false);
      }
      if (w.players[0].goop > initialGoop) break;
    }
    expect(carryingFrame, JSON.stringify(trace)).not.toBeNull();
    expect(attachedTicks).toBeGreaterThan(2);
    expect(poses.size).toBeGreaterThan(1);
    expect(dropped, JSON.stringify(trace)).toBe(true);
    expect(
      consumed,
      JSON.stringify({
        trace,
        corpse: w.creatureNative[1],
        ecology: w.ecology.mules.find((m) => m.index === 1)?.native,
        building: w.buildingNative[buildingSlot],
        spatial: w.spatial.nodes["source:0:1"],
        frontHead: w.spatial.heads[40 * 128 + 39],
        capacity: u32(w.players[0].raw, 0x5e6),
      }),
    ).toBe(true);
    expect(pendingPayload).toBe(((carriedReserve! & 255) * 4 + 50) & 255);
    expect(w.players[0].goop, JSON.stringify(trace)).toBe(
      initialGoop + pendingPayload!,
    );
    expect(u32(w.players[0].raw, 0x61a + 4 * 4)).toBe(initialResearch + 32);
    expect(w.creatureNative[1][6]).toBe(0);
    expect(w.buildingNative[buildingSlot][51]).toBe(0);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(() => validateSpatial(w.spatial)).not.toThrow();
    expect(resumed).not.toBeNull();
    expect(checksum(resumed)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  }, 60000);
});
