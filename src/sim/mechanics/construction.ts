/** Source construction stage semantics expressed as serializable host state.
 * Profiles and live environment queries are required inputs. See CONSTRUCTION.md. */
import { nextRandom, type GeneRng } from "./random";
import {
  beginTerraform,
  cellIndex,
  groundHeight,
  releaseSite,
  reserveSite,
  stepTerraform,
  torusDelta,
  type SiteReservation,
  type TerrainClimate,
  type TerrainState,
  type TerraformJob,
  MAP_BYTES,
} from "./terrain";
import {
  moveGoal,
  originalAngle,
  stepGroundMotion,
  wrap16,
  type MotionState,
  type MotionTables,
} from "./motion";
import {
  createLevelTerrainJob,
  CRATER_JOB_BASE,
  CRATER_JOB_COUNT,
} from "./crater";

export type ConstructionPoint = [number, number];
export type ConstructionSelector = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 11 | 13;
export interface ConstructionRules extends MotionTables {
  evidence: string;
  terrainBorder: readonly number[];
  constructionCosts: readonly number[];
  actorClassSpeeds: readonly number[];
  buildingHealth: readonly number[];
  buildingFootprints: readonly number[];
  buildingProgressThresholds: readonly number[];
  buildingPrerequisites: readonly number[];
}
export interface ConstructionAnimation {
  id: number;
  frame: number;
  hold: number;
  direction: 1 | -1;
  delay: number;
  counter: number;
}
export interface ConstructionAnimationProfile {
  holds: readonly number[];
  /** Original animation high flags byte; only bit0 (ping-pong) is admitted. */
  flags: number;
}
export interface ConstructionTask {
  selector: ConstructionSelector;
  stage: 0 | 1 | 3 | 4 | 5;
  phase:
    | "travel-site"
    | "site-center"
    | "terraform"
    | "approach"
    | "placing"
    | "to-work"
    | "working"
    | "departure";
  point: ConstructionPoint;
  /** Source pending task point;6FEC0 may repair goal without changing this. */
  requestedGoal: ConstructionPoint;
  goal: ConstructionPoint;
  route: ConstructionPoint[];
  routeIndex: number;
  reservation: SiteReservation | null;
  jobId: number | null;
  buildingId: number | null;
  paid: number | null;
  timer: number;
  delay: number;
  lastFrame: number | null;
}
export interface ConstructionActor {
  id: number;
  owner: number;
  style: number;
  category: number;
  /** Signed blueprint+17, not an unsigned UI percentage. */
  skill: number;
  enabled: boolean;
  motion: MotionState;
  animation: ConstructionAnimation;
  action: 13 | 14 | 15;
  facingFlip: boolean;
  status: "idle" | "constructing" | "cancelled";
  task: ConstructionTask | null;
}
export interface ConstructionPlayer {
  id: number;
  /** Signed source progress byte, or its unsigned serialized representation. */
  progress: number;
  primary: number;
  secondary: number;
  completed: number[];
  ownedMask: number;
}
export interface ConstructionBuilding {
  id: number;
  slot: number;
  owner: number;
  selector: ConstructionSelector;
  x: number;
  y: number;
  grade: 0;
  health: number;
  complete: boolean;
  energy: number;
}
export interface ConstructionState {
  frame: number;
  terrain: TerrainState;
  rng: GeneRng;
  actors: ConstructionActor[];
  players: ConstructionPlayer[];
  buildings: ConstructionBuilding[];
  jobs: TerraformJob[];
  nextJobId: number;
  /** Host increments frame and dispatches the terrain family once per frame. */
  terrainLastFrame: number | null;
  /** Campaign shared terrain-job native image. Standalone mechanic fixtures
   * may omit it and use their explicit isolated terrain harness. */
  missionPrefix?: number[];
}
export interface ConstructionBuildingRequest {
  code: 0x2c;
  owner: number;
  selector: ConstructionSelector;
  point: ConstructionPoint;
  height: number;
}
export interface ConstructionContext {
  climate: TerrainClimate;
  gravity: number;
  /** Source74A50 target search. Called twice by the placement command. */
  resolveTarget(
    actor: Readonly<ConstructionActor>,
    point: ConstructionPoint,
    state: Readonly<ConstructionState>,
  ): ConstructionPoint;
  /**6FEC0/74A50 working-target repair: mask1, actual plant/terrain admission,
   * and a nominated building only for the completed departure reference. */
  resolveTaskTarget(
    actor: Readonly<ConstructionActor>,
    point: ConstructionPoint,
    state: Readonly<ConstructionState>,
  ): ConstructionPoint;
  /** A routing policy is explicit. Final point must remain the requested goal. */
  route(
    actor: Readonly<ConstructionActor>,
    goal: ConstructionPoint,
    state: Readonly<ConstructionState>,
  ): ConstructionPoint[];
  blocked(
    cell: number,
    actor: Readonly<ConstructionActor>,
    state: Readonly<ConstructionState>,
    proposedPoint?: ConstructionPoint,
  ): boolean;
  /** Actual8B340 mask0 occupancy, not a broad all-entity collision test. */
  occupied(cell: number, state: Readonly<ConstructionState>): boolean;
  animation(
    actor: Readonly<ConstructionActor>,
    animation: number,
  ): ConstructionAnimationProfile;
  /** Resolve the resource-selected owner's flag; it is not necessarily actor.owner. */
  refill(
    actor: Readonly<ConstructionActor>,
    state: Readonly<ConstructionState>,
  ): boolean;
  /** Pure capacity/admission query for48790(code2C). Null retries at stage4.
   * Host commits the matching effect and intrusive links with the receipt. */
  allocateBuilding(
    request: Readonly<ConstructionBuildingRequest>,
    state: Readonly<ConstructionState>,
  ): { id: number; slot: number; effectId: number } | null;
}
export type ConstructionEvent =
  | {
      type: "audio";
      actorId: number;
      channel: number;
      mode: 2 | 4;
      parameter: number;
    }
  | { type: "message"; actorId: number; index: number }
  | { type: "rng"; actorId: number; journal: number; value: number }
  | {
      type: "motion";
      actorId: number;
      enteredCell: number | null;
      blocked: string | null;
    }
  | { type: "terrain"; cells: number[] }
  | {
      type: "building-created";
      buildingId: number;
      effectId: number;
      request: ConstructionBuildingRequest;
    }
  | {
      type: "building-progress";
      buildingId: number;
      increment: number;
      health: number;
    }
  | {
      type: "building-completed";
      buildingId: number;
      clearCreatureTargets: true;
      refreshCapacity: true;
    }
  | {
      type: "cancelled";
      actorId: number;
      reason: string;
      retainedBuildingId: number | null;
    }
  | { type: "idle-recovery"; actorId: number };
