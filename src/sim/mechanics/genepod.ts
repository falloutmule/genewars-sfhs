/** Human Genepod commands, completed grade0 production and real numeric Mule
 * /failed-production factories. Spatial insertion is an explicit transaction
 * obligation; source bytes and unresolved pointer slots remain serializable. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import { nextRandom, type GeneRng } from "./random";
import type { EcologyRules } from "./ecology";
import { creatureParameters, creatureSelector, creatureComponents } from "./creature-species";
import { createMotion, velocity, type MotionTables } from "./motion";
import { groundHeight, worldCell, type TerrainState } from "./terrain";
import { effectFactoryPrior, effectTerrainShade } from "./power-motion";
import {
  createNativeBuilding,
  progressNativeBuilding,
} from "./building-native";

export type GenepodNative = (number | null)[];
export type GenepodResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
export interface GenepodState {
  schemaVersion: 1;
  building: GenepodNative;
  players: number[][];
  rng: GeneRng;
}
export interface GenepodPools {
  creatureCount: number;
  creatures: GenepodNative[];
  effectCount: number;
  effects: GenepodNative[];
}
export interface GenepodContext {
  evidence: string;
  frame: number;
  runningAnimation: AnimationProfile;
  terrain: TerrainState;
  tables: MotionTables;
  /** Observed only by a terminal callback. Actual inactive priors are required. */
  pools?: GenepodPools;
}
export interface GenepodBirth {
  family: 0 | 4;
  slot: number;
  cell: number;
  native: GenepodNative;
  resource:
    | { kind: "creature"; selector: 4 }
    | { kind: "effect"; selector: 32 };
}
export type GenepodStatus =
  | "idle"
  | "frame-wait"
  | "funds-wait"
  | "working"
  | "mule-born"
  | "creature-pool-full"
  | "quality-failed";
export interface GenepodReceipt {
  state: GenepodState;
  /** Null means no pool was observed or changed in this callback. */
  pools: GenepodPools | null;
  status: GenepodStatus;
  paidBy: number | null;
  paid: number;
  quality: number | null;
  roll: number | null;
  births: GenepodBirth[];
  audio: { cue: number; mode: number; parameter?: number }[];
  queueRequested: true;
}
export interface GenepodHumanInput {
  selectedPlayer: number;
  panelState: number;
  speciesListIndex: number;
  eventFlags: number;
  /** Actual source control hit if reproducing its control adapter. A modern
   * button may supply its own genuine captured release without DOS hit parity. */
  capturedHit: boolean;
  selectedPanelRefreshEligible: boolean;
}
export interface GenepodCommandReceipt {
  state: GenepodState;
  panelState: number;
  disposition: "ignored" | "denied" | "started" | "cancelled";
  reason: string;
  audioCue: number | null;
  panelRefreshRequested: boolean;
}
export interface GenepodCapture {
  captured: boolean;
  inside: boolean;
  draw: number;
  event: number;
}

const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
const i8 = (v: number) => (v << 24) >> 24;
const i16 = (v: number) => (v << 16) >> 16;
const fail = (reason: string) => ({ ok: false as const, reason });
const attempt = <T>(f: () => T): GenepodResult<T> => {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "invalid-genepod-state");
  }
};
function require(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}
function native(n: readonly (number | null)[], size: number): void {
  require(Array.isArray(n) &&
    n.length === size &&
    n.every(
      (v) => v === null || integer(v, 0, 255),
    ), "invalid-genepod-native-record");
  require(n
    .slice(31, 39)
    .every((v) => v === null), "native-pointers-must-be-logical");
}
function byte(n: readonly (number | null)[], at: number): number {
  const v = n[at];
  require(v !== null && v !== undefined, "unknown-genepod-native-byte-" + at);
  return v;
}
const word = (n: readonly (number | null)[], at: number) =>
  i16(byte(n, at) | (byte(n, at + 1) << 8));
