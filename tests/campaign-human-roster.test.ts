import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, enterCampaign, queueCampaign, stepCampaign, type CampaignCommand } from "../src/sim/campaign/world";
import { saveCampaign, loadCampaign, recordCampaign, sealCampaignReplay, replayCampaign } from "../src/sim/campaign/persistence";
import { campaignHumanRosterView } from "../src/sim/campaign/human-roster-adapter";
import { checksum } from "../src/sim/checksum";
import { put16, put32, i16, decodeBytes, encodeBytes, u32 } from "../src/sim/campaign/bytes";

/** Synthetic inputs exercise the ordinary host, never campaign acceptance. */
function fixture() {
  const pack = campaignFixture(), eff = structuredClone(pack.assets.EFF), frame = eff.frames![0];
  eff.frames = [];
  eff.animations = Array.from({length: 71}, (_, code) => {
    const count = ({6: 13, 26: 5, 47: 6, 51: 23, 64: 5} as Record<number, number>)[code] ?? 1, first = eff.frames!.length;
    for (let i = 0; i < count; i++) eff.frames!.push({...structuredClone(frame), rawFlags: [code === 64 || code === 26 ? 1 : 0, 0, 0]});
    return {first, last: first + count - 1, rawTrailingWord: count};
  });
  pack.assets.EFF = eff;
  pack.effectRules = {schemaVersion: 1, descriptors: Array.from({length: 71}, (_, code) => ({code,
    retirementMode: code === 64 ? 6 : 0, gravity: code === 64, priority: code === 51 ? 2 : 1,
    childCode: code === 64 ? 51 : null, movable: code === 64, waterResponse: code === 64})),
    provenance: {executableSha256: "0".repeat(64), originalExecution: false}};
  const w = createCampaign(pack, "synthetic-queued-human-roster");
  // Arrange a later-progress empty initial roster. This does not prove carry.
  w.players[0].raw[0x6e7] = w.players[0].progress = 4;
  w.players[0].raw[3] = 0; w.players[0].raw[0x498] = 0;
  w.actors = []; w.builders = []; w.missionPrefix[0x1ebd] = 15;
  for (let slot = 0; slot < 5; slot++) {w.specialists.records[slot][6] = 0; w.specialists.bindings[slot] = null;}
  for (const bp of w.players[0].blueprints) {bp.runtimeFlags = 0; w.players[0].raw[0x16 + bp.index * 36 + 32] = 0;}
  return {pack, w};
}

