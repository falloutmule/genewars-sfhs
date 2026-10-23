import { describe, expect, it } from "vitest";
import { strategicFixture } from "./fixtures/strategic-production";
import { aiDword, aiPutDword, aiPutWord, aiSWord } from "../src/sim/mechanics/strategic-ai-state";
import { surveyStagedStrategicSettlement, type StrategicSurveyContext, type StrategicSurveyReference } from "../src/sim/mechanics/strategic-ai-survey";
import { strategicSettlementOffset } from "../src/sim/mechanics/strategic-ai-buildings";
import { worldCell } from "../src/sim/mechanics/terrain";
function fixture() {
  const s = strategicFixture(), ai = s.records[1], at = strategicSettlementOffset(1),
    plants = Array.from({ length: 512 }, () => Array(49).fill(0)), cells = new Map<number, StrategicSurveyReference[]>(),
    visited: number[] = [], virtuals: StrategicSurveyReference[] = [], protectedRefs: StrategicSurveyReference[] = [];
  ai[0x183] = ai[0x18d] = 1; ai[0x18c] = 255; aiPutWord(ai, 0x188, 8192); aiPutWord(ai, 0x18a, 8192);
  const c: StrategicSurveyContext = {
    tables: { atan: Array.from({ length: 257 }, (_, i) => Math.round(Math.atan(i / 256) * 1024 / Math.PI)) },
    productionWeights: Array.from({ length: 25 }, () => [11, 22, 33, 44, 55]),
    buildingThreatValues: Array.from({ length: 14 }, () => [-100, 200, 300]), specialistThreatWeights: [1, 2, 3, 4],
    plantValues: Array.from({ length: 12 }, () => ({ nutrition: 7, retirementDelay: 9 })),
    cellOrder: (_s, cell) => { visited.push(cell); return cells.get(cell) ?? []; },
    entity: (w, r) => r.kind === 1 ? w.creatures[r.index] : r.kind === 2 ? plants[r.index] : r.kind === 3 ? w.specialists[r.index].native : r.kind === 4 ? w.buildings[r.index] : [0, 0, 0, 0, 0, 0, r.kind, 0, 0, 0, 0, 0, 0, 0, 0, r.index, 0, 0, 0, 0, 0, 0, 0, 0, 4],
    protectedTarget: (_s, r) => { virtuals.push(r); return protectedRefs.some(p => p.kind === r.kind && p.index === r.index); },
  };
  const place = (kind: 1 | 2 | 3 | 4, index: number, owner: number, x = 8192, y = 8192) => {
    const r = { kind, index }, n = c.entity(s, r)! as (number | null)[]; n[6] = kind; n[24] = owner;
    aiPutWord(n, 15, index); aiPutWord(n, 7, x); aiPutWord(n, 9, y);
    const cell = worldCell(x, y); cells.set(cell, [...cells.get(cell) ?? [], r]); return n;
  };
  return { s, ai, at, c, cells, visited, virtuals, protectedRefs, place };
}
describe("strategic source31330/31560 settlement census", () => {
  it("collects foreign creature/building/specialist threats and all eligible plant values", () => {
    const f = fixture(); f.place(1, 0, 0)[122] = 4; const plant = f.place(2, 0, 4, 8300, 8192); plant[43] = 0;
    const b = f.place(4, 0, 0); b[45] = b[46] = 0;
    f.place(3, 0, 0); f.s.specialists[0].blueprint = { player: 0, index: 0 }; f.s.players[0][0x16 + 22] = 2;
    expect(surveyStagedStrategicSettlement(f.s, 1, 1, f.c).complete).toBe(true);
    expect([f.ai[f.at + 4], aiSWord(f.ai, f.at + 5), aiSWord(f.ai, f.at + 7), aiDword(f.ai, f.at + 0xb), aiDword(f.ai, f.at + 0xf), aiDword(f.ai, f.at + 0x23) | 0, aiSWord(f.ai, f.at + 0x27), aiDword(f.ai, f.at + 0x29), aiDword(f.ai, f.at + 0x45), aiSWord(f.ai, f.at + 0x2d + 4)]).toEqual([1, 1, 1, 33, 44, -100, 3, 1, 7, 9]);
  });
  it.each([0, 1, 2, 3])("counts own creatures with role%i and skips own buildings/specialists", role => {
    const f = fixture(); f.place(1, 4, 1)[122] = 4; f.s.creatureControl[8] = role;
    f.place(4, 64, 1); f.place(3, 5, 1);
    surveyStagedStrategicSettlement(f.s, 1, 1, f.c);
    expect([aiSWord(f.ai, f.at + 9), aiDword(f.ai, f.at + 0x17), aiDword(f.ai, f.at + 0x1b), aiDword(f.ai, f.at + 0x1f), aiDword(f.ai, f.at + 0x13)]).toEqual([1, 44, role === 0 ? 11 : 0, role === 1 ? 22 : 0, role === 2 ? 33 : 0]);
    expect(f.ai[f.at + 4]).toBe(0); expect(aiSWord(f.ai, f.at + 5)).toBe(0);
  });
  it("calls actual virtual68 on other live kinds but skips kind5 before that call", () => {
    const f = fixture(), r = [{ kind: 5, index: 0 }, { kind: 6, index: 0 }, { kind: 8, index: 1 }];
    f.cells.set(worldCell(8192, 8192), r); surveyStagedStrategicSettlement(f.s, 1, 1, f.c);
    expect(f.virtuals).toEqual(r.slice(1));
  });
  it("uses actual protection before category-specific record fields", () => {
    const f = fixture(); f.place(3, 0, 0); f.protectedRefs.push({ kind: 3, index: 0 });
    surveyStagedStrategicSettlement(f.s, 1, 1, f.c); expect(f.ai[f.at + 4]).toBe(0);
  });
  it("preserves the source repeated boundary cell when resuming a budgeted scan", () => {
    const f = fixture(); aiPutDword(f.ai, 0x18e, 256); f.ai[0x18c] = 2;
    f.place(1, 0, 1, 8192, 7936)[122] = 4;
    expect(surveyStagedStrategicSettlement(f.s, 1, 1, f.c).complete).toBe(false);
    expect([aiSWord(f.ai, 0x184), aiSWord(f.ai, 0x186), aiSWord(f.ai, f.at + 9)]).toEqual([8192, 7936, 1]);
    expect(surveyStagedStrategicSettlement(f.s, 1, 1, f.c).complete).toBe(false);
    expect(aiSWord(f.ai, f.at + 9)).toBe(2);
    for (let i = 0; i < 8 && !f.ai[0x194]; i++) surveyStagedStrategicSettlement(f.s, 1, 1, f.c);
    expect(f.ai[0x194]).toBe(1); expect(f.s.rng.draws).toBe(0);
  });
  it("writes the independently selected visitor settlement from18D", () => {
    const f = fixture(); f.ai[0x18d] = 2; f.place(1, 0, 1)[122] = 4;
    surveyStagedStrategicSettlement(f.s, 1, 1, f.c);
    expect(aiSWord(f.ai, strategicSettlementOffset(2) + 9)).toBe(1); expect(aiSWord(f.ai, f.at + 9)).toBe(0);
  });
  it("rejects missing linked native identities and unreachable saved cursors", () => {
    const f = fixture(); f.cells.set(worldCell(8192, 8192), [{ kind: 1, index: 400 }]);
    expect(() => surveyStagedStrategicSettlement(f.s, 1, 1, f.c)).toThrow(/linked/);
    f.cells.clear(); f.ai[0x193] = 1; aiPutWord(f.ai, 0x184, 1);
    expect(() => surveyStagedStrategicSettlement(f.s, 1, 1, f.c)).toThrow(/bounds/);
  });
  it("continues a JSON-restored source cursor with the same complete numeric state", () => {
    const f = fixture(); aiPutDword(f.ai, 0x18e, 256); f.ai[0x18c] = 2;
    surveyStagedStrategicSettlement(f.s, 1, 1, f.c);
    const saved = JSON.parse(JSON.stringify(f.s));
    surveyStagedStrategicSettlement(f.s, 1, 1, f.c); surveyStagedStrategicSettlement(saved, 1, 1, f.c);
    expect(saved).toEqual(f.s);
  });
});
