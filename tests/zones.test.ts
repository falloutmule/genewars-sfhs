import { describe, expect, it } from "vitest";
import {
  stepZones,
  initializeZones,
  stepZoneEffect,
  stepZoneEffectRecord,
  type ZoneContext,
  type ZoneState,
  type ZoneRecord,
} from "../src/sim/mechanics/zones";
import {
  createPowerEffectPool,
  putEffectWord as put,
  putEffectDword as put32,
  type EffectNativePrior,
} from "../src/sim/mechanics/power-motion";
import {
  groundHeight,
  terrainFromBytes,
  worldCell,
} from "../src/sim/mechanics/terrain";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { nextRandom } from "../src/sim/mechanics/random";
const w = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const d = (n: readonly (number | null)[], p: number) =>
  n[p]! | (n[p + 1]! << 8) | (n[p + 2]! << 16) | (n[p + 3]! << 24);
function native(size: number): EffectNativePrior {
  return Array.from({ length: size }, (_, i) => (i >= 31 && i < 39 ? null : 0));
}
function zone(
  s: ZoneState,
  index: number,
  quota = 1024,
  center: [number, number] = [1024, 1024],
  selector = 12,
  active = 1,
) {
  const p = 0x2ff8 + index * 19;
  put(s.missionPrefix, p, center[0]);
  put(s.missionPrefix, p + 2, center[1]);
  s.missionPrefix[p + 4] = selector;
  s.missionPrefix[p + 5] = 255;
  put32(s.missionPrefix, p + 6, 1024);
  put32(s.missionPrefix, p + 10, quota);
  put32(s.missionPrefix, p + 14, quota);
  s.missionPrefix[p + 18] = active;
}
function fixture(owner = 0, quota = 1024): { s: ZoneState; c: ZoneContext } {
  const raw = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    put(raw, i * 14 + 2, 1000);
    raw[i * 14 + 5] = 2;
  }
  const terrain = terrainFromBytes(raw),
    priors = Array.from({ length: 200 }, () => {
      const n = native(81);
      n[30] = 2;
      n[67] = 181;
      n[68] = 193;
      n[73] = 4;
      n[76] = 99;
      return {
        occupied: false,
        nativePrior: n,
        fractionX: 181,
        fractionY: 193,
      };
    }),
    pool = createPowerEffectPool(priors);
  if (!pool.ok) throw new Error(pool.reason);
  const creature = native(124);
  creature[6] = 1;
  creature[24] = owner;
  creature[94] = 8;
  creature[122] = 4;
  put(creature, 7, 1024);
  put(creature, 9, 1024);
  put32(creature, 17, groundHeight(terrain, 1024, 1024));
  put32(creature, 39, groundHeight(terrain, 1024, 1024));
  const s: ZoneState = {
    missionPrefix: Array(0x355e).fill(0),
    players: Array.from({ length: 4 }, (_, id) => ({
      id,
      raw: Array(1805).fill(0),
    })),
    creatures: [{ index: 0, native: creature }],
    plants: [],
    buildings: [],
    visitors: [],
    effects: [],
    powerEffects: pool.value,
    spatial: { heads: Array(16384).fill(null), nodes: {} },
    terrain,
    rng: { seed: 5428, draws: 0xfffffffe, ring: 31 },
  };
  s.missionPrefix[0x34b8] = 1;
  put(s.missionPrefix, 0x3550, 1);
  put(s.missionPrefix, 0x1c7c, 10);
  put(s.missionPrefix, 0x1c78, 10);
  put(s.missionPrefix, 0x1c63, 1000);
  for (const p of s.players) put32(p.raw, 0x49d, 1);
  zone(s, 0, quota);
  insertSpatial(s.spatial, s.terrain, "source:0:0", worldCell(1024, 1024));
  const c: ZoneContext = {
    frame: 64,
    participatingPlayers: 1,
    selectedPlayer: 0,
    gravity: 1024,
    rules: {
      schemaVersion: 1,
      speciesComponents: Array.from({ length: 25 }, () => [4, 4]),
      zoneTextIndices: Array(14).fill(10),
      terrainLightVector: [0, 0, -256],
    },
    tables: {
      atan: Array.from({ length: 257 }, (_, i) =>
        Math.round((Math.atan(i / 256) * 1024) / Math.PI),
      ),
      sine: Array.from({ length: 2048 }, (_, i) =>
        Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
      ),
      cosine: Array.from({ length: 2048 }, (_, i) =>
        Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
      ),
    },
    bounce: Array(8).fill(128),
    profile: () => ({ holds: Array(6).fill(0), flags: 0, first: 0, last: 5 }),
    cleanup: () => {},
  };
  return { s, c };
}
describe("source marked-zone scoring and effects", () => {
  it("initializes positive-quota terrain and a real marker without inventing observation", () => {
    const { s, c } = fixture();
    s.missionPrefix[0x300a] = 0;
    put(s.missionPrefix, 0x355c, 1000);
    const before = structuredClone(s),
      requests: unknown[] = [];
    c.visitor = (_staged, request) => {
      requests.push(request);
      return null;
    };
    const result = initializeZones(s, c);
    expect(s).toEqual(before);
    expect(requests).toEqual([
      {
        mode: 2,
        zone: 0,
        position: [1024, 1024],
        height: groundHeight(s.terrain, 1024, 1024) + 32000,
      },
    ]);
    expect(result.state.missionPrefix[0x300a]).toBe(0);
    expect(result.state.terrain.bytes[worldCell(1024, 1024) * 14 + 12]).toBe(
      63,
    );
    expect(result.state.rng).toEqual(s.rng);
    expect(result.events.filter((e) => e.type === "zone-visitor")).toHaveLength(
      1,
    );
    c.visitor = () => {
      throw new Error("factory stopped");
    };
    expect(() => initializeZones(s, c)).toThrow("factory stopped");
    expect(s).toEqual(before);
  });
  it("credits owned Mule16 then8 with interleaved real marker factories and zone trail", () => {
    const { s, c } = fixture(),
      saved = structuredClone(s),
      r = stepZones(s, c);
    expect(s).toEqual(saved);
    expect(d(r.state.missionPrefix, 0x3006)).toBe(1000);
    expect([
      d(r.state.players[0].raw, 13),
      d(r.state.players[0].raw, 17),
    ]).toEqual([24, 20]);
    expect(r.state.effects.map((e) => e.code)).toEqual([60, 60, 60, 47]);
    expect(
      r.events.flatMap((e) => (e.type === "zone-credit" ? [e.amount] : [])),
    ).toEqual([16, 8]);
    const rng = { ...s.rng };
    for (let i = 0; i < 15; i++) nextRandom(rng);
    expect(r.state.rng).toEqual(rng);
    expect(w(r.state.missionPrefix, 0x3554)).toBe(4);
    for (const e of r.state.effects) {
      expect(e.native[30]).toBe(2);
      expect(e.native[73]).toBe(4);
      expect(e.native[76]).toBe(99);
      expect(e.native.slice(31, 39)).toEqual(Array(8).fill(null));
    }
    validateSpatial(r.state.spatial);
  });

  it("keeps neutral zero-credit feedback and secondary AL tail semantics", () => {
    for (const quota of [1, 4]) {
      const { s, c } = fixture(4, quota),
        r = stepZones(s, c);
      expect(r.state.effects.map((e) => e.code)).toEqual([60, 60]);
      expect(
        r.events.flatMap((e) => (e.type === "zone-credit" ? [e.amount] : [])),
      ).toEqual(quota === 1 ? [0, 0] : [1, 0]);
      expect(d(r.state.missionPrefix, 0x3006)).toBe(quota === 1 ? 1 : 3);
      expect(r.events.filter((e) => e.type === "zone-audio")).toHaveLength(2);
    }
    const { s, c } = fixture(0, 1),
      r = stepZones(s, c);
    expect(r.state.effects.map((e) => e.code)).toEqual([60]);
    expect(r.state.missionPrefix[0x34b9]).toBe(1);
    expect(d(r.state.missionPrefix, 0x3002)).toBe(0);
  });

  it("retains primary AL when secondary gene mismatches and supports multiplayer penalties", () => {
    const { s, c } = fixture();
    c.rules.speciesComponents[4] = [4, 2];
    let r = stepZones(s, c);
    expect(r.state.effects.map((e) => e.code)).toEqual([60, 60, 47]);
    expect(d(r.state.players[0].raw, 13)).toBe(16);
    c.rules.speciesComponents[4] = [4, 4];
    c.participatingPlayers = 2;
    c.selectedPlayer = 1;
    r = stepZones(s, c);
    expect([
      d(r.state.players[1].raw, 13),
      d(r.state.players[1].raw, 17),
    ]).toEqual([0, -6]);
    expect(r.events.filter((e) => e.type === "zone-warning")).toHaveLength(2);
    s.players[1].raw.fill(0);
    r = stepZones(s, c);
    expect(d(r.state.players[1].raw, 17)).toBe(0); //Inactive player's penalty is gated by49D.
  });

  it("uses source countdown/frame/frozen/dead gates and signed15 radius wrapping", () => {
    const { s, c } = fixture();
    for (const frame of [1, 63, 65]) {
      c.frame = frame;
      expect(stepZones(s, c).state.rng).toEqual(s.rng);
    }
    c.frame = 64;
    for (const state of [15, 24, 26]) {
      s.creatures[0].native[94] = state;
      expect(stepZones(s, c).events).toEqual([]);
    }
    s.creatures[0].native[94] = 8;
    zone(s, 0, 1024, [0, 1024]);
    put(s.creatures[0].native, 7, 1024);
    expect(stepZones(s, c).state.effects).toHaveLength(4);
    put(s.creatures[0].native, 7, 1025);
    expect(stepZones(s, c).state.effects).toHaveLength(0);
    put(s.creatures[0].native, 7, 32767);
    expect(stepZones(s, c).state.effects).toHaveLength(4);
    put(s.missionPrefix, 0x355c, -1);
    s.missionPrefix[0x34b8] = 255;
    expect(stepZones(s, {} as ZoneContext).state).toEqual(s);
    put(s.missionPrefix, 0x355c, 0);
    s.missionPrefix[0x34b8] = 0;
    expect(stepZones(s, {} as ZoneContext).state).toEqual(s);
  });

  it("exhausts and chains zones in source order, relights terrain and marks visitors leaving", () => {
    const { s, c } = fixture(0, 17);
    s.missionPrefix[0x34b8] = 2;
    s.missionPrefix[0x2ffd] = 1;
    zone(s, 1, 200, [4096, 4096], 12, 0);
    put32(s.missionPrefix, 0x2ff8 + 19 + 14, 0);
    const visitor = native(102);
    visitor[6] = 8;
    visitor[85] = 2;
    visitor[88] = 0;
    s.visitors.push({ index: 0, native: visitor });
    c.visitor = (state, request) => {
      const n = native(102);
      n[6] = 8;
      n[85] = 2;
      n[88] = request.zone;
      put(n, 15, 1);
      put(n, 7, request.position[0]);
      put(n, 9, request.position[1]);
      state.visitors.push({ index: 1, native: n });
      insertSpatial(
        state.spatial,
        state.terrain,
        "source:7:1",
        worldCell(...request.position),
      );
      return 1;
    };
    const r = stepZones(s, c);
    expect([
      d(r.state.missionPrefix, 0x3002),
      d(r.state.missionPrefix, 0x3006),
      r.state.missionPrefix[0x34b9],
    ]).toEqual([0, 0, 1]);
    expect(d(r.state.missionPrefix, 0x2ff8 + 19 + 14)).toBe(200);
    expect(
      r.events
        .filter((e) =>
          [
            "zone-completed",
            "zone-terrain",
            "zone-visitor",
            "zone-activated",
          ].includes(e.type),
        )
        .map((e) => e.type),
    ).toEqual([
      "zone-completed",
      "zone-terrain",
      "zone-visitor",
      "zone-activated",
      "zone-terrain",
    ]);
    expect(r.state.visitors[0].native[87]).toBe(1);
    expect(r.state.visitors[1].native[87]).toBe(0);
    const cell = worldCell(4096, 4096);
    expect(w(r.state.terrain.bytes, cell * 14)).toBe(0x3000);
    expect(r.state.terrain.bytes[cell * 14 + 12]).toBe(63);
    const bad = structuredClone(s),
      saved = structuredClone(bad);
    expect(() =>
      stepZones(bad, {
        ...c,
        visitor: () => {
          throw new Error("late host failure");
        },
      }),
    ).toThrow("late host failure");
    expect(bad).toEqual(saved);
  });

  it("uses staggered plant/building phases and original power/research flags", () => {
    const { s, c } = fixture();
    s.creatures = [];
    put(s.missionPrefix, 0x3550, 0);
    s.spatial = { heads: Array(16384).fill(null), nodes: {} };
    const plant = native(49);
    plant[6] = 2;
    plant[24] = 0;
    put(plant, 7, 1024);
    put(plant, 9, 1024);
    put32(plant, 17, 2000);
    s.plants = [{ index: 0, native: plant }];
    put(s.missionPrefix, 0x3552, 1);
    insertSpatial(s.spatial, s.terrain, "source:1:0", worldCell(1024, 1024));
    zone(s, 0, 1024, [1024, 1024], 7);
    c.frame = 48;
    c.tailYaw = 0;
    let r = stepZones(s, c);
    expect(d(r.state.players[0].raw, 13)).toBe(8);
    expect(r.state.effects.map((e) => e.code)).toEqual([60, 47]);
    expect(d(r.state.effects[0].native, 39)).toBe(2000);
    expect(d(r.state.effects[1].native, 39)).toBe(0);
    const building = native(67);
    building[6] = 4;
    building[24] = 0;
    building[45] = 7;
    put(building, 7, 1024);
    put(building, 9, 1024);
    put32(building, 17, 2000);
    put(building, 49, 5);
    s.buildings = [{ index: 0, native: building }];
    s.players[0].raw[0x607] = 1;
    zone(s, 0, 1024, [1024, 1024], 13);
    c.frame = 32;
    r = stepZones(s, c);
    expect(d(r.state.players[0].raw, 13)).toBe(64);
    expect(r.state.effects.filter((e) => e.code === 60)).toHaveLength(8);
    building[49] = 1;
    expect(stepZones(s, c).state.effects).toHaveLength(0);
  });

  it("advances marker physics/animation and retires its exact native afterimage", () => {
    const { s, c } = fixture(),
      created = stepZones(s, c);
    let live = created.state;
    const slot = live.effects[0].slot,
      rng = { ...live.rng };
    let calls = 0;
    while (live.effects.some((e) => e.slot === slot)) {
      live = stepZoneEffect(live, slot, c).state;
      if (++calls > 30) throw new Error("unbounded marker");
    }
    expect(live.rng).toEqual(rng);
    expect(live.powerEffects.slots[slot].occupied).toBe(false);
    expect(live.powerEffects.slots[slot].nativePrior![6]).toBe(0);
    expect(live.powerEffects.slots[slot].nativePrior![69]).toBe(60);
    expect(w(live.missionPrefix, 0x3554)).toBe(3);
    expect(live.spatial.nodes[`source:4:${slot}`]).toBeUndefined();
    const n = created.state.effects[0].native.slice();
    put32(n, 17, 2000);
    put32(n, 39, 2000);
    put(n, 45, 1000);
    put(n, 47, 0);
    put(n, 49, -1024);
    put(n, 55, 0);
    const grounded = stepZoneEffectRecord(n, 60, s.terrain, c);
    expect(grounded.samples).toHaveLength(2);
    expect(w(grounded.native, 45)).toBe(1000);
    expect(d(grounded.native, 39)).toBe(2000);
    n[30] = 255;
    const negative = stepZoneEffectRecord(n, 60, s.terrain, c);
    expect(negative.native[27]).toBe(1);
    expect(negative.native[30]).toBe(n[29]);
    n[30] = 61;
    const clamped = stepZoneEffectRecord(n, 60, s.terrain, c);
    expect(clamped.native[27]).toBe(0);
    expect(clamped.native[30]).toBe(n[29]! - 1);
  });

  it("rolls back late invalid counters and count/profile errors without invented priors", () => {
    const { s, c } = fixture(),
      saved = structuredClone(s);
    s.powerEffects.slots[2].nativePrior![30] = null;
    const before = structuredClone(s);
    expect(() => stepZones(s, c)).toThrow("prior byte 30");
    expect(s).toEqual(before);
    const badCount = structuredClone(saved);
    put(badCount.missionPrefix, 0x3550, 2);
    expect(() => stepZones(badCount, c)).toThrow("count differs");
    expect(() =>
      stepZones(saved, {
        ...c,
        profile: () => ({ holds: [0], flags: 0, first: 0, last: 0 }),
      }),
    ).toThrow("six-frame");
    const created = stepZones(saved, c).state,
      broken = structuredClone(created);
    delete c.cleanup;
    const slot = broken.effects[0].slot;
    broken.powerEffects.slots[slot].nativePrior![27] = 5;
    broken.powerEffects.slots[slot].nativePrior![30] = 1;
    expect(() => stepZoneEffect(broken, slot, c)).toThrow("reference cleanup");
  });

  it("roundtrips full shared state through JSON with identical next RNG and receipts", () => {
    const { s, c } = fixture(),
      first = stepZones(s, c).state;
    expect(stepZoneEffect(first, 0, c)).toEqual(
      stepZoneEffect(JSON.parse(JSON.stringify(first)), 0, c),
    );
  });

  it("uses the first strictly highest unflagged priority and failed-factory RNG on a full pool", () => {
    const { s, c } = fixture();
    for (const [slot, item] of s.powerEffects.slots.entries()) {
      const n = item.nativePrior!;
      item.occupied = true;
      n[6] = 5;
      n[21] = slot === 2 ? 0x21 : 0x20;
      n[69] = slot === 1 || slot === 2 ? 47 : 6;
      put(n, 15, slot);
      put(n, 7, 1024);
      put(n, 9, 1024);
      insertSpatial(
        s.spatial,
        s.terrain,
        `source:4:${slot}`,
        worldCell(1024, 1024),
      );
    }
    put(s.missionPrefix, 0x3554, 200);
    const r = stepZones(s, c),
      created = r.events.flatMap((e) =>
        e.type === "effect-created" ? [e.slot] : [],
      );
    expect(created).toEqual([1, 0, 3]);
    expect(r.events.filter((e) => e.type === "effect-factory-failed")).toEqual([
      { type: "effect-factory-failed", code: 47 },
    ]);
    expect(w(r.state.missionPrefix, 0x3554)).toBe(200);
    const expected = { ...s.rng };
    for (let i = 0; i < 14; i++) nextRandom(expected);
    expect(r.state.rng).toEqual(expected);
    const saved = structuredClone(s);
    expect(() => stepZones(s, { ...c, cleanup: undefined })).toThrow(
      "reference cleanup",
    );
    expect(s).toEqual(saved);
  });
});
