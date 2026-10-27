import type { Pack } from "../content/types";
import { animationProfile } from "../sim/mechanics/animation";
import { specialistCorpseBinding } from "../sim/mechanics/specialist-corpse";

/** Logical effect selectors are not always animation resource indices.
 * Source5C920 retains carrier67's EFF67 resource when it changes to68;
 * specialist corpse69 likewise retains the specialist's own resource.
 */
export function sharedEffectSpriteBinding(
  native: readonly (number | null)[],
  pack: Pack,
) {
  const code = native[69],
    corpse = code === 69 ? specialistCorpseBinding(native, pack.rules!.tables) : null,
    art = corpse?.assetKey ?? "EFF",
    action = corpse ? 9 : code === 68 ? 67 : code!;
  return { art, profile: animationProfile(pack.assets[art], action) };
}
