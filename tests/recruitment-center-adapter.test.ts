import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  stepCampaignRecruitmentCenter,
  stepStagedCampaignRecruitmentCenter,
} from "../src/sim/campaign/recruitment-center-adapter";
import { checksum } from "../src/sim/checksum";
import { put16, put32, i16, u32 } from "../src/sim/campaign/bytes";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
function fixture() {
  const pack = campaignFixture(),
    sha = "0".repeat(64);
  pack.buildingRules = {
    schemaVersion: 1,
    resources: [
      { selector: 5, assetKey: "CENTER_TEST", path: "SYNTHETIC/CENTER.ANB" },
    ],
    unsupportedSelectors: [9],
    upkeep: Array(14).fill(1),
    processingFrontOffset: [-256, 0],
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.assets.CENTER_TEST = {
    ...structuredClone(pack.assets.TEST),
    frames: Array.from({ length: 3 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 5 }, (_, action) => ({
      first: 0,
      last: action === 0 || action === 4 ? 2 : 1,
      rawTrailingWord: action === 0 || action === 4 ? 3 : 2,
    })),
  };
  pack.specialistRecruitmentRules = {
    schemaVersion: 1,
    associatedLandingOffset: [-17, 29],
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
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: code === 70 ? 0 : 1,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-recruitment-center"),
    n = w.buildingNative[0];
  w.frame = 1;
  w.phase = "active";
  n.fill(0);
  n.fill(null, 31, 39);
  n[6] = 4;
  n[45] = 5;
  n[25] = 1;
  n[60] = 2;
  put16(n as number[], 7, 12000);
  put16(n as number[], 9, 13000);
  put16(n as number[], 43, 160);
  put16(n as number[], 49, 5);
  put16(n as number[], 61, 200);
  put32(n as number[], 17, 4321);
  const raw = w.players[0].raw;
  raw[0x498] = 0;
  raw[0x4a2] = 1;
  put32(raw, 0x499, 0);
  w.buildings.push({
    id: 1000,
    slot: 0,
    owner: 0,
    selector: 5,
    grade: 0,
    x: 12000,
    y: 13000,
    health: 160,
    complete: true,
    energy: 200,
  });
  w.economy.buildings.push({
    ...w.buildings[0],
    disabled: false,
    capacitySuppressed: false,
    hqUpgradeSuppressed: false,
    powered: true,
    extraDrain: 0,
    depleted: false,
    storedGoop: 0,
    specialPowerDelivery: false,
  });
  insertSpatial(
    w.spatial,
    w.terrain,
    "source:3:0",
    (13000 >> 8) * 128 + (12000 >> 8),
  );
  synchronizeCampaignLinks(w);
  const services: CampaignSpecialistServices = {
    effectOptions: () => ({
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  return { w, n, raw, pack, services };
}
describe("actual staged7F480 Recruitment Center adapter", () => {
  it("allocates actual49, retains held identities and leaves deployed specialist prefix/RNG untouched", () => {
    const f = fixture(),
      specialists = structuredClone(f.w.specialists),
      rng = structuredClone(f.w.rng),
      held = f.raw,
      native = f.n;
    const r = stepStagedCampaignRecruitmentCenter(f.w, 0, f.pack, f.services);
    expect(r.landing).toEqual({ slot: 0, kind: 5 });
    expect(f.w.buildingNative[0]).toBe(native);
    expect(f.w.players[0].raw).toBe(held);
    expect([i16(f.raw, 9), i16(f.raw, 11), f.raw[0x498]]).toEqual([
      11983, 13029, 5,
    ]);
    const effect = f.w.powerEffects.slots[0].nativePrior!;
    expect([
      effect[69],
      effect[73],
      i16(effect as number[], 71),
      u32(effect as number[], 39),
    ]).toEqual([49, 4, 0, 4321 + 0x6400]);
    expect(f.w.specialists).toEqual(specialists);
    expect(f.w.rng).toEqual(rng);
    expect(f.w.economy.buildings[0].energy).toBe(199);
  });
  it("does not require the associated profile on a source blocked request", () => {
    const f = fixture();
    delete f.pack.specialistRecruitmentRules;
    put32(f.raw, 0x499, 1);
    expect(
      stepStagedCampaignRecruitmentCenter(f.w, 0, f.pack, f.services)
        .landingRequested,
    ).toBe(false);
    expect(f.n[60]).toBe(2);
  });
  it("rolls back real shared allocation, audio, raw references and pad after a late BLAUN descriptor error", () => {
    const f = fixture();
    f.pack.assets.CENTER_TEST.animations![1].last = 255;
    const before = checksum(f.w);
    expect(() =>
      stepCampaignRecruitmentCenter(f.w, 0, f.pack, f.services),
    ).toThrow();
    expect(checksum(f.w)).toBe(before);
    expect(f.w.landings).toHaveLength(0);
    expect(f.n[60]).toBe(2);
  });
  it("uses real shared capacity false without requiring EFF and preserves a source state0 afterimage", () => {
    const f = fixture();
    for (const [slot, p] of f.w.powerEffects.slots.entries()) {
      p.occupied = true;
      p.nativePrior![6] = 5;
      p.nativePrior![69] = 70;
      put16(p.nativePrior as number[], 15, slot);
      insertSpatial(f.w.spatial, f.w.terrain, `source:4:${slot}`, 0);
    }
    synchronizeCampaignLinks(f.w);
    put16(f.w.missionPrefix, 0x3554, 200);
    delete f.pack.assets.EFF;
    const r = stepStagedCampaignRecruitmentCenter(f.w, 0, f.pack, f.services);
    expect(r.landingRequested).toBe(true);
    expect(r.landing).toBeNull();
    expect(f.n[60]).toBe(0);
    expect(f.w.landings).toHaveLength(0);
  });
});