const dword = (n: readonly (number | null)[], at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
function put(n: GenepodNative, at: number, v: number) {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
}
function put32(n: GenepodNative, at: number, v: number) {
  put(n, at, v);
  put(n, at + 2, v >> 16);
}
function playerRecords(players: readonly number[][]) {
  require(players.length === 4 &&
    players.every(
      (p) => p.length === 1805 && p.every((v) => integer(v, 0, 255)),
    ), "invalid-genepod-player-records");
}
function building(b: GenepodNative) {
  native(b, 67);
  require(byte(b, 6) === 4 &&
    byte(b, 24) < 4 &&
    byte(b, 45) === 0 &&
    byte(b, 46) <= 2 &&
    integer(word(b, 15), 0, 255), "invalid-genepod-building");
}
function stateValid(s: GenepodState) {
  require(s.schemaVersion === 1, "invalid-genepod-state");
  building(s.building);
  playerRecords(s.players);
  const rng = { ...s.rng };
  nextRandom(rng); // Validate without consuming the shared stream.
}
function clone(s: GenepodState): GenepodState {
  return {
    ...s,
    building: s.building.slice(),
    players: s.players.map((p) => p.slice()),
    rng: { ...s.rng },
  };
}
function debit(p: number[], amount: number, identityType: number) {
  const excess = (amount - dword(p, 0x4a3)) | 0;
  if (excess <= 0) put32(p, 0x4a3, -excess | 0);
  else {
    put32(p, 0x4a3, 0);
    put32(p, 0x4a7, (dword(p, 0x4a7) - excess) | 0);
  }
  if (identityType !== 0 && ((dword(p, 0x4a3) + dword(p, 0x4a7)) | 0) <= 1000)
    put32(p, 0x4a7, 1000);
}

/** Source42FA0 +43F60 known Genepod creation/completion writes, using the real
 * inactive67-byte prior. This helper does not repeat player construction
 * counters or install spatial links. Counter30/timer48/drain63 are retained. */
export function initializeCompletedGenepod(
  prior: readonly (number | null)[],
  input: {
    slot: number;
    owner: number;
    position: [number, number];
    ground: number;
    shade: number;
  },
): GenepodResult<GenepodNative> {
  return attempt(() => {
    const made = createNativeBuilding(prior, { ...input, selector: 0 });
    require(made.ok, made.ok ? "" : made.reason);
    const completed = progressNativeBuilding(made.value, {
      increment: 280,
      maximumHealth: 280,
      loading: false,
    });
    require(completed.ok, completed.ok ? "" : completed.reason);
    return completed.value.native;
  });
}

/** Source capture action8. Packet values are ordinary idle/down/up/hold.
 * Opaque hit testing belongs to the actual source-control or modern UI host. */
export function captureGenepodInput(
  before: GenepodCapture,
  packet: number,
  hit: boolean,
): GenepodResult<{ state: GenepodCapture; invoke: boolean }> {
  return attempt(() => {
    require([0, 1, 2, 4].includes(packet) &&
      [0, 1].includes(before.draw) &&
      (before.captured || before.draw === 0), "unsupported-genepod-capture");
    const s = { ...before };
    let invoke = false;
    if (s.captured) {
      if (packet & 2) {
        s.event = 8 | (hit ? 0 : 0x8000);
        s.captured = false;
        s.draw = 0;
        invoke = true;
      } else {
        s.event = packet & 4 ? 2 : 0;
        if (hit !== s.inside) {
          invoke = true;
          if (s.inside) s.event = 1;
          s.inside = hit;
        }
        s.draw = Number(hit);
      }
    } else if (packet & 1 && hit) {
      s.captured = s.inside = true;
      s.draw = 1;
      s.event = 0;
      invoke = true;
    }
    return { state: s, invoke };
  });
}

/** Source21F0C ready-state update; presentation service55 is a host request. */
export function readyGenepodPanel(
  b: GenepodNative,
  panelState: number,
): GenepodResult<{ panelState: number; service55Requested: boolean }> {
  return attempt(() => {
    building(b);
    require(integer(panelState, 0, 255), "invalid-genepod-panel-state");
    if ((word(b, 49) & 0x141) !== 1)
      return { panelState: 0, service55Requested: true };
    if (panelState <= 1 && byte(b, 27) === 0 && dword(b, 54) <= 0)
      return { panelState: 3, service55Requested: true };
    return { panelState, service55Requested: false };
  });
}

/** Source21E20 human producer followed by actual opcode12/814A0. Ownership,
 * species list, research and sufficient total funds are checked by producer;
 * the handler itself must not add a made-up population-capacity rejection. */
export function requestGenepodMule(
  before: GenepodState,
  input: GenepodHumanInput,
): GenepodResult<GenepodCommandReceipt> {
  return attempt(() => {
    stateValid(before);
    require(integer(input.selectedPlayer, 0, 3) &&
      integer(input.panelState, 0, 255) &&
      integer(input.speciesListIndex, -128, 127) &&
      integer(input.eventFlags, 0, 65535), "invalid-genepod-human-input");
    const state = clone(before),
      b = state.building,
      p = state.players[input.selectedPlayer];
    require(p[1] < 4 &&
      p[2] === 0 &&
      p[0x4a1] < 4, "genepod-human-player-required");
    const receipt = (
      disposition: GenepodCommandReceipt["disposition"],
      reason: string,
      panelState = input.panelState,
      audioCue: number | null = null,
      panelRefreshRequested = false,
    ): GenepodCommandReceipt => ({
      state,
      panelState,
      disposition,
      reason,
      audioCue,
      panelRefreshRequested,
    });
    if (!input.capturedHit) return receipt("ignored", "no-captured-hit");
    const flags = word(b, 49);
    if (!(flags & 1) || flags & 0x40 || byte(b, 24) !== p[1])
      return receipt("ignored", "disabled-or-not-owned");
    const start = byte(b, 27) === 0 && dword(b, 54) <= 0,
      admitted = (flags & 0x141) === 1;
    if (start) {
      if (input.panelState < 2) return receipt("ignored", "panel-not-ready");
      if (input.eventFlags & 0x8001)
        return receipt("ignored", "suppressed-input", 3);
      if (!(input.eventFlags & 8))
        return receipt("ignored", "no-activation-edge", 2);
      if (!admitted) return receipt("ignored", "building-flags");
      require(input.speciesListIndex >= 0 &&
        input.speciesListIndex < p[0x6e0] &&
        input.speciesListIndex < 50, "invalid-genepod-species-list-index");
      require(i8(p[0x6ae + input.speciesListIndex]) ===
        4, "unsupported-genepod-species");
      if (
        ((dword(p, 0x4a3) + dword(p, 0x4a7)) | 0) < 75 ||
        dword(p, 0x62a) === 0
      )
        return receipt("denied", "funds-or-mule-research-required", 0, 0x26);
      const grade = byte(b, 46),
        scale = 1 << grade,
        work = 75 >> grade;
      put32(b, 54, work);
      put(b, 52, work);
      b[51] = 4;
      debit(p, 75 & (scale - 1), state.players[p[0x4a1]][2]);
      b[58] = p[1];
      return receipt(
        "started",
        "production-requested",
        0,
        0x2c,
        input.selectedPanelRefreshEligible,
      );
    }
    if (!admitted || dword(b, 54) <= 0)
      return receipt("denied", "nothing-cancellable", input.panelState, 0x1b);
    if (input.eventFlags & 0x8001)
      return receipt("ignored", "suppressed-input", 0);
    if (!(input.eventFlags & 8))
      return receipt("ignored", "no-activation-edge", 1);
    if (input.selectedPlayer !== byte(b, 58))
      return receipt("denied", "recorded-payer-required", 0, 0x26);
    require(byte(b, 51) === 4, "unsupported-genepod-species");
    const scale = 1 << byte(b, 46),
      refund =
        (Math.imul((word(b, 52) - dword(b, 54)) | 0, scale) +
          (75 & (scale - 1))) |
        0;
    const old = dword(p, 0x4a7),
      sum = (old + refund) | 0,
      cap = dword(p, 0x5e6);
    if (sum >>> 0 < cap >>> 0) put32(p, 0x4a7, sum);
    else {
      put32(p, 0x4a7, cap);
      put32(
        p,
        0x4a3,
        (dword(p, 0x4a3) + ((refund - ((cap - old) | 0)) | 0)) | 0,
      );
    }
    put32(b, 54, 0);
    b[58] = p[1];
    return receipt("cancelled", "paid-work-refunded", 0);
  });
}

function commonTail(
  before: GenepodNative,
  b: GenepodNative,
  profile: AnimationProfile,
) {
  b[28] = Number(byte(b, 27) !== 0);
  put(b, 61, Math.min(word(b, 61), 200));
  if (byte(b, 63) !== 0) b[63] = byte(b, 63) - 1;
  if (
    byte(before, 25) !== byte(b, 25) ||
    byte(b, 28) !== 0 ||
    (byte(before, 49) ^ byte(b, 49)) & 4 ||
    byte(b, 48) !== 0
  )
    b[21] = byte(b, 21) | 4;
  if (byte(b, 48) !== 0) b[48] = byte(b, 48) - 1;
  b[25] = 1;
  const a = advanceAnimation(
    {
      action: 1,
      frame: byte(b, 27),
      hold: byte(b, 26),
      direction: byte(b, 28),
      delay: i8(byte(b, 29)),
      counter: i8(byte(b, 30)),
    },
    profile,
  );
  b[26] = a.hold;
  b[27] = a.frame;
  b[28] = a.direction & 255;
  b[29] = a.delay & 255;
  b[30] = a.counter & 255;
}
function research(p: number[], increase: number) {
  const cap = (50 + 25 * p[0x6e1]) << 11,
    old = dword(p, 0x62a);
  if (old < cap) put32(p, 0x62a, Math.min((old + increase) | 0, cap));
}
function poolValid(
  records: GenepodNative[],
  count: number,
  capacity: number,
  stride: number,
) {
  require(records.length === capacity &&
    integer(count, 0, capacity), "invalid-genepod-pool");
  for (const n of records) native(n, stride);
  require(records.filter((n) => byte(n, 6) !== 0).length ===
    count, "genepod-pool-count-mismatch");
}
function poolClone(p: GenepodPools): GenepodPools {
  return {
    ...p,
    creatures: p.creatures.map((n) => n.slice()),
    effects: p.effects.map((n) => n.slice()),
  };
}
function launchVector(
  yaw: number,
  pitch: number,
  speed: number,
  tables: MotionTables,
) {
  require(tables.sine.length === 2048 &&
    tables.cosine.length === 2048 &&
    [...tables.sine, ...tables.cosine].every((v) =>
      integer(v, -65536, 65536),
    ), "original-genepod-trig-tables-required");
  const m = createMotion(0, 0, 0, 0);
  m.yaw = yaw;
  m.pitch = pitch;
  m.speed = speed;
  velocity(m, tables);
  return m;
}

/** Actual5A210 null-parent Mule numeric factory, including first-free pool
 * allocation, three random draws, preserved fractions/unknown bytes and born
 * counter. Full coherent300-slot pool returns null without drawing. */
export function initializeMuleNative(
  prior: GenepodNative,
  rngBefore: GeneRng,
  input: {
    slot: number;
    owner: number;
    position: [number, number];
    quality: number;
    parent?: GenepodNative;
    species?: number;
  },
  context: Pick<GenepodContext, "terrain" | "tables"> & { rules?: EcologyRules; speciesComponents?: readonly (readonly number[])[] },
): GenepodResult<{ native: GenepodNative; rng: GeneRng }> {
  return attempt(() => {
    native(prior, 124);
    require(byte(prior, 6) === 0 &&
      integer(input.slot, 0, 299) &&
      integer(input.owner, 0, 4) &&
      integer(input.quality, 0, 255) &&
      input.position.every((v) =>
        integer(v, 0, 32767),
      ), "invalid-mule-native-factory-input");
    if (input.parent) {
      native(input.parent, 124);
      require(byte(input.parent, 6) === 1 &&
        creatureSelector(byte(input.parent, 0x7a)) >= 0, "invalid-mule-parent");
    }
    const species = creatureSelector(input.species ?? 4),
      parameters = context.rules ? creatureParameters(context.rules, species) :
        species === 4 ? {lifetimeScale:19000,reserveScale:160,healthScale:80,turn:80} : null;
    require(parameters !== null, "actual-species-factory-rules-required");
    const components=species===4 && !context.speciesComponents ? [4,4] : creatureComponents(context.speciesComponents,species);
    const n = prior.slice(),
      rng = { ...rngBefore },
      slot = input.slot;
    const speed = nextRandom(rng) % 20 << 6,
      pitch = nextRandom(rng) % 256,
      yaw = nextRandom(rng) % 256 << 3;
    const ground = groundHeight(context.terrain, ...input.position),
      shade = effectTerrainShade(context.terrain, ...input.position),
      v = launchVector(yaw, pitch, speed, context.tables);
    n[0x7a] = species;
    n[2] = n[5] = 0;
    n[6] = 1;
    put(n, 15, slot);
    n[24] = input.owner;
    put(n, 7, input.position[0]);
    put(n, 9, input.position[1]);
    put32(n, 17, ground);
    n[23] = shade;
    n.fill(0, 11, 15);
    n[25] = ((((yaw >> 7) + 1) >> 1) + 1) & 7;
    n[26] = n[27] = n[29] = 0;
    n[28] = 1;
    put(n, 57, yaw);
    put(n, 59, pitch);
    put(n, 61, speed);
    put(n, 45, v.vx);
    put(n, 47, v.vy);
    put(n, 49, v.vz);
    n.fill(0, 51, 57);
    put32(n, 39, input.parent ? dword(input.parent, 39) : ground);
    put(n, 21, 0x280);
    put(n, 0x60, 0);
    put(n, 0x4b, yaw);
    put(n, 0x2b, parameters!.turn);
    n[0x53] = components[0]===1?0:1;
    n[0x54] = 0;
    n[0x4a] = byte(n, 0x4a) & 0x3b;
    n[0x76] = input.quality;
    const skill = (minimum: number) =>
      minimum + Math.trunc((Math.min(input.quality,100) * (100 - minimum)) / 100);
    const life = Math.trunc((parameters!.lifetimeScale * skill(30)) / 100),
      energy = input.parent ? life : life - (life >> 4),
      reserve = life >> 3;
    put(n, 0x66, energy);
    n[0x79] = 0;
    n[0x77] = Math.max(16, Math.trunc(((life - energy) * 255) / reserve));
    const hunger = byte(n, 0x77) + 1;
    put(n, 0x62, ((Math.trunc((parameters!.reserveScale * skill(40)) / 100) * hunger) >> 8) + 32);
    put(n, 0x64, ((Math.trunc((parameters!.healthScale * skill(30)) / 100) * hunger) >> 8) + 16);
    n[0x5e] = 8;
    n[0x5f] = 0;
    put(n, 0x6c, 0);
    put(n, 0x6a, word(n, 0x64));
    put(n, 0x68, word(n, 0x62));
    n[0x7b] = 255;
    n[0x61] = byte(n, 0x61) & 0x7f;
    n[0x78] = input.parent ? byte(input.parent, 0x78) : 0;
    put(n, 0x3f, 0);
    put(n, 0x49, word(n, 0x49) & 0xefe8);
    n[0x54] = 0;
    n[0x16] = byte(n, 0x16) & 0x3f;
    return { native: n, rng };
  });
}
export function createGenepodMule(
  before: GenepodPools,
  playersBefore: number[][],
  rngBefore: GeneRng,
  input: { owner: number; position: [number, number]; quality: number },
  context: Pick<GenepodContext, "terrain" | "tables">,
): GenepodResult<{
  pools: GenepodPools;
  players: number[][];
  rng: GeneRng;
  birth: GenepodBirth | null;
}> {
  return attempt(() => {
    playerRecords(playersBefore);
    poolValid(before.creatures, before.creatureCount, 300, 124);
    require(integer(input.owner, 0, 4) &&
      integer(input.quality, 0, 100) &&
      input.position.every((v) =>
        integer(v, 0, 32767),
      ), "invalid-genepod-mule-factory-input");
    const pools = poolClone(before),
      players = playersBefore.map((p) => p.slice()),
      rng = { ...rngBefore };
    if (before.creatureCount >= 300)
      return { pools, players, rng, birth: null };
    const slot = pools.creatures.findIndex((n) => byte(n, 6) === 0),
      n = pools.creatures[slot];
    const initialized = initializeMuleNative(
      n,
      rng,
      { ...input, slot },
      context,
    );
    if (!initialized.ok) throw new Error(initialized.reason);
    n.splice(0, n.length, ...initialized.value.native);
    Object.assign(rng, initialized.value.rng);
    pools.creatureCount++;
    if (input.owner !== 4)
      put32(
        players[input.owner],
        0x6f9,
        (dword(players[input.owner], 0x6f9) + 1) | 0,
      );
    return {
      pools,
      players,
      rng,
      birth: {
        family: 0 as const,
        slot,
        cell: worldCell(...input.position),
        native: n,
        resource: { kind: "creature" as const, selector: 4 as const },
      },
    };
  });
}

/** Full admitted completed grade0 source451F0 Genepod callback. Receipts are
 * committed with each birth's real spatial insertion/resource binding. A
 * failure anywhere rolls back payment, RNG, counts, research and all births. */
export function stepGenepod(
  before: GenepodState,
  context: GenepodContext,
): GenepodResult<GenepodReceipt> {
  return attempt(() => {
    stateValid(before);
    require(!!context.evidence.trim() &&
      integer(context.frame, 0, 0xffffffff), "genepod-source-context-required");
    const profile = context.runningAnimation;
    require(profile.holds.length === 4 &&
      profile.flags === 0 &&
      profile.holds.every((v) =>
        integer(v, 0, 255),
      ), "original-bgene-grade0-animation-required");
    const state = clone(before),
      b = state.building,
      owner = byte(b, 24),
      p = state.players[owner];
    require(byte(b, 46) === 0 &&
      (word(b, 49) & ~4) === 1, "unsupported-genepod-callback-state");
    require(p[1] === owner && p[0x4a1] < 4, "invalid-genepod-owner-player");
    const receipt: GenepodReceipt = {
      state,
      pools: null,
      status: "idle",
      paidBy: null,
      paid: 0,
      quality: null,
      roll: null,
      births: [],
      audio: [],
      queueRequested: true,
    };
    let energy = i16(word(b, 61) - byte(b, 63));
    if (energy <= 0) {
      energy = 0;
      b[49] = byte(b, 49) & ~4;
      if (word(p, 0x5ea) === 0) put(p, 0x5ea, 1000);
    }
    put(b, 61, energy);
    const remaining = dword(b, 54);
    if (remaining > 0) {
      require(byte(b, 51) === 4, "unsupported-genepod-species");
      b[63] = 3;
      if (!(word(b, 49) & 4) && context.frame % 6 !== 0)
        receipt.status = "frame-wait";
      else if (((dword(p, 0x4a3) + dword(p, 0x4a7)) | 0) < 1)
        receipt.status = "funds-wait";
      else {
        const payer = p[2] === 0 ? byte(b, 58) : owner;
        require(integer(payer, 0, 3) &&
          state.players[payer][0x4a1] < 4, "invalid-genepod-payer");
        const paying = state.players[payer];
        debit(paying, 1, state.players[paying[0x4a1]][2]);
        put32(b, 54, remaining - 1);
        receipt.paidBy = payer;
        receipt.paid = 1;
        receipt.status = "working";
        if (remaining === 1) {
          b[27] = 1;
          const quality = Math.min(dword(paying, 0x62a) >> 11, 100),
            roll = nextRandom(state.rng) % 100;
          receipt.quality = quality;
          receipt.roll = roll;
          require(context.pools !==
            undefined, "actual-genepod-factory-pools-required");
          const position: [number, number] = [word(b, 7), word(b, 9)];
          if (roll <= ((quality * 2) | 0)) {
            receipt.audio.push({ cue: 0x1a, mode: 2 });
            const result = createGenepodMule(
              context.pools,
              state.players,
              state.rng,
              { owner: payer, position, quality: quality & 255 },
              context,
            );
            require(result.ok, result.ok ? "" : result.reason);
            const made = result.value;
            receipt.pools = made.pools;
            state.players = made.players;
            state.rng = made.rng;
            if (made.birth) {
              const speed = 3840 + 64 * (nextRandom(state.rng) % 100),
                pitch = 2 * (nextRandom(state.rng) % 50),
                yaw = 8 * nextRandom(state.rng),
                n = made.birth.native;
              const v = launchVector(yaw, pitch, speed, context.tables);
              put(n, 57, yaw);
              put(n, 59, pitch);
              put(n, 61, speed);
              put(n, 45, v.vx);
              put(n, 47, v.vy);
              put(n, 49, v.vz);
              put32(n, 39, (dword(n, 39) + 3840) | 0);
              put(b, 58, made.birth.slot);
              research(state.players[payer], 2048);
              receipt.births.push(made.birth);
              receipt.status = "mule-born";
            } else {
              put(b, 58, 301);
              receipt.status = "creature-pool-full";
            }
          } else {
            receipt.status = "quality-failed";
            put(b, 58, 301);
            receipt.audio.push({ cue: 8, mode: 2 });
            const parameter = 50 + (nextRandom(state.rng) % 100),
              cue = 28 + (nextRandom(state.rng) % 3),
              count = 3 + (nextRandom(state.rng) % 6);
            receipt.audio.push({ cue, mode: 2, parameter });
            poolValid(
              context.pools.effects,
              context.pools.effectCount,
              200,
              81,
            );
            const pools = poolClone(context.pools);
            receipt.pools = pools;
            for (let index = 0; index < count; index++) {
              const speed = 8192 + 64 * (nextRandom(state.rng) % 128),
                pitch = 2 * (nextRandom(state.rng) % 150),
                yaw = 8 * nextRandom(state.rng);
              require(pools.effectCount <
                200, "genepod-effect-priority-replacement-required");
              const slot = pools.effects.findIndex((n) => byte(n, 6) === 0),
                v = launchVector(yaw, pitch, speed, context.tables);
              require(slot >= 0, "genepod-pool-count-mismatch");
              const ground = groundHeight(context.terrain, ...position),
                n = effectFactoryPrior(pools.effects[slot], {
                  slot,
                  code: 32,
                  owner: 0,
                  x: position[0],
                  y: position[1],
                  ground,
                  height: (dword(b, 17) + 3840) | 0,
                  shade: effectTerrainShade(context.terrain, ...position),
                  vx: v.vx,
                  vy: v.vy,
                  vz: v.vz,
                  accelerationZ: 0,
                  yaw,
                  pitch,
                  speed,
                  delay: 0,
                });
              put(n, 21, 0);
              n[73] = 0;
              pools.effects[slot] = n;
              pools.effectCount++;
              receipt.births.push({
                family: 4,
                slot,
                cell: worldCell(...position),
                native: n,
                resource: { kind: "effect", selector: 32 },
              });
            }
            research(state.players[payer], 2048);
          }
        }
      }
    }
    commonTail(before.building, b, profile);
    return receipt;
  });
}
