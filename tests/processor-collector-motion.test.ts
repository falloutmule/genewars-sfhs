import { describe, it, expect } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import { dispatchStagedCampaignProcessorCollection } from "../src/sim/campaign/processor-collector-adapter";
import { stepStagedProcessorCollectorMotion } from "../src/sim/mechanics/processor-collector-motion";
import {
  attachGroundMaterialPose,
  attachMuleMaterialPose,
} from "../src/sim/mechanics/mule-hauling-motion";
import { put16, put32, i16 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
describe("collector common numeric motion and attachment", () => {
  it("uses the real state3 dead predicate for blocked-idle cancellation, with no blueprint read", () => {
    for (const dead of [false, true]) {
      const f = processorFixture(2, 2);
      processorPlant(f, 7, [8960, 8192]);
      dispatchStagedCampaignProcessorCollection(
        f.w,
        0,
        2048,
        f.pack,
        f.services,
      );
      const n = f.w.collectors.records[0];
      put16(n as number[], 7, 1000);
      put16(n as number[], 9, 1000);
      put16(n as number[], 11, 1000);
      put16(n as number[], 13, 1000);
      put16(n as number[], 63, 0);
      put16(n as number[], 73, 0);
      n[83] = 8;
      n[86] = dead ? 3 : 0;
      f.w.frame = 32;
      f.w.terrain.bytes[(4 * 128 + 4) * 14 + 5] = 3;
      let cancels = 0;
      stepStagedProcessorCollectorMotion(f.w, 0, {
        tables: f.pack.rules!.tables,
        gravity: 512,
        water: 0,
        bounce: f.pack.rules!.tables.bounce,
        selectedPlayer: 0,
        obstacle: () => null,
        blockerWeight: () => 0,
        cancel: () => {
          cancels++;
          n[86] = 3;
          put16(n as number[], 63, 0);
        },
      });
      expect(cancels).toBe(dead ? 0 : 1);
    }
  });
  it("shares exact ground carried-pose writes while preserving fractions and adding no RNG", () => {
    const f = processorFixture(),
      parent = f.w.collectors.records[0],
      carried = f.w.powerEffects.slots[0].nativePrior!;
    parent[6] = 7;
    carried[6] = 5;
    put16(carried as number[], 15, 3);
    put16(parent as number[], 7, 1000);
    put16(parent as number[], 9, 1000);
    put32(parent as number[], 39, 2048);
    put16(carried as number[], 7, 1200);
    put16(carried as number[], 9, 1000);
    for (const [p, v] of [
      [45, 4096],
      [47, -2048],
      [49, 80],
      [51, 12],
      [53, -13],
      [55, 14],
      [57, 41],
      [59, 300],
      [61, 777],
      [65, -15],
    ])
      put16(parent as number[], p, v);
    carried[67] = 157;
    carried[68] = 93;
    const rng = { ...f.w.rng },
      scrapes: any[] = [],
      moves: any[] = [];
    attachGroundMaterialPose(carried, parent, {
      terrain: f.w.terrain,
      frame: 0,
      scrape: (q) => {
        scrapes.push(q);
      },
      relocate: (_n, a, b) => {
        moves.push([a, b]);
      },
    });
    expect([i16(carried as number[], 7), i16(carried as number[], 9)]).toEqual([
      744, 1128,
    ]);
    expect(carried.slice(51, 57)).toEqual(parent.slice(51, 57));
    expect(i16(carried as number[], 65)).toBe(-15);
    expect(carried.slice(67, 69)).toEqual([157, 93]);
    expect(scrapes[0].angles).toEqual([41, 44, 388]);
    expect(moves).toHaveLength(1);
    expect(f.w.rng).toEqual(rng);
  });
  it("keeps the existing Mule4 entry narrow and rejects the unconverted collector flight arm", () => {
    const f = processorFixture(),
      n = f.w.collectors.records[0],
      e = f.w.powerEffects.slots[0].nativePrior!;
    n[6] = 7;
    e[6] = 5;
    const c = {
      terrain: f.w.terrain,
      frame: 0,
      scrape: () => {},
      relocate: () => {},
    };
    expect(() => attachMuleMaterialPose(e, n, c)).toThrow("Mule4");
    put16(n as number[], 73, 0x400);
    const before = e.slice();
    expect(() => attachGroundMaterialPose(e, n, c)).toThrow("ground");
    expect(e).toEqual(before);
  });
});
