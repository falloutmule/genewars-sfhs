import { describe, expect, it } from "vitest";
import {
  createPowerEffectPool,
  detachPowerPacketTargets,
  launchPowerPackets,
  retirePowerPacketSlots,
  stepPowerPacketMotion,
  type PowerEffectPool,
  type PowerMotionResult,
} from "../src/sim/mechanics/power-motion";
import type { MotionTables } from "../src/sim/mechanics/motion";
const take = <T>(r: PowerMotionResult<T>): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
// Synthetic trig/angle lookup; no original tables or native fixtures.
const tables = (): MotionTables => ({
  atan: Array.from({ length: 257 }, (_, i) =>
    Math.round((Math.atan(i / 256) * 1024) / Math.PI),
  ),
  sine: Array.from({ length: 2048 }, (_, i) =>
    Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
  ),
  cosine: Array.from({ length: 2048 }, (_, i) =>
    Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
  ),
});
const pool = (): PowerEffectPool =>
  take(
    createPowerEffectPool(
      Array.from({ length: 200 }, () => ({
        fractionX: 0,
        fractionY: 0,
        occupied: false,
      })),
    ),
  );
const request = (id = 0) => ({
  id,
  sourceId: 10,
  targetId: 20,
  x: 100,
  y: 200,
  targetX: 1000,
  targetY: 200,
});
const launch = (p = pool(), id = 0) =>
  take(launchPowerPackets(p, [request(id)], tables(), () => 90));

describe("source effect33 numeric motion and shared pool", () => {
  it("launches with speed2048/pitch512 and advances constant velocity without homing or RNG", () => {
    const before = pool();
    const copy = structuredClone(before);
    const created = launch(before);
    const packet = created.pool.slots[0].packet!;
    expect(packet).toMatchObject({
      id: 0,
      vx: 2048,
      vy: 0,
      pitch: 512,
      speed: 2048,
      ground: 90,
      height: 602,
      frame: 0,
      timer: -1,
    });
    const first = take(stepPowerPacketMotion(created.pool, (x, y) => x + y));
    expect(first.samples).toEqual([
      { id: 0, x: 132, y: 200, targetValid: true },
    ]);
    expect(first.pool.slots[0].packet).toMatchObject({
      height: 844,
      ground: 332,
      vx: 2048,
      vy: 0,
      frame: 1,
      timer: -1,
    });
    const second = take(stepPowerPacketMotion(first.pool, () => 0));
    expect(second.samples[0].x).toBe(164);
    expect(before).toEqual(copy);
  });

  it("retains actual source fraction priors and updates fractional coordinates exactly", () => {
    const p = pool();
    p.slots[0].fractionX = 253;
    p.slots[0].fractionY = 2;
    const created = launch(p).pool;
    // A synthetic diagonal velocity exercises byte carries; source direction
    // quantization already happened at launch and never steers toward target.
    created.slots[0].packet!.vx = 3;
    created.slots[0].packet!.vy = -3;
    const moved = take(stepPowerPacketMotion(created, () => 9));
    expect(moved.samples[0]).toMatchObject({ x: 101, y: 199 });
    expect(moved.pool.slots[0]).toMatchObject({ fractionX: 9, fractionY: 246 });
  });

  it("wraps the15-bit source world and emits actual cell relinking requests", () => {
    const r = { ...request(), x: 32760, y: 200, targetX: 32, targetY: 200 };
    const p = take(launchPowerPackets(pool(), [r], tables(), () => 0)).pool;
    const moved = take(stepPowerPacketMotion(p, () => 0));
    expect(moved.samples[0].x).toBe(24);
    expect(moved.moved).toEqual([
      { packetId: 0, slot: 0, oldCell: 127, newCell: 0 },
    ]);
  });

  it("uses source four-frame animation and signed timer decrement independently of lifetime payload", () => {
    let p = launch().pool;
    p.slots[0].packet!.timer = 0;
    const frames: number[] = [];
    for (let n = 0; n < 4; n++) {
      p = take(stepPowerPacketMotion(p, () => 0)).pool;
      frames.push(p.slots[0].packet!.frame);
    }
    expect(frames).toEqual([1, 2, 3, 0]);
    expect(p.slots[0].packet!.timer).toBe(-1);
  });

  it("clears destroyed destination kind while preserving launch direction and decaying observation", () => {
    const p = launch().pool;
    const detached = take(detachPowerPacketTargets(p, 20));
    expect(detached.slots[0].packet!.targetId).toBeNull();
    const moved = take(stepPowerPacketMotion(detached, () => 0));
    expect(moved.samples[0]).toEqual({
      id: 0,
      x: 132,
      y: 200,
      targetValid: false,
    });
    expect(moved.pool.slots[0].packet!.vx).toBe(2048);
    expect(p.slots[0].packet!.targetId).toBe(20);
  });

  it("allocates first genuinely free shared slots and preserves fractions across retirement/reuse", () => {
    const p = pool();
    p.slots[0].occupied = true;
    p.slots[1].fractionX = 17;
    const created = launch(p);
    expect(created.allocated).toEqual([{ packetId: 0, slot: 1 }]);
    const moved = take(stepPowerPacketMotion(created.pool, () => 0));
    const retired = take(retirePowerPacketSlots(moved.pool, [0]));
    expect(retired.slots[1]).toEqual({
      fractionX: 17,
      fractionY: 0,
      occupied: false,
      packet: null,
    });
    expect(launch(retired, 1).allocated).toEqual([{ packetId: 1, slot: 1 }]);
    expect(retired.slots[0].occupied).toBe(true);
  });

  it("rejects a late201st allocation atomically and never drops/replaces existing effects", () => {
    const p = pool();
    const before = structuredClone(p);
    const result = launchPowerPackets(
      p,
      Array.from({ length: 201 }, (_, i) => request(i)),
      tables(),
      () => 0,
    );
    expect(result).toEqual({
      ok: false,
      reason: "power-effect-pool-full-replacement-required",
    });
    expect(p).toEqual(before);
  });

  it("rejects missing fraction priors, invalid terrain and stale retirement without mutation", () => {
    const p = pool();
    p.slots[0].fractionX = null;
    expect(launchPowerPackets(p, [request()], tables(), () => 0)).toEqual({
      ok: false,
      reason: "power-effect-fraction-prior-required",
      slot: 0,
    });
    const created = launch().pool;
    const before = structuredClone(created);
    expect(stepPowerPacketMotion(created, () => Number.NaN)).toEqual({
      ok: false,
      reason: "invalid-power-ground-sample",
      slot: 0,
    });
    expect(retirePowerPacketSlots(created, [0, 0])).toEqual({
      ok: false,
      reason: "stale-power-packet-retirement",
    });
    expect(created).toEqual(before);
  });
});
