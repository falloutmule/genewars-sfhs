import { describe, expect, it } from "vitest";
import { strategicFixture } from "./fixtures/strategic-production";
import { aiPutDword, aiPutWord } from "../src/sim/mechanics/strategic-ai-state";
import { queryStrategicFreePoint, queryStrategicPlantDensity, queryStrategicPlantStyle, queryStrategicResources,
  queryStrategicSite, visitStrategicGrid, visitStrategicRing, type StrategicSpatialContext } from "../src/sim/mechanics/strategic-ai-spatial";
import { terrainFromBytes, worldCell } from "../src/sim/mechanics/terrain";
import type { StrategicSurveyReference } from "../src/sim/mechanics/strategic-ai-survey";
import type { StrategicFreePointRequest } from "../src/sim/mechanics/strategic-ai-specialists-routes";
function fixture() {
  const s = strategicFixture(), terrain = terrainFromBytes(Array(128 * 128 * 14).fill(0)),
    cells = new Map<number, StrategicSurveyReference[]>(), plants = Array.from({ length: 512 }, () => Array(49).fill(0)),
    protectedPlants: number[] = [], visits: number[] = [],
    plantValues = Array.from({ length: 12 }, () => ({ growthDeltas: Array(8).fill(1), crowdingLimit: 0, nutrition: 0 }));
  for (let i = 0; i < 16384; i++) { terrain.bytes[i * 14 + 2] = 100; terrain.bytes[i * 14 + 5] = 2; }
  const c: StrategicSpatialContext = { water: 0, terrain: () => terrain,
    tables: { sine: Array.from({ length: 2048 }, (_, a) => Math.round(Math.sin(a * Math.PI / 1024) * 65536)),
      cosine: Array.from({ length: 2048 }, (_, a) => Math.round(Math.cos(a * Math.PI / 1024) * 65536)) },
    plantValues,
    cellOrder: (_s, cell) => { visits.push(cell); return cells.get(cell) ?? []; },
    entity: (w, r) => r.kind === 2 ? plants[r.index] : r.kind === 4 ? w.buildings[r.index] : w.creatures[r.index],
    protectedTarget: (_s, r) => r.kind === 2 && protectedPlants.includes(r.index),
  };
  const place = (kind: 1 | 2 | 4, index: number, x = 8192, y = 8192) => {
    const ref = { kind, index }, n = c.entity(s, ref)! as number[]; n[6] = kind;
    aiPutWord(n, 7, x); aiPutWord(n, 9, y); aiPutWord(n, 15, index);
    const cell = worldCell(x, y); cells.set(cell, [...cells.get(cell) ?? [], ref]); return n;
  };
  const free = (changes: Record<number, number> = {}, p: [number, number] = [8192, 8192]): StrategicFreePointRequest => ({
    routine: 0x30f10, source: 0x332a2, player: 1, point: p, constructorRadius: 512, predicate: 0x31d10,
    fields: { 20: 0, 21: 255, 30: 0x40000, 34: 512, 38: 2, 39: 0, 40: 0, 41: 0, 42: 1, 51: 14, 52: 0, ...changes },
  });
  const density = () => queryStrategicPlantDensity(s, { routine: 0x8d930, source: 0x34eae, point: [8192, 8192], radius: 0x500,
    extentSquared: 0x190000, mode: 1, predicate: 0x32a70, group: 0 }, c);
  const style = (angular = false) => queryStrategicPlantStyle(s, angular ? { routine: 0x320e0, source: 0x34ffa, player: 1, group: 0,
    point: [8192, 8192], radius: 0xf00, extentSquared: 0xe10000, mode: 0x56, predicate: 0x327e0 } : {
    routine: 0x8d930, source: 0x3510a, player: 1, group: 0, point: [8192, 8192], radius: 0x500,
    extentSquared: 0x190000, mode: 1, predicate: 0x32630 }, c);
  return { s, c, terrain, cells, protectedPlants, visits, plantValues, place, free, density, style };
}
describe("strategic spatial queries", () => {
  it("keeps BL100's main site distinct from BL5's additional recruitment pad", () => {
    const f = fixture(), request = {routine: 0x74e80 as const, point: [8192, 8192] as [number, number], footprint: 2};
    f.c.recruitmentLandingOffset = [0, 768];
    expect(queryStrategicSite(f.s, {...request, discriminator: 5}, f.c).blocked).toBe(false);
    const pad = worldCell(8192, 8960); f.terrain.bytes[pad * 14 + 11] = 1;
    expect(queryStrategicSite(f.s, {...request, discriminator: 100}, f.c).blocked).toBe(false);
    expect(queryStrategicSite(f.s, {...request, discriminator: 5}, f.c).blocked).toBe(true);
    expect(f.s.rng.draws).toBe(0);
  });
  it("binds source plant protection on the secondary pad and requires its profile only when reached", () => {
    const f = fixture(), request = {routine: 0x74e80 as const, point: [8192, 8192] as [number, number], footprint: 2, discriminator: 5};
    expect(() => queryStrategicSite(f.s, request, f.c)).toThrow();
    f.c.recruitmentLandingOffset = [0, 768]; f.place(2, 0, 8192, 8960);
    expect(queryStrategicSite(f.s, request, f.c).blocked).toBe(true);
    f.protectedPlants.push(0); expect(queryStrategicSite(f.s, request, f.c).blocked).toBe(false);
    delete f.c.recruitmentLandingOffset;
    f.terrain.bytes[worldCell(8192, 8192) * 14 + 11] = 1;
    expect(queryStrategicSite(f.s, request, f.c).blocked).toBe(true);
  });
  it("counts all linked plants independently of protection, owner or growth", () => {
    const f = fixture(); f.place(2, 0)[43] = 0; f.place(2, 1)[24] = 3; f.place(1, 0); f.protectedPlants.push(0, 1);
    expect(f.density()).toEqual({ routine: 0x8d930, count: 2 }); expect(f.s.rng.draws).toBe(2);
  });
  it("limits sampled cells, without imposing a second radius check on an entity", () => {
    const f = fixture(); f.place(2, 0, 8192 + 1280 + 255, 8192); f.place(2, 1, 8192 + 1536, 8192);
    expect(f.density().count).toBe(1);
  });
  it("sums mineral bytes even in water and occupied cells", () => {
    const f = fixture(), cell = worldCell(8192, 8192); f.terrain.bytes[cell * 14 + 13] = 255;
    f.terrain.bytes[cell * 14 + 5] = 0; f.place(2, 0);
    expect(queryStrategicResources(f.s, { routine: 0x8d930, point: [8192, 8192], radius: 0x400,
      extentSquared: 0x100000, mode: 1, predicate: 0x31b30 }, f.c).score).toBe(255);
  });
  it("returns the source terminal grid cursor and resumes RNG identically after JSON", () => {
    const f = fixture(), saved = JSON.parse(JSON.stringify(f.s)), a: number[][] = [], b: number[][] = [];
    const end = visitStrategicGrid(f.s, [32760, -32760], 256, 65536, p => a.push(p));
    expect(visitStrategicGrid(saved, [32760, -32760], 256, 65536, p => b.push(p))).toEqual(end);
    expect(a).toEqual(b); expect(saved).toEqual(f.s); expect(a.length).toBe(5);
  });
  it("keeps research gates, signed wrapped weights, and first strict tie", () => {
    const f = fixture(); aiPutDword(f.s.players[1], 0x67e + 2 * 4, 1); aiPutDword(f.s.players[1], 0x67e + 3 * 4, 1);
    expect(f.style().style).toBe(2);
    f.plantValues[2] = { growthDeltas: Array(8).fill(1), crowdingLimit: 128, nutrition: 0 };
    expect(f.style().style).toBe(3);
    aiPutDword(f.s.players[1], 0x67e + 3 * 4, -1);
    expect(f.style()).toMatchObject({ found: false, style: 12 });
  });
  it("applies plant virtual68 before blocking, while building masks use first-candidate geometry", () => {
    const f = fixture(); aiPutDword(f.s.players[1], 0x67e, 1);
    //Only this cell is land, so a real eligible plant prevents all scoring.
    for (let i = 0; i < 16384; i++) f.terrain.bytes[i * 14 + 5] = 0;
    const cell = worldCell(8192, 8192); f.terrain.bytes[cell * 14 + 5] = 2; f.place(2, 0);
    expect(f.style().style).toBe(12); f.protectedPlants.push(0); expect(f.style().style).toBe(0);
    const n = f.place(4, 64); n[45] = 3; f.terrain.bytes[cell * 14 + 11] = 1;
    expect(f.style().style).toBe(12);
  });
  it("consumes nested traversal RNG only for angular candidates on land", () => {
    const f = fixture(); for (let i = 0; i < 16384; i++) f.terrain.bytes[i * 14 + 5] = 0;
    expect(f.style(true).found).toBe(false); expect(f.s.rng.draws).toBe(0);
    for (let i = 0; i < 16384; i++) f.terrain.bytes[i * 14 + 5] = 2;
    aiPutDword(f.s.players[1], 0x67e, 1); const out = f.style(true);
    expect(out).toMatchObject({ found: true, style: 0 }); expect(f.s.rng.draws).toBe(48);
    expect(out.point).toEqual([8192 - 2716, 8192 + 2715]);
  });
  it("uses a signed64 product for large angular offsets", () => {
    const f = fixture(), points: number[][] = [];
    visitStrategicRing([0, 0], 32767, 2048, f.c, p => points.push(p));
    expect(points).toEqual([[-23170, 23169]]);
  });
  it("honors site footprint, protected plants and water boundaries", () => {
    const f = fixture(), r = { routine: 0x74e80 as const, point: [8192, 8192] as [number, number], footprint: 1 };
    expect(queryStrategicSite(f.s, r, f.c).blocked).toBe(false); f.place(2, 0);
    expect(queryStrategicSite(f.s, r, f.c).blocked).toBe(true); f.protectedPlants.push(0);
    expect(queryStrategicSite(f.s, r, f.c).blocked).toBe(false);
    f.terrain.bytes[worldCell(8448, 8448) * 14 + 5] = 1;
    expect(queryStrategicSite(f.s, r, f.c).blocked).toBe(true);
  });
  it("selects the first allowed octant, keeps zero-ring alignment and consumes no RNG", () => {
    const f = fixture(); expect(queryStrategicFreePoint(f.s, f.free(), f.c).point).toEqual([8192, 8192]);
    expect(queryStrategicFreePoint(f.s, f.free({ 40: 2 }), f.c).point).toEqual([8192, 8192]);
    expect(queryStrategicFreePoint(f.s, f.free({ 40: 1 }), f.c).point).toEqual([8319, 8319]);
    expect(queryStrategicFreePoint(f.s, f.free({ 39: 1, 21: 4 }), f.c).point).toEqual([8448, 8192]);
    expect(f.s.rng.draws).toBe(0);
  });
  it("uses original origin for distance and strict greater-than water height", () => {
    const f = fixture(); f.c.water = 100;
    expect(queryStrategicFreePoint(f.s, f.free(), f.c).point).toBeNull(); f.c.water = 99;
    expect(queryStrategicFreePoint(f.s, f.free({ 39: 1, 30: 65535 }), f.c).point).toBeNull();
    expect(queryStrategicFreePoint(f.s, f.free({ 39: 1, 30: 65536 }), f.c).point).toEqual([8192, 8448]);
  });
  it("checks actual site footprint and returns restored CH=1 for a failed retreat retry", () => {
    const f = fixture(); for (let i = 0; i < 16384; i++) f.terrain.bytes[i * 14 + 11] = 1;
    expect(queryStrategicFreePoint(f.s, f.free({ 52: 1 }), f.c)).toEqual({ routine: 0x30f10, point: null, retryDecrement: 1 });
  });
});
