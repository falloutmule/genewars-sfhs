import { describe, expect, it } from "vitest";
import { strategicFixture } from "./fixtures/strategic-production";
import { aiPutDword, aiPutWord } from "../src/sim/mechanics/strategic-ai-state";
import {
  planStagedStrategicSite,
  queryStrategicExpansion,
  stepStrategicSite,
  strategicSitePowered,
  type StrategicSitePlanningContext,
} from "../src/sim/mechanics/strategic-ai-site-planning";
import { terrainFromBytes, worldCell } from "../src/sim/mechanics/terrain";
import type { StrategicEngineerSiteRequest } from "../src/sim/mechanics/strategic-ai-engineer";
function fixture() {
  const s = strategicFixture(),
    terrain = terrainFromBytes(Array(229376).fill(0)),
    plants: number[][] = [],
    cells = new Map<number, { kind: number; index: number }[]>(),
    c: StrategicSitePlanningContext = {
      activePlayerCount: 2,
      water: 0,
      terrain: () => terrain,
      tables: {
        sine: Array.from({ length: 2048 }, (_, a) =>
          Math.round(Math.sin((a * Math.PI) / 1024) * 65536),
        ),
        cosine: Array.from({ length: 2048 }, (_, a) =>
          Math.round(Math.cos((a * Math.PI) / 1024) * 65536),
        ),
      },
      plantValues: Array.from({ length: 12 }, (_, selector) => ({
        selector,
        growthDeltas: Array(8).fill(1),
        spreadPeriod: 1,
        walkSteps: 1,
        crowdingLimit: 1,
        checkThreshold: 1,
        nutrition: 1,
        retirementDelay: 1,
      })),
      rules: {
        upkeep: Array(14).fill(0),
        buildingHealth: Array(42).fill(300),
        constructionCosts: Array(14).fill(10),
        buildingFootprints: Array(14).fill(3),
        buildingProgressThresholds: Array(42).fill(0),
        buildingPrerequisites: Array(14).fill(255),
        buildingValues: Array.from({ length: 14 }, () => [1, 2, 3]),
        priorities: Array.from({ length: 14 }, () => [0, 0, 0]),
      },
      cellOrder: (_s, cell) => cells.get(cell) ?? [],
      entity: (w, ref) =>
        ref.kind === 2 ? plants[ref.index] : w.buildings[ref.index],
      protectedTarget: () => false,
    };
  for (let cell = 0; cell < 16384; cell++) {
    terrain.bytes[cell * 14 + 2] = 100;
    terrain.bytes[cell * 14 + 5] = 2;
  }
  s.records.forEach((a) => {
    a[0x632] = 60;
    a[0x633] = 8;
    a[0x634] = 9;
    a[0x657] = 2;
    a[0x658] = 8;
    a.fill(64, 0x5e7, 0x5f5);
  });
  s.players.forEach((p, owner) => {
    p[0x4a1] = owner;
    p[0x6e7] = 20;
    aiPutWord(p, 9, 8192);
    aiPutWord(p, 11, 8192);
    aiPutWord(p, 0x5fc, 8192);
    aiPutWord(p, 0x5fe, 8192);
  });
  s.players[1][2] = 1;
  const building = (
    slot: number,
    selector: number,
    x = 8192,
    y = 8192,
    classification = 0,
  ) => {
    const n = s.buildings[64 + slot];
    n[6] = 4;
    n[45] = selector;
    n[46] = 0;
    aiPutWord(n, 49, 1);
    aiPutWord(n, 7, x);
    aiPutWord(n, 9, y);
    s.records[1][0x55 + slot] = classification;
    return n;
  };
  const request = (
    selector: number,
    classification = 0,
  ): StrategicEngineerSiteRequest => ({
    routine: 0x3a1e0,
    source: 0x37fd4,
    specialist: 5,
    selector,
    classification,
    planning: { player: 1, owner: 1, capacity: 0, expansion: false },
  });
  const expansion = (origin: [number, number] = [8192, 8192]) => ({
    routine: 0x320e0 as const,
    source: 0x3a0e7 as const,
    owner: 1,
    point: origin,
    interval: 256,
    radius: 0,
    extentSquared: 0,
    predicate: 0x32230 as const,
  });
  const water = () => {
    for (let cell = 0; cell < 16384; cell++) {
      terrain.bytes[cell * 14 + 2] = 0;
      terrain.bytes[cell * 14 + 5] = 0;
    }
  };
  return { s, c, terrain, cells, plants, building, request, expansion, water };
}
describe("source strategic site planning", () => {
  it("keeps the first source outward free point and four-cell minimum", () => {
    const f = fixture();
    f.building(0, 3)[46] = 1;
    expect(planStagedStrategicSite(f.s, f.request(0), f.c)).toEqual({
      routine: 0x3a1e0,
      selector: 0,
      point: [8319, 9343],
    });
    expect(f.s.rng.draws).toBe(0);
  });
  it("permits ring0 for fixed power and Refuge", () => {
    const f = fixture();
    f.building(0, 3);
    expect(planStagedStrategicSite(f.s, f.request(6), f.c).point).toEqual([
      8319, 8319,
    ]);
    expect(planStagedStrategicSite(f.s, f.request(12), f.c).point).toEqual([
      8319, 8319,
    ]);
  });
  it("retains last-tie owner census ordering for Photon sites", () => {
    const f = fixture();
    f.building(0, 3)[46] = 1;
    const result = planStagedStrategicSite(f.s, f.request(3), f.c);
    expect(result.selector).toBe(3);
    expect(result.point).toEqual([6015, 7551]);
    expect(f.s.rng.draws).toBe(0);
  });
  it("uses the land-percentage branch when the retained anchor differs from its class center", () => {
    const f = fixture();
    f.s.players[1][0x4a2] = 1;
    aiPutWord(f.s.records[1], 0x6aa, 8192);
    aiPutWord(f.s.records[1], 0x6ac, 8192);
    expect(planStagedStrategicSite(f.s, f.request(3, 2), f.c).point).toEqual([
      8319, 8319,
    ]);
    expect(f.s.rng.draws).toBe(2);
  });
  it("preserves signed cell-centroid truncation for a class1 Photon search", () => {
    const f = fixture();
    f.building(0, 3, -1000, 500, 1);
    f.building(1, 4, 500, -1000, 1);
    expect(planStagedStrategicSite(f.s, f.request(3, 1), f.c).point).toEqual([
      -1665, -641,
    ]);
  });
  it("requires completed owner Photon reach and includes its exact boundary", () => {
    const f = fixture(),
      n = f.building(0, 3);
    expect(strategicSitePowered(f.s, 1, [8192 + 1536, 8192])).toBe(true);
    expect(strategicSitePowered(f.s, 1, [8192 + 1537, 8192])).toBe(false);
    aiPutWord(n, 49, 0);
    expect(strategicSitePowered(f.s, 1, [8192, 8192])).toBe(false);
    expect(strategicSitePowered(f.s, 0, [8192, 8192])).toBe(false);
  });
  it("anchors a dependent plant facility at the first exact classification building", () => {
    const f = fixture();
    f.building(0, 3, 8192, 8192, 1);
    f.building(1, 4, 8448, 8192, 1);
    expect(planStagedStrategicSite(f.s, f.request(2, 1), f.c).point).toEqual([
      8575, 8319,
    ]);
    expect(f.s.rng.draws).toBe(0);
  });
  it("chooses actual6/8 output by strict solar versus fixed production", () => {
    const f = fixture();
    f.building(0, 3);
    f.s.missionPrefix[0x1c5f] = 255;
    expect(planStagedStrategicSite(f.s, f.request(15), f.c).selector).toBe(6);
    f.s.missionPrefix[0x1c5f] = 0;
    for (let cell = 0; cell < 16384; cell++)
      f.terrain.bytes[cell * 14 + 3] = 16;
    expect(planStagedStrategicSite(f.s, f.request(15), f.c).selector).toBe(8);
  });
  it("scans all eleven failed radii then writes only the source selector cooldown", () => {
    const f = fixture();
    f.water();
    const before = f.s.records[1].slice();
    expect(planStagedStrategicSite(f.s, f.request(8), f.c)).toEqual({
      routine: 0x3a1e0,
      selector: 14,
      point: [8192, 8192],
    });
    expect(f.s.rng.draws).toBe(22);
    aiPutDword(before, 0xe + 8 * 4, 2000);
    expect(f.s.records[1]).toEqual(before);
  });
  it("mineral selection includes nested actual grid RNG and persists exactly", () => {
    const f = fixture();
    f.building(0, 3);
    f.s.records[1][0x5e7] = 0;
    f.terrain.bytes[worldCell(8192, 8192) * 14 + 13] = 255;
    const reload = JSON.parse(JSON.stringify(f.s));
    const a = planStagedStrategicSite(f.s, f.request(11), f.c),
      b = planStagedStrategicSite(reload, f.request(11), f.c);
    expect(a).toEqual(b);
    expect(reload).toEqual(f.s);
    expect(a.selector).toBe(11);
    expect(f.s.rng.draws).toBeGreaterThan(2);
  });
  it("uses retained origin for expansion separation, even when candidate moves", () => {
    const f = fixture();
    f.s.records[1][0x95] = 1;
    aiPutWord(f.s.players[0], 0x5fc, 0);
    aiPutWord(f.s.players[0], 0x5fe, 0);
    const r = { ...f.expansion(), radius: 4096, extentSquared: 4096 ** 2 };
    expect(queryStrategicExpansion(f.s, r, f.c).point).toBeNull();
    expect(f.s.rng.draws).toBe(0);
    f.s.records[1][0x95] = 0;
    expect(queryStrategicExpansion(f.s, r, f.c).point).not.toBeNull();
    expect(f.s.rng.draws).toBe(16);
  });
  it("counts all linked plants in expansion value without virtual68 filtering", () => {
    const f = fixture();
    f.c.activePlayerCount = 0;
    f.s.records[1][0x657] = 0;
    f.c.protectedTarget = () => {
      throw Error("Expansion must not consult virtual68");
    };
    f.plants.push(Array(49).fill(0));
    f.plants[0][6] = 2;
    f.cells.set(worldCell(8192, 8192), [{ kind: 2, index: 0 }]);
    expect(queryStrategicExpansion(f.s, f.expansion(), f.c).point).toEqual([
      8192, 8192,
    ]);
    expect(f.s.rng.draws).toBe(16);
  });
  it("rejects missing numeric input lazily and rolls back earlier RNG on late failure", () => {
    const f = fixture();
    f.building(0, 3);
    let reads = 0;
    f.c.terrain = () => {
      if (++reads > 30) throw Error("late physical query unavailable");
      return f.terrain;
    };
    const before = JSON.stringify(f.s);
    expect(() => stepStrategicSite(f.s, f.request(8), f.c)).toThrow(
      "late physical",
    );
    expect(JSON.stringify(f.s)).toBe(before);
  });
  it("refuses mismatched owner, invalid type and absent construction owner", () => {
    const f = fixture(),
      request = f.request(6);
    request.planning.owner = 2;
    expect(() => planStagedStrategicSite(f.s, request, f.c)).toThrow(
      "identity",
    );
    expect(() => planStagedStrategicSite(f.s, f.request(14), f.c)).toThrow(
      "selector",
    );
    expect(() => strategicSitePowered(f.s, 4, [0, 0])).toThrow("owner");
  });
});
