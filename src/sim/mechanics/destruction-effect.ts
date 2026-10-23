/**48790 destruction blasts/debris and4B630 complete callbacks. The host owns
 * shared allocation, ordered spatial traversal, recursive damage and rollback. */
import { nextRandom, type GeneRng } from "./random";
import {
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
} from "./animation";
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
  effectPriorByte,
  putEffectWord as put,
  putEffectDword as put32,
  effectTerrainShade,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import type { SourceEntityId } from "../campaign/source-pools";
export type DestructionCode = 0 | 1 | 2 | 3 | 5 | 27 | 28 | 29 | 30 | 31 | 46;
export interface DestructionRequest {
  code: DestructionCode;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  parameter: number;
  delay: number;
  instigator?: SourceEntityId | null;
  newborn?: boolean;
}
export type DestructionChildRequest = Omit<DestructionRequest, "code"> & {
  code: DestructionCode | 6 | 21 | 48;
};
export interface DestructionAudio {
  type: "audio";
  channel: 6 | 0x2e;
  mode: 2;
  parameter: 0;
  volume: 127;
  ratePercent: 100;
}
const byte = effectPriorByte,
  word = (n: readonly (number | null)[], p: number) =>
    wrap16(byte(n, p) | (byte(n, p + 1) << 8)),
  dword = (n: readonly (number | null)[], p: number) =>
    (word(n, p) & 65535) | (word(n, p + 2) << 16),
  point = (n: readonly (number | null)[]): [number, number] => [
    word(n, 7),
    word(n, 9),
  ];
const delta = (a: number, b: number) =>
  wrap16(wrap16(b * 2) - wrap16(a * 2)) >> 1;
const counts: Record<DestructionCode, number> = {
  0: 10,
  1: 10,
  2: 10,
  3: 9,
  5: 14,
  27: 8,
  28: 7,
  29: 7,
  30: 4,
  31: 3,
  46: 5,
};
function profile(code: DestructionCode, p: AnimationProfile) {
  if (
    p.flags !== 0 ||
    p.holds.length !== counts[code] ||
    p.last - p.first !== counts[code] - 1 ||
    p.holds.some((h) => h !== 0)
  )
    throw Error("Original destruction EFF animation profile required");
}
function vec(angles: [number, number, number], tables: MotionTables) {
  if (
    tables.atan.length !== 257 ||
    tables.sine.length !== 2048 ||
    tables.cosine.length !== 2048
  )
    throw Error("Original destruction motion tables are required");
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = angles;
  velocity(m, tables);
  return [m.vx, m.vy, m.vz];
}
/**Factory only, after a successful real shared allocation. Zero parameter
 * maps to timer-1; source counter/fractions/child/payload survive by default. */
