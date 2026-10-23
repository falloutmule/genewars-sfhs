/**48790/48B4F planted charge50 (0x32),4B910 trigger/cancel and its
 * ordinary feedback51 (0x33)/10 (0x0A). Spatial allocation is host-owned. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import { groundHeight, type TerrainState } from "./terrain";
import {
  effectFactoryPrior,
  effectPriorByte as byte,
  effectTerrainShade,
  putEffectWord as put,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import type { EngineerTakeoverChargeRequest } from "./engineer-construction";
import type { ProductionEffectUpdate } from "./production-effect";

export type EngineerChargeCode = 10 | 50 | 51;
export interface EngineerChargeDescriptor {
  code: number;
  retirementMode: number;
  gravity: boolean;
  priority: number;
  childCode: number | null;
  movable: boolean;
  waterResponse: boolean;
}
export interface EngineerChargeChildRequest {
  code: 10 | 51;
  owner: 0;
  position: [number, number];
  height: number;
  angles: [0, 0, 0];
  parameter: 0;
  delay: 0;
  newborn: true;
}
export interface EngineerChargeUpdate extends ProductionEffectUpdate {
  newborns: number;
}
type Native = readonly (number | null)[];
const word = (n: Native, at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;

export function validateEngineerChargeDescriptor(
  d: EngineerChargeDescriptor | undefined,
  code: EngineerChargeCode,
): void {
  if (
    !d ||
    d.code !== code ||
    d.retirementMode !== (code === 50 ? 5 : 0) ||
    d.gravity ||
    d.priority !== (code === 50 ? 1 : code === 51 ? 2 : 25) ||
    d.childCode !== null ||
    d.movable ||
    d.waterResponse !== (code === 50)
  )
    throw Error("Original Engineer charge/feedback descriptor is required");
}
export function validateEngineerChargeProfile(
  p: AnimationProfile,
  code: EngineerChargeCode,
): void {
  const count = code === 50 ? 8 : code === 51 ? 23 : 4;
  if (
    !p ||
    p.flags !== 0 ||
    p.holds.length !== count ||
    p.last - p.first !== count - 1 ||
    p.holds.some((h, index) => h !== (code === 50 && index === 0 ? 2 : 0))
  )
    throw Error("Original Engineer charge/feedback ANB profile is required");
}
function common(
  prior: Native,
  slot: number,
  code: EngineerChargeCode,
  owner: number,
  position: [number, number],
  height: number,
  delay: 0 | 1,
  terrain: TerrainState,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    !Number.isInteger(owner) ||
    owner < 0 ||
    owner > 4 ||
    position.length !== 2 ||
    position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(height) ||
    height < -2147483648 ||
    height > 2147483647
  )
    throw Error("Actual Engineer charge factory input/prior is required");
  return effectFactoryPrior(prior, {
    slot,
    code,
    owner,
    x: position[0],
    y: position[1],
    ground: groundHeight(terrain, ...position),
    height,
    shade: effectTerrainShade(terrain, ...position),
    vx: 0,
    vy: 0,
    vz: 0,
    accelerationZ: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
    delay,
  });
}
/**50 factory has no RNG, audio, newborn mark or ownership change. Retained
 * counter30/fractions67/68/payload76 survive; parent71/73 is written. */
export function makeEngineerCharge(
  prior: Native,
  slot: number,
  q: EngineerTakeoverChargeRequest,
  terrain: TerrainState,
  p: AnimationProfile,
  descriptor: EngineerChargeDescriptor,
): EffectNativePrior {
  validateEngineerChargeDescriptor(descriptor, 50);
  validateEngineerChargeProfile(p, 50);
  if (
    q.code !== 50 ||
    q.parameter !== 0 ||
    q.delay !== 1 ||
    q.angles.length !== 3 ||
    q.angles.some((v) => v !== 0) ||
    !Number.isInteger(q.actor) ||
    q.actor < 0 ||
    q.actor >= 20
  )
    throw Error("Actual Engineer planted charge request is required");
  const n = common(prior, slot, 50, q.owner, q.position, q.height, 1, terrain);
  n[22] = byte(n, 22) | 8;
  put(n, 71, q.actor);
  n[73] = 3;
  return n;
}
/**10/51 are ordinary common-only factories. Their newborn mark is applied
 * after successful publication by the caller, as4B893/4B8F1 do. */
