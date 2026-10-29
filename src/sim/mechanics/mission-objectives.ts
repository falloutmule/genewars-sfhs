/** Independently expressed source72ED0 predicates. Objective scans do not
 * advance campaign progress or execute result views. Timed landings require
 * an explicit transactional host service. */
export const OBJECTIVE_PLAYER_BYTES = 1805;
export const OBJECTIVE_PREFIX_BYTES = 0x355e;
export type ObjectiveResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; subject?: number };
export interface MissionObjectiveContext {
  flags: number;
  mode: number;
  active: number;
  selected: number;
  frame: number;
  missionCounter: number;
  targetCount: number;
  missionLimit: number;
  missionTimer: number;
  terrainCount: number;
  terrainLimit: number;
  field34b9: number;
}
export type ObjectiveRuntimeContext = Pick<
  MissionObjectiveContext,
  "flags" | "mode" | "active" | "selected" | "frame"
>;
export interface ObjectiveScan {
  players: number[][];
  winner: number | null;
  survivors: number;
  lastSurvivor: number | null;
  capabilityQueries: number[];
  alreadyTerminal: boolean;
}
export type MissionObjectiveOutcome =
  | { kind: "running" }
  | { kind: "won"; player: number }
  | { kind: "lost"; player: number; winner: number | null };
export interface MissionObjectivePlan {
  scan: ObjectiveScan;
  flagsBefore: number;
  flagsAfter: number;
  outcome: MissionObjectiveOutcome;
  resultRequest: "victory-185DFC" | null;
}
export type CapabilityQuery = (
  player: number,
  record: readonly number[],
) => ObjectiveResult<boolean>;

/** Host owns a transaction across this call and the remaining objective scan.
 * Capacity failure is a successful service with unchanged player references. */
export type DeferredLandingService = (
  selected: number,
  players: readonly (readonly number[])[],
) => ObjectiveResult<number[][]>;

const integer = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;
const bytes = (r: readonly number[], length: number) =>
  Array.isArray(r) && r.length === length && r.every((n) => integer(n, 0, 255));
const i8 = (n: number) => (n << 24) >> 24;
const u16 = (r: readonly number[], at: number) => r[at] | (r[at + 1] << 8);
const i16 = (r: readonly number[], at: number) => (u16(r, at) << 16) >> 16;
const u32 = (r: readonly number[], at: number) =>
  (r[at] | (r[at + 1] << 8) | (r[at + 2] << 16) | (r[at + 3] << 24)) >>> 0;
const i32 = (r: readonly number[], at: number) => u32(r, at) | 0;
const fail = (
  reason: string,
  subject?: number,
): { ok: false; reason: string; subject?: number } => ({
  ok: false,
  reason,
  ...(subject === undefined ? {} : { subject }),
});
const playersValid = (players: readonly (readonly number[])[]) =>
  players.length === 4 &&
  players.every((p) => bytes(p, OBJECTIVE_PLAYER_BYTES));

export function missionObjectiveContextValid(
  c: MissionObjectiveContext,
): boolean {
  return (
    [c.flags, c.mode, c.terrainCount, c.field34b9].every((n) =>
      integer(n, 0, 255),
    ) &&
    integer(c.active, 0, 4) &&
    integer(c.selected, 0, 3) &&
    [c.frame, c.missionCounter].every((n) => integer(n, 0, 0xffffffff)) &&
    [c.targetCount, c.missionLimit, c.missionTimer].every((n) =>
      integer(n, 0, 0xffff),
    ) &&
    integer(c.terrainLimit, -0x80000000, 0x7fffffff)
  );
}

/** The caller supplies current source backing bytes, not a guessed mission
 * table. Runtime globals are independent from these serialized fields. */
