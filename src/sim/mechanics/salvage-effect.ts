/**48790/48C22 effect45 (0x2D), actual demolition owner9 pickup and expiry.
 * Other owner-tagged45 pickup families remain explicit separate contracts. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import {
  createMotion,
  velocity,
  originalAngle,
  terrainNormal,
  wrap16,
  type MotionTables,
} from "./motion";
import { groundHeight, integerSqrt, type TerrainState } from "./terrain";
import { ecologyTerrainClass } from "./ecology";
import {
  effectFactoryPrior,
  effectPriorByte as byte,
  effectTerrainShade,
  putEffectWord as put,
  putEffectDword as put32,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import type { DemolitionSalvageRequest } from "./building-demolition";
import type { DestructionChildRequest } from "./destruction-effect";
import type { EngineerChargeDescriptor } from "./engineer-charge";
import type { SourceEntityId } from "../campaign/source-pools";
type Native = readonly (number | null)[];
const word = (n: Native, p: number) =>
  wrap16(byte(n, p) | (byte(n, p + 1) << 8));
const dword = (n: Native, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const point = (n: Native): [number, number] => [word(n, 7), word(n, 9)];
function profile(p: AnimationProfile) {
  if (
    p.flags !== 0 ||
    p.holds.length !== 1 ||
    p.last !== p.first ||
    p.holds[0] !== 0
  )
    throw Error("Original EFF45 single zero-hold frame required");
}
export function validateSalvageDescriptor(
  d: EngineerChargeDescriptor | undefined,
) {
  if (
    !d ||
    d.code !== 45 ||
    d.retirementMode !== 2 ||
    !d.gravity ||
    d.priority !== 12 ||
    d.childCode !== null ||
    !d.movable ||
    !d.waterResponse
  )
    throw Error("Actual salvage45 descriptor required");
}
function vector(
  a: [number, number, number],
  t: MotionTables,
): [number, number, number] {
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = a;
  velocity(m, t);
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
export function makeSalvageEffect(
  prior: Native,
  slot: number,
  q: DemolitionSalvageRequest,
  terrain: TerrainState,
  p: AnimationProfile,
  descriptor: EngineerChargeDescriptor,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  profile(p);
  validateSalvageDescriptor(descriptor);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    q.code !== 45 ||
    q.owner !== 9 ||
    q.parameter !== 5000 ||
    q.parent !== null ||
    q.newborn !== false ||
    !Number.isInteger(q.delay) ||
    q.delay < -128 ||
    q.delay > 127 ||
    q.angles.length !== 3 ||
    q.angles.some((v) => v !== 0) ||
    q.position.length !== 2 ||
    q.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(q.height) ||
    q.height < -2147483648 ||
    q.height > 2147483647
  )
    throw Error("Actual owner9 demolition salvage request/prior required");
  const n = effectFactoryPrior(prior, {
    slot,
    owner: 9,
    code: 45,
    x: q.position[0],
    y: q.position[1],
    height: q.height,
    ground: groundHeight(terrain, ...q.position),
    shade: effectTerrainShade(terrain, ...q.position),
    vx: 0,
    vy: 0,
    vz: 0,
    accelerationZ: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
    delay: q.delay,
  });
  put(n, 21, 0x180);
  n[70] = 1;
  put(n, 74, 5000);
  n[76] = q.delay & 255;
  return n;
}
export interface SalvageContact {
  id: SourceEntityId;
  kind: 1 | 3 | 4;
  index: number;
  owner: number;
  category: number | null;
}
export interface SalvageEffectContext {
  frame: number;
  gravity: number;
  water: number;
  terrain: TerrainState;
  tables: MotionTables;
  bounce: readonly number[];
  friction: readonly number[];
  profile: AnimationProfile;
  obstacle?(
    position: [number, number],
    height: number,
  ): { position: [number, number]; ground: number } | null;
  child(request: DestructionChildRequest, parent: EffectNativePrior): boolean;
  /** Publish/relocate current native before the exact own-cell head→next walk.
   * Returns the FIRST kind1/3/4, without filtering role, owner or health. */
  contact(
    position: [number, number],
    parent: EffectNativePrior,
  ): SalvageContact | null;
  /** Raw unsigned32 funds add; no80780 cap, warning, audio, burst or RNG. */
  credit(
    target: SalvageContact,
    amount: number,
    parent: EffectNativePrior,
  ): void;
}
export interface SalvageEffectUpdate {
  native: EffectNativePrior;
  retirementRequired: boolean;
  newborns: 0;
  samples: [number, number][];
  obstacleQueries: [number, number][];
  factories: { request: DestructionChildRequest; created: boolean }[];
  pickup: { target: SourceEntityId; owner: number; amount: number } | null;
}
/**Full180 common motion, mode2 timer/animation, then4CB4A/4D00A owner9. */
export function stepSalvageEffect(
  before: Native,
  c: SalvageEffectContext,
): SalvageEffectUpdate {
  validateEffectNativePrior(before);
  profile(c.profile);
  if (
    byte(before, 6) !== 5 ||
    byte(before, 69) !== 45 ||
    byte(before, 24) !== 9 ||
    (word(before, 21) & ~1) !== 0x180 ||
    word(before, 63) !== -1 ||
    [51, 53, 55].some((p) => word(before, p) !== 0) ||
    !Number.isInteger(c.frame) ||
    c.frame < 0 ||
    c.frame > 0xffffffff ||
    !Number.isInteger(c.gravity) ||
    c.gravity < -32768 ||
    c.gravity > 32767 ||
    !Number.isInteger(c.water) ||
    c.water < 0 ||
    c.water > 0xffffffff ||
    c.tables.atan.length !== 257 ||
    c.tables.sine.length !== 2048 ||
    c.tables.cosine.length !== 2048
  )
    throw Error("Actual owner9 salvage motion state/context required");
  const n = before.slice(),
    out: SalvageEffectUpdate = {
      native: n,
      retirementRequired: false,
      newborns: 0,
      samples: [],
      obstacleQueries: [],
      factories: [],
      pickup: null,
    },
    x = word(n, 7),
    y = word(n, 9),
    oldHeight = dword(n, 39),
    oldGround = dword(n, 17),
    fractions = [byte(n, 67), byte(n, 68)],
    fixed = (axis: number, speed: number) =>
      (((axis ? y : x) << 16) + (fractions[axis] << 8) + (speed << 10)) | 0,
    sample = (fx: number, fy: number) => {
      const p: [number, number] = [fx >> 16, fy >> 16];
      out.samples.push(p);
      put(n, 7, p[0]);
      put(n, 9, p[1]);
      n[67] = (fx >> 8) & 255;
      n[68] = (fy >> 8) & 255;
      const h = groundHeight(c.terrain, ...p);
      put32(n, 17, h);
      n[23] = effectTerrainShade(c.terrain, ...p);
      return h;
    };
  let vx = word(n, 45),
    vy = word(n, 47),
    vz = wrap16(word(n, 49) - c.gravity);
  const candidate = (oldHeight + (vz >> 3)) | 0,
    h = sample(fixed(0, vx), fixed(1, vy));
  if (candidate > h) {
    put32(n, 39, Math.max(0, candidate));
    put(n, 49, vz);
    orient(n, c.tables);
    if (word(n, 61) > 19200) {
      put(n, 61, 12800);
      [vx, vy, vz] = vector([word(n, 57), word(n, 59), word(n, 61)], c.tables);
    }
  } else if (oldHeight <= oldGround) {
    put32(n, 39, h);
    const normal = terrainNormal(c.terrain, x, y),
      slide = Math.abs(vz) >> 1;
    vx = wrap16(vx + Math.trunc((normal[0] * slide) / 256));
    vy = wrap16(vy + Math.trunc((normal[1] * slide) / 256));
    const speed = integerSqrt(
      (Math.imul(vx, vx) + Math.imul(vy, vy) + Math.imul(vz, vz)) >>> 0,
    );
    if (speed) {
      const friction = c.friction[ecologyTerrainClass(c.terrain, [x, y])];
      if (!Number.isInteger(friction))
        throw Error("Original salvage friction table required");
      if (speed <= friction) vx = vy = vz = 0;
      else {
        const factor = Math.trunc(((speed - friction) << 6) / speed);
        vx = wrap16(Math.floor((vx * factor) / 64));
        vy = wrap16(Math.floor((vy * factor) / 64));
        vz = wrap16(Math.floor((vz * factor) / 64));
      }
    }
    vz = wrap16((wrap16(h) - wrap16(oldGround)) * 8);
    put(n, 45, vx);
    put(n, 47, vy);
    put(n, 49, vz);
    orient(n, c.tables);
    [vx, vy, vz] = vector([word(n, 57), word(n, 59), word(n, 61)], c.tables);
    put32(n, 39, sample(fixed(0, vx), fixed(1, vy)));
  } else {
    put32(n, 39, h);
    const normal = terrainNormal(c.terrain, ...point(n)),
      coefficient = c.bounce[ecologyTerrainClass(c.terrain, point(n))];
    if (!Number.isInteger(coefficient))
      throw Error("Original salvage bounce table required");
    vz = wrap16((Math.abs(vz) * coefficient) >> 8);
    vx = wrap16(vx + Math.trunc((vz * normal[0]) / 256));
    vy = wrap16(vy + Math.trunc((vz * normal[1]) / 256));
    put(n, 45, vx);
    put(n, 47, vy);
    put(n, 49, vz);
    orient(n, c.tables);
  }
  put(n, 45, vx);
  put(n, 47, vy);
  put(n, 49, vz);
  if (
    (c.frame + (word(n, 15) & 255)) & 1 &&
    ((dword(n, 39) - dword(n, 17)) | 0) > 0
  ) {
    if (!c.obstacle) throw Error("Actual salvage74270 obstacle query required");
    const at = point(n),
      b = c.obstacle([...at], dword(n, 39));
    out.obstacleQueries.push([...at]);
    if (b) {
      const dx = wrap16((word(n, 7) - b.position[0]) * 2),
        dy = wrap16((word(n, 9) - b.position[1]) * 2),
        xy = integerSqrt(
          (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
        ),
        v = vector(
          [
            originalAngle(dx, dy, c.tables.atan),
            originalAngle(
              xy,
              ((b.ground - dword(n, 39)) | 0) >> 3,
              c.tables.atan,
            ),
            word(n, 61) >> 1,
          ],
          c.tables,
        );
      for (let i = 0; i < 3; i++)
        put(n, 45 + i * 2, word(n, 45 + i * 2) + v[i]);
      orient(n, c.tables);
    }
  }
  if (
    ((c.frame + word(n, 15)) & 3) === 3 &&
    dword(n, 39) >>> 0 <= (c.water + 320) >>> 0 &&
    ecologyTerrainClass(c.terrain, point(n)) <= 1 &&
    word(n, 61) >= 128
  ) {
    const submerged =
        oldHeight >>> 0 <= c.water >>> 0 &&
        dword(n, 39) >>> 0 < (c.water - 512) >>> 0,
      q: DestructionChildRequest = {
        code: submerged ? 21 : 48,
        owner: 0,
        position: point(n),
        height: submerged ? dword(n, 39) : Math.max(dword(n, 17), c.water),
        angles: submerged ? [0, 0, 128] : [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: false,
      };
    out.factories.push({ request: q, created: c.child(q, n) });
  }
  put(n, 7, word(n, 7) & 32767);
  put(n, 9, word(n, 9) & 32767);
  if (word(n, 74) >= 0) put(n, 74, word(n, 74) - 1);
  const a = advanceAnimation(
    {
      action: 0,
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: 1,
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
  if (word(n, 74) < 0) {
    out.retirementRequired = true;
    return out;
  }
  const target = c.contact(point(n), n);
  if (target && byte(n, 70) === 1 && target.kind === 3) {
    if (target.category === null)
      throw Error(
        "Actual salvage pickup specialist blueprint category required",
      );
    if (target.category === 0) {
      const amount = byte(n, 76) << 4;
      c.credit(target, amount, n);
      out.pickup = { target: target.id, owner: target.owner, amount };
      out.retirementRequired = true;
    }
  }
  return out;
}
