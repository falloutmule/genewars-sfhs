import { aiPutDword, aiPutWord, type StrategicAIState, type StrategicNative } from "../../src/sim/mechanics/strategic-ai-state";
/** Synthetic isolated production pool; independent of attack-group fixtures. */
export function strategicFixture(): StrategicAIState {
  const native = (size: number, index: number, owner: number): StrategicNative => {
    const n: StrategicNative = Array(size).fill(0); n.fill(null, 31, 39);
    if (size === 200) n.fill(null, 192, 200);
    aiPutWord(n, 15, index); n[24] = owner; return n;
  };
  return {
    schemaVersion: 1,
    records: Array.from({ length: 4 }, (_, p) => { const n = Array(1726).fill(0); aiPutDword(n, 0, 1726); n[4] = p; return n; }),
    players: Array.from({ length: 4 }, (_, p) => { const n = Array(1805).fill(0); n[1] = p; return n; }),
    creatures: Array.from({ length: 300 }, (_, i) => native(124, i, 4)),
    buildings: Array.from({ length: 256 }, (_, i) => native(67, i, Math.floor(i / 64))),
    specialists: Array.from({ length: 20 }, (_, i) => ({ native: native(200, i, Math.floor(i / 5)), blueprint: null })),
    creatureControl: Array(600).fill(0), missionPrefix: Array(0x355e).fill(0), rng: { seed: 0, draws: 0, ring: 31 },
  };
}
