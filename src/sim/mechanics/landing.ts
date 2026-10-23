import { nextRandom, type GeneRng } from "./random";
import {
  groundHeight,
  worldCell,
  integerSqrt,
  type TerrainState,
} from "./terrain";
import {
  originalAngle,
  terrainNormal,
  velocity,
  createMotion,
  type MotionTables,
} from "./motion";
import {
  animationState,
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
  type AnimationState,
} from "./animation";
import {
  effectFactoryPrior,
  effectPriorByte,
  effectTerrainShade,
  putEffectWord,
  putEffectDword,
  retireEffectPrior,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
export interface LandingParticle {
  native?: EffectNativePrior;
  slot: number;
  code: 6 | 47 | 26;
  x: number;
  y: number;
  fractionX: number;
  fractionY: number;
  height: number;
  ground: number;
  vx: number;
  vy: number;
  vz: number;
  accelerationZ: number;
  animation: AnimationState;
}
export interface LandingState {
  native?: EffectNativePrior;
  slot: number;
  owner: number;
  point: [number, number];
  height: number;
  phase: 0 | 1 | 2 | 3 | 4;
  timer: number;
  vz: number;
  accelerationZ: number;
  particles: LandingParticle[];
  messageIndex: number | null;
  activationFrame: number | null;
}
export interface LandingContext {
  terrain: TerrainState;
  tables: MotionTables;
  bounce: readonly number[];
  water: number;
  gravity: number;
  frame: number;
  /** Actual74270(mask1), with postphysics physical height. Required lazily
   * on the source odd-slot airborne cadence. Code49's4AF40 response reads
   * movable descriptor0, so a non-null target does not change its motion. */
  obstacle?: (
    position: [number, number],
    height: number,
  ) => { position: [number, number]; ground: number } | null;
  profile(code: 6 | 47 | 26): AnimationProfile;
  plantBlockerWeight(cell: number): number;
  occupiedEffectSlots: readonly number[];
  slotPriors: readonly {
    fractionX: number | null;
    fractionY: number | null;
    nativePrior?: EffectNativePrior;
  }[];
}
export type LandingEvent =
  | { type: "activate"; owner: number }
  | { type: "message"; index: number }
  | { type: "retired"; owner: number }
  | { type: "audio"; channel: number };
export function createLanding(
  owner: number,
  point: [number, number],
  terrain: TerrainState,
  slot = 0,
  prior?: readonly (number | null)[],
): LandingState {
  const s: LandingState = {
    slot,
    owner,
    point: [...point],
    height: groundHeight(terrain, ...point) + 25600,
    phase: 0,
    timer: -1,
    vz: -1088,
    accelerationZ: 0,
    particles: [],
    messageIndex: null,
    activationFrame: null,
  };
  if (prior) s.native = landingFactoryPrior(s, terrain, prior);
  return s;
}
function landingFactoryPrior(
  s: LandingState,
  terrain: TerrainState,
  prior: readonly (number | null)[],
): EffectNativePrior {
  const ground = groundHeight(terrain, ...s.point),
    n = effectFactoryPrior(prior, {
      slot: s.slot,
      code: 0x31,
      owner: s.owner,
      x: s.point[0],
      y: s.point[1],
      ground,
      height: s.height,
      shade: effectTerrainShade(terrain, ...s.point),
      vx: 0,
      vy: 0,
      vz: -1088,
      accelerationZ: 0,
      yaw: 0,
      pitch: 1024,
      speed: 1088,
      delay: 0,
    });
  n[73] = n[76] = 0;
  return n;
}
/** The normalized host retains vertical landing motion. Preserve source
 * orientation left by physics even when contact's selector clears velocity. */
function syncLandingNative(
  s: LandingState,
  c: LandingContext,
  oldPhase: number,
): void {
  const n = s.native;
  if (!n) return;
  validateEffectNativePrior(n);
  const ground = groundHeight(c.terrain, ...s.point);
  n[6] = 5;
  if (n[21] !== null) n[21] &= 0xfe;
  putEffectWord(n, 7, s.point[0]);
  putEffectWord(n, 9, s.point[1]);
  putEffectDword(n, 17, ground);
  n[23] = effectTerrainShade(c.terrain, ...s.point);
  putEffectDword(n, 39, s.height);
  putEffectWord(n, 45, 0);
  putEffectWord(n, 47, 0);
  putEffectWord(n, 49, s.vz);
  putEffectWord(n, 55, s.accelerationZ);
  n[26] = n[27] = n[29] = n[30] = 0;
  n[28] = 1;
  n[70] = s.phase === 4 ? 3 : s.phase;
  putEffectWord(n, 74, s.timer);
  if (oldPhase === 0 && s.phase === 1) {
    const normal = terrainNormal(c.terrain, ...s.point),
      material = c.terrain.bytes[worldCell(...s.point) * 14 + 5] & 7,
      vz = (((1088 * c.bounce[material]) >> 8) << 16) >> 16,
      vx = (Math.trunc((vz * normal[0]) / 256) << 16) >> 16,
      vy = (Math.trunc((vz * normal[1]) / 256) << 16) >> 16;
    const xy = integerSqrt((Math.imul(vx, vx) + Math.imul(vy, vy)) >>> 0),
      speed = integerSqrt((Math.imul(xy, xy) + Math.imul(vz, vz)) >>> 0);
    if (xy) putEffectWord(n, 57, originalAngle(vx, vy, c.tables.atan));
    putEffectWord(n, 59, speed ? originalAngle(xy, -vz, c.tables.atan) : 512);
    putEffectWord(n, 61, speed);
  } else if (oldPhase === 1) {
    putEffectWord(n, 59, 512);
    putEffectWord(n, 61, 0);
  } else if (oldPhase >= 2) {
    putEffectWord(n, 59, s.vz ? originalAngle(0, -s.vz, c.tables.atan) : 512);
    putEffectWord(n, 61, Math.abs(s.vz));
  }
  if (s.phase === 4) s.native = retireEffectPrior(n, s.slot);
}
/** Known particle fields are written independently of untouched73/76, which
 * can contain a preceding power destination and decayed energy payload. */
export function synchronizeLandingParticleNative(
  p: LandingParticle,
  terrain: TerrainState,
  updateAngles = true,
  tables?: MotionTables,
): void {
  const n = p.native;
  if (!n) return;
  validateEffectNativePrior(n);
  putEffectWord(n, 7, p.x);
  putEffectWord(n, 9, p.y);
  putEffectDword(n, 17, p.ground);
  n[23] = effectTerrainShade(terrain, p.x, p.y);
  putEffectDword(n, 39, p.height);
  putEffectWord(n, 45, p.vx);
  putEffectWord(n, 47, p.vy);
  putEffectWord(n, 49, p.vz);
  putEffectWord(n, 55, p.accelerationZ);
  n[25] = 0;
  n[26] = p.animation.hold;
  n[27] = p.animation.frame;
  n[28] = p.animation.direction & 255;
  n[29] = p.animation.delay & 255;
  n[30] = p.animation.counter & 255;
  n[67] = p.fractionX;
  n[68] = p.fractionY;
  if (updateAngles && tables) {
    const xy = integerSqrt(
        (Math.imul(p.vx, p.vx) + Math.imul(p.vy, p.vy)) >>> 0,
      ),
      speed = integerSqrt((Math.imul(xy, xy) + Math.imul(p.vz, p.vz)) >>> 0);
    if (xy) putEffectWord(n, 57, originalAngle(p.vx, p.vy, tables.atan));
    putEffectWord(n, 59, speed ? originalAngle(xy, -p.vz, tables.atan) : 512);
    putEffectWord(n, 61, speed);
  }
}
export interface SourceParticleInput {
  code: 6 | 47 | 26;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  newborn: boolean;
}
/** Source48790 code6/2F/1A common factory; no draw when capacity fails.
 * Family8 particles are unmarked because13780 precedes4E950. */
export function createSourceParticle(
  input: SourceParticleInput,
  rng: GeneRng,
  c: LandingContext,
): LandingParticle | null {
  const profile = c.profile(input.code);
  if (
    input.code === 26 &&
    (profile.flags !== 0 ||
      profile.holds.length !== 5 ||
      profile.holds.some((h) => h !== 1))
  )
    throw new Error("Original EFF26 five hold1 frames are required");
  const used = new Set(c.occupiedEffectSlots);
  let slot = 0;
  while (used.has(slot) && slot < 200) slot++;
  if (slot === 200) {
    if (input.code === 26) {
      for (const prior of c.slotPriors) {
        const code = prior.nativePrior?.[69];
        if (
          code === null ||
          code === undefined ||
          ![6, 21, 22, 26, 33, 47, 48, 49].includes(code)
        )
          throw new Error(
            "Full-pool Ethereal particle replacement priority is unknown",
          );
      }
      return null;
    }
    return null;
  }
  const prior = c.slotPriors[slot];
  if (!prior || prior.fractionX === null || prior.fractionY === null)
    throw new Error("Particle source fraction prior is unknown");
  if (prior.nativePrior) validateEffectNativePrior(prior.nativePrior);
  if (input.code === 26 && !prior.nativePrior)
    throw new Error("Ethereal particle native prior is required");
  const counter = prior.nativePrior
      ? (effectPriorByte(prior.nativePrior, 30) << 24) >> 24
      : 0,
    m = createMotion(
      ...input.position,
      groundHeight(c.terrain, ...input.position),
      0,
    );
  m.yaw = input.angles[0];
  m.pitch = input.angles[1];
  m.speed = input.angles[2];
  velocity(m, c.tables);
  const particle: LandingParticle = {
    slot,
    code: input.code,
    x: input.position[0],
    y: input.position[1],
    fractionX: prior.fractionX,
    fractionY: prior.fractionY,
    height: input.height,
    ground: m.ground,
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    accelerationZ: -(c.gravity >> 6),
    animation: {
      ...animationState(input.code, 1 + (nextRandom(rng) % 3)),
      counter,
    },
  };
  if (prior.nativePrior) {
    particle.native = effectFactoryPrior(prior.nativePrior, {
      slot,
      code: input.code,
      owner: input.owner,
      x: particle.x,
      y: particle.y,
      ground: particle.ground,
      height: particle.height,
      shade: effectTerrainShade(c.terrain, particle.x, particle.y),
      vx: particle.vx,
      vy: particle.vy,
      vz: particle.vz,
      accelerationZ: particle.accelerationZ,
      yaw: input.angles[0],
      pitch: input.angles[1],
      speed: input.angles[2],
      delay: particle.animation.delay,
    });
    particle.native[67] = particle.fractionX;
    particle.native[68] = particle.fractionY;
    if (input.newborn)
      particle.native[21] = effectPriorByte(particle.native, 21) | 1;
  }
  return particle;
}
function createParticle(
  s: LandingState,
  code: 6 | 47,
  angles: [number, number, number],
  rng: GeneRng,
  c: LandingContext,
): void {
  const particle = createSourceParticle(
    {
      code,
      owner: code === 47 ? s.owner : 0,
      position: s.point,
      height: s.height,
      angles,
      newborn: true,
    },
    rng,
    {
      ...c,
      occupiedEffectSlots: [
        ...c.occupiedEffectSlots,
        s.slot,
        ...s.particles.map((p) => p.slot),
      ],
    },
  );
  if (!particle)
    throw new Error("Landing effect pool replacement is not implemented");
  s.particles.push(particle);
}
export function stepLandingParticle(
  p: LandingParticle,
  c: LandingContext,
): boolean {
  if (p.native) p.native[21] = effectPriorByte(p.native, 21) & 0xfe;
  const fx = ((p.x << 16) + (p.fractionX << 8) + (p.vx << 10)) | 0,
    fy = ((p.y << 16) + (p.fractionY << 8) + (p.vy << 10)) | 0;
  const nx = (fx >> 16) & 32767,
    ny = (fy >> 16) & 32767,
    g = groundHeight(c.terrain, nx, ny);
  let vz = ((p.vz + p.accelerationZ) << 16) >> 16;
  const h = Math.max(0, p.height + (vz >> 3));
  if (h <= g) {
    const normal = terrainNormal(c.terrain, nx, ny),
      material = c.terrain.bytes[worldCell(nx, ny) * 14 + 5] & 7;
    vz = (((Math.abs(vz) * c.bounce[material]) >> 8) << 16) >> 16;
    p.vx = ((p.vx + Math.trunc((vz * normal[0]) / 256)) << 16) >> 16;
    p.vy = ((p.vy + Math.trunc((vz * normal[1]) / 256)) << 16) >> 16;
  }
  p.x = nx;
  p.y = ny;
  p.fractionX = (fx >> 8) & 255;
  p.fractionY = (fy >> 8) & 255;
  p.ground = g;
  p.height = Math.max(g, h);
  p.vz = vz;
  const profile = c.profile(p.code);
  p.animation = advanceAnimation(p.animation, profile);
  synchronizeLandingParticleNative(p, c.terrain, true, c.tables);
  if (animationFinished(p.animation, profile)) {
    if (p.native) p.native = retireEffectPrior(p.native, p.slot);
    return false;
  }
  if (p.code === 6) {
    p.vx = (15 * p.vx) >> 4;
    p.vy = (15 * p.vy) >> 4;
    p.vz = (15 * p.vz) >> 4;
  }
  synchronizeLandingParticleNative(p, c.terrain, false);
  return true;
}
/** Source31 descent/contact/timers and ordered shared RNG consumption. Native
 * journal ring is not needed for gameplay; unknown ring remains null. */
export function stepLandingMain(
  s: LandingState,
  rng: GeneRng,
  c: LandingContext,
): LandingEvent[] {
  if (!s.native && s.phase === 0 && c.slotPriors[s.slot]?.nativePrior)
    s.native = landingFactoryPrior(
      s,
      c.terrain,
      c.slotPriors[s.slot].nativePrior!,
    );
  const oldPhase = s.phase;
  if (s.phase === 4) {
    return [];
  }
  const events: LandingEvent[] = [],
    g = groundHeight(c.terrain, ...s.point);
  if (g <= c.water + 320)
    throw new Error(
      "Landing water contact requires its environmental callback",
    );
  const queryBuilding = () => {
    //6DF30 invokes virtual4=1F260 and70=4B090 before74270. For code49
    //these mean positive physical-ground and true, on odd(frame+lowID).
    if (!((c.frame + (s.slot & 255)) & 1) || ((s.height - g) | 0) <= 0) return;
    if (!c.obstacle)
      throw new Error("Original landing74270 obstacle target service required");
    c.obstacle([...s.point], s.height);
    //4AF40's code49 path tests1E620. Its actual six-byte descriptor has
    //movable=0, so a returned building causes no6DD50 impulse or factory.
  };
  if (s.phase === 0) {
    s.height = Math.max(g, s.height - 136);
    queryBuilding();
    if (s.height <= g) {
      s.height = g;
      s.vz = 0;
      s.phase = 1;
      s.timer = 150;
      s.activationFrame = c.frame;
      events.push(
        { type: "activate", owner: s.owner },
        { type: "audio", channel: 0x51 },
      );
    } else {
      const speed = 2560 + 64 * (nextRandom(rng) % 10),
        pitch = 1024 - (nextRandom(rng) % 128),
        yaw = nextRandom(rng) * 8;
      createParticle(s, 6, [yaw, pitch, speed], rng, c);
    }
  } else {
    if (s.phase >= 2) {
      s.vz += s.accelerationZ;
      s.height += s.vz >> 3;
    }
    queryBuilding();
    s.timer--;
    if (s.phase === 1 && s.timer === 0) {
      s.timer = 30;
      s.phase = 2;
      s.vz = 512;
    } else if (s.phase === 2 && s.timer === 0) {
      s.timer = 20;
      s.phase = 3;
      s.accelerationZ = 640;
      events.push({ type: "audio", channel: 0x52 });
    } else if (s.phase === 3 && s.timer === 0) {
      s.phase = 4;
      events.push({ type: "retired", owner: s.owner });
    } else if (s.phase === 3) {
      const xy = integerSqrt(Math.imul(0, 0) >>> 0),
        pitch = originalAngle(xy, -s.vz, c.tables.atan),
        speed = integerSqrt(Math.imul(s.vz, s.vz) >>> 0) >> 2;
      const yaw = (1920 + nextRandom(rng)) & 2047,
        pp = (pitch + 1920 + nextRandom(rng)) & 2047;
      createParticle(s, 47, [yaw, pp, speed], rng, c);
    } else if (s.timer < 50) {
      if (s.phase === 1 && s.timer === 49) {
        s.messageIndex = 79 + (nextRandom(rng) % 8);
        events.push({ type: "message", index: s.messageIndex });
      }
      const speed =
          (40 + (nextRandom(rng) % 10)) * 64 + (s.phase === 2 ? 1280 : 0),
        pitch = 1024 - (nextRandom(rng) % 128),
        yaw = nextRandom(rng) * 8;
      createParticle(s, 6, [yaw, pitch, speed], rng, c);
    }
  }
  syncLandingNative(s, c, oldPhase);
  return events;
}
/** Historical composed view. Source-order campaign hosts use the main and
 * single-particle exports through the shared200-slot scheduler instead. */
export function stepLanding(
  s: LandingState,
  rng: GeneRng,
  c: LandingContext,
): LandingEvent[] {
  const events = stepLandingMain(s, rng, c);
  s.particles = s.particles
    .sort((a, b) => a.slot - b.slot)
    .filter((p) => stepLandingParticle(p, c));
  return events;
}
/**80AE0's one-draw candidate. Associated landing path places at the center,
 * then issues the same sampled move destination; no random teleport. */
export function activationDestination(
  point: [number, number],
  rng: GeneRng,
  c: LandingContext,
): [number, number] {
  for (let i = 0; i < 16384; i++) {
    const angle = (nextRandom(rng) * 8 - 512) & 2047;
    const dx = (1024 * c.tables.cosine[angle]) >> 16,
      dy = (1024 * c.tables.sine[angle]) >> 16;
    const x = ((((point[0] * 2 + dx) << 16) >> 16) >> 1) & 32767,
      y = ((((point[1] * 2 + dy) << 16) >> 16) >> 1) & 32767,
      cell = worldCell(x, y);
    if (
      (c.terrain.bytes[cell * 14 + 5] & 7) !== 0 &&
      c.plantBlockerWeight(cell) < 10
    )
      return [x, y];
  }
  throw new Error("Specialist activation target search exhausted");
}
