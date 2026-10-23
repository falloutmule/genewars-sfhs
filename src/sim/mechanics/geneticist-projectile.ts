/** Geneticist41/0x29,42/0x2A,43/0x2B and their20/0x14 capture child.
 * Pure numeric records; actual shared allocation/linking/cleanup is host-owned. */
import { nextRandom, type GeneRng } from "./random";
import {
  createMotion,
  originalAngle,
  terrainNormal,
  velocity,
  wrap16,
  type MotionTables,
} from "./motion";
import {
  groundHeight,
  integerSqrt,
  worldCell,
  type TerrainState,
} from "./terrain";
import { ecologyTerrainClass } from "./ecology";
import {
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
} from "./animation";
import {
  effectFactoryPrior,
  effectPriorByte,
  effectTerrainShade,
  putEffectWord as put,
  putEffectDword as put32,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import type { GeneticistShot } from "./geneticist";

export type GeneticistProjectileCode = 41 | 42 | 43;
export interface GeneticistEffectDescriptor {
  code: number;
  completion: number;
  gravity: boolean;
  priority: number;
  childCode: number | null;
  obstacle: boolean;
  water: boolean;
}
export interface GeneticistEffectEntity {
  id: string;
  index: number;
  kind: number;
  owner: number;
  position: [number, number];
  /** Actual virtual0 physical height for this concrete native kind. */
  physicalHeight: number;
  native?: readonly (number | null)[];
}
export interface GeneticistProjectileQuery {
  center: [number, number];
  points: [number, number][];
  stepX: 256 | -256;
  stepY: 256 | -256;
}
export interface GeneticistEffectChildRequest {
  code: 20 | 21 | 48;
  owner: 0;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  parameter: number;
  delay: 0;
  parent: { index: number; kind: number } | null;
  newborn: boolean;
}
export interface GeneticistProjectileAudio {
  type: "audio";
  entity: string;
  cue: number;
  mode: 2;
  parameter: 0;
  ratePercent: number;
}
export interface GeneticistProjectileFactoryContext {
  terrain: TerrainState;
  tables: MotionTables;
  descriptor: GeneticistEffectDescriptor;
}
export interface GeneticistProjectileFactoryRequest {
  code: GeneticistProjectileCode;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  parameter: number;
  delay: 0;
  parent: { index: number; kind: number } | null;
}
type Native = readonly (number | null)[];
const byte = effectPriorByte;
const word = (n: Native, p: number) =>
  wrap16(byte(n, p) | (byte(n, p + 1) << 8));
const dword = (n: Native, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const point = (n: Native): [number, number] => [word(n, 7), word(n, 9)];
const delta = (from: number, to: number) =>
  wrap16(wrap16(to * 2) - wrap16(from * 2)) >> 1;
const audio = (
  entity: string,
  cue: number,
  ratePercent = 100,
): GeneticistProjectileAudio => ({
  type: "audio",
  entity,
  cue,
  mode: 2,
  parameter: 0,
  ratePercent,
});
const physicalDistance = (
  a: [number, number],
  az: number,
  b: [number, number],
  bz: number,
) => {
  const dx = delta(a[0], b[0]),
    dy = delta(a[1], b[1]),
    dz = (bz - az) >> 3;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
};
function descriptor(d: GeneticistEffectDescriptor, code: number) {
  if (
    !d ||
    d.code !== code ||
    d.completion !== (code === 20 ? 0 : 4) ||
    d.gravity ||
    d.priority !== (code === 20 ? 12 : code === 25 ? 7 : 9) ||
    d.childCode !== (code === 20 ? null : code === 25 ? 5 : 20) ||
    !d.obstacle ||
    !d.water
  )
    throw Error("Admitted original Geneticist effect descriptor required");
}
function profile(p: AnimationProfile, code: number) {
  const count = code === 20 ? 7 : code === 25 ? 2 : 1;
  if (
    !p ||
    p.flags !== 0 ||
    p.holds.length !== count ||
    p.last - p.first !== count - 1 ||
    p.holds.some((v) => v !== 0)
  )
    throw Error("Original Geneticist EFF animation metadata required");
}
function vector(
  angles: readonly [number, number, number],
  tables: MotionTables,
): [number, number, number] {
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = angles;
  velocity(m, tables);
  return [m.vx, m.vy, m.vz];
}
function orient(n: EffectNativePrior, t: MotionTables) {
  const x = word(n, 45),
    y = word(n, 47),
    z = word(n, 49),
    xy = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0),
    speed = wrap16(integerSqrt((Math.imul(xy, xy) + Math.imul(z, z)) >>> 0));
  if (xy) put(n, 57, originalAngle(x, y, t.atan));
  put(n, 59, speed ? originalAngle(xy, -z, t.atan) : 512);
  put(n, 61, speed);
}
/**6D830 predictive aim. Its initial travel input is the controller's actual
 * integer physical distance738F0. The unsigned divisions and signed-word offsets
 * intentionally preserve the source's wrap/truncation order. */
export function aimGeneticistProjectile(
  actor: Native,
  target: Native,
  speedWord: number,
  c: { terrain: TerrainState; tables: MotionTables },
): [number, number, number] {
  if (
    actor.length !== 200 ||
    byte(actor, 6) !== 3 ||
    target.length !== 124 ||
    byte(target, 6) !== 1 ||
    !Number.isInteger(speedWord) ||
    speedWord <= 0 ||
    speedWord > 511
  )
    throw Error(
      "Actual Geneticist/Mule aim bindings and positive source speed required",
    );
  return aimMovingCreatureProjectile(
    { position: point(actor), physicalHeight: dword(actor, 39) },
    target,
    speedWord,
    1280,
    c,
  );
}
/**6D830 for callers with an established physical-height virtual and actual
 * muzzle-offset argument. Entity bindings stay in the concrete caller. */
export function aimMovingCreatureProjectile(
  origin: { position: [number, number]; physicalHeight: number },
  target: Native,
  speedWord: number,
  muzzleOffset: number,
  c: { terrain: TerrainState; tables: MotionTables },
): [number, number, number] {
  if (
    target.length !== 124 ||
    byte(target, 6) !== 1 ||
    !Number.isInteger(speedWord) ||
    speedWord <= 0 ||
    speedWord > 511 ||
    !Number.isInteger(muzzleOffset) ||
    muzzleOffset !== (muzzleOffset | 0) ||
    !Number.isInteger(origin.physicalHeight) ||
    origin.physicalHeight !== (origin.physicalHeight | 0) ||
    origin.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Actual moving-creature aim inputs required");
  const speed = speedWord << 6,
    source = origin.position,
    destination = point(target),
    sourceHeight = origin.physicalHeight,
    targetHeight = dword(target, 39),
    range = integerSqrt(
      physicalDistance(source, sourceHeight, destination, targetHeight),
    ),
    first = Math.trunc(((range << 8) >>> 0) / speedWord);
  const predict = (time: number) => {
    const offsets = [45, 47, 49].map((p) =>
        wrap16(Math.imul(word(target, p), time) >> 8),
      ),
      at: [number, number] = [
        wrap16(destination[0] + (offsets[0] >> 6)),
        wrap16(destination[1] + (offsets[1] >> 6)),
      ],
      h = Math.max(
        (targetHeight + (offsets[2] >> 3)) | 0,
        groundHeight(c.terrain, ...at),
      );
    return { at, height: h };
  };
  const p1 = predict(first),
    distance = integerSqrt(
      physicalDistance(source, sourceHeight, p1.at, p1.height),
    ),
    second = Math.trunc(((distance << 8) >>> 0) / speedWord),
    average = Math.trunc(((first + second) | 0) / 2),
    p2 = predict(average),
    dx = wrap16(wrap16(p2.at[0] * 2) - wrap16(source[0] * 2)),
    dy = wrap16(wrap16(p2.at[1] * 2) - wrap16(source[1] * 2)),
    xy = integerSqrt(
      (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
    );
  //The final PUSH shifts ESP: [ESP+20] then names the SECOND predicted XY.
  return [
    originalAngle(dx, dy, c.tables.atan) & 2047,
    originalAngle(
      xy,
      (((sourceHeight + muzzleOffset) | 0) - p2.height) >> 3,
      c.tables.atan,
    ) & 2047,
    speed,
  ];
}
export function createGeneticistProjectileRecord(
  prior: Native,
  slot: number,
  shot: GeneticistShot,
  actor: Native,
  target: Native,
  c: GeneticistProjectileFactoryContext,
): {
  native: EffectNativePrior;
  aim: [number, number, number];
  events: GeneticistProjectileAudio[];
} {
  validateEffectNativePrior(prior);
  descriptor(c.descriptor, shot.profile.effectCode);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    ![41, 42, 43].includes(shot.profile.effectCode) ||
    shot.projectileIndex + 37 !== shot.profile.effectCode ||
    shot.actor !== word(actor, 15) ||
    shot.target !== word(target, 15) ||
    shot.owner !== byte(actor, 24) ||
    shot.owner >= 4 ||
    shot.position.some((v, i) => v !== point(actor)[i]) ||
    shot.height !== ((dword(actor, 39) + 1280) | 0) ||
    shot.parameter !== 32 ||
    shot.delay !== 0 ||
    shot.aimHeightOffset !== 1280 ||
    shot.aimSpeed !== shot.profile.speedWord << 6
  )
    throw Error("Invalid original Geneticist projectile factory inputs");
  const aim = aimGeneticistProjectile(actor, target, shot.profile.speedWord, c),
    made = createGeneticistProjectileNative(
      prior,
      slot,
      {
        code: shot.profile.effectCode as GeneticistProjectileCode,
        owner: shot.owner,
        position: shot.position,
        height: shot.height,
        angles: aim,
        parameter: shot.parameter,
        delay: 0,
        parent: { index: shot.actor, kind: 3 },
      },
      c,
    );
  return { ...made, aim };
}
/**48790's shared41/42/43 factory after its caller has resolved the angles.
 * This is also the real building-projectile path; the Geneticist wrapper above
 * supplies its precise6D830 aim and parameter32. Allocation/links are external. */
export function createGeneticistProjectileNative(
  prior: Native,
  slot: number,
  request: GeneticistProjectileFactoryRequest,
  c: GeneticistProjectileFactoryContext,
): { native: EffectNativePrior; events: GeneticistProjectileAudio[] } {
  validateEffectNativePrior(prior);
  descriptor(c.descriptor, request.code);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    ![41, 42, 43].includes(request.code) ||
    !Number.isInteger(request.owner) ||
    request.owner < 0 ||
    request.owner > 4 ||
    request.delay !== 0 ||
    !Number.isInteger(request.parameter) ||
    request.parameter < -32768 ||
    request.parameter > 32767 ||
    request.position.some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    !Number.isInteger(request.height) ||
    request.height !== (request.height | 0) ||
    request.angles.some(
      (v, i) =>
        !Number.isInteger(v) ||
        (i < 2 ? v < 0 || v > 2048 : v < -32768 || v > 32767),
    ) ||
    (request.parent !== null &&
      (!Number.isInteger(request.parent.index) ||
        request.parent.index < 0 ||
        ![1, 3, 4, 5, 7, 8].includes(request.parent.kind)))
  )
    throw Error("Invalid original41/42/43 factory request");
  byte(prior, 67);
  byte(prior, 68);
  const [vx, vy, vz] = vector(request.angles, c.tables),
    native = effectFactoryPrior(prior, {
      slot,
      code: request.code,
      owner: request.owner,
      x: request.position[0],
      y: request.position[1],
      ground: groundHeight(c.terrain, ...request.position),
      height: request.height,
      shade: effectTerrainShade(c.terrain, ...request.position),
      vx,
      vy,
      vz,
      accelerationZ: 0,
      yaw: request.angles[0],
      pitch: request.angles[1],
      speed: request.angles[2],
      delay: 0,
    });
  put(native, 74, request.parameter);
  native[76] = 0;
  if (request.parent) {
    put(native, 71, request.parent.index);
    native[73] = request.parent.kind;
  } else native[73] = 0;
  return { native, events: [audio(`source:4:${slot}`, 33)] };
}
/** Real20 factory numeric image. Retains71/73 and76 from this exact slot. */
export function createGeneticistCaptureEffectRecord(
  prior: Native,
  slot: number,
  request: GeneticistEffectChildRequest,
  c: GeneticistProjectileFactoryContext,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  descriptor(c.descriptor, 20);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    request.code !== 20 ||
    request.owner !== 0 ||
    request.delay !== 0 ||
    request.angles.some((v) => v !== 0) ||
    !Number.isInteger(request.parameter) ||
    request.parameter < 0 ||
    request.parameter > 255
  )
    throw Error("Invalid original capture child factory inputs");
  byte(prior, 67);
  byte(prior, 68);
  const n = effectFactoryPrior(prior, {
    slot,
    code: 20,
    owner: 0,
    x: request.position[0],
    y: request.position[1],
    ground: groundHeight(c.terrain, ...request.position),
    height: request.height,
    shade: effectTerrainShade(c.terrain, ...request.position),
    vx: 0,
    vy: 0,
    vz: 0,
    accelerationZ: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
    delay: 0,
  });
  put(n, 74, request.parameter ? request.parameter : -1);
  return n;
}
/**8D7B0/8D930 radius256 source query; callers provide actual head→next entities
 * for its points, in the supplied order, without further random draws. */
