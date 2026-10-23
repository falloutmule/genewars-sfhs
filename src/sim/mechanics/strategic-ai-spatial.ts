/** Source spatial queries used by the strategic specialist/construction plans.
 * Call inside the caller's staged transaction. Only8D7B0 mode1 changes RNG. */
import { classifyConstructionSite } from "./construction";
import { ecologyTerrainClass } from "./ecology";
import { wrap16, type MotionTables } from "./motion";
import { queryMuleAirborneBuilding } from "./mule";
import { nextRandom } from "./random";
import { groundHeight, worldCell, type TerrainState } from "./terrain";
import { aiByte, aiDistance, aiDword, aiInteger, type StrategicAIState } from "./strategic-ai-state";
import type { StrategicSurveyContext } from "./strategic-ai-survey";
import type { StrategicFreePointRequest, StrategicFreePointResult } from "./strategic-ai-specialists-routes";
import type { StrategicPlantDensityRequest, StrategicPlantStyleRequest } from "./strategic-ai-specialists";

type Point = [number, number];
export interface StrategicSpatialContext extends Pick<StrategicSurveyContext, "cellOrder" | "entity" | "protectedTarget"> {
  terrain(s: StrategicAIState): TerrainState;
  water: number;
  tables: Pick<MotionTables, "sine" | "cosine">;
  plantValues: readonly { growthDeltas: readonly number[]; crowdingLimit: number; nutrition: number }[];
  footprintSearchOffsets?: readonly (readonly [number, number])[];
}
function point(p: readonly number[]): asserts p is Point {
  if (p.length !== 2 || p.some(v => !aiInteger(v, -32768, 32767))) throw Error("Actual strategic spatial signed point required");
}
function* native(s: StrategicAIState, cell: number, c: StrategicSpatialContext) {
  for (const reference of c.cellOrder(s, cell)) {
    const n = c.entity(s, reference);
    if (!n) throw Error("Actual linked strategic spatial entity required");
    yield { reference, n };
  }
}
/**8B340 mask0: protected plants do not block.32A70 deliberately does count them. */
export function strategicPlantBlocked(s: StrategicAIState, cell: number, c: StrategicSpatialContext): boolean {
  for (const { reference, n } of native(s, cell, c))
    if (aiByte(n, 6) === 2 && !c.protectedTarget(s, reference)) return true;
  return false;
}
/**74160 mask0 with source first-building rejection semantics and no height test. */
function buildingBlocked(s: StrategicAIState, p: Point, c: StrategicSpatialContext): boolean {
  return !!queryMuleAirborneBuilding(c.terrain(s), p, -1, cell => {
    for (const { n } of native(s, cell, c)) if (aiByte(n, 6) === 4) return n as (number | null)[];
    return null;
  }, () => { throw Error("Negative-height strategic query unexpectedly requested ANB height"); }, 0, c.footprintSearchOffsets);
}
/**8D7B0/8D930: two independent signed axes, source X-outer/Y-inner order.
 * The returned point is the actual terminal cursor, not a selected point. */
