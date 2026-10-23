/** Source437A0 ascending native storage allocation. No constructors or pool
 * normalization: fields of unvisited/collapsed records retain actual priors. */
import type { BuildingNative } from "./building-native";
import type { EconomyRules } from "./economy";

export type GoopStorageRules = EconomyRules["capacity"];
export interface GoopStorageReceipt {
  owner: number;
  goopBefore: number;
  goopAfter: number;
  /** Positive excess actually removed from player4A7. */
  discarded: number;
  activeCountBefore: number;
  activeCountRemaining: number;
  /** Includes inactive slots traversed before the source stopping condition. */
  visitedSlots: number[];
  writes: {
    slot: number;
    value: number;
    cause: "allocated" | "zero-capacity";
  }[];
  retainedCollapsedSlots: number[];
  /** Null means leave all retained warning bytes untouched. */
  warningWrite: number | null;
  /** Actual source speech/UI branch: warning==1000 and owner=current player.
   * The host resolves/dispatches its original speech, without extra RNG here. */
  noticeRequested: boolean;
}
export type GoopStorageResult =
  | { ok: true; receipt: GoopStorageReceipt }
  | { ok: false; reason: string };
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
function byte(n: readonly (number | null)[], at: number) {
  const v = n[at];
  if (v === undefined || v === null || !integer(v, 0, 255))
    throw new Error(`unknown-goop-storage-byte-${at}`);
  return v;
}
function word(n: readonly (number | null)[], at: number) {
  return byte(n, at) | (byte(n, at + 1) << 8);
}
function signedWord(n: readonly (number | null)[], at: number) {
  return (word(n, at) << 16) >> 16;
}
function dword(n: readonly (number | null)[], at: number) {
  return word(n, at) | (word(n, at + 2) << 16);
}
function putWord(n: BuildingNative, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >>> 8) & 255;
}
function putDword(n: BuildingNative, at: number, value: number) {
  putWord(n, at, value);
  putWord(n, at + 2, value >>> 16);
}
function validateRules(rules: GoopStorageRules) {
  for (const [name, values] of [
    ["store4", rules.store4],
    ["store13", rules.store13],
  ] as const) {
    if (
      values.length !== 3 ||
      !integer(values[0], 0, 0x7fffff) ||
      values.some((v, grade) => v !== (grade + 1) * values[0])
    )
      throw new Error(`invalid-goop-storage-${name}-linear-profile`);
  }
  if (
    !integer(rules.extractor, 0, 0x7fffffff) ||
    !integer(rules.unusedGoopWarningTicks, 1, 32767)
  )
    throw new Error("invalid-goop-storage-profile");
}

/** Pure source437A0 plan from actual native records and player1805.
 * Active-count/GOOP gates run before reading each next slot. Source uses signed
 * player4A2 and signed32 GOOP, and does not inspect completion, power or0100.
 * A bad count running off the real256 pool is refused; it is not repaired. */
export function planGoopStorageAllocation(
  records: readonly (readonly (number | null)[])[],
  player: readonly (number | null)[],
  currentPlayer: number,
  rules: GoopStorageRules,
): GoopStorageResult {
  try {
    if (
      records.length !== 256 ||
      records.some((n) => n.length !== 67) ||
      player.length !== 1805 ||
      !integer(currentPlayer, 0, 3)
    )
      throw new Error("invalid-goop-storage-native-pools");
    validateRules(rules);
    const owner = byte(player, 0x4a1),
      activeCount = (byte(player, 0x4a2) << 24) >> 24;
    if (!integer(owner, 0, 3)) throw new Error("invalid-goop-storage-owner");
    const goop = dword(player, 0x4a7);
    const receipt: GoopStorageReceipt = {
      owner,
      goopBefore: goop,
      goopAfter: goop,
      discarded: 0,
      activeCountBefore: activeCount,
      activeCountRemaining: activeCount,
      visitedSlots: [],
      writes: [],
      retainedCollapsedSlots: [],
      warningWrite: null,
      noticeRequested: false,
    };
    let slot = owner * 64,
      remaining = goop,
      count = activeCount;
    while (count > 0 && remaining > 0) {
      const n = records[slot];
      if (!n) throw new Error("goop-storage-active-count-overruns-native-pool");
      receipt.visitedSlots.push(slot);
      if (byte(n, 6) !== 0) {
        count--;
        const selector = byte(n, 45);
        if (selector === 4 || selector === 11 || selector === 13) {
          const flags = word(n, 49),
            collapsed = !!(flags & 0x800);
          const capacity =
            flags & 0x840
              ? 0
              : selector === 11
                ? rules.extractor
                : (byte(n, 46) + 1) *
                  (selector === 4 ? rules.store4[0] : rules.store13[0]);
          if (capacity === 0) {
            if (collapsed) receipt.retainedCollapsedSlots.push(slot);
            else
              receipt.writes.push({ slot, value: 0, cause: "zero-capacity" });
          } else {
            const allocated = Math.min(capacity, remaining);
            remaining -= allocated;
            receipt.writes.push({ slot, value: allocated, cause: "allocated" });
          }
        }
      }
      slot++;
    }
    receipt.activeCountRemaining = count;
    if (remaining > 0) {
      const warning = signedWord(player, 0x5f0);
      const afterWarning =
        warning === 0 ? rules.unusedGoopWarningTicks : warning;
      receipt.goopAfter = (goop - remaining) | 0;
      receipt.discarded = remaining;
      if (warning === 0) receipt.warningWrite = afterWarning;
      receipt.noticeRequested =
        afterWarning === rules.unusedGoopWarningTicks &&
        owner === currentPlayer;
    }
    return { ok: true, receipt };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "invalid-goop-storage",
    };
  }
}

/** Plan first, then apply only established writes in place. Late input errors
 * cannot partially clear native54 or discard player GOOP. Host source speech/UI
 * is an explicit receipt obligation, not a numeric/RNG default. */
export function allocateStagedGoopStorage(
  records: BuildingNative[],
  player: BuildingNative,
  currentPlayer: number,
  rules: GoopStorageRules,
): GoopStorageResult {
  const result = planGoopStorageAllocation(
    records,
    player,
    currentPlayer,
    rules,
  );
  if (!result.ok) return result;
  for (const write of result.receipt.writes)
    putDword(records[write.slot], 54, write.value);
  if (result.receipt.discarded > 0)
    putDword(player, 0x4a7, result.receipt.goopAfter);
  if (result.receipt.warningWrite !== null)
    putWord(player, 0x5f0, result.receipt.warningWrite);
  return result;
}
