import { advanceAnimation, type AnimationProfile } from "./animation";
import {
  effectFactoryPrior,
  effectPriorByte,
  putEffectWord,
  type EffectNativePrior,
} from "./power-motion";
import {
  groundHeight,
  readWord,
  worldCell,
  type TerrainState,
} from "./terrain";
const word = (n: EffectNativePrior, at: number) =>
  ((effectPriorByte(n, at) | (effectPriorByte(n, at + 1) << 8)) << 16) >> 16;
const dword = (n: EffectNativePrior, at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
/** Source48790 code44/0x2C after the building constructor, without RNG.
 * Common pointer/resource fields remain logical; retained numeric fields stay. */
export function createBuildingEffect(
  prior: EffectNativePrior,
  input: {
    slot: number;
    owner: number;
    selector: number;
    buildingSlot: number;
    point: [number, number];
    ground: number;
    shade: number;
    height: number;
  },
): EffectNativePrior {
  if (
    prior[6] !== 0 ||
    input.slot < 0 ||
    input.slot >= 200 ||
    input.owner < 0 ||
    input.owner >= 4 ||
    input.selector < 0 ||
    input.selector >= 14 ||
    input.buildingSlot < 0 ||
    input.buildingSlot >= 256
  )
    throw new Error("Invalid building effect factory");
  const n = effectFactoryPrior(prior, {
    slot: input.slot,
    code: 44,
    owner: input.owner,
    x: input.point[0],
    y: input.point[1],
    ground: input.ground,
    height: input.height,
    shade: input.shade,
    vx: 0,
    vy: 0,
    vz: 0,
    accelerationZ: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
    delay: 0,
  });
  putEffectWord(n, 74, input.selector === 0 ? -1 : input.selector);
  putEffectWord(n, 71, input.buildingSlot);
  n[73] = 4;
  return n;
}
/** Source4B630 on the prepared level construction site. Changing ground or
 * water contact requires common effect physics, rather than guessed motion. */
export function stepBuildingEffect(
  n: EffectNativePrior,
  terrain: TerrainState,
  water: number,
  shade: number,
  profile: AnimationProfile,
): { native: EffectNativePrior; retired: boolean } {
  if (
    n[6] !== 5 ||
    n[69] !== 44 ||
    effectPriorByte(n, 24) >= 4 ||
    word(n, 15) < 0 ||
    word(n, 15) >= 200
  )
    throw new Error("Invalid building effect callback");
  const x = word(n, 7),
    y = word(n, 9),
    ground = groundHeight(terrain, x, y),
    heights = [
      readWord(terrain, worldCell(x, y), 2),
      readWord(terrain, worldCell(x + 256, y), 2),
      readWord(terrain, worldCell(x, y + 256), 2),
      readWord(terrain, worldCell(x + 256, y + 256), 2),
    ];
  if (
    (effectPriorByte(n, 21) & ~0x21) !== 0 ||
    !(effectPriorByte(n, 21) & 0x20) ||
    n[22] !== 0 ||
    word(n, 63) !== -1 ||
    word(n, 43) !== 16 ||
    n.slice(45, 57).some((v) => v !== 0) ||
    word(n, 61) !== 0 ||
    ground <= water ||
    water < 0 ||
    dword(n, 17) !== ground ||
    dword(n, 39) !== ground ||
    heights.some((h) => h !== heights[0])
  )
    throw new Error(
      "Building appearance requires changed-ground or water physics",
    );
  if (
    profile.flags !== 0 ||
    profile.holds.length !== 9 ||
    profile.holds.some((h) => h !== 0) ||
    n[25] !== 0 ||
    n[28] !== 1 ||
    n[29] !== 0
  )
    throw new Error("Unsupported building appearance animation");
  const after = n.slice();
  after[23] = shade;
  putEffectWord(after, 59, 512);
  const timer = word(n, 74),
    nextTimer = timer >= 0 ? timer - 1 : timer;
  putEffectWord(after, 74, nextTimer);
  const a = advanceAnimation(
    {
      action: 44,
      hold: effectPriorByte(n, 26),
      frame: effectPriorByte(n, 27),
      direction: 1,
      delay: 0,
      counter: (effectPriorByte(n, 30) << 24) >> 24,
    },
    profile,
  );
  after[26] = a.hold;
  after[27] = a.frame;
  after[30] = a.counter & 255;
  return { native: after, retired: nextTimer < 0 && a.frame === 8 };
}
