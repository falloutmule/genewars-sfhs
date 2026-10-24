import { describe, expect, it } from "vitest";
import {
  requestOwnedMuleMove,
  stepOwnedMule,
  stepNeutralMule,
  queryMuleAirborneBuilding,
  type MuleContext,
} from "../src/sim/mechanics/mule";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import type {
  EcologyMule,
  EcologyState,
  EcologyRules,
  EcologyPlant,
} from "../src/sim/mechanics/ecology";
import { worldCell } from "../src/sim/mechanics/terrain";

describe("corpse and BONES food lifecycle", () => {
  function foodScene(owner = 4, action = 5, targetState = 25) {
    const f = fixture(owner),
      corpse = peer(f);
    put(corpse.native, 7, 16384);
    put(corpse.native, 0x3f, -1);
    corpse.native[0x5e] = targetState;
    corpse.native[0x60] = 1;
    put(corpse.native, 0x68, 100);
    put(corpse.native, 0x62, 100);
    f.n[0x5e] = action;
    f.n[0x60] = 8;
    f.n[0x61] = 0x40;
    f.n[0x57] = f.n[0x52] = 1;
    put(f.n, 0x55, 1);
    put(f.n, 0x50, 1);
    put(f.n, 0x6c, 32752);
    put(f.n, 0x68, 20);
    put(f.n, 0x66, 8000);
    f.n[0x77] = 255;
    return { ...f, corpse };
  }
  it("selects the original corpse score and installs a live reference without copying a literal plant goal", () => {
    const f = fixture(4),
      p = peer(f);
    p.native[0x5e] = 25;
    put(f.n, 0x68, 10);
    f.n[0x77] = 255;
    put(f.n, 11, 123);
    put(f.n, 13, 456);
    const r = stepNeutralMule(f.state, 0, f.rng, f.context),
      n = f.state.mules[0].native;
    expect(r.reason).toBeNull();
    expect(f.rng.draws).toBe(2);
    expect([n[0x5e], n[0x57], word(n, 0x55), n[0x52], word(n, 0x50)]).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect([word(n, 11), word(n, 13)]).toEqual([123, 456]);
    expect(r.events.find((e) => e.kind === "mule-target")?.targetKind).toBe(1);
  });
  it("retains an owned task's corpse reference and applies the actual no-operator hunger threshold", () => {
    const f = fixture(),
      p = peer(f);
    p.native[24] = 4;
    p.native[0x5e] = 25;
    f.n[0x78] = 7;
    put(f.n, 0x68, 20);
    expect(stepOwnedMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    const n = f.state.mules[0].native;
    expect([n[0x57], n[0x5a], word(n, 0x58), n[0x78]]).toEqual([1, 1, 1, 7]);
  });
  it("distinguishes corpse and BONES arrival while reserving the actual target", () => {
    for (const [targetState, next] of [
      [25, 5],
      [26, 4],
    ]) {
      const f = foodScene(4, 1, targetState);
      f.n[0x60] = 0x48;
      put(f.n, 0x49, 0x220);
      expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
      expect(f.state.mules[0].native[0x5e]).toBe(next);
      expect(f.state.mules[1].native[0x60]! & 1).toBe(1);
      expect(f.rng.draws).toBe(0);
    }
  });
  it("consumes six corpse reserve, gains24 and emits the three-draw particle after the query", () => {
    const f = foodScene(),
      r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[1].native, 0x68)).toBe(94);
    expect(word(f.state.mules[0].native, 0x68)).toBe(44);
    expect(word(f.state.mules[0].native, 0x66)).toBe(7998);
    expect(f.rng.draws).toBe(5);
    expect(f.rng.seed).toBe(64612);
    expect(r.events.filter((e) => e.kind === "mule-effect")).toEqual([
      {
        kind: "mule-effect",
        id: "source:0:0",
        code: 32,
        position: [16384, 15872],
        height: 2048,
        angles: [2016, 224, 9088],
      },
    ]);
    expect(r.events.find((e) => e.kind === "mule-audio")?.channel).toBe(0x11);
  });
  it("abandons low corpse nutrition with a20-based delay and releases only its reservation", () => {
    const f = foodScene(4, 5, 26);
    put(f.corpse.native, 0x68, 40);
    const r = stepNeutralMule(f.state, 0, f.rng, f.context),
      n = f.state.mules[0].native;
    expect(r.reason).toBeNull();
    expect(f.rng.draws).toBe(1);
    expect(word(n, 0x6c)).toBe(33);
    expect([n[0x5e], n[0x57], n[0x52], word(n, 0x50), n[0x61]]).toEqual([
      8, 0, 1, 1, 0x40,
    ]);
    expect(f.state.mules[1].native[0x60]! & 1).toBe(0);
    expect(r.events).toEqual([]);
  });
  it("feeds BONES without immediately retiring the target and charges growth energy exactly once", () => {
    const f = foodScene(4, 4, 26);
    put(f.corpse.native, 0x68, 2);
    f.n[0x77] = 100;
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[1].native, 0x68)).toBe(0);
    expect(f.state.mules[1].native[6]).toBe(1);
    expect(f.state.mules[1].native[0x5e]).toBe(26);
    expect(word(f.state.mules[0].native, 0x68)).toBe(24);
    expect(word(f.state.mules[0].native, 0x66)).toBe(7990);
    expect(f.rng.draws).toBe(2);
    expect(r.events.some((e) => e.kind === "mule-effect")).toBe(false);
  });
  it("uses strict overflow for full BONES feeding and the original20-based finish delay", () => {
    for (const [reserve, full] of [
      [96, false],
      [97, true],
    ] as const) {
      const f = foodScene(4, 4, 26);
      put(f.n, 0x68, reserve);
      const r = stepNeutralMule(f.state, 0, f.rng, f.context),
        n = f.state.mules[0].native;
      expect(r.reason).toBeNull();
      expect(word(n, 0x68)).toBe(100);
      expect(n[0x5e]).toBe(full ? 8 : 4);
      expect(f.rng.draws).toBe(full ? 3 : 2);
      expect(r.events.find((e) => e.kind === "mule-audio")?.channel).toBe(
        full ? 0x1b : 0x12,
      );
      if (full) expect(word(n, 0x6c)).toBe(25);
    }
  });
  it("retirement clears matching reference kinds and carrier flags, retaining indices and removed-own links", () => {
    const f = fixture(0),
      p = peer(f);
    p.native[24] = 0;
    p.native[0x5e] = 27;
    put(p.native, 0x3f, -1);
    put(p.native, 0x6c, 32752);
    put(p.native, 0x68, 1);
    p.native.splice(0, 6, 7, 0, 5, 9, 0, 4);
    const ownLinks = p.native.slice(0, 6);
    for (const at of [0x4d, 0x50, 0x55, 0x58, 0x5b]) {
      put(f.n, at, 1);
      f.n[at + 2] = 1;
    }
    f.n[0x60] = 2;
    f.context.frame = 2;
    const r = stepOwnedMule(f.state, 1, f.rng, f.context),
      dead = f.state.mules[1].native,
      live = f.state.mules[0].native;
    expect(r.reason).toBeNull();
    expect(dead[6]).toBe(0);
    expect(dead.slice(0, 6)).toEqual(ownLinks);
    expect(word(dead, 0x6c)).toBe(32766);
    expect(f.rng.draws).toBe(0);
    for (const at of [0x4d, 0x50, 0x55, 0x58, 0x5b]) {
      expect(live[at + 2]).toBe(0);
      expect(word(live, at)).toBe(1);
    }
    expect(live[0x60]! & 2).toBe(0);
    expect(r.events.find((e) => e.kind === "mule-retired")?.retirement).toEqual(
      {
        cleanupTarget: { index: 1, kind: 1 },
        countDelta: -1,
        displayPhase: 11,
        portraitRefresh: true,
        moduleCleanup: true,
      },
    );
  });
});

