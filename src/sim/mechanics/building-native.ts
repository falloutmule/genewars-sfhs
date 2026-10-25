/** Exact numeric42FA0/43E30/43560 factory and441C0/43F60 progress writes.
 * Live intrusive links, player aggregation and resource bindings are host
 * transactions. Pointer bytes remain logical nulls, unknown priors survive. */
import { advanceAnimation, type AnimationProfile } from "./animation";
export type BuildingNative = (number | null)[];
export type NativeBuildingSelector = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 11;
export type BuildingNativeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
export interface NativeBuildingInput {
  slot: number;
  owner: number;
  selector: NativeBuildingSelector;
  position: [number, number];
  ground: number;
  shade: number;
}
export interface NativeBuildingProgress {
  native: BuildingNative;
  completed: boolean;
  completionAudioCue: 0x4d | null;
  uiRefreshRequired: true;
  /** The host applies these only on completion, together with numeric state. */
  completedPlayerCountOffset: number | null;
  acquiredOwnershipBit: number | null;
  clearCreatureTargets: boolean;
  refreshCapacity: boolean;
}
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
const selectors: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 11];
function validate(n: readonly (number | null)[]) {
  if (
    !Array.isArray(n) ||
    n.length !== 67 ||
    n.some((v) => v !== null && !integer(v, 0, 255)) ||
    n.slice(31, 39).some((v) => v !== null)
  )
    throw new Error("invalid-native-building-prior");
}
function byte(n: readonly (number | null)[], at: number) {
  const v = n[at];
  if (v === null || v === undefined)
    throw new Error("unknown-native-building-byte-" + at);
  return v;
}
function word(n: readonly (number | null)[], at: number) {
  return ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
}
function put(n: BuildingNative, at: number, v: number) {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
}
function put32(n: BuildingNative, at: number, v: number) {
  put(n, at, v);
  put(n, at + 2, v >> 16);
}
function attempt<T>(f: () => T): BuildingNativeResult<T> {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "invalid-native-building",
    };
  }
}

/** Slot selection/partition count/mean centers remain the caller's real pool
 * operation. Returned previous/next kinds are clear until actual insertion. */
export function createNativeBuilding(
  prior: readonly (number | null)[],
  input: NativeBuildingInput,
): BuildingNativeResult<BuildingNative> {
  return attempt(() => {
    validate(prior);
    if (byte(prior, 6) !== 0) throw new Error("native-building-slot-occupied");
    if (
      !integer(input.owner, 0, 3) ||
      !integer(input.slot, 0, 255) ||
      Math.floor(input.slot / 64) !== input.owner ||
      !selectors.includes(input.selector) ||
      input.position.length !== 2 ||
      input.position.some((v) => !integer(v, 0, 32767)) ||
      !integer(input.ground, -0x80000000, 0x7fffffff) ||
      !integer(input.shade, 0, 255)
    )
      throw new Error("invalid-native-building-factory-input");
    const n = prior.slice();
    n[6] = 4;
    n[2] = n[5] = 0;
    put(n, 15, input.slot);
    n[24] = input.owner;
    put(n, 7, input.position[0]);
    put(n, 9, input.position[1]);
    put32(n, 17, input.ground);
    put(n, 21, 4);
    n[23] = input.shade;
    n.fill(0, 11, 15);
    n.fill(0, 25, 30);
    put(n, 43, 0);
    n[46] = n[47] = n[60] = n[66] = 0;
    put(n, 49, 0);
    put32(n, 54, 0);
    n[45] = input.selector;
    if (input.selector === 0) put(n, 58, -1);
    //43E30 selector5 resets the pad pulse/stamp;51 and53 remain prior bytes.
    if (input.selector === 5) n[52] = n[54] = 0;
    n.fill(0, 39, 43);
    put(
      n,
      0,
      ((input.position[1] >> 8) & 127) * 128 + ((input.position[0] >> 8) & 127),
    );
    return n;
  });
}

/** maximumHealth is the actual imported selector/grade health-table entry.
 * Constructor energy is retained; completion establishes200, flags0001 and
 * animation frame0. Counter30, dirty timer48 and extra drain63 survive. */
