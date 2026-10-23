import { describe, expect, it } from "vitest";
import {
  createPowerEffectPool,
  detachPowerPacketTargets,
  launchPowerPackets,
  retirePowerPacketSlots,
  stepPowerPacketMotion,
  validateEffectNativePrior,
  type EffectNativePrior,
  type PowerMotionResult,
} from "../src/sim/mechanics/power-motion";
import {
  createLanding,
  stepLandingMain,
  stepLandingParticle,
  type LandingContext,
} from "../src/sim/mechanics/landing";
import {
  initializePowerAdapter,
  synchronizePowerAdapter,
  applyPowerBuildingEvents,
  stepPowerEffects,
  type PowerAdapterWorld,
} from "../src/sim/campaign/power-adapter";
import { groundHeight, terrainFromBytes } from "../src/sim/mechanics/terrain";
import { makeWaterEffect, type WaterContext } from "../src/sim/mechanics/water";
import type { MotionTables } from "../src/sim/mechanics/motion";
import type { SourcePoolRegistry } from "../src/sim/campaign/source-pools";
import type { EconomyState } from "../src/sim/mechanics/economy";
import { campaignFixture } from "./fixtures/campaign";

const take = <T>(r: PowerMotionResult<T>): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const tables: MotionTables = {
  atan: Array.from({ length: 257 }, (_, i) =>
    Math.round((Math.atan(i / 256) * 1024) / Math.PI),
  ),
  sine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
  ),
  cosine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
  ),
};
const word = (n: EffectNativePrior, p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function prior(seed = 1): EffectNativePrior {
  const n = Array.from({ length: 81 }, (_, p) =>
    p >= 31 && p < 39 ? null : (seed + p * 37) & 255,
  );
  n[6] = 0;
  n[30] = 2;
  n[67] = 181;
  n[68] = 193;
  n[71] = 12;
  n[72] = 0;
  n[73] = 4;
  n[76] = 99;
  return n;
}
function fixture() {
  const raw = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    raw[i * 14 + 2] = 232;
    raw[i * 14 + 3] = 3;
    raw[i * 14 + 5] = 2;
  }
  const terrain = terrainFromBytes(raw),
    pool = take(
      createPowerEffectPool(
        Array.from({ length: 200 }, (_, i) => ({
          nativePrior: prior(i),
          fractionX: 181,
          fractionY: 193,
          occupied: false,
        })),
      ),
    );
  const context: LandingContext = {
    terrain,
    tables,
    bounce: Array(8).fill(128),
    water: 0,
    gravity: 1024,
    frame: 0,
    profile: (code) => ({
      holds: Array(code === 6 ? 13 : 6).fill(0),
      flags: 0,
      first: 0,
      last: code === 6 ? 12 : 5,
    }),
    plantBlockerWeight: () => 0,
    occupiedEffectSlots: [0],
    slotPriors: pool.slots,
  };
  const water: WaterContext = {
    terrain,
    tables,
    bounce: context.bounce,
    rawWaterHeight: 0,
    obstacleAt: () => false,
    profile: (code) => ({
      holds: Array(code === 0x15 ? 2 : code === 0x16 ? 3 : 12).fill(0),
      flags: 0,
      first: 0,
      last: code === 0x15 ? 1 : code === 0x16 ? 2 : 11,
    }),
  };
  return { terrain, pool, context, water };
}

