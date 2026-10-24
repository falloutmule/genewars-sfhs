import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  campaignBlastAreaContext,
  type CampaignBlastServices,
} from "../src/sim/campaign/blast-adapter";
import { campaignEntity } from "../src/sim/campaign/entity-view";
import { put16, put32, i16, u16 } from "../src/sim/campaign/bytes";
import {
  insertSpatial,
  unlinkSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { runBlastArea } from "../src/sim/mechanics/destruction-effect";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { createLanding } from "../src/sim/mechanics/landing";
import { animationState } from "../src/sim/mechanics/animation";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { makePlantFireEffect } from "../src/sim/mechanics/plant-fire";
import type {
  RuntimeSourceEntity,
  SourceEntityId,
} from "../src/sim/campaign/source-pools";

const position: [number, number] = [8192, 8192];
function native(kind: number, index: number, length: number) {
  const n: (number | null)[] = Array(length).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  n[24] = 4;
  put16(n as number[], 15, index);
  put16(n as number[], 7, position[0]);
  put16(n as number[], 9, position[1]);
  put32(n as number[], 17, 2048);
  put32(n as number[], 39, 2048);
  return n;
}
function fixture() {
  const pack = campaignFixture(),
    w = createCampaign(pack, "synthetic-blast");
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: 1,
      childCode: null,
      movable: code === 6,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 13 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 50 }, () => ({
      first: 0,
      last: 12,
      rawTrailingWord: 13,
    })),
  };
  const calls: {
    kind: number;
    index: number;
    amount: number;
    attacker: SourceEntityId | null;
  }[] = [];
  const options: EffectSchedulerOptions<CampaignWorld> = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: cleanupCampaignReferences,
  };
  const services: CampaignBlastServices = {
    damageSpecialist(world, index, amount, attacker) {
      expect(world).toBe(w);
      calls.push({ kind: 3, index, amount, attacker });
    },
    damageBuilding(world, index, amount, attacker) {
      expect(world).toBe(w);
      calls.push({ kind: 4, index, amount, attacker });
    },
    effectOptions: (world) => {
      expect(world).toBe(w);
      return options;
    },
  };
  return {
    pack,
    w,
    options,
    services,
    calls,
    context: () => campaignBlastAreaContext(w, pack, services),
  };
}
function building(w: CampaignWorld, index = 0) {
  const n = native(4, index, 67);
  put16(n as number[], 43, 100);
  w.buildingNative[index] = n;
  insertSpatial(
    w.spatial,
    w.terrain,
    `source:3:${index}`,
    worldCell(...position),
  );
  return n;
}
function plant(f: ReturnType<typeof fixture>, index = 8, owner = 4) {
  const p = f.w.ecology.plants[index],
    n = p.native;
  n[6] = 2;
  n[24] = owner;
  n[43] = 0;
  n[21] = 0;
  n[25] = 2;
  n[46] = 0;
  n[48] = 0;
  put16(n as number[], 15, index);
  put16(n as number[], 7, position[0]);
  put16(n as number[], 9, position[1]);
  put16(n as number[], 44, 10);
  put32(n as number[], 17, groundHeight(f.w.terrain, ...position));
  Object.assign(p, {
    active: true,
    owner,
    position: [...position],
    selector: 0,
    growth: 10,
    flags: 0,
    plantFlags: 0,
    retirement: 0,
    animation: 2,
  });
  f.w.ecology.plantCount++;
  put16(f.w.missionPrefix, 0x3552, f.w.ecology.plantCount);
  if (owner < 4) {
    f.w.ecology.ownerPlantCounts[owner]++;
    put16(f.w.players[owner].raw, 0x5fa, f.w.ecology.ownerPlantCounts[owner]);
  }
  insertSpatial(f.w.spatial, f.w.terrain, p.id, worldCell(...position));
  return p;
}

