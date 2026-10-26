import { describe, expect, it } from "vitest";
import { aiGroupFixture, aiMember, aiNative } from "./fixtures/strategic-ai";
import { registerStrategicReward } from "../src/sim/mechanics/strategic-ai-rewards";
import { strategicGroupOffset } from "../src/sim/mechanics/strategic-ai-groups";
import { aiPutWord, aiSWord } from "../src/sim/mechanics/strategic-ai-state";
import { stepStrategicGroup } from "../src/sim/mechanics/strategic-ai-group-control";

function reward(owner = 1, slot = 199) {
  const n = aiNative(81, slot, owner);
  n[6] = 5;
  n[69] = 59;
  aiPutWord(n, 7, -12345);
  aiPutWord(n, 9, 32767);
  return n;
}
describe("source35F90 AI reward registration", () => {
  it("returns for owner0 before any AI/profile or other effect read", () => {
    const effect = Array(25).fill(null);
    effect[24] = 0;
    expect(registerStrategicReward(null!, effect, null!)).toBeNull();
  });
  it.each([1, 2, 3])(
    "registers owner%i in the first free logical group4..15",
    (owner) => {
      const { s, c } = aiGroupFixture(),
        effect = reward(owner),
        before = structuredClone(s);
      // Even if reserved groups0..3 are free, the first candidate is4.
      const at = strategicGroupOffset(4),
        ai = s.records[owner];
      ai[at + 13] = 0xf6;
      for (let t = 0; t < 6; t++) ai[at + 17 + t * 4] = 91 + t;
      const retained = ai.slice(),
        originalEffect = effect.slice();
      expect(registerStrategicReward(s, effect, c)).toBe(4);
      const expected = retained.slice();
      aiPutWord(expected, at, -12345);
      aiPutWord(expected, at + 2, 32767);
      aiPutWord(expected, at + 4, 0);
      aiPutWord(expected, at + 6, 1);
      expected[at + 9] = 6;
      expected[at + 10] = 1;
      expected[at + 12] = 199;
      expected[at + 13] = 0xc9;
      for (let t = 0; t < 6; t++) {
        aiPutWord(expected, at + 14 + t * 4, -1);
        expected[at + 16 + t * 4] = 0;
      }
      expect(ai).toEqual(expected);
      expect(effect).toEqual(originalEffect);
      expect(s.rng).toEqual(before.rng);
      for (const p of [0, 1, 2, 3].filter((p) => p !== owner))
        expect(s.records[p]).toEqual(before.records[p]);
      expect(s.creatureControl).toEqual(before.creatureControl);
    },
  );
  it("admits any signed negative count and uses the last free slot without wrapping", () => {
    const { s, c } = aiGroupFixture();
    for (let group = 4; group < 15; group++)
      aiPutWord(s.records[1], strategicGroupOffset(group) + 4, 0);
    aiPutWord(s.records[1], strategicGroupOffset(15) + 4, -32768);
    expect(registerStrategicReward(s, reward(1, 0), c)).toBe(15);
    expect(s.records[1][strategicGroupOffset(15) + 12]).toBe(0);
    const full = structuredClone(s);
    expect(registerStrategicReward(s, reward(), c)).toBeNull();
    expect(s).toEqual(full);
  });
  it("retains both destination high flags for every possible source afterimage", () => {
    for (let flags = 0; flags < 256; flags++) {
      const { s, c } = aiGroupFixture(),
        at = strategicGroupOffset(4);
      s.records[1][at + 13] = flags;
      registerStrategicReward(s, reward(), c);
      expect(s.records[1][at + 13]).toBe((flags & 192) | 9);
    }
  });
  it("rejects absent/invalid priors or effect identities before writes", () => {
    const { s, c } = aiGroupFixture(),
      n = reward(),
      before = structuredClone(s);
    n[24] = 4;
    expect(() => registerStrategicReward(s, n, c)).toThrow("identity");
    expect(s).toEqual(before);
    n[24] = 1;
    s.records[1][strategicGroupOffset(4) + 8] = 2;
    const corrupt = structuredClone(s);
    expect(() => registerStrategicReward(s, n, c)).toThrow("retained identity");
    expect(s).toEqual(corrupt);
    s.records[1] = [];
    expect(() => registerStrategicReward(s, n, c)).toThrow("AI record");
  });
  it("feeds the existing kind6 consumer and releases creature links after effect retirement", () => {
    const { s, c, effects } = aiGroupFixture(1, 0, 0),
      effect = reward(1, 0);
    aiMember(s, 0, 1);
    effects[0] = effect;
    registerStrategicReward(s, effect, c);
    // A retained assigned creature is selected on the ordinary AI callback.
    stepStrategicGroup(s, 1, 4, c);
    expect(s.creatureControl[1]).toBe(4);
    expect(aiSWord(s.records[1], strategicGroupOffset(4) + 4)).toBe(1);
    const saved = JSON.parse(JSON.stringify(s));
    expect(saved).toEqual(s);
    effects[0][6] = 0;
    stepStrategicGroup(s, 1, 4, c);
    expect(aiSWord(s.records[1], strategicGroupOffset(4) + 4)).toBe(-1);
    expect(s.creatureControl[1]).toBe(255);
    expect(s.records[1][strategicGroupOffset(4) + 12]).toBe(255);
  });
  it("preserves the source count increment before a protected candidate is rejected", () => {
    const { s, c, effects } = aiGroupFixture(1, 0, 0);
    aiMember(s, 0, 1);
    const effect = reward(1, 0);
    effects[0] = effect;
    c.creatureProtected = () => true;
    registerStrategicReward(s, effect, c);
    stepStrategicGroup(s, 1, 4, c);
    expect(aiSWord(s.records[1], strategicGroupOffset(4) + 4)).toBe(1);
    expect(s.creatureControl[1]).toBe(255);
    //3E5A0 increments first, then returns without binding a protected record.
    expect(
      s.creatureControl.filter((_, i) => i % 2 && s.creatureControl[i] === 4),
    ).toHaveLength(0);
  });
});
