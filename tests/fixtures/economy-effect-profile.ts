import type { Asset } from "../../src/content/types";

/** Synthetic artwork with the preserved EFF61 timing, isolated from other actions. */
export function installEconomyEffect61(asset: Asset): void {
  const frames = asset.frames!,
    animations = asset.animations!,
    first = frames.length;
  for (let i = 0; i < 9; i++)
    frames.push({
      ...structuredClone(frames[0]),
      rawFlags: [i < 2 ? 9 : 0, 0, 0],
    });
  animations[61] = { first, last: first + 8, rawTrailingWord: 9 };
}
