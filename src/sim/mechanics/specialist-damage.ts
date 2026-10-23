/** Original kind3 virtual34/4FF40, shared57FD8/581F0 and57740 retirement.
 * Call only inside the host's isolated transaction; native aliases survive. */
import { animationFinished, type AnimationProfile } from "./animation";
import {
  validateSpecialistNative,
  type SpecialistBinding,
  type SpecialistPool,
} from "./specialist-native";

type Native = (number | null)[];
export interface SpecialistDamageWorld {
  specialists: SpecialistPool;
  players: { raw: number[] }[];
}
export interface SpecialistDamageAttacker {
  index: number;
  kind: number;
}
export interface SpecialistCorpseRequest {
  code: 69;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  parameter: 0;
  delay: 0;
  parent: null;
  newborn: false;
  packed76: number;
  assetKey: string;
  action: 9;
  frame: number;
}
export type SpecialistDamageEvent =
  | {
      type: "specialist-voice";
      index: number;
      style: number;
      category: number;
      variant: 4 | 5;
      /**419E0 is an entity voice queue, not an indexed WAVE play request. */
      queuePolicy: 0;
      arguments: [2, 0, 127, 100];
    }
  | { type: "specialist-panel-clear"; index: number }
  | { type: "specialist-panel-remove"; index: number; listIndex: number }
  | {
      type: "specialist-retired";
      index: number;
      retiredIndex: number | null;
      owner: number;
      blueprintIndex: number;
      resourceCleared: boolean;
      blueprintDeleted: true;
      reason: "removed" | "death";
    }
  | {
      type: "specialist-lost";
      index: number;
      owner: number;
      before: number;
      after: number;
    }
  | { type: "specialist-corpse"; index: number; created: boolean };
export interface SpecialistDamageContext<W extends SpecialistDamageWorld> {
  /** Source51E80(mode1), including actual category/task cleanup. Called only
   * for lethal damage while native58 bit0 is set. Never a stop-only substitute. */
  cancelWork?(world: W, index: number, mode: 1): void;
  /** Source8ACC0, before724C0; the host publishes all actual native links. */
  unlink?(world: W, index: number, displayPhase: 16): void;
  /** Full shared724C0 logical-reference cleanup, before owner-list mutation. */
  cleanupReferences?(world: W, target: { index: number; kind: 3 }): void;
  /** Actual retained C0 for an otherwise unbound inactive slot. Null means
   * proven no matching player blueprint, not an inferred zero prior. */
  inactiveBlueprint?(
    world: W,
    index: number,
  ): { owner: number; blueprintIndex: number } | null;
  /** Actual original unit-panel discriminator and selected-actor identity. */
  unitPanelActive: boolean;
  selectedActor: number | null;
  /** Required only by state4/5 dispatch, using the actor's actual ANB. */
  profile?(world: W, index: number, action: 9 | 10): AnimationProfile;
  /** Real shared48790 code69 factory before unit removal; capacity failure is
   * false and does not cancel death. Copy actual actor ANB/resource binding. */
  corpse?(world: W, index: number, request: SpecialistCorpseRequest): boolean;
}
const signedByte = (v: number) => (v << 24) >> 24;
function byte(n: readonly (number | null)[], p: number): number {
  const v = n[p];
  if (!Number.isInteger(v) || v! < 0 || v! > 255)
    throw Error("Unknown specialist damage byte " + p);
  return v!;
}
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
function integer(v: number, lo: number, hi: number, label: string) {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw Error("Invalid specialist " + label);
}
function bound<W extends SpecialistDamageWorld>(w: W, index: number) {
  integer(index, 0, 19, "damage index");
  if (
    w.specialists.schemaVersion !== 1 ||
    w.specialists.records.length !== 20 ||
    w.specialists.bindings.length !== 20 ||
    w.players.length !== 4
  )
    throw Error("Actual full specialist/player pools required");
  const n = w.specialists.records[index],
    binding = w.specialists.bindings[index];
  validateSpecialistNative(n);
  if (
    byte(n, 6) !== 3 ||
    word(n, 15) !== index ||
    !binding ||
    byte(n, 24) !== binding.owner ||
    byte(n, 116) !== binding.blueprintIndex ||
    Math.floor(index / 5) !== binding.owner
  )
    throw Error("Actual specialist identity/blueprint binding required");
  const owner = binding.owner,
    raw = w.players[owner].raw;
  integer(owner, 0, 3, "owner");
  integer(binding.style, 0, 3, "style");
  integer(binding.category, 0, 3, "category");
  if (raw.length !== 1805 || raw[1] !== owner)
    throw Error("Actual specialist owner player record required");
  const offset = 0x16 + binding.blueprintIndex * 36;
  integer(binding.blueprintIndex, 0, 31, "blueprint index");
  if (
    byte(raw, offset + 21) !== binding.style ||
    byte(raw, offset + 22) !== binding.category
  )
    throw Error("Specialist blueprint style/category binding differs");
  return { n, binding, raw, offset, owner };
}
/** Ports may edit source records but must not replace native/player arrays:
 * callers retain real source pointers throughout the enclosing callback. */
