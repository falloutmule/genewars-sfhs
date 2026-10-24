import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  queueCampaign,
  stepCampaign,
  validateCampaignWorld,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
  campaignEngineerContext,
} from "../src/sim/campaign/engineer-adapter";
import {
  queueEngineerPlacement,
  type EngineerCallbackContext,
} from "../src/sim/mechanics/engineer";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { i16, u16 } from "../src/sim/campaign/bytes";
import { checksum } from "../src/sim/checksum";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";

describe("native Engineer campaign ports", () => {
  const pack = campaignFixture();
  const services: CampaignSpecialistServices = {
    effectOptions: () => ({
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  let start: CampaignWorld;
  beforeAll(() => {
    // Ordinary construction now enters the full native producer callback,
    // including its required imported-resource boundary. Synthetic resource.
    pack.buildingRules = {
      schemaVersion: 1,
      resources: [{ selector: 3, assetKey: "TEST", path: "SYNTHETIC/3.ANB" }],
      unsupportedSelectors: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      upkeep: Array(14).fill(1),
      processingFrontOffset: [0, 0],
      provenance: { executableSha256: "0".repeat(64), originalExecution: false },
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
    start = createCampaign(pack, "engineer-host");
    enterCampaign(start);
    for (let i = 0; i < 200; i++) stepCampaign(start, pack);
    expect(start.phase).toBe("active");
    expect(start.actors[0].ready).toBe(true);
  });
  it("creates the real first-free building and shared44 once, retaining native identity through441C0", () => {
    const w = structuredClone(start),
      prior = w.buildingNative[0];
    prior[48] = 37;
    const made = createStagedCampaignEngineerBuilding(w, pack, services, {
      code: 44,
      owner: 0,
      selector: 11,
      point: [9087, 8319],
      height: 1024,
    });
    expect(made).not.toBeNull();
    expect(made!.buildingSlot).toBe(0);
    expect(w.buildingNative[0]).toBe(prior);
    expect(prior[48]).toBe(37);
    expect(w.buildings).toHaveLength(1);
    expect(w.powerEffects.slots[made!.effectSlot].nativePrior![69]).toBe(44);
    expect(u16(w.missionPrefix, 0x3554)).toBe(
      w.powerEffects.slots.filter((s) => s.occupied).length,
    );
    expect(w.players[0].raw[0x4a2]).toBe(1);
    expect(progressCampaignEngineerBuilding(w, pack, 0, 1).completed).toBe(
      false,
    );
    expect(progressCampaignEngineerBuilding(w, pack, 0, 120).completed).toBe(
      true,
    );
    expect(w.buildingNative[0]).toBe(prior);
    expect(i16(prior as number[], 43)).toBe(80);
    expect(w.buildings[0]).toMatchObject({
      id: 1000,
      health: 80,
      complete: true,
      energy: 200,
    });
    expect(w.players[0].completed[11]).toBe(1);
    expect(w.players[0].owned & (1 << 11)).not.toBe(0);
    expect(w.economy.players[0].capacity).toBe(600);
  });
  it("rejects full owner building capacity before allocating a shared effect", () => {
    const w = structuredClone(start);
    for (let slot = 0; slot < 64; slot++) w.buildingNative[slot][6] = 4;
    const before = checksum(w);
    expect(
      createStagedCampaignEngineerBuilding(w, pack, services, {
        code: 44,
        owner: 0,
        selector: 3,
        point: [9087, 8319],
        height: 1024,
      }),
    ).toBeNull();
    expect(checksum(w)).toBe(before);
  });
  it("rolls back a late placement resolver failure across terrain, resources and held records", () => {
    const w = structuredClone(start),
      before = checksum(w),
      context = campaignEngineerContext(w, pack, services);
    const original = context.resolvePlacementPoint!;
    let calls = 0;
    const failing: EngineerCallbackContext<CampaignWorld> = {
      ...context,
      resolvePlacementPoint(s, index, origin, point) {
        const result = original(s, index, origin, point);
        s.players[0].funds--;
        s.terrain.bytes[11] |= 1;
        if (++calls === 2) throw Error("late placement service failure");
        return result;
      },
    };
    expect(() =>
      queueEngineerPlacement(
        w,
        0,
        { callerOwner: 0, selector: 3, point: [9087, 8319] },
        failing,
      ),
    ).toThrow(/late placement/);
    expect(checksum(w)).toBe(before);
  });
  it("uses native task bytes for ordinary queued commands, cancellation and full save/replay", () => {
    const w = structuredClone(start),
      replay = recordCampaign(w, null);
    const command = {
      type: "construct" as const,
      actorId: 0,
      selector: 3 as const,
      point: [9087, 8319] as [number, number],
      queued: false,
    };
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    for (let i = 0; i < 120 && !(w.specialists.records[0][88]! & 1); i++)
      stepCampaign(w, pack);
    expect(w.specialists.records[0][85]).toBe(9);
    expect(w.specialists.records[0][88]! & 1).toBe(1);
    expect(w.builders[0].task).toBeNull();
    const queued = {
      type: "move" as const,
      actorId: 0,
      point: [9500, 8500] as [number, number],
      queued: true,
    };
    expect(queueCampaign(w, queued).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command: queued });
    stepCampaign(w, pack);
    expect(w.actors[0].orders).toHaveLength(1);
    for (let i = 0; i < 40; i++) stepCampaign(w, pack);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      "engineer-host",
    ).world;
    for (let i = 0; i < 10; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
    }
    expect(checksum(loaded)).toBe(checksum(w));
    expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
    const cancel = { type: "cancel" as const, actorId: 0 };
    expect(queueCampaign(w, cancel).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command: cancel });
    stepCampaign(w, pack);
    expect(w.specialists.records[0][88]! & 1).toBe(0);
    expect(w.specialists.records[0][130]).toBe(0);
    expect(w.actors[0].orders).toEqual([]);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    validateCampaignWorld(w, "engineer-host");
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, "engineer-host"),
      ),
    ).toBe(checksum(w));
  });
});
