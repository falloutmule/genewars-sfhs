import { describe, expect, it } from "vitest";
import { processorFixture } from "./fixtures/processor";
import {
  createCampaign,
  enterCampaign,
  queueCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { createNativeBuilding } from "../src/sim/mechanics/building-native";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import { put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
describe("native Engineer Pulper construction", () => {
  it("retains43E30 pending material, energy, drain and opaque bytes while clearing only the generic material stock", () => {
    const prior: (number | null)[] = Array.from(
      { length: 67 },
      (_, i) => (i * 17 + 5) & 255,
    );
    prior.fill(null, 31, 39);
    prior[6] = 0;
    prior[51] = 77;
    prior[63] = 3;
    put16(prior as number[], 61, 29);
    put32(prior as number[], 54, 123456);
    const made = createNativeBuilding(prior, {
      slot: 0,
      owner: 0,
      selector: 2 as const,
      position: [8192, 8192],
      ground: 4096,
      shade: 127,
    });
    if (!made.ok) throw Error(made.reason);
    expect([
      made.value[51],
      made.value[52],
      made.value[53],
      made.value[58],
      made.value[59],
      made.value[63],
      made.value[48],
      made.value[30],
    ]).toEqual([
      77,
      prior[52],
      prior[53],
      prior[58],
      prior[59],
      3,
      prior[48],
      prior[30],
    ]);
    expect(u16(made.value as number[], 61)).toBe(29);
    expect(u32(made.value as number[], 54)).toBe(0);
    expect(prior[6]).toBe(0);
  });
  it("constructs through ordinary terrain jobs, real44 appearance and source payment, then processes retained51 with live-work save/replay", () => {
    const { pack } = processorFixture();
    pack.rules!.tables.buildingFootprints[2] = 2;
    pack.rules!.tables.constructionCosts[2] = 300;
    pack.rules!.tables.buildingHealth[6] = 160;
    pack.rules!.tables.buildingProgressThresholds[6] = 0;
    pack.rules!.tables.buildingPrerequisites[2] = 0;
    const first = pack.assets.EFF.frames!.length;
    pack.assets.EFF.frames!.push(
      ...Array.from({ length: 9 }, () => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [0, 0, 0],
      })),
    );
    pack.assets.EFF.animations![44] = {
      first,
      last: first + 8,
      rawTrailingWord: 9,
    };
    pack.effectRules!.descriptors[44] = {
      code: 44,
      retirementMode: 0,
      gravity: false,
      priority: 5,
      childCode: null,
      movable: false,
      waterResponse: false,
    };
    const w = createCampaign(pack, "synthetic-pulper-construction");
    enterCampaign(w, pack);
    for (let i = 0; i < 200; i++) stepCampaign(w, pack);
    w.buildingNative[0][51] = 9; //Explicit retained inactive prior, before recording.
    const recording = recordCampaign(w, "synthetic-pulper-construction"),
      funds = w.players[0].funds;
    const command = {
      type: "construct" as const,
      actorId: 0,
      selector: 2 as const,
      point: [9216, 8192] as [number, number],
      queued: false,
    };
    expect(queueCampaign(w, command)).toEqual({ ok: true, reason: null });
    recording.commands.push({ tick: w.tick, type: "command", command });
    let resumed: typeof w | null = null;
    for (let i = 0; i < 1600; i++) {
      stepCampaign(w, pack);
      if (resumed) {
        stepCampaign(resumed, pack);
        expect(checksum(resumed)).toBe(checksum(w));
      }
      expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
      const b = w.buildings.find((b) => b.selector === 2);
      if (b && !b.complete && !resumed)
        resumed = loadCampaign(
          saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
          w.contentHash,
        ).world;
      if (b?.complete) break;
    }
    expect(resumed).not.toBeNull();
    const b = w.buildings.find((b) => b.selector === 2)!;
    expect(b.complete).toBe(true);
    const skill = w.players[0].blueprints[w.actors[0].blueprintIndex].skill;
    expect(w.players[0].funds).toBe(funds - (300 - 2 * skill));
    expect(u32(w.buildingNative[b.slot] as number[], 54)).toBe(9);
    expect(w.buildingNative[b.slot][51]).toBe(0);
    expect(w.players[0].raw[0x602]).toBe(1);
    expect(w.players[0].raw[0x60e]! & 4).toBe(4);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  }, 30000);
});
