/**451F0 selector2: plant processing into retained construction material54.
 * In-place entry is for an already isolated complete host transaction. */
import {
  advanceAnimation,
  type AnimationProfile,
  type AnimationState,
} from "./animation";
import type { BuildingNative } from "./building-native";
import type {
  BuildingStartupRules,
  RecyclingMaterial,
} from "./building-startup";

export type PulperEvent =
  | { type: "pulper-material"; amount: number; stock: number }
  | { type: "pulper-consumed"; plant: number; amount: number }
  | { type: "pulper-collection"; range: 1024 | 2048; dispatched: boolean }
  | { type: "pulper-power-lost"; owner: number; warningStarted: boolean }
  | {
      type: "pulper-audio";
      cue: 0x2f | 0x31;
      operation: "play" | "stop";
      parameter: 0 | 255;
    };
export interface PulperReceipt {
  events: PulperEvent[];
  queueDraw: boolean;
  contextKind: 4;
}
export interface PulperContext<W> {
  rules: BuildingStartupRules;
  frame: number;
  native(world: W, slot: number): BuildingNative;
  player(world: W, owner: number): BuildingNative;
  profile(world: W, slot: number, action: number): AnimationProfile;
  /**Actual8B300(frontcell,0), first plant in the current head chain. */
  findPlant?(world: W, cell: number): RecyclingMaterial | null;
  unlinkPlant?(world: W, plant: RecyclingMaterial): void;
  /**724C0, kind0, global plant count--, after the immediate unlink. */
  retirePlant?(world: W, plant: RecyclingMaterial): void;
  /**Complete112728/484E0 query followed by14040, including both axis draws. */
  dispatchCollection?(world: W, slot: number, range: 1024 | 2048): boolean;
}
const int = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
const byte = (n: readonly (number | null)[], p: number) => {
  const v = n[p];
  if (v === null || v === undefined || !int(v, 0, 255))
    throw Error(`Unknown Pulper byte${p}`);
  return v;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const put = (n: BuildingNative, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >>> 8) & 255;
};
const put32 = (n: BuildingNative, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >>> 16);
};
function port<T>(value: T | undefined, name: string): T {
  if (value === undefined)
    throw Error(`Actual Pulper ${name} service required`);
  return value;
}
function native(n: BuildingNative, size: number) {
  if (n.length !== size || n.some((v) => v !== null && !int(v, 0, 255)))
    throw Error("Invalid Pulper native record");
}
function animation(n: BuildingNative): AnimationState {
  return {
    action: byte(n, 25),
    hold: byte(n, 26),
    frame: byte(n, 27),
    direction: (byte(n, 28) << 24) >> 24,
    delay: (byte(n, 29) << 24) >> 24,
    counter: (byte(n, 30) << 24) >> 24,
  };
}
function setAnimation(n: BuildingNative, a: AnimationState) {
  [a.action, a.hold, a.frame, a.direction, a.delay, a.counter].forEach(
    (v, i) => (n[25 + i] = v & 255),
  );
}

/**Full ordinary callback, including incomplete/disabled and common ANB tail.
 * The source0800 demolition family belongs to the caller before this entry. */
