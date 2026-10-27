import {speciesFixture} from "./fixtures/creature-species";
import { describe, expect, it } from "vitest";
import {
  acquireMuleHostile,
  chooseMuleHostile,
  escapeMuleNeighborhood,
  completeMuleAttack,
  contactMuleHostile,
  damageMule,
  damageMuleFromSource,
  fleeMule,
  muleCombatDistance,
  queryMuleCombat,
  queryMuleCellFallback,
  consumeMuleCombatQuery,
  type MuleCombatTarget,
  type MuleCombatContext,
  type MuleCombatPorts,
  type MuleCombatTraits,
} from "../src/sim/mechanics/mule-combat";
import {
  stepOwnedMule,
  damageMuleEntity,
  applyMuleCaptureImpact,
  type MuleContext,
  type MuleEvent,
} from "../src/sim/mechanics/mule";
import type {
  EcologyMule,
  EcologyPlant,
  EcologyState,
} from "../src/sim/mechanics/ecology";
import { nextRandom, type GeneRng } from "../src/sim/mechanics/random";
import { worldCell } from "../src/sim/mechanics/terrain";

type N = (number | null)[];
const put = (n: N, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const word = (n: N, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: N, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const table = {
  atan: Array.from({ length: 257 }, (_, i) =>
    Math.round((Math.atan(i / 256) * 1024) / Math.PI),
  ),
  sine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
  ),
  cosine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
  ),
};
/** Synthetic traits deliberately differ from the admitted original table. */
const traits: MuleCombatTraits = {
  queryRadius: 512,
  attack: 20,
  defense: 8,
  disposition: 100,
  foodWeights: [11, 22, 33],
  attackChannel: 41,
};
function record(
  index: number,
  owner: number,
  x: number,
  y: number,
): EcologyMule {
  const n: N = Array(124).fill(0);
  n.fill(null, 31, 39);
  n[6] = 1;
  n[24] = owner;
  n[94] = 8;
  n[118] = 50;
  n[119] = 255;
  n[122] = 4;
  n[123] = 255;
  put(n, 15, index);
  put(n, 7, x);
  put(n, 9, y);
  put(n, 21, 0x280);
  put(n, 43, 50);
  put(n, 59, 512);
  put(n, 98, 100);
  put(n, 100, 100);
  put(n, 102, 9000);
  put(n, 104, 50);
  put(n, 106, 100);
  dword(n, 17, 2048);
  dword(n, 39, 2048);
  n[83] = 1;
  return { id: `source:0:${index}`, index, native: n, pending: [] };
}
function fixture() {
  const terrain = { bytes: Array(229376).fill(0), revision: 0 };
  for (let cell = 0; cell < 16384; cell++) {
    put(terrain.bytes, cell * 14 + 2, 1024);
    terrain.bytes[cell * 14 + 5] = 2;
  }
  const self = record(0, 0, 16384, 16384),
    target = record(1, 4, 16448, 16384),
    events: MuleEvent[] = [],
    rng: GeneRng = { seed: 5428, draws: 0, ring: 31 };
  const state: EcologyState = {
    schemaVersion: 1,
    sourceSha256: "synthetic",
    ticks: 0,
    plantCursor: 0,
    plantCount: 0,
    ownerPlantCounts: [0, 0, 0, 0],
    plants: [],
    mules: [self, target],
    otherEntities: [],
    pending: [],
    unsupported: [],
  };
  const c: MuleCombatContext = {
    terrain,
    tables: table,
    frame: 1,
    traits,
    allianceMasks: [1, 2, 4, 8],
    players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    cellOrder: (cell) =>
      state.mules
        .filter((m) => worldCell(word(m.native, 7), word(m.native, 9)) === cell)
        .map((m) => m.id),
  };
  const ports: MuleCombatPorts = {
    release: (m) => {
      const n = m.native;
      n[21] = n[21]! & 0xdf;
      n.fill(0, 51, 55);
      put(n, 96, word(n, 96) & 0xd71a);
      n[93] = n[87] = 0;
      put(n, 108, 0);
    },
    speed: () => 600,
    occupied: () => false,
    escape: () => {
      throw new Error("unexpected escape");
    },
    attackBonus: () => 0,
    selectAnimation: (m) => {
      m.native[25] = 23;
      m.native[26] = m.native[27] = m.native[29] = m.native[30] = 0;
      m.native[28] = 1;
    },
    death: (m, owner) => {
      m.native[94] = 24;
      events.push({
        kind: "mule-combat-kill",
        id: m.id,
        index: m.index,
        attackerOwner: owner,
        victimOwner: m.native[24]!,
      });
    },
  };
  return { terrain, self, target, events, rng, state, c, ports };
}
describe("source Mule hostile query/contact", () => {
  it("previews the shared two query draws, counts allied sectors and keeps first equal-weight head", () => {
    const f = fixture(),
      peer = record(2, 4, 16512, 16400),
      friendly = record(3, 0, 16200, 16384);
    f.state.mules.push(peer, friendly);
    f.c.cellOrder = (cell) =>
      [peer, f.target, f.self, friendly]
        .filter((m) => worldCell(word(m.native, 7), word(m.native, 9)) === cell)
        .map((m) => m.id);
    const before = { ...f.rng },
      q = queryMuleCombat(f.state, f.self, f.rng, f.c);
    expect(f.rng).toEqual(before);
    expect(q.points).toHaveLength(49);
    expect([q.enemyCount, q.friendlyCount, q.target]).toEqual([2, 1, 2]);
    expect(q.enemyWeights.reduce((a, b) => a + b, 0)).toBe(2048);
    expect(q.confidence).toBe(228); //health256-enemy64+trait20+friendly16
  });
  it("honors asymmetric owner masks and excludes dead enemies without excluding allied corpse count", () => {
    const f = fixture();
    f.target.native[24] = 1;
    f.c.allianceMasks = [3, 2, 4, 8];
    expect(queryMuleCombat(f.state, f.self, f.rng, f.c).enemyCount).toBe(0);
    expect(queryMuleCombat(f.state, f.target, f.rng, f.c).enemyCount).toBe(1);
    f.target.native[24] = 4;
    f.target.native[94] = 24;
    expect(queryMuleCombat(f.state, f.self, f.rng, f.c).enemyCount).toBe(0);
    f.target.native[24] = 0;
    expect(queryMuleCombat(f.state, f.self, f.rng, f.c).friendlyCount).toBe(1);
  });
  it("installs hostile references and retained task without copying a literal goal", () => {
    const f = fixture();
    f.self.native[120] = 7;
    put(f.self.native, 11, 123);
    put(f.self.native, 13, 456);
    acquireMuleHostile(f.self, f.target, f.ports, f.events);
    expect([
      word(f.self.native, 80),
      f.self.native[82],
      word(f.self.native, 85),
      f.self.native[87],
      word(f.self.native, 88),
      f.self.native[90],
    ]).toEqual([1, 1, 1, 1, 1, 1]);
    expect([word(f.self.native, 11), word(f.self.native, 13)]).toEqual([
      123, 456,
    ]);
    expect([
      f.self.native[94],
      f.self.native[96],
      word(f.self.native, 63),
    ]).toEqual([1, 192, 600]);
  });
  it("uses inclusive angular256 and range128 gates across torus seams", () => {
    for (const [yaw, hit] of [
      [255, false],
      [256, true],
      [768, true],
      [769, false],
    ] as const) {
      const f = fixture();
      put(f.self.native, 57, yaw);
      put(f.self.native, 7, 32760);
      put(f.target.native, 7, 120);
      const before = f.self.native.slice();
      expect(muleCombatDistance(before, f.target.native)).toBe(16384);
      expect(contactMuleHostile(f.self, f.target, f.rng, f.c, f.events)).toBe(
        hit,
      );
      expect(f.rng.draws).toBe(hit ? 1 : 0);
      if (!hit)
        expect(f.self.native.filter((v, i) => i !== 75 && i !== 76)).toEqual(
          before.filter((v, i) => i !== 75 && i !== 76),
        );
      else
        expect([
          f.self.native[94],
          word(f.self.native, 63),
          word(f.self.native, 108),
        ]).toEqual([21, 0, 32767]);
    }
  });
  it("does not consume queries without enemies and skips the confidence draw when disposition is exceeded", () => {
    const f = fixture();
    f.target.native[24] = 0;
    expect(
      chooseMuleHostile(f.state, f.self, f.rng, f.c, f.ports, f.events),
    ).toBe(false);
    expect(f.rng.draws).toBe(0);
    f.target.native[24] = 4;
    f.c.traits = { ...traits, disposition: 0 };
    f.rng.seed = 1;
    expect(
      chooseMuleHostile(f.state, f.self, f.rng, f.c, f.ports, f.events),
    ).toBe(true);
    expect(f.rng.draws).toBe(3);
    expect(f.self.native[94]).toBe(1);
  });
  it("executes real fled motion, includes707A0's extra draw, and preserves pointer gaps", () => {
    const f = fixture();
    put(f.self.native, 106, 1);
    const gap = f.self.native.slice(31, 39);
    expect(
      chooseMuleHostile(f.state, f.self, f.rng, f.c, f.ports, f.events),
    ).toBe(true);
    expect(f.rng.draws).toBe(7);
    expect(f.self.native[94]).toBe(0);
    expect(word(f.self.native, 108)).toBe(32767);
    expect(f.self.native.slice(31, 39)).toEqual(gap);
    expect([word(f.self.native, 11), word(f.self.native, 13)]).not.toEqual([
      0, 0,
    ]);
    f.self.native[83] = 255;
    const draws = f.rng.draws;
    expect(fleeMule(f.self, f.rng, f.c, f.state, 0, 256, 0)).toBe(false);
    expect(f.rng.draws - draws).toBe(1);
    expect(word(f.self.native, 73) & 0x140).toBe(0x140);
  });
  it("uses the one-draw384 circle for a neighborhood occupied-cell escape", () => {
    const f = fixture();
    f.self.native[94] = 20;
    f.ports.occupied = () => true;
    f.rng.seed = 0;
    expect(
      chooseMuleHostile(f.state, f.self, f.rng, f.c, f.ports, f.events),
    ).toBe(true);
    expect(f.rng.draws).toBe(3);
    expect([word(f.self.native, 11), word(f.self.native, 13)]).toEqual([
      16384, 16000,
    ]);
    expect(f.self.native[94]).toBe(20);
    expect(word(f.self.native, 63)).toBe(600);
    expect(f.self.native[22]! & 0xc0).toBe(0);
  });
});

