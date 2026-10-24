import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  campaignHumanRosterView,
  campaignHumanRosterAssociatedTarget,
  issueCampaignHumanRoster,
  issueStagedCampaignHumanRoster,
} from "../src/sim/campaign/human-roster-adapter";
import { activateStagedCampaignSpecialists } from "../src/sim/campaign/strategic-recruit-adapter";
import {
  createStagedCampaignRecruitmentMarker,
  stepCampaignRecruitmentEffect,
} from "../src/sim/campaign/recruitment-landing-adapter";
import {
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import type { HumanRosterCommand } from "../src/sim/mechanics/human-roster";
import { campaignAirborneBuilding } from "../src/sim/campaign/mule-damage-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { checksum } from "../src/sim/checksum";
import { put16, put32, i16, u16, u32 } from "../src/sim/campaign/bytes";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";

/**Entirely synthetic profile/pools. The real native constructor, shared
 * allocation, terrain/spatial queries, marker, landing and activation execute. */
function fixture() {
  const pack = campaignFixture(),
    eff = structuredClone(pack.assets.EFF),
    frame = eff.frames![0];
  eff.frames = [];
  eff.animations = Array.from({ length: 71 }, (_, code) => {
    const count =
        ({ 6: 13, 26: 5, 47: 6, 51: 23, 64: 5 } as Record<number, number>)[
          code
        ] ?? 1,
      first = eff.frames!.length;
    for (let i = 0; i < count; i++)
      eff.frames!.push({
        ...structuredClone(frame),
        rawFlags: [code === 64 || code === 26 ? 1 : 0, 0, 0],
      });
    return { first, last: first + count - 1, rawTrailingWord: count };
  });
  pack.assets.EFF = eff;
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 64 ? 6 : 0,
      gravity: code === 64,
      priority: code === 51 ? 2 : 1,
      childCode: code === 64 ? 51 : null,
      movable: code === 64,
      waterResponse: code === 64,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.specialistRecruitmentRules = {
    schemaVersion: 1,
    associatedLandingOffset: [-17, 29],
    provenance: {
      executableSha256: "0".repeat(64),
      originalExecution: false,
      associatedLandingOffset: {
        object: 3,
        objectOffset: 0x124f0,
        bytes: 4,
        sha256: "0".repeat(64),
      },
    },
  };
  const w = createCampaign(pack, "synthetic-human-roster");
  w.frame = 1;
  w.phase = "active";
  w.actors = [];
  w.builders = [];
  w.missionPrefix[0x1ebd] = 15;
  w.specialistOrigin = [1024, 2048];
  const raw = w.players[0].raw;
  raw[3] = 0;
  raw[0x498] = 0;
  put32(raw, 0x499, 0xffffffff);
  for (let slot = 0; slot < 5; slot++) {
    w.specialists.records[slot][6] = 0;
    w.specialists.bindings[slot] = null;
  }
  for (const bp of w.players[0].blueprints) {
    bp.runtimeFlags = 0;
    raw[0x16 + bp.index * 36 + 32] = 0;
  }
  const services: CampaignSpecialistServices = { effectOptions: options };
  function options(host: CampaignWorld): EffectSchedulerOptions<CampaignWorld> {
    return {
      gravity: 512,
      obstacleAt: (p) => campaignAirborneBuilding(host, pack, p, 0) !== null,
      destructionObstacle: (s, p, h) => {
        const b = campaignAirborneBuilding(s, pack, p, h);
        return b ? { position: [...b.position], ground: b.ground } : null;
      },
      cleanupReferences: cleanupCampaignReferences,
      stageHost: (a, s) => Object.assign(s, structuredClone(a)),
      commitHost: (a, s) => Object.assign(a, s),
      recruitmentEffect: (s, slot, out) =>
        stepCampaignRecruitmentEffect(s, slot, pack, options(s), out),
      onLandingEvent: (s, _landing, event) => {
        if (event.type === "activate")
          activateStagedCampaignSpecialists(s, event.owner, pack, services);
      },
    };
  }
  function issue(command: HumanRosterCommand) {
    return issueCampaignHumanRoster(w, command, pack, services);
  }
  function building(slot = 0, owner = 0) {
    const n = w.buildingNative[slot];
    n[6] = 4;
    n[24] = owner;
    n[45] = 5;
    put16(n as number[], 15, slot);
    put16(n as number[], 49, 5);
    put16(n as number[], 7, 12000);
    put16(n as number[], 9, 13000);
    put32(n as number[], 17, 4321);
    return n;
  }
  return { pack, w, raw, services, options, issue, building };
}
describe("human explicit recruitment campaign adapter", () => {
  it("uses real4FD30, exposes read-only raw candidates and preserves held source identity in staged calls", () => {
    const f = fixture(),
      held = f.w.specialists.records[0],
      raw = f.w.players[0].raw,
      prior = held[150],
      funds = f.w.players[0].funds,
      rng = structuredClone(f.w.rng),
      view = campaignHumanRosterView(f.w),
      before = checksum(f.w);
    expect(view.cards.filter((c) => c.canSelect)).toHaveLength(16);
    expect(checksum(f.w)).toBe(before);
    const r = issueStagedCampaignHumanRoster(
      f.w,
      { type: "roster-select", blueprintIndex: 0 },
      f.pack,
      f.services,
    );
    expect(r).toMatchObject({
      accepted: true,
      disposition: "created",
      packet: { packet: 7, created: 0 },
    });
    expect(f.w.specialists.records[0]).toBe(held);
    expect(f.w.players[0].raw).toBe(raw);
    expect(held[150]).toBe(prior);
    expect(held[25]).toBe(0);
    expect(held[112]).toBe(0);
    expect(f.w.specialists.bindings[0]).toMatchObject({
      owner: 0,
      blueprintIndex: 0,
      assetKey: "TEST",
    });
    expect(f.w.builders[0].motion).toBe(f.w.actors[0].motion);
    expect(f.w.actors[0].ready).toBe(false);
    expect(f.w.players[0].funds).toBe(funds);
    expect(f.w.rng).toEqual(rng);
  });
  it("rejects sourceUI ineligible input without mutating any host root", () => {
    const f = fixture(),
      before = checksum(f.w);
    expect(f.issue({ type: "roster-select", blueprintIndex: 4 })).toMatchObject(
      { accepted: false, disposition: "rejected" },
    );
    expect(checksum(f.w)).toBe(before);
    expect(
      f.issue({
        type: "roster-deploy",
        deployment: 1,
        associatedBuilding: null,
      }),
    ).toMatchObject({ accepted: false, reason: "No waiting specialists" });
    expect(checksum(f.w)).toBe(before);
  });
  it("removes and reselects a waiting blueprint without death or duplicate projection", () => {
    const f = fixture();
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    const name = f.w.players[0].blueprints[0].name;
    const result = f.issue({ type: "roster-deselect", blueprintIndex: 0 });
    expect(result).toMatchObject({
      accepted: true,
      disposition: "removed",
      packet: { removed: [0] },
    });
    expect(f.w.players[0].blueprints[0].name).toBe(name);
    expect(f.w.players[0].blueprints[0].health).toBe(50);
    expect(f.w.specialists.records[0][6]).toBe(0);
    expect(f.w.specialists.bindings[0]?.blueprintIndex).toBe(0);
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    expect(f.w.actors).toHaveLength(1);
    expect(f.w.builders).toHaveLength(1);
  });
  it("deploys through real49 and rechecks the newly selected roster despite nonzero AI cooldown", () => {
    const f = fixture();
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    const result = f.issue({
      type: "roster-deploy",
      deployment: 1,
      associatedBuilding: null,
    });
    expect(result).toMatchObject({
      accepted: true,
      disposition: "landing",
      packet: { packet: 10, landingCreated: true },
    });
    const raw = f.w.players[0].raw,
      n = f.w.specialists.records[0],
      slot = i16(raw, 0x496);
    expect(raw[0x498]).toBe(5);
    expect(f.w.powerEffects.slots[slot].nativePrior![69]).toBe(49);
    expect(n[113]! & 4).toBe(4);
    expect(n[22]! & 8).toBe(8);
    expect(n[25]).toBe(8);
    expect(campaignHumanRosterView(f.w).pending[0].canDeselect).toBe(false);
    validateSpatial(f.w.spatial);
  });
  it("source10zero removes only waiting actors and does not delete their blueprints", () => {
    const f = fixture();
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    f.issue({ type: "roster-select", blueprintIndex: 5 });
    const names = f.w.players[0].blueprints.map((b) => b.name);
    const result = f.issue({
      type: "roster-deploy",
      deployment: 0,
      associatedBuilding: null,
    });
    expect(result.packet?.removed).toEqual([0, 1]);
    expect(f.w.players[0].raw[3]).toBe(0);
    expect(f.w.players[0].blueprints.map((b) => b.name)).toEqual(names);
    expect(f.w.actors.every((a) => !a.ready)).toBe(true);
  });
  it("keeps the real80830 prefix on shared capacity failure", () => {
    const f = fixture();
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    for (let slot = 0; slot < 200; slot++) {
      const p = f.w.powerEffects.slots[slot],
        n = p.nativePrior!;
      n[6] = 5;
      n[69] = 49;
      n[21] = 1;
      put16(n as number[], 15, slot);
      put16(n as number[], 7, 8192);
      put16(n as number[], 9, 8192);
      p.occupied = true;
      insertSpatial(
        f.w.spatial,
        f.w.terrain,
        `source:4:${slot}`,
        32 * 128 + 32,
      );
    }
    put16(f.w.missionPrefix, 0x3554, 200);
    const rng = structuredClone(f.w.rng);
    const result = f.issue({
      type: "roster-deploy",
      deployment: 1,
      associatedBuilding: null,
    });
    expect(result).toMatchObject({
      accepted: true,
      disposition: "capacity",
      packet: { landingCreated: false },
    });
    expect(f.w.specialists.records[0][113]! & 4).toBe(4);
    expect(f.w.specialists.records[0][25]).toBe(8);
    expect(f.w.players[0].raw[0x498]).toBe(0);
    expect(f.w.rng).toEqual(rng);
  });
  it("associated panel9 keeps signed wrapping, parent/ref and building-owner target semantics", () => {
    const f = fixture();
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    const n = f.building(64, 1);
    f.w.players[0].raw[0x6e5] = 2;
    f.w.players[1].raw[0x6e5] = 1;
    put16(n as number[], 7, -32760);
    const point = campaignHumanRosterAssociatedTarget(f.w, 64, f.pack);
    expect(point).toEqual([32759, 13029]);
    f.issue({ type: "roster-target", point });
    expect(
      f.issue({ type: "roster-deploy", deployment: 1, associatedBuilding: 64 })
        .disposition,
    ).toBe("landing");
    const slot = i16(f.w.players[0].raw, 0x496),
      effect = f.w.powerEffects.slots[slot].nativePrior!;
    expect([
      i16(effect as number[], 7),
      i16(effect as number[], 9),
      u32(effect as number[], 39),
    ]).toEqual([32759, 13029, 4321 + 25600]);
    expect([i16(effect as number[], 71), effect[73]]).toEqual([64, 4]);
    expect([i16(f.w.players[1].raw, 9), i16(f.w.players[1].raw, 11)]).toEqual(
      point,
    );
  });
  it("requires associated numeric profile lazily and rolls back a late resource failure after real construction", () => {
    const f = fixture();
    delete f.pack.specialistRecruitmentRules;
    expect(f.issue({ type: "roster-select", blueprintIndex: 0 }).accepted).toBe(
      true,
    );
    f.building();
    let before = checksum(f.w);
    expect(() =>
      f.issue({ type: "roster-deploy", deployment: 1, associatedBuilding: 0 }),
    ).toThrow("offset/profile");
    expect(checksum(f.w)).toBe(before);
    before = checksum(f.w);
    delete f.pack.assets.EFF;
    expect(() =>
      f.issue({
        type: "roster-deploy",
        deployment: 1,
        associatedBuilding: null,
      }),
    ).toThrow("EFF");
    expect(checksum(f.w)).toBe(before);
  });
  it("uses the real bootstrap64 return identity and rejects absent markers atomically", () => {
    const f = fixture();
    put32(f.w.missionPrefix, 0x1ec2, 1);
    put16(f.w.missionPrefix, 0x1c9a, 15000);
    put16(f.w.missionPrefix, 0x1c9c, 16000);
    f.issue({ type: "roster-select", blueprintIndex: 0 });
    const before = checksum(f.w);
    expect(() =>
      f.issue({
        type: "roster-deploy",
        deployment: 1,
        associatedBuilding: null,
      }),
    ).toThrow("one-past");
    expect(checksum(f.w)).toBe(before);
    const marker = createStagedCampaignRecruitmentMarker(
      f.w,
      f.pack,
      f.options(f.w),
    )!;
    const r = f.issue({
      type: "roster-deploy",
      deployment: 1,
      associatedBuilding: null,
    });
    expect(r.disposition).toBe("landing");
    expect(i16(f.w.players[0].raw, 0x496)).toBe(marker);
    expect(f.w.powerEffects.slots[marker].nativePrior![76]).toBe(1);
    expect(f.w.landings.at(-1)?.native?.[76]).toBe(3);
    expect(f.w.landings.at(-1)?.point).toEqual([15000, 16000]);
  });
  it("preserves save/reload and a complete repeated semantic input segment with actual landing callbacks", () => {
    const f = fixture(),
      initial = structuredClone(f.w),
      commands: HumanRosterCommand[] = [
        { type: "roster-select", blueprintIndex: 0 },
        { type: "roster-select", blueprintIndex: 10 },
        { type: "roster-deselect", blueprintIndex: 10 },
        { type: "roster-target", point: [8000, 9000] },
        { type: "roster-deploy", deployment: 1, associatedBuilding: null },
      ];
    for (const c of commands) expect(f.issue(c).accepted).toBe(true);
    const loaded = loadCampaign(
      saveCampaign(f.w, { paused: false, speed: 1, accumulator: 0 }),
      f.w.contentHash,
    ).world;
    const replay = initial;
    for (const c of commands)
      issueCampaignHumanRoster(replay, c, f.pack, f.services);
    for (let tick = 0; tick < 200; tick++)
      for (const w of [f.w, loaded, replay]) {
        w.frame++;
        stepEffectScheduler(w, f.pack, f.options(w));
      }
    expect(checksum(loaded)).toBe(checksum(f.w));
    expect(checksum(replay)).toBe(checksum(f.w));
    expect(f.w.actors.find((a) => a.id === 0)?.ready).toBe(true);
    expect(u16(f.w.specialists.records[0] as number[], 112) & 1).toBe(1);
  });
});
