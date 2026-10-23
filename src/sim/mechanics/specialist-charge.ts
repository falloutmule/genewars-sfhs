/**57860: powered specialist charge threshold releases creature references.
 * It never charges a resource account, queries space, creates effects or draws
 * RNG. The caller owns57A10's style/power/idle gate and native115 increment. */
type Native = readonly (number | null)[];
export interface SpecialistChargeWrite {
  creatureIndex: number;
  offset: 79 | 82 | 87 | 90 | 93 | 96;
  before: number;
  after: number;
  reason: "reference-kind" | "retained-target-flag";
}
export interface SpecialistChargePlan {
  activeRows: number;
  skippedRows: number;
  /** Ascending pool order, then native4D/50/55/58/5B references. For the last
   * reference native60 bit1 is written before its kind byte is cleared. */
  writes: SpecialistChargeWrite[];
}
export interface SpecialistChargeWorld {
  specialists: { records: (number | null)[][] };
  /** Actual shared300×124 source pool, with current active afterimages. */
  creatureNative: (number | null)[][];
}
const referenceOffsets = [77, 80, 85, 88, 91] as const;
function byte(n: Native, at: number): number {
  const value = n[at];
  if (value == null || !Number.isInteger(value) || value < 0 || value > 255)
    throw Error("Unknown specialist charge numeric byte " + at);
  return value;
}
function word(n: Native, at: number): number {
  return ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
}
/** Pure complete57860 plan. Reference indices and every other byte survive.
 * Inactive rows are not inspected beyond kind6. Target fields and reference
 * indices are read lazily at the same source equality gates. */
export function planSpecialistCharge(
  target: Native,
  creatures: readonly Native[],
): SpecialistChargePlan {
  if (
    target.length !== 200 ||
    creatures.length !== 300 ||
    creatures.some((n) => n.length !== 124)
  )
    throw Error("Actual specialist200 and creature300x124 records required");
  if (new Set(creatures).size !== 300)
    throw Error("Distinct source creature pool record identities required");
  const out: SpecialistChargePlan = {
    activeRows: 0,
    skippedRows: 0,
    writes: [],
  };
  for (let creatureIndex = 0; creatureIndex < 300; creatureIndex++) {
    const n = creatures[creatureIndex];
    if (byte(n, 6) === 0) {
      out.skippedRows++;
      continue;
    }
    out.activeRows++;
    for (const offset of referenceOffsets) {
      if (
        byte(n, offset + 2) !== byte(target, 6) ||
        word(n, offset) !== word(target, 15)
      )
        continue;
      if (offset === 91) {
        //5797B reads the word, then explicitly zeroes CH before testing bit2.
        //The following store touches low byte96 only, preserving byte97.
        const flags = byte(n, 96);
        if (flags & 2)
          out.writes.push({
            creatureIndex,
            offset: 96,
            before: flags,
            after: flags & 253,
            reason: "retained-target-flag",
          });
      }
      out.writes.push({
        creatureIndex,
        offset: (offset + 2) as 79 | 82 | 87 | 90 | 93,
        before: byte(n, offset + 2),
        after: 0,
        reason: "reference-kind",
      });
    }
  }
  return out;
}
/** In-place service for an already isolated57A10 callback. The entire plan is
 * validated before the first write, so malformed later rows cannot partially
 * clear earlier references. No outer world copy or record replacement occurs. */
export function applyStagedSpecialistCharge<W extends SpecialistChargeWorld>(
  world: W,
  specialistIndex: number,
): SpecialistChargePlan {
  if (
    !Number.isInteger(specialistIndex) ||
    specialistIndex < 0 ||
    specialistIndex >= 20 ||
    world.specialists.records.length !== 20
  )
    throw Error("Actual twenty-slot specialist charge source required");
  const plan = planSpecialistCharge(
    world.specialists.records[specialistIndex],
    world.creatureNative,
  );
  for (const change of plan.writes)
    world.creatureNative[change.creatureIndex][change.offset] = change.after;
  return plan;
}
