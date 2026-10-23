import type { Mission } from "../content/types";
import {
  CommandSchema,
  ENGINE_VERSION,
  type Command,
  type World,
} from "./schema";

// Supported values from research/campaign/mission-001-contract.json.
export const BUILDINGS = {
  11: {
    name: "Extractor",
    cost: 650,
    hp: 280,
    requires: null,
    footprint: 3,
    art: "BMINE",
  },
  3: {
    name: "First Stage Distributor",
    cost: 400,
    hp: 240,
    requires: 11,
    footprint: 3,
    art: "BPOWE",
  },
  6: {
    name: "Photon Processor",
    cost: 250,
    hp: 80,
    requires: 3,
    footprint: 1,
    art: "BSOLA",
  },
} as const;
export type Selector = keyof typeof BUILDINGS;
export const DEVELOPMENT_BUILD_TICKS = 30; // explicit workbench policy; not original timing
export function createWorld(
  mission: Mission,
  contentHash: string,
  synthetic = false,
): World {
  if (mission.id !== 1)
    throw new Error(
      "Only the Exceland construction workbench is integrated; later missions are inspection-only",
    );
  const x = Math.min(125, mission.target[0] >> 8),
    y = Math.min(125, mission.target[1] >> 8);
  return {
    engineVersion: ENGINE_VERSION,
    contentHash,
    missionId: mission.id,
    mode: synthetic ? "synthetic" : "construction-workbench",
    tick: 0,
    nextId: 3,
    nextSequence: 0,
    seed: (mission.sourceSeed ?? 1) & 0x7fffffff,
    status: "active",
    goop: 2000,
    completed: {},
    ownedSelectors: [],
    pending: [],
    specialists: [
      {
        id: 1,
        owner: 0,
        role: "Engineer",
        x,
        y,
        skill: 0,
        orders: [],
        route: [],
        reason: "Select a construction site",
      },
      {
        id: 2,
        owner: 0,
        role: "Geneticist",
        x: x + 1,
        y,
        skill: 0,
        orders: [],
        route: [],
        reason: "Research behavior is not integrated",
      },
    ],
    buildings: [],
    blocked: [],
    alerts: [],
  };
}
export function alert(
  w: World,
  cause: string,
  x = 0,
  y = 0,
  severity: "info" | "warning" | "critical" = "info",
  subject = "Command",
): void {
  const old = w.alerts.find(
    (a) => a.cause === cause && a.subject === subject && w.tick - a.tick < 100,
  );
  if (old) {
    old.count++;
    old.tick = w.tick;
    return;
  }
  w.alerts.push({ tick: w.tick, severity, cause, subject, count: 1, x, y });
  if (w.alerts.length > 50) w.alerts.shift();
}
export function queue(w: World, input: unknown): Command {
  const c = CommandSchema.parse(input);
  if (
    c.tick < w.tick ||
    c.sequence !== w.nextSequence ||
    w.pending.some((p) => p.sequence === c.sequence)
  )
    throw new Error("Stale tick or invalid command sequence");
  if (w.pending.length >= 10000) throw new Error("Command queue full");
  w.pending.push(c);
  w.nextSequence++;
  return c;
}
export function available(w: World, selector: Selector): string | null {
  const required = BUILDINGS[selector].requires;
  return required !== null &&
    !w.completed[required] &&
    !w.ownedSelectors.includes(selector)
    ? `Requires completed ${BUILDINGS[required].name}`
    : null;
}
function footprint(x: number, y: number, size: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) out.push((y + dy) * 128 + x + dx);
  return out;
}
export function placementReason(
  w: World,
  s: Selector,
  x: number,
  y: number,
): string | null {
  const size = BUILDINGS[s].footprint;
  if (x < 0 || y < 0 || x + size > 128 || y + size > 128)
    return "Site extends beyond map";
  const occupied = new Set(
    w.buildings.flatMap((b) =>
      footprint(b.x, b.y, BUILDINGS[b.selector].footprint),
    ),
  );
  if (footprint(x, y, size).some((i) => occupied.has(i)))
    return "Destination occupied";
  if (footprint(x, y, size).some((i) => w.blocked.includes(i)))
    return "Terrain unsuitable";
  return null;
}
/** Stable four-neighbor BFS; avoids permanent retries on unreachable targets.
 * Original movement/terrain admission remains a separate unresolved contract.
 */