export function makeDestructionEffect(
  prior: readonly (number | null)[],
  input: DestructionRequest & { slot: number },
  terrain: TerrainState,
  rng: GeneRng,
  tables: MotionTables,
  p: AnimationProfile,
): {
  native: EffectNativePrior;
  events: DestructionAudio[];
  areaRequired: boolean;
} {
  profile(input.code, p);
  if (
    prior[6] !== 0 ||
    !Number.isInteger(input.slot) ||
    input.slot < 0 ||
    input.slot >= 200 ||
    input.owner < 0 ||
    input.owner > 4 ||
    !Number.isInteger(input.owner) ||
    input.position.some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    !Number.isInteger(input.height) ||
    input.height < -2147483648 ||
    input.height > 2147483647 ||
    !Number.isInteger(input.delay) ||
    input.delay < 0 ||
    input.delay > 255 ||
    !Number.isInteger(input.parameter) ||
    input.parameter < 0 ||
    input.parameter > 32767 ||
    input.angles.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Invalid original destruction factory input");
  const v = vec(input.angles, tables),
    n = effectFactoryPrior(prior, {
      slot: input.slot,
      code: input.code,
      owner: input.owner,
      x: input.position[0],
      y: input.position[1],
      height: input.height,
      ground: groundHeight(terrain, ...input.position),
      shade: effectTerrainShade(terrain, ...input.position),
      vx: v[0],
      vy: v[1],
      vz: v[2],
      accelerationZ: 0,
      yaw: input.angles[0],
      pitch: input.angles[1],
      speed: input.angles[2],
      delay: input.delay,
    });
  put(n, 74, input.parameter || -1);
  const events: DestructionAudio[] = [];
  if (input.code >= 27 && input.code <= 31) {
    put(n, 21, 0x180);
    n[70] = nextRandom(rng) % 3 & 1;
  } else if (input.code === 46) {
    put(n, 21, 0x820);
    n[29] = 2;
    n[76] = 0;
  } else {
    events.push({
      type: "audio",
      channel: input.code === 5 ? 0x2e : 6,
      mode: 2,
      parameter: 0,
      volume: 127,
      ratePercent: 100,
    });
    if (input.code === 5) n[29] = nextRandom(rng) % 3;
  }
  if (input.newborn) n[21] = byte(n, 21) | 1;
  return { native: n, events, areaRequired: input.code <= 5 };
}
export interface BlastTarget {
  id: SourceEntityId;
  kind: number;
  index: number;
  owner: number;
  position: [number, number];
  height: number;
  relativeHeight: number;
  movable: boolean;
  native: (number | null)[];
  /**Plant virtual68. Required only on a kind2 contact. */ plantProtected?: boolean;
}
export interface BlastAreaContext {
  directions: readonly (readonly [number, number])[];
  tables: MotionTables;
  /** Bind when a recursive factory can replace the world's RNG object. */
  currentRng?(): GeneRng;
  /**Direct unsigned missionPrefix355C/countdown word. */ readCountdown(): number;
  writeCountdown(value: number): void;
  head(position: [number, number]): SourceEntityId | null;
  resolve(id: SourceEntityId): BlastTarget;
  next(id: SourceEntityId): SourceEntityId | null;
  /**Actual virtual34 for kind1/3/4/7; all views belong to staged state. */ damage(
    target: SourceEntityId,
    amount: number,
    attacker: SourceEntityId | null,
  ): void;
  /**Actual6C900 and6C6B0 including real effect8 fire creation. */ plantDamage?(
    target: SourceEntityId,
    amount: number,
    blast: SourceEntityId,
  ): void;
  plantIgnite?(target: SourceEntityId): void;
  /**Synchronize normalized motion after the exact native impulse writes. */ motionChanged?(
    target: SourceEntityId,
  ): void;
}
export interface BlastVisit {
  point: [number, number];
  target: SourceEntityId;
  distance: number;
  admitted: boolean;
  impulse: boolean;
  damage: number | null;
  response:
    | "ignored"
    | "damage"
    | "plant-damage"
    | "plant-ignite"
    | "plant-protected"
    | "effect-no-op";
}
function angles(n: (number | null)[], tables: MotionTables) {
  const x = word(n, 45),
    y = word(n, 47),
    z = word(n, 49),
    xy = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0),
    speed = wrap16(integerSqrt((Math.imul(xy, xy) + Math.imul(z, z)) >>> 0));
  if (xy) put(n, 57, originalAngle(x, y, tables.atan));
  put(n, 59, speed ? originalAngle(xy, -z, tables.atan) : 512);
  put(n, 61, speed);
}
/**738F0 wraps XY over32768 and scales physical height by8 before sqrt. */
export function blastDistance(
  origin: [number, number],
  height: number,
  target: Pick<BlastTarget, "position" | "height">,
) {
  const x = delta(origin[0], target.position[0]),
    y = delta(origin[1], target.position[1]),
    z = ((target.height - height) | 0) >> 3;
  return integerSqrt(
    (Math.imul(x, x) + Math.imul(y, y) + Math.imul(z, z)) >>> 0,
  );
}
function impulse(
  n: readonly (number | null)[],
  target: BlastTarget,
  code: 2 | 3 | 5,
  rng: GeneRng,
  c: BlastAreaContext,
) {
  let yaw: number,
    pitch: number,
    speed = 0;
  if (target.relativeHeight <= 0) {
    const x = delta(word(n, 7), target.position[0]),
      y = delta(word(n, 9), target.position[1]),
      distance = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0);
    speed = ((code << 5) - distance) >>> 5;
    pitch = 200 + (nextRandom(rng) % 312);
    yaw = originalAngle(wrap16(x * 2), wrap16(y * 2), c.tables.atan);
  } else {
    const x = wrap16((target.position[0] - word(n, 7)) * 2),
      y = wrap16((target.position[1] - word(n, 9)) * 2),
      xy = integerSqrt(
        (Math.imul(x >> 1, x >> 1) + Math.imul(y >> 1, y >> 1)) >>> 0,
      );
    yaw = originalAngle(x, y, c.tables.atan);
    pitch = originalAngle(
      xy,
      ((dword(n, 39) - target.height) | 0) >> 3,
      c.tables.atan,
    );
  }
  const v = vec([yaw, pitch, wrap16(speed)], c.tables),
    t = target.native;
  for (let i = 0; i < 3; i++)
    put(t, 45 + i * 2, word(t, 45 + i * 2) + (i === 2 ? 8192 : 0) + v[i]);
  angles(t, c.tables);
  c.motionChanged?.(target.id);
}
/**4929C/4995A executes after actual insertion and the code5 delay draw.
 * Traversal follows each current next link AFTER mutation, including recursive
 * destruction. Repeated visits across the nine cells are preserved. */
