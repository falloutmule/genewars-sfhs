import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  createStagedSpecialistCorpseEffect,
  publishStagedSharedEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import {
  makeSpecialistCorpseEffect,
  specialistCorpseBinding,
  stepSpecialistCorpseEffect,
  type SpecialistCorpseContext,
} from "../src/sim/mechanics/specialist-corpse";
import type { SpecialistCorpseRequest } from "../src/sim/mechanics/specialist-damage";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { validateSpatial } from "../src/sim/campaign/spatial";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import { groundHeight } from "../src/sim/mechanics/terrain";
const word = (n: readonly (number | null)[], at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
function fixture() {
  const pack = campaignFixture(),
    profile = { holds: [3, 2, 1, 0, 5], flags: 1, first: 10, last: 14 };
  pack.rules!.tables.actorResourceNames = Array.from(
    { length: 16 },
    (_, key) => `DATA/SPEC/SYNTH${key}.ANB`,
  );
  for (let key = 0; key < 16; key++)
    pack.assets[`SYNTH${key}`] = {
      ...pack.assets.TEST,
      frames: Array.from({ length: 15 }, (_, frame) => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [frame >= 10 ? profile.holds[frame - 10] : 0, 0, 0],
      })),
      animations: Array.from({ length: 10 }, (_, action) => ({
        first: action === 9 ? 10 : 0,
        last: action === 9 ? 14 : 0,
        rawTrailingWord: action === 9 ? 0x105 : 1,
      })),
    };
  const world = createCampaign(pack, "synthetic-specialist-corpse"),
    ground = groundHeight(world.terrain, 1024, 1024),
    request: SpecialistCorpseRequest = {
      code: 69,
      owner: 2,
      position: [1024, 1024],
      height: ground,
      angles: [512, 512, 0],
      parameter: 0,
      delay: 0,
      parent: null,
      newborn: false,
      packed76: 0xc0 | (2 << 1) | (1 << 3) | 1,
      assetKey: "SYNTH9",
      action: 9,
      frame: 4,
    },
    options: EffectSchedulerOptions<typeof world> = {
      gravity: 512,
      obstacleAt: () => false,
      destructionObstacle: () => null,
      cleanupReferences: (w, identity) =>
        cleanupCampaignReferences(w, identity),
    },
    context: SpecialistCorpseContext = {
      frame: 0,
      gravity: 512,
      water: 0,
      tables: pack.rules!.tables,
      bounce: pack.rules!.tables.bounce,
      profile,
      obstacle: () => null,
      child() {
        throw Error("No synthetic dry corpse child expected");
      },
    },
    make = (slot = 0) =>
      makeSpecialistCorpseEffect(
        world.powerEffects.slots[slot].nativePrior!,
        { ...request, slot },
        world.terrain,
        pack.rules!.tables,
        profile,
      );
  return { pack, world, ground, profile, request, options, context, make };
}

