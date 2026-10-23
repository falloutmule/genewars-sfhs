import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { PackSchema } from "../src/content/types";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
  validateCampaignWorld,
  continueCampaign,
} from "../src/sim/campaign/world";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
describe("campaign host, separate from the workbench", () => {
  it("preserves the valid result when the next startup rejects a missing family", () => {
    const p = campaignFixture(),
      w = createCampaign(p, "fixture");
    enterCampaign(w);
    for (let i = 0; i < 200; i++) stepCampaign(w, p);
    w.phase = "result";
    w.result.phase = "campaign-view-queued";
    p.missions[1].startup!.context.specialActivation = 1;
    const before = checksum(w);
    expect(() => continueCampaign(w, p)).toThrow(
      /Immediate mission activation/,
    );
    expect(checksum(w)).toBe(before);
  });
  it("validates normalized content and initializes real blueprint selection/RNG", () => {
    const p = PackSchema.parse(campaignFixture()),
      w = createCampaign(p, "fixture");
    expect(w.actors.map((a) => a.blueprintIndex)).toEqual([0, 10]);
    expect(w.rng.draws).toBe(64);
    expect(w.actors.every((a) => !a.ready)).toBe(true);
    expect(w.players[0].funds).toBe(4000);
    expect(w.players[0].goop).toBe(0);
    expect(() => createCampaign(p, "fixture", 2)).toThrow(/carry/);
  });
  it("lands, accepts paused commands, persists and replays full source state", () => {
    const p = campaignFixture(),
      w = createCampaign(p, "fixture");
    enterCampaign(w);
    for (let i = 0; i < 200; i++) stepCampaign(w, p);
    expect(w.phase).toBe("active");
    expect(w.actors.every((a) => a.ready)).toBe(true);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    const r = recordCampaign(w, null),
      command = {
        type: "move" as const,
        actorId: 0,
        point: [8500, 8300] as [number, number],
        queued: false,
      };
    expect(queueCampaign(w, command).ok).toBe(true);
    r.commands.push({ tick: w.tick, type: "command", command });
    for (let i = 0; i < 20; i++) stepCampaign(w, p);
    // A save loses JS aliases between the actor and construction projection.
    // Resume both worlds through ordinary travel before comparing the replay.
    const resumed = loadCampaign(
      saveCampaign(w, { paused: false, speed: 1, accumulator: 0 }),
      "fixture",
    ).world;
    for (let i = 0; i < 20; i++) {
      stepCampaign(w, p);
      stepCampaign(resumed, p);
    }
    expect(checksum(resumed)).toBe(checksum(w));
    const saved = saveCampaign(w, { paused: true, speed: 2, accumulator: 7 }),
      s = loadCampaign(saved, "fixture");
    expect(checksum(s.world)).toBe(checksum(w));
    expect(s.session).toEqual({ paused: true, speed: 2, accumulator: 7 });
    expect(
      checksum(replayCampaign(sealCampaignReplay(r, w), p, "fixture")),
    ).toBe(checksum(w));
    expect(() => loadCampaign(saved, "other")).toThrow(/Incompatible/);
    validateCampaignWorld(w, "fixture");
  });
  it("rejects checksum tampering and workbench promotion", () => {
    const w = createCampaign(campaignFixture(), "fixture"),
      s = JSON.parse(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      );
    s.world.players[0].funds++;
    expect(() => loadCampaign(JSON.stringify(s), "fixture")).toThrow(
      /checksum/,
    );
    s.kind = "genewars-workbench";
    expect(() => loadCampaign(JSON.stringify(s), "fixture")).toThrow(
      /Workbench/,
    );
  });
  it("replays briefing entry and orders issued at the final tick", () => {
    const p = campaignFixture(),
      w = createCampaign(p, "fixture"),
      r = recordCampaign(w, "synthetic-source");
    r.commands.push({ tick: w.tick, type: "enter" });
    enterCampaign(w);
    expect(
      checksum(replayCampaign(sealCampaignReplay(r, w), p, "fixture")),
    ).toBe(checksum(w));
    for (let i = 0; i < 200; i++) stepCampaign(w, p);
    const command = {
      type: "move" as const,
      actorId: 0,
      point: [8500, 8300] as [number, number],
      queued: false,
    };
    expect(queueCampaign(w, command).ok).toBe(true);
    r.commands.push({ tick: w.tick, type: "command", command });
    const sealed = sealCampaignReplay(r, w);
    expect(checksum(replayCampaign(sealed, p, "fixture"))).toBe(checksum(w));
    const altered = structuredClone(sealed);
    altered.initialRng.seed ^= 1;
    expect(() => replayCampaign(altered, p, "fixture")).toThrow(/timeline/);
    altered.initialRng = structuredClone(altered.initial.rng);
    altered.final!.carryHash = "invalid";
    expect(() => replayCampaign(altered, p, "fixture")).toThrow(
      /final mismatch/,
    );
  });
});
