import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  makeEngineerCharge,
  makeEngineerChargeFeedback,
  stepEngineerChargeRecord,
  planEngineerChargePhase,
  type EngineerChargeDescriptor,
} from "../src/sim/mechanics/engineer-charge";
import {
  createCampaignEngineerCharge,
  createStagedCampaignEngineerCharge,
  setStagedCampaignEngineerChargePhase,
  campaignEngineerChargeServices,
  stepCampaignEngineerChargeEffect,
} from "../src/sim/campaign/engineer-charge-adapter";
import {
  publishStagedSharedEffect,
  retireStagedSharedEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { animationProfile } from "../src/sim/mechanics/animation";
import { stepEngineerChargeChildRecord } from "../src/sim/mechanics/production-effect";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { i16, u16 } from "../src/sim/campaign/bytes";
import { putEffectWord as put16 } from "../src/sim/mechanics/power-motion";
import type { EngineerTakeoverChargeRequest } from "../src/sim/mechanics/engineer-construction";
import { cancelStagedCampaignEngineer } from "../src/sim/campaign/engineer-adapter";

/** Synthetic phase arrangements exercise normal factories/shared callbacks;
 * they do not represent an ordinary mission or canonical acceptance. */
describe("Engineer planted50/0x32 and real feedback51/0x33,10/0x0A", () => {
  const initialPack = campaignFixture();
  let start: CampaignWorld;
  beforeAll(() => {
    start = createCampaign(initialPack, "synthetic-engineer-charge");
    enterCampaign(start);
    for (let frame = 0; frame < 200; frame++) stepCampaign(start, initialPack);
    expect(start.specialists.records[0][6]).toBe(3);
  }, 30000);
  function fixture() {
    const pack = structuredClone(initialPack),
      w = structuredClone(start);
    const frames = pack.assets.EFF.frames!,
      animations = Array.from(
        { length: 71 },
        (_, code) =>
          pack.assets.EFF.animations![code] ?? {
            first: 0,
            last: 1,
            rawTrailingWord: 2,
          },
      );
    for (const [code, count] of [
      [10, 4],
      [50, 8],
      [51, 23],
    ]) {
      const first = frames.length;
      for (let j = 0; j < count; j++)
        frames.push({
          components: [],
          width: 1,
          height: 1,
          rawFlags: [code === 50 && j === 0 ? 2 : 0, 0, 0],
        });
      animations[code] = {
        first,
        last: frames.length - 1,
        rawTrailingWord: count,
      };
    }
    pack.assets.EFF.animations = animations;
    pack.effectRules = {
      schemaVersion: 1,
      descriptors: Array.from({ length: 71 }, (_, code) => ({
        code,
        retirementMode: code === 50 ? 5 : 0,
        gravity: false,
        priority: code === 50 ? 1 : code === 51 ? 2 : 25,
        childCode: null,
        movable: false,
        waterResponse: code === 50,
      })),
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    const q: EngineerTakeoverChargeRequest = {
      code: 50,
      actor: 0,
      building: 0,
      owner: 0,
      position: [1024, 1024],
      height: groundHeight(w.terrain, 1024, 1024),
      angles: [0, 0, 0],
      parameter: 0,
      delay: 1,
    };
    const options: EffectSchedulerOptions<CampaignWorld> = {
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    };
    options.engineerChargeEffect = (s, slot, out) =>
      stepCampaignEngineerChargeEffect(s, slot, pack, options, out);
    //Isolate this synthetic family from any retained startup smoke/landing.
    for (let slot = 0; slot < 200; slot++)
      if (w.powerEffects.slots[slot].occupied)
        retireStagedSharedEffect(w, slot, options);
    return { w, pack, q, options };
  }
  function charge(f: ReturnType<typeof fixture>, actor = 0) {
    return createStagedCampaignEngineerCharge(
      f.w,
      { ...f.q, actor },
      f.pack,
      f.options,
    )!;
  }
  function fill(f: ReturnType<typeof fixture>, replacement = false) {
    for (let slot = 0; slot < 200; slot++) {
      if (f.w.powerEffects.slots[slot].occupied) continue;
      const n =
        replacement && slot === 1
          ? makeEngineerChargeFeedback(
              f.w.powerEffects.slots[slot].nativePrior!,
              slot,
              {
                code: 10,
                owner: 0,
                position: f.q.position,
                height: f.q.height,
                angles: [0, 0, 0],
                parameter: 0,
                delay: 0,
                newborn: true,
              },
              f.w.terrain,
              animationProfile(f.pack.assets.EFF, 10),
              f.pack.effectRules!.descriptors[10],
            )
          : makeEngineerCharge(
              f.w.powerEffects.slots[slot].nativePrior!,
              slot,
              f.q,
              f.w.terrain,
              animationProfile(f.pack.assets.EFF, 50),
              f.pack.effectRules!.descriptors[50],
            );
      publishStagedSharedEffect(f.w, slot, n);
    }
  }
  it("uses actual shared factory flags/parent while retaining counter/fractions/payload and pointers", () => {
    const f = fixture(),
      prior = f.w.powerEffects.slots.find((p) => !p.occupied)!.nativePrior!;
    prior[30] = 219;
    prior[67] = 181;
    prior[68] = 193;
    prior[76] = 99;
    const before = prior.slice(),
      rng = { ...f.w.rng },
      slot = charge(f),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    expect(u16(n as number[], 21)).toBe(0x820);
    expect(i16(n as number[], 74)).toBe(-1);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect([n[30], n[67], n[68], n[76], i16(n as number[], 71), n[73]]).toEqual(
      [219, 181, 193, 99, 0, 3],
    );
    expect(f.w.rng).toEqual(rng);
    expect(before[6]).toBe(0);
    expect(f.w.spatial.nodes[`source:4:${slot}`]).toBeDefined();
    expect(u16(f.w.missionPrefix, 0x3554)).toBe(
      f.w.powerEffects.slots.filter((p) => p.occupied).length,
    );
  });
  it("keeps default phase planted across animation loops without touching timer/physics", () => {
    const f = fixture(),
      slot = charge(f),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    put16(n, 74, 25);
    n[30] = 255;
    const before = n.slice();
    for (let i = 0; i < 50; i++) {
      stepEffectScheduler(f.w, f.pack, f.options);
      f.w.frame++;
    }
    const after = f.w.powerEffects.slots[slot].nativePrior!;
    expect(after[6]).toBe(5);
    expect(i16(after as number[], 74)).toBe(25);
    for (const at of [7, 9, 17, 23, 39, 45, 47, 49, 55, 61, 67, 68, 71, 73, 76])
      expect(after[at]).toBe(before[at]);
  });
  it("retains unknown phase values and advances the actual charge ANB", () => {
    const f = fixture(),
      slot = charge(f),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    n[70] = 255;
    n[30] = 0;
    const r = stepEngineerChargeRecord(n, f.w.terrain, {
      profile: animationProfile(f.pack.assets.EFF, 50),
      child: () => {
        throw Error("unreached");
      },
    });
    expect(r.retirementRequired).toBe(false);
    expect(r.native[70]).toBe(255);
    expect(r.native[27]).toBe(1);
  });
  it.each([
    [1, 51],
    [2, 10],
  ] as const)(
    "phase%s creates actual newborn%s then retires parent before the second pass",
    (phase, code) => {
      const f = fixture(),
        slot = charge(f),
        rng = { ...f.w.rng };
      setStagedCampaignEngineerChargePhase(f.w, 0, phase);
      const receipt = stepEffectScheduler(f.w, f.pack, f.options),
        child = receipt.callbacks.find((e) => e.code === code)!;
      expect(
        receipt.callbacks.filter((e) => [50, 10, 51].includes(e.code)),
      ).toEqual([
        { phase: "primary", slot, code: 50 },
        { phase: "newborn", slot: child.slot, code },
      ]);
      expect(receipt.createdNewborns).toBe(1);
      expect(receipt.retired).toContain(`source:4:${slot}`);
      expect(f.w.powerEffects.slots[slot].nativePrior![6]).toBe(0);
      const n = f.w.powerEffects.slots[child.slot].nativePrior!;
      expect([n[24], n[21]! & 1, n[27], n[69]]).toEqual([0, 0, 1, code]);
      expect(f.w.rng).toEqual(rng);
      for (let i = 0; i < 30; i++) {
        f.w.frame++;
        stepEffectScheduler(f.w, f.pack, f.options);
      }
      expect(f.w.powerEffects.slots[child.slot].occupied).toBe(false);
    },
  );
  it("decrements no timer and advances no ANB before a terminal phase child", () => {
    const f = fixture(),
      slot = charge(f),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    n[70] = 1;
    n[26] = 2;
    n[27] = 4;
    n[30] = 240;
    put16(n, 74, 19);
    const r = stepEngineerChargeRecord(n, f.w.terrain, {
      profile: animationProfile(f.pack.assets.EFF, 50),
      child: (q, parent) => {
        expect(q.height).toBe(groundHeight(f.w.terrain, ...q.position));
        expect([
          parent[26],
          parent[27],
          parent[30],
          i16(parent as number[], 74),
        ]).toEqual([2, 4, 240, 19]);
        return false;
      },
    });
    expect(r.retirementRequired).toBe(true);
    expect(r.newborns).toBe(0);
  });
  it("full shared capacity returns false before profile access and leaves the world unchanged", () => {
    const f = fixture();
    fill(f);
    const before = checksum(f.w);
    delete f.pack.assets.EFF.animations;
    expect(
      createCampaignEngineerCharge(f.w, f.q, f.pack, f.options),
    ).toBeNull();
    expect(checksum(f.w)).toBe(before);
  });
  it.each([1, 2] as const)(
    "phase%s retires even when all feedback capacity is unavailable",
    (phase) => {
      const f = fixture();
      fill(f);
      f.w.powerEffects.slots[0].nativePrior![70] = phase;
      const receipt = stepEffectScheduler(f.w, f.pack, f.options);
      expect(receipt.createdNewborns).toBe(0);
      expect(receipt.retired).toEqual(["source:4:0"]);
      expect(f.w.powerEffects.slots.filter((p) => p.occupied)).toHaveLength(
        199,
      );
    },
  );
  it("phase planning follows ascending active matching logical kind3 parents and preserves held identities", () => {
    const f = fixture(),
      a = charge(f),
      b = charge(f),
      c = charge(f),
      n = f.w.powerEffects.slots[b].nativePrior!;
    put16(n, 71, 1);
    f.w.powerEffects.slots[c].nativePrior![73] = 4;
    const root = f.w.powerEffects,
      records = root.slots.map((p) => p.nativePrior),
      r = setStagedCampaignEngineerChargePhase(f.w, 0, 2);
    expect(r.changed).toEqual([a]);
    expect(f.w.powerEffects).toBe(root);
    expect(root.slots.every((p, i) => p.nativePrior === records[i])).toBe(true);
    expect(n[70]).toBe(0);
    expect(root.slots[c].nativePrior![70]).toBe(0);
  });
  it("validates the complete late phase plan before any mutation", () => {
    const f = fixture(),
      slot = charge(f);
    f.w.powerEffects.slots[199].nativePrior![6] = null;
    expect(() => setStagedCampaignEngineerChargePhase(f.w, 0, 1)).toThrow(
      /Unknown/,
    );
    expect(f.w.powerEffects.slots[slot].nativePrior![70]).toBe(0);
  });
  it("rolls back replacement cleanup across native/player/presentation/RNG roots on late factory failure", () => {
    const f = fixture();
    fill(f, true);
    const before = checksum(f.w),
      opts = {
        ...f.options,
        cleanupReferences: (s: CampaignWorld) => {
          s.specialists.records[0][112] = 255;
          s.buildingNative[0][21] = 99;
          s.players[0].raw[2] = 17;
          s.rng.seed = 88;
          s.presentation.voiceSequence = 999;
          throw Error("late replacement cleanup");
        },
      };
    expect(() => createCampaignEngineerCharge(f.w, f.q, f.pack, opts)).toThrow(
      /late replacement/,
    );
    expect(checksum(f.w)).toBe(before);
  });
  it("replaces a lower-priority actual record with immediate724C0 cleanup while retaining actor identity", () => {
    const f = fixture();
    fill(f, true);
    const actor = f.w.specialists.records[0],
      player = f.w.players[0].raw;
    put16(actor, 127, 1);
    actor[129] = 5;
    const slot = createStagedCampaignEngineerCharge(
      f.w,
      f.q,
      f.pack,
      f.options,
    );
    expect(slot).toBe(1);
    expect(f.w.specialists.records[0]).toBe(actor);
    expect(f.w.players[0].raw).toBe(player);
    expect(actor[129]).toBe(0);
    expect(i16(actor as number[], 127)).toBe(1);
    expect(f.w.powerEffects.slots[1].nativePrior![69]).toBe(50);
    expect(u16(f.w.missionPrefix, 0x3554)).toBe(200);
  });
  it("rolls back the whole scheduler when a later callback rejects after trigger allocation", () => {
    const f = fixture(),
      a = charge(f),
      b = charge(f);
    f.w.powerEffects.slots[a].nativePrior![70] = 1;
    const before = checksum(f.w),
      opts = {
        ...f.options,
        engineerChargeEffect: (
          s: CampaignWorld,
          slot: number,
          out: Parameters<typeof stepCampaignEngineerChargeEffect>[4],
        ) => {
          if (slot === b) throw Error("later callback");
          return stepCampaignEngineerChargeEffect(
            s,
            slot,
            f.pack,
            f.options,
            out,
          );
        },
      };
    expect(() => stepEffectScheduler(f.w, f.pack, opts)).toThrow(
      /later callback/,
    );
    expect(checksum(f.w)).toBe(before);
  });
  it("binds real staged Engineer services without replacing held specialist/player roots", () => {
    const f = fixture(),
      s = campaignEngineerChargeServices(f.pack, () => f.options),
      held = f.w.specialists.records[0],
      p = f.w.players[0].raw;
    expect(s.placeTakeoverCharge!(f.w, f.q)).toBe(true);
    s.setTakeoverChargePhase!(f.w, 0, 1);
    expect(f.w.specialists.records[0]).toBe(held);
    expect(f.w.players[0].raw).toBe(p);
    expect(
      f.w.powerEffects.slots.some(
        (e) => e.nativePrior?.[69] === 50 && e.nativePrior[70] === 1,
      ),
    ).toBe(true);
  });
  it.each([14, null])(
    "inactive pending work ignores retained selector%s and unknown stage operands",
    (selected) => {
      const f = fixture(),
        n = f.w.specialists.records[0];
      n[88] = n[88]! & 254;
      n[130] = 1;
      n[126] = selected === null ? null : 0;
      n[131] = selected;
      n[136] = n[137] = null;
      const beforeRng = { ...f.w.rng },
        beforeTerrain = checksum(f.w.terrain);
      cancelStagedCampaignEngineer(f.w, 0, f.pack, {
        effectOptions: () => f.options,
      });
      expect([n[126], n[130], n[131], n[136], n[137]]).toEqual([
        255,
        0,
        selected,
        null,
        null,
      ]);
      expect(f.w.rng).toEqual(beforeRng);
      expect(checksum(f.w.terrain)).toBe(beforeTerrain);
    },
  );
  it("preserves a full save and deterministic replay through trigger and feedback retirement", () => {
    const f = fixture();
    charge(f);
    setStagedCampaignEngineerChargePhase(f.w, 0, 1);
    const loaded = loadCampaign(
      saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
      f.w.contentHash,
    ).world;
    for (let i = 0; i < 28; i++) {
      stepEffectScheduler(f.w, f.pack, f.options);
      f.w.frame++;
      stepEffectScheduler(loaded, f.pack, f.options);
      loaded.frame++;
    }
    expect(checksum(loaded)).toBe(checksum(f.w));
  });
  it("rejects unknown retained counter or modified frozen physics without publishing", () => {
    const f = fixture(),
      slot = charge(f),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    n[30] = null;
    expect(() =>
      stepEngineerChargeRecord(n, f.w.terrain, {
        profile: animationProfile(f.pack.assets.EFF, 50),
        child: () => false,
      }),
    ).toThrow(/Unknown/);
    n[30] = 0;
    put16(n, 61, 128);
    expect(() =>
      stepEngineerChargeRecord(n, f.w.terrain, {
        profile: animationProfile(f.pack.assets.EFF, 50),
        child: () => false,
      }),
    ).toThrow(/frozen/);
  });
  it("executes feedback common ground/slope/airborne behavior with its own actual code/profile", () => {
    const f = fixture(),
      c = {
        frame: 0,
        gravity: 512,
        water: 0,
        tables: f.pack.rules!.tables,
        bounce: f.pack.rules!.tables.bounce,
        profile: animationProfile(f.pack.assets.EFF, 51),
        obstacleAt: () => false,
      };
    const n = makeEngineerChargeFeedback(
      f.w.powerEffects.slots[0].nativePrior!,
      0,
      {
        code: 51,
        owner: 0,
        position: f.q.position,
        height: f.q.height + 100,
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: true,
      },
      f.w.terrain,
      c.profile,
      f.pack.effectRules!.descriptors[51],
    );
    put16(n, 45, 64);
    put16(n, 49, -1024);
    const r = stepEngineerChargeChildRecord(n, f.w.terrain, c, 51);
    expect(r.native[69]).toBe(51);
    expect(r.samples.length).toBeGreaterThan(0);
    expect(r.native[27]).toBe(1);
    expect(() => planEngineerChargePhase([n], 0, 1)).toThrow(/Actual/);
  });
});
