/**451F0 flag0800 branch,4523B..4538F and its ordinary common tail.
 * This is timed demolition/salvage, never an ownership transfer. */
import { advanceAnimation, type AnimationProfile } from "./animation";
export type DemolitionNative = (number | null)[];
export interface DemolitionSalvageRequest {
  code: 45;
  owner: 9;
  position: [number, number];
  height: number;
  angles: [0, 0, 0];
  parameter: 5000;
  delay: number;
  parent: null;
  newborn: false;
}
export interface DemolitionActor {
  index: number;
  native: DemolitionNative;
  skill: number;
}
export type DemolitionEvent = {
  type: "stop-audio";
  slot: number;
  channel: 0x23 | 0x2f;
};
export interface BuildingDemolitionContext<W> {
  native(w: W, slot: number): DemolitionNative;
  actor(w: W, index: number): DemolitionActor;
  constructionCosts: readonly number[];
  profile(w: W, slot: number, action: number): AnimationProfile;
  salvage(w: W, request: DemolitionSalvageRequest): number | null;
  capacity(w: W, owner: number): void;
  retire(w: W, slot: number): void;
  onEvent?(w: W, event: DemolitionEvent): void;
}
export interface BuildingDemolitionReceipt {
  slot: number;
  timerBefore: number;
  timerAfter: number;
  retired: boolean;
  queueDraw: boolean;
  salvage: { request: DemolitionSalvageRequest; slot: number | null } | null;
  events: DemolitionEvent[];
}
const byte = (n: readonly (number | null)[], at: number) => {
  const v = n[at];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error("Unknown demolition numeric byte " + at);
  return v;
};
const word = (n: readonly (number | null)[], at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
const put = (n: DemolitionNative, at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
};
const put32 = (n: DemolitionNative, at: number, v: number) => {
  put(n, at, v);
  put(n, at + 2, v >> 16);
};
/**Signed32 multiplication and truncating division precede SAR4 and signed8
 * promotion. The factory stores that byte; collection later reads it unsigned. */
export function demolitionSalvagePayload(cost: number, skill: number): number {
  if (
    !Number.isInteger(cost) ||
    cost < -2147483648 ||
    cost > 2147483647 ||
    !Number.isInteger(skill) ||
    skill < -128 ||
    skill > 127
  )
    throw Error("Original demolition cost/signed blueprint skill required");
  return ((Math.trunc(Math.imul(cost >> 1, skill) / 100) >> 4) << 24) >> 24;
}
/** Already-isolated complete callback. No ordinary selector upkeep follows. */
export function stepStagedBuildingDemolition<W>(
  w: W,
  slot: number,
  c: BuildingDemolitionContext<W>,
): BuildingDemolitionReceipt {
  const n = c.native(w, slot);
  if (
    n.length !== 67 ||
    byte(n, 6) !== 4 ||
    word(n, 15) !== slot ||
    !(word(n, 49) & 0x800)
  )
    throw Error("Actual flag0800 building demolition state required");
  const owner = byte(n, 24),
    selector = byte(n, 45),
    before = dword(n, 54),
    next = (before - 8) | 0;
  if (owner > 3 || Math.floor(slot / 64) !== owner || selector > 13)
    throw Error("Actual demolition owner/selector required");
  const out: BuildingDemolitionReceipt = {
    slot,
    timerBefore: before,
    timerAfter: next,
    retired: false,
    queueDraw: false,
    salvage: null,
    events: [],
  };
  const emit = (channel: 0x23 | 0x2f) => {
    const e: DemolitionEvent = { type: "stop-audio", slot, channel };
    out.events.push(e);
    c.onEvent?.(w, e);
  };
  n[21] = byte(n, 21) | 4;
  put32(n, 54, next);
  if (next <= 0) {
    if (byte(n, 66) === 3) {
      const actor = c.actor(w, word(n, 64)),
        cost = c.constructionCosts[selector];
      if (c.constructionCosts.length !== 14)
        throw Error("Original demolition construction costs required");
      const request: DemolitionSalvageRequest = {
        code: 45,
        owner: 9,
        position: [word(n, 7), word(n, 9)],
        height: dword(n, 17),
        angles: [0, 0, 0],
        parameter: 5000,
        delay: demolitionSalvagePayload(cost, actor.skill),
        parent: null,
        newborn: false,
      };
      const made = c.salvage(w, request);
      out.salvage = { request, slot: made };
      //Recursive replacement cleanup may have cleared this real actor reference.
      if (
        made !== null &&
        byte(actor.native, 129) === 4 &&
        word(actor.native, 127) === slot
      ) {
        put(actor.native, 127, made);
        actor.native[129] = 5;
      }
    }
    if ([1, 6, 7].includes(selector)) emit(0x23);
    else if ([2, 11].includes(selector)) emit(0x2f);
    c.capacity(w, owner);
    c.retire(w, slot);
    out.retired = true;
    return out;
  }
  //47DA4: only the common tail runs while the demolition timer remains positive.
  const flags = word(n, 49) & 65535,
    complete = !!(flags & 1),
    disabled = !!(flags & 0x40);
  if (flags & 0x140 || !complete) {
    if (word(n, 61) > 0) put(n, 61, word(n, 61) - 1);
    if ([1, 6, 7].includes(selector)) emit(0x23);
    else if ([2, 11].includes(selector)) emit(0x2f);
    else if (selector === 12) {
      if (word(n, 61) === 0) n[28] = 0;
      else n[29] = ((200 - word(n, 61)) >> 6) & 255;
    }
  }
  if (byte(n, 48) > 0) n[48] = byte(n, 48) - 1;
  if (!complete && word(n, 43) < 1) return out;
  if (!complete) {
    n[25] = 0;
    n[28] = 0;
    n[27] = byte(n, 47);
  } else if (!disabled) n[25] = (byte(n, 46) + 1) & 255;
  else {
    n[25] = 4;
    n[28] = 0;
    n[27] = byte(n, 46);
  }
  const a = advanceAnimation(
    {
      action: byte(n, 25),
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: (byte(n, 28) << 24) >> 24,
      delay: (byte(n, 29) << 24) >> 24,
      counter: (byte(n, 30) << 24) >> 24,
    },
    c.profile(w, slot, byte(n, 25)),
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  out.queueDraw = true;
  return out;
}
