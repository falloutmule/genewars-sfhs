/** Source-backed Exceland result stages and campaign carry. Native unknowns
 * remain explicit; this module never creates a ready successor mission. */
import {
  evaluateMissionObjectives,
  type MissionObjectiveContext,
} from "./mission-objectives";
export const PLAYER_RECORD_BYTES = 1805;
export const CONQ_RECORD_BYTES = 343958;
export type RawRecord = number[];
export type OutcomeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; subject?: number };
export interface LogicalCampaignActor {
  id: number;
  owner: number;
  blueprintIndex: number;
}
export interface CapabilityActor {
  id: number;
  owner: number;
  category: number | null;
}
export interface OutcomeContext {
  missionNumber: number;
  flags: number;
  mode: number;
  active: number;
  selected: number;
  frame: number;
  missionCounter: number;
  targetCount: number;
  terrainCount: number;
  /** Required actual source fields for stepCampaignResult evaluation. The
   * legacy Exceland adapter never observes these absent objective families. */
  missionLimit?: number;
  missionTimer?: number;
  terrainLimit?: number;
  field34b9?: number;
}
export type ResultPhase =
  | "running"
  | "victory-notification"
  | "victory-view-queued"
  | "victory-view"
  | "campaign-view-queued"
  | "lost";
export interface CampaignResultState {
  schemaVersion: 1;
  phase: ResultPhase;
  players: RawRecord[];
  context: OutcomeContext;
  savedFrame: number;
  stage: number;
  terminal: null | {
    kind: "won" | "lost";
    player: number;
    winner: number | null;
  };
}
export type ResultAction =
  | { type: "evaluate"; actors: readonly CapabilityActor[] }
  | { type: "continue-notification" }
  | {
      type: "enter-victory";
      videoLockDepth: number;
      presentationResolved: boolean;
    }
  | { type: "advance-victory"; runtimeInputFlags: number };
export type ResultEvent =
  | { type: "show-victory-notification"; textIndex: 555 }
  | { type: "queue-view"; view: "victory-1863DC" | "campaign-186F19" }
  | {
      type: "victory-presentation";
      feedbackTextIndex: number;
      statisticTextIndices: number[];
      statistics: number[];
      assets: string[];
    }
  | { type: "loss-latched"; player: number; winner: number | null };
export interface ResultReceipt {
  state: CampaignResultState;
  events: ResultEvent[];
  capabilityQueries: number[];
}

const integer = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;
const bytes = (r: readonly number[], length: number) =>
  Array.isArray(r) && r.length === length && r.every((n) => integer(n, 0, 255));
const signedByte = (n: number) => (n << 24) >> 24;
const u16 = (r: readonly number[], at: number) => r[at] | (r[at + 1] << 8);
const i16 = (r: readonly number[], at: number) => (u16(r, at) << 16) >> 16;
const u32 = (r: readonly number[], at: number) =>
  (r[at] | (r[at + 1] << 8) | (r[at + 2] << 16) | (r[at + 3] << 24)) >>> 0;
const i32 = (r: readonly number[], at: number) => u32(r, at) | 0;
const playersValid = (players: readonly RawRecord[]) =>
  players.length === 4 && players.every((p) => bytes(p, PLAYER_RECORD_BYTES));
const fail = (
  reason: string,
  subject?: number,
): { ok: false; reason: string; subject?: number } => ({
  ok: false,
  reason,
  ...(subject === undefined ? {} : { subject }),
});

/** Source805E0. Actors are actual live logical category bindings, avoiding
 * invented native pointer images. Lookup remains lazy and source ordered. */
