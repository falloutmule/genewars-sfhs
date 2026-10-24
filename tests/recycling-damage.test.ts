import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  damageNativeBuilding,
  updateNativeBuildingCapacity,
  type BuildingDamageContext,
  type BuildingDamageWorld,
} from "../src/sim/mechanics/building-damage";
import {
  damageCampaignBuilding,
  type CampaignBuildingDamageServices,
} from "../src/sim/campaign/building-damage-adapter";
import { clearStagedCampaignBuildingProcessingFront } from "../src/sim/campaign/building-demolition-adapter";
import {
  createCampaignDestructionEffect,
  stepEffectScheduler,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { createNativeBuilding } from "../src/sim/mechanics/building-native";
import { planBotanistPlantCreation } from "../src/sim/mechanics/botanist";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { establishedEffectPriorities } from "../src/sim/mechanics/reward-effect";
import {
  campaignBlastTarget,
  synchronizeCampaignLinks,
} from "../src/sim/campaign/entity-view";
import {
  insertSpatial,
  unlinkSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  groundHeight,
  terrainFromBytes,
  worldCell,
} from "../src/sim/mechanics/terrain";
import { put16, put32, i16, u16, u32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  replayCampaign,
  sealCampaignReplay,
} from "../src/sim/campaign/persistence";
import { createShepherdProjectileNative } from "../src/sim/mechanics/shepherd-projectile";
import { animationProfile } from "../src/sim/mechanics/animation";
import { checksum } from "../src/sim/checksum";

function pure(grade = 0, complete = true) {
  const bytes = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    put16(bytes, i * 14 + 2, 1024);
    bytes[i * 14 + 11] = 0x71;
  }
  const w: BuildingDamageWorld = {
    terrain: terrainFromBytes(bytes),
    rng: { seed: 17, draws: 0, ring: null },
    buildingNative: Array.from({ length: 256 }, () =>
      Array.from({ length: 67 }, (_, i) => (i >= 31 && i < 39 ? null : 0)),
    ),
    players: Array.from({ length: 4 }, (_, id) => {
      const raw = Array(1805).fill(0);
      raw[0x4a1] = id;
      return { raw };
    }),
  };
  const n = w.buildingNative[0],
    raw = w.players[0].raw,
    trace: string[] = [];
  n[6] = 4;
  n[24] = 0;
  n[45] = 4;
  n[46] = grade;
  put16(n as number[], 7, 8192);
  put16(n as number[], 9, 8192);
  put16(n as number[], 15, 0);
  put16(n as number[], 43, 900);
  put16(n as number[], 49, complete ? 1 : 0);
  put32(n as number[], 54, 0x12345678);
  put32(raw, 0x4a7, 765);
  raw[0x4a2] = 1;
  raw[0x604] = Number(complete);
  put16(raw, 0x5fc, 1111);
  put16(raw, 0x5fe, 2222);
  const c: BuildingDamageContext = {
    rules: {
      buildingHealth: Array(42).fill(900),
      buildingFootprints: Array(14).fill(2),
      buildingNameIndices: Array(14).fill(7),
    },
    gameplayRunning: true,
    selectedBuildingSlot: 0,
    createEffect: (_s, r) => {
      trace.push(`effect:${r.code}`);
      return null;
    },
    createCollapse: () => {
      throw Error("Selector4 must not create collapse");
    },
    clearProcessingFront(s, slot) {
      trace.push("front");
      expect(s.buildingNative[slot][6]).toBe(4);
      expect(s.players[0].raw[0x604]).toBe(0);
      expect(s.terrain.bytes[worldCell(8192, 8192) * 14 + 11]).toBe(0x60);
      expect(u32(s.players[0].raw, 0x5e6)).toBe((grade + 1) * 400);
    },
    unlinkBuilding: () => {
      trace.push("unlink");
    },
    createCrater: (_s, r) => {
      trace.push(`crater:${r.variant}`);
      return null;
    },
    onEvent: (_s, e) => {
      trace.push(e.type);
    },
  };
  return { w, n, raw, trace, c };
}

