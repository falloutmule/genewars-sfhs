import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  createCampaignDestructionEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  insertSpatial,
  unlinkSpatial,
  copySpatialLinks,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { worldCell, groundHeight } from "../src/sim/mechanics/terrain";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import {
  makeDestructionEffect,
  type BlastTarget,
  type DestructionCode,
} from "../src/sim/mechanics/destruction-effect";
import { animationProfile } from "../src/sim/mechanics/animation";
import type { SourceEntityId } from "../src/sim/campaign/source-pools";
const word = (n: readonly (number | null)[], p: number) =>
    ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16,
  dword = (n: readonly (number | null)[], p: number) =>
    (word(n, p) & 65535) | (word(n, p + 2) << 16),
  id = (slot: number): SourceEntityId => `source:4:${slot}`;
function fixture() {
  const pack = campaignFixture(),
    counts: Record<number, number> = {
      2: 10,
      3: 9,
      5: 14,
      6: 4,
      21: 2,
      22: 3,
      27: 8,
      28: 7,
      29: 7,
      30: 4,
      31: 3,
      46: 5,
      48: 12,
    };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 14 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 61 }, (_, code) => ({
      first: 0,
      last: (counts[code] ?? 1) - 1,
      rawTrailingWord: counts[code] ?? 1,
    })),
  };
  pack.ecologyRules!.corpseFriction = Array(8).fill(32);
  const world = createCampaign(pack, "synthetic-destruction");
  for (const node of Object.values(world.spatial.nodes).filter(
    (n) => n.family === 4,
  ))
    unlinkSpatial(world.spatial, world.terrain, node.id);
  for (const p of world.powerEffects.slots) {
    p.occupied = false;
    p.packet = null;
    p.nativePrior![6] = 0;
  }
  world.landings = [];
  world.waterEffects = [];
  put(world.missionPrefix, 0x355c, 1200);
  world.countdown = 1200;
  const options: EffectSchedulerOptions<typeof world> = {
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: (w, id) => cleanupCampaignReferences(w, id),
    blastArea(w) {
      return {
        tables: pack.rules!.tables,
        directions: pack.ecologyRules!.spreadDirections,
        readCountdown: () => word(w.missionPrefix, 0x355c) & 65535,
        writeCountdown(v) {
          put(w.missionPrefix, 0x355c, v);
          w.countdown = v;
        },
        head: (p) => w.spatial.heads[worldCell(...p)],
        resolve(identity) {
          const [, family, index] = identity.split(":").map(Number);
          if (family !== 4) throw Error("Unexpected synthetic target family");
          const n = w.powerEffects.slots[index].nativePrior!;
          return {
            id: identity,
            kind: 5,
            index,
            owner: n[24]!,
            native: n,
            position: [word(n, 7), word(n, 9)],
            height: dword(n, 39),
            relativeHeight: (dword(n, 39) - dword(n, 17)) | 0,
            movable: [6, 27, 28, 29, 30, 31, 46].includes(n[69]!),
          } satisfies BlastTarget;
        },
        next(identity) {
          const n =
            w.powerEffects.slots[Number(identity.split(":")[2])].nativePrior!;
          return n[5] ? `source:${n[5]! - 1}:${word(n, 3)}` : null;
        },
        damage() {
          throw Error("No synthetic damage target should be reached");
        },
      };
    },
  };
  const request = (code: DestructionCode) => ({
    code,
    owner: 4,
    position: [1024, 1024] as [number, number],
    height: groundHeight(world.terrain, 1024, 1024),
    angles: [0, 0, 0] as [number, number, number],
    parameter: code >= 27 ? 80 : 0,
    delay: 0,
  });
  return { world, pack, options, request };
}
function fill(f: ReturnType<typeof fixture>, code: DestructionCode = 46) {
  for (let slot = 0; slot < 200; slot++) {
    const p = f.world.powerEffects.slots[slot],
      r = makeDestructionEffect(
        p.nativePrior!,
        { ...f.request(code), slot },
        f.world.terrain,
        f.world.rng,
        f.pack.rules!.tables,
        animationProfile(f.pack.assets.EFF, code),
      );
    p.nativePrior = r.native;
    p.occupied = true;
    insertSpatial(
      f.world.spatial,
      f.world.terrain,
      id(slot),
      worldCell(1024, 1024),
    );
  }
  for (let slot = 0; slot < 200; slot++)
    copySpatialLinks(
      f.world.spatial,
      id(slot),
      f.world.powerEffects.slots[slot].nativePrior!,
    );
}
describe("destruction factories in the native shared scheduler", () => {
  it("executes an actual area factory and commits its raw and normalized countdown", () => {
    const f = fixture(),
      draws = f.world.rng.draws,
      slot = createCampaignDestructionEffect(
        f.world,
        f.request(5),
        f.pack,
        f.options,
      );
    expect(slot).toBe(0);
    expect(f.world.countdown).toBe(1190);
    expect(word(f.world.missionPrefix, 0x355c)).toBe(1190);
    expect(f.world.rng.draws).toBe(draws + 1);
    expect(f.world.spatial.heads[worldCell(1024, 1024)]).toBe(id(0));
  });
  it("runs marked smoke and blast children once after parent retirement without a landing container", () => {
    const f = fixture(),
      slot = createCampaignDestructionEffect(
        f.world,
        f.request(30),
        f.pack,
        f.options,
      )!;
    f.world.powerEffects.slots[slot].nativePrior![70] = 1;
    const draws = f.world.rng.draws,
      r = stepEffectScheduler(f.world, f.pack, f.options);
    expect(r.callbacks.map((c) => [c.phase, c.code])).toEqual([
      ["primary", 30],
      ["newborn", 6],
      ["newborn", 3],
    ]);
    expect(r.createdNewborns).toBe(2);
    expect(r.retired).toContain(id(0));
    expect(f.world.landings).toEqual([]);
    expect(f.world.countdown).toBe(1190);
    expect(
      word(f.world.powerEffects.slots[0].nativePrior!, 49),
    ).toBeGreaterThan(8000);
    expect(f.world.rng.draws).toBe(draws + 5);
    validateSpatial(f.world.spatial);
  });
  it("replaces the first highest-priority live carrier and preserves its stale fraction bytes", () => {
    const f = fixture();
    fill(f);
    f.world.powerEffects.slots[0].nativePrior![67] = 173;
    f.world.powerEffects.slots[0].fractionX = 173;
    const slot = createCampaignDestructionEffect(
      f.world,
      f.request(5),
      f.pack,
      f.options,
    );
    expect(slot).toBe(0);
    expect(f.world.powerEffects.slots[0].nativePrior![67]).toBe(173);
    expect(f.world.powerEffects.slots[0].nativePrior![69]).toBe(5);
    expect(f.world.powerEffects.slots.filter((p) => p.occupied)).toHaveLength(
      200,
    );
    validateSpatial(f.world.spatial);
  });
  it("fails source capacity without draws, countdown changes or replacement of marked records", () => {
    const f = fixture();
    fill(f);
    for (const p of f.world.powerEffects.slots) p.nativePrior![21]! |= 1;
    const before = JSON.stringify(f.world);
    expect(
      createCampaignDestructionEffect(f.world, f.request(5), f.pack, f.options),
    ).toBeNull();
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("rolls back countdown, native links and prior callbacks on a later missing plant carrier service", () => {
    const f = fixture();
    createCampaignDestructionEffect(f.world, f.request(27), f.pack, f.options);
    f.world.powerEffects.slots[0].nativePrior![70] = 0;
    const p = f.world.powerEffects.slots[199];
    p.nativePrior = makeDestructionEffect(
      p.nativePrior!,
      { ...f.request(46), slot: 199 },
      f.world.terrain,
      f.world.rng,
      f.pack.rules!.tables,
      animationProfile(f.pack.assets.EFF, 46),
    ).native;
    p.nativePrior[69] = 68;
    p.occupied = true;
    insertSpatial(
      f.world.spatial,
      f.world.terrain,
      id(199),
      worldCell(2048, 2048),
    );
    copySpatialLinks(f.world.spatial, id(199), p.nativePrior);
    const before = JSON.stringify(f.world);
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /plant carrier67\/68 callback service is required/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("preserves the explicit atomic boundary when source self-replacement would scan into another pool", () => {
    const f = fixture();
    fill(f, 5);
    const n = f.world.powerEffects.slots[0].nativePrior!;
    n[69] = 27;
    put(n, 21, 0x180);
    n[70] = 0;
    put(n, 74, 80);
    const before = JSON.stringify(f.world);
    expect(() => stepEffectScheduler(f.world, f.pack, f.options)).toThrow(
      /newborn count/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
});
