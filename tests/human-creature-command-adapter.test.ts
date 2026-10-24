import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  classifyCampaignHumanMuleTarget,
  issueCampaignHumanMuleTarget,
  issueStagedCampaignHumanMuleTarget,
  stopCampaignHumanMule,
} from "../src/sim/campaign/human-creature-command-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { worldCell } from "../src/sim/mechanics/terrain";
import { put16, i16 } from "../src/sim/campaign/bytes";
type N = (number | null)[];
const put = (n: N, at: number, value: number) =>
  put16(n as number[], at, value);
function fixture() {
  const pack = campaignFixture(),
    w = createCampaign(pack, "synthetic-human-input"),
    point: [number, number] = [8192, 8192];
  function mule(index: number, at: [number, number] = [...point]) {
    const result = initializeMuleNative(
      w.creatureNative[index],
      w.rng,
      { slot: index, owner: 0, position: at, quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
    if (!result.ok) throw Error(result.reason);
    w.rng = result.value.rng;
    const n = result.value.native;
    n[94] = 8;
    w.creatureNative[index] = n;
    w.ecology.mules.push({
      id: `source:0:${index}`,
      index,
      native: n,
      pending: [],
    });
    insertSpatial(w.spatial, w.terrain, `source:0:${index}`, worldCell(...at));
    w.terrain.bytes[worldCell(...at) * 14 + 12] = 1;
    return n;
  }
  const n = mule(0),
    peer = mule(1, [8500, 8700]),
    plant: N = Array(49).fill(0);
  plant.fill(null, 31, 39);
  plant[6] = 2;
  plant[46] = 3;
  put(plant, 15, 0);
  put(plant, 7, 9000);
  put(plant, 9, 9200);
  put(plant, 44, 100);
  w.ecology.plants[0] = {
    id: "source:1:0",
    index: 0,
    active: true,
    owner: 0,
    position: [9000, 9200],
    selector: 0,
    growth: 100,
    flags: 0,
    plantFlags: 3,
    updateCounter: 0,
    retirement: 0,
    animation: 0,
    frame: 0,
    shade: 0,
    height: 0,
    native: plant,
  };
  insertSpatial(w.spatial, w.terrain, "source:1:0", worldCell(9000, 9200));
  w.terrain.bytes[worldCell(9000, 9200) * 14 + 12] = 1;
  synchronizeCampaignLinks(w);
  return { w, n, peer, plant, pack };
}
describe("campaign human creature input bindings", () => {
  it("classifies actual terrain visibility and retained plant state without mutating the host", () => {
    const f = fixture(),
      before = JSON.stringify(f.w);
    expect(
      classifyCampaignHumanMuleTarget(
        f.w,
        0,
        { kind: 2, index: 0 },
        { force: false, bypassVisibility: false },
        f.pack,
      ),
    ).toBe(5);
    expect(JSON.stringify(f.w)).toBe(before);
    f.w.terrain.bytes[worldCell(9000, 9200) * 14 + 12] = 0;
    expect(
      classifyCampaignHumanMuleTarget(
        f.w,
        0,
        { kind: 2, index: 0 },
        { force: false, bypassVisibility: false },
        f.pack,
      ),
    ).toBe(0);
    expect(
      classifyCampaignHumanMuleTarget(
        f.w,
        0,
        { kind: 2, index: 0 },
        { force: false, bypassVisibility: true },
        f.pack,
      ),
    ).toBe(5);
  });
  it("issues the recorded mode through concrete action services and stops without moving anchors", () => {
    const f = fixture(),
      held = f.n,
      player = f.w.players[0].raw,
      rng = { ...f.w.rng };
    const out = issueStagedCampaignHumanMuleTarget(
      f.w,
      0,
      { target: { kind: 2, index: 0 }, mode: 5 },
      f.pack,
    );
    expect(out.disposition).toBe("installed");
    expect(f.w.creatureNative[0]).toBe(held);
    expect(f.w.players[0].raw).toBe(player);
    expect(f.n[95]).toBe(1);
    expect(f.n[120]).toBe(5);
    expect(f.plant[46]).toBe(7);
    expect(f.w.audio.requests.at(-1)).toMatchObject({
      cue: 73,
      mode: 2,
      entity: "source:0:0",
    });
    expect(f.w.rng).toEqual(rng);
    const anchor = i16(f.n as number[], 110);
    const stopped = stopCampaignHumanMule(f.w, 0, f.pack);
    expect(stopped.disposition).toBe("stopped");
    expect(f.w.creatureNative[0][120]).toBe(0);
    //Pending95 has not entered states1/7/11:5CC60 leaves this reservation.
    expect(f.w.ecology.plants[0].native[46]).toBe(7);
    expect(i16(f.w.creatureNative[0] as number[], 110)).toBe(anchor);
    validateSpatial(f.w.spatial);
  });
  it("public atomic entry rolls back a late actual angle-profile failure after corpse release/start", () => {
    const f = fixture();
    f.peer[94] = 24;
    f.n[120] = 7;
    f.pack.rules!.tables.atan = [];
    const before = JSON.stringify(f.w);
    expect(() =>
      issueCampaignHumanMuleTarget(
        f.w,
        0,
        { target: { kind: 1, index: 1 }, mode: 4 },
        f.pack,
      ),
    ).toThrow("angle lookup");
    expect(JSON.stringify(f.w)).toBe(before);
    expect(f.w.ecology.mules[0].native).toBe(f.n);
  });
  it("JSON continuation and a replayed packet sequence produce equal host, audio, RNG and pool images", () => {
    const a = fixture(),
      b = JSON.parse(JSON.stringify(a.w));
    const packet = { target: { kind: 2 as const, index: 0 }, mode: 5 };
    issueCampaignHumanMuleTarget(a.w, 0, packet, a.pack);
    issueCampaignHumanMuleTarget(b, 0, packet, a.pack);
    stopCampaignHumanMule(a.w, 0, a.pack);
    stopCampaignHumanMule(b, 0, a.pack);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a.w));
    expect(b.ecology.mules[0].native).toBe(b.creatureNative[0]);
    validateSpatial(b.spatial);
  });
  it("does not reclassify a recorded interaction or invent readiness for species/mode3", () => {
    const f = fixture();
    f.peer[24] = 0;
    expect(
      classifyCampaignHumanMuleTarget(
        f.w,
        0,
        { kind: 1, index: 1 },
        { force: false, bypassVisibility: false },
        f.pack,
      ),
    ).toBe(0);
    expect(
      issueCampaignHumanMuleTarget(
        f.w,
        0,
        { target: { kind: 1, index: 1 }, mode: 1 },
        f.pack,
      ).accepted,
    ).toBe(true);
    const before = JSON.stringify(f.w);
    expect(() =>
      issueCampaignHumanMuleTarget(
        f.w,
        0,
        { target: { kind: 1, index: 1 }, mode: 3 },
        f.pack,
      ),
    ).toThrow("5D0E0");
    expect(JSON.stringify(f.w)).toBe(before);
  });
});
