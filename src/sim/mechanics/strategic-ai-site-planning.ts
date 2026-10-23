/**3A1E0 construction site selection and32230 expansion search. These functions
 * run inside the strategic transaction; they retain source traversal/RNG order. */
import { ecologyTerrainClass, type PlantRule } from "./ecology";
import { wrap16 } from "./motion";
import { groundHeight, integerSqrt, worldCell } from "./terrain";
import {
  aiByte,
  aiDistance,
  aiInteger,
  aiPoint,
  aiPutDword,
  aiWord,
  validateStrategicAIState,
  type StrategicAIState,
} from "./strategic-ai-state";
import {
  queryStrategicFreePoint,
  queryStrategicResources,
  queryStrategicSite,
  visitStrategicGrid,
  visitStrategicRing,
  type StrategicSpatialContext,
} from "./strategic-ai-spatial";
import {
  strategicEngineerBuildingAvailable,
  type StrategicEngineerContext,
  type StrategicEngineerRules,
  type StrategicEngineerSiteRequest,
  type StrategicEngineerSiteResult,
} from "./strategic-ai-engineer";
import {
  cloneStrategicSpecialistPlanner,
  validateStrategicPlannerMetadata,
  type StrategicSpecialistPlannerState,
} from "./strategic-ai-specialists-state";

type Point = [number, number];
export interface StrategicSitePlanningContext
  extends Omit<StrategicSpatialContext, "plantValues"> {
  activePlayerCount: number;
  rules: StrategicEngineerRules;
  plantValues: readonly PlantRule[];
}
export type StrategicExpansionRequest = Parameters<
  NonNullable<StrategicEngineerContext["expansionSite"]>
>[1];
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const signedByte = (n: number) => (n << 24) >> 24;
function owner(s: StrategicAIState, p: number): number {
  if (!aiInteger(p, 0, 3) || !s.records[p] || s.records[p][4] !== p)
    throw Error("Actual strategic site owner required");
  return p;
}
function footprint(c: StrategicSitePlanningContext, selector: number): number {
  const value = c.rules.buildingFootprints[selector];
  if (!aiInteger(value, 0, 3))
    throw Error("Actual strategic site footprint required");
  return value;
}
function align(p: Point, size: number): Point {
  if (size === 2) return [p[0] & ~255, p[1] & ~255];
  if (size === 1 || size === 3)
    return [(p[0] & ~255) | 127, (p[1] & ~255) | 127];
  //75080 leaves EBX unchanged for unsupported sizes; no point is fabricated.
  throw Error("Source75080 requires footprint1..3 at this site-planning call");
}
function owned(
  s: StrategicAIState,
  p: number,
  classification: number,
  exact = false,
) {
  const a = s.records[p],
    out: number[] = [];
  for (let i = 0; i < 64; i++)
    if (
      aiByte(s.buildings[p * 64 + i], 6) &&
      ((!exact && !classification) || aiByte(a, 0x55 + i) === classification)
    )
      out.push(p * 64 + i);
  return out;
}
/** The source averages truncated signed cell coordinates, not circular points. */
function center(s: StrategicAIState, p: number, classification: number): Point {
  if (!classification) return aiPoint(s.players[p], 0x5fc);
  const rows = owned(s, p, classification, true),
    sum: Point = [0, 0];
  for (const i of rows) {
    const p = aiPoint(s.buildings[i], 7);
    sum[0] += Math.trunc(p[0] / 256);
    sum[1] += Math.trunc(p[1] / 256);
  }
  return rows.length
    ? [
        wrap16(Math.trunc(sum[0] / rows.length) * 256),
        wrap16(Math.trunc(sum[1] / rows.length) * 256),
      ]
    : [0, 0];
}
/**305F0 has no octant mask and begins at ring0. A stop flag suppresses the next
 * octant batch, while calls already in its current eight-point batch still run. */