function port<W extends SpecialistDamageWorld, T>(
  w: W,
  index: number,
  run: () => T,
): T {
  const a = bound(w, index),
    value = run();
  if (
    w.specialists.records[index] !== a.n ||
    w.players[a.owner].raw !== a.raw ||
    w.specialists.bindings[index] !== a.binding
  )
    throw Error(
      "Specialist damage service replaced retained native/blueprint bindings",
    );
  return value;
}
const voice = (
  index: number,
  b: SpecialistBinding,
  variant: 4 | 5,
): SpecialistDamageEvent => ({
  type: "specialist-voice",
  index,
  style: b.style,
  category: b.category,
  variant,
  queuePolicy: 0,
  arguments: [2, 0, 127, 100],
});
export interface SpecialistDamageResult {
  dead: boolean;
  effectiveDamage: number;
  healthBefore: number | null;
  healthAfter: number | null;
  events: SpecialistDamageEvent[];
}
/**4FF40. Health is signed blueprint1A; lethal state4 intentionally retains its
 * positive value until the actual blueprint deletion after death animation. */
export function damageSpecialist<W extends SpecialistDamageWorld>(
  w: W,
  index: number,
  amount: number,
  attacker: SpecialistDamageAttacker | null,
  c: SpecialistDamageContext<W>,
): SpecialistDamageResult {
  const a = bound(w, index),
    n = a.n,
    events: SpecialistDamageEvent[] = [];
  integer(amount, -2147483648, 2147483647, "damage amount");
  if (signedByte(byte(n, 85)) === 3)
    return {
      dead: false,
      effectiveDamage: 0,
      healthBefore: null,
      healthAfter: null,
      events,
    };
  const health = signedByte(byte(a.raw, a.offset + 26));
  if (health <= 0)
    return {
      dead: true,
      effectiveDamage: 0,
      healthBefore: health,
      healthAfter: health,
      events,
    };
  if (attacker) {
    integer(attacker.index, 0, 32767, "attacker index");
    integer(attacker.kind, 1, 8, "attacker kind");
  }
  let damage = amount;
  if (a.binding.style === 1) damage = Math.max(1, damage >> 1);
  if (((health - damage) | 0) <= 0 && byte(n, 88) & 1 && !c.cancelWork)
    throw Error(
      "Lethal specialist damage requires actual51E80 work cancellation",
    );
  if (attacker) {
    put(n, 123, attacker.index);
    n[125] = attacker.kind;
    if (attacker.kind === 1) put(n, 65, word(n, 65) >> 1);
  } else n[125] = 0;
  if (((health - damage) | 0) <= 0) {
    if (byte(n, 88) & 1) port(w, index, () => c.cancelWork!(w, index, 1));
    n[27] = n[29] = 0;
    n[28] = 1;
    n[85] = 4;
    n[113] = byte(n, 113) | 16;
    events.push(voice(index, a.binding, 5));
    return {
      dead: true,
      effectiveDamage: damage,
      healthBefore: health,
      healthAfter: signedByte(byte(a.raw, a.offset + 26)),
      events,
    };
  }
  if (signedByte(byte(n, 85)) === 5)
    return {
      dead: false,
      effectiveDamage: damage,
      healthBefore: health,
      healthAfter: health,
      events,
    };
  a.raw[a.offset + 26] = (byte(a.raw, a.offset + 26) - damage) & 255;
  events.push(voice(index, a.binding, 4));
  n[86] = byte(n, 85);
  n[85] = 5;
  n[27] = n[29] = 0;
  n[28] = 1;
  put32(n, 108, dword(n, 104));
  put32(n, 104, 10000);
  return {
    dead: false,
    effectiveDamage: damage,
    healthBefore: health,
    healthAfter: signedByte(byte(a.raw, a.offset + 26)),
    events,
  };
}
function listIndex(raw: number[], index: number) {
  const count = signedByte(byte(raw, 3));
  integer(count, 0, 5, "stored unit count");
  for (let i = 0; i < count; i++)
    if (signedByte(byte(raw, 4 + i)) === index) return i;
  return -1;
}
/**80360 searches retained C0 pointers in all five slots, including inactive
 * records. Preserve inactive bindings; an unknown prior is never a mismatch. */