function externalTarget(
  kind: 3 | 4,
  index: number,
  x = 16448,
): MuleCombatTarget {
  const n: N = Array(kind === 3 ? 200 : 67).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  n[24] = 4;
  put(n, 15, index);
  put(n, 7, x);
  put(n, 9, 16384);
  dword(n, 17, 2048);
  dword(n, 39, 2048);
  return {
    id: `source:${kind - 1}:${index}`,
    index,
    kind,
    owner: 4,
    native: n,
    physicalHeight: 2048,
    dead: false,
    ...(kind === 3 ? { specialistStyle: 0 } : { buildingHalfWidth: 90 }),
  };
}
function targets(f: ReturnType<typeof fixture>, list: MuleCombatTarget[]) {
  f.state.otherEntities = list.map((e) => ({
    id: e.id,
    kind: e.kind,
    owner: e.owner,
    position: [word(e.native, 7), word(e.native, 9)],
  }));
  f.c.entity = (id) => list.find((e) => e.id === id) ?? null;
  f.c.cellOrder = (cell) =>
    [...f.state.mules, ...list]
      .filter(
        (e) =>
          e.native[6] !== 0 &&
          worldCell(word(e.native, 7), word(e.native, 9)) === cell,
      )
      .map((e) => e.id);
}
function callbackContext(f: ReturnType<typeof fixture>): MuleContext {
  return {
    terrain: f.terrain,
    tables: table,
    frame: 1,
    combat: f.c.traits,
    gravity: 1024,
    water: 0,
    climate: 106,
    bounce: Array(8).fill(0),
    obstacleAt: () => false,
    profile: () => ({ holds: [0, 0, 0, 0], flags: 0, first: 0, last: 3 }),
    cellOrder: f.c.cellOrder,
    owned: {
      selectedPlayer: 0,
      globalFlags: 0,
      allianceMasks: [1, 2, 4, 8],
      players: f.c.players,
      buildings: [],
      operators: [],
    },
    rules: {
      schemaVersion: 1,
      plants: [],
      spreadDirections: [],
      plantResources: [],
      mule: {
        selector: 4,
        baseSpeed: 704,
        lifetimeScale: 19000,
        reserveScale: 160,
        healthScale: 80,
        healthRecoveryPeriod: 20,
        warmThreshold: 25,
      },
    },
    combatEntity: (_s, _t, _r, id) => f.c.entity?.(id) ?? null,
    combatBuildingAt: (_s, _t, _r, m) => f.c.buildingAt?.(m) ?? null,
    combatBuildingPointAccepted: () => true,
    combatDamage: (_s, _t, _r, self, target, amount) => {
      if (!f.c.damage) throw Error("actual external damage unavailable");
      return f.c.damage(self, target, amount);
    },
  };
}
function feedingFixture() {
  const f = fixture(),
    c = callbackContext(f),
    n = f.self.native,
    raw: N = Array(49).fill(0),
    plant: EcologyPlant = {
      id: "source:1:0",
      index: 0,
      active: true,
      owner: 4,
      position: [16384, 16384],
      selector: 0,
      growth: 2,
      flags: 4,
      plantFlags: 1,
      updateCounter: 0,
      retirement: 0,
      animation: 2,
      frame: 0,
      shade: 0,
      height: 2048,
      native: raw,
    };
  raw.fill(null, 31, 39);
  raw[6] = 2;
  raw[21] = raw[24] = 4;
  raw[25] = 2;
  raw[46] = 1;
  put(raw, 7, 16384);
  put(raw, 9, 16384);
  dword(raw, 17, 2048);
  put(raw, 44, 2);
  f.state.mules = [f.self];
  f.state.plants = [plant];
  f.state.plantCount = 1;
  f.state.plantOrder = { [worldCell(...plant.position)]: [0] };
  n[94] = 7;
  n[96] = 8;
  n[97] = 64;
  n[87] = 2;
  put(n, 85, 0);
  put(n, 108, 16);
  c.rules.plants = Array.from({ length: 12 }, (_, selector) => ({
    selector,
    growthDeltas: Array(8).fill(0),
    spreadPeriod: 1,
    walkSteps: 1,
    crowdingLimit: 2,
    checkThreshold: 1,
    nutrition: 3,
    retirementDelay: 0,
  }));
  const linked = [f.self.id as string, plant.id],
    cell = worldCell(...plant.position);
  c.cellOrder = (at) => (at === cell ? linked : []);
  return { ...f, c, linked };
}
describe("synchronous Mule plant damage", () => {
  it("releases a cleared feeding reference on its next odd callback before the16-tick damage cadence", () => {
    const f = feedingFixture(),
      expected = { ...f.rng },
      delay = 10 + (nextRandom(expected) % 20),
      p = f.state.plants[0];
    f.self.native[87] = 0; //Actual724C0 leaves the index and state7 retained.
    put(f.self.native, 85, 5);
    put(f.self.native, 108, 29);
    f.c.plantDamage = () => {
      throw Error("Cleared reference must not damage a plant");
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.c),
      n = f.state.mules[0].native;
    expect(r.reason).toBeNull();
    expect(n[94]).toBe(8);
    expect(word(n, 108)).toBe(delay - 1); //Ordinary shared tail owns decrement.
    expect([word(n, 85), n[87]]).toEqual([5, 0]);
    expect(f.state.plants[0]).toEqual(p);
    expect(f.rng).toEqual(expected);
    expect(r.events.some((e) => e.kind === "mule-fed")).toBe(false);
  });
  it("treats a non-plant feeding reference as the sourceNULL branch without dereferencing its retained index", () => {
    const f = feedingFixture();
    f.self.native[87] = 3;
    put(f.self.native, 85, -1);
    put(f.self.native, 108, 29);
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(f.state.mules[0].native[87]).toBe(0);
    expect(f.rng.draws).toBe(1);
  });
  it("releases a plant beyond source64-unit range before cadence, clearing only its feeding reservation", () => {
    const f = feedingFixture(),
      p = f.state.plants[0];
    p.position[0] += 65;
    put(p.native, 7, p.position[0]);
    p.plantFlags = p.native[46] = 5;
    put(f.self.native, 108, 29);
    f.c.plantDamage = () => {
      throw Error("Distant target must not be eaten");
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(f.state.plants[0].plantFlags).toBe(4);
    expect(f.state.plants[0].growth).toBe(2);
    expect(f.rng.draws).toBe(1);
  });
  it("admits inclusive64-unit feeding range and preserves the same two neighborhood draws", () => {
    const f = feedingFixture(),
      p = f.state.plants[0];
    p.position[0] += 64;
    put(p.native, 7, p.position[0]);
    p.growth = 7;
    put(p.native, 44, 7);
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(f.state.plants[0].growth).toBe(4);
    expect(f.state.mules[0].native[94]).toBe(7);
    expect(f.rng.draws).toBe(2);
  });
  it("leaves a valid feeding target alone between16-tick damage gates without extra RNG", () => {
    const f = feedingFixture();
    put(f.self.native, 108, 29);
    f.c.plantDamage = () => {
      throw Error("Not a damage-cadence callback");
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(7);
    expect(word(f.state.mules[0].native, 108)).toBe(28);
    expect(f.rng.draws).toBe(0);
  });
  it("uses source6C900's already-dead return for an active retiring plant before normal feeding release", () => {
    const f = feedingFixture(),
      p = f.state.plants[0];
    p.growth = 0;
    put(p.native, 44, 0);
    p.plantFlags = p.native[46] = 129;
    p.retirement = p.native[48] = 4;
    const reserve = word(f.self.native, 104),
      r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[0].native, 104)).toBeGreaterThan(reserve);
    expect(f.state.plants[0].active).toBe(true);
    expect(f.state.plants[0].retirement).toBe(4);
    expect(f.state.plants[0].plantFlags).toBe(128);
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(f.rng.draws).toBe(3);
  });
  it("does not add a hunger-flag gate to an actual state7 feeding callback", () => {
    const f = feedingFixture(),
      p = f.state.plants[0];
    p.growth = 7;
    put(p.native, 44, 7);
    f.self.native[97] = 0;
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(f.state.plants[0].growth).toBe(4);
    expect(f.rng.draws).toBe(2);
  });
  it("preserves the dangling kind2/inactive plant invariant and full callback rollback", () => {
    const f = feedingFixture();
    f.state.plants[0].active = false;
    const before = JSON.stringify([f.state, f.terrain, f.rng]),
      r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toMatch(/inactive plant binding/);
    expect(r.committed).toBe(false);
    expect(JSON.stringify([f.state, f.terrain, f.rng])).toBe(before);
  });
  it("requires immediate retirement services before the same-callback neighborhood query", () => {
    const f = feedingFixture(),
      before = JSON.stringify([f.state, f.terrain, f.rng]),
      r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.committed).toBe(false);
    expect(r.reason).toMatch(/immediate6C780 host unlink\/cleanup/);
    expect(JSON.stringify([f.state, f.terrain, f.rng])).toBe(before);
    expect(r.events).toEqual([]);
  });
  it("observes immediate unlink and cleanup before nutrition and combat traversal", () => {
    const f = feedingFixture();
    let calls = 0,
      reserveAtDamage = -1;
    f.c.plantDamage = (state, terrain, rng, index, amount) => {
      expect([index, amount, rng.draws]).toEqual([0, 3, 0]);
      expect(terrain).not.toBe(f.terrain);
      calls++;
      const n = state.mules[0].native,
        p = state.plants[0];
      reserveAtDamage = word(n, 104);
      //Synthetic host afterimage. Full6C780 numeric bookkeeping is covered
      //by blast-adapter tests; this exercises its synchronous Mule boundary.
      f.linked.splice(f.linked.indexOf(p.id), 1);
      p.active = false;
      p.growth = 0;
      p.native[6] = 0;
      put(p.native, 44, 0);
      state.plantCount = 0;
      state.plantOrder![worldCell(...p.position)] = [];
      n[87] = 0; //Actual724C0 clears the reference kind, retaining its index.
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBeNull();
    expect(calls).toBe(1);
    expect(word(f.state.mules[0].native, 104)).toBeGreaterThan(reserveAtDamage);
    expect(f.state.plants[0].active).toBe(false);
    expect(f.state.plantCount).toBe(0);
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(f.rng.draws).toBe(3); //Two neighborhood draws, then source wait.
    expect(r.events.filter((e) => e.kind === "mule-fed")).toHaveLength(1);
    expect(r.events.filter((e) => e.kind === "mule-audio")).toEqual([
      { kind: "mule-audio", id: f.self.id, channel: 18 },
    ]);
  });
  it("rolls back local ecology, terrain and RNG if the staged retirement service fails", () => {
    const f = feedingFixture(),
      before = JSON.stringify([f.state, f.terrain, f.rng]);
    f.c.plantDamage = (state, terrain, rng) => {
      state.plants[0].active = false;
      state.plantCount = 0;
      terrain.bytes[13] = 77;
      rng.draws++;
      throw Error("synthetic immediate retirement failure");
    };
    const r = stepOwnedMule(f.state, 0, f.rng, f.c);
    expect(r.reason).toBe("synthetic immediate retirement failure");
    expect(r.committed).toBe(false);
    expect(r.events).toEqual([]);
    expect(JSON.stringify([f.state, f.terrain, f.rng])).toBe(before);
  });
});
describe("source Mule specialist/building targets", () => {
  it("preserves8AE10 equal-weight first-index ranks and uses no query RNG", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    targets(f, [actor]);
    f.c.traits = { ...traits, foodWeights: [100, 100, 100] };
    const before = { ...f.rng };
    expect(queryMuleCellFallback(f.state, f.self, f.c)).toBeNull();
    expect(f.rng).toEqual(before);
  });
  it("uses owner-only8AE10 selection, source26 corpse cutoff and first strict rank tie", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    f.c.traits = { ...traits, foodWeights: [22, 11, 33] };
    f.target.native[24] = 1;
    actor.owner = actor.native[24] = 1;
    f.c.allianceMasks = [3, 2, 4, 8];
    targets(f, [actor]);
    f.target.native[94] = 25;
    expect(queryMuleCellFallback(f.state, f.self, f.c)?.id).toBe(f.target.id);
    f.target.native[94] = 26;
    expect(queryMuleCellFallback(f.state, f.self, f.c)?.id).toBe(f.target.id);
    f.c.cellOrder = () => [actor.id, f.target.id, f.self.id];
    f.target.native[94] = 25;
    expect(queryMuleCellFallback(f.state, f.self, f.c)?.id).toBe(actor.id);
    f.target.native[94] = 26;
    expect(queryMuleCellFallback(f.state, f.self, f.c)?.id).toBe(f.target.id);
  });
  it("releases high airborne kind3 pursuit through source65F04 without a fabricated contact or query draw", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    targets(f, [actor]);
    f.state.mules = [f.self];
    put(actor.native, 73, 0x400);
    actor.physicalHeight = 2048 + 1281;
    dword(actor.native, 39, actor.physicalHeight);
    const n = f.self.native;
    n[94] = 1;
    n[96] = 64;
    put(n, 85, 0);
    n[87] = 3;
    const c = callbackContext(f),
      r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(f.state.mules[0].native[87]).toBe(0);
    expect(word(f.state.mules[0].native, 108)).toBeGreaterThanOrEqual(10);
    expect(f.rng.draws).toBe(1);
  });
  it("follows the current kind3 native50 association before contact without replacing the literal target with a stale overlay", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    targets(f, [actor]);
    f.state.mules = f.state.mules.filter((m) => m.index === 0);
    const n = f.self.native;
    n[94] = 1;
    put(n, 73, 20);
    put(n, 80, 0);
    n[82] = 3;
    put(n, 85, 0);
    n[87] = 3;
    put(n, 57, 512);
    put(n, 75, 512);
    put(n, 11, 20000);
    put(n, 13, 20000);
    const c = callbackContext(f),
      r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.committed).toBe(true);
    expect(r.reason).toBeNull();
    const after = f.state.mules[0].native;
    expect([word(after, 11), word(after, 13)]).toEqual([16448, 16384]);
    expect(after[94]).toBe(21);
    expect(after[82]).toBe(3);
  });
  it("uses the exact nominated building radius boundary before real arrival/attack instead of pursuing its blocked center", () => {
    const f = fixture(),
      building = externalTarget(4, 0, 16534);
    targets(f, [building]);
    f.state.mules = f.state.mules.filter((m) => m.index === 0);
    const n = f.self.native;
    n[94] = 1;
    put(n, 73, 20);
    put(n, 77, 0);
    n[79] = 4;
    put(n, 85, 0);
    n[87] = 4;
    put(n, 57, 512);
    put(n, 75, 512);
    put(n, 11, 16534);
    put(n, 13, 16384);
    const c = callbackContext(f),
      admissions: number[] = [];
    c.combatBuildingPointAccepted = (_s, _t, _m, _p, index) => {
      admissions.push(index);
      return true;
    };
    const r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.committed).toBe(true);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[0].native, 11)).toBe(16444);
    expect(admissions.length).toBeGreaterThan(0);
    expect(new Set(admissions)).toEqual(new Set([0]));
  });
  it("uses source400 squared arrival for a nominated building rather than the ordinary32-unit arrival policy", () => {
    const f = fixture(),
      building = externalTarget(4, 0, 16534);
    targets(f, [building]);
    f.state.mules = f.state.mules.filter((m) => m.index === 0);
    const n = f.self.native;
    n[94] = 1;
    put(n, 73, 16);
    put(n, 77, 0);
    n[79] = 4;
    put(n, 85, 0);
    n[87] = 4;
    put(n, 57, 512);
    put(n, 75, 512);
    put(n, 11, 16444);
    put(n, 13, 16384);
    put(n, 7, 16423);
    const c = callbackContext(f);
    c.frame = 0;
    expect(stepOwnedMule(f.state, 0, f.rng, c).committed).toBe(true);
    expect(word(f.state.mules[0].native, 7)).toBe(16423);
    expect(word(f.state.mules[0].native, 73) & 0x200).toBe(0);
    put(f.state.mules[0].native, 7, 16424);
    expect(stepOwnedMule(f.state, 0, f.rng, c).committed).toBe(true);
    expect(word(f.state.mules[0].native, 7)).toBe(16444);
    expect(word(f.state.mules[0].native, 73) & 0x200).toBe(0x200);
  });
  it("runs5B260 through the nominated74D90 predicate when arrival crosses an occupied cell", () => {
    const f = fixture(),
      building = externalTarget(4, 0, 16730);
    targets(f, [building]);
    const n = f.self.native;
    n[94] = 1;
    n[83] = 2; //The required host predicate owns its actual mask admission.
    put(n, 73, 16);
    put(n, 77, 0);
    n[79] = 4;
    put(n, 85, 0);
    n[87] = 4;
    put(n, 7, 16620);
    put(n, 11, 16640);
    put(n, 13, 16384);
    put(f.target.native, 7, 16650);
    const c = callbackContext(f),
      admissions: number[] = [];
    c.frame = 0;
    c.combatBuildingPointAccepted = (_s, _t, m, _point, index) => {
      expect(m.native[83]).toBe(2);
      admissions.push(index);
      return true;
    };
    const r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[0].native, 7)).toBe(16640);
    expect(admissions).toEqual([0]);
    expect(f.rng.draws).toBe(1);
  });
  it("executes state6 source four-phase blood at physical height and source unscaled1000 nutrition on expiry", () => {
    const f = fixture();
    f.state.mules = f.state.mules.filter((m) => m.index === 0);
    const n = f.self.native;
    n[94] = 6;
    put(n, 108, 12);
    const c = callbackContext(f),
      requests: {
        height?: number;
        angles: [number, number, number];
        draws: number;
      }[] = [];
    c.frame = 3;
    c.combatEffect = (_s, _t, r, request) =>
      requests.push({
        height: request.height,
        angles: request.angles,
        draws: r.draws,
      });
    expect(stepOwnedMule(f.state, 0, f.rng, c).committed).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].height).toBe(2048);
    expect(requests[0].draws).toBe(3);
    expect(f.state.mules[0].native[25]).toBe(19);
    const current = f.state.mules[0].native;
    put(current, 108, 0);
    put(current, 98, 10000);
    put(current, 104, 50);
    current[119] = 0;
    put(current, 102, 9000);
    c.frame = 5;
    const done = stepOwnedMule(f.state, 0, f.rng, c);
    expect(done.committed).toBe(true);
    expect(done.reason).toBeNull();
    expect(word(f.state.mules[0].native, 104)).toBe(1050);
    expect(word(f.state.mules[0].native, 102)).toBe(6998);
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(done.events.some((e) => e.channel === 27)).toBe(true);
  });
  it("uses primary threats for confidence and the nearest secondary building for acquisition", () => {
    const f = fixture(),
      actor = externalTarget(3, 2, 16720),
      building = externalTarget(4, 3, 16400);
    f.target.native[24] = 0;
    targets(f, [actor, building]);
    const q = queryMuleCombat(f.state, f.self, f.rng, f.c);
    expect(q.enemyCount).toBe(1);
    expect(q.secondaryCount).toBe(2);
    expect([q.targetKind, q.target]).toEqual([4, 3]);
    expect(q.friendlyCount).toBe(1);
    expect(q.rngAfter.draws).toBe(2);
    expect(f.rng.draws).toBe(0);
  });
  it("never uses a hostile building alone as a primary confidence threat", () => {
    const f = fixture(),
      building = externalTarget(4, 0);
    f.target.native[24] = 0;
    targets(f, [building]);
    const q = queryMuleCombat(f.state, f.self, f.rng, f.c);
    expect(q.enemyCount).toBe(0);
    expect(q.secondaryCount).toBe(1);
    expect(q.targetKind).toBe(4);
    expect(
      chooseMuleHostile(f.state, f.self, f.rng, f.c, f.ports, f.events, q),
    ).toBe(false);
    expect(f.rng.draws).toBe(0);
    consumeMuleCombatQuery(f.rng, q);
    expect(f.rng.draws).toBe(2);
  });
  it("counts actual friendly specialists before their dead/style gates without extra RNG", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    actor.owner = 0;
    actor.native[24] = 0;
    actor.specialistStyle = 3;
    actor.dead = true;
    actor.native[115] = 0;
    targets(f, [actor]);
    const q = queryMuleCombat(f.state, f.self, f.rng, f.c);
    expect(q.friendlyCount).toBe(1);
    expect(q.rngAfter.draws).toBe(2);
  });
  it("implements the authorized per-candidate scratch fix after a failed style2 roll", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    actor.specialistStyle = 2;
    f.rng.seed = 3;
    targets(f, [actor]); //Third draw49 fails the source20% gate.
    const q = queryMuleCombat(f.state, f.self, f.rng, f.c);
    expect(q.enemyCount).toBe(1);
    expect(q.secondaryCount).toBe(1);
    expect([q.targetKind, q.target]).toEqual([1, 1]);
    expect(q.rngAfter.draws).toBe(3);
    expect(f.rng.draws).toBe(0);
  });
  it("uses actual style3 charge and preserves its conditional query draw", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    actor.specialistStyle = 3;
    targets(f, [actor]);
    actor.native[115] = 224;
    expect(queryMuleCombat(f.state, f.self, f.rng, f.c).rngAfter.draws).toBe(2);
    actor.native[115] = 0;
    const q = queryMuleCombat(f.state, f.self, f.rng, f.c);
    expect(q.enemyCount).toBe(2);
    expect(q.rngAfter.draws).toBe(3);
    actor.dead = true;
    expect(queryMuleCombat(f.state, f.self, f.rng, f.c).rngAfter.draws).toBe(2);
    actor.dead = false;
    delete actor.specialistStyle;
    expect(() => queryMuleCombat(f.state, f.self, f.rng, f.c)).toThrow(
      "blueprint style",
    );
  });
  it("installs actual kind3 logical references without changing retained literal goals", () => {
    const f = fixture(),
      actor = externalTarget(3, 2);
    put(f.self.native, 11, 1234);
    put(f.self.native, 13, 5678);
    f.self.native[120] = 7;
    acquireMuleHostile(f.self, actor, f.ports, f.events, f.c, f.rng);
    expect([
      word(f.self.native, 85),
      f.self.native[87],
      word(f.self.native, 80),
      f.self.native[82],
      word(f.self.native, 88),
      f.self.native[90],
    ]).toEqual([2, 3, 2, 3, 2, 3]);
    expect([word(f.self.native, 11), word(f.self.native, 13)]).toEqual([
      1234, 5678,
    ]);
    expect(f.events[0].targetKind).toBe(3);
    expect(f.rng.draws).toBe(0);
  });
  it("releases first and refuses an airborne specialist in source5B580", () => {
    const f = fixture(),
      actor = externalTarget(3, 2);
    put(actor.native, 73, 0x400);
    put(f.self.native, 108, 99);
    expect(
      acquireMuleHostile(f.self, actor, f.ports, f.events, f.c, f.rng),
    ).toBe(false);
    expect(word(f.self.native, 108)).toBe(0);
    expect(f.self.native[87]).toBe(0);
    expect(f.events).toEqual([]);
    expect(f.rng.draws).toBe(0);
  });
  it("approaches a building with its native4D reference and the source outside flags", () => {
    const f = fixture(),
      building = externalTarget(4, 2);
    f.self.native[22] = 0xc0;
    f.c.buildingAt = () => null;
    acquireMuleHostile(f.self, building, f.ports, f.events, f.c, f.rng);
    expect([
      word(f.self.native, 77),
      f.self.native[79],
      f.self.native[82],
      f.self.native[87],
    ]).toEqual([2, 4, 0, 4]);
    expect([word(f.self.native, 11), word(f.self.native, 13)]).toEqual([
      16448, 16384,
    ]);
    expect(f.self.native[22]).toBe(128);
    expect(f.self.native[94]).toBe(1);
    expect(f.rng.draws).toBe(0);
  });
  it("uses104E12 plus256 and exactly two73C20 draws while already inside the target building", () => {
    const f = fixture(),
      building = externalTarget(4, 2);
    f.c.buildingAt = () => building.id;
    expect(
      acquireMuleHostile(f.self, building, f.ports, f.events, f.c, f.rng),
    ).toBe(false);
    expect(f.rng.draws).toBe(2);
    expect(f.self.native[94]).toBe(8);
    expect(f.self.native[79]).toBe(0);
    expect(f.self.native[82]).toBe(0);
    expect([word(f.self.native, 11), word(f.self.native, 13)]).not.toEqual([
      16448, 16384,
    ]);
    expect(Math.abs(word(f.self.native, 11) - 16448)).toBeLessThanOrEqual(346);
    expect(Math.abs(word(f.self.native, 13) - 16384)).toBeLessThanOrEqual(346);
  });
  it("quarters specialist attack damage only after reserve/operator/variation and waits for the real damage result", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    targets(f, [actor]);
    f.c.traits = { ...traits, disposition: 0 };
    f.self.native[94] = 21;
    put(f.self.native, 85, 0);
    f.self.native[87] = 3;
    const calls: number[] = [];
    f.c.damage = (self, target, amount) => {
      expect(self).toBe(f.self);
      expect(target).toBe(actor);
      calls.push(amount);
      return false;
    };
    completeMuleAttack(f.state, f.self, f.rng, f.c, f.ports, f.events);
    expect(calls).toEqual([2]);
    expect(word(f.self.native, 104)).toBe(47);
    expect(f.self.native[94]).toBe(1);
    expect(word(f.self.native, 108)).toBe(32767);
    expect(f.rng.draws).toBe(2);
  });
  it("enters source specialist consumption6 and takes its actual one-draw cooldown on lethal virtual34", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    targets(f, [actor]);
    f.self.native[24] = 4;
    f.self.native[94] = 21;
    put(f.self.native, 85, 0);
    f.self.native[87] = 3;
    f.c.damage = () => true;
    completeMuleAttack(f.state, f.self, f.rng, f.c, f.ports, f.events);
    expect(f.self.native[94]).toBe(6);
    expect(word(f.self.native, 108)).toBe(12);
    expect(f.rng.draws).toBe(2);
    expect(f.self.native.slice(114, 118)).toEqual(f.self.native.slice(7, 11));
  });
  it("uses104E12 plus64 range, halves building damage and reenters actual attack21 without movement", () => {
    const f = fixture(),
      building = externalTarget(4, 0, 16534);
    targets(f, [building]);
    f.c.traits = { ...traits, disposition: 0 };
    f.self.native[94] = 21;
    put(f.self.native, 85, 0);
    f.self.native[87] = 4;
    const calls: number[] = [];
    f.c.damage = (_self, _target, amount) => {
      calls.push(amount);
      return false;
    };
    completeMuleAttack(f.state, f.self, f.rng, f.c, f.ports, f.events);
    expect(calls).toEqual([5]);
    expect(f.events.some((e) => e.channel === 88)).toBe(true);
    expect(f.self.native[94]).toBe(21);
    expect(f.rng.draws).toBe(3);
    expect(word(f.self.native, 63)).toBe(0);
  });
  it("uses immediate building retirement and an occupied-cell query before any next AI draw", () => {
    const f = fixture(),
      building = externalTarget(4, 0);
    targets(f, [building]);
    f.self.native[94] = 21;
    put(f.self.native, 85, 0);
    f.self.native[87] = 4;
    f.c.damage = () => {
      building.native[6] = 0;
      return true;
    };
    f.ports.occupied = () => {
      expect(building.native[6]).toBe(0);
      expect(f.rng.draws).toBe(1);
      return false;
    };
    completeMuleAttack(f.state, f.self, f.rng, f.c, f.ports, f.events);
    expect(f.self.native[94]).toBe(8);
    expect(word(f.self.native, 108)).toBe(0);
    expect(f.rng.draws).toBe(1);
  });
  it("rolls back a whole callback when the actual external target damage service fails", () => {
    const f = fixture(),
      actor = externalTarget(3, 0);
    targets(f, [actor]);
    const n = f.self.native;
    n[94] = 21;
    n[25] = 10;
    n[27] = 3;
    n[28] = 1;
    put(n, 85, 0);
    n[87] = 3;
    put(n, 57, 512);
    const c: MuleContext = {
      terrain: f.terrain,
      tables: table,
      frame: 1,
      combat: traits,
      gravity: 1024,
      water: 0,
      climate: 106,
      bounce: Array(8).fill(0),
      obstacleAt: () => false,
      profile: () => ({ holds: [0, 0, 0, 0], flags: 0, first: 0, last: 3 }),
      cellOrder: f.c.cellOrder,
      owned: {
        selectedPlayer: 0,
        globalFlags: 0,
        allianceMasks: [1, 2, 4, 8],
        players: f.c.players,
        buildings: [],
        operators: [],
      },
      rules: {
        schemaVersion: 1,
        plants: [],
        spreadDirections: [],
        plantResources: [],
        mule: {
          selector: 4,
          baseSpeed: 704,
          lifetimeScale: 19000,
          reserveScale: 160,
          healthScale: 80,
          healthRecoveryPeriod: 20,
          warmThreshold: 25,
        },
      },
      combatEntity: (_s, _t, _r, id) => (id === actor.id ? actor : null),
      combatDamage: () => {
        throw Error("actual external damage unavailable");
      },
    };
    const before = JSON.stringify([f.state, f.rng, f.terrain]);
    const r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.committed).toBe(false);
    expect(r.reason).toBe("actual external damage unavailable");
    expect(JSON.stringify([f.state, f.rng, f.terrain])).toBe(before);
    expect(r.events).toEqual([]);
  });
});
describe("source Mule damage and complete animation", () => {
  it("uses actual creature classes for full and half defense bypass", () => {
    for (const [primary, secondary, health] of [
      [2, 4, 90],
      [4, 2, 93],
      [4, 4, 96],
    ]) {
      const f = fixture();
      f.c.effect = () => {};
      damageMuleFromSource(
        f.state,
        f.target,
        {
          kind: 1,
          index: 0,
          owner: 0,
          native: f.self.native,
          primaryClass: primary,
          secondaryClass: secondary,
        },
        10,
        f.rng,
        f.c,
        f.ports,
        f.events,
      );
      expect(word(f.target.native, 106)).toBe(health);
    }
  });
  it("takes environmental self damage without reaction, attacker reference, sound or RNG", () => {
    const f = fixture();
    damageMuleFromSource(
      f.state,
      f.target,
      {
        kind: 1,
        index: 1,
        owner: 4,
        native: f.target.native,
        primaryClass: 4,
        secondaryClass: 4,
      },
      7,
      f.rng,
      f.c,
      f.ports,
      f.events,
    );
    expect(word(f.target.native, 106)).toBe(99);
    expect(f.target.native[94]).toBe(8);
    expect(f.target.native[87]).toBe(0);
    expect(word(f.target.native, 108)).toBe(0);
    expect(f.events.map((e) => e.kind)).toEqual(["mule-combat-damage"]);
    expect(f.rng.draws).toBe(0);
  });
  it("does not spend researched recoil reserve or move an effect/specialist attacker", () => {
    for (const kind of [3, 5] as const) {
      const f = fixture(),
        n: N = Array(kind === 3 ? 200 : 81).fill(0);
      n[6] = kind;
      n[24] = 0;
      n[69] = 20;
      put(n, 15, 7);
      f.target.native[118] = 100;
      put(f.target.native, 65, 123);
      const before = n.slice();
      damageMuleFromSource(
        f.state,
        f.target,
        {
          kind,
          index: 7,
          owner: 0,
          native: n,
        },
        1,
        f.rng,
        f.c,
        f.ports,
        f.events,
      );
      expect(n).toEqual(before);
      expect(word(f.target.native, 104)).toBe(50);
      expect(word(f.target.native, 65)).toBe(123);
      expect(f.target.native[94]).toBe(20);
      expect([word(f.target.native, 85), f.target.native[87]]).toEqual([
        7,
        kind,
      ]);
    }
  });
  it("keeps attack entry harmless until the complete ANB gate in the whole callback", () => {
    const f = fixture(),
      n = f.self.native;
    n[94] = 1;
    n[96] = 0xc0;
    n[97] = 0x40;
    put(n, 85, 1);
    n[87] = 1;
    put(n, 80, 1);
    n[82] = 1;
    put(n, 57, 512);
    const c: MuleContext = {
      terrain: f.terrain,
      tables: table,
      frame: 1,
      combat: traits,
      gravity: 1024,
      water: 0,
      climate: 106,
      bounce: Array(8).fill(0),
      obstacleAt: () => false,
      profile: () => ({ holds: [0, 0, 0, 0], flags: 0, first: 0, last: 3 }),
      owned: {
        selectedPlayer: 0,
        globalFlags: 0,
        allianceMasks: [1, 2, 4, 8],
        players: f.c.players,
        buildings: [],
        operators: [],
      },
      rules: {
        schemaVersion: 1,
        plants: [],
        spreadDirections: [],
        plantResources: [],
        mule: {
          selector: 4,
          baseSpeed: 704,
          lifetimeScale: 19000,
          reserveScale: 160,
          healthScale: 80,
          healthRecoveryPeriod: 20,
          warmThreshold: 25,
        },
      },
      cellOrder: f.c.cellOrder,
      combatEffect: () => {},
    };
    expect(stepOwnedMule(f.state, 0, f.rng, c).reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(21);
    expect(word(f.state.mules[1].native, 106)).toBe(100);
    expect(f.rng.draws).toBe(1);
    for (let frame = 2; frame <= 3; frame++) {
      c.frame = frame;
      expect(stepOwnedMule(f.state, 0, f.rng, c).reason).toBeNull();
    }
    expect(word(f.state.mules[1].native, 106)).toBe(100);
    const current = f.state.mules[0].native;
    current[25] = 8;
    current[26] = current[30] = 0;
    current[27] = 3;
    put(current, 108, 30000);
    c.frame = 5;
    const before = word(f.state.mules[1].native, 106),
      r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[1].native, 106)).toBeLessThan(before);
    expect(r.events.some((e) => e.kind === "mule-combat-damage")).toBe(true);
  });
  it("subtracts skill-scaled defense, applies minimum damage, and requires no blood for effective4", () => {
    const f = fixture();
    put(f.target.native, 65, 100);
    f.rng.seed = 26965;
    damageMule(f.state, f.target, f.self, 10, f.rng, f.c, f.ports, f.events);
    expect(word(f.target.native, 106)).toBe(96);
    expect(f.target.native[94]).toBe(20);
    expect(f.rng.draws).toBe(1);
    expect(f.events.find((e) => e.kind === "mule-audio")?.channel).toBe(8);
    damageMule(f.state, f.target, f.self, 0, f.rng, f.c, f.ports, f.events);
    expect(word(f.target.native, 106)).toBe(95);
  });
  it("allocates blood immediately after its three draws, before the subsequent attack query", () => {
    const f = fixture();
    f.self.native[94] = 21;
    put(f.self.native, 85, 1);
    f.self.native[87] = 1;
    let factoryDraws = -1;
    f.c.effect = (_s, _t, r, request) => {
      factoryDraws = r.draws;
      expect(request.code).toBe(32);
      expect(request.source).toBe(f.target.id);
    };
    completeMuleAttack(f.state, f.self, f.rng, f.c, f.ports, f.events);
    expect(factoryDraws).toBeGreaterThanOrEqual(5);
    expect(f.rng.draws).toBeGreaterThan(factoryDraws);
    expect(f.events.some((e) => e.kind === "mule-combat-damage")).toBe(true);
    expect(word(f.self.native, 104)).toBe(47);
  });
  it("rechecks range at animation completion and retains all hit references on a miss", () => {
    const f = fixture();
    f.self.native[94] = 21;
    put(f.self.native, 85, 1);
    f.self.native[87] = 1;
    put(f.target.native, 7, 16513);
    completeMuleAttack(f.state, f.self, f.rng, f.c, f.ports, f.events);
    expect(f.rng.draws).toBe(1);
    expect(f.events).toEqual([]);
    expect(word(f.target.native, 106)).toBe(100);
    expect([
      f.self.native[94],
      f.self.native[87],
      word(f.self.native, 85),
    ]).toEqual([8, 1, 1]);
  });
  it("uses actual owned research for recoil and consumes its explicit and height-conditional draws", () => {
    const f = fixture();
    f.target.native[24] = 0;
    f.self.native[24] = 4;
    const player = Array(1805).fill(0);
    player[0x6cb] = 1;
    f.c.players = [player];
    damageMule(f.state, f.target, f.self, 8, f.rng, f.c, f.ports, f.events);
    expect([
      f.target.native[94],
      f.target.native[25],
      word(f.target.native, 104),
    ]).toEqual([16, 23, 43]);
    expect(word(f.self.native, 61)).toBeGreaterThanOrEqual(5760);
    expect(word(f.self.native, 61)).toBeLessThanOrEqual(8896);
    expect(f.rng.draws).toBeGreaterThanOrEqual(3);
  });
  it("transitions lethal targets before returning and publishes one kill receipt", () => {
    const f = fixture();
    put(f.target.native, 106, 1);
    expect(
      damageMule(f.state, f.target, f.self, 8, f.rng, f.c, f.ports, f.events),
    ).toBe(true);
    expect(f.target.native[94]).toBe(24);
    expect(f.events.filter((e) => e.kind === "mule-combat-kill")).toHaveLength(
      1,
    );
    const before = f.rng.draws;
    expect(
      damageMule(f.state, f.target, f.self, 8, f.rng, f.c, f.ports, f.events),
    ).toBe(true);
    expect(f.rng.draws).toBe(before);
  });
  it("rolls back complete ecology/RNG/terrain if a required blood factory rejects", () => {
    const f = fixture(),
      n = f.self.native;
    n[94] = 21;
    n[25] = 8;
    n[27] = 3;
    n[28] = 1;
    put(n, 85, 1);
    n[87] = 1;
    put(n, 57, 512);
    const c: MuleContext = {
      terrain: f.terrain,
      tables: table,
      frame: 1,
      combat: traits,
      gravity: 1024,
      water: 0,
      climate: 106,
      bounce: Array(8).fill(0),
      obstacleAt: () => false,
      profile: () => ({ holds: [0, 0, 0, 0], flags: 0, first: 0, last: 3 }),
      owned: {
        selectedPlayer: 0,
        globalFlags: 0,
        allianceMasks: [1, 2, 4, 8],
        players: f.c.players,
        buildings: [],
        operators: [],
      },
      rules: {
        schemaVersion: 1,
        plants: [],
        spreadDirections: [],
        plantResources: [],
        mule: {
          selector: 4,
          baseSpeed: 704,
          lifetimeScale: 19000,
          reserveScale: 160,
          healthScale: 80,
          healthRecoveryPeriod: 20,
          warmThreshold: 25,
        },
      },
      cellOrder: f.c.cellOrder,
      combatEffect: () => {
        throw new Error("synthetic full host rejection");
      },
    };
    const before = JSON.stringify([f.state, f.rng, f.terrain]),
      r = stepOwnedMule(f.state, 0, f.rng, c);
    expect(r.committed).toBe(false);
    expect(r.reason).toBe("synthetic full host rejection");
    expect(r.events).toEqual([]);
    expect(JSON.stringify([f.state, f.rng, f.terrain])).toBe(before);
    expect(JSON.parse(JSON.stringify(f.state))).toEqual(f.state);
  });
});

