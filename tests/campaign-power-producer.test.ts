import { describe, expect, it } from "vitest";
import { processorFixture } from "./fixtures/processor";
import { stepCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import {
  createNativeBuilding,
  progressNativeBuilding,
} from "../src/sim/mechanics/building-native";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { put16, i16 } from "../src/sim/campaign/bytes";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { checksum } from "../src/sim/checksum";

/** Explicit synthetic initial grades/energy/resources. Every later update is
 * ordinary campaign dispatch; this is not earned upgrading or mission acceptance. */
function fixture() {
  const f = processorFixture(4),
    { w, pack } = f;
  pack.assets.EFF.animations![33] = { first: 0, last: 3, rawTrailingWord: 4 };
  w.frame = w.tick = 32;
  put16(w.buildingNative[0] as number[], 61, 0);
  w.buildings[0].energy = w.economy.buildings[0].energy = 0;
  for (const [slot, selector, grade] of [
    [1, 3, 2],
    [2, 6, 1],
  ] as const) {
    const position: [number, number] = [8448 + slot * 256, 8192],
      n = w.buildingNative[slot],
      created = createNativeBuilding(n, {
        slot,
        owner: 0,
        selector,
        position,
        ground: groundHeight(w.terrain, ...position),
        shade: 32,
      });
    if (!created.ok) throw Error(created.reason);
    n.splice(0, 67, ...created.value);
    const complete = progressNativeBuilding(n, {
      increment: 80,
      maximumHealth: 80,
      loading: false,
    });
    if (!complete.ok) throw Error(complete.reason);
    n.splice(0, 67, ...complete.value.native);
    n[46] = n[47] = grade;
    n[25] = grade + 1;
    const energy = selector === 3 ? 196 : 199;
    put16(n as number[], 61, energy);
    w.buildings.push({
      id: 1000 + slot,
      slot,
      owner: 0,
      selector,
      grade,
      x: position[0],
      y: position[1],
      health: 80,
      complete: true,
      energy,
    });
    w.economy.buildings.push({
      ...w.buildings.at(-1)!,
      disabled: false,
      capacitySuppressed: false,
      hqUpgradeSuppressed: false,
      powered: false,
      extraDrain: 0,
      depleted: false,
      storedGoop: 0,
      specialPowerDelivery: false,
    });
    w.players[0].completed[selector]++;
    w.players[0].raw[0x600 + selector]++;
    w.players[0].owned |= 1 << selector;
    put16(w.players[0].raw, 0x60e, w.players[0].owned);
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:3:${slot}`,
      worldCell(...position),
    );
  }
  w.players[0].raw[0x4a2] = 3;
  synchronizeCampaignLinks(w);
  return f;
}

describe("ordinary campaign power producer dispatch", () => {
  it("runs upgraded3/6 in the building pass, then real33 motion, retaining a running save and full replay", () => {
    const { w, pack } = fixture(),
      recording = recordCampaign(w, null),
      funds = w.players[0].funds,
      positions = new Set<string>();
    let resumed: CampaignWorld | null = null,
      launched = false,
      delivered = false;
    for (let tick = 0; tick < 96; tick++) {
      stepCampaign(w, pack);
      if (resumed) stepCampaign(resumed, pack);
      expect(w.phase).toBe("active");
      expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
      expect(i16(w.players[0].raw, 0x4ad)).toBe(14);
      expect(w.economy.players[0].generatedEnergy).toBe(14);
      const packets = w.powerEffects.slots.filter((s) => s.packet);
      launched ||= packets.length > 0;
      for (const shared of packets)
        positions.add(`${shared.packet!.x},${shared.packet!.y}`);
      delivered ||=
        w.economy.buildings.find((b) => b.selector === 4)!.energy > 0;
      if (!resumed && packets.length)
        resumed = loadCampaign(
          saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
          w.contentHash,
        ).world;
      if (resumed && tick % 16 === 0)
        expect(checksum(resumed)).toBe(checksum(w));
    }
    expect(launched).toBe(true);
    expect(positions.size).toBeGreaterThan(2);
    expect(delivered).toBe(true);
    expect(resumed).not.toBeNull();
    expect(checksum(resumed)).toBe(checksum(w));
    expect(w.players[0].funds).toBe(funds);
    expect(w.players[0].goop).toBe(0);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
    validateSpatial(w.spatial);
  }, 30000);
});
