import { describe, expect, it } from "vitest";
import { strategicFixture } from "./fixtures/strategic-production";
import { aiPutDword, aiPutWord } from "../src/sim/mechanics/strategic-ai-state";
import { requestStagedStrategicProduction, stepStrategicProduction, type StrategicProductionContext, type StrategicProductionRequest } from "../src/sim/mechanics/strategic-ai-production";
import { checksum } from "../src/sim/checksum";
function fixture() {
  const state = strategicFixture(), n = state.buildings[64]; n[6] = 4; aiPutWord(n, 49, 1);
  const calls: StrategicProductionRequest[] = [], context: StrategicProductionContext = {
    speciesGenes: Array.from({ length: 25 }, () => [0, 0] as [number, number]),
    productionWeights: Array.from({ length: 25 }, () => [10, 10, 10, 10, 10] as [number, number, number, number, number]),
    requestProduction(_s, q) { calls.push(q); return { ...q }; },
  };
  aiPutDword(state.players[1], 0x61a, 6 * 2048); aiPutDword(state.players[1], 0x61e, 6 * 2048);
  return { state, n, calls, context };
}
describe("strategic source36920 production selection", () => {
  it("keeps first strict ties, journals one draw per eligible candidate and submits exact814A0 input", () => {
    const f = fixture(), n = f.n, player = f.state.players[1], ai = f.state.records[1];
    const receipt = requestStagedStrategicProduction(f.state, 1, 64, 2, f.context);
    expect(receipt).toMatchObject({ selectedSpecies: 0, score: 60, draws: 2, submitted: true });
    expect(f.calls).toEqual([{ routine: 0x814a0, player: 1, building: 64, species: 0, role: 2, command: 12, parameter: 1 }]);
    expect(f.state.rng.draws).toBe(2); expect(n[60]).toBe(2);
    expect(f.state.buildings[64]).toBe(n); expect(f.state.players[1]).toBe(player); expect(f.state.records[1]).toBe(ai);
  });
  it("retains candidate RNG even when the final busy or disabled check suppresses dispatch", () => {
    for (const block of ["busy", "frame", "disabled", "suppressed"]) {
      const f = fixture(); delete f.context.requestProduction;
      if (block === "busy") aiPutDword(f.n, 54, 1);
      if (block === "frame") f.n[27] = 1;
      if (block === "disabled") aiPutWord(f.n, 49, 0x41);
      if (block === "suppressed") aiPutWord(f.n, 49, 0x101);
      const result = requestStagedStrategicProduction(f.state, 1, 64, 0, f.context);
      expect(result.submitted).toBe(false); expect(result.draws).toBe(2); expect(f.state.rng.draws).toBe(2);
    }
  });
  it("excludes research quality5 and grade0 hybrids without drawing, then admits them at higher grade", () => {
    const f = fixture(); aiPutDword(f.state.players[1], 0x61a, 5 * 2048); aiPutDword(f.state.players[1], 0x61e, 0);
    aiPutDword(f.state.players[1], 0x61a + 6 * 4, 200 * 2048);
    expect(requestStagedStrategicProduction(f.state, 1, 64, 0, f.context)).toMatchObject({ selectedSpecies: null, draws: 0, submitted: false });
    f.n[46] = 1;
    expect(requestStagedStrategicProduction(f.state, 1, 64, 0, f.context)).toMatchObject({ selectedSpecies: 6, draws: 1, submitted: true });
  });
  it("uses signed preferences and truncates the second gene preference toward zero", () => {
    const f = fixture(); (f.context.speciesGenes as [number, number][])[0] = [1, 2];
    f.state.records[1][0x648] = 251; f.state.records[1][0x649] = 253;
    const result = requestStagedStrategicProduction(f.state, 1, 64, 0, f.context);
    expect(result.selectedSpecies).toBe(1); expect(result.score).toBe(60);
  });
  it("rolls back selected role and candidate RNG on missing or invalid real command service", () => {
    const f = fixture(), before = checksum(f.state); delete f.context.requestProduction;
    expect(() => stepStrategicProduction(f.state, 1, 64, 1, f.context)).toThrow(/814A0/);
    expect(checksum(f.state)).toBe(before);
    f.context.requestProduction = (_s, q) => ({ ...q, building: 65 });
    expect(() => stepStrategicProduction(f.state, 1, 64, 1, f.context)).toThrow(/receipt/);
    expect(checksum(f.state)).toBe(before);
  });
  it("continues JSON-restored production selection with identical complete state", () => {
    const f = fixture(), saved = JSON.parse(JSON.stringify(f.state));
    expect(stepStrategicProduction(saved, 1, 64, 0, f.context)).toEqual(stepStrategicProduction(f.state, 1, 64, 0, f.context));
  });
});
