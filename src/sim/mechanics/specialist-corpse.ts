/**48790/57FD8 specialist corpse69 and full6DF30/4C8B7 numeric lifetime. */
import type { SpecialistCorpseRequest } from "./specialist-damage";
import type { SpecialistRules } from "./specialist-native";
import type { AnimationProfile } from "./animation";
import {
  createMotion,
  originalAngle,
  terrainNormal,
  velocity,
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
import type { DestructionChildRequest } from "./destruction-effect";

const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  byte(n, p) |
  (byte(n, p + 1) << 8) |
  (byte(n, p + 2) << 16) |
  (byte(n, p + 3) << 24);
const point = (n: readonly (number | null)[]): [number, number] => [
  word(n, 7),
  word(n, 9),
];
export interface SpecialistCorpseBinding {
  assetKey: string;
  sourceName: string;
  resourceKey: number;
  style: number;
  category: number;
  sex: number;
  action: 9;
  frame: number;
  animationOffset: 31;
  resourceOffset: 77;
}
/**49E90 reconstructs both resource/ANB handles from packed76 after loading.
 * We derive their logical binding, keeping both process pointers null. */
export function specialistCorpseBinding(
  native: readonly (number | null)[],
  rules: Pick<SpecialistRules, "actorResourceNames">,
): SpecialistCorpseBinding {
  validateEffectNativePrior(native);
  const packed = byte(native, 76),
    style = (packed >> 1) & 3,
    category = (packed >> 3) & 7,
    resourceKey = style * 4 + category;
  if (
    byte(native, 6) !== 5 ||
    byte(native, 69) !== 69 ||
    (packed & 0xc0) !== 0xc0 ||
    category >= 4 ||
    byte(native, 25) !== 9 ||
    byte(native, 28) !== 0 ||
    native.slice(77, 81).some((v) => v !== null) ||
    rules.actorResourceNames.length !== 16
  )
    throw Error(
      "Original specialist corpse logical resource binding is required",
    );
  const sourceName = rules.actorResourceNames[resourceKey];
  if (
    typeof sourceName !== "string" ||
    !/^data[\\/]spec[\\/][a-z0-9_]+\.anb$/i.test(sourceName)
  )
    throw Error("Original specialist corpse resource name is required");
  return {
    assetKey: sourceName
      .split(/[\\/]/)
      .at(-1)!
      .replace(/\.anb$/i, "")
      .toUpperCase(),
    sourceName,
    resourceKey,
    style,
    category,
    sex: packed & 1,
    action: 9,
    frame: byte(native, 27),
    animationOffset: 31,
    resourceOffset: 77,
  };
}
function profile(p: AnimationProfile) {
  if (
    !p.holds.length ||
    p.holds.length > 255 ||
    p.last - p.first + 1 !== p.holds.length ||
    p.holds.some((v) => !Number.isInteger(v) || v < 0 || v > 255) ||
    !Number.isInteger(p.flags) ||
    p.flags < 0 ||
    p.flags > 255
  )
    throw Error("Original specialist action9 animation profile is required");
}
function vec(a: [number, number, number], tables: MotionTables) {
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = a;
  velocity(m, tables);
  return [m.vx, m.vy, m.vz];
}
function tables(t: MotionTables) {
  if (
    t.atan.length !== 257 ||
    t.sine.length !== 2048 ||
    t.cosine.length !== 2048
  )
    throw Error("Original specialist corpse motion tables required");
}
/** Successful common48790 factory followed by the caller's5805A..5809F
 * writes. No RNG or EFF69 lookup; native resource77..80 is a logical gap. */
export function makeSpecialistCorpseEffect(
  prior: readonly (number | null)[],
  request: SpecialistCorpseRequest & { slot: number },
  terrain: TerrainState,
  motionTables: MotionTables,
  animation: AnimationProfile,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  profile(animation);
  tables(motionTables);
  if (
    prior[6] !== 0 ||
    request.code !== 69 ||
    !Number.isInteger(request.slot) ||
    request.slot < 0 ||
    request.slot >= 200 ||
    !Number.isInteger(request.owner) ||
    request.owner < 0 ||
    request.owner > 3 ||
    request.position.length !== 2 ||
    request.position.some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    !Number.isInteger(request.height) ||
    request.height < -2147483648 ||
    request.height > 2147483647 ||
    request.angles.length !== 3 ||
    request.angles.some(
      (v, i) =>
        !Number.isInteger(v) ||
        v < (i === 2 ? -32768 : 0) ||
        v > (i === 2 ? 32767 : 2048),
    ) ||
    request.parameter !== 0 ||
    request.delay !== 0 ||
    request.parent !== null ||
    request.newborn !== false ||
    !Number.isInteger(request.packed76) ||
    request.packed76 < 0 ||
    request.packed76 > 255 ||
    (request.packed76 & 0xc0) !== 0xc0 ||
    ((request.packed76 >> 3) & 7) >= 4 ||
    request.action !== 9 ||
    request.frame !== animation.holds.length - 1
  )
    throw Error("Original specialist corpse factory request is invalid");
  const [vx, vy, vz] = vec(request.angles, motionTables),
    n = effectFactoryPrior(prior, {
      slot: request.slot,
      code: 69,
      owner: request.owner,
      x: request.position[0],
      y: request.position[1],
      ground: groundHeight(terrain, ...request.position),
      height: request.height,
      shade: effectTerrainShade(terrain, ...request.position),
      vx,
      vy,
      vz,
      accelerationZ: 0,
      yaw: request.angles[0],
      pitch: request.angles[1],
      speed: request.angles[2],
      delay: 0,
    });
  put(n, 21, 0);
  put(n, 63, 0);
  put(n, 74, 1000);
  n[25] = 9;
  n[27] = request.frame;
  n[28] = 0;
  n[76] = request.packed76;
  n.fill(null, 77, 81);
  return n;
}
export interface SpecialistCorpseContext {
  frame: number;
  gravity: number;
  water: number;
  tables: MotionTables;
  bounce: readonly number[];
  profile: AnimationProfile;
  obstacle?(
    position: [number, number],
    height: number,
  ): { position: [number, number]; ground: number } | null;
  /** Real unmarked21/48 factory, with current parent published before cleanup.
   * Copy the canonical carrier back into parentNative before returning. */
  child(
    request: DestructionChildRequest,
    parentNative: EffectNativePrior,
  ): boolean;
}
export interface SpecialistCorpseStep {
  native: EffectNativePrior;
  retirementRequired: boolean;
  samples: [number, number][];
  obstacleQueries: [number, number][];
  factories: { request: DestructionChildRequest; created: boolean }[];
}
/** Full source common physics for factory flags0/desired0, then mode5's
 * frozen animation and own timer decrement. Child factories are unmarked. */
export function stepSpecialistCorpseEffect(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: SpecialistCorpseContext,
): SpecialistCorpseStep {
  validateEffectNativePrior(before);
  profile(c.profile);
  tables(c.tables);
  if (
    !Number.isInteger(c.frame) ||
    c.frame < 0 ||
    c.frame > 0xffffffff ||
    !Number.isInteger(c.gravity) ||
    c.gravity < -32768 ||
    c.gravity > 32767 ||
    !Number.isInteger(c.water) ||
    c.water < 0 ||
    c.water > 0xffffffff ||
    byte(before, 6) !== 5 ||
    byte(before, 69) !== 69 ||
    (word(before, 21) & ~1) !== 0 ||
    word(before, 63) !== 0 ||
    [51, 53, 55].some((p) => word(before, p) !== 0) ||
    byte(before, 25) !== 9 ||
    byte(before, 28) !== 0 ||
    byte(before, 27) >= c.profile.holds.length ||
    before.slice(77, 81).some((v) => v !== null)
  )
    throw Error("Unsupported original specialist corpse numeric state");
  const n = before.slice(),
    out: SpecialistCorpseStep = {
      native: n,
      retirementRequired: false,
      samples: [],
      obstacleQueries: [],
      factories: [],
    },
    x = word(n, 7),
    y = word(n, 9),
    oldHeight = dword(n, 39),
    oldGround = dword(n, 17),
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
      const ground = groundHeight(terrain, ...at);
      put32(n, 17, ground);
      n[23] = effectTerrainShade(terrain, ...at);
      return ground;
    },
    orient = () => {
      const vx = word(n, 45),
        vy = word(n, 47),
        vz = word(n, 49),
        xy = integerSqrt((Math.imul(vx, vx) + Math.imul(vy, vy)) >>> 0),
        speed = wrap16(
          integerSqrt((Math.imul(xy, xy) + Math.imul(vz, vz)) >>> 0),
        );
      if (xy) put(n, 57, originalAngle(vx, vy, c.tables.atan));
      put(n, 59, speed ? originalAngle(xy, -vz, c.tables.atan) : 512);
      put(n, 61, speed);
    };
  let vx = word(n, 45),
    vy = word(n, 47),
    vz = wrap16(word(n, 49) - c.gravity);
  const candidateHeight = (oldHeight + (vz >> 3)) | 0,
    ground = sample(fixed(0, vx), fixed(1, vy));
  if (candidateHeight > ground) {
    put32(n, 39, Math.max(0, candidateHeight));
    put(n, 49, vz);
    orient();
    if (word(n, 61) > 19200) {
      put(n, 61, 12800);
      [vx, vy, vz] = vec([word(n, 57), word(n, 59), word(n, 61)], c.tables);
    }
  } else if (oldHeight <= oldGround) {
    put32(n, 39, ground);
    vz = wrap16((wrap16(ground) - wrap16(oldGround)) * 8);
    put(n, 45, vx);
    put(n, 47, vy);
    put(n, 49, vz);
    orient();
    //6DB00 with target desired63=0, retained signed contact65 and width43.
    const contact = word(n, 65),
      width = word(n, 43) & 65535,
      next =
        Math.abs(contact) <= width
          ? 0
          : contact > 0
            ? wrap16(contact - width)
            : wrap16(contact + width);
    put(n, 65, next);
    put(n, 61, next);
    [vx, vy, vz] = vec([word(n, 57), word(n, 59), word(n, 61)], c.tables);
    put32(n, 39, sample(fixed(0, vx), fixed(1, vy)));
  } else {
    put32(n, 39, ground);
    const normal = terrainNormal(terrain, ...point(n)),
      coefficient = c.bounce[ecologyTerrainClass(terrain, point(n))];
    if (
      !Number.isInteger(coefficient) ||
      coefficient < -32768 ||
      coefficient > 32767
    )
      throw Error("Original specialist corpse bounce table required");
    vz = wrap16((Math.abs(vz) * coefficient) >> 8);
    vx = wrap16(vx + Math.trunc((vz * normal[0]) / 256));
    vy = wrap16(vy + Math.trunc((vz * normal[1]) / 256));
    put(n, 45, vx);
    put(n, 47, vy);
    put(n, 49, vz);
    orient();
  }
  put(n, 45, vx);
  put(n, 47, vy);
  put(n, 49, vz);
  if (
    (c.frame + (word(n, 15) & 255)) & 1 &&
    ((dword(n, 39) - dword(n, 17)) | 0) > 0
  ) {
    if (!c.obstacle)
      throw Error("Original specialist corpse74270 obstacle service required");
    const at = point(n),
      obstacle = c.obstacle([...at], dword(n, 39));
    out.obstacleQueries.push([...at]);
    if (obstacle) {
      const dx = wrap16((word(n, 7) - obstacle.position[0]) * 2),
        dy = wrap16((word(n, 9) - obstacle.position[1]) * 2),
        xy = integerSqrt(
          (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
        ),
        impulse = vec(
          [
            originalAngle(dx, dy, c.tables.atan),
            originalAngle(
              xy,
              ((obstacle.ground - dword(n, 39)) | 0) >> 3,
              c.tables.atan,
            ),
            word(n, 61) >> 1,
          ],
          c.tables,
        );
      for (let i = 0; i < 3; i++)
        put(n, 45 + i * 2, word(n, 45 + i * 2) + impulse[i]);
      orient();
    }
  }
  if (
    ((c.frame + word(n, 15)) & 3) === 3 &&
    dword(n, 39) >>> 0 <= (c.water + 320) >>> 0 &&
    ecologyTerrainClass(terrain, point(n)) <= 1 &&
    word(n, 61) >= 128
  ) {
    const submerged =
        oldHeight >>> 0 <= c.water >>> 0 &&
        dword(n, 39) >>> 0 < (c.water - 512) >>> 0,
      request: DestructionChildRequest = {
        code: submerged ? 21 : 48,
        owner: 0,
        position: point(n),
        height: submerged ? dword(n, 39) : Math.max(dword(n, 17), c.water),
        angles: submerged ? [0, 0, 128] : [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: false,
      };
    if (!c.child)
      throw Error("Original specialist corpse water factory required");
    out.factories.push({ request, created: c.child(request, n) });
  }
  put(n, 7, word(n, 7) & 32767);
  put(n, 9, word(n, 9) & 32767);
  const timer = wrap16(word(n, 74) - 1);
  put(n, 74, timer);
  out.retirementRequired = timer === 0;
  return out;
}
