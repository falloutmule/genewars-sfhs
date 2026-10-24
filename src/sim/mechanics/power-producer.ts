/** Complete451F0 Distributor3/Photon6 numeric callback and7AC00 tail.
 * Shared33 factories execute immediately through the caller's staged ports.
 * Native pointer gaps and unrelated afterimages are retained. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import { nextRandom, type GeneRng } from "./random";
import type { PowerProducerAudio } from "./economy";

export type PowerProducerNative = (number | null)[];
export interface NativePowerProducerWorld {
  frame: number;
  buildingNative: PowerProducerNative[];
  players: { id: number; raw: number[] }[];
  rng: GeneRng;
}
export interface PowerProducerTransfer {
  sourceSlot: number;
  targetSlot: number;
  sourcePoint: [number, number];
  targetPoint: [number, number];
  destination: [index: number, kind: number];
  payload: number;
}
export interface NativePowerProducerContext<
  W extends NativePowerProducerWorld,
> {
  /** Actual imported104D10, independent of building grade. */
  upkeep: readonly number[];
  solarGeneration: number;
  profile(world: W, slot: number, action: 0 | 1 | 2 | 3 | 4): AnimationProfile;
  createTransfer(world: W, request: PowerProducerTransfer): number;
  audio(world: W, slot: number, request: PowerProducerAudio): void;
  /**83140 is an explicit presentation request before7AC00. It does not imply
   * original renderer/device allocation or permit native replacement. */
  queueBuilding(world: W, slot: number): void;
}
export interface PowerProducerReceipt {
  slot: number;
  selector: 3 | 6;
  grade: 0 | 1 | 2;
  operational: boolean;
  generated: number;
  pulse: boolean;
  draw: number | null;
  recipientCount: number | null;
  createdSlots: number[];
  audio: PowerProducerAudio[];
  queueRequested: boolean;
}
const integer = (v: number, min: number, max: number) =>
  Number.isInteger(v) && v >= min && v <= max;
function byte(n: readonly (number | null)[], at: number): number {
  const v = n[at];
  if (v === null || v === undefined || !integer(v, 0, 255))
    throw Error(`Actual producer native byte ${at} required`);
  return v;
}
function word(n: readonly (number | null)[], at: number): number {
  return ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
}
function put(n: PowerProducerNative, at: number, value: number): void {
  n[at] = value & 255;
  n[at + 1] = (value >> 8) & 255;
}
function point(n: PowerProducerNative): [number, number] {
  return [word(n, 7), word(n, 9)];
}
function distance(a: PowerProducerNative, b: PowerProducerNative): number {
  const x = (((word(a, 7) - word(b, 7)) * 2) << 16) >> 17,
    y = (((word(a, 9) - word(b, 9)) * 2) << 16) >> 17;
  return x * x + y * y;
}
function validateNative(
  n: PowerProducerNative | undefined,
): asserts n is PowerProducerNative {
  if (
    !n ||
    n.length !== 67 ||
    n.some((v, i) =>
      i >= 31 && i < 39 ? v !== null : v !== null && !integer(v, 0, 255),
    )
  )
    throw Error("Actual67-byte power producer record required");
}

/** Already isolated whole-host entry. A service failure must roll back the
 * caller's entire transaction, including earlier factories and RNG draws.
 * Source0800 demolition belongs to the existing common callback. */
export function stepStagedNativePowerProducer<
  W extends NativePowerProducerWorld,
