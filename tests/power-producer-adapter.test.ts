import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  stepCampaignPowerProducer,
  stepStagedCampaignPowerProducer,
  refreshStagedCampaignPowerProducer,
  resetStagedCampaignPowerGenerated,
} from "../src/sim/campaign/power-producer-adapter";
import {
  createNativeBuilding,
  progressNativeBuilding,
} from "../src/sim/mechanics/building-native";
import {
  planEngineerBuildingUpgrade,
  planEngineerBuildingContribution,
} from "../src/sim/mechanics/engineer-construction";
import { stepPowerEffects } from "../src/sim/campaign/power-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { i16, put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
import { worldCell, groundHeight } from "../src/sim/mechanics/terrain";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/** Synthetic initial grants, actual constructors and retained priors. These
 * are callback/transaction tests, not earned upgrading or campaign acceptance. */
function fixture() {
  const pack = campaignFixture(),
    lengths = [3, 2, 5, 7, 3];
  for (const key of ["SYNTHPOWER3", "SYNTHPOWER6"])
    pack.assets[key] = {
      ...pack.assets.TEST,
      frames: Array.from({ length: 7 }, (_, i) => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [i === 5 ? 3 : 0, 0, 0],
      })),
      animations: lengths.map((length) => ({
        first: 0,
        last: length - 1,
        rawTrailingWord: length,
      })),
    };
  pack.assets.EFF = {
    ...pack.assets.TEST,
    frames: Array.from({ length: 4 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 71 }, () => ({
      first: 0,
      last: 3,
      rawTrailingWord: 4,
    })),
  };
  pack.buildingRules = {
    schemaVersion: 1,
    resources: [3, 6].map((selector) => ({
      selector,
      assetKey: `SYNTHPOWER${selector}`,
      path: `SYNTHETIC/${selector}.ANB`,
    })),
    unsupportedSelectors: [0, 1, 2, 4, 5, 7, 8, 9, 10, 11, 12, 13],
    upkeep: Array(14).fill(0),
    processingFrontOffset: [0, 0],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.effectRules = {
    schemaVersion: 1,
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: code === 6 ? 10 : 1,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
  };
  const w = createCampaign(pack, "synthetic-native-power-producer");
  w.phase = "active";
  w.frame = w.tick = 32;
  w.rng = { seed: 0, ring: 31, draws: 0 };
  for (const [slot, shared] of w.powerEffects.slots.entries()) {
    shared.nativePrior![67] = shared.fractionX = (slot * 7 + 13) & 255;
    shared.nativePrior![68] = shared.fractionY = (slot * 11 + 17) & 255;
  }
  function add(
    slot: number,
    selector: 0 | 3 | 6 | 11,
    grade: 0 | 1 | 2 = 0,
    position: [number, number] = [8192 + (slot % 64) * 256, 8192],
  ) {
    const n = w.buildingNative[slot],
      owner = Math.floor(slot / 64),
      created = createNativeBuilding(n, {
        slot,
        owner,
        selector,
        position,
        ground: groundHeight(w.terrain, ...position),
        shade: 32,
      });
    if (!created.ok) throw Error(created.reason);
    n.splice(0, 67, ...created.value);
    const complete = progressNativeBuilding(n, {
      increment: 80,
      maximumHealth: 80,
      loading: false,
    });
    if (!complete.ok) throw Error(complete.reason);
    n.splice(0, 67, ...complete.value.native);
    n[46] = n[47] = grade;
    n[25] = grade + 1;
    w.buildings.push({
      id: 1000 + slot,
      slot,
      owner,
      selector,
      grade,
      x: position[0],
      y: position[1],
      health: 80,
      complete: true,
      energy: 200,
    });
    w.economy.buildings.push({
      ...w.buildings.at(-1)!,
      slot: slot % 64,
      disabled: false,
      capacitySuppressed: false,
      hqUpgradeSuppressed: false,
      powered: false,
      extraDrain: 0,
      depleted: false,
      storedGoop: 0,
      specialPowerDelivery: false,
      ...(selector === 11
        ? {
            extractor: {
              cycle: 0,
              frame: 0,
              delay: 0,
              hold: 0,
              stepDelay: 0,
              workAudioActive: false,
            },
          }
        : {}),
    });
    w.players[owner].raw[0x4a2]++;
    w.players[owner].completed[selector]++;
    w.players[owner].raw[0x600 + selector]++;
    w.players[owner].owned |= 1 << selector;
    put16(w.players[owner].raw, 0x60e, w.players[owner].owned);
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:3:${slot}`,
      worldCell(...position),
    );
    synchronizeCampaignLinks(w);
    return n;
  }
  const options = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: (
      s: CampaignWorld,
      id: Parameters<typeof cleanupCampaignReferences>[1],
    ) => cleanupCampaignReferences(s, id),
  };
  const services = { effectOptions: () => options };
  return { w, pack, add, options, services };
}

describe("campaign complete power producer adapter", () => {
  it("runs grade2 factories in native order in place and delivers only in later33 effects", () => {
    const f = fixture(),
      n = f.add(0, 3, 2),
      target = f.add(1, 11);
    put16(n as number[], 61, 196);
    put16(target as number[], 61, 0);
    f.w.economy.buildings[1].energy = 0;
    n[27] = 1;
    const raw = f.w.players[0].raw,
      building = f.w.buildings[0],
      economy = f.w.economy,
      effectPrior = f.w.powerEffects.slots[0].nativePrior;
    resetStagedCampaignPowerGenerated(f.w, 0);
    const r = stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    expect(r).toMatchObject({
      grade: 2,
      generated: 8,
      recipientCount: 1,
      createdSlots: [0],
      factoriesAlreadyApplied: true,
    });
    expect(f.w.buildingNative[0]).toBe(n);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.buildings[0]).toBe(building);
    expect(f.w.economy).toBe(economy);
    expect(f.w.powerEffects.slots[0].nativePrior).toBe(effectPrior);
    expect([
      u32(n as number[], 54),
      i16(raw, 0x4ad),
      economy.players[0].generatedEnergy,
    ]).toEqual([1, 8, 8]);
    expect(f.w.economy.buildings[1].energy).toBe(0);
    expect(r.presentationRequests).toEqual([
      {
        type: "building-queue-request",
        entry: 0x83140,
        sourceCapacity: 256,
        slot: 0,
        frame: 32,
        action: 3,
        animationFrame: 1,
        originalQueueOutcome: "not-modeled",
      },
    ]);
    expect(n[27]).toBe(2);
    const packet = f.w.powerEffects.slots[0];
    expect([
      packet.nativePrior![69],
      packet.nativePrior![73],
      packet.nativePrior![76],
      packet.fractionX,
      packet.fractionY,
    ]).toEqual([33, 4, 204, 13, 17]);
    expect(u16(f.w.missionPrefix, 0x3554)).toBe(1);
    for (let tick = 0; tick < 10; tick++) stepPowerEffects(f.w, f.pack);
    expect(f.w.economy.buildings[1].energy).toBeGreaterThan(0);
    validateSpatial(f.w.spatial);
  });

  it("uses the imported Photon grade resource, current recipient grade, audio and mission solar", () => {
    const f = fixture(),
      n = f.add(0, 6, 1);
    f.add(1, 3, 2, [10752, 8192]);
    put16(n as number[], 61, 199);
    const r = stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    expect([
      r.generated,
      r.recipientCount,
      r.audio.map((a) => a.type),
      n[25],
      n[29],
    ]).toEqual([6, 1, ["stop", "play"], 2, 3]);
    expect(
      f.w.audio.requests.map((a) => [
        a.cue,
        "mode" in a ? a.mode : null,
        "range" in a ? a.range : null,
      ]),
    ).toEqual([
      [35, 4, null],
      [35, 2, 360],
    ]);
    expect(f.w.economy.packets[0].payload).toBe(200);
  });

  it("hydrates retained native upgrade/completion priors over stale normalized animation", () => {
    const f = fixture(),
      n = f.add(0, 3);
    n[30] = 127;
    n[48] = 44;
    n[63] = 19;
    refreshStagedCampaignPowerProducer(f.w, 0);
    const projection = f.w.economy.buildings[0].producer!,
      animation = projection.animation;
    Object.assign(animation, { action: 4, frame: 255, counter: -77 });
    const upgrade = planEngineerBuildingUpgrade(n);
    n.splice(0, 67, ...upgrade.native);
    stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    expect(f.w.economy.buildings[0].producer).toBe(projection);
    expect(projection.animation).toBe(animation);
    expect([n[25], n[46], n[47], n[48], n[63]]).toEqual([0, 0, 1, 43, 19]);
    const completion = planEngineerBuildingContribution(n, 200, 280);
    n.splice(0, 67, ...completion.native);
    f.w.frame = 17;
    const r = stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    expect([
      f.w.economy.buildings[0].grade,
      projection.animation.action,
      r.generated,
      n[48],
      n[63],
    ]).toEqual([1, 2, 4, 42, 18]);
  });

  it("resets4AD once per owner and accumulates both producer types without changing funds/GOOP", () => {
    const f = fixture();
    f.add(0, 3, 2);
    f.add(1, 6, 1);
    f.add(64, 3);
    const raw = f.w.players[0].raw,
      before = [u32(raw, 0x4a3), u32(raw, 0x4a7)];
    put16(raw, 0x4ad, 32767);
    put16(f.w.players[1].raw, 0x4ad, 123);
    resetStagedCampaignPowerGenerated(f.w, 0);
    stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    stepStagedCampaignPowerProducer(f.w, 1, f.pack, f.services);
    expect([
      i16(raw, 0x4ad),
      f.w.economy.players[0].generatedEnergy,
      i16(f.w.players[1].raw, 0x4ad),
    ]).toEqual([14, 14, 123]);
    expect([u32(raw, 0x4a3), u32(raw, 0x4a7)]).toEqual(before);
  });

  it("rolls back real allocation, RNG, audio and native aliases on a late grade ANB failure", () => {
    const f = fixture(),
      n = f.add(0, 3, 1);
    f.add(1, 11);
    f.w.frame = 16;
    delete f.pack.assets.SYNTHPOWER3.animations;
    const before = structuredClone(f.w),
      raw = f.w.players[0].raw,
      prior = f.w.powerEffects.slots[0].nativePrior;
    expect(() => stepCampaignPowerProducer(f.w, 0, f.pack, f.services)).toThrow(
      "animation",
    );
    expect(f.w).toEqual(before);
    expect(f.w.buildingNative[0]).toBe(n);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.powerEffects.slots[0].nativePrior).toBe(prior);
  });

  it("uses actual priority retirement/cleanup and rolls the full host back if a later ANB fails", () => {
    const f = fixture(),
      n = f.add(0, 3, 1);
    f.add(1, 11);
    f.w.frame = 16;
    for (const [slot, shared] of f.w.powerEffects.slots.entries()) {
      const prior = shared.nativePrior!;
      prior[6] = 5;
      prior[69] = 6;
      put16(prior as number[], 7, 8192);
      put16(prior as number[], 9, 8448);
      put16(prior as number[], 15, slot);
      put16(prior as number[], 71, 0);
      prior[73] = slot === 1 ? 5 : 0;
      shared.occupied = true;
      insertSpatial(
        f.w.spatial,
        f.w.terrain,
        `source:4:${slot}`,
        worldCell(8192, 8448),
      );
    }
    put16(f.w.missionPrefix, 0x3554, 200);
    synchronizeCampaignLinks(f.w);
    const before = structuredClone(f.w),
      held = f.w.powerEffects.slots[1].nativePrior;
    let cleanupCalls = 0,
      cleared = false;
    f.options.cleanupReferences = (s, id) => {
      cleanupCalls++;
      const count = cleanupCampaignReferences(s, id);
      cleared = s.powerEffects.slots[1].nativePrior![73] === 0;
      return count;
    };
    delete f.pack.assets.SYNTHPOWER3.animations;
    expect(() => stepCampaignPowerProducer(f.w, 0, f.pack, f.services)).toThrow(
      "animation",
    );
    expect(cleanupCalls).toBe(1);
    expect(cleared).toBe(true);
    expect(f.w).toEqual(before);
    expect(f.w.buildingNative[0]).toBe(n);
    expect(f.w.powerEffects.slots[1].nativePrior).toBe(held);
  });

  it("publishes a successful full-pool replacement with retained slot fractions/counter and exact neighbor cleanup", () => {
    const f = fixture();
    f.add(0, 3, 1);
    f.add(1, 11);
    f.w.frame = 16;
    for (const [slot, shared] of f.w.powerEffects.slots.entries()) {
      const n = shared.nativePrior!;
      n[6] = 5;
      n[69] = 6;
      n[30] = 173;
      put16(n as number[], 7, 8192);
      put16(n as number[], 9, 8448);
      put16(n as number[], 15, slot);
      put16(n as number[], 71, 0);
      n[73] = slot === 1 ? 5 : 0;
      shared.occupied = true;
      insertSpatial(
        f.w.spatial,
        f.w.terrain,
        `source:4:${slot}`,
        worldCell(8192, 8448),
      );
    }
    put16(f.w.missionPrefix, 0x3554, 200);
    synchronizeCampaignLinks(f.w);
    const held = f.w.powerEffects.slots[0].nativePrior;
    const r = stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    expect(r.createdSlots).toEqual([0]);
    expect(f.w.powerEffects.slots[0].nativePrior).toBe(held);
    expect([
      held![69],
      held![30],
      held![67],
      held![68],
      f.w.powerEffects.slots[1].nativePrior![73],
      u16(f.w.missionPrefix, 0x3554),
    ]).toEqual([33, 173, 13, 17, 0, 200]);
    expect(f.w.economy.packets).toHaveLength(1);
    validateSpatial(f.w.spatial);
  });

  it("refuses an unreplacable shared pool before33 resource access and rolls back the callback", () => {
    const f = fixture();
    f.add(0, 3, 1);
    f.add(1, 11);
    f.w.frame = 16;
    for (const [slot, shared] of f.w.powerEffects.slots.entries()) {
      const n = shared.nativePrior!;
      n[6] = 5;
      n[69] = 49; // Synthetic occupied priority1 records; their callbacks do not run.
      put16(n as number[], 7, 8192);
      put16(n as number[], 9, 8448);
      put16(n as number[], 15, slot);
      shared.occupied = true;
      insertSpatial(
        f.w.spatial,
        f.w.terrain,
        `source:4:${slot}`,
        worldCell(8192, 8448),
      );
    }
    put16(f.w.missionPrefix, 0x3554, 200);
    synchronizeCampaignLinks(f.w);
    delete f.pack.assets.EFF;
    const before = structuredClone(f.w);
    expect(() => stepCampaignPowerProducer(f.w, 0, f.pack, f.services)).toThrow(
      "no allocatable slot",
    );
    expect(f.w).toEqual(before);
  });

  it("preserves a running/moving save across repeated standalone callbacks and later effect steps", () => {
    const f = fixture(),
      n = f.add(0, 3, 2);
    f.add(1, 11);
    put16(n as number[], 61, 196);
    stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    const clone = loadCampaign(
      saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
      f.w.contentHash,
    ).world;
    for (let tick = 0; tick < 24; tick++) {
      for (const w of [f.w, clone]) {
        w.tick++;
        w.frame++;
        resetStagedCampaignPowerGenerated(w, 0);
        stepStagedCampaignPowerProducer(w, 0, f.pack, f.services);
        stepPowerEffects(w, f.pack);
      }
      expect(checksum(clone)).toBe(checksum(f.w));
    }
    expect(clone.economy.packets).toHaveLength(0);
  });

  it("keeps no-queue incomplete resource access lazy and rejects demolition instead of bypassing it", () => {
    const f = fixture(),
      n = f.add(0, 6, 2);
    put16(n as number[], 49, 0x100);
    put16(n as number[], 43, 0);
    delete f.pack.assets.SYNTHPOWER6;
    const r = stepStagedCampaignPowerProducer(f.w, 0, f.pack, f.services);
    expect(r.queueRequested).toBe(false);
    expect(r.presentationRequests).toEqual([]);
    expect(r.audio).toEqual([{ type: "stop", channel: 35 }]);
    put16(n as number[], 49, 0x801);
    const before = structuredClone(f.w);
    expect(() => stepCampaignPowerProducer(f.w, 0, f.pack, f.services)).toThrow(
      "demolition",
    );
    expect(f.w).toEqual(before);
  });
});
