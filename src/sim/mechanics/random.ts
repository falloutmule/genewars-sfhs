/** Original GeneWars 16-bit random stream, independently expressed from the
 * preserved BlueprintRng and caller contracts. The debug ring is diagnostic:
 * its unknown initial position does not change any random value.
 */
export interface GeneRng {
  seed: number;
  draws: number;
  ring: number | null;
}
export function nextRandom(rng: GeneRng): number {
  if (
    !Number.isInteger(rng.seed) ||
    rng.seed < 0 ||
    rng.seed > 65535 ||
    !Number.isInteger(rng.draws) ||
    rng.draws < 0 ||
    rng.draws > 0xffffffff ||
    (rng.ring !== null &&
      (!Number.isInteger(rng.ring) || rng.ring < 0 || rng.ring > 31))
  )
    throw new Error("Invalid original RNG state");
  rng.seed = Math.imul(rng.seed, 0xe62d) & 65535;
  rng.draws = (rng.draws + 1) >>> 0;
  if (rng.ring !== null) rng.ring = (rng.ring + 1) & 31;
  return rng.seed >>> 8;
}
