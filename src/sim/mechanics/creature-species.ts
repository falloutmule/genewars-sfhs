/** Shared kind1 species data. Native7A selects1045FC's45-byte row;
 *104A64 supplies ordered component classes, not a replacement species ID. */
import type { EcologyRules } from "./ecology";
import type { MuleCombatTraits } from "./mule-combat";
import { nextRandom, type GeneRng } from "./random";

/** Closed component family: Crab, Bird, Mule and their ordered hybrids.
 * Dinosaur and Frog ability callbacks remain separate entered boundaries. */
export function sharedCreatureCallbackSpecies(selector: number): boolean {
  return [1, 3, 4, 10, 11, 14, 19, 22, 24].includes(selector);
}

export function creatureSelector(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) >= 25
  )
    throw Error("Actual creature species selector0..24 required");
  return value as number;
}

export function creatureParameters(rules: EcologyRules, value: unknown) {
  const selector = creatureSelector(value),
    row = rules.speciesTraits?.[selector];
  // Existing synthetic selector4 fixtures supply the explicitly admitted Mule
  // coefficients. Other species always require their actual imported row.
  if (selector === 4) return { ...rules.mule, stages: 3, turn: 80 };
  if (
    !row ||
    row.length !== 45 ||
    row.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw Error("Actual1045FC species trait row required");
  const dword = (at: number) =>
    row[at] | (row[at + 1] << 8) | (row[at + 2] << 16) | (row[at + 3] << 24);
  const result = {
    selector,
    baseSpeed: dword(6),
    lifetimeScale: dword(10),
    healthScale: dword(14),
    reserveScale: dword(18),
    healthRecoveryPeriod: dword(22),
    stages: row[26],
    turn: row[27] | (row[28] << 8),
    warmThreshold: 25,
  };
  if (
    [
      result.baseSpeed,
      result.lifetimeScale,
      result.healthScale,
      result.reserveScale,
      result.healthRecoveryPeriod,
      result.stages,
      result.turn,
    ].some((v) => v <= 0)
  )
    throw Error("Invalid source creature scaling/divisor");
  return result;
}

export function creatureComponents(
  rows: readonly (readonly number[])[] | undefined,
  value: unknown,
): readonly [number, number] {
  const selector = creatureSelector(value),
    pair = rows?.[selector];
  if (
    !pair ||
    pair.length !== 2 ||
    pair.some((v) => !Number.isInteger(v) || v < 0 || v > 4)
  )
    throw Error("Actual104A64 creature component pair required");
  return pair as readonly [number, number];
}

/**60553..60573: ordered Crab components modify building damage in signed32. */
export function creatureBuildingAttackDamage(
  rows: readonly (readonly number[])[] | undefined,
  species: unknown,
  damage: number,
): number {
  if (!Number.isInteger(damage) || damage < -2147483648 || damage > 2147483647)
    throw Error("Source signed32 building attack damage required");
  const [primary, secondary] = creatureComponents(rows, species);
  return primary === 1 ? damage << 1 : secondary === 1 ? damage : damage >> 1;
}

/**5A1C0 direct resource identity. All25 entries of104494 agree with these
 * component names. A missing hybrid resource must use the primary fallback. */
export function creatureAsset(
  rows: readonly (readonly number[])[] | undefined,
  value: unknown,
  available: Readonly<Record<string, unknown>>,
): string {
  const [a, b] = creatureComponents(rows, value),
    names = ["DINO", "CRAB", "FROG", "BIRD", "MULE"],
    direct = names[a] + (a === b ? "" : names[b]);
  if (available[direct]) return direct;
  if (available[names[a]]) return names[a];
  throw Error("Actual loaded creature animation resource required");
}

export function creatureCombatTraits(
  rules: EcologyRules,
  rows: readonly (readonly number[])[] | undefined,
  value: unknown,
): MuleCombatTraits {
  const selector = creatureSelector(value),
    row = rules.speciesTraits?.[selector];
  if (selector === 4 && rules.muleCombat) return rules.muleCombat;
  creatureParameters(rules, selector);
  const [primary] = creatureComponents(rows, selector),
    channel = rules.attackChannels?.[primary];
  if (!Number.isInteger(channel))
    throw Error("Actual1060A0 attack channel required");
  return {
    queryRadius: row![0] | (row![1] << 8) | (row![2] << 16) | (row![3] << 24),
    attack: row![4],
    defense: row![5],
    disposition: row![36],
    foodWeights: [row![29], row![30], row![31]],
    attackChannel: channel!,
  };
}

/**5E435..5E456: primary1060B0 plus secondary1060A8, signed bytes.
 * These ten scalar rule coefficients are pinned by the preserved16-byte
 * range hash6ea95fe9999a933073fffc681053051e33481d920c2b3f0ed2f0c41c1638bb76. */
export function creatureColdResponse(
  rows: readonly (readonly number[])[] | undefined,
  value: unknown,
) {
  const [a, b] = creatureComponents(rows, value);
  return { primaryLoss: [3, 2, 4, 1, 1][a], secondaryLoss: [2, 0, 3, 0, 0][b] };
}

/**61DF4..62201 natural crossbreeding. Eligibility is supplied from the actual
 * parental owner/research records. Preserve the original second-parent
 * component selection quirk: choice5 reads its primary component too. */
export function chooseCreatureOffspring(
  rows: readonly (readonly number[])[],
  a: { species: number; quality: number; eligible: boolean },
  b: { species: number; quality: number; eligible: boolean },
  rng: GeneRng,
) {
  const first = creatureComponents(rows, a.species),
    second = creatureComponents(rows, b.species);
  if (
    [a.quality, b.quality].some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw Error("Actual byte creature quality required");
  let pair: readonly number[], inherit: boolean;
  if (a.species === b.species && nextRandom(rng) % 100 < 50) {
    pair = first;
    inherit =
      nextRandom(rng) % 100 < 50 * (Number(a.eligible) + Number(b.eligible));
  } else {
    const choice = nextRandom(rng) % 6,
      mask = choice < 2 ? 3 : choice === 2 ? 4 : choice < 5 ? 24 : 32,
      component = (v: number) =>
        v < 2 ? first[0] : v === 2 ? first[1] : second[0];
    let other: number,
      attempts = 0;
    do {
      other = nextRandom(rng) % 6;
      if (++attempts > 65536) throw Error("Creature gene selection RNG cycle");
    } while (mask & (1 << other));
    pair = [component(choice), component(other)];
    inherit = choice < 3 ? a.eligible : b.eligible;
  }
  const species = rows.findIndex(
    (row) => row[0] === pair[0] && row[1] === pair[1],
  );
  if (species < 0 || species >= 25)
    throw Error("Actual104A98 offspring species mapping required");
  const quality =
    Math.min(a.quality, b.quality) +
    (nextRandom(rng) % (Math.abs(a.quality - b.quality) + 1));
  return { species, quality, inherit };
}