describe("current campaign blast adapter", () => {
  it("uses actual head order and retained next-after-retirement instead of registry overlays", () => {
    const f = fixture(),
      b0 = building(f.w, 0),
      b1 = building(f.w, 1),
      c = f.context();
    expect(c.head(position)).toBe("source:3:1");
    expect(c.resolve("source:3:1").native).toBe(b1);
    f.services.damageBuilding = (w, index) => {
      expect(index).toBe(1);
      unlinkSpatial(w.spatial, w.terrain, "source:3:1");
      b1[6] = 0;
    };
    c.damage("source:3:1", 20, null);
    expect(c.head(position)).toBe("source:3:0");
    expect(c.next("source:3:1")).toBe("source:3:0");
    expect(c.resolve("source:3:0").native).toBe(b0);
    expect(c.next("source:3:0")).toBeNull();
    expect(() => c.resolve("source:3:1")).toThrow("inactive");
    validateSpatial(f.w.spatial);
  });
  it("reads a surviving target's newly changed next link after recursive removal", () => {
    const f = fixture();
    building(f.w, 0);
    const middle = building(f.w, 1);
    building(f.w, 2);
    const c = f.context();
    expect(c.next("source:3:2")).toBe("source:3:1");
    f.services.damageBuilding = (w) => {
      unlinkSpatial(w.spatial, w.terrain, "source:3:1");
      middle[6] = 0;
    };
    c.damage("source:3:2", 24, "source:4:0");
    expect(c.next("source:3:2")).toBe("source:3:0");
  });
  it("exposes the current RNG object and writes countdown source word and normalized mirror together", () => {
    const f = fixture(),
      c = f.context();
    put16(f.w.missionPrefix, 0x355c, 65535);
    expect(c.readCountdown()).toBe(65535);
    c.writeCountdown(601);
    expect(u16(f.w.missionPrefix, 0x355c)).toBe(601);
    expect(f.w.countdown).toBe(601);
    const old = c.currentRng!();
    f.w.rng = { ...old, seed: 987 };
    expect(c.currentRng!()).toBe(f.w.rng);
    expect(c.currentRng!()).not.toBe(old);
    expect(() => c.writeCountdown(-1)).toThrow("word");
    expect(() => c.writeCountdown(65536)).toThrow("word");
  });
  it("preserves repeated source sample visits and exact typed damage arguments in the real area core", () => {
    const f = fixture();
    building(f.w);
    f.pack.ecologyRules!.spreadDirections = Array.from({ length: 9 }, () => [
      0, 0,
    ]);
    const blast = native(5, 9, 81);
    blast[69] = 3;
    put16(f.w.missionPrefix, 0x355c, 1000);
    const before = { ...f.w.rng },
      result = runBlastArea(blast, 0, null, f.w.rng, f.context());
    expect(result.visits.map((v) => v.target)).toEqual(
      Array(9).fill("source:3:0"),
    );
    expect(f.calls).toEqual(
      Array.from({ length: 9 }, () => ({
        kind: 4,
        index: 0,
        amount: 32,
        attacker: "source:4:9",
      })),
    );
    expect([
      result.countdownBefore,
      result.countdownAfter,
      f.w.countdown,
    ]).toEqual([1000, 990, 990]);
    expect(f.w.rng).toEqual(before);
  });
  it("routes specialists/buildings to required services and rejects unported kind7 damage", () => {
    const f = fixture();
    building(f.w);
    const c = f.context();
    c.damage("source:2:0", 17, "source:3:0");
    c.damage("source:3:0", 19, null);
    expect(f.calls).toEqual([
      { kind: 3, index: 0, amount: 17, attacker: "source:3:0" },
      { kind: 4, index: 0, amount: 19, attacker: null },
    ]);
    const source: RuntimeSourceEntity = {
      id: "source:6:0",
      family: 6,
      index: 0,
      nativeBytes: native(7, 0, 97),
      position: [...position],
      cell: [32, 32],
      fractions: [0, 0],
      links: {
        previous: { kind: "map-cell", cell: worldCell(...position) },
        next: { kind: "none" },
      },
      source: { offset: 0, header: [], payload: [], packedBase64: "" },
      record: {
        index: 0,
        sourceOffset: 0,
        type: 7,
        position: [...position],
        destination: [0, 0],
        sourceId: 0,
        height: 2048,
        flags: 0,
        shade: 0,
        owner: 4,
        animation: 0,
        animationSubframe: 0,
        frame: 0,
        animationState: 0,
        animationDelay: 0,
        previousLink: { index: 0, kind: 0 },
        nextLink: { index: 0, kind: 0 },
      },
      initialization: {
        status: "source-copy",
        resource: null,
        bindingStatus: "unresolved",
        readyForCallbacks: false,
        gates: [],
      },
    };
    f.w.source.entities.push(source);
    f.w.collectors.records[0] = source.nativeBytes.slice();
    f.w.collectors.count = f.w.missionPrefix[0x3558] = 1;
    //6D390 follows the current retained header even after its active kind
    //clears, rather than consulting the obsolete registry copy.
    put16(f.w.collectors.records[0] as number[], 3, 12);
    f.w.collectors.records[0][5] = 2;
    f.w.collectors.records[0][6] = 0;
    expect(c.next("source:6:0")).toBe("source:1:12");
    f.w.collectors.records[0][6] = 7;
    expect(() => c.damage("source:6:0", 1, null)).toThrow(
      "kind7 damage service",
    );
  });
  it("uses the real Mule damage path including immediate blood allocation", () => {
    const f = fixture();
    f.pack.ecologyRules!.muleCombat = {
      queryRadius: 512,
      attack: 20,
      defense: 2,
      disposition: 50,
      foodWeights: [10, 20, 30],
      attackChannel: 41,
    };
    f.pack.assets.EFF.animations![32] = {
      first: 0,
      last: 9,
      rawTrailingWord: 10,
    };
    const created = initializeMuleNative(
      f.w.creatureNative[0],
      f.w.rng,
      { slot: 0, owner: 4, position, quality: 50 },
      { terrain: f.w.terrain, tables: f.pack.rules!.tables },
    );
    if (!created.ok) throw Error(created.reason);
    const n = created.value.native;
    f.w.rng = created.value.rng;
    n[94] = 8;
    put16(n as number[], 106, 100);
    f.w.ecology.mules.push({
      index: 0,
      id: "source:0:0",
      native: n,
      pending: [],
    });
    f.w.creatureNative[0] = n;
    insertSpatial(
      f.w.spatial,
      f.w.terrain,
      "source:0:0",
      worldCell(...position),
    );
    const actor = f.w.specialists.records[0];
    f.context().damage("source:0:0", 20, "source:2:0");
    expect(i16(n as number[], 106)).toBeLessThan(100);
    expect(f.w.powerEffects.slots[0].nativePrior![69]).toBe(32);
    expect(f.w.specialists.records[0]).toBe(actor);
    expect(f.w.ecology.mules[0].native).toBe(n);
    expect(f.w.creatureNative[0]).toBe(n);
  });
  it("copies only the six impulse words to specialist and construction mirrors", () => {
    const f = fixture(),
      n = f.w.specialists.records[0],
      actor = f.w.actors.find((a) => a.id === 0)!;
    const m = actor.motion,
      old = { ...m };
    [45, 47, 49, 57, 59, 61].forEach((at, i) =>
      put16(n as number[], at, [100, -200, 8192, 333, 444, 555][i]),
    );
    f.context().motionChanged!("source:2:0");
    expect(actor.motion).toBe(m);
    expect(m).toEqual({
      ...old,
      vx: 100,
      vy: -200,
      vz: 8192,
      yaw: 333,
      pitch: 444,
      speed: 555,
    });
    expect(f.w.builders.find((b) => b.id === 0)!.motion).toMatchObject({
      vx: 100,
      vy: -200,
      vz: 8192,
      yaw: 333,
      pitch: 444,
      speed: 555,
    });
  });
  it("keeps the source smoke particle mirror from overwriting a blast impulse", () => {
    const f = fixture(),
      n = native(5, 1, 81);
    n[69] = 6;
    [45, 47, 49].forEach((at, i) =>
      put16(n as number[], at, [11, -22, 9000][i]),
    );
    publishStagedSharedEffect(f.w, 1, n);
    const landing = createLanding(0, position, f.w.terrain, 9);
    landing.phase = 4;
    landing.particles.push({
      slot: 1,
      code: 6,
      x: 8192,
      y: 8192,
      fractionX: 0,
      fractionY: 0,
      ground: 2048,
      height: 2048,
      vx: 0,
      vy: 0,
      vz: 0,
      accelerationZ: 0,
      animation: animationState(6),
    });
    f.w.landings.push(landing);
    f.context().motionChanged!("source:4:1");
    const p = landing.particles[0];
    expect([p.vx, p.vy, p.vz]).toEqual([11, -22, 9000]);
    expect(p.native).toBe(f.w.powerEffects.slots[1].nativePrior);
  });
  it("applies living plant damage and first delayed retirement in place without RNG or unrelated array replacement", () => {
    const f = fixture(),
      p = plant(f),
      n = p.native,
      actors = f.w.specialists.records;
    const rng = { ...f.w.rng },
      c = f.context();
    c.plantDamage!(p.id, 3, "source:4:0");
    expect(p.growth).toBe(7);
    expect(i16(n as number[], 44)).toBe(7);
    f.pack.ecologyRules!.plants[0].retirementDelay = 8;
    c.plantDamage!(p.id, 10, "source:4:0");
    expect([
      p.active,
      p.growth,
      p.animation,
      p.plantFlags,
      p.retirement,
    ]).toEqual([true, 0, 8, 128, 4]);
    expect(n[21]).toBe(0);
    expect(p.native).toBe(n);
    expect(f.w.specialists.records).toBe(actors);
    expect(f.w.ecology.plantCount).toBe(1);
    expect(f.w.rng).toEqual(rng);
  });
  it("retires a plant with owner/cell/count/reference cleanup and retains the real next link", () => {
    const f = fixture(),
      b = building(f.w),
      p = plant(f, 8, 0),
      n = p.native,
      cell = worldCell(...position),
      rng = { ...f.w.rng };
    f.pack.ecologyRules!.plants[0].retirementDelay = 0;
    f.w.terrain.bytes[cell * 14 + 13] = 63;
    const actor = f.w.specialists.records[0];
    put16(actor as number[], 77, 8);
    actor[79] = 2;
    const c = f.context();
    c.plantDamage!(p.id, 12, "source:4:0");
    expect(p.active).toBe(false);
    expect(n[6]).toBe(0);
    expect(p.native).toBe(n);
    expect([
      f.w.ecology.plantCount,
      u16(f.w.missionPrefix, 0x3552),
      f.w.ecology.ownerPlantCounts[0],
      u16(f.w.players[0].raw, 0x5fa),
    ]).toEqual([0, 0, 0, 0]);
    expect(actor[79]).toBe(0);
    expect(i16(actor as number[], 77)).toBe(8);
    expect(f.w.terrain.bytes[cell * 14 + 13]).toBe(65);
    expect(c.next(p.id)).toBe("source:3:0");
    expect(c.resolve("source:3:0").native).toBe(b);
    expect(f.w.ecology.pending).toEqual([]);
    expect(f.w.rng).toEqual(rng);
    validateSpatial(f.w.spatial);
  });
  it("does not damage an already nonliving plant or fabricate unknown native bytes", () => {
    const f = fixture(),
      p = plant(f),
      c = f.context();
    put16(p.native as number[], 44, 0);
    p.growth = 0;
    c.resolve(p.id);
    const before = structuredClone(p);
    c.plantDamage!(p.id, 10, "source:4:0");
    expect(p).toEqual(before);
    p.native[44] = null;
    expect(() => c.plantDamage!(p.id, 10, "source:4:0")).toThrow("unknown");
  });
  it("runs the actual fire8 factory before exact ignition audio and consumes no RNG", () => {
    const f = fixture(),
      p = plant(f),
      n = p.native,
      rng = { ...f.w.rng };
    f.context().plantIgnite!(p.id);
    expect([p.growth, p.plantFlags, p.animation]).toEqual([0, 0x88, 5]);
    expect(f.w.powerEffects.slots[0].nativePrior![69]).toBe(8);
    expect(f.w.powerEffects.slots[0].nativePrior![21]! & 1).toBe(0);
    expect(f.w.audio.requests).toEqual([
      {
        sequence: 0,
        frame: f.w.frame,
        entity: p.id,
        cue: 15,
        mode: 2,
        parameter: 0,
        gain: 1,
        range: null,
        initialRatePercent: 100,
      },
    ]);
    expect(f.w.rng).toEqual(rng);
    expect(p.native).toBe(n);
    validateSpatial(f.w.spatial);
  });
  it("retains ignition and audio on real shared-capacity failure", () => {
    const f = fixture(),
      p = plant(f),
      profile = { holds: Array(13).fill(0), flags: 0, first: 0, last: 12 };
    for (let slot = 0; slot < 200; slot++) {
      const n = makePlantFireEffect(
        f.w.powerEffects.slots[slot].nativePrior!,
        { slot, position, height: groundHeight(f.w.terrain, ...position) },
        f.w.terrain,
        profile,
      );
      n[21]! |= 1;
      publishStagedSharedEffect(f.w, slot, n);
    }
    const before = JSON.stringify(f.w.powerEffects),
      rng = { ...f.w.rng };
    f.context().plantIgnite!(p.id);
    expect(JSON.stringify(f.w.powerEffects)).toBe(before);
    expect(p.growth).toBe(0);
    expect(f.w.audio.requests).toHaveLength(1);
    expect(f.w.rng).toEqual(rng);
  });
  it("can be used on a cloned full host with no writes reaching the original when a required service fails", () => {
    const f = fixture();
    building(f.w);
    const original = JSON.stringify(f.w),
      staged = structuredClone(f.w);
    const c = campaignBlastAreaContext(staged, f.pack, {
      ...f.services,
      damageBuilding(w) {
        w.countdown = 77;
        throw Error("source service unavailable");
      },
    });
    expect(() => c.damage("source:3:0", 12, null)).toThrow(
      "source service unavailable",
    );
    expect(JSON.stringify(f.w)).toBe(original);
    expect(campaignEntity(staged, "source:3:0")?.kind).toBe(4);
  });
});
