import { expect, it } from "vitest";
import { emitColdShatterBurst } from "../src/sim/mechanics/cold-shatter";
import type { DestructionRequest } from "../src/sim/mechanics/destruction-effect";
import { nextRandom } from "../src/sim/mechanics/random";
import { putEffectWord as put, putEffectDword as put32 } from "../src/sim/mechanics/power-motion";

it.each([0, 256])("keeps three burst draws per attempt, interleaved with real factory draws at height %i", relative => {
  const n: (number | null)[] = Array(124).fill(0);
  n[6] = 1; n[94] = 15; n[24] = 2;
  put(n, 7, 1024); put(n, 9, 2048); put32(n, 17, 1000); put32(n, 39, 1000 + relative);
  const rng = {seed: 5428, draws: 0, ring: null}, expected = {...rng},
    requests: DestructionRequest[] = [], pitches: number[] = [];
  const made = emitColdShatterBurst(n, rng,
    {code: 14, count: 10, parameter1: 80, parameter2: 70, owner: -1}, q => {
      requests.push(q);
      nextRandom(expected);
      const pitch = nextRandom(expected);
      pitches.push(relative < 128 ? pitch % 150 : pitch % 128 * 8);
      nextRandom(expected);
      const succeeds = requests.length % 2 === 0;
      if (succeeds) { nextRandom(rng); nextRandom(expected); }
      return succeeds;
    });
  expect(made).toBe(5);
  expect(rng).toEqual(expected);
  expect(rng.draws).toBe(35);
  expect(requests.map(q => q.angles[1])).toEqual(pitches);
  expect(requests.every(q => q.owner === 2 && q.height === 1000 + relative &&
    q.position[0] === 1024 && q.position[1] === 2048 && q.angles[2] >= 5120 &&
    q.angles[2] < 9600 && !q.newborn)).toBe(true);
});