export function readMissionObjectiveContext(
  prefix: readonly number[],
  runtime: ObjectiveRuntimeContext,
): ObjectiveResult<MissionObjectiveContext> {
  if (!bytes(prefix, OBJECTIVE_PREFIX_BYTES))
    return fail("invalid-objective-source-prefix");
  const context: MissionObjectiveContext = {
    ...runtime,
    missionCounter: u32(prefix, 0x1ec2),
    targetCount: u16(prefix, 0x1ea6),
    missionLimit: u16(prefix, 0x1c7c),
    missionTimer: u16(prefix, 0x355c),
    terrainCount: prefix[0x34b8],
    terrainLimit: i32(prefix, 0x1eaa),
    field34b9: prefix[0x34b9],
  };
  return missionObjectiveContextValid(context)
    ? { ok: true, value: context }
    : fail("invalid-outcome-context");
}

const emptyEligibility = (p: readonly number[], c: MissionObjectiveContext) =>
  p[2] !== 0
    ? u16(p, 0x60e) > 0
    : c.missionCounter !== 0 && p[0x498] !== 0
      ? false
      : i8(p[3]) === 0;
const directlyEligible = (p: readonly number[], c: MissionObjectiveContext) =>
  i32(p, 0x49d) !== 0 && !(i8(p[0x4a2]) === 0 && emptyEligibility(p, c));

/** Source-ordered numeric scan through731B6. Capability is queried only when
 * the source reaches805E0; a query failure never becomes elimination/loss. */
export function scanMissionObjectives(
  before: readonly (readonly number[])[],
  context: MissionObjectiveContext,
  exhausted: CapabilityQuery,
  deferredLanding?: DeferredLandingService,
): ObjectiveResult<ObjectiveScan> {
  if (!playersValid(before)) return fail("invalid-objective-player-records");
  if (!missionObjectiveContextValid(context))
    return fail("invalid-outcome-context");
  const c = context;
  const scan: ObjectiveScan = {
    players: before.map((p) => [...p]),
    winner: null,
    survivors: 0,
    lastSurvivor: null,
    capabilityQueries: [],
    alreadyTerminal: !!(c.flags & 0x40),
  };
  if (scan.alreadyTerminal) return { ok: true, value: scan };
  if (c.missionCounter !== 0 && c.frame === c.missionCounter) {
    if (!deferredLanding) return fail("deferred-landing-required");
    const landing = deferredLanding(c.selected, scan.players);
    if (!landing.ok) return landing;
    if (!playersValid(landing.value)) return fail("invalid-deferred-landing-players");
    scan.players = landing.value.map(p => [...p]);
  }
  for (let id = 0; id < c.active && scan.winner === null; id++) {
    const p = scan.players[id];
    if (i32(p, 0x49d) !== 0) {
      if (i8(p[0x4a2]) === 0 && emptyEligibility(p, c)) {
        if (p[0x6e3] === 0) p[0x6e3] = 1;
      } else {
        if (c.flags & 0x20) {
          if (id === c.selected) {
            const progress = p[0x6e7];
            if (progress === 0) {
              if (p[0x606] >= 3) scan.winner = id;
            } else if (
              (progress === 14 || progress === 20) &&
              !(c.mode & 1) &&
              c.missionLimit <= i32(p, 0x11) &&
              c.missionTimer === 0
            ) {
              scan.winner = id;
            }
          }
          if (
            id === c.selected &&
            scan.winner === null &&
            c.missionCounter === 0
          ) {
            scan.capabilityQueries.push(id);
            const capability = exhausted(id, p);
            if (!capability.ok) return capability;
            if (capability.value) p[0x6e3] = 1;
          }
        }
        if (scan.winner === null) {
          if (p[2] === 0 && c.targetCount > 0 && c.targetCount <= i32(p, 0x4a7))
            scan.winner = id;
          if (c.terrainCount !== 0 && c.terrainLimit <= i32(p, 0xd))
            scan.winner = id;
        }
      }
    }
    if (p[0x6e3] === 0) {
      scan.survivors = (scan.survivors + 1) & 255;
      scan.lastSurvivor = id;
    }
  }
  if (
    scan.winner === null &&
    c.terrainCount !== 0 &&
    c.terrainCount === c.field34b9
  ) {
    let best = 0;
    for (let id = 0; id < c.active; id++) {
      const p = scan.players[id],
        score = i32(p, 0xd);
      if (p[0x6e3] === 0 && best < score) {
        scan.winner = id;
        // Source keeps a WORD running best, even though player score is i32.
        best = score & 0xffff;
      }
    }
  }
  if (
    c.targetCount === 0 &&
    (c.mode & 1 || c.terrainCount === 0) &&
    c.active > 1 &&
    scan.winner === null &&
    scan.survivors === 1
  )
    scan.winner = scan.lastSurvivor;
  return { ok: true, value: scan };
}

