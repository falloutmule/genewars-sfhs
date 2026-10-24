import { describe, it, expect } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import {
  stepCampaignPulper,
  stepStagedCampaignPulper,
} from "../src/sim/campaign/pulper-adapter";
import { put16, put32, u32, u16 } from "../src/sim/campaign/bytes";
import { validateSpatial } from "../src/sim/campaign/spatial";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

describe("Pulper real retained host", () => {
  it("consumes its real front plant in place, preserves funds/GOOP/owner5FA and publishes material", () => {
    const f = processorFixture(),
      p = processorPlant(f, 11),
      n = f.w.buildingNative[0],
      raw = f.w.players[0].raw,
      building = f.w.buildings[0],
      economy = f.w.economy.buildings[0];
    n[27] = 5;
    put16(raw, 0x5fa, 7);
    const funds = u32(raw, 0x4a3),
      goop = u32(raw, 0x4a7);
    const r = stepStagedCampaignPulper(f.w, 0, f.pack, f.services);
    expect(r.retired).toEqual(["source:1:0"]);
    expect(p.active).toBe(false);
    expect(p.native[6]).toBe(0);
    expect(f.w.buildingNative[0]).toBe(n);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.buildings[0]).toBe(building);
    expect(f.w.economy.buildings[0]).toBe(economy);
    expect(f.w.ecology.plantCount).toBe(0);
    expect(u16(f.w.missionPrefix, 0x3552)).toBe(0);
    expect([n[51], u32(raw, 0x4a3), u32(raw, 0x4a7), u16(raw, 0x5fa)]).toEqual([
      11,
      funds,
      goop,
      7,
    ]);
    n[27] = 0;
    stepStagedCampaignPulper(f.w, 0, f.pack, f.services);
    expect(u32(n as number[], 54)).toBe(11);
    expect(economy.storedGoop).toBe(11);
    validateSpatial(f.w.spatial);
  });
  it("JSON/save continuation through frame5 produces identical complete afterimages", () => {
    const f = processorFixture();
    processorPlant(f, 19);
    f.w.buildingNative[0][27] = 5;
    const clone = loadCampaign(
      saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
      f.w.contentHash,
    ).world;
    for (let tick = 0; tick < 45; tick++) {
      for (const w of [f.w, clone]) {
        w.frame++;
        stepCampaignPulper(w, 0, f.pack, f.services);
      }
      expect(checksum(clone)).toBe(checksum(f.w));
    }
    expect(u32(f.w.buildingNative[0] as number[], 54)).toBe(19);
  });
  it("late ANB failure rolls back cleanup, audio, counters and held native arrays", () => {
    const f = processorFixture();
    processorPlant(f);
    f.w.buildingNative[0][27] = 5;
    delete f.pack.assets.SYNTHPROCESSOR.animations;
    const before = structuredClone(f.w),
      n = f.w.buildingNative[0],
      raw = f.w.players[0].raw,
      p = f.w.ecology.plants[0].native;
    expect(() => stepCampaignPulper(f.w, 0, f.pack, f.services)).toThrow();
    expect(f.w).toEqual(before);
    expect(f.w.buildingNative[0]).toBe(n);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.ecology.plants[0].native).toBe(p);
  });
  it("rejects a reached missing upgraded collector service atomically", () => {
    const f = processorFixture(2, 1);
    f.w.frame = 256;
    f.w.buildingNative[0][51] = 3;
    const before = structuredClone(f.w);
    expect(() => stepCampaignPulper(f.w, 0, f.pack, f.services)).toThrow(
      "14040",
    );
    expect(f.w).toEqual(before);
  });
  it("holds native/player identity across an actual external staged collector allocation port", () => {
    const f = processorFixture(2, 2);
    f.w.frame = 256;
    const n = f.w.buildingNative[0],
      raw = f.w.players[0].raw;
    const r = stepStagedCampaignPulper(f.w, 0, f.pack, {
      ...f.services,
      dispatchCollection(w, slot, range) {
        expect(w).toBe(f.w);
        expect(w.buildingNative[slot]).toBe(n);
        expect(w.players[0].raw).toBe(raw);
        expect(range).toBe(2048);
        return false;
      },
    });
    expect(r.events).toContainEqual({
      type: "pulper-collection",
      range: 2048,
      dispatched: false,
    });
  });
});
