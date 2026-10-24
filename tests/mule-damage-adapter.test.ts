import { expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  damageCampaignMule,
  captureCampaignMule,
  campaignAirborneBuilding,
} from "../src/sim/campaign/mule-damage-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { i16, put16, put32, u32 } from "../src/sim/campaign/bytes";
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

it("queries a Recycling Plant using its admitted resource and current ANB frame height", () => {
  const pack = campaignFixture();
  pack.buildingRules = {
    schemaVersion: 1, resources: [{ selector: 4, path: "synthetic/farm.anb", assetKey: "SYNTHFARM" }],
    unsupportedSelectors: [9], upkeep: Array(14).fill(0), processingFrontOffset: [-256, 0],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.assets.SYNTHFARM = structuredClone(pack.assets.TEST);
  pack.assets.SYNTHFARM.frames![0].sourceSize = [4, 12];
  pack.assets.SYNTHFARM.frames![1].sourceSize = [4, 100];
  const w = createCampaign(pack, "synthetic-building-query"), n = w.buildingNative[0], cell = 32 * 128 + 32;
  n[6] = 4; n[24] = 0; n[45] = 4; n[25] = 0; n[27] = 0;
  put16(n as number[], 15, 0); put16(n as number[], 7, 8192); put16(n as number[], 9, 8192);
  put16(n as number[], 49, 1); put32(n as number[], 17, 1024);
  insertSpatial(w.spatial, w.terrain, "source:3:0", cell);
  w.terrain.bytes[cell * 14 + 11] |= 1;
  expect(campaignAirborneBuilding(w, pack, [8192, 8192], 1472)?.native).toBe(n);
  expect(campaignAirborneBuilding(w, pack, [8192, 8192], 1473)).toBeNull();
  n[27] = 1;
  expect(campaignAirborneBuilding(w, pack, [8192, 8192], 1473)?.native).toBe(n);
  //Resource admission is lazy on the actual height branch, as in74270.
  delete pack.assets.SYNTHFARM;
  expect(campaignAirborneBuilding(w, pack, [8192, 8192], -1)?.native).toBe(n);
  expect(() => campaignAirborneBuilding(w, pack, [8192, 8192], 1473)).toThrow(/resource 4/);
});
