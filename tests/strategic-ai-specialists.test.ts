import { describe, expect, it } from "vitest";
import {
  aiDword,
  aiPoint,
  aiPutDword,
  aiPutWord,
  aiSWord,
  strategicGroupOffset,
} from "../src/sim/mechanics/strategic-ai";
import {
  makeStrategicSpecialistService,
  planStagedStrategicSpecialists,
  stepStrategicSpecialists,
} from "../src/sim/mechanics/strategic-ai-specialists";
import {
  cacheStrategicRolePacket,
  strategicRolePacket,
} from "../src/sim/mechanics/strategic-ai-specialists-state";
import {
  chooseStrategicPlantWork,
  retreatStrategicSpecialist,
  retryStrategicSpecialistRoute,
  routeStrategicSpecialistAroundBuilding,
} from "../src/sim/mechanics/strategic-ai-specialists-routes";
import { strategicSpecialistFixture } from "./fixtures/strategic-specialists";
import { aiMember } from "./fixtures/strategic-ai";
function ownBuilding(
  f: ReturnType<typeof strategicSpecialistFixture>,
  slot: number,
  kind: number,
  flags = 0,
) {
  const n = f.s.buildings[64 + slot];
  n[6] = 4;
  n[45] = kind;
  aiPutWord(n, 7, 10000);
  aiPutWord(n, 9, 10000);
  aiPutWord(n, 49, flags);
  return n;
}
function plant(
  f: ReturnType<typeof strategicSpecialistFixture>,
  index: number,
  x: number,
) {
  const p = f.plants[index];
  p[6] = 2;
  aiPutWord(p, 7, x);
  aiPutWord(p, 9, 10000);
  return p;
}
describe("source33F60 specialist planner", () => {
  it("counts the actual roster and stores quality by roster ordinal", () => {
    const f = strategicSpecialistFixture();
    f.p[3] = 2;
    f.p[5] = 6;
    f.a[0x6b1] = 2;
    f.s.specialists[6].native[6] = 3;
    f.s.specialists[6].native[85] = 2;
    f.s.specialists[6].blueprint = { player: 1, index: 1 };
    f.p[0x16 + 36 + 22] = 3;
    f.p[0x16 + 36 + 26] = 23;
    const r = planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.a.slice(0x69e, 0x6a2)).toEqual([0, 0, 1, 1]);
    expect(f.a.slice(0x178, 0x17a)).toEqual([10, 23]);
    expect(r.visited).toEqual([5, 6]);
  });
  it("does not turn an inactive or protected roster member into an action", () => {
    const f = strategicSpecialistFixture();
    f.c.specialistProtected = () => true;
    expect(planStagedStrategicSpecialists(f.s, 1, f.c).visited).toEqual([]);
    expect(f.calls).toEqual([]);
    f.n[6] = 0;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.a[0x6a0]).toBe(0);
  });
  it("retains real roster recruitment errors and rolls back earlier counter/blueprint writes", () => {
    const f = strategicSpecialistFixture();
    f.a[0x6b1] = 0;
    f.a[0x65a] = 1;
    ownBuilding(f, 0, 5, 1);
    const bp = 0x16 + 36;
    f.p[bp] = 65;
    f.p[bp + 22] = 0;
    f.p[bp + 23] = 20;
    f.p[bp + 25] = 30;
    f.p[bp + 26] = 10;
    const before = structuredClone(f.s);
    expect(() => stepStrategicSpecialists(f.s, 1, f.c)).toThrow("4FD30");
    expect(f.s).toEqual(before);
  });
  it.each([2, 3])(
    "pending creature encounter uses category%i's actual target command and clears only reference kind",
    (category) => {
      const f = strategicSpecialistFixture(category);
      f.n[85] = 2;
      aiPutWord(f.n, 123, 4);
      f.n[125] = 1;
      aiMember(f.s, 4, 255, 0);
      planStagedStrategicSpecialists(f.s, 1, f.c);
      expect(f.calls).toEqual([
        {
          routine: 0x81080,
          source: category === 2 ? 0x344f4 : 0x34493,
          player: 1,
          specialist: 5,
          packet: [5, 0, 3, category === 3 ? 2 : 0, 4, 0, 1, 0, null, null, 5],
        },
      ]);
      expect(f.n[125]).toBe(0);
      expect(aiSWord(f.n, 123)).toBe(4);
    },
  );
  it("an inactive pending effect clears without issuing a cancel or fabricated retreat", () => {
    const f = strategicSpecialistFixture();
    f.n[85] = 2;
    f.n[125] = 5;
    aiPutWord(f.n, 123, 4);
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([]);
    expect(f.n[125]).toBe(0);
  });
  it("32FF0 decrements retained route before moving and preserves the100 sentinel transition", () => {
    const f = strategicSpecialistFixture();
    f.a[0x173] = 1;
    aiPutWord(f.a, 0xd3, 11000);
    aiPutWord(f.a, 0xd5, 12000);
    const r = planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(r.retried).toBe(5);
    expect(f.a[0x173]).toBe(100);
    expect(f.calls).toEqual([
      {
        routine: 0x80fc0,
        source: 0x33081,
        player: 1,
        specialist: 5,
        packet: [248, 42, 224, 46, 5, 0, null, null, null, null, 3],
      },
    ]);
    retryStrategicSpecialistRoute(f.s, 1, 5, f.c);
    expect(f.a[0x173]).toBe(0);
    expect(f.calls).toHaveLength(1);
  });
  it("a pending route returns from the complete planner before later roster actors", () => {
    const f = strategicSpecialistFixture();
    f.p[3] = 2;
    f.p[5] = 6;
    f.a[0x6b1] = 2;
    f.a[0x173] = 100;
    f.s.specialists[6].native[6] = 3;
    f.s.specialists[6].blueprint = { player: 1, index: 1 };
    expect(planStagedStrategicSpecialists(f.s, 1, f.c).visited).toEqual([5]);
  });
  it("33B00 retains source reverse-side waypoint order and immediately dispatches one", () => {
    const f = strategicSpecialistFixture();
    const b = ownBuilding(f, 0, 3);
    b[46] = 1;
    aiPutWord(f.n, 7, 15000);
    routeStrategicSpecialistAroundBuilding(f.s, 1, 5, 64, [10000, 5000], f.c);
    expect(f.a[0x173]).toBe(1);
    expect(aiPoint(f.a, 0xd3 + 4)).toEqual([12240, 10000]);
    expect(aiPoint(f.a, 0xd3)).toEqual([11792, 8208]);
    expect(f.calls).toHaveLength(1);
    expect(f.s.rng.draws).toBe(50582);
  });
  it("355B0 retains early6400² selection instead of a generic nearest plant", () => {
    const f = strategicSpecialistFixture(1);
    plant(f, 0, 13000);
    plant(f, 1, 12600);
    expect(chooseStrategicPlantWork(f.s, 1, 5, f.c)).toEqual([13000, 10000]);
  });
  it("355B0 uses the first eligible fallback and excludes flag8/protected plants", () => {
    const f = strategicSpecialistFixture(1);
    plant(f, 0, 10000)[46] = 8;
    plant(f, 1, 10500);
    plant(f, 2, 11000);
    f.c.plantProtected = (_w, i) => i === 2;
    expect(chooseStrategicPlantWork(f.s, 1, 5, f.c)).toEqual([10500, 10000]);
  });
  it("kind4 doubles exclusion distance before testing group radius", () => {
    const f = strategicSpecialistFixture(1);
    plant(f, 0, 12000);
    plant(f, 1, 16000);
    expect(chooseStrategicPlantWork(f.s, 1, 5, f.c)).toEqual([16000, 10000]);
    f.a[strategicGroupOffset(0) + 9] = 4;
    expect(chooseStrategicPlantWork(f.s, 1, 5, f.c)).toEqual([12000, 10000]);
  });
  it("330B0 no-refuge distant scatter draws once after cancel and preserves unknown packet cache bytes", () => {
    const f = strategicSpecialistFixture();
    f.a[0x9c + 6] = 241;
    retreatStrategicSpecialist(f.s, 1, 5, null, f.c);
    expect(f.s.rng.draws).toBe(50583);
    expect(f.calls).toHaveLength(2);
    expect(f.s.specialistPlanner?.commandCaches[1].slice(6, 10)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(f.a[0x9c + 6]).toBe(241);
    expect(f.n.slice(31, 39)).toEqual(Array(8).fill(null));
  });
  it("330B0 opposite refuge sides cancel and clear the route without sampling a position", () => {
    const f = strategicSpecialistFixture();
    f.p[0x60c] = 1;
    ownBuilding(f, 0, 12)[46] = 1;
    const threat = aiMember(f.s, 4, 255, 0);
    aiPutWord(threat, 7, 15000);
    f.a[0x173] = 3;
    retreatStrategicSpecialist(f.s, 1, 5, threat, f.c);
    expect(f.a[0x173]).toBe(0);
    expect(f.calls).toHaveLength(1);
    expect(f.s.rng.draws).toBe(50582);
  });
  it("330B0 outside refuge retries actual query counts3/2/1 and keeps RNG unchanged on misses", () => {
    const f = strategicSpecialistFixture();
    f.p[0x60c] = 1;
    ownBuilding(f, 0, 12)[46] = 1;
    aiPutWord(f.n, 7, 15000);
    const threat = aiMember(f.s, 4, 255, 0);
    aiPutWord(threat, 7, 16000);
    const attempts: number[] = [];
    f.c.freePoint = (_w, r) => {
      attempts.push(r.fields[40]);
      expect(r.predicate).toBe(0x31d10);
      return { routine: 0x30f10, point: null, retryDecrement: 1 };
    };
    retreatStrategicSpecialist(f.s, 1, 5, threat, f.c);
    expect(attempts).toEqual([3, 2, 1]);
    expect(f.s.rng.draws).toBe(50582);
  });
  it("Engineer's completion bookkeeping uses actual local/selector state before planning", () => {
    const f = strategicSpecialistFixture(0);
    ownBuilding(f, 2, 3);
    aiPutWord(f.n, 127, 66);
    f.n[129] = 4;
    f.n[131] = 5;
    f.a[0x47 + 3] = 2;
    f.a[0x5e9] = f.a[0x5ef] = 64;
    f.s.creatureControl[0] = 31;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.a[0x55 + 2]).toBe(2);
    expect(f.a[0x5e9]).toBe(2);
    expect(f.a[0x47 + 3]).toBe(0);
    expect(f.n[131]).toBe(14);
    expect(aiDword(f.a, 0x6a2)).toBe(500);
    expect(f.s.creatureControl[0]).toBe(15);
    expect(f.calls).toEqual([{ routine: 0x37c50, player: 1, specialist: 5 }]);
  });
  it("Engineer respects reservation/cooldown and rejects a missing planning subtree", () => {
    const f = strategicSpecialistFixture(0);
    f.a[0x47 + 2] = 1;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([]);
    f.a[0x47 + 2] = 0;
    ownBuilding(f, 0, 0);
    ownBuilding(f, 1, 3);
    aiPutDword(f.a, 0x6a2, 499);
    f.a[0x665] = 1;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([]);
    aiPutDword(f.a, 0x6a2, 0);
    expect(() =>
      stepStrategicSpecialists(f.s, 1, { ...f.c, engineerPlan: undefined }),
    ).toThrow("37C50");
  });
  it("Botanist training requires a ready lab and clear actual landing state", () => {
    const f = strategicSpecialistFixture(1);
    ownBuilding(f, 0, 5, 1);
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      routine: 0x81080,
      source: 0x34cf9,
      packet: [5, 0, 0, 14, 0, 64, null, null, null, null, 5],
    });
    f.calls.length = 0;
    f.p[0x498] = 1;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([]);
  });
  it("Botanist plant work emits the selected actual point and a fully known cached packet", () => {
    const f = strategicSpecialistFixture(1);
    plant(f, 0, 13000);
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([
      {
        routine: 0x811a0,
        source: 0x34df9,
        player: 1,
        specialist: 5,
        packet: [5, 0, 8, 0, 0, 0, 200, 50, 16, 39, 16],
      },
    ]);
    expect(f.s.specialistPlanner?.commandCaches[1].slice(0, 11)).toEqual(
      f.a.slice(0x9c, 0x9c + 11),
    );
  });
  it("Botanist scores all source group kinds regardless count, retaining strict ties and actual query points", () => {
    const f = strategicSpecialistFixture(1);
    f.n[114] = 22;
    for (const g of [4, 5]) {
      const at = strategicGroupOffset(g);
      f.a[at + 9] = g === 4 ? 3 : 4;
      aiPutWord(f.a, at, 11000 + g * 100);
      aiPutWord(f.a, at + 2, 12000);
    }
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toHaveLength(4);
    expect(f.calls[2]).toMatchObject({
      routine: 0x8d930,
      source: 0x3510a,
      group: 4,
      point: [11400, 12000],
    });
    expect(f.calls[3]).toMatchObject({ routine: 0x811a0, source: 0x351ec });
  });
  it("Geneticist examines only first25 rows and retains the scan-index research gate", () => {
    const f = strategicSpecialistFixture();
    aiMember(f.s, 0, 255, 4);
    aiMember(f.s, 1, 255, 4);
    aiMember(f.s, 25, 255, 4);
    f.a[0x647 + 1] = 10;
    f.a[0x647 + 4] = 20;
    aiPutDword(f.p, 0x61a, 102400);
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls[0]).toMatchObject({
      routine: 0x81080,
      source: 0x3556e,
      packet: [5, 0, 3, 0, 1, 0, 1, 0, null, null, 5],
    });
    f.calls.length = 0;
    f.s.creatures[0][6] = f.s.creatures[1][6] = 0;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([]);
  });
  it("Geneticist strict positive scoring keeps the first equal target and skips completed species", () => {
    const f = strategicSpecialistFixture();
    aiMember(f.s, 0, 255, 4);
    aiMember(f.s, 1, 255, 4);
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls[0]).toMatchObject({
      packet: [5, 0, 3, 0, 0, 0, 1, 0, null, null, 5],
    });
    aiPutDword(f.p, 0x61a + 4 * 4, 102400);
    f.calls.length = 0;
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toEqual([]);
  });
  it("Shepherd visits donor groups4..15 and can issue several role commands after the first changes state", () => {
    const f = strategicSpecialistFixture(3);
    for (const g of [3, 4, 5]) {
      const at = strategicGroupOffset(g);
      f.a[at + 9] = 3;
      aiPutWord(f.a, at + 4, 2);
    }
    f.c.command = (_w, r) => {
      f.calls.push(r);
      f.n[85] = 2;
      return {
        routine: r.routine,
        player: 1,
        specialist: 5,
        outcome: "installed",
      };
    };
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toHaveLength(2);
  });
  it("reward request issues a real move and later role checks consume its actual state afterimage", () => {
    const f = strategicSpecialistFixture(0),
      at = strategicGroupOffset(4);
    f.a[at + 9] = 6;
    f.a[at + 13] = 16;
    aiPutWord(f.a, at + 4, 0);
    f.c.command = (w, r) => {
      f.calls.push(r);
      w.specialists[5].native[85] = 2;
      return {
        routine: r.routine,
        player: 1,
        specialist: 5,
        outcome: "installed",
      };
    };
    planStagedStrategicSpecialists(f.s, 1, f.c);
    expect(f.calls).toHaveLength(1);
    expect(f.a[at + 13]).toBe(48);
  });
  it("late command failure rolls back caches, unknown masks and earlier command writes", () => {
    const f = strategicSpecialistFixture(3);
    const packet = strategicRolePacket(f.s, f.c, 1, { 0: 1, 2: 2, 4: 5 }, 3);
    cacheStrategicRolePacket(f.s, 1, 5, packet);
    for (const g of [4, 5]) {
      const at = strategicGroupOffset(g);
      f.a[at + 9] = 3;
      aiPutWord(f.a, at + 4, 2);
    }
    const before = structuredClone(f.s);
    let calls = 0;
    f.c.command = (w, r) => {
      w.players[1][13]++;
      if (++calls === 2) throw Error("late role failure");
      return {
        routine: r.routine,
        player: 1,
        specialist: 5,
        outcome: "ignored",
      };
    };
    expect(() => stepStrategicSpecialists(f.s, 1, f.c)).toThrow(
      "late role failure",
    );
    expect(f.s).toEqual(before);
  });
  it("requires missing spatial/action ports and rejects replaced native identity", () => {
    const f = strategicSpecialistFixture(0);
    f.n[85] = 2;
    f.n[125] = 1;
    aiPutWord(f.n, 123, 4);
    aiMember(f.s, 4, 255, 0);
    aiPutWord(f.p, 0x5fc, 10000);
    aiPutWord(f.p, 0x5fe, 10000);
    expect(() =>
      stepStrategicSpecialists(f.s, 1, { ...f.c, freePoint: undefined }),
    ).toThrow("30F10");
    expect(() =>
      stepStrategicSpecialists(f.s, 1, { ...f.c, command: undefined }),
    ).toThrow("81150");
    f.c.command = (w, r) => {
      w.specialists[5].native = w.specialists[5].native.slice();
      return {
        routine: r.routine,
        player: 1,
        specialist: 5,
        outcome: "ignored",
      };
    };
    expect(() => stepStrategicSpecialists(f.s, 1, f.c)).toThrow("receipt");
  });
  it("JSON restoration retains effective unknowns and concrete service behavior", () => {
    const f = strategicSpecialistFixture(1);
    plant(f, 0, 13000);
    const first = stepStrategicSpecialists(f.s, 1, f.c),
      restored = JSON.parse(JSON.stringify(first.state));
    const receipt = makeStrategicSpecialistService(f.c).planSpecialists!(
      restored,
      1,
    );
    expect(receipt).toEqual(
      stepStrategicSpecialists(first.state, 1, f.c).receipt,
    );
    expect(restored).toEqual(
      stepStrategicSpecialists(first.state, 1, f.c).state,
    );
  });
});
