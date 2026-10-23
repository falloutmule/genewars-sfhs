import { it, expect } from "vitest";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
it("clears source reference kinds and creature flags while retaining index words", () => {
  const n = Array(124).fill(0);
  n[6] = 1;
  n[0x5b] = 17;
  n[0x5d] = 5;
  n[0x60] = 7;
  const prior = n.slice();
  const count = cleanupCampaignReferences(
    { ecology: { mules: [{ native: n }] }, source: { entities: [] } },
    "source:4:17",
  );
  expect(count).toBe(2);
  expect(n[0x5b]).toBe(17);
  expect(n[0x5d]).toBe(0);
  expect(n[0x60]).toBe(5);
  expect(n.slice(0, 0x5b)).toEqual(prior.slice(0, 0x5b));
});
it("respects inactive records and reference kinds from other pools", () => {
  const n = Array(124).fill(0);
  n[6] = 1;
  n[0x4d] = 3;
  n[0x4f] = 4;
  expect(
    cleanupCampaignReferences(
      { ecology: { mules: [{ native: n }] }, source: { entities: [] } },
      "source:4:3",
    ),
  ).toBe(0);
  expect(n[0x4f]).toBe(4);
});
