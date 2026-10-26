import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  campaignBuildingAvailable,
  enterCampaign,
  queueCampaign,
  stepCampaign,
  validateCampaignWorld,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
  campaignEngineerContext,
} from "../src/sim/campaign/engineer-adapter";
import {
  createNativeBuilding,
  progressNativeBuilding,
} from "../src/sim/mechanics/building-native";
import {
  reserveSite,
  readSiteReservation,
  worldCell,
} from "../src/sim/mechanics/terrain";
import { campaignBuildingAsset } from "../src/sim/campaign/building-startup-adapter";
import { damageCampaignBuilding } from "../src/sim/campaign/building-damage-adapter";
import { i16, u16, u32, put16 } from "../src/sim/campaign/bytes";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/** Source-shaped metadata and synthetic artwork/rates only. No original bytes. */
function fixture() {
  const pack = campaignFixture();
  pack.rules!.tables.buildingFootprints[4] = 2;
  pack.rules!.tables.constructionCosts[4] = 750;
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
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.assets.RECYCLE_TEST = {
    ...pack.assets.TEST,
    frames: Array.from({ length: 6 }, () => ({
      components: [],
      width: 1,
      height: 1,
      sourceSize: [8, 8],
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 5 }, () => ({
      first: 0,
      last: 5,
      rawTrailingWord: 6,
    })),
  };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 9 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: pack.assets.EFF.animations!.map((a, code) =>
      code === 44 ? { first: 0, last: 8, rawTrailingWord: 9 } : a,
    ),
  };
  const world = createCampaign(pack, "synthetic-engineer-recycling");
  enterCampaign(world, pack);
  for (let tick = 0; tick < 200; tick++) stepCampaign(world, pack);
  expect(world.phase).toBe("active");
  expect(world.notices.filter((n) => n.severity === "error")).toEqual([]);
  const services: CampaignSpecialistServices = {
    effectOptions: () => ({
      gravity: 512,
      obstacleAt: () => false,
      destructionObstacle: () => null,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  return { pack, world, services };
}
function step(
  w: CampaignWorld,
  pack: ReturnType<typeof campaignFixture>,
  count = 1,
) {
  for (let i = 0; i < count; i++) {
    stepCampaign(w, pack);
    expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
  }
}
describe("native Engineer selector4 Recycling Plant construction", () => {
  let start: ReturnType<typeof fixture>;
  beforeAll(() => {
    start = fixture();
  });
  it("publishes a newly constructed Vat economy binding before same-turn completion and replays its callback", () => {
    const pack = structuredClone(start.pack), w = structuredClone(start.world);
    pack.rules!.tables.buildingFootprints[13] = 1;
    pack.buildingRules!.resources.find(r => r.selector === 13)!.assetKey = "RECYCLE_TEST";
    const extractorAvailable = campaignBuildingAvailable(w,pack,11);
    const made = createStagedCampaignEngineerBuilding(w, pack, start.services, {
      code:44,owner:0,selector:13,point:[8960,8192],height:2048,
    });
    expect(made).not.toBeNull();
    const slot = made!.buildingSlot, n = w.buildingNative[slot];
    expect(w.economy.buildings.find(b => b.owner*64+b.slot === slot)?.selector).toBe(13);
    expect(campaignBuildingAvailable(w,pack,11)).toBe(extractorAvailable);
    progressCampaignEngineerBuilding(w,pack,slot,90,start.services);
    expect(w.buildings.find(b=>b.slot===slot)?.complete).toBe(true);
    expect(w.players[0].completed[13]).toBe(1);
    expect(u32(w.players[0].raw,0x5e6)).toBe(500);
    const before=saveCampaign(w,{paused:true,speed:1,accumulator:0}), restored=loadCampaign(before,w.contentHash);
    expect(saveCampaign(restored.world,restored.session)).toBe(before);
    expect(w.buildingNative[slot]).toBe(n);
    const recording=recordCampaign(w,null,true);
    step(w,pack,20);
    expect(checksum(replayCampaign(sealCampaignReplay(recording,w),pack,w.contentHash))).toBe(checksum(w));
    expect(w.economy.buildings.find(b=>b.owner*64+b.slot===slot)?.energy).toBe(i16(w.buildingNative[slot] as number[],61));
  });
  it("uses shared43E30 priors and441C0/43F60 completion without resetting retained counters", () => {
    const prior = start.world.buildingNative[0].slice();
    prior[30] = 79;
    prior[48] = 42;
    prior[63] = 13;
    const made = createNativeBuilding(prior, {
      slot: 0,
      owner: 0,
      selector: 4,
      position: [8960, 8192],
      ground: 2048,
      shade: 25,
    });
    if (!made.ok) throw Error(made.reason);
    expect(made.value[45]).toBe(4);
    expect([made.value[30], made.value[48], made.value[63]]).toEqual([
      79, 42, 13,
    ]);
    const done = progressNativeBuilding(made.value, {
      increment: 90,
      maximumHealth: 80,
      loading: false,
    });
    if (!done.ok) throw Error(done.reason);
    expect(done.value).toMatchObject({
      completed: true,
      completionAudioCue: 77,
      completedPlayerCountOffset: 0x604,
      acquiredOwnershipBit: 16,
      refreshCapacity: true,
    });
    expect([
      i16(done.value.native as number[], 43),
      u16(done.value.native as number[], 49),
      i16(done.value.native as number[], 61),
    ]).toEqual([80, 1, 200]);
    expect([
      done.value.native[30],
      done.value.native[48],
      done.value.native[63],
    ]).toEqual([79, 42, 13]);
  });
  it("keeps source move-reference127 separate from42B90's footprint2 FF00 construction center", () => {
    for (const size of [1, 2, 3] as const) {
      const w = structuredClone(start.world),
        context = campaignEngineerContext(w, start.pack, start.services),
        point: [number, number] = [9087, 8319],
        reservation = context.construction!;
      //The typed native service owns actual42B90 reservation via activate;
      //compare its terrain result separately, then inspect ordinary task data.
      const r = reserveSite(
        w.terrain,
        point,
        size,
        start.pack.rules!.tables.terrainBorder,
      );
      expect(r.cells).toHaveLength(size * size);
      expect(r.vertices).toHaveLength((size + 1) ** 2);
      expect(r.anchor).toEqual([8960, 8192]);
      expect(reservation).toBeDefined();
    }
    const w = structuredClone(start.world),
      command = {
        type: "construct" as const,
        actorId: 0,
        selector: 4 as const,
        point: [9087, 8319] as [number, number],
        queued: false,
      };
    expect(queueCampaign(w, command).ok).toBe(true);
    for (let i = 0; i < 200 && !(w.specialists.records[0][88]! & 1); i++)
      step(w, start.pack);
    const n = w.specialists.records[0];
    expect(n[88]! & 1).toBe(1);
    expect(n[131]).toBe(4);
    expect([i16(n as number[], 140), i16(n as number[], 142)]).toEqual([
      8960, 8192,
    ]);
    expect([i16(n as number[], 96), i16(n as number[], 98)]).toEqual([
      9087, 8319,
    ]);
    const r = readSiteReservation(w.terrain, [8960, 8192], 2);
    expect(r.cells.every((c) => !!(w.terrain.bytes[c * 14 + 11] & 1))).toBe(
      true,
    );
    expect(r.vertices.every((c) => !!(w.terrain.bytes[c * 14 + 11] & 16))).toBe(
      true,
    );
  });
  it("requires the imported selector resource and preserves all roots on a missing binding before allocation", () => {
    const w = structuredClone(start.world),
      pack = structuredClone(start.pack),
      before = checksum(w);
    delete pack.buildingRules;
    expect(() =>
      createStagedCampaignEngineerBuilding(w, pack, start.services, {
        code: 44,
        owner: 0,
        selector: 4,
        point: [8960, 8192],
        height: 2048,
      }),
    ).toThrow(/resource profile/);
    expect(checksum(w)).toBe(before);
    pack.buildingRules = structuredClone(start.pack.buildingRules);
    delete pack.assets.RECYCLE_TEST;
    expect(() =>
      createStagedCampaignEngineerBuilding(w, pack, start.services, {
        code: 44,
        owner: 0,
        selector: 4,
        point: [8960, 8192],
        height: 2048,
      }),
    ).toThrow(/resource4|resource 4/);
    expect(checksum(w)).toBe(before);
    expect(start.pack.buildingRules!.unsupportedSelectors).toEqual([9]);
    expect(campaignBuildingAsset(start.pack, 4)).toBe("RECYCLE_TEST");
  });
  it("allocates44 and the real native building once, retains aliases, then exposes capacity400 and grade0 completion audio", () => {
    const w = structuredClone(start.world),
      held = w.buildingNative[0],
      raw = w.players[0].raw,
      out = createStagedCampaignEngineerBuilding(
        w,
        start.pack,
        start.services,
        { code: 44, owner: 0, selector: 4, point: [8960, 8192], height: 2048 },
      );
    expect(out?.buildingSlot).toBe(0);
    expect(w.buildingNative[0]).toBe(held);
    expect(w.players[0].raw).toBe(raw);
    expect(u32(raw, 0x5e6)).toBe(400);
    expect(
      i16(w.powerEffects.slots[out!.effectSlot].nativePrior! as number[], 74),
    ).toBe(4);
    const progress = progressCampaignEngineerBuilding(
      w,
      start.pack,
      0,
      90,
      start.services,
    );
    expect(progress.completed).toBe(true);
    expect(w.buildingNative[0]).toBe(held);
    expect(raw[0x604]).toBe(1);
    expect(u16(raw, 0x60e) & 16).toBe(16);
    expect(w.economy.players[0].capacity).toBe(400);
    expect(w.audio.requests.at(-1)).toMatchObject({
      cue: 77,
      initialRatePercent: 85,
    });
  });
  it("releases the actual four occupied cells/nine reserved vertices on ordinary cancellation", () => {
    const w = structuredClone(start.world),
      rawBefore = w.players[0].funds;
    //A genuine multi-tick level job permits cancellation before79220 retires
    //it. Flat one-tick jobs retain the source51E80 count-underflow boundary.
    put16(w.terrain.bytes, worldCell(8960, 8192) * 14 + 2, 1120);
    expect(
      queueCampaign(w, {
        type: "construct",
        actorId: 0,
        selector: 4,
        point: [9087, 8319],
        queued: false,
      }).ok,
    ).toBe(true);
    for (let i = 0; i < 200 && !(w.specialists.records[0][88]! & 1); i++)
      step(w, start.pack);
    const n = w.specialists.records[0],
      r = readSiteReservation(
        w.terrain,
        [i16(n as number[], 140), i16(n as number[], 142)],
        2,
      );
    expect(
      r.cells.filter((c) => w.terrain.bytes[c * 14 + 11] & 1),
    ).toHaveLength(4);
    expect(queueCampaign(w, { type: "cancel", actorId: 0 }).ok).toBe(true);
    step(w, start.pack);
    expect(r.cells.every((c) => !(w.terrain.bytes[c * 14 + 11] & 1))).toBe(
      true,
    );
    expect(r.vertices.every((c) => !(w.terrain.bytes[c * 14 + 11] & 16))).toBe(
      true,
    );
    expect(w.players[0].funds).toBe(rawBefore);
    expect(w.missionPrefix[0x2ff7]).toBe(0);
    expect(w.buildings).toHaveLength(0);
  });
  it("runs ordinary movement, payment,44 appearance and work through completion, with live-work save/replay", () => {
    const w = structuredClone(start.world),
      replay = recordCampaign(w, null),
      funds = w.players[0].funds,
      skill = w.players[0].blueprints[0].skill,
      command = {
        type: "construct" as const,
        actorId: 0,
        selector: 4 as const,
        point: [9087, 8319] as [number, number],
        queued: false,
      };
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    let saved: CampaignWorld | null = null,
      paid = false;
    for (let i = 0; i < 800; i++) {
      step(w, start.pack);
      if (saved) step(saved, start.pack);
      const n = w.specialists.records[0];
      if (i16(n as number[], 136) === 4 && n[88]! & 1) {
        paid = true;
        expect(w.players[0].funds).toBe(funds - (750 - 2 * skill));
        if (!saved)
          saved = loadCampaign(
            saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
            w.contentHash,
          ).world;
      }
      if (w.buildings[0]?.complete && !(w.specialists.records[0][88]! & 1))
        break;
    }
    expect(paid).toBe(true);
    expect(saved).not.toBeNull();
    expect(checksum(saved)).toBe(checksum(w));
    expect(w.buildings).toHaveLength(1);
    expect(w.buildings[0]).toMatchObject({
      selector: 4,
      x: 8960,
      y: 8192,
      complete: true,
      health: 80,
    });
    expect(w.players[0].completed[4]).toBe(1);
    expect(w.players[0].funds).toBe(funds - (750 - 2 * skill));
    expect(w.specialists.records[0][88]! & 1).toBe(0);
    expect(w.spatial.nodes["source:3:0"].cell).toBe(worldCell(8960, 8192));
    expect(w.economy.buildings[0]).toMatchObject({
      selector: 4,
      complete: true,
    });
    expect(w.economy.players[0].capacity).toBe(400);
    expect(u32(w.players[0].raw, 0x5e6)).toBe(400);
    validateCampaignWorld(w, w.contentHash);
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(replay, w),
          start.pack,
          w.contentHash,
        ),
      ),
    ).toBe(checksum(w));
  });
  it("queues a human Vat through the campaign schema, pays and completes with live-work save/replay", () => {
    const pack = structuredClone(start.pack);
    pack.rules!.tables.buildingFootprints[13] = 1;
    pack.rules!.tables.constructionCosts[13] = 750;
    pack.buildingRules!.resources.find(r=>r.selector===13)!.assetKey = "RECYCLE_TEST";
    const w = structuredClone(start.world),
      replay = recordCampaign(w, null),
      funds = w.players[0].funds,
      skill = w.players[0].blueprints[0].skill,
      command = {
        type: "construct" as const,
        actorId: 0,
        selector: 13 as const,
        point: [9087, 8319] as [number, number],
        queued: false,
      };
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    let saved: CampaignWorld | null = null,
      paid = false;
    for (let i = 0; i < 800; i++) {
      step(w, pack);
      if (saved) step(saved, pack);
      const n = w.specialists.records[0];
      if (i16(n as number[], 136) === 4 && n[88]! & 1) {
        paid = true;
        expect(w.players[0].funds).toBe(funds - (750 - 2 * skill));
        if (!saved)
          saved = loadCampaign(
            saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
            w.contentHash,
          ).world;
      }
      if (w.buildings[0]?.complete && !(w.specialists.records[0][88]! & 1))
        break;
    }
    expect(paid).toBe(true);
    expect(saved).not.toBeNull();
    expect(checksum(saved)).toBe(checksum(w));
    expect(w.buildings).toHaveLength(1);
    expect(w.buildings[0]).toMatchObject({
      selector: 13,
      x: 9087,
      y: 8319,
      complete: true,
      health: 80,
    });
    expect(w.players[0].completed[13]).toBe(1);
    expect(w.players[0].funds).toBe(funds - (750 - 2 * skill));
    expect(w.specialists.records[0][88]! & 1).toBe(0);
    expect(w.spatial.nodes["source:3:0"].cell).toBe(worldCell(9087, 8319));
    expect(w.economy.buildings[0]).toMatchObject({
      selector: 13,
      complete: true,
    });
    expect(w.economy.players[0].capacity).toBe(500);
    expect(u32(w.players[0].raw, 0x5e6)).toBe(500);
    validateCampaignWorld(w, w.contentHash);
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(replay, w),
          pack,
          w.contentHash,
        ),
      ),
    ).toBe(checksum(w));
  });
  it("admits the constructed selector4 nonlethal damage path without invoking retirement services", () => {
    const w = structuredClone(start.world),
      pack = structuredClone(start.pack);
    pack.rules!.tables.buildingNameIndices = Array(14).fill(0);
    createStagedCampaignEngineerBuilding(w, start.pack, start.services, {
      code: 44,
      owner: 0,
      selector: 4,
      point: [8960, 8192],
      height: 2048,
    });
    progressCampaignEngineerBuilding(w, start.pack, 0, 90, start.services);
    //The ordinary owner/slot pass publishes the newly constructed economy row.
    stepCampaign(w, pack);
    const health = w.buildings[0].health, count = w.players[0].completed[4],
      stored = u32(w.buildingNative[0] as number[], 54), goop = w.players[0].goop;
    const receipt = damageCampaignBuilding(w, pack, 0, 0, null, {
        effectOptions: () => ({
          gravity: 512,
          obstacleAt: () => false,
          cleanupReferences: cleanupCampaignReferences,
        }),
      });
    expect(receipt.destroyed).toBe(false);
    expect(receipt.clearedFrontReferences).toEqual([]);
    expect(receipt.effectAllocations).toEqual([]);
    expect(w.buildings[0].health).toBe(health);
    expect(w.players[0].completed[4]).toBe(count);
    expect(u32(w.buildingNative[0] as number[], 54)).toBe(stored);
    expect(w.players[0].goop).toBe(goop);
    expect(w.buildingNative[0][48]).toBe(11);
  });
});