export function runBlastArea(
  n: readonly (number | null)[],
  parameter: number,
  instigator: SourceEntityId | null,
  rng: GeneRng,
  c: BlastAreaContext,
): { visits: BlastVisit[]; countdownBefore: number; countdownAfter: number } {
  const code = byte(n, 69);
  if (n[6] !== 5 || ![0, 1, 2, 3, 5].includes(code) || c.directions.length !== 9)
    throw Error("Original blast area identity/directions required");
  const before = c.readCountdown();
  if (!Number.isInteger(before) || before < 0 || before > 65535)
    throw Error("Original blast countdown word required");
  if (before > 600) c.writeCountdown(before - 10);
  const visits: BlastVisit[] = [],
    blastId = `source:4:${word(n, 15)}` as SourceEntityId,
    source = instigator ? c.resolve(instigator) : null,
    actor = source?.kind === 3 ? source.id : null,
    tracked =
      actor && byte(source!.native, 129) === 1
        ? word(source!.native, 127)
        : null;
  let trackedVisited = false;
  for (const offset of c.directions) {
    const sample: [number, number] = [
      wrap16(word(n, 7) + offset[0]),
      wrap16(word(n, 9) + offset[1]),
    ];
    let id = c.head(sample);
    const seen = new Set<SourceEntityId>();
    while (id) {
      if (seen.has(id)) throw Error("Original blast spatial chain is cyclic");
      seen.add(id);
      const target = c.resolve(id),
        distance = blastDistance(point(n), dword(n, 39), target),
        admitted =
          (distance & 65535) < (code << 6) + 64 ||
          (parameter > 0 &&
            target.kind === 4 &&
            target.index === parameter - 1),
        visit: BlastVisit = {
          point: [...sample],
          target: id,
          distance,
          admitted,
          impulse: false,
          damage: null,
          response: "ignored",
        };
      visits.push(visit);
      if (admitted) {
        if (target.movable) {
          impulse(n, target, code as 2 | 3 | 5, c.currentRng?.() ?? rng, c);
          visit.impulse = true;
        }
        if (tracked !== null && target.kind === 1 && target.index === tracked)
          trackedVisited = true;
        if (target.kind === 2) {
          if (target.plantProtected === undefined)
            throw Error("Original blast plant virtual68 binding required");
          if (target.plantProtected || byte(target.native, 46) & 8)
            visit.response = "plant-protected";
          else if (nextRandom(c.currentRng?.() ?? rng) % 20 < code) {
            if (!c.plantDamage)
              throw Error("Original blast6C900 plant damage service required");
            c.plantDamage(id, code * 4, blastId);
            visit.response = "plant-damage";
            visit.damage = code * 4;
          } else if (code > 2) {
            if (!c.plantIgnite)
              throw Error(
                "Original blast6C6B0 plant ignition service required",
              );
            c.plantIgnite(id);
            visit.response = "plant-ignite";
          }
        } else if (
          target.kind === 1 ||
          target.kind === 3 ||
          target.kind === 4 ||
          target.kind === 7
        ) {
          let damage: number | null = null;
          if (target.kind === 3)
            damage = parameter !== 0 ? code * 2 + 6 : code * 4 + 12;
          else if (target.kind === 1)
            damage = actor ? (code + 1) * 24 + 16 : (code + 1) * 6 + 8;
          else if (target.kind === 7) damage = 1;
          else if (word(target.native, 43) > 0)
            damage =
              (distance & 65535) < code * 16 + 16 ? code * 8 + 8 : code * 4 + 4;
          if (damage !== null) {
            if (!c.damage)
              throw Error(
                "Original blast target damage virtual service required",
              );
            c.damage(
              id,
              damage,
              target.kind === 7 ||
                (target.kind === 4 && (distance & 65535) >= code * 16 + 16)
                ? null
                : blastId,
            );
            visit.damage = damage;
            visit.response = "damage";
          }
        } else if (target.kind === 5) visit.response = "effect-no-op";
      }
      id = c.next(id);
    }
    if (actor) {
      const current = c.resolve(actor);
      put(
        current.native,
        trackedVisited ? 132 : 134,
        word(current.native, trackedVisited ? 132 : 134) + 1,
      );
    }
  }
  return { visits, countdownBefore: before, countdownAfter: c.readCountdown() };
}
export interface DestructionStepContext {
  frame: number;
  gravity: number;
  water: number;
  terrain: TerrainState;
  tables: MotionTables;
  bounce: readonly number[];
  friction: readonly number[];
  profile(code: DestructionCode): AnimationProfile;
  obstacle?(
    position: [number, number],
    height: number,
  ): { position: [number, number]; ground: number } | null;
  /** Publish this current parent before the ordered factory. Preserve any
   * cleanup/replacement changes by copying its carrier back into this array. */
  particle(
    request: DestructionChildRequest,
    rng: GeneRng,
    parentNative: EffectNativePrior,
  ): boolean;
}
export interface DestructionStep {
  native: EffectNativePrior;
  retirementRequired: boolean;
  newborns: number;
  samples: [number, number][];
  obstacleQueries: [number, number][];
}
/**Full6DF30 for this family's constructor flags. Debris has gravity,
 * half-vertical slope slide/friction and real water factories;46 freezes physics. */
