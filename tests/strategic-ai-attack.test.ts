import { describe, expect, it } from "vitest";
import {
  aiDword,
  aiPutDword,
  aiPutWord,
  aiSWord,
  strategicGroupOffset,
} from "../src/sim/mechanics/strategic-ai";
import {
  attackStrategicGroup,
  makeStrategicAttackService,
  stepStrategicAttack,
} from "../src/sim/mechanics/strategic-ai-attack";
import { stepStrategicGroup } from "../src/sim/mechanics/strategic-ai-group-control";
import { nextRandom } from "../src/sim/mechanics/random";
import { aiGroupFixture } from "./fixtures/strategic-ai";
function attackFixture() {
  const f = aiGroupFixture(1, 2, 6),
    a = f.s.records[1],
    at = strategicGroupOffset(0);
  aiPutWord(a, at + 4, 0);
  aiPutWord(a, at, 10000);
  aiPutWord(a, at + 2, 10000);
  a[at + 9] = 0;
  return { ...f, at, a };
}
describe("source3BF90 attack launch", () => {
  it("transfers in source pool order, preserves protected count-before-admission, and launches once", () => {
    const { s, c, a, at } = attackFixture();
    const launches: unknown[] = [];
    const r = attackStrategicGroup(s, 1, 0, false, c, (_w, p, g) => {
      launches.push([p, g]);
      return { routine: 0x3c700, player: p, group: g };
    });
    expect(r.recruited).toEqual([0, 1, 2, 3, 4]);
    expect(r.threshold).toBe(5);
    expect(r.launched).toBe(true);
    expect(aiSWord(a, at + 4)).toBe(5);
    expect(s.creatureControl[7]).toBe(255);
    expect(s.rng.draws).toBe(50590);
    expect(a[at + 13] & 8).toBe(8);
    expect(a[5]).toBe(1);
    expect(aiDword(a, 0x6b3)).toBe(500);
    expect(launches).toEqual([[1, 0]]);
  });
  it.each([1, 2, 4])(
    "uses round%i's exact conditional threshold draw before self-group gating",
    (round) => {
      const { s, c, a } = attackFixture();
      a[5] = round;
      s.players[0][0x6e7] = 12;
      aiPutDword(s.players[1], 0x616, 99);
      const rng = { ...s.rng },
        expected =
          round % 2 ? 5 : 5 + (nextRandom(rng) % 5) + (round % 4 === 0 ? 5 : 1);
      const r = attackStrategicGroup(s, 1, 1, false, c);
      expect(r.threshold).toBe(expected);
      expect(r.launched).toBe(false);
      expect(s.rng).toEqual(rng);
    },
  );
  it("force replaces the computed threshold only after consuming its conditional draw", () => {
    const { s, c, a } = attackFixture();
    a[5] = 4;
    s.players[0][0x6e7] = 12;
    const rng = { ...s.rng };
    nextRandom(rng);
    expect(attackStrategicGroup(s, 1, 1, true, c).threshold).toBe(5);
    expect(s.rng).toEqual(rng);
  });
  it("caps expanded threshold by signed total and rejects an actual zero divisor", () => {
    const { s, c, a } = attackFixture();
    a[5] = 2;
    s.players[0][0x6e7] = 12;
    aiPutDword(s.players[1], 0x616, 3);
    expect(attackStrategicGroup(s, 1, 1, false, c).threshold).toBe(3);
    a[0x65f] = 0;
    const before = structuredClone(s);
    expect(() => stepStrategicAttack(s, 1, 0, false, c)).toThrow(
      "zero divisor",
    );
    expect(s).toEqual(before);
  });
  it("cooldown locks the group without recruiting, stamping time or advancing round", () => {
    const { s, c, a, at } = attackFixture();
    a[0x642] = 11;
    const before = { ...s.rng };
    const r = attackStrategicGroup(s, 1, 0, false, c);
    expect(r.waitTicks).toBe(50);
    expect(r.recruited).toEqual([]);
    expect(r.launched).toBe(false);
    expect(a[at + 13] & 8).toBe(8);
    expect(aiDword(a, 0x6b3)).toBe(0);
    expect(a[5]).toBe(0);
    expect(s.rng).toEqual(before);
  });
  it("uses uint32 elapsed time across rollover and byte round rollover", () => {
    const { s, c, a } = attackFixture();
    aiPutDword(a, 6, 20);
    aiPutDword(a, 0x6b3, 0xfffffff0);
    a[0x642] = 1;
    expect(attackStrategicGroup(s, 1, 0, false, c).waitTicks).toBe(14);
    a[0x642] = 0;
    a[5] = 255;
    attackStrategicGroup(s, 1, 0, false, c, (_w, p, g) => ({
      routine: 0x3c700,
      player: p,
      group: g,
    }));
    expect(a[5]).toBe(0);
  });
  it("does not equate an above-threshold starting group with threshold satisfaction", () => {
    const { s, c, a, at } = attackFixture();
    aiPutWord(a, at + 4, 7);
    const r = attackStrategicGroup(s, 1, 0, false, c, (_w, p, g) => ({
      routine: 0x3c700,
      player: p,
      group: g,
    }));
    // 3E5A0 refuses capped kind0 additions after the caller has unlinked donors.
    expect(r.recruited).toEqual([0, 1, 2, 3, 4, 5]);
    expect(aiSWord(a, at + 4)).toBe(7);
    expect(s.creatureControl.filter((_, i) => i % 2).slice(0, 6)).toEqual(
      Array(6).fill(255),
    );
  });
  it("source has no pre-unlink active test; inactive donor is detached and counted", () => {
    const { s, c, a, at } = attackFixture();
    s.creatures[0][6] = 0;
    aiPutDword(s.players[1], 0x616, 1);
    const r = attackStrategicGroup(s, 1, 0, true, c, (_w, p, g) => ({
      routine: 0x3c700,
      player: p,
      group: g,
    }));
    expect(r.recruited).toEqual([0]);
    expect(aiSWord(a, at + 4)).toBe(1);
    expect(s.creatureControl[1]).toBe(255);
  });
  it("requires the real launch service and rolls back all previous transfers/RNG on late failure", () => {
    const { s, c } = attackFixture(),
      before = structuredClone(s);
    expect(() => stepStrategicAttack(s, 1, 0, false, c)).toThrow("3C700");
    expect(s).toEqual(before);
    expect(() =>
      stepStrategicAttack(s, 1, 0, false, c, (w) => {
        w.players[1][13]++;
        throw Error("late launch");
      }),
    ).toThrow("late launch");
    expect(s).toEqual(before);
  });
  it("composes real group service and preserves a deterministic save/replay boundary", () => {
    const { s, c } = attackFixture(),
      restored = JSON.parse(JSON.stringify(s));
    const group = (w: typeof s, p: number, g: number) =>
      stepStrategicGroup(w, p, g, c);
    const receipt = makeStrategicAttackService(c, group).planAttack!(
      restored,
      1,
      0,
      false,
    );
    const result = stepStrategicAttack(s, 1, 0, false, c, group);
    expect(receipt).toEqual(result.receipt);
    expect(restored).toEqual(result.state);
  });
});
