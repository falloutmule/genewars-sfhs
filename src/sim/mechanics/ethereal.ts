/** Source101D0/118E0 family8 visitors. Native pointers remain logical/null. */
import { nextRandom, type GeneRng } from "./random";
import {
  advanceAnimation,
  type AnimationProfile,
  type AnimationState,
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
import { effectTerrainShade } from "./power-motion";
import { ecologyTerrainClass } from "./ecology";
import type { SourcePoolRegistry } from "../campaign/source-pools";
import {stepEtherealPunishment,refreshPunishmentTarget,type EtherealPunishmentServices} from "./ethereal-punishment";
export type EtherealNative = (number | null)[];
export interface EtherealRecord {
  slot: number;
  native: EtherealNative;
  binding: "base" | "offset80" | null;
}
export interface EtherealState {
  schemaVersion: 1;
  records: EtherealRecord[];
  count: number;
}
export interface EtherealSpawn {
  selector: 0 | 1 | 2;
  owner: number;
  position: [number, number];
  initialHeight: number;
}
export interface EtherealBuilding {
  slot: number;
  owner: number;
  active: boolean;
  complete: boolean;
  selector: number;
  x: number;
  y: number;
  flags0100: boolean;
}
export interface EtherealZone {
  index: number;
  center: [number, number];
  initialQuota: number;
  remainingQuota: number;
  observerCount: number;
}
export interface EtherealParticle {
  code: 0x1a;
  position: [number, number];
  height: number;
  angles: [number, number, number];
}
export interface EtherealRewardEffect {
  code: 0x3b;
  owner: number;
  position: [number, number];
  height: number;
  angles: [0, 0, 0];
}
export type EtherealEvent =
  | {
      type: "audio-moving";
      channel: number;
      mode: 2;
      parameter: 255;
      volume: 127;
      initialRatePercent: 100;
      adjustedRatePercent: number;
    }
  | { type: "stop-if-playing"; channel: number; mode: 4 }
  | { type: "ui-message"; variant: number }
  | { type: "stop-audio"; channel: number }
  | { type: "fade-audio"; channel: number; mode: number };
export interface EtherealContext {
  terrain: TerrainState;
  tables: MotionTables;
  bounce: readonly number[];
  frame: number;
  water: number;
  profile(selector: number, action: number): AnimationProfile;
  currentPointAccepted(record: EtherealRecord): boolean;
  buildings(owner: number): readonly EtherealBuilding[];
  playerTarget(owner: number): [number, number];
  zones: EtherealZone[];
  playerCounter(owner: number): number;
  responseThreshold: number;
  punishmentDivisor: number;
  observationThresholds: readonly number[];
  rewardSiteAccepted(position: [number, number]): boolean;
  /** The factory executes at the source point before later timer/target draws. */
  createParticle?(
    parent: EtherealRecord,
    request: EtherealParticle,
    rng: GeneRng,
  ): void;
  rewardEffect?(record: EtherealRecord, request: EtherealRewardEffect): void;
  playerInactive(owner: number): boolean;
  playerRaw(owner:number):readonly number[];
  punishment?:EtherealPunishmentServices;
}
export interface EtherealUpdate {
  after: EtherealRecord;
  child: EtherealSpawn | null;
  retire: boolean;
  notifyParent: number | null;
  playerCounterAfter: number | null;
  playerFundsDelta: number;
  events: EtherealEvent[];
  queue: boolean;
}
export const etherealWord = (n: readonly (number | null)[], at: number) => {
  if (
    n[at] === null ||
    n[at + 1] === null ||
    n[at] === undefined ||
    n[at + 1] === undefined
  )
    throw new Error("Ethereal native field is uninitialized");
  return ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
};
export const etherealDword = (n: readonly (number | null)[], at: number) =>
  (etherealWord(n, at) & 65535) | (etherealWord(n, at + 2) << 16);
export function putEtherealWord(n: EtherealNative, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >> 8) & 255;
}
export function putEtherealDword(n: EtherealNative, at: number, value: number) {
  putEtherealWord(n, at, value);
  putEtherealWord(n, at + 2, value >> 16);
}
const w = etherealWord,
  d = etherealDword,
  pw = putEtherealWord,
  pd = putEtherealDword,
  wrap = (v: number) => (v << 16) >> 16;
