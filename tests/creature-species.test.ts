import { describe, it, expect } from "vitest";
import {
  creatureBuildingAttackDamage,
  creatureParameters,
  creatureAsset,
  creatureCombatTraits,
  creatureColdResponse,
  chooseCreatureOffspring,
} from "../src/sim/mechanics/creature-species";
import { speciesFixture } from "./fixtures/creature-species";

describe("shared creature species binding", () => {
  it("binds ordered hybrid resources and the source primary fallback", () => {
    const { components } = speciesFixture();
    expect(creatureAsset(components, 11, { CRABMULE: {}, MULECRAB: {} })).toBe(
      "CRABMULE",
    );
    expect(creatureAsset(components, 22, { CRABMULE: {}, MULECRAB: {} })).toBe(
      "MULECRAB",
    );
    expect(creatureAsset(components, 11, { CRAB: {} })).toBe("CRAB");
    expect(() => creatureAsset(components, 11, { MULE: {} })).toThrow(/loaded/);
  });
  it("requires actual non-Mule coefficients and positive divisors", () => {
    const { rules } = speciesFixture();
    expect(creatureParameters(rules, 1)).toMatchObject({
      baseSpeed: 410,
      turn: 31,
      stages: 3,
      healthRecoveryPeriod: 11,
    });
    rules.speciesTraits![1][26] = 0;
    expect(() => creatureParameters(rules, 1)).toThrow(/divisor/);
    delete rules.speciesTraits;
    expect(() => creatureParameters(rules, 1)).toThrow(/trait row/);
    expect(() => creatureParameters(rules, 25)).toThrow(/selector/);
  });
  it("uses the primary sound lane and both ordered temperature lanes", () => {
    const { rules, components } = speciesFixture();
    expect(creatureCombatTraits(rules, components, 11).attackChannel).toBe(11);
    expect(creatureColdResponse(components, 11)).toEqual({
      primaryLoss: 2,
      secondaryLoss: 0,
    });
    expect(creatureColdResponse(components, 22)).toEqual({
      primaryLoss: 1,
      secondaryLoss: 0,
    });
  });
  it.each([
    [1, 4, 1],
    [4, 1, 4],
    [11, 22, 11],
  ])("preserves mapped ordered breeding and RNG for %i/%i", (a, b, species) => {
    const { components } = speciesFixture(),
      rng = { seed: 5428, draws: 0, ring: 0 };
    const result = chooseCreatureOffspring(
      components,
      { species: a, quality: 70, eligible: true },
      { species: b, quality: 95, eligible: false },
      rng,
    );
    expect(result).toEqual({ species, quality: 94, inherit: true });
    expect(rng).toEqual({ seed: 52932, draws: 3, ring: 3 });
  });
});


describe("source ordered building attack modifier", () => {
  it.each([[1, 82], [11, 82], [22, 41], [4, 20]])(
    "uses both ordered components for species%i", (species, expected) => {
      expect(creatureBuildingAttackDamage(speciesFixture().components, species, 41)).toBe(expected);
    });
  it("preserves signed overflow and arithmetic halving", () => {
    const {components} = speciesFixture();
    expect(creatureBuildingAttackDamage(components, 1, 0x40000000)).toBe(-2147483648);
    expect(creatureBuildingAttackDamage(components, 4, -17)).toBe(-9);
    expect(() => creatureBuildingAttackDamage(undefined, 1, 41)).toThrow(/component/);
    expect(() => creatureBuildingAttackDamage(components, 25, 41)).toThrow(/selector/);
    expect(() => creatureBuildingAttackDamage(components, 1, 2147483648)).toThrow(/signed32/);
  });
});
