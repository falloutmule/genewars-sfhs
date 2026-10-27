import { describe, expect, it } from "vitest";
import { countCreatureBeforeCallback, resetCreaturePopulation } from "../src/sim/mechanics/creature-population";
import { constructionCapabilityExhausted } from "../src/sim/mechanics/outcome";
import { put32, u32 } from "../src/sim/campaign/bytes";

describe("source creature callback population", () => {
  it("preserves capability for supplied live creatures without an Engineer or Genepod", () => {
    const players = Array.from({length:4}, () => Array(1805).fill(0));
    put32(players[0], 0x616, 99); put32(players[1], 0x616, 17);
    resetCreaturePopulation(players, 1);
    expect(u32(players[0], 0x616)).toBe(0);
    expect(u32(players[1], 0x616)).toBe(17);
    expect(constructionCapabilityExhausted(players[0], [])).toEqual({ok:true, value:true});
    for (let i = 0; i < 4; i++) {
      const n = Array(124).fill(0); n[6] = 1; n[24] = 0; n[94] = i === 0 ? 18 : 8;
      countCreatureBeforeCallback(players, n);
    }
    expect(u32(players[0], 0x616)).toBe(4);
    expect(constructionCapabilityExhausted(players[0], [])).toEqual({ok:true, value:false});
  });
  it("excludes inactive, neutral, deferred and dead records at the callback boundary", () => {
    const players = Array.from({length:4}, () => Array(1805).fill(0));
    for (const [active, owner, state, flags] of [[0,0,8,0], [1,4,8,0], [1,0,24,0], [1,0,8,1]]) {
      const n = Array(124).fill(0); n[6]=active; n[24]=owner; n[94]=state; n[21]=flags;
      countCreatureBeforeCallback(players, n);
    }
    expect(u32(players[0], 0x616)).toBe(0);
    const n = Array(124).fill(0); n[6]=1; n[24]=0; n[94]=8;
    countCreatureBeforeCallback(players, n);
    n[94]=24; // A death inside this callback changes the next pass's count.
    expect(u32(players[0], 0x616)).toBe(1);
    resetCreaturePopulation(players, 1); countCreatureBeforeCallback(players, n);
    expect(u32(players[0], 0x616)).toBe(0);
  });
});
