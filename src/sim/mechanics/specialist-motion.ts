/** Category2 kind3 common6FB60→6F980→6DF30 motion. Actual native records
 * remain authoritative; query/factory/spatial services use the staged world. */
import { nextRandom } from "./random";
import {
  groundHeight,
  worldCell,
  torusDelta,
  integerSqrt,
  type TerrainState,
} from "./terrain";
import {
  originalAngle,
  terrainNormal,
  velocity,
  createMotion,
  resolveMovementTarget,
  wrap16,
  type MotionTables,
} from "./motion";
import { ecologyTerrainClass } from "./ecology";
import { muleWaypoint } from "./mule";
import { effectTerrainShade } from "./power-motion";
import type { GeneticistWorld } from "./geneticist";
type Native = (number | null)[];
type Point = [number, number];
const b = (n: readonly (number | null)[], p: number): number => {
  const v = n[p];
  if (v === null || v === undefined || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown specialist motion byte ${p}`);
  return v;
};
const w = (n: readonly (number | null)[], p: number) =>
  wrap16(b(n, p) | (b(n, p + 1) << 8));
const d = (n: readonly (number | null)[], p: number) =>
  (w(n, p) & 65535) | (w(n, p + 2) << 16);
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const at = (n: readonly (number | null)[]): Point => [w(n, 7), w(n, 9)];
const setPoint = (n: Native, p: number, v: Point) => {
  put(n, p, v[0]);
  put(n, p + 2, v[1]);
};
const squared = (terrain: TerrainState, a: Point, z: Point) => {
  const x = torusDelta(z[0], a[0]),
    y = torusDelta(z[1], a[1]),
    h = (groundHeight(terrain, ...z) - groundHeight(terrain, ...a)) >> 3;
  return (Math.imul(x, x) + Math.imul(y, y) + Math.imul(h, h)) | 0;
};
const flatSquared = (a: Point, z: Point) => {
  const x = torusDelta(z[0], a[0]),
    y = torusDelta(z[1], a[1]);
  return (Math.imul(x, x) + Math.imul(y, y)) >>> 0;
};
const heading = (a: Point, z: Point, t: MotionTables) =>
  originalAngle(wrap16((z[0] - a[0]) * 2), wrap16((z[1] - a[1]) * 2), t.atan);

export interface SpecialistMotionObstacle {
  index: number;
  position: Point;
  ground: number;
}
export interface SpecialistMotionContext<W extends GeneticistWorld> {
  tables: MotionTables;
  gravity: number;
  water: number;
  bounce: readonly number[];
  selectedPlayer: number;
  /** Actual74270 first candidate, including source footprint/height ordering.
   * Ground path queries use height=-1; physics uses current physical height. */
  obstacle(
    world: W,
    position: Point,
    mask: 0 | 1,
    height: number,
  ): SpecialistMotionObstacle | null;
  /** Actual8B130 weight with this actor excluded, after terrain admission. */
  blockerWeight(world: W, actor: number, position: Point): number;
  /** Actual building record for a nominated kind4 association, lazily read. */
  building?(world: W, index: number): Native;
  /** Original104E12 radius indexed by that building's footprint. */
  buildingTargetRadius?(world: W, index: number): number;
  /** Unlink/prepend immediately at each actual source relocation. */
  relocate?(
    world: W,
    actor: number,
    before: Point,
    after: Point,
    phase: "physics" | "arrival",
  ): void;
  /** Real48790 factory, called after physics relocation and before arrival. */
  waterEffect?(world: W, request: SpecialistWaterRequest): void;
  /** Actual kind3 virtual34 hit callback, needed only for fall/water damage. */
  damage?(world: W, actor: number, amount: number): void;
  /** Actual kind3 virtual2C reveal; parity and movement gate are handled here. */
  reveal?(world: W, actor: number): void;
}
export interface SpecialistWaterRequest {
  actor: number;
  code: 21 | 48;
  position: Point;
  height: number;
  angles: [number, number, number];
}
export interface SpecialistMotionReceipt {
  actor: number;
  arrived: boolean;
  relocations: { before: Point; after: Point; phase: "physics" | "arrival" }[];
  water: SpecialistWaterRequest | null;
  route: "idle" | "moving" | "backoff" | "detached";
}
function actor<W extends GeneticistWorld>(s: W, index: number): Native {
  const n = s.specialists.records[index],
    binding = s.specialists.bindings[index];
  if (
    !n ||
    n.length !== 200 ||
    b(n, 6) !== 3 ||
    w(n, 15) !== index ||
    !binding ||
    ![0, 1, 2, 3].includes(binding.category) ||
    binding.owner !== b(n, 24)
  )
    throw Error("Actual admitted kind3 specialist motion binding required");
  const player = s.players[binding.owner]?.raw,
    offset = 22 + 36 * binding.blueprintIndex;
  if (
    !player ||
    player.length !== 1805 ||
    b(player, offset + 22) !== binding.category ||
    b(player, offset + 21) !== binding.style
  )
    throw Error("Specialist motion blueprint differs from binding");
  return n;
}
function ref<W extends GeneticistWorld>(
  s: W,
  kind: number,
  index: number,
  c: SpecialistMotionContext<W>,
): Native | null {
  if (kind === 0) return null;
  const n =
    kind === 1
      ? s.ecology.mules.find((m) => m.index === index)?.native
      : kind === 3
        ? s.specialists.records[index]
        : kind === 4
          ? c.building?.(s, index)
          : null;
  if (!n || b(n, 6) !== kind || w(n, 15) !== index)
    throw Error("Specialist motion actual reference is unresolved");
  return n;
}
function accepts<W extends GeneticistWorld>(
  s: W,
  index: number,
  p: Point,
  c: SpecialistMotionContext<W>,
  nominated: number | null = null,
  mask: 0 | 1 = 1,
): boolean {
  const n = actor(s, index),
    obstacle = c.obstacle(s, p, mask, -1),
    terrainClass = ecologyTerrainClass(s.terrain, p);
  if (
    (b(n, 83) & (1 << terrainClass)) !== 0 ||
    (obstacle && obstacle.index !== nominated)
  )
    return false;
  const weight = c.blockerWeight(s, index, p);
  if (!Number.isInteger(weight))
    throw Error("Unknown actual specialist blocker weight");
  return weight < 10;
}
/** Source743C0; a rejected initial sample returns true before entering the ray. */
export function specialistStraightRay(
  from: Point,
  to: Point,
  t: MotionTables,
  accept: (p: Point) => boolean,
): { clear: boolean; failure: Point | null } {
  if (!accept(from)) return { clear: true, failure: null };
  let fixed = [from[0] << 16, from[1] << 16],
    delta = [0, 0];
  for (let i = 0; i < 1024; i++) {
    const p: Point = [fixed[0] >> 16, fixed[1] >> 16];
    if ((i & 63) === 0) {
      const yaw = (heading(p, to, t) + 1536) & 2047;
      delta = [t.cosine[yaw] << 6, t.sine[yaw] << 6];
    }
    const done = flatSquared(p, to) <= 4096;
    if (!accept(done ? to : p))
      return {
        clear: false,
        failure: [
          ((fixed[0] - delta[0]) | 0) >> 16,
          ((fixed[1] - delta[1]) | 0) >> 16,
        ],
      };
    fixed = [(fixed[0] + delta[0]) | 0, (fixed[1] + delta[1]) | 0];
    if (done) return { clear: true, failure: null };
  }
  throw Error("Specialist source ray iteration limit");
}
/**305F0/6D230: current group completes, its last admitted candidate wins. */
export function findSpecialistIdleRelocation(
  current: Point,
  accept: (p: Point) => boolean,
): Point | null {
  for (let ring = 0; ring <= 8; ring++)
    for (let minor = 0; minor <= ring; minor++) {
      const i = minor * 256,
        j = ring * 256,
        offsets: Point[] = [];
      if (ring === 0) offsets.push([0, 0]);
      else {
        if (minor !== 0) offsets.push([i, j], [j, -i], [-i, -j], [-j, i]);
        if (minor !== ring) offsets.push([j, i], [i, -j], [-j, -i], [-i, j]);
      }
      let found: Point | null = null;
      for (const delta of offsets) {
        const p: Point = [
          wrap16(current[0] + delta[0]),
          wrap16(current[1] + delta[1]),
        ];
        if (flatSquared(current, p) <= 4194304 && accept(p)) found = p;
      }
      if (found) return found;
    }
  return null;
}
function setVelocity(n: Native, t: MotionTables): void {
  const m = createMotion(...at(n), d(n, 17), w(n, 63), w(n, 43) & 65535);
  m.yaw = w(n, 57);
  m.pitch = w(n, 59);
  m.speed = w(n, 61);
  if (m.yaw < 0 || m.yaw > 2048 || m.pitch < 0 || m.pitch > 2048 || m.speed < 0)
    throw Error("Specialist source velocity angle/speed invalid");
  velocity(m, t);
  put(n, 45, m.vx);
  put(n, 47, m.vy);
  put(n, 49, m.vz);
}
function setAngles(n: Native, t: MotionTables): void {
  const x = w(n, 45),
    y = w(n, 47),
    z = w(n, 49),
    xy = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0);
  if (xy) put(n, 57, originalAngle(x, y, t.atan));
  const speed = wrap16(
    integerSqrt((Math.imul(xy, xy) + Math.imul(z, z)) >>> 0),
  );
  put(n, 61, speed);
  put(n, 59, speed === 0 ? 512 : originalAngle(xy, -z, t.atan));
}
function steer(n: Native, t: MotionTables): void {
  const yaw = w(n, 57),
    goal = w(n, 75);
  if (yaw === goal) {
    n[74] = b(n, 74) & 223;
    return;
  }
  if (d(n, 39) > d(n, 17)) return;
  const direct = goal - yaw,
    other = direct < 0 ? 2048 + direct : direct - 2048,
    change = Math.abs(direct) <= Math.abs(other) ? direct : other;
  n[74] = Math.abs(change) >= 256 ? b(n, 74) | 32 : b(n, 74) & 223;
  const step = (w(n, 43) & 65535) * 2;
  put(
    n,
    57,
    Math.abs(change) <= step
      ? goal
      : (yaw + (change < 0 ? -step : step)) & 2047,
  );
  setVelocity(n, t);
}
function route<W extends GeneticistWorld>(
  s: W,
  index: number,
  c: SpecialistMotionContext<W>,
): {
  working: Point;
  savedSpeed: number | null;
  early: boolean;
  route: SpecialistMotionReceipt["route"];
} {
  const n = actor(s, index),
    current = at(n),
    phase = (s.frame + index) >>> 0;
  if (b(n, 22) & 64 || w(n, 73) & 1024)
    throw Error("Specialist flight/vertical-target movement is not admitted");
  const nominated =
    b(n, 79) === 0
      ? null
      : b(n, 79) === 4
        ? w(n, 77)
        : (() => {
            throw Error("Specialist nominated reference kind is not admitted");
          })();
  if (nominated !== null) ref(s, 4, nominated, c);
  const accept = (p: Point) => accepts(s, index, p, c, nominated),
    oldFlags = w(n, 73) & 65535;
  n[73] = b(n, 73) & 159;
  const binding = s.specialists.bindings[index]!,
    raw = s.players[binding.owner].raw,
    offset = 22 + 36 * binding.blueprintIndex;
  if (
    !(oldFlags & 16) &&
    (b(raw, offset + 26) << 24) >> 24 > 0 &&
    (phase & 31) === 0 &&
    !accept(current)
  ) {
    const found = findSpecialistIdleRelocation(current, (p) =>
      accepts(s, index, p, c),
    );
    if (found) {
      n[73] = b(n, 73) | 1;
      const goal = resolveMovementTarget(current, found, c.tables, (p) =>
        accepts(s, index, p, c, null, 0),
      );
      n[91] = 0;
      setPoint(n, 11, goal);
      setPoint(n, 92, goal);
      n[87] = b(n, 87) | 2;
      n[73] = b(n, 73) & 254;
    }
  }
  if (b(n, 22) & 8)
    return {
      working: [w(n, 11), w(n, 13)],
      savedSpeed: null,
      early: true,
      route: "detached",
    };
  const associated = b(n, 82) === 0 ? null : ref(s, b(n, 82), w(n, 80), c);
  let target: Point = [w(n, 11), w(n, 13)],
    working: Point = w(n, 73) & 3 ? [w(n, 69), w(n, 71)] : target;
  if ((w(n, 73) & 3) === 3) {
    if (associated) {
      target = at(associated);
      setPoint(n, 11, target);
    }
    // Kind3 virtual8C always returns false, so this parity exits backoff.
    if ((phase & 3) === 3) {
      n[84] = 20;
      put(n, 73, w(n, 73) & 0xeffc);
      n[22] = b(n, 22) & 127;
    } else {
      n[84] = (b(n, 84) - 1) & 255;
      if (b(n, 84) === 0) {
        n[84] = 20;
        put(n, 73, (w(n, 73) & 0xeebc) | 0x140);
        n[22] = b(n, 22) & 127;
      }
    }
    if (phase & 1) put(n, 75, heading(current, target, c.tables));
    const savedSpeed = w(n, 63);
    put(n, 63, 0);
    return { working: target, savedSpeed, early: true, route: "backoff" };
  }
  if (w(n, 63) < 1 && !(w(n, 73) & 16))
    return { working, savedSpeed: null, early: true, route: "idle" };
  if (w(n, 73) & 16) {
    if (w(n, 73) & 12 || (associated && (phase & 3) === 3 && !(w(n, 73) & 3))) {
      let from: Point;
      if (!(w(n, 73) & 3) || w(n, 73) & 8 || accept(current)) {
        if (associated) {
          target = at(associated);
          setPoint(n, 11, target);
        }
        if (!accept(target)) {
          target = resolveMovementTarget(current, target, c.tables, accept);
          setPoint(n, 11, target);
        }
        working = target;
        from = w(n, 73) & 3 ? [w(n, 69), w(n, 71)] : current;
      } else {
        working = [w(n, 69), w(n, 71)];
        from = current;
      }
      const ray = specialistStraightRay(from, working, c.tables, accept);
      if (!ray.clear) {
        if (!ray.failure)
          throw Error("Specialist blocked source ray has no failure point");
        const pair =
          !(w(n, 73) & 3) ||
          !!(w(n, 73) & 4) ||
          (!!(b(n, 22) & 128) && flatSquared(current, ray.failure) > 65535);
        if (pair) {
          const left = muleWaypoint(
              current,
              ray.failure,
              target,
              false,
              120,
              c.tables,
              accept,
            ),
            right = muleWaypoint(
              current,
              ray.failure,
              target,
              true,
              left.cost < 120 ? left.cost + 1 : 120,
              c.tables,
              accept,
            );
          put(n, 73, w(n, 73) & 0xeffc);
          n[22] = b(n, 22) & 127;
          const failed = left.cost >= 120 && right.cost >= 120;
          if (failed) n[84] = (b(n, 84) - 1) & 255;
          if (failed && b(n, 84) === 0) {
            put(n, 73, w(n, 73) | 0x140);
            working = [w(n, 69), w(n, 71)];
          } else {
            if (failed && left.cost === 121 && right.cost === 121)
              n[22] = b(n, 22) | 128;
            const chooseLeft =
                failed && left.cost === right.cost
                  ? nextRandom(s.rng) % 10 < 5
                  : left.cost < right.cost,
              result = chooseLeft ? left : right;
            if (!result.point)
              throw Error(
                "Specialist source waypoint has no initialized output",
              );
            working = result.point;
            setPoint(n, 69, working);
            put(n, 73, w(n, 73) | (chooseLeft ? 0x1002 : 0x1001));
            put(n, 75, heading(current, working, c.tables));
            if (!failed) n[84] = 20;
          }
        } else if (w(n, 73) & 8) {
          const walk = muleWaypoint(
            current,
            [w(n, 69), w(n, 71)],
            target,
            !!(w(n, 73) & 1),
            120,
            c.tables,
            accept,
          );
          if (walk.point) setPoint(n, 69, walk.point);
          if (walk.cost < 120)
            put(n, 75, heading(current, [w(n, 69), w(n, 71)], c.tables));
          else {
            n[84] = (b(n, 84) - 1) & 255;
            if (b(n, 84) === 0) {
              put(n, 73, (w(n, 73) & 0xeebc) | 0x140);
              n[22] = b(n, 22) & 127;
            }
          }
          working = [w(n, 69), w(n, 71)];
        } else working = [w(n, 69), w(n, 71)];
      } else if (working[0] === w(n, 11) && working[1] === w(n, 13)) {
        if (w(n, 73) & 3) {
          put(n, 73, w(n, 73) & 0xeffc);
          n[22] = b(n, 22) & 127;
          put(n, 75, heading(current, target, c.tables));
        }
        if (nominated !== null && !(w(n, 73) & 128)) {
          const building = ref(s, 4, nominated, c)!;
          target = at(building);
          setPoint(n, 11, target);
          put(n, 75, heading(current, target, c.tables));
          if (!c.buildingTargetRadius)
            throw Error("Actual nominated building target radius is required");
          const radius = c.buildingTargetRadius(s, nominated),
            yaw = (w(n, 75) + 1024 + 1536) & 2047;
          if (!Number.isInteger(radius))
            throw Error("Unknown source building target radius");
          working = [
            wrap16(
              target[0] + Math.floor((radius * c.tables.cosine[yaw]) / 65536),
            ),
            wrap16(
              target[1] + Math.floor((radius * c.tables.sine[yaw]) / 65536),
            ),
          ];
          setPoint(n, 11, working);
        }
      }
      n[73] = b(n, 73) & 243;
    }
    if (phase & 1) put(n, 75, heading(current, working, c.tables));
  }
  return { working, savedSpeed: null, early: false, route: "moving" };
}
function contactSpeed<W extends GeneticistWorld>(
  s: W,
  index: number,
  n: Native,
  normal: [number, number, number],
  previous: number,
  c: SpecialistMotionContext<W>,
): number {
  const speed = w(n, 65),
    width = w(n, 43) & 65535,
    brake = () => (speed > width ? wrap16(speed - width) : 0);
  if (b(n, 74) & 32) return brake();
  if (!(b(n, 74) & 16)) {
    if (width === 0)
      throw Error("Specialist source contact divides by zero width");
    const q = Math.trunc((speed * speed) / (width << 7)),
      target = b(n, 82) === 0 ? null : ref(s, b(n, 82), w(n, 80), c);
    let distance: number;
    if (target) {
      const x = torusDelta(w(target, 7), w(n, 7)),
        y = torusDelta(w(target, 9), w(n, 9)),
        z = ((d(target, 39) - d(n, 39)) | 0) >> 3;
      distance = (Math.imul(x, x) + Math.imul(y, y) + Math.imul(z, z)) | 0;
    } else
      distance = squared(
        s.terrain,
        at(n),
        w(n, 73) & 3 ? [w(n, 69), w(n, 71)] : [w(n, 11), w(n, 13)],
      );
    if (distance <= Math.imul(q, q)) return brake();
  }
  const desired =
    Math.imul(normal[2] + (previous < d(n, 17) ? 0 : 128) - 128, w(n, 63)) >> 7;
  return Math.abs((speed - desired) | 0) <= width
    ? wrap16(desired)
    : desired < speed
      ? brake()
      : wrap16(speed + width);
}
function relocated<W extends GeneticistWorld>(
  s: W,
  index: number,
  before: Point,
  phase: "physics" | "arrival",
  c: SpecialistMotionContext<W>,
  out: SpecialistMotionReceipt,
): void {
  const n = actor(s, index),
    after = at(n);
  if (worldCell(...before) === worldCell(...after) || b(n, 22) & 32) return;
  if (!c.relocate)
    throw Error(
      "Specialist motion requires immediate shared spatial relocation",
    );
  c.relocate(s, index, before, after, phase);
  out.relocations.push({ before, after, phase });
  if (actor(s, index) !== n)
    throw Error("Specialist relocation replaced retained native record");
}
function physics<W extends GeneticistWorld>(
  s: W,
  index: number,
  c: SpecialistMotionContext<W>,
  out: SpecialistMotionReceipt,
): void {
  const n = actor(s, index),
    before = n.slice(),
    origin = at(n),
    oldGround = d(n, 17),
    grounded = d(n, 39) <= oldGround;
  if (b(n, 22) & 1 || w(n, 63) < 0)
    throw Error("Specialist attached/negative-speed physics is not admitted");
  for (let axis = 0; axis < 3; axis++)
    put(
      n,
      45 + axis * 2,
      w(n, 45 + axis * 2) +
        w(n, 51 + axis * 2) -
        (axis === 2 && !(b(n, 21) & 32) ? c.gravity : 0),
    );
  const height = (d(n, 39) + (w(n, 49) >> 3)) | 0;
  const fixed = (axis: number) =>
    ((w(n, 7 + axis * 2) << 16) +
      (b(n, 67 + axis) << 8) +
      (w(n, 45 + axis * 2) << 10)) |
    0;
  const candidates = [fixed(0), fixed(1)],
    candidate: Point = [candidates[0] >> 16, candidates[1] >> 16],
    ground = groundHeight(s.terrain, ...candidate);
  put32(n, 17, ground);
  n[23] = effectTerrainShade(s.terrain, ...candidate);
  if (height > ground) {
    setPoint(n, 7, candidate);
    n[67] = (candidates[0] >> 8) & 255;
    n[68] = (candidates[1] >> 8) & 255;
    put32(n, 39, Math.max(height, 0));
    setAngles(n, c.tables);
    if (w(n, 61) > 19200) {
      put(n, 61, 12800);
      setVelocity(n, c.tables);
    }
  } else {
    put32(n, 39, ground);
    if (grounded || b(n, 21) & 64) {
      const normal = terrainNormal(s.terrain, ...origin);
      put(n, 49, wrap16(wrap16(ground) - wrap16(oldGround)) * 8);
      setAngles(n, c.tables);
      const speed = contactSpeed(s, index, n, normal, wrap16(oldGround), c);
      put(n, 65, speed);
      put(n, 61, speed);
      setVelocity(n, c.tables);
      const moved = [fixed(0), fixed(1)];
      put(n, 7, moved[0] >> 16);
      put(n, 9, moved[1] >> 16);
      n[67] = (moved[0] >> 8) & 255;
      n[68] = (moved[1] >> 8) & 255;
      const sampled = groundHeight(s.terrain, ...at(n));
      put32(n, 17, sampled);
      put32(n, 39, sampled);
      n[23] = effectTerrainShade(s.terrain, ...at(n));
    } else {
      setPoint(n, 7, candidate);
      n[67] = (candidates[0] >> 8) & 255;
      n[68] = (candidates[1] >> 8) & 255;
      const impact = Math.trunc((w(n, 49) >> 6) / 16);
      if (impact > 0) {
        if (!c.damage)
          throw Error("Specialist fall requires actual hit callback");
        c.damage(s, index, impact);
        if (actor(s, index) !== n)
          throw Error("Specialist damage replaced retained native record");
      }
      const cls = ecologyTerrainClass(s.terrain, candidate),
        coefficient = c.bounce[cls];
      if (
        !Number.isInteger(coefficient) ||
        coefficient < -32768 ||
        coefficient > 32767
      )
        throw Error("Actual source specialist bounce coefficient is required");
      const normal = terrainNormal(s.terrain, ...candidate),
        bounced = wrap16(Math.imul(Math.abs(w(n, 49)), coefficient) >> 8);
      put(n, 49, bounced);
      for (let axis = 0; axis < 2; axis++)
        put(
          n,
          45 + axis * 2,
          w(n, 45 + axis * 2) +
            Math.trunc(Math.imul(bounced, normal[axis]) / 256),
        );
      setAngles(n, c.tables);
    }
  }
  relocated(s, index, origin, "physics", c, out);
  const phase = (s.frame + index) >>> 0;
  if (phase & 1 && d(n, 39) > d(n, 17)) {
    const hit = c.obstacle(s, at(n), 1, d(n, 39));
    if (hit) {
      const x = torusDelta(w(n, 7), hit.position[0]),
        y = torusDelta(w(n, 9), hit.position[1]),
        range = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0),
        impulse = createMotion(0, 0, 0, 0);
      impulse.yaw = heading(hit.position, at(n), c.tables);
      impulse.pitch = originalAngle(
        range,
        ((hit.ground - d(n, 39)) | 0) >> 3,
        c.tables.atan,
      );
      impulse.speed = w(n, 61) >> 1;
      velocity(impulse, c.tables);
      for (const [i, v] of [impulse.vx, impulse.vy, impulse.vz].entries())
        put(n, 45 + 2 * i, w(n, 45 + 2 * i) + v);
      setAngles(n, c.tables);
    }
  }
  if ((phase & 3) === 3 && (c.water + 320) >>> 0 >= d(n, 39) >>> 0) {
    const cls = ecologyTerrainClass(s.terrain, at(n));
    if (cls <= 1) {
      if (w(n, 61) >= 128) {
        const deep =
          !(d(before, 39) >>> 0 > c.water >>> 0) &&
          (c.water - 512) >>> 0 > d(n, 39) >>> 0;
        const request: SpecialistWaterRequest = {
          actor: index,
          code: deep ? 21 : 48,
          position: at(n),
          height: deep
            ? d(n, 39)
            : d(n, 17) >>> 0 > c.water >>> 0
              ? d(n, 17)
              : c.water,
          angles: deep ? [0, 0, 128] : [0, 0, 0],
        };
        if (!c.waterEffect)
          throw Error(
            "Specialist water contact requires actual shared factory",
          );
        c.waterEffect(s, request);
        out.water = request;
        if (actor(s, index) !== n)
          throw Error(
            "Specialist water factory replaced retained native record",
          );
      }
      if (d(n, 39) === 0 && cls === 0 && b(n, 83) & 1) {
        if (!c.damage)
          throw Error("Specialist water requires actual hit3 callback");
        c.damage(s, index, 3);
        if (actor(s, index) !== n)
          throw Error("Specialist water hit replaced retained native record");
      }
    }
  }
  if (
    b(n, 22) & 2 &&
    (phase & 3) === 3 &&
    b(n, 24) === c.selectedPlayer &&
    (w(n, 61) >= 33 || d(n, 39) > d(n, 17))
  ) {
    if (!c.reveal)
      throw Error("Specialist motion requires actual reveal callback");
    c.reveal(s, index);
  }
  put(n, 7, w(n, 7) & 32767);
  put(n, 9, w(n, 9) & 32767);
}
/** Atomic full6FB60 call, excluding control/animation (owned by57A10). */
export function stepSpecialistMotion<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: SpecialistMotionContext<W>,
): SpecialistMotionReceipt {
  const s = structuredClone(world),
    out = stepStagedSpecialistMotion(s, index, c);
  Object.assign(world, s);
  return out;
}
/** In-place6FB60 inside an already isolated57A10/host transaction. */
export function stepStagedSpecialistMotion<W extends GeneticistWorld>(
  s: W,
  index: number,
  c: SpecialistMotionContext<W>,
): SpecialistMotionReceipt {
  const n = actor(s, index),
    out: SpecialistMotionReceipt = {
      actor: index,
      arrived: false,
      relocations: [],
      water: null,
      route: "idle",
    };
  if (
    (s.specialists.bindings[index]!.category === 3 &&
      ![3, 4, 5].includes(b(n, 85))) ||
    (s.specialists.bindings[index]!.category !== 2 &&
      ![3, 4, 5].includes(b(n, 85)) &&
      !(s.specialists.bindings[index]!.category === 0 && b(n, 85) === 9) &&
      !(s.specialists.bindings[index]!.category === 1 && b(n, 85) === 10) &&
      (![1, 8].includes(b(n, 85)) || b(n, 88) & 1))
  )
    throw Error(
      "Other specialist common motion requires ordinary idle/move without active role",
    );
  const plan = route(s, index, c);
  out.route = plan.route;
  if (plan.route !== "detached") {
    steer(n, c.tables);
    physics(s, index, c, out);
    if (plan.savedSpeed !== null) put(n, 63, plan.savedSpeed);
    if (!plan.early) {
      if (w(n, 73) & 3) {
        const near = squared(s.terrain, at(n), plan.working) >>> 0;
        if (b(n, 84) <= 20) {
          if (near <= 4096) n[73] = b(n, 73) | 8;
        } else if (w(n, 61) <= 256 && d(n, 39) <= d(n, 17) && near <= 1024)
          n[73] = b(n, 73) | 3;
      } else if (b(n, 74) & 16) {
        if (flatSquared(at(n), plan.working) <= 4096) {
          put(n, 73, w(n, 73) | 0x220);
          n[74] = b(n, 74) & 239;
          out.arrived = true;
        }
      } else if (
        w(n, 61) <= 256 &&
        d(n, 39) <= d(n, 17) &&
        squared(s.terrain, at(n), plan.working) >>> 0 <= 1024
      ) {
        const before = at(n),
          destination: Point = [
            plan.working[0] & 32767,
            plan.working[1] & 32767,
          ];
        //6E9E0 BL1 preserves physical39, while resampling ground17/shade23.
        setPoint(n, 7, destination);
        put32(n, 17, groundHeight(s.terrain, ...destination));
        n[23] = effectTerrainShade(s.terrain, ...destination);
        n[67] = n[68] = 0;
        put(n, 65, 0);
        relocated(s, index, before, "arrival", c, out);
        for (const p of [45, 47, 49, 61, 63]) put(n, p, 0);
        n[84] = 0;
        put(n, 73, (w(n, 73) & 0xfdcf) | 0x220);
        n[22] = b(n, 22) & 63;
        out.arrived = true;
      }
    }
  }
  return out;
}
/**707A0 escape search used by52340 task5 after its separate610 draw. The
 * source5EC draw belongs here; no initial heading/distance is synthesized. */
export function escapeSpecialistRay<W extends GeneticistWorld>(
  world: W,
  index: number,
  headingValue: number,
  distance: number,
  c: SpecialistMotionContext<W>,
): boolean {
  const s = structuredClone(world),
    result = escapeStagedSpecialistRay(s, index, headingValue, distance, c);
  Object.assign(world, s);
  return result;
}
/** In-place variant for55200's already isolated transaction and retained refs. */
export function escapeStagedSpecialistRay<W extends GeneticistWorld>(
  s: W,
  index: number,
  headingValue: number,
  distance: number,
  c: SpecialistMotionContext<W>,
): boolean {
  const n = actor(s, index),
    draw = nextRandom(s.rng),
    direction = draw % 2 === 0 ? -128 : 128;
  let yaw = headingValue & 2047;
  if (!Number.isInteger(distance) || distance < 0 || distance > 32767)
    throw Error("Actual specialist escape distance required");
  for (let attempt = 0; attempt < 16; attempt++) {
    const t = (yaw + 1536) & 2047,
      p: Point = [
        wrap16(w(n, 7) + Math.floor((c.tables.cosine[t] * distance) / 65536)),
        wrap16(w(n, 9) + Math.floor((c.tables.sine[t] * distance) / 65536)),
      ];
    //74CC0 deliberately has no building obstacle query.
    if (
      !(b(n, 83) & (1 << ecologyTerrainClass(s.terrain, p))) &&
      c.blockerWeight(s, index, p) < 10
    ) {
      n[84] = 20;
      setPoint(n, 11, p);
      put(n, 73, (w(n, 73) | 20) & 0xeffc);
      n[22] = b(n, 22) & 63;
      n[79] = n[82] = 0;
      put(n, 57, heading(at(n), p, c.tables));
      //The caller's ECX=1 survives this path: source leaves4A-bit10 unchanged.
      return true;
    }
    yaw = (yaw + direction) & 2047;
  }
  put(n, 73, (w(n, 73) & 0xeebc) | 0x140);
  n[22] = b(n, 22) & 127;
  return false;
}

/** Category2 8B130: only non-walk-through kind2 plants contribute ten.
 * The host provides the complete current linked chain, not a broad rectangle.
 * Other kinds have zero weight, so their unrelated native fields are not read. */
export function specialistBlockerWeight(
  n: readonly (number | null)[],
  linked: readonly (readonly (number | null)[])[],
): number {
  if (w(n, 73) & 0x800) return 0;
  let weight = 0;
  for (const entity of linked)
    if (b(entity, 6) === 2 && !(b(entity, 46) & 8)) weight = (weight + 10) | 0;
  return weight;
}
/** Source80FC0/74A50 mask0 command resolver. It does not set pending bytes. */
export function resolveSpecialistMovePoint<W extends GeneticistWorld>(
  s: W,
  index: number,
  requested: Point,
  c: SpecialistMotionContext<W>,
): Point {
  const current = at(actor(s, index));
  return flatSquared(current, requested) <= 4096
    ? current
    : resolveMovementTarget(current, requested, c.tables, (p) =>
        accepts(s, index, p, c, null, 0),
      );
}
/** Pure73AC0 standoff. The source doubles coordinates, wraps to signed words,
 * offsets away from the target, then arithmetic-halves and masks15bits. */
export function specialistApproachPoint(
  from: Point,
  target: Point,
  distance: number,
  t: MotionTables,
): Point {
  if (!Number.isInteger(distance) || distance < 0 || distance > 32767)
    throw Error("Actual specialist standoff distance required");
  const yaw = (heading(from, target, t) + 1024 + 1536) & 2047,
    length = (distance * 2) & 65535;
  return [
    (wrap16(target[0] * 2 + (Math.imul(length, t.cosine[yaw]) >> 16)) >> 1) &
      32767,
    (wrap16(target[1] * 2 + (Math.imul(length, t.sine[yaw]) >> 16)) >> 1) &
      32767,
  ];
}
/** Exact75890 fixed6-fraction3D ray.74270 is sampled on even steps; ground
 * height is tested every step. This has no RNG or source resource dependency. */
export function specialistVisibilityRay(
  terrain: TerrainState,
  from: Point,
  target: Point,
  startHeight: number,
  targetHeight: number,
  t: MotionTables,
  obstacle: (position: Point, height: number) => boolean,
): boolean {
  const xy = integerSqrt(flatSquared(from, target)),
    m = createMotion(0, 0, 0, 0);
  m.yaw = heading(from, target, t);
  m.pitch = originalAngle(xy, ((startHeight - targetHeight) | 0) >> 3, t.atan);
  m.speed = 4096;
  velocity(m, t);
  let fixed = [from[0] << 6, from[1] << 6],
    current: Point = [...from],
    height = startHeight | 0;
  for (let iteration = 0; iteration < 1024; iteration++) {
    const z = ((targetHeight - height) | 0) >> 3,
      metric = (flatSquared(current, target) + Math.imul(z, z)) >>> 0;
    if (metric <= 4096) return true;
    fixed = [(fixed[0] + m.vx) | 0, (fixed[1] + m.vy) | 0];
    height = (height + (m.vz >> 3)) | 0;
    current = [wrap16(fixed[0] >> 6), wrap16(fixed[1] >> 6)];
    if (!(iteration & 1) && obstacle(current, height)) return false;
    if (height < groundHeight(terrain, ...current)) return false;
  }
  throw Error("Specialist visibility source ray iteration limit");
}
/**54B10 caller heights are fresh terrain samples, not cached native physical39. */
export function geneticistLineOfSight<W extends GeneticistWorld>(
  s: W,
  index: number,
  target: number,
  c: SpecialistMotionContext<W>,
): boolean {
  const n = actor(s, index),
    m = ref(s, 1, target, c)!;
  return specialistVisibilityRay(
    s.terrain,
    at(n),
    at(m),
    (groundHeight(s.terrain, ...at(n)) + 1280) | 0,
    groundHeight(s.terrain, ...at(m)),
    c.tables,
    (p, height) => c.obstacle(s, p, 1, height) !== null,
  );
}
/**51CF0→75B00 actual radius; class3's fourth cell is its charge coefficient. */
export function specialistRevealRadius<W extends GeneticistWorld>(
  s: W,
  index: number,
  rules: { revealRadii: readonly number[] },
): number {
  const n = actor(s, index),
    style = s.specialists.bindings[index]!.style,
    value = rules.revealRadii[style];
  if (
    rules.revealRadii.length !== 4 ||
    !Number.isInteger(value) ||
    value < -2147483648 ||
    value > 2147483647
  )
    throw Error("Actual source specialist reveal radius cells required");
  return style === 3
    ? ((Math.imul(255 - b(n, 115), value) >> 8) + 256) | 0
    : value;
}