export function geneticistProjectileQuery(
  at: [number, number],
  rng: GeneRng,
): GeneticistProjectileQuery {
  const stepX = nextRandom(rng) % 2 ? -256 : 256,
    stepY = nextRandom(rng) % 2 ? -256 : 256,
    q: GeneticistProjectileQuery = {
      center: [...at],
      points: [],
      stepX,
      stepY,
    };
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      if (x * x + y * y <= 1)
        q.points.push([wrap16(at[0] + x * stepX), wrap16(at[1] + y * stepY)]);
  return q;
}
function ref(n: Native): { index: number; kind: number } | null {
  const kind = byte(n, 73);
  return kind ? { index: word(n, 71), kind } : null;
}
export interface GeneticistCaptureEffectContext {
  /** Flatten actual source list traversal for all query points. */
  nearby(query: GeneticistProjectileQuery): readonly GeneticistEffectEntity[];
  entity(reference: {
    index: number;
    kind: number;
  }): GeneticistEffectEntity | null;
  /** Signed blueprint byte17 from the actual specialist binding, not a cache. */
  specialistSkill(actor: GeneticistEffectEntity): number;
  /** Calls real5B9F0 damage1 then5C7E0 stun, even after lethal damage. */
  impact(
    target: GeneticistEffectEntity,
    effect: EffectNativePrior,
    rng: GeneRng,
    request: { damage: 1; duration: number; capturedByActor: number | null },
  ): void;
}
/** Immediate4F6A0 inside factory20: all eligible Mules, strict source list order.
 * No factory audio or newborn mark happens before these impacts finish. */
