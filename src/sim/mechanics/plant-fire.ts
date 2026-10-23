/**6C6B0 ignition and48790/4B630 effect8. Native31..38 are logical gaps. */
import type { SourceEntityId } from "../campaign/source-pools";
import { groundHeight, type TerrainState } from "./terrain";
import type { AnimationProfile } from "./animation";
import {
  effectFactoryPrior,
  effectPriorByte as byte,
  effectTerrainShade,
  putEffectWord,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import {
  stepEffect8Record,
  type ProductionEffectContext,
  type ProductionEffectUpdate,
} from "./production-effect";

const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
export interface PlantFireRequest {
  code: 8;
  owner: 0;
  position: [number, number];
  height: number;
  angles: [0, 0, 0];
  parameter: 0;
  delay: 0;
  newborn: false;
}
export interface PlantIgnitionAudio {
  type: "audio";
  entity: SourceEntityId;
  channel: 15;
  mode: 2;
  parameter: 0;
  volume: 127;
  ratePercent: 100;
}
export interface PlantIgnition {
  native: (number | null)[];
  effect: PlantFireRequest;
  audio: PlantIgnitionAudio;
}
/** Pure plan; caller applies the plant first, attempts its actual unmarked
 * effect factory next, then requests audio even when shared capacity fails. */
export function ignitePlantRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  retirementDelay: number,
): PlantIgnition {
  if (
    before.length !== 49 ||
    before.some((value, p) =>
      p >= 31 && p < 39
        ? value !== null
        : value !== null &&
          (!Number.isInteger(value) || value < 0 || value > 255),
    ) ||
    byte(before, 6) !== 2 ||
    word(before, 15) < 0 ||
    word(before, 15) >= 512 ||
    !Number.isInteger(retirementDelay) ||
    retirementDelay < 0 ||
    retirementDelay > 255
  )
    throw Error("Original plant ignition native/prior rule is required");
  const n = before.slice(),
    growth = word(n, 44),
    position: [number, number] = [word(n, 7), word(n, 9)];
  n[46] = (byte(n, 46) & 0x71) | 0x88;
  n[21] = byte(n, 21) | 4;
  n[25] = (byte(n, 25) % 3) + 3;
  n[48] =
    (retirementDelay + Math.trunc((growth * retirementDelay * 3) / 32)) & 255;
  putEffectWord(n, 44, 0);
  return {
    native: n,
    effect: {
      code: 8,
      owner: 0,
      position,
      height: groundHeight(terrain, ...position),
      angles: [0, 0, 0],
      parameter: 0,
      delay: 0,
      newborn: false,
    },
    audio: {
      type: "audio",
      entity: `source:1:${word(n, 15)}`,
      channel: 15,
      mode: 2,
      parameter: 0,
      volume: 127,
      ratePercent: 100,
    },
  };
}
function validateProfile(profile: AnimationProfile) {
  if (
    profile.flags !== 0 ||
    profile.holds.length !== 13 ||
    profile.last - profile.first !== 12 ||
    profile.holds.some((hold) => hold !== 0)
  )
    throw Error("Original EFF8 thirteen zero-hold frames required");
}
/** Factory after real source allocation. All concrete post-common writes are
 * absent for8; retained counter/fractions/reference/payload stay unchanged. */
export function makePlantFireEffect(
  prior: readonly (number | null)[],
  input: { slot: number; position: [number, number]; height: number },
  terrain: TerrainState,
  profile: AnimationProfile,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  validateProfile(profile);
  if (
    prior[6] !== 0 ||
    !Number.isInteger(input.slot) ||
    input.slot < 0 ||
    input.slot >= 200 ||
    !Array.isArray(input.position) ||
    input.position.length !== 2 ||
    input.position.some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    !Number.isInteger(input.height) ||
    input.height < -2147483648 ||
    input.height > 2147483647
  )
    throw Error("Original plant fire factory input is invalid");
  return effectFactoryPrior(prior, {
    slot: input.slot,
    owner: 0,
    code: 8,
    x: input.position[0],
    y: input.position[1],
    ground: groundHeight(terrain, ...input.position),
    height: input.height,
    shade: effectTerrainShade(terrain, ...input.position),
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
/** Full common6DF30,7AC00,mode0 completion. There is no selector8 own
 * callback, child, damage, water response or RNG draw after the common path. */
export function stepPlantFireEffectRecord(
  before: readonly (number | null)[],
  terrain: TerrainState,
  context: ProductionEffectContext,
): ProductionEffectUpdate {
  validateProfile(context.profile);
  return stepEffect8Record(before, terrain, context);
}
