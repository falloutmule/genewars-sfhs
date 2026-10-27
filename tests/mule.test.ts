import {speciesFixture} from "./fixtures/creature-species";
import {creatureCombatTraits,creatureColdResponse} from "../src/sim/mechanics/creature-species";
import { describe, expect, it } from "vitest";
import {
  stepNeutralMule,
  muleStraightRay,
  applyNeutralMuleSelfWaterDamage,
  muleWaypoint,
  type MuleContext,
} from "../src/sim/mechanics/mule";
import type {
  EcologyState,
  EcologyRules,
  EcologyMule,
  EcologyPlant,
} from "../src/sim/mechanics/ecology";
import { terrainFromBytes } from "../src/sim/mechanics/terrain";
const put = (n: (number | null)[], at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
};
const put32 = (n: (number | null)[], at: number, v: number) => {
  put(n, at, v);
  put(n, at + 2, v >> 16);
};
const word = (n: (number | null)[], at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
function fixture(slot = 0) {
  const rules: EcologyRules = {
    schemaVersion: 1,
    plants: Array.from({ length: 12 }, (_, selector) => ({
      selector,
      growthDeltas: Array(8).fill(1),
      spreadPeriod: 2,
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
  const native: (number | null)[] = Array(124).fill(0);
  native.fill(null, 31, 39);
  native[6] = 1;
  native[24] = 4;
  native[0x5e] = 8;
  native[0x76] = 30;
  native[0x7b] = 255;
  native[0x7a] = 4;
  put(native, 15, slot);
  put(native, 7, 16384);
  put(native, 9, 15872);
  put(native, 21, 0x280);
  put(native, 0x2b, 50);
  put(native, 0x3b, 512);
  put32(native, 0x11, 2048);
  put32(native, 0x27, 2048);
  put(native, 0x66, 9085);
  put(native, 0x62, 88);
  put(native, 0x64, 42);
  put(native, 0x68, 44);
  put(native, 0x6a, 39);
  const mule: EcologyMule = {
    id: `source:0:${slot}`,
    index: slot,
    native,
    pending: [],
  };
  const state: EcologyState = {
    schemaVersion: 1,
    sourceSha256: "fixture",
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
  const terrain = terrainFromBytes(Array(229376).fill(0));
  for (let cell = 0; cell < 16384; cell++) {
    put(terrain.bytes, cell * 14 + 2, 1024);
    terrain.bytes[cell * 14 + 5] = 2;
  }
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
  const context: MuleContext = {
    terrain,
    tables,
    rules,
    frame: 0,
    gravity: 1024,
    water: 0,
    climate: 106,
    bounce: Array(8).fill(0),
    profile: (action) => ({
      holds: Array(action === 17 ? 3 : action === 19 ? 4 : 1).fill(0),
      flags: 0,
      first: 0,
      last: action === 17 ? 2 : action === 19 ? 3 : 0,
    }),
    obstacleAt: () => false,
  };
  return { state, context, rng: { seed: 5428, draws: 16855, ring: null } };
}
describe("source-backed neutral Mule lifecycle", () => {
  it("chooses a source target, moves through original grounded physics, and keeps pointers opaque", () => {
    const f = fixture();
    for (let frame = 0; frame < 60; frame++) {
      f.context.frame = frame;
      const result = stepNeutralMule(f.state, 0, f.rng, f.context);
      expect(result.reason, `frame ${frame}`).toBeNull();
    }
    expect([
      word(f.state.mules[0].native, 7),
      word(f.state.mules[0].native, 9),
    ]).not.toEqual([16384, 15872]);
    expect(f.state.mules[0].native.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(f.rng.draws).toBeGreaterThan(16855);
  });
  it("uses stable source slot and frame-plus-ID odd phasing", () => {
    const even = fixture(0),
      odd = fixture(1);
    put(even.state.mules[0].native, 0x6c, 10);
    put(odd.state.mules[0].native, 0x6c, 10);
    expect(
      stepNeutralMule(even.state, 0, even.rng, even.context).committed,
    ).toBe(true);
    expect(stepNeutralMule(odd.state, 1, odd.rng, odd.context).committed).toBe(
      true,
    );
    expect(word(even.state.mules[0].native, 0x66)).toBe(9085);
    expect(word(odd.state.mules[0].native, 0x66)).toBe(9083);
  });
  it("resolves a rejected target and retains the source's unusual initial-ray gate", () => {
    const f = fixture(),
      n = f.state.mules[0].native;
    put(n, 0x49, 0x14);
    put(n, 11, 17000);
    put(n, 13, 17000);
    f.context.obstacleAt = () => true;
    const result = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(result.reason).toBeNull();
    expect([
      word(f.state.mules[0].native, 11),
      word(f.state.mules[0].native, 13),
    ]).toEqual([16384, 15872]);
    expect(f.rng.draws).toBe(16855);
    expect(
      muleStraightRay([0, 0], [100, 100], f.context.tables, () => false),
    ).toBe(true);
  });
  it("walks both sides of a source obstacle without drawing RNG and wraps word coordinates", () => {
    const f = fixture(),
      accept = ([x, y]: [number, number]) =>
        !(x >= 384 && x <= 640 && y >= -128 && y <= 128);
    expect(muleStraightRay([0, 0], [1024, 0], f.context.tables, accept)).toBe(
      false,
    );
    const first = muleWaypoint(
      [0, 0],
      [320, 0],
      [1024, 0],
      false,
      120,
      f.context.tables,
      accept,
    );
    const second = muleWaypoint(
      [0, 0],
      [320, 0],
      [1024, 0],
      true,
      first.cost + 1,
      f.context.tables,
      accept,
    );
    expect(first).toEqual({ cost: 2, point: [448, 256] });
    expect(second).toEqual({ cost: 2, point: [448, -256] });
    const wrapped = muleWaypoint(
      [32700, 0],
      [32700, 0],
      [-32000, 0],
      false,
      120,
      f.context.tables,
      () => true,
    );
    expect(wrapped.cost).toBe(1);
    expect(wrapped.point![0]).toBeLessThan(0);
    expect(() =>
      muleWaypoint(
        [0, 0],
        [0, 0],
        [1, 1],
        false,
        0,
        f.context.tables,
        () => true,
      ),
    ).toThrow(/limit/);
  });
  it("rolls back an unsupported association before route mutations or RNG", () => {
    const f = fixture();
    f.state.mules[0].native[0x52] = 1;
    put(f.state.mules[0].native, 0x49, 0x14);
    const before = JSON.stringify({
      state: f.state,
      rng: f.rng,
      terrain: f.context.terrain,
    });
    const result = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(result.committed).toBe(false);
    expect(result.reason).toMatch(/association/);
    expect(
      JSON.stringify({
        state: f.state,
        rng: f.rng,
        terrain: f.context.terrain,
      }),
    ).toBe(before);
  });
  it("applies qualified neutral self-water defense without draws or a retaliatory action", () => {
    const f = fixture(),
      mule = f.state.mules[0];
    mule.native[0x60] = 0x88;
    put(mule.native, 0x6c, 200);
    expect(applyNeutralMuleSelfWaterDamage(mule)).toBe(2);
    expect(word(mule.native, 0x6a)).toBe(37);
    expect(word(mule.native, 0x6c)).toBe(0);
    expect(mule.native[0x60]).toBe(8);
    put(mule.native, 0x6a, 5);
    const before = structuredClone(mule);
    expect(() => applyNeutralMuleSelfWaterDamage(mule)).toThrow(/lethal/);
    expect(mule).toEqual(before);
  });
  it("feeds on a live plant at its timer cadence, changes both actors, and preserves two scan draws", () => {
    const f = fixture(),
      n = f.state.mules[0].native;
    f.context.frame = 1;
    n[0x5e] = 7;
    n[0x60] = 8;
    n[0x61] = 0x40;
    n[0x57] = 2;
    n[0x77] = 255;
    put(n, 0x55, 0);
    put(n, 0x6c, 16);
    put(n, 0x66, 2000);
    put(n, 0x68, 10);
    const plant: EcologyPlant = {
      id: "source:1:0",
      index: 0,
      active: true,
      owner: 4,
      position: [16384, 15872],
      selector: 0,
      growth: 7,
      flags: 4,
      plantFlags: 1,
      updateCounter: 0,
      retirement: 0,
      animation: 0,
      frame: 0,
      shade: 0,
      height: 2048,
      native: Array(49).fill(0),
    };
    f.state.plants.push(plant);
    f.state.plantCount = 1;
    f.state.plantOrder = { [62 * 128 + 64]: [0] };
    const result = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(result.reason).toBeNull();
    expect(result.events.some((event) => event.kind === "mule-fed")).toBe(true);
    expect(f.state.plants[0].growth).toBe(4);
    expect(word(f.state.mules[0].native, 0x68)).toBe(13);
    expect(word(f.state.mules[0].native, 0x6a)).toBe(41);
    expect(f.rng.draws).toBe(16857);
  });
  it("enters natural death, completes its source animation and retains a decaying corpse", () => {
    const f = fixture(),
      n = f.state.mules[0].native;
    f.context.frame = 1;
    put(n, 0x66, 1);
    const died = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(died.reason).toBeNull();
    expect(died.events[0].kind).toBe("mule-died");
    expect(f.state.mules[0].native[0x5e]).toBe(24);
    expect(word(f.state.mules[0].native, 0x3f)).toBe(-1);
    expect(word(f.state.mules[0].native, 0x66)).toBe(0);
    for (let frame = 2; frame < 10; frame++) {
      f.context.frame = frame;
      expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    }
    expect(f.state.mules[0].native[0x5e]).toBe(25);
    expect(word(f.state.mules[0].native, 0x68)).toBe(88);
  });
  it("refuses an absent BONES binding atomically rather than reusing the Mule animation", () => {
    const f = fixture(),
      n = f.state.mules[0].native;
    f.context.frame = 1;
    n[0x5e] = 25;
    n[0x19] = 18;
    put(n, 0x3f, -1);
    put(n, 0x66, 0);
    put(n, 0x68, 44);
    put(n, 0x6c, 0);
    const before = JSON.stringify(f.state),
      result = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(result.committed).toBe(false);
    expect(result.reason).toMatch(/BONES/);
    expect(JSON.stringify(f.state)).toBe(before);
  });
  it("binds BONES separately, decays both bone stages and retires once without RNG", () => {
    const f = fixture(),
      n = f.state.mules[0].native;
    f.context.frame = 1;
    n[0x5e] = 25;
    n[0x19] = 18;
    put(n, 0x3f, -1);
    put(n, 0x66, 0);
    put(n, 0x68, 44);
    put(n, 0x6c, 0);
    let bindings = 0;
    f.context.bonesProfile = (action) => {
      expect(action).toBe(4);
      bindings++;
      return { holds: [0, 0], flags: 0, first: 0, last: 1 };
    };
    expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    expect(f.state.mules[0].native[0x5e]).toBe(26);
    expect(word(f.state.mules[0].native, 0x68)).toBe(43);
    put(f.state.mules[0].native, 0x68, 23);
    put(f.state.mules[0].native, 0x6c, 0);
    f.context.frame = 3;
    expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    expect(f.state.mules[0].native[0x5e]).toBe(27);
    expect(f.state.mules[0].native[0x1b]).toBe(1);
    put(f.state.mules[0].native, 0x68, 1);
    put(f.state.mules[0].native, 0x6c, 0);
    f.context.frame = 5;
    const retired = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(retired.reason).toBeNull();
    expect(
      retired.events.filter((e) => e.kind === "mule-retired"),
    ).toHaveLength(1);
    expect(f.state.mules[0].native[6]).toBe(0);
    expect(stepNeutralMule(f.state, 0, f.rng, f.context).events).toEqual([]);
    expect(f.rng.draws).toBe(16855);
    expect(bindings).toBeGreaterThan(2);
  });
});

describe("neutral Crab callback family",()=>{
  function crab(){const f=fixture(),species=speciesFixture();f.context.rules.speciesTraits=species.rules.speciesTraits;f.context.rules.attackChannels=species.rules.attackChannels;f.context.speciesComponents=species.components;f.context.combat=creatureCombatTraits(f.context.rules,species.components,1);f.context.coldResponse=creatureColdResponse(species.components,1);f.state.mules[0].native[122]=1;return f;}
  it("runs both callback phases with actual Crab coefficients and opaque pointers",()=>{const f=crab();for(let frame=0;frame<30;frame++){f.context.frame=frame;const r=stepNeutralMule(f.state,0,f.rng,f.context);expect(r.reason,`frame${frame}`).toBeNull();}expect(f.state.mules[0].native.slice(31,39)).toEqual(Array(8).fill(null));expect(f.state.mules[0].native[122]).toBe(1);});
  it("rolls back state, terrain and RNG if non-Mule component evidence is absent",()=>{const f=crab();delete f.context.speciesComponents;const before=structuredClone({state:f.state,rng:f.rng,terrain:f.context.terrain});const r=stepNeutralMule(f.state,0,f.rng,f.context);expect(r.committed).toBe(false);expect(r.reason).toMatch(/component/);expect({state:f.state,rng:f.rng,terrain:f.context.terrain}).toEqual(before);});
  it("keeps distinct unsupported species abilities fail closed",()=>{const f=crab();f.state.mules[0].native[122]=2;const before=structuredClone({state:f.state,rng:f.rng});expect(stepNeutralMule(f.state,0,f.rng,f.context).committed).toBe(false);expect({state:f.state,rng:f.rng}).toEqual(before);});
  it.each([[1,800],[11,800],[4,750],[22,750]])("uses primary-component terrain contact for species%i", (species, speed) => {
    const f=crab(),n=f.state.mules[0].native;
    n[122]=species;
    f.context.combat=creatureCombatTraits(f.context.rules,f.context.speciesComponents,species);
    put(n,63,400);put(n,65,800);put(n,73,0x1000);put(n,108,1000);
    expect(stepNeutralMule(f.state,0,f.rng,f.context).reason).toBeNull();
    expect(word(f.state.mules[0].native,65)).toBe(speed);
  });
  it.each([3, 14, 19])("takes off and runs both Bird callback phases for species%i", species => {
    const f = crab(), n = f.state.mules[0].native;
    n[122] = species;
    f.context.combat = creatureCombatTraits(f.context.rules, f.context.speciesComponents, species);
    f.context.coldResponse = creatureColdResponse(f.context.speciesComponents, species);
    f.context.profile = () => ({ holds: Array(18).fill(0), flags: 0, first: 0, last: 17 });
    let flying = false, airborne = false;
    for (let frame = 0; frame < 100; frame++) {
      f.context.frame = frame;
      const r = stepNeutralMule(f.state, 0, f.rng, f.context);
      expect(r.reason, `species${species} frame${frame}`).toBeNull();
      const current = f.state.mules[0].native;
      flying ||= !!(word(current, 73) & 0x400);
      airborne ||= word(current, 39) > word(current, 17);
    }
    expect(flying).toBe(true);
    expect(airborne).toBe(true);
    expect(f.state.mules[0].native.slice(31, 39)).toEqual(Array(8).fill(null));
  });
});