export interface ConstructionReceipt {
  state: ConstructionState;
  /** Host must apply these effects in the same transaction as state. */
  events: ConstructionEvent[];
}

const selectors: readonly number[] = [0, 1, 3, 6, 8, 11, 13];
const u8 = (value: number) => value & 255;
const s8 = (value: number) => (value << 24) >> 24;
function integer(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error("Invalid construction " + label);
}
function point(value: readonly number[]): void {
  if (value.length !== 2) throw new Error("Invalid construction point");
  value.forEach((n) => integer(n, 0, 32767, "point"));
}
function validate(
  state: ConstructionState,
  rules: ConstructionRules,
  context: ConstructionContext,
): void {
  if (!rules.evidence.trim())
    throw new Error("Construction source evidence required");
  for (const [array, size, min, max] of [
    [rules.terrainBorder, 8192, 0, 255],
    [rules.constructionCosts, 14, -0x80000000, 0x7fffffff],
    [rules.actorClassSpeeds, 4, -32768, 32767],
    [rules.buildingHealth, 42, 1, 32767],
    [rules.buildingFootprints, 14, 1, 3],
    [rules.buildingProgressThresholds, 42, 0, 255],
    [rules.buildingPrerequisites, 14, 0, 255],
    [rules.atan, 257, 0, 256],
    [rules.sine, 2048, -65536, 65536],
    [rules.cosine, 2048, -65536, 65536],
  ] as const) {
    if (
      array.length !== size ||
      array.some((n) => !Number.isInteger(n) || n < min || n > max)
    )
      throw new Error("Construction original rule table required");
  }
  if (state.terrain.bytes.length !== MAP_BYTES)
    throw new Error("Invalid construction map extent");
  integer(state.frame, 0, 0xffffffff, "frame");
  integer(state.nextJobId, 0, 0x7fffffff, "job sequence");
  integer(context.gravity, -32768, 32767, "gravity");
  for (const name of [
    "resolveTarget",
    "resolveTaskTarget",
    "route",
    "blocked",
    "occupied",
    "animation",
    "refill",
    "allocateBuilding",
  ] as const)
    if (typeof context[name] !== "function")
      throw new Error("Construction host context required: " + name);
  for (const player of state.players) {
    integer(player.id, 0, 3, "owner");
    integer(player.progress, -128, 255, "progress");
    integer(player.primary, -0x80000000, 0x7fffffff, "primary pool");
    integer(player.secondary, -0x80000000, 0x7fffffff, "secondary pool");
    if (player.completed.length !== 14)
      throw new Error("Construction completed counts required");
    player.completed.forEach((n) => integer(n, 0, 255, "completed count"));
    integer(player.ownedMask, 0, 65535, "owned mask");
  }
  for (const actor of state.actors) {
    integer(actor.id, 0, 19, "actor ID");
    integer(actor.owner, 0, 3, "actor owner");
    if (Math.floor(actor.id / 5) !== actor.owner)
      throw new Error("Construction actor partition mismatch");
    integer(actor.skill, -128, 127, "signed skill");
    if (!state.players.some((p) => p.id === actor.owner))
      throw new Error("Missing construction player");
    point([actor.motion.x, actor.motion.y]);
    if (actor.task) {
      if (!selectors.includes(actor.task.selector))
        throw new Error("Unsupported construction selector");
      point(actor.task.point);
      point(actor.task.requestedGoal);
      point(actor.task.goal);
      if (
        actor.task.route.length < 1 ||
        actor.task.routeIndex < 0 ||
        actor.task.routeIndex >= actor.task.route.length
      )
        throw new Error("Invalid saved construction route");
      actor.task.route.forEach(point);
      integer(actor.task.timer, -32768, 32767, "work timer");
      integer(actor.task.delay, -32768, 32767, "work delay");
      const stages: Record<ConstructionTask["phase"], number> = {
        "travel-site": 0,
        "site-center": 0,
        terraform: 1,
        approach: 3,
        placing: 4,
        "to-work": 5,
        working: 5,
        departure: 5,
      };
      if (stages[actor.task.phase] !== actor.task.stage)
        throw new Error("Invalid saved construction stage/phase");
    }
  }
  for (const list of [
    state.players,
    state.actors,
    state.buildings,
    state.jobs,
  ]) {
    if (new Set(list.map((item) => item.id)).size !== list.length)
      throw new Error("Duplicate construction identity");
  }
  if (
    new Set(state.buildings.map((b) => b.slot)).size !== state.buildings.length
  )
    throw new Error("Duplicate construction building slot");
}
function actorAt(state: ConstructionState, id: number): ConstructionActor {
  const actor = state.actors.find((a) => a.id === id);
  if (
    !actor ||
    !actor.enabled ||
    actor.category !== 0 ||
    actor.style < 0 ||
    actor.style > 2
  )
    throw new Error(
      "Enabled category0 engineer with admitted style0..2 required",
    );
  integer(actor.style, 0, 2, "engineer style");
  return actor;
}
function cloneState(before: ConstructionState): ConstructionState {
  // Array.slice preserves the numeric terrain bytes and is substantially less
  // expensive than a structured clone of every map cell on every callback.
  return {
    ...before,
    terrain: { ...before.terrain, bytes: before.terrain.bytes.slice() },
    rng: { ...before.rng },
    actors: structuredClone(before.actors),
    players: structuredClone(before.players),
    buildings: structuredClone(before.buildings),
    jobs: structuredClone(before.jobs),
    ...(before.missionPrefix
      ? { missionPrefix: before.missionPrefix.slice() }
      : {}),
  };
}
function playerAt(
  state: ConstructionState,
  actor: ConstructionActor,
): ConstructionPlayer {
  return state.players.find((p) => p.id === actor.owner)!;
}
function draw(
  state: ConstructionState,
  actor: ConstructionActor,
  journal: number,
  events: ConstructionEvent[],
): number {
  const value = nextRandom(state.rng);
  events.push({ type: "rng", actorId: actor.id, journal, value });
  return value;
}
function audio(
  events: ConstructionEvent[],
  actor: ConstructionActor,
  channel: number,
  mode: 2 | 4,
  parameter = 0,
): void {
  events.push({ type: "audio", actorId: actor.id, channel, mode, parameter });
}
function setGoal(
  state: ConstructionState,
  actor: ConstructionActor,
  goal: ConstructionPoint,
  rules: ConstructionRules,
  context: ConstructionContext,
): void {
  actor.task!.requestedGoal = [...goal];
  const resolved = context.resolveTaskTarget(actor, [...goal], state);
  point(resolved);
  routeTo(state, actor, resolved, rules, context);
}
function routeTo(
  state: ConstructionState,
  actor: ConstructionActor,
  goal: ConstructionPoint,
  rules: ConstructionRules,
  context: ConstructionContext,
): void {
  const task = actor.task!;
  point(goal);
  const route = context.route(actor, [...goal], state);
  if (!Array.isArray(route) || route.length < 1 || route.length > 16384)
    throw new Error("Construction route required");
  route.forEach(point);
  if (
    route[route.length - 1][0] !== goal[0] ||
    route[route.length - 1][1] !== goal[1]
  )
    throw new Error("Construction route changed destination");
  task.goal = [...goal];
  task.route = structuredClone(route);
  task.routeIndex = 0;
  actor.motion.desiredSpeed = rules.actorClassSpeeds[actor.style];
  moveGoal(actor.motion, task.route[0], rules);
}
/** Exact74E80 footprint window. Discriminator100 suppresses Extractor mineral
 * and selector5 tails during507D0's initial admission. */
