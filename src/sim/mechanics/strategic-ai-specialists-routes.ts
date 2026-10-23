/**Source32FF0/33B00 waypoint control,330B0 retreat and355B0 plant choice. */
import {
  aiByte,
  aiDistance,
  aiDword,
  aiInteger,
  aiPoint,
  aiPutDword,
  aiSWord,
  aiWord,
  type StrategicNative,
} from "./strategic-ai-state";
import { strategicGroupOffset } from "./strategic-ai-groups";
import { nextRandom } from "./random";
import { originalAngle, wrap16, type MotionTables } from "./motion";
import {
  issueStrategicRoleCommand,
  specialistLocalIndex,
  strategicRolePacket,
  type StrategicRoleCommandContext,
  type StrategicSpecialistPlannerState,
} from "./strategic-ai-specialists-state";
export interface StrategicFreePointRequest {
  routine: 0x30f10;
  source: number;
  player: number;
  point: [number, number];
  constructorRadius: number;
  /**Source query numeric offsets20/21/30/34/38..42/51/52. Vtable is logical. */
  fields: Readonly<Record<number, number>>;
  predicate: 0x31d10;
}
export interface StrategicFreePointResult {
  routine: 0x30f10;
  point: [number, number] | null;
  /**Actual CH after this query. Consumed by the source retry loop. */
  retryDecrement: number;
}
export interface StrategicSpecialistRouteContext
  extends StrategicRoleCommandContext {
  tables: MotionTables;
  spreadDirections: readonly (readonly [number, number])[];
  plants(
    s: StrategicSpecialistPlannerState,
  ): readonly (readonly (number | null)[])[];
  plantProtected(s: StrategicSpecialistPlannerState, index: number): boolean;
  freePoint?(
    s: StrategicSpecialistPlannerState,
    request: StrategicFreePointRequest,
  ): StrategicFreePointResult;
}
const distance = (a: readonly number[], b: readonly number[]) =>
  Math.floor(Math.sqrt(aiDistance(a, b)));
function angle(
  a: readonly number[],
  b: readonly number[],
  c: StrategicSpecialistRouteContext,
): number {
  return (
    originalAngle(
      ((b[0] - a[0]) << 17) >> 17,
      ((b[1] - a[1]) << 17) >> 17,
      c.tables.atan,
    ) & 2047
  );
}
function offsetPoint(
  origin: [number, number],
  toward: [number, number],
  radius: number,
  c: StrategicSpecialistRouteContext,
): [number, number] {
  if (c.tables.sine.length !== 2048 || c.tables.cosine.length !== 2048)
    throw Error("Actual strategic retreat sine/cosine tables required");
  const a = (angle(origin, toward, c) - 512) & 2047;
  return [
    wrap16(toward[0] + (Math.imul(c.tables.cosine[a], radius & 65535) >> 16)),
    wrap16(toward[1] + (Math.imul(c.tables.sine[a], radius & 65535) >> 16)),
  ];
}
export function issueStrategicSpecialistCancel(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  source: number,
  c: StrategicRoleCommandContext,
): void {
  issueStrategicRoleCommand(s, c, {
    routine: 0x81150,
    source,
    player,
    specialist,
    packet: strategicRolePacket(s, c, source, { 0: specialist }, 21),
  });
}
export function issueStrategicSpecialistMove(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  point: [number, number],
  source: number,
  c: StrategicRoleCommandContext,
  cache = true,
): void {
  issueStrategicRoleCommand(
    s,
    c,
    {
      routine: 0x80fc0,
      source,
      player,
      specialist,
      packet: strategicRolePacket(
        s,
        c,
        source,
        { 0: point[0], 2: point[1], 4: specialist },
        3,
      ),
    },
    cache,
  );
}
/**Source32FF0 retries the separately retained D3 route, not the9C cache. */
export function retryStrategicSpecialistRoute(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  c: StrategicRoleCommandContext,
): void {
  const ai = s.records[player],
    local = specialistLocalIndex(s, specialist),
    at = 0x173 + local;
  if (ai[at] === 100) {
    ai[at] = 0;
    return;
  }
  if (!ai[at]) return;
  ai[at]--;
  const p = 0xd3 + local * 32 + ai[at] * 4;
  if (p + 3 >= ai.length)
    throw Error("Actual strategic retained waypoint address required");
  issueStrategicSpecialistMove(
    s,
    player,
    specialist,
    aiPoint(ai, p),
    0x33081,
    c,
    false,
  );
  if (ai[at] === 0) ai[at] = 100;
}
/**Source33B00 builds at most four ordered waypoints around the actual building
 * and executes the first through32FF0. Neither pathfinding nor a modern route. */
