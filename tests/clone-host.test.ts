import { describe, expect, it } from "vitest";
import {
  cloneCampaignHostRoots,
  type CampaignHostRoots,
} from "../src/sim/campaign/clone-host";
import { createMotion } from "../src/sim/mechanics/motion";
import type { CampaignActor } from "../src/sim/campaign/bootstrap";
function fixture(): CampaignHostRoots {
  const point: [number, number] = [1024, 2048],
    route: [number, number][] = [point, [3072, 4096]],
    motion = createMotion(1024, 2048, 4096, 700),
    animation = {
      action: 8,
      hold: 1,
      frame: 2,
      direction: 1,
      delay: 3,
      counter: 1,
    },
    unresolved = { byte18: null, byte1b: 17 };
  const actor: CampaignActor = {
    id: 0,
    sourceId: "source:2:0",
    owner: 0,
    blueprintIndex: 0,
    art: "SYNTHETIC",
    motion,
    ready: true,
    goal: point,
    route,
    animation,
    idleTimer: 10,
    idleFacing: false,
    egressBuildingId: null,
    reason: "Constructing",
    orders: [
      { type: "construct", point, selector: 11 },
      { type: "move", point: [6000, 7000] },
    ],
  };
  const notice = {
    frame: 1,
    severity: "info" as const,
    text: "Synthetic",
    entityId: 0,
  };
  return {
    actors: [
      actor,
      {
        ...actor,
        id: 1,
        sourceId: "source:2:1",
        motion: { ...motion },
        goal: null,
        route: [],
        animation: { ...animation },
        orders: [],
      },
    ],
    builders: [
      {
        id: 0,
        owner: 0,
        style: 0,
        category: 0,
        skill: 60,
        enabled: true,
        motion,
        animation: {
          id: 13,
          frame: 2,
          hold: 1,
          direction: 1,
          delay: 3,
          counter: 1,
        },
        action: 13,
        facingFlip: false,
        status: "constructing",
        task: {
          selector: 11,
          stage: 1,
          phase: "terraform",
          point,
          requestedGoal: [512, 1024],
          goal: point,
          route,
          routeIndex: 0,
          reservation: {
            anchor: point,
            footprint: 1,
            cells: [129, 130],
            vertices: [257, 258],
            targetHeight: 4000,
          },
          jobId: 3,
          buildingId: null,
          paid: 100,
          timer: 7,
          delay: 2,
          lastFrame: 1,
        },
      },
    ],
    players: Array.from({ length: 4 }, (_, id) => ({
      id,
      raw: Array.from({ length: 1805 }, (_, i) => i & 255),
      blueprints: [
        {
          index: 0,
          name: "Synthetic",
          style: 0,
          category: 0,
          skill: 60,
          health: 70,
          maxHealth: 80,
          runtimeFlags: 1,
          unresolved,
        },
      ],
      funds: 1000,
      goop: 200,
      progress: 0,
      activationCount: 1,
      completed: [0, 0, 0, 0],
      owned: 0,
    })),
    notices: [notice, notice],
    audio: {
      nextSequence: 2,
      requests: [
        {
          sequence: 0,
          frame: 1,
          entity: "source:2:0",
          cue: 35,
          mode: 2,
          parameter: 0,
          range: null,
          gain: 1,
        },
        {
          type: "playback-rate",
          sequence: 1,
          frame: 2,
          entity: "source:2:0",
          cue: 35,
          ratePercent: 150,
        },
      ],
    },
  };
}
describe("typed mutable campaign host clone", () => {
  it("matches structuredClone values and its cross-root motion/point/array aliases", () => {
    const source = fixture(),
      actual = cloneCampaignHostRoots(source),
      expected = structuredClone(source);
    expect(actual).toEqual(expected);
    expect(actual.actors[0].motion).toBe(actual.builders[0].motion);
    expect(actual.actors[1].motion).not.toBe(actual.actors[0].motion);
    expect(actual.actors[0].goal).toBe(actual.actors[0].route[0]);
    expect(actual.actors[0].goal).toBe(actual.builders[0].task!.point);
    expect(actual.actors[0].goal).toBe(actual.builders[0].task!.goal);
    expect(actual.actors[0].goal).toBe(
      actual.builders[0].task!.reservation!.anchor,
    );
    expect(actual.actors[0].goal).toBe(actual.actors[0].orders[0].point);
    expect(actual.actors[0].route).toBe(actual.builders[0].task!.route);
    expect(actual.players[0].blueprints[0].unresolved).toBe(
      actual.players[3].blueprints[0].unresolved,
    );
    expect(actual.notices[0]).toBe(actual.notices[1]);
    expect(actual.actors[0].motion).not.toBe(source.actors[0].motion);
  });
  it("isolates all nested mutable branches and their changes from the original", () => {
    const source = fixture(),
      before = JSON.stringify(source),
      copy = cloneCampaignHostRoots(source),
      a = copy.actors[0],
      b = copy.builders[0],
      task = b.task!;
    a.motion.x = 999;
    a.animation.frame = 9;
    a.goal![0] = 999;
    a.route.push([1, 2]);
    a.orders[0].point[1] = 999;
    a.orders.push({ type: "move", point: [9, 9] });
    b.animation.frame = 8;
    task.requestedGoal[0] = 999;
    task.routeIndex = 3;
    task.reservation!.cells.push(9);
    task.reservation!.vertices[0] = 999;
    copy.players[0].raw[0] = 999;
    copy.players[0].completed[0] = 999;
    copy.players[0].blueprints[0].name = "Changed";
    copy.players[0].blueprints[0].unresolved.byte1b = 99;
    copy.notices[0].text = "Changed";
    copy.notices.push({
      frame: 8,
      severity: "warning",
      text: "New",
      entityId: null,
    });
    copy.audio.nextSequence++;
    copy.audio.requests[0].cue = 99;
    copy.audio.requests.push({ ...copy.audio.requests[0], sequence: 3 });
    expect(JSON.stringify(source)).toBe(before);
    expect(copy.builders[0].motion.x).toBe(999);
    expect(copy.actors[0].goal![0]).toBe(999);
  });
  it("preserves existing shared record identities without collapsing equal IDs or values", () => {
    const source = fixture();
    source.actors.push(source.actors[0]);
    source.builders.push(source.builders[0]);
    source.actors[1].id = source.actors[0].id;
    const copy = cloneCampaignHostRoots(source);
    expect(copy.actors[0]).toBe(copy.actors[2]);
    expect(copy.builders[0]).toBe(copy.builders[1]);
    expect(copy.actors[0]).not.toBe(copy.actors[1]);
    expect(copy.actors[0].motion).not.toBe(copy.actors[1].motion);
    expect(copy.actors[0].animation).not.toBe(source.actors[0].animation);
    expect(copy.builders[0].task!.reservation).not.toBe(
      source.builders[0].task!.reservation,
    );
  });
  it("preserves numeric-buffer aliases and separate buffers across players", () => {
    const source = fixture();
    source.players[1].raw = source.players[0].raw;
    source.players[2].completed = source.players[0].completed;
    const copy = cloneCampaignHostRoots(source);
    expect(copy.players[1].raw).toBe(copy.players[0].raw);
    expect(copy.players[2].completed).toBe(copy.players[0].completed);
    expect(copy.players[2].raw).not.toBe(copy.players[0].raw);
    copy.players[1].raw[1804] = 999;
    expect(copy.players[0].raw[1804]).toBe(999);
    expect(source.players[0].raw[1804]).not.toBe(999);
  });
  it("keeps optional audio fields, event variants and null idle fields exact", () => {
    const source = fixture();
    source.builders[0].task = null;
    source.actors[0].orders = [];
    const copy = cloneCampaignHostRoots(source);
    expect(copy).toEqual(structuredClone(source));
    expect(copy.builders[0].task).toBeNull();
    expect(copy.actors[1].goal).toBeNull();
    expect("type" in copy.audio.requests[0]).toBe(false);
    expect("initialRatePercent" in copy.audio.requests[0]).toBe(false);
    expect(copy.audio.requests[1]).toMatchObject({
      type: "playback-rate",
      ratePercent: 150,
    });
  });
  it("starts an independent memo each call and clones only its declared roots", () => {
    const source = {
        ...fixture(),
        terrain: { bytes: [1, 2, 3], revision: 0 },
        other: { immutable: true },
      },
      a = cloneCampaignHostRoots(source),
      b = cloneCampaignHostRoots(source);
    expect(Object.keys(a).sort()).toEqual([
      "actors",
      "audio",
      "builders",
      "notices",
      "players",
    ]);
    expect(a.actors[0].motion).not.toBe(b.actors[0].motion);
    expect(a.players[0].raw).not.toBe(b.players[0].raw);
    expect(source.terrain.bytes).toEqual([1, 2, 3]);
  });
});
