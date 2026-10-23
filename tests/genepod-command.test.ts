import { describe, expect, it } from "vitest";
import { strategicFixture } from "./fixtures/strategic-production";
import {
  aiDword,
  aiPutDword,
  aiPutWord,
  aiSWord,
} from "../src/sim/mechanics/strategic-ai-state";
import {
  applyGenepodCommand,
  applyStagedGenepodCommand,
  genepodCommandPacket,
  type GenepodCommandContext,
} from "../src/sim/mechanics/genepod-command";
function fixture(cost = 75, grade = 0) {
  const s = strategicFixture(),
    n = s.buildings[64],
    p = s.players[1],
    c: GenepodCommandContext = {
      speciesTraits: Array.from({ length: 25 }, () => Array(45).fill(0)),
    };
  (c.speciesTraits as number[][]).forEach((row) => aiPutDword(row, 32, cost));
  n[46] = grade;
  n[58] = 3;
  p[0x4a1] = 1;
  aiPutDword(p, 0x4a3, 200);
  aiPutDword(p, 0x4a7, 30);
  aiPutDword(p, 0x5e6, 600);
  return {
    s,
    n,
    p,
    c,
    packet: (parameter = 1, species = 4) =>
      genepodCommandPacket(species, 64, parameter),
  };
}
describe("source814A0 Genepod command", () => {
  it("retains unused command bytes as unknown and consumes only the three words", () => {
    const f = fixture(),
      packet = f.packet();
    expect(packet).toEqual([4, 0, 64, 0, 1, 0, null, null, null, null, 12]);
    packet[10] = null;
    expect(applyStagedGenepodCommand(f.s, 1, packet, f.c)).toMatchObject({
      disposition: "started",
      cost: 75,
      remaining: 75,
    });
  });
  it("writes real work/species and human payer without invented admission gates", () => {
    const f = fixture(75, 2);
    f.n[6] = 0;
    f.n[45] = 13;
    f.n[27] = 40;
    aiPutWord(f.n, 49, 0xffff);
    aiPutDword(f.p, 0x4a3, 0);
    aiPutDword(f.p, 0x4a7, 0);
    f.p[0x62a] = 0;
    const receipt = applyStagedGenepodCommand(f.s, 1, f.packet(), f.c);
    expect(receipt).toMatchObject({ remaining: 18, partialPayment: 3 });
    expect(aiSWord(f.n, 52)).toBe(18);
    expect(f.n[51]).toBe(4);
    expect(f.n[58]).toBe(1);
    expect(aiDword(f.p, 0x4a7) | 0).toBe(-3);
    expect(f.n[27]).toBe(40);
  });
  it("accepts all25 admitted species instead of applying Mule-only birth admission", () => {
    for (let species = 0; species < 25; species++) {
      const f = fixture(101 + species, 1);
      applyStagedGenepodCommand(f.s, 1, f.packet(1, species), f.c);
      expect(f.n[51]).toBe(species);
      expect(aiDword(f.n, 54)).toBe((101 + species) >> 1);
    }
  });
  it("debits cash before GOOP and replenishes by construction subowner type", () => {
    const f = fixture(75, 2);
    aiPutDword(f.p, 0x4a3, 1);
    aiPutDword(f.p, 0x4a7, 10);
    f.p[0x4a1] = 2;
    f.s.players[2][2] = 1;
    expect(
      applyStagedGenepodCommand(f.s, 1, f.packet(), f.c).computerRefilled,
    ).toBe(true);
    expect(aiDword(f.p, 0x4a3)).toBe(0);
    expect(aiDword(f.p, 0x4a7)).toBe(1000);
    //Top-level human status, independently, assigns the human payer.
    expect(f.n[58]).toBe(1);
  });
  it("leaves the payer unchanged for computer commands even with unknown prior", () => {
    const f = fixture();
    f.p[2] = 1;
    f.n[58] = null;
    applyStagedGenepodCommand(f.s, 1, f.packet(), f.c);
    expect(f.n[58]).toBeNull();
    expect(aiDword(f.p, 0x4a7)).toBe(1000);
  });
  it("uses the signed total for computer refill including overflow", () => {
    const f = fixture(0);
    f.p[2] = 1;
    aiPutDword(f.p, 0x4a3, 0x7fffffff);
    aiPutDword(f.p, 0x4a7, 1);
    expect(
      applyStagedGenepodCommand(f.s, 1, f.packet(), f.c).computerRefilled,
    ).toBe(true);
    expect(aiDword(f.p, 0x4a3)).toBe(0x7fffffff);
    expect(aiDword(f.p, 0x4a7)).toBe(1000);
  });
  it("cancels only the numeric remaining field and refunds paid work plus remainder", () => {
    const f = fixture(75, 2);
    applyStagedGenepodCommand(f.s, 1, f.packet(), f.c);
    aiPutDword(f.n, 54, 13);
    const receipt = applyStagedGenepodCommand(f.s, 1, f.packet(0), f.c);
    expect(receipt).toMatchObject({
      refund: 23,
      capacityCapped: false,
      remaining: 0,
    });
    expect(aiDword(f.p, 0x4a7)).toBe(53);
    expect(aiSWord(f.n, 52)).toBe(18);
    expect(f.n[51]).toBe(4);
  });
  it("caps GOOP on unsigned equality and moves exact excess to cash", () => {
    const f = fixture(75, 1);
    aiPutWord(f.n, 52, 37);
    aiPutDword(f.n, 54, 27);
    aiPutDword(f.p, 0x4a7, 590);
    expect(applyStagedGenepodCommand(f.s, 1, f.packet(0), f.c)).toMatchObject({
      refund: 21,
      capacityCapped: true,
    });
    expect(aiDword(f.p, 0x4a7)).toBe(600);
    expect(aiDword(f.p, 0x4a3)).toBe(211);
    aiPutDword(f.n, 54, 37);
    aiPutDword(f.p, 0x4a7, 599);
    expect(
      applyStagedGenepodCommand(f.s, 1, f.packet(0), f.c).capacityCapped,
    ).toBe(true);
  });
  it("keeps signed native52 and unsigned refund-cap comparison", () => {
    const f = fixture(0, 0);
    aiPutWord(f.n, 52, 0x8000);
    aiPutDword(f.n, 54, 0);
    const result = applyStagedGenepodCommand(f.s, 1, f.packet(0), f.c);
    expect(result.refund).toBe(-32768);
    expect(result.capacityCapped).toBe(true);
    expect(aiDword(f.p, 0x4a7)).toBe(600);
    expect(aiDword(f.p, 0x4a3) | 0).toBe(-33138);
  });
  it("applies x86 five-bit shift counts and signed cost", () => {
    for (const grade of [0, 1, 2, 31, 32, 33, 255]) {
      const f = fixture(-1234567, grade),
        receipt = applyStagedGenepodCommand(f.s, 1, f.packet(-1), f.c);
      expect(receipt.shift).toBe(grade & 31);
      expect(receipt.remaining).toBe(-1234567 >> (grade & 31));
      expect(aiSWord(f.n, 52)).toBe((receipt.remaining << 16) >> 16);
    }
  });
  it("requests presentation refresh only for start and consumes no RNG", () => {
    const f = fixture(),
      rng = f.s.rng,
      before = { ...rng };
    f.c.panelRefreshEligible = true;
    expect(
      applyStagedGenepodCommand(f.s, 1, f.packet(), f.c).panelRefreshRequested,
    ).toBe(true);
    expect(
      applyStagedGenepodCommand(f.s, 1, f.packet(0), f.c).panelRefreshRequested,
    ).toBe(false);
    expect(f.s.rng).toBe(rng);
    expect(rng).toEqual(before);
  });
  it("preserves held records and every unrelated numeric prior", () => {
    const f = fixture(),
      n = f.n,
      p = f.p,
      buildings = f.s.buildings,
      players = f.s.players;
    const before = n.slice();
    applyStagedGenepodCommand(f.s, 1, f.packet(), f.c);
    expect(f.s.buildings).toBe(buildings);
    expect(f.s.players).toBe(players);
    expect(f.s.buildings[64]).toBe(n);
    expect(f.s.players[1]).toBe(p);
    for (let i = 0; i < 67; i++)
      if (![51, 52, 53, 54, 55, 56, 57, 58].includes(i))
        expect(n[i]).toBe(before[i]);
  });
  it("rolls back a late missing-subowner failure in the standalone wrapper", () => {
    const f = fixture();
    f.p[0x4a1] = 4;
    const before = JSON.stringify(f.s);
    expect(() => applyGenepodCommand(f.s, 1, f.packet(), f.c)).toThrow(
      "subowner",
    );
    expect(JSON.stringify(f.s)).toBe(before);
  });
  it("rejects unbound costs, invalid signed species and native pointers", () => {
    const f = fixture();
    expect(() =>
      applyStagedGenepodCommand(f.s, 1, f.packet(1, -1), f.c),
    ).toThrow("species");
    expect(() =>
      applyStagedGenepodCommand(f.s, 1, f.packet(1, 25), f.c),
    ).toThrow("species");
    f.n[31] = 0;
    expect(() => applyStagedGenepodCommand(f.s, 1, f.packet(), f.c)).toThrow(
      "native",
    );
  });
});
