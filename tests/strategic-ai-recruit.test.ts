import { describe, expect, it } from "vitest";
import {
  aiDword,
  aiPutDword,
  aiPutWord,
  chooseStrategicBlueprint,
  prepareStrategicRoster,
  recruitStrategicSpecialist,
  type StrategicAIState,
  type StrategicRecruitServices,
} from "../src/sim/mechanics/strategic-ai";
function fixture() {
  const s = {
    records: Array.from({ length: 4 }, () => Array(1726).fill(0)),
    players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    specialists: Array.from({ length: 20 }, (_, i) => {
      const native = Array(200).fill(0);
      aiPutWord(native, 15, i);
      native[24] = Math.floor(i / 5);
      return { native, blueprint: null };
    }),
    rng: { seed: 51, draws: 0, ring: null },
  } as StrategicAIState;
  const calls: (number | string)[] = [];
  const ports: StrategicRecruitServices = {
    createSpecialist: (w, r) => {
      calls.push(r.blueprint);
      const unit = w.specialists[r.slot];
      unit.native[6] = 3;
      unit.native[112] = 255;
      unit.blueprint = { player: r.player, index: r.blueprint };
      return r;
    },
    createLanding: (_w, r) => {
      calls.push("landing");
      return r;
    },
  };
  return { s, ports, calls };
}
function bp(
  s: StrategicAIState,
  index: number,
  category: number,
  skill: number,
  maxHealth: number,
) {
  const at = 0x16 + index * 36,
    p = s.players[1];
  p[at] = 65;
  p[at + 22] = category;
  p[at + 23] = skill;
  p[at + 25] = maxHealth;
  p[at + 26] = 10;
}
describe("source32E60 opponent recruitment", () => {
  it("selects greatest signed skill+maximum health with strict first ties", () => {
    const { s } = fixture();
    bp(s, 0, 0, 20, 60);
    bp(s, 1, 0, 40, 40);
    bp(s, 2, 0, 60, 30);
    expect(chooseStrategicBlueprint(s, 1, 0)).toBe(2);
    bp(s, 3, 0, 100, 200);
    expect(chooseStrategicBlueprint(s, 1, 0)).toBe(2);
    s.players[1][0x16 + 2 * 36 + 26] = 0;
    expect(chooseStrategicBlueprint(s, 1, 0)).toBe(0);
    aiPutDword(s.players[1], 0x16 + 32, 1);
    expect(chooseStrategicBlueprint(s, 1, 0)).toBe(1);
  });
  it("filters empty, wrong category, signed-nonpositive current health and active BPs", () => {
    const { s } = fixture();
    bp(s, 0, 1, 20, 20);
    bp(s, 1, 0, 20, 20);
    bp(s, 2, 0, 20, 20);
    bp(s, 3, 0, 20, 20);
    s.players[1][0x16 + 36] = 0;
    s.players[1][0x16 + 72 + 26] = 255;
    aiPutDword(s.players[1], 0x16 + 108 + 32, 1);
    expect(chooseStrategicBlueprint(s, 1, 0)).toBeNull();
    s.players[1][3] = 5;
    expect(chooseStrategicBlueprint(s, 1, 1)).toBeNull();
  });
  it("81300 appends the actual first-free owner slot and clears112-bit0 after factory", () => {
    const { s, ports, calls } = fixture();
    s.specialists[5].native[6] = 3;
    expect(recruitStrategicSpecialist(s, 1, 4, ports)).toBe(true);
    expect(calls).toEqual([4]);
    expect(s.players[1].slice(3, 5)).toEqual([1, 6]);
    expect(s.specialists[6].native[112]).toBe(254);
    expect(aiDword(s.players[1], 0x16 + 4 * 36 + 32)).toBe(1);
    expect(s.specialists[6].blueprint).toEqual({ player: 1, index: 4 });
  });
  it("81300 capacity failure does not set BP active, call factory or change player", () => {
    const { s, ports, calls } = fixture();
    for (let i = 5; i < 10; i++) s.specialists[i].native[6] = 3;
    const before = structuredClone(s);
    expect(recruitStrategicSpecialist(s, 1, 0, ports)).toBe(false);
    expect(s).toEqual(before);
    expect(calls).toEqual([]);
  });
  it("32E60 requests exact source order across five category passes, then one landing", () => {
    const { s, ports, calls } = fixture();
    for (let i = 0; i < 8; i++) bp(s, i, i % 4, 20 + i, 30);
    s.records[1].fill(2, 0x65a, 0x65e);
    const r = prepareStrategicRoster(s, 1, ports);
    expect(calls).toEqual([4, 5, 6, 7, 0, "landing"]);
    expect(s.players[1][3]).toBe(5);
    expect(r.selected.map((v) => v.category)).toEqual([0, 1, 2, 3, 0]);
    expect(r.landingRequested).toBe(true);
  });
  it("32F10 increments requested category even when actual native pool is full", () => {
    const { s, ports, calls } = fixture();
    bp(s, 0, 0, 20, 20);
    s.records[1][0x65a] = 1;
    for (let i = 5; i < 10; i++) s.specialists[i].native[6] = 3;
    const r = prepareStrategicRoster(s, 1, ports);
    expect(r.selected).toEqual([{ category: 0, blueprint: 0, created: false }]);
    expect(s.records[1][0x69e]).toBe(1);
    expect(s.players[1][3]).toBe(0);
    expect(calls).toEqual(["landing"]);
  });
  it("existing player499 landing skips all recruitment and missing ports are not consumed", () => {
    const { s } = fixture();
    bp(s, 0, 0, 20, 20);
    s.records[1][0x65a] = 1;
    aiPutDword(s.players[1], 0x499, 256);
    expect(prepareStrategicRoster(s, 1, {})).toEqual({
      routine: 0x32e60,
      player: 1,
      selected: [],
      landingRequested: false,
    });
  });
  it("missing actual factory or landing raises explicit required-family errors", () => {
    const { s, ports } = fixture();
    bp(s, 0, 0, 20, 20);
    s.records[1][0x65a] = 1;
    expect(() => prepareStrategicRoster(s, 1, {})).toThrow("4FD30");
    expect(() =>
      prepareStrategicRoster(s, 1, {
        createSpecialist: ports.createSpecialist,
      }),
    ).toThrow("80830");
  });
  it("rejects a fabricated constructor receipt or missing logical blueprint binding", () => {
    const { s } = fixture();
    expect(() =>
      recruitStrategicSpecialist(s, 1, 0, {
        createSpecialist: (_w, r) => r,
      }),
    ).toThrow("afterimage");
  });
});
