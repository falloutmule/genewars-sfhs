/** Source451F0 selector13, including its ordinary common envelope. Storage
 * distribution437A0 and timed demolition are separate ordered callbacks. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import type { BuildingNative } from "./building-native";

export interface GoopVatContext<W> {
  frame: number;
  upkeep: number;
  native(world: W, slot: number): BuildingNative;
  player(world: W, owner: number): BuildingNative;
  profile(world: W, slot: number, action: number): AnimationProfile;
}
export interface GoopVatReceipt {
  leaked: boolean;
  playerDebited: boolean;
  warningStarted: boolean;
  queueDraw: boolean;
}
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
function bytes(n: BuildingNative, length: number) {
  if (n.length !== length || n.some((v) => v !== null && !integer(v, 0, 255)))
    throw Error("Actual GOOP Vat numeric record required");
}
function byte(n: BuildingNative, at: number): number {
  const value = n[at];
  if (value === null || value === undefined)
    throw Error(`Unknown GOOP Vat byte ${at}`);
  return value;
}
const u16 = (n: BuildingNative, at: number) =>
  byte(n, at) | (byte(n, at + 1) << 8);
const i16 = (n: BuildingNative, at: number) => (u16(n, at) << 16) >> 16;
const u32 = (n: BuildingNative, at: number) =>
  (u16(n, at) | (u16(n, at + 2) << 16)) >>> 0;
function put16(n: BuildingNative, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >>> 8) & 255;
}
function put32(n: BuildingNative, at: number, value: number) {
  put16(n, at, value);
  put16(n, at + 2, value >>> 16);
}
/** In-place only inside the host's isolated owner/slot transaction. */
export function stepStagedGoopVat<W>(
  w: W,
  slot: number,
  c: GoopVatContext<W>,
): GoopVatReceipt {
  const n = c.native(w, slot);
  bytes(n, 67);
  const raw = n as number[],
    owner = byte(n, 24),
    grade = byte(n, 46);
  if (
    !integer(slot, 0, 255) ||
    n[6] !== 4 ||
    n[45] !== 13 ||
    i16(raw, 15) !== slot ||
    owner !== Math.floor(slot / 64) ||
    !integer(grade, 0, 2) ||
    !integer(c.frame, 0, 0x7fffffff) ||
    !integer(c.upkeep, 0, 255) ||
    n.slice(31, 39).some((v) => v !== null)
  )
    throw Error("Actual GOOP Vat identity/rules required");
  const p = c.player(w, owner);
  bytes(p, 1805);
  const player = p as number[];
  let flags = u16(raw, 49);
  if (flags & 0x800)
    throw Error("GOOP Vat requires shared demolition callback");
  const oldAction = byte(n, 25),
    oldPower = flags & 4,
    complete = !!(flags & 1),
    disabled = !!(flags & 0x40),
    out: GoopVatReceipt = {
      leaked: false,
      playerDebited: false,
      warningStarted: false,
      queueDraw: false,
    };
  if (complete && !disabled) {
    put16(raw, 61, i16(raw, 61) - c.upkeep - byte(n, 63));
    if (i16(raw, 61) < 1) {
      put16(raw, 61, 0);
      if (!(flags & 0x100)) {
        flags &= ~4;
        put16(raw, 49, flags);
        if (i16(player, 0x5ea) === 0) {
          put16(player, 0x5ea, 1000);
          out.warningStarted = true;
        }
      }
    }
    if (
      u32(raw, 54) !== 0 &&
      !(i16(raw, 61) !== 0 && !(flags & 0x140)) &&
      ((slot + c.frame) & 31) === 0
    ) {
      put32(raw, 54, (u32(raw, 54) - 1) | 0);
      out.leaked = true;
      if ((u32(player, 0x4a7) | 0) > 0) {
        put32(player, 0x4a7, (u32(player, 0x4a7) - 1) | 0);
        out.playerDebited = true;
      }
    }
    const capacity = (grade + 1) * 500;
    // Native multiplication/division is unsigned32; AL truncates before clamp.
    n[27] = Math.min(
      12,
      Math.floor((Math.imul(u32(raw, 54), 13) >>> 0) / capacity) & 255,
    );
    n[28] = 0;
    if (i16(raw, 61) > 200) put16(raw, 61, 200);
    if (byte(n, 63)) n[63] = byte(n, 63) - 1;
  }
  if ((!complete || disabled || flags & 0x100) && i16(raw, 61) > 0)
    put16(raw, 61, i16(raw, 61) - 1);
  if (
    oldAction !== byte(n, 25) ||
    byte(n, 28) !== 0 ||
    oldPower !== (u16(raw, 49) & 4) ||
    byte(n, 48)
  )
    n[21] = byte(n, 21) | 4;
  if (byte(n, 48)) n[48] = byte(n, 48) - 1;
  if (!complete && i16(raw, 43) < 1) return out;
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
  const signed = (v: number) => (v << 24) >> 24;
  const a = advanceAnimation(
    {
      action: byte(n, 25),
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: signed(byte(n, 28)),
      delay: signed(byte(n, 29)),
      counter: signed(byte(n, 30)),
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