describe("selector4 damage and44380 processing-front placement", () => {
  it.each([0, 1, 2])(
    "retains grade%d stored GOOP and pre-unlink capacity with the exact ordered retirement ports",
    (grade) => {
      const f = pure(grade),
        out = damageNativeBuilding(f.w, 0, 900, null, f.c);
      expect(out.destroyed).toBe(true);
      expect(f.trace.slice(0, 6)).toEqual([
        "effect:46",
        "destroyed-message",
        "front",
        "selection-cleared",
        "unlink",
        "crater:0",
      ]);
      expect(
        out.effects.filter((e) => e.code >= 27 && e.code <= 31),
      ).toHaveLength(6);
      expect(out.effects.at(-1)).toMatchObject({ code: 5, parameter: 0 });
      expect(out.events.some((e) => e.type === "stop-audio")).toBe(false);
      expect(out.capacityAfter).toBe((grade + 1) * 400);
      expect(u32(f.raw, 0x5e6)).toBe((grade + 1) * 400);
      expect(u32(f.raw, 0x4a7)).toBe(765);
      expect(u32(f.n as number[], 54)).toBe(0x12345678);
      expect(f.n[6]).toBe(0);
      expect(i16(f.n as number[], 43)).toBe(900);
      expect(f.raw[0x4a2]).toBe(0);
      expect([i16(f.raw, 0x5fc), i16(f.raw, 0x5fe)]).toEqual([1111, 2222]);
      expect(f.w.rng.draws).toBe(24);
    },
  );
  it("clears the incomplete front without decrementing completed counts, and passes code5 parameter1", () => {
    const f = pure(0, false),
      out = damageNativeBuilding(f.w, 0, 900, null, f.c);
    expect(f.raw[0x604]).toBe(0);
    expect(f.trace).toContain("front");
    expect(out.effects.at(-1)).toMatchObject({ code: 5, parameter: 1 });
  });
  it("keeps partial depletion separate from front cleanup and preserves the selector4 stored field", () => {
    const f = pure();
    put16(f.n as number[], 43, 305);
    f.c.clearProcessingFront = undefined;
    const out = damageNativeBuilding(f.w, 0, 10, null, f.c);
    expect(out.destroyed).toBe(false);
    expect(u16(f.n as number[], 49) & 0x140).toBe(0x140);
    expect(out.capacityAfter).toBe(0);
    expect(u32(f.n as number[], 54)).toBe(0x12345678);
    expect(u32(f.raw, 0x4a7)).toBe(765);
    expect(f.n[48]).toBe(11);
    expect(f.trace).not.toContain("front");
    expect(out.events).toContainEqual(
      expect.objectContaining({ type: "depleted-audio", ratePercent: 85 }),
    );
  });
  it("requires the real front service only on entered lethal4 and preserves an outer isolated transaction", () => {
    const f = pure(),
      before = JSON.stringify(f.w),
      staged = structuredClone(f.w);
    f.c.clearProcessingFront = undefined;
    expect(() => damageNativeBuilding(staged, 0, 900, null, f.c)).toThrow(
      /8B2A0/,
    );
    expect(JSON.stringify(f.w)).toBe(before);
  });
});

