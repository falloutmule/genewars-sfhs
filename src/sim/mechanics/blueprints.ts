import { nextRandom, type GeneRng } from "./random";
export type SpecialistCategory = 0 | 1 | 2 | 3;
export type RaceStyle = 0 | 1 | 2 | 3;
export interface Blueprint {
  index: number;
  name: string;
  style: RaceStyle;
  category: SpecialistCategory;
  skill: number;
  health: number;
  maxHealth: number;
  runtimeFlags: number;
  /** Not initialized by the original generator. Kept explicit, never guessed. */
  unresolved: { byte18: number | null; byte1b: number | null };
}
export interface BlueprintRules {
  skillBase: number;
  skillRange: number;
  skillDifficultyIncrement: number;
  healthDifficultyIncrement: number;
  styles: {
    healthBase: number;
    healthRange: number;
    healthLimit: number;
    skillLimit: number;
  }[];
}
export function generateBlueprints(
  names: readonly string[],
  rules: BlueprintRules,
  initial: GeneRng,
  campaign = true,
): { blueprints: Blueprint[]; rng: GeneRng } {
  if (
    names.length !== 128 ||
    new Set(names).size !== 128 ||
    names.some((n) => !n.length || n.length > 19 || n.includes("\0"))
  )
    throw new Error("Original name table requires 128 distinct bounded names");
  if (
    rules.styles.length !== 4 ||
    rules.skillRange < 1 ||
    rules.styles.some((s) => s.healthRange < 1)
  )
    throw new Error("Original blueprint rule profile missing");
  const rng = { ...initial },
    blueprints: Blueprint[] = [];
  for (let category = 0; category < 4; category++) {
    const start = nextRandom(rng) % 100;
    for (let ordinal = 0; ordinal < 5; ordinal++) {
      const style = ((start + ordinal) % 4) as RaceStyle,
        profile = rules.styles[style],
        difficulty = campaign ? 0 : ordinal;
      const health = Math.min(
        profile.healthLimit,
        profile.healthBase +
          rules.healthDifficultyIncrement * difficulty +
          (nextRandom(rng) % profile.healthRange),
      );
      const skill = Math.min(
        profile.skillLimit,
        rules.skillBase +
          rules.skillDifficultyIncrement * difficulty +
          (nextRandom(rng) % rules.skillRange),
      );
      const free = names
        .slice(style * 32, style * 32 + 32)
        .filter((n) => !blueprints.some((b) => b.name === n));
      const name = free[nextRandom(rng) % free.length];
      blueprints.push({
        index: blueprints.length,
        name,
        style,
        category: category as SpecialistCategory,
        skill,
        health,
        maxHealth: health,
        runtimeFlags: 0,
        unresolved: { byte18: null, byte1b: null },
      });
    }
  }
  return { blueprints, rng };
}
export function categoryEnabled(
  category: SpecialistCategory,
  mask: number,
  progress: number,
): boolean {
  return (
    !!(mask & (1 << category)) &&
    (category !== 1 || progress >= 1) &&
    (category !== 3 || progress >= 4)
  );
}
export function selectMissionBlueprints(
  blueprints: readonly Blueprint[],
  mask: number,
  progress: number,
  capacity = 5,
): Blueprint[] {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 5)
    throw new Error("Original specialist capacity is five per player");
  const selected: Blueprint[] = [],
    attempted = new Set<number>();
  for (const b of blueprints) {
    if (
      !b.name ||
      !categoryEnabled(b.category, mask, progress) ||
      attempted.has(b.category)
    )
      continue;
    attempted.add(b.category);
    if (selected.length < capacity) selected.push(structuredClone(b));
  }
  return selected;
}