export function constructionCapabilityExhausted(
  player: readonly number[],
  actors: readonly CapabilityActor[],
): OutcomeResult<boolean> {
  if (!bytes(player, PLAYER_RECORD_BYTES)) return fail("invalid-player-record");
  if (i32(player, 0x616) > 0 || player[0x600] !== 0)
    return { ok: true, value: false };
  const count = signedByte(player[3]);
  if (count > 5) return fail("invalid-capability-actor-count", count);
  for (let index = 0; index < Math.max(count, 0); index++) {
    const id = signedByte(player[4 + index]);
    if (!integer(id, 0, 19)) return fail("invalid-capability-actor-id", id);
    const matches = actors.filter((a) => a.id === id);
    const actor = matches[0];
    if (
      matches.length !== 1 ||
      !actor ||
      !integer(actor.owner, 0, 3) ||
      actor.category === null ||
      !integer(actor.category, 0, 255)
    )
      return fail("missing-capability-blueprint", id);
    if (actor.category === 0) return { ok: true, value: false };
  }
  if (player[0x605] !== 0)
    for (let index = 0; index < 32; index++) {
      const at = 0x16 + index * 36;
      if (player[at] !== 0 && player[at + 0x16] === 0)
        return { ok: true, value: false };
    }
  return { ok: true, value: true };
}

/** The supported objective family is Exceland progress0 with absent generic
 * funds/terrain objectives. Unsupported later missions cannot inherit it. */
export function stepExcelandResult(
  before: CampaignResultState,
  action: ResultAction,
): OutcomeResult<ResultReceipt> {
  return stepResult(before, action, true);
}

/** Generic72ED0 scan with the shared serializable result stages. A running
 * evaluation requires complete actual source objective context. This does not
 * establish that the host implements a later mission's required mechanics. */
export function stepCampaignResult(
  before: CampaignResultState,
  action: ResultAction,
): OutcomeResult<ResultReceipt> {
  return stepResult(before, action, false);
}

function stepResult(
  before: CampaignResultState,
  action: ResultAction,
  excelandOnly: boolean,
): OutcomeResult<ResultReceipt> {
  if (!playersValid(before.players) || before.schemaVersion !== 1)
    return fail("invalid-result-state");
  const c = before.context;
  if (
    ![c.flags, c.mode].every((n) => integer(n, 0, 255)) ||
    !integer(c.active, 0, 4) ||
    !integer(c.selected, 0, 3) ||
    !integer(c.frame, 0, 0xffffffff) ||
    !integer(c.missionCounter, 0, 0xffffffff)
  )
    return fail("invalid-outcome-context");
  const state: CampaignResultState = {
    ...before,
    players: before.players.map((p) => [...p]),
    context: { ...c },
    terminal: before.terminal ? { ...before.terminal } : null,
  };
  const events: ResultEvent[] = [];
  const capabilityQueries: number[] = [];
  if (action.type === "evaluate") {
    if (state.phase !== "running")
      return { ok: true, value: { state, events, capabilityQueries } };
    if (
      excelandOnly &&
      (c.missionNumber !== 1 ||
        state.players[c.selected][0x6e7] !== 0 ||
        c.targetCount !== 0 ||
        c.terrainCount !== 0)
    )
      return fail("unsupported-mission-objective");
    const objectiveContext: MissionObjectiveContext = {
      ...c,
      missionLimit: excelandOnly ? 0 : (c.missionLimit as number),
      missionTimer: excelandOnly ? 0 : (c.missionTimer as number),
      terrainLimit: excelandOnly ? 0 : (c.terrainLimit as number),
      field34b9: excelandOnly ? 0 : (c.field34b9 as number),
    };
    const evaluated = evaluateMissionObjectives(
      state.players,
      objectiveContext,
      (_owner, player) =>
        constructionCapabilityExhausted(player, action.actors),
    );
    if (!evaluated.ok) return evaluated;
    const plan = evaluated.value,
      winner = plan.scan.winner;
    state.players = plan.scan.players;
    state.context.flags = plan.flagsAfter;
    capabilityQueries.push(...plan.scan.capabilityQueries);
    if (plan.outcome.kind === "won") {
      state.phase = "victory-notification";
      state.terminal = { kind: "won", player: c.selected, winner };
      events.push({ type: "show-victory-notification", textIndex: 555 });
    } else if (plan.outcome.kind === "lost") {
      state.phase = "lost";
      state.terminal = { kind: "lost", player: c.selected, winner };
      events.push({ type: "loss-latched", player: c.selected, winner });
    }
  } else if (action.type === "continue-notification") {
    if (state.phase !== "victory-notification")
      return fail("victory-notification-required");
    if ((c.flags & 0x60) !== 0x60) return fail("campaign-victory-required");
    state.phase = "victory-view-queued";
    events.push({ type: "queue-view", view: "victory-1863DC" });
  } else if (action.type === "enter-victory") {
    if (state.phase !== "victory-view-queued" || (c.flags & 0x60) !== 0x60)
      return fail("queued-campaign-victory-required");
    if (c.mode & 1) return fail("alternate-result-presentation-required");
    if (action.videoLockDepth !== 0)
      return fail("video-lock-state-unsupported");
    if (!action.presentationResolved)
      return fail("victory-presentation-service-required");
    const player = state.players[c.selected];
    player[0x6e7] = (player[0x6e7] + 1) & 255;
    state.context.flags &= ~4;
    state.context.mode |= 2;
    state.savedFrame = c.frame;
    state.context.frame = 0;
    state.stage = 5;
    state.phase = "victory-view";
    events.push({
      type: "victory-presentation",
      feedbackTextIndex: 477 + signedByte(player[0x6e7]),
      statisticTextIndices: [546, 547, 548, 549, 550, 551],
      statistics: [0x6f9, 0x6fd, 0x701, 0x705, 0x709, 0xd].map((at) =>
        i32(player, at),
      ),
      assets: [
        "DATA/WINSCR.PAL",
        "DATA/WINSCR.DAT",
        "ANIMS/BIOWIN.SMK",
        "DATA/FONT7.TAB",
        "DATA/FONT7.DAT",
      ],
    });
  } else {
    if (state.phase !== "victory-view") return fail("victory-view-required");
    if (!integer(action.runtimeInputFlags, 0, 255))
      return fail("invalid-result-input");
    if (action.runtimeInputFlags & 1) {
      if (!(c.flags & 0x20)) return fail("campaign-victory-required");
      if (state.players[c.selected][0x6e7] === 24)
        return fail("ending-sequence-required");
      state.phase = "campaign-view-queued";
      events.push({ type: "queue-view", view: "campaign-186F19" });
    }
  }
  return { ok: true, value: { state, events, capabilityQueries } };
}

