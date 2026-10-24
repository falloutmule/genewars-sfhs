import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { igniteStagedPlant } from "../src/sim/campaign/plant-fire-adapter";
import {
  publishStagedSharedEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import {
  ignitePlantRecord,
  makePlantFireEffect,
  stepPlantFireEffectRecord,
  type PlantIgnitionAudio,
} from "../src/sim/mechanics/plant-fire";
import { stepPlants } from "../src/sim/mechanics/ecology";
import { flushEatenPlantRetirements } from "../src/sim/campaign/ecology-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { requestAudio } from "../src/sim/mechanics/audio";

const profile = { holds: Array(13).fill(0), flags: 0, first: 0, last: 12 },
  word = (n: readonly (number | null)[], at: number) =>
    ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16,
  dword = (n: readonly (number | null)[], at: number) =>
    (word(n, at) & 65535) | (word(n, at + 2) << 16);
function fixture() {
  const pack = campaignFixture();
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 13 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 9 }, () => ({
      first: 0,
      last: 12,
      rawTrailingWord: 13,
    })),
  };
  const world = createCampaign(pack, "synthetic-plant-fire"),
    plant = world.ecology.plants[8],
    n = plant.native,
    position: [number, number] = [1024, 1024],
    ground = groundHeight(world.terrain, ...position);
  n[6] = 2;
  put(n, 15, 8);
  put(n, 7, position[0]);
  put(n, 9, position[1]);
  put32(n, 17, ground);
  n[43] = 0;
  n[24] = 4;
  n[25] = 5;
  n[21] = 4;
  put(n, 44, 17);
  n[46] = 0;
  Object.assign(plant, {
    active: true,
    owner: 4,
    position,
    selector: 0,
    growth: 17,
    flags: 4,
    plantFlags: 0,
    updateCounter: 0,
    retirement: 0,
    animation: 5,
    frame: 0,
    shade: 0,
    height: ground,
  });
  world.ecology.plantCount = 1;
  world.ecology.plantCursor = 0;
  pack.ecologyRules!.plants[0].retirementDelay = 8;
  insertSpatial(world.spatial, world.terrain, plant.id, worldCell(...position));
  const options: EffectSchedulerOptions<typeof world> = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: (w, identity) => cleanupCampaignReferences(w, identity),
  };
  const audio = (w: typeof world, event: PlantIgnitionAudio) =>
    requestAudio(w.audio, {
      frame: w.frame,
      entity: event.entity,
      cue: event.channel,
      mode: event.mode,
      parameter: event.parameter,
      range: null,
      gain: event.volume / 127,
      initialRatePercent: event.ratePercent,
    });
  return { world, pack, plant, options, audio, ground };
}

