import { describe, it, expect } from "vitest";
import { syntheticPack } from "../src/content/synthetic";
import {
  available,
  createWorld,
  queue,
  route,
  step,
  DEVELOPMENT_BUILD_TICKS,
} from "../src/sim/world";
import { checksum } from "../src/sim/checksum";
import { load, save, recover, storeRecovery } from "../src/sim/save";
import { captureCommand, record, replay, seal } from "../src/sim/replay";
import { FixedClock } from "../src/platform/clock";
import type { World } from "../src/sim/schema";
const make = () => createWorld(syntheticPack().missions[0], "fixture-v1", true);
const tick = (w: World, n = 1) => {
  for (let i = 0; i < n; i++) step(w);
};
const build = (
  w: World,
  selector: 11 | 3 | 6,
  x: number,
  y: number,
  queued = false,
) =>
  queue(w, {
    type: "construct",
    tick: w.tick,
    playerId: 0,
    sequence: w.nextSequence,
    actorId: 1,
    selector,
    x,
    y,
    queued,
  });
describe("source-backed Exceland predicates (development scheduler)", () => {
  it("uses the Extractor → Distributor → three Processor sequence and original costs", () => {
    const w = make();
    expect(available(w, 3)).toContain("Extractor");
    expect(available(w, 6)).toContain("Distributor");
    build(w, 11, 83, 54);
    tick(w, DEVELOPMENT_BUILD_TICKS + 1);
    expect(w.goop).toBe(1350);
    expect(w.completed[11]).toBe(1);
    build(w, 3, 88, 54);
    tick(w, 31);
    expect(w.goop).toBe(950);
    build(w, 6, 82, 59);
    build(w, 6, 84, 59, true);
    build(w, 6, 86, 59, true);
    tick(w, 93);
    expect(w.goop).toBe(200);
    expect(w.completed[6]).toBe(3);
    expect(w.status).toBe("workbench-complete");
    expect(w.mode).toBe("synthetic"); // never accepted as a canonical mission result
  });
  it("does not unlock the Distributor merely by starting an Extractor", () => {
    const w = make();
    build(w, 11, 83, 54);
    tick(w);
    expect(available(w, 3)).toContain("completed");
  });
  it("retains ownership-based rebuild eligibility after prerequisite loss", () => {
    const w = make();
    w.ownedSelectors = [3];
    expect(available(w, 3)).toBeNull();
  });
  it("applies the signed Engineer skill discount", () => {
    const w = make();
    w.specialists[0].skill = -5;
    build(w, 11, 83, 54);
    tick(w);
    expect(w.goop).toBe(1340);
  });
  it("explains invalid role, occupied sites, and insufficient GOOP without partial debit", () => {
    const w = make();
    queue(w, {
      tick: 0,
      sequence: 0,
      playerId: 0,
      type: "construct",
      actorId: 2,
      selector: 11,
      x: 84,
      y: 55,
      queued: false,
    });
    tick(w);
    expect(w.goop).toBe(2000);
    expect(w.alerts.at(-1)?.cause).toContain("Engineer");
    build(w, 11, 83, 54);
    tick(w, 31);
    const funds = w.goop;
    build(w, 11, 84, 55);
    tick(w);
    expect(w.goop).toBe(funds);
    expect(w.specialists[0].reason).toBe("Destination occupied");
    w.goop = 0;
    build(w, 11, 90, 54);
    tick(w);
    expect(w.buildings).toHaveLength(1);
    expect(w.specialists[0].reason).toBe("Insufficient GOOP");
  });
  it("rejects unsupported commands, stale ticks and duplicate sequences", () => {
    const w = make();
    expect(() => queue(w, { type: "spawn", tick: 0 })).toThrow();
    build(w, 11, 83, 54);
    expect(() =>
      queue(w, {
        type: "move",
        tick: 0,
        playerId: 0,
        sequence: 0,
        actorIds: [1],
        x: 1,
        y: 1,
        queued: false,
      }),
    ).toThrow();
    tick(w);
    expect(() =>
      queue(w, {
        type: "move",
        tick: 0,
        playerId: 0,
        sequence: 1,
        actorIds: [1],
        x: 1,
        y: 1,
        queued: false,
      }),
    ).toThrow();
  });
  it("reports unreachable destinations and finds deterministic alternate routes", () => {
    const w = make();
    w.blocked = [53 * 128 + 82];
    const a = route(w, 81, 53, 83, 53);
    expect(a).toHaveLength(4);
    expect(a).toEqual(route(w, 81, 53, 83, 53));
    w.blocked = [52 * 128 + 83, 53 * 128 + 82, 53 * 128 + 84, 54 * 128 + 83];
    expect(route(w, 81, 53, 83, 53)).toBeNull();
    queue(w, {
      tick: 0,
      sequence: 0,
      playerId: 0,
      type: "move",
      actorIds: [1],
      x: 83,
      y: 53,
      queued: false,
    });
    tick(w);
    expect(w.specialists[0].reason).toBe("No valid route");
  });
});
describe("complete authoritative save and replay", () => {
  it("preserves active construction, queued orders, future commands, pause and speed", () => {
    const w = make();
    build(w, 11, 83, 54);
    build(w, 3, 88, 54, true);
    tick(w, 12);
    queue(w, {
      tick: 100,
      sequence: w.nextSequence,
      playerId: 0,
      type: "move",
      actorIds: [2],
      x: 90,
      y: 50,
      queued: false,
    });
    const loaded = load(
      save(w, { paused: true, speed: 4, accumulator: 83 }),
      "fixture-v1",
    );
    expect(loaded.session).toEqual({ paused: true, speed: 4, accumulator: 83 });
    expect(loaded.world).toEqual(w);
    tick(w, 150);
    tick(loaded.world, 150);
    expect(checksum(loaded.world)).toBe(checksum(w));
  });
  it("rejects wrong versions, incompatible content, corruption and duplicate entity IDs", () => {
    const raw = save(make(), { paused: false, speed: 1, accumulator: 0 });
    expect(() => load(raw, "other")).toThrow(/Content hash/);
    const v = JSON.parse(raw);
    v.version = 99;
    expect(() => load(JSON.stringify(v), "fixture-v1")).toThrow(/version/);
    const corrupt = JSON.parse(raw);
    corrupt.world.goop = 2;
    expect(() => load(JSON.stringify(corrupt), "fixture-v1")).toThrow(
      /checksum/,
    );
    const w = make();
    w.specialists[1].id = 1;
    expect(() =>
      load(save(w, { paused: false, speed: 1, accumulator: 0 }), "fixture-v1"),
    ).toThrow(/identity/);
  });
  it("rotates recovery saves and falls back from a corrupted newest slot", () => {
    const m = new Map<string, string>(),
      storage = {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => {
          m.set(k, v);
        },
      };
    const w = make();
    for (let i = 0; i < 6; i++) {
      tick(w);
      storeRecovery(
        storage,
        save(w, { paused: true, speed: 0.5, accumulator: 0 }),
      );
    }
    const head = m.get("gw:recovery:head")!;
    m.set("gw:recovery:" + head, "bad");
    expect(recover(storage, "fixture-v1")?.world.tick).toBe(5);
    expect(recover(storage, "other")).toBeNull();
  });
  it("records commands at issue time, including future tick and paused final-tick inputs", () => {
    const w = make(),
      r = record(w);
    const c = build(w, 11, 83, 54);
    captureCommand(r, w, c);
    tick(w, 12);
    r.hashes.push([w.tick, checksum(w)]);
    const next = queue(w, {
      tick: 60,
      sequence: w.nextSequence,
      playerId: 0,
      type: "move",
      actorIds: [2],
      x: 91,
      y: 51,
      queued: false,
    });
    captureCommand(r, w, next);
    tick(w, 30);
    const last = build(w, 3, 88, 54, true);
    captureCommand(r, w, last);
    const result = seal(r, w);
    expect(checksum(replay(result, "fixture-v1"))).toBe(checksum(w));
    result.hashes[0][1] = "wrong";
    expect(() => replay(result, "fixture-v1")).toThrow(/drift/);
  });
  it("hashes fields that the donor partial checksum omitted", () => {
    const w = make(),
      before = checksum(w);
    w.specialists[0].orders.push({ type: "move", x: 1, y: 2 });
    expect(checksum(w)).not.toBe(before);
  });
  it("rejects orphaned construction references even with a valid envelope hash", () => {
    const w = make();
    w.specialists[0].orders.push({
      type: "construct",
      selector: 11,
      x: 83,
      y: 54,
      buildingId: 999,
    });
    expect(() =>
      load(save(w, { paused: true, speed: 1, accumulator: 0 }), "fixture-v1"),
    ).toThrow(/reference/);
  });
});
describe("render-independent scheduling", () => {
  it.each([0.5, 1, 2, 4] as const)(
    "reaches the same state at %sx with varying display frames",
    (speed) => {
      const a = make(),
        b = make(),
        clock = new FixedClock();
      clock.speed = speed;
      for (const w of [a, b]) build(w, 11, 83, 54);
      const total = 10000 / speed;
      let time = 0;
      while (time < total) {
        const dt = Math.min(
          [7, 19, 33, 11][Math.floor(time) % 4],
          total - time,
        );
        clock.advance(dt, () => step(a));
        time += dt;
      }
      tick(b, 100);
      expect(checksum(a)).toBe(checksum(b));
    },
  );
  it("retains backlog instead of discarding ticks, and pause does not accumulate time", () => {
    const clock = new FixedClock();
    let n = 0;
    clock.advance(25000, () => n++);
    expect(n).toBe(100);
    expect(clock.accumulator).toBe(15000);
    clock.advance(0, () => n++);
    clock.advance(0, () => n++);
    expect(n).toBe(250);
    clock.paused = true;
    clock.advance(9999, () => n++);
    expect(n).toBe(250);
    expect(clock.accumulator).toBe(0);
  });
});
