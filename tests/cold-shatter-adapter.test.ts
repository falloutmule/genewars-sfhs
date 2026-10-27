import { expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { damageCampaignMule } from "../src/sim/campaign/mule-damage-adapter";
import { put16, put32 } from "../src/sim/campaign/bytes";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { stepEffectScheduler } from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

it("shatters a frozen creature into scheduled real shards, cleans references and preserves save continuation", () => {
  const pack = campaignFixture();
  pack.assets.EFF = {...pack.assets.EFF,
    frames: Array.from({length: 5}, () => ({components: [], width: 1, height: 1, rawFlags: [0, 0]})),
    animations: Array.from({length: 71}, () => ({first: 0, last: 4, rawTrailingWord: 5})),
  };
  pack.ecologyRules!.corpseFriction = Array(8).fill(128);
  pack.ecologyRules!.muleCombat = {queryRadius: 512, attack: 20, defense: 8,
    disposition: 100, foodWeights: [11, 22, 33], attackChannel: 41};
  pack.effectRules = {schemaVersion: 1, descriptors: Array.from({length: 71}, (_, code) => ({
    code, retirementMode: code === 14 ? 1 : 0, gravity: code === 14,
    priority: 30, childCode: null, movable: code === 14, waterResponse: code === 14,
  })), provenance: {executableSha256: "0".repeat(64), originalExecution: false}};
  const w = createCampaign(pack, "cold-shatter"), n: (number | null)[] = Array(124).fill(0),
    ground = groundHeight(w.terrain, 8192, 8192);
  n.fill(null, 31, 39); n[6] = 1; n[24] = 0; n[94] = 15; n[122] = 4;
  put16(n as number[], 7, 8192); put16(n as number[], 9, 8192);
  put32(n as number[], 17, ground); put32(n as number[], 39, ground + 256);
  w.ecology.mules.push({id: "source:0:0", index: 0, native: n, pending: []});
  w.creatureNative[0] = n;
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(8192, 8192));
  const peer = n.slice(); peer[94] = 8;
  put16(peer as number[], 15, 1); peer[87] = 1;
  w.ecology.mules.push({id: "source:0:1", index: 1, native: peer, pending: []});
  w.creatureNative[1] = peer;
  insertSpatial(w.spatial, w.terrain, "source:0:1", worldCell(8192, 8192));
  put16(w.missionPrefix, 0x3550, 2);
  const beforeDraws = w.rng.draws;
  const result = damageCampaignMule(w, pack, 0, 1, null);
  expect(result.some(e => e.kind === "mule-retired")).toBe(true);
  expect(n[6]).toBe(0);
  expect(w.spatial.nodes["source:0:0"]).toBeUndefined();
  expect(peer[87]).toBe(0);
  expect(peer[85]).toBe(0);
  const shards = w.powerEffects.slots.filter(s => s.occupied);
  expect(shards.length).toBeGreaterThanOrEqual(10);
  expect(shards.length).toBeLessThanOrEqual(19);
  expect(shards.every(s => s.nativePrior![69] === 14)).toBe(true);
  expect(w.rng.draws).toBe(beforeDraws + 1 + shards.length * 3);
  validateSpatial(w.spatial);
  const text = saveCampaign(w, {paused: true, speed: 1, accumulator: 0}),
    loaded = loadCampaign(text, "cold-shatter").world,
    options = {gravity: 512, obstacleAt: () => false, destructionObstacle: () => null,
      cleanupReferences: cleanupCampaignReferences};
  expect(checksum(loaded)).toBe(checksum(w));
  stepEffectScheduler(w, pack, options);
  stepEffectScheduler(loaded, pack, options);
  expect(checksum(loaded)).toBe(checksum(w));
  expect(w.phase).not.toBe("blocked");
});
