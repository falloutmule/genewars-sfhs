import { describe, expect, it } from "vitest";
import {
  cloneSpatial,
  insertSpatial,
  moveSpatial,
  validateSpatial,
  type SpatialState,
} from "../src/sim/campaign/spatial";
import {
  cloneEconomyState,
  type EconomyState,
} from "../src/sim/mechanics/economy";
import {
  clonePowerEffectPool,
  type PowerEffectPool,
} from "../src/sim/mechanics/power-motion";
import {
  cloneSpecialistPool,
  type SpecialistPool,
} from "../src/sim/mechanics/specialist-native";

function economy(): EconomyState {
  return {
    width: 2,
    height: 2,
    resources: [7, 0, 13, 2],
    players: [
      {
        id: 0,
        goop: 11,
        capacity: 37,
        maxOperationalHQGrade: 1,
        generatedEnergy: 3,
        noPowerWarningTicks: 2,
        unusedGoopWarningTicks: 4,
      },
    ],
    buildings: [
      {
        id: 2,
        slot: 3,
        owner: 0,
        selector: 11,
        grade: 0,
        x: 15,
        y: 7,
        complete: true,
        disabled: false,
        capacitySuppressed: false,
        hqUpgradeSuppressed: false,
        powered: true,
        energy: 12,
        extraDrain: 1,
        depleted: false,
        storedGoop: 8,
        specialPowerDelivery: false,
        extractor: {
          cycle: 3,
          frame: 2,
          delay: 1,
          hold: 4,
          stepDelay: 2,
          workAudioActive: true,
        },
        producer: {
          animation: {
            action: 1,
            hold: 3,
            frame: 0,
            direction: -1,
            delay: 2,
            counter: 1,
          },
          audioRequested: true,
          audioRequests: [
            {
              type: "play",
              channel: 61,
              mode: 2,
              parameter: 255,
              volume: 90,
              range: 123,
            },
            { type: "stop", channel: 35 },
          ],
          lastFrame: null,
          lastPulse: false,
          lastDraw: 0,
        },
      },
      {
        id: 4,
        slot: 5,
        owner: 1,
        selector: 0,
        grade: 1,
        x: 31,
        y: 19,
        complete: false,
        disabled: true,
        capacitySuppressed: true,
        hqUpgradeSuppressed: true,
        powered: false,
        energy: 0,
        extraDrain: 0,
        depleted: true,
        storedGoop: 0,
        specialPowerDelivery: true,
        extractor: undefined,
      },
    ],
    packets: [{ id: 6, sourceId: 4, targetId: 2, payload: 5, x: 11, y: 9 }],
    nextPacketId: 7,
  };
}

