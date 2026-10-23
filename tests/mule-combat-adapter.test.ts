import { it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { createMuleCombatTransaction } from "../src/sim/campaign/mule-combat-adapter";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";

function fixture() {
  const pack = campaignFixture();
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
    n: (number | null)[] = Array(124).fill(0);
  n.fill(null, 31, 39);
  n[6] = 1;
  n[0x7a] = 4;
  n[0x7b] = 255;
  n[8] = n[10] = 32;
  w.ecology.mules.push({ index: 0, id: "source:0:0", native: n, pending: [] });
  w.creatureNative[0] = n;
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(8192, 8192));
  return { pack, w };
}
it("holds creature identity across immediate blood factory and commits only after the callback", () => {
  const { pack, w } = fixture(),
    before = checksum(w),
    tx = createMuleCombatTransaction(w, pack);
  const state = structuredClone(w.ecology),
    terrain = structuredClone(w.terrain),
    rng = { ...w.rng };
  const held = state.mules[0].native;
  tx.effect(state, terrain, rng, {
    code: 32,
    source: "source:0:0",
    position: [8192, 8192],
    angles: [8, 2, 4096],
  });
  expect(state.mules[0].native).toBe(held);
  expect(
    tx.current().powerEffects.slots.filter((p) => p.occupied),
  ).toHaveLength(1);
  expect(checksum(w)).toBe(before);
  expect(rng).toEqual(w.rng);
  held[0x6a] = 37; // A later numeric mutation in the same callback survives.
  Object.assign(w.ecology, state);
  Object.assign(w.terrain, terrain);
  Object.assign(w.rng, rng);
  tx.commit();
  expect(w.powerEffects.slots[0].occupied).toBe(true);
  expect(w.ecology.mules[0].native).toBe(held);
  expect(w.creatureNative[0]).toBe(held);
  expect(held[0x6a]).toBe(37);
});
it("discards staged shared effects when a later combat branch fails", () => {
  const { pack, w } = fixture(),
    before = checksum(w),
    tx = createMuleCombatTransaction(w, pack);
  tx.effect(
    structuredClone(w.ecology),
    structuredClone(w.terrain),
    { ...w.rng },
    {
      code: 32,
      source: "source:0:0",
      position: [8192, 8192],
      angles: [8, 2, 4096],
    },
  );
  // A rejected callback never calls commit; none of its extra roots escape.
  expect(checksum(w)).toBe(before);
  expect(w.powerEffects.slots.every((p) => !p.occupied)).toBe(true);
});
