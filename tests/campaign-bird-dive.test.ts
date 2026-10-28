import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { speciesFixture } from "./fixtures/creature-species";
import { creatureCombatTraits } from "../src/sim/mechanics/creature-species";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import {
  haulingPut as put,
  haulingWord as word,
} from "../src/sim/mechanics/mule-hauling";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { put16, put32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
function fixture(species: number) {
  const pack = campaignFixture(),
    s = speciesFixture();
  Object.assign(pack.ecologyRules!, {
    speciesTraits: s.rules.speciesTraits,
    attackChannels: s.rules.attackChannels,
    corpseFriction: Array(8).fill(128),
  });
  pack.zoneRules!.speciesComponents = s.components;
  const combat = creatureCombatTraits(pack.ecologyRules!, s.components, 4);
  pack.ecologyRules!.muleCombat = {
    ...combat,
    foodWeights: [...combat.foodWeights],
  };
  pack.assets.EFF = structuredClone(pack.assets.EFF);
  pack.assets.EFF.frames = Array.from({ length: 10 }, () => ({
    ...structuredClone(pack.assets.TEST.frames![0]),
    rawFlags: [0, 0, 0],
  }));
  pack.assets.EFF.animations![32] = { first: 0, last: 9, rawTrailingWord: 10 };
  for (const name of ["BIRD", "BIRDMULE", "BIRDCRAB", "BONES"])
    pack.assets[name] = structuredClone(pack.assets.MULE);
  const w = createCampaign(pack, "synthetic-bird-dive");
  enterCampaign(w, pack);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase).toBe("active");
  for (let slot = 0; slot < 2; slot++) {
    const at: [number, number] = [10240 + slot * 64, 10240],
      made = initializeMuleNative(
        w.creatureNative[slot],
        w.rng,
        { slot, owner: slot === 0 ? 4 : 0, position: at, quality: 100 },
        { terrain: w.terrain, tables: pack.rules!.tables },
      );
    if (!made.ok) throw Error(made.reason);
    const n = made.value.native;
    w.rng = made.value.rng;
    n[94] = slot === 0 ? 17 : 8;
    n[122] = slot === 0 ? species : 4;
    n[119] = 0;
    n[123] = 255;
    put(n, 102, 30000);
    put(n, 104, 100);
    put(n, 106, 100);
    put(n, 108, 32767);
    put(n, 63, slot === 0 ? -1 : 0);
    put(n, 61, 0);
    n.fill(0, 45, 57);
    put32(n as number[], 39, groundHeight(w.terrain, ...at));
    if (slot === 0) {
      n[21] = 0xa0;
      put(n, 73, 0x414);
      put(n, 85, 1);
      n[87] = 1;
    }
    w.creatureNative[slot] = n;
    w.ecology.mules.push({
      id: `source:0:${slot}`,
      index: slot,
      native: n,
      pending: [],
    });
    insertSpatial(w.spatial, w.terrain, `source:0:${slot}`, worldCell(...at));
  }
  put16(w.missionPrefix, 0x3550, 2);
  synchronizeCampaignLinks(w);
  return { w, pack };
}
describe("campaign Bird dive transaction", () => {
  it.each([3, 14, 19])(
    "saves and replays species%i impact and vertical pullup",
    (species) => {
      const { w, pack } = fixture(species),
        replay = recordCampaign(w, null),
        before = saveCampaign(w, { paused: true, speed: 1, accumulator: 0 });
      let ticks = 0;
      while (
        !(w.creatureNative[0][22]! & 0x40) &&
        w.phase === "active" &&
        ticks++ < 12
      )
        stepCampaign(w, pack);
      expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
      expect(w.creatureNative[0][22]! & 0x40).toBe(0x40);
      expect(word(w.creatureNative[1], 106)).toBeLessThan(100);
      expect(() => validateSpatial(w.spatial)).not.toThrow();
      const restored = loadCampaign(before, w.contentHash).world;
      for (let i = 0; i < ticks; i++) stepCampaign(restored, pack);
      expect(checksum(restored)).toBe(checksum(w));
      const resumed = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
      for (let i = 0; i < 12; i++) {
        stepCampaign(w, pack);
        stepCampaign(resumed, pack);
      }
      expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
      expect(checksum(resumed)).toBe(checksum(w));
      expect(
        checksum(
          replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
        ),
      ).toBe(checksum(w));
    },
    60000,
  );
});