export function visitStrategicGrid(s: StrategicAIState, origin: Point, radius: number,
  extentSquared: number, visit: (p: Point, cell: number) => void): Point {
  point(origin);
  if (!aiInteger(radius, 0, 32767) || !aiInteger(extentSquared, 0, 0xffffffff))
    throw Error("Actual strategic query radius/extent required");
  const sx = nextRandom(s.rng) % 2 ? -256 : 256, sy = nextRandom(s.rng) % 2 ? -256 : 256,
    extent = radius >>> 8;
  for (let x = -extent; x <= extent; x++) for (let y = -extent; y <= extent; y++) {
    const p: Point = [wrap16(origin[0] + x * sx), wrap16(origin[1] + y * sy)];
    if (aiDistance(p, origin) <= extentSquared) visit(p, worldCell(...p));
  }
  return [wrap16(origin[0] + (extent + 1) * sx), wrap16(origin[1] + (extent + 1) * sy)];
}
export function queryStrategicPlantDensity(s: StrategicAIState, r: StrategicPlantDensityRequest,
  c: StrategicSpatialContext): { routine: 0x8d930; count: number } {
  if (r.routine !== 0x8d930 || r.mode !== 1 || r.predicate !== 0x32a70) throw Error("Actual32A70 density request required");
  let count = 0;
  visitStrategicGrid(s, r.point, r.radius, r.extentSquared, (_p, cell) => {
    for (const { n } of native(s, cell, c)) if (aiByte(n, 6) === 2) count = (count + 1) >>> 0;
  });
  return { routine: 0x8d930, count };
}
/**112708→31B30 sums actual cell minerals, with no land/occupancy filter. */
export function queryStrategicResources(s: StrategicAIState,
  r: { routine: 0x8d930; point: Point; radius: number; extentSquared: number; mode: 1; predicate: 0x31b30 },
  c: StrategicSpatialContext): { routine: 0x8d930; score: number } {
  if (r.routine !== 0x8d930 || r.mode !== 1 || r.predicate !== 0x31b30) throw Error("Actual31B30 resource request required");
  let score = 0;
  visitStrategicGrid(s, r.point, r.radius, r.extentSquared, (_p, cell) => { score = (score + c.terrain(s).bytes[cell * 14 + 13]) >>> 0; });
  return { routine: 0x8d930, score };
}
/**74E80's discriminator defaults to100 for Engineer planning.31D10 passes14. */
export function queryStrategicSite(s: StrategicAIState, r: { routine: 0x74e80; point: Point; footprint: number; discriminator?: number },
  c: StrategicSpatialContext): { routine: 0x74e80; blocked: boolean } {
  if (r.routine !== 0x74e80) throw Error("Actual74E80 site request required");
  point(r.point);
  return { routine: 0x74e80, blocked: classifyConstructionSite(c.terrain(s), r.point, r.footprint,
    r.discriminator ?? 100, cell => strategicPlantBlocked(s, cell, c)) !== "valid" };
}
interface PlantScore { found: boolean; style: number; best: number; point: Point; scores: number[]; }
/**32750/32630 accumulates signed per-species scores across all eligible samples.
 * The constructor wraps(crowding+nutrition) to a byte before sign extension. */
function plantScore(s: StrategicAIState, origin: Point, owner: number, c: StrategicSpatialContext): PlantScore {
  if (!aiInteger(owner, 0, 3) || c.plantValues.length !== 12) throw Error("Actual strategic plant owner/12 rows required");
  const weights = c.plantValues.map(row => {
    if (row.growthDeltas.length !== 8 || row.growthDeltas.some(v => !aiInteger(v, -128, 127)) ||
      !aiInteger(row.crowdingLimit, 0, 255) || !aiInteger(row.nutrition, 0, 255)) throw Error("Actual strategic plant suitability/value row required");
    return ((row.crowdingLimit + row.nutrition) << 24) >> 24;
  }), out: PlantScore = { found: false, style: 12, best: -1, point: origin, scores: Array(12).fill(0) };
  out.point = visitStrategicGrid(s, origin, 0x500, 0x190000, (p, cell) => {
    if (!(c.terrain(s).bytes[cell * 14 + 5] & 7) || strategicPlantBlocked(s, cell, c) || buildingBlocked(s, p, c)) return;
    for (let i = 0; i < 12; i++) {
      if ((aiDword(s.players[owner], 0x67e + i * 4) | 0) <= 0) continue;
      const terrainClass = ecologyTerrainClass(c.terrain(s), p);
      out.scores[i] = (out.scores[i] + c.plantValues[i].growthDeltas[terrainClass] * 5 + weights[i]) | 0;
      if (out.scores[i] > out.best) { out.found = true; out.best = out.scores[i]; out.style = i; }
    }
  });
  return out;
}
/**320E0 angular search uses signed64 multiplication, not overflowing32-bit imul. */
export function visitStrategicRing(origin: Point, radius: number, interval: number,
  c: Pick<StrategicSpatialContext, "tables">, visit: (p: Point) => void): void {
  point(origin);
  if (!aiInteger(radius, -0x80000000, 0x7fffffff) || !aiInteger(interval, 1, 65535) ||
    c.tables.sine.length !== 2048 || c.tables.cosine.length !== 2048) throw Error("Actual strategic angular query tables/radius/interval required");
  for (let angle = 0x500; angle <= 0xcff; angle += interval) {
    const index = ((angle & 2047) - 512) & 2047,
      offset = (v: number) => Number((BigInt(v) * BigInt(radius)) >> 16n);
    visit([wrap16(origin[0] + offset(c.tables.cosine[index])), wrap16(origin[1] + offset(c.tables.sine[index]))]);
  }
}
export function queryStrategicPlantStyle(s: StrategicAIState, r: StrategicPlantStyleRequest,
  c: StrategicSpatialContext): { routine: StrategicPlantStyleRequest["routine"]; found: boolean; point: Point; style: number } {
  if (r.routine === 0x8d930 && r.predicate === 0x32630 && r.mode === 1) {
    const out = plantScore(s, r.point, r.player, c);
    return { routine: r.routine, found: out.found, point: out.point, style: out.style };
  }
  if (r.routine !== 0x320e0 || r.predicate !== 0x327e0 || r.mode !== 0x56) throw Error("Actual strategic plant-style request required");
  let best = 0, found = false, style = 12, selected: Point = [...r.point];
  visitStrategicRing(r.point, r.radius, r.mode, c, p => {
    if (!(c.terrain(s).bytes[worldCell(...p) * 14 + 5] & 7)) return;
    const nested = plantScore(s, p, r.player, c);
    if (nested.best > best) { best = nested.best; found = true; style = nested.style; selected = p; }
  });
  return { routine: r.routine, found, point: selected, style };
}
/**30F10/31D10 scans every source ring even after selecting its first point.
 *31D10 sets14(found), not29(stop). The latter only suppresses whole octants.
 *30F10 saves/restores ECX; these330B0 callers enter with CH=1. */