function rings(
  origin: Point,
  radius: number,
  aligned: number,
  stopped: () => boolean,
  visit: (p: Point, ring: number) => void,
): void {
  const start = aligned ? align(origin, aligned) : origin,
    max = radius >>> 8,
    square = Math.imul(radius, radius) >>> 0;
  if (max > 255) throw Error("Source305F0 byte ring would not terminate");
  const sample = (x: number, y: number, ring: number) => {
    const p: Point = [wrap16(start[0] + x * 256), wrap16(start[1] + y * 256)];
    if (!ring || aiDistance(p, origin) <= square) visit(p, ring);
  };
  for (let ring = 0; ring <= max; ring++)
    for (let u = 0; u <= ring; u++) {
      if (stopped()) continue;
      if (!ring) {
        sample(0, 0, 0);
        continue;
      }
      if (u) {
        sample(u, ring, ring);
        sample(ring, -u, ring);
        sample(-u, -ring, ring);
        sample(-ring, u, ring);
      }
      if (u !== ring) {
        sample(ring, u, ring);
        sample(u, -ring, ring);
        sample(-ring, -u, ring);
        sample(-u, ring, ring);
      }
    }
}
const blocked = (
  s: StrategicAIState,
  p: Point,
  size: number,
  c: StrategicSitePlanningContext,
) =>
  queryStrategicSite(
    s,
    { routine: 0x74e80, point: p, footprint: size, discriminator: 100 },
    c,
  ).blocked;
const dry = (s: StrategicAIState, p: Point, c: StrategicSitePlanningContext) =>
  groundHeight(c.terrain(s), ...p) > c.water * 2;
/**432C0 walks the owning64 buildings and accepts completed Photon reach. */
export function strategicSitePowered(
  s: StrategicAIState,
  constructionOwner: number,
  p: Point,
): boolean {
  owner(s, constructionOwner);
  for (let i = constructionOwner * 64; i < constructionOwner * 64 + 64; i++) {
    const n = s.buildings[i];
    if (aiByte(n, 6) && aiWord(n, 49) & 1 && aiByte(n, 45) === 3) {
      const reach = aiByte(n, 46) * 0x300 + 0x600;
      if (aiDistance(p, aiPoint(n, 7)) <= Math.imul(reach, reach) >>> 0)
        return true;
    }
  }
  return false;
}
/**318E0/319D0 scores12 species without research, water or occupancy gates. */
function plantScore(
  s: StrategicAIState,
  origin: Point,
  nutrition: boolean,
  c: StrategicSitePlanningContext,
): number {
  if (c.plantValues.length !== 12)
    throw Error("Actual12 strategic plant rows required");
  const offsets = c.plantValues.map((r) => {
      for (const v of [
        r.walkSteps,
        r.checkThreshold,
        r.crowdingLimit,
        r.spreadPeriod,
        r.nutrition,
        r.retirementDelay,
      ])
        if (!aiInteger(v, 0, 255))
          throw Error("Actual strategic site plant value bytes required");
      if (
        r.growthDeltas.length !== 8 ||
        r.growthDeltas.some((v) => !aiInteger(v, -128, 127))
      )
        throw Error("Actual strategic site plant growth deltas required");
      return signedByte(
        r.walkSteps + r.checkThreshold + r.crowdingLimit - r.spreadPeriod,
      );
    }),
    scores = Array(12).fill(0);
  let best = 0;
  visitStrategicGrid(s, origin, 0x600, 0x240000, (p) => {
    const terrainClass = ecologyTerrainClass(c.terrain(s), p);
    c.plantValues.forEach((r, i) => {
      scores[i] =
        (scores[i] +
          offsets[i] +
          3 * (nutrition ? r.nutrition : r.retirementDelay) +
          3 * r.growthDeltas[terrainClass]) |
        0;
      if (scores[i] > best) best = scores[i];
    });
  });
  return best;
}
/**32230 tests the retained query+23 origin against player settlements. The
 * current ring point is used for land and value only. This source distinction
 * is intentional, including the source found flag preceding the best-point update. */
