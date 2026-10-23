/** Original Genepod failure particle: selector32/0x20,6DF30 then4B630.
 * Numeric records are staged; the shared scheduler owns relinking/retirement.
 */
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
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
} from "./animation";
import {
  effectPriorByte,
  effectTerrainShade,
  putEffectDword,
  putEffectWord,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";

export interface ProductionEffectContext {
  frame: number;
  gravity: number;
  /** Original11A9C7 physical water height, in the native height units. */
  water: number;
  tables: MotionTables;
  bounce: readonly number[];
  profile: AnimationProfile;
  /** Read-only74270(point,1), required only on its actual source branch. */
  obstacleAt?: (point: [number, number]) => boolean;
}
export type ProductionEffectQuery =
  | { type: "obstacle"; point: [number, number]; mask: 1; found: boolean }
  | {
      type: "water-material";
      point: [number, number];
      material: number;
      response: false | null;
    };
export interface ProductionEffectUpdate {
  native: EffectNativePrior;
  /** Native kind6 stays5; the scheduler must unlink/cleanup/count/clear it. */
  retirementRequired: boolean;
  samples: [number, number][];
  queries: ProductionEffectQuery[];
}
const byte = effectPriorByte;
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

/** Complete numeric callback for the factory's admitted flags/domain. It
 * consumes zero RNG. Descriptor32 byte4=0 makes obstacle response a no-op;
 * byte5=0 makes the water response false (including crossings/submersion).
 * Positive impact virtual34 is1F310 (SETG AL;RET), with no numeric mutation.
 * Unsupported flags are rejected instead of losing sliding/friction/reveal.
 */
export function stepProductionEffectRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: ProductionEffectContext,
): ProductionEffectUpdate {
  return stepCommonEffectRecord(before, terrain, c, 32);
}
/** Source26/0x1A feedback/trail: free-altitude flags20, five hold1 frames,
 * delay1..3, virtual70=false and virtual90=false. No common gravity term. */