export interface PlayerCarryPlan {
  players: RawRecord[];
  retiredActorIds: number[];
  selectedActorResetRequired: boolean;
}
/** Exact four-player80E90/42B50 projection using real logical bindings. The
 * caller must retire/unlink the returned actors; the old world cannot resume. */
export function planCampaignPlayerCarry(
  before: readonly RawRecord[],
  actors: readonly LogicalCampaignActor[],
  selectedPlayer: number,
  selectedActor: number | null,
): OutcomeResult<PlayerCarryPlan> {
  if (!playersValid(before) || !integer(selectedPlayer, 0, 3))
    return fail("invalid-carry-players");
  const players = before.map((p) => [...p]);
  const retiredActorIds: number[] = [];
  let selectedActorResetRequired = false;
  for (let owner = 0; owner < 4; owner++) {
    const p = players[owner];
    if (p[1] !== owner || p[0x4a1] !== owner)
      return fail("carry-player-identity", owner);
    if (!integer(signedByte(p[3]), 0, 5))
      return fail("carry-actor-list", owner);
    while (p[3] !== 0) {
      const id = signedByte(p[4]);
      const matches = actors.filter((a) => a.id === id);
      const actor = matches[0];
      if (
        !integer(id, 0, 19) ||
        retiredActorIds.includes(id) ||
        matches.length !== 1 ||
        !actor ||
        actor.owner !== owner ||
        Math.floor(id / 5) !== owner ||
        !integer(actor.blueprintIndex, 0, 31)
      )
        return fail("carry-actor-binding", id);
      const first = actors
        .filter(
          (a) => a.owner === owner && a.blueprintIndex === actor.blueprintIndex,
        )
        .sort((a, b) => a.id - b.id)[0];
      if (first.id !== id) return fail("carry-duplicate-blueprint-binding", id);
      p[0x16 + actor.blueprintIndex * 36 + 0x20] &= ~3;
      p[3]--;
      for (let index = 0; index < p[3]; index++) p[4 + index] = p[5 + index];
      retiredActorIds.push(id);
      if (owner === selectedPlayer && selectedActor === id)
        selectedActorResetRequired = true;
    }
    for (let index = 0; index < 32; index++) {
      const at = 0x16 + index * 36;
      if (p[at] !== 0) p.fill(0, at + 0x1c, at + 0x20);
    }
    const identity = p[0x4a1];
    p.fill(0, 0x4a1, 0x61a);
    p[0x4a1] = identity;
    p.fill(0, 0x498, 0x4a1);
    p.fill(0, 0xd, 0x15);
    p.fill(0, 0x6f9, 0x70d);
    p[0x6e5] = 0;
    p[0x6e3] = 0;
    p[1] = owner;
  }
  return {
    ok: true,
    value: { players, retiredActorIds, selectedActorResetRequired },
  };
}

