import { describe, expect, it } from "vitest";
import {
  classifyRecruitmentCenterSite,
  stepRecruitmentCenter,
  stepStagedRecruitmentCenter,
  type RecruitmentCenterContext,
} from "../src/sim/mechanics/recruitment-center";
import {
  createNativeBuilding,
  progressNativeBuilding,
} from "../src/sim/mechanics/building-native";
type Native = (number | null)[];
const put = (n: Native, at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
};
const word = (n: Native, at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
function fixture() {
  const native: Native = Array(67).fill(0),
    player: Native = Array(1805).fill(0),
    world = {
      native,
      player,
      trace: [] as number[],
      rng: { seed: 1234, draws: 7 },
    };
  native.fill(null, 31, 39);
  native[6] = 4;
  native[45] = 5;
  native[25] = 1;
  put(native, 43, 160);
  put(native, 49, 5);
  put(native, 61, 200);
  const c: RecruitmentCenterContext<typeof world> = {
    native: (w) => w.native,
    player: (w) => w.player,
    upkeep: Array(14).fill(1),
    profile: (_w, _i, action) => ({
      first: 0,
      last: action === 0 || action === 4 ? 2 : 1,
      flags: 0,
      holds: action === 0 || action === 4 ? [0, 0, 0] : [0, 0],
    }),
    requestLanding7F480(w) {
      w.trace.push(w.native[60]!);
      return { slot: 7, kind: 5 };
    },
  };
  return { world, c };
}
describe("source451F0 Recruitment Center", () => {
  it("owns exactly one upkeep/ANB pass and preserves pad fields and RNG", () => {
    const f = fixture();
    f.world.native[51] = 77;
    f.world.native[52] = 1;
    f.world.native[54] = 1;
    f.world.native[63] = 3;
    const result = stepStagedRecruitmentCenter(f.world, 0, f.c);
    expect([
      word(f.world.native, 61),
      f.world.native[63],
      f.world.native[27],
      f.world.native[28],
    ]).toEqual([196, 2, 1, 1]);
    expect([
      f.world.native[51],
      f.world.native[52],
      f.world.native[54],
    ]).toEqual([77, 1, 1]);
    expect(f.world.rng).toEqual({ seed: 1234, draws: 7 });
    expect(result.queueDraw).toBe(true);
  });
  it("clears pending2 before7F480 even after power is lost", () => {
    const f = fixture();
    f.world.native[60] = 2;
    put(f.world.native, 61, 0);
    const result = stepStagedRecruitmentCenter(f.world, 0, f.c);
    expect(f.world.trace).toEqual([0]);
    expect(result.landing).toEqual({ slot: 7, kind: 5 });
    expect(result.powerLost && result.warningStarted).toBe(true);
    expect(word(f.world.player, 0x5ea)).toBe(1000);
    expect([
      f.world.native[27],
      f.world.native[28],
      word(f.world.native, 49),
    ]).toEqual([0, 0, 1]);
  });
  it.each(["kind", "cooldown"])(
    "preserves request2 while %s blocks the source return predicate",
    (which) => {
      const f = fixture();
      f.world.native[60] = 2;
      if (which === "kind") f.world.player[0x498] = 5;
      else f.world.player[0x49c] = 128;
      expect(
        stepStagedRecruitmentCenter(f.world, 0, f.c).landingRequested,
      ).toBe(false);
      expect(f.world.native[60]).toBe(2);
      expect(f.world.trace).toEqual([]);
    },
  );
  it("capacity false leaves state0 and is not retried on the next callback", () => {
    const f = fixture();
    f.world.native[60] = 2;
    let count = 0;
    f.c.requestLanding7F480 = () => {
      count++;
      return null;
    };
    expect(stepStagedRecruitmentCenter(f.world, 0, f.c).landingRequested).toBe(
      true,
    );
    expect(stepStagedRecruitmentCenter(f.world, 0, f.c).landingRequested).toBe(
      false,
    );
    expect(count).toBe(1);
  });
  it("disabled mode bypasses request/upkeep and selects action4 at the grade frame", () => {
    const f = fixture();
    put(f.world.native, 49, 0x45);
    f.world.native[46] = 2;
    f.world.native[60] = 2;
    f.world.native[63] = 4;
    const r = stepStagedRecruitmentCenter(f.world, 0, f.c);
    expect([
      word(f.world.native, 61),
      f.world.native[63],
      f.world.native[25],
      f.world.native[27],
      f.world.native[28],
      f.world.native[60],
    ]).toEqual([199, 4, 4, 2, 0, 2]);
    expect(r.queueDraw).toBe(true);
  });
  it("damaged100 consumes upkeep plus inactive decay, preserving powered4", () => {
    const f = fixture();
    put(f.world.native, 49, 0x105);
    stepStagedRecruitmentCenter(f.world, 0, f.c);
    expect(word(f.world.native, 61)).toBe(198);
    expect(word(f.world.native, 49)).toBe(0x105);
    expect(f.world.native[28]).toBe(0);
  });
  it("retains signed16 wrap before clamp and extra-drain decrement", () => {
    const f = fixture();
    put(f.world.native, 61, -32768);
    stepStagedRecruitmentCenter(f.world, 0, f.c);
    expect(word(f.world.native, 61)).toBe(200);
  });
  it("empty incomplete native skips profile while positive incomplete queues grade0", () => {
    const f = fixture();
    put(f.world.native, 49, 0);
    put(f.world.native, 43, 0);
    f.c.profile = () => {
      throw Error("late profile");
    };
    expect(stepStagedRecruitmentCenter(f.world, 0, f.c).queueDraw).toBe(false);
    put(f.world.native, 43, 1);
    expect(() => stepStagedRecruitmentCenter(f.world, 0, f.c)).toThrow(
      "late profile",
    );
  });
  it("rolls back cross-pool mutations when a later real profile is missing", () => {
    const f = fixture();
    f.world.native[60] = 2;
    const before = structuredClone(f.world);
    f.c.requestLanding7F480 = (w) => {
      w.trace.push(77);
      w.rng.draws++;
      return { slot: 1, kind: 5 };
    };
    f.c.profile = () => {
      throw Error("actual BLAUN missing");
    };
    expect(() => stepRecruitmentCenter(f.world, 0, f.c)).toThrow("BLAUN");
    expect(f.world).toEqual(before);
  });
  it("rejects replaced held identities and unimplemented demolition explicitly", () => {
    const f = fixture();
    f.world.native[60] = 2;
    f.c.requestLanding7F480 = (w) => {
      w.player = w.player.slice();
      return null;
    };
    expect(() => stepStagedRecruitmentCenter(f.world, 0, f.c)).toThrow("held");
    put(f.world.native, 49, 0x805);
    expect(() => stepStagedRecruitmentCenter(f.world, 0, f.c)).toThrow(
      "demolition",
    );
  });
  it("factory5 resets52/54/60, retains51/53/58 and uses real completion bookkeeping", () => {
    const prior: Native = Array(67).fill(77);
    prior.fill(null, 31, 39);
    prior[6] = 0;
    const made = createNativeBuilding(prior, {
      slot: 0,
      owner: 0,
      selector: 5,
      position: [1024, 2048],
      ground: 4096,
      shade: 12,
    });
    expect(made.ok).toBe(true);
    if (!made.ok) throw Error(made.reason);
    expect([
      made.value[51],
      made.value[52],
      made.value[53],
      made.value[54],
      made.value[58],
      made.value[60],
    ]).toEqual([77, 0, 77, 0, 77, 0]);
    const p = progressNativeBuilding(made.value, {
      increment: 160,
      maximumHealth: 160,
      loading: false,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) throw Error(p.reason);
    expect(p.value.completedPlayerCountOffset).toBe(0x605);
    expect(p.value.acquiredOwnershipBit).toBe(32);
  });
  it("full74E80 BL5 checks the additional aligned 3x3 while lazy invalid main needs no profile", () => {
    const terrain = { bytes: Array(128 * 128 * 14).fill(0), revision: 0 };
    for (let i = 0; i < 16384; i++) terrain.bytes[i * 14 + 5] = 2;
    const main: [number, number] = [2000, 2000];
    expect(
      classifyRecruitmentCenterSite(terrain, main, [-128, 640], () => false),
    ).toBe("valid");
    const padCell = 9 * 128 + 6;
    terrain.bytes[padCell * 14 + 11] = 1;
    expect(
      classifyRecruitmentCenterSite(terrain, main, [-128, 640], () => false),
    ).toBe("blocked");
    terrain.bytes[7 * 128 * 14 + 7 * 14 + 11] = 1;
    expect(
      classifyRecruitmentCenterSite(terrain, main, undefined, () => false),
    ).toBe("blocked");
  });
});
