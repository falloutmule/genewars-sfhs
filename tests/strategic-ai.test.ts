import { describe, expect, it } from "vitest";
import {
  advanceStrategicAttackPhase,
  aiDistance,
  aiDword,
  aiPutDword,
  aiPutWord,
  aiSWord,
  createStrategicGroup,
  initializeStrategicBuildings,
  initializeStrategicCreatures,
  initializeStrategicOrders,
  maintainStrategicReservations,
  moveStrategicGroup,
  refreshStrategicPlayerGroup,
  resetStrategicCreatureControl,
  stepStrategicAI,
  stepStrategicGroupCadence,
  strategicGroupOffset,
  strategicGroupView,
  strategicOrderSatisfied,
  synchronizeStrategicZones,
  type StrategicAIContext,
  type StrategicAIEvent,
  type StrategicAIState,
  type StrategicAIServices,
  type StrategicNative,
} from "../src/sim/mechanics/strategic-ai";
import { nextRandom } from "../src/sim/mechanics/random";

function native(size: number, index: number, owner: number): StrategicNative {
  const row: StrategicNative = Array.from(
    { length: size },
    (_, i) => (i * 13 + 11) & 255,
  );
  row.fill(null, 31, 39);
  row[6] = 0;
  row[24] = owner;
  if (size === 200) row.fill(null, 192, 200);
  aiPutWord(row, 15, index);
  return row;
}
function fixture() {
  const records = Array.from({ length: 4 }, (_, p) => {
    const n = Array.from({ length: 1726 }, (_, i) => (i * 17 + p * 9) & 255);
    aiPutDword(n, 0, 1726);
    n[4] = p;
    aiPutDword(n, 6, 0);
    n[0x6ae] = 0;
    n[0x5e8] = n[0x5ee] = 64;
    for (let i = 0; i < 16; i++) {
      const at = strategicGroupOffset(i);
      aiPutWord(n, at + 4, -1);
      n[at + 8] = p;
      n[at + 11] = i;
      n[at + 12] = 255;
    }
    return n;
  });
  const players = Array.from({ length: 4 }, (_, p) => {
    const n = Array.from({ length: 1805 }, (_, i) => (i * 41 + p * 19) & 255);
    n[1] = p;
    n[2] = p === 1 ? 1 : 0;
    n[3] = 0;
    n[0x4a2] = 0;
    aiPutWord(n, 9, p * 1000);
    aiPutWord(n, 11, p * 2000);
    aiPutWord(n, 0x5fc, p * 1500);
    aiPutWord(n, 0x5fe, p * 2500);
    return n;
  });
  const s: StrategicAIState = {
    schemaVersion: 1,
    records,
    players,
    creatures: Array.from({ length: 300 }, (_, i) => native(124, i, 4)),
    buildings: Array.from({ length: 256 }, (_, i) =>
      native(67, i, Math.floor(i / 64)),
    ),
    specialists: Array.from({ length: 20 }, (_, i) => ({
      native: native(200, i, Math.floor(i / 5)),
      blueprint: null,
    })),
    creatureControl: Array.from({ length: 600 }, (_, i) => (i % 2 ? 255 : 5)),
    missionPrefix: Array(0x355e).fill(0),
    rng: { seed: 53809, draws: 50582, ring: 31 },
  };
  const c: StrategicAIContext = {
    frame: 1,
    flags: 0x3e,
    runtimeMode: 0,
    activePlayerCount: 2,
    selectedPlayer: 0,
    groupLimits: [90, 100, 75, 95, 0, 180],
    creatureProtected: (_w, i) => i === 3,
  };
  return { s, c };
}
function building(
  s: StrategicAIState,
  slot: number,
  selector: number,
  x: number,
  y: number,
) {
  const b = s.buildings[slot];
  b[6] = 4;
  b[45] = selector;
  aiPutWord(b, 7, x);
  aiPutWord(b, 9, y);
  return b;
}
function creature(s: StrategicAIState, slot: number, owner: number) {
  const n = s.creatures[slot];
  n[6] = 1;
  n[24] = owner;
  return n;
}
describe("strategic AI numeric initialization and groups", () => {
  it("72E50 preserves actual low3 control bits and clears every group link", () => {
    const before = Array.from({ length: 600 }, (_, i) => i & 255),
      copy = before.slice();
    const result = resetStrategicCreatureControl(before);
    expect(before).toEqual(copy);
    for (let i = 0; i < 300; i++)
      expect(result.slice(i * 2, i * 2 + 2)).toEqual([before[i * 2] & 7, 255]);
    expect(() => resetStrategicCreatureControl(before.slice(1))).toThrow(
      "extent",
    );
  });
  it("37540 initializes16 groups and registers owner-block buildings in source order", () => {
    const { s } = fixture(),
      old = s.records[1].slice();
    building(s, 66, 3, 200, 300);
    building(s, 68, 3, 400, 500);
    building(s, 69, 3, 600, 700);
    building(s, 70, 0, 0, 0);
    building(s, 2, 3, 0, 0);
    initializeStrategicBuildings(s, 1);
    expect([s.records[1][0x5e8], s.records[1][0x5ee]]).toEqual([2, 4]);
    for (const i of [2, 4, 5, 6]) expect(s.records[1][0x55 + i]).toBe(1);
    for (let i = 0; i < 16; i++) {
      const at = strategicGroupOffset(i),
        n = s.records[1];
      expect([
        aiSWord(n, at + 4),
        n[at + 8],
        n[at + 10],
        n[at + 11],
        n[at + 12],
      ]).toEqual([-1, 1, 0, i, 255]);
      expect(n.slice(at, at + 4)).toEqual(old.slice(at, at + 4));
      expect(n[at + 9]).toBe(old[at + 9]);
      expect(n[at + 13]).toBe(old[at + 13]);
    }
    const after = structuredClone(s);
    initializeStrategicBuildings(s, 1);
    expect(s).toEqual(after);
  });
  it("copies all established player0 knowledge ranges, clears research fractions and retains unrelated bytes", () => {
    const { s } = fixture(),
      before = s.players[1].slice();
    initializeStrategicBuildings(s, 1);
    const from = s.players[0],
      to = s.players[1];
    for (let i = 0; i < 25; i++) {
      expect(aiDword(to, 0x61a + i * 4)).toBe(
        (aiDword(from, 0x61a + i * 4) & 0xfffff800) >>> 0,
      );
      expect(to[0x6c7 + i]).toBe(from[0x6c7 + i]);
      expect(to[0x6ae + i]).toBe(from[0x6ae + i]);
    }
    expect(to.slice(0x67e, 0x6ae)).toEqual(from.slice(0x67e, 0x6ae));
    expect(to.slice(0, 0x61a)).toEqual(before.slice(0, 0x61a));
    expect(to.slice(0x6e0)).toEqual(before.slice(0x6e0));
  });
  it("37770 marks only owned live nonprotected creatures and creates own group at start target", () => {
    const { s, c } = fixture();
    initializeStrategicBuildings(s, 1);
    creature(s, 0, 1);
    creature(s, 1, 0);
    creature(s, 3, 1);
    s.creatureControl[0] = 0xff;
    s.creatureControl[6] = 0xff;
    initializeStrategicCreatures(s, 1, c);
    expect(s.creatureControl.slice(0, 8)).toEqual([
      0x3e, 255, 5, 255, 5, 255, 255, 255,
    ]);
    const g = strategicGroupView(s, 1, 1);
    expect(g).toMatchObject({
      position: [1000, 2000],
      count: 0,
      limit: 75,
      kind: 2,
      parameter: 1,
      zone: -1,
    });
    expect(g.flags & 63).toBe(3);
    expect(s.records[1][0x6ae]).toBe(5);
  });
  it("36C10 prefers a Genepod over nearer other buildings and retains strict nearest ties", () => {
    const { s, c } = fixture();
    initializeStrategicBuildings(s, 1);
    building(s, 64, 0, 1500, 2500);
    building(s, 66, 3, 1800, 2500);
    building(s, 68, 3, 1200, 2500);
    refreshStrategicPlayerGroup(s, 1, 1, c);
    expect(strategicGroupView(s, 1, 1).position).toEqual([1800, 2500]);
  });
  it("73690 uses32768-coordinate wrapping including the negative half-world tie", () => {
    expect(aiDistance([32760, 10], [8, 10])).toBe(256);
    expect(aiDistance([0, 0], [16384, 0])).toBe(268435456);
    expect(aiDistance([-1, 4], [32767, 4])).toBe(0);
  });
  it("3E8F0 propagates live member goals and unbinds protected/inactive members without clearing indices", () => {
    const { s, c } = fixture();
    initializeStrategicBuildings(s, 1);
    initializeStrategicCreatures(s, 1, c);
    for (const i of [0, 2, 3]) {
      creature(s, i, 1);
      s.creatureControl[i * 2 + 1] = 1;
    }
    s.creatures[2][6] = 0;
    aiPutWord(s.records[1], strategicGroupOffset(1) + 4, 3);
    moveStrategicGroup(s, 1, 1, [300, 400], c);
    expect(s.creatures[0].slice(110, 118)).toEqual([
      44, 1, 144, 1, 44, 1, 144, 1,
    ]);
    expect(Number(s.creatures[0][96]) & 8).toBe(8);
    expect(Number(s.creatures[0][97]) & 128).toBe(128);
    expect([s.creatureControl[5], s.creatureControl[7]]).toEqual([255, 255]);
    expect(aiSWord(s.records[1], strategicGroupOffset(1) + 4)).toBe(1);
  });
  it("3E270 preserves high flags/target byte3 and floors signed zone-adjusted limits at1", () => {
    const { s, c } = fixture(),
      n = s.records[1],
      at = strategicGroupOffset(4);
    n[at + 13] = 0xe0;
    n[0x664] = -100 & 255;
    s.missionPrefix[0x34b8] = 1;
    aiPutDword(s.missionPrefix, 0x2ff8 + 14, -257);
    const retained = Array.from({ length: 6 }, (_, i) => n[at + 17 + i * 4]);
    createStrategicGroup(
      s,
      1,
      { index: 4, point: [1, 2], kind: 5, parameter: 7, zone: 0, flags: 0x2a },
      c,
    );
    expect(n[at + 13]).toBe(0xea);
    expect(aiSWord(n, at + 6)).toBe(79);
    expect(Array.from({ length: 6 }, (_, i) => n[at + 17 + i * 4])).toEqual(
      retained,
    );
    n[0x664] = -128 & 255;
    aiPutDword(s.missionPrefix, 0x2ff8 + 14, -32768);
    createStrategicGroup(
      s,
      1,
      { index: 4, point: [1, 2], kind: 5, parameter: 7, zone: 0, flags: null },
      c,
    );
    expect(aiSWord(n, at + 6)).toBe(1);
    expect(n[at + 13]).toBe(0xc1);
  });
  it("3BEB0 retains duplicate group0 calls and callback-to-callback mutations", () => {
    const { s, c } = fixture(),
      calls: number[] = [],
      events: StrategicAIEvent[] = [];
    aiPutWord(s.records[1], strategicGroupOffset(0) + 4, 0);
    s.records[1][strategicGroupOffset(0) + 13] = 64;
    aiPutWord(s.records[1], strategicGroupOffset(1) + 4, 0);
    stepStrategicGroupCadence(
      s,
      1,
      { ...c, frame: 256 },
      (_w, player, group) => {
        calls.push(group);
        return { routine: 0x3c700, player, group };
      },
      events,
    );
    expect(calls).toEqual([0, 1, 0]);
    expect(events).toHaveLength(3);
    expect(() =>
      stepStrategicGroupCadence(s, 1, { ...c, frame: 256 }, undefined, []),
    ).toThrow("3C700");
  });
});
describe("strategic AI conditions and source dispatch", () => {
  it("3EBD0 keeps strict source timer, money and signed pool conditions", () => {
    const { s, c } = fixture();
    aiPutDword(s.records[1], 6, 999);
    expect(strategicOrderSatisfied(s, 1, [2, 1, 0, 255, 0, 0, 0], c)).toBe(
      true,
    );
    aiPutDword(s.records[1], 6, 1000);
    expect(strategicOrderSatisfied(s, 1, [2, 1, 0, 0, 0, 0, 0], c)).toBe(false);
    aiPutDword(s.players[0], 13, 100);
    expect(strategicOrderSatisfied(s, 1, [3, 0, 0, 0, 100, 0, 0], c)).toBe(
      false,
    );
    expect(strategicOrderSatisfied(s, 1, [3, 0, 0, 0, 99, 0, 0], c)).toBe(true);
    s.players[0][0x4a2] = 255;
    expect(strategicOrderSatisfied(s, 1, [0, 14, 0, 0, 0, 0, 0], c)).toBe(
      false,
    );
    expect(strategicOrderSatisfied(s, 1, [3, 0, 0, 0, 99, 0, 1], c)).toBe(
      false,
    );
  });
  it("3EBD0 counts real buildings and nonprotected species with owner filtering", () => {
    const { s, c } = fixture();
    building(s, 64, 3, 0, 0);
    building(s, 65, 3, 0, 0);
    expect(strategicOrderSatisfied(s, 1, [0, 3, 0, 1, 2, 0, 0], c)).toBe(true);
    for (const i of [0, 3, 4]) {
      const n = creature(s, i, i === 4 ? 0 : 1);
      n[122] = 2;
    }
    expect(strategicOrderSatisfied(s, 1, [1, 2, 0, 1, 2, 0, 0], c)).toBe(false);
    expect(strategicOrderSatisfied(s, 1, [1, 2, 0, 1, 1, 0, 0], c)).toBe(true);
  });
  it("70B00 gates all mutations and37870 first pass is complete before noncadence return", () => {
    const { s, c } = fixture(),
      before = structuredClone(s);
    for (const context of [
      { ...c, flags: 0x3a },
      { ...c, runtimeMode: 2 },
    ])
      expect(stepStrategicAI(s, context).state).toEqual(s);
    const result = stepStrategicAI(s, c);
    expect(s).toEqual(before);
    expect(aiDword(result.state.records[1], 6)).toBe(1);
    expect(result.events.map((e) => e.routine)).toEqual([0x37540, 0x37770]);
    expect(result.state.records[1][0x6ae]).toBe(5);
    expect(result.state.rng).toEqual(s.rng);
  });
  it("source32/10 cadences reject missing concrete services with complete rollback", () => {
    const { s, c } = fixture();
    s.records[1][strategicGroupOffset(2) + 13] &= ~64;
    const before = structuredClone(s);
    expect(() => stepStrategicAI(s, { ...c, frame: 10 })).toThrow("35730");
    //At32 the group cadence itself is inactive after37540, but directCreatures is required.
    expect(() => stepStrategicAI(s, { ...c, frame: 32 })).toThrow("35820");
    expect(s).toEqual(before);
  });
  it("delay gate still performs35730 but defers roster/build planning", () => {
    const { s, c } = fixture();
    aiPutWord(s.missionPrefix, 0x1eb3, 1);
    const result = stepStrategicAI(
      s,
      { ...c, frame: 10 },
      { allocateCreatures: (_s, player) => ({ routine: 0x35730, player }) },
    );
    expect(result.events.map((e) => e.routine)).toEqual([
      0x37540, 0x37770, 0x35730,
    ]);
    expect(result.state.records[1][0x6ae]).toBe(5);
  });
  it("37690 runs actual32E60, sums counters and applies source marker parameter=owner", () => {
    const { s, c } = fixture(),
      events: StrategicAIEvent[] = [];
    initializeStrategicBuildings(s, 1);
    initializeStrategicCreatures(s, 1, c);
    s.records[1].fill(100, 0x65a, 0x65e);
    const at = 0x1c9e;
    aiPutWord(s.missionPrefix, at, 300);
    aiPutWord(s.missionPrefix, at + 2, 400);
    s.missionPrefix[at + 4] = 6;
    s.missionPrefix[at + 5] = 7;
    s.missionPrefix[at + 6] = (3 << 3) | 1;
    //The retained nonzero player499 means the real32E60 body must not recruit.
    initializeStrategicOrders(s, 1, c, {}, events);
    expect(s.records[1][0x6b1]).toBe(144);
    expect(strategicGroupView(s, 1, 7)).toMatchObject({
      position: [300, 400],
      kind: 3,
      parameter: 1,
    });
    expect(s.records[1][0x6ae]).toBe(7);
  });
  it("full37870 controller preserves exact direct service order and late failure rollback including RNG", () => {
    const { s, c } = fixture(),
      order: number[] = [],
      before = structuredClone(s);
    const port =
      (routine: 0x32e60 | 0x35730 | 0x360b0 | 0x3bf90 | 0x33f60) =>
      (w: StrategicAIState, player: number) => {
        order.push(routine);
        nextRandom(w.rng);
        return { routine, player };
      };
    const ports: StrategicAIServices = {
      allocateCreatures: port(0x35730),
      planBuildings: port(0x360b0),
      planAttack: port(0x3bf90),
      planSpecialists: () => {
        throw Error("real late failure");
      },
    };
    expect(() => stepStrategicAI(s, { ...c, frame: 10 }, ports)).toThrow(
      "real late failure",
    );
    expect(order).toEqual([0x35730, 0x360b0, 0x3bf90]);
    expect(s).toEqual(before);
    order.length = 0;
    ports.planSpecialists = port(0x33f60);
    const result = stepStrategicAI(s, { ...c, frame: 10 }, ports);
    expect(order).toEqual([0x35730, 0x360b0, 0x3bf90, 0x33f60]);
    expect(result.events.map((e) => e.routine)).toContain(0x32e60);
    expect(result.state.rng.draws).toBe(s.rng.draws + 4);
    expect(s).toEqual(before);
  });
  it("rejects a fake/missing service receipt and replacement of retained rows atomically", () => {
    const { s, c } = fixture(),
      before = structuredClone(s);
    expect(() =>
      stepStrategicAI(
        s,
        { ...c, frame: 10 },
        { allocateCreatures: () => undefined as never },
      ),
    ).toThrow("receipt");
    expect(() =>
      stepStrategicAI(
        s,
        { ...c, frame: 10 },
        {
          allocateCreatures: (w, player) => {
            w.records[player] = w.records[player].slice();
            return { routine: 0x35730, player };
          },
        },
      ),
    ).toThrow("identities");
    expect(s).toEqual(before);
  });
  it("clears stale reservations and subtracts positive cooldowns without clamping", () => {
    const { s } = fixture(),
      ai = s.records[1];
    ai[0x55] = 7;
    ai[0x47] = 1;
    aiPutDword(ai, 14, 1);
    aiPutDword(ai, 18, 0);
    aiPutDword(ai, 22, -5);
    maintainStrategicReservations(s, 1);
    expect(ai[0x55]).toBe(0);
    expect(ai[0x47]).toBe(0);
    expect([aiDword(ai, 14) | 0, aiDword(ai, 18), aiDword(ai, 22) | 0]).toEqual(
      [-9, 0, -5],
    );
  });
  it("keeps real Engineer selector reservations using logical blueprint bindings", () => {
    const { s } = fixture(),
      n = s.specialists[5].native;
    s.players[1][3] = 1;
    s.players[1][4] = 5;
    n[131] = 6;
    s.specialists[5].blueprint = { player: 1, index: 0 };
    s.players[1][0x16 + 22] = 0;
    s.records[1][0x47 + 6] = 1;
    maintainStrategicReservations(s, 1);
    expect(s.records[1][0x47 + 6]).toBe(1);
    s.specialists[5].blueprint = null;
    expect(() => maintainStrategicReservations(s, 1)).toThrow("blueprint");
  });
  it("3C4A0 allocates first free group4 and retires exhausted zones with linked control cleanup", () => {
    const { s, c } = fixture();
    initializeStrategicBuildings(s, 1);
    s.records[1][0x6b0] = 0;
    s.records[1][0x664] = 0;
    s.missionPrefix[0x34b8] = 1;
    s.missionPrefix[0x34b9] = 1;
    aiPutDword(s.missionPrefix, 0x2ff8 + 14, 512);
    synchronizeStrategicZones(s, 1, c);
    expect(strategicGroupView(s, 1, 4)).toMatchObject({
      count: 0,
      kind: 5,
      zone: 0,
      limit: 182,
    });
    creature(s, 1, 1);
    s.creatureControl[3] = 4;
    s.creatureControl[2] = 7;
    aiPutWord(s.records[1], strategicGroupOffset(4) + 4, 1);
    aiPutDword(s.missionPrefix, 0x2ff8 + 14, 0);
    s.missionPrefix[0x34b9] = 2;
    synchronizeStrategicZones(s, 1, c);
    expect(strategicGroupView(s, 1, 4)).toMatchObject({
      count: -1,
      parameter: 0,
      zone: -1,
    });
    expect(s.creatureControl.slice(2, 4)).toEqual([3, 255]);
  });
  it("phase preview flag and actual phase advance preserve unsigned elapsed wrap", () => {
    const { s } = fixture(),
      ai = s.records[1];
    ai[0x95] = 3;
    ai[0x6bd] = 1;
    aiPutDword(ai, 6, 100);
    aiPutDword(ai, 0x97, 10);
    aiPutDword(ai, 0x635, 100);
    aiPutWord(ai, 0x63a, 20);
    advanceStrategicAttackPhase(s, 1);
    expect([ai[0x639], ai[0x6bd]]).toEqual([1, 1]);
    aiPutDword(ai, 6, 110);
    advanceStrategicAttackPhase(s, 1);
    expect([ai[0x639], ai[0x6bd], aiDword(ai, 0x97)]).toEqual([0, 2, 110]);
    aiPutDword(ai, 6, 5);
    aiPutDword(ai, 0x97, 0xfffffff0);
    aiPutDword(ai, 0x635, 20);
    advanceStrategicAttackPhase(s, 1);
    expect([ai[0x6bd], aiDword(ai, 0x97)]).toEqual([3, 5]);
  });
  it("JSON restoration yields identical complete next callback state", () => {
    const { s, c } = fixture();
    expect(stepStrategicAI(JSON.parse(JSON.stringify(s)), c)).toEqual(
      stepStrategicAI(s, c),
    );
  });
  it("rejects capacity/byte/identity/pointer bounds before any dispatch", () => {
    const { s, c } = fixture();
    for (const change of [
      (w: StrategicAIState) => {
        w.creatures.pop();
      },
      (w: StrategicAIState) => {
        w.records[1][4] = 2;
      },
      (w: StrategicAIState) => {
        w.creatures[1][35] = 17;
      },
      (w: StrategicAIState) => {
        w.specialists[1].native[192] = 255;
      },
      (w: StrategicAIState) => {
        w.creatureControl[1] = 256;
      },
    ]) {
      const bad = structuredClone(s);
      change(bad);
      expect(() => stepStrategicAI(bad, c)).toThrow();
    }
    expect(() => stepStrategicAI(s, { ...c, groupLimits: [1, 2] })).toThrow(
      "profile",
    );
  });
  it("unknown owned control bytes reject rather than becoming an invented zero image", () => {
    const { s, c } = fixture();
    creature(s, 0, 1);
    s.creatureControl[0] = null;
    const before = structuredClone(s);
    expect(() => stepStrategicAI(s, c)).toThrow("Uninitialized");
    expect(s).toEqual(before);
  });
  it("a later player failure rolls back an earlier opponent's initialized records", () => {
    const { s, c } = fixture();
    s.players[2][2] = 1;
    creature(s, 0, 2);
    s.creatureControl[0] = null;
    const before = structuredClone(s);
    expect(() => stepStrategicAI(s, { ...c, activePlayerCount: 3 })).toThrow(
      "Uninitialized",
    );
    expect(s).toEqual(before);
  });
});
