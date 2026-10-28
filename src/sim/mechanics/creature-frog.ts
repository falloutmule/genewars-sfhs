/**5E640's ordinary airborne Frog-component animation arm. */
type Native = (number | null)[];
const word = (n: Native, p: number) => {
  if (
    ![n[p], n[p + 1]].every((v) => Number.isInteger(v) && v! >= 0 && v! <= 255)
  )
    throw Error("Frog animation requires actual native words");
  return ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
};
const dword = (n: Native, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
/**Returns false for the existing ground/flight/other-state selector arms.
 * No motion, timer, RNG or animation playback is performed here. */
export function selectFrogAirborneAnimation(
  n: Native,
  hasFrog: boolean,
  frameCount: (action: number) => number,
): boolean {
  if (!hasFrog || ![1, 2, 3, 8].includes(n[94]!) || word(n, 73) & 0x400)
    return false;
  const direction = ((((word(n, 57) >> 7) + 1) >> 1) + 1) & 7;
  if (n[97]! & 1) {
    n[25] = direction;
    n[28] = n[27] = 0;
    return true;
  }
  const height = (dword(n, 39) - dword(n, 17)) | 0;
  if (height >> 6 <= 0) return false;
  const count = frameCount(direction);
  if (!Number.isInteger(count) || count < 1 || count > 255)
    throw Error("Actual Frog action frame count required");
  const half = count >> 1,
    offset = height >> 10;
  n[25] = direction;
  n[28] = 0;
  n[27] =
    (word(n, 49) > 0
      ? Math.min(offset, half)
      : Math.max(count - offset, half + 1)) & 255;
  return true;
}