export function queryStrategicExpansion(
  s: StrategicAIState,
  r: StrategicExpansionRequest,
  c: StrategicSitePlanningContext,
): { routine: 0x320e0; point: Point | null } {
  if (
    r.routine !== 0x320e0 ||
    r.predicate !== 0x32230 ||
    !aiInteger(c.activePlayerCount, 0, 4)
  )
    throw Error("Actual32230 expansion context required");
  owner(s, r.owner);
  let found = false,
    best = 0,
    selected: Point | null = null;
  visitStrategicRing(r.point, r.radius, r.interval, c, (p) => {
    if (!(c.terrain(s).bytes[worldCell(...p) * 14 + 5] & 7)) return;
    let allowed = true;
    for (let other = 0; other < c.activePlayerCount; other++) {
      if (other === r.owner) {
        for (let group = 0; group < aiByte(s.records[other], 0x95); group++)
          if (
            integerSqrt(aiDistance(r.point, center(s, other, group))) + 0x300 <
            aiByte(s.records[r.owner], 0x634) * 256
          ) {
            allowed = false;
            break;
          }
      } else if (aiByte(s.players[other], 2)) {
        for (let group = 0; group < aiByte(s.records[other], 0x95); group++)
          if (
            integerSqrt(aiDistance(r.point, center(s, other, group))) <
            aiByte(s.records[r.owner], 0x633) * 256
          ) {
            allowed = false;
            break;
          }
      } else {
        const origin = aiPoint(
          s.players[other],
          (s.players[other][0x4a2] << 24) >> 24 > 0 ? 9 : 0x5fc,
        );
        if (
          integerSqrt(aiDistance(r.point, origin)) <
          aiByte(s.records[r.owner], 0x633) * 256
        )
          allowed = false;
      }
    }
    if (!allowed) return;
    found = true;
    let score = 0;
    const radius = aiByte(s.records[r.owner], 0x657) * 256;
    visitStrategicGrid(
      s,
      p,
      radius,
      Math.imul(radius, radius) >>> 0,
      (_p, cell) => {
        const t = c.terrain(s).bytes;
        if (!(t[cell * 14 + 5] & 7)) return;
        score = (score + t[cell * 14 + 13] + 30) >>> 0;
        for (const ref of c.cellOrder(s, cell)) {
          const n = c.entity(s, ref);
          if (!n) throw Error("Actual expansion linked entity required");
          if (aiByte(n, 6) === 2) score = (score + 10) >>> 0;
        }
      },
    );
    if (score > best) {
      best = score;
      selected = p;
    }
  });
  //A successful zero-score source query has an unwritten selected point.
  if (found && !selected)
    throw Error("Successful32230 expansion has no initialized best point");
  return { routine: 0x320e0, point: selected };
}

