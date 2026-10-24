import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  damageNativeBuilding,
  restoreRecruitmentFootprint,
  setNativeBuildingFootprint,
  updateNativeBuildingCapacity,
  type BuildingDamageWorld,
  type BuildingDamageContext,
} from "../src/sim/mechanics/building-damage";
import {
  damageCampaignBuilding,
  type CampaignBuildingDamageServices,
} from "../src/sim/campaign/building-damage-adapter";
import { stepCampaignBuildingDemolition } from "../src/sim/campaign/building-demolition-adapter";
import { createStagedCampaignRecruitmentLanding } from "../src/sim/campaign/recruitment-landing-adapter";
import {
  createCampaignDestructionEffect,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { createNativeBuilding } from "../src/sim/mechanics/building-native";
import { createShepherdProjectileNative } from "../src/sim/mechanics/shepherd-projectile";
import { establishedEffectPriorities } from "../src/sim/mechanics/reward-effect";
import { animationProfile } from "../src/sim/mechanics/animation";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  campaignBlastTarget,
  synchronizeCampaignLinks,
} from "../src/sim/campaign/entity-view";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import {
  groundHeight,
  worldCell,
  cellIndex,
} from "../src/sim/mechanics/terrain";
import { put16, put32, i16, u16, u32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/**Synthetic source records/artwork only. These are not mission acceptance. */
function pure(grade = 0, complete = true) {
  const bytes = Array(229376).fill(0);
  for (let c = 0; c < 16384; c++) {
    put16(bytes, c * 14 + 2, 1024);
    bytes[c * 14 + 5] = 7;
    bytes[c * 14 + 11] = 0x31;
  }
  const w: BuildingDamageWorld = {
    terrain: { bytes, revision: 0 },
    rng: { seed: 17, draws: 0, ring: null },
    buildingNative: Array.from({ length: 256 }, () =>
      Array.from({ length: 67 }, (_, i) => (31 <= i && i < 39 ? null : 0)),
    ),
    players: Array.from({ length: 4 }, (_, i) => {
      const raw = Array(1805).fill(0);
      raw[0x4a1] = i;
      return { raw };
    }),
  };
  const n = w.buildingNative[0],
    raw = w.players[0].raw,
    trace: string[] = [],
    border = Array(8192).fill(0);
  n[6] = 4;
  n[45] = 5;
  n[46] = grade;
  n[51] = 79;
  n[52] = 1;
  n[60] = 2;
  for (const [at, v] of [
    [7, 8192],
    [9, 8192],
    [43, 900],
    [49, Number(complete)],
  ])
    put16(n as number[], at, v);
  put32(n as number[], 54, 0x12345678);
  raw[0x4a2] = 1;
  raw[0x605] = Number(complete);
  put32(raw, 0x4a7, 73);
  const c: BuildingDamageContext = {
    rules: {
      buildingFootprints: Array(14).fill(2),
      buildingHealth: Array(42).fill(900),
      buildingNameIndices: Array(14).fill(7),
    },
    gameplayRunning: true,
    selectedBuildingSlot: 0,
    createEffect: (_, r) => {
      trace.push(`effect:${r.code}`);
      return null;
    },
    createCollapse: () => {
      throw Error("Selector5 must not create collapse");
    },
    restoreRecruitmentFootprint(s, slot) {
      trace.push("restore");
      expect(s.players[0].raw[0x605]).toBe(0);
      expect(s.terrain.bytes[worldCell(8192, 8192) * 14 + 11] & 17).toBe(0);
      restoreRecruitmentFootprint(s.terrain, [8192, 8192], border);
    },
    unlinkBuilding: () => {
      trace.push("unlink");
    },
    createCrater: (_, r) => {
      trace.push(`crater:${r.variant}`);
      return null;
    },
    onEvent: (_, e) => trace.push(e.type),
  };
  return { w, n, raw, c, trace, border };
}

function host() {
  const pack = campaignFixture(),
    counts: Record<number, number> = {
      0: 10,
      2: 10,
      3: 9,
      5: 14,
      6: 13,
      26: 5,
      27: 8,
      28: 7,
      29: 7,
      30: 4,
      31: 3,
      46: 5,
      47: 6,
      51: 23,
      64: 5,
    },
    sha = "0".repeat(64);
  pack.rules!.tables.buildingHealth = Array(42).fill(900);
  pack.rules!.tables.buildingNameIndices = Array(14).fill(7);
  pack.rules!.tables.buildingFootprints[5] = 2;
  pack.buildingRules = {
    schemaVersion: 1,
    resources: [
      { selector: 5, path: "SYNTHETIC/CENTER.ANB", assetKey: "CENTER_TEST" },
    ],
    unsupportedSelectors: [],
    upkeep: Array(14).fill(0),
    processingFrontOffset: [0, 0],
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.specialistRecruitmentRules = {
    schemaVersion: 1,
    associatedLandingOffset: [0, 768],
    landingSite: {
      directionIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      directions: [
        [256, 0],
        [0, 256],
        [-256, 0],
        [-256, 0],
        [0, -256],
        [0, -256],
        [256, 0],
        [256, 0],
        [0, 0],
      ],
      textures: [40, 41, 42, 43, 44, 45, 46, 47, 48],
      orientations: Array(9).fill(0),
    },
    provenance: {
      executableSha256: sha,
      originalExecution: false,
      associatedLandingOffset: {
        object: 3,
        objectOffset: 0x124f0,
        bytes: 4,
        sha256: sha,
      },
    },
  };
  pack.assets.CENTER_TEST = {
    ...structuredClone(pack.assets.TEST),
    frames: Array.from({ length: 3 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 5 }, () => ({
      first: 0,
      last: 2,
      rawTrailingWord: 3,
    })),
  };
  const frame = structuredClone(pack.assets.TEST.frames![0]);
  pack.assets.EFF = { ...pack.assets.EFF, frames: [], animations: [] };
  for (let code = 0; code < 71; code++) {
    const first = pack.assets.EFF.frames!.length,
      count = counts[code] ?? 1;
    for (let i = 0; i < count; i++)
      pack.assets.EFF.frames!.push({
        ...structuredClone(frame),
        rawFlags: [code === 26 || code === 64 ? 1 : 0, 0, 0],
      });
    pack.assets.EFF.animations!.push({
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    });
  }
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: establishedEffectPriorities[code] ?? 1,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-recruitment-center-damage");
  w.phase = "active";
  put16(w.missionPrefix, 0x355c, 1200);
  w.countdown = 1200;
  const point: [number, number] = [16384, 16384],
    made = createNativeBuilding(w.buildingNative[0], {
      slot: 0,
      owner: 0,
      selector: 5,
      position: point,
      ground: groundHeight(w.terrain, ...point),
      shade: 0,
    });
  if (!made.ok) throw Error(made.reason);
  const n = made.value,
    raw = w.players[0].raw;
  put16(n as number[], 43, 900);
  put16(n as number[], 49, 1);
  put16(n as number[], 61, 200);
  n[51] = 79;
  n[52] = 1;
  n[60] = 2;
  put32(n as number[], 54, 0x12345678);
  w.buildingNative[0] = n;
  const b = {
    id: 1000,
    slot: 0,
    owner: 0,
    selector: 5 as const,
    x: point[0],
    y: point[1],
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
    storedGoop: 0x12345678,
    specialPowerDelivery: false,
  });
  raw[0x4a2] = raw[0x605] = w.players[0].completed[5] = 1;
  put16(raw, 0x60e, 1 << 5);
  w.players[0].owned = 1 << 5;
  updateNativeBuildingCapacity(w, 0);
  insertSpatial(w.spatial, w.terrain, "source:3:0", worldCell(...point));
  synchronizeCampaignLinks(w);
  const options = (
    s: CampaignWorld,
  ): EffectSchedulerOptions<CampaignWorld> => ({
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    stageHost(a, b) {
      Object.assign(b, structuredClone(a));
    },
    commitHost(a, b) {
      Object.assign(a, b);
    },
    blastArea(current) {
      return {
        tables: pack.rules!.tables,
        directions: pack.ecologyRules!.spreadDirections,
        readCountdown: () => u16(current.missionPrefix, 0x355c),
        writeCountdown(v) {
          put16(current.missionPrefix, 0x355c, v);
          current.countdown = v;
        },
        head: (p) => current.spatial.heads[worldCell(...p)],
        resolve: (id) => campaignBlastTarget(current, pack, id),
        next: (id) => current.spatial.nodes[id]?.next ?? null,
        damage(id, amount, attacker) {
          if (!id.startsWith("source:3:"))
            throw Error("Unexpected blast target");
          damageCampaignBuilding(
            current,
            pack,
            Number(id.split(":")[2]),
            amount,
            attacker,
            services,
          );
        },
      };
    },
  });
  const services: CampaignBuildingDamageServices = {
    effectOptions: options,
    selectedBuildingSlot: () => 0,
  };
  const landing = createStagedCampaignRecruitmentLanding(
    w,
    {
      owner: 0,
      position: [point[0], point[1] + 768],
      height: groundHeight(w.terrain, ...point) + 25600,
      parameter: 0,
      parentBuilding: 0,
    },
    pack,
    options(w),
  )!;
  put16(raw, 0x496, landing.returned.slot);
  raw[0x498] = landing.returned.kind;
  return {
    w,
    pack,
    n,
    raw,
    point,
    services,
    options,
    landing: landing.allocatedSlot,
  };
}

describe("Recruitment Center5 damage and44380 footprint", () => {
  it.each([0, 1, 2])(
    "grade%d shares ordinary damage and retains landing fields after exact ordered retirement",
    (grade) => {
      const f = pure(grade),
        out = damageNativeBuilding(f.w, 0, 900, null, f.c);
      expect(f.trace.slice(0, 6)).toEqual([
        "effect:46",
        "destroyed-message",
        "restore",
        "selection-cleared",
        "unlink",
        "crater:0",
      ]);
      expect(
        out.effects.filter((e) => 27 <= e.code && e.code <= 31),
      ).toHaveLength(6);
      expect(out.effects.at(-1)).toMatchObject({ code: 5, parameter: 0 });
      expect([
        f.n[6],
        f.n[51],
        f.n[52],
        u32(f.n as number[], 54),
        f.n[60],
      ]).toEqual([0, 79, 1, 0x12345678, 2]);
      expect(f.raw[0x605]).toBe(0);
      expect(u32(f.raw, 0x4a7)).toBe(73);
      expect(i16(f.n as number[], 43)).toBe(900);
    },
  );
  it("partial depletion does not reset pad state or enter its retirement port", () => {
    const f = pure();
    put16(f.n as number[], 43, 305);
    delete f.c.restoreRecruitmentFootprint;
    const r = damageNativeBuilding(f.w, 0, 10, null, f.c);
    expect(r.destroyed).toBe(false);
    expect(u16(f.n as number[], 49) & 0x140).toBe(0x140);
    expect([
      f.n[51],
      f.n[52],
      u32(f.n as number[], 54),
      f.n[60],
      f.n[48],
    ]).toEqual([79, 1, 0x12345678, 2, 11]);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: "depleted-audio", ratePercent: 85 }),
    );
  });
  it("requires actual restoration lazily and keeps the caller's outer transaction intact", () => {
    const f = pure(),
      before = checksum(f.w);
    delete f.c.restoreRecruitmentFootprint;
    expect(() =>
      damageNativeBuilding(structuredClone(f.w), 0, 900, null, f.c),
    ).toThrow("restoration");
    expect(checksum(f.w)).toBe(before);
  });
  it("sets native X-linear protected vertices and rejects unknown adjacent-pool writes before mutation", () => {
    const f = pure();
    for (let c = 0; c < 16384; c++) f.w.terrain.bytes[c * 14 + 11] = 32;
    setNativeBuildingFootprint(f.w.terrain, [0, 10240], 3, f.border);
    expect(f.w.terrain.bytes[cellIndex(0, 39) * 14 + 11] & 16).toBe(0);
    expect(f.w.terrain.bytes[cellIndex(0, 40) * 14 + 11] & 16).toBe(16);
    const before = checksum(f.w.terrain);
    expect(() =>
      setNativeBuildingFootprint(f.w.terrain, [0, 0], 3, f.border),
    ).toThrow("another source pool");
    expect(checksum(f.w.terrain)).toBe(before);
  });
  it("preserves8B890's literal-1 pointer sentinel at the two-cell X boundary", () => {
    const f = pure();
    for (let c = 0; c < 16384; c++) f.w.terrain.bytes[c * 14 + 5] = (c % 7) + 1;
    setNativeBuildingFootprint(f.w.terrain, [0, 512], 2, f.border);
    expect(
      [225811, 227575, 227589].map((at) => f.w.terrain.bytes[at] & 7),
    ).toEqual([2, 2, 3]);
  });
  it("destroys a live center with real factories/crater and clears only active49 parent kind, retaining player association", () => {
    const f = host(),
      prior = f.n.slice(),
      r = damageCampaignBuilding(f.w, f.pack, 0, 900, null, f.services);
    expect(r.effectAllocations).toHaveLength(8);
    expect(r.effectAllocations.every((a) => a.slot !== null)).toBe(true);
    expect(r.collapseAllocation).toBeNull();
    expect(r.craterAllocation?.slot).toBe(0);
    expect(f.w.powerEffects.slots[f.landing].nativePrior![73]).toBe(0);
    expect(f.w.landings.find((l) => l.slot === f.landing)!.native![73]).toBe(0);
    expect(
      i16(f.w.powerEffects.slots[f.landing].nativePrior! as number[], 71),
    ).toBe(0);
    expect(f.raw[0x498]).toBe(5);
    expect([f.n[51], f.n[52], ...f.n.slice(54, 58), f.n[60]]).toEqual([
      prior[51],
      prior[52],
      ...prior.slice(54, 58),
      prior[60],
    ]);
    expect(f.w.buildingNative[0]).toBe(f.n);
    expect(f.w.players[0].raw).toBe(f.raw);
    validateSpatial(f.w.spatial);
  });
  it("permits actual full-pool factory false without requiring unused EFF", () => {
    const f = host();
    for (let slot = 0; slot < 200; slot++)
      if (!f.w.powerEffects.slots[slot].occupied) {
        const n = f.w.powerEffects.slots[slot].nativePrior!.slice();
        n[6] = 5;
        n[69] = 49;
        put16(n as number[], 15, slot);
        publishStagedSharedEffect(f.w, slot, n);
      }
    delete f.pack.assets.EFF;
    const r = damageCampaignBuilding(f.w, f.pack, 0, 900, null, f.services);
    expect(r.effectAllocations.every((a) => a.slot === null)).toBe(true);
    expect(f.n[6]).toBe(0);
    expect(f.raw[0x498]).toBe(5);
  });
  it("rolls back the complete recursive host after restoration, unlink and a late malformed debris factory", () => {
    const f = host();
    put16(f.n as number[], 43, 1);
    f.w.buildings[0].health = 1;
    for (let code = 27; code <= 31; code++)
      f.pack.assets.EFF.animations![code] = {
        first: 0,
        last: 0,
        rawTrailingWord: 1,
      };
    const late: boolean[] = [];
    f.services.effectOptions = (s) => {
      if (s.buildingNative[0][6] === 0)
        late.push(
          s.powerEffects.slots[f.landing].nativePrior![73] === 0 &&
            s.players[0].raw[0x605] === 0,
        );
      return f.options(s);
    };
    const before = checksum(f.w),
      held = f.w.powerEffects.slots[f.landing].nativePrior;
    expect(() =>
      createCampaignDestructionEffect(
        f.w,
        {
          code: 3,
          owner: 4,
          position: f.point,
          height: groundHeight(f.w.terrain, ...f.point),
          angles: [0, 0, 0],
          parameter: 0,
          delay: 0,
        },
        f.pack,
        f.options(f.w),
      ),
    ).toThrow("animation profile");
    expect(late).toEqual([true]);
    expect(checksum(f.w)).toBe(before);
    expect(f.w.powerEffects.slots[f.landing].nativePrior).toBe(held);
    expect(f.n[6]).toBe(4);
  });
  it("shares timed44380 cleanup with a saveable terminal callback and late rollback", () => {
    const f = host();
    put16(f.n as number[], 49, 0x801);
    put32(f.n as number[], 54, 8);
    f.n[66] = 0;
    f.w.economy.buildings[0].storedGoop = 8;
    const saved = saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
      loaded = loadCampaign(saved, f.w.contentHash).world;
    const a = stepCampaignBuildingDemolition(f.w, 0, f.pack, f.services),
      b = stepCampaignBuildingDemolition(loaded, 0, f.pack, f.services);
    expect(a.retired).toBe(true);
    //The diagnostic counts updated serialized mirrors: live native/landing
    //arrays may alias, while JSON stores both. The authoritative afterimages
    //and every other receipt field must still match exactly.
    expect({ ...b, cleanedReferenceBytes: 0 }).toEqual({
      ...a,
      cleanedReferenceBytes: 0,
    });
    expect(checksum(loaded)).toBe(checksum(f.w));
    expect(f.w.powerEffects.slots[f.landing].nativePrior![73]).toBe(0);
    const bad = loadCampaign(saved, loaded.contentHash).world,
      before = checksum(bad);
    expect(() =>
      stepCampaignBuildingDemolition(bad, 0, f.pack, {
        ...f.services,
        onEvent: () => {
          throw Error("late center selection");
        },
      }),
    ).toThrow("late center selection");
    expect(checksum(bad)).toBe(before);
  });
  it("records normal campaign projectile damage, resumes the destroyed-center save and replays full callback state", () => {
    const f = host(),
      { w, pack } = f;
    put16(f.n as number[], 43, 1);
    w.buildings[0].health = 1;
    Object.assign(pack.effectRules!.descriptors[37], {
      priority: 9,
      retirementMode: 4,
      movable: true,
      waterResponse: true,
      childCode: 0,
    });
    let slot = 0;
    while (w.powerEffects.slots[slot].occupied) slot++;
    const made = createShepherdProjectileNative(
      w.powerEffects.slots[slot].nativePrior!,
      slot,
      {
        code: 37,
        owner: 4,
        position: f.point,
        height: groundHeight(w.terrain, ...f.point),
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
    publishStagedSharedEffect(w, slot, made.native);
    const record = recordCampaign(w, null);
    stepCampaign(w, pack);
    expect(w.phase, JSON.stringify(w.notices)).toBe("active");
    expect(w.buildingNative[0][6]).toBe(0);
    expect(w.powerEffects.slots[f.landing].nativePrior![73]).toBe(0);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
    for (let i = 0; i < 4; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      expect(w.phase, JSON.stringify(w.notices)).toBe("active");
    }
    expect(checksum(loaded)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(record, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
});
