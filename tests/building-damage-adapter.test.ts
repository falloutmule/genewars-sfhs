import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  damageCampaignBuilding,
  type CampaignBuildingDamageServices,
} from "../src/sim/campaign/building-damage-adapter";
import { createNativeBuilding } from "../src/sim/mechanics/building-native";
import { updateNativeBuildingCapacity } from "../src/sim/mechanics/building-damage";
import {
  campaignBlastTarget,
  synchronizeCampaignLinks,
} from "../src/sim/campaign/entity-view";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { put16, put32, i16, u16, u32 } from "../src/sim/campaign/bytes";
import { launchPowerPackets } from "../src/sim/mechanics/power-motion";
import {
  cancelConstruction,
  type ConstructionState,
  type ConstructionContext,
  type ConstructionRules,
} from "../src/sim/mechanics/construction";
import { establishedEffectPriorities } from "../src/sim/mechanics/reward-effect";
import { animationProfile } from "../src/sim/mechanics/animation";
import { makeDestructionEffect } from "../src/sim/mechanics/destruction-effect";
import { createCollapse } from "../src/sim/mechanics/collapse";
import { publishStagedSharedEffect } from "../src/sim/campaign/effect-scheduler";
import type { SourceEntityId } from "../src/sim/campaign/source-pools";
function fixture() {
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
  pack.rules!.tables.buildingNameIndices = Array.from(
    { length: 14 },
    (_, i) => i * 3,
  );
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 14 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 47 }, (_, code) => ({
      first: 0,
      last: (counts[code] ?? 1) - 1,
      rawTrailingWord: counts[code] ?? 1,
    })),
  };
  // Synthetic descriptor profile isolates recursive building damage from
  // movable-target impulses, tested independently against actual source.
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
  const world = createCampaign(pack, "synthetic-building-damage-host");
  world.phase = "active";
  put16(world.missionPrefix, 0x355c, 1200);
  world.countdown = 1200;
  const allocations: number[] = [];
  const services: CampaignBuildingDamageServices = {
    selectedBuildingSlot: () => null,
    effectOptions(w) {
      return {
        gravity: 512,
        obstacleAt: () => false,
        cleanupReferences: cleanupCampaignReferences,
        blastArea() {
          return {
            tables: pack.rules!.tables,
            directions: pack.ecologyRules!.spreadDirections,
            readCountdown: () => u16(w.missionPrefix, 0x355c),
            writeCountdown(value) {
              put16(w.missionPrefix, 0x355c, value);
              w.countdown = value;
            },
            head: (point) => w.spatial.heads[worldCell(...point)],
            resolve: (identity) => campaignBlastTarget(w, pack, identity),
            next(identity) {
              const [, family, index] = identity.split(":").map(Number),
                n =
                  family === 3
                    ? w.buildingNative[index]
                    : family === 4
                      ? w.powerEffects.slots[index].nativePrior!
                      : null;
              if (!n) throw Error("Unexpected synthetic blast family");
              return n[5]
                ? (`source:${n[5]! - 1}:${u16(n as number[], 3)}` as SourceEntityId)
                : null;
            },
            damage(identity, amount, attacker) {
              if (!identity.startsWith("source:3:"))
                throw Error("Unexpected synthetic damage family");
              const slot = Number(identity.split(":")[2]);
              allocations.push(slot);
              damageCampaignBuilding(w, pack, slot, amount, attacker, services);
            },
          };
        },
      };
    },
  };
  const add = (
    slot: number,
    selector: 0 | 1 | 3 | 6 | 11 = 11,
    health = 900,
    point: [number, number] = [8192, 8192],
    complete = true,
  ) => {
    const owner = Math.floor(slot / 64),
      prior = world.buildingNative[slot],
      r = createNativeBuilding(prior, {
        slot,
        owner,
        selector,
        position: point,
        ground: groundHeight(world.terrain, ...point),
        shade: 0,
      });
    if (!r.ok) throw Error(r.reason);
    const native = r.value;
    put16(native as number[], 43, health);
    put16(native as number[], 49, complete ? 1 : 0);
    put16(native as number[], 61, 200);
    world.buildingNative[slot] = native;
    const b = {
      id: 1000 + slot,
      slot,
      owner,
      selector,
      x: point[0],
      y: point[1],
      grade: 0 as const,
      health,
      complete,
      energy: 200,
    };
    world.buildings.push(b);
    world.economy.buildings.push({
      ...b,
      slot: slot % 64,
      disabled: false,
      capacitySuppressed: false,
      hqUpgradeSuppressed: false,
      powered: false,
      extraDrain: native[63]!,
      depleted: false,
      storedGoop: 0,
      specialPowerDelivery: false,
    });
    const raw = world.players[owner].raw;
    raw[0x4a2]++;
    if (complete) {
      raw[0x600 + selector]++;
      world.players[owner].completed[selector]++;
    }
    world.players[owner].owned |= 1 << selector;
    put16(raw, 0x60e, world.players[owner].owned);
    updateNativeBuildingCapacity(world, owner);
    insertSpatial(
      world.spatial,
      world.terrain,
      `source:3:${slot}`,
      worldCell(...point),
    );
    synchronizeCampaignLinks(world);
    return b;
  };
  return { world, pack, services, add, allocations };
}