function associatedSlot<W extends SpecialistDamageWorld>(
  w: W,
  owner: number,
  bp: number,
  c: SpecialistDamageContext<W>,
): number | null {
  for (let i = owner * 5; i < owner * 5 + 5; i++) {
    let b = w.specialists.bindings[i] as {
      owner: number;
      blueprintIndex: number;
    } | null;
    if (!b) {
      if (!c.inactiveBlueprint)
        throw Error(
          "Specialist retirement requires unknown retained C0 binding at slot " +
            i,
        );
      b = c.inactiveBlueprint(w, i);
    }
    if (b && b.owner === owner && b.blueprintIndex === bp) return i;
  }
  return null;
}
/**57740: original unit-panel requests, unlink, all-pool cleanup,80360 actor
 * list/resource removal,800B0 blueprint deletion. No work cancellation or RNG. */
export function retireSpecialist<W extends SpecialistDamageWorld>(
  w: W,
  index: number,
  c: SpecialistDamageContext<W>,
  reason: "removed" | "death" = "removed",
): SpecialistDamageEvent[] {
  const a = bound(w, index),
    events: SpecialistDamageEvent[] = [];
  if (
    typeof c.unitPanelActive !== "boolean" ||
    (c.selectedActor !== null &&
      (!Number.isInteger(c.selectedActor) ||
        c.selectedActor < 0 ||
        c.selectedActor >= 20))
  )
    throw Error("Actual specialist unit-panel state required");
  if (!c.unlink || !c.cleanupReferences)
    throw Error(
      "Specialist retirement requires actual spatial/reference cleanup services",
    );
  if (c.unitPanelActive) {
    if (c.selectedActor === index)
      events.push({ type: "specialist-panel-clear", index });
    const found = listIndex(a.raw, index);
    events.push({
      type: "specialist-panel-remove",
      index,
      listIndex: found < 0 ? 255 : found,
    });
  }
  port(w, index, () => c.unlink!(w, index, 16));
  port(w, index, () => c.cleanupReferences!(w, { index, kind: 3 }));
  const slot = associatedSlot(w, a.owner, a.binding.blueprintIndex, c);
  if (slot !== null) {
    const retired = w.specialists.records[slot];
    validateSpecialistNative(retired);
    a.raw[a.offset + 32] = byte(a.raw, a.offset + 32) & 252;
    const count = signedByte(byte(a.raw, 3)),
      found = listIndex(a.raw, word(retired, 15));
    integer(count, 1, 5, "retiring unit count");
    a.raw[3] = (count - 1) & 255;
    if (found >= 0)
      for (let i = found; i < count - 1; i++) a.raw[4 + i] = byte(a.raw, 5 + i);
    //C4 is a process pointer, already represented null. Retain C0 logical
    //blueprint identity for future80360 scans; activity follows native6 only.
    retired.fill(null, 196, 200);
    retired[6] = 0;
  }
  a.raw[a.offset] = 0;
  a.raw[21] = (byte(a.raw, 21) - 1) & 255;
  events.push({
    type: "specialist-retired",
    index,
    retiredIndex: slot,
    owner: a.owner,
    blueprintIndex: a.binding.blueprintIndex,
    resourceCleared: slot !== null,
    blueprintDeleted: true,
    reason,
  });
  return events;
}
export interface SpecialistDamageStateResult {
  handled: boolean;
  retired: boolean;
  events: SpecialistDamageEvent[];
}
/** State dispatch inside57A10 after its actual motion/common prefix. The
 * caller still runs the ordinary ANB tail unless retirement sets BL=0. */
