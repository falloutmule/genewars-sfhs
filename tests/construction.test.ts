import { describe, expect, it } from "vitest";
import { createMotion } from "../src/sim/mechanics/motion";
import {
  cellIndex,
  MAP_BYTES,
  terrainFromBytes,
} from "../src/sim/mechanics/terrain";
import {
  advanceConstructionAnimation,
  beginConstruction,
  cancelConstruction,
  constructionAvailable,
  constructionDebit,
  constructionSiteClass,
  stepConstruction,
  stepConstructionTerrainJobs,
  type ConstructionContext,
  type ConstructionEvent,
  type ConstructionRules,
  type ConstructionState,
} from "../src/sim/mechanics/construction";

// Explicit synthetic profile. No original executable/ANB/map table bytes.
function rules(): ConstructionRules {
  return {
    evidence: "synthetic profile; original construction equations",
    atan: Array.from({ length: 257 }, (_, i) =>
      Math.trunc((Math.atan(i / 256) * 1024) / Math.PI),
    ),
    sine: Array.from({ length: 2048 }, (_, i) =>
      Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
    ),
    cosine: Array.from({ length: 2048 }, (_, i) =>
      Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
    ),
    terrainBorder: Array(8192).fill(0),
    constructionCosts: Array(14).fill(41),
    actorClassSpeeds: [1792, 1600, 1920, 1500],
    buildingHealth: Array(42).fill(18),
    buildingFootprints: Array(14).fill(1),
    buildingProgressThresholds: Array(42).fill(0),
    buildingPrerequisites: Array(14).fill(255),
  };
}
function state(): ConstructionState {
  const bytes = Array(MAP_BYTES).fill(0);
  for (let cell = 0; cell < 16384; cell++) {
    bytes[cell * 14 + 2] = 1000 & 255;
    bytes[cell * 14 + 3] = 1000 >> 8;
    bytes[cell * 14 + 5] = 7;
  }
  return {
    frame: 1,
    terrain: terrainFromBytes(bytes),
    rng: { seed: 123, draws: 0, ring: 7 },
    nextJobId: 0,
    terrainLastFrame: null,
    jobs: [],
    buildings: [],
    players: [
      {
        id: 0,
        progress: 0,
        primary: 100,
        secondary: 30,
        completed: Array(14).fill(0),
        ownedMask: 0,
      },
    ],
    actors: [
      {
        id: 0,
        owner: 0,
        style: 0,
        category: 0,
        skill: 8,
        enabled: true,
        motion: createMotion(10367, 10367, 2000, 0, 128),
        animation: {
          id: 8,
          frame: 0,
          hold: 0,
          direction: 1,
          delay: 0,
          counter: 0,
        },
        action: 13,
        facingFlip: false,
        status: "idle",
        task: null,
      },
    ],
  };
}
function context(
  patch: Partial<ConstructionContext> = {},
): ConstructionContext {
  return {
    climate: { water: 0, climate: 106, center: [0, 0] },
    gravity: 512,
    resolveTarget: (_a, point) => [...point],
    resolveTaskTarget: (_a, point) => [...point],
    route: (_a, goal) => [[...goal]],
    blocked: () => false,
    occupied: () => false,
    animation: (_a, id) => ({
      holds: Array(id === 14 ? 4 : 3).fill(0),
      flags: 0,
    }),
    refill: () => false,
    allocateBuilding: (_request, world) => ({
      id: world.buildings.length + 20,
      slot: world.buildings.length,
      effectId: 0,
    }),
    ...patch,
  };
}
function tick(
  input: ConstructionState,
  source: ConstructionRules,
  host: ConstructionContext,
) {
  const first = stepConstruction(input, 0, source, host);
  const terrain = stepConstructionTerrainJobs(first.state, source, host);
  terrain.state.frame++;
  return { state: terrain.state, events: [...first.events, ...terrain.events] };
}
function readyPhase(phase: "placing" | "approach" | "working") {
  const source = rules(),
    host = context();
  const world = beginConstruction(
    state(),
    0,
    11,
    [10367, 10367],
    source,
    host,
  ).state;
  const task = world.actors[0].task!;
  task.point = [10367, 10367];
  task.goal = [10367, 10367];
  task.route = [[10367, 10367]];
  task.phase = phase;
  task.stage = phase === "placing" ? 4 : phase === "working" ? 5 : 3;
  if (phase === "placing") {
    world.actors[0].action = 14;
    world.actors[0].animation.id = 14;
    task.paid = 25;
  }
  if (phase === "working") {
    task.buildingId = 20;
    task.timer = task.delay = 2;
    world.buildings.push({
      id: 20,
      slot: 0,
      owner: 0,
      selector: 11,
      grade: 0,
      x: 10367,
      y: 10367,
      health: 1,
      complete: false,
      energy: 0,
    });
  }
  return { world, source, host };
}

