import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  queueCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import { stepCampaignPlants } from "../src/sim/campaign/plant-reproduction-adapter";
import { planBotanistPlantCreation } from "../src/sim/mechanics/botanist";
import { stepPlants } from "../src/sim/mechanics/ecology";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { synchronizeCampaignPlantCounts } from "../src/sim/campaign/ecology-adapter";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";

/** Synthetic arithmetic preconditions; no original tables, art or mission acceptance. */
function fixture(active = false) {
  const pack = campaignFixture();
  pack.assets.EFF = structuredClone(pack.assets.EFF);
  const eff = pack.assets.EFF,
    first = eff.frames!.length;
  for (let i = 0; i < 6; i++)
    eff.frames!.push({
      ...structuredClone(eff.frames![0]),
      rawFlags: [0, 0, 0],
    });
  while (eff.animations!.length <= 60)
    eff.animations!.push({ first: 0, last: 1, rawTrailingWord: 2 });
  eff.animations![60] = { first, last: first + 5, rawTrailingWord: 6 };
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: code === 60 ? 11 : code === 26 ? 35 : 1,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  Object.assign(pack.ecologyRules!.plants[0], {
    growthDeltas: Array(8).fill(1),
    spreadPeriod: 1,
    walkSteps: 1,
    crowdingLimit: 3,
    checkThreshold: 250,
  });
  const w = createCampaign(pack, "synthetic-owned-plant-reproduction");
  if (active) {
    enterCampaign(w, pack);
    for (let i = 0; i < 200; i++) stepCampaign(w, pack);
    expect(w.phase, w.notices.at(-1)?.text).toBe("active");
  }
  w.source.source.terrain.rawWaterHeight = -30000;
  w.rng = { seed: 5428, draws: 0, ring: 31 };
  put16(w.missionPrefix, 0x1c7c, 5000);
  w.ecology.plantCursor = 0;
  function plant(
    index: number,
    owner: number,
    position: [number, number],
    attached = false,
  ) {
    const p = w.ecology.plants[index],
      plan = planBotanistPlantCreation(
        p.native,
        index,
        owner,
        0,
        position,
        w.terrain,
      );
    Object.assign(p, {
      active: true,
      owner,
      position: plan.position,
      selector: 0,
      growth: 13,
      flags: 4,
      plantFlags: attached ? 16 : 0,
      updateCounter: 0,
      retirement: 3,
      animation: 0,
      frame: 0,
      shade: plan.native[23]!,
      height: plan.height,
      native: plan.native,
    });
    put16(p.native as number[], 44, 13);
    p.native[46] = p.plantFlags;
    p.native[30] = 219;
    p.native[48] = 3;
    insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
    return p;
  }
  plant(8, 0, [8192, 8192]);
  plant(16, 0, [16384, 16384]);
  w.ecology.plantCount = 2;
  w.ecology.ownerPlantCounts = [65535, 0, 0, 0];
  put32(w.players[0].raw, 13, 0xfffffffe);
  put32(w.players[0].raw, 17, 9999);
  synchronizeCampaignPlantCounts(w);
  synchronizeCampaignLinks(w);
  const services = {
    effectOptions: (_w: CampaignWorld) => ({
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  function fillEffects(code: 26 | 33) {
    for (const [slot, e] of w.powerEffects.slots.entries()) {
      const n = e.nativePrior!;
      n[6] = 5;
      n[69] = code;
      n[21] = n[22] = 0;
      put16(n as number[], 15, slot);
      put16(n as number[], 7, (slot % 128) * 256);
      put16(n as number[], 9, (100 + Math.floor(slot / 128)) * 256);
      e.occupied = true;
      insertSpatial(
        w.spatial,
        w.terrain,
        `source:4:${slot}`,
        worldCell((slot % 128) * 256, (100 + Math.floor(slot / 128)) * 256),
      );
    }
    put16(w.missionPrefix, 0x3554, 200);
    synchronizeCampaignLinks(w);
  }
  function fullPlants() {
    for (let index = 0; index < 512; index++)
      if (index !== 8 && index !== 16)
        plant(
          index,
          4,
          [(index % 128) * 256, (100 + Math.floor(index / 128)) * 256],
          true,
        );
    w.ecology.plantCount = 512;
    synchronizeCampaignPlantCounts(w);
    synchronizeCampaignLinks(w);
  }
  return { pack, w, services, plant, fillEffects, fullPlants };
}

describe("owned scheduled plant reproduction", () => {
  it("publishes births and each real80780 before the next spread RNG", () => {
    const f = fixture(),
      funds = f.w.players[0].funds,
      goop = f.w.economy.players[0].goop;
    const r = stepCampaignPlants(f.w, f.pack, f.services);
    expect(r.committed, r.reason ?? undefined).toBe(true);
    expect(r.callbacks).toEqual([8, 16]);
    expect(f.w.ecology.plantCount).toBe(4);
    expect(f.w.ecology.ownerPlantCounts).toEqual([1, 0, 0, 0]);
    expect(u16(f.w.players[0].raw, 0x5fa)).toBe(1);
    expect(u32(f.w.players[0].raw, 13)).toBe(0);
    expect(u32(f.w.players[0].raw, 17)).toBe(10000);
    expect(f.w.players[0].funds).toBe(funds);
    expect(f.w.economy.players[0].goop).toBe(goop);
    expect(f.w.rng.draws).toBe(14);
    expect(f.w.powerEffects.slots.filter((s) => s.occupied)).toHaveLength(2);
    expect(
      f.w.audio.requests
        .filter((q) => q.type !== "playback-rate")
        .map((q) => [
          q.entity,
          q.cue,
          q.mode,
          q.parameter,
          q.initialRatePercent,
        ]),
    ).toEqual([
      ["source:1:0", 57, 2, 1, 200],
      ["source:1:1", 57, 2, 1, 200],
    ]);
    for (const index of [0, 1]) {
      const p = f.w.ecology.plants[index];
      expect([p.owner, p.growth, p.flags, p.native[30], p.native[48]]).toEqual([
        0, 4, 4, 0, 0,
      ]);
      expect(f.w.spatial.nodes[p.id]).toBeDefined();
    }
    expect(u16(f.w.missionPrefix, 0x355a)).toBe(24);
    expect(f.w.ecology.pending).toEqual([]);
    validateSpatial(f.w.spatial);
  });
  it("retains credit but omits factory delay draws when all200 slots have higher allocation precedence", () => {
    const f = fixture();
    f.fillEffects(33);
    const r = stepCampaignPlants(f.w, f.pack, f.services);
    expect(r.committed, r.reason ?? undefined).toBe(true);
    expect(f.w.rng.draws).toBe(12);
    expect(f.w.ecology.plantCount).toBe(4);
    expect(u32(f.w.players[0].raw, 13)).toBe(0);
    expect(f.w.powerEffects.slots.every((s) => s.nativePrior![69] === 33)).toBe(
      true,
    );
  });
  it("runs real replacement retirement and retains firstfree native priors", () => {
    const f = fixture();
    f.fillEffects(26);
    f.w.powerEffects.slots[0].nativePrior![30] = 201;
    const r = stepCampaignPlants(f.w, f.pack, f.services);
    expect(r.committed, r.reason ?? undefined).toBe(true);
    expect(f.w.rng.draws).toBe(14);
    expect(
      f.w.powerEffects.slots.slice(0, 2).map((s) => s.nativePrior![69]),
    ).toEqual([60, 60]);
    expect(f.w.powerEffects.slots[0].nativePrior![30]).toBe(201);
    expect(u16(f.w.missionPrefix, 0x3554)).toBe(200);
    validateSpatial(f.w.spatial);
  });
  it("unlinks and cleans the old plant before its slot is reused later in the same pass", () => {
    const f = fixture();
    f.fullPlants();
    const dying = f.w.ecology.plants[8];
    dying.growth = 0;
    dying.plantFlags = 128;
    put16(dying.native as number[], 44, 0);
    dying.native[46] = 128;
    const n = f.w.creatureNative[0];
    n[6] = 1;
    n[24] = 4;
    n[96] = 2;
    n[93] = 2;
    put16(n as number[], 91, 8);
    put16(n as number[], 7, 30000);
    put16(n as number[], 9, 30000);
    f.w.ecology.mules = [
      { id: "source:0:0", index: 0, native: n, pending: [] },
    ];
    insertSpatial(
      f.w.spatial,
      f.w.terrain,
      "source:0:0",
      worldCell(30000, 30000),
    );
    synchronizeCampaignLinks(f.w);
    const r = stepCampaignPlants(f.w, f.pack, f.services);
    expect(r.committed, r.reason ?? undefined).toBe(true);
    expect(f.w.ecology.plantCount).toBe(512);
    expect(
      r.events.filter((e) => e.kind === "plant-born").map((e) => e.id),
    ).toEqual(["source:1:8"]);
    expect(f.w.ecology.plants[8].growth).toBe(4);
    expect(f.w.ecology.plants[8].native[48]).toBe(3);
    expect(f.w.ecology.mules[0].native[93]).toBe(0);
    expect(f.w.ecology.mules[0].native[96]! & 2).toBe(0);
    expect(f.w.creatureNative[0]).toBe(f.w.ecology.mules[0].native);
    expect(f.w.ecology.ownerPlantCounts[0]).toBe(65535);
    validateSpatial(f.w.spatial);
  });
  it("rolls back player writes, map insertion and RNG after a late missing effect profile", () => {
    const f = fixture();
    f.pack.assets.EFF.animations![60].last = 999;
    const before = JSON.stringify(f.w),
      ecology = f.w.ecology,
      rng = f.w.rng;
    const r = stepCampaignPlants(f.w, f.pack, f.services);
    expect(r.committed).toBe(false);
    expect(r.reason).toMatch(/animation/);
    expect(JSON.stringify(f.w)).toBe(before);
    expect(f.w.ecology).toBe(ecology);
    expect(f.w.rng).toBe(rng);
  });
  it("rolls back retirement after unlink/owner decrement when an actual cleanup operand is unknown", () => {
    const f = fixture(),
      p = f.w.ecology.plants[8];
    p.growth = 0;
    p.plantFlags = 128;
    put16(p.native as number[], 44, 0);
    p.native[46] = 128;
    const n = f.w.creatureNative[0];
    n[6] = 1;
    n[24] = 4;
    n[91] = null;
    n[92] = 0;
    n[93] = 2;
    put16(n as number[], 7, 30000);
    put16(n as number[], 9, 30000);
    f.w.ecology.mules = [
      { id: "source:0:0", index: 0, native: n, pending: [] },
    ];
    insertSpatial(
      f.w.spatial,
      f.w.terrain,
      "source:0:0",
      worldCell(30000, 30000),
    );
    synchronizeCampaignLinks(f.w);
    const before = JSON.stringify(f.w),
      r = stepCampaignPlants(f.w, f.pack, f.services);
    expect(r.committed).toBe(false);
    expect(r.reason).toMatch(/uninitialized/);
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("preserves the standalone neutral wrapper and rejects an owned factory without its real host", () => {
    const f = fixture(),
      before = JSON.stringify(f.w.ecology);
    const rejected = stepPlants(
      f.w.ecology,
      f.w.terrain,
      f.w.rng,
      f.pack.ecologyRules!,
      -30000,
    );
    expect(rejected.committed).toBe(false);
    expect(rejected.reason).toMatch(/owner bookkeeping/);
    expect(JSON.stringify(f.w.ecology)).toBe(before);
    for (const i of [8, 16]) {
      f.w.ecology.plants[i].owner = 4;
      f.w.ecology.plants[i].native[24] = 4;
    }
    const r = stepPlants(
      f.w.ecology,
      f.w.terrain,
      f.w.rng,
      f.pack.ecologyRules!,
      -30000,
    );
    expect(r.committed, r.reason ?? undefined).toBe(true);
    expect(f.w.rng.draws).toBe(6);
    expect(f.w.ecology.plants[0].owner).toBe(4);
  });
  it("continues ordinary host births through JSON saves and a full sealed command replay", () => {
    const f = fixture(true),
      recording = recordCampaign(f.w, null),
      command = {
        type: "roster-target" as const,
        point: [9000, 9000] as [number, number],
      };
    expect(queueCampaign(f.w, command).ok).toBe(true);
    recording.commands.push({ tick: f.w.tick, type: "command", command });
    let loaded: CampaignWorld | null = null;
    for (let i = 0; i < 10; i++) {
      stepCampaign(f.w, f.pack);
      if (loaded) stepCampaign(loaded, f.pack);
      expect(f.w.phase, f.w.notices.at(-1)?.text).toBe("active");
      if (i === 1)
        loaded = loadCampaign(
          saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
          f.w.contentHash,
        ).world;
      if (loaded) expect(checksum(loaded)).toBe(checksum(f.w));
    }
    expect(f.w.ecology.plantCount).toBe(4);
    expect(f.w.ecology.ownerPlantCounts[0]).toBe(1);
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(recording, f.w),
          f.pack,
          f.w.contentHash,
        ),
      ),
    ).toBe(checksum(f.w));
  });
});