export function stepStagedPulper<W>(
  world: W,
  slot: number,
  c: PulperContext<W>,
): PulperReceipt {
  const n = c.native(world, slot);
  native(n, 67);
  if (
    !int(slot, 0, 255) ||
    byte(n, 6) !== 4 ||
    byte(n, 45) !== 2 ||
    word(n, 15) !== slot ||
    n.slice(31, 39).some((v) => v !== null)
  )
    throw Error("Actual selector2 Pulper identity required");
  const owner = byte(n, 24),
    grade = byte(n, 46),
    p = c.player(world, owner),
    r = c.rules;
  native(p, 1805);
  if (
    !int(owner, 0, 3) ||
    slot >>> 6 !== owner ||
    !int(grade, 0, 2) ||
    !int(c.frame, 0, 0x7fffffff) ||
    r.schemaVersion !== 1 ||
    r.upkeep.length !== 14 ||
    !int(r.upkeep[2], 0, 255) ||
    r.processingFrontOffset.length !== 2 ||
    r.processingFrontOffset.some((v) => !int(v, -32768, 32767))
  )
    throw Error("Actual Pulper rules/player context required");
  let flags = word(n, 49) & 65535;
  if (flags & 0x800)
    throw Error("Pulper0800 requires common demolition callback");
  const oldAction = byte(n, 25),
    oldPower = flags & 4,
    complete = !!(flags & 1),
    disabled = !!(flags & 64),
    events: PulperEvent[] = [];
  const audio = (
    cue: 0x2f | 0x31,
    operation: "play" | "stop",
    parameter: 0 | 255 = 0,
  ) => events.push({ type: "pulper-audio", cue, operation, parameter });
  const front = () => {
    const x = ((word(n, 7) + r.processingFrontOffset[0]) << 16) >> 16,
      y = ((word(n, 9) + r.processingFrontOffset[1]) << 16) >> 16,
      plant = port(c.findPlant, "8B300")(
        world,
        ((y >> 8) & 127) * 128 + ((x >> 8) & 127),
      );
    if (
      plant &&
      (byte(plant.native, 6) !== 2 || word(plant.native, 15) !== plant.slot)
    )
      throw Error("Pulper query changed its real plant identity");
    return plant;
  };
  if (complete && !disabled) {
    put(n, 61, word(n, 61) - r.upkeep[2] - byte(n, 63));
    if (word(n, 61) < 1) {
      put(n, 61, 0);
      if (!(flags & 0x100)) {
        flags &= ~4;
        put(n, 49, flags);
        const warningStarted = word(p, 0x5ea) === 0;
        if (warningStarted) put(p, 0x5ea, 1000);
        events.push({ type: "pulper-power-lost", owner, warningStarted });
      }
    }
    //46805: pending material is credited before this selector's energy gate.
    if (byte(n, 27) === 0) {
      n[28] = 0;
      const amount = byte(n, 51);
      if (amount) {
        n[51] = 0;
        put32(n, 54, (dword(n, 54) + amount) | 0);
        events.push({
          type: "pulper-material",
          amount,
          stock: dword(n, 54) >>> 0,
        });
      }
    } else {
      n[29] = 5 - grade;
      n[28] = 1;
      if (byte(n, 27) === 7) {
        audio(0x2f, "stop");
        audio(0x31, "play");
      }
    }
    if (word(n, 61) !== 0 && !(flags & 0x100)) {
      const limit = 40 * (grade + 2);
      if (byte(n, 27) === 0 && dword(n, 54) >>> 0 < limit) {
        const plant = front();
        if (plant) {
          n[27] = 1;
          n[63] = (byte(n, 63) + 8) & 255;
          audio(0x2f, "play", 255);
        } else if (grade > 0 && ((slot + c.frame) & 255) === 0) {
          const range = grade === 1 ? 1024 : 2048;
          const dispatched = port(
            c.dispatchCollection,
            "112728/14040 collection",
          )(world, slot, range);
          if (typeof dispatched !== "boolean")
            throw Error("Actual Pulper collector allocation result required");
          if (dispatched) n[63] = (byte(n, 63) + 16) & 255;
          events.push({ type: "pulper-collection", range, dispatched });
        }
      }
      if (byte(n, 27) === 5) {
        const plant = front();
        if (plant) {
          n[51] = byte(plant.native, 48);
          port(c.unlinkPlant, "8ACC0 unlink")(world, plant);
          port(c.retirePlant, "724C0 retirement")(world, plant);
          n[63] = (byte(n, 63) + 8) & 255;
          events.push({
            type: "pulper-consumed",
            plant: plant.slot,
            amount: byte(n, 51),
          });
        }
      }
      if (dword(n, 54) >>> 0 > limit) put32(n, 54, limit);
    } else {
      n[28] = 0;
      flags &= ~4;
      put(n, 49, flags);
    }
    if (word(n, 61) > 200) put(n, 61, 200);
    if (byte(n, 63)) n[63] = byte(n, 63) - 1;
  }
  if (flags & 0x100 || disabled || !complete) {
    if (word(n, 61) > 0) put(n, 61, word(n, 61) - 1);
    audio(0x2f, "stop");
  }
  if (
    oldAction !== byte(n, 25) ||
    byte(n, 28) !== 0 ||
    oldPower !== (word(n, 49) & 4) ||
    byte(n, 48)
  )
    n[21] = byte(n, 21) | 4;
  if (byte(n, 48)) n[48] = byte(n, 48) - 1;
  if (!complete && word(n, 43) < 1)
    return { events, queueDraw: false, contextKind: 4 };
  if (!complete) {
    n[25] = 0;
    n[28] = 0;
    n[27] = byte(n, 47);
  } else if (!disabled) n[25] = grade + 1;
  else {
    n[25] = 4;
    n[28] = 0;
    n[27] = grade;
  }
  setAnimation(
    n,
    advanceAnimation(animation(n), c.profile(world, slot, byte(n, 25))),
  );
  return { events, queueDraw: true, contextKind: 4 };
}

/**Atomic convenience: a late service/profile failure leaves all inputs intact. */
export function stepPulper<W>(
  before: W,
  slot: number,
  c: PulperContext<W> & { stageWorld?(w: W): W },
) {
  const world = c.stageWorld ? c.stageWorld(before) : structuredClone(before);
  const receipt = stepStagedPulper(world, slot, c);
  return { world, receipt };
}
