/**Collector14E2B ordinary48790(10), without the Engineer caller's newborn mark. */
import type { AnimationProfile } from "./animation";
import {
  effectFactoryPrior,
  effectTerrainShade,
  type EffectNativePrior,
} from "./power-motion";
import { groundHeight, type TerrainState } from "./terrain";
import {
  validateEngineerChargeDescriptor,
  validateEngineerChargeProfile,
  type EngineerChargeDescriptor,
} from "./engineer-charge";
export function makeProcessorCollectorFeedback(
  prior: readonly (number | null)[],
  slot: number,
  position: [number, number],
  height: number,
  terrain: TerrainState,
  profile: AnimationProfile,
  descriptor: EngineerChargeDescriptor,
): EffectNativePrior {
  validateEngineerChargeDescriptor(descriptor, 10);
  validateEngineerChargeProfile(profile, 10);
  if (
    prior[6] !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    position.length !== 2 ||
    position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(height) ||
    height < -2147483648 ||
    height > 2147483647
  )
    throw Error("Actual collector10 factory input required");
  return effectFactoryPrior(prior, {
    slot,
    code: 10,
    owner: 0,
    x: position[0],
    y: position[1],
    ground: groundHeight(terrain, ...position),
    height,
    shade: effectTerrainShade(terrain, ...position),
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
