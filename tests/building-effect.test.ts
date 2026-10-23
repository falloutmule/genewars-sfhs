import { expect, it } from "vitest";
import {
  createBuildingEffect,
  stepBuildingEffect,
} from "../src/sim/mechanics/building-effect";
import { terrainFromBytes } from "../src/sim/mechanics/terrain";
const profile = { first: 0, last: 8, flags: 0, holds: Array(9).fill(0) };
function fixture() {
  const terrain = terrainFromBytes(
    Array.from({ length: 229376 }, (_, i) =>
      i % 14 === 3 ? 1 : i % 14 === 5 ? 2 : 0,
    ),
  );
  const prior: (number | null)[] = Array(81).fill(0xa5);
  prior.fill(null, 31, 39);
  prior[6] = 0;
  prior[30] = 127;
  const native = createBuildingEffect(prior, {
    slot: 0,
    owner: 0,
    selector: 11,
    buildingSlot: 3,
    point: [127, 127],
    ground: 512,
    height: 512,
    shade: 12,
  });
  return { terrain, native };
}
it("keeps source priors and actual building reference until ordinary animation retirement", () => {
  const { terrain, native } = fixture();
  expect(native.slice(71, 74)).toEqual([3, 0, 4]);
  expect(native[30]).toBe(127);
  expect(native[67]).toBe(0xa5);
  expect(native[76]).toBe(0xa5);
  let n = native,
    retired = false,
    ticks = 0;
  while (!retired && ticks++ < 40) {
    const result = stepBuildingEffect(n, terrain, 0, 16, profile);
    n = result.native;
    retired = result.retired;
  }
  expect(retired).toBe(true);
  expect(ticks).toBe(17);
  expect(n[27]).toBe(8);
  expect(n[59]).toBe(0);
  expect(n[60]).toBe(2);
  expect(n[6]).toBe(5); // Scheduler owns unlink and724C0 before final kind clear.
  expect(native[27]).toBe(0);
  expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
});
it("rejects unestablished changing-ground and water callbacks without mutation", () => {
  const { terrain, native } = fixture(),
    snapshot = structuredClone(native);
  expect(() => stepBuildingEffect(native, terrain, 512, 16, profile)).toThrow(
    /water physics/,
  );
  terrain.bytes[2] = 1;
  expect(() => stepBuildingEffect(native, terrain, 0, 16, profile)).toThrow(
    /physics/,
  );
  expect(native).toEqual(snapshot);
});