export function applyGeneticistCaptureEffect(
  native: EffectNativePrior,
  rng: GeneRng,
  c: GeneticistCaptureEffectContext,
): {
  targets: number[];
  events: GeneticistProjectileAudio[];
} {
  validateEffectNativePrior(native);
  if (byte(native, 6) !== 5 || byte(native, 69) !== 20)
    throw Error("Capture query requires the actual child20 native");
  const q = geneticistProjectileQuery(point(native), rng),
    targets: number[] = [];
  for (const target of c.nearby(q)) {
    if (
      target.kind !== 1 ||
      physicalDistance(
        point(native),
        dword(native, 39),
        target.position,
        target.physicalHeight,
      ) > 4096
    )
      continue;
    const n = target.native;
    if (
      !n ||
      n.length !== 124 ||
      byte(n, 6) !== 1 ||
      byte(n, 122) !== 4 ||
      word(n, 15) !== target.index
    )
      throw Error("Capture impact requires a concrete admitted Mule binding");
    if (byte(n, 94) >= 24 || byte(n, 94) === 15) continue;
    let duration = 64,
      capturedByActor: number | null = null;
    if (byte(native, 73) === 3) {
      const actor = c.entity({ index: word(native, 71), kind: 3 });
      if (!actor || actor.kind !== 3)
        throw Error(
          "Capture child retained parent references a missing specialist",
        );
      const skill = c.specialistSkill(actor);
      if (!Number.isInteger(skill) || skill < -128 || skill > 127)
        throw Error("Capture duration needs original signed specialist skill");
      duration = wrap16(skill * 4 + 32);
      capturedByActor = actor.index;
    }
    c.impact(target, native, rng, { damage: 1, duration, capturedByActor });
    targets.push(target.index);
  }
  return {
    targets,
    events: [audio(`source:4:${word(native, 15)}`, targets.length ? 57 : 13)],
  };
}
export interface GeneticistProjectileStepContext
  extends GeneticistCaptureEffectContext {
  frame: number;
  water: number;
  terrain: TerrainState;
  tables: MotionTables;
  bounce: readonly number[];
  descriptor: GeneticistEffectDescriptor;
  profile: AnimationProfile;
  players: readonly (readonly number[])[];
  speciesComponents: readonly (readonly [number, number])[];
  obstacle(
    position: [number, number],
    physicalHeight: number,
  ): { index: number; kind: 4 } | null;
  /** Full shared factory before parent retirement. Child20 runs the immediate
   * query above;21/48 use their real water family. True means capacity success. */
  child(
    request: GeneticistEffectChildRequest,
    rng: GeneRng,
    parentNative: EffectNativePrior,
  ): boolean;
}
export interface GeneticistProjectileStep {
  native: EffectNativePrior;
  retirementRequired: boolean;
  newborns: number;
  events: GeneticistProjectileAudio[];
  samples: [number, number][];
  query: GeneticistProjectileQuery | null;
}
/** The same4B9AC collision callback is shared by25 and41..43. Capture-only
 * immediate services are absent here; the concrete factory binds its child. */
