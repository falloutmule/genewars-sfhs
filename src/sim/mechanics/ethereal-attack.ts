/**1296B..129C9 punishment aim and48790 selector25/0x19 projectile.
 * Shared allocation, ordered queries and immediate blast damage are host ports. */
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
  effectPriorByte as byte,
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
const word = (n: Native, p: number) =>
  wrap16(byte(n, p) | (byte(n, p + 1) << 8));
const dword = (n: Native, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const point = (n: Native): [number, number] => [word(n, 7), word(n, 9)];
const delta = (a: number, b: number) =>
  wrap16(wrap16(b * 2) - wrap16(a * 2)) >> 1;
const distance = (
  a: [number, number],
  az: number,
  b: [number, number],
  bz: number,
) => {
  const x = delta(a[0], b[0]),
    y = delta(a[1], b[1]),
    z = (bz - az) >> 3;
  return integerSqrt(
    (Math.imul(x, x) + Math.imul(y, y) + Math.imul(z, z)) >>> 0,
  );
};
export interface EtherealAttackRequest {
  code: 25;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  parameter: 128;
  delay: 0;
  parent: { kind: 8; index: number };
  newborn: false;
}
export interface EtherealAttackPlan {
  request: EtherealAttackRequest;
  initialDistance: number;
  forecastPosition: [number, number];
  forecastHeight: number;
}
/**6D830 calls target virtualC: creatures/specialists predict actual45/47/49;
 * buildings are stationary and aim at ground17. Both initial heights are the
 * concrete virtual0 values. Arithmetic truncates at the original word writes. */
export function planEtherealAttack(
  parent: Native,
  target: Native,
  c: { terrain: TerrainState; tables: MotionTables },
): EtherealAttackPlan {
  const kind = byte(target, 6),
    size = kind === 1 ? 124 : kind === 3 ? 200 : kind === 4 ? 67 : 0;
  if (
    parent.length !== 102 ||
    byte(parent, 6) !== 8 ||
    word(parent, 15) < 0 ||
    word(parent, 15) >= 16 ||
    byte(parent, 24) > 3 ||
    target.length !== size ||
    !size ||
    word(target, 15) < 0 ||
    c.tables.atan.length !== 257
  )
    throw Error(
      "Actual Ethereal and punishment target native bindings required",
    );
  const origin = point(parent),
    at = point(target),
    sourceHeight = dword(parent, 39),
    targetHeight = dword(target, kind === 4 ? 17 : 39),
    initialDistance = distance(origin, sourceHeight, at, targetHeight),
    speed = 3840,
    denominator = speed >> 6;
  let forecastPosition: [number, number] = [...at],
    forecastHeight = targetHeight;
  if (kind !== 4) {
    const predict = (time: number) => {
      const offsets = [45, 47, 49].map((p) =>
        wrap16(Math.imul(word(target, p), time) >> 8),
      );
      const position: [number, number] = [
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
    const first = Math.trunc(((initialDistance << 8) >>> 0) / denominator),
      p1 = predict(first),
      second = Math.trunc(
        ((distance(origin, sourceHeight, p1.position, p1.height) << 8) >>> 0) /
          denominator,
      ),
      p2 = predict(Math.trunc(((first + second) | 0) / 2));
    forecastPosition = p2.position;
    forecastHeight = p2.height;
  }
  const dx = wrap16(wrap16(forecastPosition[0] * 2) - wrap16(origin[0] * 2)),
    dy = wrap16(wrap16(forecastPosition[1] * 2) - wrap16(origin[1] * 2)),
    horizontal = integerSqrt(
      (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
    ),
    height = (sourceHeight - 640) | 0,
    angles: [number, number, number] = [
      originalAngle(dx, dy, c.tables.atan) & 2047,
      originalAngle(horizontal, (height - forecastHeight) >> 3, c.tables.atan) &
        2047,
      speed,
    ];
  return {
    initialDistance,
    forecastPosition,
    forecastHeight,
    request: {
      code: 25,
      owner: byte(parent, 24),
      position: origin,
      height,
      angles,
      parameter: 128,
      delay: 0,
      parent: { kind: 8, index: word(parent, 15) },
      newborn: false,
    },
  };
}
export interface EtherealAttackFactoryContext {
  terrain: TerrainState;
  tables: MotionTables;
  descriptor: GeneticistEffectDescriptor;
  profile: AnimationProfile;
}
function profile(p: AnimationProfile) {
  if (
    p.flags !== 0 ||
    p.holds.length !== 2 ||
    p.last - p.first !== 1 ||
    p.holds.some((v) => v !== 0)
  )
    throw Error("Original EFF25 two zero-hold frames required");
}
/** Successful allocation only. Factory25 has no RNG; counter30/fractions67/68
 * and unused77..80 come from this slot, parent71/73 and collision76 are written. */
export function makeEtherealAttackEffect(
  prior: Native,
  slot: number,
  r: EtherealAttackRequest,
  c: EtherealAttackFactoryContext,
): { native: EffectNativePrior; events: GeneticistProjectileAudio[] } {
  validateEffectNativePrior(prior);
  profile(c.profile);
  const d = c.descriptor;
  if (
    !d ||
    d.code !== 25 ||
    d.completion !== 4 ||
    d.gravity ||
    d.priority !== 7 ||
    d.childCode !== 5 ||
    !d.obstacle ||
    !d.water
  )
    throw Error("Original Ethereal attack effect descriptor required");
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    r.code !== 25 ||
    !Number.isInteger(r.owner) ||
    r.owner < 0 ||
    r.owner > 3 ||
    r.parameter !== 128 ||
    r.delay !== 0 ||
    r.newborn !== false ||
    r.parent.kind !== 8 ||
    !Number.isInteger(r.parent.index) ||
    r.parent.index < 0 ||
    r.parent.index >= 16 ||
    r.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    r.height !== (r.height | 0) ||
    r.angles.some(
      (v, i) =>
        !Number.isInteger(v) ||
        (i < 2 ? v < 0 || v > 2048 : v < -32768 || v > 32767),
    )
  )
    throw Error("Invalid original Ethereal attack factory request");
  byte(prior, 67);
  byte(prior, 68);
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = r.angles;
  velocity(m, c.tables);
  const n = effectFactoryPrior(prior, {
    slot,
    code: 25,
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
    delay: 0,
  });
  put(n, 74, 128);
  put(n, 71, r.parent.index);
  n[73] = 8;
  n[76] = 0;
  return {
    native: n,
    events: [
      {
        type: "audio",
        entity: `source:4:${slot}`,
        cue: 10,
        mode: 2,
        parameter: 0,
        ratePercent: 100,
      },
    ],
  };
}
export function stepEtherealAttackEffectRecord(
  before: Native,
  rng: GeneRng,
  c: ImpactProjectileStepContext,
): GeneticistProjectileStep {
  if (byte(before, 69) !== 25)
    throw Error("Original Ethereal attack selector25 required");
  profile(c.profile);
  return stepImpactProjectileRecord(before, rng, c);
}
