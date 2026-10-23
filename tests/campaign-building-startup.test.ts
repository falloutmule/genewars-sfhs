import { describe, expect, it } from "vitest";
import { serializedBuildingFixture } from "./fixtures/serialized-buildings";
import { PackSchema } from "../src/content/types";
import {
  createCampaign,
  validateCampaignWorld,
} from "../src/sim/campaign/world";
import { campaignBuildingAsset } from "../src/sim/campaign/building-startup-adapter";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
describe("campaign serialized building startup", () => {
  it("binds actual source native and economy records without a constructor or animation reset", () => {
    const { pack, slot, native } = serializedBuildingFixture(),
      parsed = PackSchema.parse(pack),
      before = checksum(pack);
    const w = createCampaign(parsed, "serialized-buildings");
    expect(w.buildings).toEqual([
      {
        id: 1002,
        slot,
        owner: 0,
        selector: 4,
        x: 8575,
        y: 8319,
        grade: 2,
        health: 67,
        complete: true,
        energy: 113,
      },
    ]);
    const expected: (number | null)[] = native.slice();
    expected.fill(null, 31, 39);
    expected.fill(0, 39, 43);
    expect(w.buildingNative[slot]).toEqual(expected);
    expect(w.economy.buildings[0]).toMatchObject({
      slot: 2,
      grade: 2,
      selector: 4,
      energy: 113,
      extraDrain: 7,
      storedGoop: 69,
      powered: true,
    });
    expect(w.economy.players[0].capacity).toBe(1200);
    expect(w.powerEffects.slots.filter((s) => s.occupied)).toHaveLength(0);
    expect(w.spatial.nodes["source:3:2"]).toBeDefined();
    expect(campaignBuildingAsset(parsed, 4)).toBe("TEST");
    expect(checksum(pack)).toBe(before);
    validateCampaignWorld(w, "serialized-buildings");
    expect(
      checksum(
        loadCampaign(
          saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
          "serialized-buildings",
        ).world,
      ),
    ).toBe(checksum(w));
  });
  it("refuses a source active building without its admitted resource profile", () => {
    const { pack } = serializedBuildingFixture();
    delete pack.buildingRules;
    expect(() => createCampaign(pack, "serialized-buildings")).toThrow(
      /serialized building rules/,
    );
  });
});
