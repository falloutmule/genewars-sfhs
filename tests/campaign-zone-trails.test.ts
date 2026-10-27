import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { stepCampaignZones } from "../src/sim/campaign/zone-adapter";
import { put16, put32, u32 } from "../src/sim/campaign/bytes";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import {
  putEffectWord,
  putEffectDword,
} from "../src/sim/mechanics/power-motion";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";

function fixture(family: "plant" | "building") {
  const pack = campaignFixture(),
    w = createCampaign(pack, "synthetic-zone-trails");
  for (const code of [47, 60]) {
    const first = pack.assets.EFF.frames!.length;
    pack.assets.EFF.frames!.push(
      ...Array.from({ length: 6 }, () => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [0, 0, 0],
      })),
    );
    pack.assets.EFF.animations![code] = {
      first,
      last: first + 5,
      rawTrailingWord: 6,
    };
  }
  w.frame = family === "plant" ? 48 : 32;
  put16(w.missionPrefix, 0x355c, 0);
  w.missionPrefix[0x34b8] = 1;
  const at = 0x2ff8;
  put16(w.missionPrefix, at, 1024);
  put16(w.missionPrefix, at + 2, 1024);
  w.missionPrefix[at + 4] = family === "plant" ? 7 : 13;
  w.missionPrefix[at + 5] = 255;
  put32(w.missionPrefix, at + 6, 1024);
  put32(w.missionPrefix, at + 10, 1024);
  put32(w.missionPrefix, at + 14, 1024);
  w.missionPrefix[at + 18] = 1;
  const n =
    family === "plant" ? w.ecology.plants[0].native : w.buildingNative[0];
  n[6] = family === "plant" ? 2 : 4;
  n[24] = 0;
  putEffectWord(n, 7, 1024);
  putEffectWord(n, 9, 1024);
  putEffectDword(n, 17, 2000);
  if (family === "plant") {
    put16(w.missionPrefix, 0x3552, 1);
    w.ecology.plantCount = 1;
  } else {
    n[45] = 7;
    putEffectWord(n, 49, 5);
    w.players[0].raw[0x607] = 1;
  }
  insertSpatial(
    w.spatial,
    w.terrain,
    `source:${family === "plant" ? 1 : 3}:0`,
    worldCell(1024, 1024),
  );
  synchronizeCampaignLinks(w);
  return { w, pack, n };
}
const options = { gravity: 1024, obstacleAt: () => false };
describe("campaign plant/building zone trails", () => {
  it.each(["plant", "building"] as const)(
    "credits %s with the source initialized zero-angle input and real trail",
    (family) => {
      const { w, pack } = fixture(family),
        amount = family === "plant" ? 8 : 64;
      const events = stepCampaignZones(w, pack, options);
      expect(u32(w.players[0].raw, 13)).toBe(amount);
      expect(u32(w.missionPrefix, 0x3006)).toBe(1024 - amount);
      expect(
        events.some((e) => e.type === "zone-credit" && e.amount === amount),
      ).toBe(true);
      expect(
        w.powerEffects.slots.filter(
          (s) => s.occupied && s.nativePrior?.[69] === 47,
        ),
      ).toHaveLength(1);
      validateSpatial(w.spatial);
    },
  );
  it.each(["countdown", "phase", "unpowered"] as const)(
    "retains the %s gate without scoring or drawing",
    (gate) => {
      const { w, pack, n } = fixture(
        gate === "unpowered" ? "building" : "plant",
      );
      if (gate === "countdown") put16(w.missionPrefix, 0x355c, 1);
      if (gate === "phase") w.frame++;
      if (gate === "unpowered") putEffectWord(n, 49, 1);
      const before = structuredClone(w);
      stepCampaignZones(w, pack, options);
      expect(w).toEqual(before);
    },
  );
  it("rolls back the host when trail profile validation fails after credit", () => {
    const { w, pack } = fixture("plant"),
      before = structuredClone(w);
    pack.assets.EFF.animations![47]!.rawTrailingWord = 5;
    expect(() => stepCampaignZones(w, pack, options)).toThrow();
    expect(w).toEqual(before);
  });
});
