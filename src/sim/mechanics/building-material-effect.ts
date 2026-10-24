/**48790/48F48 material36 and its full mode6 common4B630 callback. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import { createMotion, velocity, type MotionTables } from "./motion";
import { groundHeight, type TerrainState } from "./terrain";
import {
  effectFactoryPrior,
  effectPriorByte as b,
  effectTerrainShade,
  putEffectWord as put,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import {
  stepSharedFreeEffectMotion,
  type SharedFreeEffectMotionContext,
  type DestructionStep,
} from "./destruction-effect";
import type { EngineerChargeDescriptor } from "./engineer-charge";
import type { GeneRng } from "./random";
import type { BuildingNative } from "./building-native";
const word = (n: readonly (number | null)[], p: number) =>
  ((b(n, p) | (b(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const int = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
function profile(p: AnimationProfile) {
  if (
    p.flags !== 0 ||
    p.last - p.first !== 2 ||
    p.holds.length !== 3 ||
    p.holds.some((h) => h !== 0)
  )
    throw Error("Actual EFF36 three grade frames required");
}
export function validateBuildingMaterialDescriptor(
  d: EngineerChargeDescriptor | undefined,
): void {
  if (
    !d ||
    d.code !== 36 ||
    d.retirementMode !== 6 ||
    !d.gravity ||
    d.priority !== 1 ||
    d.childCode !== null ||
    !d.movable ||
    !d.waterResponse
  )
    throw Error("Actual source36 descriptor required");
}
export interface BuildingMaterialRequest {
  position: [number, number];
  height: number;
  angles: [number, number, number];
  owner: number;
  parameter: 0;
  delay: 0;
  parentBuilding: number;
}
/**After successful real shared allocation only. Returns both numeric images;
 * caller installs them in the actual held effect and parent records. No RNG. */
export function makeBuildingMaterialEffect(
  prior: readonly (number | null)[],
  slot: number,
  q: BuildingMaterialRequest,
  parent: readonly (number | null)[],
  terrain: TerrainState,
  tables: MotionTables,
  p: AnimationProfile,
): { native: EffectNativePrior; parent: BuildingNative; amount: number } {
  validateEffectNativePrior(prior);
  profile(p);
  if (
    b(prior, 6) !== 0 ||
    !int(slot, 0, 199) ||
    !int(q.owner, 0, 4) ||
    q.parameter !== 0 ||
    q.delay !== 0 ||
    !int(q.parentBuilding, 0, 255) ||
    parent.length !== 67 ||
    b(parent, 6) !== 4 ||
    b(parent, 45) !== 2 ||
    word(parent, 15) !== q.parentBuilding ||
    !int(b(parent, 46), 0, 2) ||
    q.position.length !== 2 ||
    q.position.some((v) => !int(v, -32768, 32767)) ||
    !int(q.height, -2147483648, 2147483647) ||
    q.angles.length !== 3 ||
    q.angles.some((v) => !int(v, -32768, 32767)) ||
    tables.atan.length !== 257 ||
    tables.sine.length !== 2048 ||
    tables.cosine.length !== 2048
  )
    throw Error("Actual source36 factory/prior/Pulper parent required");
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = q.angles;
  velocity(m, tables);
  const n = effectFactoryPrior(prior, {
      slot,
      code: 36,
      owner: q.owner,
      x: q.position[0],
      y: q.position[1],
      height: q.height,
      ground: groundHeight(terrain, ...q.position),
      shade: effectTerrainShade(terrain, ...q.position),
      vx: m.vx,
      vy: m.vy,
      vz: m.vz,
      accelerationZ: 0,
      yaw: q.angles[0],
      pitch: q.angles[1],
      speed: q.angles[2],
      delay: 0,
    }),
    after = parent.slice(),
    amount = Math.min(dword(parent, 54) >>> 0, 10 * (b(parent, 46) + 1)),
    stock = (dword(parent, 54) - amount) >>> 0;
  //489D7 gravity flag initialization, then48F48 material-specific tail.
  put(n, 21, 0);
  put(after, 54, stock);
  put(after, 56, stock >>> 16);
  n[76] = amount & 255;
  n[27] = b(parent, 46);
  n[28] = 0;
  return { native: n, parent: after, amount };
}
export interface BuildingMaterialContext extends SharedFreeEffectMotionContext {
  profile: AnimationProfile;
  /**Publish completed physics before the common timer/ANB tail, if needed. */
  publishMotion?(native: EffectNativePrior): void;
}
/**Mode6 never autoexpires. Timer/ANB still run, with retained direction0 and
 * grade frame; deletion is actual49D30 by a carrier/work/reference caller. */
export function stepBuildingMaterialEffectRecord(
  before: readonly (number | null)[],
  rng: GeneRng,
  c: BuildingMaterialContext,
): DestructionStep {
  profile(c.profile);
  validateEffectNativePrior(before);
  if (
    b(before, 6) !== 5 ||
    b(before, 69) !== 36 ||
    (word(before, 21) & ~1) !== 0 ||
    word(before, 63) !== -1
  )
    throw Error("Actual gravity material36 callback required");
  const out = stepSharedFreeEffectMotion(before, rng, c, {
      movable: true,
      waterResponse: true,
    }),
    n = out.native;
  c.publishMotion?.(n);
  if (word(n, 74) >= 0) put(n, 74, word(n, 74) - 1);
  const a = advanceAnimation(
    {
      action: 0,
      hold: b(n, 26),
      frame: b(n, 27),
      direction: (b(n, 28) << 24) >> 24,
      delay: (b(n, 29) << 24) >> 24,
      counter: (b(n, 30) << 24) >> 24,
    },
    c.profile,
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  return out;
}