describe("source construction lifecycle", () => {
  it("uses shared native terrain capacity and retires its actual slot on stage1 cancellation", () => {
    const world = state(),
      source = rules(),
      host = context();
    world.missionPrefix = Array(0x355e).fill(0);
    for (let slot = 0; slot < 25; slot++) {
      const at = 0x1ec7 + slot * 176 + 12;
      world.missionPrefix[at] = world.missionPrefix[at + 1] = 255;
    }
    // Existing unrelated crater occupies slot0, retaining its afterimage.
    world.missionPrefix[0x1ec7 + 12] = 1;
    world.missionPrefix[0x1ec7 + 13] = 0;
    world.missionPrefix[0x2ff7] = 1;
    const assigned = beginConstruction(
        world,
        0,
        11,
        [10367, 10367],
        source,
        host,
      ).state,
      active = stepConstruction(assigned, 0, source, host).state;
    expect(active.jobs[0]).toMatchObject({
      nativeSlot: 1,
      status: "working",
      remaining: 1,
    });
    expect(active.missionPrefix![0x2ff7]).toBe(2);
    expect(() => stepConstructionTerrainJobs(active, source, host)).toThrow(
      "shared79220",
    );
    const resumed = JSON.parse(JSON.stringify(active)) as ConstructionState,
      stopped = cancelConstruction(resumed, 0, source, host).state;
    expect(stopped.jobs[0].status).toBe("cancelled");
    expect(stopped.missionPrefix![0x2ff7]).toBe(1);
    expect(
      stopped.missionPrefix!.slice(0x1ec7 + 176 + 12, 0x1ec7 + 176 + 14),
    ).toEqual([255, 255]);
    expect(stopped.missionPrefix![0x1ec7 + 12]).toBe(1);
    expect(active.missionPrefix![0x2ff7]).toBe(2);
  });
  it("travels before BL100 setup, then terraforms, pays, animates, works, departs and recovers", () => {
    const source = rules(),
      host = context();
    let world = beginConstruction(
      state(),
      0,
      11,
      [10879, 10879],
      source,
      host,
    ).state;
    const original = structuredClone(world),
      phases = new Set<string>(),
      events: ConstructionEvent[] = [];
    world = tick(world, source, host).state;
    expect(world.actors[0].task?.phase).toBe("travel-site");
    expect(world.terrain.bytes).toEqual(original.terrain.bytes);
    expect(world.players[0].primary).toBe(100);
    for (let i = 0; i < 3000 && world.actors[0].status !== "idle"; i++) {
      if (world.actors[0].task) phases.add(world.actors[0].task!.phase);
      const result = tick(world, source, host);
      world = result.state;
      events.push(...result.events);
    }
    expect(world.actors[0].status).toBe("idle");
    expect(world.buildings).toHaveLength(1);
    expect(world.buildings[0]).toMatchObject({
      complete: true,
      health: 18,
      energy: 200,
      selector: 11,
    });
    expect(world.players[0]).toMatchObject({
      primary: 75,
      secondary: 30,
      ownedMask: 1 << 11,
    });
    expect(world.players[0].completed[11]).toBe(1);
    expect([...phases]).toEqual(
      expect.arrayContaining([
        "travel-site",
        "terraform",
        "approach",
        "placing",
        "to-work",
        "working",
        "departure",
      ]),
    );
    expect(
      events
        .filter((e) => e.type === "building-progress")
        .map((e) => e.increment),
    ).toEqual([1, 16, 16]);
    expect(
      events.some(
        (e) =>
          e.type === "building-completed" &&
          e.clearCreatureTargets &&
          e.refreshCapacity,
      ),
    ).toBe(true);
    expect(
      events
        .filter((e) => e.type === "rng")
        .slice(0, 3)
        .map((e) => e.journal),
    ).toEqual([0x21b, 0x78b, 0x7b2]);
    expect(events.some((e) => e.type === "message" && e.index === 17)).toBe(
      true,
    );
  });

  it.each([0, 1, 3, 6, 11])(
    "shares the complete construction machine for selector%i",
    (selector) => {
      const source = rules(),
        host = context();
      source.buildingHealth = Array(42).fill(7);
      let world = beginConstruction(
        state(),
        0,
        selector,
        [10367, 10367],
        source,
        host,
      ).state;
      for (let i = 0; i < 1800 && world.actors[0].status !== "idle"; i++)
        world = tick(world, source, host).state;
      expect(world.buildings[0]?.complete).toBe(true);
      expect(world.players[0].completed[selector]).toBe(1);
      expect(world.actors[0].status).toBe("idle");
    },
  );

  it("uses BL100 setup, so absent mineral does not invent initial Extractor rejection", () => {
    const source = rules(),
      host = context(),
      world = state();
    expect(constructionSiteClass(world, [10367, 10367], 1, 11, host)).toBe(
      "mineral",
    );
    expect(constructionSiteClass(world, [10367, 10367], 1, 100, host)).toBe(
      "valid",
    );
    let assigned = beginConstruction(
      world,
      0,
      11,
      [10367, 10367],
      source,
      host,
    ).state;
    assigned = stepConstruction(assigned, 0, source, host).state;
    expect(assigned.actors[0].task?.phase).toBe("terraform");
    expect(assigned.players[0].primary).toBe(100);
  });

  it("reserves and clears every footprint cell on insufficient actual post-arrival funds", () => {
    const source = rules(),
      host = context();
    source.buildingFootprints = Array(14).fill(3);
    let world = beginConstruction(
      state(),
      0,
      3,
      [10367, 10367],
      source,
      host,
    ).state;
    const baseline = world.players[0].primary;
    let reservation: number[] = [];
    for (let i = 0; i < 1000 && world.actors[0].task; i++) {
      if (world.actors[0].task?.phase === "approach") {
        world.players[0].primary = 0;
        world.players[0].secondary = 0;
      }
      reservation = world.actors[0].task?.reservation?.vertices ?? reservation;
      world = tick(world, source, host).state;
    }
    expect(baseline).toBe(100);
    expect(world.actors[0].status).toBe("cancelled");
    expect(world.players[0]).toMatchObject({ primary: 0, secondary: 0 });
    expect(world.buildings).toHaveLength(0);
    expect(reservation.length).toBe(16);
    expect(
      reservation.every((cell) => !(world.terrain.bytes[cell * 14 + 11] & 17)),
    ).toBe(true);
  });

  it("waits for actual action14 completion and retries null effect allocation", () => {
    const { world, source } = readyPhase("placing");
    world.actors[0].animation = {
      id: 14,
      frame: 2,
      hold: 0,
      direction: 1,
      delay: 0,
      counter: 1,
    };
    let calls = 0;
    const host = context({
      allocateBuilding: () => {
        calls++;
        return null;
      },
    });
    const first = stepConstruction(world, 0, source, host);
    expect(calls).toBe(0);
    expect(first.state.buildings).toHaveLength(0);
    first.state.frame++;
    first.state.actors[0].animation = {
      id: 14,
      frame: 3,
      hold: 0,
      direction: 1,
      delay: 0,
      counter: 0,
    };
    const waiting = stepConstruction(first.state, 0, source, host);
    expect(calls).toBe(1);
    expect(waiting.state.actors[0].task?.stage).toBe(4);
    expect(waiting.state.buildings).toHaveLength(0);
    const ping = context({ animation: () => ({ holds: [0, 0, 0], flags: 1 }) });
    waiting.state.frame++;
    waiting.state.actors[0].animation = {
      id: 14,
      frame: 0,
      hold: 0,
      direction: -1,
      delay: 0,
      counter: 255,
    };
    expect(
      stepConstruction(waiting.state, 0, source, ping).state.buildings,
    ).toHaveLength(1);
  });

  it("preserves animation signed counters, holds and ping-pong direction", () => {
    const a = {
      id: 14,
      frame: 1,
      hold: 2,
      direction: 1 as const,
      delay: 0,
      counter: 255,
    };
    const held = advanceConstructionAnimation(a, {
      holds: [0, 2, 0],
      flags: 1,
    });
    expect(held).toMatchObject({ frame: 1, hold: 1 });
    const bounce = advanceConstructionAnimation(
      { ...a, frame: 2, hold: 0 },
      { holds: [0, 2, 0], flags: 1 },
    );
    expect(bounce).toMatchObject({ frame: 1, direction: -1, hold: 2 });
    expect(a.counter).toBe(255);
  });

  it("uses parity RNG and signed skill timers rather than fixed build ticks", () => {
    const { world, source, host } = readyPhase("working");
    world.frame = 2;
    const even = stepConstruction(world, 0, source, host);
    expect(even.state.rng.draws).toBe(0);
    expect(even.state.actors[0].task?.timer).toBe(1);
    even.state.frame++;
    const odd = stepConstruction(even.state, 0, source, host);
    expect(odd.state.rng.draws).toBe(3); // parity plus two random work-point draws
    expect(
      odd.events.filter((e) => e.type === "rng").map((e) => e.journal),
    ).toEqual([0x833, 0x59c, 0x59d]);
    expect(odd.state.buildings[0].health).toBe(17);
  });

  it("repairs a rejected working destination without changing the source pending task point", () => {
    const { world, source } = readyPhase("working");
    world.frame = 2;
    world.actors[0].task!.timer = 1;
    const host = context({
      resolveTaskTarget: (_actor, requested) => [
        requested[0] + 64,
        requested[1],
      ],
      route: (_actor, goal) => [[...goal]],
    });
    const sampled = stepConstruction(world, 0, source, host).state;
    const task = sampled.actors[0].task!;
    expect(task.phase).toBe("to-work");
    expect(task.goal).toEqual([
      task.requestedGoal[0] + 64,
      task.requestedGoal[1],
    ]);
    expect(task.point).toEqual([10367, 10367]);
    expect(sampled.buildings[0].x).toBe(10367);
  });

  it("cancels active terraform, but retains buildings and site marks at stage5", () => {
    const source = rules(),
      host = context();
    let world = beginConstruction(
      state(),
      0,
      11,
      [10367, 10367],
      source,
      host,
    ).state;
    world = stepConstruction(world, 0, source, host).state;
    const cancelled = cancelConstruction(world, 0, source, host);
    expect(cancelled.state.jobs[0].status).toBe("cancelled");
    expect(
      cancelled.events.some(
        (e) => e.type === "audio" && e.channel === 0x29 && e.mode === 4,
      ),
    ).toBe(true);
    const work = readyPhase("working");
    const cell = cellIndex(40, 40);
    work.world.terrain.bytes[cell * 14 + 11] = 17;
    const after = cancelConstruction(
      work.world,
      0,
      work.source,
      work.host,
    ).state;
    expect(after.buildings[0].health).toBe(1);
    expect(after.players[0].primary).toBe(100);
    expect(after.terrain.bytes[cell * 14 + 11]).toBe(17);
  });

  it("preserves a neighboring reservation's shared protected vertex when cancelling", () => {
    const source = rules(),
      host = context();
    let world = beginConstruction(
      state(),
      0,
      11,
      [10367, 10367],
      source,
      host,
    ).state;
    world = stepConstruction(world, 0, source, host).state;
    const reservation = world.actors[0].task!.reservation!;
    const protectedVertex = cellIndex(41, 40),
      neighboringCell = cellIndex(41, 39);
    expect(reservation.vertices).toContain(protectedVertex);
    expect(reservation.cells).not.toContain(neighboringCell);
    world.terrain.bytes[neighboringCell * 14 + 11] |= 1;
    const after = cancelConstruction(world, 0, source, host).state;
    expect(after.terrain.bytes[protectedVertex * 14 + 11] & 16).toBe(16);
    expect(after.terrain.bytes[neighboringCell * 14 + 11] & 1).toBe(1);
  });

  it("rolls back late animation and allocator errors, including payment and terrain", () => {
    const { world, source } = readyPhase("approach");
    const before = structuredClone(world);
    expect(() =>
      stepConstruction(
        world,
        0,
        source,
        context({ animation: () => ({ holds: [], flags: 0 }) }),
      ),
    ).toThrow("profile");
    expect(world).toEqual(before);
    const place = readyPhase("placing");
    place.world.actors[0].animation.frame = 3;
    const saved = structuredClone(place.world);
    expect(() =>
      stepConstruction(
        place.world,
        0,
        place.source,
        context({
          allocateBuilding: () => ({ id: 20, slot: 65, effectId: 0 }),
        }),
      ),
    ).toThrow("partition");
    expect(place.world).toEqual(saved);
    const completing = readyPhase("working");
    completing.world.actors[0].task!.timer = 1;
    completing.world.buildings[0].health = 5;
    const priorCompletion = structuredClone(completing.world);
    expect(() =>
      stepConstruction(
        completing.world,
        0,
        completing.source,
        context({ animation: () => ({ holds: [], flags: 0 }) }),
      ),
    ).toThrow("profile");
    expect(completing.world).toEqual(priorCompletion);
    expect(() =>
      beginConstruction(state(), 0, 2, [10367, 10367], source, context()),
    ).toThrow("Unsupported");
  });

  it("survives JSON save/reload during every phase with identical RNG and outcomes", () => {
    const source = rules(),
      host = context();
    let world = beginConstruction(
      state(),
      0,
      0,
      [10367, 10367],
      source,
      host,
    ).state;
    const visited = new Set<string>();
    for (let i = 0; i < 2000 && world.actors[0].status !== "idle"; i++) {
      const phase = world.actors[0].task?.phase ?? world.actors[0].status;
      if (!visited.has(phase)) {
        const reloaded = JSON.parse(JSON.stringify(world)) as ConstructionState;
        expect(tick(reloaded, source, host)).toEqual(tick(world, source, host));
        visited.add(phase);
      }
      world = tick(world, source, host).state;
    }
    expect(visited.has("working")).toBe(true);
    expect(visited.has("departure")).toBe(true);
    expect(world.actors[0].status).toBe("idle");
  });

  it("guards eligibility, duplicate scheduling and invalid replayed task references", () => {
    const source = rules(),
      host = context(),
      world = state();
    source.buildingProgressThresholds = Array(42).fill(1);
    expect(constructionAvailable(world.players[0], 11, source)).toBe(false);
    world.players[0].progress = 255;
    expect(constructionAvailable(world.players[0], 11, source)).toBe(false);
    world.players[0].progress = 1;
    let assigned = beginConstruction(
      world,
      0,
      11,
      [10367, 10367],
      source,
      host,
    ).state;
    expect(() =>
      beginConstruction(assigned, 0, 11, [10367, 10367], source, host),
    ).toThrow("already");
    assigned = stepConstruction(assigned, 0, source, host).state;
    expect(() => stepConstruction(assigned, 0, source, host)).toThrow("twice");
    assigned = stepConstructionTerrainJobs(assigned, source, host).state;
    expect(() => stepConstructionTerrainJobs(assigned, source, host)).toThrow(
      "twice",
    );
    const broken = readyPhase("working");
    broken.world.actors[0].task!.buildingId = 99;
    expect(() =>
      stepConstruction(broken.world, 0, broken.source, broken.host),
    ).toThrow("reference");
    broken.world.actors[0].task!.phase = "invented" as "working";
    expect(() =>
      stepConstruction(broken.world, 0, broken.source, broken.host),
    ).toThrow("stage/phase");
  });

  it("preserves wrapping signed debit/refill arithmetic", () => {
    expect(constructionDebit(0x7fffffff, 1, 9, 0, false).paid).toBe(false);
    expect(constructionDebit(0, 0, 6, 8, false)).toEqual({
      paid: true,
      cost: -10,
      primary: 10,
      secondary: 0,
    });
    expect(constructionDebit(17, 0, 7, 0, true)).toEqual({
      paid: true,
      cost: 7,
      primary: 10,
      secondary: 1000,
    });
    expect(constructionDebit(3, 9, 7, 0, false)).toEqual({
      paid: true,
      cost: 7,
      primary: 0,
      secondary: 5,
    });
  });
});
