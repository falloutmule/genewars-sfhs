import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
} from "../src/sim/campaign/world";
import {
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
} from "../src/sim/campaign/engineer-adapter";
import { retireStagedSharedEffect } from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import { i16 } from "../src/sim/campaign/bytes";
/**One public human order through actual charge/retirement/salvage callbacks.
 * Artwork, terrain, priors and coefficients are entirely synthetic. */
describe("human Engineer demolition full host", () => {
  it("plants charges, retires the building and preserves a working save/replay", () => {
    const pack = campaignFixture(),
      w = createCampaign(pack, "synthetic-human-demolition");
    enterCampaign(w, pack);
    for (let i = 0; i < 200; i++) stepCampaign(w, pack);
    pack.buildingRules = {
      schemaVersion: 1,
      resources: Array.from({ length: 14 }, (_, selector) => ({
        selector,
        path: `synthetic/${selector}.ANB`,
        assetKey: "TEST",
      })).filter((r) => r.selector !== 9),
      unsupportedSelectors: [9],
      upkeep: Array(14).fill(0),
      processingFrontOffset: [256, -128],
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    const options = {
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    };
    for (let i = 0; i < 200; i++)
      if (w.powerEffects.slots[i].occupied)
        retireStagedSharedEffect(w, i, options);
    pack.ecologyRules!.corpseFriction = Array(8).fill(256);
    pack.assets.EFF = structuredClone(pack.assets.EFF);
    const frames = pack.assets.EFF.frames!,
      animations = Array.from(
        { length: 71 },
        (_, code) =>
          pack.assets.EFF.animations![code] ?? {
            first: 0,
            last: 0,
            rawTrailingWord: 1,
          },
      );
    for (const [code, count] of [
      [10, 4],
      [45, 1],
      [50, 8],
      [51, 23],
    ]) {
      const first = frames.length;
      for (let i = 0; i < count; i++)
        frames.push({
          components: [],
          width: 1,
          height: 1,
          rawFlags: [code === 50 && i === 0 ? 2 : 0, 0, 0],
        });
      animations[code] = {
        first,
        last: frames.length - 1,
        rawTrailingWord: count,
      };
    }
    pack.assets.EFF.animations = animations;
    pack.effectRules = {
      schemaVersion: 1,
      descriptors: Array.from({ length: 71 }, (_, code) => ({
        code,
        retirementMode: code === 50 ? 5 : code === 45 ? 2 : 0,
        gravity: code === 45,
        priority: code === 45 ? 12 : code === 50 ? 1 : code === 51 ? 2 : 25,
        childCode: null,
        movable: code === 45,
        waterResponse: code === 45 || code === 50,
      })),
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    const a = w.actors[0],
      at: [number, number] = [
        ((a.motion.x >> 8) + 6) * 256 + 127,
        ((a.motion.y >> 8) + 1) * 256 + 127,
      ],
      made = createStagedCampaignEngineerBuilding(
        w,
        pack,
        { effectOptions: () => options },
        { code: 44, owner: 1, selector: 6, point: at, height: 2048 },
      );
    if (!made) throw Error("synthetic building capacity");
    const slot = made.buildingSlot;
    progressCampaignEngineerBuilding(w, pack, slot, 1000);
    for (let i = 0; i < 200; i++)
      if (w.powerEffects.slots[i].occupied)
        retireStagedSharedEffect(w, i, options);
    const funds = w.players[0].funds,
      command = {
        type: "demolish-building" as const,
        actorId: 0,
        buildingSlot: slot,
      },
      replay = recordCampaign(w, null);
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    let workingSave: string | null = null,
      sawCharge = false,
      retiredAt: number | null = null,
      creditedAt: number | null = null;
    for (let i = 0; i < 1600 && w.phase === "active"; i++) {
      stepCampaign(w, pack);
      sawCharge ||= w.powerEffects.slots.some(
        (s) => s.occupied && s.nativePrior?.[69] === 50,
      );
      if (sawCharge && !workingSave)
        workingSave = saveCampaign(w, {
          paused: true,
          speed: 1,
          accumulator: 0,
        });
      if (w.buildingNative[slot][6] === 0) {
        retiredAt = w.frame;
        break;
      }
      expect(w.players[0].funds).toBe(funds);
    }
    expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
    expect(sawCharge).toBe(true);
    expect(retiredAt).not.toBeNull();
    expect(workingSave).not.toBeNull();
    const resumed = loadCampaign(workingSave!, w.contentHash).world;
    while (resumed.frame < w.frame && resumed.phase === "active")
      stepCampaign(resumed, pack);
    expect(checksum(resumed)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
    const salvage = w.powerEffects.slots.find(
      (s) => s.occupied && s.nativePrior?.[69] === 45,
    );
    if (w.players[0].funds > funds) creditedAt = w.frame;
    else {
      expect(salvage).toBeDefined();
      const n = salvage!.nativePrior!,
        move = {
          type: "move" as const,
          actorId: 0,
          point: [i16(n as number[], 7), i16(n as number[], 9)] as [
            number,
            number,
          ],
          queued: false,
        };
      expect(queueCampaign(w, move).ok).toBe(true);
      for (let i = 0; i < 400 && w.phase === "active"; i++) {
        stepCampaign(w, pack);
        if (w.players[0].funds > funds) {
          creditedAt = w.frame;
          break;
        }
      }
    }
    expect(creditedAt).not.toBeNull();
    expect(creditedAt!).toBeGreaterThanOrEqual(retiredAt!);
    expect(w.players[0].funds).toBeGreaterThan(funds);
  }, 60000);
});