export function makeEngineerChargeFeedback(
  prior: Native,
  slot: number,
  q: EngineerChargeChildRequest,
  terrain: TerrainState,
  p: AnimationProfile,
  descriptor: EngineerChargeDescriptor,
): EffectNativePrior {
  validateEngineerChargeDescriptor(descriptor, q.code);
  validateEngineerChargeProfile(p, q.code);
  if (
    q.owner !== 0 ||
    q.parameter !== 0 ||
    q.delay !== 0 ||
    !q.newborn ||
    q.angles.length !== 3 ||
    q.angles.some((v) => v !== 0)
  )
    throw Error("Original Engineer feedback factory request is required");
  return common(prior, slot, q.code, 0, q.position, q.height, 0, terrain);
}
/** Full charge50 callback for source's frozen-physics domain.6DF30 skips
 * movement on22bit8; descriptor70 is false and speed0 suppresses water child.
 * Completion5 skips timer74 and the generic animation/retirement prelude. */
export function stepEngineerChargeRecord(
  before: Native,
  terrain: TerrainState,
  c: {
    profile: AnimationProfile;
    child(
      request: EngineerChargeChildRequest,
      parentNative: EffectNativePrior,
    ): boolean;
  },
): EngineerChargeUpdate {
  validateEffectNativePrior(before);
  validateEngineerChargeProfile(c.profile, 50);
  if (
    byte(before, 6) !== 5 ||
    byte(before, 69) !== 50 ||
    (word(before, 21) & ~1) !== 0x820 ||
    word(before, 61) !== 0 ||
    word(before, 45) !== 0 ||
    word(before, 47) !== 0 ||
    word(before, 49) !== 0 ||
    word(before, 51) !== 0 ||
    word(before, 53) !== 0 ||
    word(before, 55) !== 0 ||
    byte(before, 28) !== 1 ||
    byte(before, 29) !== 1
  )
    throw Error("Original frozen Engineer charge callback state is required");
  const n = before.slice();
  put(n, 7, word(n, 7) & 32767);
  put(n, 9, word(n, 9) & 32767);
  const phase = byte(n, 70);
  if (phase === 1 || phase === 2) {
    const position: [number, number] = [word(n, 7), word(n, 9)],
      made = c.child(
        {
          code: phase === 1 ? 51 : 10,
          owner: 0,
          position,
          height: groundHeight(terrain, ...position),
          angles: [0, 0, 0],
          parameter: 0,
          delay: 0,
          newborn: true,
        },
        n,
      );
    return {
      native: n,
      retirementRequired: true,
      newborns: Number(made),
      samples: [],
      queries: [],
    };
  }
  const a = advanceAnimation(
    {
      action: 0,
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: byte(n, 28),
      delay: byte(n, 29),
      counter: (byte(n, 30) << 24) >> 24,
    },
    c.profile,
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  return {
    native: n,
    retirementRequired: false,
    newborns: 0,
    samples: [],
    queries: [],
  };
}

/** Ascending actual shared pool, active50 and logical kind3 parent match.
 * The complete plan validates before any record is mutated. */
export function planEngineerChargePhase(
  records: readonly Native[],
  actor: number,
  phase: 1 | 2,
): number[] {
  if (
    records.length !== 200 ||
    !Number.isInteger(actor) ||
    actor < 0 ||
    actor >= 20 ||
    (phase !== 1 && phase !== 2)
  )
    throw Error("Actual Engineer charge phase request required");
  const changed: number[] = [];
  for (let slot = 0; slot < 200; slot++) {
    const n = records[slot];
    validateEffectNativePrior(n);
    if (
      byte(n, 6) === 0 ||
      byte(n, 69) !== 50 ||
      byte(n, 73) !== 3 ||
      word(n, 71) !== actor
    )
      continue;
    changed.push(slot);
  }
  return changed;
}
