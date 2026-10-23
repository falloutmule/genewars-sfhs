import { expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { revealCampaignRadius } from "../src/sim/campaign/reveal-adapter";
import { put16 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
function fixture() {
  const w = createCampaign(campaignFixture(), "synthetic-reveal");
  for (let c = 0; c < 16384; c++) w.terrain.bytes[c * 14 + 12] = 0;
  return w;
}
it("uses the256-unit feather at arbitrary radius, leaves the exact boundary, and raises monotonically", () => {
  const w = fixture(),
    at = (x: number, y: number) => w.terrain.bytes[worldCell(x, y) * 14 + 12];
  const before = { ...w.rng };
  revealCampaignRadius(w, [0, 0], 1024);
  expect(at(0, 0)).toBe(63);
  expect(at(512, 0)).toBe(63);
  expect(at(768, 0)).toBe(63);
  expect(at(768, 256)).toBe(53);
  expect(at(1024, 0)).toBe(0);
  expect(at(-768, -256)).toBe(53);
  expect(w.rng).toEqual(before);
  expect(revealCampaignRadius(w, [0, 0], 1024)).toBe(0);
  expect(revealCampaignRadius(w, [0, 0], 512)).toBe(0);
});
it("uses actual ground height in distance and marks four adjacent rendering cells", () => {
  const flat = fixture(),
    high = structuredClone(flat),
    point: [number, number] = [768, 0],
    cell = worldCell(...point);
  put16(high.terrain.bytes, cell * 14 + 2, 4096);
  revealCampaignRadius(flat, [0, 0], 1024);
  revealCampaignRadius(high, [0, 0], 1024);
  expect(flat.terrain.bytes[cell * 14 + 12]).toBe(63);
  expect(high.terrain.bytes[cell * 14 + 12]).toBe(0);
  for (const p of [
    [0, 0],
    [-256, 0],
    [-256, -256],
    [0, -256],
  ])
    expect(
      flat.terrain.bytes[worldCell(...(p as [number, number])) * 14 + 11] & 12,
    ).toBe(12);
});
it("preserves source full-reveal values above63 and refuses unsupported radius", () => {
  const w = fixture();
  w.terrain.bytes[12] = 64;
  revealCampaignRadius(w, [0, 0], 1024);
  expect(w.terrain.bytes[12]).toBe(64);
  expect(() => revealCampaignRadius(w, [0, 0], 0)).toThrow(/radius/);
});