describe("audited transaction copies", () => {
  it("copies spatial heads and nodes before a staged unlink/insert", () => {
    const before: SpatialState = { heads: Array(16384).fill(null), nodes: {} },
      terrain = { bytes: Array(16384 * 14).fill(0), revision: 0 };
    insertSpatial(before, terrain, "source:1:3", 17);
    insertSpatial(before, terrain, "source:4:9", 17);
    const baseline = structuredClone(before),
      terrainBefore = terrain.bytes.slice(),
      staged = cloneSpatial(before),
      stagedTerrain = { ...terrain, bytes: terrain.bytes.slice() };
    expect(staged).toStrictEqual(baseline);
    expect(staged.heads).not.toBe(before.heads);
    expect(staged.nodes).not.toBe(before.nodes);
    expect(staged.nodes["source:1:3"]).not.toBe(before.nodes["source:1:3"]);
    moveSpatial(staged, stagedTerrain, "source:4:9", 33);
    validateSpatial(staged);
    validateSpatial(before);
    expect(staged.heads[17]).toBe("source:1:3");
    expect(staged.heads[33]).toBe("source:4:9");
    expect(before).toStrictEqual(baseline);
    expect(terrain.bytes).toEqual(terrainBefore);
    before.nodes["source:1:3"].index = 27;
    expect(staged.nodes["source:1:3"].index).toBe(3);
  });

  it("detaches every economy mutable leaf, including queued producer audio", () => {
    const before = economy(),
      baseline = structuredClone(before),
      staged = cloneEconomyState(before);
    expect(staged).toStrictEqual(baseline);
    expect(Object.hasOwn(staged.buildings[1], "extractor")).toBe(true);
    expect(Object.hasOwn(staged.buildings[1], "producer")).toBe(false);
    staged.resources[0] = 0;
    staged.players[0].goop = 0;
    staged.packets[0].payload = 0;
    staged.buildings[0].energy = 0;
    staged.buildings[0].extractor!.frame = 0;
    const producer = staged.buildings[0].producer!;
    producer.animation.frame = 6;
    const play = producer.audioRequests[0];
    if (play.type !== "play") throw new Error("Synthetic play request missing");
    play.range = 456;
    producer.audioRequests[1].channel = 35;
    producer.audioRequests.push({ type: "stop", channel: 35 });
    expect(before).toStrictEqual(baseline);
    before.resources[1] = 5;
    before.players[0].capacity = 1;
    before.buildings[0].extractor!.cycle = 8;
    before.buildings[0].producer!.animation.delay = 10;
    before.buildings[0].producer!.audioRequests.length = 0;
    before.packets[0].x = 17;
    expect(staged.resources[1]).toBe(0);
    expect(staged.players[0].capacity).toBe(37);
    expect(staged.buildings[0].extractor!.cycle).toBe(3);
    expect(producer.animation.delay).toBe(2);
    expect(producer.audioRequests).toHaveLength(3);
    expect(staged.packets[0].x).toBe(11);
  });

  it("can mutate two independent stages without changing their input or sibling", () => {
    const before = economy(),
      first = cloneEconomyState(before),
      second = cloneEconomyState(before),
      baseline = structuredClone(before);
    first.buildings[0].producer!.audioRequests[0] = {
      type: "stop",
      channel: 35,
    };
    first.buildings.splice(1, 1);
    first.packets.length = 0;
    second.buildings[0].producer!.animation.counter = 7;
    second.resources.push(99);
    expect(before).toStrictEqual(baseline);
    expect(first.resources).toEqual(baseline.resources);
    expect(first.buildings[0].producer!.animation.counter).toBe(1);
    expect(second.buildings).toHaveLength(2);
    expect(second.packets).toEqual(baseline.packets);
    expect(second.buildings[0].producer!.audioRequests).toEqual(
      baseline.buildings[0].producer!.audioRequests,
    );
  });

  it("isolates live packet motion and inactive effect priors for slot reuse", () => {
    const before: PowerEffectPool = {
      slots: Array.from({ length: 200 }, (_, index) => ({
        occupied: index === 1,
        fractionX: index === 0 ? null : index,
        fractionY: index === 0 ? null : 255 - index,
        nativePrior: Array.from({ length: 81 }, (_, at) =>
          at >= 31 && at < 39 ? null : (at + index) & 255,
        ),
        packet:
          index === 1
            ? {
                id: 8,
                sourceId: 2,
                targetId: null,
                x: 17,
                y: 19,
                vx: 7,
                vy: -9,
                ground: 20,
                height: 532,
                frame: 4,
                timer: 0,
                yaw: 4,
                pitch: 512,
                speed: 11,
                motionYaw: 4,
                motionSpeed: 11,
              }
            : null,
      })),
    };
    // An absent prior and an explicitly undefined prior both remain distinct.
    delete before.slots[198].nativePrior;
    before.slots[199].nativePrior = undefined;
    const baseline = structuredClone(before),
      staged = clonePowerEffectPool(before);
    expect(staged).toStrictEqual(baseline);
    staged.slots[0].nativePrior![67] = 5;
    staged.slots[0].fractionX = 6;
    staged.slots[1].packet!.x = 23;
    staged.slots[1].occupied = false;
    expect(before).toStrictEqual(baseline);
    before.slots[1].packet!.vy = 37;
    before.slots[0].nativePrior![68] = 4;
    expect(staged.slots[1].packet!.vy).toBe(-9);
    expect(staged.slots[0].nativePrior![68]).toBe(68);
    expect(staged.slots[0].nativePrior![31]).toBeNull();
  });

  it("detaches retained specialist binding handles and every numeric prior", () => {
    const before: SpecialistPool = {
      schemaVersion: 1,
      records: Array.from({ length: 20 }, (_, index) =>
        Array.from({ length: 200 }, (_, at) =>
          at < 7 ? null : (index + at) & 255,
        ),
      ),
      bindings: Array(20).fill(null),
    };
    before.bindings[3] = {
      owner: 0,
      blueprintIndex: 5,
      style: 0,
      category: 1,
      resourceKey: 1,
      assetKey: "SYNTHETIC",
      sourceName: "data/spec/synthetic.anb",
      classSpeed: 7,
      blueprintOffset: 192,
      animationOffset: 31,
      resourceOffset: 196,
      internal: { offset: 176, targetOffset: 196 },
      vtable: "kind3",
    };
    const baseline = structuredClone(before),
      staged = cloneSpecialistPool(before);
    expect(staged).toStrictEqual(baseline);
    expect(staged.bindings[3]!.internal).not.toBe(before.bindings[3]!.internal);
    staged.records[0][10] = 42;
    staged.bindings[3]!.assetKey = "STAGED";
    // A temporary staged binding replacement must not corrupt its retained handle.
    staged.bindings[3]!.internal = { offset: 176, targetOffset: 196 };
    staged.bindings[0] = staged.bindings[3];
    expect(before).toStrictEqual(baseline);
    before.records[19][199] = null;
    before.bindings[3]!.sourceName = "changed";
    expect(staged.records[19][199]).toBe(218);
    expect(staged.records[0][0]).toBeNull();
    expect(staged.bindings[3]!.sourceName).toBe("data/spec/synthetic.anb");
  });
});