export type ImpactProjectileChildRequest = Omit<
  GeneticistEffectChildRequest,
  "code"
> & { code: 5 | 20 | 21 | 48 };
export interface ImpactProjectileStepContext
  extends Omit<
    GeneticistProjectileStepContext,
    "child" | "specialistSkill" | "impact"
  > {
  child(
    request: ImpactProjectileChildRequest,
    rng: GeneRng,
    parentNative: EffectNativePrior,
  ): boolean;
}
/** Complete admitted free-altitude6DF30 +4B630 path; pure current record and
 * explicit staged world ports. Source retirement is requested with kind5 intact. */
export function stepGeneticistProjectileRecord(
  before: Native,
  rng: GeneRng,
  c: GeneticistProjectileStepContext,
): GeneticistProjectileStep {
  if (![20, 41, 42, 43].includes(byte(before, 69)))
    throw Error("Original Geneticist effect selector required");
  return stepImpactProjectileRecord(before, rng, {
    ...c,
    child(request, current, parent) {
      if (request.code === 5)
        throw Error("Geneticist projectile cannot create a blast5 child");
      return c.child({ ...request, code: request.code }, current, parent);
    },
  });
}
/** Complete source free-altitude6DF30/4B630 implementation shared by the
 * established mode4 impact projectiles25/41/42/43 and capture20 lifetime. */
