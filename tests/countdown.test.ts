import { describe, it, expect } from "vitest";
import {
  countdownTransition,
  countdownPresentation,
  countdownExpiryRequests,
  countdownAnimationRequests,
} from "../src/sim/mechanics/countdown";
import { put16 } from "../src/sim/campaign/bytes";
describe("source13780 countdown", () => {
  const base = {
    count: 0,
    period: 6000,
    progress: 0,
    playerByte607: 0,
    runtimeFlags: 0,
    activeSelector0: false,
  };
  it("restarts only without a live selector0 and preserves source sentinels", () => {
    expect(countdownTransition(base)).toEqual({
      before: 0,
      after: 6000,
      started: true,
      expired: false,
    });
    expect(countdownTransition({ ...base, activeSelector0: true }).after).toBe(
      0,
    );
    expect(countdownTransition({ ...base, runtimeFlags: 0x80 }).after).toBe(
      65535,
    );
    expect(countdownTransition({ ...base, count: 65535 }).expired).toBe(false);
    expect(countdownTransition({ ...base, count: 65535 }).after).toBe(65535);
    expect(countdownTransition({ ...base, count: 1 }).expired).toBe(true);
  });
  it("uses the special progress timer and607 gate before the normal sentinel rule", () => {
    for (const progress of [14, 20]) {
      expect(
        countdownTransition({ ...base, progress, runtimeFlags: 0xff }).after,
      ).toBe(3000);
      expect(countdownTransition({ ...base, progress, count: 1 }).after).toBe(
        1,
      );
      expect(
        countdownTransition({ ...base, progress, count: 1, playerByte607: 1 })
          .expired,
      ).toBe(true);
      expect(
        countdownTransition({
          ...base,
          progress,
          count: 65535,
          playerByte607: 1,
        }).after,
      ).toBe(65534);
    }
  });
  it("retains presentation order and exact UI descriptor/state requests", () => {
    const expiry = countdownTransition({ ...base, count: 1 });
    expect(countdownPresentation(expiry, 2).map((e) => e.type)).toEqual([
      "expiry-effect3a",
      "expiry-effect3a",
      "expiry-narration",
    ]);
    expect(countdownAnimationRequests()).toHaveLength(8);
    expect(countdownAnimationRequests()[7]).toEqual({
      type: "advance-ui-animation",
      descriptorOffset: 0x154,
      stateAddress: 0x184d2a,
    });
  });
  it("uses signed building count and skips only the exact source player gate", () => {
    const players = Array.from({ length: 4 }, () => Array(1805).fill(0));
    players[0][0x4a2] = 1;
    put16(players[0], 0x5fc, 32767);
    put16(players[0], 0x5fe, -32768);
    players[1][0x4a2] = 255;
    put16(players[1], 9, -1234);
    put16(players[1], 11, 5678);
    players[2][0x6e3] = 1;
    players[3][0x6e3] = 255;
    expect(countdownExpiryRequests(players, () => -100)).toEqual([
      {
        owner: 0,
        selector: 0,
        position: [32767, -32768],
        initialHeight: 25500,
      },
      { owner: 1, selector: 0, position: [-1234, 5678], initialHeight: 25500 },
    ]);
    expect(() =>
      countdownExpiryRequests([...players, players[0]], () => 0),
    ).toThrow(/4players/);
    expect(() => countdownTransition({ ...base, count: -1 })).toThrow(
      /context/,
    );
  });
});
