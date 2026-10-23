import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import { stepCampaignEconomyBuildings } from "../src/sim/campaign/economy-adapter";
import type { CampaignRecyclingServices } from "../src/sim/campaign/recycling-adapter";
import type { EffectSchedulerOptions } from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { i16, put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import type { EconomyBuilding } from "../src/sim/mechanics/economy";

function fixture() {
  const pack = campaignFixture();
  pack.buildingRules = {
    schemaVersion: 1,
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      path: `SYNTHETIC/${selector}.ANB`,
      assetKey: selector === 3 ? "BPOWE" : "SYNTHREC",
    })).filter((r) => r.selector !== 9),
    unsupportedSelectors: [9],
    upkeep: Array(14).fill(1),
    processingFrontOffset: [-256, 0],
    provenance: { originalExecution: false, executableSha256: "0".repeat(64) },
  };
  const asset = (count: number, actions: number) => ({
    ...pack.assets.TEST,
    frames: Array.from({ length: count }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: actions }, () => ({
      first: 0,
      last: count - 1,
      rawTrailingWord: count,
    })),
  });
  pack.assets.SYNTHREC = asset(6, 5);
  pack.assets.BPOWE = asset(9, 2);
  pack.assets.BSOLA = asset(10, 2);
  pack.assets.EFF = asset(9, 71);
  pack.assets.EFF.animations = Array.from({ length: 71 }, (_, code) => ({
    first: 0,
    last: code === 61 ? 8 : 5,
    rawTrailingWord: code === 61 ? 9 : 6,
  }));
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: 11,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.economyRules!.capacity = {
    extractor: 80,
    store4: [100, 200, 300],
    store13: [120, 240, 360],
    unusedGoopWarningTicks: 100,
  };
  pack.economyRules!.power.distributorPulsePeriod = 1;
  pack.economyRules!.power.distributorPulsePhase = [0, 0, 0];
  const w = createCampaign(pack, "synthetic-economy-adapter");
  w.phase = "active";
  w.frame = 1;
  w.tick = 1;
  const services: CampaignRecyclingServices = {
    effectOptions: (): EffectSchedulerOptions<CampaignWorld> => ({
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  function add(slot: number, selector: number, energy = 100) {
    const owner = Math.floor(slot / 64),
      n = w.buildingNative[slot],
      x = 8448 + (slot % 8) * 256,
      y = 8192;
    n.fill(0);
    n.fill(null, 31, 39);
    n[6] = 4;
    n[24] = owner;
    n[45] = selector;
    n[25] = 1;
    put16(n as number[], 15, slot);
    put16(n as number[], 7, x);
    put16(n as number[], 9, y);
    put16(n as number[], 43, 80);
    put16(n as number[], 49, 5);
    put16(n as number[], 61, energy);
    put32(n as number[], 54, 41 + slot);
    w.buildings.push({
      id: 1000 + slot,
      slot,
      owner,
      selector,
      grade: 0,
      x,
      y,
      health: 80,
      complete: true,
      energy,
    });
    const b: EconomyBuilding = {
      ...w.buildings.at(-1)!,
      slot: slot % 64,
      disabled: false,
      capacitySuppressed: false,
      hqUpgradeSuppressed: false,
      powered: true,
      extraDrain: 0,
      depleted: false,
      storedGoop: 41 + slot,
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
    };
    w.economy.buildings.push(b);
    w.players[owner].raw[0x4a2]++;
    w.players[owner].completed[selector]++;
    w.players[owner].raw[0x600 + selector]++;
    insertSpatial(w.spatial, w.terrain, `source:3:${slot}`, worldCell(x, y));
    synchronizeCampaignLinks(w);
    return b;
  }
  return { w, pack, services, add };
}

describe("campaign ordered economy transaction", () => {
  it("interleaves native4/producer/host callbacks in exact owner-slot order, allocating before the next owner", () => {
    const f = fixture();
    f.add(0, 4);
    f.w.buildingNative[0][51] = 10;
    f.add(1, 3, 40);
    f.add(64, 0);
    f.w.economy.buildings.reverse();
    const order: number[] = [];
    const r = stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
      dispatchBuilding(w, b) {
        order.push(b.owner * 64 + b.slot);
        if (b.owner === 0) {
          expect(w.players[0].goop).toBe(10);
          expect(w.players[0].funds).toBe(4000);
          expect(u32(w.players[0].raw, 13)).toBe(20);
          return false;
        }
        expect(u32(w.buildingNative[0] as number[], 54)).toBe(10);
        expect(
          w.economy.buildings.find((v) => v.selector === 4)!.storedGoop,
        ).toBe(10);
        b.energy = 88;
        put16(w.buildingNative[64] as number[], 61, 88);
        return true;
      },
    });
    expect(order).toEqual([1, 64]);
    expect(r.reasons.map((v) => v.buildingId)).toEqual([1000, 1001, 1064]);
    expect(f.w.economy.players[0].goop).toBe(10);
    expect(u32(f.w.players[0].raw, 0x4a7)).toBe(10);
    expect(i16(f.w.buildingNative[0] as number[], 61)).toBe(99); //one source upkeep only
    expect(r.events.some((e) => e.type === "recycling")).toBe(true);
    validateSpatial(f.w.spatial);
  });
  it("publishes real packet33 slots before a later native callback, preserving same staged aliases", () => {
    const f = fixture();
    f.add(0, 3, 40);
    f.add(1, 4);
    f.add(2, 0);
    const initialDraws = f.w.rng.draws;
    let called = false;
    const r = stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
      dispatchBuilding(w, b) {
        if (b.selector !== 0) return false;
        called = true;
        const effect = w.powerEffects.slots.find((s) => s.packet);
        expect(effect?.packet?.targetId).toBe(1001);
        expect(u16(w.missionPrefix, 0x3554)).toBeGreaterThan(0);
        expect(
          w.spatial.nodes[`source:4:${w.powerEffects.slots.indexOf(effect!)}`],
        ).toBeDefined();
        const n = w.buildingNative[2],
          p = w.players[0].raw;
        b.energy--;
        put16(n as number[], 61, b.energy);
        expect(w.buildingNative[2]).toBe(n);
        expect(w.players[0].raw).toBe(p);
        return true;
      },
    });
    expect(called).toBe(true);
    expect(f.w.rng.draws).toBe(initialDraws + 1);
    expect(r.events.filter((e) => e.type === "packet-launched")).toHaveLength(
      2,
    );
    expect(f.w.economy.packets).toHaveLength(2);
  });
  it("rolls back an early actual recycled deposit/burst/RNG when a later native callback fails", () => {
    const f = fixture();
    f.add(0, 4);
    f.w.buildingNative[0][51] = 8;
    f.add(1, 0);
    const before = structuredClone(f.w),
      heldNative = f.w.buildingNative[0],
      heldPlayer = f.w.players[0].raw;
    expect(() =>
      stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
        dispatchBuilding(w) {
          expect(w.players[0].goop).toBe(8);
          throw Error("late native callback");
        },
      }),
    ).toThrow("late native callback");
    expect(f.w).toEqual(before);
    expect(f.w.buildingNative[0]).toBe(heldNative);
    expect(f.w.players[0].raw).toBe(heldPlayer);
  });
  it("does not run selector4 twice even when a host dispatcher accepts every other building", () => {
    const f = fixture();
    f.add(0, 4);
    f.w.buildingNative[0][51] = 8;
    let callbacks = 0;
    stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
      dispatchBuilding() {
        callbacks++;
        return true;
      },
    });
    expect(callbacks).toBe(0);
    expect(f.w.players[0].funds).toBe(4000);
    expect(u32(f.w.players[0].raw, 13)).toBe(20);
    expect(i16(f.w.buildingNative[0] as number[], 61)).toBe(99);
  });
  it("allocates exact native54 once perowner and retains unvisited later stores", () => {
    const f = fixture();
    f.add(0, 4);
    f.add(1, 11);
    f.add(2, 4);
    f.w.players[0].goop = f.w.economy.players[0].goop = 6;
    const retained = f.w.buildingNative[2].slice(54, 58);
    stepCampaignEconomyBuildings(f.w, f.pack, f.services);
    expect(u32(f.w.buildingNative[0] as number[], 54)).toBe(6);
    expect(f.w.buildingNative[2].slice(54, 58)).toEqual(retained);
    expect(f.w.economy.buildings.find((b) => b.id === 1002)!.storedGoop).toBe(
      43,
    );
  });
  it("recomputes Extractor contact gates lazily after an earlier source recycling deposit", () => {
    const f = fixture();
    f.add(0, 4);
    const ex = f.add(1, 11);
    ex.extractor!.frame = 2;
    f.w.buildingNative[0][51] = 8;
    let resolved = false;
    const r = stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
      resolve(w, b, q) {
        resolved = true;
        expect(w.players[0].goop).toBe(8);
        expect(b.id).toBe(1001);
        expect(q.queries).toHaveLength(2);
      },
    });
    expect(resolved).toBe(true);
    expect(r.events.some((e) => e.type === "goop-harvested")).toBe(true);
  });
  it("rolls back power prefix RNG and packet effects after a later missing source callback", () => {
    const f = fixture();
    f.add(0, 3, 40);
    f.add(1, 1);
    const before = structuredClone(f.w);
    expect(() => stepCampaignEconomyBuildings(f.w, f.pack, f.services)).toThrow(
      "Native building callback 1 requires its source host service",
    );
    expect(f.w).toEqual(before);
  });
  it("preserves saveable values through JSON continuation", () => {
    const f = fixture();
    f.add(0, 4);
    f.add(1, 11);
    f.w.buildingNative[0][51] = 11;
    stepCampaignEconomyBuildings(f.w, f.pack, f.services);
    const copy: CampaignWorld = JSON.parse(JSON.stringify(f.w));
    for (let i = 0; i < 3; i++) {
      f.w.frame++;
      copy.frame++;
      stepCampaignEconomyBuildings(f.w, f.pack, f.services);
      stepCampaignEconomyBuildings(copy, f.pack, f.services);
    }
    expect(checksum(copy)).toBe(checksum(f.w));
    expect(copy).toEqual(JSON.parse(JSON.stringify(f.w)));
  });

  it("keeps full-pool33 replacement explicit and rolls back prior producer RNG/economy/native writes", () => {
    const f = fixture();
    f.add(0, 3, 40);
    f.add(1, 4);
    for (let slot = 0; slot < 200; slot++) {
      const entry = f.w.powerEffects.slots[slot],
        n = entry.nativePrior!;
      n[6] = 5;
      n[69] = 7;
      put16(n as number[], 15, slot);
      put16(n as number[], 7, 12000);
      put16(n as number[], 9, 12000);
      entry.occupied = true;
      insertSpatial(
        f.w.spatial,
        f.w.terrain,
        `source:4:${slot}`,
        worldCell(12000, 12000),
      );
    }
    synchronizeCampaignLinks(f.w);
    put16(f.w.missionPrefix, 0x3554, 200);
    const before = structuredClone(f.w);
    expect(() => stepCampaignEconomyBuildings(f.w, f.pack, f.services)).toThrow(
      "power-effect-pool-full-replacement-required",
    );
    expect(f.w).toEqual(before);
  });

  it("does not overwrite an incomplete source callback's ANB with stale retained producer state", () => {
    const f = fixture(),
      b = f.add(0, 3);
    b.complete = false;
    f.w.buildings[0].complete = false;
    put16(f.w.buildingNative[0] as number[], 49, 0);
    b.producer = {
      animation: {
        action: 1,
        frame: 7,
        hold: 1,
        direction: 1,
        delay: 0,
        counter: 0,
      },
      audioRequested: false,
      audioRequests: [],
      lastFrame: null,
      lastPulse: false,
      lastDraw: null,
    };
    const draws = f.w.rng.draws;
    stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
      dispatchBuilding(w, current) {
        expect(w.buildingNative[0][27]).toBe(0);
        w.buildingNative[0].splice(25, 6, 0, 3, 4, 0, 2, 255);
        current.energy--;
        return true;
      },
    });
    expect(f.w.buildingNative[0].slice(25, 31)).toEqual([0, 3, 4, 0, 2, 255]);
    expect(f.w.economy.buildings[0].producer!.animation).toEqual({
      action: 0,
      hold: 3,
      frame: 4,
      direction: 0,
      delay: 2,
      counter: -1,
    });
    expect(f.w.rng.draws).toBe(draws);
  });

  it("creates real contact smoke before queries and rolls its four RNG draws/factory back on a late contact failure", () => {
    const f = fixture(),
      ex = f.add(0, 11);
    ex.extractor!.frame = 2;
    // A retained, already-retired landing hosts ordinary smoke particles in
    // the existing shared adapter; this is a synthetic post-landing stage.
    f.w.landings.push({
      slot: 199,
      owner: 0,
      point: [8192, 8192],
      height: 2048,
      phase: 4,
      timer: 0,
      vz: 0,
      accelerationZ: 0,
      particles: [],
      messageIndex: null,
      activationFrame: 0,
    });
    const before = structuredClone(f.w),
      draws = f.w.rng.draws;
    let entered = false;
    expect(() =>
      stepCampaignEconomyBuildings(f.w, f.pack, f.services, {
        resolve(w) {
          entered = true;
          expect(w.rng.draws).toBe(draws + 4);
          expect(
            w.landings.flatMap((l) => l.particles).some((p) => p.code === 6),
          ).toBe(true);
          throw Error("late actual contact");
        },
      }),
    ).toThrow("late actual contact");
    expect(entered).toBe(true);
    expect(f.w).toEqual(before);
  });
});