type Native = (number | null)[];
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const word = (n: Native, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
function fixture(owner = 0) {
  const tables = {
    atan: Array.from({ length: 257 }, (_, i) =>
      Math.round((Math.atan(i / 256) * 1024) / Math.PI),
    ),
    sine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
    ),
    cosine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
    ),
  };
  const rules: EcologyRules = {
    schemaVersion: 1,
    plants: Array.from({ length: 12 }, (_, selector) => ({
      selector,
      growthDeltas: Array(8).fill(0),
      spreadPeriod: 100,
      walkSteps: 1,
      crowdingLimit: 20,
      checkThreshold: 100,
      nutrition: 3,
      retirementDelay: 3,
    })),
    spreadDirections: Array.from({ length: 9 }, () => [0, 0]),
    plantResources: [],
    corpseFriction: Array(8).fill(128),
    mule: {
      selector: 4,
      baseSpeed: 704,
      lifetimeScale: 19000,
      reserveScale: 160,
      healthScale: 80,
      healthRecoveryPeriod: 20,
      warmThreshold: 25,
    },
  };
  const terrain = { bytes: Array(229376).fill(0), revision: 0 };
  for (let cell = 0; cell < 16384; cell++) {
    put(terrain.bytes, cell * 14 + 2, 1024);
    terrain.bytes[cell * 14 + 5] = 2;
  }
  const n: Native = Array(124).fill(0);
  n.fill(null, 31, 39);
  n[6] = 1;
  n[24] = owner;
  n[0x5e] = 8;
  n[0x76] = 30;
  n[0x7b] = 255;
  n[0x7a] = 4;
  put(n, 7, 16384);
  put(n, 9, 15872);
  put(n, 21, 0x280);
  put(n, 0x2b, 50);
  put(n, 0x3b, 512);
  put32(n, 17, 2048);
  put32(n, 39, 2048);
  put(n, 0x66, 9085);
  put(n, 0x62, 100);
  put(n, 0x64, 60);
  put(n, 0x68, 100);
  put(n, 0x6a, 60);
  const mule: EcologyMule = {
    id: "source:0:0",
    index: 0,
    native: n,
    pending: [],
  };
  const state: EcologyState = {
    schemaVersion: 1,
    sourceSha256: "synthetic",
    ticks: 0,
    plantCursor: 0,
    plantCount: 0,
    ownerPlantCounts: [0, 0, 0, 0],
    plants: [],
    mules: [mule],
    otherEntities: [],
    pending: [],
    unsupported: [],
    plantOrder: {},
  };
  const context: MuleContext = {
    terrain,
    tables,
    rules,
    frame: 1,
    gravity: 1024,
    water: 0,
    climate: 106,
    bounce: Array(8).fill(0),
    profile: () => ({ holds: [0, 0, 0, 0], flags: 0, first: 0, last: 3 }),
    bonesProfile: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
    obstacleAt: () => false,
    cellOrder: (cell) =>
      state.mules
        .filter(
          (m) =>
            m.native[6] === 1 &&
            worldCell(word(m.native, 7), word(m.native, 9)) === cell,
        )
        .map((m) => m.id),
    owned: {
      selectedPlayer: 0,
      globalFlags: 0,
      allianceMasks: [1, 2, 4, 8],
      buildings: [],
      operators: [],
    },
  };
  return { state, context, rng: { seed: 5428, draws: 0, ring: 31 }, mule, n };
}
function plant(f: ReturnType<typeof fixture>, index = 0): EcologyPlant {
  const n: Native = Array(49).fill(0);
  n.fill(null, 31, 39);
  n[6] = 2;
  n[24] = 4;
  put(n, 7, 16640);
  put(n, 9, 15872);
  put(n, 44, 30);
  const p: EcologyPlant = {
    id: `source:1:${index}`,
    index,
    active: true,
    owner: 4,
    position: [16640, 15872],
    selector: 0,
    growth: 30,
    flags: 0,
    plantFlags: 0,
    updateCounter: 0,
    retirement: 0,
    animation: 0,
    frame: 0,
    shade: 0,
    height: 2048,
    native: n,
  };
  f.state.plants[index] = p;
  f.state.plantCount++;
  f.state.plantOrder![worldCell(...p.position)] = [index];
  return p;
}
function peer(f: ReturnType<typeof fixture>, slot = 1) {
  const n = f.n.slice();
  put(n, 15, slot);
  put(n, 7, 16640);
  const p: EcologyMule = {
    id: `source:0:${slot}`,
    index: slot,
    native: n,
    pending: [],
  };
  f.state.mules.push(p);
  return p;
}
describe("ordinary owned Mule commands and shared natural lifecycle", () => {
  it("carried97bit1 bypasses motion, ground refresh and odd corpse aging", () => {
    const f = fixture();
    f.n[94] = 25;
    f.n[97] = 1;
    f.n[22] = 0x48;
    put(f.n, 63, -1);
    put(f.n, 108, 32);
    put(f.n, 104, 51);
    put(f.n, 102, 100);
    put32(f.n, 39, 9000);
    const fields = [
      ...f.n.slice(7, 25),
      ...f.n.slice(39, 57),
      ...f.n.slice(98, 110),
    ];
    const result = stepOwnedMule(f.state, 0, f.rng, f.context),
      n = f.state.mules[0].native;
    expect(result.reason).toBeNull();
    expect([
      ...n.slice(7, 25),
      ...n.slice(39, 57),
      ...n.slice(98, 110),
    ]).toEqual(fields);
    expect(n[94]).toBe(25);
    expect(n[25]).toBe(18);
    expect(f.rng.draws).toBe(0);
    expect(result.events).toEqual([]);
  });
  it("installs an ordinary move without teleporting or altering opaque native bytes", () => {
    const f = fixture(),
      before = f.n.slice(),
      target: [number, number] = [17408, 15872];
    const r = requestOwnedMuleMove(f.state, 0, target, {
        callerOwner: 0,
        callerIsSelected: true,
        selectedPanelRefresh: true,
      }),
      n = f.state.mules[0].native;
    expect(r.outcome).toBe("installed");
    expect(r.panelRefreshRequested).toBe(true);
    expect(r.events[0].kind).toBe("mule-command-feedback");
    expect([word(n, 7), word(n, 9)]).toEqual([16384, 15872]);
    expect([
      word(n, 0x6e),
      word(n, 0x70),
      word(n, 0x72),
      word(n, 0x74),
    ]).toEqual([...target, ...target]);
    expect([n[0x5e], n[0x60], n[0x61], n[0x78]]).toEqual([0, 0x18, 0x80, 7]);
    expect(n.slice(31, 39)).toEqual(before.slice(31, 39));
    expect(f.rng.draws).toBe(0);
  });
  it("rejects wrong-owner and actual attachment cleanup atomically, and ignores ineligible states", () => {
    const f = fixture(),
      saved = structuredClone(f.state);
    expect(
      requestOwnedMuleMove(f.state, 0, [0, 0], {
        callerOwner: 1,
        callerIsSelected: false,
        selectedPanelRefresh: false,
      }).committed,
    ).toBe(false);
    expect(f.state).toEqual(saved);
    f.n[0x60] = 2;
    const attached = structuredClone(f.state);
    expect(
      requestOwnedMuleMove(f.state, 0, [0, 0], {
        callerOwner: 0,
        callerIsSelected: false,
        selectedPanelRefresh: false,
      }).committed,
    ).toBe(false);
    expect(f.state).toEqual(attached);
    f.n[0x60] = 0;
    f.n[0x5e] = 15;
    expect(
      requestOwnedMuleMove(f.state, 0, [0, 0], {
        callerOwner: 0,
        callerIsSelected: false,
        selectedPanelRefresh: false,
      }).outcome,
    ).toBe("ignored");
  });
  it("cancels feeding and plant approach with distinct source reservation masks", () => {
    for (const [state, flag, remaining] of [
      [7, 5, 4],
      [1, 5, 1],
    ]) {
      const f = fixture(),
        p = plant(f);
      p.plantFlags = p.native[46] = flag;
      f.n[0x5e] = state;
      f.n[0x57] = 2;
      put(f.n, 0x55, 0);
      expect(
        requestOwnedMuleMove(f.state, 0, [17000, 16000], {
          callerOwner: 0,
          callerIsSelected: false,
          selectedPanelRefresh: false,
        }).committed,
      ).toBe(true);
      expect(f.state.plants[0].plantFlags).toBe(remaining);
    }
  });
  it("uses two query draws for the explicit target, keeps even timers and moves with fixed physics", () => {
    const f = fixture();
    requestOwnedMuleMove(f.state, 0, [17408, 15872], {
      callerOwner: 0,
      callerIsSelected: false,
      selectedPanelRefresh: false,
    });
    expect(stepOwnedMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    expect(f.rng.draws).toBe(2);
    expect(word(f.state.mules[0].native, 0x6c)).toBe(32766);
    f.context.frame = 2;
    expect(stepOwnedMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    expect(word(f.state.mules[0].native, 0x6c)).toBe(32766);
    for (let frame = 3; frame < 40; frame++) {
      f.context.frame = frame;
      expect(stepOwnedMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    }
    expect(word(f.state.mules[0].native, 7)).toBeGreaterThan(16384);
    expect(word(f.state.mules[0].native, 7)).toBeLessThanOrEqual(17408);
  });
  it("uses actual operator presence for the quarter-versus-half food threshold", () => {
    const no = fixture(),
      yes = fixture();
    plant(no);
    plant(yes);
    for (const f of [no, yes]) {
      put(f.n, 0x68, 40);
      f.n[0x77] = 255;
    }
    yes.context.owned!.operators = [
      {
        owner: 0,
        position: [16384, 15872],
        enabled: 1,
        commandState: 0,
        flags70: 0x80,
        mode: 0,
        range: 1024,
      },
    ];
    expect(stepOwnedMule(no.state, 0, no.rng, no.context).reason).toBeNull();
    expect(no.state.mules[0].native[0x57]).toBe(0);
    expect(stepOwnedMule(yes.state, 0, yes.rng, yes.context).reason).toBeNull();
    expect(yes.state.mules[0].native[0x57]).toBe(2);
    expect(yes.state.mules[0].native[0x5e]).toBe(1);
    expect(yes.rng.draws).toBe(2);
  });
  it("scores a mature same-species mate and keeps the negative peer stage", () => {
    const f = fixture(4),
      p = peer(f);
    f.n[0x77] = p.native[0x77] = 255;
    f.n[0x79] = 3;
    p.native[0x79] = 253;
    expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    const [a, b] = f.state.mules.map((m) => m.native);
    expect([a[0x5e], b[0x5e]]).toEqual([3, 3]);
    expect([word(a, 0x55), a[0x57], word(b, 0x55), b[0x57]]).toEqual([
      1, 1, 0, 1,
    ]);
    expect(b[0x79]).toBe(253);
    expect(f.rng.draws).toBe(2);
  });
  it("creates a natural newborn from retained inactive bytes and commits both parents", () => {
    const f = fixture(4),
      p = peer(f);
    put(p.native, 7, 16384);
    for (const [m, other] of [
      [f.mule, p],
      [p, f.mule],
    ]) {
      const n = m.native;
      n[0x5e] = 10;
      n[0x77] = 255;
      n[0x79] = 3;
      n[0x57] = 1;
      put(n, 0x55, other.index);
      put(n, 0x6c, 0);
    }
    const priors = Array.from(
      { length: 300 },
      () => Array(124).fill(0) as Native,
    );
    priors[0] = f.n;
    priors[1] = p.native;
    priors[2][0x43] = 91;
    priors[2][0x44] = 37;
    priors[2][30] = 14;
    priors[2].fill(null, 31, 39);
    f.context.creaturePriors = priors;
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBeNull();
    const born = r.events.find((e) => e.kind === "mule-born")!.newborn!;
    expect(born.index).toBe(2);
    expect(born.bornCounterIncrement).toBe(0);
    expect(born.native.slice(0x43, 0x45)).toEqual([91, 37]);
    expect(born.native[30]).toBe(14);
    expect(born.native.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(f.state.mules).toHaveLength(3);
    expect(f.state.mules[0].native[0x79]).toBe(253);
    expect(f.state.mules[1].native[0x79]).toBe(253);
  });
  it("rolls back a natural birth and its RNG if actual inactive backing is absent", () => {
    const f = fixture(4),
      p = peer(f);
    put(p.native, 7, 16384);
    for (const [m, other] of [
      [f.mule, p],
      [p, f.mule],
    ]) {
      m.native[0x5e] = 10;
      m.native[0x57] = 1;
      put(m.native, 0x55, other.index);
    }
    const saved = structuredClone({
      state: f.state,
      rng: f.rng,
      terrain: f.context.terrain,
    });
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.committed).toBe(false);
    expect(r.reason).toMatch(/300/);
    expect({ state: f.state, rng: f.rng, terrain: f.context.terrain }).toEqual(
      saved,
    );
  });
  it("finishes natural mating with a full pool without creating a child or drawing its factory RNG", () => {
    const results = [];
    for (const full of [false, true]) {
      const f = fixture(4),
        p = peer(f);
      put(p.native, 7, 16384);
      for (const [m, other] of [
        [f.mule, p],
        [p, f.mule],
      ]) {
        m.native[0x5e] = 10;
        m.native[0x57] = 1;
        put(m.native, 0x55, other.index);
      }
      const priors = Array.from({ length: 300 }, () => {
        const n = Array(124).fill(0) as Native;
        n.fill(null, 31, 39);
        return n;
      });
      if (full) for (const n of priors) n[6] = 1;
      priors[0] = f.n;
      priors[1] = p.native;
      f.context.creaturePriors = priors;
      const r = stepNeutralMule(f.state, 0, f.rng, f.context);
      expect(r.reason).toBeNull();
      results.push({
        draws: f.rng.draws,
        births: r.events.filter((e) => e.kind === "mule-born").length,
      });
    }
    expect(results[0].births).toBe(1);
    expect(results[1].births).toBe(0);
    expect(results[0].draws - results[1].draws).toBe(3);
  });
  it("uses source physical-height boundaries and never searches after a rejected first building", () => {
    const f = fixture(),
      n: Native = Array(67).fill(0);
    n[6] = 4;
    put(n, 49, 1); // Source mask1 requires this first candidate to be complete.
    put(n, 7, 0);
    put(n, 9, 0);
    put32(n, 17, 3354);
    f.context.terrain.bytes[11] = 1;
    for (const [height, found] of [
      [13786, true],
      [13787, false],
    ] as const) {
      let calls = 0;
      const r = queryMuleAirborneBuilding(
        f.context.terrain,
        [0, 0],
        height,
        () => {
          calls++;
          return n;
        },
        () => 168,
      );
      expect(!!r).toBe(found);
      expect(calls).toBe(1);
    }
    expect(
      queryMuleAirborneBuilding(
        f.context.terrain,
        [0, 0],
        -1,
        () => n,
        () => {
          throw Error("metadata read");
        },
      ),
    ).not.toBeNull();
    put(n, 49, 0);
    expect(
      queryMuleAirborneBuilding(
        f.context.terrain,
        [0, 0],
        -1,
        () => n,
        () => 168,
      ),
    ).toBeNull();
    expect(
      queryMuleAirborneBuilding(
        f.context.terrain,
        [0, 0],
        -1,
        () => n,
        () => 168,
        0,
      ),
    ).not.toBeNull();
  });
  it("gives parent factories full lifetime, physical height and inherited task while retaining fractions", () => {
    const f = fixture(),
      prior: Native = Array(124).fill(0);
    prior.fill(null, 31, 39);
    prior[0x43] = 19;
    f.n[0x78] = 7;
    put32(f.n, 39, 9000);
    const made = initializeMuleNative(
      prior,
      f.rng,
      { slot: 4, owner: 0, position: [16000, 16000], quality: 30, parent: f.n },
      f.context,
    );
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value.native[0x78]).toBe(7);
    expect(word(made.value.native, 39)).toBe(9000);
    expect(made.value.native[0x43]).toBe(19);
    expect(made.value.native[0x77]).toBe(16);
    expect(made.value.rng.draws).toBe(3);
    expect(prior[6]).toBe(0);
  });
});