function host() {
  const pack = campaignFixture(),
    counts: Record<number, number> = {
      2: 10,
      3: 9,
      5: 14,
      27: 8,
      28: 7,
      29: 7,
      30: 4,
      31: 3,
      46: 5,
    };
  pack.rules!.tables.buildingHealth = Array(42).fill(900);
  pack.rules!.tables.buildingNameIndices = Array(14).fill(7);
  pack.rules!.tables.buildingFootprints[4] = 2;
  pack.buildingRules = {
    schemaVersion: 1,
    resources: [{ selector: 4, path: "SYNTHETIC.ANB", assetKey: "TEST" }],
    unsupportedSelectors: [],
    upkeep: Array(14).fill(0),
    processingFrontOffset: [-512, 0],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 14 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 71 }, (_, code) => ({
      first: 0,
      last: (counts[code] ?? 1) - 1,
      rawTrailingWord: counts[code] ?? 1,
    })),
  };
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      priority: establishedEffectPriorities[code] ?? 10,
      retirementMode: 0,
      gravity: false,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-recycling-damage");
  w.phase = "active";
  put16(w.missionPrefix, 0x355c, 1200);
  w.countdown = 1200;
  const made = createNativeBuilding(w.buildingNative[0], {
    slot: 0,
    owner: 0,
    selector: 4,
    position: [8192, 8192],
    ground: groundHeight(w.terrain, 8192, 8192),
    shade: 0,
  });
  if (!made.ok) throw Error(made.reason);
  const n = made.value,
    raw = w.players[0].raw;
  put16(n as number[], 43, 900);
  put16(n as number[], 49, 1);
  put32(n as number[], 54, 73);
  put16(n as number[], 61, 200);
  w.buildingNative[0] = n;
  const b = {
    id: 1000,
    slot: 0,
    owner: 0,
    selector: 4 as const,
    x: 8192,
    y: 8192,
    grade: 0 as const,
    health: 900,
    complete: true,
    energy: 200,
  };
  w.buildings.push(b);
  w.economy.buildings.push({
    ...b,
    disabled: false,
    capacitySuppressed: false,
    hqUpgradeSuppressed: false,
    powered: false,
    extraDrain: 0,
    depleted: false,
    storedGoop: 73,
    specialPowerDelivery: false,
  });
  raw[0x4a2] = raw[0x604] = w.players[0].completed[4] = 1;
  w.players[0].owned = 1 << 4;
  put16(raw, 0x60e, 1 << 4);
  put32(raw, 0x4a7, 73);
  w.players[0].goop = w.economy.players[0].goop = 73;
  updateNativeBuildingCapacity(w, 0);
  insertSpatial(w.spatial, w.terrain, "source:3:0", worldCell(8192, 8192));
  const point: [number, number] = [7680, 8192],
    plant = w.ecology.plants[0],
    creation = planBotanistPlantCreation(
      plant.native,
      0,
      4,
      0,
      point,
      w.terrain,
    );
  plant.native.splice(0, 49, ...creation.native);
  Object.assign(plant, {
    active: true,
    owner: 4,
    position: point,
    selector: 0,
    growth: 0,
    flags: 4,
    plantFlags: 4,
  });
  put16(plant.native as number[], 44, -1);
  plant.native[46] = 4;
  insertSpatial(w.spatial, w.terrain, plant.id, worldCell(...point));
  const animal = initializeMuleNative(
    w.creatureNative[0],
    w.rng,
    { slot: 0, owner: 4, position: point, quality: 50 },
    { terrain: w.terrain, tables: pack.rules!.tables },
  );
  if (!animal.ok) throw Error(animal.reason);
  const mule = animal.value.native;
  w.rng = animal.value.rng;
  mule[94] = 128;
  mule[96] = 0xa0;
  w.creatureNative[0] = mule;
  w.ecology.mules.push({
    index: 0,
    id: "source:0:0",
    native: mule,
    pending: [],
  });
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...point));
  synchronizeCampaignLinks(w);
  const damageReceipts: ReturnType<typeof damageCampaignBuilding>[] = [];
  const options = (
    s: CampaignWorld,
  ): EffectSchedulerOptions<CampaignWorld> => ({
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    // This test's complete transaction deliberately clones every host root.
    stageHost(original, staged) {
      Object.assign(staged, structuredClone(original));
      for (const m of staged.ecology.mules)
        staged.creatureNative[m.index] = m.native;
    },
    commitHost: (target, staged) => {
      Object.assign(target, staged);
    },
    blastArea: (current) => {
      const s = current;
      return {
        tables: pack.rules!.tables,
        directions: pack.ecologyRules!.spreadDirections,
        readCountdown: () => u16(s.missionPrefix, 0x355c),
        writeCountdown(value) {
          put16(s.missionPrefix, 0x355c, value);
          s.countdown = value;
        },
        head: (p) => s.spatial.heads[worldCell(...p)],
        resolve: (id) => campaignBlastTarget(s, pack, id),
        next: (id) => s.spatial.nodes[id]?.next ?? null,
        damage(id, amount, attacker) {
          if (!id.startsWith("source:3:"))
            throw Error("Unexpected live blast target");
          const receipt = damageCampaignBuilding(
            s,
            pack,
            Number(id.split(":")[2]),
            amount,
            attacker,
            services,
          );
          damageReceipts.push(receipt);
        },
      };
    },
  });
  const services: CampaignBuildingDamageServices = {
    effectOptions: options,
    selectedBuildingSlot: () => 0,
  };
  return { w, pack, n, raw, plant, mule, options, services, damageReceipts };
}