export function stepDestructionEffect(
  before: readonly (number | null)[],
  rng: GeneRng,
  c: DestructionStepContext,
): DestructionStep {
  validateEffectNativePrior(before);
  if (
    !Number.isInteger(c.frame) ||
    c.frame < 0 ||
    c.frame > 0xffffffff ||
    !Number.isInteger(c.gravity) ||
    c.gravity < -32768 ||
    c.gravity > 32767 ||
    !Number.isInteger(c.water) ||
    c.water < 0 ||
    c.water > 0xffffffff
  )
    throw Error("Original destruction frame/gravity/water required");
  const code = byte(before, 69) as DestructionCode,
    p = c.profile(code);
  profile(code, p);
  const n = before.slice(),
    debris = code >= 27 && code <= 31,
    flags = word(n, 21) & ~1,
    samples: [number, number][] = [],
    obstacleQueries: [number, number][] = [],
    out: DestructionStep = {
      native: n,
      retirementRequired: false,
      newborns: 0,
      samples,
      obstacleQueries,
    };
  if (
    n[6] !== 5 ||
    ![0, 1, 2, 3, 5, 27, 28, 29, 30, 31, 46].includes(code) ||
    flags !== (debris ? 0x180 : code === 46 ? 0x820 : 0x20) ||
    word(n, 63) !== -1 ||
    [51, 53, 55].some((at) => word(n, at) !== 0)
  )
    throw Error("Unsupported original destruction physics state");
  const x = word(n, 7),
    y = word(n, 9),
    height = dword(n, 39),
    groundBefore = dword(n, 17),
    fractions = [byte(n, 67), byte(n, 68)],
    fixed = (axis: number, speed: number) =>
      (((axis ? y : x) << 16) + (fractions[axis] << 8) + (speed << 10)) | 0;
  const sample = (fx: number, fy: number) => {
    const at: [number, number] = [fx >> 16, fy >> 16];
    samples.push(at);
    put(n, 7, at[0]);
    put(n, 9, at[1]);
    n[67] = (fx >> 8) & 255;
    n[68] = (fy >> 8) & 255;
    const h = groundHeight(c.terrain, ...at);
    put32(n, 17, h);
    n[23] = effectTerrainShade(c.terrain, ...at);
    return h;
  };
  if (code !== 46) {
    let vx = word(n, 45),
      vy = word(n, 47),
      vz = wrap16(word(n, 49) - (debris ? c.gravity : 0));
    const candidateHeight = (height + (vz >> 3)) | 0,
      h = sample(fixed(0, vx), fixed(1, vy));
    if (candidateHeight > h) {
      put32(n, 39, Math.max(0, candidateHeight));
      put(n, 49, vz);
      angles(n, c.tables);
      if (word(n, 61) > 19200) {
        put(n, 61, 12800);
        [vx, vy, vz] = vec([word(n, 57), word(n, 59), word(n, 61)], c.tables);
      }
    } else if (height <= groundBefore) {
      put32(n, 39, h);
      if (debris) {
        const normal = terrainNormal(c.terrain, x, y),
          slide = Math.abs(vz) >> 1;
        vx = wrap16(vx + Math.trunc((normal[0] * slide) / 256));
        vy = wrap16(vy + Math.trunc((normal[1] * slide) / 256));
        const speed = integerSqrt(
          (Math.imul(vx, vx) + Math.imul(vy, vy) + Math.imul(vz, vz)) >>> 0,
        );
        if (speed) {
          const friction = c.friction[ecologyTerrainClass(c.terrain, [x, y])];
          if (friction === undefined)
            throw Error("Original debris friction table required");
          if (speed <= friction) vx = vy = vz = 0;
          else {
            const factor = Math.trunc(((speed - friction) << 6) / speed);
            vx = wrap16(Math.floor((vx * factor) / 64));
            vy = wrap16(Math.floor((vy * factor) / 64));
            vz = wrap16(Math.floor((vz * factor) / 64));
          }
        }
      }
      vz = wrap16((wrap16(h) - wrap16(groundBefore)) * 8);
      put(n, 45, vx);
      put(n, 47, vy);
      put(n, 49, vz);
      angles(n, c.tables);
      [vx, vy, vz] = vec([word(n, 57), word(n, 59), word(n, 61)], c.tables);
      put32(n, 39, sample(fixed(0, vx), fixed(1, vy)));
    } else {
      put32(n, 39, h);
      const normal = terrainNormal(c.terrain, ...point(n)),
        coefficient = c.bounce[ecologyTerrainClass(c.terrain, point(n))];
      if (coefficient === undefined)
        throw Error("Original debris bounce table required");
      vz = wrap16((Math.abs(vz) * coefficient) >> 8);
      vx = wrap16(vx + Math.trunc((vz * normal[0]) / 256));
      vy = wrap16(vy + Math.trunc((vz * normal[1]) / 256));
      put(n, 45, vx);
      put(n, 47, vy);
      put(n, 49, vz);
      angles(n, c.tables);
    }
    put(n, 45, vx);
    put(n, 47, vy);
    put(n, 49, vz);
  }
  //74270 parity query. Its source6DD50 response applies only to movable debris.
  if (
    (c.frame + (word(n, 15) & 255)) & 1 &&
    ((dword(n, 39) - dword(n, 17)) | 0) > 0
  ) {
    if (!c.obstacle)
      throw Error("Original destruction74270 obstacle target service required");
    const at = point(n),
      obstacle = c.obstacle([...at], dword(n, 39));
    obstacleQueries.push([...at]);
    if (obstacle && (debris || code === 46)) {
      const dx = wrap16((word(n, 7) - obstacle.position[0]) * 2),
        dy = wrap16((word(n, 9) - obstacle.position[1]) * 2),
        xy = integerSqrt(
          (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
        ),
        a: [number, number, number] = [
          originalAngle(dx, dy, c.tables.atan),
          originalAngle(
            xy,
            ((obstacle.ground - dword(n, 39)) | 0) >> 3,
            c.tables.atan,
          ),
          word(n, 61) >> 1,
        ],
        v = vec(a, c.tables);
      for (let i = 0; i < 3; i++)
        put(n, 45 + i * 2, word(n, 45 + i * 2) + v[i]);
      angles(n, c.tables);
    }
  }
  const spawn = (r: DestructionChildRequest) => {
    if (!c.particle) throw Error("Original destruction child factory required");
    if (c.particle(r, rng, n) && r.newborn) out.newborns++;
  };
  if (
    debris &&
    ((c.frame + word(n, 15)) & 3) === 3 &&
    dword(n, 39) >>> 0 <= (c.water + 320) >>> 0 &&
    ecologyTerrainClass(c.terrain, point(n)) <= 1 &&
    word(n, 61) >= 128
  ) {
    const submerged =
      height >>> 0 <= c.water >>> 0 &&
      dword(n, 39) >>> 0 < (c.water - 512) >>> 0;
    spawn({
      code: submerged ? 21 : 48,
      owner: 0,
      position: point(n),
      height: submerged ? dword(n, 39) : Math.max(dword(n, 17), c.water),
      angles: submerged ? [0, 0, 128] : [0, 0, 0],
      parameter: 0,
      delay: 0,
      newborn: false,
    });
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
    p,
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  if (debris || code === 46) {
    if (word(n, 74) < 0) {
      out.retirementRequired = true;
      return out;
    }
  } else if (word(n, 74) < 0 && animationFinished(a, p)) {
    out.retirementRequired = true;
    return out;
  }
  if (code === 46) n[76] = Math.min(12, byte(n, 76) + 1);
  else if (debris) {
    if (byte(n, 70) !== 0) {
      let yaw = (word(n, 57) + 1920 + (nextRandom(rng) % 256)) & 2047,
        pitch = (word(n, 59) + 1920 + (nextRandom(rng) % 256)) & 2047;
      if (pitch >= 1024) pitch = 2048 - pitch;
      spawn({
        code: 6,
        owner: 0,
        position: point(n),
        height: dword(n, 39),
        angles: [yaw, pitch, word(n, 61) >> 2],
        parameter: 0,
        delay: 0,
        newborn: true,
      });
    }
    if (((dword(n, 39) - dword(n, 17)) | 0) <= 0) {
      spawn({
        code: code === 30 ? 3 : 2,
        owner: 0,
        position: point(n),
        height: dword(n, 39),
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: true,
      });
      out.retirementRequired = true;
    }
  }
  return out;
}