describe("source specialist corpse69", () => {
  it("uses actor action9 with logical ANB/resource bindings and retained shared priors", () => {
    const f = fixture(),
      prior = f.world.powerEffects.slots[0].nativePrior!;
    prior[30] = 219;
    prior[67] = 193;
    prior[68] = 71;
    put(prior, 65, -35);
    put(prior, 71, 12);
    prior[73] = 1;
    const before = prior.slice(),
      n = f.make(),
      binding = specialistCorpseBinding(n, f.pack.rules!.tables);
    expect([n[69], n[25], n[27], n[28], word(n, 63), word(n, 74)]).toEqual([
      69, 9, 4, 0, 0, 1000,
    ]);
    expect([n[30], n[67], n[68], word(n, 65), word(n, 71), n[73]]).toEqual([
      219, 193, 71, -35, 12, 1,
    ]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(n.slice(77, 81)).toEqual(Array(4).fill(null));
    expect(binding).toMatchObject({
      assetKey: "SYNTH9",
      resourceKey: 9,
      style: 2,
      category: 1,
      sex: 1,
      action: 9,
      frame: 4,
      animationOffset: 31,
      resourceOffset: 77,
    });
    expect(prior).toEqual(before);
    expect(f.pack.assets.EFF.animations!.length).toBeLessThan(69);
  });
  it("derives every admitted style/category/sex after JSON persistence without a live actor", () => {
    const f = fixture();
    for (let key = 0; key < 16; key++)
      for (let sex = 0; sex < 2; sex++) {
        const n = f.make();
        n[76] = 0xc0 | ((key >> 2) << 1) | ((key & 3) << 3) | sex;
        expect(
          specialistCorpseBinding(
            JSON.parse(JSON.stringify(n)),
            f.pack.rules!.tables,
          ),
        ).toMatchObject({
          assetKey: `SYNTH${key}`,
          resourceKey: key,
          style: key >> 2,
          category: key & 3,
          sex,
        });
      }
    const n = f.make();
    n[77] = 0;
    expect(() => specialistCorpseBinding(n, f.pack.rules!.tables)).toThrow(
      /logical resource/,
    );
    n[77] = null;
    n[76] = 0xff;
    expect(() => specialistCorpseBinding(n, f.pack.rules!.tables)).toThrow(
      /logical resource/,
    );
  });
  it("uses retained signed contact65 moving toward zero by actual width43 on grounded callbacks", () => {
    const f = fixture(),
      n = f.make();
    for (const [before, after] of [
      [120, 104],
      [-35, -19],
      [16, 0],
      [-16, 0],
    ]) {
      put(n, 65, before);
      const r = stepSpecialistCorpseEffect(n, f.world.terrain, f.context);
      expect(word(r.native, 65)).toBe(after);
      expect(word(r.native, 61)).toBe(after);
      expect(r.samples).toHaveLength(2);
      expect(word(n, 65)).toBe(before);
    }
    n[65] = null;
    expect(() =>
      stepSpecialistCorpseEffect(n, f.world.terrain, f.context),
    ).toThrow(/Unknown shared effect/);
  });
  it("bounces on first impact without grounding contact-speed steering", () => {
    const f = fixture(),
      n = f.make();
    put32(n, 39, f.ground + 10);
    put(n, 49, -1024);
    put(n, 65, 120);
    const r = stepSpecialistCorpseEffect(n, f.world.terrain, f.context);
    expect(word(r.native, 49)).toBe(384);
    expect(word(r.native, 65)).toBe(120);
    expect(r.samples).toHaveLength(1);
    expect(r.native.slice(25, 31)).toEqual(n.slice(25, 31));
  });
  it("requires actual airborne obstacle targets and preserves the movable impulse", () => {
    const f = fixture(),
      n = f.make();
    put32(n, 39, f.ground + 3000);
    put(n, 45, 300);
    put(n, 47, -400);
    const context = { ...f.context, frame: 1, obstacle: undefined };
    expect(() =>
      stepSpecialistCorpseEffect(n, f.world.terrain, context),
    ).toThrow(/obstacle service/);
    const empty = stepSpecialistCorpseEffect(n, f.world.terrain, {
        ...context,
        obstacle: () => null,
      }),
      hit = stepSpecialistCorpseEffect(n, f.world.terrain, {
        ...context,
        obstacle: () => ({ position: [1000, 1000], ground: f.ground }),
      });
    expect(hit.obstacleQueries).toEqual(empty.obstacleQueries);
    expect(hit.native.slice(45, 51)).not.toEqual(empty.native.slice(45, 51));
  });
  it("creates actual unmarked bubble/wake requests before timer retirement and preserves callback cleanup", () => {
    const f = fixture();
    for (let cell = 0; cell < 16384; cell++) {
      put(f.world.terrain.bytes, cell * 14 + 2, 100);
      f.world.terrain.bytes[cell * 14 + 5] = 0;
    }
    for (const [height, code] of [
      [1000, 21],
      [1800, 48],
    ]) {
      const n = f.make();
      put32(n, 17, 200);
      put32(n, 39, height);
      put(n, 45, 2000);
      put(n, 74, 1);
      let called = false;
      const r = stepSpecialistCorpseEffect(n, f.world.terrain, {
        ...f.context,
        frame: 3,
        water: 1632,
        child(request, current) {
          called = true;
          expect(request.code).toBe(code);
          expect(request.newborn).toBe(false);
          expect(word(current, 74)).toBe(1);
          current[73] = 0;
          return false;
        },
      });
      expect(called).toBe(true);
      expect(r.retirementRequired).toBe(true);
      expect(r.factories[0].created).toBe(false);
      expect(r.native[73]).toBe(0);
    }
  });
  it("runs 1000 callbacks with frozen action9 and exact signed timer wrap across JSON continuation", () => {
    const f = fixture();
    let n = f.make(),
      reload = JSON.parse(JSON.stringify(n)) as typeof n;
    const animation = n.slice(25, 31);
    for (let i = 0; i < 1000; i++) {
      const a = stepSpecialistCorpseEffect(n, f.world.terrain, f.context),
        b = stepSpecialistCorpseEffect(reload, f.world.terrain, f.context);
      expect(a).toEqual(b);
      expect(a.native.slice(25, 31)).toEqual(animation);
      expect(a.retirementRequired).toBe(i === 999);
      n = a.native;
      reload = b.native;
      if (i === 499) reload = JSON.parse(JSON.stringify(reload)) as typeof n;
    }
    for (const [before, after] of [
      [0, -1],
      [-32768, 32767],
      [1, 0],
    ]) {
      put(n, 74, before);
      const r = stepSpecialistCorpseEffect(n, f.world.terrain, f.context);
      expect(word(r.native, 74)).toBe(after);
      expect(r.retirementRequired).toBe(after === 0);
    }
  });
  it("publishes and retires through the shared scheduler without EFF69 or a live actor", () => {
    const f = fixture(),
      rng = { ...f.world.rng },
      slot = createStagedSpecialistCorpseEffect(
        f.world,
        f.request,
        f.pack,
        f.options,
      )!;
    expect(slot).toBe(0);
    expect(f.world.rng).toEqual(rng);
    const n = f.world.powerEffects.slots[slot].nativePrior!;
    put(n, 74, 2);
    const a = stepEffectScheduler(f.world, f.pack, f.options),
      b = stepEffectScheduler(f.world, f.pack, f.options);
    expect(a.callbacks).toEqual([{ phase: "primary", slot: 0, code: 69 }]);
    expect(a.retired).toEqual([]);
    expect(b.retired).toEqual(["source:4:0"]);
    expect(f.world.powerEffects.slots[0].occupied).toBe(false);
    expect(f.world.powerEffects.slots[0].nativePrior![27]).toBe(4);
    expect(f.world.rng).toEqual(rng);
    validateSpatial(f.world.spatial);
  });
  it("fails shared capacity without resource lookup, factory RNG, or changing existing records", () => {
    const f = fixture();
    for (let slot = 0; slot < 200; slot++) {
      const n = f.make(slot);
      n[21]! |= 1;
      publishStagedSharedEffect(f.world, slot, n);
    }
    delete f.pack.assets[f.request.assetKey];
    const before = JSON.stringify(f.world);
    expect(
      createStagedSpecialistCorpseEffect(f.world, f.request, f.pack, f.options),
    ).toBeNull();
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("runs an actual unmarked water child in the same shared pass before corpse retirement frees its slot", () => {
    const f = fixture();
    f.pack.assets.EFF = {
      ...f.pack.assets.EFF,
      frames: Array.from({ length: 12 }, () => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [0, 0, 0],
      })),
      animations: Array.from({ length: 49 }, (_, code) => {
        const count = code === 21 ? 2 : code === 22 ? 3 : code === 48 ? 12 : 1;
        return { first: 0, last: count - 1, rawTrailingWord: count };
      }),
    };
    for (let cell = 0; cell < 16384; cell++) {
      put(f.world.terrain.bytes, cell * 14 + 2, 100);
      f.world.terrain.bytes[cell * 14 + 5] = 0;
    }
    f.world.source.source.terrain.rawWaterHeight = 816;
    f.world.source.source.terrain.loadedPhysicalWaterHeight = 1632;
    f.world.frame = 3;
    createStagedSpecialistCorpseEffect(
      f.world,
      {
        ...f.request,
        height: 1000,
        angles: [512, 512, 2000],
      },
      f.pack,
      f.options,
    );
    put(f.world.powerEffects.slots[0].nativePrior!, 74, 1);
    const rng = { ...f.world.rng },
      r = stepEffectScheduler(f.world, f.pack, f.options);
    expect(r.callbacks).toEqual([
      { phase: "primary", slot: 0, code: 69 },
      { phase: "primary", slot: 1, code: 21 },
      { phase: "newborn", slot: 0, code: 22 },
    ]);
    expect(r.createdNewborns).toBe(1);
    expect(r.retired).toContain("source:4:0");
    expect(r.retired).toContain("source:4:1");
    expect(
      f.world.waterEffects.find((e) => e.active && e.slot === 0)?.code,
    ).toBe(22);
    expect(f.world.powerEffects.slots[0].nativePrior![21]! & 1).toBe(0);
    expect(f.world.rng).toEqual(rng);
    validateSpatial(f.world.spatial);
  });
  it("rolls back earlier corpse motion/timer and cleanup on a later unsupported selector", () => {
    const f = fixture();
    for (const slot of [0, 199])
      publishStagedSharedEffect(f.world, slot, f.make(slot));
    put(f.world.powerEffects.slots[0].nativePrior!, 74, 1);
    f.world.powerEffects.slots[199].nativePrior![69] = 68;
    const before = JSON.stringify(f.world);
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /selector 68/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
});
