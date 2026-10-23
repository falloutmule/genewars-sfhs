import { describe, expect, it } from "vitest";
import {
  aggregateEconomyCapacity,
  stepEconomy,
  stepEconomyBuildings,
  stepEconomyPackets,
  type EconomyBuilding,
  type EconomyContext,
  type EconomyReceipt,
  type EconomyRules,
  type EconomyState,
} from "../src/sim/mechanics/economy";

// Deliberately synthetic profile: no original table/ANB/campaign fixtures.
const rules = (): EconomyRules => ({
  evidence: "synthetic economy test profile; source semantic contracts only",
  cellSize: 8,
  power: {
    distributorGeneration: [2, 3, 5],
    distributorRange: [14, 18, 22],
    distributorCapacity: 60,
    distributorPulsePeriod: 8,
    distributorPulsePhase: [0, 2, 4],
    photonReleaseThreshold: 9,
    photonReleaseAmount: 10,
    packetPayloadCap: 31,
    consumerCapacity: 24,
    deliveryRadius: 3,
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
    frameHolds: [Array(8).fill(0), Array(9).fill(0), Array(10).fill(0)],
  },
  capacity: {
    extractor: 30,
    store4: [11, 22, 33],
    store13: [13, 26, 39],
    unusedGoopWarningTicks: 17,
  },
});
const building = (
  id: number,
  selector: number,
  patch: Partial<EconomyBuilding> = {},
): EconomyBuilding => ({
  id,
  slot: id,
  owner: 0,
  selector,
  grade: 0,
  x: 16,
  y: 16,
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
  ...patch,
});
const state = (buildings: EconomyBuilding[] = []): EconomyState => ({
  width: 8,
  height: 8,
  resources: Array(64).fill(0),
  buildings,
  players: [
    {
      id: 0,
      goop: 0,
      capacity: 0,
      maxOperationalHQGrade: 0,
      generatedEnergy: 0,
      noPowerWarningTicks: 0,
      unusedGoopWarningTicks: 0,
    },
  ],
  packets: [],
  nextPacketId: 0,
});
const context = (patch: Partial<EconomyContext> = {}): EconomyContext => ({
  frame: 0,
  solarGeneration: 0,
  packetSamples: [],
  contactResolvedBuildingIds: [],
  ...patch,
});
function run(s: EconomyState, c = context(), r = rules()): EconomyReceipt {
  const result = stepEconomy(s, c, r);
  if (!result.ok) throw new Error(result.reason);
  return result.receipt;
}
function harvesting(id = 1, grade: 0 | 1 | 2 = 0) {
  const b = building(id, 11, { grade });
  b.extractor!.frame = 2;
  b.extractor!.delay = 1;
  return b;
}