export function route(
  w: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): [number, number][] | null {
  if (sx === tx && sy === ty) return [];
  const blocked = new Set([
    ...w.blocked,
    ...w.buildings.flatMap((b) =>
      footprint(b.x, b.y, BUILDINGS[b.selector].footprint),
    ),
  ]);
  const start = sy * 128 + sx,
    target = ty * 128 + tx;
  if (blocked.has(target)) return null;
  const prev = new Int32Array(16384).fill(-1),
    open = [start];
  prev[start] = start;
  for (let head = 0; head < open.length; head++) {
    const p = open[head],
      x = p % 128,
      y = p >> 7;
    for (const [nx, ny] of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ]) {
      const n = ny * 128 + nx;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= 128 ||
        ny >= 128 ||
        blocked.has(n) ||
        prev[n] !== -1
      )
        continue;
      prev[n] = p;
      if (n === target) {
        const path: [number, number][] = [];
        for (let at = n; at !== start; at = prev[at])
          path.push([at % 128, at >> 7]);
        return path.reverse();
      }
      open.push(n);
    }
  }
  return null;
}
function apply(w: World, c: Command): void {
  if (w.status !== "active") {
    alert(w, "Construction workbench already complete");
    return;
  }
  const ids = c.type === "move" ? c.actorIds : [c.actorId];
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const a = w.specialists.find((a) => a.id === id && a.owner === c.playerId);
    if (!a) {
      alert(w, "Specialist unavailable");
      continue;
    }
    if (c.type === "construct" && a.role !== "Engineer") {
      alert(w, "Waiting for an Engineer", c.x, c.y, "warning");
      continue;
    }
    if (
      !c.queued &&
      a.orders.some((o) => o.type === "construct" && o.buildingId !== null)
    ) {
      alert(
        w,
        "Finish active construction before replacing orders",
        a.x,
        a.y,
        "warning",
      );
      continue;
    }
    if (c.queued && a.orders.length >= 32) {
      alert(w, "Production queue full", a.x, a.y, "warning");
      continue;
    }
    const order =
      c.type === "move"
        ? { type: "move" as const, x: c.x, y: c.y }
        : {
            type: "construct" as const,
            x: c.x,
            y: c.y,
            selector: c.selector,
            buildingId: null,
          };
    if (!c.queued) {
      a.orders = [];
      a.route = [];
    }
    a.orders.push(order);
    a.reason = "Order queued";
    alert(w, "Order acknowledged", c.x, c.y);
  }
}
export function step(w: World): void {
  const due = w.pending
    .filter((c) => c.tick === w.tick)
    .sort((a, b) => a.playerId - b.playerId || a.sequence - b.sequence);
  w.pending = w.pending.filter((c) => c.tick > w.tick);
  for (const c of due) apply(w, c);
  for (const a of w.specialists) {
    const order = a.orders[0];
    if (!order) continue;
    if (order.type === "move") {
      if (!a.route.length) {
        const found = route(w, a.x, a.y, order.x, order.y);
        if (found === null) {
          a.reason = "No valid route";
          alert(w, a.reason, order.x, order.y, "warning", a.role);
          a.orders.shift();
          continue;
        }
        a.route = found;
      }
      const next = a.route.shift();
      if (next) {
        a.x = next[0];
        a.y = next[1];
        a.reason = "Moving to destination";
      }
      if (!a.route.length) {
        a.orders.shift();
        a.reason = "Destination reached";
      }
    } else if (order.buildingId === null) {
      const spec = BUILDINGS[order.selector],
        cost = spec.cost - 2 * a.skill;
      const reason =
        available(w, order.selector) ||
        placementReason(w, order.selector, order.x, order.y) ||
        (w.goop < cost ? "Insufficient GOOP" : null);
      if (reason) {
        a.reason = reason;
        alert(w, reason, order.x, order.y, "warning", spec.name);
        a.orders.shift();
        continue;
      }
      // Site travel/terraform/power callbacks are not pretended here. This
      // workbench only integrates supported costs, availability and counts.
      const id = w.nextId++;
      w.goop -= cost;
      order.buildingId = id;
      w.buildings.push({
        id,
        selector: order.selector,
        x: order.x,
        y: order.y,
        remaining: DEVELOPMENT_BUILD_TICKS,
        hp: spec.hp,
        complete: false,
        reason: "Development construction schedule",
      });
      a.reason = `Constructing ${spec.name}`;
    } else {
      const b = w.buildings.find((b) => b.id === order.buildingId)!;
      if (--b.remaining === 0) {
        b.complete = true;
        b.reason = "Running callbacks not integrated";
        w.completed[b.selector] = (w.completed[b.selector] || 0) + 1;
        if (!w.ownedSelectors.includes(b.selector))
          w.ownedSelectors.push(b.selector);
        a.orders.shift();
        a.reason = "Construction complete";
        alert(
          w,
          `${BUILDINGS[b.selector].name} complete`,
          b.x,
          b.y,
          "info",
          "Construction",
        );
      }
    }
  }
  if ((w.completed[6] || 0) >= 3 && w.status === "active") {
    w.status = "workbench-complete";
    alert(
      w,
      "Exceland construction predicate satisfied; full mission acceptance pending",
      81,
      53,
    );
  }
  w.tick++;
}
