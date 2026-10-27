/**48790 code7 factory and complete common callback used by56090. */
import type { AnimationProfile } from "./animation";
import type { BotanistEffect, BotanistEconomyParticle } from "./botanist";
import { createMotion, velocity, type MotionTables } from "./motion";
import { nextRandom, type GeneRng } from "./random";
import { groundHeight, type TerrainState } from "./terrain";
import {
  effectFactoryPrior,
  effectTerrainShade,
  putEffectWord,
  type EffectNativePrior,
} from "./power-motion";
import {
  stepEffect7Record,
  stepEconomyEffectRecord,
  validateEconomyEffectProfile,
  type ProductionEffectContext,
  type ProductionEffectUpdate,
} from "./production-effect";
function profile(p: AnimationProfile) {
  if (
    p.flags !== 0 ||
    p.holds.length !== 6 ||
    p.last - p.first !== 5 ||
    p.holds.some((h) => h !== 0)
  )
    throw Error("Original EFF7 six zero-hold frames required");
}
/** After actual shared allocation/retirement. No factory own draw or child
 * writes; source counter30/fractions67/68/ref71/73/payload76 survive. */
export function makeBotanistWorkEffect(
  prior: readonly (number | null)[],
  request: BotanistEffect & { slot: number },
  terrain: TerrainState,
  p: AnimationProfile,
): EffectNativePrior {
  profile(p);
  if (
    prior[6] !== 0 ||
    !Number.isInteger(request.slot) ||
    request.slot < 0 ||
    request.slot >= 200 ||
    request.code !== 7 ||
    request.owner !== 0 ||
    request.parameter !== 0 ||
    request.delay !== 0 ||
    request.newborn !== false ||
    request.angles.length !== 3 ||
    request.angles.some((x) => x !== 0) ||
    request.position.length !== 2 ||
    request.position.some(
      (x) => !Number.isInteger(x) || x < -32768 || x > 32767,
    ) ||
    !Number.isInteger(request.height) ||
    request.height < -2147483648 ||
    request.height > 2147483647
  )
    throw Error("Original Botanist work effect factory request required");
  return effectFactoryPrior(prior, {
    slot: request.slot,
    owner: 0,
    code: 7,
    x: request.position[0],
    y: request.position[1],
    ground: groundHeight(terrain, ...request.position),
    height: request.height,
    shade: effectTerrainShade(terrain, ...request.position),
    vx: 0,
    vy: 0,
    vz: 0,
    accelerationZ: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
    delay: 0,
  });
}
export function stepBotanistWorkEffectRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: ProductionEffectContext,
): ProductionEffectUpdate {
  profile(c.profile);
  return stepEffect7Record(before, terrain, c);
}
/** Source49129 for both60 and61. Called only after real shared allocation;
 * its one delay draw follows common numeric construction/spatial insertion. */
export function makeBotanistEconomyEffect(
  prior: readonly (number | null)[],
  q: BotanistEconomyParticle & { slot: number },
  terrain: TerrainState,
  gravity: number,
  rng: GeneRng,
  tables: MotionTables,
  p: AnimationProfile,
): EffectNativePrior {
  validateEconomyEffectProfile(p, q.code);
  if (
    prior[6] !== 0 ||
    !Number.isInteger(q.slot) ||
    q.slot < 0 ||
    q.slot >= 200 ||
    ![60, 61].includes(q.code) ||
    !Number.isInteger(q.owner) ||
    q.owner < 0 ||
    q.owner > 4 ||
    !Number.isInteger(gravity) ||
    gravity < -32768 ||
    gravity > 32767 ||
    q.parameter !== 0 ||
    q.delay !== 0 ||
    q.newborn !== false ||
    q.position.length !== 2 ||
    q.position.some((x) => !Number.isInteger(x) || x < -32768 || x > 32767) ||
    !Number.isInteger(q.height) ||
    q.height < -2147483648 ||
    q.height > 2147483647 ||
    q.angles.length !== 3 ||
    q.angles.some((x) => !Number.isInteger(x) || x < -32768 || x > 32767)
  )
    throw Error("Original economy effect factory request required");
  const m = createMotion(...q.position, 0, 0);
  [m.yaw, m.pitch, m.speed] = q.angles;
  velocity(m, tables);
  const n = effectFactoryPrior(prior, {
    slot: q.slot,
    owner: q.owner,
    code: q.code,
    x: q.position[0],
    y: q.position[1],
    height: q.height,
    ground: groundHeight(terrain, ...q.position),
    shade: effectTerrainShade(terrain, ...q.position),
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    accelerationZ: 0,
    yaw: q.angles[0],
    pitch: q.angles[1],
    speed: q.angles[2],
    delay: 0,
  });
  putEffectWord(n, 55, -(gravity >> 6));
  n[29] = 1 + (nextRandom(rng) % 3);
  return n;
}
export function stepBotanistEconomyEffectRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  c: ProductionEffectContext,
  code: 60 | 61,
): ProductionEffectUpdate {
  return stepEconomyEffectRecord(before, terrain, c, code);
}
