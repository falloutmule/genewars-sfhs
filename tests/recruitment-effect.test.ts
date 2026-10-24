import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  makeRecruitmentEffect,
  planRecruitmentLandingReturn,
  stepRecruitmentEffectRecord,
} from "../src/sim/mechanics/recruitment-effect";
import {
  createCampaignRecruitmentLanding,
  createStagedCampaignRecruitmentLanding,
  createStagedCampaignRecruitmentEffect,
  createStagedCampaignRecruitmentMarker,
  stepCampaignRecruitmentEffect,
} from "../src/sim/campaign/recruitment-landing-adapter";
import {
  stepEffectScheduler,
  retireStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  createLanding,
  stepLandingMain,
  type LandingContext,
} from "../src/sim/mechanics/landing";
import { animationProfile } from "../src/sim/mechanics/animation";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { put16, put32, i16, u32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
import { nextRandom } from "../src/sim/mechanics/random";

const descriptor = (code: 64 | 51) => ({
  code,
  retirementMode: code === 64 ? 6 : 0,
  gravity: code === 64,
  priority: code === 64 ? 1 : 2,
  childCode: code === 64 ? 51 : null,
  movable: code === 64,
  waterResponse: code === 64,
});
/** Synthetic fixtures, never campaign acceptance or original-data substitutes. */
function fixture() {
  const pack = campaignFixture(),
    eff = structuredClone(pack.assets.EFF),
    frame = eff.frames![0],
    counts = Array(71).fill(1);
  counts[6] = 13;
  counts[47] = 6;
  counts[51] = 23;
  counts[64] = 5;
  eff.frames = [];
  eff.animations = counts.map((count, code) => {
    const first = eff.frames!.length;
    for (let i = 0; i < count; i++)
      eff.frames!.push({
        ...structuredClone(frame),
        rawFlags: [code === 64 ? 1 : 0, 0, 0],
      });
    return { first, last: first + count - 1, rawTrailingWord: count };
  });
  pack.assets.EFF = eff;
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) =>
      code === 64 || code === 51
        ? descriptor(code)
        : {
            code,
            retirementMode: 0,
            gravity: false,
            priority: 1,
            childCode: null,
            movable: false,
            waterResponse: false,
          },
    ),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-recruitment-effect");
  const options: EffectSchedulerOptions<CampaignWorld> = {
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    stageHost: (a, s) => Object.assign(s, structuredClone(a)),
    commitHost: (a, s) => Object.assign(a, s),
    recruitmentEffect: (s, slot, out) =>
      stepCampaignRecruitmentEffect(s, slot, pack, options, out),
  };
  for (let slot = 0; slot < 200; slot++)
    if (w.powerEffects.slots[slot].occupied)
      retireStagedSharedEffect(w, slot, options);
  for (const l of w.landings) l.phase = 4;
  const q = {
    code: 64 as const,
    owner: 2,
    position: [8192, 8192] as [number, number],
    height: groundHeight(w.terrain, 8192, 8192),
    angles: [0, 0, 0] as [number, number, number],
    parameter: 0,
    delay: 0,
    newborn: false,
  };
  const context = (slot = 0) => ({
    frame: w.frame,
    gravity: 512,
    water: 0,
    tables: pack.rules!.tables,
    bounce: pack.rules!.tables.bounce,
    profile: animationProfile(pack.assets.EFF, 64),
    obstacleTarget: () => null,
    child: () => false,
  });
  return { pack, w, options, q, context };
}
describe("recruitment64/0x40 and49 parameter1", () => {
  it("retains real priors and writes only64's specified common fields/payload", () => {
    const { w, pack, q } = fixture(),
      prior = w.powerEffects.slots[0].nativePrior!;
    prior[30] = 91;
    prior[67] = 13;
    prior[68] = 241;
    prior[73] = 4;
    prior[76] = 99;
    const n = makeRecruitmentEffect(
      prior,
      0,
      q,
      w.terrain,
      pack.rules!.tables,
      animationProfile(pack.assets.EFF, 64),
      descriptor(64),
    );
    expect([n[30], n[67], n[68], n[73], n[76]]).toEqual([91, 13, 241, 4, 0]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(prior[76]).toBe(99);
  });
  it("mode6 ignores expired timer and completed ANB until payload1", () => {
    const { w, pack, q, context } = fixture();
    let n = makeRecruitmentEffect(
      w.powerEffects.slots[0].nativePrior!,
      0,
      q,
      w.terrain,
      pack.rules!.tables,
      context().profile,
      descriptor(64),
    );
    for (let i = 0; i < 30; i++) {
      const r = stepRecruitmentEffectRecord(n, w.terrain, {
        ...context(),
        frame: i,
      });
      expect(r.retirementRequired).toBe(false);
      expect(r.newborns).toBe(0);
      n = r.native;
    }
    expect(i16(n as number[], 74)).toBe(-1);
  });
  it.each([true, false])(
    "payload1 retires after child51 capacity result=%s",
    (created) => {
      const { w, pack, q, context } = fixture(),
        n = makeRecruitmentEffect(
          w.powerEffects.slots[0].nativePrior!,
          0,
          q,
          w.terrain,
          pack.rules!.tables,
          context().profile,
          descriptor(64),
        );
      n[76] = 1;
      const requests: unknown[] = [];
      const r = stepRecruitmentEffectRecord(n, w.terrain, {
        ...context(),
        child: (q) => {
          requests.push(q);
          return created;
        },
      });
      expect(r.retirementRequired).toBe(true);
      expect(r.newborns).toBe(Number(created));
      expect(requests).toEqual([{ ...q, code: 51, newborn: true }]);
      expect(r.native[6]).toBe(5);
    },
  );
  it("return scan selects first64 even when its retained record is inactive", () => {
    const { w } = fixture(),
      rows = w.powerEffects.slots.map((s) => s.nativePrior!);
    rows[7][69] = 64;
    rows[7][6] = 0;
    rows[11][69] = 64;
    rows[11][6] = 5;
    expect(planRecruitmentLandingReturn(rows, 0, 1)).toEqual({
      slot: 7,
      kind: 0,
    });
    rows[7][69] = 0;
    rows[11][69] = 0;
    expect(() => planRecruitmentLandingReturn(rows, 0, 1)).toThrow("one-past");
  });
  it("8AAE0 uses its unsigned startup gate and original marker point, without launch or RNG", () => {
    const { w, pack, options } = fixture(),
      rng = structuredClone(w.rng);
    expect(createStagedCampaignRecruitmentMarker(w, pack, options)).toBeNull();
    put32(w.missionPrefix, 0x1ec2, 0x80000000);
    put16(w.missionPrefix, 0x1c9a, 14000);
    put16(w.missionPrefix, 0x1c9c, 15000);
    const slot = createStagedCampaignRecruitmentMarker(w, pack, options)!,
      n = w.powerEffects.slots[slot].nativePrior!;
    expect([
      i16(n as number[], 7),
      i16(n as number[], 9),
      n[24],
      n[69],
      n[76],
    ]).toEqual([14000, 15000, 0, 64, 0]);
    expect(w.rng).toEqual(rng);
    expect(w.landings.every((l) => l.phase === 4)).toBe(true);
  });
  it("human factory publishes49 but returns/mutates64 and keeps held native identities", () => {
    const { w, pack, options, q } = fixture(),
      marker = createStagedCampaignRecruitmentEffect(w, q, pack, options)!,
      held = w.powerEffects.slots[marker].nativePrior!,
      rng = structuredClone(w.rng),
      r = createStagedCampaignRecruitmentLanding(
        w,
        {
          owner: 0,
          position: [10000, 12000],
          height: 30000,
          parameter: 1,
          parentBuilding: null,
        },
        pack,
        options,
      )!;
    expect(r.returned).toEqual({ slot: marker, kind: 5 });
    expect(r.allocatedSlot).not.toBe(marker);
    expect(w.powerEffects.slots[marker].nativePrior).toBe(held);
    expect(held[76]).toBe(1);
    const n = w.powerEffects.slots[r.allocatedSlot].nativePrior!;
    expect(n[76]).toBe(3);
    expect(i16(n as number[], 74)).toBe(1);
    expect(u32(n as number[], 39)).toBe(30000);
    expect(w.rng).toEqual(rng);
    expect(w.audio.requests.at(-1)?.entity).toBe(`source:4:${marker}`);
    expect(w.audio.requests.at(-1)).toMatchObject({
      cue: 80,
      mode: 2,
      parameter: 255,
      gain: 127,
      initialRatePercent: 180,
      range: 180,
    });
  });
  it("standalone factory rolls back late absent64/resource failure", () => {
    const { w, pack, options } = fixture(),
      before = checksum(w);
    expect(() =>
      createCampaignRecruitmentLanding(
        w,
        {
          owner: 0,
          position: [8192, 8192],
          height: 30000,
          parameter: 1,
          parentBuilding: null,
        },
        pack,
        options,
      ),
    ).toThrow("one-past");
    expect(checksum(w)).toBe(before);
  });
  it("shared scheduler creates real owner2 child51 and retains the player's associated marker reference", () => {
    const { w, pack, options, q } = fixture(),
      slot = createStagedCampaignRecruitmentEffect(w, q, pack, options)!;
    put16(w.players[0].raw, 0x496, slot);
    w.players[0].raw[0x498] = 5;
    w.powerEffects.slots[slot].nativePrior![76] = 1;
    const r = stepEffectScheduler(w, pack, options);
    expect(r.callbacks.map((c) => [c.code, c.phase])).toEqual([
      [64, "primary"],
      [51, "newborn"],
    ]);
    expect(w.players[0].raw[0x498]).toBe(5);
    expect(r.createdNewborns).toBe(1);
    const child = w.powerEffects.slots.find((s) => s.occupied)!;
    expect(child.nativePrior![24]).toBe(2);
    expect(child.nativePrior![69]).toBe(51);
    for (let i = 0; i < 23; i++) {
      w.frame++;
      stepEffectScheduler(w, pack, options);
    }
    expect(w.powerEffects.slots.some((s) => s.occupied)).toBe(false);
  });
  it("64 survives JSON/save continuation and late recursive allocation failure rolls back the scheduler", () => {
    const { w, pack, options, q } = fixture(),
      slot = createStagedCampaignRecruitmentEffect(w, q, pack, options)!;
    const loaded = loadCampaign(
      saveCampaign(w, { paused: false, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
    for (let i = 0; i < 8; i++) {
      w.frame++;
      loaded.frame++;
      stepEffectScheduler(w, pack, options);
      stepEffectScheduler(loaded, pack, options);
    }
    expect(checksum(w)).toBe(checksum(loaded));
    w.powerEffects.slots[slot].nativePrior![76] = 1;
    const before = checksum(w);
    options.recruitmentEffect = (s, i, out) =>
      stepCampaignRecruitmentEffect(
        s,
        i,
        pack,
        {
          ...options,
          cleanupReferences: () => {
            throw Error("late cleanup");
          },
        },
        out,
      );
    // Force the real51 factory to replace a lower-priority effect.
    pack.effectRules!.descriptors[64].priority = 1;
    const original = options.recruitmentEffect;
    options.recruitmentEffect = (s, i, out) => {
      original!(s, i, out);
      throw Error("late factory");
    };
    expect(() => stepEffectScheduler(w, pack, options)).toThrow("late factory");
    expect(checksum(w)).toBe(before);
  });
  it("payload3 holds original timer until actual actor count0, then waits75 before takeoff", () => {
    const { w, pack } = fixture(),
      s = createLanding(
        0,
        [8192, 8192],
        w.terrain,
        0,
        w.powerEffects.slots[0].nativePrior!,
      );
    s.native![76] = 3;
    s.phase = 1;
    s.timer = 150;
    s.height = groundHeight(w.terrain, ...s.point);
    s.vz = 0;
    let count = 1;
    const c: LandingContext = {
      terrain: w.terrain,
      tables: pack.rules!.tables,
      bounce: pack.rules!.tables.bounce,
      water: 0,
      gravity: 512,
      frame: 1,
      profile: (code) => animationProfile(pack.assets.EFF, code),
      plantBlockerWeight: () => 0,
      occupiedEffectSlots: [0],
      slotPriors: w.powerEffects.slots,
      playerActorCount: () => count,
      obstacle: () => null,
    };
    const rng = structuredClone(w.rng);
    expect(stepLandingMain(s, w.rng, c)).toEqual([]);
    expect(s.timer).toBe(150);
    expect(w.rng).toEqual(rng);
    count = 0;
    stepLandingMain(s, w.rng, c);
    expect(s.timer).toBe(75);
    expect(s.native![76]).toBe(2);
    delete c.playerActorCount;
    s.timer = 1;
    stepLandingMain(s, w.rng, c);
    expect(s.phase).toBe(2);
    expect(s.vz).toBe(512);
  });
  it("normal campaign64 callback survives full save and recorded replay through feedback retirement", () => {
    const { w, pack, options, q } = fixture();
    enterCampaign(w);
    //This synthetic arrangement admits the real host; it is not mission play.
    createStagedCampaignRecruitmentEffect(w, q, pack, options);
    const replay = recordCampaign(w, null),
      loaded = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    for (let i = 0; i < 8; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      expect(w.phase, w.notices.at(-1)?.text).toBe("active");
      expect(checksum(w)).toBe(checksum(loaded));
    }
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
  it.each([false, true])(
    "49 smoke uses real full-pool allocation; replaceable=%s",
    (replaceable) => {
      const { w, pack, options, q } = fixture(),
        made = createStagedCampaignRecruitmentLanding(
          w,
          {
            owner: 0,
            position: q.position,
            height: q.height,
            parameter: 0,
            parentBuilding: null,
          },
          pack,
          options,
        )!,
        l = w.landings.find(
          (l) => l.slot === made.allocatedSlot && l.phase !== 4,
        )!;
      l.phase = 1;
      l.timer = 50;
      l.vz = 0;
      for (let i = 1; i < 200; i++)
        createStagedCampaignRecruitmentEffect(
          w,
          { ...q, code: replaceable ? 51 : 64 },
          pack,
          options,
        );
      const expected = structuredClone(w.rng);
      //One source narration draw and three angle draws. Only a successful
      //48790 call consumes the final factory delay draw.
      for (let i = 0; i < (replaceable ? 5 : 4); i++) nextRandom(expected);
      const cleaned: number[] = [];
      const r = stepEffectScheduler(w, pack, {
        ...options,
        cleanupReferences: (s, id) => {
          cleaned.push(Number(id.split(":").at(-1)));
          return cleanupCampaignReferences(s, id);
        },
      });
      expect(w.rng).toEqual(expected);
      expect(r.createdNewborns).toBe(Number(replaceable));
      expect(
        r.callbacks.some((c) => c.code === 6 && c.phase === "newborn"),
      ).toBe(replaceable);
      expect(cleaned).toEqual(replaceable ? [1] : []);
      expect(w.landings.find((a) => a.slot === made.allocatedSlot)!.timer).toBe(
        49,
      );
    },
  );
  it("49 rolls back parent, narration and RNG when replacement cleanup fails late", () => {
    const { w, pack, options, q } = fixture(),
      made = createStagedCampaignRecruitmentLanding(
        w,
        {
          owner: 0,
          position: q.position,
          height: q.height,
          parameter: 0,
          parentBuilding: null,
        },
        pack,
        options,
      )!,
      l = w.landings.find(
        (l) => l.slot === made.allocatedSlot && l.phase !== 4,
      )!;
    l.phase = 1;
    l.timer = 50;
    l.vz = 0;
    for (let i = 1; i < 200; i++)
      createStagedCampaignRecruitmentEffect(
        w,
        { ...q, code: 51 },
        pack,
        options,
      );
    const before = checksum(w);
    expect(() =>
      stepEffectScheduler(w, pack, {
        ...options,
        cleanupReferences: () => {
          throw Error("late particle cleanup");
        },
      }),
    ).toThrow("late particle cleanup");
    expect(checksum(w)).toBe(before);
  });
  it("uses signed expired timers and preserves the explicit departure vector", () => {
    const { w, pack } = fixture(),
      s = createLanding(
        0,
        [8192, 8192],
        w.terrain,
        0,
        w.powerEffects.slots[0].nativePrior!,
      );
    s.phase = 1;
    s.timer = 0;
    s.height = groundHeight(w.terrain, ...s.point);
    s.vz = 0;
    const c: LandingContext = {
      terrain: w.terrain,
      tables: pack.rules!.tables,
      bounce: pack.rules!.tables.bounce,
      water: 0,
      gravity: 512,
      frame: 0,
      profile: (code) => animationProfile(pack.assets.EFF, code),
      plantBlockerWeight: () => 0,
      occupiedEffectSlots: [0],
      slotPriors: w.powerEffects.slots,
      obstacle: () => null,
      particleFactory: () => null,
    };
    stepLandingMain(s, w.rng, c);
    expect([s.phase, s.timer, s.vz]).toEqual([2, 30, 512]);
    expect([
      i16(s.native! as number[], 57),
      i16(s.native! as number[], 59),
      i16(s.native! as number[], 61),
    ]).toEqual([0, 0, 512]);
    s.timer = 100;
    const before = w.rng.draws;
    stepLandingMain(s, w.rng, c);
    expect(w.rng.draws - before).toBe(3);
    expect(s.timer).toBe(99);
  });
});
