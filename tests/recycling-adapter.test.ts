import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { installEconomyEffect61 } from "./fixtures/economy-effect-profile";
import {
  createCampaign,
  validateCampaignWorld,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  stepCampaignRecyclingPlant,
  stepStagedCampaignRecyclingPlant,
  type CampaignRecyclingServices,
} from "../src/sim/campaign/recycling-adapter";
import { initializeSerializedBuildings } from "../src/sim/mechanics/building-startup";
import { planBotanistPlantCreation } from "../src/sim/mechanics/botanist";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import {
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { i16, put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { loadCampaign, saveCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/** Synthetic serialized selector4 priors plus real plant/Mule/shared-effect
 * factories. These arranged stages are host integration, not mission acceptance. */
function fixture(grade: 0 | 1 | 2 = 0) {
  const pack = campaignFixture();
  pack.buildingRules = {
    schemaVersion: 1,
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      path: `SYNTHETIC/${selector}.ANB`,
      assetKey: "SYNTHREC",
    })).filter((r) => r.selector !== 9),
    unsupportedSelectors: [9],
    upkeep: Array(14).fill(1),
    processingFrontOffset: [-256, 0],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.assets.SYNTHREC = {
    ...pack.assets.TEST,
    frames: Array.from({ length: 6 }, () => ({
      components: [],
      width: 1,
      height: 1,
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
    animations: Array.from({ length: 71 }, (_, code) => ({
      first: 0,
      last: code === 61 ? 8 : 5,
      rawTrailingWord: code === 61 ? 9 : 6,
    })),
  };
  installEconomyEffect61(pack.assets.EFF);
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
  const w = createCampaign(pack, "synthetic-recycling-host");
  w.phase = "active";
  w.frame = 1;
  w.tick = 1;
  const n = w.buildingNative[0];
  n.fill(0);
  n.fill(null, 31, 39);
  n[6] = 4;
  n[45] = 4;
  n[46] = grade;
  n[25] = grade + 1;
  put16(n as number[], 7, 8448);
  put16(n as number[], 9, 8192);
  put32(n as number[], 17, 2048);
  put16(n as number[], 43, 80);
  put16(n as number[], 49, 5);
  put16(n as number[], 61, 200);
  const rebound = initializeSerializedBuildings(w.buildingNative, {
    rules: pack.buildingRules,
    hasResource: () => true,
  });
  if (!rebound.ok) throw Error(rebound.reason);
  w.buildingNative = rebound.value.records;
  w.buildings.push({
    id: 1000,
    slot: 0,
    owner: 0,
    selector: 4,
    grade,
    x: 8448,
    y: 8192,
    health: 80,
    complete: true,
    energy: 200,
  });
  w.economy.buildings.push({
    ...w.buildings[0],
    disabled: false,
    capacitySuppressed: false,
    hqUpgradeSuppressed: false,
    powered: true,
    extraDrain: 0,
    depleted: false,
    storedGoop: 0,
    specialPowerDelivery: false,
  });
  w.players[0].raw[0x600 + 4] = w.players[0].completed[4] = 1;
  put16(w.missionPrefix, 0x3556, 0);
  put16(w.missionPrefix, 0x1c7c, 5000);
  put32(w.players[0].raw, 13, 0);
  put32(w.players[0].raw, 17, 0);
  put32(w.players[0].raw, 0x4a7, 90);
  w.players[0].goop = w.economy.players[0].goop = 90;
  put32(w.players[0].raw, 0x5e6, 100);
  w.economy.players[0].capacity = 100;
  insertSpatial(w.spatial, w.terrain, "source:3:0", worldCell(8448, 8192));
  synchronizeCampaignLinks(w);
  const options = (
    _s: CampaignWorld,
  ): EffectSchedulerOptions<CampaignWorld> => ({
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: cleanupCampaignReferences,
  });
  const services: CampaignRecyclingServices = { effectOptions: options };
  return { w, pack, services, options };
}
function plant(
  f: ReturnType<typeof fixture>,
  index: number,
  owner = 4,
  retained = 7,
) {
  const { w } = f,
    p = w.ecology.plants[index],
    plan = planBotanistPlantCreation(
      p.native,
      index,
      owner,
      0,
      [8192, 8192],
      w.terrain,
    );
  p.native.splice(0, p.native.length, ...plan.native);
  p.native[48] = retained;
  Object.assign(p, {
    active: true,
    owner,
    position: plan.position,
    selector: 0,
    growth: 4,
    flags: 4,
    plantFlags: 0,
    updateCounter: 0,
    retirement: retained,
    animation: 0,
    frame: 0,
    shade: p.native[23],
    height: plan.height,
  });
  w.ecology.plantCount++;
  put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
  if (owner < 4) {
    w.ecology.ownerPlantCounts[owner]++;
    put16(w.players[owner].raw, 0x5fa, w.ecology.ownerPlantCounts[owner]);
  }
  insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
  synchronizeCampaignLinks(w);
  w.ecology.plantOrder ??= {};
  const cell = worldCell(...p.position);
  w.ecology.plantOrder[cell] = [index, ...(w.ecology.plantOrder[cell] ?? [])];
  return p;
}
function corpse(
  f: ReturnType<typeof fixture>,
  index: number,
  weight: number,
  state = 25,
) {
  const { w, pack } = f,
    r = initializeMuleNative(
      w.creatureNative[index],
      w.rng,
      { slot: index, owner: 4, position: [8192, 8192], quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
  if (!r.ok) throw Error(r.reason);
  w.rng = r.value.rng;
  const n = r.value.native;
  n[94] = state;
  n[97] = 0;
  put16(n as number[], 104, weight);
  w.ecology.mules.push({
    index,
    id: `source:0:${index}`,
    native: n,
    pending: [],
  });
  w.creatureNative[index] = n;
  put16(w.missionPrefix, 0x3550, w.ecology.mules.length);
  insertSpatial(
    w.spatial,
    w.terrain,
    `source:0:${index}`,
    worldCell(8192, 8192),
  );
  synchronizeCampaignLinks(w);
  return n;
}
function fullEffects(f: ReturnType<typeof fixture>) {
  for (let slot = 0; slot < 200; slot++) {
    const n = f.w.powerEffects.slots[slot].nativePrior!.slice();
    n[6] = 5;
    n[21] = 0;
    n[69] = 60;
    n[24] = 0;
    put16(n as number[], 15, slot);
    put16(n as number[], 7, 0);
    put16(n as number[], 9, 0);
    publishStagedSharedEffect(f.w, slot, n);
  }
  put16(f.w.missionPrefix, 0x3554, 200);
}

describe("campaign Recycling Plant selector4", () => {
  it("uses the first real linked plant before corpses, immediately unlinks/cleans/kind-clears it and retains native continuation", () => {
    const f = fixture(),
      { w, pack, services } = f;
    const a = plant(f, 0),
      b = plant(f, 1, 4, 11);
    corpse(f, 0, 100);
    const actor = w.specialists.records[0];
    put16(actor as number[], 127, b.index);
    actor[129] = 2;
    const terrain13 = w.terrain.bytes[worldCell(...b.position) * 14 + 13];
    const r = stepCampaignRecyclingPlant(w, 0, pack, services);
    expect(r.retired).toEqual([b.id]);
    expect(r.cleanedReferenceBytes).toBe(1);
    expect(w.specialists.records[0][129]).toBe(0);
    expect(u16(w.specialists.records[0] as number[], 127)).toBe(b.index);
    expect(w.ecology.plants[b.index].active).toBe(false);
    expect(w.ecology.plants[b.index].native[6]).toBe(0);
    expect(w.ecology.plants[b.index].native[5]).toBe(2); // Own retained next link still names plant0.
    expect(w.ecology.plants[b.index].native[3]).toBe(a.index);
    expect(w.spatial.nodes[b.id]).toBeUndefined();
    expect(w.ecology.plantOrder![worldCell(...b.position)]).toEqual([a.index]);
    expect(w.ecology.plantCount).toBe(1);
    expect(u16(w.missionPrefix, 0x3552)).toBe(1);
    expect(w.buildingNative[0][51]).toBe(46);
    expect(w.buildingNative[0][27]).toBe(1);
    expect(w.buildings[0].energy).toBe(199);
    expect(w.economy.buildings[0].extraDrain).toBe(3);
    expect(w.terrain.bytes[worldCell(...b.position) * 14 + 13]).toBe(terrain13);
    validateSpatial(w.spatial);
  });
  it("preserves source5FA after direct recycling of an owned plant", () => {
    const f = fixture();
    plant(f, 0, 0);
    stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services);
    expect(f.w.ecology.plantCount).toBe(0);
    expect(f.w.ecology.ownerPlantCounts[0]).toBe(1);
    expect(u16(f.w.players[0].raw, 0x5fa)).toBe(1);
  });
  it("selects the largest signed corpse weight with first-chain ties and exact byte payload, research cap and reference cleanup", () => {
    const f = fixture(2),
      { w, pack, services } = f;
    corpse(f, 0, 100);
    corpse(f, 1, 300);
    corpse(f, 2, 300);
    corpse(f, 3, 1000, 24);
    const excluded = corpse(f, 4, 2000);
    excluded[97] = 1;
    put32(w.players[0].raw, 0x61a + 4 * 4, 102390);
    const target = w.specialists.records[0];
    put16(target as number[], 127, 2);
    target[129] = 1;
    w.muleQueues[2] = [[123, 456]];
    const r = stepCampaignRecyclingPlant(w, 0, pack, services);
    expect(r.retired).toEqual(["source:0:2"]);
    expect(r.events).toContainEqual({
      type: "recycling-research",
      owner: 0,
      species: 4,
      before: 102390,
      after: 102400,
    });
    expect(w.buildingNative[0][51]).toBe((44 * 8 + 50) & 255);
    expect(w.ecology.mules.find((m) => m.index === 2)!.native[6]).toBe(0);
    expect(w.creatureNative[2]).toBe(
      w.ecology.mules.find((m) => m.index === 2)!.native,
    );
    expect(w.specialists.records[0][129]).toBe(0);
    expect(w.muleQueues[2]).toBeUndefined();
    expect(u16(w.missionPrefix, 0x3550)).toBe(4);
    validateSpatial(w.spatial);
  });
  it("deposits at frame0 with capped goop and real80780 credit20, audio and two actual code60 factories before consuming the next material", () => {
    const f = fixture(),
      { w, pack, services } = f;
    plant(f, 0);
    w.buildingNative[0][51] = 25;
    const draws = w.rng.draws,
      funds = w.players[0].funds;
    const r = stepCampaignRecyclingPlant(w, 0, pack, services);
    expect(r.events[0]).toEqual({
      type: "recycling-deposit",
      owner: 0,
      amount: 25,
      stored: 10,
      discarded: 15,
      credit: 20,
    });
    expect(w.players[0].goop).toBe(100);
    expect(w.economy.players[0].goop).toBe(100);
    expect(u32(w.players[0].raw, 13)).toBe(20);
    expect(u32(w.players[0].raw, 17)).toBe(20);
    expect(w.players[0].funds).toBe(funds); //80780 changes credit counters; income bookkeeping owns funds.
    expect(w.rng.draws - draws).toBe(8);
    expect(w.powerEffects.slots.filter((e) => e.occupied)).toHaveLength(2);
    for (const p of w.powerEffects.slots.filter((e) => e.occupied)) {
      expect(p.nativePrior![69]).toBe(60);
      expect(p.nativePrior![21]! & 1).toBe(0);
      expect(i16(p.nativePrior as number[], 7)).toBe(8448);
      expect(u32(p.nativePrior as number[], 39)).toBe(2048);
    }
    expect(w.audio.requests.at(-1)).toMatchObject({
      entity: "source:3:0",
      cue: 57,
      mode: 2,
      parameter: 1,
      initialRatePercent: 200,
    });
    expect(w.buildingNative[0][51]).toBe(30);
    expect(w.ecology.plantCount).toBe(0);
  });
  it("commits a capped deposit when all200 shared effects have equal priority, drawing only the six caller angles", () => {
    const f = fixture();
    fullEffects(f);
    f.w.buildingNative[0][51] = 30;
    const draws = f.w.rng.draws;
    stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services);
    expect(f.w.rng.draws - draws).toBe(6);
    expect(f.w.players[0].goop).toBe(100);
    expect(u32(f.w.players[0].raw, 13)).toBe(20);
    expect(f.w.buildingNative[0][51]).toBe(0);
    expect(f.w.powerEffects.slots.filter((e) => e.occupied)).toHaveLength(200);
  });
  it("includes the ordinary extra drain/upkeep once, ANB action and current-frame power warning mirrors", () => {
    const f = fixture(1),
      n = f.w.buildingNative[0];
    n[27] = 1;
    n[63] = 4;
    put16(n as number[], 61, 4);
    const r = stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services);
    expect(r.events).toContainEqual({
      type: "recycling-power-lost",
      owner: 0,
      warningStarted: true,
    });
    expect(i16(f.w.buildingNative[0] as number[], 61)).toBe(0);
    expect(f.w.buildings[0].energy).toBe(0);
    expect(f.w.economy.buildings[0].powered).toBe(false);
    expect(f.w.economy.buildings[0].extraDrain).toBe(3);
    expect(f.w.economy.players[0].noPowerWarningTicks).toBe(1000);
    expect(f.w.buildingNative[0][25]).toBe(2);
  });
  it("requires the actual grade1/2 collector only at the source cadence, with atomic missing-port failure", () => {
    for (const grade of [1, 2] as const) {
      const f = fixture(grade);
      f.w.frame = 256;
      const before = checksum(f.w);
      expect(() =>
        stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services),
      ).toThrow("missing-recycling-service-8D930-14040-collection");
      expect(checksum(f.w)).toBe(before);
      let received = 0;
      const r = stepCampaignRecyclingPlant(f.w, 0, f.pack, {
        ...f.services,
        dispatchCollection(staged, slot, range) {
          expect(staged).not.toBe(f.w);
          expect(slot).toBe(0);
          received = range;
          return false;
        },
      });
      expect(received).toBe(grade === 1 ? 1024 : 1536);
      expect(f.w.buildingNative[0][63]).toBe(0);
      expect(r.events.at(-1)).toEqual({
        type: "recycling-collection",
        range: received,
        dispatched: false,
      });
    }
  });
  it("preserves held native/player identity in the collector port and charges successful collection16", () => {
    const f = fixture(2);
    f.w.frame = 256;
    stepCampaignRecyclingPlant(f.w, 0, f.pack, {
      ...f.services,
      dispatchCollection(staged) {
        const n = staged.buildingNative[0],
          raw = staged.players[0].raw;
        expect(staged.creatureNative[0]).not.toBe(f.w.creatureNative[0]);
        //The collector service owns14040. This synthetic receipt checks only its host contract.
        n[48] = 9;
        raw[0x6e1] = 1;
        expect(staged.buildingNative[0]).toBe(n);
        expect(staged.players[0].raw).toBe(raw);
        return true;
      },
    });
    expect(f.w.buildingNative[0][63]).toBe(15);
    expect(f.w.buildingNative[0][48]).toBe(8);
    expect(f.w.economy.players[0].maxOperationalHQGrade).toBe(1);
  });
  it("runs in-place within an outer owner/slot pass while retaining every held economy, native and player identity across actual credit factories", () => {
    const f = fixture(),
      { w } = f;
    plant(f, 0);
    w.buildingNative[0][51] = 20;
    const economy = w.economy,
      buildings = economy.buildings,
      building = buildings[0],
      native = w.buildingNative[0],
      players = w.players,
      player = players[0],
      raw = player.raw,
      economyPlayer = economy.players[0],
      prefix = w.missionPrefix;
    const r = stepStagedCampaignRecyclingPlant(w, 0, f.pack, f.services);
    expect(w.economy).toBe(economy);
    expect(w.economy.buildings).toBe(buildings);
    expect(w.economy.buildings[0]).toBe(building);
    expect(w.buildingNative[0]).toBe(native);
    expect(w.players).toBe(players);
    expect(w.players[0]).toBe(player);
    expect(player.raw).toBe(raw);
    expect(w.economy.players[0]).toBe(economyPlayer);
    expect(w.missionPrefix).toBe(prefix);
    expect(building.energy).toBe(199);
    expect(building.extraDrain).toBe(3);
    expect(player.goop).toBe(100);
    expect(economyPlayer.goop).toBe(100);
    expect(w.powerEffects.slots.filter((s) => s.occupied)).toHaveLength(2);
    expect(r.retired).toEqual(["source:1:0"]);
  });
  it("rolls back a late profile failure after credit, RNG, spatial unlink, research and reference cleanup", () => {
    const f = fixture(2);
    corpse(f, 0, 42);
    f.w.buildingNative[0][51] = 5;
    put16(f.w.specialists.records[0] as number[], 127, 0);
    f.w.specialists.records[0][129] = 1;
    f.pack.assets.SYNTHREC.animations![3].last = 100;
    const before = checksum(f.w),
      native = f.w.buildingNative[0],
      player = f.w.players[0].raw;
    expect(() =>
      stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services),
    ).toThrow("Missing original animation");
    expect(checksum(f.w)).toBe(before);
    expect(f.w.buildingNative[0]).toBe(native);
    expect(f.w.players[0].raw).toBe(player);
  });
  it("rejects stale count or replaced held arrays without committing partial cleanup/deposit", () => {
    const f = fixture();
    plant(f, 0);
    put16(f.w.missionPrefix, 0x3552, 2);
    const before = checksum(f.w);
    expect(() =>
      stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services),
    ).toThrow("global material count");
    expect(checksum(f.w)).toBe(before);
    const g = fixture(1);
    g.w.frame = 256;
    const original = checksum(g.w);
    expect(() =>
      stepCampaignRecyclingPlant(g.w, 0, g.pack, {
        ...g.services,
        dispatchCollection(s) {
          s.buildingNative[0] = s.buildingNative[0].slice();
          return true;
        },
      }),
    ).toThrow("replaced a held native/player array");
    expect(checksum(g.w)).toBe(original);
  });
  it("round-trips the processing ANB/pending material and continues to the identical full-host checksum", () => {
    const f = fixture();
    plant(f, 0);
    stepCampaignRecyclingPlant(f.w, 0, f.pack, f.services);
    const loaded = loadCampaign(
      saveCampaign(f.w, { paused: true, speed: 2, accumulator: 7 }),
      f.w.contentHash,
    ).world;
    expect(checksum(loaded)).toBe(checksum(f.w));
    for (let i = 0; i < 40; i++) {
      for (const w of [f.w, loaded]) {
        w.frame++;
        stepCampaignRecyclingPlant(w, 0, f.pack, f.services);
      }
      expect(checksum(loaded)).toBe(checksum(f.w));
    }
    expect(u32(f.w.players[0].raw, 13)).toBe(20);
    expect(f.w.buildingNative[0][51]).toBe(0);
    validateCampaignWorld(loaded, f.w.contentHash);
  });
});
