import { describe, expect, it } from "vitest";
import { strategicFixture } from "./fixtures/strategic-production";
import { aiDword, aiPutDword, aiPutWord, aiSWord } from "../src/sim/mechanics/strategic-ai-state";
import { clearStrategicSettlement, ensureStrategicSettlementGroup, planStagedStrategicBuildings,
  stepStrategicBuildings, strategicSettlementCenter, strategicSettlementOffset,
  type StrategicBuildingContext } from "../src/sim/mechanics/strategic-ai-buildings";
import { checksum } from "../src/sim/checksum";
function fixture() {
  const s = strategicFixture(), ai = s.records[1], pod = s.buildings[64];
  pod[6] = 4; aiPutWord(pod, 49, 1); aiPutWord(pod, 58, -1);
  ai[0x183] = 1; ai[0x194] = 1; ai[0x6b2] = 255;
  aiPutDword(ai, 6, 100); aiPutWord(ai, 0x650, 1000); aiPutWord(ai, 0x387 + 38 + 4, 8);
  for (let i = 0; i < 16; i++) { const at = 0x387 + i * 38; ai[at + 8] = 1; ai[at + 11] = i; }
  const c: StrategicBuildingContext = { frame: 10, flags: 0x3e, runtimeMode: 0, activePlayerCount: 2,
    selectedPlayer: 0, groupLimits: [10, 10, 10, 10, 10, 10], creatureProtected: () => false,
    speciesGenes: Array.from({ length: 25 }, () => [0, 0]), productionWeights: Array.from({ length: 25 }, () => [10, 20, 30, 40, 50]),
    buildingValues: Array.from({ length: 14 }, (_, i) => [100 + i, 200 + i, 300 + i]),
  };
  return { s, ai, pod, c };
}
describe("strategic source360B0 building planning", () => {
  it("clears source31830 fields while retaining the four-byte cost prior", () => {
    const f = fixture(), at = strategicSettlementOffset(1);
    f.ai.fill(171, at, at + 83); clearStrategicSettlement(f.s, 1, 1);
    expect(f.ai.slice(at, at + 83)).toEqual(Array.from({ length: 83 }, (_, i) => i >= 0x4d && i <= 0x50 ? 171 : 0));
  });
  it("averages signed cell coordinates toward zero before converting to fixed point", () => {
    const f = fixture(), other = f.s.buildings[65]; other[6] = 4;
    f.ai[0x55] = f.ai[0x56] = 1;
    aiPutWord(f.pod, 7, -511); aiPutWord(f.pod, 9, -255);
    aiPutWord(other, 7, 767); aiPutWord(other, 9, 1023);
    expect(strategicSettlementCenter(f.s, 1, 1)).toEqual([0, 256]);
    expect(strategicSettlementCenter(f.s, 1, 5)).toEqual([0, 0]);
  });
  it("creates the first free settlement group and preserves constructor high flags", () => {
    const f = fixture(), at = 0x387 + 5 * 38; aiPutWord(f.ai, at + 4, -1); f.ai[at + 13] = 192;
    aiPutWord(f.s.players[1], 9, 1234); aiPutWord(f.s.players[1], 11, -4567);
    ensureStrategicSettlementGroup(f.s, 1, f.c);
    expect(f.ai[0x6b2]).toBe(5);
    expect(f.ai[at + 12]).toBe(1);
    expect([aiSWord(f.ai, at), aiSWord(f.ai, at + 2), aiSWord(f.ai, at + 4), f.ai[at + 9], f.ai[at + 13]]).toEqual([1234, -4567, 0, 4, 193]);
  });
  it("consumes a real production result and associates its role and settlement", () => {
    const f = fixture(), n = f.s.creatures[7], at = strategicSettlementOffset(1);
    n[6] = 1; n[24] = 1; n[122] = 4; f.pod[60] = 2; f.ai[0x55] = 3;
    aiPutWord(f.pod, 58, 7); f.s.creatureControl[14] = 29;
    expect(planStagedStrategicBuildings(f.s, 1, f.c).completedOutputs).toEqual([7]);
    expect([aiSWord(f.pod, 58), aiDword(f.ai, 0x6a6), aiDword(f.ai, at + 0x13), aiDword(f.ai, at + 0x17), f.s.creatureControl[14]]).toEqual([-1, 100, 30, 40, 126]);
  });
  it("consumes the source301 failure marker without inventing a creature", () => {
    const f = fixture(); aiPutWord(f.pod, 58, 301);
    expect(planStagedStrategicBuildings(f.s, 1, f.c).completedOutputs).toEqual([]);
    expect(aiSWord(f.pod, 58)).toBe(-1); expect(aiDword(f.ai, 0x6a6)).toBe(0);
  });
  it("initializes a real settlement search without a terrain survey on its first pod", () => {
    const f = fixture(); f.ai[0x194] = f.ai[0x192] = 0; f.ai[0x55] = 1;
    aiPutWord(f.pod, 7, 1000); aiPutWord(f.pod, 9, 2000);
    const out = planStagedStrategicBuildings(f.s, 1, f.c);
    expect(out.surveys).toEqual([]); expect([f.ai[0x183], f.ai[0x18c], f.ai[0x18d], aiDword(f.ai, 0x18e), f.ai[0x192], aiSWord(f.ai, 0x188), aiSWord(f.ai, 0x18a)]).toEqual([1, 75, 1, 5120, 1, 768, 1792]);
  });
  it("requires the actual resumable survey and rolls back an earlier consumed pod output", () => {
    const f = fixture(); f.ai[0x194] = 0; f.ai[0x192] = 1; aiPutWord(f.pod, 58, 301);
    const before = checksum(f.s);
    expect(() => stepStrategicBuildings(f.s, 1, f.c)).toThrow(/31330\/31560/);
    expect(checksum(f.s)).toBe(before);
  });
  it("totals only existing associated buildings after a completed survey", () => {
    const f = fixture(), other = f.s.buildings[65]; f.ai[0x194] = 0; f.ai[0x192] = 1; f.ai[0x55] = 1;
    other[6] = 4; other[45] = 3; other[46] = 2; f.ai[0x56] = 1;
    f.c.surveySettlement = (s, player, settlement) => { s.records[player][0x194] = 1; return { routine: 0x31330, player, settlement, complete: true }; };
    expect(planStagedStrategicBuildings(f.s, 1, f.c).surveys).toEqual([1]);
    const at = strategicSettlementOffset(1); expect([aiDword(f.ai, at), aiDword(f.ai, at + 0x4d)]).toEqual([100, 403]);
  });
  it("expires the survey with unsigned timer wrap semantics", () => {
    const f = fixture(); aiPutDword(f.ai, strategicSettlementOffset(1), 101); f.ai[0x192] = f.ai[0x193] = 1;
    planStagedStrategicBuildings(f.s, 1, f.c);
    expect(f.ai.slice(0x192, 0x195)).toEqual([0, 0, 0]);
  });
  it("balances role proportions using retained owner bytes, including inactive creatures", () => {
    const f = fixture(); aiPutDword(f.s.players[1], 0x4a3, 1000); aiPutWord(f.ai, 0x662, 100);
    f.ai[0x653] = 60; f.ai[0x654] = 40; f.ai[0x655] = 0;
    f.s.creatures[0][24] = 1; f.s.creatureControl[0] = 0;
    aiPutDword(f.s.players[1], 0x61a, 6 * 2048);
    const calls: number[] = []; f.c.requestProduction = (_s, request) => { calls.push(request.role); return request; };
    planStagedStrategicBuildings(f.s, 1, f.c); expect(calls).toEqual([1]);
  });
  it("retains complete state across JSON save and deterministic continuation", () => {
    const f = fixture(); expect(stepStrategicBuildings(JSON.parse(JSON.stringify(f.s)), 1, f.c)).toEqual(stepStrategicBuildings(f.s, 1, f.c));
  });
});
