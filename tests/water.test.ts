import { describe, it, expect } from "vitest";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import type { Pack } from "../src/content/types";
import type { SourcePoolRegistry } from "../src/sim/campaign/source-pools";
import {
  createWaterEffect,
  consumeMuleWaterEvents,
  stepWaterEffects,
  type WaterAdapterWorld,
} from "../src/sim/campaign/water-adapter";
import {
  makeWaterEffect,
  updateWaterEffect,
  type WaterContext,
  type WaterRequest,
} from "../src/sim/mechanics/water";
import { createPowerEffectPool } from "../src/sim/mechanics/power-motion";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { terrainFromBytes, worldCell } from "../src/sim/mechanics/terrain";
function fixture() {
  const tables = {
    atan: Array.from({ length: 257 }, (_, i) =>
      Math.round((Math.atan(i / 256) * 1024) / Math.PI),
    ),
    sine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
    ),
    cosine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
    ),
    bounce: Array(8).fill(128),
  };
  const asset = {
    kind: "animation",
    image: "data:image/png;base64,fixture",
    frames: Array.from({ length: 12 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 49 }, (_, i) => ({
      first: 0,
      last: i === 21 ? 1 : i === 22 ? 2 : i === 48 ? 11 : 0,
      rawTrailingWord: i === 21 ? 2 : i === 22 ? 3 : i === 48 ? 12 : 1,
    })),
  };
  const pack = { rules: { tables }, assets: { EFF: asset } } as unknown as Pack;
  const made = createPowerEffectPool(
    Array.from({ length: 200 }, (_, i) => ({
      fractionX: (i * 7 + 13) & 255,
      fractionY: (i * 11 + 17) & 255,
      occupied: false,
    })),
  );
  if (!made.ok) throw new Error(made.reason);
  for (const [i, slot] of made.value.slots.entries()) {
    const n: (number | null)[] = Array(81).fill(0);
    n.fill(null, 31, 39);
    n[67] = slot.fractionX;
    n[68] = slot.fractionY;
    (slot as typeof slot & { nativePrior: (number | null)[] }).nativePrior = n;
  }
  const world: WaterAdapterWorld = {
    waterEffects: [],
    powerEffects: made.value,
    spatial: { heads: Array(16384).fill(null), nodes: {} },
    terrain: terrainFromBytes(Array(229376).fill(0)),
    rng: { seed: 5428, draws: 16855, ring: null },
    source: {
      entities: [],
      source: { terrain: { rawWaterHeight: 0 } },
    } as unknown as SourcePoolRegistry,
    frame: 0,
    landings: [],
  };
  const options = { obstacleAt: () => false, cleanupReferences: () => 0 };
  const context: WaterContext = {
    terrain: world.terrain,
    tables,
    bounce: tables.bounce,
    rawWaterHeight: 30000,
    profile: (code) => ({
      holds: Array(code === 0x15 ? 2 : code === 0x16 ? 3 : 12).fill(0),
      flags: 0,
      first: 0,
      last: code === 0x15 ? 1 : code === 0x16 ? 2 : 11,
    }),
    obstacleAt: () => false,
  };
  const request: WaterRequest = {
    code: 0x30,
    owner: 0,
    position: [4096, 4096],
    height: 1632,
    angles: [0, 0, 0],
  };
  return { world, pack, options, context, request };
}
describe("original water effect lifecycle and shared-pool adapter", () => {
  it("preserves shared prior counter/fractions and wake motion, retiring on source call33", () => {
    const f = fixture(),
      rng = { ...f.world.rng },
      created = createWaterEffect(f.world, f.request, f.pack, f.options);
    expect(created.created).toEqual([{ slot: 0, code: 0x30 }]);
    expect(created.audio).toEqual([
      { channel: 0x3b, mode: 2, parameter: 0, volume: 127, range: 100 },
    ]);
    const e = f.world.waterEffects[0],
      before = [e.x, e.y, e.height, e.ground, e.fractionX, e.fractionY];
    let calls = 0;
    while (e.active && calls < 40) {
      stepWaterEffects(f.world, f.pack, f.options);
      calls++;
      const current = f.world.waterEffects[0];
      if (current.active)
        expect([
          current.x,
          current.y,
          current.height,
          current.ground,
          current.fractionX,
          current.fractionY,
        ]).toEqual(before);
      else break;
    }
    expect(calls).toBe(33);
    expect(f.world.powerEffects.slots[0].occupied).toBe(false);
    expect(f.world.spatial.nodes["source:4:0"]).toBeUndefined();
    expect(f.world.rng).toEqual(rng);
  });
  it("does not zero a reused animation counter or overwrite untouched source bytes", () => {
    const f = fixture(),
      slot = f.world.powerEffects
        .slots[0] as (typeof f.world.powerEffects.slots)[0] & {
        nativePrior: (number | null)[];
      };
    slot.nativePrior[30] = 2;
    slot.nativePrior[73] = 4;
    slot.nativePrior[80] = 171;
    createWaterEffect(f.world, f.request, f.pack, f.options);
    expect(f.world.waterEffects[0].native[73]).toBe(4);
    expect(f.world.waterEffects[0].native[80]).toBe(171);
    let calls = 0;
    while (f.world.waterEffects[0].active) {
      stepWaterEffects(f.world, f.pack, f.options);
      calls++;
      expect(calls).toBeLessThan(40);
    }
    expect(calls).toBe(35);
  });
  it("creates code16 before retiring code15 and runs the marked child exactly once", () => {
    const f = fixture(),
      order: string[] = [];
    createWaterEffect(
      f.world,
      { ...f.request, code: 0x15, height: 1000, angles: [0, 0, 128] },
      f.pack,
      f.options,
    );
    const cleanup = {
      ...f.options,
      cleanupReferences: (w: WaterAdapterWorld, id: string) => {
        order.push(id);
        expect(w.spatial.nodes["source:4:1"]).toBeDefined();
        expect(w.waterEffects.find((e) => e.slot === 0)!.native[6]).toBe(5);
        return 2;
      },
    };
    const first = stepWaterEffects(f.world, f.pack, cleanup);
    expect(first.primary).toEqual([0]);
    expect(first.newborn).toEqual([1]);
    expect(first.created).toEqual([{ slot: 1, code: 0x16 }]);
    expect(first.cleanedReferenceBytes).toBe(2);
    expect(order).toEqual(["source:4:0"]);
    const child = f.world.waterEffects.find((e) => e.slot === 1)!;
    expect(child.active).toBe(true);
    expect(child.height).toBe(1016);
    expect(child.animation.frame).toBe(1);
    expect(child.flags & 1).toBe(0);
    const second = stepWaterEffects(f.world, f.pack, f.options);
    expect(second.primary).toEqual([1]);
    expect(second.newborn).toEqual([]);
    expect(second.retired).toEqual(["source:4:1"]);
    expect(f.world.powerEffects.slots.every((s) => !s.occupied)).toBe(true);
    expect(f.world.rng).toEqual({ seed: 5428, draws: 16855, ring: null });
  });
  it("uses the raw water threshold, integrates signed fractions and wraps torus cells", () => {
    const f = fixture(),
      prior = (
        f.world.powerEffects
          .slots[0] as (typeof f.world.powerEffects.slots)[0] & {
          nativePrior: (number | null)[];
        }
      ).nativePrior;
    const e = makeWaterEffect(
        0,
        {
          ...f.request,
          code: 0x15,
          position: [32767, 4096],
          height: 1000,
          angles: [512, 512, 128],
        },
        prior,
        f.context,
      ),
      step = updateWaterEffect(e, f.context);
    expect(step.createChild).toBe(false);
    expect(step.effect.x).toBe(1);
    expect(step.effect.fractionX).toBe(13);
    expect(step.oldCell).not.toBe(step.newCell);
    expect(step.effect.native.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(
      updateWaterEffect(
        makeWaterEffect(
          0,
          { ...f.request, code: 0x15, height: 1000, angles: [0, 0, 128] },
          prior,
          f.context,
        ),
        { ...f.context, rawWaterHeight: 1016 },
      ).createChild,
    ).toBe(true);
  });
  it("performs grounded and first-impact physics before animation without new gravity", () => {
    const f = fixture(),
      prior = (
        f.world.powerEffects
          .slots[0] as (typeof f.world.powerEffects.slots)[0] & {
          nativePrior: (number | null)[];
        }
      ).nativePrior;
    const e = makeWaterEffect(
      0,
      { ...f.request, code: 0x16, height: 1, angles: [0, 1024, 128] },
      prior,
      f.context,
    );
    const impacted = updateWaterEffect(e, f.context);
    expect(impacted.effect.height).toBe(0);
    expect(impacted.effect.vz).toBe(64);
    expect(impacted.effect.animation.frame).toBe(1);
    const stationary = makeWaterEffect(
        0,
        { ...f.request, code: 0x16, height: 0 },
        prior,
        f.context,
      ),
      grounded = updateWaterEffect(stationary, f.context);
    expect(grounded.effect.height).toBe(0);
    expect(grounded.effect.speed).toBe(0);
  });
  it("rolls back the whole pass when an obstacle or missing native prior rejects", () => {
    const f = fixture();
    createWaterEffect(
      f.world,
      { ...f.request, code: 0x15, height: 1000, angles: [0, 0, 128] },
      f.pack,
      f.options,
    );
    const before = JSON.stringify(f.world);
    expect(() =>
      stepWaterEffects(f.world, f.pack, {
        ...f.options,
        obstacleAt: () => true,
      }),
    ).toThrow(/collision/);
    expect(JSON.stringify(f.world)).toBe(before);
    const fresh = fixture();
    delete (fresh.world.powerEffects.slots[0] as { nativePrior?: unknown })
      .nativePrior;
    const original = JSON.stringify(fresh.world);
    expect(() =>
      createWaterEffect(fresh.world, fresh.request, fresh.pack, fresh.options),
    ).toThrow(/prior/);
    expect(JSON.stringify(fresh.world)).toBe(original);
  });
  it("rejects profile changes before allocating a slot or consuming queued requests", () => {
    const f = fixture();
    f.pack.assets.EFF.frames![0].rawFlags[0] = 1;
    const before = JSON.stringify(f.world);
    expect(() =>
      consumeMuleWaterEvents(
        f.world,
        [
          {
            kind: "mule-water-effect",
            id: "source:0:0",
            code: 0x30,
            position: [4096, 4096],
            height: 1000,
            angles: [0, 0, 0],
          },
        ],
        f.pack,
        f.options,
      ),
    ).toThrow(/profile/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  function full(f: ReturnType<typeof fixture>, code: number) {
    for (let i = 0; i < 200; i++) {
      const s = f.world.powerEffects.slots[
        i
      ] as (typeof f.world.powerEffects.slots)[0] & {
        nativePrior: (number | null)[];
      };
      s.occupied = true;
      s.nativePrior[6] = 5;
      s.nativePrior[69] = code;
      s.nativePrior[21] = 0x20;
      insertSpatial(f.world.spatial, f.world.terrain, `source:4:${i}`, 0);
    }
  }
  it("returns the source no-victim capacity failure without RNG or pool changes", () => {
    const f = fixture();
    full(f, 0x30);
    const before = JSON.stringify(f.world),
      out = createWaterEffect(f.world, f.request, f.pack, f.options);
    expect(out.failedFactories).toEqual([0x30]);
    expect(out.created).toEqual([]);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("selects the first strictly highest eligible priority and reuses the real final prior", () => {
    const f = fixture();
    full(f, 0x31);
    f.world.landings = [
      {
        slot: 199,
        owner: 0,
        point: [0, 0],
        height: 0,
        phase: 4,
        timer: 0,
        vz: 0,
        accelerationZ: 0,
        particles: [3, 5].map((slot) => ({
          slot,
          code: 47,
          x: 0,
          y: 0,
          fractionX: 99,
          fractionY: 101,
          height: 1000,
          ground: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          accelerationZ: 0,
          animation: {
            action: 47,
            hold: 0,
            frame: 0,
            direction: 1,
            delay: 2,
            counter: 2,
          },
        })),
        messageIndex: null,
        activationFrame: null,
      },
    ];
    for (const i of [3, 5]) {
      const s = f.world.powerEffects.slots[
        i
      ] as (typeof f.world.powerEffects.slots)[0] & {
        nativePrior: (number | null)[];
      };
      s.nativePrior[69] = 47;
      s.nativePrior[30] = 2;
    }
    const out = createWaterEffect(f.world, f.request, f.pack, f.options);
    expect(out.retired).toEqual(["source:4:3"]);
    expect(out.created).toEqual([{ slot: 3, code: 0x30 }]);
    expect(f.world.waterEffects[0].fractionX).toBe(99);
    expect(f.world.waterEffects[0].animation.counter).toBe(2);
    expect(f.world.landings[0].particles.map((p) => p.slot)).toEqual([5]);
    validateSpatial(f.world.spatial);
  });
  it("rejects an unknown full-pool priority before any replacement", () => {
    const f = fixture();
    full(f, 0x31);
    (
      f.world.powerEffects
        .slots[4] as (typeof f.world.powerEffects.slots)[0] & {
        nativePrior: (number | null)[];
      }
    ).nativePrior[69] = 0xff;
    const before = JSON.stringify(f.world);
    expect(() =>
      createWaterEffect(f.world, f.request, f.pack, f.options),
    ).toThrow(/priority/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("clears actual typed source references before kind clear while preserving index words", () => {
    const f = fixture(),
      native: (number | null)[] = Array(124).fill(0);
    native[6] = 1;
    native[0x4d] = 0;
    native[0x4f] = 5;
    native[0x5b] = 0;
    native[0x5d] = 5;
    native[0x60] = 3;
    f.world.ecology = { mules: [{ native }] };
    const options = {
      ...f.options,
      cleanupReferences: (
        w: WaterAdapterWorld,
        id: Parameters<typeof cleanupCampaignReferences>[1],
      ) =>
        cleanupCampaignReferences(
          {
            ecology: w.ecology!,
            source: w.source,
            waterEffects: w.waterEffects,
          },
          id,
        ),
    };
    createWaterEffect(
      f.world,
      { ...f.request, code: 0x16, height: 1000 },
      f.pack,
      options,
    );
    stepWaterEffects(f.world, f.pack, options);
    const out = stepWaterEffects(f.world, f.pack, options);
    expect(out.cleanedReferenceBytes).toBe(3);
    expect(out.cleanupRequired).toEqual([]);
    expect(f.world.ecology!.mules[0].native[0x4d]).toBe(0);
    expect(f.world.ecology!.mules[0].native[0x4f]).toBe(0);
    expect(f.world.ecology!.mules[0].native[0x5d]).toBe(0);
    expect(f.world.ecology!.mules[0].native[0x60]).toBe(1);
  });
  it("rolls back child creation and all staged cleanup roots on a late cleanup failure", () => {
    const f = fixture();
    f.world.ecology = { mules: [{ native: Array(124).fill(0) }] };
    createWaterEffect(
      f.world,
      { ...f.request, code: 0x15, height: 1000, angles: [0, 0, 128] },
      f.pack,
      f.options,
    );
    const before = JSON.stringify(f.world);
    expect(() =>
      stepWaterEffects(f.world, f.pack, {
        ...f.options,
        cleanupReferences: (w) => {
          w.ecology!.mules[0].native[79] = 5;
          throw new Error("Synthetic late cleanup failure");
        },
      }),
    ).toThrow(/late cleanup/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("attempts a child against the still-full pool before freeing its parent", () => {
    const f = fixture();
    createWaterEffect(
      f.world,
      { ...f.request, code: 0x15, height: 1000, angles: [0, 0, 128] },
      f.pack,
      f.options,
    );
    for (let i = 1; i < 200; i++) {
      const slot = f.world.powerEffects.slots[
        i
      ] as (typeof f.world.powerEffects.slots)[0] & {
        nativePrior: (number | null)[];
      };
      slot.occupied = true;
      slot.nativePrior[6] = 5;
      slot.nativePrior[69] = 0x30;
      slot.nativePrior[21] = 0x20;
      insertSpatial(f.world.spatial, f.world.terrain, `source:4:${i}`, 0);
    }
    const out = stepWaterEffects(f.world, f.pack, f.options);
    expect(out.failedFactories).toEqual([0x16]);
    expect(out.created).toEqual([]);
    expect(out.retired).toEqual(["source:4:0"]);
    expect(out.newborn).toEqual([]);
    expect(f.world.powerEffects.slots.filter((s) => s.occupied)).toHaveLength(
      199,
    );
  });
  it("rolls back earlier queued factories when a later request is malformed", () => {
    const f = fixture(),
      before = JSON.stringify(f.world);
    expect(() =>
      consumeMuleWaterEvents(
        f.world,
        [
          {
            kind: "mule-water-effect",
            id: "source:0:0",
            code: 0x30,
            position: [4096, 4096],
            height: 1000,
            angles: [0, 0, 0],
          },
          { kind: "mule-water-effect", id: "source:0:0", code: 0x30 },
        ],
        f.pack,
        f.options,
      ),
    ).toThrow(/Incomplete/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
});
