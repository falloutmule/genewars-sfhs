import {
  aiPutDword,
  aiPutWord,
  type StrategicAIState,
  type StrategicNative,
} from "../../src/sim/mechanics/strategic-ai";
import type { StrategicGroupContext } from "../../src/sim/mechanics/strategic-ai-group-control";
export function aiNative(
  size: number,
  index: number,
  owner: number,
): StrategicNative {
  const n: StrategicNative = Array(size).fill(0);
  n.fill(null, 31, 39);
  if (size === 200) n.fill(null, 192, 200);
  aiPutWord(n, 15, index);
  n[24] = owner;
  return n;
}
export function aiGroupFixture(group = 0, kind = 0, count = 1) {
  const s: StrategicAIState = {
    schemaVersion: 1,
    records: Array.from({ length: 4 }, (_, owner) => {
      const n = Array(1726).fill(0);
      aiPutDword(n, 0, 1726);
      n[4] = owner;
      n[0x65f] = 5;
      n[0x628] = 50;
      n[0x6af] = 1;
      n[0x46] = 64;
      aiPutDword(n, 6, 500);
      for (let i = 0; i < 16; i++) {
        const at = 0x387 + i * 38;
        aiPutWord(n, at + 4, -1);
        aiPutWord(n, at + 6, 100);
        n[at + 8] = owner;
        n[at + 10] = 1;
        n[at + 11] = i;
        n[at + 12] = 255;
        for (let t = 0; t < 6; t++) aiPutWord(n, at + 14 + t * 4, -1);
      }
      return n;
    }),
    players: Array.from({ length: 4 }, (_, owner) => {
      const n = Array(1805).fill(0);
      n[1] = owner;
      n[2] = owner === 1 ? 1 : 0;
      aiPutDword(n, 0x616, 5);
      return n;
    }),
    creatures: Array.from({ length: 300 }, (_, i) => aiNative(124, i, 4)),
    buildings: Array.from({ length: 256 }, (_, i) =>
      aiNative(67, i, Math.floor(i / 64)),
    ),
    specialists: Array.from({ length: 20 }, (_, i) => ({
      native: aiNative(200, i, Math.floor(i / 5)),
      blueprint: null,
    })),
    creatureControl: Array.from({ length: 600 }, (_, i) => (i % 2 ? 255 : 0)),
    missionPrefix: Array(0x355e).fill(0),
    rng: { seed: 53809, draws: 50582, ring: 31 },
  };
  const at = 0x387 + group * 38;
  aiPutWord(s.records[1], at, 10000);
  aiPutWord(s.records[1], at + 2, 10000);
  aiPutWord(s.records[1], at + 4, count);
  s.records[1][at + 9] = kind;
  for (let i = 0; i < count; i++) aiMember(s, i, group);
  const effects = Array.from({ length: 200 }, (_, i) => aiNative(81, i, 0)),
    plants = Array.from({ length: 512 }, (_, i) => aiNative(49, i, 4)),
    calls: unknown[] = [],
    speciesGenes: [number, number][] = Array.from({ length: 25 }, () => [0, 0]);
  speciesGenes[4] = [1, 4];
  const c: StrategicGroupContext = {
    frame: 16,
    flags: 0x3e,
    runtimeMode: 0,
    activePlayerCount: 2,
    selectedPlayer: 0,
    groupLimits: [100, 110, 80, 85, 0, 180],
    speciesGenes,
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
    creatureProtected: (_w, i) => i === 3,
    specialistProtected: (_w, i) => i === 2,
    plants: () => plants,
    plantProtected: () => false,
    effects: () => effects,
    moveOrder: (w, r) => {
      calls.push(structuredClone(r));
      aiPutWord(w.creatures[r.creature], 110, r.point[0]);
      aiPutWord(w.creatures[r.creature], 112, r.point[1]);
      return { ...r, outcome: "installed" };
    },
    targetOrder: (_w, r) => {
      calls.push(structuredClone(r));
      return { ...r, accepted: false };
    },
    releaseAction: (w, i) => {
      const r = { routine: 0x5cc60 as const, creature: i };
      calls.push(r);
      w.creatures[i][94] = w.creatures[i][95] = 0;
      return r;
    },
    interact: (_w, r) => {
      calls.push(structuredClone(r));
      return r;
    },
  };
  return { s, c, effects, plants, calls };
}
export function aiMember(
  s: StrategicAIState,
  index: number,
  group: number,
  owner = 1,
) {
  const n = s.creatures[index];
  n[6] = 1;
  n[24] = owner;
  n[122] = 4;
  aiPutWord(n, 7, 10000);
  aiPutWord(n, 9, 10000);
  aiPutWord(n, 91, -1);
  s.creatureControl[index * 2 + 1] = group;
  return n;
}
