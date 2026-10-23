import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { synchronizeCampaignPlantCounts } from "../src/sim/campaign/ecology-adapter";
import { u16 } from "../src/sim/campaign/bytes";
describe("source plant counters", () => {
  it("retains source owner5FA after recycling instead of recounting active owned plants", () => {
    const w = createCampaign(campaignFixture(), "plant-counts");
    w.ecology.ownerPlantCounts[0] = 7;
    synchronizeCampaignPlantCounts(w);
    expect(
      w.ecology.plants.filter((p) => p.active && p.owner === 0),
    ).toHaveLength(0);
    expect(u16(w.players[0].raw, 0x5fa)).toBe(7);
    expect(u16(w.missionPrefix, 0x3552)).toBe(0);
  });
  it("still rejects an inconsistent global active plant count", () => {
    const w = createCampaign(campaignFixture(), "plant-counts");
    w.ecology.plantCount = 1;
    expect(() => synchronizeCampaignPlantCounts(w)).toThrow(
      /plant count differs/,
    );
  });
});
