import { describe, it, expect } from "vitest";
import { nextRandom } from "../src/sim/mechanics/random";
import {
  generateBlueprints,
  selectMissionBlueprints,
  type BlueprintRules,
} from "../src/sim/mechanics/blueprints";
// Synthetic profile, not embedded original game data. Original rules are imported.
const rules: BlueprintRules = {
  skillBase: 25,
  skillRange: 10,
  skillDifficultyIncrement: 10,
  healthDifficultyIncrement: 5,
  styles: Array.from({ length: 4 }, (_, i) => ({
    healthBase: 10 + i * 5,
    healthRange: 10,
    healthLimit: 100,
    skillLimit: 100,
  })),
};
const names = Array.from({ length: 128 }, (_, i) => "Fixture" + i);
describe("original stream and specialist preparation", () => {
  it("preserves the proved 64-draw Exceland RNG transition", () => {
    const input = { seed: 5428, draws: 16855, ring: null },
      out = generateBlueprints(names, rules, input);
    expect(out.rng).toEqual({ seed: 10548, draws: 16919, ring: null });
    expect(input.seed).toBe(5428);
    expect(out.blueprints).toHaveLength(20);
    expect(new Set(out.blueprints.map((b) => b.name)).size).toBe(20);
    expect(
      out.blueprints.every(
        (b) => b.unresolved.byte18 === null && b.unresolved.byte1b === null,
      ),
    ).toBe(true);
  });
  it("does not allow diagnostic ring history to change random outcomes", () => {
    const a = { seed: 47117, draws: 33620, ring: 0 },
      b = { ...a, ring: 31 };
    for (let i = 0; i < 100; i++) expect(nextRandom(a)).toBe(nextRandom(b));
    expect(a.seed).toBe(b.seed);
  });
  it("wraps the original seed, draw counter and ring explicitly", () => {
    const r = { seed: 0, draws: 0xffffffff, ring: 31 };
    expect(nextRandom(r)).toBe(0);
    expect(r).toEqual({ seed: 0, draws: 0, ring: 0 });
    expect(() => nextRandom({ seed: -1, draws: 0, ring: null })).toThrow();
  });
  it("chooses original category order and gates later specialist types", () => {
    const b = generateBlueprints(names, rules, {
      seed: 5428,
      draws: 16855,
      ring: 0,
    }).blueprints;
    expect(selectMissionBlueprints(b, 15, 0).map((b) => b.index)).toEqual([
      0, 10,
    ]);
    expect(selectMissionBlueprints(b, 7, 1).map((b) => b.index)).toEqual([
      0, 5, 10,
    ]);
    expect(selectMissionBlueprints(b, 15, 4).map((b) => b.index)).toEqual([
      0, 5, 10, 15,
    ]);
    expect(selectMissionBlueprints(b, 15, 4, 2).map((b) => b.index)).toEqual([
      0, 5,
    ]);
  });
  it("keeps difficulty out of canonical campaign generation without changing RNG draws", () => {
    const a = generateBlueprints(names, rules, { seed: 1, draws: 0, ring: 0 }),
      b = generateBlueprints(
        names,
        rules,
        { seed: 1, draws: 0, ring: 0 },
        false,
      );
    expect(a.rng).toEqual(b.rng);
    for (let i = 0; i < 20; i++)
      expect(b.blueprints[i].skill - a.blueprints[i].skill).toBe(10 * (i % 5));
  });
  it("rejects incomplete/duplicate name tables instead of inventing specialists", () => {
    expect(() =>
      generateBlueprints(names.slice(1), rules, { seed: 1, draws: 0, ring: 0 }),
    ).toThrow();
    expect(() =>
      generateBlueprints(Array(128).fill("Same"), rules, {
        seed: 1,
        draws: 0,
        ring: 0,
      }),
    ).toThrow();
  });
});
