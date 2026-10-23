import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { decodeBytes, encodeBytes, put32 } from "../src/sim/campaign/bytes";
import { createCampaign, enterCampaign, queueCampaign, stepCampaign, validateCampaignWorld, type CampaignWorld } from "../src/sim/campaign/world";
import { saveCampaign, loadCampaign, recordCampaign, sealCampaignReplay, replayCampaign } from "../src/sim/campaign/persistence";
import { readShepherdOperators } from "../src/sim/mechanics/shepherd";
import { campaignMuleDamageContext } from "../src/sim/campaign/mule-damage-adapter";
import { checksum } from "../src/sim/checksum";

describe("native Shepherd campaign control", () => {
  const pack = campaignFixture(); let start: CampaignWorld, index: number;
  beforeAll(() => {
    //A public synthetic later-progress carry exercises the normal constructor
    //and landing, without claiming a canonical later-mission initialization.
    const prior = createCampaign(pack, "shepherd-host"), startup = pack.missions[0].startup!;
    prior.players[0].progress = prior.players[0].raw[0x6e7] = 4;
    startup.context.actorMask = 15;
    const prefix = decodeBytes(startup.missionPrefixBase64); put32(prefix, 0x1ec2, 1000000);
    startup.missionPrefixBase64 = encodeBytes(prefix);
    start = createCampaign(pack, "shepherd-host", 1, { players: prior.players, selectedPlayer: 0,
      world: prior.retainedWorld, rngRing: prior.rng.ring });
    enterCampaign(start);
    for (let i = 0; i < 240; i++) stepCampaign(start, pack);
    index = start.actors.find(a => start.specialists.bindings[a.id]?.category === 3)!.id;
    expect(start.actors.find(a => a.id === index)!.ready, JSON.stringify({ phase: start.phase, notices: start.notices, landing: start.landings })).toBe(true);
    expect(start.notices.filter(n => n.severity === "error")).toEqual([]);
  });
  it("admits the actual Shepherd command and exposes its current native operator to Mule services", () => {
    const w = structuredClone(start), actor = w.actors.find(a => a.id === index)!;
    expect(queueCampaign(w, { type: "shepherd-control", actorId: 0, mode: 0, point: [8192, 8192] })).toEqual({ ok: false, reason: "Select a landed Shepherd" });
    expect(queueCampaign(w, { type: "shepherd-control", actorId: index, mode: 2, point: [actor.motion.x, actor.motion.y] }).ok).toBe(true);
    stepCampaign(w, pack);
    const n = w.specialists.records[index], operators = readShepherdOperators(w);
    expect([n[85], n[126], n[130], n[112]! & 128, n[139]]).toEqual([12, 0, 1, 128, 2]);
    expect(w.actors.find(a => a.id === index)!.reason).toBe("Controlling nearby creatures");
    expect(operators).toHaveLength(1);
    expect(operators[0]).toMatchObject({ index, owner: 0, mode: 2, enabled: 1, commandState: 0 });
    expect(campaignMuleDamageContext(w, pack).owned!.operators).toEqual(operators);
    validateCampaignWorld(w, "shepherd-host");
  });
  it("persists active herd control and replays its ordinary command through the actual campaign", () => {
    const w = structuredClone(start), replay = recordCampaign(w, null), command = {
      type: "shepherd-control" as const, actorId: index, mode: 0 as const, point: [8192, 8192] as [number, number],
    };
    expect(queueCampaign(w, command).ok).toBe(true); replay.commands.push({ tick: w.tick, type: "command", command });
    for (let i = 0; i < 10; i++) stepCampaign(w, pack);
    const loaded = loadCampaign(saveCampaign(w, { paused: true, speed: 2, accumulator: 1 }), "shepherd-host").world;
    for (let i = 0; i < 20; i++) { stepCampaign(w, pack); stepCampaign(loaded, pack); }
    expect(checksum(loaded)).toBe(checksum(w));
    expect(w.notices.filter(n => n.severity === "error")).toEqual([]);
    expect(checksum(replayCampaign(sealCampaignReplay(replay, w), pack, "shepherd-host"))).toBe(checksum(w));
  });
  it("uses native movement and Stop to release active control and pending modern orders", () => {
    const w = structuredClone(start);
    queueCampaign(w, { type: "shepherd-control", actorId: index, mode: 0, point: [8192, 8192] }); stepCampaign(w, pack);
    queueCampaign(w, { type: "move", actorId: index, point: [9000, 8500], queued: false }); stepCampaign(w, pack);
    expect(w.specialists.records[index][85]).toBe(8); expect(readShepherdOperators(w)).toEqual([]);
    queueCampaign(w, { type: "move", actorId: index, point: [9500, 8500], queued: true }); stepCampaign(w, pack);
    expect(w.actors.find(a => a.id === index)!.orders).toHaveLength(1);
    queueCampaign(w, { type: "cancel", actorId: index }); stepCampaign(w, pack);
    expect(w.actors.find(a => a.id === index)!.orders).toEqual([]);
    expect(w.specialists.records[index][130]).toBe(0); expect(readShepherdOperators(w)).toEqual([]);
    expect(w.notices.filter(n => n.severity === "error")).toEqual([]);
  });
});
