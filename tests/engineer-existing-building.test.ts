import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  campaignEngineerContext,
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
  cancelStagedCampaignEngineer,
  type CampaignEngineerServices,
} from "../src/sim/campaign/engineer-adapter";
import { dispatchStagedCampaignStrategicRoleCommand } from "../src/sim/campaign/strategic-role-command-adapter";
import {
  stepStagedEngineerRole,
  stepEngineerCallback,
} from "../src/sim/mechanics/engineer";
import {
  planEngineerBuildingContribution,
  type EngineerTakeoverChargeRequest,
} from "../src/sim/mechanics/engineer-construction";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { animationProfile } from "../src/sim/mechanics/animation";
import { checksum } from "../src/sim/checksum";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { i16, u16, u32, put16, put32 } from "../src/sim/campaign/bytes";

/** Synthetic current source pools and normal constructors/landing. Individual
 * work phases are explicitly arranged to test services, not mission victory. */
describe("Engineer existing-building work", () => {
  const pack = campaignFixture();
  let start: CampaignWorld;
  beforeAll(() => {
    pack.buildingRules = {
      schemaVersion: 1,
      resources: Array.from({ length: 13 }, (_, selector) => ({
        selector,
        path: `B${selector}.ANB`,
        assetKey: "TEST",
      })),
      unsupportedSelectors: [13],
      upkeep: Array(14).fill(0),
      processingFrontOffset: [256, -128],
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    pack.assets.EFF = {
      ...pack.assets.EFF,
      frames: Array.from({ length: 9 }, () => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [0, 0, 0],
      })),
      animations: pack.assets.EFF.animations!.map((a, code) =>
        code === 44 ? { first: 0, last: 8, rawTrailingWord: 9 } : a,
      ),
    };
    start = createCampaign(pack, "existing-engineer");
    enterCampaign(start);
    for (let i = 0; i < 200; i++) stepCampaign(start, pack);
    expect(start.actors[0].ready).toBe(true);
  }, 30000);
  function fixture(task: 0 | 1 | 4, owner = 0, size = 1) {
    const w = structuredClone(start),
      content = structuredClone(pack),
      charges: EngineerTakeoverChargeRequest[] = [],
      phases: number[] = [],
      services: CampaignEngineerServices = {
        effectOptions: () => ({
          gravity: 512,
          obstacleAt: () => false,
          cleanupReferences: cleanupCampaignReferences,
        }),
        placeTakeoverCharge: (_s, q) => {
          charges.push(q);
          return false;
        },
        setTakeoverChargePhase: (_s, _actor, phase) => {
          phases.push(phase);
        },
      };
    content.rules!.tables.buildingFootprints[1] = size;
    const made = createStagedCampaignEngineerBuilding(w, content, services, {
      code: 44,
      owner,
      selector: 1,
      point: [9087, 8319],
      height: 2048,
    })!;
    const slot = made.buildingSlot;
    progressCampaignEngineerBuilding(w, content, slot, 80);
    const b = w.buildings.find((v) => v.slot === slot)!;
    w.economy.buildings.push({
      ...b,
      slot: slot % 64,
      disabled: false,
      hqUpgradeSuppressed: false,
      capacitySuppressed: false,
      powered: true,
      extraDrain: 0,
      depleted: false,
      storedGoop: 0,
      specialPowerDelivery: false,
    });
    const packet: (number | null)[] = Array(11).fill(null);
    put16(packet as number[], 0, 0);
    put16(packet as number[], 2, task << 8);
    put16(packet as number[], 4, slot << 8);
    if (task === 0) {
      put16(packet as number[], 4, 0xe00 | slot);
    }
    dispatchStagedCampaignStrategicRoleCommand(
      w,
      { routine: 0x81080, source: 0x39883, player: 0, specialist: 0, packet },
      content,
      services,
    );
    const n = w.specialists.records[0],
      target = w.buildingNative[slot];
    n[85] = 9;
    n[88] = n[88]! | 1;
    n[87] = n[87]! & 252;
    n[112] = 1;
    put16(n as number[], 73, 0);
    put32(n as number[], 39, u32(target as number[], 17));
    const context = () => campaignEngineerContext(w, content, services);
    const activate = () => context().construction!.activate(w, 0);
    const work = () => stepStagedEngineerRole(w, 0, context());
    return {
      w,
      content,
      services,
      charges,
      phases,
      slot,
      n,
      target,
      context,
      activate,
      work,
    };
  }
  it.each([1, 2, 3])(
    "prepares task1 class%s perimeter with retained native work fields",
    (size) => {
      const f = fixture(1, 0, size),
        { n } = f;
      put16(n as number[], 138, 119);
      put32(n as number[], 144, 777);
      f.activate();
      const binding = f.w.specialists.bindings[0]!,
        skill = f.w.players[0].raw[0x16 + binding.blueprintIndex * 36 + 23];
      expect([
        n[89],
        i16(n as number[], 136),
        i16(n as number[], 132),
        i16(n as number[], 134),
      ]).toEqual([16, size + 1, 110 - skill, 0]);
      expect([i16(n as number[], 77), n[79], n[84], n[112]! & 16]).toEqual([
        f.slot,
        4,
        20,
        16,
      ]);
      if (size === 1) {
        expect([i16(n as number[], 11), i16(n as number[], 13)]).toEqual([
          9215, 8255,
        ]);
        expect([i16(n as number[], 138), u32(n as number[], 144)]).toEqual([
          119, 777,
        ]);
      } else
        expect([i16(n as number[], 138), u32(n as number[], 144)]).toEqual([
          Math.trunc(2048 / (size + 1)),
          768,
        ]);
    },
  );
  it("installs task4 approach/action and preserves an already-started target grade", () => {
    const f = fixture(4);
    f.target[47] = 1;
    f.activate();
    expect([
      f.n[89],
      i16(f.n as number[], 136),
      i16(f.n as number[], 134),
    ]).toEqual([13, 1, 0]);
    expect([i16(f.n as number[], 11), i16(f.n as number[], 13)]).toEqual([
      9215, 8255,
    ]);
    put16(f.n as number[], 73, 32);
    const draws = f.w.rng.draws;
    f.work();
    expect(f.target[47]).toBe(1);
    expect(f.w.rng.draws - draws).toBe(1);
    expect(i16(f.n as number[], 134)).toBeGreaterThanOrEqual(100);
  });
  it("retains source signed-word front-point wrapping at both coordinate edges", () => {
    const f = fixture(4);
    put16(f.target as number[], 7, 32760);
    put16(f.target as number[], 9, -32760);
    f.activate();
    expect([i16(f.n as number[], 11), i16(f.n as number[], 13)]).toEqual([
      -32648, 32712,
    ]);
  });
  it("starts44F50 once with real grade/flags/capacity, no invented resource debit", () => {
    const f = fixture(4);
    f.activate();
    put16(f.n as number[], 73, 32);
    const before = [
        u32(f.w.players[0].raw, 0x4a3),
        u32(f.w.players[0].raw, 0x4a7),
      ],
      n = f.target;
    f.work();
    expect([
      n[46],
      n[47],
      u16(n as number[], 49) & 0x101,
      i16(f.n as number[], 136),
    ]).toEqual([0, 1, 0x100, 1]);
    expect([
      u32(f.w.players[0].raw, 0x4a3),
      u32(f.w.players[0].raw, 0x4a7),
    ]).toEqual(before);
    expect(f.w.economy.buildings[0].complete).toBe(false);
    f.work();
    expect(n[47]).toBe(1);
  });
  it("retains positive task4 wait except sourcephase3 excessive distance, with actual AI+5", () => {
    const f = fixture(4);
    f.activate();
    f.target[47] = 1;
    put16(f.target as number[], 43, 20);
    put16(f.target as number[], 49, 0x504);
    f.w.players[0].raw[2] = 1;
    f.n[112] = 129;
    put16(f.n as number[], 73, 0);
    put16(f.n as number[], 134, 20);
    f.w.frame = 2;
    f.work();
    expect(i16(f.target as number[], 43)).toBe(20);
    f.w.frame = 3;
    put16(f.n as number[], 7, 5000);
    put16(f.n as number[], 9, 5000);
    f.work();
    expect(i16(f.target as number[], 43)).toBe(25);
    expect(f.n[90]).toBe(6);
    expect(f.n[112]! & 128).toBe(0);
  });
  it("does not add AI contribution for human task4 and resumes actual building-nominated case6", () => {
    const f = fixture(4);
    f.activate();
    f.target[47] = 1;
    put16(f.target as number[], 43, 20);
    f.n[112] = 129;
    put16(f.n as number[], 134, 1);
    put16(f.n as number[], 73, 0);
    const before = f.w.rng.draws;
    f.work();
    expect(i16(f.target as number[], 43)).toBe(20);
    expect(f.w.rng.draws - before).toBe(2);
    expect(f.n[90]).toBe(6);
    put16(f.n as number[], 73, 0);
    f.n[112] = 1;
    f.work();
    expect([
      i16(f.n as number[], 77),
      f.n[79],
      f.n[82],
      u16(f.n as number[], 73) & 128,
    ]).toEqual([f.slot, 4, 0, 128]);
  });
  it("completes grade1 with recursive43F60 attended release and no grade0 count duplication", () => {
    const f = fixture(4);
    f.activate();
    f.w.players[0].raw[2] = 1;
    f.target[47] = 1;
    put16(f.target as number[], 43, 75);
    put16(f.target as number[], 49, 0x504);
    put16(f.target as number[], 64, 0);
    f.target[66] = 3;
    f.n[112] = 129;
    put16(f.n as number[], 134, 1);
    put16(f.n as number[], 73, 0);
    const count = f.w.players[0].raw[0x601],
      target = f.target,
      raw = f.w.players[0].raw,
      rng = f.w.rng;
    f.work();
    expect(f.w.buildingNative[f.slot]).toBe(target);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.rng).toBe(rng);
    expect([
      target[46],
      target[47],
      i16(target as number[], 43),
      u16(target as number[], 49) & 0x501,
    ]).toEqual([1, 1, 80, 1]);
    expect([f.n[126], f.n[130], f.n[88]! & 1]).toEqual([255, 0, 0]);
    expect(raw[0x601]).toBe(count);
    expect([f.w.buildings[0].grade, f.w.economy.buildings[0].grade]).toEqual([
      1, 1,
    ]);
  });
  it("reads target-grade health and signed recovery/completion writes for grades0..2", () => {
    const f = fixture(4),
      before = f.target.slice();
    before[46] = before[47] = 2;
    put16(before as number[], 43, 20);
    put16(before as number[], 49, 0x41);
    const r = planEngineerBuildingContribution(before, 60, 80);
    expect(r.damageRecoveryNative).not.toBeNull();
    expect(r.completed).toBe(true);
    expect(r.native[46]).toBe(2);
    expect(r.completedPlayerCountOffset).toBeNull();
    expect(r.acquiredOwnershipBit).toBeNull();
  });
  it("repairs selectorFF without reservation, pays actual120-skill and preserves completed count behavior", () => {
    const f = fixture(0);
    f.activate();
    const n = f.n,
      binding = f.w.specialists.bindings[0]!,
      skill = f.w.players[0].raw[0x16 + binding.blueprintIndex * 36 + 23];
    expect([n[89], i16(n as number[], 136), n[129]]).toEqual([15, 5, 4]);
    put16(f.target as number[], 43, 1);
    put16(f.target as number[], 49, 0x41);
    put16(n as number[], 73, 32);
    f.work();
    expect(n[126]).toBe(0);
    expect(n[112]! & 128).toBe(128);
    put16(n as number[], 73, 0);
    put16(n as number[], 134, 1);
    put32(f.w.players[0].raw, 0x4a3, 1000);
    const count = f.w.players[0].raw[0x601];
    f.work();
    expect(u32(f.w.players[0].raw, 0x4a3)).toBe(1000 - (120 - skill));
    expect(i16(f.target as number[], 43)).toBe(80);
    expect(f.w.players[0].raw[0x601]).toBe((count + 1) & 255);
  });
  it("releases insufficient selectorFF repair without refund, demolition or terrain release", () => {
    const f = fixture(0);
    f.activate();
    put16(f.target as number[], 43, 1);
    f.n[112] = 129;
    put16(f.n as number[], 134, 1);
    put16(f.n as number[], 73, 0);
    put32(f.w.players[0].raw, 0x4a3, 0);
    put32(f.w.players[0].raw, 0x4a7, 0);
    const revision = f.w.terrain.revision;
    f.work();
    expect(f.n[126]).toBe(255);
    expect(f.n[122]).toBe(3);
    expect(i16(f.target as number[], 43)).toBe(1);
    expect(f.target[6]).toBe(4);
    expect(f.w.terrain.revision).toBe(revision);
  });
  it("calls real50 port and decrements charge count even on source factory capacity false", () => {
    const f = fixture(1);
    f.activate();
    put16(f.n as number[], 7, 9187);
    put16(f.n as number[], 9, 8319);
    f.n[112] = 129;
    put16(f.n as number[], 73, 0);
    put16(f.n as number[], 134, 1);
    put16(f.n as number[], 136, 1);
    const draws = f.w.rng.draws;
    f.work();
    expect(f.charges).toHaveLength(1);
    expect(f.charges[0]).toMatchObject({
      code: 50,
      actor: 0,
      building: f.slot,
      owner: 0,
      position: [9187, 8319],
      angles: [0, 0, 0],
      parameter: 0,
      delay: 1,
    });
    expect(i16(f.n as number[], 136)).toBe(0);
    expect(f.w.rng.draws - draws).toBe(1);
  });
  it("waits for action17, debits hostile score500, triggerscharges then starts44F20 without instant ownership", () => {
    const f = fixture(1, 1);
    f.activate();
    put16(f.n as number[], 136, 0);
    f.n[112] = 129;
    put16(f.n as number[], 73, 0);
    f.n[25] = 17;
    f.n[26] = f.n[30] = 0;
    const p = animationProfile(
      f.content.assets[f.w.specialists.bindings[0]!.assetKey],
      17,
    );
    f.n[27] = p.flags & 1 ? 0 : p.holds.length - 1;
    put32(f.w.players[0].raw, 17, 2000);
    put16(f.w.missionPrefix, 0x1c78, 5000);
    f.work();
    expect(f.phases).toEqual([1]);
    expect(i16(f.n as number[], 136)).toBe(-1);
    expect(f.n[113]! & 1).toBe(1);
    expect(u32(f.w.players[0].raw, 17)).toBe(1500);
    expect(f.target[24]).toBe(1);
    expect([
      u32(f.target as number[], 54),
      f.target[50]! & 8,
      i16(f.target as number[], 64),
      f.target[66],
    ]).toEqual([256, 8, 0, 3]);
  });
  it.each([1, 4] as const)(
    "releases active task%s flags; task1 cancels staged charges only before trigger",
    (task) => {
      const f = fixture(task);
      f.activate();
      cancelStagedCampaignEngineer(f.w, 0, f.content, f.services);
      expect(f.target[50]! & (task === 1 ? 16 : 4)).toBe(0);
      expect(f.n[126]).toBe(255);
      expect(f.phases).toEqual(task === 1 ? [2] : []);
    },
  );
  it("rolls back complete host after a late missing charge factory, retaining original buffers", () => {
    const f = fixture(1);
    f.activate();
    f.services.placeTakeoverCharge = undefined;
    put16(f.n as number[], 7, 9187);
    put16(f.n as number[], 9, 8319);
    f.n[112] = 129;
    put16(f.n as number[], 73, 0);
    put16(f.n as number[], 134, 1);
    put16(f.n as number[], 136, 1);
    const before = checksum(f.w),
      raw = f.w.players[0].raw,
      rng = f.w.rng,
      c = f.context();
    c.motion = () => {};
    expect(() => stepEngineerCallback(f.w, 0, c)).toThrow(/code50/);
    expect(checksum(f.w)).toBe(before);
    expect(f.w.specialists.records[0]).toBe(f.n);
    expect(f.w.buildingNative[f.slot]).toBe(f.target);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.rng).toBe(rng);
  });
  it("saves active upgrade and replays the same native/RNG/grade afterimages", () => {
    const f = fixture(4);
    f.activate();
    put16(f.n as number[], 73, 32);
    f.work();
    const loaded = loadCampaign(
      saveCampaign(f.w, { paused: true, speed: 2, accumulator: 0 }),
      f.w.contentHash,
    ).world;
    for (const w of [f.w, loaded]) {
      const n = w.specialists.records[0];
      put16(n as number[], 73, 0);
      n[112] = 129;
      put16(n as number[], 134, 1);
      stepStagedEngineerRole(
        w,
        0,
        campaignEngineerContext(w, f.content, f.services),
      );
    }
    expect(checksum(loaded)).toBe(checksum(f.w));
  });
});