describe("isolated campaign building damage adapter", () => {
  it("mirrors partial native damage/depletion, queue reset, funds and audio without replacing source records", () => {
    const f = fixture(),
      b = f.add(0, 0, 310),
      n = f.world.buildingNative[0],
      players = f.world.players,
      raw = players[0].raw,
      pool = f.world.buildingNative;
    put32(n as number[], 54, 12345);
    put32(raw, 0x4a3, 999);
    put32(raw, 0x4a7, 17);
    f.world.rng.seed = 0;
    const beforeDraws = f.world.rng.draws,
      receipt = damageCampaignBuilding(
        f.world,
        f.pack,
        0,
        20,
        null,
        f.services,
      ),
      e = f.world.economy.buildings.find((v) => v.id === b.id)!;
    expect(receipt.destroyed).toBe(false);
    expect(b.health).toBe(290);
    expect(i16(n as number[], 43)).toBe(290);
    expect(u32(n as number[], 54)).toBe(0);
    expect(n[48]).toBe(11);
    expect([
      e.disabled,
      e.depleted,
      e.capacitySuppressed,
      e.hqUpgradeSuppressed,
    ]).toEqual([true, true, true, true]);
    expect(f.world.players[0].funds).toBe(999);
    expect(f.world.players[0].goop).toBe(17);
    expect(f.world.economy.players[0].goop).toBe(17);
    expect(receipt.audioRequests[0]).toMatchObject({
      entity: "source:3:0",
      cue: 78,
      mode: 2,
      initialRatePercent: 100,
    });
    expect(f.world.rng.draws - beforeDraws).toBe(6);
    expect(f.world.players).toBe(players);
    expect(f.world.players[0].raw).toBe(raw);
    expect(f.world.buildingNative).toBe(pool);
    expect(f.world.buildingNative[0]).toBe(n);
  });
  it("removes the live target and production bindings while retaining pre-unlink capacity and inactive native afterimage", () => {
    const f = fixture(),
      b = f.add(0, 11),
      n = f.world.buildingNative[0],
      raw = f.world.players[0].raw;
    f.world.rng.seed = 0;
    const mean = [u16(raw, 0x5fc), u16(raw, 0x5fe)],
      receipt = damageCampaignBuilding(
        f.world,
        f.pack,
        0,
        900,
        null,
        f.services,
      );
    expect(receipt.removedBuildingId).toBe(b.id);
    expect(f.world.buildings).toEqual([]);
    expect(f.world.economy.buildings).toEqual([]);
    expect(n[6]).toBe(0);
    expect(i16(n as number[], 43)).toBe(900);
    expect(raw[0x4a2]).toBe(0);
    expect(f.world.players[0].completed[11]).toBe(0);
    expect(f.world.players[0].owned & (1 << 11)).not.toBe(0);
    expect([u16(raw, 0x5fc), u16(raw, 0x5fe)]).toEqual(mean);
    expect(receipt.capacityAfter).toBe(600);
    expect(f.world.economy.players[0].capacity).toBe(600);
    expect(receipt.audioRequests[0]).toMatchObject({ cue: 47, mode: 4 });
    expect(receipt.effectAllocations.map((e) => e.request.code)).toEqual([
      46, 27, 27, 27, 5,
    ]);
    expect(f.world.countdown).toBe(1190);
    validateSpatial(f.world.spatial);
  });
  it("creates real collapse and native crater jobs before debris, preserving all native/player/RNG aliases", () => {
    const f = fixture();
    f.add(0, 1);
    f.pack.rules!.tables.buildingFootprints[1] = 2;
    const roots = {
        players: f.world.players,
        raws: f.world.players.map((p) => p.raw),
        buildings: f.world.buildingNative,
        terrain: f.world.terrain,
        prefix: f.world.missionPrefix,
        rng: f.world.rng,
      },
      beforeDraws = f.world.rng.draws,
      receipt = damageCampaignBuilding(
        f.world,
        f.pack,
        0,
        900,
        null,
        f.services,
      );
    expect(receipt.collapseAllocation?.slot).toBe(0);
    expect(f.world.collapse.count).toBe(1);
    expect(u16(f.world.missionPrefix, 0x3556)).toBe(1);
    expect(receipt.craterAllocation?.slot).toBe(0);
    expect(f.world.missionPrefix[0x2ff7]).toBe(1);
    expect(i16(f.world.missionPrefix, 0x1ec7 + 12)).toBeGreaterThanOrEqual(0);
    expect(f.world.rng.draws - beforeDraws).toBe(40);
    expect(f.world.players).toBe(roots.players);
    expect(f.world.buildingNative).toBe(roots.buildings);
    f.world.players.forEach((p, i) => expect(p.raw).toBe(roots.raws[i]));
    expect(f.world.terrain).toBe(roots.terrain);
    expect(f.world.missionPrefix).toBe(roots.prefix);
    expect(f.world.rng).toBe(roots.rng);
    validateSpatial(f.world.spatial);
  });
  it("clears real cross-family references and packet destination kind while keeping launched packets alive", () => {
    const f = fixture(),
      b = f.add(0, 0),
      actor = f.world.specialists.records[0];
    put16(actor as number[], 0x7b, 0);
    actor[0x7d] = 4;
    const r = launchPowerPackets(
      f.world.powerEffects,
      [
        {
          id: 7,
          sourceId: 2000,
          targetId: b.id,
          x: 16384,
          y: 8192,
          targetX: 8192,
          targetY: 8192,
          destinationIndex: 0,
          payload: 10,
        },
      ],
      f.pack.rules!.tables,
      (x, y) => groundHeight(f.world.terrain, x, y),
    );
    if (!r.ok) throw Error(r.reason);
    f.world.powerEffects = r.value.pool;
    const slot = r.value.allocated[0].slot;
    insertSpatial(
      f.world.spatial,
      f.world.terrain,
      `source:4:${slot}`,
      worldCell(16384, 8192),
    );
    f.world.economy.packets.push({
      id: 7,
      sourceId: 2000,
      targetId: b.id,
      payload: 10,
      x: 16384,
      y: 8192,
    });
    synchronizeCampaignLinks(f.world);
    const before = f.world.powerEffects.slots[slot].packet!,
      velocity = [before.vx, before.vy, before.yaw],
      receipt = damageCampaignBuilding(
        f.world,
        f.pack,
        0,
        900,
        null,
        f.services,
      ),
      effect = f.world.powerEffects.slots[slot];
    expect(receipt.detachedPacketIds).toEqual([7]);
    expect(receipt.cleanedReferenceBytes).toBeGreaterThanOrEqual(2);
    expect(actor[0x7d]).toBe(0);
    expect(u16(actor as number[], 0x7b)).toBe(0);
    expect(effect.occupied).toBe(true);
    expect(effect.packet?.targetId).toBeNull();
    expect(effect.nativePrior![73]).toBe(0);
    expect([effect.packet!.vx, effect.packet!.vy, effect.packet!.yaw]).toEqual(
      velocity,
    );
    expect(effect.nativePrior![76]).toBe(10);
    expect(f.world.economy.packets).toHaveLength(1);
    validateSpatial(f.world.spatial);
  });
  it("uses real construction cancellation for the lost normalized building reference", () => {
    const f = fixture(),
      b = f.add(0, 1, 100, [8192, 8192], false),
      builder = f.world.builders[0];
    builder.enabled = true;
    builder.style = 0;
    builder.category = 0;
    builder.status = "constructing";
    builder.task = {
      selector: 1,
      stage: 5,
      phase: "working",
      point: [b.x, b.y],
      requestedGoal: [b.x, b.y],
      goal: [b.x, b.y],
      route: [[b.x, b.y]],
      routeIndex: 0,
      reservation: null,
      jobId: null,
      buildingId: b.id,
      paid: 250,
      timer: 0,
      delay: 1,
      lastFrame: null,
    };
    f.world.actors[0].egressBuildingId = b.id;
    f.services.cancelConstruction = (w, actorId) => {
      const state: ConstructionState = {
          frame: w.frame,
          terrain: w.terrain,
          rng: w.rng,
          actors: w.builders,
          players: w.players.map((p) => ({
            id: p.id,
            progress: p.progress,
            primary: p.funds,
            secondary: p.goop,
            completed: p.completed,
            ownedMask: p.owned,
          })),
          buildings: w.buildings,
          jobs: w.jobs,
          nextJobId: w.nextJobId,
          terrainLastFrame: w.terrainLastFrame,
          missionPrefix: w.missionPrefix,
        },
        unsupported = () => {
          throw Error("Stage5 cancellation must not call motion/site services");
        },
        context: ConstructionContext = {
          gravity: 512,
          climate: {} as ConstructionContext["climate"],
          resolveTarget: unsupported,
          resolveTaskTarget: unsupported,
          route: unsupported,
          blocked: unsupported,
          occupied: unsupported,
          animation: (_actor, action) =>
            animationProfile(f.pack.assets.TEST, action),
          refill: unsupported,
          allocateBuilding: unsupported,
        },
        rules = {
          ...f.pack.rules!.tables,
          evidence: "Synthetic",
        } as ConstructionRules,
        result = cancelConstruction(
          state,
          actorId,
          rules,
          context,
          "destroyed-building",
        );
      w.builders = result.state.actors;
      for (const current of w.builders)
        w.actors.find((a) => a.id === current.id)!.motion = current.motion;
    };
    const receipt = damageCampaignBuilding(
      f.world,
      f.pack,
      0,
      100,
      null,
      f.services,
    );
    expect(receipt.cancelledActorIds).toEqual([builder.id]);
    expect(f.world.builders[0].task).toBeNull();
    expect(f.world.builders[0].status).toBe("cancelled");
    expect(f.world.actors[0].egressBuildingId).toBeNull();
    expect(f.world.players[0].completed[1]).toBe(0);
  });
  it("allows the real code5 factory to recursively destroy a nearby building with current roots", () => {
    const f = fixture();
    f.add(0, 3);
    f.add(1, 1, 20, [8320, 8192]);
    const pool = f.world.buildingNative,
      players = f.world.players;
    damageCampaignBuilding(f.world, f.pack, 0, 900, null, f.services);
    expect(f.allocations).toContain(1);
    expect(f.world.buildings).toHaveLength(0);
    expect(f.world.buildingNative[1][6]).toBe(0);
    expect(f.world.players[0].raw[0x4a2]).toBe(0);
    expect(f.world.players[0].completed[1]).toBe(0);
    expect(f.world.players[0].completed[3]).toBe(0);
    expect(f.world.collapse.count).toBe(2);
    expect(f.world.countdown).toBe(1180);
    expect(f.world.buildingNative).toBe(pool);
    expect(f.world.players).toBe(players);
    validateSpatial(f.world.spatial);
  });
  it("leaves whole-host rollback to the caller on an actually missing construction service", () => {
    const f = fixture(),
      b = f.add(0, 0),
      builder = f.world.builders[0];
    builder.task = {
      selector: 0,
      stage: 5,
      phase: "working",
      point: [b.x, b.y],
      requestedGoal: [b.x, b.y],
      goal: [b.x, b.y],
      route: [],
      routeIndex: 0,
      reservation: null,
      jobId: null,
      buildingId: b.id,
      paid: 250,
      timer: 0,
      delay: 1,
      lastFrame: null,
    };
    const before = JSON.stringify(f.world),
      staged = structuredClone(f.world) as CampaignWorld;
    expect(() =>
      damageCampaignBuilding(staged, f.pack, 0, 900, null, f.services),
    ).toThrow(/construction cancellation/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("preserves destruction when all three actual dependent source pools are at capacity", () => {
    const f = fixture();
    f.add(0, 1);
    f.pack.rules!.tables.buildingFootprints[1] = 2;
    for (let slot = 0; slot < 200; slot++) {
      const image = makeDestructionEffect(
        f.world.powerEffects.slots[slot].nativePrior!,
        {
          slot,
          code: 5,
          owner: 4,
          position: [16384, 16384],
          height: groundHeight(f.world.terrain, 16384, 16384),
          angles: [0, 0, 0],
          parameter: 0,
          delay: 0,
        },
        f.world.terrain,
        f.world.rng,
        f.pack.rules!.tables,
        animationProfile(f.pack.assets.EFF, 5),
      );
      publishStagedSharedEffect(f.world, slot, image.native);
    }
    for (let slot = 0; slot < 32; slot++)
      expect(
        createCollapse(f.world, {
          code: 3,
          owner: 4,
          position: [8192, 8192],
          buildingSlot: 0,
          completed: true,
        }),
      ).toBe(slot);
    for (let slot = 0; slot < 25; slot++)
      put16(f.world.missionPrefix, 0x1ec7 + slot * 176 + 12, 1);
    f.world.missionPrefix[0x2ff7] = 25;
    const beforeDraws = f.world.rng.draws,
      result = damageCampaignBuilding(
        f.world,
        f.pack,
        0,
        900,
        null,
        f.services,
      );
    expect(result.effectAllocations.every((e) => e.slot === null)).toBe(true);
    expect(result.collapseAllocation?.slot).toBeNull();
    expect(result.craterAllocation?.slot).toBeNull();
    expect(f.world.buildingNative[0][6]).toBe(0);
    expect(f.world.buildings).toEqual([]);
    expect(f.world.collapse.count).toBe(32);
    expect(f.world.missionPrefix[0x2ff7]).toBe(25);
    expect(f.world.rng.draws - beforeDraws).toBe(24);
    expect(f.world.countdown).toBe(1200);
    validateSpatial(f.world.spatial);
  });
});
