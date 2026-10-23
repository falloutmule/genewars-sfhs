import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, enterCampaign } from "../src/sim/campaign/world";
import {
  createLanding,
  stepLandingMain,
  type LandingContext,
} from "../src/sim/mechanics/landing";
import { animationProfile } from "../src/sim/mechanics/animation";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { stepEffectScheduler } from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { checksum } from "../src/sim/checksum";

function fixture(slot = 0, frame = 1) {
  const pack = campaignFixture(),
    world = createCampaign(pack, "synthetic-landing-obstacle"),
    landing = createLanding(
      0,
      [8192, 8192],
      world.terrain,
      slot,
      world.powerEffects.slots[slot].nativePrior!,
    ),
    context: LandingContext = {
      terrain: world.terrain,
      tables: pack.rules!.tables,
      bounce: pack.rules!.tables.bounce,
      water: world.source.source.terrain.loadedPhysicalWaterHeight,
      gravity: 512,
      frame,
      profile: (code) => animationProfile(pack.assets.EFF, code),
      plantBlockerWeight: () => 0,
      occupiedEffectSlots: [slot],
      slotPriors: world.powerEffects.slots,
    };
  return { pack, world, landing, context };
}
describe("source code49 building collision query", () => {
  it.each([
    [0, 1],
    [1, 0],
    [6, 3],
  ] as const)(
    "queries actual74270 on odd frame+slot (%d,%d), after vertical physics and before smoke draws",
    (slot, frame) => {
      const { landing, context } = fixture(slot, frame),
        before = landing.height,
        rng = { seed: 7, ring: 31, draws: 0 },
        calls: unknown[] = [];
      context.obstacle = (point, height) => {
        calls.push({ point, height, draws: rng.draws });
        return { position: [8000, 8200], ground: 2000 };
      };
      const clear = structuredClone(landing),
        clearRng = { ...rng };
      stepLandingMain(landing, rng, context);
      stepLandingMain(clear, clearRng, { ...context, obstacle: () => null });
      expect(calls).toEqual([
        { point: [8192, 8192], height: before - 136, draws: 0 },
      ]);
      //Code49's actual descriptor movable=0 makes4AF40's non-null response
      //an exact numeric no-op; collision does not invent an impulse or child.
      expect(landing).toEqual(clear);
      expect(rng).toEqual(clearRng);
      expect(rng.draws).toBe(4);
    },
  );
  it("does not demand the service on even cadence or the terrain-contact frame", () => {
    const even = fixture(0, 0),
      contact = fixture(0, 1);
    expect(() =>
      stepLandingMain(
        even.landing,
        { seed: 7, draws: 0, ring: 31 },
        even.context,
      ),
    ).not.toThrow();
    contact.landing.height =
      groundHeight(contact.world.terrain, ...contact.landing.point) + 136;
    expect(
      stepLandingMain(
        contact.landing,
        { seed: 7, draws: 0, ring: 31 },
        contact.context,
      ),
    ).toEqual([
      { type: "activate", owner: 0 },
      { type: "audio", channel: 0x51 },
    ]);
  });
  it("also uses the common postphysics query on airborne departure, before its phase-specific draws", () => {
    const { landing, context } = fixture(),
      calls: unknown[] = [],
      rng = { seed: 7, draws: 0, ring: 31 };
    landing.phase = 3;
    landing.timer = 5;
    landing.vz = 512;
    landing.accelerationZ = 640;
    const before = landing.height;
    context.obstacle = (point, height) => {
      calls.push({ point, height, draws: rng.draws });
      return null;
    };
    stepLandingMain(landing, rng, context);
    expect(calls).toEqual([
      { point: [8192, 8192], height: before + 144, draws: 0 },
    ]);
    expect(rng.draws).toBe(3);
  });
  it("requires a real height-aware service instead of the scheduler's boolean obstacle fallback, with full rollback", () => {
    const { world, pack } = fixture();
    enterCampaign(world, pack);
    world.frame = 1;
    const before = checksum(world),
      native = world.landings[0].native,
      held = world.powerEffects.slots[0].nativePrior;
    expect(() =>
      stepEffectScheduler(world, pack, {
        gravity: 512,
        obstacleAt: () => false,
        cleanupReferences: cleanupCampaignReferences,
        onLandingEvent: () => {},
      }),
    ).toThrow(/landing74270 obstacle target service/);
    expect(checksum(world)).toBe(before);
    expect(world.landings[0].native).toBe(native);
    expect(world.powerEffects.slots[0].nativePrior).toBe(held);
  });
  it("binds destructionObstacle to the actual staged host and current landing height", () => {
    const { world, pack } = fixture();
    enterCampaign(world, pack);
    world.frame = 1;
    const before = world.landings[0].height,
      calls: unknown[] = [];
    stepEffectScheduler(world, pack, {
      gravity: 512,
      obstacleAt: () => {
        throw Error("Boolean obstacle fallback entered");
      },
      destructionObstacle: (staged, point, height) => {
        expect(staged).not.toBe(world);
        calls.push({ point, height, draws: staged.rng.draws });
        return { position: [8000, 8200], ground: 2000 };
      },
      cleanupReferences: cleanupCampaignReferences,
      onLandingEvent: () => {},
    });
    expect(calls).toEqual([
      { point: [8192, 8192], height: before - 136, draws: 64 },
    ]);
    expect(world.landings[0].height).toBe(before - 136);
    expect(world.rng.draws).toBe(68);
  });
});
