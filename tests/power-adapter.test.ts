import { describe, expect, it } from "vitest";
import {
  applyPowerBuildingEvents,
  advancePowerProducerRng,
  createExtractorContactSmoke,
  extractorNeedsContact,
  initializePowerAdapter,
  planExtractorContactQueries,
  stepPowerEffects,
  synchronizePowerAdapter,
  type PowerAdapterWorld,
} from "../src/sim/campaign/power-adapter";
import {
  insertSpatial,
  unlinkSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import {
  stepEconomyBuildings,
  type EconomyRules,
  type EconomyBuilding,
} from "../src/sim/mechanics/economy";
import type { SourcePoolRegistry } from "../src/sim/campaign/source-pools";
import type { Pack } from "../src/content/types";
import { terrainFromBytes, worldCell } from "../src/sim/mechanics/terrain";
import { nextRandom } from "../src/sim/mechanics/random";

// Minimal synthetic protocol objects exercise adapter ports, not source-pack
// admission. Every original pack goes through the separate importer/schema.
const b64 = (v: number[]) => Buffer.from(v).toString("base64");
function source() {
  const raw = Array(200 * 73).fill(0),
    prefix = Array(0x355e).fill(0);
  for (let i = 0; i < 200; i++) {
    raw[i * 73 + 59] = (i * 7 + 13) & 255;
    raw[i * 73 + 60] = (i * 11 + 17) & 255;
  }
  prefix[0x1c5d + 1] = 2; // Synthetic gravity512.
  return {
    source: {
      pools: [
        { family: 4, capacity: 200, packedStride: 73, packedBase64: b64(raw) },
      ],
      missionPrefixBase64: b64(prefix),
      terrain: { solarGeneration: 0 },
    },
  } as unknown as SourcePoolRegistry;
}
function rules(): EconomyRules {
  return {
    evidence: "synthetic adapter profile",
    cellSize: 256,
    power: {
      distributorGeneration: [2, 3, 5],
      distributorRange: [1024, 2048, 3072],
      distributorCapacity: 60,
      distributorPulsePeriod: 8,
      distributorPulsePhase: [0, 2, 4],
      photonReleaseThreshold: 9,
      photonReleaseAmount: 10,
      packetPayloadCap: 31,
      consumerCapacity: 24,
      deliveryRadius: 128,
      noPowerWarningTicks: 20,
      noPowerWarningCooldownTicks: 13,
    },
    extractor: {
      upkeep: 1,
      harvestRadius: 1,
      harvestUnits: [2, 3, 5],
      goopPerResource: 3,
      cycleLength: 3,
      startFrame: 1,
      resetFrame: 6,
      harvestFrames: [2, 3],
      workDelay: 1,
      harvestExtraDrain: 2,
      frameHolds: [Array(8).fill(0), [], []],
    },
    capacity: {
      extractor: 30,
      store4: [11, 22, 33],
      store13: [13, 26, 39],
      unusedGoopWarningTicks: 17,
    },
  };
}
function pack(): Pack {
  return {
    economyRules: rules(),
    rules: {
      tables: {
        atan: Array.from({ length: 257 }, (_, i) =>
          Math.round((Math.atan(i / 256) * 1024) / Math.PI),
        ),
        sine: Array.from({ length: 2048 }, (_, i) =>
          Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
        ),
        cosine: Array.from({ length: 2048 }, (_, i) =>
          Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
        ),
        bounce: Array(8).fill(128),
      },
    },
    assets: {
      BPOWE: {
        kind: "animation",
        image: "data:image/png;base64,fixture",
        frames: Array.from({ length: 9 }, () => ({
          components: [],
          width: 1,
          height: 1,
          rawFlags: [0, 0, 0],
        })),
        animations: Array.from({ length: 2 }, () => ({
          first: 0,
          last: 8,
          rawTrailingWord: 9,
        })),
      },
      BSOLA: {
        kind: "animation",
        image: "data:image/png;base64,fixture",
        frames: Array.from({ length: 10 }, (_, index) => ({
          components: [],
          width: 1,
          height: 1,
          rawFlags: [index === 1 ? 2 : 0, 0, 0],
        })),
        animations: Array.from({ length: 2 }, () => ({
          first: 0,
          last: 9,
          rawTrailingWord: 10,
        })),
      },
      EFF: {
        kind: "animation",
        image: "data:image/png;base64,fixture",
        frames: Array.from({ length: 4 }, () => ({
          components: [],
          width: 1,
          height: 1,
          rawFlags: [0, 0, 0],
        })),
        animations: Array.from({ length: 7 }, () => ({
          first: 0,
          last: 3,
          rawTrailingWord: 4,
        })),
      },
    },
  } as unknown as Pack;
}
const building = (id: number, selector: number, x = 512): EconomyBuilding => ({
  id,
  selector,
  x,
  y: 512,
  slot: id - 10,
  owner: 0,
  grade: 0,
  complete: true,
  disabled: false,
  capacitySuppressed: false,
  hqUpgradeSuppressed: false,
  powered: false,
  energy: 12,
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
          stepDelay: 1,
          workAudioActive: false,
        },
      }
    : {}),
});
function world(): PowerAdapterWorld {
  const registry = source(),
    raw = Array(229376).fill(0);
  for (let cell = 0; cell < 16384; cell++) {
    raw[cell * 14 + 2] = 232;
    raw[cell * 14 + 3] = 3;
    raw[cell * 14 + 5] = 2;
  }
  return {
    source: registry,
    powerEffects: initializePowerAdapter(registry),
    frame: 0,
    rng: { seed: 7, draws: 19, ring: null },
    terrain: terrainFromBytes(raw),
    spatial: { heads: Array(16384).fill(null), nodes: {} },
    landings: [
      {
        slot: 0,
        owner: 0,
        point: [512, 512],
        height: 2000,
        phase: 4,
        timer: 0,
        vz: 0,
        accelerationZ: 0,
        particles: [],
        messageIndex: null,
        activationFrame: 0,
      },
    ],
    economy: {
      width: 128,
      height: 128,
      resources: Array(16384).fill(0),
      buildings: [building(10, 3), building(11, 11, 800)],
      players: [
        {
          id: 0,
          goop: 0,
          capacity: 30,
          maxOperationalHQGrade: 0,
          generatedEnergy: 0,
          noPowerWarningTicks: 0,
          unusedGoopWarningTicks: 0,
        },
      ],
      packets: [],
      nextPacketId: 0,
    },
  };
}
function buildingReceipt(w: PowerAdapterWorld) {
  const result = stepEconomyBuildings(
    w.economy,
    {
      frame: 0,
      solarGeneration: 0,
      packetSamples: [],
      contactResolvedBuildingIds: [],
    },
    rules(),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.receipt;
}

describe("source shared effect/power campaign adapter", () => {
  it("keeps ordered own/foreign live creature contact callbacks required even for grade0 damage0", () => {
    const w = world(),
      b = w.economy.buildings[1],
      cell = worldCell(b.x, b.y + 256);
    insertSpatial(w.spatial, w.terrain, "source:0:1", cell);
    insertSpatial(w.spatial, w.terrain, "source:0:2", cell);
    insertSpatial(w.spatial, w.terrain, "source:0:3", cell);
    const queried = planExtractorContactQueries(
      w.spatial,
      b,
      1 << 2,
      (index) => ({ owner: index === 1 ? 0 : index === 2 ? 4 : 2, state: 8 }),
    );
    expect(queried.queries).toEqual([
      {
        source: "foreign8B000",
        targetIndex: 2,
        damage: 0,
        virtual34Required: true,
      },
      {
        source: "own8B080",
        targetIndex: 1,
        damage: 0,
        virtual34Required: true,
      },
    ]);
    const corpses = planExtractorContactQueries(w.spatial, b, 0, () => ({
      owner: 4,
      state: 24,
    }));
    expect(corpses.queries.every((q) => !q.virtual34Required)).toBe(true);
  });
  it("consumes the Distributor pulse draw even without targets and preserves OLD-frame animation direction", () => {
    const w = world();
    w.economy.buildings = [w.economy.buildings[0]];
    w.rng.seed = 0;
    const b = w.economy.buildings[0],
      beforeDraws = w.rng.draws;
    const first = advancePowerProducerRng(w, b, pack());
    expect(first).toMatchObject({ pulse: true, draw: 0 });
    expect(first.audio).toEqual([
      {
        type: "play",
        channel: 61,
        mode: 2,
        parameter: 0,
        volume: 127,
        range: 100,
      },
    ]);
    expect(w.rng.draws).toBe(beforeDraws + 1);
    expect(b.energy).toBe(12);
    expect(b.producer!.animation).toMatchObject({
      action: 1,
      frame: 1,
      direction: 0,
      delay: 0,
    });
    advancePowerProducerRng(w, b, pack());
    expect(w.rng.draws).toBe(beforeDraws + 1);
    w.frame = 1;
    advancePowerProducerRng(w, b, pack());
    expect(w.rng.draws).toBe(beforeDraws + 1);
    expect(b.producer!.animation).toMatchObject({ frame: 2, direction: 1 });
  });

  it("uses Photon stop/play gates, delay3 and actual imported running-frame holds", () => {
    const w = world();
    const b = w.economy.buildings[0];
    b.selector = 6;
    b.energy = 10;
    w.rng.seed = 0;
    const receipt = advancePowerProducerRng(w, b, pack());
    expect(receipt.audio).toEqual([
      { type: "stop", channel: 35 },
      {
        type: "play",
        channel: 35,
        mode: 2,
        parameter: 255,
        volume: 90,
        range: 400,
      },
    ]);
    expect(b.producer!.animation).toMatchObject({
      frame: 1,
      direction: 0,
      delay: 3,
      counter: 3,
      hold: 2,
    });
    expect(b.producer!.audioRequested).toBe(true);
    const saved = JSON.parse(JSON.stringify(w.economy));
    w.economy = saved;
    b.energy = 0;
    const restored = w.economy.buildings[0];
    restored.energy = 0;
    w.frame = 1;
    advancePowerProducerRng(w, restored, pack());
    expect(restored.producer!.animation).toMatchObject({
      frame: 1,
      counter: 2,
      hold: 2,
    });
    expect(w.rng.draws).toBe(20);
  });

  it("predicts source cap-triggered pulses and strict Photon thresholds before numerical commit", () => {
    const w = world(),
      b = w.economy.buildings[0];
    w.frame = 1;
    b.energy = 59;
    expect(advancePowerProducerRng(w, b, pack()).pulse).toBe(true);
    expect(w.rng.draws).toBe(20);
    expect(b.energy).toBe(59);
    b.selector = 6;
    b.energy = 9;
    b.producer = undefined;
    w.frame = 2;
    expect(advancePowerProducerRng(w, b, pack())).toMatchObject({
      pulse: false,
      draw: null,
    });
    expect(w.rng.draws).toBe(20);
  });

  it("preserves native producer-before-Extractor draw order through actual smoke allocation", () => {
    const w = world(),
      expected = { ...w.rng },
      b = w.economy.buildings[1];
    b.extractor!.frame = 2;
    advancePowerProducerRng(w, w.economy.buildings[0], pack());
    createExtractorContactSmoke(w, b, pack());
    for (let i = 0; i < 5; i++) nextRandom(expected);
    expect(w.rng).toEqual(expected);
    expect(w.economy.buildings[0].producer!.lastFrame).toBe(0);
    expect(w.landings[0].particles).toHaveLength(1);
  });
  it("reads actual packed fractions59/60 for every slot instead of native-zero assumptions", () => {
    const p = initializePowerAdapter(source());
    expect(p.slots[0]).toMatchObject({
      fractionX: 13,
      fractionY: 17,
      occupied: false,
      packet: null,
    });
    expect(p.slots[0].nativePrior?.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(p.slots[0].nativePrior?.slice(67, 69)).toEqual([13, 17]);
    expect(p.slots[199].fractionX).toBe((199 * 7 + 13) & 255);
    expect(p.slots[199].fractionY).toBe((199 * 11 + 17) & 255);
  });

  it("commits real packet factories/spatial links then motion-delivery-retirement without RNG", () => {
    const w = world(),
      p = pack(),
      rng = { ...w.rng };
    const allocated = applyPowerBuildingEvents(w, buildingReceipt(w), p);
    expect(allocated).toEqual([{ packetId: 0, slot: 0 }]);
    expect(w.powerEffects.slots[0].packet!.x).toBe(512);
    expect(w.spatial.nodes["source:4:0"].cell).toBe(worldCell(512, 512));
    expect(w.economy.buildings[1].energy).toBe(11);
    for (let step = 0; step < 5; step++) stepPowerEffects(w, p);
    expect(w.economy.packets).toHaveLength(0);
    // Four misses consume one payload each before the fifth inclusive-radius
    // observation delivers the remaining10 to the consumer's existing11.
    expect(w.economy.buildings[1].energy).toBe(21);
    expect(w.powerEffects.slots[0].packet).toBeNull();
    expect(w.powerEffects.slots[0].occupied).toBe(false);
    expect(w.powerEffects.slots[0].fractionX).toBe(13);
    expect(w.spatial.nodes["source:4:0"]).toBeUndefined();
    expect(w.rng).toEqual(rng);
    validateSpatial(w.spatial);
  });

  it("reserves live landing particles and retains their final fractions after filtered retirement", () => {
    const w = world();
    const particle = {
      slot: 0,
      code: 6 as const,
      x: 512,
      y: 512,
      fractionX: 91,
      fractionY: 93,
      height: 2000,
      ground: 2000,
      vx: 0,
      vy: 0,
      vz: 0,
      accelerationZ: 0,
      animation: {
        action: 6,
        hold: 0,
        frame: 0,
        direction: 1,
        delay: 1,
        counter: 0,
      },
    };
    w.landings[0].particles.push(particle);
    insertSpatial(w.spatial, w.terrain, "source:4:0", worldCell(512, 512));
    synchronizePowerAdapter(w);
    expect(w.powerEffects.slots[0].fractionX).toBe(91);
    expect(
      applyPowerBuildingEvents(w, buildingReceipt(w), pack())[0].slot,
    ).toBe(1);
    particle.fractionX = 201;
    particle.fractionY = 203;
    w.landings[0].particles = [];
    unlinkSpatial(w.spatial, w.terrain, "source:4:0");
    synchronizePowerAdapter(w, [particle]);
    expect(w.powerEffects.slots[0]).toMatchObject({
      fractionX: 201,
      fractionY: 203,
      occupied: false,
      packet: null,
    });
    expect(w.powerEffects.slots[0].nativePrior?.[6]).toBe(0);
    expect(w.powerEffects.slots[0].nativePrior?.slice(67, 70)).toEqual([
      201, 203, 6,
    ]);
  });

  it("clears destroyed targets and decays zero payload to255 before expiry without redirecting a reused ID", () => {
    const w = world();
    applyPowerBuildingEvents(w, buildingReceipt(w), pack());
    w.economy.packets[0].payload = 0;
    w.economy.buildings = w.economy.buildings.filter((b) => b.id !== 11);
    stepPowerEffects(w, pack());
    expect(w.economy.packets[0].payload).toBe(255);
    expect(w.powerEffects.slots[0].packet!.targetId).toBeNull();
    w.economy.buildings.push(building(11, 11, 576));
    stepPowerEffects(w, pack());
    expect(w.economy.buildings[1].energy).toBe(12);
    expect(w.economy.packets[0].payload).toBe(254);
    w.economy.packets[0].payload = 1;
    stepPowerEffects(w, pack());
    expect(w.economy.packets).toHaveLength(0);
    expect(w.spatial.nodes["source:4:0"]).toBeUndefined();
  });

  it("rolls back the building receipt when shared pool allocation cannot complete", () => {
    const w = world();
    for (let i = 0; i < 200; i++)
      insertSpatial(w.spatial, w.terrain, `source:4:${i}`, i);
    const before = structuredClone(w),
      receipt = buildingReceipt(w);
    expect(() => applyPowerBuildingEvents(w, receipt, pack())).toThrow(
      "replacement-required",
    );
    expect(w).toEqual(before);
  });

  it("creates actual Extractor smoke with3contact+1factory draws and original shared fraction priors", () => {
    const w = world(),
      b = w.economy.buildings[1];
    b.extractor!.frame = 2;
    w.frame = 0;
    const expected = { ...w.rng };
    for (let i = 0; i < 4; i++) nextRandom(expected);
    expect(createExtractorContactSmoke(w, b, pack())).toEqual({
      created: true,
      slot: 0,
    });
    expect(w.rng).toEqual(expected);
    expect(w.landings[0].particles).toHaveLength(1);
    const smoke = w.landings[0].particles[0];
    expect(smoke).toMatchObject({
      slot: 0,
      code: 6,
      x: 800,
      y: 768,
      fractionX: 13,
      fractionY: 17,
      height: 2000,
      ground: 2000,
      accelerationZ: -8,
    });
    expect(w.spatial.nodes["source:4:0"].cell).toBe(worldCell(800, 768));
    expect(w.powerEffects.slots[0].occupied).toBe(true);
  });

  it("honors contact parity and cycle restart gates, and rolls back failed smoke factories", () => {
    const w = world(),
      b = w.economy.buildings[1];
    b.extractor!.frame = 2;
    w.frame = 1;
    const before = structuredClone(w);
    expect(createExtractorContactSmoke(w, b, pack())).toEqual({
      created: false,
      slot: null,
    });
    expect(w).toEqual(before);
    b.extractor!.cycle = 3;
    expect(extractorNeedsContact(b, 0, 30, rules())).toBe(false);
    expect(extractorNeedsContact(b, 30, 30, rules())).toBe(true);
    b.extractor!.cycle = 0;
    w.frame = 0;
    for (let i = 0; i < 200; i++)
      insertSpatial(w.spatial, w.terrain, `source:4:${i}`, i);
    const full = structuredClone(w);
    expect(() => createExtractorContactSmoke(w, b, pack())).toThrow(
      "full-pool replacement",
    );
    expect(w).toEqual(full);
  });
});
