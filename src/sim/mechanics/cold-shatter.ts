/**6D500 burst used by5B9F0's frozen-creature retirement. */
import { nextRandom, type GeneRng } from "./random";
import type { DestructionRequest } from "./destruction-effect";
export interface ColdShatterRequest {
  code: 14;
  count: number;
  parameter1: 80;
  parameter2: 70;
  owner: -1;
}
export function emitColdShatterBurst(
  native: readonly (number | null)[],
  rng: GeneRng,
  request: ColdShatterRequest,
  factory: (request: DestructionRequest) => boolean,
): number {
  const b = (at: number) => {
    const v = native[at];
    if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
      throw Error("Cold shatter requires initialized creature bytes");
    return v;
  }, word = (at: number) => ((b(at) | b(at + 1) << 8) << 16) >> 16,
    dword = (at: number) => (word(at) & 65535) | word(at + 2) << 16;
  if (b(6) !== 1 || b(94) !== 15 || request.code !== 14 ||
      request.parameter1 !== 80 || request.parameter2 !== 70 || request.owner !== -1 ||
      !Number.isInteger(request.count) || request.count < 10 || request.count > 19)
    throw Error("Actual frozen-creature shatter request required");
  const height = dword(39), relative = (height - dword(17)) | 0;
  let created = 0;
  for (let i = 0; i < request.count; i++) {
    const speed = (80 + nextRandom(rng) % 70) * 64,
      pitch = nextRandom(rng), yaw = (nextRandom(rng) % 128) * 16;
    if (factory({code: 14, owner: b(24), position: [word(7), word(9)], height,
      angles: [yaw, relative < 128 ? pitch % 150 : pitch % 128 * 8, speed],
      parameter: 0, delay: 0, newborn: false})) created++;
  }
  return created;
}