>(w: W, slot: number, c: NativePowerProducerContext<W>): PowerProducerReceipt {
  if (
    !integer(slot, 0, 255) ||
    w.buildingNative.length !== 256 ||
    !integer(w.frame, 0, 0xffffffff)
  )
    throw Error("Actual power producer pool/frame required");
  const a = w.buildingNative[slot];
  validateNative(a);
  const selector = byte(a, 45),
    grade = byte(a, 46),
    owner = byte(a, 24),
    pool = w.buildingNative,
    player = w.players.find((p) => p.id === owner),
    raw = player?.raw;
  if (
    byte(a, 6) !== 4 ||
    (selector !== 3 && selector !== 6) ||
    grade > 2 ||
    owner > 3 ||
    Math.floor(slot / 64) !== owner ||
    word(a, 15) !== slot
  )
    throw Error("Actual Distributor3/Photon6 identity and grade required");
  if (!raw || raw.length !== 1805 || raw[1] !== owner || raw[0x4a1] !== owner)
    throw Error("Actual producer owner1805-byte player required");
  if (word(a, 49) & 0x800)
    throw Error("Actual451F0 common demolition callback required");
  if (
    c.upkeep.length !== 14 ||
    !integer(c.upkeep[selector], 0, 255) ||
    !integer(c.solarGeneration, -32768, 32767)
  )
    throw Error("Original producer upkeep/mission solar generation required");
  const receipt: PowerProducerReceipt = {
    slot,
    selector,
    grade: grade as 0 | 1 | 2,
    operational: false,
    generated: 0,
    pulse: false,
    draw: null,
    recipientCount: null,
    createdSlots: [],
    audio: [],
    queueRequested: false,
  };
  const held = () => {
    if (
      w.buildingNative !== pool ||
      w.buildingNative[slot] !== a ||
      !w.players.includes(player!) ||
      player!.raw !== raw
    )
      throw Error("Producer service replaced its held native/player record");
  };
  const audio = (request: PowerProducerAudio) => {
    if (!c.audio) throw Error("Actual producer audio-request service required");
    receipt.audio.push(request);
    c.audio(w, slot, request);
    held();
  };
  const oldAction = byte(a, 25),
    oldPower = byte(a, 49) & 4,
    flags = word(a, 49) & 65535;
  //45390: incomplete/disabled skips the selector body AND extra-drain decay.
  if (flags & 1 && !(flags & 0x40)) {
    put(a, 61, word(a, 61) - c.upkeep[selector] - byte(a, 63));
    a[49] = byte(a, 49) | 4;
    if (selector === 3) a[28] = byte(a, 27) !== 0 ? 1 : 0;
    if (!(flags & 0x100)) {
      receipt.operational = true;
      receipt.generated =
        selector === 3
          ? Math.max(grade * 4, 2)
          : ((c.solarGeneration + grade) << 16) >> 16;
      if (selector === 6) {
        a[28] = byte(a, 27) !== 0 ? 1 : 0;
        if (!byte(a, 27)) audio({ type: "stop", channel: 35 });
        a[29] = 3;
      }
      put(a, 61, word(a, 61) + receipt.generated);
      put(raw, 0x4ad, word(raw, 0x4ad) + receipt.generated);
      if (selector === 3 && word(a, 61) >= 2000) put(a, 61, 2000);
      receipt.pulse =
        selector === 3
          ? (w.frame & 63) === 16 * grade || word(a, 61) === 2000
          : word(a, 61) >= 200;
      if (receipt.pulse) {
        receipt.draw = nextRandom(w.rng);
        if (selector === 3 && receipt.draw % 7 === 0) {
          a[27] = 1;
          audio({
            type: "play",
            channel: 61,
            mode: 2,
            parameter: 0,
            volume: 127,
            range: 100,
          });
        } else if (selector === 6 && receipt.draw % 50 === 0 && !byte(a, 27)) {
          a[27] = 1;
          audio({
            type: "play",
            channel: 35,
            mode: 2,
            parameter: 255,
            volume: 90,
            range: 400 - grade * 40,
          });
        }
        let count = 0;
        for (let i = owner * 64; i < (owner + 1) * 64; i++) {
          const b = w.buildingNative[i];
          validateNative(b);
          if (!byte(b, 6) || !(word(b, 49) & 1)) continue;
          if (
            selector === 3
              ? !!(word(b, 49) & 0x100) || [3, 6, 8, 9].includes(byte(b, 45))
              : byte(b, 45) !== 3
          )
            continue;
          const radius = 1536 + 768 * (selector === 3 ? grade : byte(b, 46));
          if (distance(a, b) <= radius * radius) {
            b[49] = byte(b, 49) | 0x10;
            count++;
          }
        }
        receipt.recipientCount = count;
        if (selector === 3) {
          put(a, 54, count);
          put(a, 56, 0);
        } else put(a, 61, 0);
        if (count) {
          const share =
            selector === 3
              ? Math.trunc(word(a, 61) / count) & 65535
              : Math.trunc(200 / count);
          for (let i = owner * 64; i < (owner + 1) * 64; i++) {
            const b = w.buildingNative[i];
            if (!(byte(b, 49) & 0x10)) continue;
            b[49] = byte(b, 49) & 0xef;
            if (selector === 6 || share) {
              if (!c.createTransfer)
                throw Error("Actual ordered33 factory service required");
              const made = c.createTransfer(w, {
                sourceSlot: slot,
                targetSlot: i,
                sourcePoint: point(a),
                targetPoint: point(b),
                destination: [word(b, 15) & 65535, byte(b, 6)],
                payload: Math.min(share, 255),
              });
              held();
              if (w.buildingNative[i] !== b)
                throw Error(
                  "Producer factory replaced its held recipient record",
                );
              if (!integer(made, 0, 199))
                throw Error("Actual33 allocated slot required");
              receipt.createdSlots.push(made);
            }
          }
          if (selector === 3) put(a, 61, 0);
        }
      }
    }
    if (byte(a, 63)) a[63] = byte(a, 63) - 1;
  }
  const tailFlags = word(a, 49) & 65535;
  if (tailFlags & 0x140 || !(tailFlags & 1)) {
    if (word(a, 61) > 0) put(a, 61, word(a, 61) - 1);
    if (selector === 6) audio({ type: "stop", channel: 35 });
  }
  if (
    oldAction !== byte(a, 25) ||
    byte(a, 28) !== 0 ||
    ((oldPower ^ byte(a, 49)) & 4) !== 0 ||
    byte(a, 48) > 0
  )
    a[21] = byte(a, 21) | 4;
  if (byte(a, 48)) a[48] = byte(a, 48) - 1;
  if (!(tailFlags & 1) && word(a, 43) <= 0) return receipt;
  if (!(tailFlags & 1)) {
    a[25] = 0;
    a[28] = 0;
    a[27] = byte(a, 47);
  } else if (tailFlags & 0x40) {
    a[25] = 4;
    a[28] = 0;
    a[27] = grade;
  } else a[25] = grade + 1;
  if (!c.queueBuilding)
    throw Error("Actual83140 building presentation-request service required");
  receipt.queueRequested = true;
  c.queueBuilding(w, slot);
  held();
  if (!c.profile) throw Error("Original producer animation profile required");
  const profile = c.profile(w, slot, byte(a, 25) as 0 | 1 | 2 | 3 | 4);
  held();
  if (
    profile.holds.some((v) => !integer(v, 0, 255)) ||
    !integer(profile.flags, 0, 255)
  )
    throw Error("Original producer animation holds/flags required");
  const next = advanceAnimation(
    {
      action: byte(a, 25),
      hold: byte(a, 26),
      frame: byte(a, 27),
      direction: (byte(a, 28) << 24) >> 24,
      delay: (byte(a, 29) << 24) >> 24,
      counter: (byte(a, 30) << 24) >> 24,
    },
    profile,
  );
  a[26] = next.hold;
  a[27] = next.frame;
  a[28] = next.direction & 255;
  a[29] = next.delay & 255;
  a[30] = next.counter & 255;
  return receipt;
}
