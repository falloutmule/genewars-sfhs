/** Source54A00/6D830 leading aim and48790 effects37..40. Numeric records
 * are pure; shared allocation/publication and blast child0..3 are host-owned. */
import type { ShepherdShot, ShepherdTarget } from "./shepherd";
import {
  createMotion,
  originalAngle,
  velocity,
  wrap16,
  type MotionTables,
} from "./motion";
import { groundHeight, integerSqrt, type TerrainState } from "./terrain";
import {
  effectFactoryPrior,
  effectPriorByte as b,
  effectTerrainShade,
  putEffectWord as put,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import {
  stepImpactProjectileRecord,
  type GeneticistEffectDescriptor,
  type GeneticistProjectileAudio,
  type GeneticistProjectileStep,
  type ImpactProjectileStepContext,
} from "./geneticist-projectile";
import type { AnimationProfile } from "./animation";
import type { GeneRng } from "./random";
type Native = readonly (number | null)[];
type Point = [number, number];
export type ShepherdProjectileCode = 37 | 38 | 39 | 40;
export interface ShepherdProjectileRequest {
  code: ShepherdProjectileCode;
  owner: number;
  position: Point;
  height: number;
  angles: [number, number, number];
  parameter: number;
  delay: number;
  parent: { kind: number; index: number };
}
export interface ShepherdProjectileFactoryContext {
  terrain: TerrainState;
  tables: MotionTables;
  descriptor: GeneticistEffectDescriptor;
  profile: AnimationProfile;
}
const w = (n: Native, p: number) => wrap16(b(n, p) | (b(n, p + 1) << 8));
const d = (n: Native, p: number) => (w(n, p) & 65535) | (w(n, p + 2) << 16);
const point = (n: Native): Point => [w(n, 7), w(n, 9)];
const delta = (a: number, z: number) =>
  wrap16(wrap16(z * 2) - wrap16(a * 2)) >> 1;
function distance(
  from: Point,
  height: number,
  to: Point,
  targetHeight: number,
) {
  const x = delta(from[0], to[0]),
    y = delta(from[1], to[1]),
    z = ((targetHeight - height) | 0) >> 3;
  return integerSqrt(
    (Math.imul(x, x) + Math.imul(y, y) + Math.imul(z, z)) >>> 0,
  );
}
function profile(p: AnimationProfile) {
  if (
    !p ||
    p.flags !== 0 ||
    p.holds.length !== 1 ||
    p.last !== p.first ||
    p.holds[0] !== 0
  )
    throw Error("Original Shepherd single zero-hold EFF profile required");
}
/**6D830 virtualC predicts creature/specialist45/47/49, while buildings aim
 * at native17 without prediction. Source starts with738F0 physical distance,
 * floors each prediction to terrain, and uses muzzle1280 only in final pitch. */
export function aimShepherdProjectile(
  actor: Native,
  target: ShepherdTarget,
  speedWord: number,
  c: { terrain: TerrainState; tables: MotionTables },
): [number, number, number] {
  const kind = target.kind,
    size = kind === 1 ? 124 : kind === 3 ? 200 : kind === 4 ? 67 : 0;
  if (
    actor.length !== 200 ||
    b(actor, 6) !== 3 ||
    !size ||
    target.native.length !== size ||
    b(target.native, 6) !== kind ||
    w(target.native, 15) !== target.index ||
    !Number.isInteger(speedWord) ||
    speedWord <= 0 ||
    speedWord > 511 ||
    target.physicalHeight !== d(target.native, kind === 4 ? 17 : 39) ||
    c.tables.atan.length !== 257
  )
    throw Error("Actual Shepherd aim actor/target and admitted speed required");
  const source = point(actor),
    at = point(target.native),
    height = d(actor, 39),
    targetHeight = target.physicalHeight;
  let forecast: Point = [...at],
    forecastHeight = targetHeight;
  if (kind !== 4) {
    const predict = (time: number) => {
      const offsets = [45, 47, 49].map((p) =>
          wrap16(Math.imul(w(target.native, p), time) >> 8),
        ),
        position: Point = [
          wrap16(at[0] + (offsets[0] >> 6)),
          wrap16(at[1] + (offsets[1] >> 6)),
        ];
      return {
        position,
        height: Math.max(
          (targetHeight + (offsets[2] >> 3)) | 0,
          groundHeight(c.terrain, ...position),
        ),
      };
    };
    const first = Math.trunc(
        ((distance(source, height, at, targetHeight) << 8) >>> 0) / speedWord,
      ),
      p1 = predict(first),
      second = Math.trunc(
        ((distance(source, height, p1.position, p1.height) << 8) >>> 0) /
          speedWord,
      ),
      p2 = predict(Math.trunc(((first + second) | 0) / 2));
    forecast = p2.position;
    forecastHeight = p2.height;
  }
  const dx = wrap16(wrap16(forecast[0] * 2) - wrap16(source[0] * 2)),
    dy = wrap16(wrap16(forecast[1] * 2) - wrap16(source[1] * 2)),
    horizontal = integerSqrt(
      (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
    );
  return [
    originalAngle(dx, dy, c.tables.atan) & 2047,
    originalAngle(
      horizontal,
      (((height + 1280) | 0) - forecastHeight) >> 3,
      c.tables.atan,
    ) & 2047,
    speedWord << 6,
  ];
}
/** Successful48790 allocation only. Parameter0 maps to source timer-1;
 * counter30, fractions67/68 and unused payload77..80 retain the exact prior. */
export function createShepherdProjectileNative(
  prior: Native,
  slot: number,
  r: ShepherdProjectileRequest,
  c: ShepherdProjectileFactoryContext,
): { native: EffectNativePrior; events: GeneticistProjectileAudio[] } {
  validateEffectNativePrior(prior);
  profile(c.profile);
  const desc = c.descriptor;
  if (
    !desc ||
    desc.code !== r.code ||
    desc.completion !== 4 ||
    desc.gravity ||
    desc.priority !== 9 ||
    desc.childCode !== r.code - 37 ||
    !desc.obstacle ||
    !desc.water
  )
    throw Error("Admitted original Shepherd effect descriptor required");
  if (
    b(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    ![37, 38, 39, 40].includes(r.code) ||
    !Number.isInteger(r.owner) ||
    r.owner < 0 ||
    r.owner > 4 ||
    r.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(r.height) ||
    r.height !== (r.height | 0) ||
    !Number.isInteger(r.parameter) ||
    r.parameter < -32768 ||
    r.parameter > 65535 ||
    !Number.isInteger(r.delay) ||
    r.delay < 0 ||
    r.delay > 255 ||
    r.angles.some(
      (v, i) =>
        !Number.isInteger(v) ||
        (i < 2 ? v < 0 || v > 2048 : v < -32768 || v > 32767),
    ) ||
    !r.parent ||
    !Number.isInteger(r.parent.index) ||
    r.parent.index < 0 ||
    r.parent.index > 32767 ||
    !Number.isInteger(r.parent.kind) ||
    r.parent.kind < 1 ||
    r.parent.kind > 8
  )
    throw Error("Invalid original Shepherd projectile factory request");
  b(prior, 67);
  b(prior, 68);
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = r.angles;
  velocity(m, c.tables);
  const native = effectFactoryPrior(prior, {
    slot,
    code: r.code,
    owner: r.owner,
    x: r.position[0],
    y: r.position[1],
    height: r.height,
    ground: groundHeight(c.terrain, ...r.position),
    shade: effectTerrainShade(c.terrain, ...r.position),
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    accelerationZ: 0,
    yaw: r.angles[0],
    pitch: r.angles[1],
    speed: r.angles[2],
    delay: r.delay,
  });
  put(native, 74, r.parameter || -1);
  put(native, 71, r.parent.index);
  native[73] = r.parent.kind;
  native[76] = 0;
  return {
    native,
    events: [
      {
        type: "audio",
        entity: `source:4:${slot}`,
        cue: r.code - 28,
        mode: 2,
        parameter: 0,
        ratePercent: 100,
      },
    ],
  };
}
/**54A00 concrete Shepherd caller. Aim precedes the host's shared allocation;
 * callers that may hit capacity should call aim separately before allocating. */
export function createShepherdProjectileRecord(
  prior: Native,
  slot: number,
  shot: ShepherdShot,
  actor: Native,
  target: ShepherdTarget,
  c: ShepherdProjectileFactoryContext,
) {
  if (
    ![37, 38, 39, 40].includes(shot.profile.effectCode) ||
    shot.projectileIndex + 37 !== shot.profile.effectCode ||
    shot.parameter !== 32 ||
    shot.delay !== 0 ||
    shot.aimHeightOffset !== 1280 ||
    shot.aimSpeed !== shot.profile.speedWord << 6 ||
    shot.actor !== w(actor, 15) ||
    shot.owner !== b(actor, 24) ||
    shot.position[0] !== w(actor, 7) ||
    shot.position[1] !== w(actor, 9) ||
    shot.height !== d(actor, 39) ||
    shot.target.kind !== target.kind ||
    shot.target.index !== target.index
  )
    throw Error("Actual Shepherd54A00 shot differs from retained actor/target");
  const aim = aimShepherdProjectile(actor, target, shot.profile.speedWord, c),
    made = createShepherdProjectileNative(
      prior,
      slot,
      {
        code: shot.profile.effectCode as ShepherdProjectileCode,
        owner: shot.owner,
        position: [...shot.position],
        height: (shot.height + 1280) | 0,
        angles: aim,
        parameter: 32,
        delay: 0,
        parent: { kind: 3, index: shot.actor },
      },
      c,
    );
  return { ...made, aim };
}
/** Full shared6DF30→4B630 completion4 controller. Immediate blast0..3,
 * water21/48, shared replacement/linking/cleanup remain required host services. */
export function stepShepherdProjectileRecord(
  before: Native,
  rng: GeneRng,
  c: ImpactProjectileStepContext,
): GeneticistProjectileStep {
  if (![37, 38, 39, 40].includes(b(before, 69)))
    throw Error("Original Shepherd projectile selector37..40 required");
  profile(c.profile);
  return stepImpactProjectileRecord(before, rng, c);
}