export interface CarryEntity {
  kind: number;
  id: number;
  record: RawRecord;
}
export interface CampaignCarryInput {
  players: RawRecord[];
  actors: LogicalCampaignActor[];
  /** Supply real native images only; absence does not mean zero memory. */
  nativeActors?: RawRecord[];
  map?: RawRecord;
  entities?: CarryEntity[];
  externalRecords: RawRecord;
  retainedWorldBytes: RawRecord;
  flags: number;
  mode: number;
  selectedPlayer: number;
  selectedActor: number | null;
}
export interface CampaignCarryPlan extends PlayerCarryPlan {
  nativeActors?: RawRecord[];
  map?: RawRecord;
  entities?: CarryEntity[];
  externalRecords: RawRecord;
  retainedWorldBytes: RawRecord;
  flags: number;
  frame: 0;
  selectedPlayer: 0;
  retirementRequired: boolean;
}
/** Source72E50 plus optional shared8ACC0 unlink execution. Without native/map
 * images it returns logical retirement obligations, never invented images. */
export function planCampaignCarry(
  input: CampaignCarryInput,
): OutcomeResult<CampaignCarryPlan> {
  if (!integer(input.mode, 0, 255) || input.mode & 1)
    return fail("alternate-campaign-carry-unsupported");
  if (
    !bytes(input.externalRecords, 600) ||
    !bytes(input.retainedWorldBytes, 150) ||
    !integer(input.flags, 0, 255)
  )
    return fail("invalid-carry-world-records");
  const playerPlan = planCampaignPlayerCarry(
    input.players,
    input.actors,
    input.selectedPlayer,
    input.selectedActor,
  );
  if (!playerPlan.ok) return playerPlan;
  const value: CampaignCarryPlan = {
    ...playerPlan.value,
    externalRecords: [...input.externalRecords],
    retainedWorldBytes: [...input.retainedWorldBytes],
    flags: input.flags & 0xf9,
    frame: 0,
    selectedPlayer: 0,
    retirementRequired: playerPlan.value.retiredActorIds.length > 0,
  };
  for (let at = 0; at < value.externalRecords.length; at += 2) {
    value.externalRecords[at] &= 7;
    value.externalRecords[at + 1] = 255;
  }
  if (
    input.nativeActors === undefined &&
    input.map === undefined &&
    input.entities === undefined
  )
    return { ok: true, value };
  if (
    !input.nativeActors ||
    input.nativeActors.length !== 20 ||
    !input.nativeActors.every((a) => bytes(a, 200)) ||
    !input.map ||
    !bytes(input.map, 229376)
  )
    return fail("native-carry-world-required");
  value.nativeActors = input.nativeActors.map((a) => [...a]);
  value.map = [...input.map];
  value.entities = (input.entities ?? []).map((e) => ({
    ...e,
    record: [...e.record],
  }));
  const registry = new Map<string, RawRecord>();
  for (let id = 0; id < 20; id++)
    registry.set(`3:${id}`, value.nativeActors[id]);
  for (const entity of value.entities) {
    const key = `${entity.kind}:${entity.id}`;
    if (
      !integer(entity.kind, 1, 8) ||
      entity.kind === 3 ||
      !integer(entity.id, 0, 65535) ||
      registry.has(key) ||
      !bytes(entity.record, entity.record.length) ||
      entity.record.length < 31 ||
      entity.record[6] !== entity.kind ||
      u16(entity.record, 15) !== entity.id
    )
      return fail("invalid-carry-entity", entity.id);
    registry.set(key, entity.record);
  }
  const ref = (r: RawRecord, at: number) => r.slice(at, at + 3);
  const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
  for (const id of value.retiredActorIds) {
    const a = value.nativeActors[id];
    if (a[6] !== 3 || a[24] !== Math.floor(id / 5) || u16(a, 15) !== id)
      return fail("native-carry-actor-identity", id);
    if (a[112] & 1) {
      const previous = ref(a, 0),
        next = ref(a, 3),
        identity = [id & 255, id >> 8, 3];
      const cell = ((i16(a, 9) >> 8) & 127) * 128 + ((i16(a, 7) >> 8) & 127);
      if (previous[2] === 0) {
        if (
          u16(previous, 0) !== cell ||
          !same(ref(value.map, cell * 14 + 6), identity)
        )
          return fail("stale-carry-actor-link", id);
        if (next[2] !== 0) value.map.splice(cell * 14 + 6, 3, ...next);
        else value.map[cell * 14 + 8] = 0;
      } else {
        const entity = registry.get(`${previous[2]}:${u16(previous, 0)}`);
        if (!entity || !same(ref(entity, 3), identity))
          return fail("stale-carry-actor-link", id);
        entity.splice(3, 3, ...next);
      }
      if (next[2] !== 0) {
        const entity = registry.get(`${next[2]}:${u16(next, 0)}`);
        if (!entity || !same(ref(entity, 0), identity))
          return fail("stale-carry-actor-link", id);
        entity.splice(0, 3, ...previous);
      }
      a[112] &= ~1;
    }
    a[6] = 0;
    a.fill(0, 196, 200);
  }
  value.retirementRequired = false;
  return { ok: true, value };
}