export function progressNativeBuilding(
  before: readonly (number | null)[],
  input: { increment: number; maximumHealth: number; loading: boolean },
): BuildingNativeResult<NativeBuildingProgress> {
  return attempt(() => {
    validate(before);
    const selector = byte(before, 45),
      owner = byte(before, 24),
      slot = word(before, 15),
      health = word(before, 43);
    if (
      byte(before, 6) !== 4 ||
      !selectors.includes(selector) ||
      owner >= 4 ||
      Math.floor(slot / 64) !== owner ||
      !integer(slot, 0, 255) ||
      byte(before, 46) !== 0 ||
      byte(before, 47) !== 0 ||
      word(before, 49) !== 0 ||
      !integer(input.increment, -32768, 32767) ||
      !integer(input.maximumHealth, 1, 32767) ||
      health < 0 ||
      health >= input.maximumHealth
    )
      throw new Error("invalid-native-building-progress");
    const n = before.slice(),
      next = ((health + input.increment) << 16) >> 16,
      completed = next >= input.maximumHealth;
    put(n, 43, next);
    if (completed) {
      n[46] = n[27] = 0;
      put(n, 43, input.maximumHealth);
      put(n, 49, 1);
      n[21] = byte(n, 21) | 4;
      put(n, 61, 200);
    }
    return {
      native: n,
      completed,
      completionAudioCue:
        completed && !input.loading && selector !== 6 ? 0x4d : null,
      uiRefreshRequired: true,
      completedPlayerCountOffset: completed ? 0x600 + selector : null,
      acquiredOwnershipBit: completed ? 1 << selector : null,
      clearCreatureTargets: completed,
      refreshCapacity: completed,
    };
  });
}

/** Source451F0 incomplete common callback. Native47 is the target grade, so
 * frame27 follows that byte directly; it is not a health-percentage stage. */
export function stepIncompleteNativeBuilding(
  before: readonly (number | null)[],
  animation0: AnimationProfile,
): BuildingNativeResult<{
  native: BuildingNative;
  queueRequested: boolean;
  stopAudio23: boolean;
  stopAudio2f: boolean;
}> {
  return attempt(() => {
    validate(before);
    const selector = byte(before, 45);
    if (
      byte(before, 6) !== 4 ||
      byte(before, 24) >= 4 ||
      !selectors.includes(selector) ||
      // Only genuinely contradictory states are refused here. A disabled or
      // depleted under-construction building is ordinary: BUILDING_STARTUP.md
      // records that disabled/incomplete cases bypass the complete-and-enabled
      // upkeep branch and share inactive energy decay, so construction keeps
      // stepping. Rejecting bit 0x40 here froze the world whenever an Ethereal
      // damaged someone's in-progress building.
      (word(before, 49) & 0x801) !== 0
    )
      throw new Error("unsupported-incomplete-building-state");
    const n = before.slice(),
      timer = word(n, 61);
    if (timer > 0) put(n, 61, timer - 1);
    if (byte(before, 28) !== 0 || byte(before, 48) !== 0)
      n[21] = byte(n, 21) | 4;
    if (byte(n, 48) > 0) n[48] = byte(n, 48) - 1;
    const queueRequested = word(n, 43) > 0;
    if (queueRequested) {
      if (
        !animation0.holds.length ||
        animation0.holds.length > 255 ||
        animation0.holds.some((v) => !integer(v, 0, 255))
      )
        throw new Error("original-incomplete-building-animation-required");
      const a = advanceAnimation(
        {
          action: 0,
          frame: byte(n, 47),
          hold: byte(n, 26),
          direction: 0,
          delay: (byte(n, 29) << 24) >> 24,
          counter: (byte(n, 30) << 24) >> 24,
        },
        animation0,
      );
      n[25] = 0;
      n[26] = a.hold;
      n[27] = a.frame;
      n[28] = 0;
      n[30] = a.counter & 255;
    }
    return {
      native: n,
      queueRequested,
      stopAudio23: selector === 1 || selector === 6,
      stopAudio2f: selector === 11,
    };
  });
}