export function stepSpecialistDamageState<W extends SpecialistDamageWorld>(
  w: W,
  index: number,
  c: SpecialistDamageContext<W>,
): SpecialistDamageStateResult {
  const a = bound(w, index),
    n = a.n,
    state = signedByte(byte(n, 85)),
    events: SpecialistDamageEvent[] = [];
  if (state !== 4 && state !== 5)
    return { handled: false, retired: false, events };
  const action = state === 4 ? 9 : 10;
  if (byte(n, 25) !== action) return { handled: true, retired: false, events };
  if (!c.profile)
    throw Error("Specialist death/hit lifecycle requires actual ANB metadata");
  const p = c.profile(w, index, action);
  if (
    !animationFinished(
      {
        action,
        hold: byte(n, 26),
        frame: byte(n, 27),
        direction: signedByte(byte(n, 28)),
        delay: signedByte(byte(n, 29)),
        counter: signedByte(byte(n, 30)),
      },
      p,
    )
  )
    return { handled: true, retired: false, events };
  if (state === 5) {
    n[85] = byte(n, 86);
    put32(n, 104, dword(n, 108));
    return { handled: true, retired: false, events };
  }
  if (!c.corpse)
    throw Error("Specialist death requires actual shared corpse69 factory");
  const made = port(w, index, () =>
    c.corpse!(w, index, {
      code: 69,
      owner: a.owner,
      position: [word(n, 7), word(n, 9)],
      height: dword(n, 39),
      angles: [word(n, 57), word(n, 59), word(n, 61)],
      parameter: 0,
      delay: 0,
      parent: null,
      newborn: false,
      packed76:
        ((a.binding.category << 3) |
          (a.binding.style * 2) |
          byte(a.raw, a.offset + 20) |
          192) &
        255,
      assetKey: a.binding.assetKey,
      action: 9,
      frame: p.holds.length - 1,
    }),
  );
  events.push({ type: "specialist-corpse", index, created: made });
  const before = dword(a.raw, 0x709),
    after = (before + 1) | 0;
  put32(a.raw, 0x709, after);
  events.push({
    type: "specialist-lost",
    index,
    owner: a.owner,
    before,
    after,
  });
  events.push(...retireSpecialist(w, index, c, "death"));
  return { handled: true, retired: true, events };
}
/**57A10 ANB selector arm only. Existing hold/frame/counter are source-retained;
 * caller invokes ordinary7AC00 afterwards with the actual actor ANB profile. */
export function selectSpecialistDamageAnimation<
  W extends SpecialistDamageWorld,
>(w: W, index: number): boolean {
  const n = bound(w, index).n,
    state = signedByte(byte(n, 85));
  if (state !== 4 && state !== 5) return false;
  const action = state === 4 ? 9 : 10;
  if (byte(n, 25) !== action) {
    n[25] = action;
    n[28] = 1;
    n[29] = 0;
  }
  return true;
}