/** Ordinary mode0 terminal flags and result request. Source mode1 presentation
 * callbacks remain explicit boundaries; the host stages deferred landing. */
export function evaluateMissionObjectives(
  before: readonly (readonly number[])[],
  context: MissionObjectiveContext,
  exhausted: CapabilityQuery,
  deferredLanding?: DeferredLandingService,
): ObjectiveResult<MissionObjectivePlan> {
  const result = scanMissionObjectives(before, context, exhausted, deferredLanding);
  if (!result.ok) return result;
  const scan = result.value;
  if (scan.alreadyTerminal) return fail("terminal-result-identity-required");
  let flags = context.flags,
    outcome: MissionObjectiveOutcome = { kind: "running" };
  let request: MissionObjectivePlan["resultRequest"] = null;
  if (scan.winner !== null) {
    if (context.mode & 1) return fail("alternate-result-presentation-required");
    if (scan.winner === context.selected) {
      flags |= 0x40;
      outcome = { kind: "won", player: scan.winner };
      request = "victory-185DFC";
    } else {
      flags |= 0x80;
      outcome = { kind: "lost", player: context.selected, winner: scan.winner };
    }
  } else if (flags & 0x80) {
    outcome = { kind: "lost", player: context.selected, winner: null };
  } else if (scan.players[context.selected][0x6e3] !== 0) {
    if (context.mode & 1) return fail("alternate-result-presentation-required");
    flags |= 0x80;
    outcome = { kind: "lost", player: context.selected, winner: null };
  }
  return {
    ok: true,
    value: {
      scan,
      flagsBefore: context.flags,
      flagsAfter: flags,
      outcome,
      resultRequest: request,
    },
  };
}

export interface ObjectiveGoalDescriptor {
  id:
    | "completed-photons"
    | "approval-timer"
    | "goop-threshold"
    | "terrain-score"
    | "terrain-ranking"
    | "last-survivor";
  label: string;
  current: number;
  target: number;
  thresholdReached: boolean;
  sourcePlayerOffset: number | null;
  timerRemaining?: number;
}
export interface ObjectiveZoneDescriptor {
  index: number;
  center: [number, number];
  selector: number;
  radius: number;
  initialQuota: number;
  remainingQuota: number;
  activeObservers: number;
}
export interface MissionObjectiveLedger {
  player: number;
  campaignProgress: number;
  directlyEligible: boolean;
  alreadyEliminated: boolean;
  capabilityMayBeQueried: boolean;
  deferredLandingDue: boolean;
  goals: ObjectiveGoalDescriptor[];
  zones: ObjectiveZoneDescriptor[] | null;
  zoneMetadataStatus:
    | "provided"
    | "not-needed"
    | "source-prefix-required"
    | "unsupported-zone-count";
  selectedVictoryPredicate: "configured" | "none-configured";
}

/** Descriptive ledger only: reaching a displayed threshold is not a win until
 * the complete ordered scan succeeds. Zone geometry/quota is read from actual
 * backing bytes; no mission-number→goal list or creature-count guess exists. */