describe("source-backed power family with explicit synthetic rules", () => {
  it("separates source buildings before effects without granting same-frame consumption", () => {
    const s = state([building(0, 11, { energy: 0 })]);
    s.packets = [{ id: 0, sourceId: 9, targetId: 0, payload: 8, x: 0, y: 0 }];
    s.nextPacketId = 1;
    const buildings = stepEconomyBuildings(
      s,
      context({ packetSamples: [{ id: 0, x: 16, y: 16 }] }),
      rules(),
    );
    if (!buildings.ok) throw new Error(buildings.reason);
    expect(buildings.receipt.state.buildings[0].energy).toBe(0);
    expect(buildings.receipt.state.packets).toEqual(s.packets);
    expect(buildings.receipt.state.buildings[0].extractor!.cycle).toBe(0);
    const packets = stepEconomyPackets(
      buildings.receipt.state,
      [{ id: 0, x: 16, y: 16 }],
      rules(),
    );
    if (!packets.ok) throw new Error(packets.reason);
    expect(packets.receipt.state.buildings[0].energy).toBe(8);
    expect(packets.receipt.state.buildings[0].extractor!.cycle).toBe(0);
    expect(packets.receipt.state.players).toEqual(
      buildings.receipt.state.players,
    );
    const next = stepEconomyBuildings(
      packets.receipt.state,
      context({ frame: 1 }),
      rules(),
    );
    if (!next.ok) throw new Error(next.reason);
    expect(next.receipt.state.buildings[0].energy).toBe(7);
    expect(next.receipt.state.buildings[0].extractor!.cycle).toBe(1);
  });

  it("packet-only delivery admits no unknown building animation and honors a destroyed destination kind", () => {
    const s = state([building(0, 11, { grade: 1 })]);
    s.buildings[0].extractor = undefined;
    s.packets = [
      { id: 0, sourceId: 9, targetId: 0, payload: 1, x: 0, y: 0 },
      { id: 1, sourceId: 9, targetId: 0, payload: 0, x: 0, y: 0 },
    ];
    s.nextPacketId = 2;
    const p = stepEconomyPackets(
      s,
      [
        { id: 0, x: 16, y: 16, targetValid: false },
        { id: 1, x: 16, y: 16, targetValid: false },
      ],
      rules(),
    );
    if (!p.ok) throw new Error(p.reason);
    expect(p.receipt.state.buildings[0].energy).toBe(12);
    expect(p.receipt.state.packets).toMatchObject([{ id: 1, payload: 255 }]);
    expect(p.receipt.events).toContainEqual({
      type: "packet-expired",
      packetId: 0,
    });
  });

  it("packet phase dispatches observations in host source-slot order after stable slot reuse", () => {
    const s = state([building(0, 0)]);
    s.packets = [0, 1].map((id) => ({
      id,
      sourceId: 9,
      targetId: 0,
      payload: 2,
      x: 0,
      y: 0,
    }));
    s.nextPacketId = 2;
    const r = stepEconomyPackets(
      s,
      [
        { id: 1, x: 16, y: 16 },
        { id: 0, x: 16, y: 16 },
      ],
      rules(),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(
      r.receipt.events
        .filter((e) => e.type === "packet-delivered")
        .map((e) => e.packetId),
    ).toEqual([1, 0]);
  });
  it("divides Distributor storage among eligible consumers in slot order without instant credit", () => {
    const s = state([
      building(5, 3),
      building(2, 11),
      building(1, 0),
      building(3, 8),
      building(4, 6, { energy: 0 }),
    ]);
    const receipt = run(s);
    expect(receipt.state.packets.map((p) => [p.targetId, p.payload])).toEqual([
      [1, 7],
      [2, 7],
    ]);
    expect(receipt.state.buildings.find((b) => b.id === 5)!.energy).toBe(0);
    expect(receipt.state.buildings.find((b) => b.id === 2)!.energy).toBe(11);
    expect(receipt.state.players[0].generatedEnergy).toBe(2);
    expect(receipt.reasons).toContainEqual({
      buildingId: 5,
      reason: "power-dispatched",
    });
  });

  it("uses each grade's phase, generation and range, and does not borrow another owner's targets", () => {
    for (const grade of [0, 1, 2] as const) {
      const s = state([
        building(0, 3, { grade, energy: 0 }),
        building(1, 0, { x: 16 + rules().power.distributorRange[grade] }),
      ]);
      const wait = run(
        s,
        context({ frame: rules().power.distributorPulsePhase[grade] + 1 }),
      );
      expect(wait.state.packets).toHaveLength(0);
      const fire = run(
        s,
        context({ frame: rules().power.distributorPulsePhase[grade] }),
      );
      expect(fire.state.packets[0].payload).toBe(
        rules().power.distributorGeneration[grade],
      );
    }
    const s = state([building(0, 3), building(1, 0, { owner: 1 })]);
    s.players.push({ ...s.players[0], id: 1 });
    expect(run(s).state.packets).toHaveLength(0);
  });

  it("retains Distributor energy without targets and flushes a full store outside its phase", () => {
    const s = state([building(0, 3, { energy: 59 })]);
    expect(run(s, context({ frame: 1 })).state.buildings[0].energy).toBe(60);
    s.buildings.push(building(1, 0));
    const receipt = run(s, context({ frame: 1 }));
    expect(receipt.state.packets[0].payload).toBe(31);
    expect(receipt.state.buildings[0].energy).toBe(0);
  });

  it("Photon threshold is strict, uses mission solar plus grade, and discards packets without targets", () => {
    const s = state([building(0, 6, { grade: 1, energy: 8 })]);
    expect(run(s).state.buildings[0].energy).toBe(9);
    const flushed = run(s, context({ solarGeneration: 1 }));
    expect(flushed.state.buildings[0].energy).toBe(0);
    expect(flushed.state.packets).toHaveLength(0);
    expect(flushed.reasons[0].reason).toBe("no-recipients");
  });

  it("Photon uses recipient Distributor range and its distinct disabled-target filter", () => {
    const s = state([
      building(0, 6, { energy: 10 }),
      building(1, 3, { grade: 2, x: 36, disabled: true }),
      building(2, 3, { grade: 0, x: 36, disabled: true }),
      building(3, 11, { x: 17 }),
    ]);
    const receipt = run(s);
    expect(
      receipt.state.packets.map((p) => [p.sourceId, p.targetId, p.payload]),
    ).toEqual([[0, 1, 10]]);
  });

  it("subtracts transient drain before generation, decrements it, and preserves signed producer arithmetic", () => {
    const s = state([
      building(0, 3, { energy: 3, extraDrain: 4 }),
      building(1, 0),
    ]);
    const receipt = run(s);
    expect(receipt.state.packets[0].payload).toBe(1);
    expect(receipt.state.buildings[0].extraDrain).toBe(3);
    s.buildings[0].energy = -7;
    expect(run(s).state.packets[0].payload).toBe(31);
  });

  it("a nonempty Distributor target set consumes storage even when its integer shares are zero", () => {
    const s = state([
      building(0, 3, { energy: -1 }),
      building(1, 0),
      building(2, 0),
    ]);
    const receipt = run(s);
    expect(receipt.state.packets).toHaveLength(0);
    expect(receipt.state.buildings[0].energy).toBe(0);
  });

  it("delivery consumes remaining payload, honors caps, and restores power only on arrival", () => {
    const s = state([
      building(0, 11, { energy: 23 }),
      building(1, 3, { energy: 58, disabled: true }),
    ]);
    s.packets = [
      { id: 0, sourceId: 9, targetId: 0, payload: 8, x: 0, y: 0 },
      { id: 1, sourceId: 9, targetId: 1, payload: 8, x: 0, y: 0 },
    ];
    s.nextPacketId = 2;
    const receipt = run(
      s,
      context({
        frame: 1,
        packetSamples: [
          { id: 0, x: 16, y: 16 },
          { id: 1, x: 16, y: 16 },
        ],
      }),
    );
    expect(receipt.state.packets).toHaveLength(0);
    expect(receipt.state.buildings.map((b) => b.energy)).toEqual([23, 60]);
    expect(
      receipt.events
        .filter((e) => e.type === "packet-delivered")
        .map((e) => e.credited),
    ).toEqual([1, 2]);
    expect(receipt.events).toContainEqual({
      type: "power-restored",
      buildingId: 0,
    });
  });

  it("pauses unsampled packets, decays sampled misses, and preserves byte-zero wrap", () => {
    const s = state();
    s.packets = [0, 1, 2].map((id) => ({
      id,
      sourceId: 9,
      targetId: 8,
      payload: id,
      x: 0,
      y: 0,
    }));
    s.nextPacketId = 3;
    const receipt = run(
      s,
      context({
        packetSamples: [
          { id: 0, x: 5, y: 6 },
          { id: 1, x: 5, y: 6 },
        ],
      }),
    );
    expect(receipt.state.packets.map((p) => [p.id, p.payload])).toEqual([
      [0, 255],
      [2, 2],
    ]);
    expect(receipt.events).toContainEqual({
      type: "packet-expired",
      packetId: 1,
    });
  });

  it("delivers across a toroidal seam at the inclusive delivery radius", () => {
    const s = state([building(0, 0, { x: 1, y: 1, energy: 0 })]);
    s.packets = [{ id: 0, sourceId: 9, targetId: 0, payload: 7, x: 0, y: 0 }];
    s.nextPacketId = 1;
    const receipt = run(
      s,
      context({ packetSamples: [{ id: 0, x: 62, y: 1 }] }),
    );
    expect(receipt.state.buildings[0].energy).toBe(7);
  });

  it("rolls back late special-delivery and unresolved-contact boundaries", () => {
    const s = state([
      building(0, 0),
      building(1, 12, { specialPowerDelivery: true }),
    ]);
    s.packets = [0, 1].map((id) => ({
      id,
      sourceId: 9,
      targetId: id,
      payload: 5,
      x: 0,
      y: 0,
    }));
    s.nextPacketId = 2;
    const before = structuredClone(s);
    const result = stepEconomy(
      s,
      context({
        packetSamples: [
          { id: 0, x: 16, y: 16 },
          { id: 1, x: 16, y: 16 },
        ],
      }),
      rules(),
    );
    expect(result).toEqual({
      ok: false,
      reason: "special-power-delivery-required",
      buildingId: 1,
      packetId: 1,
    });
    expect(s).toEqual(before);
    const contact = state([building(0, 3), harvesting()]);
    const copy = structuredClone(contact);
    expect(stepEconomy(contact, context(), rules())).toEqual({
      ok: false,
      reason: "extractor-contact-pass-required",
      buildingId: 1,
    });
    expect(contact).toEqual(copy);
  });
});

describe("source-backed Extractor GOOP production and storage", () => {
  it("chooses the first strictly richest wrapped cell, consumes grade units and caps credit", () => {
    const s = state([harvesting(0, 2)]);
    s.buildings[0].x = 0;
    s.buildings[0].y = 0;
    s.resources[63] = 9;
    s.resources[0] = 9;
    s.players[0].goop = 29;
    const receipt = run(s, context({ contactResolvedBuildingIds: [0] }));
    expect(receipt.state.resources[63]).toBe(4);
    expect(receipt.state.resources[0]).toBe(9);
    expect(receipt.state.players[0].goop).toBe(30);
    expect(receipt.state.buildings[0].extraDrain).toBe(1);
    expect(receipt.events).toContainEqual({
      type: "goop-harvested",
      buildingId: 0,
      cell: 63,
      consumed: 5,
      credited: 1,
    });
  });

  it("requests terrain cleanup upon depletion and only shuts down after a later empty harvest", () => {
    const s = state([harvesting(0)]);
    s.resources[9] = 2;
    const first = run(s, context({ contactResolvedBuildingIds: [0] }));
    expect(first.events).toContainEqual({
      type: "terrain-depleted",
      buildingId: 0,
      cell: 9,
    });
    expect(first.state.buildings[0].disabled).toBe(false);
    const second = run(
      first.state,
      context({ contactResolvedBuildingIds: [0] }),
    );
    expect(second.state.buildings[0].disabled).toBe(true);
    expect(second.state.buildings[0].depleted).toBe(true);
    expect(second.state.players[0].capacity).toBe(30);
    expect(second.reasons).toContainEqual({
      buildingId: 0,
      reason: "resource-exhausted",
    });
  });

  it("full capacity blocks harvesting without consuming resources but keeps the contact boundary", () => {
    const s = state([harvesting(0)]);
    s.resources[9] = 10;
    s.players[0].goop = 30;
    const receipt = run(s, context({ contactResolvedBuildingIds: [0] }));
    expect(receipt.state.resources[9]).toBe(10);
    expect(receipt.reasons).toContainEqual({
      buildingId: 0,
      reason: "capacity-full",
    });
    expect(stepEconomy(s, context(), rules())).toEqual({
      ok: false,
      reason: "extractor-contact-pass-required",
      buildingId: 0,
    });
  });

  it("starts the work cycle on the old counter threshold, with no instant resource gain", () => {
    const s = state([building(0, 11)]);
    s.buildings[0].extractor!.cycle = 2;
    const first = run(s);
    expect(first.state.buildings[0].extractor!.cycle).toBe(3);
    expect(first.state.buildings[0].extractor!.frame).toBe(0);
    const second = run(first.state);
    expect(second.state.buildings[0].extractor!.cycle).toBe(0);
    expect(second.state.buildings[0].extractor!.frame).toBe(1);
    expect(second.events).toContainEqual({
      type: "audio",
      buildingId: 0,
      cue: "work-start",
    });
    expect(second.state.players[0].goop).toBe(0);
  });

  it("power loss pauses the cycle while finishing animation; delivery resumes the existing cycle", () => {
    const s = state([building(0, 11, { energy: 1, powered: true })]);
    s.buildings[0].extractor!.cycle = 2;
    const lost = run(s);
    expect(lost.state.buildings[0].extractor!.cycle).toBe(2);
    expect(lost.events).toContainEqual({ type: "power-lost", buildingId: 0 });
    expect(lost.events).toContainEqual({
      type: "notice",
      playerId: 0,
      cause: "no-power",
    });
    expect(lost.state.players[0].noPowerWarningTicks).toBe(12);
    lost.state.packets = [
      { id: 0, sourceId: 9, targetId: 0, payload: 8, x: 0, y: 0 },
    ];
    lost.state.nextPacketId = 1;
    const restored = run(
      lost.state,
      context({ packetSamples: [{ id: 0, x: 16, y: 16 }] }),
    );
    expect(restored.state.buildings[0].energy).toBe(7);
    expect(restored.state.buildings[0].extractor!.cycle).toBe(3);
    expect(restored.events).toContainEqual({
      type: "power-restored",
      buildingId: 0,
    });
  });

  it("takes signed animation delay and unsigned frame holds from the supplied grade animation", () => {
    const r = rules();
    const holds = [...r.extractor.frameHolds[0]];
    holds[4] = 2;
    r.extractor.frameHolds = [
      holds,
      r.extractor.frameHolds[1],
      r.extractor.frameHolds[2],
    ];
    const s = state([building(0, 11)]);
    Object.assign(s.buildings[0].extractor!, { frame: 4, hold: 2, delay: -1 });
    const receipt = run(s, context(), r);
    expect(receipt.state.buildings[0].extractor).toMatchObject({
      frame: 4,
      hold: 1,
      delay: 1,
    });
    const missing = rules();
    missing.extractor.frameHolds = [[], [], []];
    expect(stepEconomy(s, context(), missing)).toEqual({
      ok: false,
      reason: "extractor-animation-profile-required",
    });
  });

  it("allocates GOOP across Extractors in native slot order and reports discarded excess", () => {
    const s = state([building(5, 11), building(1, 11)]);
    s.players[0].goop = 75;
    const receipt = run(s);
    expect(receipt.state.buildings.map((b) => b.storedGoop)).toEqual([30, 30]);
    expect(receipt.state.players[0].goop).toBe(60);
    expect(receipt.events).toContainEqual({
      type: "goop-discarded",
      playerId: 0,
      amount: 15,
    });
    s.players[0].goop = 35;
    expect(run(s).state.buildings.map((b) => b.storedGoop)).toEqual([5, 30]);
  });

  it("capacity honors suppression and grade; unfinished and depleted storage still contributes", () => {
    const b = [
      building(0, 11, { complete: false }),
      building(1, 11, { disabled: true, depleted: true }),
      building(2, 4, { grade: 2 }),
      building(3, 13, { grade: 1 }),
      building(4, 11, { capacitySuppressed: true }),
      building(5, 0, { grade: 2 }),
      building(6, 0, { grade: 1, hqUpgradeSuppressed: true }),
    ];
    expect(aggregateEconomyCapacity(b, 0, rules())).toEqual({
      capacity: 119,
      maxOperationalHQGrade: 2,
    });
  });

  it("does not turn unsupported additional storage allocation into an invented rule", () => {
    const s = state([building(0, 4)]);
    s.players[0].goop = 1;
    expect(stepEconomy(s, context(), rules())).toEqual({
      ok: false,
      reason: "additional-storage-allocation-required",
    });
    expect(s.players[0].goop).toBe(1);
  });

  it("preserves nonpositive secondary funds and compares resource credit eligibility unsigned", () => {
    const s = state([harvesting(0)]);
    s.players[0].goop = -1;
    s.resources[9] = 8;
    const receipt = run(s, context({ contactResolvedBuildingIds: [0] }));
    expect(receipt.state.resources[9]).toBe(8);
    expect(receipt.state.players[0].goop).toBe(-1);
    expect(receipt.reasons[0].reason).toBe("capacity-full");
  });

  it("collects enabled completed consumer timer samples and excludes generator selectors", () => {
    const s = state([
      building(0, 0, { energy: 8 }),
      building(1, 11, { energy: 15 }),
      building(2, 3),
      building(3, 6),
      building(4, 8),
      building(5, 0, { energy: 99, disabled: true }),
    ]);
    const receipt = run(s, context({ frame: 1 }));
    expect(receipt.powerSamples).toEqual([
      { playerId: 0, count: 2, mean: 11, minimum: 8, maximum: 14 },
    ]);
  });

  it("is deterministic, leaves every input untouched, and rejects malformed partitions", () => {
    const s = state([building(0, 3), building(1, 11)]);
    const c = context();
    const r = rules();
    const original = structuredClone({ s, c, r });
    expect(stepEconomy(s, c, r)).toEqual(stepEconomy(s, c, r));
    expect({ s, c, r }).toEqual(original);
    s.buildings[1].slot = 0;
    expect(stepEconomy(s, c, r)).toEqual({
      ok: false,
      reason: "invalid-economy-building",
    });
  });

  it("runs lazy host callbacks and allocation in owner/slot order without removing consumers from recipient state", () => {
    const s = state([
      building(1, 4),
      building(0, 3),
      building(2, 4, { owner: 1, slot: 0 }),
    ]);
    s.players.push({ ...s.players[0], id: 1 });
    const trace: string[] = [];
    const result = stepEconomyBuildings(
      s,
      context({
        services: {
          beforeBuilding(_s, b) {
            trace.push(`before:${b.owner}:${b.slot}`);
          },
          buildingCallback(current, b, p) {
            if (b.selector !== 4) return false;
            expect(current.buildings).toHaveLength(3);
            p.goop += 2;
            return true;
          },
          afterBuilding(_s, b) {
            trace.push(`after:${b.owner}:${b.slot}`);
          },
          allocateOwner(_s, p) {
            trace.push(`allocate:${p.id}:${p.goop}`);
            return true;
          },
          afterOwner(_s, p) {
            trace.push(`end:${p.id}`);
          },
        },
      }),
      rules(),
    );
    expect(result.ok).toBe(true);
    expect(trace).toEqual([
      "before:0:0",
      "after:0:0",
      "before:0:1",
      "after:0:1",
      "allocate:0:2",
      "end:0",
      "before:1:0",
      "after:1:0",
      "allocate:1:2",
      "end:1",
    ]);
    expect(s.players[0].goop).toBe(0);
    expect(
      result.ok &&
        result.receipt.events.some(
          (e) => e.type === "packet-launched" && e.packet.targetId === 1,
        ),
    ).toBe(true);
  });

  it("does not suppress the storage guard when an optional service declines allocation", () => {
    const s = state([building(0, 4)]);
    s.players[0].goop = 2;
    expect(
      stepEconomyBuildings(
        s,
        context({ services: { allocateOwner: () => false } }),
        rules(),
      ),
    ).toEqual({ ok: false, reason: "additional-storage-allocation-required" });
  });

  it("rolls back an earlier host afterimage when a later ordered service throws", () => {
    const s = state([building(0, 4), building(1, 4)]),
      before = structuredClone(s);
    expect(
      stepEconomyBuildings(
        s,
        context({
          services: {
            buildingCallback(_s, b, p) {
              if (b.id === 1) throw Error("late source service");
              b.energy = 1;
              p.goop = 5;
              return true;
            },
          },
        }),
        rules(),
      ),
    ).toEqual({ ok: false, reason: "late source service" });
    expect(s).toEqual(before);
  });

  it("accepts a contact resolved at its actual lazy callback position", () => {
    const s = state([harvesting(0)]);
    s.resources[9] = 8;
    let resolved = false;
    const result = stepEconomyBuildings(
      s,
      context({
        services: {
          beforeBuilding() {
            resolved = true;
          },
          contactResolved: () => resolved,
        },
      }),
      rules(),
    );
    expect(result.ok).toBe(true);
    expect(
      result.ok &&
        result.receipt.events.some((e) => e.type === "goop-harvested"),
    ).toBe(true);
  });
});
