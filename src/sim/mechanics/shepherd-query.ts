/** Source112748→58A70,8D7B0/8D930 and exact target virtual58/68.
 * Query traversal is spatial head order; it does not use broad entity rectangles. */
import { readSpecialistControlActor, type GeneticistWorld } from "./geneticist";
import type { ShepherdTarget } from "./shepherd";
import { nextRandom } from "./random";
import { groundHeight, torusDelta, worldCell } from "./terrain";
import { specialistVisibilityRay } from "./specialist-motion";
import type { MotionTables } from "./motion";
type Native = readonly (number | null)[];
type Point = [number, number];
const b = (n: Native, p: number) => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown Shepherd query byte ${p}`);
  return v;
};
const w = (n: Native, p: number) =>
  ((b(n, p) | (b(n, p + 1) << 8)) << 16) >> 16;
const d = (n: Native, p: number) =>
  b(n, p) | (b(n, p + 1) << 8) | (b(n, p + 2) << 16) | (b(n, p + 3) << 24);
const point = (n: Native): Point => [w(n, 7), w(n, 9)];
const wrap = (v: number) => (v << 16) >> 16;
function target(t: { kind: 1 | 3 | 4; native: Native }) {
  if (b(t.native, 6) !== t.kind)
    throw Error("Actual Shepherd target kind differs");
}
/** Slot68: Mule corpse; specialist signed BP health; building signed health. */
export function shepherdTargetVirtual68(
  t: { kind: 1 | 3 | 4; native: Native },
  specialistBlueprint?: Native,
): boolean {
  target(t);
  if (t.kind === 1) return b(t.native, 94) >= 24;
  if (t.kind === 4) return w(t.native, 43) <= 0;
  if (!specialistBlueprint || specialistBlueprint.length !== 36)
    throw Error("Actual retained36-byte specialist blueprint required");
  return (b(specialistBlueprint, 26) << 24) >> 24 <= 0;
}
/** Slot58 means Mule stunned with positive timer, and false for kinds3/4. */
export function shepherdTargetVirtual58(t: {
  kind: 1 | 3 | 4;
  native: Native;
}): boolean {
  target(t);
  return t.kind === 1 && b(t.native, 94) === 18 && w(t.native, 108) > 0;
}
export interface ShepherdQueryContext<W extends GeneticistWorld> {
  /** Complete source shared-cell head→next chain; source:family:slot identities. */
  cellOrder(world: W, cell: number): readonly string[];
  /** Actual native image for each encountered kind1 identity. Other kinds are
   * skipped by58A70 before their owner, height or family fields are read. */
  creature(world: W, index: number): (number | null)[] | null;
}
/** Complete descriptor112748 search. Two traversal draws are committed only
 * after every required cell/record is established. No candidate-range test is
 * added:8D930 limits sampled cells;58A70 picks minimum736F0 terrain distance. */
export function queryShepherdHostile<W extends GeneticistWorld>(
  world: W,
  index: number,
  radius: number,
  c: ShepherdQueryContext<W>,
): ShepherdTarget | null {
  const a = readSpecialistControlActor(world, index),
    n = a.native,
    at = point(n);
  if (world.specialists.bindings[index]?.category !== 3)
    throw Error("Shepherd query requires category3");
  if (!Number.isInteger(radius) || radius <= 0 || radius > 1856)
    throw Error("Actual Shepherd query radius required");
  const rng = { ...world.rng },
    sx = nextRandom(rng) % 2 ? -256 : 256,
    sy = nextRandom(rng) % 2 ? -256 : 256,
    extent = radius >> 8;
  let best = 0xffffffff,
    winner: ShepherdTarget | null = null;
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      if (
        Math.imul(x * sx, x * sx) + Math.imul(y * sy, y * sy) >
        Math.imul(radius, radius)
      )
        continue;
      const sample: Point = [wrap(at[0] + x * sx), wrap(at[1] + y * sy)],
        cell = worldCell(...sample),
        ids = c.cellOrder(world, cell);
      for (const id of ids) {
        const match = /^source:([0-7]):(\d+)$/.exec(id);
        if (!match)
          throw Error(
            "Shepherd query requires actual source shared identities",
          );
        if (Number(match[1]) !== 0) continue;
        const slot = Number(match[2]),
          other = c.creature(world, slot);
        if (
          !other ||
          other.length !== 124 ||
          b(other, 6) !== 1 ||
          w(other, 15) !== slot ||
          worldCell(...point(other)) !== cell
        )
          throw Error(
            "Shepherd query linked creature differs from actual native cell/identity",
          );
        const owner = b(other, 24);
        if (
          owner === a.owner ||
          (a.owner !== 4 && b(a.blueprint, 0x6e5) & (1 << owner))
        )
          continue;
        if (b(other, 94) >= 24) continue;
        const p = point(other),
          dx = torusDelta(p[0], at[0]),
          dy = torusDelta(p[1], at[1]),
          dz =
            ((groundHeight(world.terrain, ...p) -
              groundHeight(world.terrain, ...at)) |
              0) >>
            3;
        const score =
          (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
        if (score < best) {
          best = score;
          winner = {
            kind: 1,
            index: slot,
            native: other,
            physicalHeight: d(other, 39),
          };
        }
      }
    }
  Object.assign(world.rng, rng);
  return winner;
}
/**54B10→75890: fresh terrain heights, source muzzle+1280. This helper is
 * target-kind independent; obstacle is exact74270 mask1 at sampled height. */
export function shepherdLineOfSight<W extends GeneticistWorld>(
  world: W,
  index: number,
  t: ShepherdTarget,
  c: {
    tables: MotionTables;
    obstacle(world: W, position: Point, mask: 1, height: number): boolean;
  },
): boolean {
  const n = readSpecialistControlActor(world, index).native;
  target(t);
  return specialistVisibilityRay(
    world.terrain,
    point(n),
    point(t.native),
    (groundHeight(world.terrain, ...point(n)) + 1280) | 0,
    groundHeight(world.terrain, ...point(t.native)),
    c.tables,
    (p, height) => c.obstacle(world, p, 1, height),
  );
}