export interface CarriedSource {
  status: "initialization-required";
  missionNumber: number;
  conqBytes: RawRecord;
  players: RawRecord[];
  nativeActors: (number | null)[][];
  nativeActorBindings: null[];
  sourceRng: { seed: number; drawCount: number; frame: number; ring: null };
  externalRecords: RawRecord;
}
/** Resolve the logical retirement/UI ports after the host has performed them.
 * No missing native image is fabricated by acknowledging these obligations. */
export function completeCampaignRetirement(
  plan: CampaignCarryPlan,
  resolved: {
    retiredActorIds: readonly number[];
    selectedActorResetResolved: boolean;
  },
): OutcomeResult<CampaignCarryPlan> {
  if (
    resolved.retiredActorIds.length !== plan.retiredActorIds.length ||
    resolved.retiredActorIds.some(
      (id, index) => id !== plan.retiredActorIds[index],
    )
  )
    return fail("campaign-retirement-order-mismatch");
  if (plan.selectedActorResetRequired && !resolved.selectedActorResetResolved)
    return fail("selected-actor-reset-required");
  return {
    ok: true,
    value: {
      ...plan,
      retirementRequired: false,
      selectedActorResetRequired: false,
    },
  };
}
/** Source80590 selected-player overlay and71B70 retained150-byte world span.
 * Actor57540 copies only serialized ranges over actual retired priors. Missing
 * native priors stay null; activation/landing/funds/RNG-ring work is separate. */