function findSite(
  s: StrategicSpecialistPlannerState,
  p: number,
  classification: number,
  selector: number,
  initialOrigin: Point,
  radius: number,
  c: StrategicSitePlanningContext,
): { selector: number; point: Point } | null {
  let origin = initialOrigin,
    result: Point | null = null,
    stop = false;
  const size = selector === 15 ? footprint(c, 8) : footprint(c, selector);
  if (selector === 2 || selector === 4) {
    const dependent = selector === 2 ? 4 : 2;
    if (
      owned(s, p, classification).some(
        (i) => aiByte(s.buildings[i], 45) === dependent,
      )
    ) {
      const first = owned(s, p, classification, true).find(
        (i) => aiByte(s.buildings[i], 45) === dependent,
      );
      if (first !== undefined) origin = aiPoint(s.buildings[first], 7);
      rings(
        origin,
        radius,
        size,
        () => false,
        (point) => {
          if (!dry(s, point, c) || result) return;
          const permitted = !size || !blocked(s, point, size, c);
          //Source432C0 is evaluated even when74E80 has already rejected it.
          const powered = strategicSitePowered(
            s,
            aiByte(s.players[p], 0x4a1),
            point,
          );
          if (permitted && powered) result = point;
        },
      );
    } else {
      let best = 0;
      rings(
        origin,
        radius,
        size,
        () => false,
        (point) => {
          const score = plantScore(s, point, selector === 4, c),
            permitted = !size || !blocked(s, point, size, c);
          if (score > best && permitted) {
            best = score;
            result = point;
          }
        },
      );
    }
  } else if (selector === 3) {
    if (same(center(s, p, classification), origin)) {
      const range = 0x600;
      let best = 0;
      rings(
        origin,
        radius,
        size,
        () => false,
        (point) => {
          if (!dry(s, point, c)) return;
          let nearby = 0;
          rings(
            point,
            range,
            3,
            () => false,
            (sample, ring) => {
              const cell = worldCell(...sample);
              if (!c.terrain(s).bytes[cell * 14 + 5]) return;
              let first: readonly (number | null)[] | null = null;
              for (const ref of c.cellOrder(s, cell)) {
                const n = c.entity(s, ref);
                if (!n)
                  throw Error("Actual strategic building census link required");
                if (aiByte(n, 6) === 4) {
                  first = n;
                  break;
                }
              }
              if (
                first &&
                aiByte(first, 6) &&
                aiByte(first, 24) === s.records[p][4] &&
                ring < 6
              )
                nearby = (nearby + 1) & 255;
            },
          );
          if (!blocked(s, point, size, c) && nearby >= best) {
            best = nearby;
            result = point;
          }
        },
      );
      //The native query also receives a count at+39, which31FF0 never reads.
    } else {
      let best = 0;
      rings(
        origin,
        radius,
        size,
        () => stop,
        (point) => {
          if (!dry(s, point, c)) return;
          let land = 0,
            total = 0;
          visitStrategicGrid(s, point, 0x900, 0x510000, (_q, cell) => {
            total++;
            if (c.terrain(s).bytes[cell * 14 + 5]) land++;
          });
          if ((!size || !blocked(s, point, size, c)) && land > best) {
            if (
              Math.imul(land, 100) >>> 0 >=
              Math.imul(total, aiByte(s.records[p], 0x632)) >>> 0
            )
              stop = true;
            best = land;
            result = point;
          }
        },
      );
    }
  } else if (selector === 8) {
    let best = 0;
    visitStrategicGrid(
      s,
      origin,
      radius,
      Math.imul(radius, radius) >>> 0,
      (point) => {
        if (!dry(s, point, c) || blocked(s, point, size, c)) return;
        const height = groundHeight(c.terrain(s), ...point);
        if (height > best) {
          best = groundHeight(c.terrain(s), ...point);
          result = point;
        }
      },
    );
  } else if (selector === 11) {
    origin = align(origin, size);
    let best = 0;
    visitStrategicGrid(
      s,
      origin,
      radius,
      Math.imul(radius, radius) >>> 0,
      (point, cell) => {
        if (
          !(c.terrain(s).bytes[cell * 14 + 5] & 7) ||
          blocked(s, point, size, c)
        )
          return;
        const score = queryStrategicResources(
          s,
          {
            routine: 0x8d930,
            point,
            radius: 0x300,
            extentSquared: 0x90000,
            mode: 1,
            predicate: 0x31b30,
          },
          c,
        ).score;
        if (score > best) {
          best = score;
          result = point;
        }
      },
    );
  } else if (selector === 15) {
    origin = align(origin, size);
    let best = 0,
      chosen = 14;
    rings(
      origin,
      radius,
      1,
      () => false,
      (point) => {
        if (!dry(s, point, c)) return;
        let solar = 0;
        if (strategicEngineerBuildingAvailable(s, p, 8, c.rules)) {
          const aligned = align(point, footprint(c, 8)),
            height = groundHeight(c.terrain(s), ...aligned) >> 12;
          solar =
            (height > 8 ? 8 : groundHeight(c.terrain(s), ...aligned) >> 12) &
            255;
        }
        const fixed = aiByte(s.missionPrefix, 0x1c5f),
          value = Math.max(fixed, solar),
          type = fixed < solar ? 8 : 6,
          aligned = align(point, footprint(c, type));
        if (!blocked(s, aligned, footprint(c, type), c) && value > best) {
          best = value;
          chosen = type;
          result = aligned;
        }
      },
    );
    if (result) return { selector: chosen, point: result };
  } else {
    const min = selector === 6 || selector === 12 ? 0 : 4,
      free = queryStrategicFreePoint(
        s,
        {
          routine: 0x30f10,
          source: 0x3a1e0,
          player: p,
          point: origin,
          constructorRadius: radius,
          predicate: 0x31d10,
          fields: {
            20: 0,
            21: 255,
            30: Math.imul(radius, radius) >>> 0,
            34: radius,
            38: radius >>> 8,
            39: min,
            40: size,
            41: 0,
            42: 1,
            51: selector === 5 ? selector : 14,
            52: size,
          },
        },
        c,
      );
    result = free.point;
  }
  return result ? { selector, point: result } : null;
}
/** Complete3A1E0 anchor selection, eleven expanding searches, cooldown and
 * fallback. Source uses planning.owner for output/selected pool and retains the
 * AI record's own owner in centroid scans; differing identities are rejected. */
