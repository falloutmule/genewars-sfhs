import { describe, expect, it } from "vitest";
import {
  aiDword,
  aiPoint,
  aiPutDword,
  aiPutWord,
} from "../src/sim/mechanics/strategic-ai";
import {
  makeStrategicEngineerPlanningService,
  planStagedStrategicEngineer,
  planStrategicEngineerDevelopment,
  planStrategicEngineerInfrastructure,
  strategicEngineerBuildingAvailable,
  strategicEngineerUpgradeAvailable,
  stepStrategicEngineer,
} from "../src/sim/mechanics/strategic-ai-engineer";
import {
  planStagedStrategicSpecialists,
  stepStrategicSpecialists,
} from "../src/sim/mechanics/strategic-ai-specialists";
import { strategicEngineerFixture } from "./fixtures/strategic-engineer";
const local = () => ({ player: 1, owner: 1, capacity: 0, expansion: false });
describe("source37C50 Engineer construction planning", () => {
  it("43960 uses the construction subrecord owner, progress, prerequisite and override", () => {
    const f = strategicEngineerFixture();
    (f.rules.buildingProgressThresholds as number[])[6] = 5;
    (f.rules.buildingPrerequisites as number[])[2] = 3;
    f.p[0x603] = 0;
    expect(strategicEngineerBuildingAvailable(f.s, 1, 2, f.rules)).toBe(false);
    f.p[0x603] = 1;
    expect(strategicEngineerBuildingAvailable(f.s, 1, 2, f.rules)).toBe(true);
    f.p[0x4a1] = 0;
    f.s.players[0][0x6e7] = 4;
    expect(strategicEngineerBuildingAvailable(f.s, 1, 2, f.rules)).toBe(false);
    f.p[0x4a1] = 1;
    f.p[0x603] = 0;
    aiPutWord(f.p, 0x60e, 4);
    expect(strategicEngineerBuildingAvailable(f.s, 1, 2, f.rules)).toBe(true);
    (f.rules.buildingProgressThresholds as number[])[6] = 30;
    expect(strategicEngineerBuildingAvailable(f.s, 1, 2, f.rules)).toBe(false);
  });
  it("439E0 preserves its separate next-grade gate and excluded selectors", () => {
    const f = strategicEngineerFixture();
    f.p[0x602] = 1;
    expect(strategicEngineerUpgradeAvailable(f.s, 1, 2, 1, f.rules)).toBe(true);
    for (const k of [10, 11, 13])
      expect(strategicEngineerUpgradeAvailable(f.s, 1, k, 1, f.rules)).toBe(
        false,
      );
    expect(strategicEngineerUpgradeAvailable(f.s, 1, 2, 3, f.rules)).toBe(
      false,
    );
    f.p[0x602] = 0;
    expect(strategicEngineerUpgradeAvailable(f.s, 1, 2, 1, f.rules)).toBe(
      false,
    );
  });
  it("computes classified capacity before the disabled-planning phase4 return", () => {
    const f = strategicEngineerFixture();
    f.building(0, 2, 2, 1, 300, 1);
    f.building(1, 4, 2, 1, 300, 2);
    (f.rules.upkeep as number[])[2] = 3;
    (f.rules.upkeep as number[])[4] = 8;
    f.a[0x6bd] = 1;
    f.a[0x639] = 1;
    const r = planStagedStrategicEngineer(f.s, 1, 5, f.c);
    expect(r.capacity).toBe(3);
    expect(f.a[0x60f]).toBe(4);
    expect(f.calls).toEqual([]);
  });
  it("37D60 chooses the first unattended incomplete building and emits its exact repair task", () => {
    const f = strategicEngineerFixture();
    f.building(0, 2, 0, 0, 10);
    const r = planStagedStrategicEngineer(f.s, 1, 5, f.c);
    expect(r.result).toBe(true);
    expect(f.a[0x60f]).toBe(23);
    expect(f.a[0x47 + 2]).toBe(1);
    expect(f.calls).toEqual([
      {
        routine: 0x811a0,
        source: 0x37ed4,
        player: 1,
        specialist: 5,
        packet: [5, 0, 10, 0, 64, 14, 16, 39, 16, 39, 16],
      },
    ]);
    expect(f.s.specialistPlanner).toBeUndefined();
  });
  it("37D60 reserves a full-health incomplete row without inventing a repair action", () => {
    const f = strategicEngineerFixture();
    f.building(0, 2, 0, 0, 300);
    planStagedStrategicEngineer(f.s, 1, 5, f.c);
    expect(f.a[0x60f]).toBe(23);
    expect(f.a[0x49]).toBe(1);
    expect(f.calls).toEqual([]);
  });
  it("37D60 checks other live Engineers by retained building-index remainder", () => {
    const f = strategicEngineerFixture();
    f.building(0, 2, 0, 0, 10);
    const other = f.s.specialists[6];
    other.native[6] = 3;
    other.blueprint = { player: 1, index: 1 };
    f.p[0x16 + 36 + 22] = 0;
    aiPutWord(other.native, 127, 128);
    f.a[0x639] = 0;
    planStagedStrategicEngineer(f.s, 1, 5, f.c);
    expect(
      f.calls.some((r) => (r as { source?: number }).source === 0x37ed4),
    ).toBe(false);
  });
  it("an empty-base plan uses discounted cost and preserves source blocking as handled", () => {
    const f = strategicEngineerFixture();
    f.c.siteBlocked = () => ({ routine: 0x74e80, blocked: true });
    const r = planStagedStrategicEngineer(f.s, 1, 5, f.c);
    expect(r.result).toBe(true);
    expect(f.a[0x60f]).toBe(6);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      routine: 0x3a1e0,
      source: 0x38038,
      selector: 11,
    });
    expect(f.a[0x52]).toBe(0);
    expect(f.s.specialistPlanner).toBeUndefined();
  });
  it("power choice retains two actual selector15 site searches and no fabricated RNG", () => {
    const f = strategicEngineerFixture();
    f.building(0, 3);
    f.building(1, 2);
    f.a[0x625] = 100;
    const l = local();
    l.capacity = 1;
    expect(planStrategicEngineerInfrastructure(f.s, l, 5, f.c)).toBe(true);
    expect(f.calls.slice(0, 2)).toMatchObject([
      { routine: 0x3a1e0, source: 0x387af, selector: 15 },
      { routine: 0x3a1e0, source: 0x3883d, selector: 15 },
    ]);
    expect(f.s.rng.draws).toBe(50582);
  });
  it("solar capacity keeps the repeated source height read on the uncapped branch", () => {
    const f = strategicEngineerFixture();
    f.building(0, 3);
    f.building(1, 8, 1);
    f.a[0x625] = 100;
    const l = local();
    l.capacity = 1;
    planStrategicEngineerInfrastructure(f.s, l, 5, f.c);
    expect(
      f.calls.filter((r) => (r as { routine: number }).routine === 0x7b140),
    ).toHaveLength(2);
  });
  it("selector11 resource score199 rejects a real site and writes the5000 backoff", () => {
    const f = strategicEngineerFixture();
    f.building(0, 0);
    f.c.planSite = (_w, r) => {
      f.calls.push(r);
      return { routine: 0x3a1e0, selector: 11, point: [12000, 13000] };
    };
    f.c.resourceScore = () => ({ routine: 0x8d930, score: 199 });
    aiPutDword(f.a, 0xe + 2 * 4, 0);
    (f.rules.priorities[2] as number[])[0] = 20;
    expect(planStrategicEngineerDevelopment(f.s, local(), 5, f.c)).toBe(true);
    expect(aiDword(f.a, 0x3a)).toBe(5000);
    expect(f.calls).toHaveLength(1);
  });
  it("new construction preserves classification, complete action cache and source point", () => {
    const f = strategicEngineerFixture();
    f.building(0, 0, 2, 1, 300, 2);
    f.a[0x6bd] = 2;
    aiPutDword(f.a, 0xe + 2 * 4, 0);
    (f.rules.priorities[2] as number[])[0] = 20;
    expect(planStrategicEngineerDevelopment(f.s, local(), 5, f.c)).toBe(true);
    expect(f.a[0x49]).toBe(2);
    expect(f.calls.at(-1)).toMatchObject({
      routine: 0x811a0,
      source: 0x39e4e,
      packet: [5, 0, 10, 0, 0, 2, 224, 46, 200, 50, 16],
    });
    expect(f.s.specialistPlanner?.commandCaches[1].slice(0, 11)).toEqual(
      f.a.slice(0x9c, 0xa7),
    );
  });
  it("an unaffordable new candidate leaves source phase authority unhandled", () => {
    const f = strategicEngineerFixture();
    f.building(0, 0);
    aiPutDword(f.p, 0x4a3, 0);
    aiPutDword(f.a, 0xe + 2 * 4, 0);
    (f.rules.priorities[2] as number[])[0] = 20;
    expect(planStrategicEngineerDevelopment(f.s, local(), 5, f.c)).toBe(false);
    expect(f.calls).toEqual([]);
  });
  it("upgrade uses real target task and source last building local slot", () => {
    const f = strategicEngineerFixture();
    f.building(0, 2, 0);
    (f.rules.priorities[2] as number[])[1] = 30;
    f.p[0x602] = 1;
    f.building(1, 3);
    f.building(2, 3);
    expect(planStrategicEngineerDevelopment(f.s, local(), 5, f.c)).toBe(false);
    expect(f.a[0x46]).toBe(0);
    expect(f.calls).toEqual([
      {
        routine: 0x81080,
        source: 0x39883,
        player: 1,
        specialist: 5,
        packet: [5, 0, 10, 4, 0, 64, null, null, null, null, 5],
      },
    ]);
  });
  it("repair selection retains its unchanged score threshold, allowing a weaker later row to replace it", () => {
    const f = strategicEngineerFixture();
    f.building(0, 2, 2, 0x41, 10);
    f.building(1, 4, 2, 0x41, 10);
    (f.rules.buildingValues[2] as number[])[2] = 100;
    (f.rules.buildingValues[4] as number[])[2] = 10;
    expect(planStrategicEngineerDevelopment(f.s, local(), 5, f.c)).toBe(false);
    expect(f.calls.at(-1)).toMatchObject({
      source: 0x39990,
      packet: [5, 0, 10, 0, 65, 14, 16, 40, 16, 39, 16],
    });
  });
  it("selector11 special flags emit source target task10B without a guessed build", () => {
    const f = strategicEngineerFixture();
    f.building(0, 11, 2, 0x201);
    expect(planStrategicEngineerDevelopment(f.s, local(), 5, f.c)).toBe(false);
    expect(f.calls.at(-1)).toMatchObject({
      routine: 0x81080,
      source: 0x39a12,
      packet: [5, 0, 11, 1, 0, 64, null, null, null, null, 5],
    });
  });
  it("expansion uses source cell-coordinate truncation/mean and retains the returned point", () => {
    const f = strategicEngineerFixture();
    f.a[0x6bd] = f.a[0x95] = 1;
    f.a[0x626] = 3;
    f.a[0x634] = 15;
    f.a[0x658] = 8;
    for (const [slot, x] of [
      [0, -1000],
      [1, 500],
      [2, 1600],
    ])
      aiPutWord(f.building(slot, 0, 2, 1, 300, 1), 7, x);
    const l = local();
    expect(planStrategicEngineerDevelopment(f.s, l, 5, f.c)).toBe(false);
    expect(f.calls).toEqual([
      {
        routine: 0x320e0,
        source: 0x3a0e7,
        owner: 1,
        point: [256, 9984],
        interval: 256,
        radius: 3840,
        extentSquared: 14745600,
        predicate: 0x32230,
      },
    ]);
    expect(f.a[0x95]).toBe(2);
    expect(aiPoint(f.a, 0x6aa)).toEqual([14000, 15000]);
    expect(l.expansion).toBe(true);
  });
  it("a missed expansion caps626 rather than inventing a new settlement", () => {
    const f = strategicEngineerFixture();
    f.a[0x6bd] = f.a[0x95] = 1;
    f.a[0x626] = 3;
    f.building(0, 0, 2, 1, 300, 1);
    f.c.expansionSite = () => ({ routine: 0x320e0, point: null });
    const l = local();
    planStrategicEngineerDevelopment(f.s, l, 5, f.c);
    expect(f.a[0x626]).toBe(1);
    expect(l.expansion).toBe(false);
  });
  it("late command failure rolls back selection, reservation and complete cached packets", () => {
    const f = strategicEngineerFixture();
    const before = structuredClone(f.s);
    f.c.command = (w) => {
      w.players[1][13]++;
      throw Error("late construction command");
    };
    expect(() => stepStrategicEngineer(f.s, 1, 5, f.c)).toThrow(
      "late construction command",
    );
    expect(f.s).toEqual(before);
  });
  it("missing site/occupancy/resource ports reject and preserve isolated input", () => {
    const f = strategicEngineerFixture(),
      before = structuredClone(f.s);
    expect(() =>
      stepStrategicEngineer(f.s, 1, 5, { ...f.c, planSite: undefined }),
    ).toThrow("3A1E0");
    expect(() =>
      stepStrategicEngineer(f.s, 1, 5, { ...f.c, siteBlocked: undefined }),
    ).toThrow("74E80");
    expect(f.s).toEqual(before);
  });
  it("composes with33F60's required service and serializes full authoritative planning data", () => {
    const f = strategicEngineerFixture();
    f.c.command = (w, r) => {
      w.specialists[5].native[85] = 9;
      return {
        routine: r.routine,
        player: 1,
        specialist: 5,
        outcome: "installed",
      };
    };
    f.a[0x54] = 0;
    const context = {
        ...f.specialistContext,
        engineerPlan: makeStrategicEngineerPlanningService(f.c),
      },
      result = stepStrategicSpecialists(f.s, 1, context),
      restored = JSON.parse(JSON.stringify(f.s));
    planStagedStrategicSpecialists(restored, 1, context);
    expect(restored).toEqual(result.state);
    expect(restored.specialistPlanner).toBeDefined();
  });
});
