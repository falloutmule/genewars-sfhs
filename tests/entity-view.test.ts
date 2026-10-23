import { expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, enterCampaign } from "../src/sim/campaign/world";
import {
  campaignEntity,
  campaignBlastTarget,
  campaignQueryEntities,
} from "../src/sim/campaign/entity-view";
import { put32, put16 } from "../src/sim/campaign/bytes";
it("uses current native pools and concrete virtual heights rather than stale source overlays", () => {
  const pack = campaignFixture(),
    w = createCampaign(pack, "fixture");
  enterCampaign(w, pack);
  const n = w.specialists.records[0];
  put32(n as number[], 17, 1000);
  put32(n as number[], 39, 1500);
  n[85] = 3;
  const e = campaignBlastTarget(w, pack, "source:2:0");
  expect(e.height).toBe(1500);
  expect(e.relativeHeight).toBe(500);
  expect(e.movable).toBe(false);
  n[85] = 1;
  expect(campaignBlastTarget(w, pack, "source:2:0").movable).toBe(true);
  expect(e.native).toBe(n);
  const fx = w.powerEffects.slots[0].nativePrior!;
  const at = [fx[7]! + (fx[8]! << 8), fx[9]! + (fx[10]! << 8)] as [
    number,
    number,
  ];
  expect(campaignQueryEntities(w, [at, at]).map((e) => e.id)).toEqual([
    "source:4:0",
    "source:4:0",
  ]);
  expect(() => campaignBlastTarget(w, pack, "source:4:0")).toThrow(
    "descriptor",
  );
  put16(fx as number[], 15, 1);
  expect(() => campaignEntity(w, "source:4:0")).toThrow("identity");
});