describe("shared numeric effect priors", () => {
  it("decodes all packed numeric bytes around an explicitly null pointer gap", () => {
    const raw = Uint8Array.from({ length: 200 * 73 }, (_, i) => (i * 13) & 255);
    for (let slot = 0; slot < 200; slot++) raw[slot * 73 + 6] = 0;
    const pool = initializePowerAdapter({
      source: {
        pools: [
          {
            family: 4,
            capacity: 200,
            packedStride: 73,
            packedBase64: Buffer.from(raw).toString("base64"),
          },
        ],
      },
    });
    for (const slot of [0, 73, 199]) {
      const n = pool.slots[slot].nativePrior!;
      expect(n.slice(0, 31)).toEqual(
        Array.from(raw.slice(slot * 73, slot * 73 + 31)),
      );
      expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
      expect(n.slice(39)).toEqual(
        Array.from(raw.slice(slot * 73 + 31, (slot + 1) * 73)),
      );
      expect([n[30], n[73], n[76]]).toEqual([
        raw[slot * 73 + 30],
        raw[slot * 73 + 65],
        raw[slot * 73 + 68],
      ]);
    }
  });

  it("preserves particle counter/child/payload, then writes power fields before water reuse", () => {
    const f = fixture(),
      landing = createLanding(
        0,
        [1024, 1024],
        f.terrain,
        0,
        f.pool.slots[0].nativePrior,
      ),
      rng = { seed: 7, draws: 0, ring: null };
    expect(landing.native![30]).toBe(2);
    expect([landing.native![73], landing.native![76]]).toEqual([0, 0]);
    const events = stepLandingMain(landing, rng, f.context),
      particle = landing.particles[0];
    expect(events).toEqual([]);
    expect(particle.slot).toBe(1);
    expect([
      particle.native![30],
      particle.native![73],
      particle.native![76],
    ]).toEqual([2, 4, 99]);
    expect(particle.animation.counter).toBe(2);
    expect(particle.native![21]! & 1).toBe(1);
    // A terminal callback keeps its complete afterimage for the next factory.
    particle.animation.frame = 12;
    particle.animation.counter = 1;
    expect(stepLandingParticle(particle, f.context)).toBe(false);
    expect([
      particle.native![6],
      particle.native![30],
      particle.native![73],
      particle.native![76],
    ]).toEqual([0, 0, 4, 99]);
    f.pool.slots[0].occupied = true;
    f.pool.slots[1].nativePrior = particle.native!.slice();
    f.pool.slots[1].fractionX = particle.fractionX;
    f.pool.slots[1].fractionY = particle.fractionY;
    const launched = take(
      launchPowerPackets(
        f.pool,
        [
          {
            id: 1,
            sourceId: 8,
            targetId: 9,
            destinationIndex: 42,
            payload: 11,
            x: 1024,
            y: 1024,
            targetX: 2048,
            targetY: 1024,
          },
        ],
        tables,
        (x, y) => groundHeight(f.terrain, x, y),
        () => 17,
      ),
    );
    const slot = launched.pool.slots[1],
      n = slot.nativePrior!;
    expect(word(n, 71)).toBe(42);
    expect([n[73], n[76], n[30], n[23], n[69]]).toEqual([4, 11, 0, 17, 33]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    const moved = take(
      stepPowerPacketMotion(
        launched.pool,
        () => 2000,
        () => 19,
      ),
    );
    expect(moved.pool.slots[1].nativePrior![30]).toBe(0);
    expect(word(moved.pool.slots[1].nativePrior!, 7)).toBe(
      moved.pool.slots[1].packet!.x,
    );
    const detached = take(detachPowerPacketTargets(moved.pool, 9));
    expect(detached.slots[1].nativePrior![73]).toBe(0);
    expect(word(detached.slots[1].nativePrior!, 71)).toBe(42);
    const retired = take(retirePowerPacketSlots(detached, [1])),
      final = retired.slots[1];
    const wake = makeWaterEffect(
      1,
      {
        code: 0x16,
        owner: 0,
        position: [1024, 1024],
        height: 3000,
        angles: [0, 512, 100],
      },
      final.nativePrior!,
      f.water,
    );
    expect([wake.native[30], wake.native[73], wake.native[76]]).toEqual([
      0, 0, 11,
    ]);
    expect([wake.fractionX, wake.fractionY]).toEqual([
      final.fractionX,
      final.fractionY,
    ]);
    expect(wake.native.slice(31, 39)).toEqual(Array(8).fill(null));
  });

  it("rejects malformed or unknown read-dependent priors without inventing counterzero", () => {
    for (const n of [
      Array(80).fill(0),
      Array(81),
      (() => {
        const n = prior();
        n[32] = 1;
        return n;
      })(),
      (() => {
        const n = prior();
        n[76] = 256;
        return n;
      })(),
    ])
      expect(() => validateEffectNativePrior(n)).toThrow("native prior");
    const f = fixture(),
      n = prior();
    n[30] = null;
    const saved = structuredClone(n);
    expect(() =>
      makeWaterEffect(
        0,
        {
          code: 0x15,
          owner: 0,
          position: [1024, 1024],
          height: 3000,
          angles: [0, 512, 100],
        },
        n,
        f.water,
      ),
    ).toThrow("prior byte 30");
    f.pool.slots[1].nativePrior = n;
    const landing = createLanding(0, [1024, 1024], f.terrain, 0);
    expect(() =>
      stepLandingMain(landing, { seed: 1, draws: 0, ring: null }, f.context),
    ).toThrow("prior byte 30");
    expect(n).toEqual(saved);
  });

  it("publishes live/final particle images before the shared slot is reused", () => {
    const f = fixture(),
      landing = createLanding(
        0,
        [1024, 1024],
        f.terrain,
        0,
        f.pool.slots[0].nativePrior,
      );
    stepLandingMain(landing, { seed: 7, draws: 0, ring: null }, f.context);
    const particle = landing.particles[0],
      slot = particle.slot;
    const w = {
      powerEffects: f.pool,
      terrain: f.terrain,
      landings: [landing],
      spatial: { heads: Array(16384).fill(null), nodes: {} },
    } as PowerAdapterWorld;
    synchronizePowerAdapter(w);
    expect(w.powerEffects.slots[slot].nativePrior).toEqual(particle.native);
    particle.animation.frame = 12;
    particle.animation.counter = 1;
    expect(stepLandingParticle(particle, f.context)).toBe(false);
    landing.particles = [];
    synchronizePowerAdapter(w, [particle]);
    expect(w.powerEffects.slots[slot]).toMatchObject({
      occupied: false,
      fractionX: particle.fractionX,
      fractionY: particle.fractionY,
    });
    expect(w.powerEffects.slots[slot].nativePrior).toEqual(particle.native);
    const saved = structuredClone(w.powerEffects);
    particle.native![32] = 7;
    expect(() => synchronizePowerAdapter(w, [particle])).toThrow(
      "native prior",
    );
    expect(w.powerEffects).toEqual(saved);
  });

  it("keeps delivered payload and records actual decay through retirement and water factory", () => {
    for (const delivered of [true, false]) {
      const f = fixture(),
        pack = campaignFixture(),
        target = {
          id: 9,
          slot: 7,
          owner: 2,
          selector: 0,
          grade: 0 as const,
          x: delivered ? 1056 : 2048,
          y: 1024,
          complete: true,
          disabled: false,
          capacitySuppressed: false,
          hqUpgradeSuppressed: false,
          powered: false,
          energy: 0,
          extraDrain: 0,
          depleted: false,
          storedGoop: 0,
          specialPowerDelivery: false,
        };
      const economy: EconomyState = {
        width: 128,
        height: 128,
        resources: Array(16384).fill(0),
        buildings: [target],
        players: [
          {
            id: 2,
            goop: 0,
            capacity: 0,
            maxOperationalHQGrade: 0,
            generatedEnergy: 0,
            noPowerWarningTicks: 0,
            unusedGoopWarningTicks: 0,
          },
        ],
        packets: [],
        nextPacketId: 0,
      };
      const w: PowerAdapterWorld = {
        powerEffects: f.pool,
        terrain: f.terrain,
        spatial: { heads: Array(16384).fill(null), nodes: {} },
        landings: [],
        economy,
        source: {
          source: { terrain: { solarGeneration: 0 } },
        } as SourcePoolRegistry,
        frame: 0,
        rng: { seed: 1, draws: 0, ring: null },
      };
      const packet = {
        id: 0,
        sourceId: 8,
        targetId: 9,
        payload: delivered ? 17 : 2,
        x: 1024,
        y: 1024,
      };
      applyPowerBuildingEvents(
        w,
        {
          state: { ...economy, nextPacketId: 1, packets: [packet] },
          events: [{ type: "packet-launched", packet }],
          reasons: [],
          powerSamples: [],
        },
        pack,
      );
      const native = w.powerEffects.slots[0].nativePrior!;
      expect(word(native, 71)).toBe(2 * 64 + 7);
      expect(native[73]).toBe(4);
      expect(native[30]).toBe(2);
      stepPowerEffects(w, pack, 0);
      if (!delivered) {
        expect(w.powerEffects.slots[0].nativePrior![76]).toBe(1);
        expect(w.powerEffects.slots[0].occupied).toBe(true);
        stepPowerEffects(w, pack, 0);
      }
      const final = w.powerEffects.slots[0].nativePrior!;
      expect([final[6], final[30], final[73], final[76]]).toEqual([
        0,
        0,
        4,
        delivered ? 17 : 0,
      ]);
      expect(w.spatial.nodes["source:4:0"]).toBeUndefined();
      const water = makeWaterEffect(
        0,
        {
          code: 0x15,
          owner: 0,
          position: [1024, 1024],
          height: 3000,
          angles: [0, 512, 100],
        },
        final,
        f.water,
      );
      expect([water.native[73], water.native[76]]).toEqual([
        4,
        delivered ? 17 : 0,
      ]);
    }
  });

  it("retains source31 phase3 at retirement and publishes its final numeric image once", () => {
    const f = fixture(),
      landing = createLanding(
        0,
        [1024, 1024],
        f.terrain,
        0,
        f.pool.slots[0].nativePrior,
      ),
      w = {
        powerEffects: f.pool,
        terrain: f.terrain,
        landings: [landing],
        spatial: { heads: Array(16384).fill(null), nodes: {} },
      } as PowerAdapterWorld;
    synchronizePowerAdapter(w);
    landing.phase = 3;
    landing.timer = 1;
    landing.vz = 512;
    landing.accelerationZ = 640;
    const result = stepLandingMain(
      landing,
      { seed: 1, draws: 0, ring: null },
      f.context,
    );
    expect(result).toEqual([{ type: "retired", owner: 0 }]);
    expect(landing.phase).toBe(4);
    expect([
      landing.native![6],
      landing.native![70],
      landing.native![30],
      word(landing.native!, 74),
    ]).toEqual([0, 3, 0, 0]);
    expect(word(landing.native!, 49)).toBe(1152);
    synchronizePowerAdapter(w);
    expect(w.powerEffects.slots[0].nativePrior).toEqual(landing.native);
    const power = take(
      launchPowerPackets(
        w.powerEffects,
        [
          {
            id: 0,
            sourceId: 8,
            targetId: 9,
            destinationIndex: 42,
            payload: 7,
            x: 1024,
            y: 1024,
            targetX: 2048,
            targetY: 1024,
          },
        ],
        tables,
        () => 2000,
      ),
    );
    w.powerEffects = take(retirePowerPacketSlots(power.pool, [0]));
    synchronizePowerAdapter(w);
    expect([
      w.powerEffects.slots[0].nativePrior![69],
      w.powerEffects.slots[0].nativePrior![76],
    ]).toEqual([33, 7]);
  });
});
