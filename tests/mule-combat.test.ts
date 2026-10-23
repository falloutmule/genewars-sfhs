import { describe, expect, it } from "vitest";
import {
  acquireMuleHostile,
  chooseMuleHostile,
  escapeMuleNeighborhood,
  completeMuleAttack,
  contactMuleHostile,
  damageMule,
  fleeMule,
  muleCombatDistance,
  queryMuleCombat,
  type MuleCombatContext,
  type MuleCombatPorts,
  type MuleCombatTraits,
} from "../src/sim/mechanics/mule-combat";
import {
  stepOwnedMule,
  type MuleContext,
  type MuleEvent,
} from "../src/sim/mechanics/mule";
import type { EcologyMule, EcologyState } from "../src/sim/mechanics/ecology";
import type { GeneRng } from "../src/sim/mechanics/random";
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
describe("source Mule damage and complete animation", () => {
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
