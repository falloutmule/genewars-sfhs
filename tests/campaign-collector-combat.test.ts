import { describe, it, expect } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import { dispatchStagedCampaignProcessorCollection } from "../src/sim/campaign/processor-collector-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { put16 } from "../src/sim/campaign/bytes";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { stepCampaign } from "../src/sim/campaign/world";
import {
  recordCampaign,
  saveCampaign,
  loadCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
function fixture(owner: number) {
  const f = processorFixture(2, 2);
  processorPlant(f, 7, [8960, 8192]);
  expect(
    dispatchStagedCampaignProcessorCollection(f.w, 0, 2048, f.pack, f.services),
  ).toBe(true);
  f.pack.ecologyRules!.muleCombat = {
    queryRadius: 512,
    attack: 20,
    defense: 8,
    disposition: 100,
    foodWeights: [1, 1, 1],
    attackChannel: 41,
  };
  const made = initializeMuleNative(
    f.w.creatureNative[0],
    f.w.rng,
    {
      slot: 0,
      owner,
      position: owner === 1 ? [8448, 8192] : [8192, 8192],
      quality: 50,
    },
    { terrain: f.w.terrain, tables: f.pack.rules!.tables },
  );
  if (!made.ok) throw Error(made.reason);
  const n = made.value.native;
  f.w.rng = made.value.rng;
  n[94] = 8;
  n[119] = 255;
  n[120] = 0;
  put16(n as number[], 108, 0);
  put16(n as number[], 104, n[98]! | (n[99]! << 8));
  f.w.ecology.mules.push({
    id: "source:0:0",
    index: 0,
    native: n,
    pending: [],
  });
  f.w.creatureNative[0] = n;
  put16(f.w.missionPrefix, 0x3550, 1);
  insertSpatial(
    f.w.spatial,
    f.w.terrain,
    "source:0:0",
    worldCell(n[7]! | (n[8]! << 8), n[9]! | (n[10]! << 8)),
  );
  if (owner === 1) {
    n[94] = 21;
    n[87] = 7;
    put16(n as number[], 85, 0);
    n[82] = 7;
    put16(n as number[], 80, 0);
    put16(n as number[], 73, 0x200);
    put16(n as number[], 63, 0);
    n[25] = 0;
    n[27] = 1;
    n[28] = 0;
  }
  synchronizeCampaignLinks(f.w);
  return f;
}
describe("creature combat with actual processor collectors", () => {
  it("continues a friendly collector neighborhood through complete saves and sealed replay", () => {
    const { w, pack } = fixture(0),
      replay = recordCampaign(w, null),
      loaded = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    for (let i = 0; i < 8; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
    }
    expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
    expect(checksum(loaded)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
  it("completes an attack on a hostile collector through its real14320 service", () => {
    const { w, pack } = fixture(1),
      replay = recordCampaign(w, null),
      loaded = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    const reserve =
      w.creatureNative[0][104]! | (w.creatureNative[0][105]! << 8);
    for (
      let i = 0;
      i < 4 && w.phase === "active" && w.collectors.records[0][86] !== 3;
      i++
    ) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
    }
    expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
    expect(
      w.creatureNative[0][104]! | (w.creatureNative[0][105]! << 8),
    ).toBeLessThanOrEqual(reserve - 3);
    expect(w.collectors.records[0][86]).toBe(3);
    expect(checksum(loaded)).toBe(checksum(w));
    expect(w.collectors.records[0]).toHaveLength(97);
    expect(w.ecology.plants[0].native[46]! & 4).toBe(0);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
  it("rolls back the attack and collector cancellation when a late attacker animation fails", () => {
    const { w, pack } = fixture(1);
    let before = w.creatureNative[0].slice();
    delete pack.assets.MULE.animations![3];
    for (let i = 0; i < 4 && w.phase === "active"; i++) {
      before = w.creatureNative[0].slice();
      stepCampaign(w, pack);
    }
    expect(w.phase).toBe("blocked");
    expect(w.notices.at(-1)?.text).toMatch(/animation 3/);
    expect(w.creatureNative[0]).toEqual(before);
    expect(w.collectors.records[0][86]).toBe(0);
    expect(w.ecology.plants[0].native[46]! & 4).toBe(4);
  });
});
