import { describe, expect, it } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import {
  damageCampaignBuilding,
  type CampaignBuildingDamageServices,
} from "../src/sim/campaign/building-damage-adapter";
import { campaignBlastAreaContext } from "../src/sim/campaign/blast-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  createCampaignDestructionEffect,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { validateSpatial } from "../src/sim/campaign/spatial";
import { stepCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { put16, put32, u32 } from "../src/sim/campaign/bytes";
import { createShepherdProjectileNative } from "../src/sim/mechanics/shepherd-projectile";
import { animationProfile } from "../src/sim/mechanics/animation";
import { establishedEffectPriorities } from "../src/sim/mechanics/reward-effect";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";

/**Synthetic callback fixture; no original mission or artwork. */
function host(grade: 0 | 1 | 2 = 0, front = true) {
  const f = processorFixture(2, grade),
    { w, pack } = f,
    n = w.buildingNative[0],
    counts: Record<number, number> = {
      0: 10,
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
  w.players[0].raw[0x4a2] = 1;
  pack.rules!.tables.buildingHealth = Array(42).fill(160);
  pack.rules!.tables.buildingNameIndices = Array(14).fill(7);
  pack.rules!.tables.buildingFootprints[2] = 2;
  put16(w.missionPrefix, 0x355c, 1200);
  w.countdown = 1200;
  put32(n as number[], 54, 73);
  n[51] = 77;
  w.economy.buildings[0].storedGoop = 73;
  const first = pack.assets.EFF.frames!.length;
  pack.assets.EFF.frames!.push(
    ...Array.from({ length: 14 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
  );
  for (const [code, count] of Object.entries(counts))
    pack.assets.EFF.animations![Number(code)] = {
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    };
  pack.effectRules!.descriptors = Array.from({ length: 71 }, (_, code) => ({
    code,
    priority: establishedEffectPriorities[code] ?? 10,
    retirementMode: 0,
    gravity: false,
    childCode: null,
    movable: false,
    waterResponse: false,
  }));
  const plant = front ? processorPlant(f, 7) : null;
  if (plant) {
    put16(plant.native as number[], 44, -1);
    plant.growth = -1;
    plant.native[46] = plant.plantFlags = 0x84;
  }
  let services: CampaignBuildingDamageServices;
  const options = (
    s: CampaignWorld,
  ): EffectSchedulerOptions<CampaignWorld> => ({
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    stageHost(original, staged) {
      Object.assign(staged, structuredClone(original));
      for (const m of staged.ecology.mules)
        staged.creatureNative[m.index] = m.native;
    },
    commitHost(target, staged) {
      Object.assign(target, staged);
    },
    blastArea: (current) =>
      campaignBlastAreaContext(current, pack, {
        damageSpecialist() {
          throw Error("Unexpected synthetic specialist");
        },
        damageBuilding(s, slot, amount, attacker) {
          damageCampaignBuilding(s, pack, slot, amount, attacker, services);
        },
        effectOptions: options,
      }),
  });
  services = { effectOptions: options };
  synchronizeCampaignLinks(w);
  return { ...f, n, plant, options, services };
}
describe("Pulper2 source damage and retirement host", () => {
  it.each([0, 1, 2] as const)(
    "destroys grade%d with plant-only operation0 cleanup, real debris/crater and retained material",
    (grade) => {
      const f = host(grade),
        funds = f.w.players[0].funds,
        goop = f.w.players[0].goop,
        result = damageCampaignBuilding(f.w, f.pack, 0, 160, null, f.services);
      expect(result.destroyed).toBe(true);
      expect(result.clearedFrontReferences).toEqual([f.plant!.id]);
      expect(f.plant!.native[46]).toBe(0x80);
      expect(f.plant!.native[6]).toBe(2);
      expect(f.w.spatial.nodes[f.plant!.id]).toBeDefined();
      expect(f.w.buildingNative[0]).toBe(f.n);
      expect([f.n[6], f.n[51], u32(f.n as number[], 54)]).toEqual([0, 77, 73]);
      expect([f.w.players[0].funds, f.w.players[0].goop]).toEqual([
        funds,
        goop,
      ]);
      expect(f.w.players[0].completed[2]).toBe(0);
      expect(result.capacityAfter).toBe(0);
      expect(result.collapseAllocation).toBeNull();
      expect(result.audioRequests).toEqual([]);
      expect(result.craterAllocation?.slot).toBe(0);
      expect(result.effectAllocations).toHaveLength(8);
      expect(result.effectAllocations.every((a) => a.slot !== null)).toBe(true);
      expect(result.effectAllocations.at(-1)!.request.code).toBe(5);
      validateSpatial(f.w.spatial);
    },
  );
  it("rolls back all roots when inline destruction fails after front cleanup, unlink and actual crater allocation", () => {
    const f = host();
    put16(f.n as number[], 43, 1);
    f.w.buildings[0].health = 1;
    for (let code = 27; code <= 31; code++)
      f.pack.assets.EFF.animations![code] = {
        first: 0,
        last: 0,
        rawTrailingWord: 1,
      };
    const stages: boolean[] = [];
    f.services.effectOptions = (s) => {
      if (s.buildingNative[0][6] === 0)
        stages.push(
          s.ecology.plants[0].native[46] === 0x80 &&
            s.players[0].raw[0x602] === 0 &&
            s.missionPrefix[0x2ff7] === 1,
        );
      return f.options(s);
    };
    const before = checksum(f.w),
      native = f.w.buildingNative,
      players = f.w.players,
      rng = f.w.rng;
    expect(() =>
      createCampaignDestructionEffect(
        f.w,
        {
          code: 3,
          owner: 4,
          position: [8448, 8192],
          height: groundHeight(f.w.terrain, 8448, 8192),
          angles: [0, 0, 0],
          parameter: 0,
          delay: 0,
        },
        f.pack,
        f.options(f.w),
      ),
    ).toThrow("Original destruction EFF animation profile required");
    expect(stages).toEqual([true]);
    expect(checksum(f.w)).toBe(before);
    expect(f.w.buildingNative).toBe(native);
    expect(f.w.players).toBe(players);
    expect(f.w.rng).toBe(rng);
    expect(f.plant!.native[46]).toBe(0x84);
  });
  it("destroys2 through the ordinary projectile/effect scheduler and preserves full save continuation and replay", () => {
    const f = host(0, false),
      { w, pack } = f;
    put16(f.n as number[], 43, 1);
    w.buildings[0].health = 1;
    f.n[51] = 0;
    Object.assign(pack.effectRules!.descriptors[37], {
      priority: 9,
      retirementMode: 4,
      movable: true,
      waterResponse: true,
      childCode: 0,
    });
    const made = createShepherdProjectileNative(
      w.powerEffects.slots[0].nativePrior!,
      0,
      {
        code: 37,
        owner: 4,
        position: [8448, 8192],
        height: groundHeight(w.terrain, 8448, 8192),
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
    const recording = recordCampaign(w, null);
    stepCampaign(w, pack);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(w.buildingNative[0][6]).toBe(0);
    expect(w.players[0].completed[2]).toBe(0);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
      w.contentHash,
    ).world;
    for (let tick = 0; tick < 3; tick++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
    }
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(checksum(loaded)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
});