describe("species-dependent defensive ability",()=>{
  it("does not give a high-quality Crab the primary-Mule recoil ability",()=>{const f=fixture();f.c.speciesComponents=speciesFixture().components;f.target.native[122]=1;f.target.native[118]=100;const reserve=word(f.target.native,104);damageMule(f.state,f.target,f.self,10,f.rng,f.c,f.ports,f.events);expect(f.target.native[94]).toBe(20);expect(f.target.native[25]).not.toBe(23);expect(word(f.target.native,104)).toBe(reserve);});
});


describe("reentrant building attack completion", () => {
  it.each([[1,22], [11,22], [22,11], [4,5]])(
    "delivers the ordered species%i modifier before recursive destruction", (species, amount) => {
      const f = fixture(), building = externalTarget(4,0);
      targets(f,[building]);
      f.c.speciesComponents = speciesFixture().components;
      f.self.native[122] = species;
      f.self.native[94] = 21;
      put(f.self.native,85,0);f.self.native[87]=4;
      f.c.damage = (_self,_target,damage) => {
        expect(damage).toBe(amount);
        // Synchronous destruction invokes the attacker's damage/death callback.
        put(f.self.native,106,-7);f.self.native[94]=24;
        put(f.self.native,63,-1);put(f.self.native,108,32767);
        building.native[6]=0;
        return true;
      };
      completeMuleAttack(f.state,f.self,f.rng,f.c,f.ports,f.events);
      expect(f.self.native[94]).toBe(8);
      expect(word(f.self.native,106)).toBe(-7);
      expect(word(f.self.native,63)).toBe(-1);
      expect(word(f.self.native,108)).toBe(0);
      expect(f.rng.draws).toBe(1);
    });
});
