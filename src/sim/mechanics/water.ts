/** Source48790/4B3B0 water particles and stationary491CA wakes. */
import {
  advanceAnimation,
  animationFinished,
  animationState,
  type AnimationState,
  type AnimationProfile,
} from "./animation";
import {
  createMotion,
  velocity,
  originalAngle,
  terrainNormal,
  type MotionTables,
} from "./motion";
import {
  groundHeight,
  integerSqrt,
  worldCell,
  type TerrainState,
} from "./terrain";
import { ecologyTerrainClass } from "./ecology";
export type WaterCode = 0x15 | 0x16 | 0x30;
export type EffectNative = (number | null)[];
export interface WaterEffect {
  slot: number;
  code: WaterCode;
  owner: number;
  active: boolean;
  x: number;
  y: number;
  fractionX: number;
  fractionY: number;
  ground: number;
  height: number;
  shade: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  yaw: number;
  pitch: number;
  speed: number;
  flags: number;
  animation: AnimationState;
  timer: number;
  /** Explicit numeric prior. Native pointer/resource gap remains null. */
  native: EffectNative;
}
export interface WaterRequest {
  code: WaterCode;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
}
export interface WaterContext {
  terrain: TerrainState;
  tables: MotionTables;
  bounce: readonly number[];
  rawWaterHeight: number;
  profile(code: WaterCode): AnimationProfile;
  obstacleAt?: (point: [number, number]) => boolean;
}
export interface WaterUpdate {
  effect: WaterEffect;
  createChild: boolean;
  retire: boolean;
  oldCell: number;
  newCell: number;
}
const wrap = (v: number) => (v << 16) >> 16;
function byte(n: EffectNative, p: number): number {
  const v = n[p];
  if (v === null || v === undefined)
    throw new Error(`Unknown shared effect prior byte ${p}`);
  return v;
}
function word(n: EffectNative, p: number) {
  return wrap(byte(n, p) | (byte(n, p + 1) << 8));
}
function dword(n: EffectNative, p: number) {
  return (word(n, p) & 65535) | (word(n, p + 2) << 16);
}
function put(n: EffectNative, p: number, v: number) {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
}
function put32(n: EffectNative, p: number, v: number) {
  put(n, p, v);
  put(n, p + 2, v >> 16);
}
function shade(terrain: TerrainState, x: number, y: number): number {
  const cx = x >> 8,
    cy = y >> 8,
    fx = x & 255,
    fy = y & 255;
  const corner = (dx: number, dy: number) => {
    const at = (((cy + dy) & 127) * 128 + ((cx + dx) & 127)) * 14;
    return (
      (wrap(terrain.bytes[at] | (terrain.bytes[at + 1] << 8)) *
        terrain.bytes[at + 12]) >>
      6
    );
  };
  const a = corner(0, 0),
    b = corner(1, 0),
    c = corner(0, 1),
    e = corner(1, 1);
  return Math.max(
    0,
    Math.min(
      64,
      ((2 * a +
        ((fx < fy
          ? (e - c) * fx + (c - a) * fy
          : (b - a) * fx + (e - b) * fy) >>
          7) -
        0x1e00) >>
        8) +
        16,
    ),
  );
}
function profile(code: WaterCode, c: WaterContext): AnimationProfile {
  const p = c.profile(code),
    count = code === 0x15 ? 2 : code === 0x16 ? 3 : 12;
  if (p.holds.length !== count || p.flags !== 0 || p.holds.some((v) => v !== 0))
    throw new Error("Original EFF water animation metadata is required");
  return p;
}
function sync(e: WaterEffect): WaterEffect {
  const n = e.native;
  n[6] = e.active ? 5 : 0;
  put(n, 7, e.x);
  put(n, 9, e.y);
  put(n, 15, e.slot);
  put32(n, 17, e.ground);
  put(n, 21, e.flags);
  n[23] = e.shade;
  n[24] = e.owner;
  n[25] = e.animation.action;
  n[26] = e.animation.hold;
  n[27] = e.animation.frame;
  n[28] = e.animation.direction & 255;
  n[29] = e.animation.delay & 255;
  n[30] = e.animation.counter & 255;
  put32(n, 39, e.height);
  put(n, 45, e.vx);
  put(n, 47, e.vy);
  put(n, 49, e.vz);
  put(n, 51, e.ax);
  put(n, 53, e.ay);
  put(n, 55, e.az);
  put(n, 57, e.yaw);
  put(n, 59, e.pitch);
  put(n, 61, e.speed);
  n[67] = e.fractionX;
  n[68] = e.fractionY;
  n[69] = e.code;
  put(n, 74, e.timer);
  return e;
}
export function cloneWaterEffect(e: WaterEffect): WaterEffect {
  return { ...e, animation: { ...e.animation }, native: e.native.slice() };
}
/** All untouched native numeric bytes survive, including byte1E. No RNG. */
export function makeWaterEffect(
  slot: number,
  request: WaterRequest,
  prior: readonly (number | null)[],
  c: WaterContext,
): WaterEffect {
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    prior.length !== 81 ||
    ![0x15, 0x16, 0x30].includes(request.code) ||
    request.owner < 0 ||
    request.owner > 3
  )
    throw new Error("Invalid water factory identity");
  if (
    request.position.some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    !Number.isInteger(request.height) ||
    request.height < -2147483648 ||
    request.height > 2147483647 ||
    request.angles.some(
      (v, i) => !Number.isInteger(v) || v < 0 || v > (i === 2 ? 32767 : 2048),
    )
  )
    throw new Error("Invalid water factory position/angles");
  profile(request.code, c);
  const n = prior.slice(),
    ground = groundHeight(c.terrain, ...request.position),
    m = createMotion(...request.position, ground, 0);
  if (request.code !== 0x30) {
    m.yaw = request.angles[0];
    m.pitch = request.angles[1];
    m.speed = request.angles[2];
    velocity(m, c.tables);
  }
  const counter = (byte(n, 30) << 24) >> 24,
    e: WaterEffect = {
      slot,
      code: request.code,
      owner: request.code === 0x30 ? 0 : request.owner,
      active: true,
      x: request.position[0],
      y: request.position[1],
      fractionX: byte(n, 67),
      fractionY: byte(n, 68),
      ground,
      height: request.height,
      shade: shade(c.terrain, ...request.position),
      vx: m.vx,
      vy: m.vy,
      vz: m.vz,
      ax: 0,
      ay: 0,
      az: 0,
      yaw: request.code === 0x30 ? 0 : request.angles[0],
      pitch: request.code === 0x30 ? 0 : request.angles[1],
      speed: request.code === 0x30 ? 0 : request.angles[2],
      flags: request.code === 0x30 ? 0x0820 : 0x20,
      animation: {
        ...animationState(0, request.code === 0x30 ? 2 : 0),
        counter,
      },
      timer: -1,
      native: n,
    };
  n[2] = n[5] = 0;
  n.fill(0, 11, 15);
  put(n, 43, 16);
  put(n, 63, -1);
  n[70] = 0;
  if (request.code === 0x30) n[76] = 0;
  // Resource/vtable bytes31..38 remain logical/null, never native pointers.
  n.fill(null, 31, 39);
  return sync(e);
}
function updateAngles(e: WaterEffect, c: WaterContext) {
  const xy = integerSqrt((Math.imul(e.vx, e.vx) + Math.imul(e.vy, e.vy)) >>> 0);
  if (xy) e.yaw = originalAngle(e.vx, e.vy, c.tables.atan);
  e.speed = wrap(
    integerSqrt((Math.imul(xy, xy) + Math.imul(e.vz, e.vz)) >>> 0),
  );
  if (e.speed < 0 || e.speed > 0x4b00)
    throw new Error("Water effect speed is outside source bounds");
  e.pitch = e.speed === 0 ? 512 : originalAngle(xy, -e.vz, c.tables.atan);
}
function flight(e: WaterEffect, c: WaterContext) {
  if (!c.obstacleAt)
    throw new Error("Water particle source obstacle query is required");
  if (
    e.flags & ~0x21 ||
    !(e.flags & 0x20) ||
    e.ax !== 0 ||
    e.ay !== 0 ||
    word(e.native, 63) !== -1
  )
    throw new Error("Unsupported water particle physics flags");
  const old = cloneWaterEffect(e),
    fixed = (axis: number, v: number) =>
      (((axis === 0 ? old.x : old.y) << 16) +
        ((axis === 0 ? old.fractionX : old.fractionY) << 8) +
        (v << 10)) |
      0;
  e.vx = wrap(e.vx + e.ax);
  e.vy = wrap(e.vy + e.ay);
  e.vz = wrap(e.vz + e.az);
  const fx = fixed(0, e.vx),
    fy = fixed(1, e.vy),
    candidate: [number, number] = [fx >> 16, fy >> 16],
    ground = groundHeight(c.terrain, ...candidate),
    height = (old.height + (e.vz >> 3)) | 0;
  if (
    !(height <= ground && old.height <= old.ground) &&
    c.obstacleAt(candidate)
  )
    throw new Error("Water particle entity collision response is required");
  e.x = candidate[0];
  e.y = candidate[1];
  e.fractionX = (fx >> 8) & 255;
  e.fractionY = (fy >> 8) & 255;
  e.ground = ground;
  e.shade = shade(c.terrain, ...candidate);
  e.height = Math.max(ground, Math.max(0, height));
  if (height <= ground) {
    if (old.height <= old.ground) {
      e.vz = wrap((wrap(ground) - wrap(old.ground)) * 8);
      updateAngles(e, c);
      const m = createMotion(e.x, e.y, ground, 0);
      m.yaw = e.yaw;
      m.pitch = e.pitch;
      m.speed = e.speed;
      velocity(m, c.tables);
      e.vx = m.vx;
      e.vy = m.vy;
      e.vz = m.vz;
      const sx = fixed(0, e.vx),
        sy = fixed(1, e.vy),
        p: [number, number] = [sx >> 16, sy >> 16];
      if (c.obstacleAt(p))
        throw new Error(
          "Water particle grounded collision response is required",
        );
      e.x = p[0];
      e.y = p[1];
      e.fractionX = (sx >> 8) & 255;
      e.fractionY = (sy >> 8) & 255;
      e.ground = groundHeight(c.terrain, ...p);
      e.height = e.ground;
      e.shade = shade(c.terrain, ...p);
    } else {
      if (Math.trunc((e.vz >> 6) / 16) > 0)
        throw new Error("Water particle impact damage branch is required");
      const normal = terrainNormal(c.terrain, ...candidate),
        coefficient = c.bounce[ecologyTerrainClass(c.terrain, candidate)];
      if (coefficient === undefined)
        throw new Error("Water particle bounce coefficient is required");
      e.vz = wrap((Math.abs(e.vz) * coefficient) >> 8);
      e.vx = wrap(e.vx + Math.trunc((e.vz * normal[0]) / 256));
      e.vy = wrap(e.vy + Math.trunc((e.vz * normal[1]) / 256));
      updateAngles(e, c);
    }
  } else updateAngles(e, c);
  e.x &= 32767;
  e.y &= 32767;
}
/** Pure staged callback. Child factory must commit BEFORE a retiring parent. */
export function updateWaterEffect(
  before: WaterEffect,
  c: WaterContext,
): WaterUpdate {
  const e = cloneWaterEffect(before),
    oldCell = worldCell(e.x, e.y),
    p = profile(e.code, c);
  if (!e.active) throw new Error("Inactive water effect callback");
  if (e.code === 0x30) {
    if (
      (e.flags & ~1) !== 0x0820 ||
      e.native[76] !== 0 ||
      e.animation.direction !== 1 ||
      e.animation.delay !== 2
    )
      throw new Error("Unsupported stationary water wake state");
    e.x &= 32767;
    e.y &= 32767;
  } else {
    if (e.animation.direction !== 1 || e.animation.delay !== 0)
      throw new Error("Unsupported water particle animation state");
    flight(e, c);
  }
  if (e.timer >= 0) e.timer = wrap(e.timer - 1);
  e.animation = advanceAnimation(e.animation, p);
  const createChild = e.code === 0x15 && c.rawWaterHeight <= e.height;
  const retire =
    e.code === 0x15
      ? createChild || (e.speed <= 64 && e.height <= e.ground)
      : e.timer < 0 && animationFinished(e.animation, p);
  sync(e);
  return {
    effect: e,
    createChild,
    retire,
    oldCell,
    newCell: worldCell(e.x, e.y),
  };
}
export function retireWaterEffect(before: WaterEffect): WaterEffect {
  const e = cloneWaterEffect(before);
  e.active = false;
  return sync(e);
}
