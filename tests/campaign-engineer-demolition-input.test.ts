import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
  CampaignCommandSchema,
  type CampaignCommand,
} from "../src/sim/campaign/world";
import {
  campaignEngineerDemolitionTarget,
  requestCampaignEngineerDemolition,
} from "../src/sim/campaign/human-engineer-command-adapter";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { worldCell } from "../src/sim/mechanics/terrain";
import { put16, put32, i16, u16 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { checksum } from "../src/sim/checksum";
/**Synthetic active targets isolate human input; ordinary charge/retirement
 * callbacks have their existing host tests. No campaign acceptance is claimed. */
describe("human Engineer demolition input", () => {
  let initial: ReturnType<typeof setup>;
  function setup() {
    const pack = campaignFixture(),
      w = createCampaign(pack, "synthetic-engineer-demolition-input");
    enterCampaign(w, pack);
    for (let i = 0; i < 200; i++) stepCampaign(w, pack);
    expect(w.phase).toBe("active");
    w.flags &= ~4;
    return { pack, w };
  }
  beforeAll(() => {
    initial = setup();
  });
  function fixture(selector = 6, owner = 1) {
    const { w, pack } = structuredClone(initial),
      slot = owner * 64,
      n: (number | null)[] = Array(67).fill(0);
    n.fill(null, 31, 39);
    n[6] = 4;
    n[24] = owner;
    n[45] = selector;
    n[49] = 1;
    put16(n as number[], 15, slot);
    put16(n as number[], 7, 12000);
    put16(n as number[], 9, 10000);
    put16(n as number[], 43, 80);
    put32(n as number[], 17, 2048);
    w.buildingNative[slot] = n;
    w.buildings.push({
      id: 1000 + slot,
      slot,
      owner,
      selector,
      x: 12000,
      y: 10000,
      grade: 0,
      health: 80,
      complete: true,
      energy: 0,
    });
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:3:${slot}`,
      worldCell(12000, 10000),
    );
    synchronizeCampaignLinks(w);
    return { w, pack, slot, n };
  }
  it.each([0, 1, 2, 3, 4, 6, 11, 13])(
    "installs selector%i through81080/51960 with pending save and replay",
    (selector) => {
      const { w, pack, slot } = fixture(selector),
        command: CampaignCommand = {
          type: "demolish-building",
          actorId: 0,
          buildingSlot: slot,
        },
        replay = recordCampaign(w, null),
        rng = checksum(w.rng),
        funds = w.players[0].funds,
        goop = w.players[0].goop;
      expect(campaignEngineerDemolitionTarget(w, slot)).toBe(true);
      expect(queueCampaign(w, command).ok).toBe(true);
      replay.commands.push({ tick: w.tick, type: "command", command });
      const loaded = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      const actor = w.specialists.records[0];
      expect([
        actor[126],
        actor[130],
        i16(actor as number[], 127),
        actor[129],
      ]).toEqual([1, 1, slot, 4]);
      expect(w.buildingNative[slot][50]! & 16).toBe(16);
      expect(w.buildingNative[slot][6]).toBe(4);
      expect([w.players[0].funds, w.players[0].goop]).toEqual([funds, goop]);
      expect(checksum(w.rng)).toBe(rng);
      expect(checksum(loaded)).toBe(checksum(w));
      expect(
        checksum(
          replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
        ),
      ).toBe(checksum(w));
    },
  );
  it("admits your own structure without transferring ownership or instantly refunding it", () => {
    const { w, pack, slot } = fixture(6, 0),
      before = w.players[0].funds;
    expect(
      queueCampaign(w, {
        type: "demolish-building",
        actorId: 0,
        buildingSlot: slot,
      }).ok,
    ).toBe(true);
    stepCampaign(w, pack);
    expect(w.buildingNative[slot][24]).toBe(0);
    expect(w.players[0].funds).toBe(before);
    expect(
      w.powerEffects.slots.some(
        (s) => s.occupied && s.nativePrior?.[69] === 45,
      ),
    ).toBe(false);
  });
  it("rejects invisible, retired, dead, already-timed and unconverted targets before queuing", () => {
    for (const mutation of [
      "hidden",
      "retired",
      "dead",
      "timed",
      "family5",
      "family12",
      "unknown",
    ]) {
      const { w, slot, n } = fixture();
      if (mutation === "hidden")
        w.terrain.bytes[worldCell(12000, 10000) * 14 + 12] = 0;
      if (mutation === "retired") n[6] = 0;
      if (mutation === "dead") put16(n as number[], 43, 0);
      if (mutation === "timed") put16(n as number[], 49, 0x801);
      if (mutation === "family5") n[45] = 5;
      if (mutation === "family12") n[45] = 12;
      if (mutation === "unknown") n[43] = null;
      const before = checksum(w);
      expect(
        queueCampaign(w, {
          type: "demolish-building",
          actorId: 0,
          buildingSlot: slot,
        }).ok,
        mutation,
      ).toBe(false);
      expect(checksum(w)).toBe(before);
    }
  });
  it("keeps the actor unchanged when a queued target disappears before consumption", () => {
    const { w, pack, slot, n } = fixture();
    queueCampaign(w, {
      type: "demolish-building",
      actorId: 0,
      buildingSlot: slot,
    });
    n[6] = 0;
    const before = w.specialists.records[0].slice();
    stepCampaign(w, pack);
    expect(w.specialists.records[0]).toEqual(before);
    expect(w.phase).toBe("active");
    expect(w.notices.at(-1)?.severity).toBe("warning");
  });
  it("preserves authority and structural bounds", () => {
    const { w, slot } = fixture();
    w.selectedPlayer = 1;
    const before = checksum(w);
    expect(
      queueCampaign(w, {
        type: "demolish-building",
        actorId: 0,
        buildingSlot: slot,
      }).ok,
    ).toBe(false);
    expect(checksum(w)).toBe(before);
    expect(
      CampaignCommandSchema.safeParse({
        type: "demolish-building",
        actorId: 0,
        buildingSlot: 256,
      }).success,
    ).toBe(false);
    expect(
      CampaignCommandSchema.safeParse({
        type: "demolish-building",
        actorId: 20,
        buildingSlot: slot,
      }).success,
    ).toBe(false);
  });
  it("does not install work when the actual human eligibility bit is clear", () => {
    const { w, pack, slot } = fixture();
    w.specialists.records[0][112] = w.specialists.records[0][112]! & 254;
    const before = checksum(w);
    expect(
      requestCampaignEngineerDemolition(w, 0, slot, pack, {
        effectOptions: () => ({
          gravity: 512,
          obstacleAt: () => false,
          cleanupReferences: cleanupCampaignReferences,
        }),
      }).outcome,
    ).toBe("ignored");
    expect(checksum(w)).toBe(before);
  });
  it("allows normal Stop before activation without inventing charge or salvage effects", () => {
    const { w, pack, slot } = fixture();
    queueCampaign(w, {
      type: "demolish-building",
      actorId: 0,
      buildingSlot: slot,
    });
    stepCampaign(w, pack);
    const beforeEffects = checksum(w.powerEffects);
    queueCampaign(w, { type: "cancel", actorId: 0 });
    stepCampaign(w, pack);
    expect([
      w.specialists.records[0][126],
      w.specialists.records[0][130],
    ]).toEqual([255, 0]);
    expect(w.buildingNative[slot][6]).toBe(4);
    expect(checksum(w.powerEffects)).toBe(beforeEffects);
    expect(u16(w.buildingNative[slot] as number[], 49) & 0x800).toBe(0);
  });
});
