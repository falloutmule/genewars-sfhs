import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createBuildingEffect,
  stepBuildingEffectRecord,
  type BuildingEffectContext,
} from "../src/sim/mechanics/building-effect";
import {
  createCampaign,
  enterCampaign,
  queueCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import {
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { put16, put32, i16, u16, u32 } from "../src/sim/campaign/bytes";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";

/**Synthetic source-shaped records; no original tables/media or mission acceptance. */
function fixture() {
  const pack = campaignFixture(),
    eff = pack.assets.EFF,
    first = eff.frames!.length;
  for (let i = 0; i < 9; i++)
    eff.frames!.push({
      ...structuredClone(eff.frames![0]),
      rawFlags: [0, 0, 0],
    });
  while (eff.animations!.length < 45)
    eff.animations!.push({ first: 0, last: 0, rawTrailingWord: 1 });
  eff.animations![44] = { first, last: first + 8, rawTrailingWord: 9 };
  const w = createCampaign(pack, "synthetic-building-appearance"),
    profile = { first, last: first + 8, flags: 0, holds: Array(9).fill(0) },
    native = createBuildingEffect(w.powerEffects.slots[0].nativePrior!, {
      slot: 0,
      owner: 0,
      selector: 11,
      buildingSlot: 7,
      point: [8192, 8192],
      ground: 2048,
      height: 2048,
      shade: 0,
    }),
    rng = { seed: 5428, draws: 0, ring: 31 },
    context: BuildingEffectContext = {
      frame: 1,
      gravity: 512,
      water: 0,
      terrain: w.terrain,
      tables: pack.rules!.tables,
      bounce: Array(8).fill(64),
      friction: [],
      profile,
      obstacle: () => null,
      particle: () => {
        throw Error("Descriptor44 has no child factory");
      },
    };
  const options: EffectSchedulerOptions<typeof w> = {
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    stageHost: (a, s) => Object.assign(s, structuredClone(a)),
    commitHost: (a, s) => Object.assign(a, s),
  };
  function install() {
    const slot = w.powerEffects.slots.findIndex((s) => !s.occupied),
      n = createBuildingEffect(w.powerEffects.slots[slot].nativePrior!, {
        slot,
        owner: 0,
        selector: 11,
        buildingSlot: 7,
        point: [8192, 8192],
        ground: groundHeight(w.terrain, 8192, 8192),
        height: groundHeight(w.terrain, 8192, 8192),
        shade: 0,
      });
    Object.assign(w.powerEffects.slots[slot], {
      occupied: true,
      nativePrior: n,
      packet: null,
    });
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:4:${slot}`,
      worldCell(8192, 8192),
    );
    put16(
      w.missionPrefix,
      0x3554,
      w.powerEffects.slots.filter((s) => s.occupied).length,
    );
    synchronizeCampaignLinks(w);
    return { slot, n };
  }
  return { pack, w, native, context, rng, options, install };
}
describe("complete44/0x2C building appearance common callback", () => {
  it("resamples raised ground and preserves the actual resulting vertical motion", () => {
    const f = fixture(),
      before = structuredClone(f.native);
    for (let cell = 0; cell < 16384; cell++)
      put16(f.w.terrain.bytes, cell * 14 + 2, 2048);
    const result = stepBuildingEffectRecord(f.native, f.rng, f.context);
    expect(u32(result.native as number[], 17)).toBe(4096);
    expect(u32(result.native as number[], 39)).toBe(4096);
    expect(i16(result.native as number[], 49)).toBe(16384);
    expect(result.native[27]).toBe(1);
    expect(result.native.slice(71, 74)).toEqual([7, 0, 4]);
    expect(f.native).toEqual(before);
    expect(f.rng.draws).toBe(0);
  });
  it("runs the actual odd airborne query on lowered ground, without descriptor-disabled impulse", () => {
    const f = fixture(),
      queries: unknown[] = [];
    for (let cell = 0; cell < 16384; cell++)
      put16(f.w.terrain.bytes, cell * 14 + 2, 512);
    f.context.obstacle = (point, height) => {
      queries.push({ point, height });
      return { position: [8000, 8000], ground: 1024 };
    };
    const found = stepBuildingEffectRecord(f.native, f.rng, f.context);
    f.context.obstacle = () => null;
    const absent = stepBuildingEffectRecord(f.native, f.rng, f.context);
    expect(queries).toEqual([{ point: [8192, 8192], height: 2048 }]);
    expect(found.native).toEqual(absent.native);
    expect(u32(found.native as number[], 39)).toBe(2048);
    expect(i16(found.native as number[], 49)).toBe(0); //No gravity for44.
    f.context.obstacle = undefined;
    expect(() => stepBuildingEffectRecord(f.native, f.rng, f.context)).toThrow(
      /74270/,
    );
    f.context.frame = 2;
    expect(() =>
      stepBuildingEffectRecord(f.native, f.rng, f.context),
    ).not.toThrow();
  });
  it("keeps actual first-impact bounce and subsequent ascent", () => {
    const f = fixture();
    put32(f.native as number[], 39, 2049);
    put16(f.native as number[], 49, -1024);
    const impact = stepBuildingEffectRecord(f.native, f.rng, f.context);
    expect(u32(impact.native as number[], 39)).toBe(2048);
    expect(i16(impact.native as number[], 49)).toBe(256);
    const next = stepBuildingEffectRecord(impact.native, f.rng, {
      ...f.context,
      frame: 2,
    });
    expect(u32(next.native as number[], 39)).toBe(2080);
  });
  it.each([0, 1])(
    "admits submerged material%s without inventing water children or retirement",
    (material) => {
      const f = fixture();
      f.context.frame = 3;
      f.context.water = 2000;
      for (let cell = 0; cell < 16384; cell++) {
        put16(f.w.terrain.bytes, cell * 14 + 2, 100);
        f.w.terrain.bytes[cell * 14 + 5] = material;
      }
      put32(f.native as number[], 17, 200);
      put32(f.native as number[], 39, 500);
      put16(f.native as number[], 45, 1024);
      const result = stepBuildingEffectRecord(f.native, f.rng, f.context);
      expect(result.retirementRequired).toBe(false);
      expect(result.newborns).toBe(0);
      expect(f.rng.draws).toBe(0);
      expect(result.native[27]).toBe(1);
    },
  );
  it("caps airborne speed and preserves fractions/15-bit coordinate wrapping", () => {
    const f = fixture();
    put16(f.native as number[], 7, 32760);
    put16(f.native as number[], 45, 22000);
    put32(f.native as number[], 39, 9000);
    const result = stepBuildingEffectRecord(f.native, f.rng, f.context);
    expect(i16(result.native as number[], 61)).toBe(12800);
    expect(i16(result.native as number[], 7)).toBeLessThan(512);
    expect(result.native.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(result.native[67]).toBeTypeOf("number");
  });
  it("rejects attached/unknown states and rolls back a late query failure", () => {
    const f = fixture();
    put32(f.native as number[], 39, 9000);
    const before = structuredClone({
      n: f.native,
      terrain: f.w.terrain,
      rng: f.rng,
    });
    f.context.obstacle = () => {
      throw Error("late74270");
    };
    expect(() => stepBuildingEffectRecord(f.native, f.rng, f.context)).toThrow(
      "late74270",
    );
    expect({ n: f.native, terrain: f.w.terrain, rng: f.rng }).toEqual(before);
    const attached = f.native.slice();
    put16(attached as number[], 21, 0x180);
    expect(() => stepBuildingEffectRecord(attached, f.rng, f.context)).toThrow(
      /flags/,
    );
    const directed = f.native.slice();
    put16(directed as number[], 63, 0);
    expect(() => stepBuildingEffectRecord(directed, f.rng, f.context)).toThrow(
      /state/,
    );
  });
  it("relinks movement before real retirement and atomically rejects a late cleanup failure", () => {
    const f = fixture(),
      { slot, n } = f.install();
    put32(n as number[], 39, 9000);
    put16(n as number[], 45, 22000);
    put16(n as number[], 74, -1);
    n[27] = 7;
    f.w.frame = 1;
    const before = JSON.stringify(f.w),
      calls: number[] = [];
    expect(() =>
      stepEffectScheduler(f.w, f.pack, {
        ...f.options,
        cleanupReferences: (staged) => {
          expect(staged.spatial.nodes[`source:4:${slot}`]).toBeUndefined();
          const current = staged.powerEffects.slots[slot].nativePrior!;
        expect(u16(current as number[], 0)).toBe(
          worldCell(i16(current as number[], 7), i16(current as number[], 9)),
        );
        expect(current[5]).toBe(0);
          calls.push(
            worldCell(i16(current as number[], 7), i16(current as number[], 9)),
          );
          throw Error("late724C0");
        },
      }),
    ).toThrow("late724C0");
    expect(calls[0]).not.toBe(worldCell(8192, 8192));
    expect(JSON.stringify(f.w)).toBe(before);
    const out = stepEffectScheduler(f.w, f.pack, f.options);
    expect(out.retired).toContain(`source:4:${slot}`);
    expect(f.w.powerEffects.slots[slot].nativePrior![6]).toBe(0);
    expect(f.w.spatial.nodes[`source:4:${slot}`]).toBeUndefined();
    expect(u16(f.w.missionPrefix, 0x3554)).toBe(0);
    validateSpatial(f.w.spatial);
  });
  it("runs changed-ground44 in normal campaign steps with save continuation and sealed command replay", () => {
    const f = fixture();
    enterCampaign(f.w, f.pack);
    for (let i = 0; i < 200; i++) stepCampaign(f.w, f.pack);
    expect(f.w.phase).toBe("active");
    const { slot } = f.install();
    for (let cell = 0; cell < 16384; cell++)
      put16(f.w.terrain.bytes, cell * 14 + 2, 1280);
    const recording = recordCampaign(f.w, null),
      command = {
        type: "roster-target" as const,
        point: [9000, 9000] as [number, number],
      };
    expect(queueCampaign(f.w, command).ok).toBe(true);
    recording.commands.push({ tick: f.w.tick, type: "command", command });
    let loaded: typeof f.w | null = null;
    for (let i = 0; i < 17; i++) {
      stepCampaign(f.w, f.pack);
      if (loaded) stepCampaign(loaded, f.pack);
      expect(f.w.phase, f.w.notices.at(-1)?.text).toBe("active");
      if (i === 2)
        loaded = loadCampaign(
          saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
          f.w.contentHash,
        ).world;
      if (loaded) expect(checksum(loaded)).toBe(checksum(f.w));
    }
    expect(f.w.powerEffects.slots[slot].nativePrior![6]).toBe(0);
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(recording, f.w),
          f.pack,
          f.w.contentHash,
        ),
      ),
    ).toBe(checksum(f.w));
  });
});
