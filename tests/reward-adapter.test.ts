import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  createCampaignReward,
  createRewardSchedulerOptions,
  queryCampaignRewardTarget,
} from "../src/sim/campaign/reward-adapter";
import {
  stepEffectScheduler,
  cloneEffectHost,
  commitEffectHost,
} from "../src/sim/campaign/effect-scheduler";
import {
  rewardQuery,
  type RewardQuery,
} from "../src/sim/mechanics/reward-effect";
import { createMotion } from "../src/sim/mechanics/motion";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import type { SourceEntityId } from "../src/sim/campaign/source-pools";
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function fixture() {
  const pack = campaignFixture();
  pack.rules!.tables.blueprintStat17Caps = [100, 100, 100, 100];
  pack.rules!.tables.blueprintStat19Caps = [120, 120, 120, 120];
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 8 }, (_, i) => ({
      components: [],
      sourceComponents: [[0, -24, -6, 0, 0]],
      sourceSize: [2, 2],
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
  const w = createCampaign(pack, "reward-adapter-synthetic");
  w.spatial = { heads: Array(16384).fill(null), nodes: {} };
  w.actors = [];
  w.ecology.mules = [];
  w.creatureNative = Array.from({ length: 300 }, () =>
    Array.from({ length: 124 }, (_, i) => (i >= 31 && i < 39 ? null : 0)),
  );
  w.landings = [
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
  const base = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: () => 0,
  };
  const n: (number | null)[] = Array.from({ length: 81 }, (_, p) =>
    p >= 31 && p < 39 ? null : 0,
  );
  n[6] = 5;
  n[69] = 59;
  put(n, 7, 8192);
  put(n, 9, 8192);
  put32(n, 39, 1000);
  const query = rewardQuery(n, { seed: 5428, draws: 0, ring: 0 });
  return { w, pack, base, n, query };
}
function actor(
  f: ReturnType<typeof fixture>,
  index = 0,
  x = 8192,
  y = 8192,
  height = 1000,
) {
  const sourceId = `source:2:${index}` as SourceEntityId,
    motion = createMotion(x, y, 900, 0);
  motion.height = height;
  const blueprint = f.w.players[0].blueprints[0];
  blueprint.skill = 1;
  blueprint.maxHealth = 2;
  blueprint.health = 2;
  f.w.actors.push({
    id: index,
    sourceId,
    owner: 0,
    blueprintIndex: blueprint.index,
    art: "HARCH",
    motion,
    ready: false,
    goal: null,
    route: [],
    animation: {
      action: 0,
      frame: 0,
      hold: 0,
      direction: 1,
      delay: 0,
      counter: 0,
    },
    idleTimer: 0,
    idleFacing: false,
    egressBuildingId: null,
    reason: "",
    orders: [],
  });
  insertSpatial(f.w.spatial, f.w.terrain, sourceId, worldCell(x, y));
  return blueprint;
}
function creature(
  f: ReturnType<typeof fixture>,
  index = 0,
  x = 8192,
  y = 8192,
  height = 1000,
  owner = 0,
) {
  const n = f.w.creatureNative[index];
  n[6] = 1;
  n[24] = owner;
  n[0x7a] = 4;
  put(n, 7, x);
  put(n, 9, y);
  put32(n, 17, 900);
  put32(n, 39, height);
  put(n, 0x62, 200);
  put(n, 0x64, 300);
  put(n, 0x68, 1);
  put(n, 0x6a, 2);
  // Deliberately separate input projections: staging must rebind current Mule.
  const live = n.slice();
  f.w.ecology.mules.push({
    id: `source:0:${index}`,
    index,
    native: live,
    pending: [],
  });
  insertSpatial(f.w.spatial, f.w.terrain, `source:0:${index}`, worldCell(x, y));
  return live;
}
describe("source reward59 campaign adapter", () => {
  it("walks source point/head order and keeps first equal-distance target without a ready/cap filter", () => {
    const f = fixture(),
      bp = actor(f, 0, 8192, 8192, 1000),
      m = creature(f, 0, 8192, 8192, 1000);
    bp.skill = 100;
    bp.maxHealth = 120;
    const saved = JSON.stringify(f.w),
      rng = { ...f.w.rng },
      r = queryCampaignRewardTarget(f.w, f.n, f.query);
    expect(r.visits.map((v) => v.id)).toEqual(["source:0:0", "source:2:0"]);
    expect(r.target?.id).toBe("source:0:0");
    expect(r.target?.kind === 1 && r.target.native).toBe(m);
    expect(r.visits.map((v) => v.selected)).toEqual([true, false]);
    expect(JSON.stringify(f.w)).toBe(saved);
    expect(f.w.rng).toEqual(rng);
  });
  it("uses physical height in73770 and exactrelative height infeedback, independent of rawframe dimensions", () => {
    const f = fixture();
    actor(f, 0, 8192, 8192, 3048);
    creature(f, 0, 8192, 8192, 3049);
    const r = queryCampaignRewardTarget(f.w, f.n, f.query);
    //3048 and3049 fall into the same signed >>3 height bucket: first head wins.
    expect(r.target?.id).toBe("source:0:0");
    expect(r.target).toMatchObject({ height: 3049, visualHeight: 2149 });
    expect(r.visits.find((v) => v.id === "source:2:0")?.distance).toBe(65536);
    //3056 crosses the8-unit bucket boundary and is outside the radius.
    f.w.ecology.mules[0].native[39] = 0;
    put32(f.w.ecology.mules[0].native, 39, 3056);
    expect(queryCampaignRewardTarget(f.w, f.n, f.query).target?.id).toBe(
      "source:2:0",
    );
  });
  it("excludes neutral creatures before unknown heights, accepts full owned creatures before later eligibility", () => {
    const f = fixture(),
      neutral = creature(f, 0, 8192, 8192, 1000, 4);
    neutral[39] = null;
    const owned = creature(f, 1, 8240, 8192, 1000, 0);
    f.w.players[0].raw[0x6cb] = 1;
    const r = queryCampaignRewardTarget(f.w, f.n, f.query);
    expect(r.target?.id).toBe("source:0:1");
    expect(r.target?.kind === 1 && r.target.native).toBe(owned);
  });
  it("preserves planned cardinal order across torus edges and rejects malformed chain/plan/unknown native", () => {
    const f = fixture();
    put(f.n, 7, 32760);
    put(f.n, 9, 8);
    const q = rewardQuery(f.n, { seed: 5428, draws: 0, ring: 0 });
    actor(f, 0, 8, 8, 1000);
    expect(queryCampaignRewardTarget(f.w, f.n, q).target?.id).toBe(
      "source:2:0",
    );
    expect(() =>
      queryCampaignRewardTarget(f.w, f.n, {
        ...q,
        points: [...q.points].reverse(),
      }),
    ).toThrow("point order");
    f.w.spatial.nodes["source:2:0"].next = "source:2:0";
    expect(() => queryCampaignRewardTarget(f.w, f.n, q)).toThrow("spatial");
  });
  it("stages and commits live creature aliases, blueprint rawbytes and source audio/event hooks", () => {
    const f = fixture();
    const bp = actor(f);
    creature(f);
    const seen: string[] = [];
    const hooks = createRewardSchedulerOptions(
      f.pack,
      { ...f.base, onRewardEvent: (_w, _slot, e) => seen.push(e.type) },
      { presentation: (_w, _slot, e) => seen.push("port:" + e.type) },
    );
    const s = cloneEffectHost(f.w, hooks);
    expect(s.creatureNative[0]).toBe(s.ecology.mules[0].native);
    expect(s.creatureNative[0]).not.toBe(f.w.ecology.mules[0].native);
    const b = s.players[0].blueprints.find((b) => b.index === bp.index)!;
    b.skill = 42;
    b.maxHealth = b.health = 71;
    hooks.onRewardEvent!(s, 3, {
      type: "specialist-improved",
      target: "source:2:0",
      skill: 42,
      health: 71,
    });
    hooks.onRewardEvent!(s, 3, {
      type: "audio",
      channel: 0x54,
      mode: 2,
      parameter: 255,
      ratePercent: 100,
      volume: 127,
    });
    hooks.onRewardEvent!(s, 3, {
      type: "adjust-audio",
      channel: 0x54,
      ratePercent: 500,
      parameter: 255,
    });
    hooks.onRewardEvent!(s, 3, { type: "selected-player-cue", cue: 0x3a });
    expect(bp.skill).toBe(1);
    expect(s.players[0].raw[0x16 + bp.index * 36 + 0x17]).toBe(42);
    expect(s.audio.requests.at(-1)).toMatchObject({
      entity: "source:4:3",
      cue: 0x54,
      mode: 2,
      parameter: 255,
      range: null,
      initialRatePercent: 100,
      gain: 1,
    });
    expect(seen).toEqual([
      "specialist-improved",
      "audio",
      "port:adjust-audio",
      "adjust-audio",
      "port:selected-player-cue",
      "selected-player-cue",
    ]);
    commitEffectHost(f.w, s, hooks);
    expect(
      f.w.players[0].blueprints.find((b) => b.index === bp.index)!.skill,
    ).toBe(42);
    expect(f.w.creatureNative[0]).toBe(f.w.ecology.mules[0].native);
  });
  it("uses exact EFF59 rawcomponentY and requires actual nonzero-owner AI registration atomically", () => {
    const f = fixture(),
      saved = JSON.stringify(f.w),
      request = {
        owner: 1,
        position: [8192, 8192] as [number, number],
        height: 1000,
        angles: [0, 0, 0] as [0, 0, 0],
      };
    expect(() => createCampaignReward(f.w, request, f.pack, f.base)).toThrow(
      "35F90",
    );
    expect(JSON.stringify(f.w)).toBe(saved);
    const calls: number[] = [];
    const slot = createCampaignReward(f.w, request, f.pack, f.base, {
      registerAI: (s, slot) => {
        expect(s).not.toBe(f.w);
        calls.push(slot);
      },
    });
    expect(slot).toBe(0);
    expect(calls).toEqual([0]);
    expect(word(f.w.powerEffects.slots[0].nativePrior!, 74)).toBe(6);
    expect(f.w.powerEffects.slots[0].nativePrior![76]).toBe(6);
  });
  it("runs real scheduler reward/contact/feedback against live creature and serializes the committed healing", () => {
    const f = fixture(),
      live = creature(f),
      slot = createCampaignReward(
        f.w,
        { owner: 0, position: [8192, 8192], height: 1000, angles: [0, 0, 0] },
        f.pack,
        f.base,
      )!;
    f.w.powerEffects.slots[slot].nativePrior![70] = 0;
    f.w.frame = 3;
    const events: string[] = [],
      hooks = createRewardSchedulerOptions(f.pack, f.base, {
        presentation: (_w, _slot, e) => events.push(e.type),
      });
    const r = stepEffectScheduler(f.w, f.pack, hooks);
    expect(r.rewards[0].update.contact).toBe("source:0:0");
    expect(f.w.players[0].raw[0x6cb]).toBe(1);
    expect(word(f.w.ecology.mules[0].native, 0x68)).toBe(200);
    expect(word(f.w.creatureNative[0], 0x6a)).toBe(300);
    expect(word(live, 0x68)).toBe(1);
    expect(events).toEqual([
      "adjust-audio",
      "research-message",
      "selected-player-cue",
    ]);
    const restored = JSON.parse(JSON.stringify(f.w));
    expect(word(restored.creatureNative[0], 0x6a)).toBe(300);
  });
  it("rolls back missing presentation services after a real reward update instead of swallowing its source event", () => {
    const f = fixture();
    creature(f);
    const slot = createCampaignReward(
      f.w,
      { owner: 0, position: [8192, 8192], height: 1000, angles: [0, 0, 0] },
      f.pack,
      f.base,
    )!;
    f.w.powerEffects.slots[slot].nativePrior![70] = 0;
    f.w.frame = 3;
    const saved = JSON.stringify(f.w);
    expect(() =>
      stepEffectScheduler(
        f.w,
        f.pack,
        createRewardSchedulerOptions(f.pack, f.base),
      ),
    ).toThrow("presentation");
    expect(JSON.stringify(f.w)).toBe(saved);
  });
});