export function planStagedStrategicSite(
  s: StrategicSpecialistPlannerState,
  r: StrategicEngineerSiteRequest,
  c: StrategicSitePlanningContext,
): StrategicEngineerSiteResult {
  const p = owner(s, r.planning.player),
    a = s.records[p],
    classification = r.classification,
    selector = r.selector;
  if (
    r.routine !== 0x3a1e0 ||
    r.planning.owner !== p ||
    !aiInteger(classification, 0, 255) ||
    !aiInteger(selector, 0, 15) ||
    selector === 14
  )
    throw Error(
      "Actual3A1E0 planning identity/selector/classification required",
    );
  let origin: Point,
    radius = 0x900;
  const rows = owned(s, p, classification),
    exact = owned(s, p, classification, true),
    photon = exact.find((i) => aiByte(s.buildings[i], 45) === 3);
  if (selector === 3) {
    if (classification === 1) {
      if (!exact.length) {
        origin = aiPoint(s.players[p], 9);
        radius = 0xa00;
      } else {
        origin = center(s, p, 1);
        radius = 0x600;
      }
    } else if (!rows.length)
      origin = aiByte(s.players[p], 0x4a2)
        ? aiPoint(a, 0x6aa)
        : aiPoint(s.players[p], 9);
    else origin = center(s, p, classification);
  } else if (selector === 11) {
    if (!owned(s, p, 0).length) {
      origin = aiPoint(s.players[p], 9);
      radius = 0xe00;
    } else {
      const index = p * 64 + aiByte(a, 0x5e7 + classification),
        n = s.buildings[index];
      if (!n)
        throw Error("Actual3A1E0 retained selected building outside pool");
      if (aiByte(n, 6)) {
        origin = aiPoint(n, 7);
        radius = aiByte(n, 46) * 0x300 + 0x600;
      } else origin = center(s, p, classification);
    }
  } else if (selector === 12)
    origin =
      photon === undefined
        ? center(s, p, classification)
        : aiPoint(s.buildings[photon], 7);
  else if (photon !== undefined) {
    origin = aiPoint(s.buildings[photon], 7);
    radius = aiByte(s.buildings[photon], 46) * 0x300 + 0x600;
  } else if (rows.length) origin = center(s, p, classification);
  else {
    const class1 = owned(s, p, 1, true),
      seed = class1.length ? center(s, p, 1) : aiPoint(s.players[p], 9),
      count = aiByte(a, 0x658),
      interval = count ? Math.trunc(2048 / count) : 256;
    const expansion = queryStrategicExpansion(
      s,
      {
        routine: 0x320e0,
        source: 0x3a0e7,
        owner: p,
        point: seed,
        interval: interval < 1 || interval > 2048 ? 256 : interval,
        radius: aiByte(a, 0x634) * 256,
        extentSquared:
          Math.imul(aiByte(a, 0x634) * 256, aiByte(a, 0x634) * 256) >>> 0,
        predicate: 0x32230,
      },
      c,
    );
    if (expansion.point) {
      aiPutDword(
        a,
        0x6aa,
        (expansion.point[0] & 65535) | (expansion.point[1] << 16),
      );
    } else {
      a[0x626] = aiByte(a, 0x95);
      if (aiByte(a, 0x95) < aiByte(a, 0x6bd)) a[0x6bd] = 1;
    }
    origin = aiPoint(a, 0x6aa);
  }
  for (let attempt = 0; attempt <= 10; attempt++, radius += 0x200) {
    const result = findSite(s, p, classification, selector, origin!, radius, c);
    if (result) return { routine: 0x3a1e0, ...result };
  }
  aiPutDword(a, 0xe + selector * 4, 2000);
  return { routine: 0x3a1e0, selector: 14, point: aiPoint(s.players[p], 9) };
}
export function stepStrategicSite(
  s: StrategicSpecialistPlannerState,
  r: StrategicEngineerSiteRequest,
  c: StrategicSitePlanningContext,
): StrategicEngineerSiteResult {
  validateStrategicAIState(s);
  validateStrategicPlannerMetadata(s);
  const staged = cloneStrategicSpecialistPlanner(s),
    result = planStagedStrategicSite(staged, r, c);
  validateStrategicAIState(staged);
  validateStrategicPlannerMetadata(staged);
  Object.assign(s, staged);
  return result;
}
export const makeStrategicSitePlanningServices = (
  c: StrategicSitePlanningContext,
) => ({
  planSite: (
    s: StrategicSpecialistPlannerState,
    r: StrategicEngineerSiteRequest,
  ) => planStagedStrategicSite(s, r, c),
  expansionSite: (
    s: StrategicSpecialistPlannerState,
    r: StrategicExpansionRequest,
  ) => queryStrategicExpansion(s, r, c),
});
