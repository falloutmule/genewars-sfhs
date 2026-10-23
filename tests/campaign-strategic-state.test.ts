import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, continueCampaign, enterCampaign, stepCampaign } from "../src/sim/campaign/world";
import { saveCampaign, loadCampaign, recordCampaign, sealCampaignReplay, replayCampaign } from "../src/sim/campaign/persistence";
import { createCampaignStrategicStorage, cloneCampaignStrategicStorage, bindCampaignStrategicState,
  publishCampaignStrategicState, campaignStrategicAuxiliary, validateCampaignStrategicStorage } from "../src/sim/campaign/strategic-state";
import { aiPutDword } from "../src/sim/mechanics/strategic-ai-state";
import { encodeBytes } from "../src/sim/campaign/bytes";
import { checksum } from "../src/sim/checksum";
function fixture() {
  const p = campaignFixture(), full = Array(1726 * 4).fill(0);
  for (let owner = 0; owner < 4; owner++) { aiPutDword(full, owner * 1726, 1726); full[owner * 1726 + 4] = owner; }
  const extension = encodeBytes(full.slice(4));
  for (const mission of p.missions) mission.startup!.extensionBase64 = extension;
  p.strategicAIRules = { schemaVersion: 1, groupLimits: Array(6).fill(0), creatureControlPrior: Array(600).fill(0),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false } };
  return { p, extension, w: createCampaign(p, "fixture") };
}
describe("campaign strategic state storage", () => {
  it("reloads exact four records and applies the retention reset to actual prior bytes", () => {
    const f = fixture(), prior = Array.from({ length: 600 }, (_, i) => i & 255), before = prior.slice(),
      s = createCampaignStrategicStorage(f.extension, prior, "synthetic actual prior");
    expect(prior).toEqual(before); expect(s.records.map(n => n[4])).toEqual([0, 1, 2, 3]);
    expect(s.creatureControl.every((v, i) => v === (i % 2 ? 255 : prior[i] & 7))).toBe(true);
    expect(f.w.auxiliary.entries[0]).toEqual({ lowFlags: 0, second: 255 });
  });
  it("binds retained records, native pools, blueprint links, player and RNG identities", () => {
    const { w } = fixture(), s = bindCampaignStrategicState(w);
    expect(s.records).toBe(w.strategy!.records); expect(s.creatures).toBe(w.creatureNative);
    expect(s.buildings).toBe(w.buildingNative); expect(s.players[0]).toBe(w.players[0].raw);
    expect(s.specialists[0].native).toBe(w.specialists.records[0]);
    expect(s.specialists[0].blueprint).toEqual({ player: 0, index: w.specialists.bindings[0]!.blueprintIndex });
    expect(s.rng).toBe(w.rng); expect(s.missionPrefix).toBe(w.missionPrefix);
  });
  it("publishes concrete native debits, cache metadata and low-bit carry projection", () => {
    const { w } = fixture(), s = bindCampaignStrategicState(w); s.creatureControl[0] = 0xe5; s.creatureControl[1] = 7;
    aiPutDword(s.players[0], 0x4a3, 123); aiPutDword(s.players[0], 0x4a7, 456);
    s.specialistPlanner = { schemaVersion: 1, commandCaches: Array.from({ length: 4 }, () => Array(55).fill(null)) };
    publishCampaignStrategicState(w, s);
    expect(w.players[0].funds).toBe(123); expect(w.players[0].goop).toBe(456);
    expect(w.economy.players[0].goop).toBe(456); expect(w.strategy!.specialistPlanner).toBe(s.specialistPlanner);
    expect(w.auxiliary.entries[0]).toEqual({ lowFlags: 5, second: 7 });
  });
  it("deep-clones numeric records/control and nullable effective command caches", () => {
    const { w } = fixture(), s = bindCampaignStrategicState(w);
    s.specialistPlanner = { schemaVersion: 1, commandCaches: Array.from({ length: 4 }, () => Array(55).fill(null)) };
    publishCampaignStrategicState(w, s); const cloned = cloneCampaignStrategicStorage(w.strategy!);
    cloned.records[0][6] = 1; cloned.creatureControl[0] = 3; cloned.specialistPlanner!.commandCaches[0][0] = 5;
    expect(w.strategy!.records[0][6]).toBe(0); expect(w.strategy!.creatureControl[0]).toBe(0);
    expect(w.strategy!.specialistPlanner!.commandCaches[0][0]).toBeNull();
  });
  it("retains authoritative state across normal save/reload and deterministic ticks", () => {
    const { p, w } = fixture(); w.strategy!.creatureControl[0] = 5; w.auxiliary = campaignStrategicAuxiliary(w.strategy!);
    enterCampaign(w); for (let i = 0; i < 8; i++) stepCampaign(w, p);
    const loaded = loadCampaign(saveCampaign(w, { paused: true, speed: 4, accumulator: 7 }), "fixture");
    for (let i = 0; i < 8; i++) { stepCampaign(w, p); stepCampaign(loaded.world, p); }
    expect(checksum(loaded.world)).toBe(checksum(w)); expect(loaded.world.strategy!.creatureControl[0]).toBe(5);
  });
  it("stores the same state in replay initial/final snapshots", () => {
    const { p, w } = fixture(); enterCampaign(w); const r = recordCampaign(w, null);
    for (let i = 0; i < 4; i++) stepCampaign(w, p);
    expect(checksum(replayCampaign(sealCampaignReplay(r, w), p, "fixture"))).toBe(checksum(w));
  });
  it("retains low bits and resets group/high bits when continuing with actual control", () => {
    const { p, w } = fixture(); w.strategy!.creatureControl[0] = 0xfd; w.strategy!.creatureControl[1] = 7;
    w.auxiliary = campaignStrategicAuxiliary(w.strategy!); w.phase = "result"; w.result.phase = "campaign-view-queued";
    const next = continueCampaign(w, p); expect(next.strategy!.creatureControl.slice(0, 2)).toEqual([5, 255]);
    expect(next.entryCarry!.creatureControl!.slice(0, 2)).toEqual([253, 7]);
    expect(next.strategy!.records).not.toBe(w.strategy!.records); expect(w.strategy!.creatureControl[0]).toBe(253);
  });
  it("rejects foreign headers, invalid cache afterimages and replaced host records", () => {
    const { w, extension } = fixture(); expect(() => createCampaignStrategicStorage(extension, Array(599).fill(0), "prior")).toThrow(/extent/);
    const s = bindCampaignStrategicState(w); s.records[1][4] = 2;
    expect(() => validateCampaignStrategicStorage(w.strategy!)).toThrow(/owner/); s.records[1][4] = 1;
    s.players[0] = s.players[0].slice(); expect(() => publishCampaignStrategicState(w, s)).toThrow(/replaced/);
    w.strategy!.specialistPlanner = { schemaVersion: 1, commandCaches: Array.from({ length: 4 }, () => Array(55).fill(255)) };
    expect(() => validateCampaignStrategicStorage(w.strategy!)).toThrow(/carrier/);
  });
});
