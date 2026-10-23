import { describe, expect, it } from "vitest";
import {
  damageSpecialist,
  retireSpecialist,
  stepSpecialistDamageState,
  selectSpecialistDamageAnimation,
  type SpecialistDamageContext,
  type SpecialistDamageWorld,
} from "../src/sim/mechanics/specialist-damage";
import type { SpecialistBinding } from "../src/sim/mechanics/specialist-native";

type N = (number | null)[];
const put = (n: N, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const put32 = (n: N, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const bp = (i = 0) => 0x16 + i * 36;
function setup() {
  const records = Array.from({ length: 20 }, () => {
    const n: N = Array(200).fill(0);
    for (const [a, b] of [
      [31, 39],
      [176, 180],
      [192, 200],
    ])
      n.fill(null, a, b);
    return n;
  });
  const bindings: (SpecialistBinding | null)[] = Array(20).fill(null),
    players = Array.from({ length: 4 }, (_, i) => {
      const raw = Array(1805).fill(0);
      raw[1] = i;
      return { raw };
    });
  const w: SpecialistDamageWorld = {
      specialists: { schemaVersion: 1, records, bindings },
      players,
    },
    raw = players[0].raw;
  for (let i = 0; i < 3; i++) {
    const n = records[i];
    n[6] = 3;
    put(n, 15, i);
    n[24] = 0;
    n[85] = 9;
    n[88] = 1;
    n[112] = 1;
    n[116] = i;
    n[25] = 13;
    n[26] = 3;
    n[27] = 2;
    n[28] = 1;
    n[29] = 2;
    n[30] = 7;
    put(n, 65, 701);
    put(n, 7, 1024 + i * 64);
    put(n, 9, 2048);
    put32(n, 17, 4096);
    put32(n, 39, 5376);
    put(n, 57, 512);
    put(n, 59, 512);
    put(n, 61, 600);
    put32(n, 104, 123456);
    put32(n, 108, -123);
    const h: SpecialistBinding = {
      owner: 0,
      blueprintIndex: i,
      style: 0,
      category: 2,
      resourceKey: 2,
      assetKey: "SYNTHETIC",
      sourceName: "data/spec/synthetic.anb",
      classSpeed: 777,
      blueprintOffset: 192,
      animationOffset: 31,
      resourceOffset: 196,
      internal: { offset: 176, targetOffset: 196 },
      vtable: "kind3",
    };
    bindings[i] = h;
    raw[4 + i] = i;
    raw[bp(i)] = 1;
    raw[bp(i) + 21] = 0;
    raw[bp(i) + 22] = 2;
    raw[bp(i) + 25] = 80;
    raw[bp(i) + 26] = 80;
    raw[bp(i) + 32] = 0xff;
  }
  raw[3] = 3;
  raw[21] = 3;
  const calls: string[] = [],
    c: SpecialistDamageContext<SpecialistDamageWorld> = {
      unitPanelActive: true,
      selectedActor: 0,
      cancelWork: (world, i, mode) => {
        calls.push(`cancel${mode}`);
        world.specialists.records[i][88]! &= 254;
      },
      unlink: (_w, i, display) => {
        calls.push(`unlink${i}:${display}`);
      },
      cleanupReferences: (_w, t) => {
        calls.push(`cleanup${t.kind}:${t.index}`);
      },
      profile: () => ({ first: 11, last: 13, flags: 0, holds: [0, 0, 0] }),
      corpse: (_w, _i, r) => {
        calls.push(`corpse${r.code}`);
        return true;
      },
    };
  return { w, raw, n: records[0], calls, c };
}
describe("original specialist4FF40 damage", () => {
  it("uses signed blueprint health and saves task/timer, keeping the actual native alias", () => {
    const f = setup(),
      n = f.n,
      raw = f.raw,
      r = damageSpecialist(f.w, 0, 6, { index: 7, kind: 1 }, f.c);
    expect(f.w.specialists.records[0]).toBe(n);
    expect(f.w.players[0].raw).toBe(raw);
    expect([
      raw[bp() + 26],
      n[85],
      n[86],
      dword(n, 104),
      dword(n, 108),
    ]).toEqual([74, 5, 9, 10000, 123456]);
    expect([word(n, 123), n[125], word(n, 65)]).toEqual([7, 1, 350]);
    expect(n.slice(25, 31)).toEqual([13, 3, 0, 1, 0, 7]);
    expect(r).toMatchObject({
      dead: false,
      healthBefore: 80,
      healthAfter: 74,
      effectiveDamage: 6,
    });
    expect(r.events[0]).toMatchObject({
      type: "specialist-voice",
      variant: 4,
      style: 0,
      category: 2,
      queuePolicy: 0,
      arguments: [2, 0, 127, 100],
    });
    expect(f.calls).toEqual([]);
  });
  it("halves style1 signed damage with minimum1, retaining other styles' zero-damage path", () => {
    for (const [style, amount, effective, health] of [
      [1, 7, 3, 77],
      [1, 0, 1, 79],
      [1, -9, 1, 79],
      [0, 0, 0, 80],
    ]) {
      const f = setup();
      f.w.specialists.bindings[0]!.style = style;
      f.raw[bp() + 21] = style;
      const r = damageSpecialist(f.w, 0, amount, null, f.c);
      expect(r.effectiveDamage).toBe(effective);
      expect(f.raw[bp() + 26]).toBe(health);
      expect(f.n[85]).toBe(5);
    }
  });
  it("clears only attacker-kind for environmental damage and retains its old index", () => {
    const f = setup();
    put(f.n, 123, 1234);
    f.n[125] = 5;
    damageSpecialist(f.w, 0, 3, null, f.c);
    expect([word(f.n, 123), f.n[125], word(f.n, 65)]).toEqual([1234, 0, 701]);
  });
  it("ignores abductionstate3 and already-nonpositive health before attacker writes", () => {
    for (const abduction of [true, false]) {
      const f = setup();
      f.n[85] = abduction ? 3 : 9;
      f.raw[bp() + 26] = 0;
      const before = structuredClone(f.w),
        r = damageSpecialist(f.w, 0, 100, { index: 4, kind: 5 }, f.c);
      expect(r.dead).toBe(!abduction);
      expect(r.events).toEqual([]);
      expect(f.w).toEqual(before);
    }
  });
  it("updates attack reference but neither subtracts nonlethal health nor restarts an existing hit", () => {
    const f = setup();
    f.n[85] = 5;
    const before = f.n.slice();
    const r = damageSpecialist(f.w, 0, 5, { index: 3, kind: 5 }, f.c);
    expect(f.raw[bp() + 26]).toBe(80);
    expect(f.n.slice(25, 31)).toEqual(before.slice(25, 31));
    expect(dword(f.n, 104)).toBe(123456);
    expect([word(f.n, 123), f.n[125]]).toEqual([3, 5]);
    expect(r.events).toEqual([]);
  });
  it("requires real51E80 only on lethal working-state damage, before modifying anything", () => {
    const f = setup();
    delete f.c.cancelWork;
    const before = structuredClone(f.w);
    expect(() =>
      damageSpecialist(f.w, 0, 80, { index: 9, kind: 5 }, f.c),
    ).toThrow(/51E80/);
    expect(f.w).toEqual(before);
    f.n[88] = 0;
    expect(damageSpecialist(f.w, 0, 80, null, f.c).dead).toBe(true);
    expect(f.n[85]).toBe(4);
  });
  it("cancels work then enters lethal4/71bit10 without fabricating health0 or retirement", () => {
    const f = setup(),
      r = damageSpecialist(f.w, 0, 80, { index: 2, kind: 3 }, f.c);
    expect(f.calls).toEqual(["cancel1"]);
    expect([f.n[6], f.n[85], f.n[113], f.raw[bp() + 26], f.raw[3]]).toEqual([
      3, 4, 16, 80, 3,
    ]);
    expect(r.dead).toBe(true);
    expect(r.events[0]).toMatchObject({ type: "specialist-voice", variant: 5 });
  });
  it("rejects ports that replace held native arrays", () => {
    const f = setup();
    f.c.cancelWork = (w, i) => {
      w.specialists.records[i] = w.specialists.records[i].slice();
    };
    expect(() => damageSpecialist(f.w, 0, 100, null, f.c)).toThrow(
      /replaced retained/,
    );
  });
});
describe("specialist57740 removal and source80360/800B0", () => {
  it("requests panel cleanup before native services, shifts owner list without clearing stale tail, and retainsC0 binding", () => {
    const f = setup(),
      binding = f.w.specialists.bindings[0],
      r = retireSpecialist(f.w, 0, f.c);
    expect(f.calls).toEqual(["unlink0:16", "cleanup3:0"]);
    expect(r.slice(0, 2)).toEqual([
      { type: "specialist-panel-clear", index: 0 },
      { type: "specialist-panel-remove", index: 0, listIndex: 0 },
    ]);
    expect(f.raw.slice(3, 7)).toEqual([2, 1, 2, 2]);
    expect([f.raw[bp()], f.raw[bp() + 32], f.raw[21], f.n[6]]).toEqual([
      0, 252, 2, 0,
    ]);
    expect(f.w.specialists.bindings[0]).toBe(binding);
    expect(f.n.slice(196, 200)).toEqual(Array(4).fill(null));
    expect(r.at(-1)).toMatchObject({
      type: "specialist-retired",
      retiredIndex: 0,
      reason: "removed",
    });
    const second = retireSpecialist(f.w, 1, f.c);
    expect(second.at(-1)).toMatchObject({ retiredIndex: 1 });
    expect(f.raw[3]).toBe(1);
  });
  it("makes no invented work-cancel call or lost-unit increment during direct abduction removal", () => {
    const f = setup();
    f.c.unitPanelActive = false;
    f.c.cancelWork = () => {
      throw Error("not57740");
    };
    const r = retireSpecialist(f.w, 0, f.c);
    expect(r).toHaveLength(1);
    expect(dword(f.raw, 0x709)).toBe(0);
  });
  it("rejects unknown earlier inactiveC0 instead of assuming a zero pointer, with a real binding port available", () => {
    const f = setup();
    f.n[6] = 0;
    f.w.specialists.bindings[0] = null;
    expect(() => retireSpecialist(f.w, 1, f.c)).toThrow(/unknown retained C0/);
    f.c.inactiveBlueprint = () => null;
    expect(retireSpecialist(f.w, 1, f.c).at(-1)).toMatchObject({
      retiredIndex: 1,
    });
  });
  it("uses source first retainedC0 match even when that earlier record is inactive", () => {
    const f = setup();
    f.n[6] = 0;
    f.w.specialists.bindings[0] = { ...f.w.specialists.bindings[1]! };
    const r = retireSpecialist(f.w, 1, f.c);
    expect(r.at(-1)).toMatchObject({ retiredIndex: 0, blueprintIndex: 1 });
    expect(f.w.specialists.records[1][6]).toBe(3);
    expect(f.raw[bp(1)]).toBe(0);
  });
  it("keeps late failures inside the caller's isolated world transaction", () => {
    const f = setup(),
      staged = structuredClone(f.w),
      before = structuredClone(f.w);
    f.c.cleanupReferences = (w) => {
      w.players[0].raw[500] = 42;
      throw Error("synthetic cleanup failure");
    };
    expect(() => retireSpecialist(staged, 0, f.c)).toThrow(/synthetic/);
    expect(f.w).toEqual(before);
  });
});
describe("specialist57A10 death/hit state dispatch", () => {
  it("waits for actual action10 completion before restoring the saved state and dword timer", () => {
    const f = setup();
    damageSpecialist(f.w, 0, 3, null, f.c);
    expect(stepSpecialistDamageState(f.w, 0, f.c)).toEqual({
      handled: true,
      retired: false,
      events: [],
    });
    expect(selectSpecialistDamageAnimation(f.w, 0)).toBe(true);
    expect([f.n[25], f.n[26], f.n[27], f.n[28], f.n[29], f.n[30]]).toEqual([
      10, 3, 0, 1, 0, 7,
    ]);
    f.n[26] = f.n[30] = 0;
    f.n[27] = 1;
    expect(stepSpecialistDamageState(f.w, 0, f.c).retired).toBe(false);
    expect(f.n[85]).toBe(5);
    f.n[27] = 2;
    expect(stepSpecialistDamageState(f.w, 0, f.c).retired).toBe(false);
    expect([f.n[85], dword(f.n, 104)]).toEqual([9, 123456]);
  });
  it("creates real unmarked corpse69 before lost statistic and full retirement, even if capacity fails", () => {
    for (const capacity of [true, false]) {
      const f = setup();
      f.w.specialists.bindings[0]!.style = 1;
      f.w.specialists.bindings[0]!.category = 3;
      f.raw[bp() + 21] = 1;
      f.raw[bp() + 22] = 3;
      f.raw[bp() + 20] = 1;
      put32(f.raw, 0x709, -1);
      damageSpecialist(f.w, 0, 200, null, f.c);
      selectSpecialistDamageAnimation(f.w, 0);
      f.n[26] = f.n[30] = 0;
      f.n[27] = 2;
      f.c.corpse = (w, i, r) => {
        expect(w.specialists.records[i][6]).toBe(3);
        expect(dword(w.players[0].raw, 0x709)).toBe(-1);
        expect(r).toEqual({
          code: 69,
          owner: 0,
          position: [1024, 2048],
          height: 5376,
          angles: [512, 512, 600],
          parameter: 0,
          delay: 0,
          parent: null,
          newborn: false,
          packed76: 219,
          assetKey: "SYNTHETIC",
          action: 9,
          frame: 2,
        });
        f.calls.push("corpse69");
        return capacity;
      };
      const r = stepSpecialistDamageState(f.w, 0, f.c);
      expect(r.retired).toBe(true);
      expect(r.events[0]).toEqual({
        type: "specialist-corpse",
        index: 0,
        created: capacity,
      });
      expect(r.events[1]).toMatchObject({
        type: "specialist-lost",
        before: -1,
        after: 0,
      });
      expect(f.calls).toEqual([
        "cancel1",
        "corpse69",
        "unlink0:16",
        "cleanup3:0",
      ]);
      expect(f.n[6]).toBe(0);
      expect(f.raw[bp() + 26]).toBe(80);
    }
  });
  it("does not retire or advance animation while still waiting for actual death action9", () => {
    const f = setup();
    damageSpecialist(f.w, 0, 100, null, f.c);
    selectSpecialistDamageAnimation(f.w, 0);
    const before = f.n.slice();
    const r = stepSpecialistDamageState(f.w, 0, f.c);
    expect(r).toEqual({ handled: true, retired: false, events: [] });
    expect(f.n).toEqual(before);
    expect(dword(f.raw, 0x709)).toBe(0);
    expect(f.calls).toEqual(["cancel1"]);
  });
  it("leaves other state families to their actual callback and rejects a missing corpse service at the real call", () => {
    const f = setup();
    expect(stepSpecialistDamageState(f.w, 0, f.c)).toEqual({
      handled: false,
      retired: false,
      events: [],
    });
    expect(selectSpecialistDamageAnimation(f.w, 0)).toBe(false);
    damageSpecialist(f.w, 0, 100, null, f.c);
    selectSpecialistDamageAnimation(f.w, 0);
    f.n[26] = f.n[30] = 0;
    f.n[27] = 2;
    delete f.c.corpse;
    expect(() => stepSpecialistDamageState(f.w, 0, f.c)).toThrow(/corpse69/);
    expect(dword(f.raw, 0x709)).toBe(0);
    expect(f.n[6]).toBe(3);
  });
});
