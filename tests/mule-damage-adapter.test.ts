import { expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  damageCampaignMule,
  captureCampaignMule,
} from "../src/sim/campaign/mule-damage-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { i16, put16, u32 } from "../src/sim/campaign/bytes";
function fixture() {
  const pack = campaignFixture();
  pack.ecologyRules!.muleCombat = {
    queryRadius: 512,
    attack: 20,
    defense: 2,
    disposition: 50,
    foodWeights: [10, 20, 30],
    attackChannel: 41,
  };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 10 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0],
    })),
    animations: Array.from({ length: 50 }, () => ({
      first: 0,
      last: 9,
      rawTrailingWord: 10,
    })),
  };
  const w = createCampaign(pack, "fixture"),
    created = initializeMuleNative(
      w.creatureNative[0],
      w.rng,
      { slot: 0, owner: 4, position: [8192, 8192], quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
  if (!created.ok) throw new Error(created.reason);
  const n = created.value.native;
  w.rng = created.value.rng;
  n[94] = 8;
  put16(n as number[], 106, 100);
  w.ecology.mules.push({ index: 0, id: "source:0:0", native: n, pending: [] });
  w.creatureNative[0] = n;
  put16(w.missionPrefix, 0x3550, 1);
  insertSpatial(w.spatial, w.terrain, "source:0:0", 32 * 128 + 32);
  return { pack, w, n };
}
it("retains actor/player/Mule native identities through immediate blood allocation before later research work", () => {
  const { pack, w, n } = fixture(),
    actor = w.specialists.records[0],
    player = w.players[0].raw;
  damageCampaignMule(w, pack, 0, 20, "source:2:0");
  expect(i16(n as number[], 106)).toBeLessThan(100);
  expect(w.powerEffects.slots.filter((e) => e.occupied)).toHaveLength(1);
  expect(w.powerEffects.slots[0].nativePrior![69]).toBe(32);
  expect(w.specialists.records[0]).toBe(actor);
  expect(w.players[0].raw).toBe(player);
  expect(w.ecology.mules[0].native).toBe(n);
  expect(w.creatureNative[0]).toBe(n);
  // The unlanded native actor is intentionally not on the map yet.
  expect(w.spatial.nodes["source:2:0"]).toBeUndefined();
  actor[0x88] = 13;
  expect(w.specialists.records[0][0x88]).toBe(13);
});
it("keeps real capture stun through later lethal research damage, credits the kill and retains the corpse count", () => {
  const { pack, w, n } = fixture(),
    effect: (number | null)[] = Array(81).fill(0);
  effect.fill(null, 31, 39);
  effect[6] = 5;
  effect[69] = 20;
  put16(effect as number[], 15, 1);
  captureCampaignMule(w, pack, 0, effect, {
    damage: 1,
    duration: 97,
    capturedByActor: null,
  });
  expect(n[94]).toBe(18);
  expect(i16(n as number[], 108)).toBe(97);
  put16(n as number[], 106, 1);
  damageCampaignMule(w, pack, 0, 5, "source:2:0");
  expect(n[94]).toBe(24);
  expect(n[6]).toBe(1);
  expect(u32(w.players[0].raw, 0x6fd)).toBe(1);
  expect(w.missionPrefix[0x3550]).toBe(1);
  expect(w.spatial.nodes["source:0:0"]).toBeDefined();
});
