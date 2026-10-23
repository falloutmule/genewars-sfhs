import { describe, expect, it } from "vitest";
import {
  aiPutDword,
  aiPutWord,
  aiSWord,
  strategicGroupOffset,
} from "../src/sim/mechanics/strategic-ai";
import {
  discoverStrategicGroupTargets,
  interactStrategicGroupTarget,
  makeStrategicGroupService,
  selectStrategicGroupTarget,
  stepStrategicGroup,
  stepStrategicGroupAtomic,
  strategicTargetCategoryOrder,
} from "../src/sim/mechanics/strategic-ai-group-control";
import { aiGroupFixture, aiMember } from "./fixtures/strategic-ai";

describe("source3C700 strategic group control", () => {
  it("uses strict target participation ties, saturates admission at3, and retains empty sentinel6", () => {
    const { s } = aiGroupFixture(),
      a = s.records[1],
      at = strategicGroupOffset(0);
    for (let t = 0; t < 4; t++) {
      aiPutWord(a, at + 14 + t * 4, t);
      a[at + 16 + t * 4] = t < 2 ? 1 : 3;
    }
    expect(selectStrategicGroupTarget(s, 1, 0)).toBe(0);
    a[at + 16] = 2;
    expect(selectStrategicGroupTarget(s, 1, 0)).toBe(1);
    for (let t = 0; t < 4; t++) a[at + 16 + t * 4] = 3;
    expect(selectStrategicGroupTarget(s, 1, 0)).toBe(6);
  });
  it("retains the literal strict-swap category tie order and subtracts existing target pressure", () => {
    const { s } = aiGroupFixture(),
      a = s.records[1],
      at = strategicGroupOffset(0);
    expect(strategicTargetCategoryOrder(s, 1, 0, 0)).toEqual([0, 2, 1]);
    aiPutWord(a, at + 14, 8);
    a[at + 17] = 1;
    aiPutWord(a, at + 18, 9);
    a[at + 21] = 1;
    expect(strategicTargetCategoryOrder(s, 1, 0, 0)).toEqual([1, 0, 2]);
  });
  it("discovers hostile pools through source range/wrap and filters protected buildings", () => {
    const { s, c } = aiGroupFixture();
    const at = strategicGroupOffset(0),
      a = s.records[1];
    aiPutWord(a, at, 32700);
    aiPutWord(a, at + 2, 10000);
    aiMember(s, 4, 255, 0);
    aiPutWord(s.creatures[4], 7, 100);
    s.buildings[0][6] = 4;
    aiPutWord(s.buildings[0], 7, 32700);
    aiPutWord(s.buildings[0], 9, 10000);
    aiPutWord(s.buildings[0], 49, 0x100);
    expect(discoverStrategicGroupTargets(s, 1, 0, 0, c)).toBe(1);
    expect(a.slice(at + 14, at + 18)).toEqual([4, 0, 0, 0]);
  });
  it("preserves the closer-building scratch destination quirk rather than repairing target selection", () => {
    const { s, c } = aiGroupFixture(),
      a = s.records[1],
      at = strategicGroupOffset(0);
    for (const [i, x] of [
      [0, 11000],
      [1, 10100],
    ]) {
      const n = s.buildings[i];
      n[6] = 4;
      aiPutWord(n, 7, x);
      aiPutWord(n, 9, 10000);
    }
    expect(discoverStrategicGroupTargets(s, 1, 0, 0, c)).toBe(2);
    expect(a.slice(at + 14, at + 18)).toEqual([1, 0, 0, 0]);
    expect(a.slice(at + 18, at + 22)).toEqual([0, 0, 0, 1]);
  });
  it("increments target participation after a real logical interaction, including byte wrap", () => {
    const { s, c, calls } = aiGroupFixture(),
      at = strategicGroupOffset(0),
      a = s.records[1];
    aiPutWord(a, at + 14, 4);
    a[at + 16] = 255;
    a[at + 17] = 1;
    interactStrategicGroupTarget(s, 1, 0, 0, 0, c);
    expect(calls).toEqual([
      {
        routine: 0x5b580,
        creature: 0,
        target: { family: 4, index: 4 },
        force: false,
      },
    ]);
    expect(a[at + 16]).toBe(0);
  });
  it("does not fabricate an interaction for an unknown target category", () => {
    const { s, c, calls } = aiGroupFixture(),
      at = strategicGroupOffset(0),
      a = s.records[1];
    aiPutWord(a, at + 14, 4);
    a[at + 17] = 8;
    interactStrategicGroupTarget(s, 1, 0, 0, 0, c);
    expect(calls).toEqual([]);
    expect(a[at + 16]).toBe(1);
  });
  it("common maintenance counts inactive members and reads the creature pool for every target category", () => {
    const { s, c } = aiGroupFixture(0, 7, 2),
      a = s.records[1],
      at = strategicGroupOffset(0);
    s.creatures[1][6] = 0;
    aiPutWord(a, at + 14, 4);
    a[at + 17] = 1;
    aiPutWord(s.creatures[4], 7, 20000);
    aiPutWord(s.creatures[4], 9, 20000);
    s.buildings[4][6] = 4;
    aiPutWord(s.buildings[4], 7, 10000);
    aiPutWord(s.buildings[4], 9, 10000);
    stepStrategicGroup(s, 1, 0, c);
    expect(aiSWord(a, at + 4)).toBe(2);
    expect(aiSWord(a, at + 14)).toBe(-1);
  });
  it("uses the source /4 specialist cleanup mapping, including its adjacent building byte", () => {
    const { s, c } = aiGroupFixture(0, 7),
      a = s.records[1],
      at = strategicGroupOffset(0);
    aiPutWord(a, at + 14, 16);
    a[at + 17] = 2;
    aiPutWord(s.creatures[16], 7, 10000);
    aiPutWord(s.creatures[16], 9, 10000);
    // index16 maps native slot20: next pool+115 = building1 byte48.
    s.buildings[1][48] = 224;
    stepStrategicGroup(s, 1, 0, c);
    expect(aiSWord(a, at + 14)).toBe(-1);
  });
  it("releases a distant combatant before interaction and skips distant mode7", () => {
    for (const mode of [0, 7]) {
      const { s, c, calls } = aiGroupFixture();
      aiMember(s, 4, 255, 0);
      aiPutWord(s.creatures[0], 7, 20000);
      s.creatures[0][120] = mode;
      stepStrategicGroup(s, 1, 0, c);
      expect(calls).toEqual(
        mode === 7
          ? []
          : [
              { routine: 0x5cc60, creature: 0 },
              {
                routine: 0x5b580,
                creature: 0,
                target: { family: 1, index: 4 },
                force: false,
              },
            ],
      );
    }
  });
  it("defender state2 waits for a third defender before target interaction", () => {
    const { s, c, calls } = aiGroupFixture(1, 2);
    aiMember(s, 5, 255, 0);
    s.creatures[0][95] = 2;
    stepStrategicGroup(s, 1, 1, c);
    expect(calls).toEqual([]);
    aiMember(s, 1, 1)[95] = 2;
    aiMember(s, 2, 1)[95] = 2;
    stepStrategicGroup(s, 1, 1, c);
    expect(calls).toHaveLength(3);
  });
  it.each([3, 4])(
    "donor kind%i retains its source minimum and skips protected members",
    (kind) => {
      const { s, c } = aiGroupFixture(4, kind, 6),
        a = s.records[1],
        from = strategicGroupOffset(4),
        to = strategicGroupOffset(0);
      aiPutWord(a, to + 4, 0);
      a[to + 9] = 0;
      stepStrategicGroup(s, 1, 4, c);
      expect(aiSWord(a, from + 4)).toBe(kind === 3 ? 3 : 4);
      expect(aiSWord(a, to + 4)).toBe(kind === 3 ? 3 : 2);
      expect(s.creatureControl[7]).toBe(4);
    },
  );
  it("zone incompatibility unbinds but still issues the source outside-radius order", () => {
    const { s, c, calls } = aiGroupFixture(4, 5),
      a = s.records[1],
      at = strategicGroupOffset(4);
    a[at + 12] = 0;
    s.missionPrefix[0x34b8] = 1;
    s.missionPrefix[0x2ff8 + 4] = 8;
    aiPutDword(s.missionPrefix, 0x2ff8 + 6, 256);
    aiPutDword(s.missionPrefix, 0x2ff8 + 14, -100000);
    aiPutWord(s.creatures[0], 7, 12000);
    stepStrategicGroup(s, 1, 4, c);
    expect(aiSWord(a, at + 6)).toBe(180 + Math.trunc(-100000 / 256));
    expect(s.creatureControl[1]).toBe(255);
    expect(s.creatureControl[0]! & 4).toBe(4);
    expect(calls).toEqual([
      { routine: 0x5cc60, creature: 0 },
      { routine: 0x81c60, player: 1, creature: 0, point: [10000, 10000] },
    ]);
  });
  it("uses countdown-expanded radius and clears an inside zone's pending move bit", () => {
    const { s, c, calls } = aiGroupFixture(4, 5),
      a = s.records[1],
      at = strategicGroupOffset(4);
    a[at + 12] = 0;
    s.missionPrefix[0x34b8] = 1;
    s.missionPrefix[0x2ff8 + 4] = 7;
    aiPutDword(s.missionPrefix, 0x2ff8 + 6, 256);
    aiPutWord(s.missionPrefix, 0x355c, 101);
    aiPutWord(s.creatures[0], 7, 12000);
    s.creatureControl[0] = 4;
    stepStrategicGroup(s, 1, 4, c);
    expect(calls).toEqual([]);
    expect(s.creatureControl[0]).toBe(0);
  });
  it("reward group retirement releases links when its actual effect59 disappears", () => {
    const { s, c } = aiGroupFixture(4, 6),
      a = s.records[1],
      at = strategicGroupOffset(4);
    a[at + 12] = 0;
    stepStrategicGroup(s, 1, 4, c);
    expect(aiSWord(a, at + 4)).toBe(-1);
    expect(s.creatureControl[1]).toBe(255);
  });
  it("reward search preserves source negative-prior skip and attaches an assigned candidate", () => {
    for (const prior of [255, 1]) {
      const { s, c, effects } = aiGroupFixture(4, 6, 0),
        a = s.records[1],
        at = strategicGroupOffset(4);
      a[at + 12] = 0;
      effects[0][6] = 5;
      effects[0][69] = 59;
      aiMember(s, 0, prior);
      stepStrategicGroup(s, 1, 4, c);
      expect(s.creatureControl[1]).toBe(prior === 255 ? 255 : 4);
      expect(aiSWord(a, at + 4)).toBe(prior === 255 ? 0 : 1);
    }
  });
  it("releases a research-finished reward member but preserves its final source move", () => {
    const { s, c, effects, calls } = aiGroupFixture(4, 6),
      a = s.records[1],
      at = strategicGroupOffset(4);
    a[at + 12] = 0;
    effects[0][6] = 5;
    effects[0][69] = 59;
    s.players[1][0x6c7 + 4] = 1;
    stepStrategicGroup(s, 1, 4, c);
    expect(s.creatureControl[1]).toBe(255);
    expect(calls).toHaveLength(2);
  });
  it("rolls back maintenance and earlier interactions if a required late port fails", () => {
    const { s, c } = aiGroupFixture(0, 0, 2);
    aiMember(s, 4, 255, 0);
    const before = structuredClone(s);
    let n = 0;
    c.interact = (w, r) => {
      w.players[1][13]++;
      if (++n === 2) throw Error("late interaction");
      return r;
    };
    expect(() => stepStrategicGroupAtomic(s, 1, 0, c)).toThrow(
      "late interaction",
    );
    expect(s).toEqual(before);
  });
  it("rejects missing action ports and replaced held native identity", () => {
    const { s, c } = aiGroupFixture();
    aiMember(s, 4, 255, 0);
    aiPutWord(s.creatures[0], 7, 20000);
    expect(() =>
      stepStrategicGroupAtomic(s, 1, 0, { ...c, releaseAction: undefined }),
    ).toThrow("5CC60");
    c.releaseAction = (w, i) => {
      w.creatures[i] = w.creatures[i].slice();
      return { routine: 0x5cc60, creature: i };
    };
    expect(() => stepStrategicGroupAtomic(s, 1, 0, c)).toThrow("receipt");
  });
  it("round-trips serializable state and supplies the concrete core service receipt", () => {
    const { s, c } = aiGroupFixture(0, 7);
    const restored = JSON.parse(JSON.stringify(s));
    expect(makeStrategicGroupService(c).stepGroup!(restored, 1, 0)).toEqual({
      routine: 0x3c700,
      player: 1,
      group: 0,
    });
    expect(stepStrategicGroupAtomic(s, 1, 0, c).state).toEqual(restored);
  });
});
