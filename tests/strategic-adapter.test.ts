import { describe, expect, it } from "vitest";
import {
  addStrategicGenepod,
  campaignStrategicFixture,
} from "./fixtures/campaign-strategic";
import {
  stepCampaignStrategy,
  stepStagedCampaignStrategy,
} from "../src/sim/campaign/strategic-adapter";
import {
  queueCampaign,
  stepCampaign,
  validateCampaignWorld,
} from "../src/sim/campaign/world";
import { i16, u16, u32, put16, put32 } from "../src/sim/campaign/bytes";
import { checksum } from "../src/sim/checksum";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";

describe("concrete campaign strategic composition (synthetic content)", () => {
  it("runs every frame-zero planner in ascending player order without replacement services", () => {
    const { w, pack, services } = campaignStrategicFixture(),
      receipt = stepCampaignStrategy(w, pack, services);
    expect(receipt.players).toEqual([1, 2]);
    expect(receipt.events.map((e) => e.player)).toEqual([
      ...Array(8).fill(1),
      ...Array(8).fill(2),
    ]);
    for (const player of receipt.players) {
      expect(
        receipt.events.filter((e) => e.player === player).map((e) => e.routine),
      ).toEqual([
        0x37540, 0x37770, 0x35820, 0x35730, 0x32e60, 0x360b0, 0x3bf90, 0x33f60,
      ]);
      expect(w.strategy!.records[player][0x6ae]).toBe(7);
      expect(u32(w.strategy!.records[player], 6)).toBe(1);
    }
    expect(w.strategy!.records[0][0x6ae]).toBe(0);
    expect(w.actors.map((a) => a.id)).toEqual([0, 1]);
  });

  it("uses the current frame for cadence, independently of the host tick", () => {
    const f = campaignStrategicFixture({ computers: [1], frame: 32 });
    f.w.tick = 10;
    let r = stepCampaignStrategy(f.w, f.pack, f.services);
    expect(r.events.map((e) => e.routine)).toEqual([0x37540, 0x37770, 0x35820]);
    f.w.frame = 10;
    f.w.tick = 32;
    r = stepCampaignStrategy(f.w, f.pack, f.services);
    expect(r.events.map((e) => e.routine)).toEqual([
      0x35730, 0x32e60, 0x360b0, 0x3bf90, 0x33f60,
    ]);
    expect(u32(f.w.strategy!.records[1], 6)).toBe(2);
  });

  it("retains the real human and runtime gates before profile admission or host cloning", () => {
    for (const gate of ["human", "flags", "mode"] as const) {
      const f = campaignStrategicFixture({
        computers: gate === "human" ? [] : [1],
      });
      if (gate === "flags") f.w.flags &= ~4;
      if (gate === "mode") f.w.runtimeMode |= 2;
      delete f.pack.strategicAIRules;
      const before = checksum(f.w),
        actors = f.w.actors,
        rng = f.w.rng;
      expect(stepCampaignStrategy(f.w, f.pack, f.services)).toEqual({
        players: [],
        events: [],
        recruits: [],
      });
      expect(checksum(f.w)).toBe(before);
      expect(f.w.actors).toBe(actors);
      expect(f.w.rng).toBe(rng);
    }
    const f = campaignStrategicFixture({ computers: [1, 2] });
    f.w.source.source.context.activePlayerCount = 2;
    expect(stepCampaignStrategy(f.w, f.pack, f.services).players).toEqual([1]);
    expect(u32(f.w.strategy!.records[2], 6)).toBe(0);
  });

  it("creates real recruits, native bindings and shared landing effects inside the staged host", () => {
    const f = campaignStrategicFixture({ recruit: true }),
      players = f.w.players,
      raw = players.map((p) => p.raw),
      rng = f.w.rng;
    const r = stepStagedCampaignStrategy(f.w, f.pack, f.services);
    expect(f.w.players).toBe(players);
    expect(f.w.rng).toBe(rng);
    expect(f.w.players.every((p, i) => p.raw === raw[i])).toBe(true);
    expect(
      f.w.actors.filter((a) => a.owner > 0).map((a) => [a.id, a.ready]),
    ).toEqual([
      [5, false],
      [10, false],
    ]);
    expect(r.recruits).toHaveLength(4);
    expect(f.w.landings).toHaveLength(3);
    for (const owner of [1, 2]) {
      expect(f.w.players[owner].raw[3]).toBe(1);
      expect(f.w.players[owner].raw[4]).toBe(owner * 5);
      expect(f.w.specialists.records[owner * 5][6]).toBe(3);
      expect(f.w.specialists.bindings[owner * 5]).toMatchObject({
        owner,
        blueprintIndex: 0,
      });
    }
    expect(f.w.powerEffects.slots.filter((s) => s.occupied)).toHaveLength(3);
    expect(u16(f.w.missionPrefix, 0x3554)).toBe(3);
    validateCampaignWorld(f.w, f.w.contentHash);
  });

  it("submits real computer production without human admission or synthetic births", () => {
    const f = campaignStrategicFixture({ computers: [1] }),
      b = addStrategicGenepod(f.w, 64),
      p = f.w.players[1];
    p.funds = p.goop = 0;
    put32(p.raw, 0x4a3, 0);
    put32(p.raw, 0x4a7, 0);
    f.w.economy.players[1].goop = 0;
    const draws = f.w.rng.draws,
      count = f.w.ecology.mules.length;
    stepCampaignStrategy(f.w, f.pack, f.services);
    const n = f.w.buildingNative[b.slot];
    expect(u32(n as number[], 54)).toBe(75);
    expect(n[51]).toBe(4);
    expect(n[60]).toBe(2);
    expect(i16(n as number[], 58)).toBe(-1);
    expect(f.w.rng.draws).toBe(draws + 1);
    expect(f.w.players[1].funds).toBe(0);
    expect(f.w.players[1].goop).toBe(1000);
    expect(f.w.ecology.mules).toHaveLength(count);
  });

  it("rolls back the entire host when a later actual production profile is missing", () => {
    const f = campaignStrategicFixture({ recruit: true });
    addStrategicGenepod(f.w, 128);
    delete f.pack.ecologyRules!.speciesTraits;
    const before = checksum(f.w),
      raw = f.w.players[1].raw,
      terrain = f.w.terrain.bytes,
      rng = f.w.rng;
    // The staged entry proves the failure is reached after player1's real
    // creation/landing writes, rather than an up-front readiness rejection.
    const staged = structuredClone(f.w);
    expect(() =>
      stepStagedCampaignStrategy(staged, f.pack, f.services),
    ).toThrow(/species cost table/);
    expect(staged.actors.some((a) => a.id === 5)).toBe(true);
    expect(u32(staged.strategy!.records[1], 6)).toBe(1);
    expect(staged.landings.length).toBeGreaterThan(f.w.landings.length);
    expect(() => stepCampaignStrategy(f.w, f.pack, f.services)).toThrow(
      /species cost table/,
    );
    expect(checksum(f.w)).toBe(before);
    expect(f.w.players[1].raw).toBe(raw);
    expect(f.w.terrain.bytes).toBe(terrain);
    expect(f.w.rng).toBe(rng);
  });

  it("runs AI before queued commands and zones after their real production write", () => {
    const f = campaignStrategicFixture(),
      b = addStrategicGenepod(f.w, 0),
      order: [string, number, number][] = [];
    const genes = f.pack.strategicAIRules!.speciesGenes,
      zones = f.pack.zoneRules;
    Object.defineProperty(f.pack.strategicAIRules!, "speciesGenes", {
      get() {
        order.push([
          "AI",
          f.w.pending.length,
          u32(f.w.buildingNative[0] as number[], 54),
        ]);
        return genes;
      },
    });
    Object.defineProperty(f.pack, "zoneRules", {
      get() {
        order.push([
          "zones",
          f.w.pending.length,
          u32(f.w.buildingNative[0] as number[], 54),
        ]);
        return zones;
      },
    });
    f.w.missionPrefix[0x34b8] = 1;
    put16(f.w.missionPrefix, 0x355c, 0);
    f.w.countdown = 0;
    // An inactive actual zone admits the real7A280 callback and its profile,
    // while making no fabricated scoring/visitor callback necessary.
    put32(f.w.missionPrefix, 0x2ff8 + 14, 1024);
    f.w.missionPrefix[0x2ff8 + 18] = 0;
    expect(
      queueCampaign(f.w, { type: "produce-mule", buildingId: b.id }).ok,
    ).toBe(true);
    stepCampaign(f.w, f.pack);
    expect(f.w.phase).toBe("active");
    expect(f.w.frame).toBe(1);
    expect(order.find((row) => row[0] === "AI")).toEqual(["AI", 1, 0]);
    expect(order.find((row) => row[0] === "zones")).toEqual(["zones", 0, 75]);
    expect(order.findIndex((row) => row[0] === "zones")).toBeGreaterThan(
      order.findIndex((row) => row[0] === "AI"),
    );
    expect(f.w.notices.filter((n) => n.severity === "error")).toEqual([]);
  });

  it("preserves AI, recruits, RNG and native pools across ordinary save continuation and replay", () => {
    const f = campaignStrategicFixture({ recruit: true }),
      b = addStrategicGenepod(f.w, 0),
      replay = recordCampaign(f.w, "synthetic-composition"),
      command = { type: "produce-mule" as const, buildingId: b.id };
    expect(queueCampaign(f.w, command).ok).toBe(true);
    replay.commands.push({ tick: f.w.tick, type: "command", command });
    for (let i = 0; i < 3; i++) stepCampaign(f.w, f.pack);
    expect(f.w.phase).toBe("active");
    const resumed = loadCampaign(
      saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
      f.w.contentHash,
    ).world;
    for (let i = 0; i < 10; i++) {
      stepCampaign(f.w, f.pack);
      stepCampaign(resumed, f.pack);
    }
    expect(f.w.phase).toBe("active");
    expect(resumed.phase).toBe("active");
    expect(checksum(resumed)).toBe(checksum(f.w));
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(replay, f.w),
          f.pack,
          f.w.contentHash,
        ),
      ),
    ).toBe(checksum(f.w));
    expect(u32(f.w.strategy!.records[1], 6)).toBe(13);
    expect(f.w.notices.filter((n) => n.severity === "error")).toEqual([]);
  });
});