export function routeStrategicSpecialistAroundBuilding(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  building: number,
  toward: [number, number],
  c: StrategicSpecialistRouteContext,
): void {
  if (!aiInteger(building, 0, 255))
    throw Error("Actual strategic route building required");
  const n = s.buildings[building],
    center = aiPoint(n, 7),
    r = aiByte(n, 46) * 256 + 1536,
    card = (r & 65535) + ((r & 65535) >> 2),
    offsets = [
      [0, -card],
      [r, -r],
      [card, 0],
      [r, r],
      [0, card],
      [-r, r],
      [-card, 0],
      [-r, -r],
    ],
    points = offsets.map(
      ([x, y]) =>
        [wrap16(center[0] + x), wrap16(center[1] + y)] as [number, number],
    ),
    from = angle(center, aiPoint(s.specialists[specialist].native, 7), c) >> 8,
    to = angle(center, toward, c) >> 8,
    delta = (to - from) & 7,
    forward = delta < 5,
    count = forward ? delta : 8 - delta,
    ai = s.records[player],
    local = specialistLocalIndex(s, specialist);
  ai[0x173 + local] = count;
  let direction = forward ? (from + 1) & 7 : from;
  for (let i = count - 1; i >= 0; i--) {
    const p = 0xd3 + local * 32 + i * 4,
      point = points[direction];
    aiPutDword(ai, p, (point[0] & 65535) | (point[1] << 16));
    direction = (direction + (forward ? 1 : -1)) & 7;
  }
  retryStrategicSpecialistRoute(s, player, specialist, c);
}
/**355B0 excludes plant flag8 and groups within source radius, then selects the
 * strict nearest with early6400² exit; its fallback is first eligible plant. */
export function chooseStrategicPlantWork(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  c: StrategicSpecialistRouteContext,
): [number, number] | null {
  const plants = c.plants(s);
  if (plants.length !== 512)
    throw Error("Actual strategic512-plant pool required");
  const ai = s.records[player],
    position = aiPoint(s.specialists[specialist].native, 7);
  let chosen: [number, number] | null = null,
    best = 0x80000000;
  const eligible = (i: number) => {
    if (plants[i].length !== 49)
      throw Error("Actual strategic plant native49 required");
    return (
      !!aiByte(plants[i], 6) &&
      !c.plantProtected(s, i) &&
      !(aiByte(plants[i], 46) & 8)
    );
  };
  for (let i = 0; i < 512; i++) {
    if (!eligible(i)) continue;
    const point = aiPoint(plants[i], 7),
      range = aiDistance(position, point);
    let allowed = true;
    for (let g = 0; g < 16; g++) {
      const at = strategicGroupOffset(g);
      if (aiSWord(ai, at + 4) < 0) continue;
      let d = aiDistance(aiPoint(ai, at), point);
      if (ai[at + 9] === 4) d = Math.imul(d, 2) >>> 0;
      if (d < 0x640000) {
        allowed = false;
        break;
      }
    }
    if (allowed && range < best) {
      chosen = point;
      best = range;
      if (range < 0x2710000) break;
    }
  }
  if (!chosen)
    for (let i = 0; i < 512; i++) if (eligible(i)) return aiPoint(plants[i], 7);
  return chosen;
}
function query(
  s: StrategicSpecialistPlannerState,
  player: number,
  source: number,
  point: [number, number],
  radius: number,
  extent: number,
  count: number,
  c: StrategicSpecialistRouteContext,
): StrategicFreePointResult {
  if (!c.freePoint)
    throw Error(
      "Strategic specialist30F10 free-position query is not implemented",
    );
  const request: StrategicFreePointRequest = {
      routine: 0x30f10,
      source,
      player,
      point,
      constructorRadius: radius,
      predicate: 0x31d10,
      fields: {
        20: 0,
        21: 255,
        30: extent >>> 0,
        34: radius,
        38: (radius >> 8) & 255,
        39: 0,
        40: count,
        41: 0,
        42: 1,
        51: 14,
        52: count,
      },
    },
    result = c.freePoint(s, request);
  if (
    result?.routine !== 0x30f10 ||
    !aiInteger(result.retryDecrement, 1, 127) ||
    (result.point !== null &&
      (!Array.isArray(result.point) ||
        result.point.length !== 2 ||
        result.point.some((v) => !aiInteger(v, -32768, 32767))))
  )
    throw Error("Actual strategic30F10 query afterimage required");
  return result;
}
/**330B0: nearest own selector12 refuge, source side/radius decisions and exact
 * no-refuge random/angle fallback. Caller supplies the actual threat view. */