export function stepImpactProjectileRecord(
  before: Native,
  rng: GeneRng,
  c: ImpactProjectileStepContext,
): GeneticistProjectileStep {
  validateEffectNativePrior(before);
  if (
    !Number.isInteger(c.frame) ||
    c.frame < 0 ||
    c.frame > 0xffffffff ||
    !Number.isInteger(c.water) ||
    c.water < 0 ||
    c.water > 0xffffffff ||
    c.terrain.bytes.length !== 229376 ||
    c.tables.atan.length !== 257 ||
    c.tables.sine.length !== 2048 ||
    c.tables.cosine.length !== 2048 ||
    c.bounce.length !== 8
  )
    throw Error("Original projectile frame/terrain/motion context required");
  const code = byte(before, 69);
  descriptor(c.descriptor, code);
  profile(c.profile, code);
  if (
    ![20, 25, 41, 42, 43].includes(code) ||
    byte(before, 6) !== 5 ||
    (word(before, 21) & ~1) !== 32 ||
    word(before, 63) !== -1 ||
    [51, 53, 55].some((p) => word(before, p) !== 0) ||
    (code === 20 && [45, 47, 49].some((p) => word(before, p) !== 0))
  )
    throw Error("Unsupported original Geneticist projectile numeric state");
  const n = before.slice(),
    out: GeneticistProjectileStep = {
      native: n,
      retirementRequired: false,
      newborns: 0,
      events: [],
      samples: [],
      query: null,
    },
    x = word(n, 7),
    y = word(n, 9),
    oldGround = dword(n, 17),
    oldHeight = dword(n, 39),
    fractions = [byte(n, 67), byte(n, 68)],
    fixed = (axis: number, speed: number) =>
      (((axis ? y : x) << 16) + (fractions[axis] << 8) + (speed << 10)) | 0,
    sample = (fx: number, fy: number) => {
      const at: [number, number] = [fx >> 16, fy >> 16];
      out.samples.push(at);
      put(n, 7, at[0]);
      put(n, 9, at[1]);
      n[67] = (fx >> 8) & 255;
      n[68] = (fy >> 8) & 255;
      const h = groundHeight(c.terrain, ...at);
      put32(n, 17, h);
      n[23] = effectTerrainShade(c.terrain, ...at);
      return h;
    };
  let vx = word(n, 45),
    vy = word(n, 47),
    vz = word(n, 49);
  const h = sample(fixed(0, vx), fixed(1, vy)),
    candidateHeight = (oldHeight + (vz >> 3)) | 0;
  if (candidateHeight > h) {
    put32(n, 39, Math.max(0, candidateHeight));
    orient(n, c.tables);
    if (word(n, 61) > 19200) {
      put(n, 61, 12800);
      [vx, vy, vz] = vector([word(n, 57), word(n, 59), word(n, 61)], c.tables);
    }
  } else if (oldHeight > oldGround) {
    put32(n, 39, h);
    const normal = terrainNormal(c.terrain, ...point(n)),
      coefficient = c.bounce[ecologyTerrainClass(c.terrain, point(n))];
    if (!Number.isInteger(coefficient))
      throw Error("Original projectile terrain bounce table required");
    vz = wrap16((Math.abs(vz) * coefficient) >> 8);
    vx = wrap16(vx + Math.trunc((vz * normal[0]) / 256));
    vy = wrap16(vy + Math.trunc((vz * normal[1]) / 256));
    put(n, 45, vx);
    put(n, 47, vy);
    put(n, 49, vz);
    orient(n, c.tables);
  } else {
    vz = wrap16((wrap16(h) - wrap16(oldGround)) * 8);
    put(n, 49, vz);
    orient(n, c.tables);
    [vx, vy, vz] = vector([word(n, 57), word(n, 59), word(n, 61)], c.tables);
    put32(n, 39, sample(fixed(0, vx), fixed(1, vy)));
  }
  put(n, 45, vx);
  put(n, 47, vy);
  put(n, 49, vz);
  if (
    (c.frame + (word(n, 15) & 255)) & 1 &&
    ((dword(n, 39) - dword(n, 17)) | 0) > 0
  ) {
    const b = c.obstacle(point(n), dword(n, 39)),
      parent = ref(n);
    if (code !== 20 && b && !(parent?.kind === 4 && parent.index === b.index))
      n[76] = (b.index + 1) & 255;
  }
  if (
    ((c.frame + word(n, 15)) & 3) === 3 &&
    dword(n, 39) >>> 0 <= (c.water + 320) >>> 0 &&
    ecologyTerrainClass(c.terrain, point(n)) <= 1 &&
    word(n, 61) > 127
  ) {
    const submerged =
      oldHeight >>> 0 <= c.water >>> 0 &&
      dword(n, 39) >>> 0 < (c.water - 512) >>> 0;
    c.child(
      {
        code: submerged ? 21 : 48,
        owner: 0,
        position: point(n),
        height: submerged ? dword(n, 39) : Math.max(dword(n, 17), c.water),
        angles: submerged ? [0, 0, 128] : [0, 0, 0],
        parameter: 0,
        delay: 0,
        parent: null,
        newborn: false,
      },
      rng,
      n,
    );
  }
  put(n, 7, word(n, 7) & 32767);
  put(n, 9, word(n, 9) & 32767);
  if (word(n, 74) >= 0) put(n, 74, word(n, 74) - 1);
  const a = advanceAnimation(
    {
      action: 0,
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: (byte(n, 28) << 24) >> 24,
      delay: (byte(n, 29) << 24) >> 24,
      counter: (byte(n, 30) << 24) >> 24,
    },
    c.profile,
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  const retire = () => {
    if (code !== 20) {
      const parent = ref(n);
      if (
        c.child(
          {
            code: code === 25 ? 5 : 20,
            owner: 0,
            position: point(n),
            height: dword(n, 39),
            angles: [0, 0, 0],
            parameter: byte(n, 76),
            delay: 0,
            parent,
            newborn: true,
          },
          rng,
          n,
        )
      )
        out.newborns++;
    }
    out.retirementRequired = true;
  };
  if (code === 20) {
    if (word(n, 74) < 0 && animationFinished(a, c.profile)) retire();
    return out;
  }
  if (dword(n, 39) === dword(n, 17) || byte(n, 76) !== 0 || word(n, 74) < 0) {
    retire();
    return out;
  }
  out.query = geneticistProjectileQuery(point(n), rng);
  const parentRef = ref(n),
    parent = parentRef ? c.entity(parentRef) : null;
  let best = 0x7fffffff,
    winner: GeneticistEffectEntity | null = null,
    deflected = false;
  for (const target of c.nearby(out.query)) {
    if (
      target.id === `source:4:${word(n, 15)}` ||
      target.kind === 4 ||
      target.kind === 5 ||
      (parentRef?.kind === target.kind && parentRef.index === target.index)
    )
      continue;
    const distance = physicalDistance(
      point(n),
      dword(n, 39),
      target.position,
      target.physicalHeight,
    );
    if (distance > 4096 || distance >= best) continue;
    let reflect = false;
    if (target.kind === 1) {
      const t = target.native;
      if (!t || t.length !== 124)
        throw Error(
          "Projectile collision needs the actual creature native record",
        );
      if (byte(t, 94) >= 24) continue;
      const species = byte(t, 122),
        components = c.speciesComponents[species];
      if (!components)
        throw Error("Projectile deflection needs admitted species components");
      if (components[0] === 1 || species === 19) {
        const owner = byte(t, 24),
          player = owner < 4 ? c.players[owner] : undefined;
        const ability =
          owner === 4
            ? byte(t, 118) > 90
            : !!(byte(t, 97) & 4) ||
              (() => {
                if (!player || player.length !== 1805)
                  throw Error(
                    "Projectile deflection needs actual player research",
                  );
                return player[0x6c7 + species] !== 0;
              })();
        if (ability) {
          if (!parent)
            throw Error(
              "Projectile deflection needs a live resolved source parent",
            );
          const sourcePlayer =
            parent.owner < 4 ? c.players[parent.owner] : undefined;
          if (
            parent.owner < 4 &&
            (!sourcePlayer || sourcePlayer.length !== 1805)
          )
            throw Error(
              "Projectile deflection requires its source owner's alliance record",
            );
          reflect =
            parent.owner !== owner &&
            (parent.owner === 4 || !(sourcePlayer![0x6e5] & (1 << owner)));
        }
      }
    }
    best = distance;
    winner = target;
    deflected = reflect;
  }
  if (!winner) return out;
  if (!deflected) {
    retire();
    return out;
  }
  out.events.push(audio(winner.id, 97, 80 + (nextRandom(rng) % 40)));
  const pitch =
      (nextRandom(rng) % 128) *
      (((dword(n, 39) - dword(n, 17)) | 0) < 320 ? 8 : 4),
    yaw = (nextRandom(rng) % 128) * 16;
  put(n, 57, yaw);
  put(n, 59, pitch);
  const v = vector([yaw, pitch, word(n, 61)], c.tables);
  put(n, 45, v[0]);
  put(n, 47, v[1]);
  put(n, 49, v[2]);
  return out;
}