describe("source plant6C6B0 and shared fire8", () => {
  it("preserves exact flags/action and signed retirement arithmetic without mutating the input", () => {
    const f = fixture();
    f.plant.native[46] = 255;
    f.plant.native[25] = 238;
    for (const growth of [-32768, -33, -1, 0, 1, 17, 32, 32767]) {
      put(f.plant.native, 44, growth);
      const before = f.plant.native.slice(),
        r = ignitePlantRecord(before, f.world.terrain, 8);
      expect(r.native[46]).toBe(0xf9);
      expect(r.native[25]).toBe(4);
      expect(word(r.native, 44)).toBe(0);
      expect(r.native[48]).toBe((8 + Math.trunc((growth * 24) / 32)) & 255);
      expect(r.effect).toEqual({
        code: 8,
        owner: 0,
        position: [1024, 1024],
        height: f.ground,
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: false,
      });
      expect(before).toEqual(f.plant.native);
    }
  });
  it("constructs a real unmarked fire carrier while retaining counter, fractions, child and payload", () => {
    const f = fixture(),
      prior = f.world.powerEffects.slots[0].nativePrior!;
    prior[30] = 219;
    prior[67] = 181;
    prior[68] = 193;
    put(prior, 71, 91);
    prior[73] = 1;
    prior[76] = 119;
    const n = makePlantFireEffect(
      prior,
      { slot: 0, position: [1024, 1024], height: f.ground },
      f.world.terrain,
      profile,
    );
    expect([n[6], n[24], n[69], word(n, 21)]).toEqual([5, 0, 8, 32]);
    expect([n[30], n[67], n[68], word(n, 71), n[73], n[76]]).toEqual([
      219, 181, 193, 91, 1, 119,
    ]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(word(n, 74)).toBe(-1);
    expect(prior[6]).toBe(0);
  });
  it("publishes plant mutation before replacement cleanup, then requests audio after the factory", () => {
    const f = fixture();
    for (let slot = 0; slot < 200; slot++) {
      const n = makePlantFireEffect(
        f.world.powerEffects.slots[slot].nativePrior!,
        { slot, position: [1024, 1024], height: f.ground },
        f.world.terrain,
        profile,
      );
      n[69] = 6; // synthetic live priority27, eligible for fire priority22
      publishStagedSharedEffect(f.world, slot, n);
    }
    const order: string[] = [];
    f.options.cleanupReferences = (w) => {
      expect(w.ecology.plants[8].growth).toBe(0);
      expect(w.ecology.plants[8].native[46]).toBe(0x88);
      order.push("cleanup");
      return 0;
    };
    const rng = { ...f.world.rng },
      result = igniteStagedPlant(f.world, 8, f.pack, f.options, (w, event) => {
        expect(w.powerEffects.slots[0].nativePrior![69]).toBe(8);
        order.push("audio");
        f.audio(w, event);
      });
    expect(result.effectSlot).toBe(0);
    expect(order).toEqual(["cleanup", "audio"]);
    expect(f.world.rng).toEqual(rng);
    expect(f.world.audio.requests).toHaveLength(1);
    expect(f.plant.retirement).toBe(20);
    validateSpatial(f.world.spatial);
  });
  it("keeps plant ignition and audio when every shared replacement candidate is marked", () => {
    const f = fixture();
    for (let slot = 0; slot < 200; slot++) {
      const n = makePlantFireEffect(
        f.world.powerEffects.slots[slot].nativePrior!,
        { slot, position: [1024, 1024], height: f.ground },
        f.world.terrain,
        profile,
      );
      n[21]! |= 1;
      publishStagedSharedEffect(f.world, slot, n);
    }
    const rng = { ...f.world.rng },
      effects = JSON.stringify(f.world.powerEffects);
    const r = igniteStagedPlant(f.world, 8, f.pack, f.options, f.audio);
    expect(r.effectSlot).toBeNull();
    expect(f.world.rng).toEqual(rng);
    expect(JSON.stringify(f.world.powerEffects)).toBe(effects);
    expect(f.plant.growth).toBe(0);
    expect(f.plant.plantFlags).toBe(0x88);
    expect(f.world.audio.requests).toHaveLength(1);
  });
  it("uses common ground feedback and real obstacle queries without gravity or water factories", () => {
    const f = fixture(),
      n = makePlantFireEffect(
        f.world.powerEffects.slots[0].nativePrior!,
        { slot: 0, position: [1024, 1024], height: f.ground + 100 },
        f.world.terrain,
        profile,
      ),
      context = {
        frame: 3,
        gravity: 1024,
        water: f.ground + 1000,
        tables: f.pack.rules!.tables,
        bounce: f.pack.rules!.tables.bounce,
        profile,
      };
    expect(() =>
      stepPlantFireEffectRecord(n, f.world.terrain, context),
    ).toThrow(/obstacle query required/);
    const r = stepPlantFireEffectRecord(n, f.world.terrain, {
      ...context,
      obstacleAt: () => true,
    });
    expect(dword(r.native, 39)).toBe(f.ground + 100);
    expect(word(r.native, 49)).toBe(0);
    expect(r.queries[0]).toEqual({
      type: "obstacle",
      point: [1024, 1024],
      mask: 1,
      found: true,
    });
    expect(r.queries[1].type).toBe("water-material");
    const grounded = n.slice();
    put32(grounded, 39, f.ground);
    const rest = stepPlantFireEffectRecord(grounded, f.world.terrain, {
      ...context,
      obstacleAt: () => false,
    });
    expect(rest.samples).toHaveLength(2);
    expect(dword(rest.native, 39)).toBe(f.ground);
  });
  it("finishes its independent shared lifetime and continues plant retirement through save/reload", () => {
    const f = fixture();
    igniteStagedPlant(f.world, 8, f.pack, f.options, f.audio);
    const rng = { ...f.world.rng };
    let reload = JSON.parse(JSON.stringify(f.world)) as typeof f.world;
    for (let frame = 0; frame < 12; frame++) {
      f.world.frame = reload.frame = frame;
      const a = stepEffectScheduler(f.world, f.pack, f.options),
        b = stepEffectScheduler(reload, f.pack, f.options);
      expect(a.callbacks).toEqual([{ phase: "primary", slot: 0, code: 8 }]);
      expect(a).toEqual(b);
      if (frame === 6)
        reload = JSON.parse(JSON.stringify(reload)) as typeof f.world;
    }
    expect(f.world.powerEffects.slots[0].occupied).toBe(false);
    expect(f.world.powerEffects.slots[0].nativePrior![6]).toBe(0);
    expect(f.world.rng).toEqual(rng);
    expect(f.plant.active).toBe(true);
    // Source6C780 executes only on scheduled plant callbacks. Re-select its
    // source cursor to isolate that established callback from sparse scanning.
    for (let i = 0; i < 6; i++) {
      f.world.ecology.plantCursor = 0;
      const receipt = stepPlants(
        f.world.ecology,
        f.world.terrain,
        f.world.rng,
        f.pack.ecologyRules!,
        0,
      );
      expect(receipt.committed).toBe(true);
      flushEatenPlantRetirements(f.world);
    }
    expect(f.world.ecology.plants[8].active).toBe(false);
    expect(f.world.ecology.plantCount).toBe(0);
    expect(f.world.spatial.nodes["source:1:8"]).toBeUndefined();
    validateSpatial(f.world.spatial);
  });
  it("rolls back inline ignition, fire, plant native bytes and audio on a later missing plant carrier service", () => {
    const f = fixture();
    for (const [slot, code] of [
      [0, 20],
      [199, 68],
    ]) {
      const n = makePlantFireEffect(
        f.world.powerEffects.slots[slot].nativePrior!,
        { slot, position: [1024, 1024], height: f.ground },
        f.world.terrain,
        profile,
      );
      n[69] = code;
      publishStagedSharedEffect(f.world, slot, n);
    }
    f.options.geneticistEffect = (w, slot, out) => {
      igniteStagedPlant(w, 8, f.pack, f.options, f.audio, out);
      return {
        native: w.powerEffects.slots[slot].nativePrior!.slice(),
        retirementRequired: true,
        newborns: 0,
        events: [],
        samples: [],
        query: null,
      };
    };
    const before = JSON.stringify(f.world);
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /plant carrier67\/68 callback service is required/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
});
