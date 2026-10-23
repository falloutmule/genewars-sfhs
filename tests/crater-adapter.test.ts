import { it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import {
  createCampaignCrater,
  stepCampaignCraters,
} from "../src/sim/campaign/crater-adapter";
import { put16, u32 } from "../src/sim/campaign/bytes";
import { groundHeight } from "../src/sim/mechanics/terrain";
import {saveCampaign,loadCampaign} from "../src/sim/campaign/persistence";
import {checksum} from "../src/sim/checksum";
it("keeps linked specialist native and motion heights coherent through real terrain jobs", () => {
  const pack = campaignFixture();
  pack.craterRules = {
    schemaVersion: 1,
    largeTextures: Array(9).fill(0),
    largeFlags: Array(9).fill(2),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.zoneRules = {
    schemaVersion: 1,
    speciesComponents: Array.from({ length: 25 }, () => [4, 4]),
    zoneTextIndices: Array(14).fill(0),
    terrainLightVector: [0, 0, -256],
    provenance:{executableSha256:"0".repeat(64),originalExecution:false},
  };
  const w = createCampaign(pack, "fixture");
  for (let i = 0; i < 25; i++)
    put16(w.missionPrefix, 0x1ec7 + i * 176 + 12, -1);
  enterCampaign(w, pack);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  const a = w.actors[0],
    point: [number, number] = [a.motion.x, a.motion.y],
    before = groundHeight(w.terrain, ...point);
  expect(a.ready).toBe(true);
  expect(createCampaignCrater(w, point, 0, pack).slot).toBe(0);
  stepCampaignCraters(w,pack,{gravity:512,obstacleAt:()=>false});
  const resumed=loadCampaign(saveCampaign(w,{paused:true,speed:2,accumulator:1}),"fixture").world;
  let steps = 0;
  while (w.missionPrefix[0x2ff7] && steps++ < 200) {
    stepCampaignCraters(w, pack, { gravity: 512, obstacleAt: () => false });
    stepCampaignCraters(resumed,pack,{gravity:512,obstacleAt:()=>false});
  }
  expect(w.missionPrefix[0x2ff7]).toBe(0);
  expect(steps).toBeLessThan(200);
  const actor = w.actors[0],
    native = w.specialists.records[actor.id],
    after = groundHeight(w.terrain, actor.motion.x, actor.motion.y);
  expect(after).not.toBe(before);
  //8C550 refreshes linked heights before later vertices in the same pass.
  // Preserve that numeric image; no extra end-of-pass resampling is allowed.
  expect(actor.motion.ground).not.toBe(before);
  expect(actor.motion.ground).toBe(u32(native as number[],17)|0);
  expect(actor.motion.height).toBe(u32(native as number[], 39) | 0);
  expect(checksum(resumed)).toBe(checksum(w));
});
