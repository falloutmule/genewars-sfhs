import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  validateCampaignWorld,
} from "../src/sim/campaign/world";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import { initializeNativePool } from "../src/sim/campaign/native-pools";
import {
  campaignEntity,
  synchronizeCampaignLinks,
} from "../src/sim/campaign/entity-view";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { put16 } from "../src/sim/campaign/bytes";
const session = { paused: true, speed: 1 as const, accumulator: 0 };
function earlierSave() {
  const w = createCampaign(campaignFixture(), "collector-state");
  const snapshot = JSON.parse(saveCampaign(w, session));
  delete snapshot.world.collectors;
  snapshot.checksum = checksum({
    world: snapshot.world,
    session: snapshot.session,
  });
  return snapshot;
}
describe("source kind7 collector save roots", () => {
  it("restores a provably empty earlier pool from retained source images without conflating the adjacent visitor count", () => {
    const snapshot = earlierSave(),
      w = snapshot.world;
    //Explicit synthetic visitor state exercises the distinct3559 byte. No
    //visitor/collector callback or campaign acceptance is implied here.
    w.ethereals.records[0].native[6] = 8;
    w.ethereals.count = 1;
    w.missionPrefix[0x3559] = 1;
    snapshot.checksum = checksum({ world: w, session });
    const loaded = loadCampaign(JSON.stringify(snapshot), "collector-state");
    expect(loaded.world.collectors.count).toBe(0);
    expect(loaded.world.collectors.records).toEqual(
      initializeNativePool(loaded.world.source, 6),
    );
    expect(loaded.world.ethereals.count).toBe(1);
    expect(loaded.world.missionPrefix[0x3559]).toBe(1);
    expect(loaded.checksum).toBe(checksum({ world: loaded.world, session }));
    expect(
      loadCampaign(saveCampaign(loaded.world, session), "collector-state")
        .world,
    ).toEqual(loaded.world);
  });
  it("rejects missing live pool state and checksum corruption rather than inventing records", () => {
    const snapshot = earlierSave();
    snapshot.world.missionPrefix[0x3558] = 1;
    snapshot.checksum = checksum({ world: snapshot.world, session });
    expect(() =>
      loadCampaign(JSON.stringify(snapshot), "collector-state"),
    ).toThrow(/lacks live processor collector state/);
    snapshot.world.missionPrefix[0x3558] = 0;
    snapshot.world.source.source.pools[6].activeCount = 1;
    snapshot.checksum = checksum({ world: snapshot.world, session });
    expect(() =>
      loadCampaign(JSON.stringify(snapshot), "collector-state"),
    ).toThrow(/lacks live processor collector state/);
    snapshot.world.players[0].funds++;
    expect(() =>
      loadCampaign(JSON.stringify(snapshot), "collector-state"),
    ).toThrow(/checksum mismatch/);
  });
  it("persists the live collector image and uses it for spatial queries and source724C0 reference cleanup", () => {
    const w = createCampaign(campaignFixture(), "collector-state"),
      n = w.collectors.records[0];
    //Synthetic initial numeric pool image tests persistence/cleanup plumbing;
    //real factory/movement/collection have their separate mechanic tests.
    n[6] = 7;
    put16(n as number[], 15, 0);
    put16(n as number[], 7, 8192);
    put16(n as number[], 9, 8192);
    for (const at of [77, 80, 87, 90]) {
      put16(n as number[], at, 8);
      n[at + 2] = 1;
    }
    n[96] = 173;
    w.collectors.count = w.missionPrefix[0x3558] = 1;
    insertSpatial(w.spatial, w.terrain, "source:6:0", 32 * 128 + 32);
    synchronizeCampaignLinks(w);
    validateCampaignWorld(w, w.contentHash);
    const loaded = loadCampaign(saveCampaign(w, session), w.contentHash).world;
    expect(checksum(loaded)).toBe(checksum(w));
    expect(campaignEntity(loaded, "source:6:0")!.native).toBe(
      loaded.collectors.records[0],
    );
    expect(cleanupCampaignReferences(loaded, "source:0:8")).toBe(4);
    for (const at of [77, 80, 87, 90]) {
      expect(loaded.collectors.records[0].slice(at, at + 3)).toEqual([8, 0, 0]);
      expect(n.slice(at, at + 3)).toEqual([8, 0, 1]);
    }
    expect(loaded.collectors.records[0][96]).toBe(173);
    expect(
      loadCampaign(saveCampaign(loaded, session), w.contentHash).world,
    ).toEqual(loaded);
  });
});
