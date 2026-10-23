import type { Asset } from "../../content/types";
export interface AnimationProfile {
  holds: number[];
  flags: number;
  first: number;
  last: number;
}
export interface AnimationState {
  action: number;
  hold: number;
  frame: number;
  direction: number;
  delay: number;
  counter: number;
}
export function animationProfile(
  asset: Asset,
  action: number,
): AnimationProfile {
  const a = asset.animations?.[action];
  if (!a || !asset.frames || a.last < a.first || a.last >= asset.frames.length)
    throw new Error(`Missing original animation ${action}`);
  const count = a.rawTrailingWord & 255,
    flags = a.rawTrailingWord >>> 8;
  if (count !== a.last - a.first + 1 || !count || (count === 1 && flags & 1))
    throw new Error("Invalid original animation descriptor");
  return {
    holds: asset.frames.slice(a.first, a.last + 1).map((f) => f.rawFlags[0]),
    flags,
    first: a.first,
    last: a.last,
  };
}
export function animationState(action: number, delay = 0): AnimationState {
  return { action, hold: 0, frame: 0, direction: 1, delay, counter: 0 };
}
/** Source7AC00 signed delays/direction and unsigned holds. */
export function advanceAnimation(
  before: AnimationState,
  profile: AnimationProfile,
): AnimationState {
  if (
    !profile.holds.length ||
    profile.holds.length > 255 ||
    (profile.holds.length === 1 && profile.flags & 1)
  )
    throw new Error("Unsupported animation profile");
  const a = { ...before },
    last = profile.holds.length - 1;
  a.frame = Math.min(a.frame, last);
  a.counter = Math.min(a.counter, a.delay);
  const old = a.counter;
  a.counter = ((a.counter - 1) << 24) >> 24;
  if (old <= 0) {
    a.counter = a.delay;
    a.hold = Math.min(a.hold, profile.holds[a.frame]);
    const hold = a.hold;
    a.hold = (a.hold - 1) & 255;
    if (hold === 0) {
      const n = a.frame + a.direction;
      a.frame =
        n > last
          ? profile.flags & 1
            ? ((a.direction = -1), last - 1)
            : 0
          : n < 0
            ? profile.flags & 1
              ? ((a.direction = 1), 1)
              : last
            : n;
      a.hold = profile.holds[a.frame];
    }
  }
  return a;
}
export function animationFinished(
  a: AnimationState,
  p: AnimationProfile,
): boolean {
  return (
    a.hold === 0 &&
    (p.flags & 1
      ? a.frame === 0
      : a.counter === 0 && a.frame === p.holds.length - 1)
  );
}