describe("human roster ordinary campaign command dispatch", () => {
  it("dispatches queued7/8/9/10 in order, saves pending commands and replays the complete landing", () => {
    const {w, pack} = fixture(); enterCampaign(w, pack);
    //Exercise numeric queued dispatch in an explicitly arranged running host.
    //This is not evidence of an unassociated panel reopening in campaign play.
    w.flags |= 4; delete w.initialRecruitmentPanel;
    const replay = recordCampaign(w, null), commands: CampaignCommand[] = [
      {type: "roster-select", blueprintIndex: 0}, {type: "roster-select", blueprintIndex: 10},
      {type: "roster-deselect", blueprintIndex: 10}, {type: "roster-target", point: [8000, 9000]},
      {type: "roster-deploy", deployment: 1, associatedBuilding: null},
    ];
    for (const command of commands) {expect(queueCampaign(w, command).ok).toBe(true); replay.commands.push({tick: w.tick, type: "command", command});}
    expect(w.players[0].raw[3]).toBe(0);
    const resumed = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    for (let tick = 0; tick < 200; tick++) {stepCampaign(w, pack); stepCampaign(resumed, pack);}
    expect(w.phase, JSON.stringify(w.notices)).toBe("active");
    expect(w.players[0].raw[3]).toBe(1); expect(w.actors.find(a => a.id === 0)?.ready).toBe(true);
    expect(campaignHumanRosterView(w).pending.map(p => [p.blueprintIndex, p.waiting])).toEqual([[0, false]]);
    expect(w.notices.filter(n => n.severity !== "info")).toEqual([]);
    expect(checksum(resumed)).toBe(checksum(w));
    expect(checksum(replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash))).toBe(checksum(w));
  });
  it("saves initial panel input while native frame is frozen, then launches and replays exactly", () => {
    const {w, pack} = fixture(), replay = recordCampaign(w, null);
    replay.commands.push({tick: w.tick, type: "enter"}); enterCampaign(w, pack);
    expect(w.initialRecruitmentPanel).toBe("open"); expect(w.flags & 4).toBe(0);
    const rng = structuredClone(w.rng), terrain = w.terrain.bytes.slice(), countdown = w.countdown;
    expect(queueCampaign(w, {type: "roster-deploy", deployment: 1, associatedBuilding: null}).ok).toBe(false);
    for (const blueprintIndex of [0, 10]) {
      const command = {type: "roster-select" as const, blueprintIndex};
      expect(queueCampaign(w, command).ok).toBe(true); replay.commands.push({tick: w.tick, type: "command", command});
      stepCampaign(w, pack);
    }
    expect(w.frame).toBe(0); expect(w.tick).toBe(2); expect(w.rng).toEqual(rng);
    expect(w.countdown).toBe(countdown); expect(w.terrain.bytes).toEqual(terrain); expect(w.landings).toEqual([]);
    const resumed = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    const command = {type: "roster-deploy" as const, deployment: 1 as const, associatedBuilding: null};
    replay.commands.push({tick: w.tick, type: "command", command});
    for (const host of [w, resumed]) {expect(queueCampaign(host, command).ok).toBe(true); expect(host.flags & 4).toBe(0); expect(host.initialRecruitmentLaunch?.runFlag).toBe(true); expect(host.initialRecruitmentPanel).toBe("closed");}
    for (let tick = 0; tick < 200; tick++) {stepCampaign(w, pack); stepCampaign(resumed, pack);}
    expect(w.phase, JSON.stringify(w.notices)).toBe("active"); expect(w.actors.every(a => a.ready)).toBe(true);
    expect(checksum(resumed)).toBe(checksum(w)); expect(checksum(replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash))).toBe(checksum(w));
  });
  it("initial cancellation closes the panel and removes waiting choices without starting simulation or reopening", () => {
    const {w, pack} = fixture(); enterCampaign(w, pack);
    queueCampaign(w, {type: "roster-select", blueprintIndex: 0}); stepCampaign(w, pack);
    queueCampaign(w, {type: "roster-deploy", deployment: 0, associatedBuilding: null}); stepCampaign(w, pack);
    expect(w.initialRecruitmentPanel).toBe("closed"); expect(w.players[0].raw[3]).toBe(0); expect(w.flags & 4).toBe(0);
    for (let i = 0; i < 3; i++) stepCampaign(w, pack);
    expect(w.initialRecruitmentPanel).toBe("closed"); expect(w.frame).toBe(0); expect(w.landings).toEqual([]);
  });
  it("retains the source UI launch flag after a later factory failure, and respects mode1's wait", () => {
    for (const mode of [0, 1]) {
      const {w, pack} = fixture(); enterCampaign(w, pack); w.runtimeMode = mode;
      queueCampaign(w, {type: "roster-select", blueprintIndex: 0}); stepCampaign(w, pack);
      delete pack.assets.EFF;
      expect(queueCampaign(w, {type: "roster-deploy", deployment: 1, associatedBuilding: null}).ok).toBe(true);
      expect(w.initialRecruitmentPanel).toBe("closed"); expect(w.flags & 4).toBe(0);
      stepCampaign(w, pack);
      expect(w.flags & 4).toBe(mode ? 0 : 4); expect(w.landings).toEqual([]);
      expect(w.specialists.records[0][113]! & 4).toBe(0);
      expect(w.notices.some(n => n.severity === "warning" && n.text.includes("EFF"))).toBe(true);
    }
  });
  it("reads the AI gate before the initial launch producer and saves its pending phase", () => {
    const {w, pack} = fixture(); enterCampaign(w, pack);
    queueCampaign(w, {type: "roster-select", blueprintIndex: 0}); stepCampaign(w, pack);
    //An explicitly incomplete synthetic opponent must first be read on the
    //following ordinary frame, after this iteration's UI producer setsflag4.
    w.source.source.context.activePlayerCount = 2; w.players[1].raw[2] = 1;
    queueCampaign(w, {type: "roster-deploy", deployment: 1, associatedBuilding: null});
    const resumed = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    expect(resumed.initialRecruitmentLaunch).toEqual(w.initialRecruitmentLaunch);
    for (const host of [w, resumed]) {stepCampaign(host, pack); expect(host.phase, JSON.stringify(host.notices)).toBe("active"); expect(host.frame).toBe(1); expect(host.initialRecruitmentLaunch).toBeUndefined();}
    expect(checksum(resumed)).toBe(checksum(w));
    stepCampaign(w, pack); expect(w.phase).toBe("blocked");
    expect(w.notices.at(-1)?.text).toMatch(/strategic|Strategic/);
  });
  it("accepts signed packet9 coordinates and rejects malformed or nonhuman commands before queue mutation", () => {
    const {w, pack} = fixture(); enterCampaign(w, pack);
    expect(queueCampaign(w, {type: "roster-target", point: [-32768, 32767]}).ok).toBe(true);
    stepCampaign(w, pack); expect([i16(w.players[0].raw, 9), i16(w.players[0].raw, 11)]).toEqual([-32768, 32767]);
    const before = checksum(w);
    expect(queueCampaign(w, {type: "roster-target", point: [-32769, 0]}).ok).toBe(false);
    expect(queueCampaign(w, {type: "roster-select", blueprintIndex: 32}).ok).toBe(false);
    expect(checksum(w)).toBe(before);
    w.players[0].raw[2] = 1; const nonhuman = checksum(w);
    expect(queueCampaign(w, {type: "roster-select", blueprintIndex: 0}).ok).toBe(false); expect(checksum(w)).toBe(nonhuman);
  });
  it("does not commit a partially constructed specialist when a concrete resource is missing", () => {
    const {w, pack} = fixture(); enterCampaign(w, pack); delete pack.assets.TEST;
    expect(queueCampaign(w, {type: "roster-select", blueprintIndex: 0}).ok).toBe(true);
    stepCampaign(w, pack);
    expect(w.players[0].raw[3]).toBe(0); expect(w.actors).toEqual([]);
    expect(w.specialists.records.slice(0, 5).every(n => n[6] === 0)).toBe(true);
    expect(w.players[0].raw[0x16 + 32] & 3).toBe(0);
    expect(w.notices.some(n => n.severity === "warning" && n.text.includes("TEST"))).toBe(true);
  });
  it("initializes the real64 marker before frame0 and preserves complete entry on a late failure", () => {
    const {w, pack} = fixture(); put32(w.missionPrefix, 0x1ec2, 15000);
    put16(w.missionPrefix, 0x1c9a, 12000); put16(w.missionPrefix, 0x1c9c, 13000);
    const before = checksum(w), missing = structuredClone(pack); delete missing.assets.EFF;
    expect(() => enterCampaign(w, missing)).toThrow(); expect(checksum(w)).toBe(before);
    enterCampaign(w, pack);
    const marker = w.powerEffects.slots.find(s => s.occupied && s.nativePrior![69] === 64)?.nativePrior;
    expect(marker).toBeDefined(); expect([i16(marker as number[], 7), i16(marker as number[], 9), marker![76]]).toEqual([12000, 13000, 0]);
    expect(w.frame).toBe(0); expect(w.phase).toBe("active");
    const loaded = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    stepCampaign(w, pack); stepCampaign(loaded, pack); expect(checksum(loaded)).toBe(checksum(w));
  });
  it("activates source special-entry specialists before72AD0's64 marker without allocating a49 carrier", () => {
    const {pack} = fixture(), startup = pack.missions[0].startup!, prefix = decodeBytes(startup.missionPrefixBase64);
    put32(prefix, 0x1ec2, 15000); put16(prefix, 0x1c9a, 12000); put16(prefix, 0x1c9c, 13000);
    startup.missionPrefixBase64 = encodeBytes(prefix); startup.context.specialActivation = 15000;
    const w = createCampaign(pack, "synthetic-source-special-entry"), replay = recordCampaign(w, null);
    replay.commands.push({tick: w.tick, type: "enter"}); enterCampaign(w, pack);
    expect(w.actors.length).toBeGreaterThan(0); expect(w.actors.every(a => a.ready)).toBe(true);
    expect(w.landings).toEqual([]); expect(w.powerEffects.slots.filter(s => s.occupied).map(s => s.nativePrior![69])).toEqual([64]);
    expect(w.players[0].raw[0x498]).toBe(0); expect(u32(w.players[0].raw, 0x49d)).toBe(1);
    expect(w.initialRecruitmentPanel).toBeUndefined(); expect(w.frame).toBe(0);
    const resumed = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    for (let i = 0; i < 8; i++) {stepCampaign(w, pack); stepCampaign(resumed, pack);}
    expect(w.phase, JSON.stringify(w.notices)).toBe("active"); expect(checksum(resumed)).toBe(checksum(w));
    expect(checksum(replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash))).toBe(checksum(w));
  });
});