export function stepEffect26Record(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: ProductionEffectContext,
): ProductionEffectUpdate {
  return stepCommonEffectRecord(before, terrain, c, 26);
}
function stepCommonEffectRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: ProductionEffectContext,
  code: 26 | 32,
): ProductionEffectUpdate {
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
    throw new Error("Original production effect frame/gravity/water required");
  if (
    c.tables.atan.length !== 257 ||
    c.tables.sine.length !== 2048 ||
    c.tables.cosine.length !== 2048
  )
    throw new Error("Original production effect motion tables required");
  const p = c.profile;
  if (
    p.flags !== 0 ||
    p.holds.length !== (code === 32 ? 10 : 5) ||
    p.holds.some((h) => h !== (code === 32 ? 0 : 1)) ||
    p.last - p.first !== (code === 32 ? 9 : 4)
  )
    throw new Error(
      code === 32
        ? "Original EFF32 ten zero-hold frames required"
        : "Original EFF26 five hold1 frames required",
    );
  const n = before.slice(),
    samples: [number, number][] = [],
    queries: ProductionEffectQuery[] = [];
  if (
    byte(n, 6) !== 5 ||
    byte(n, 69) !== code ||
    (word(n, 21) & ~1) !== (code === 32 ? 0 : 0x20) ||
    word(n, 63) !== -1 ||
    word(n, 51) !== 0 ||
    word(n, 53) !== 0 ||
    (code === 32 && byte(n, 73) !== 0) ||
    byte(n, 28) !== 1 ||
    (code === 32 ? byte(n, 29) !== 0 : ![1, 2, 3].includes(byte(n, 29)))
  )
    throw new Error("Unsupported production effect physics/animation state");
  const x = word(before, 7),
    y = word(before, 9),
    oldGround = dword(before, 17),
    oldHeight = dword(before, 39),
    fractions = [byte(before, 67), byte(before, 68)],
    vx = word(before, 45),
    vy = word(before, 47),
    vz = wrap16(
      word(before, 49) +
        wrap16(word(before, 55) - (code === 32 ? c.gravity : 0)),
    );
  const fixed = (axis: number, speed: number) =>
    (((axis ? y : x) << 16) + (fractions[axis] << 8) + (speed << 10)) | 0;
  const sample = (fx: number, fy: number) => {
    const at: [number, number] = [fx >> 16, fy >> 16];
    samples.push(at);
    putEffectWord(n, 7, at[0]);
    putEffectWord(n, 9, at[1]);
    n[67] = (fx >> 8) & 255;
    n[68] = (fy >> 8) & 255;
    const ground = groundHeight(terrain, ...at);
    putEffectDword(n, 17, ground);
    n[23] = effectTerrainShade(terrain, ...at);
    return ground;
  };
  const orient = (
    horizontalX: number,
    horizontalY: number,
    vertical: number,
  ) => {
    const xy = integerSqrt(
        (Math.imul(horizontalX, horizontalX) +
          Math.imul(horizontalY, horizontalY)) >>>
          0,
      ),
      speed = wrap16(
        integerSqrt((Math.imul(xy, xy) + Math.imul(vertical, vertical)) >>> 0),
      );
    if (xy)
      putEffectWord(
        n,
        57,
        originalAngle(horizontalX, horizontalY, c.tables.atan),
      );
    putEffectWord(
      n,
      59,
      speed ? originalAngle(xy, -vertical, c.tables.atan) : 512,
    );
    putEffectWord(n, 61, speed);
  };
  const quantize = () => {
    const m = createMotion(x, y, 0, 0);
    m.yaw = word(n, 57);
    m.pitch = word(n, 59);
    m.speed = word(n, 61);
    velocity(m, c.tables);
    return [m.vx, m.vy, m.vz];
  };
  const ground = sample(fixed(0, vx), fixed(1, vy)),
    candidateHeight = (oldHeight + (vz >> 3)) | 0;
  let actualX = vx,
    actualY = vy,
    actualZ = vz;
  if (candidateHeight > ground) {
    putEffectDword(n, 39, Math.max(0, candidateHeight));
    orient(actualX, actualY, actualZ);
    // Source signed speed cap is exclusive and belongs only to airborne path.
    if (word(n, 61) > 0x4b00) {
      putEffectWord(n, 61, 0x3200);
      [actualX, actualY, actualZ] = quantize();
    }
  } else if (oldHeight > oldGround) {
    putEffectDword(n, 39, ground);
    const at = point(n),
      normal = terrainNormal(terrain, ...at),
      material = ecologyTerrainClass(terrain, at),
      coefficient = c.bounce[material];
    if (
      !Number.isInteger(coefficient) ||
      coefficient < -32768 ||
      coefficient > 32767
    )
      throw new Error(
        "Original production terrain bounce coefficient required",
      );
    actualZ = wrap16((Math.abs(actualZ) * coefficient) >> 8);
    actualX = wrap16(actualX + Math.trunc((actualZ * normal[0]) / 256));
    actualY = wrap16(actualY + Math.trunc((actualZ * normal[1]) / 256));
    orient(actualX, actualY, actualZ);
  } else {
    actualZ = wrap16(wrap16(wrap16(ground) - wrap16(oldGround)) * 8);
    orient(actualX, actualY, actualZ);
    [actualX, actualY, actualZ] = quantize();
    putEffectDword(n, 39, sample(fixed(0, actualX), fixed(1, actualY)));
  }
  putEffectWord(n, 45, actualX);
  putEffectWord(n, 47, actualY);
  putEffectWord(n, 49, actualZ);
  const at = point(n),
    id = word(n, 15);
  // Source performs queries before the final15-bit coordinate normalization.
  if (
    code === 32 &&
    (c.frame + (id & 255)) & 1 &&
    ((dword(n, 39) - dword(n, 17)) | 0) > 0
  ) {
    if (!c.obstacleAt)
      throw new Error("Production effect source74270 obstacle query required");
    queries.push({
      type: "obstacle",
      point: [...at],
      mask: 1,
      found: c.obstacleAt([...at]),
    });
  }
  if (
    ((c.frame + id) & 3) === 3 &&
    dword(n, 39) >>> 0 <= (c.water + 320) >>> 0
  ) {
    const material = ecologyTerrainClass(terrain, at);
    queries.push({
      type: "water-material",
      point: [...at],
      material,
      response: material <= 1 ? false : null,
    });
  }
  putEffectWord(n, 7, word(n, 7) & 32767);
  putEffectWord(n, 9, word(n, 9) & 32767);
  if (word(n, 74) >= 0) putEffectWord(n, 74, wrap16(word(n, 74) - 1));
  const a = advanceAnimation(
    {
      action: 0,
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: 1,
      delay: code === 32 ? 0 : byte(n, 29),
      counter: (byte(n, 30) << 24) >> 24,
    },
    p,
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  return {
    native: n,
    retirementRequired: word(n, 74) < 0 && animationFinished(a, p),
    samples,
    queries,
  };
}
