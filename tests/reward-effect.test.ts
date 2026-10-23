import { describe, it, expect } from "vitest";
import {
  makeRewardEffect,
  stepRewardEffectRecord,
  selectEffectSlot,
  rewardTargetDistance,
  type RewardEffectContext,
  type RewardTarget,
} from "../src/sim/mechanics/reward-effect";
import {
  createCampaignRewardEffect,
  stepEffectScheduler,
} from "../src/sim/campaign/effect-scheduler";
import { createCampaign } from "../src/sim/campaign/world";
import { campaignFixture } from "./fixtures/campaign";
import { nextRandom } from "../src/sim/mechanics/random";
import { putEffectWord } from "../src/sim/mechanics/power-motion";
import { animationProfile } from "../src/sim/mechanics/animation";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial } from "../src/sim/campaign/spatial";
import type { Blueprint } from "../src/sim/mechanics/blueprints";
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const blueprint = (): Blueprint => ({
  index: 0,
  name: "Synthetic",
  style: 0,
  category: 0,
  skill: 1,
  health: 2,
  maxHealth: 2,
  runtimeFlags: 0,
  unresolved: { byte18: null, byte1b: null },
});
function fixture() {
  const pack = campaignFixture();
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 8 }, (_, i) => ({
      components: [],
      sourceComponents: [
        [0, -24, -6, 0, 0] as [number, number, number, number, number],
      ],
      width: 1,
      height: 1,
      rawFlags: [i < 5 ? 1 : 0, 0, 0],
    })),
    animations: Array.from({ length: 61 }, (_, i) => ({
      first: i === 26 ? 0 : i === 59 ? 7 : 5,
      last: i === 26 ? 4 : i === 59 ? 7 : 6,
      rawTrailingWord: i === 26 ? 5 : i === 59 ? 1 : 2,
    })),
  };
  const world = createCampaign(pack, "synthetic-reward");
  world.landings = [
    {
      slot: 199,
      owner: 0,
      point: [8192, 8192],
      height: 0,
      phase: 4,
      timer: 0,
      vz: 0,
      accelerationZ: 0,
      particles: [],
      messageIndex: null,
      activationFrame: null,
    },
  ];
  const options = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: (w: typeof world, id: `source:${number}:${number}`) =>
      cleanupCampaignReferences(w, id),
  };
  return { pack, world, options };
}
function pure() {
  const f = fixture(),
    prior = f.world.powerEffects.slots[0].nativePrior!.slice(),
    g = groundHeight(f.world.terrain, 8192, 8192);
  const n = makeRewardEffect(
    prior,
    {
      slot: 0,
      owner: 0,
      position: [8192, 8192],
      height: g,
      angles: [0, 0, 0],
      firstComponentY: -6,
    },
    f.world.terrain,
    f.pack.rules!.tables,
    animationProfile(f.pack.assets.EFF, 59),
  );
  const c: RewardEffectContext = {
    frame: 3,
    selectedPlayer: 0,
    skillCaps: [100, 100, 100, 100],
    healthCaps: [120, 120, 120, 120],
    players: f.world.players,
    nearestTarget: () => null,
    particle: () => false,
  };
  return { ...f, n, c };
}
describe("source59 monolith reward", () => {
  it("initializes exact emergence extent and preserves untouched shared priors", () => {
    const f = fixture(),
      p = f.world.powerEffects.slots[0].nativePrior!.slice();
    p[30] = 217;
    p[67] = 91;
    p[68] = 183;
    p[73] = 4;
    p[76] = 222;
    const n = makeRewardEffect(
      p,
      {
        slot: 0,
        owner: 0,
        position: [32760, 16],
        height: 1000,
        angles: [0, 0, 0],
        firstComponentY: -106,
      },
      f.world.terrain,
      f.pack.rules!.tables,
      animationProfile(f.pack.assets.EFF, 59),
    );
    expect([n[69], n[70], word(n, 74), n[76]]).toEqual([59, 255, 106, 106]);
    expect([n[30], n[67], n[68], n[73]]).toEqual([217, 91, 183, 4]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(p[76]).toBe(222);
  });
  it("allocates first free, then greatest unmarked priority with stable first ties", () => {
    const f = fixture(),
      pool = f.world.powerEffects;
    expect(selectEffectSlot(pool, 59)).toEqual({ slot: 0, replace: false });
    for (const s of pool.slots) {
      s.occupied = true;
      s.nativePrior![6] = 5;
      s.nativePrior![69] = 6;
      s.nativePrior![21] = 0;
    }
    pool.slots[3].nativePrior![69] = 32;
    pool.slots[3].nativePrior![21] = 1;
    pool.slots[41].nativePrior![69] = 32;
    pool.slots[42].nativePrior![69] = 32;
    expect(selectEffectSlot(pool, 59)).toEqual({ slot: 41, replace: true });
    for (const s of pool.slots) s.nativePrior![21] = 1;
    expect(selectEffectSlot(pool, 59)).toBeNull();
    pool.slots[9].nativePrior![69] = 99;
    expect(() => selectEffectSlot(pool, 59)).toThrow(/priority/);
  });
  it("uses three draws before each smoke attempt and no draws on emergence completion", () => {
    const f = pure(),
      rng = { seed: 5428, draws: 0, ring: null };
    putEffectWord(f.n, 74, 2);
    const calls: number[] = [];
    f.c.particle = (_r, r) => {
      calls.push(r.draws);
      return false;
    };
    let out = stepRewardEffectRecord(f.n, rng, f.c);
    expect(calls).toEqual([3]);
    expect(word(out.native, 74)).toBe(1);
    expect(out.native[70]).toBe(255);
    expect(out.newborns).toBe(0);
    expect(out.native[30]).toBe(f.n[30]);
    out = stepRewardEffectRecord(out.native, rng, f.c);
    expect(rng.draws).toBe(3);
    expect(out.native[70]).toBe(0);
    expect(word(out.native, 74)).toBe(0);
    expect(out.events.at(-1)).toEqual({
      type: "stop-if-playing",
      channel: 41,
      mode: 4,
    });
  });
  it("checks the nearest object before eligibility and keeps a full nearest specialist idle", () => {
    const f = pure(),
      rng = { seed: 10, draws: 0, ring: null },
      bp = blueprint();
    f.n[70] = 0;
    bp.skill = 100;
    bp.maxHealth = 120;
    f.c.nearestTarget = () => ({
      kind: 3,
      id: "source:2:0",
      owner: 0,
      position: [8192, 8192],
      height: groundHeight(f.world.terrain, 8192, 8192),
      visualHeight: 160,
      blueprint: bp,
    });
    const out = stepRewardEffectRecord(f.n, rng, f.c);
    expect(out.native[70]).toBe(0);
    expect(out.contact).toBeNull();
    expect(rng.draws).toBe(2);
  });
  it("performs ten real feedback factories before specialist draws and marked smoke", () => {
    const f = pure(),
      rng = { seed: 5428, draws: 0, ring: null },
      bp = blueprint();
    f.n[70] = 0;
    const target: RewardTarget = {
      kind: 3,
      id: "source:2:0",
      owner: 0,
      position: [8192, 8192],
      height: groundHeight(f.world.terrain, 8192, 8192),
      visualHeight: 160,
      blueprint: bp,
    };
    f.c.nearestTarget = () => target;
    const order: { code: number; draws: number; newborn: boolean }[] = [];
    f.c.particle = (r, stream) => {
      order.push({ code: r.code, draws: stream.draws, newborn: r.newborn });
      nextRandom(stream);
      return true;
    };
    const out = stepRewardEffectRecord(f.n, rng, f.c);
    expect(out.contact).toBe("source:2:0");
    expect(rng.draws).toBe(48);
    expect(order.map((o) => o.draws)).toEqual([
      5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 47,
    ]);
    expect(order.slice(0, 10).every((o) => o.code === 26 && !o.newborn)).toBe(
      true,
    );
    expect(order[10]).toMatchObject({ code: 6, newborn: true });
    expect(bp.skill).toBeGreaterThanOrEqual(26);
    expect(bp.maxHealth).toBeGreaterThanOrEqual(27);
    expect(bp.health).toBe(bp.maxHealth);
    expect(out.newborns).toBe(1);
    expect(out.native[70]).toBe(1);
  });
  it("unlocks an owned species and restores its two source values without specialist draws", () => {
    const f = pure(),
      rng = { seed: 5428, draws: 0, ring: null },
      native = Array<number | null>(124).fill(0);
    f.n[70] = 0;
    native[0x7a] = 2;
    putEffectWord(native, 0x62, 120);
    putEffectWord(native, 0x64, 87);
    f.c.players[0].raw[0x6c9] = 0;
    f.c.nearestTarget = () => ({
      kind: 1,
      id: "source:0:0",
      owner: 0,
      position: [8192, 8192],
      height: groundHeight(f.world.terrain, 8192, 8192),
      visualHeight: 100,
      native,
    });
    f.c.particle = (_r, stream) => {
      nextRandom(stream);
      return true;
    };
    const out = stepRewardEffectRecord(f.n, rng, f.c);
    expect(rng.draws).toBe(46);
    expect(f.c.players[0].raw[0x6c9]).toBe(1);
    expect([word(native, 0x68), word(native, 0x6a)]).toEqual([120, 87]);
    expect(out.events.some((e) => e.type === "creature-researched")).toBe(true);
  });
  it("retires after withdrawal with no final particle and retained source afterimage", () => {
    const f = pure(),
      rng = { seed: 10, draws: 0, ring: null };
    f.n[70] = 1;
    f.n[76] = 6;
    putEffectWord(f.n, 74, 5);
    const out = stepRewardEffectRecord(f.n, rng, f.c);
    expect(out.retirementRequired).toBe(true);
    expect(out.native[6]).toBe(5);
    expect(out.native[70]).toBe(0);
    expect(word(out.native, 74)).toBe(6);
    expect(rng.draws).toBe(0);
  });
  it("keeps height distance and wrapping source operands exact", () => {
    const f = pure();
    putEffectWord(f.n, 7, 32760);
    putEffectWord(f.n, 9, 0);
    expect(
      rewardTargetDistance(f.n, {
        position: [8, 0],
        height: groundHeight(f.world.terrain, 8192, 8192) + 80,
      }),
    ).toBe(256 + 100);
  });
  it("stages target gains, all feedback factories and RNG through a late scheduler rejection", () => {
    const f = fixture();
    f.world.frame = 3;
    f.world.players[0].blueprints[0] = blueprint();
    const slot = createCampaignRewardEffect(
      f.world,
      {
        owner: 0,
        position: [8192, 8192],
        height: groundHeight(f.world.terrain, 8192, 8192),
        angles: [0, 0, 0],
      },
      f.pack,
      f.options,
    )!;
    f.world.powerEffects.slots[slot].nativePrior![70] = 0;
    const last = f.world.powerEffects.slots[199];
    last.occupied = true;
    last.nativePrior![6] = 5;
    last.nativePrior![69] = 99;
    last.nativePrior![21] = 0;
    putEffectWord(last.nativePrior!, 15, 199);
    putEffectWord(last.nativePrior!, 7, 8192);
    putEffectWord(last.nativePrior!, 9, 8192);
    insertSpatial(
      f.world.spatial,
      f.world.terrain,
      "source:4:199",
      32 * 128 + 32,
    );
    const before = JSON.stringify(f.world);
    expect(() =>
      stepEffectScheduler(f.world, f.pack, {
        ...f.options,
        rewardTarget: (w) => ({
          kind: 3,
          id: "source:2:0",
          owner: 0,
          position: [8192, 8192],
          height: groundHeight(w.terrain, 8192, 8192),
          visualHeight: 160,
          blueprint: w.players[0].blueprints[0],
        }),
      }),
    ).toThrow(/selector 99/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
});

