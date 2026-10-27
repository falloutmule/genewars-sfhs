/** Shared source6FB60 flight goal and6F980 angular control. Flight is native
 *73&0400; it is independent of the gravity-suppression flag21&20. */
import { originalAngle, type MotionTables } from "./motion";
import { integerSqrt, torusDelta } from "./terrain";

type Native = (number | null)[];
const word = (n: Native, at: number) => {
  if (n[at] === null || n[at + 1] === null)
    throw Error("Flight requires initialized native words");
  return (n[at]! | (n[at + 1]! << 8)) << 16 >> 16;
};
const dword = (n: Native, at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
const put = (n: Native, at: number, value: number) => {
  n[at] = value & 255;
  n[at + 1] = (value >> 8) & 255;
};
const put32 = (n: Native, at: number, value: number) => {
  put(n, at, value); put(n, at + 2, value >> 16);
};
export function creatureIsFlying(n: Native): boolean {
  return !!(word(n, 73) & 0x400);
}

/** The primary-component3 arms in5ED20 and5E0B0 use these same three writes. */
export function beginCreatureFlight(n: Native): void {
  n[74] = n[74]! | 4;
  put(n, 59, 300);
  n[21] = n[21]! | 0x20;
}

/**5E640 regular flight animation arm, before the common animation advance. */
export function selectCreatureFlightAnimation(n: Native): boolean {
  if (![1, 2, 3, 8].includes(n[94]!) || !creatureIsFlying(n)) return false;
  n[25] = ((((word(n, 57) >> 7) + 1) >> 1) + 1) & 7;
  if (n[97]! & 1) {
    n[28] = n[27] = 0;
    return true;
  }
  n[28] = 1;
  n[29] = n[74]! & 0x40 ? 0 : n[74]! & 0x80 ? 2 : 1;
  if (n[27] === 17 && n[30] === 0) n[27] = 6;
  return true;
}

export interface CreatureFlightTarget {
  position: [number, number];
  height: number;
  /**5AEF0 raises an avoided-terrain aim above the5AD70 distance surface. */
  aimHeight?: number;
  associated: boolean;
  flying: boolean;
}

export function creatureFlightTargetGeometry(
  n: Native, target: CreatureFlightTarget, tables: MotionTables,
) {
  const dx = torusDelta(target.position[0], word(n, 7)),
    dy = torusDelta(target.position[1], word(n, 9)),
    dz = (((target.aimHeight ?? target.height) - dword(n, 39)) | 0) >> 3,
    //5AD70's unassociated point arm uses736F0 (terrain to terrain),
    //while5AEF0's pitch still aims from the actual physical height.
    distanceZ = ((target.height - dword(n, target.associated ? 39 : 17)) | 0) >> 3,
    horizontal = integerSqrt((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0);
  return {
    squared: (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(distanceZ, distanceZ)) | 0,
    yaw: originalAngle(dx * 2, dy * 2, tables.atan),
    pitch: originalAngle(horizontal, -dz, tables.atan),
  };
}

/**70363..705C7. The caller supplies the source virtualB8/BC target, and owns
 *6E9E0 spatial insertion/snap when this returns true. */
export function advanceCreatureFlightGoal(
  n: Native, target: CreatureFlightTarget, phase: number, tables: MotionTables,
): boolean {
  if (!creatureIsFlying(n)) throw Error("Controlled flight identity required");
  if (n[22]! & 0x40)
    throw Error("Creature vertical flight target requires its source service");
  if (word(n, 63) < 1 && !(word(n, 73) & 0x10)) return false;
  const height = (dword(n, 39) - dword(n, 17)) | 0,
    goal = creatureFlightTargetGeometry(n, target, tables),
    pointGoal = !!(word(n, 73) & 0x10);
  const aim = () => { put(n, 75, goal.yaw); put32(n, 69, goal.pitch); };
  if (pointGoal && goal.squared < 0x24001) {
    n[74] = n[74]! & 0xbf;
    if (goal.squared < 401) {
      put(n, 73, word(n, 73) | 0x220);
      n[74] = n[74]! & 0x2f;
      if (!target.flying) {
        n[74] = n[74]! & 0x3b;
        n[21] = n[21]! & 0xdf;
      }
      return true;
    }
    if (target.associated || (phase & 3) === 3) aim();
  } else if (height < 2880) {
    if (dword(n, 69) > 31) put32(n, 69, dword(n, 69) - 16);
    n[74] = n[74]! | 0x40;
  } else if (!pointGoal) {
    if (n[74]! & 0x40 && height > 2111) n[74] = n[74]! & 0xbf;
  } else if ((!(n[74]! & 0x40) && (phase & 1)) ||
             (n[74]! & 0x40 && height > 2111)) {
    n[74] = n[74]! & 0xbf;
    aim();
  }
  return false;
}

/**6F980: yaw is allowed in the air for either Bird component; pitch uses the
 *controlled-flight dword69 target. Returns whether velocity must be rebuilt. */
export function turnCreatureFlightAngles(n: Native, hasBirdComponent: boolean): boolean {
  let changed = false;
  const width = (word(n, 43) & 65535) * 2;
  const turn = (at: number, target: number, yaw: boolean) => {
    const current = word(n, at);
    if (current === target) {
      if (yaw) n[74] = n[74]! & 0xdf;
      return;
    }
    let delta = target - current;
    const other = delta < 0 ? delta + 2048 : delta - 2048;
    if (Math.abs(other) < Math.abs(delta)) delta = other;
    if (yaw) n[74] = Math.abs(delta) < 256 ? n[74]! & 0xdf : n[74]! | 0x20;
    put(n, at, Math.abs(delta) <= width ? target :
      (current + (delta >= 0 ? width : -width) + 2048) & 2047);
    changed = true;
  };
  if (dword(n, 39) <= dword(n, 17) || hasBirdComponent) turn(57, word(n, 75), true);
  else if (word(n, 57) === word(n, 75)) n[74] = n[74]! & 0xdf;
  if (creatureIsFlying(n)) turn(59, dword(n, 69), false);
  return changed;
}
