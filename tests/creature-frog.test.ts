import { describe, it, expect } from "vitest";
import { selectFrogAirborneAnimation } from "../src/sim/mechanics/creature-frog";
import { sharedCreatureCallbackSpecies } from "../src/sim/mechanics/creature-species";
import { put16, put32 } from "../src/sim/campaign/bytes";
function fixture() {
  const n = Array(124).fill(0);
  n[6] = 1;
  n[94] = 8;
  n[122] = 2;
  n[25] = 4;
  n[26] = 1;
  n[27] = 3;
  n[28] = 1;
  n[29] = 2;
  n[30] = 2;
  put16(n, 57, 800);
  put32(n, 17, 2048);
  return n;
}
describe("ordinary Frog airborne animation", () => {
  it.each([
    [63, 5120, false, 3],
    [64, 5120, true, 0],
    [2048, 5120, true, 2],
    [8192, 5120, true, 4],
    [64, 0, true, 8],
    [2048, -5120, true, 6],
    [8192, -5120, true, 5],
  ])(
    "uses source height%d and signed vertical velocity%d",
    (height, vz, handled, frame) => {
      const n = fixture();
      put32(n, 39, 2048 + Number(height));
      put16(n, 49, Number(vz));
      const before = n.slice();
      expect(selectFrogAirborneAnimation(n, true, () => 8)).toBe(handled);
      if (!handled) expect(n).toEqual(before);
      else {
        expect([n[25], n[27], n[28]]).toEqual([4, frame, 0]);
        expect([n[26], n[29], n[30]]).toEqual([1, 2, 2]);
        expect(n.slice(31)).toEqual(before.slice(31));
      }
    },
  );
  it("retains the carried arm before height/frame lookup", () => {
    const n = fixture();
    n[97] = 1;
    expect(
      selectFrogAirborneAnimation(n, true, () => {
        throw Error("not read");
      }),
    ).toBe(true);
    expect([n[25], n[27], n[28], n[29], n[30]]).toEqual([4, 0, 0, 2, 2]);
  });
  it("leaves other species, states and controlled flight to their own arms", () => {
    for (const [has, state, flags] of [
      [false, 8, 0],
      [true, 0, 0],
      [true, 15, 0],
      [true, 8, 1024],
    ] as const) {
      const n = fixture();
      n[94] = state;
      put16(n, 73, flags);
      put32(n, 39, 4096);
      const before = n.slice();
      expect(selectFrogAirborneAnimation(n, has, () => 8)).toBe(false);
      expect(n).toEqual(before);
    }
  });
  it("requires actual frame metadata on the entered airborne arm", () => {
    const n = fixture();
    put32(n, 39, 4096);
    expect(() => selectFrogAirborneAnimation(n, true, () => 0)).toThrow(
      /frame count/,
    );
  });
  it("admits pure Frog ordinary callbacks without inventing other ability domains", () => {
    expect(sharedCreatureCallbackSpecies(2)).toBe(true);
    expect(sharedCreatureCallbackSpecies(9)).toBe(true);
    for (const s of [0, 6, 12, 13, 16, 17, 20, 23])
      expect(sharedCreatureCallbackSpecies(s)).toBe(false);
  });
});
