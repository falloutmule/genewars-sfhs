import { describe, expect, it } from "vitest";
import { flushEatenPlantRetirements } from "../src/sim/campaign/ecology-adapter";
import { createCampaign } from "../src/sim/campaign/world";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import { campaignFixture } from "./fixtures/campaign";
import {
  advancePlantCursor,
  stepPlants,
  damagePlant,
  plantBlockerWeight,
  sitePlantBlocked,
  ecologyTerrainClass,
  chooseNeutralMule,
  muleLifecycleTail,
  muleRequestedSpeed,
  type EcologyState,
  type EcologyRules,
  type EcologyPlant,
  type EcologyMule,
} from "../src/sim/mechanics/ecology";
import {
  terrainFromBytes,
  type TerrainState,
} from "../src/sim/mechanics/terrain";

function setWord(raw: (number | null)[], at: number, value: number) {
  raw[at] = value & 255;
  raw[at + 1] = (value >> 8) & 255;
}
const getWord = (raw: (number | null)[], at: number) =>
  ((raw[at]! | (raw[at + 1]! << 8)) << 16) >> 16;
function plant(index: number, active = false): EcologyPlant {
  return {
    id: `source:1:${index}`,
    index,
    active,
    owner: 4,
    position: [(20 + index) * 256 + 127, 20 * 256 + 127],
    selector: 0,
    growth: 4,
    flags: 4,
    plantFlags: 0,
    updateCounter: 0,
    retirement: 0,
    animation: 0,
    frame: 0,
    shade: 0,
    height: 2048,
    native: Array(49).fill(0),
  };
}
export function ecologyFixture(indices = [8, 16]) {
  const state: EcologyState = {
    schemaVersion: 1,
    sourceSha256: "fixture",
    ticks: 0,
    plantCursor: 0,
    plantCount: indices.length,
    ownerPlantCounts: [0, 0, 0, 0],
    plants: Array.from({ length: 512 }, (_, i) =>
      plant(i, indices.includes(i)),
    ),
    mules: [],
    otherEntities: [],
    pending: [],
    unsupported: [],
  };
  const terrain = terrainFromBytes(Array(229376).fill(0));
  for (let i = 0; i < 16384; i++) {
    setWord(terrain.bytes, i * 14 + 2, 1024);
    terrain.bytes[i * 14 + 5] = 2;
    terrain.bytes[i * 14 + 13] = 1;
  }
  const rules: EcologyRules = {
    schemaVersion: 1,
    plants: Array.from({ length: 12 }, (_, selector) => ({
      selector,
      growthDeltas: Array(8).fill(1),
      spreadPeriod: 2,
      walkSteps: 1,
      crowdingLimit: 255,
      checkThreshold: 250,
      nutrition: 3,
      retirementDelay: 3,
    })),
    spreadDirections: Array.from({ length: 9 }, () => [256, 0]),
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
  };
  return {
    state,
    terrain,
    rules,
    rng: { seed: 5428, draws: 16855, ring: null },
  };
}
function mule(): EcologyMule {
  const native: (number | null)[] = Array(124).fill(0);
  native[6] = 1;
  native[24] = 4;
  native[0x5e] = 8;
  native[0x7a] = 4;
  native[0x76] = 30;
  native[0x7b] = 255;
  setWord(native, 7, 16384);
  setWord(native, 9, 15872);
  setWord(native, 0x6a, 39);
  setWord(native, 0x66, 9690);
  return { id: "source:0:0", index: 0, native, pending: [] };
}
function syntheticTrig() {
  return {
    sine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
    ),
    cosine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
    ),
  };
}
describe("original ecology component contracts", () => {
  it("unlinks eaten plants before their first-free slot can be born again", () => {
    const f = ecologyFixture([8]),
      w = createCampaign(campaignFixture(), "fixture");
    w.ecology = f.state;
    w.terrain = f.terrain;
    const p = w.ecology.plants[8],
      eater = mule();
    eater.native[0x55] = 8;
    eater.native[0x57] = 2;
    w.ecology.mules.push(eater);
    insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
    expect(damagePlant(w.ecology, w.terrain, f.rules, 8, 5).committed).toBe(
      true,
    );
    expect(w.ecology.plants[8].active).toBe(false);
    expect(w.spatial.nodes[p.id]).toBeDefined();
    expect(flushEatenPlantRetirements(w)).toBe(1);
    expect(w.spatial.nodes[p.id]).toBeUndefined();
    expect(w.ecology.mules[0].native[0x55]).toBe(8);
    expect(w.ecology.mules[0].native[0x57]).toBe(0);
    expect(w.ecology.pending).toEqual([]);
    expect(() =>
      insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position)),
    ).not.toThrow();
    expect(flushEatenPlantRetirements(w)).toBe(0);
  });
  it("schedules two source plant callbacks and advances its unusual cursor wrap", () => {
    const f = ecologyFixture(),
      result = stepPlants(f.state, f.terrain, f.rng, f.rules, 0);
    expect(result.committed).toBe(true);
    expect(result.callbacks).toEqual([8, 16]);
    expect(f.state.plantCursor).toBe(24);
    expect(f.state.plants[8].growth).toBe(5);
    expect(f.state.plants[16].updateCounter).toBe(1);
    expect(advancePlantCursor(504)).toBe(512);
    expect(advancePlantCursor(512)).toBe(1);
    expect(advancePlantCursor(505)).toBe(2);
    expect(() => advancePlantCursor(513)).toThrow();
  });
  it("preserves old-counter gates, byte wrapping, suppressions and transactional failure", () => {
    const f = ecologyFixture();
    f.state.plants[8].updateCounter = 255;
    expect(stepPlants(f.state, f.terrain, f.rng, f.rules, 0).committed).toBe(
      true,
    );
    expect(f.state.plants[8].updateCounter).toBe(0);
    expect(f.state.plants[8].active).toBe(false);
    const g = ecologyFixture();
    g.state.plants[8].plantFlags = 0x10;
    expect(stepPlants(g.state, g.terrain, g.rng, g.rules, 0).committed).toBe(
      true,
    );
    expect(g.state.plants[8].growth).toBe(4);
    const h = ecologyFixture();
    h.rules.plants[0].spreadPeriod = 0;
    const before = JSON.stringify(h);
    const fail = stepPlants(h.state, h.terrain, h.rng, h.rules, 0);
    expect(fail.committed).toBe(false);
    expect(fail.reason).toMatch(/period-zero/);
    expect(JSON.stringify(h)).toBe(before);
  });
  it("kills crowded plants sequentially and preserves delayed retirement lifecycle", () => {
    const f = ecologyFixture();
    f.rules.plants[0].crowdingLimit = 0;
    f.rules.plants[0].retirementDelay = 7;
    stepPlants(f.state, f.terrain, f.rng, f.rules, 0);
    expect(f.state.plants[8].active).toBe(true);
    expect(f.state.plants[8].retirement).toBe(3);
    expect(f.state.plants[8].animation).toBe(6);
    f.state.plantCursor = 0;
    const result = stepPlants(f.state, f.terrain, f.rng, f.rules, 0);
    expect(f.state.plants[8].active).toBe(false);
    expect(f.state.plantCount).toBe(0);
    expect(
      result.events.filter((event) => event.kind === "plant-retired"),
    ).toHaveLength(2);
    expect(
      f.state.pending.some((event) => event.kind === "cleanup-required"),
    ).toBe(true);
  });
  it("reproduces through original RNG walk, jitter, population and suitability gates", () => {
    const f = ecologyFixture();
    f.rules.plants[0].spreadPeriod = 1;
    const result = stepPlants(f.state, f.terrain, f.rng, f.rules, 0);
    expect(result.committed).toBe(true);
    expect(f.state.plantCount).toBe(4);
    expect(f.rng.draws).toBe(16861);
    const born = result.events.filter((event) => event.kind === "plant-born");
    expect(born).toHaveLength(2);
    expect(f.state.plants[0].growth).toBe(4);
    expect(f.state.plants[0].flags & 1).toBe(0);
    const g = ecologyFixture();
    g.rules.plants[0].spreadPeriod = 1;
    g.rules.plants[0].growthDeltas[2] = -1;
    stepPlants(g.state, g.terrain, g.rng, g.rules, 0);
    expect(g.state.plantCount).toBe(2);
    expect(g.rng.draws).toBe(16857);
  });
  it("separates plant obstacle weight and construction any-plant checks", () => {
    const f = ecologyFixture([8]),
      p = f.state.plants[8],
      cell = (p.position[1] >> 8) * 128 + (p.position[0] >> 8);
    expect(plantBlockerWeight(f.state, cell)).toBe(10);
    p.plantFlags |= 8;
    expect(plantBlockerWeight(f.state, cell)).toBe(0);
    expect(sitePlantBlocked(f.state, cell)).toBe(true);
    expect(damagePlant(f.state, f.terrain, f.rules, 8, 4).committed).toBe(true);
    expect(p.active).toBe(true); // transaction replaces state; old references are snapshots
    expect(f.state.plants[8].active).toBe(false);
    expect(sitePlantBlocked(f.state, cell)).toBe(false);
  });
  it("uses rounded terrain class and original-floor neighbors for water fallback", () => {
    const t: TerrainState = terrainFromBytes(Array(229376).fill(0));
    t.bytes[(2 * 128 + 3) * 14 + 5] = 5;
    expect(ecologyTerrainClass(t, [2 * 256 + 128, 2 * 256])).toBe(5);
    t.bytes[(2 * 128 + 3) * 14 + 5] = 0;
    t.bytes[(1 * 128 + 1) * 14 + 5] = 7;
    expect(ecologyTerrainClass(t, [2 * 256 + 128, 2 * 256])).toBe(1);
  });
  it("performs source no-action Mule choice without changing caller or fabricating movement", () => {
    const f = ecologyFixture(),
      original = mule(),
      before = structuredClone(original);
    const out = chooseNeutralMule(
      original,
      f.rng,
      f.rules,
      syntheticTrig(),
      () => true,
    );
    expect(out.target).toEqual([17155, 17734]);
    expect(out.rng.seed).toBe(64612);
    expect(out.rng.draws).toBe(16860);
    expect(getWord(out.mule.native, 0x6c)).toBe(32767);
    expect(out.requiresOriginalMovement).toBe(true);
    expect(original).toEqual(before);
    expect(f.rng.seed).toBe(5428);
    expect(() =>
      chooseNeutralMule(original, f.rng, f.rules, syntheticTrig(), () => false),
    ).toThrow(/backward/);
    expect(original).toEqual(before);
  });
  it("parameterizes Mule speed and hunger while retaining stored maxima on low energy", () => {
    const f = ecologyFixture(),
      m = mule();
    expect(muleRequestedSpeed(m, f.rules)).toBe(577);
    muleLifecycleTail(m, f.rules);
    expect(getWord(m.native, 0x66)).toBe(9689);
    expect(m.native[0x77]).toBe(16);
    setWord(m.native, 0x66, 2000);
    setWord(m.native, 0x62, 88);
    setWord(m.native, 0x64, 42);
    muleLifecycleTail(m, f.rules);
    expect(m.native[0x77]).toBe(255);
    expect(getWord(m.native, 0x62)).toBe(88);
    expect(getWord(m.native, 0x64)).toBe(42);
  });
});
