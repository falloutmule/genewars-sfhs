import { describe, expect, it } from "vitest";
import {
  initializeSerializedBuildings,
  stepRecyclingPlant,
  stepStagedRecyclingPlant,
  selectRecyclingPlant,
  selectRecyclingCorpse,
  type BuildingStartupRules,
  type RecyclingContext,
} from "../src/sim/mechanics/building-startup";
import type { BuildingNative } from "../src/sim/mechanics/building-native";

const rules: BuildingStartupRules = {
  schemaVersion: 1,
  resources: Array.from({ length: 14 }, (_, selector) => ({
    selector,
    path: `synthetic/${selector}.ANB`,
    assetKey: `FIXTURE${selector}`,
  })).filter((r) => r.selector !== 9),
  unsupportedSelectors: [9],
  upkeep: Array(14).fill(1),
  processingFrontOffset: [-256, 0],
};
function put(n: BuildingNative, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >>> 8) & 255;
}
function put32(n: BuildingNative, at: number, value: number) {
  put(n, at, value);
  put(n, at + 2, value >>> 16);
}
function word(n: BuildingNative, at: number) {
  return n[at]! | (n[at + 1]! << 8);
}
function dword(n: BuildingNative, at: number) {
  return (word(n, at) | (word(n, at + 2) << 16)) >>> 0;
}
function prior() {
  const n: BuildingNative = Array(67).fill(77);
  n[6] = 0;
  n.fill(null, 31, 39);
  return n;
}
function active(slot = 0, selector = 4) {
  const n = prior();
  n[6] = 4;
  put(n, 15, slot);
  n[24] = Math.floor(slot / 64);
  n[45] = selector;
  n[46] = 0;
  n[47] = 0;
  put(n, 43, 100);
  put(n, 49, 5);
  put(n, 61, 200);
  n[63] = n[48] = n[51] = n[21] = 0;
  n.fill(0, 25, 31);
  n[25] = 1;
  put(n, 7, 1024);
  put(n, 9, 768);
  put32(n, 17, -12345);
  n[23] = 91;
  return n;
}
interface World {
  native: BuildingNative;
  player: BuildingNative;
  plants: BuildingNative[];
  corpses: BuildingNative[];
  trace: string[];
  randomDraws: number;
}
function world(): World {
  const p: BuildingNative = Array(1805).fill(0);
  put32(p, 0x4a7, 90);
  put32(p, 0x5e6, 100);
  put32(p, 0x4a3, 7);
  return {
    native: active(),
    player: p,
    plants: [],
    corpses: [],
    trace: [],
    randomDraws: 0,
  };
}
function context(
  overrides: Partial<RecyclingContext<World>> = {},
): RecyclingContext<World> {
  return {
    rules,
    frame: 1,
    native: (w) => w.native,
    player: (w) => w.player,
    profile: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
    findPlant: (w, cell) => {
      w.trace.push(`plant:${cell}`);
      const slot = w.plants.findIndex((n) => n[6] === 2);
      return slot < 0 ? null : { slot, native: w.plants[slot] };
    },
    findCorpse: (w, cell) => {
      w.trace.push(`corpse:${cell}`);
      const slot = w.corpses.findIndex((n) => n[6] === 1);
      return slot < 0 ? null : { slot, native: w.corpses[slot] };
    },
    unlinkMaterial: (w, m, kind) => {
      w.trace.push(`unlink:${kind}:${m.slot}`);
    },
    retireMaterial: (w, m, kind) => {
      w.trace.push(`cleanup:${kind}:${m.slot}`);
      (kind === 2 ? w.plants : w.corpses)[m.slot][6] = 0;
    },
    credit: (w, owner, amount) => {
      w.trace.push(
        `credit:${owner}:${amount}:${dword(w.player, 0x4a7)}:${w.native[51]}`,
      );
      put32(w.player, 0x4a3, dword(w.player, 0x4a3) + amount);
      w.randomDraws++;
    },
    ...overrides,
  };
}
function step(w: World, c = context()) {
  const r = stepRecyclingPlant(w, 0, c);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe("serialized45010/44FF0 building initialization", () => {
  it("retains all actual bytes except the active initializer dword and exposes logical resource bindings", () => {
    const pool = Array.from({ length: 256 }, prior);
    const selectors = [3, 0, 4, 6, 6];
    selectors.forEach((s, i) => {
      pool[i] = active(i, s);
    });
    pool[2][46] = 2;
    pool[2][47] = 1;
    pool[2][27] = 12;
    pool[2][30] = 255;
    put(pool[2], 43, -22);
    put(pool[2], 61, -33);
    pool[2][51] = 201;
    const snapshot = structuredClone(pool);
    const r = initializeSerializedBuildings(pool, {
      rules,
      hasResource: () => true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(pool).toEqual(snapshot);
    expect(r.value.records).not.toBe(pool);
    for (let i = 0; i < 256; i++) {
      const expected = snapshot[i].slice();
      if (i < 5) expected.fill(0, 39, 43);
      expect(r.value.records[i]).toEqual(expected);
      expect(r.value.records[i]).not.toBe(pool[i]);
    }
    expect(r.value.bindings[2]).toEqual({
      slot: 2,
      selector: 4,
      assetKey: "FIXTURE4",
      path: "synthetic/4.ANB",
    });
    expect(r.value.records[2].slice(31, 39)).toEqual(Array(8).fill(null));
    expect(r.value.buildings[2]).toMatchObject({
      selector: 4,
      grade: 2,
      targetGrade: 1,
      health: -22,
      energy: -33,
      pendingMaterial: 201,
      ground: -12345,
      animation: { frame: 12, counter: -1 },
    });
    expect(r.value.ownerCounts).toEqual([5, 0, 0, 0]);
    expect(r.value.completedCounts[0][6]).toBe(2);
    r.value.records[20][0] = 0;
    expect(pool[20][0]).toBe(77);
  });
  it("binds every descriptor-supported selector, preserving native ANB without lookup/clamp", () => {
    const pool = Array.from({ length: 256 }, prior);
    const selectors = rules.resources.map((r) => r.selector);
    selectors.forEach((s, i) => {
      pool[i] = active(i, s);
      pool[i][25] = 255;
      pool[i][26] = 231;
    });
    const r = initializeSerializedBuildings(pool, {
      rules,
      hasResource: () => true,
    });
    expect(r.ok && r.value.bindings.map((b) => b.selector)).toEqual(selectors);
    expect(r.ok && r.value.buildings[0].animation.action).toBe(255);
  });
  it("rejects unavailable/absent resource rows and owner-slot mismatches atomically", () => {
    const pool = Array.from({ length: 256 }, prior);
    pool[0] = active();
    const before = structuredClone(pool);
    expect(
      initializeSerializedBuildings(pool, { rules, hasResource: () => false }),
    ).toEqual({ ok: false, reason: "missing-building-resource-FIXTURE4" });
    expect(pool).toEqual(before);
    pool[0][45] = 9;
    expect(
      initializeSerializedBuildings(pool, { rules, hasResource: () => true }),
    ).toEqual({
      ok: false,
      reason: "unsupported-building-resource-selector-9",
    });
    pool[0] = active(64);
    expect(
      initializeSerializedBuildings(pool, { rules, hasResource: () => true })
        .ok,
    ).toBe(false);
  });
});

describe("selector4 ordinary Recycling Plant callback", () => {
  it("uses first kind2 and exact signed state/flag/max-word corpse eligibility in chain order", () => {
    const mats = Array.from({ length: 7 }, (_, slot) => ({
      slot,
      native: Array<number | null>(171).fill(0),
    }));
    for (const m of mats) {
      m.native[6] = 1;
      m.native[94] = 25;
      put(m.native, 104, 42);
    }
    mats[0].native[94] = 24;
    put(mats[0].native, 104, 1000);
    mats[1].native[97] = 1;
    put(mats[1].native, 104, 1000);
    mats[2].native[94] = 255;
    put(mats[2].native, 104, 1000);
    put(mats[3].native, 104, -128);
    put(mats[4].native, 104, 256);
    put(mats[5].native, 104, 256);
    mats[6].native[6] = 2;
    expect(selectRecyclingPlant(mats)?.slot).toBe(6);
    expect(selectRecyclingCorpse(mats)?.slot).toBe(4);
    expect(selectRecyclingCorpse(mats.slice(0, 4))).toBeNull();
  });
  it("consumes first plant before corpse, starts processing, retains pending GOOP until the real animation returns0", () => {
    let w = world();
    const plant = Array(49).fill(0);
    plant[6] = 2;
    plant[48] = 3;
    w.plants.push(plant);
    const corpse = Array(171).fill(0);
    corpse[6] = 1;
    w.corpses.push(corpse);
    let r = step(w);
    w = r.world;
    expect(w.trace).toEqual(["plant:387", "unlink:2:0", "cleanup:2:0"]);
    expect(w.native[51]).toBe(14);
    expect(w.native[27]).toBe(1);
    expect(w.native[63]).toBe(3);
    expect(w.plants[0][6]).toBe(0);
    expect(w.corpses[0][6]).toBe(1);
    expect(dword(w.player, 0x4a7)).toBe(90);
    w.corpses = [];
    r = step(w);
    w = r.world;
    expect(w.native[27]).toBe(0);
    expect(w.native[51]).toBe(14);
    r = step(w);
    w = r.world;
    expect(dword(w.player, 0x4a7)).toBe(100);
    expect(dword(w.player, 0x4a3)).toBe(27);
    expect(w.trace).toContain("credit:0:20:100:0");
    expect(w.randomDraws).toBe(1);
    expect(r.receipt.events[0]).toEqual({
      type: "recycling-deposit",
      owner: 0,
      amount: 14,
      stored: 10,
      discarded: 4,
      credit: 20,
    });
  });
  it("still gives the source20 credit when storage is full", () => {
    const w = world();
    put32(w.player, 0x4a7, 100);
    w.native[51] = 13;
    const r = step(w);
    expect(dword(r.world.player, 0x4a7)).toBe(100);
    expect(r.world.randomDraws).toBe(1);
    expect(r.receipt.events[0]).toMatchObject({
      stored: 0,
      discarded: 13,
      credit: 20,
    });
  });
  it("handles byte-wrapped corpse payload and signed research up to the actual player cap, in unlink/research/cleanup order", () => {
    const w = world();
    w.native[46] = 2;
    const corpse = Array(171).fill(0);
    corpse[6] = 1;
    corpse[104] = 255;
    corpse[122] = 3;
    w.corpses.push(corpse);
    put32(w.player, 0x61a + 3 * 4, 102390);
    const c = context({
      retireMaterial: (s, m, kind) => {
        expect(s.trace.at(-1)).toBe("unlink:1:0");
        expect(dword(s.player, 0x61a + 12)).toBe(102400);
        s.trace.push("cleanup:1:0");
        s.corpses[m.slot][6] = 0;
      },
    });
    const r = step(w, c);
    expect(r.world.native[51]).toBe(42);
    expect(r.world.native[63]).toBe(3);
    expect(r.receipt.events[0]).toEqual({
      type: "recycling-research",
      owner: 0,
      species: 3,
      before: 102390,
      after: 102400,
    });
  });
  it("loses power after exact upkeep, starts warning once, pauses material and resumes when power is actually restored", () => {
    const w = world();
    put(w.native, 61, 3);
    w.native[63] = 2;
    w.native[51] = 8;
    const r = step(w, context({ findPlant: undefined, findCorpse: undefined }));
    expect(word(r.world.native, 61)).toBe(0);
    expect(word(r.world.native, 49) & 4).toBe(0);
    expect(word(r.world.player, 0x5ea)).toBe(1000);
    expect(r.world.native[51]).toBe(8);
    expect(r.world.native[63]).toBe(1);
    const still = step(
      r.world,
      context({ findPlant: undefined, findCorpse: undefined }),
    );
    expect(still.receipt.events[0]).toMatchObject({ warningStarted: false });
    put(still.world.native, 61, 10);
    put(still.world.native, 49, 5);
    const resumed = step(still.world);
    expect(resumed.world.native[51]).toBe(0);
    expect(resumed.world.randomDraws).toBe(1);
  });
  it("uses suppression/disabled/incomplete common tails without consumption or invented profile resets", () => {
    for (const flags of [0x105, 0x45, 0]) {
      const w = world();
      put(w.native, 49, flags);
      w.native[63] = 7;
      w.native[51] = 8;
      w.native[48] = 3;
      w.native[47] = 1;
      const r = step(
        w,
        context({ findPlant: undefined, findCorpse: undefined }),
      );
      expect(r.world.native[51]).toBe(8);
      expect(r.world.trace).toEqual([]);
      expect(r.world.native[48]).toBe(2);
      expect(word(r.world.native, 61)).toBe(flags === 0x105 ? 191 : 199);
      expect(r.world.native[63]).toBe(flags === 0x105 ? 6 : 7);
      expect(r.world.native[25]).toBe(flags === 0 ? 0 : flags === 0x45 ? 4 : 1);
    }
  });
  it("retains incomplete health0 early-return after dirty timer/energy decay", () => {
    const w = world();
    put(w.native, 49, 0);
    put(w.native, 43, 0);
    w.native[48] = 2;
    const r = step(
      w,
      context({
        profile: () => {
          throw new Error("must not advance");
        },
      }),
    );
    expect(r.receipt.queueDraw).toBe(false);
    expect(r.world.native[48]).toBe(1);
    expect(word(r.world.native, 61)).toBe(199);
  });
  it("clamps positive wrapped energy and decrements extra drain at the source tail", () => {
    const w = world();
    put(w.native, 61, -32768);
    const r = step(w);
    expect(word(r.world.native, 61)).toBe(200);
    expect(word(r.world.native, 49) & 4).toBe(4);
  });
  it("runs the actual grade collector only on its256-frame cadence and charges16 only after allocation", () => {
    for (const grade of [1, 2])
      for (const success of [false, true]) {
        const w = world();
        w.native[46] = grade;
        const r = step(
          w,
          context({
            frame: 256,
            dispatchCollection: (s, slot, range) => {
              expect(slot).toBe(0);
              expect(range).toBe(grade === 1 ? 1024 : 1536);
              s.trace.push("collector");
              return success;
            },
          }),
        );
        expect(r.world.native[63]).toBe(success ? 15 : 0);
      }
    const w = world();
    w.native[46] = 1;
    expect(step(w).receipt.events).toEqual([]);
  });
  it("rolls back a late missing query after a real credit, and a later profile failure after retirement", () => {
    const w = world();
    w.native[51] = 8;
    const before = structuredClone(w);
    expect(stepRecyclingPlant(w, 0, context({ findPlant: undefined }))).toEqual(
      { ok: false, reason: "missing-recycling-service-8B300-plant-query" },
    );
    expect(w).toEqual(before);
    const plant = Array(49).fill(0);
    plant[6] = 2;
    plant[48] = 1;
    w.plants.push(plant);
    const snapshot = structuredClone(w);
    expect(
      stepRecyclingPlant(
        w,
        0,
        context({
          profile: () => {
            throw new Error("missing-profile");
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "missing-profile" });
    expect(w).toEqual(snapshot);
  });
  it("persists processing and reproduces the same continuation after JSON save/load", () => {
    let w = world();
    const plant = Array(49).fill(0);
    plant[6] = 2;
    plant[48] = 5;
    w.plants.push(plant);
    w = step(w).world;
    let restored: World = JSON.parse(JSON.stringify(w));
    for (let i = 0; i < 15; i++) {
      w = step(w).world;
      restored = step(restored).world;
    }
    expect(restored).toEqual(w);
  });
  it("staged entry preserves native/player aliases and refuses collapse before mutation", () => {
    const w = world(),
      n = w.native,
      p = w.player;
    w.native[51] = 8;
    stepStagedRecyclingPlant(w, 0, context());
    expect(w.native).toBe(n);
    expect(w.player).toBe(p);
    put(w.native, 49, 0x805);
    const snapshot = structuredClone(w);
    expect(() => stepStagedRecyclingPlant(w, 0, context())).toThrow(
      "recycling-collapse-requires-shared-callback",
    );
    expect(w).toEqual(snapshot);
  });
});