export function retreatStrategicSpecialist(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  threat: readonly (number | null)[] | null,
  c: StrategicSpecialistRouteContext,
): void {
  const ai = s.records[player],
    n = s.specialists[specialist].native,
    position = aiPoint(n, 7);
  let refuge: StrategicNative | null = null,
    best = 0x40000000;
  if (s.players[player][0x60c])
    for (let i = player * 64; i < player * 64 + 64; i++) {
      const b = s.buildings[i];
      if (!aiByte(b, 6) || aiWord(b, 49) & 0x100 || aiByte(b, 45) !== 12)
        continue;
      const d = distance(position, aiPoint(b, 7));
      if (d < best) {
        best = d;
        refuge = b;
      }
    }
  if (!refuge) {
    issueStrategicSpecialistCancel(s, player, specialist, 0x33691, c);
    const base = aiPoint(s.players[player], 0x5fc);
    if (distance(position, base) > 0x1400) {
      if (c.spreadDirections.length !== 9)
        throw Error("Actual strategic spread directions required");
      const direction = c.spreadDirections[nextRandom(s.rng) % 8];
      issueStrategicSpecialistMove(
        s,
        player,
        specialist,
        [
          wrap16(position[0] + direction[0] * 20),
          wrap16(position[1] + direction[1] * 20),
        ],
        0x33aed,
        c,
      );
      return;
    }
    const point = offsetPoint(position, base, 0xa00, c),
      result = query(s, player, 0x33a07, point, 0x500, 0x190000, 1, c);
    if (result.point)
      issueStrategicSpecialistMove(
        s,
        player,
        specialist,
        result.point,
        0x33aed,
        c,
      );
    return;
  }
  if (!threat) throw Error("Actual strategic330B0 threat native view required");
  const center = aiPoint(refuge, 7),
    r = aiByte(refuge, 46) * 256 + 1536,
    ownSide = (best >= r ? 1 : 0) + 1,
    otherSide = (distance(aiPoint(threat, 7), center) >= r ? 1 : 0) + 1;
  if (!(ownSide & otherSide)) {
    issueStrategicSpecialistCancel(s, player, specialist, 0x3361c, c);
    ai[0x173 + specialistLocalIndex(s, specialist)] = 0;
    return;
  }
  issueStrategicSpecialistCancel(
    s,
    player,
    specialist,
    ownSide === 2 ? 0x331fa : 0x333bd,
    c,
  );
  if (ownSide === 2) {
    for (let count = 3; count > 0; ) {
      const result = query(
        s,
        player,
        0x332a2,
        center,
        r,
        Math.imul(r, r),
        count,
        c,
      );
      if (result.point) {
        issueStrategicSpecialistMove(
          s,
          player,
          specialist,
          result.point,
          0x33aed,
          c,
        );
        return;
      }
      count -= result.retryDecrement;
    }
  } else {
    const point = offsetPoint(center, position, r + 1280, c),
      result = query(s, player, 0x33502, point, 0x400, 0x100000, 1, c);
    if (result.point)
      issueStrategicSpecialistMove(
        s,
        player,
        specialist,
        result.point,
        0x33aed,
        c,
      );
  }
}
