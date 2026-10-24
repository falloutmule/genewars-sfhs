import { describe, expect, it } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import { stepCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  recordCampaign,
  saveCampaign,
  loadCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import { i16, u32, put16 } from "../src/sim/campaign/bytes";
import { validateSpatial, insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { updateNativeBuildingCapacity } from "../src/sim/mechanics/building-damage";
import { worldCell } from "../src/sim/mechanics/terrain";

function fixture(grade: 1 | 2, selector: 2 | 4 = 2) {
  const f = processorFixture(selector, grade),
    { w, pack } = f;
  pack.buildingRules!.upkeep[selector] = 0; //Explicit synthetic numeric rate; drain remains real.
  pack.rules!.tables.buildingFootprints[selector] = 2;
  w.players[0].raw[0x4a2] = 1;
  w.frame = w.tick = 256;
  for (const [code, count] of [
    [6, 13],
    [8, 13],
    [60, 6],
  ] as const) {
    const first = pack.assets.EFF.frames!.length;
    pack.assets.EFF.frames!.push(
      ...Array.from({ length: count }, () => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [0, 0, 0],
      })),
    );
    pack.assets.EFF.animations![code] = {
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    };
  }
  const plant = selector === 2 ? processorPlant(f, 7, [7680, 8192]) : null;
  return { ...f, plant };
}
describe("ordinary processor collection host", () => {
  it("collects a real corpse through Recycler4, suspends its carried callback, saves and replays actual GOOP credit", () => {
    const f = fixture(1, 4),
      { w, pack } = f,
      position: [number, number] = [7680, 8192];
    const made = initializeMuleNative(
      w.creatureNative[0],
      w.rng,
      { slot: 0, owner: 4, position, quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
    if (!made.ok) throw Error(made.reason);
    const n = made.value.native;
    n[94] = 25;
    n[96] = n[97] = 0;
    put16(n as number[], 104, 80);
    put16(n as number[], 108, 32767);
    w.rng = made.value.rng;
    w.creatureNative[0] = n;
    w.ecology.mules.push({
      id: "source:0:0",
      index: 0,
      native: n,
      pending: [],
    });
    put16(w.missionPrefix, 0x3550, 1);
    insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...position));
    updateNativeBuildingCapacity(w, 0);
    w.economy.players[0].capacity = 800;
    synchronizeCampaignLinks(w);
    const recording = recordCampaign(w, null),
      funds = w.players[0].funds;
    let resumed: CampaignWorld | null = null,
      created = false,
      carrying = false,
      carriedReserve: number | null = null;
    for (let tick = 0; tick < 600; tick++) {
      stepCampaign(w, pack);
      if (resumed) stepCampaign(resumed, pack);
      expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
      created ||= w.collectors.count > 0;
      if (w.creatureNative[0][97]! & 1) {
        carrying = true;
        const reserve = i16(w.creatureNative[0] as number[], 104);
        if (carriedReserve === null) carriedReserve = reserve;
        else expect(reserve).toBe(carriedReserve);
        if (!resumed)
          resumed = loadCampaign(
            saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
            w.contentHash,
          ).world;
      }
      if (resumed && tick % 20 === 0)
        expect(checksum(resumed)).toBe(checksum(w));
      if (created && !w.collectors.count && w.players[0].goop > 0) break;
    }
    expect(created).toBe(true);
    expect(carrying).toBe(true);
    expect(resumed).not.toBeNull();
    expect(w.collectors.count).toBe(0);
    expect(w.creatureNative[0][6]).toBe(0);
    expect(w.players[0].goop).toBeGreaterThan(0);
    expect(w.players[0].funds).toBe(funds);
    expect(checksum(resumed)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
    validateSpatial(w.spatial);
  }, 30000);
  it.each([1, 2] as const)(
    "dispatches grade%d in the building pass, moves in14EC0 and preserves complete save/replay",
    (grade) => {
      const f = fixture(grade),
        { w, pack } = f,
        recording = recordCampaign(w, null),
        effects = new Set<number>(),
        positions = new Set<string>();
      let resumed: CampaignWorld | null = null,
        burning = false,
        carrying = false,
        created = false;
      for (let tick = 0; tick < 600; tick++) {
        stepCampaign(w, pack);
        if (resumed) stepCampaign(resumed, pack);
        expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
        const n = w.collectors.records[0];
        created ||= n[6] === 7;
        if (n[6] === 7)
          positions.add(`${i16(n as number[], 7)},${i16(n as number[], 9)}`);
        burning ||= !!(w.ecology.plants[0].native[46]! & 8);
        carrying ||= n[6] === 7 && n[86] === 2;
        for (const e of w.powerEffects.slots)
          if (e.occupied) effects.add(e.nativePrior![69]!);
        if (
          !resumed &&
          n[6] === 7 &&
          (grade === 1 ? positions.size > 2 : n[86] === 2)
        )
          resumed = loadCampaign(
            saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
            w.contentHash,
          ).world;
        if (resumed && tick % 20 === 0)
          expect(checksum(resumed)).toBe(checksum(w));
        if (
          created &&
          w.collectors.count === 0 &&
          (grade === 1 ? burning : u32(w.buildingNative[0] as number[], 54) > 0)
        )
          break;
      }
      expect(created).toBe(true);
      expect(positions.size).toBeGreaterThan(2);
      expect(burning).toBe(true);
      expect(carrying).toBe(grade === 2);
      expect(w.collectors.count).toBe(0);
      expect(w.missionPrefix[0x3558]).toBe(0);
      expect(effects.has(8)).toBe(true);
      expect(effects.has(10)).toBe(true);
      if (grade === 2) {
        expect(effects.has(67)).toBe(true);
        //Arrival stops native73 bit16 before cancellation, so146E0 drops
        //and retires67 directly. Moving cancellation's68 path is separate.
        expect(effects.has(68)).toBe(false);
        expect(u32(w.buildingNative[0] as number[], 54)).toBeGreaterThan(0);
      } else expect(u32(w.buildingNative[0] as number[], 54)).toBe(0);
      expect(resumed).not.toBeNull();
      expect(checksum(resumed)).toBe(checksum(w));
      expect(
        checksum(
          replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash),
        ),
      ).toBe(checksum(w));
      validateSpatial(w.spatial);
    },
    30000,
  );
});