describe("selector4 real campaign damage services", () => {
  it("clears the real front in cell-head order, preserves source records and GOOP, and creates actual crater/debris/blast dependencies", () => {
    const f = host(),
      receipt = damageCampaignBuilding(f.w, f.pack, 0, 900, null, f.services);
    expect(receipt.clearedFrontReferences).toEqual(["source:0:0", f.plant.id]);
    expect(f.plant.native[46]).toBe(0);
    expect(f.plant.plantFlags).toBe(0);
    expect(f.mule[96]).toBe(0x80);
    expect(f.plant.native[6]).toBe(2);
    expect(f.mule[6]).toBe(1);
    expect(f.w.spatial.nodes[f.plant.id]).toBeDefined();
    expect(f.w.spatial.nodes["source:0:0"]).toBeDefined();
    expect(f.w.players[0].raw).toBe(f.raw);
    expect(f.w.buildingNative[0]).toBe(f.n);
    expect(f.w.creatureNative[0]).toBe(f.mule);
    expect(f.w.ecology.plants[0]).toBe(f.plant);
    expect(f.n[6]).toBe(0);
    expect(u32(f.n as number[], 54)).toBe(73);
    expect(f.w.players[0].goop).toBe(73);
    expect(f.w.economy.players[0].goop).toBe(73);
    expect(receipt.capacityAfter).toBe(400);
    expect(f.w.economy.players[0].capacity).toBe(400);
    expect(f.w.players[0].completed[4]).toBe(0);
    expect(receipt.collapseAllocation).toBeNull();
    expect(receipt.audioRequests).toEqual([]);
    expect(receipt.craterAllocation?.slot).toBe(0);
    expect(receipt.effectAllocations).toHaveLength(8);
    expect(receipt.effectAllocations.every((a) => a.slot !== null)).toBe(true);
    expect(receipt.effectAllocations.at(-1)?.request.code).toBe(5);
    validateSpatial(f.w.spatial);
  });
  it("rolls back the complete outer real blast factory after front cleanup reaches a late missing debris animation", () => {
    const f = host();
    put16(f.n as number[], 43, 1);
    f.w.buildings[0].health = 1;
    // Every random fragment code is malformed, so this fails only after46,
    // front cleanup, unlink/counts and the actual crater constructor.
    for (let code = 27; code <= 31; code++)
      f.pack.assets.EFF.animations![code] = {
        first: 0,
        last: 0,
        rawTrailingWord: 1,
      };
    const lateStages: boolean[] = [];
    f.services.effectOptions = (s) => {
      if (s.buildingNative[0][6] === 0)
        lateStages.push(
          s.ecology.plants[0].native[46] === 0 &&
            s.creatureNative[0][96] === 0x80 &&
            s.players[0].raw[0x604] === 0 &&
            s.missionPrefix[0x2ff7] === 1,
        );
      return f.options(s);
    };
    const before = JSON.stringify(f.w),
      rng = f.w.rng,
      native = f.w.buildingNative,
      players = f.w.players,
      spatial = f.w.spatial;
    expect(() =>
      createCampaignDestructionEffect(
        f.w,
        {
          code: 3,
          owner: 4,
          position: [8192, 8192],
          height: groundHeight(f.w.terrain, 8192, 8192),
          angles: [0, 0, 0],
          parameter: 0,
          delay: 0,
        },
        f.pack,
        f.options(f.w),
      ),
    ).toThrow("Original destruction EFF animation profile required");
    expect(lateStages).toEqual([true]);
    expect(JSON.stringify(f.w)).toBe(before);
    expect(f.w.rng).toBe(rng);
    expect(f.w.buildingNative).toBe(native);
    expect(f.w.players).toBe(players);
    expect(f.w.spatial).toBe(spatial);
    expect(f.w.buildingNative[0]).toBe(f.n);
    expect(f.w.players[0].raw).toBe(f.raw);
    expect(f.plant.native[46]).toBe(4);
    expect(f.mule[96]).toBe(0xa0);
  });
  it("clears only the reservation bit in both JSON-separated Mule records without replacing either held image", () => {
    const f = host(),
      w = JSON.parse(JSON.stringify(f.w)) as CampaignWorld,
      canonical = w.creatureNative[0],
      ecology = w.ecology.mules[0].native,
      before = canonical.slice();
    expect(canonical).not.toBe(ecology);
    clearStagedCampaignBuildingProcessingFront(w, 0, f.pack);
    expect(w.creatureNative[0]).toBe(canonical);
    expect(w.ecology.mules[0].native).toBe(ecology);
    expect(canonical).toEqual(ecology);
    expect(canonical.flatMap((v, i) => (v === before[i] ? [] : [i]))).toEqual([
      96,
    ]);
    expect(canonical[96]).toBe(0x80);
  });
  it("rejects unequal current Mule images before hiding a pending command or clearing its reservation", () => {
    const f = host(),
      w = JSON.parse(JSON.stringify(f.w)) as CampaignWorld;
    put16(w.creatureNative[0] as number[], 110, 123);
    const before = JSON.stringify(w);
    expect(() =>
      clearStagedCampaignBuildingProcessingFront(w, 0, f.pack),
    ).toThrow(/native images differ/);
    expect(JSON.stringify(w)).toBe(before);
  });
  it("continues the actual effect scheduler identically after save/load and replays the same complete damage operation", () => {
    const f = host(),
      saved = saveCampaign(f.w, { paused: true, speed: 2, accumulator: 0 }),
      first = checksum(f.w);
    const loaded = loadCampaign(saved, "synthetic-recycling-damage").world;
    expect(checksum(loaded)).toBe(first);
    const a = damageCampaignBuilding(f.w, f.pack, 0, 900, null, f.services),
      b = damageCampaignBuilding(loaded, f.pack, 0, 900, null, f.services);
    expect(a).toEqual(b);
    expect(checksum(loaded)).toBe(checksum(f.w));
    for (let i = 0; i < 4; i++) {
      f.w.frame++;
      loaded.frame++;
      stepEffectScheduler(f.w, f.pack, f.options(f.w));
      stepEffectScheduler(loaded, f.pack, f.options(loaded));
    }
    expect(checksum(loaded)).toBe(checksum(f.w));
    validateSpatial(loaded.spatial);
  });
  it("records and replays the normal campaign callback that destroys4 through a seeded real37 projectile and inline blast0", () => {
    const f = host(),
      { w, pack } = f;
    //An explicitly synthetic incoming projectile tests the complete campaign
    //scheduler; ordinary targeting/UI is covered separately. Keep this fixture
    //free of unrelated live creature/plant callbacks.
    unlinkSpatial(w.spatial, w.terrain, "source:0:0");
    unlinkSpatial(w.spatial, w.terrain, f.plant.id);
    w.ecology.mules = [];
    w.creatureNative[0][6] = 0;
    f.plant.active = false;
    f.plant.native[6] = 0;
    f.n[49] = 1;
    put16(f.n as number[], 43, 1);
    w.buildings[0].health = 1;
    Object.assign(pack.effectRules!.descriptors[37], {
      priority: 9,
      retirementMode: 4,
      movable: true,
      waterResponse: true,
      childCode: 0,
    });
    pack.assets.EFF.animations![0] = { first: 0, last: 9, rawTrailingWord: 10 };
    const made = createShepherdProjectileNative(
      w.powerEffects.slots[0].nativePrior!,
      0,
      {
        code: 37,
        owner: 4,
        position: [8192, 8192],
        height: groundHeight(w.terrain, 8192, 8192),
        angles: [0, 0, 0],
        parameter: 32,
        delay: 0,
        parent: { kind: 4, index: 0 },
      },
      {
        terrain: w.terrain,
        tables: pack.rules!.tables,
        profile: animationProfile(pack.assets.EFF, 37),
        descriptor: {
          code: 37,
          completion: 4,
          gravity: false,
          priority: 9,
          childCode: 0,
          obstacle: true,
          water: true,
        },
      },
    );
    publishStagedSharedEffect(w, 0, made.native);
    put16(w.missionPrefix, 0x3554, 1);
    synchronizeCampaignLinks(w);
    const record = recordCampaign(w, null);
    stepCampaign(w, pack);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(w.buildingNative[0][6]).toBe(0);
    expect(w.players[0].completed[4]).toBe(0);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
      w.contentHash,
    ).world;
    for (let tick = 0; tick < 3; tick++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
    }
    expect(checksum(loaded)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(record, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
});
