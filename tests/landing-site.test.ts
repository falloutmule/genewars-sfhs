import { describe, it, expect } from "vitest";
import {
  updateLandingSite,
  type LandingSiteRules,
} from "../src/sim/mechanics/landing-site";
import {
  stepCampaignLandingBuilding,
  stepStagedCampaignLandingBuilding,
} from "../src/sim/campaign/landing-building-adapter";
import {
  createLanding,
  stepLandingMain,
  type LandingContext,
} from "../src/sim/mechanics/landing";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { putEffectWord } from "../src/sim/mechanics/power-motion";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { animationProfile } from "../src/sim/mechanics/animation";
/**Intentionally synthetic table values; original numeric rows remain private.*/
const rules: LandingSiteRules = {
  directionIndices: [0, 1, 2, 3, 4, 5, 6, 7],
  directions: [
    [256, 0],
    [0, 256],
    [-256, 0],
    [-256, 0],
    [0, -256],
    [0, -256],
    [256, 0],
    [256, 0],
    [0, 0],
  ],
  textures: [40, 41, 42, 43, 44, 45, 46, 47, 48],
  orientations: [0, 16, 32, 48, 64, 80, 96, 112, 0],
};
function fixture() {
  const pack = campaignFixture(),
    w = createCampaign(pack, "synthetic-landing-site"),
    n = w.buildingNative[7];
  n[6] = 0;
  n[52] = 0;
  n[54] = 0;
  return { pack, w, n };
}
describe("75240 associated landing site", () => {
  it("honors the frame gate and touches no bytes when its native pulse already matches", () => {
    const { w, n } = fixture(),
      before = structuredClone(w.terrain);
    n[52] = 1;
    expect(
      updateLandingSite(w.terrain, n, [8192, 8192], 0, 0, 0, rules),
    ).toEqual({ updated: false, cells: [] });
    expect(w.terrain).toEqual(before);
  });
  it("uses nine ordered cells, wraps XY, and preserves height/climate/occupancy", () => {
    const { w, n } = fixture(),
      before = w.terrain.bytes.slice(),
      r = updateLandingSite(w.terrain, n, [-1, -1], 0, 0, 0, rules);
    expect(r.cells).toHaveLength(9);
    expect(r.cells[0]).toBe(worldCell(-256, -256));
    expect(r.cells[1]).toBe(worldCell(0, -256));
    expect(n[52]).toBe(1);
    for (const cell of r.cells) {
      const at = cell * 14;
      expect(w.terrain.bytes[at + 11] & 12).toBe(12);
      expect(w.terrain.bytes[at + 13]).toBe(0);
      for (const off of [0, 1, 2, 3, 6, 7, 8, 9, 10, 12])
        expect(w.terrain.bytes[at + off]).toBe(before[at + off]);
    }
    expect(w.terrain.revision).toBe(1);
  });
  it.each([
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const)(
    "applies source B%s/C%s overrides and retains all other native bytes",
    (b, c) => {
      const { w, n } = fixture();
      n[52] = 1;
      n[54] = 0;
      const before = n.slice();
      const r = updateLandingSite(w.terrain, n, [8192, 8192], 0, b, c, rules);
      expect(r.updated).toBe(true);
      expect(n[52]).toBe(c ? 0 : 1);
      expect(n[54]).toBe(b ? 1 : 0);
      expect(w.terrain.bytes[r.cells[0] * 14 + 4]).toBe(b ? 154 : 150);
      for (let i = 0; i < 67; i++)
        if (i !== 52 && i !== 54) expect(n[i]).toBe(before[i]);
    },
  );
  it("invalid imported tables fail before map or held native mutations", () => {
    const { w, n } = fixture(),
      before = JSON.stringify({ t: w.terrain, n });
    expect(() =>
      updateLandingSite(w.terrain, n, [8192, 8192], 0, 1, 0, {
        ...rules,
        directionIndices: [99],
      }),
    ).toThrow("tables");
    expect(JSON.stringify({ t: w.terrain, n })).toBe(before);
  });
  it("staged host accepts source retained inactive buildings and status writes only60/51", () => {
    const { pack, w, n } = fixture(),
      before = n.slice();
    stepStagedCampaignLandingBuilding(
      w,
      { type: "status", building: 7, active: true },
      pack,
    );
    expect(w.buildingNative[7]).toBe(n);
    expect([n[60], n[51]]).toEqual([1, 0]);
    for (let i = 0; i < 67; i++)
      if (i !== 60 && i !== 51) expect(n[i]).toBe(before[i]);
  });
  it("atomic host rejects an absent original profile without publishing anything", () => {
    const { pack, w } = fixture(),
      before = JSON.stringify(w);
    expect(() =>
      stepCampaignLandingBuilding(
        w,
        {
          type: "site",
          building: 7,
          position: [8192, 8192],
          argumentB: 1,
          argumentC: 0,
        },
        pack,
      ),
    ).toThrow("profile");
    expect(JSON.stringify(w)).toBe(before);
  });
  it("49 issues contact, takeoff and retirement site ports in source order", () => {
    const { pack, w } = fixture(),
      s = createLanding(
        0,
        [8192, 8192],
        w.terrain,
        0,
        w.powerEffects.slots[0].nativePrior!,
      ),
      events: unknown[] = [];
    putEffectWord(s.native!, 71, 7);
    s.native![73] = 4;
    s.height = groundHeight(w.terrain, ...s.point) + 1;
    const c: LandingContext = {
      terrain: w.terrain,
      tables: pack.rules!.tables,
      bounce: pack.rules!.tables.bounce,
      water: 0,
      gravity: 512,
      frame: 0,
      obstacle: () => null,
      profile: (code) => animationProfile(pack.assets.EFF, code),
      plantBlockerWeight: () => 0,
      occupiedEffectSlots: Array.from({ length: 200 }, (_, i) => i),
      slotPriors: w.powerEffects.slots,
      building: (q) => events.push(q),
      onEvent: (_, event) => {
        if (event.type === "activate" || event.type === "retired") events.push(event);
      },
    };
    stepLandingMain(s, w.rng, c);
    expect(events).toEqual([
      { type: "status", building: 7, active: true },
      { type: "activate", owner: 0 },
      {
        type: "site",
        building: 7,
        position: [8192, 8192],
        argumentB: 0,
        argumentC: 0,
      },
    ]);
    events.length = 0;
    s.timer = 1;
    stepLandingMain(s, w.rng, c);
    expect(events[0]).toEqual({ type: "status", building: 7, active: false });
    events.length = 0;
    s.timer = 1;
    stepLandingMain(s, w.rng, c);
    expect(events).toEqual([
      {
        type: "site",
        building: 7,
        position: [8192, 8192],
        argumentB: 1,
        argumentC: 0,
      },
    ]);
    events.length = 0;
    s.timer = 1;
    stepLandingMain(s, w.rng, c);
    expect(events).toEqual([
      { type: "retired", owner: 0 },
      {
        type: "site",
        building: 7,
        position: [8192, 8192],
        argumentB: 0,
        argumentC: 1,
      },
    ]);
  });
});
