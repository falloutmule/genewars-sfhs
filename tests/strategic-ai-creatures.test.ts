import { describe, expect, it } from "vitest";
import {
  aiDword,
  aiPutDword,
  aiPutWord,
  aiSWord,
  createStrategicGroup,
  initializeStrategicBuildings,
  stepStrategicAI,
  strategicGroupOffset,
  type StrategicAIState,
  type StrategicNative,
} from "../src/sim/mechanics/strategic-ai";
import {
  addStrategicCreatureToGroup,
  allocateStrategicCreatures,
  assignStrategicCreature,
  directStrategicCreatures,
  makeStrategicCreatureServices,
  scatterStrategicCreature,
  strategicGroupAcceptsCreature,
  type StrategicCreatureContext,
  type StrategicCreatureMoveRequest,
  type StrategicCreatureTargetRequest,
} from "../src/sim/mechanics/strategic-ai-creatures";
import { nextRandom } from "../src/sim/mechanics/random";
function native(size: number, index: number, owner: number): StrategicNative {
  const n: StrategicNative = Array(size).fill(0);
  n.fill(null, 31, 39);
  if (size === 200) n.fill(null, 192, 200);
  aiPutWord(n, 15, index);
  n[24] = owner;
  return n;
}
function fixture() {
  const s: StrategicAIState = {
    schemaVersion: 1,
    records: Array.from({ length: 4 }, (_, p) => {
      const n = Array(1726).fill(0);
      aiPutDword(n, 0, 1726);
      n[4] = p;
      n[0x46] = 64;
      n[0x65f] = 5;
      return n;
    }),
    players: Array.from({ length: 4 }, (_, p) => {
      const n = Array(1805).fill(0);
      n[1] = p;
      n[2] = p === 1 ? 1 : 0;
      return n;
    }),
    creatures: Array.from({ length: 300 }, (_, i) => native(124, i, 4)),
    buildings: Array.from({ length: 256 }, (_, i) =>
      native(67, i, Math.floor(i / 64)),
    ),
    specialists: Array.from({ length: 20 }, (_, i) => ({
      native: native(200, i, Math.floor(i / 5)),
      blueprint: null,
    })),
    creatureControl: Array.from({ length: 600 }, (_, i) => (i % 2 ? 255 : 0)),
    missionPrefix: Array(0x355e).fill(0),
    rng: { seed: 53809, draws: 50582, ring: 31 },
  };
  const plants = Array.from({ length: 512 }, (_, i) => native(49, i, 4)),
    moves: StrategicCreatureMoveRequest[] = [],
    targets: StrategicCreatureTargetRequest[] = [],
    pairs: [number, number][] = Array.from({ length: 25 }, () => [0, 0]);
  pairs[4] = [1, 4];
  const c: StrategicCreatureContext = {
    frame: 10,
    flags: 0x3e,
    runtimeMode: 0,
    activePlayerCount: 2,
    selectedPlayer: 0,
    groupLimits: [100, 110, 80, 85, 0, 180],
    creatureProtected: (_s, i) => i === 3,
    speciesGenes: pairs,
    spreadDirections: [
      [0, 256],
      [256, 256],
      [256, 0],
      [256, -256],
      [0, -256],
      [-256, -256],
      [-256, 0],
      [-256, 256],
      [0, 0],
    ],
    plants: () => plants,
    plantProtected: (_s, i) => i === 2,
    moveOrder: (w, r) => {
      moves.push(structuredClone(r));
      aiPutWord(w.creatures[r.creature], 110, r.point[0]);
      aiPutWord(w.creatures[r.creature], 112, r.point[1]);
      return { ...r, outcome: "installed" };
    },
    targetOrder: (_w, r) => {
      targets.push(structuredClone(r));
      return { ...r, accepted: true };
    },
  };
  initializeStrategicBuildings(s, 1);
  s.records[1][0x6ae] = 7;
  createStrategicGroup(
    s,
    1,
    {
      index: 1,
      point: [10000, 10000],
      kind: 2,
      parameter: 1,
      zone: -1,
      flags: 3,
    },
    c,
  );
  return { s, c, plants, moves, targets, pairs };
}
function creature(s: StrategicAIState, index = 0, owner = 1) {
  const n = s.creatures[index];
  n[6] = 1;
  n[24] = owner;
  n[122] = 4;
  aiPutWord(n, 91, -1);
  return n;
}
function plant(
  plants: StrategicNative[],
  index: number,
  x: number,
  y: number,
  flags = 0,
) {
  const n = plants[index];
  n[6] = 2;
  aiPutWord(n, 7, x);
  aiPutWord(n, 9, y);
  n[46] = flags;
}
describe("source35730 creature assignment", () => {
  it("rescues owner defenders before general scoring and consumes exactly two actual scatter draws", () => {
    const { s, c, moves } = fixture();
    creature(s);
    s.creatureControl[0] = 2;
    const expected = { ...s.rng },
      direction = nextRandom(expected) % 8,
      distance = (nextRandom(expected) % 5) + 3;
    allocateStrategicCreatures(s, 1, c);
    expect(s.rng).toEqual(expected);
    expect(s.creatureControl.slice(0, 2)).toEqual([34, 1]);
    expect(aiSWord(s.records[1], strategicGroupOffset(1) + 4)).toBe(1);
    expect(moves[0]).toEqual({
      routine: 0x81c60,
      player: 1,
      creature: 0,
      point: [
        10000 + c.spreadDirections[direction][0] * distance,
        10000 + c.spreadDirections[direction][1] * distance,
      ],
    });
  });
  it("selects strict greatest limit-9count, excludes blocked/incompatible groups and keeps first ties", () => {
    const { s, c } = fixture();
    creature(s);
    aiPutWord(s.records[1], strategicGroupOffset(1) + 4, -1);
    for (const i of [4, 5, 6])
      createStrategicGroup(
        s,
        1,
        { index: i, point: [0, 0], kind: 3, parameter: 2, zone: -1, flags: 0 },
        c,
      );
    aiPutWord(s.records[1], strategicGroupOffset(4) + 6, 100);
    aiPutWord(s.records[1], strategicGroupOffset(5) + 6, 100);
    aiPutWord(s.records[1], strategicGroupOffset(6) + 6, 150);
    s.records[1][strategicGroupOffset(6) + 13] = 8;
    expect(assignStrategicCreature(s, 1, 0, -1, c)).toBe(true);
    expect(s.creatureControl[1]).toBe(4);
  });
  it("retains a positive stale link in35730 but direct3C2A0 can unbind and reassign it", () => {
    const { s, c } = fixture();
    creature(s);
    s.creatureControl[1] = 4;
    allocateStrategicCreatures(s, 1, c);
    expect(s.creatureControl[1]).toBe(4);
    expect(s.rng.draws).toBe(50582);
    expect(assignStrategicCreature(s, 1, 0, -1, c)).toBe(true);
    expect(s.creatureControl[1]).toBe(1);
  });
  it("clears flag4 for a nonidle assigned creature and preserves unavailable/protected/nonowner rows", () => {
    const { s, c } = fixture();
    const n = creature(s);
    n[94] = 2;
    s.creatureControl[0] = 4;
    s.creatureControl[1] = 1;
    const cold = creature(s, 1);
    cold[94] = 15;
    const protectedOne = creature(s, 3);
    protectedOne[94] = 2;
    s.creatureControl[2] = s.creatureControl[6] = 4;
    s.creatureControl[3] = s.creatureControl[7] = 1;
    allocateStrategicCreatures(s, 1, c);
    expect([
      s.creatureControl[0],
      s.creatureControl[2],
      s.creatureControl[6],
    ]).toEqual([0, 4, 4]);
  });
  it("3E5A0 preserves source count increments before inactive/protected admission and caps only kind0", () => {
    const { s, c } = fixture(),
      at = strategicGroupOffset(1);
    expect(addStrategicCreatureToGroup(s, 1, 1, 0, true, c)).toBe(false);
    expect(aiSWord(s.records[1], at + 4)).toBe(1);
    creature(s, 3);
    expect(addStrategicCreatureToGroup(s, 1, 1, 3, true, c)).toBe(false);
    expect(aiSWord(s.records[1], at + 4)).toBe(2);
    s.records[1][at + 9] = 0;
    aiPutWord(s.records[1], at + 4, 5);
    creature(s);
    expect(addStrategicCreatureToGroup(s, 1, 1, 0, true, c)).toBe(false);
    expect(s.rng.draws).toBe(50582);
  });
  it("3E6B0 keeps signed16 wrap, radius<=3 zero distance and debug ring wrap", () => {
    const { s, c, moves } = fixture();
    creature(s);
    aiPutWord(s.records[1], strategicGroupOffset(1), 32760);
    aiPutWord(s.records[1], strategicGroupOffset(1) + 2, -32760);
    scatterStrategicCreature(s, 1, 1, 0, 1, c);
    expect(moves[0].point).toEqual([32760, -32760]);
    expect(s.rng.ring).toBe(1);
    expect(s.rng.draws).toBe(50584);
  });
  it("3DD60 supports source gene/zone/research filters, including kind6 and unknown-kind acceptance", () => {
    const { s, c } = fixture(),
      n = creature(s),
      at = strategicGroupOffset(4);
    s.records[1][at + 9] = 4;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(true);
    n[122] = 0;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(false);
    s.records[1][at + 9] = 5;
    s.records[1][at + 12] = 0;
    s.missionPrefix[0x34b8] = 1;
    s.missionPrefix[0x2ff8 + 4] = 8;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(true);
    s.missionPrefix[0x2ff8 + 4] = 13;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(false);
    s.records[1][at + 9] = 6;
    n[24] = 4;
    n[118] = 90;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(true);
    n[118] = 91;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(false);
    n[24] = 1;
    s.players[1][0x6c7] = 1;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(false);
    s.records[1][at + 9] = 7;
    expect(strategicGroupAcceptsCreature(s, 1, 4, 0, c)).toBe(true);
  });
  it("later real-command failure rolls back core RNG, membership and native mutations through37870", () => {
    const { s, c } = fixture();
    creature(s);
    s.creatureControl[0] = 2;
    const before = structuredClone(s);
    expect(() =>
      stepStrategicAI(s, c, makeStrategicCreatureServices(c)),
    ).toThrow("360B0");
    expect(s).toEqual(before);
    expect(() =>
      stepStrategicAI(
        s,
        c,
        makeStrategicCreatureServices({ ...c, moveOrder: undefined }),
      ),
    ).toThrow("81C60");
    expect(s).toEqual(before);
  });
});
describe("source35820 creature directives", () => {
  it("uses group point, not creature position, and preserves ascending early exit below6400 squared", () => {
    const { s, c, plants, targets } = fixture(),
      n = creature(s);
    s.creatureControl[1] = 1;
    aiPutWord(n, 7, 30000);
    aiPutWord(n, 9, 30000);
    plant(plants, 0, 11000, 10000);
    plant(plants, 1, 10001, 10000);
    directStrategicCreatures(s, 1, c);
    expect(targets.map((r) => r.target.index)).toEqual([0]);
    expect(Number(s.creatureControl[0]) & 8).toBe(8);
  });
  it("flag8 weighted admission can replace nearer raw candidate while threshold retains raw minimum", () => {
    const { s, c, plants, targets } = fixture();
    creature(s);
    s.creatureControl[1] = 1;
    plant(plants, 0, 20000, 10000);
    plant(plants, 1, 21000, 10000, 8);
    directStrategicCreatures(s, 1, c);
    expect(targets[0].target.index).toBe(1);
  });
  it("sets control8 even with no plant and ignores target command rejection after actual call", () => {
    const { s, c, plants, targets } = fixture();
    creature(s);
    s.creatureControl[1] = 1;
    directStrategicCreatures(s, 1, c);
    expect(targets).toEqual([]);
    expect(s.creatureControl[0]).toBe(8);
    s.creatureControl[0] = 0;
    plant(plants, 0, 10000, 10000);
    directStrategicCreatures(s, 1, {
      ...c,
      targetOrder: (_w, r) => ({ ...r, accepted: false }),
    });
    expect(s.creatureControl[0]).toBe(8);
  });
  it("primary gene1 chooses actual owner-block building without testing its active flag", () => {
    const { s, c, targets } = fixture();
    creature(s);
    s.creatureControl[1] = 1;
    s.records[1][0x46] = 3;
    expect(s.buildings[67][6]).toBe(0);
    directStrategicCreatures(s, 1, c);
    expect(targets[0].target).toEqual({ family: 4, index: 67 });
    expect(s.creatureControl[0]).toBe(16);
  });
  it("clears both control8/16 on native0200 before applying actual state skips", () => {
    const { s, c } = fixture(),
      n = creature(s);
    s.creatureControl[1] = 1;
    s.creatureControl[0] = 24;
    n[97] = 2;
    n[94] = 1;
    directStrategicCreatures(s, 1, c);
    expect(s.creatureControl[0]).toBe(0);
  });
  it("group0, other group kinds, protected/unavailable and native flag2 paths issue no directive", () => {
    const { s, c, targets } = fixture();
    const n = creature(s);
    s.creatureControl[1] = 0;
    directStrategicCreatures(s, 1, c);
    s.creatureControl[1] = 1;
    n[96] = 2;
    directStrategicCreatures(s, 1, c);
    expect(targets).toEqual([]);
    expect(s.creatureControl[0]).toBe(0);
  });
  it("unknown species, missing concrete target command and malformed plant extents fail explicitly", () => {
    const { s, c, plants } = fixture(),
      n = creature(s);
    s.creatureControl[1] = 1;
    n[122] = 255;
    expect(() => directStrategicCreatures(s, 1, c)).toThrow("gene");
    n[122] = 4;
    plant(plants, 0, 10000, 10000);
    expect(() =>
      directStrategicCreatures(s, 1, { ...c, targetOrder: undefined }),
    ).toThrow("5D870");
    expect(() =>
      directStrategicCreatures(s, 1, { ...c, plants: () => [] }),
    ).toThrow("512");
  });
  it("serializable core next allocation is identical after JSON restore", () => {
    const { s, c } = fixture();
    creature(s);
    s.creatureControl[0] = 2;
    const restored = JSON.parse(JSON.stringify(s));
    allocateStrategicCreatures(s, 1, c);
    allocateStrategicCreatures(restored, 1, c);
    expect(restored).toEqual(s);
    expect(aiDword(s.records[1], 0)).toBe(1726);
  });
});