export function queryStrategicFreePoint(s: StrategicAIState, r: StrategicFreePointRequest,
  c: StrategicSpatialContext): StrategicFreePointResult {
  point(r.point);
  if (r.routine !== 0x30f10 || r.predicate !== 0x31d10) throw Error("Actual31D10 free-point request required");
  const f = r.fields, byte = (p: number) => { const v = f[p]; if (!aiInteger(v, 0, 255)) throw Error(`Actual strategic free query field${p} required`); return v; },
    align = byte(40), extent = f[30] >>> 0, maximum = byte(38), minimum = byte(39), mask = byte(21),
    outward = byte(42) !== 0, footprint = byte(52), discriminator = byte(51),
    center: Point = align ? r.point.map(v => (v & ~255) | (align === 2 ? 0 : 127)) as Point : [...r.point];
  if (maximum > 127 || minimum > maximum || align > 3 || footprint > 3 || byte(20) || byte(41) ||
    !aiInteger(f[30], 0, 0xffffffff) || !aiInteger(c.water, -32768, 32767)) throw Error("Unsupported source free-point query extent/initial flags");
  let selected: Point | null = null;
  const visit = (dx: number, dy: number, ring: number) => {
    const p: Point = [wrap16(center[0] + dx * 256), wrap16(center[1] + dy * 256)];
    if (ring && aiDistance(p, r.point) > extent) return;
    if (groundHeight(c.terrain(s), ...p) <= c.water * 2 || selected) return;
    if (footprint && queryStrategicSite(s, { routine: 0x74e80, point: p, footprint, discriminator }, c).blocked) return;
    selected = p;
  };
  for (let ring = outward ? minimum : maximum; outward ? ring <= maximum : ring >= minimum; ring += outward ? 1 : -1)
    for (let u = 0; u <= ring; u++) {
      if (!ring) { visit(0, 0, 0); continue; }
      //31D10 still reads ground on later visits, but skips further site queries.
      if (u !== ring) {
        if (mask & 1) visit(u, ring, ring);
        if (mask & 4) visit(ring, -u, ring);
        if (mask & 16) visit(-u, -ring, ring);
        if (mask & 64) visit(-ring, u, ring);
      }
      if (u) {
        if (mask & 2) visit(ring, u, ring);
        if (mask & 8) visit(u, -ring, ring);
        if (mask & 32) visit(-ring, -u, ring);
        if (mask & 128) visit(-u, ring, ring);
      }
    }
  return { routine: 0x30f10, point: selected, retryDecrement: 1 };
}
export const makeStrategicSpatialServices = (c: StrategicSpatialContext) => ({
  freePoint: (s: StrategicAIState, r: StrategicFreePointRequest) => queryStrategicFreePoint(s, r, c),
  plantDensity: (s: StrategicAIState, r: StrategicPlantDensityRequest) => queryStrategicPlantDensity(s, r, c),
  plantStyle: (s: StrategicAIState, r: StrategicPlantStyleRequest) => queryStrategicPlantStyle(s, r, c),
  resourceScore: (s: StrategicAIState, r: Parameters<typeof queryStrategicResources>[1]) => queryStrategicResources(s, r, c),
  siteBlocked: (s: StrategicAIState, r: Parameters<typeof queryStrategicSite>[1]) => queryStrategicSite(s, r, c),
  terrainHeight: (s: StrategicAIState, p: Point) => groundHeight(c.terrain(s), ...p),
});
