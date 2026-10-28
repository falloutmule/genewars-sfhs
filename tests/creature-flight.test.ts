import { describe, expect, it } from "vitest";
import { advanceCreatureFlightGoal, beginCreatureFlight, creatureIsFlying, turnCreatureFlightAngles, selectCreatureFlightAnimation } from "../src/sim/mechanics/creature-flight";

const put = (n: number[], at: number, value: number) => {
  n[at] = value & 255; n[at + 1] = value >> 8 & 255;
};
const word = (n: number[], at: number) => (n[at] | n[at + 1] << 8) << 16 >> 16;
const tables = {
  atan: Array.from({length:257}, (_, i) => Math.round(Math.atan(i / 256) * 1024 / Math.PI)),
  sine: Array.from({length:2048}, (_, i) => Math.round(Math.sin(i * Math.PI / 1024) * 65536)),
  cosine: Array.from({length:2048}, (_, i) => Math.round(Math.cos(i * Math.PI / 1024) * 65536)),
};
function fixture() {
  const n = Array(124).fill(0);
  put(n, 7, 10000); put(n, 9, 10000); put(n, 17, 2048); put(n, 39, 4096);
  put(n, 43, 32); put(n, 63, 400); put(n, 73, 0x10);
  beginCreatureFlight(n);
  return n;
}
describe("shared creature flight control", () => {
  it("turns yaw across its seam and pitch at the original two-width rate", () => {
    const n = fixture(); put(n, 57, 2030); put(n, 75, 20); put(n, 69, 512);
    expect(turnCreatureFlightAngles(n, true)).toBe(true);
    expect(word(n, 57)).toBe(20); expect(word(n, 59)).toBe(364);
    expect(n[74] & 0x20).toBe(0);
  });
  it("preserves non-Bird airborne yaw while allowing either Bird component", () => {
    const n = fixture(); put(n, 73, 0); put(n, 57, 0); put(n, 75, 400);
    expect(turnCreatureFlightAngles(n, false)).toBe(false);
    expect(word(n, 57)).toBe(0);
    expect(turnCreatureFlightAngles(n, true)).toBe(true);
    expect(word(n, 57)).toBe(64);
  });
  it("climbs below the cruise boundary and aims toward terrain when close", () => {
    const n = fixture(); put(n, 69, 300);
    const far = { position: [15000, 10000] as [number, number], height: 2048, associated:false, flying:false };
    expect(advanceCreatureFlightGoal(n, far, 1, tables)).toBe(false);
    expect(word(n, 69)).toBe(284); expect(n[74] & 0x40).toBe(0x40);
    const near = { ...far, position: [10100, 10000] as [number, number] };
    expect(advanceCreatureFlightGoal(n, near, 3, tables)).toBe(false);
    expect(n[74] & 0x40).toBe(0); expect(word(n, 69)).toBeGreaterThan(512);
  });
  it("clears controlled flight and lift on actual ground-goal arrival", () => {
    const n = fixture();
    const target = { position:[10010, 10000] as [number, number], height:2048, associated:false, flying:false };
    expect(advanceCreatureFlightGoal(n, target, 1, tables)).toBe(true);
    expect(creatureIsFlying(n)).toBe(false); expect(n[21] & 0x20).toBe(0);
    expect(word(n, 73) & 0x220).toBe(0x220);
    // Point-goal distance is terrain-to-terrain; the caller retains height
    // during6E9E0's BL=1 snap and then ordinary gravity completes the landing.
    expect(word(n, 39)).toBe(4096);
  });
  it("retains the flight loop and its climb/descent playback cadence", () => {
    const n=fixture(); n[94]=8; n[27]=17; n[30]=0;
    expect(selectCreatureFlightAnimation(n)).toBe(true);
    expect([n[27],n[28],n[29]]).toEqual([6,1,1]);
    n[74]|=0x40; selectCreatureFlightAnimation(n); expect(n[29]).toBe(0);
    n[74]=(n[74]&0xbf)|0x80; n[27]=17; n[30]=1;
    selectCreatureFlightAnimation(n); expect([n[27],n[29],n[30]]).toEqual([17,2,1]);
    n[97]|=1; selectCreatureFlightAnimation(n);
    expect([n[27],n[28],n[29]]).toEqual([0,0,2]);
  });
  it.each([[128, false], [129, true], [-128, false], [-129, true]])("uses the inclusive vertical arrival tolerance %i", (delta, moving) => {
    const n = fixture(); n[22] |= 0x40; put(n,11,4096 + delta);
    const xy=n.slice(7,11);
    expect(advanceCreatureFlightGoal(n, {position:[0,0],height:0,associated:false,flying:false},1,tables)).toBe(false);
    expect(n.slice(7,11)).toEqual(xy);
    expect(!!(n[22]&0x40)).toBe(moving);
    if (moving) {
      expect(n[74]&0xc0).toBe(delta>0?0x40:0x80);
      expect(word(n,69)).toBe(delta>0?0:1024);
    } else {
      expect(n.slice(45,51)).toEqual(Array(6).fill(0));
      expect(word(n,63)).toBe(0); expect(word(n,73)&0x220).toBe(0x220);
    }
  });
});