export function constructionSiteClass(
  state: Readonly<ConstructionState>,
  position: ConstructionPoint,
  footprint: number,
  discriminator: number,
  context: ConstructionContext,
): "valid" | "blocked" | "water" | "occupied" | "mineral" {
  return classifyConstructionSite(
    state.terrain,
    position,
    footprint,
    discriminator,
    (cell) => context.occupied(cell, state),
  );
}
/**74E80 independent of modern construction projections. Native Engineer
 * callbacks supply their current mask0 occupancy query directly. */
export function classifyConstructionSite(
  terrain: TerrainState,
  position: ConstructionPoint,
  footprint: number,
  discriminator: number,
  occupied: (cell: number) => boolean,
): "valid" | "blocked" | "water" | "occupied" | "mineral" {
  if (![1, 2, 3].includes(footprint))
    throw new Error("Invalid construction footprint");
  const offset = footprint === 1 ? 1 : 2,
    size = footprint + 2;
  let mineral = false;
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      if (!col || !row) continue;
      const cell = cellIndex(
          (position[0] >> 8) - offset + col,
          (position[1] >> 8) - offset + row,
        ),
        at = cell * 14;
      if (col < size - 1 && row < size - 1) {
        mineral ||= terrain.bytes[at + 13] > 1;
        const material = terrain.bytes[at + 4];
        if (
          terrain.bytes[at + 11] & 1 ||
          (material >= 0x20 && material <= 0x22)
        )
          return "blocked";
        if (occupied(cell)) return "occupied";
      }
      if ((terrain.bytes[at + 5] & 7) <= 1) return "water";
    }
  return discriminator === 11 && !mineral ? "mineral" : "valid";
}
export function constructionAvailable(
  player: ConstructionPlayer,
  selector: number,
  rules: ConstructionRules,
): boolean {
  integer(selector, 0, 13, "selector");
  const threshold = rules.buildingProgressThresholds[selector * 3],
    dependency = rules.buildingPrerequisites[selector];
  if (s8(player.progress) < threshold || threshold >= 30) return false;
  if (dependency !== 255 && (dependency < 0 || dependency >= 14))
    throw new Error("Invalid construction prerequisite table");
  return (
    dependency === 255 ||
    player.completed[dependency] !== 0 ||
    !!(player.ownedMask & (1 << selector))
  );
}
/** Source wrapping two-pool debit, including negative costs and refill threshold. */
export function constructionDebit(
  primary: number,
  secondary: number,
  baseCost: number,
  skill: number,
  refill: boolean,
):
  | { paid: false; cost: number; primary: number; secondary: number }
  | { paid: true; cost: number; primary: number; secondary: number } {
  const cost = (baseCost - 2 * skill) | 0;
  if (((primary + secondary) | 0) < cost)
    return { paid: false, cost, primary, secondary };
  const remainder = (cost - primary) | 0;
  if (remainder <= 0) primary = -remainder | 0;
  else {
    secondary = (secondary - remainder) | 0;
    primary = 0;
  }
  if (refill && ((primary + secondary) | 0) <= 1000) secondary = 1000;
  return { paid: true, cost, primary, secondary };
}
function profile(value: ConstructionAnimationProfile): void {
  if (
    !value ||
    !value.holds.length ||
    value.holds.length > 255 ||
    value.flags & ~1 ||
    (value.flags & 1 && value.holds.length < 2) ||
    value.holds.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    throw new Error("Original construction animation profile required");
  integer(value.flags, 0, 1, "animation flags");
}
/** Exact byte-counter7AC00 sequencing; stage4 reads this state BEFORE advance. */
export function advanceConstructionAnimation(
  before: ConstructionAnimation,
  source: ConstructionAnimationProfile,
): ConstructionAnimation {
  profile(source);
  const a = { ...before },
    last = source.holds.length - 1;
  if (a.direction !== 1 && a.direction !== -1)
    throw new Error("Invalid construction animation direction");
  for (const value of [a.frame, a.hold, a.delay, a.counter])
    integer(value, 0, 255, "animation byte");
  a.frame = Math.min(a.frame, last);
  if (s8(a.counter) > s8(a.delay)) a.counter = a.delay;
  const counter = s8(a.counter);
  a.counter = u8(a.counter - 1);
  if (counter > 0) return a;
  a.counter = a.delay;
  a.hold = Math.min(a.hold, source.holds[a.frame]);
  const hold = a.hold;
  a.hold = u8(a.hold - 1);
  if (hold) return a;
  const target = a.frame + a.direction;
  if (target > last) {
    a.frame = source.flags & 1 ? last - 1 : 0;
    if (source.flags & 1) a.direction = -1;
  } else if (target < 0) {
    a.frame = source.flags & 1 ? 1 : last;
    if (source.flags & 1) a.direction = 1;
  } else a.frame = target;
  a.hold = source.holds[a.frame];
  return a;
}
function tail(actor: ConstructionActor, context: ConstructionContext): void {
  const phase = actor.task?.phase;
  const moving =
    phase === "travel-site" ||
    phase === "site-center" ||
    phase === "approach" ||
    phase === "to-work" ||
    phase === "departure";
  const id = moving
    ? ((((actor.motion.yaw >> 7) + 1) >> 1) + 1) & 7
    : actor.task
      ? actor.action
      : actor.status === "cancelled"
        ? actor.animation.id
        : 8;
  if (id !== actor.animation.id) {
    actor.animation.id = id;
    actor.animation.direction = 1;
    if (!moving) actor.animation.delay = 0;
  }
  if (moving)
    actor.animation.delay = u8(Math.trunc((1024 - actor.motion.speed) / 256));
  actor.animation = advanceConstructionAnimation(
    actor.animation,
    context.animation(actor, id),
  );
}
function stop(actor: ConstructionActor): void {
  actor.motion.desiredSpeed =
    actor.motion.speed =
    actor.motion.vx =
    actor.motion.vy =
    actor.motion.vz =
      0;
  actor.motion.fractionX = actor.motion.fractionY = 0;
}
/**51E80 releases only stages below5. Cancelling stage5 retains its incomplete
 * building and footprint; it does not demolish or refund it. */
function cancel(
  state: ConstructionState,
  actor: ConstructionActor,
  reason: string,
  rules: ConstructionRules,
  context: ConstructionContext,
  events: ConstructionEvent[],
): void {
  const task = actor.task;
  if (!task) throw new Error("No construction task to cancel");
  if (task.stage < 5 && task.reservation) {
    releaseSite(
      state.terrain,
      task.reservation,
      context.climate,
      rules.terrainBorder,
    );
    state.terrain.revision++;
    events.push({ type: "terrain", cells: [...task.reservation.vertices] });
  }
  if (task.jobId !== null) {
    const job = state.jobs.find((j) => j.id === task.jobId);
    if (job?.status === "working") {
      if (state.missionPrefix) {
        if (job.nativeSlot === undefined || task.stage < 1 || task.stage > 2)
          throw new Error(
            "Invalid source construction terrain cancellation binding",
          );
        const at = CRATER_JOB_BASE + job.nativeSlot * 176 + 12,
          remaining =
            ((state.missionPrefix[at] | (state.missionPrefix[at + 1] << 8)) <<
              16) >>
            16;
        if (remaining < 0 || state.missionPrefix[CRATER_JOB_COUNT] === 0)
          throw new Error("Construction terrain job was already retired");
        state.missionPrefix[at] = state.missionPrefix[at + 1] = 255;
        state.missionPrefix[CRATER_JOB_COUNT]--;
      }
      job.status = "cancelled";
      audio(events, actor, 0x29, 4);
    }
  }
  events.push({
    type: "cancelled",
    actorId: actor.id,
    reason,
    retainedBuildingId: task.buildingId,
  });
  actor.task = null;
  actor.status = "cancelled";
  stop(actor);
}
export function beginConstruction(
  before: ConstructionState,
  actorId: number,
  selector: number,
  requested: ConstructionPoint,
  rules: ConstructionRules,
  context: ConstructionContext,
): ConstructionReceipt {
  validate(before, rules, context);
  point(requested);
  if (!selectors.includes(selector))
    throw new Error("Unsupported construction selector");
  const state = cloneState(before),
    actor = actorAt(state, actorId),
    events: ConstructionEvent[] = [];
  if (actor.task || actor.status !== "idle")
    throw new Error("Engineer already has a task");
  if (!constructionAvailable(playerAt(state, actor), selector, rules))
    throw new Error("Construction is unavailable");
  if (actor.skill >> 2 <= 0)
    throw new Error("Engineer skill cannot perform source terrain work");
  const footprint = rules.buildingFootprints[selector];
  const aligned = requested.map(
    (n) => (n & 0x7f00) | (footprint === 2 ? 0 : 127),
  ) as ConstructionPoint;
  const first = context.resolveTarget(actor, aligned, state);
  point(first);
  const second = context.resolveTarget(actor, first, state);
  point(second);
  actor.task = {
    selector: selector as ConstructionSelector,
    stage: 0,
    phase: "travel-site",
    point: [...second],
    requestedGoal: [...second],
    goal: [...second],
    route: [[...second]],
    routeIndex: 0,
    reservation: null,
    jobId: null,
    buildingId: null,
    paid: null,
    timer: 0,
    delay: 0,
    lastFrame: null,
  };
  actor.status = "constructing";
  actor.action = 13;
  setGoal(state, actor, second, rules, context);
  return { state, events };
}
export function cancelConstruction(
  before: ConstructionState,
  actorId: number,
  rules: ConstructionRules,
  context: ConstructionContext,
  reason = "command",
): ConstructionReceipt {
  validate(before, rules, context);
  const state = cloneState(before),
    actor = actorAt(state, actorId),
    events: ConstructionEvent[] = [];
  cancel(state, actor, reason, rules, context, events);
  tail(actor, context); // Late resource failure must roll back cleanup as well.
  return { state, events };
}
function move(
  state: ConstructionState,
  actor: ConstructionActor,
  rules: ConstructionRules,
  context: ConstructionContext,
  events: ConstructionEvent[],
): boolean {
  const task = actor.task!;
  const repaired = context.resolveTaskTarget(actor, [...task.goal], state);
  point(repaired);
  if (repaired[0] !== task.goal[0] || repaired[1] !== task.goal[1])
    routeTo(state, actor, repaired, rules, context);
  const target = task.route[task.routeIndex];
  actor.motion.desiredSpeed = rules.actorClassSpeeds[actor.style];
  const result = stepGroundMotion(
    actor.motion,
    target,
    state.terrain,
    rules,
    context.gravity,
    (cell, proposedPoint) => context.blocked(cell, actor, state, proposedPoint),
  );
  events.push({
    type: "motion",
    actorId: actor.id,
    enteredCell: result.enteredCell,
    blocked: result.blocked,
  });
  if (!result.arrived) return false;
  if (task.routeIndex + 1 < task.route.length) {
    task.routeIndex++;
    moveGoal(actor.motion, task.route[task.routeIndex], rules);
    return false;
  }
  stop(actor);
  return true;
}
function buildingAt(
  state: ConstructionState,
  actor: ConstructionActor,
): ConstructionBuilding {
  const task = actor.task!,
    building = state.buildings.find((b) => b.id === task.buildingId);
  if (
    !building ||
    building.owner !== actor.owner ||
    building.selector !== task.selector ||
    building.grade !== 0
  )
    throw new Error("Construction building reference mismatch");
  return building;
}
function progress(
  state: ConstructionState,
  actor: ConstructionActor,
  building: ConstructionBuilding,
  increment: number,
  rules: ConstructionRules,
  events: ConstructionEvent[],
): void {
  const maximum = rules.buildingHealth[building.selector * 3];
  if (building.complete || building.health < 0 || building.health >= maximum)
    throw new Error("Invalid incomplete construction building");
  building.health = wrap16(building.health + increment);
  const completed = building.health >= maximum;
  if (completed) building.health = maximum;
  events.push({
    type: "building-progress",
    buildingId: building.id,
    increment,
    health: building.health,
  });
  if (completed) {
    building.complete = true;
    building.energy = 200;
    const player = playerAt(state, actor);
    player.completed[building.selector] = u8(
      player.completed[building.selector] + 1,
    );
    player.ownedMask |= 1 << building.selector;
    events.push({
      type: "building-completed",
      buildingId: building.id,
      clearCreatureTargets: true,
      refreshCapacity: true,
    });
    if (building.selector !== 6) audio(events, actor, 0x4d, 2);
  }
}
function setup(
  state: ConstructionState,
  actor: ConstructionActor,
  rules: ConstructionRules,
  context: ConstructionContext,
  events: ConstructionEvent[],
): void {
  const task = actor.task!,
    position: ConstructionPoint = [actor.motion.x, actor.motion.y];
  const footprint = rules.buildingFootprints[task.selector];
  const classification = constructionSiteClass(
    state,
    position,
    footprint,
    100,
    context,
  );
  if (classification !== "valid") {
    events.push({
      type: "message",
      actorId: actor.id,
      index:
        classification === "water"
          ? 13
          : classification === "occupied"
            ? 14
            : 12,
    });
    cancel(state, actor, "site-" + classification, rules, context, events);
    return;
  }
  task.point = position.map(
    (n) => (n & 0x7f00) | (footprint === 2 ? 0 : 127),
  ) as ConstructionPoint;
  task.reservation = reserveSite(
    state.terrain,
    task.point,
    footprint,
    rules.terrainBorder,
  );
  events.push({ type: "terrain", cells: [...task.reservation.vertices] });
  events.push({ type: "message", actorId: actor.id, index: 15 });
  task.phase = "site-center";
  setGoal(
    state,
    actor,
    [(position[0] & 0x7f00) | 127, (position[1] & 0x7f00) | 127],
    rules,
    context,
  );
}
function startTerraform(
  state: ConstructionState,
  actor: ConstructionActor,
  events: ConstructionEvent[],
): void {
  const task = actor.task!;
  if (!task.reservation) throw new Error("Construction reservation missing");
  let job: TerraformJob | null;
  if (state.missionPrefix) {
    const allocation = createLevelTerrainJob(
      state as ConstructionState & { missionPrefix: number[] },
      task.point,
      task.reservation.footprint,
      task.reservation.targetHeight,
      actor.skill >> 2,
    );
    job = allocation
      ? {
          id: state.nextJobId,
          nativeSlot: allocation.slot,
          owner: actor.owner,
          reservation: structuredClone(task.reservation),
          step: actor.skill >> 2,
          remaining: allocation.remaining,
          status: "working",
        }
      : null;
  } else
    job = beginTerraform(
      state.nextJobId,
      actor.owner,
      task.reservation,
      actor.skill,
      state.jobs,
      state.terrain,
    );
  if (!job) return; // Real bounded pool exhaustion retries, without payment or fake completion.
  state.nextJobId++;
  state.jobs.push(job);
  task.jobId = job.id;
  task.stage = 1;
  task.phase = "terraform";
  actor.action = 13;
  audio(events, actor, 0x29, 2, 255);
}
export function stepConstruction(
  before: ConstructionState,
  actorId: number,
  rules: ConstructionRules,
  context: ConstructionContext,
): ConstructionReceipt {
  validate(before, rules, context);
  const state = cloneState(before),
    actor = actorAt(state, actorId),
    events: ConstructionEvent[] = [];
  if (!actor.task) {
    if (actor.status === "cancelled") {
      actor.status = "idle";
      actor.facingFlip = draw(state, actor, 0x21b, events) % 4 < 2;
      actor.animation = {
        id: 8,
        frame: 0,
        hold: 0,
        direction: 1,
        delay: 16,
        counter: actor.animation.counter,
      };
      events.push({ type: "idle-recovery", actorId });
      tail(actor, context);
    }
    return { state, events };
  }
  const task = actor.task;
  if (task.lastFrame === state.frame)
    throw new Error("Construction actor dispatched twice in one frame");
  task.lastFrame = state.frame;
  if (task.phase === "travel-site") {
    if (move(state, actor, rules, context, events)) {
      // Actual queued state8 arrival -> pending507D0 consumes journal21B.
      actor.facingFlip = draw(state, actor, 0x21b, events) % 4 < 2;
      setup(state, actor, rules, context, events);
      if (
        actor.task &&
        actor.motion.x === actor.task.goal[0] &&
        actor.motion.y === actor.task.goal[1]
      )
        startTerraform(state, actor, events);
    }
  } else if (task.phase === "site-center") {
    if (move(state, actor, rules, context, events))
      startTerraform(state, actor, events);
  } else if (task.phase === "terraform") {
    const job = state.jobs.find((j) => j.id === task.jobId);
    if (!job || job.status === "cancelled")
      throw new Error("Construction terraform job missing or abandoned");
    const dx = torusDelta(task.goal[0], actor.motion.x),
      dy = torusDelta(task.goal[1], actor.motion.y),
      dz =
        (groundHeight(state.terrain, ...task.goal) - actor.motion.ground) >> 3;
    if (
      (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0 >=
      65536
    ) {
      cancel(state, actor, "terrain-worker-too-far", rules, context, events);
    } else if (job.status === "complete") {
      if (draw(state, actor, 0x78b, events) % 10 < 5)
        events.push({ type: "message", actorId, index: 16 });
      const sign = draw(state, actor, 0x7b2, events) % 10 < 5 ? -1 : 1;
      task.stage = 3;
      task.phase = "approach";
      setGoal(
        state,
        actor,
        [
          (task.point[0] + sign * 256) & 32767,
          (task.point[1] - sign * 256) & 32767,
        ],
        rules,
        context,
      );
      audio(events, actor, 0x29, 4);
    } else if (actor.animation.frame === 2 && actor.animation.hold === 0)
      audio(events, actor, 0x60, 2);
  } else if (task.phase === "approach") {
    if (move(state, actor, rules, context, events)) {
      const player = playerAt(state, actor),
        debit = constructionDebit(
          player.primary,
          player.secondary,
          rules.constructionCosts[task.selector],
          actor.skill,
          context.refill(actor, state),
        );
      if (!debit.paid)
        cancel(state, actor, "insufficient-funds", rules, context, events);
      else {
        player.primary = debit.primary;
        player.secondary = debit.secondary;
        task.paid = debit.cost;
        task.stage = 4;
        task.phase = "placing";
        actor.action = 14;
        const yaw = originalAngle(
          wrap16((task.point[0] - actor.motion.x) * 2),
          wrap16((task.point[1] - actor.motion.y) * 2),
          rules.atan,
        );
        actor.facingFlip = !(yaw >= 0x300 && yaw < 0x700);
        actor.animation.frame = 0;
        actor.animation.delay = 0;
        actor.animation.direction = 1;
      }
    }
  } else if (task.phase === "placing") {
    const source = context.animation(actor, 14);
    profile(source);
    const a = actor.animation;
    if (a.id !== 14 || a.frame >= source.holds.length)
      throw new Error("Construction action14 state mismatch");
    const finished =
      a.hold === 0 &&
      (source.flags & 1
        ? a.frame === 0
        : a.counter === 0 && a.frame === source.holds.length - 1);
    if (finished) {
      const request: ConstructionBuildingRequest = {
        code: 0x2c,
        owner: actor.owner,
        selector: task.selector,
        point: [...task.point],
        height: groundHeight(state.terrain, ...task.point),
      };
      const allocation = context.allocateBuilding(request, state);
      if (allocation) {
        integer(allocation.id, 0, 0x7fffffff, "building ID");
        integer(allocation.effectId, 0, 199, "effect slot");
        integer(
          allocation.slot,
          actor.owner * 64,
          actor.owner * 64 + 63,
          "building partition slot",
        );
        if (
          state.buildings.some(
            (b) => b.id === allocation.id || b.slot === allocation.slot,
          )
        )
          throw new Error("Construction allocator returned occupied identity");
        const building: ConstructionBuilding = {
          id: allocation.id,
          slot: allocation.slot,
          owner: actor.owner,
          selector: task.selector,
          x: task.point[0],
          y: task.point[1],
          grade: 0,
          health: 0,
          complete: false,
          energy: 0,
        };
        state.buildings.push(building);
        task.buildingId = building.id;
        events.push({
          type: "building-created",
          buildingId: building.id,
          effectId: allocation.effectId,
          request,
        });
        progress(state, actor, building, 1, rules, events);
        task.stage = 5;
        task.phase = "to-work";
        actor.action = 15;
        setGoal(state, actor, [building.x, building.y], rules, context);
      }
    }
  } else if (task.phase === "to-work") {
    if (move(state, actor, rules, context, events)) {
      const building = buildingAt(state, actor);
      if (building.complete)
        throw new Error("Completed building requires departure continuation");
      task.delay = task.timer = wrap16(110 - actor.skill);
      task.phase = "working";
      const yaw = originalAngle(
        wrap16((building.x - actor.motion.x) * 2),
        wrap16((building.y - actor.motion.y) * 2),
        rules.atan,
      );
      actor.facingFlip = yaw >= 0x300 && yaw <= 0x700;
      audio(events, actor, 0x4a, 2);
    }
  } else if (task.phase === "working") {
    const building = buildingAt(state, actor);
    task.timer = wrap16(task.timer - 1);
    if (
      ((state.frame + actor.id) & 1) !== 0 &&
      draw(state, actor, 0x833, events) % 10 < 1
    )
      audio(events, actor, 0x4a, 2);
    if (task.timer === 0) {
      progress(state, actor, building, wrap16(actor.skill * 2), rules, events);
      if (building.complete) {
        task.phase = "departure";
        setGoal(
          state,
          actor,
          [(building.x + 384) & 32767, (building.y + 384) & 32767],
          rules,
          context,
        );
      } else {
        const angle = draw(state, actor, 0x59c, events) * 8,
          radius = draw(state, actor, 0x59d, events),
          index = (angle - 512) & 2047;
        const delta = [
          Math.imul(rules.cosine[index], radius * 2) >> 16,
          Math.imul(rules.sine[index], radius * 2) >> 16,
        ];
        const goal = [building.x, building.y].map(
          (n, i) => (wrap16(wrap16(n * 2) + delta[i]) >> 1) & 32767,
        ) as ConstructionPoint;
        task.timer = task.delay;
        task.phase = "to-work";
        setGoal(state, actor, goal, rules, context);
      }
    }
  } else if (task.phase === "departure") {
    if (move(state, actor, rules, context, events)) {
      const building = buildingAt(state, actor);
      if (
        !building.complete ||
        building.health !== rules.buildingHealth[building.selector * 3]
      )
        throw new Error("Construction completion state mismatch");
      events.push({ type: "message", actorId, index: 17 });
      cancel(state, actor, "finished", rules, context, events);
    }
  }
  tail(actor, context);
  return { state, events };
}
/** Terrain family scheduling is separate from actor callbacks. It must run once
 * at the original family position, preserving the shared RNG ordering. */
export function stepConstructionTerrainJobs(
  before: ConstructionState,
  rules: ConstructionRules,
  context: ConstructionContext,
): ConstructionReceipt {
  validate(before, rules, context);
  if (before.missionPrefix)
    throw new Error(
      "Campaign terrain jobs require the shared79220 native pass",
    );
  if (before.terrainLastFrame === before.frame)
    throw new Error(
      "Construction terrain family dispatched twice in one frame",
    );
  const state = cloneState(before),
    events: ConstructionEvent[] = [];
  state.terrainLastFrame = state.frame;
  for (const job of state.jobs)
    if (job.status === "working") {
      const changed = stepTerraform(
        state.terrain,
        job,
        state.rng,
        context.climate,
        rules.terrainBorder,
      );
      if (changed.length) events.push({ type: "terrain", cells: changed });
    }
  return { state, events };
}