export function restoreNextCampaignSource(
  carry: CampaignCarryPlan,
  next: {
    missionNumber: number;
    sourceVersion: string;
    conqBytes: readonly number[];
  },
): OutcomeResult<CarriedSource> {
  if (carry.retirementRequired)
    return fail("campaign-actor-retirement-required");
  if (carry.selectedActorResetRequired)
    return fail("selected-actor-reset-required");
  if (
    !playersValid(carry.players) ||
    !bytes(carry.retainedWorldBytes, 150) ||
    !bytes(carry.externalRecords, 600)
  )
    return fail("invalid-campaign-carry");
  const raw = next.conqBytes;
  if (
    next.sourceVersion !== "qa-beta-v5-cd" ||
    !bytes(raw, CONQ_RECORD_BYTES) ||
    u32(raw, 0) !== 0x55336 ||
    u32(raw, 337054) !== 0x6be
  )
    return fail("unsupported-successor-source");
  const selected = carry.selectedPlayer;
  const progress = carry.players[selected][0x6e7];
  if (progress === 24) return fail("ending-sequence-required");
  if (
    !integer(next.missionNumber, 1, 24) ||
    next.missionNumber !== progress + 1
  )
    return fail("campaign-successor-mismatch");
  if (
    carry.nativeActors &&
    (carry.nativeActors.length !== 20 ||
      !carry.nativeActors.every((a) => bytes(a, 200)))
  )
    return fail("invalid-native-carry-priors");
  const conqBytes = [...raw];
  const players = Array.from({ length: 4 }, (_, owner) =>
    conqBytes.slice(
      20 + owner * PLAYER_RECORD_BYTES,
      20 + (owner + 1) * PLAYER_RECORD_BYTES,
    ),
  );
  if (carry.players[selected][1] !== selected)
    return fail("retained-player-identity");
  for (const [start, end] of [
    [0, 0x4a1],
    [0x61a, 0x6f7],
  ]) {
    for (let at = start; at < end; at++)
      players[selected][at] = carry.players[selected][at];
  }
  for (let at = 0; at < PLAYER_RECORD_BYTES; at++)
    conqBytes[20 + selected * PLAYER_RECORD_BYTES + at] = players[selected][at];
  for (let at = 0; at < 150; at++)
    conqBytes[0x34ba + at] = carry.retainedWorldBytes[at];
  const nativeActors: (number | null)[][] = [];
  for (let id = 0; id < 20; id++) {
    const at = 298830 + id * 140;
    if (raw[at + 6] !== 0)
      return fail("active-successor-actor-initializer-required", id);
    const actor: (number | null)[] = carry.nativeActors
      ? [...carry.nativeActors[id]]
      : Array(200).fill(null);
    for (let index = 0; index < 31; index++) actor[index] = raw[at + index];
    for (let index = 31; index < 140; index++)
      actor[index + 8] = raw[at + index];
    nativeActors.push(actor);
  }
  return {
    ok: true,
    value: {
      status: "initialization-required",
      missionNumber: next.missionNumber,
      conqBytes,
      players,
      nativeActors,
      nativeActorBindings: Array(20).fill(null),
      sourceRng: {
        seed: u16(raw, 0x52480),
        drawCount: u32(raw, 0x52478),
        frame: u32(raw, 0x52474),
        ring: null,
      },
      externalRecords: [...carry.externalRecords],
    },
  };
}

export function resumeAfterCampaignViewEntry(
  mode: number,
  moduleFlags: number,
  frame: number,
  savedFrame: number,
) {
  const resumed = (mode & 2) !== 0 && (moduleFlags & 1) === 0;
  return {
    mode: resumed ? mode & ~2 : mode,
    frame: resumed ? savedFrame : frame,
    resumed,
  };
}

export interface CampaignAuxiliaryMetadata {
  entries: { lowFlags: number | null; second: number | null }[];
  provenance: string;
}
/** The original184D7C prior was not captured by the carry evidence. Cleanup
 * establishes the mask and second byte, while unknown retained low bits stay
 * unknown. `knownMask` records the source-applied retention mask, not a claim
 * that nullable low bits became observed source values. */
export function projectCampaignAuxiliaryMetadata(
  input: CampaignAuxiliaryMetadata,
): OutcomeResult<{
  entries: { lowFlags: number | null; second: 255 }[];
  knownMask: 7;
  provenance: string;
}> {
  if (
    !input.provenance.trim() ||
    input.entries.length !== 300 ||
    input.entries.some(
      (e) =>
        (e.lowFlags !== null && !integer(e.lowFlags, 0, 7)) ||
        (e.second !== null && !integer(e.second, 0, 255)),
    )
  )
    return fail("invalid-campaign-auxiliary-metadata");
  return {
    ok: true,
    value: {
      entries: input.entries.map((e) => ({
        lowFlags: e.lowFlags === null ? null : e.lowFlags & 7,
        second: 255,
      })),
      knownMask: 7,
      provenance:
        input.provenance +
        "; source72E50 masks retained low3 bits and establishes second byte FF; original unknown priors remain unresolved",
    },
  };
}