const byte = (n: EtherealNative, at: number) => {
  const v = n[at];
  if (v === null || v === undefined)
    throw new Error("Ethereal native byte is uninitialized");
  return v;
};
export const etherealPosition = (record: EtherealRecord): [number, number] => [
  w(record.native, 7),
  w(record.native, 9),
];
export function cloneEthereals(state: EtherealState): EtherealState {
  return {
    ...state,
    records: state.records.map((r) => ({ ...r, native: r.native.slice() })),
  };
}
export function createEtherealState(source: SourcePoolRegistry): EtherealState {
  const pool = source.source.pools.find((p) => p.family === 7);
  if (!pool || pool.capacity !== 16 || pool.packedStride !== 94)
    throw new Error("Original16-slot family8 source pool is required");
  const bytes = Array.from(atob(pool.packedBase64), (c) => c.charCodeAt(0));
  if (bytes.length !== 16 * 94)
    throw new Error("Family8 source pool extent is invalid");
  const records = Array.from({ length: 16 }, (_, slot) => {
    const native: EtherealNative = Array(102).fill(null);
    bytes
      .slice(slot * 94, (slot + 1) * 94)
      .forEach((v, i) => (native[i < 31 ? i : i + 8] = v));
    const selector = native[0x55]!;
    return {
      slot,
      native,
      binding: native[6] === 0 ? null : selector === 1 ? "base" : "offset80",
    } as EtherealRecord;
  });
  return {
    schemaVersion: 1,
    records,
    count: records.filter((r) => r.native[6] !== 0).length,
  };
}
/** Firstfree and map insertion belong to the adapter; all untouched bytes survive. */
export function makeEtherealRecord(
  prior: EtherealRecord,
  request: EtherealSpawn,
  c: Pick<EtherealContext, "terrain">,
): EtherealRecord {
  if (
    prior.slot < 0 ||
    prior.slot >= 16 ||
    prior.native.length !== 102 ||
    prior.native[6] !== 0 ||
    request.owner < 0 ||
    request.owner > 3 ||
    ![0, 1, 2].includes(request.selector)
  )
    throw new Error("Invalid source Ethereal factory request");
  const n = prior.native.slice(),
    ground = groundHeight(c.terrain, ...request.position);
  n[2] = n[5] = 0;
  n[6] = 8;
  pw(n, 7, request.position[0]);
  pw(n, 9, request.position[1]);
  pw(n, 15, prior.slot);
  n[24] = request.owner;
  pd(n, 17, ground);
  n[23] = effectTerrainShade(c.terrain, ...request.position);
  pw(n, 21, 0);
  pd(n, 11, 0);
  for (const at of [25, 26, 27, 29, 0x53, 0x54]) n[at] = 0;
  n[28] = 1;
  n.fill(0, 0x2d, 0x3f);
  pd(n, 0x27, request.initialHeight);
  n[0x4a] = byte(n, 0x4a) & 0x3b;
  n[0x15] = byte(n, 0x15) | 0x20;
  n[0x55] = request.selector;
  pw(n, 0, worldCell(...request.position));
  pw(n, 0x2b, request.selector === 1 ? 32 : 8);
  n[0x56] = [4, 0, 10][request.selector];
  pd(n, 11, (ground + [16000, 4800, 22400][request.selector]) | 0);
  n[0x16] = byte(n, 0x16) | 0x40;
  n[0x49] = byte(n, 0x49) | 0x10;
  n[0x4f] = n[0x52] = 0;
  pw(n, 0x3f, request.selector === 1 ? 3840 : 1920);
  pw(n, 0x41, request.selector === 1 ? 0 : 1920);
  pw(n, 0x3b, 1024);
  if (request.selector === 1) {
    pw(n, 0x39, 768);
    pw(n, 0x4b, 768);
    n[0x5b] = 0;
  } else {
    n[0x4a] = byte(n, 0x4a) & 0xdf;
    if (request.selector === 2) {
      n[24] = 4;
      n[0x58] = request.owner;
    }
  }
  n.fill(null, 31, 39);
  return {
    slot: prior.slot,
    native: n,
    binding: request.selector === 1 ? "base" : "offset80",
  };
}
function velocityInto(n: EtherealNative, c: EtherealContext) {
  const m = createMotion(w(n, 7), w(n, 9), d(n, 17), 0);
  m.yaw = w(n, 0x39);
  m.pitch = w(n, 0x3b);
  m.speed = w(n, 0x3d);
  if (m.yaw < 0 || m.yaw > 2048 || m.pitch < 0 || m.pitch > 2048 || m.speed < 0)
    throw new Error("Ethereal velocity angles/speed outside source bounds");
  velocity(m, c.tables);
  pw(n, 0x2d, m.vx);
  pw(n, 0x2f, m.vy);
  pw(n, 0x31, m.vz);
}
function angles(n: EtherealNative, c: EtherealContext) {
  const x = w(n, 0x2d),
    y = w(n, 0x2f),
    z = w(n, 0x31),
    xy = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0);
  if (xy) pw(n, 0x39, originalAngle(x, y, c.tables.atan));
  const speed = wrap(integerSqrt((Math.imul(xy, xy) + Math.imul(z, z)) >>> 0));
  if (speed < 0) throw new Error("Ethereal speed square overflow");
  pw(n, 0x3d, speed);
  pw(n, 0x3b, speed === 0 ? 512 : originalAngle(xy, -z, c.tables.atan));
  if (speed > 0x4b00) {
    pw(n, 0x3d, 0x3200);
    velocityInto(n, c);
  }
}
const delta = (from: number, to: number) => wrap(wrap(to - from) * 2) >> 1;
function targetDistance(n: EtherealNative) {
  const vertical = byte(n, 0x16) & 0x40 ? d(n, 11) : d(n, 0x60),
    dz = ((vertical - d(n, 0x27)) | 0) >> 3;
  let result = Math.imul(dz, dz);
  if (!(byte(n, 0x16) & 0x40))
    for (let axis = 0; axis < 2; axis++) {
      const dx = delta(w(n, 7 + 2 * axis), w(n, 11 + 2 * axis));
      result = (result + Math.imul(dx, dx)) | 0;
    }
  return result;
}
function speed(n: EtherealNative) {
  const current = w(n, 0x41),
    desired = w(n, 0x3f),
    width = w(n, 0x2b) & 65535,
    brake = () => (current > width ? wrap(current - width) : 0);
  if (byte(n, 0x4a) & 0x20) return brake();
  if (!(byte(n, 0x4a) & 0x10)) {
    if (!width) throw new Error("Source zero-width Ethereal speed division");
    const quotient = Math.trunc((current * current) / (width << 7));
    if (targetDistance(n) <= Math.imul(quotient, quotient)) return brake();
  }
  return Math.abs(current - desired) <= width
    ? desired
    : desired < current
      ? brake()
      : wrap(current + width);
}
function physics(n: EtherealNative, c: EtherealContext, oldGround: number) {
  const before = n.slice(),
    oldHeight = d(n, 0x27),
    wasGrounded = oldHeight <= oldGround;
  for (let axis = 0; axis < 3; axis++)
    pw(n, 0x2d + 2 * axis, w(n, 0x2d + 2 * axis) + w(n, 0x33 + 2 * axis));
  const height = (oldHeight + (w(n, 0x31) >> 3)) | 0,
    fixed = (axis: number) =>
      ((w(before, 7 + 2 * axis) << 16) +
        (byte(before, 0x43 + axis) << 8) +
        (w(n, 0x2d + 2 * axis) << 10)) |
      0,
    fx = fixed(0),
    fy = fixed(1),
    at: [number, number] = [fx >> 16, fy >> 16],
    ground = groundHeight(c.terrain, ...at);
  pd(n, 17, ground);
  n[23] = effectTerrainShade(c.terrain, ...at);
  if (height <= ground) {
    pd(n, 0x27, ground);
    if (wasGrounded || byte(before, 0x15) & 0x40) {
      pw(n, 0x31, wrap(wrap(ground) - wrap(oldGround)) * 8);
      angles(n, c);
      const requested = speed(n);
      pw(n, 0x41, requested);
      pw(n, 0x3d, requested);
      velocityInto(n, c);
      for (let axis = 0; axis < 2; axis++) {
        const value = fixed(axis);
        pw(n, 7 + 2 * axis, value >> 16);
        n[0x43 + axis] = (value >> 8) & 255;
      }
      const p: [number, number] = [w(n, 7), w(n, 9)],
        g = groundHeight(c.terrain, ...p);
      pd(n, 17, g);
      pd(n, 0x27, g);
      n[23] = effectTerrainShade(c.terrain, ...p);
    } else {
      for (let axis = 0; axis < 2; axis++) {
        pw(n, 7 + 2 * axis, at[axis]);
        n[0x43 + axis] = ((axis === 0 ? fx : fy) >> 8) & 255;
      }
      const vz = w(n, 0x31);
      if (Math.trunc((vz >> 6) / 16) > 0)
        throw new Error("Ethereal impact damage callback is required");
      const normal = terrainNormal(c.terrain, ...at),
        bounce = c.bounce[ecologyTerrainClass(c.terrain, at)];
      if (bounce === undefined)
        throw new Error("Ethereal bounce coefficient is missing");
      const bounced = wrap((Math.abs(vz) * bounce) >> 8);
      pw(n, 0x31, bounced);
      for (let axis = 0; axis < 2; axis++)
        pw(
          n,
          0x2d + 2 * axis,
          w(n, 0x2d + 2 * axis) + Math.trunc((bounced * normal[axis]) / 256),
        );
      angles(n, c);
    }
  } else {
    for (let axis = 0; axis < 2; axis++) {
      pw(n, 7 + 2 * axis, at[axis]);
      n[0x43 + axis] = ((axis === 0 ? fx : fy) >> 8) & 255;
    }
    pd(n, 0x27, Math.max(height, 0));
    if (w(n, 0x3f) > 0) {
      const requested = speed(n);
      pw(n, 0x41, requested);
      pw(n, 0x3d, requested);
      velocityInto(n, c);
    }
    angles(n, c);
  }
  if (
    ((c.frame + w(n, 15)) & 3) === 3 &&
    ((c.water >>> 0) + 320) >>> 0 >= d(n, 0x27) >>> 0
  )
    throw new Error("Ethereal water callback is required");
  pw(n, 7, w(n, 7) & 32767);
  pw(n, 9, w(n, 9) & 32767);
}
function angular(current: number, target: number) {
  const direct = target - current,
    other = direct < 0 ? 2048 + direct : -2048 + direct;
  return Math.abs(direct) <= Math.abs(other) ? direct : other;
}
function steer(n: EtherealNative, c: EtherealContext, child: boolean) {
  let changed = false;
  const yaw = w(n, 0x39),
    target = w(n, 0x4b),
    pitch = w(n, 0x3b),
    goal = d(n, 0x45);
  if (!child) {
    if (yaw !== target || pitch !== goal) {
      pw(n, 0x39, target);
      pw(n, 0x3b, goal);
      changed = true;
    }
  } else {
    const width = 2 * (w(n, 0x2b) & 65535);
    if (yaw !== target) {
      const diff = angular(yaw, target);
      n[0x4a] =
        Math.abs(diff) >= 256 ? byte(n, 0x4a) | 0x20 : byte(n, 0x4a) & 0xdf;
      pw(
        n,
        0x39,
        Math.abs(diff) <= width
          ? target
          : (yaw + Math.sign(diff) * width) & 2047,
      );
      changed = true;
    } else n[0x4a] = byte(n, 0x4a) & 0xdf;
    if (pitch !== goal) {
      if (goal < 0 || goal > 2048)
        throw new Error("Ethereal pitch target outside source bounds");
      const diff = angular(pitch, goal);
      pw(
        n,
        0x3b,
        Math.abs(diff) <= width
          ? goal
          : (pitch + Math.sign(diff) * width) & 2047,
      );
      changed = true;
    }
  }
  if (changed) velocityInto(n, c);
}
function setTargetAngles(n: EtherealNative, c: EtherealContext) {
  const dx = delta(w(n, 7), w(n, 11)),
    dy = delta(w(n, 9), w(n, 13)),
    horizontal = integerSqrt((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0),
    dz = ((d(n, 0x27) - d(n, 0x60)) | 0) >> 3;
  pw(n, 0x4b, originalAngle(dx * 2, dy * 2, c.tables.atan));
  pd(n, 0x45, originalAngle(horizontal, dz, c.tables.atan));
}
function motion(n: EtherealNative, c: EtherealContext, child: boolean) {
  const oldGround = d(n, 17),
    phase = (c.frame + w(n, 15)) >>> 0;
  n[0x49] = byte(n, 0x49) & 0x9f;
  if (w(n, 0x3f) > 0 || byte(n, 0x49) & 0x10) {
    if (byte(n, 0x16) & 0x40) {
      const diff = (d(n, 11) - d(n, 0x27)) | 0;
      if (Math.abs(diff) <= 128) {
        n[0x54] = 0;
        pw(n, 0x49, (w(n, 0x49) | 0x220) & 0x2fef);
        n[0x16] = byte(n, 0x16) & 0x3f;
        for (const at of [0x2d, 0x2f, 0x31, 0x3d, 0x3f]) pw(n, at, 0);
      } else if (diff > 0) {
        n[0x4a] = (byte(n, 0x4a) | 0x40) & 0x7f;
        pd(n, 0x45, 0);
      } else {
        n[0x4a] = (byte(n, 0x4a) | 0x80) & 0xbf;
        pd(n, 0x45, 1024);
      }
    } else if (byte(n, 0x49) & 0x10) {
      n[0x49] = byte(n, 0x49) & 0xf3;
      const dx = delta(w(n, 7), w(n, 11)),
        dy = delta(w(n, 9), w(n, 13));
      if (phase & 1) pw(n, 0x4b, originalAngle(dx * 2, dy * 2, c.tables.atan));
      const distance = targetDistance(n),
        relative = (d(n, 0x27) - d(n, 17)) | 0;
      if (distance <= 0x24000) {
        n[0x4a] = byte(n, 0x4a) & 0xbf;
        if (distance <= 400) {
          pw(n, 0x49, w(n, 0x49) | 0x220);
          n[0x4a] = byte(n, 0x4a) & 0x2f;
          for (let axis = 0; axis < 2; axis++) {
            pw(n, 7 + 2 * axis, w(n, 11 + 2 * axis) & 32767);
            n[0x43 + axis] = 0;
          }
          const at: [number, number] = [w(n, 7), w(n, 9)];
          pd(n, 17, groundHeight(c.terrain, ...at));
          n[23] = effectTerrainShade(c.terrain, ...at);
          pw(n, 0x41, 0);
          n[0x16] = byte(n, 0x16) & 0x3f;
          n[0x54] = 0;
          n[0x49] = byte(n, 0x49) & 0xef;
          for (const at of [0x2d, 0x2f, 0x31, 0x3d, 0x3f]) pw(n, at, 0);
        } else if ((phase & 3) === 3) setTargetAngles(n, c);
      } else if (relative < 2880) {
        const pitch = d(n, 0x45);
        if (pitch >= 32) pd(n, 0x45, pitch - 16);
        n[0x4a] = byte(n, 0x4a) | 0x40;
      } else if (byte(n, 0x4a) & 0x40 || phase & 1) {
        n[0x4a] = byte(n, 0x4a) & 0xbf;
        setTargetAngles(n, c);
      }
    } else {
      const relative = (d(n, 0x27) - d(n, 17)) | 0;
      if (relative < 2880) {
        const pitch = d(n, 0x45);
        if (pitch >= 32) pd(n, 0x45, pitch - 16);
        n[0x4a] = byte(n, 0x4a) | 0x40;
      } else if (byte(n, 0x4a) & 0x40 && relative >= 2112)
        n[0x4a] = byte(n, 0x4a) & 0xbf;
    }
  }
  steer(n, c, child);
  physics(n, c, oldGround);
  if (byte(n, 0x49) & 0x20) {
    pw(n, 0x3f, 0);
    pw(n, 0x41, 0);
  }
}
function animate(n: EtherealNative, c: EtherealContext, selector: number) {
  const profile = c.profile(selector, byte(n, 25)),
    a: AnimationState = {
      action: byte(n, 25),
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: (byte(n, 28) << 24) >> 24,
      delay: (byte(n, 29) << 24) >> 24,
      counter: (byte(n, 30) << 24) >> 24,
    },
    out = advanceAnimation(a, profile);
  n[26] = out.hold;
  n[27] = out.frame;
  n[28] = out.direction & 255;
  n[29] = out.delay & 255;
  n[30] = out.counter & 255;
}
function audio(n: EtherealNative, child: boolean): EtherealEvent {
  const speedValue = w(n, child ? 0x41 : 0x3d);
  return !child && speedValue <= 0
    ? { type: "stop-if-playing", channel: 0x38, mode: 4 }
    : {
        type: "audio-moving",
        channel: child ? 0x53 : 0x38,
        mode: 2,
        parameter: 255,
        volume: 127,
        initialRatePercent: 100,
        adjustedRatePercent: wrap(
          100 +
            Math.trunc(
              ((child ? 100 : 20) * speedValue) / (child ? 7680 : 1920),
            ),
        ),
      };
}
function particle(
  record: EtherealRecord,
  c: EtherealContext,
  rng: GeneRng,
): void {
  const n = record.native;
  if (w(n, 0x41) <= 256) return;
  const yaw = (w(n, 0x39) + 1920 + nextRandom(rng)) & 2047,
    pitch = (w(n, 0x3b) + 1920 + nextRandom(rng)) & 2047;
  if (!c.createParticle)
    throw new Error("Ethereal shared code1A particle factory is required");
  c.createParticle(
    record,
    {
      code: 0x1a,
      position: etherealPosition(record),
      height: d(n, 0x27),
      angles: [yaw, pitch, w(n, 0x3d) >> 2],
    },
    rng,
  );
}
function direction(n: EtherealNative) {
  n[25] = ((((w(n, 0x39) >> 7) + 1) >> 1) + 1) & 7;
}

/**73C20 uses two draws and truncates radius*draw before doubling. */
export function sampleEtherealPoint(
  center: [number, number],
  radius: number,
  tables: MotionTables,
  rng: GeneRng,
): [number, number] {
  const index = (nextRandom(rng) * 8 + 1536) & 2047,
    scale = (((radius & 65535) * nextRandom(rng)) >> 8) * 2;
  return center.map((v, axis) => {
    const offset =
      Math.imul(
        scale,
        axis === 0 ? tables.cosine[index] : tables.sine[index],
      ) >> 16;
    return (wrap(wrap(v * 2) + wrap(offset)) >> 1) & 32767;
  }) as [number, number];
}
function setPointTarget(
  n: EtherealNative,
  target: [number, number],
  height: number,
  desiredSpeed: number,
) {
  pw(n, 11, target[0]);
  pw(n, 13, target[1]);
  n[0x54] = 20;
  n[0x16] = byte(n, 0x16) & 0x3f;
  n[0x49] = byte(n, 0x49) | 0x14;
  pw(n, 0x49, w(n, 0x49) & 0xeffc);
  n[0x4f] = n[0x52] = 0;
  pd(n, 0x60, height);
  n[0x4a] = byte(n, 0x4a) & 0x3f;
  pw(n, 0x3f, desiredSpeed);
  pw(n, 0x64, 0);
}
function reward(
  record: EtherealRecord,
  c: EtherealContext,
  rng: GeneRng,
  out: EtherealUpdate,
) {
  const n = record.native,
    stage = byte(n, 0x57);
  if (stage === 0) {
    let center = etherealPosition(record),
      attempts = 0,
      outer = 0,
      candidate: [number, number] = center;
    // The original does not reset attempts after recentering at attempt30.
    // Attempt31 exits even when rejected. Preserve that observable quirk.
    for (;;) {
      candidate = sampleEtherealPoint(center, 3840, c.tables, rng);
      attempts++;
      if (!c.rewardSiteAccepted(candidate) && attempts < 30) continue;
      if (attempts === 30) {
        outer++;
        center = sampleEtherealPoint(center, 3840, c.tables, rng);
      }
      if (attempts === 30 && outer < 10) continue;
      break;
    }
    if (outer === 10) {
      n[0x56] = 8;
      return;
    }
    pw(n, 0x5c, candidate[0]);
    pw(n, 0x5e, candidate[1]);
    setPointTarget(
      n,
      candidate,
      (groundHeight(c.terrain, ...candidate) + 9600) | 0,
      1920,
    );
    n[0x57] = 1;
  } else if (stage === 1 && byte(n, 0x49) & 0x20) {
    if (!c.rewardEffect)
      throw new Error("Ethereal reward effect3B factory is required");
    const position = etherealPosition(record);
    c.rewardEffect(record, {
      code: 0x3b,
      owner: byte(n, 24),
      position,
      height: groundHeight(c.terrain, ...position),
      angles: [0, 0, 0],
    });
    pw(n, 0x64, 200);
    n[0x57] = 2;
    out.playerFundsDelta = 1000;
  } else if (stage === 2) {
    const timer = wrap(w(n, 0x64) - 1);
    pw(n, 0x64, timer);
    if (timer <= 0) n[0x56] = 8;
  }
}
function choosePunishment(n: EtherealNative, c: EtherealContext, rng: GeneRng) {
  const counter = c.playerCounter(byte(n, 24));
  if (counter >= 0 || c.playerInactive(byte(n, 24))) {
    n[0x56] = 8;
    return;
  }
  if (
    !Number.isInteger(c.punishmentDivisor) ||
    c.punishmentDivisor <= 0 ||
    c.punishmentDivisor > 65535
  )
    throw new Error(
      "Ethereal punishment division by zero or invalid unsigned divisor",
    );
  const quotient = Math.trunc(((-counter << 8) | 0) / c.punishmentDivisor);
  let severity = 1;
  if (quotient >= 16) {
    if (
      c.observationThresholds.length !== 3 ||
      !c.observationThresholds.some((v) => quotient >= v)
    )
      throw new Error(
        "Ethereal punishment severity rejection loop has no admissible threshold",
      );
    for (;;) {
      const index = nextRandom(rng) % 3;
      if (quotient >= c.observationThresholds[index]) {
        severity = index + 1;
        break;
      }
    }
  }
  n[0x58] = severity;
  n[0x57] = 1;
}

function sampleTarget(
  n: EtherealNative,
  center: [number, number],
  c: EtherealContext,
  rng: GeneRng,
  heightOffset: number,
) {
  const index = (nextRandom(rng) * 8 + 1536) & 2047,
    target: [number, number] = [0, 0];
  for (let axis = 0; axis < 2; axis++) {
    const value =
      Math.imul(
        2048,
        axis === 0 ? c.tables.cosine[index] : c.tables.sine[index],
      ) >> 16;
    target[axis] = (wrap(wrap(center[axis] * 2) + wrap(value)) >> 1) & 32767;
    pw(n, 0x5c + 2 * axis, center[axis]);
    pw(n, 11 + 2 * axis, target[axis]);
  }
  n[0x54] = 20;
  n[0x49] = byte(n, 0x49) | 0x14;
  n[0x16] = byte(n, 0x16) & 0x3f;
  pw(n, 0x49, w(n, 0x49) & 0xeffc);
  n[0x16] = byte(n, 0x16) & 0x7f;
  n[0x4f] = n[0x52] = 0;
  pd(n, 0x60, (groundHeight(c.terrain, ...target) + heightOffset) | 0);
  n[0x4a] = byte(n, 0x4a) & 0x3f;
  pw(n, 0x64, 0);
  pw(n, 0x3f, 3840);
  n[0x57] = (byte(n, 0x57) + 1) & 255;
}
function buildingTarget(
  n: EtherealNative,
  c: EtherealContext,
  rng: GeneRng,
): boolean {
  const owner = byte(n, 24),
    buildings = c.buildings(owner);
  if (
    buildings.length !== 64 ||
    buildings.some((b, i) => b.slot !== owner * 64 + i || b.owner !== owner)
  )
    throw new Error("Ethereal owner building64-slot views are required");
  if (![0, 4].includes(byte(n, 0x5b)))
    throw new Error("Ethereal retained target kind is not a building");
  const start = byte(n, 0x5b) === 4 ? w(n, 0x59) + 1 - owner * 64 : 0;
  if (start < 0)
    throw new Error(
      "Ethereal retained building index is outside owner partition",
    );
  const selected = buildings
    .slice(start)
    .find(
      (b) =>
        b.active &&
        b.complete &&
        [0, 1, 4, 7, 11].includes(b.selector) &&
        (!b.flags0100 || b.selector === 11),
    );
  let center: [number, number];
  if (selected) {
    pw(n, 0x59, selected.slot);
    n[0x5b] = 4;
    center = [selected.x, selected.y];
  } else if (byte(n, 0x57) === 0) center = c.playerTarget(owner);
  else return false;
  sampleTarget(n, center, c, rng, 2560);
  return true;
}
function zoneTarget(
  n: EtherealNative,
  c: EtherealContext,
  rng: GeneRng,
): boolean {
  const start = byte(n, 0x57);
  if (start > c.zones.length || c.zones.length > 64)
    throw new Error("Ethereal zone continuation index is invalid");
  if (start > 0)
    c.zones[start - 1].observerCount =
      (c.zones[start - 1].observerCount - 1) & 255;
  const selected = c.zones.slice(start).find((z) => z.remainingQuota > 0);
  if (!selected) return false;
  pw(n, 0x59, selected.index);
  n[0x57] = selected.index;
  sampleTarget(n, [...selected.center], c, rng, 2560);
  return true;
}
function hoverAcceleration(n: EtherealNative, c: EtherealContext) {
  const center: [number, number] = [w(n, 0x5c), w(n, 0x5e)],
    height = (groundHeight(c.terrain, ...center) + 4800) | 0,
    dx = delta(w(n, 7), center[0]),
    dy = delta(w(n, 9), center[1]),
    dz = ((d(n, 0x27) - height) | 0) >> 3,
    horizontal = integerSqrt((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0),
    yaw = originalAngle(dx * 2, dy * 2, c.tables.atan),
    pitch = originalAngle(horizontal, dz, c.tables.atan);
  if (Math.abs(angular(w(n, 0x39), yaw)) < 256) {
    const vector = n.slice();
    pw(vector, 0x39, yaw);
    pw(vector, 0x3b, pitch);
    pw(vector, 0x3d, 192);
    velocityInto(vector, c);
    n.splice(0x33, 6, ...vector.slice(0x2d, 0x33));
    pw(n, 0x4b, yaw);
    pd(n, 0x45, pitch);
  } else {
    n.fill(0, 0x33, 0x39);
    const distance =
      (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) | 0;
    pw(n, 0x4b, distance >>> 0 > 0x40000 ? yaw : w(n, 0x39));
  }
}
function validateCore(record: EtherealRecord) {
  const n = record.native;
  if (
    n.length !== 102 ||
    n[6] !== 8 ||
    w(n, 15) !== record.slot ||
    record.slot < 0 ||
    record.slot >= 16 ||
    ![0, 1, 2].includes(byte(n, 0x55)) ||
    byte(n, 0x15) !== 0x20 ||
    byte(n, 0x16) & ~0x40 ||
    byte(n, 0x4f) !== 0 ||
    (byte(n, 0x52) !== 0 && !(byte(n,0x55)===0&&[7,8,9].includes(byte(n,0x56))))
  )
    throw new Error("Ethereal callback source state is not admitted");
  if (byte(n, 0x55) === 2 ? byte(n, 24) !== 4 : byte(n, 24) >= 4)
    throw new Error("Ethereal owner/selector mismatch");
}
/** Whole established visitor state machine, with ordered real particle factory.
 * Unsupported reward/punishment services remain explicit rather than scored by
 * a no-op. All world mutations must be staged by the enclosing family pass. */
export function updateEtherealRecord(
  before: EtherealRecord,
  state: EtherealState,
  c: EtherealContext,
  rng: GeneRng,
): EtherealUpdate {
  validateCore(before);
  const after = { ...before, native: before.native.slice() },
    n = after.native,
    selector = byte(n, 0x55),
    priorState = byte(n, 0x56),
    events: EtherealEvent[] = [],
    out: EtherealUpdate = {
      after,
      child: null,
      retire: false,
      notifyParent: null,
      playerCounterAfter: null,
      playerFundsDelta: 0,
      events,
      queue: true,
    },
    phase = (c.frame + before.slot) >>> 0;
  if (
    ((selector === 0 && [5, 8, 9].includes(priorState)) ||
      (selector === 1 &&
        (([1, 2].includes(priorState) && w(n, 0x64) > 0) ||
          (priorState === 3 && !(byte(n, 0x49) & 0x10)))) ||
      (selector === 2 && !(byte(n, 0x49) & 0x10))) &&
    (phase & 31) === 0
  )
    c.currentPointAccepted(before);
  if (selector === 0) {
    if (![4, 5, 6, 7, 8, 9].includes(priorState))
      throw new Error(
        `Ethereal parent state ${priorState} requires its original reward/punishment service`,
      );
    if (priorState !== 9 && (w(n, 0x3f) < 0 || w(n, 0x41) < 0))
      throw new Error("Ethereal parent speed state is invalid");
    if(priorState===7)refreshPunishmentTarget(after,c);
    motion(n, c, false);
    if (priorState === 4 && byte(n, 0x49) & 0x20) {
      pw(n, 0x3f, 0);
      pw(n, 0x41, 0);
      out.child = {
        selector: 1,
        owner: byte(n, 24),
        position: etherealPosition(after).map((v) => wrap(v - 32)) as [
          number,
          number,
        ],
        initialHeight: (d(n, 0x27) - 320) | 0,
      };
      if (nextRandom(rng) % 10 === 5)
        events.push({ type: "ui-message", variant: 0 });
      n[0x56] = 5;
      n[0x57] = 0;
    } else if (priorState === 5 && byte(n, 0x57) !== 0) {
      n[0x57] = 0;
      const counter = c.playerCounter(byte(n, 24));
      if (counter >= c.responseThreshold) {
        out.playerCounterAfter = 0;
        n[0x56] = 6;
      } else if (counter < 0) {
        n[0x56] = 7;
        events.push({
          type: "ui-message",
          variant: nextRandom(rng) % 10 < 5 ? 1 : 2,
        });
      } else n[0x56] = 8;
    } else if (priorState === 6) {
      reward(after, c, rng, out);
    } else if (priorState === 7) {
      if (byte(n, 0x57) === 0) choosePunishment(n, c, rng);
      else stepEtherealPunishment(after,c,rng,out);
    } else if (
      priorState === 8 &&
      !state.records.some(
        (r) =>
          r.native[6] !== 0 && r.native[0x55] === 0 && r.native[0x56] !== 8,
      )
    ) {
      n[0x56] = 9;
      n.fill(0, 0x33, 0x37);
      pw(n, 0x37, 640);
      pw(n, 0x3f, -1);
      pw(n, 0x4b, (nextRandom(rng) % 128) * 16);
      pd(n, 0x45, nextRandom(rng) % 128);
    } else if (priorState === 9 && d(n, 0x27) >= 51200) {
      out.retire = true;
      out.queue = false;
      events.push(
        { type: "stop-audio", channel: 0x5e },
        { type: "stop-audio", channel: 0x5f },
      );
      return out;
    }
    events.push(audio(n, false));
    animate(n, c, selector);
    return out;
  }
  if (selector === 2) {
    if (![10, 11, 12, 13, 14].includes(priorState))
      throw new Error(
        `Ethereal marker state ${priorState} requires its original event/departure service`,
      );
    motion(n, c, true);
    if (priorState === 10 && byte(n, 0x49) & 0x20) {
      n[0x56] = 11;
      pw(n, 0x64, 0);
    } else if (priorState === 11) {
      const timer = wrap(w(n, 0x64) + 1);
      pw(n, 0x64, timer);
      if (timer === 20) {
        n[0x56] = 12;
        n[0x57] = 0;
      }
    } else if (priorState === 12 && byte(n, 0x57) !== 0) {
      n[0x56] = 13;
      pw(n, 0x64, 0);
    }
    if (priorState === 13) {
      const timer = wrap(w(n, 0x64) + 1);
      pw(n, 0x64, timer);
      if (timer === 20) {
        n[0x56] = 14;
        n.fill(0, 0x33, 0x37);
        pw(n, 0x37, 640);
        pw(n, 0x3f, -1);
        pw(n, 0x4b, (nextRandom(rng) % 128) * 16);
        pd(n, 0x45, nextRandom(rng) % 128);
      }
    } else if (priorState === 14 && d(n, 0x27) >= 57600) {
      out.retire = true;
      out.queue = false;
      events.push(
        { type: "stop-audio", channel: 0x5e },
        { type: "stop-audio", channel: 0x5f },
      );
      return out;
    }
    events.push(audio(n, false));
    animate(n, c, selector);
    return out;
  }
  if (![0, 1, 2, 3].includes(priorState))
    throw new Error("Unknown Ethereal child state");
  let parent: EtherealRecord | undefined;
  if (priorState === 3) {
    parent =
      byte(n, 0x57) === 0
        ? state.records.find(
            (r) =>
              r.native[6] !== 0 &&
              r.native[24] === n[24] &&
              r.native[0x55] === 0,
          )
        : state.records[w(n, 0x59)];
    if (
      !parent ||
      parent.native[6] !== 8 ||
      parent.native[24] !== n[24] ||
      parent.native[0x55] !== 0 ||
      parent.native[0x56] !== 5 ||
      parent.native[0x57] !== 0
    )
      throw new Error("Ethereal return parent is missing or not waiting");
  }
  const hover = [1, 2].includes(priorState) && w(n, 0x64) > 0;
  motion(n, c, true);
  events.push(audio(n, true));
  particle(after, c, rng);
  direction(n);
  if (priorState === 0) {
    if (byte(n, 0x49) & 0x20) {
      n[0x56] = 1;
      n[0x57] = 0;
      if (!buildingTarget(n, c, rng))
        throw new Error("Ethereal initial target selection failed");
    }
  } else if ([1, 2].includes(priorState) && !hover) {
    if (byte(n, 0x57) === 0)
      throw new Error("Ethereal child travel target is not initialized");
    if (byte(n, 0x49) & 0x20) {
      pw(n, 0x3f, 7680);
      pw(n, 0x64, 300 + 4 * (nextRandom(rng) % 100));
      pw(
        n,
        0x64,
        priorState === 2
          ? 500 + 4 * (nextRandom(rng) % 200)
          : 50 + 4 * (nextRandom(rng) % 50),
      );
      if (priorState === 2) {
        const zone = c.zones[byte(n, 0x57) - 1];
        if (!zone) throw new Error("Ethereal zone arrival target is invalid");
        zone.observerCount = (zone.observerCount + 1) & 255;
      }
    }
  } else if (hover) {
    const remaining = wrap(w(n, 0x64) - 1);
    pw(n, 0x64, remaining);
    const zone = priorState === 2 ? c.zones[w(n, 0x59)] : undefined;
    if (priorState === 2 && !zone)
      throw new Error("Ethereal hovering zone is invalid");
    if (remaining > 0 && (!zone || zone.initialQuota !== 0))
      hoverAcceleration(n, c);
    else if (priorState === 1 && buildingTarget(n, c, rng)) {
    } else {
      if (priorState === 1) {
        n[0x57] = 0;
        n[0x56] = 2;
      }
      if (!zoneTarget(n, c, rng)) {
        n[0x57] = 0;
        n[0x56] = 3;
        n[0x5b] = 0;
        n.fill(0, 0x33, 0x39);
      }
    }
  } else if (priorState === 3) {
    const stage = byte(n, 0x57);
    if (stage === 0) {
      pw(n, 0x59, parent!.slot);
      n[0x5b] = 8;
      const target = etherealPosition(parent!).map((v) => wrap(v - 32)) as [
        number,
        number,
      ];
      n[0x54] = 20;
      pw(n, 11, target[0]);
      pw(n, 13, target[1]);
      n[0x16] = byte(n, 0x16) & 0xbf;
      n[0x49] = byte(n, 0x49) | 0x14;
      pw(n, 0x49, w(n, 0x49) & 0xeffc);
      n[0x16] = byte(n, 0x16) & 0x7f;
      n[0x4f] = n[0x52] = 0;
      pd(n, 0x60, (groundHeight(c.terrain, ...target) + 2048) | 0);
      n[0x4a] = byte(n, 0x4a) & 0x3f;
      pw(n, 0x3f, 3840);
      n[0x57] = 1;
    } else if (stage === 1 && byte(n, 0x49) & 0x20) {
      pd(n, 11, d(parent!.native, 0x27));
      n[0x16] = byte(n, 0x16) | 0x40;
      n[0x49] = byte(n, 0x49) | 0x10;
      n[0x4f] = n[0x52] = 0;
      pw(n, 0x3f, 3840);
      n.fill(0, 0x2d, 0x33);
      n[0x57] = 2;
    } else if (stage === 2 && byte(n, 0x49) & 0x20) {
      out.retire = true;
      out.notifyParent = parent!.slot;
      out.queue = false;
      events.push({ type: "stop-audio", channel: 0x53 });
      return out;
    }
  }
  animate(n, c, selector);
  return out;
}