export function describeMissionObjectives(
  players: readonly (readonly number[])[],
  c: MissionObjectiveContext,
  sourcePrefix?: readonly number[],
): ObjectiveResult<MissionObjectiveLedger> {
  if (!playersValid(players)) return fail("invalid-objective-player-records");
  if (!missionObjectiveContextValid(c)) return fail("invalid-outcome-context");
  if (
    sourcePrefix !== undefined &&
    !bytes(sourcePrefix, OBJECTIVE_PREFIX_BYTES)
  )
    return fail("invalid-objective-source-prefix");
  if (sourcePrefix !== undefined && sourcePrefix[0x34b8] !== c.terrainCount)
    return fail("objective-zone-count-mismatch");
  const p = players[c.selected],
    progress = p[0x6e7];
  const goals: ObjectiveGoalDescriptor[] = [];
  if (c.flags & 0x20) {
    if (progress === 0)
      goals.push({
        id: "completed-photons",
        label: "Complete Photon processors",
        current: p[0x606],
        target: 3,
        thresholdReached: p[0x606] >= 3,
        sourcePlayerOffset: 0x606,
      });
    else if ((progress === 14 || progress === 20) && !(c.mode & 1)) {
      const current = i32(p, 0x11);
      goals.push({
        id: "approval-timer",
        label: "Reach approval target and finish mission timer",
        current,
        target: c.missionLimit,
        thresholdReached: current >= c.missionLimit && c.missionTimer === 0,
        sourcePlayerOffset: 0x11,
        timerRemaining: c.missionTimer,
      });
    }
  }
  if (p[2] === 0 && c.targetCount > 0) {
    const current = i32(p, 0x4a7);
    goals.push({
      id: "goop-threshold",
      label: "Collect GOOP",
      current,
      target: c.targetCount,
      thresholdReached: current >= c.targetCount,
      sourcePlayerOffset: 0x4a7,
    });
  }
  if (c.terrainCount !== 0) {
    const current = i32(p, 0xd);
    goals.push({
      id: "terrain-score",
      label: "Reach score from marked zones",
      current,
      target: c.terrainLimit,
      thresholdReached: current >= c.terrainLimit,
      sourcePlayerOffset: 0xd,
    });
    goals.push({
      id: "terrain-ranking",
      label: "Finish marked zones for final score comparison",
      current: c.field34b9,
      target: c.terrainCount,
      thresholdReached: c.field34b9 === c.terrainCount,
      sourcePlayerOffset: 0xd,
    });
  }
  if (
    c.targetCount === 0 &&
    (c.mode & 1 || c.terrainCount === 0) &&
    c.active > 1
  ) {
    const survivors = players
      .slice(0, c.active)
      .filter((q) => q[0x6e3] === 0).length;
    goals.push({
      id: "last-survivor",
      label: "Remain the last surviving player",
      current: survivors,
      target: 1,
      thresholdReached: survivors === 1 && p[0x6e3] === 0,
      sourcePlayerOffset: 0x6e3,
    });
  }
  let zones: ObjectiveZoneDescriptor[] | null =
    c.terrainCount === 0 ? [] : null;
  let zoneMetadataStatus: MissionObjectiveLedger["zoneMetadataStatus"] =
    c.terrainCount === 0 ? "not-needed" : "source-prefix-required";
  if (c.terrainCount > 4) zoneMetadataStatus = "unsupported-zone-count";
  else if (sourcePrefix !== undefined && c.terrainCount > 0) {
    zones = Array.from({ length: c.terrainCount }, (_, index) => {
      const at = 0x2ff8 + index * 19;
      return {
        index,
        center: [i16(sourcePrefix, at), i16(sourcePrefix, at + 2)],
        selector: sourcePrefix[at + 4],
        radius: i32(sourcePrefix, at + 6),
        initialQuota: i32(sourcePrefix, at + 10),
        remainingQuota: i32(sourcePrefix, at + 14),
        activeObservers: (sourcePrefix[at + 18] << 24) >> 24,
      };
    });
    zoneMetadataStatus = "provided";
  }
  const eligible = c.selected < c.active && directlyEligible(p, c);
  return {
    ok: true,
    value: {
      player: c.selected,
      campaignProgress: progress,
      directlyEligible: eligible,
      alreadyEliminated: p[0x6e3] !== 0,
      capabilityMayBeQueried:
        !!(c.flags & 0x20) &&
        !(c.flags & 0x40) &&
        c.missionCounter === 0 &&
        eligible,
      deferredLandingDue:
        c.missionCounter !== 0 && c.frame === c.missionCounter,
      goals,
      zones,
      zoneMetadataStatus,
      selectedVictoryPredicate: goals.length ? "configured" : "none-configured",
    },
  };
}
