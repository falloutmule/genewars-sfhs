import { describe, it, expect } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import {
  dispatchStagedCampaignProcessorCollection,
  stepStagedCampaignProcessorCollector,
  stepStagedCampaignProcessorCollectors,
  stepCampaignProcessorCollectors,
  createStagedCampaignCollectorFeedback,
  damageStagedCampaignProcessorCollector,
} from "../src/sim/campaign/processor-collector-adapter";
import { put16 } from "../src/sim/campaign/bytes";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
function created() {
  const f = processorFixture(2, 2),
    p = processorPlant(f, 7, [8960, 8192]);
  expect(
    dispatchStagedCampaignProcessorCollection(f.w, 0, 2048, f.pack, f.services),
  ).toBe(true);
  return { ...f, p, n: f.w.collectors.records[0] };
}
describe("actual campaign processor collector services", () => {
  it("publishes the actual family6 slot, target mark and BYTE3558 without replacing held arrays", () => {
    const f = processorFixture(2, 2),
      p = processorPlant(f, 7, [8960, 8192]),
      pool = f.w.collectors.records,
      n = pool[0],
      raw = f.w.players[0].raw,
      draws = f.w.rng.draws;
    expect(
      dispatchStagedCampaignProcessorCollection(
        f.w,
        0,
        2048,
        f.pack,
        f.services,
      ),
    ).toBe(true);
    expect(f.w.collectors.records).toBe(pool);
    expect(pool[0]).toBe(n);
    expect(f.w.players[0].raw).toBe(raw);
    expect(p.native[46]! & 4).toBe(4);
    expect(f.w.missionPrefix[0x3558]).toBe(1);
    expect(f.w.spatial.nodes["source:6:0"]).toBeDefined();
    expect(f.w.rng.draws - draws).toBe(2);
  });
  it("runs real97-byte motion without a specialist binding and serializes continuation", () => {
    const f = created(),
      before = f.n.slice(),
      bindings = f.w.specialists.bindings;
    Object.defineProperty(f.w.specialists, "bindings", {
      get() {
        throw Error("Collector read a specialist blueprint");
      },
      configurable: true,
    });
    stepStagedCampaignProcessorCollector(f.w, 0, f.pack, f.services);
    Object.defineProperty(f.w.specialists, "bindings", {
      value: bindings,
      writable: true,
      configurable: true,
    });
    expect(f.n).toBe(f.w.collectors.records[0]);
    expect(f.n[65]).not.toBe(before[65]);
    const session = { paused: true, speed: 1 as const, accumulator: 0 },
      save = saveCampaign(f.w, session),
      loaded = loadCampaign(save, f.w.contentHash).world;
    stepStagedCampaignProcessorCollector(f.w, 0, f.pack, f.services);
    stepStagedCampaignProcessorCollector(loaded, 0, f.pack, f.services);
    expect(JSON.parse(saveCampaign(loaded, session)).checksum).toBe(
      JSON.parse(saveCampaign(f.w, session)).checksum,
    );
  });
  it("retires through real unmarked10 and whole-host cleanup; finished source rows remain retained", () => {
    const f = created();
    f.n[21] = f.n[21]! | 1;
    f.n[86] = 3;
    f.n[25] = 27;
    f.n[27] = 7;
    f.n[26] = f.n[30] = 0;
    put16(f.n as number[], 63, 0);
    const held = f.n,
      r = stepStagedCampaignProcessorCollectors(f.w, f.pack, f.services)[0];
    expect(r.retired).toBe(true);
    expect(f.w.collectors.records[0]).toBe(held);
    expect(held[6]).toBe(0);
    expect(f.w.collectors.count).toBe(0);
    expect(f.w.missionPrefix[0x3558]).toBe(0);
    expect(f.w.spatial.nodes["source:6:0"]).toBeUndefined();
    const effect = f.w.powerEffects.slots.find(
      (s) => s.occupied && s.nativePrior?.[69] === 10,
    )!;
    expect(effect.nativePrior![21]! & 1).toBe(0);
  });
  it("preserves the entire host and held identities when the retirement factory fails late", () => {
    const f = created();
    f.n[86] = 3;
    f.n[25] = 27;
    f.n[27] = 7;
    f.n[26] = f.n[30] = 0;
    put16(f.n as number[], 63, 0);
    delete f.pack.assets.EFF.animations![10];
    const before = JSON.stringify(f.w),
      pool = f.w.collectors.records,
      held = f.n,
      raw = f.w.players[0].raw;
    expect(() =>
      stepCampaignProcessorCollectors(f.w, f.pack, f.services),
    ).toThrow();
    expect(JSON.stringify(f.w)).toBe(before);
    expect(f.w.collectors.records).toBe(pool);
    expect(pool[0]).toBe(held);
    expect(f.w.players[0].raw).toBe(raw);
  });
  it("uses source damage cancellation without a health debit and keeps the parent/player identities", () => {
    const f = created(),
      raw = f.w.players[0].raw,
      building = f.w.buildingNative[0],
      before = building.slice();
    const r = damageStagedCampaignProcessorCollector(
      f.w,
      0,
      f.pack,
      f.services,
    );
    expect(r.accepted).toBe(true);
    expect(f.n[86]).toBe(3);
    expect(f.p.native[46]! & 4).toBe(0);
    expect(f.w.players[0].raw).toBe(raw);
    expect(f.w.buildingNative[0]).toBe(building);
    expect(building).toEqual(before);
  });
  it("declines unmarked10 at full high-priority capacity before accessing its missing frame data", () => {
    const f = processorFixture();
    for (let i = 0; i < 200; i++) {
      const s = f.w.powerEffects.slots[i];
      s.occupied = true;
      s.nativePrior![6] = 5;
      s.nativePrior![69] = 10;
    }
    f.w.missionPrefix[0x3554] = 200;
    delete f.pack.assets.EFF.animations![10];
    expect(
      createStagedCampaignCollectorFeedback(
        f.w,
        [1024, 1024],
        2048,
        f.pack,
        f.services,
      ),
    ).toBeNull();
  });
});
