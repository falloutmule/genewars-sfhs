/** Original42240 shield impulse and6DA90 predictive position. Shared effects,
 * audio, target damage and host projection are ordered caller responsibilities. */
import { originalAngle, wrap16, type MotionTables } from "./motion";
import { integerSqrt, torusDelta } from "./terrain";
type Native = (number | null)[];
function byte(n: readonly (number | null)[], at: number): number {
  const v = n[at];
  if (!Number.isInteger(v) || v! < 0 || v! > 255)
    throw Error(`Actual shield numeric byte ${at} required`);
  return v!;
}
const word = (n: readonly (number | null)[], at: number) =>
  wrap16(byte(n, at) | (byte(n, at + 1) << 8));
const dword = (n: readonly (number | null)[], at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
function put(n: Native, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >> 8) & 255;
}
export function predictShieldPosition(n: readonly (number | null)[]) {
  return {
    position: [
      wrap16(((word(n, 7) << 16) + (byte(n, 67) << 8) + (word(n, 45) << 10)) >> 16),
      wrap16(((word(n, 9) << 16) + (byte(n, 68) << 8) + (word(n, 47) << 10)) >> 16),
    ] as [number, number],
    height: (dword(n, 39) + (word(n, 49) >> 3)) | 0,
  };
}
/** In-place numeric operation inside an isolated host transaction. */
export function applyShieldImpulse(
  shield: Native,
  target: Native,
  inside: boolean,
  tables: MotionTables,
) {
  if (byte(shield, 6) !== 4 || byte(shield, 46) > 2 ||
      ![0, 1, 3, 5, 8].includes(byte(target, 6)) ||
      tables.sine.length !== 2048 || tables.cosine.length !== 2048)
    throw Error("Actual shield impulse identity/tables required");
  const sign = inside ? -1 : 1,
    dx = torusDelta(word(target, 7), word(shield, 7)) * sign,
    dy = torusDelta(word(target, 9), word(shield, 9)) * sign,
    dz = ((dword(shield, 17) - dword(target, 39)) * sign) | 0,
    yaw = originalAngle(wrap16(dx * 2), wrap16(dy * 2), tables.atan),
    pitch = originalAngle(integerSqrt((dx * dx + dy * dy) >>> 0), dz >> 3, tables.atan),
    speed = Math.max(wrap16(word(target, 61) * 2), 4096),
    horizontal = Math.floor(tables.cosine[(pitch - 512) & 2047] * speed / 65536),
    impulse = [
      Math.floor(tables.cosine[(yaw - 512) & 2047] * horizontal / 65536),
      Math.floor(tables.sine[(yaw - 512) & 2047] * horizontal / 65536),
      Math.floor(-tables.sine[(pitch - 512) & 2047] * speed / 65536),
    ];
  for (let axis = 0; axis < 3; axis++)
    put(target, 45 + axis * 2, word(target, 45 + axis * 2) + wrap16(impulse[axis]));
  const vx = word(target, 45), vy = word(target, 47), vz = word(target, 49),
    planar = integerSqrt((vx * vx + vy * vy) >>> 0),
    magnitude = wrap16(integerSqrt((planar * planar + vz * vz) >>> 0));
  if (planar) put(target, 57, originalAngle(vx, vy, tables.atan));
  put(target, 61, magnitude);
  put(target, 59, magnitude ? originalAngle(planar, -vz, tables.atan) : 512);
  shield[63] = (byte(shield, 63) + (byte(target, 6) === 3 ? 1 : 4 - byte(shield, 46))) & 255;
  return {
    effect: { code: 65 as const, position: [word(target, 7), word(target, 9)] as [number, number], height: dword(target, 39), owner: 0, parameter: 0, delay: 64 },
    audio: { cue: 13, mode: 2, parameter: 0, volume: 127, range: 75 },
  };
}

export interface ShieldCollisionPorts {
  /** Actual target virtual0 physical height and virtual8 mobility. */
  physicalHeight: number;
  movable: boolean;
  alliedOwners: number;
  effect(code: 5 | 65, owner: 0 | 1, position: [number, number], height: number): void;
  audio(cue: 13 | 14): void;
  damage(amount: number): void;
  retire(): void;
}
/** One entity in source424E0's live spatial-chain order. The caller advances
 * the current link only after these immediate factories/damage callbacks. */
export function collideShieldEntity(
  shield: Native,
  target: Native,
  tables: MotionTables,
  c: ShieldCollisionPorts,
): boolean {
  const kind = byte(target, 6);
  if (![1, 3, 5, 8].includes(kind)) return false;
  const code = kind === 5 ? byte(target, 69) : -1,
    deflectable = kind === 5 && (c.movable || [11, 36, 67].includes(code)) && ![6, 32, 26].includes(code);
  if (kind === 5 && !deflectable && code !== 49) return false;
  const radius = byte(shield, 46) * 256 + 1536,
    distance = (x: number, y: number, height: number) => {
      const dx = torusDelta(x, word(shield, 7)), dy = torusDelta(y, word(shield, 9)),
        dz = (height - dword(shield, 17)) >> 3;
      return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
    },
    inside = distance(word(target, 7), word(target, 9), c.physicalHeight) < radius * radius,
    next = predictShieldPosition(target);
  if (inside === (distance(...next.position, next.height) < radius * radius)) return false;
  const emit = (code: 5 | 65, owner: 0 | 1) =>
    c.effect(code, owner, [word(target, 7), word(target, 9)], dword(target, 39));
  if (kind === 5) {
    if (code === 11 || code === 13) { emit(5, 0); c.retire(); }
    if (deflectable) {
      applyShieldImpulse(shield, target, inside, tables);
      emit(65, 0); c.audio(13);
    } else { emit(65, 1); c.audio(14); }
    return true;
  }
  const owner = byte(shield, 24), targetOwner = byte(target, 24),
    allied = owner === targetOwner || (owner !== 4 && !!(c.alliedOwners & (1 << targetOwner)));
  if (kind === 8 || allied) { emit(65, 1); c.audio(14); return true; }
  if (kind === 1 && byte(target, 97) & 1) return false;
  applyShieldImpulse(shield, target, inside, tables);
  emit(65, 0); c.audio(13);
  c.damage((byte(shield, 46) + 1) * 3);
  return true;
}
