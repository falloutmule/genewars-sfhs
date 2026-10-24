/**48790 selector64/0x40 marker, mode6 callback and its real51/0x33 child.
 * No executable pointers, roster mutations or invented landing substitutes. */
import { createMotion, velocity, type MotionTables } from "./motion";
import { groundHeight, type TerrainState } from "./terrain";
import { type AnimationProfile } from "./animation";
import {
  effectFactoryPrior,
  effectPriorByte as byte,
  effectTerrainShade,
  putEffectWord as put,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import {
  stepRecruitmentMarkerMotion,
  stepEngineerChargeChildRecord,
  type RecruitmentMarkerMotionContext,
  type ProductionEffectUpdate,
} from "./production-effect";
import type { EngineerChargeDescriptor } from "./engineer-charge";
import type { DestructionChildRequest } from "./destruction-effect";

export interface RecruitmentEffectRequest {
  code: 64 | 51;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  parameter: number;
  delay: number;
  newborn: boolean;
}
export type RecruitmentChildRequest =
  | DestructionChildRequest
  | RecruitmentEffectRequest;
export interface RecruitmentEffectUpdate extends ProductionEffectUpdate {
  newborns: number;
  factories: { request: RecruitmentChildRequest; created: boolean }[];
}
export function validateRecruitmentDescriptor(
  d: EngineerChargeDescriptor | undefined,
  code: 64 | 51,
): void {
  if (
    !d ||
    d.code !== code ||
    d.retirementMode !== (code === 64 ? 6 : 0) ||
    d.gravity !== (code === 64) ||
    d.priority !== (code === 64 ? 1 : 2) ||
    d.childCode !== (code === 64 ? 51 : null) ||
    d.movable !== (code === 64) ||
    d.waterResponse !== (code === 64)
  )
    throw Error("Original recruitment64/feedback51 descriptor required");
}
function profile(p: AnimationProfile, code: 64 | 51): void {
  const count = code === 64 ? 5 : 23;
  if (
    p.flags !== 0 ||
    p.holds.length !== count ||
    p.last - p.first !== count - 1 ||
    p.holds.some((v) => v !== (code === 64 ? 1 : 0))
  )
    throw Error("Original recruitment EFF profile required");
}
/**Full common48790 image followed by48ECE (64) or common return (51).
 * Parent-reference71..73, counter30 and fractions67/68 are retained. */
export function makeRecruitmentEffect(
  prior: readonly (number | null)[],
  slot: number,
  q: RecruitmentEffectRequest,
  terrain: TerrainState,
  tables: MotionTables,
  p: AnimationProfile,
  descriptor: EngineerChargeDescriptor,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  validateRecruitmentDescriptor(descriptor, q.code);
  profile(p, q.code);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    !Number.isInteger(q.owner) ||
    q.owner < 0 ||
    q.owner > 4 ||
    q.position.length !== 2 ||
    q.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(q.height) ||
    q.height < -2147483648 ||
    q.height > 2147483647 ||
    q.angles.length !== 3 ||
    q.angles.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(q.parameter) ||
    q.parameter < -32768 ||
    q.parameter > 32767 ||
    !Number.isInteger(q.delay) ||
    q.delay < -128 ||
    q.delay > 127 ||
    tables.sine.length !== 2048 ||
    tables.cosine.length !== 2048
  )
    throw Error("Actual recruitment effect factory input/prior required");
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = q.angles;
  velocity(m, tables);
  const n = effectFactoryPrior(prior, {
    slot,
    code: q.code,
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
    delay: q.delay,
  });
  put(n, 21, q.code === 64 ? 0 : 0x20);
  put(n, 74, q.parameter || -1);
  if (q.code === 64) n[76] = 0;
  return n;
}
/**48CA4 scans the FULL200 slots by selector alone, including inactive priors.
 * The one-past return on an absent64 is an explicit undefined source boundary. */
export function planRecruitmentLandingReturn(
  records: readonly (readonly (number | null)[])[],
  allocatedSlot: number,
  parameter: 0 | 1,
): { slot: number; kind: number } {
  if (
    records.length !== 200 ||
    !Number.isInteger(allocatedSlot) ||
    allocatedSlot < 0 ||
    allocatedSlot >= 200
  )
    throw Error("Actual recruitment return pool required");
  if (parameter === 0)
    return { slot: allocatedSlot, kind: byte(records[allocatedSlot], 6) };
  if (parameter !== 1) throw Error("Unsupported recruitment landing parameter");
  for (let slot = 0; slot < 200; slot++) {
    const n = records[slot];
    validateEffectNativePrior(n);
    if (byte(n, 69) === 64) return { slot, kind: byte(n, 6) };
  }
  throw Error(
    "Source parameter1 landing scan returned one-past selector64 pool",
  );
}
/**Mode6: common motion/timer/ANB, then4B7E5. Timer/ANB never retire64.
 * Payload1 creates51 through4B3B0, marks that child and retires even on failure. */
export function stepRecruitmentEffectRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: RecruitmentMarkerMotionContext & {
    child(request: RecruitmentChildRequest, parent: EffectNativePrior): boolean;
  },
): RecruitmentEffectUpdate {
  const code = byte(before, 69);
  if (code !== 64 && code !== 51)
    throw Error("Actual recruitment64/51 callback required");
  const factories: RecruitmentEffectUpdate["factories"] = [];
  const context = {
    ...c,
    child(q: DestructionChildRequest, n: EffectNativePrior) {
      const created = c.child(q, n);
      factories.push({ request: q, created });
      return created;
    },
  };
  const result =
    code === 64
      ? stepRecruitmentMarkerMotion(before, terrain, context)
      : stepEngineerChargeChildRecord(before, terrain, c, 51);
  const out: RecruitmentEffectUpdate = { ...result, factories, newborns: 0 };
  if (code === 64 && byte(result.native, 76) === 1) {
    const n = result.native,
      word = (p: number) => ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16,
      q: RecruitmentEffectRequest = {
        code: 51,
        owner: byte(n, 24),
        position: [word(7), word(9)],
        height: (word(39) & 65535) | (word(41) << 16),
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: true,
      },
      created = c.child(q, n);
    factories.push({ request: q, created });
    out.newborns = Number(created);
    out.retirementRequired = true;
  }
  return out;
}
