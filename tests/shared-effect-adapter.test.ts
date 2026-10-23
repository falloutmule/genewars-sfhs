import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  retireStagedSharedEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { unlinkSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import {
  effectFactoryPrior,
  putEffectWord,
} from "../src/sim/mechanics/power-motion";
import { worldCell } from "../src/sim/mechanics/terrain";
import { nextRandom } from "../src/sim/mechanics/random";
import type { GeneticistProjectileStep } from "../src/sim/mechanics/geneticist-projectile";

const word = (n: readonly (number | null)[], at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
function fixture() {
  const pack = campaignFixture();
  // Synthetic priorities test the generic imported-table path independently of
  // which original animation/factory is bound to each selector.
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: code === 6 ? 27 : code === 69 ? 3 : 9,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const world = createCampaign(pack, "synthetic-shared-effect-port");
  for (const node of Object.values(world.spatial.nodes))
    if (node.family === 4) unlinkSpatial(world.spatial, world.terrain, node.id);
  for (const shared of world.powerEffects.slots) {
    shared.occupied = false;
    shared.packet = null;
    shared.nativePrior![6] = 0;
  }
  world.landings = [];
  world.waterEffects = [];
  world.notices = [];
  const options: EffectSchedulerOptions<typeof world> = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences(w, identity) {
      const slot = Number(identity.split(":")[2]);
      expect(w.powerEffects.slots[slot].nativePrior![6]).toBe(5);
      expect(w.spatial.nodes[identity]).toBeUndefined();
      const n = w.powerEffects.slots[slot].nativePrior!;
      // Real cleanup ports can alter the current published carrier.
      if (n[73] === 5 && word(n, 71) === slot) n[73] = 0;
      return 1;
    },
  };
  return { world, pack, options };
}
type Fixture = ReturnType<typeof fixture>;
function image(f: Fixture, slot: number, code = 41, point = [1024, 1024]) {
  return effectFactoryPrior(f.world.powerEffects.slots[slot].nativePrior!, {
    slot,
    code,
    owner: 0,
    x: point[0],
    y: point[1],
    ground: 0,
    height: 512,
    shade: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    accelerationZ: 0,
    yaw: 0,
    pitch: 0,
    speed: 0,
    delay: 0,
  });
}
const update = (native: (number | null)[]): GeneticistProjectileStep => ({
  native,
  retirementRequired: false,
  newborns: 0,
  events: [],
  samples: [],
  query: null,
});

describe("staged shared effect adapter primitives", () => {
  it("allocates first free without reservation, mutation or factory RNG", () => {
    const f = fixture(),
      before = JSON.stringify(f.world);
    expect(allocateStagedSharedEffect(f.world, 41, f.pack, f.options)).toBe(0);
    expect(JSON.stringify(f.world)).toBe(before);
    expect(allocateStagedSharedEffect(f.world, 41, f.pack, f.options)).toBe(0);
  });
  it("publishes and moves exact identities/fractions and synchronizes shared links", () => {
    const f = fixture(),
      a = image(f, 0),
      b = image(f, 1);
    a[67] = 193;
    a[68] = 71;
    publishStagedSharedEffect(f.world, 0, a);
    publishStagedSharedEffect(f.world, 1, b);
    expect(f.world.powerEffects.slots[0].fractionX).toBe(193);
    expect(f.world.powerEffects.slots[0].fractionY).toBe(71);
    const first = f.world.powerEffects.slots[0].nativePrior!,
      second = f.world.powerEffects.slots[1].nativePrior!;
    expect([word(first, 0), first[2]]).toEqual([1, 5]);
    expect([word(second, 3), second[5]]).toEqual([0, 5]);
    const moved = first.slice();
    putEffectWord(moved, 7, -256);
    putEffectWord(moved, 9, -512);
    publishStagedSharedEffect(f.world, 0, moved);
    expect(f.world.spatial.nodes["source:4:0"].cell).toBe(
      worldCell(-256, -512),
    );
    expect(f.world.powerEffects.slots[1].nativePrior![5]).toBe(0);
    expect(a[2]).toBe(0); // supplied factory images are not mutated by binding
    validateSpatial(f.world.spatial);
  });
  it("rejects malformed identity before modifying an existing published carrier", () => {
    const f = fixture();
    publishStagedSharedEffect(f.world, 0, image(f, 0));
    const before = JSON.stringify(f.world),
      bad = image(f, 1);
    expect(() => publishStagedSharedEffect(f.world, 0, bad)).toThrow(
      /invalid identity/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
    bad[31] = 0;
    expect(() => publishStagedSharedEffect(f.world, 1, bad)).toThrow(
      /native prior/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("uses all imported priorities, first strict highest tie and marked exclusion at capacity", () => {
    const f = fixture();
    for (let slot = 0; slot < 200; slot++)
      publishStagedSharedEffect(f.world, slot, image(f, slot, 6));
    f.world.powerEffects.slots[0].nativePrior![21]! |= 1;
    const n = f.world.powerEffects.slots[1].nativePrior!;
    putEffectWord(n, 71, 1);
    n[73] = 5;
    n[67] = 173;
    f.world.powerEffects.slots[1].fractionX = 173;
    const rng = { ...f.world.rng };
    // Selector69 deliberately has no fallback priority; the imported row is
    // sufficient for allocation without pretending it has a callback binding.
    expect(allocateStagedSharedEffect(f.world, 69, f.pack, f.options)).toBe(1);
    expect(f.world.rng).toEqual(rng);
    expect(f.world.powerEffects.slots[1].occupied).toBe(false);
    expect(f.world.powerEffects.slots[1].nativePrior![73]).toBe(0);
    expect(f.world.powerEffects.slots[1].nativePrior![67]).toBe(173);
    publishStagedSharedEffect(f.world, 1, image(f, 1, 41));
    expect(f.world.powerEffects.slots[1].fractionX).toBe(173);
    for (const shared of f.world.powerEffects.slots)
      shared.nativePrior![21]! |= 1;
    const before = JSON.stringify(f.world);
    expect(
      allocateStagedSharedEffect(f.world, 69, f.pack, f.options),
    ).toBeNull();
    expect(JSON.stringify(f.world)).toBe(before);
    validateSpatial(f.world.spatial);
  });
  it("retires only the current carrier, preserving its cleanup and stale numeric image", () => {
    const f = fixture(),
      n = image(f, 0);
    n[76] = 119;
    putEffectWord(n, 71, 0);
    n[73] = 5;
    publishStagedSharedEffect(f.world, 0, n);
    retireStagedSharedEffect(f.world, 0, f.options);
    expect(f.world.powerEffects.slots[0].nativePrior![6]).toBe(0);
    expect(f.world.powerEffects.slots[0].nativePrior![73]).toBe(0);
    expect(f.world.powerEffects.slots[0].nativePrior![76]).toBe(119);
    expect(f.world.spatial.nodes["source:4:0"]).toBeUndefined();
    expect(() => retireStagedSharedEffect(f.world, 0, f.options)).toThrow(
      /inactive/,
    );
    validateSpatial(f.world.spatial);
  });
});

describe("typed Geneticist shared callback dispatch", () => {
  it("dispatches primary and real successful marked factories in shared order once", () => {
    const f = fixture();
    publishStagedSharedEffect(f.world, 0, image(f, 0, 41));
    publishStagedSharedEffect(f.world, 2, image(f, 2, 43));
    f.options.geneticistEffect = (w, slot, receipt) => {
      const result = update(w.powerEffects.slots[slot].nativePrior!.slice());
      result.native[76] = result.native[76]! + 1;
      if (slot === 0) {
        const childSlot = allocateStagedSharedEffect(
          w,
          20,
          f.pack,
          f.options,
          receipt,
        )!;
        const child = image({ ...f, world: w }, childSlot, 20);
        child[21]! |= 1;
        publishStagedSharedEffect(w, childSlot, child);
        result.newborns = 1;
        result.retirementRequired = true;
      }
      return result;
    };
    const receipt = stepEffectScheduler(f.world, f.pack, f.options);
    expect(receipt.callbacks).toEqual([
      { phase: "primary", slot: 0, code: 41 },
      { phase: "primary", slot: 2, code: 43 },
      { phase: "newborn", slot: 1, code: 20 },
    ]);
    expect(receipt.geneticist.map((e) => e.slot)).toEqual([0, 2, 1]);
    expect(receipt.createdNewborns).toBe(1);
    expect(receipt.retired).toEqual(["source:4:0"]);
    expect(f.world.powerEffects.slots[1].nativePrior![21]! & 1).toBe(0);
    expect(f.world.powerEffects.slots[1].nativePrior![76]).toBe(1);
    validateSpatial(f.world.spatial);
  });
  it("requires a concrete callback and rejects boolean receipts atomically", () => {
    const f = fixture();
    publishStagedSharedEffect(f.world, 0, image(f, 0));
    const before = JSON.stringify(f.world);
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /callback service/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
    f.options.geneticistEffect = (() => true) as unknown as NonNullable<
      typeof f.options.geneticistEffect
    >;
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /receipt is invalid/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("rolls back earlier RNG, native movement and retirement on a later invalid receipt", () => {
    const f = fixture();
    publishStagedSharedEffect(f.world, 0, image(f, 0, 42));
    publishStagedSharedEffect(f.world, 1, image(f, 1, 20));
    f.options.geneticistEffect = (w, slot) => {
      nextRandom(w.rng);
      const result = update(w.powerEffects.slots[slot].nativePrior!.slice());
      if (slot === 0) {
        putEffectWord(result.native, 7, -320);
        result.retirementRequired = true;
      } else result.newborns = -1;
      return result;
    };
    const before = JSON.stringify(f.world);
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /receipt is invalid/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
});
