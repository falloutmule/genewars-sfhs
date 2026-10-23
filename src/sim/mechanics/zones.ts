/** Source7A280 ->793C0/796E0/79980 ->792C0/80780 marked-zone family.
 * Raw mission/player state and shared effect/spatial state are authoritative.
 * Entry points clone their complete input and commit only by returning it. */
import { nextRandom, type GeneRng } from "./random";
import {
  createMotion,
  velocity,
  originalAngle,
  terrainNormal,
  type MotionTables,
} from "./motion";
import {
  groundHeight,
  worldCell,
  integerSqrt,
  readWord,
  type TerrainState,
} from "./terrain";
import { ecologyTerrainClass } from "./ecology";
import {
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
} from "./animation";
import {
  effectFactoryPrior,
  effectPriorByte,
  effectTerrainShade,
  putEffectWord,
  putEffectDword,
  retireEffectPrior,
  validateEffectNativePrior,
  type EffectNativePrior,
  type PowerEffectPool,
} from "./power-motion";
import {
  insertSpatial,
  moveSpatial,
  unlinkSpatial,
  validateSpatial,
  type SpatialState,
} from "../campaign/spatial";
import type { SourceEntityId } from "../campaign/source-pools";

export interface ZoneRules {
  schemaVersion: 1;
  speciesComponents: [number, number][];
  zoneTextIndices: number[];
  terrainLightVector: [number, number, number];
}
export interface ZoneRecord {
  index: number;
  native: (number | null)[];
}
/**47/0x2F zone trail and60/0x3C score marker. Both have six-frame EFF
 * resources, no selector damping, no obstacle/water virtual callbacks. */
export type ZoneEffectCode = 47 | 60;
export interface ZoneEffect {
  slot: number;
  code: ZoneEffectCode;
  native: EffectNativePrior;
}
export interface ZoneState {
  missionPrefix: number[];
  players: { id: number; raw: number[] }[];
  creatures: ZoneRecord[];
  plants: ZoneRecord[];
  buildings: ZoneRecord[];
  visitors: ZoneRecord[];
  effects: ZoneEffect[];
  powerEffects: PowerEffectPool;
  spatial: SpatialState;
  terrain: TerrainState;
  rng: GeneRng;
}
export interface ZoneVisitorRequest {
  mode: 2;
  zone: number;
  position: [number, number];
  height: number;
}
export interface ZoneContext {
  frame: number;
  participatingPlayers: number;
  selectedPlayer: number;
  rules: ZoneRules;
  tables: MotionTables;
  bounce: readonly number[];
  gravity: number;
  profile(code: ZoneEffectCode): AnimationProfile;
  /** Source112D14 scratch yaw, read by plant/building trails only. */
  tailYaw?: number;
  /**101D0 mode2 full family8 factory. Operate on this staged state (or an
   * enclosing host transaction) and return the actual slot/null on capacity. */
  visitor?(state: ZoneState, request: ZoneVisitorRequest): number | null;
  /**724C0 cross-family references/UI port, called after unlink but BEFORE a
   * replacement factory reuses the identity. Never mutate the caller's world. */
  cleanup?(state: ZoneState, dead: SourceEntityId): void;
  /** Descriptor104EB6 priority for an otherwise unadmitted occupied selector. */
  effectPriority?(code: number): number;
}
export type ZoneEvent =
  | {
      type: "zone-credit" | "zone-penalty";
      zone: number;
      family: number;
      index: number;
      player: number;
      amount: number;
    }
  | {
      type: "zone-audio";
      family: number;
      index: number;
      channel: 57;
      mode: 2;
      parameter: 1;
      volume: 30;
      duration: 200;
    }
  | { type: "zone-warning"; player: number; textIndex: 70 }
  | {
      type: "effect-created";
      slot: number;
      code: ZoneEffectCode;
      journals: number[];
    }
  | { type: "effect-factory-failed"; code: ZoneEffectCode }
  | { type: "effect-retired"; slot: number; code: number }
  | {
      type: "zone-completed" | "zone-activated";
      zone: number;
      textIndex: number;
    }
  | {
      type: "zone-terrain";
      zone: number;
      activate: boolean;
      points: [number, number][];
    }
  | { type: "zone-visitor"; request: ZoneVisitorRequest; slot: number | null }
  | { type: "visitor-departure"; index: number; zone: number };
export interface ZoneQuery {
  zone: number;
  family: number;
  index: number;
  inside: boolean;
  eligible: boolean;
}
export interface ZoneReceipt {
  state: ZoneState;
  events: ZoneEvent[];
  queries: ZoneQuery[];
}
const BASE = 0x2ff8,
  STRIDE = 19;
const integer = (v: number, min: number, max: number, name: string) => {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new Error("Invalid zone " + name);
};
function byte(raw: readonly (number | null)[], at: number): number {
  const value = raw[at];
  if (
    value === null ||
    value === undefined ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 255
  )
    throw new Error("Unknown/invalid zone numeric byte " + at);
  return value;
}
const word = (raw: readonly (number | null)[], at: number) =>
  ((byte(raw, at) | (byte(raw, at + 1) << 8)) << 16) >> 16;
const dword = (raw: readonly (number | null)[], at: number) =>
  byte(raw, at) |
  (byte(raw, at + 1) << 8) |
  (byte(raw, at + 2) << 16) |
  (byte(raw, at + 3) << 24);
const wrap = (v: number) => (v << 16) >> 16;
const effectId = (slot: number): SourceEntityId => `source:4:${slot}`;
const identity = (family: number, index: number) =>
  `source:${family}:${index}` as SourceEntityId;
const point = (n: readonly (number | null)[]): [number, number] => [
  word(n, 7),
  word(n, 9),
];
function distance(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const x = wrap(a[0] * 2 - b[0] * 2) >> 1,
    y = wrap(a[1] * 2 - b[1] * 2) >> 1;
  return (Math.imul(x, x) + Math.imul(y, y)) >>> 0;
}
function ordered(
  records: readonly ZoneRecord[],
  capacity: number,
): ZoneRecord[] {
  const ids = new Set<number>();
  for (const r of records) {
    integer(r.index, 0, capacity - 1, "record index");
    if (ids.has(r.index)) throw new Error("Duplicate zone record identity");
    ids.add(r.index);
  }
  return [...records].sort((a, b) => a.index - b.index);
}
function rules(c: ZoneContext): void {
  integer(c.frame, 0, 0xffffffff, "frame");
  integer(c.participatingPlayers, 0, 4, "participating players");
  integer(c.selectedPlayer, 0, 3, "selected player");
  integer(c.gravity, -32768, 32767, "gravity");
  if (
    c.rules.schemaVersion !== 1 ||
    c.rules.speciesComponents.length !== 25 ||
    c.rules.zoneTextIndices.length !== 14 ||
    c.rules.terrainLightVector.length !== 3
  )
    throw new Error("Original zone numeric profile is required");
  for (const pair of c.rules.speciesComponents) {
    if (pair.length !== 2) throw new Error("Invalid zone gene pair");
    pair.forEach((v) => integer(v, 0, 4, "gene category"));
  }
  c.rules.zoneTextIndices.forEach((v) => integer(v, 0, 255, "label index"));
  c.rules.terrainLightVector.forEach((v) =>
    integer(v, -0x80000000, 0x7fffffff, "light vector"),
  );
  if (
    c.tables.atan.length !== 257 ||
    c.tables.sine.length !== 2048 ||
    c.tables.cosine.length !== 2048 ||
    c.bounce.length !== 8
  )
    throw new Error("Original zone motion/bounce tables are required");
  c.tables.atan.forEach((v) => integer(v, 0, 256, "atan value"));
  [...c.tables.sine, ...c.tables.cosine].forEach((v) =>
    integer(v, -65536, 65536, "trig value"),
  );
  c.bounce.forEach((v) => integer(v, -32768, 32767, "bounce value"));
}
function profile(
  c: Pick<ZoneContext, "profile">,
  code: ZoneEffectCode,
): AnimationProfile {
  if (code !== 47 && code !== 60)
    throw new Error("Unsupported zone effect selector");
  const p = c.profile(code);
  if (p.flags !== 0 || p.holds.length !== 6 || p.holds.some((v) => v !== 0))
    throw new Error(
      "Original EFF47/60 six-frame zero-hold profile is required",
    );
  return p;
}
function activeCount(
  records: readonly ZoneRecord[],
  expected: number,
  kind: number,
  name: string,
): void {
  const active = records.filter((r) => byte(r.native, 6) !== 0);
  if (active.length !== expected || expected < 0)
    throw new Error("Zone " + name + " count differs from actual records");
  for (const r of active)
    if (byte(r.native, 6) !== kind || word(r.native, 15) !== r.index)
      throw new Error("Zone record kind/index binding differs");
}
function poolCount(s: ZoneState): number {
  if (s.powerEffects.slots.length !== 200)
    throw new Error("Zone shared effect capacity must be200");
  const count = s.powerEffects.slots.filter((slot) => slot.occupied).length;
  if (word(s.missionPrefix, 0x3554) !== count)
    throw new Error("Zone shared effect count differs from occupancy");
  return count;
}
function links(s: ZoneState): void {
  const groups: [number, ZoneRecord[]][] = [
    [0, s.creatures],
    [1, s.plants],
    [3, s.buildings],
    [7, s.visitors],
  ];
  const write = (family: number, index: number, n: (number | null)[]) => {
    const node = s.spatial.nodes[identity(family, index)];
    if (!node) return;
    const previous = node.previous ? s.spatial.nodes[node.previous] : null,
      next = node.next ? s.spatial.nodes[node.next] : null;
    putEffectWord(n, 0, previous ? previous.index : node.cell);
    n[2] = previous ? previous.family + 1 : 0;
    if (next) putEffectWord(n, 3, next.index);
    n[5] = next ? next.family + 1 : 0;
  };
  for (const [family, records] of groups)
    for (const r of records)
      if (byte(r.native, 6)) write(family, r.index, r.native);
  for (const [slot, item] of s.powerEffects.slots.entries())
    if (item.nativePrior && item.occupied) write(4, slot, item.nativePrior);
  for (const e of s.effects)
    if (s.powerEffects.slots[e.slot].nativePrior)
      e.native = s.powerEffects.slots[e.slot].nativePrior!;
}
function retire(
  s: ZoneState,
  slot: number,
  c: ZoneContext,
  events: ZoneEvent[],
): void {
  const shared = s.powerEffects.slots[slot],
    native = shared?.nativePrior;
  if (!shared?.occupied || !native || !s.spatial.nodes[effectId(slot)])
    throw new Error("Zone retirement identity is missing");
  const code = effectPriorByte(native, 69);
  if (!c.cleanup)
    throw new Error("Zone effect retirement requires source reference cleanup");
  unlinkSpatial(s.spatial, s.terrain, effectId(slot));
  c.cleanup(s, effectId(slot));
  shared.nativePrior = retireEffectPrior(shared.nativePrior!, slot);
  shared.occupied = false;
  shared.packet = null;
  shared.fractionX = shared.nativePrior[67];
  shared.fractionY = shared.nativePrior[68];
  s.effects = s.effects.filter((e) => e.slot !== slot);
  putEffectWord(s.missionPrefix, 0x3554, word(s.missionPrefix, 0x3554) - 1);
  events.push({ type: "effect-retired", slot, code });
  links(s);
}
function allocate(
  s: ZoneState,
  code: ZoneEffectCode,
  c: ZoneContext,
  events: ZoneEvent[],
): number | null {
  const count = poolCount(s),
    free = s.powerEffects.slots.findIndex((slot) => !slot.occupied);
  if (count < 200) {
    if (free < 0) throw new Error("Zone free effect count differs");
    return free;
  }
  const ranks: Record<number, number> = {
    6: 27,
    21: 19,
    22: 20,
    26: 35,
    33: 1,
    47: 35,
    48: 20,
    49: 1,
    60: 11,
  };
  let priority = ranks[code],
    selected: number | null = null;
  for (const [slot, item] of s.powerEffects.slots.entries()) {
    if (!item.nativePrior)
      throw new Error("Zone replacement requires current native effect priors");
    const candidate = effectPriorByte(item.nativePrior, 69),
      rank = ranks[candidate] ?? c.effectPriority?.(candidate);
    if (rank === undefined)
      throw new Error(
        "Zone replacement priority is not admitted for effect " + candidate,
      );
    integer(rank, 0, 255, "effect priority");
    if (rank > priority && !(effectPriorByte(item.nativePrior, 21) & 1)) {
      priority = rank;
      selected = slot;
    }
  }
  if (selected !== null) retire(s, selected, c, events);
  return selected;
}
function factory(
  s: ZoneState,
  code: ZoneEffectCode,
  owner: number,
  at: [number, number],
  height: number,
  angles: [number, number, number],
  c: ZoneContext,
  events: ZoneEvent[],
  journals: number[],
): number | null {
  profile(c, code);
  for (const angle of angles.slice(0, 2))
    integer(angle, -1536, 2559, "factory angle");
  integer(angles[2], 0, 32767, "factory speed");
  integer(owner, 0, 4, "factory owner");
  const slot = allocate(s, code, c, events);
  if (slot === null) {
    events.push({ type: "effect-factory-failed", code });
    return null;
  }
  const shared = s.powerEffects.slots[slot],
    prior = shared.nativePrior;
  if (!prior || shared.fractionX === null || shared.fractionY === null)
    throw new Error(
      "Zone factory requires the actual shared native/fraction prior",
    );
  validateEffectNativePrior(prior);
  effectPriorByte(prior, 30);
  const ground = groundHeight(s.terrain, ...at),
    m = createMotion(...at, ground, 0);
  m.yaw = angles[0];
  m.pitch = angles[1];
  m.speed = angles[2];
  velocity(m, c.tables);
  const n = effectFactoryPrior(prior, {
    slot,
    code,
    owner,
    x: at[0],
    y: at[1],
    ground,
    height,
    shade: effectTerrainShade(s.terrain, ...at),
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    accelerationZ: -(c.gravity >> 6),
    yaw: angles[0],
    pitch: angles[1],
    speed: angles[2],
    delay: 0,
  });
  n[67] = shared.fractionX;
  n[68] = shared.fractionY;
  shared.occupied = true;
  shared.packet = null;
  shared.nativePrior = n;
  insertSpatial(s.spatial, s.terrain, effectId(slot), worldCell(...at));
  putEffectWord(s.missionPrefix, 0x3554, word(s.missionPrefix, 0x3554) + 1);
  n[29] = 1 + (nextRandom(s.rng) % 3);
  journals.push(0x229);
  s.effects.push({ slot, code, native: n });
  links(s);
  events.push({ type: "effect-created", slot, code, journals });
  return slot;
}
function marker(
  s: ZoneState,
  subject: ZoneRecord,
  family: number,
  c: ZoneContext,
  events: ZoneEvent[],
): void {
  // Type1 getters1F270/1F260 use physical39 and relative39-ground17.
  // Plant constructor1E3E0/vtable1120AC and building112120 instead bind
  // getters1F450/1F440: physical=ground17 and relative=0.
  const n = subject.native,
    height = dword(n, family === 0 ? 39 : 17),
    relative = family === 0 ? (height - dword(n, 17)) | 0 : 0;
  const speed = ((nextRandom(s.rng) % 10) + 10) * 64,
    p = nextRandom(s.rng),
    yaw = (nextRandom(s.rng) % 128) * 16;
  factory(
    s,
    60,
    byte(n, 24),
    point(n),
    height,
    [yaw, relative < 128 ? p % 150 : (p % 128) * 8, speed],
    c,
    events,
    [0xf6, 0xf6, 0xf6],
  );
}
/** One6D500 score-marker iteration (60/0x3C, variation0, base10/divisor10,
 * inherited owner). Useful for isolated factory conformance and shared hosts. */
export function createZoneScoreMarker(
  before: ZoneState,
  creatureIndex: number,
  c: ZoneContext,
): ZoneReceipt {
  const state = structuredClone(before),
    events: ZoneEvent[] = [],
    subject = state.creatures.find((r) => r.index === creatureIndex);
  if (
    !subject ||
    byte(subject.native, 6) !== 1 ||
    word(subject.native, 15) !== creatureIndex
  )
    throw new Error("Zone score marker creature is missing");
  rules(c);
  validateSpatial(state.spatial);
  poolCount(state);
  marker(state, subject, 0, c, events);
  links(state);
  validateSpatial(state.spatial);
  return { state, events, queries: [] };
}
function reward(
  s: ZoneState,
  player: number,
  amount: number,
  subject: ZoneRecord,
  family: number,
  zone: number,
  c: ZoneContext,
  events: ZoneEvent[],
): void {
  const p = s.players.find((p) => p.id === player);
  if (!p || p.raw.length !== 1805)
    throw new Error("Zone player state is missing");
  putEffectDword(p.raw, 13, (dword(p.raw, 13) + amount) | 0);
  putEffectDword(
    p.raw,
    17,
    Math.min(
      (dword(p.raw, 17) + amount) | 0,
      (word(s.missionPrefix, 0x1c7c) & 65535) * 2,
    ),
  );
  events.push({
    type: "zone-credit",
    zone,
    family,
    index: subject.index,
    player,
    amount,
  });
  events.push({
    type: "zone-audio",
    family,
    index: subject.index,
    channel: 57,
    mode: 2,
    parameter: 1,
    volume: 30,
    duration: 200,
  });
  for (let i = 0; i < (Math.max(1, amount >> 3) & 255); i++)
    marker(s, subject, family, c, events);
}
function credit(
  s: ZoneState,
  zone: number,
  weight: number,
  subject: ZoneRecord,
  family: number,
  c: ZoneContext,
  events: ZoneEvent[],
): boolean {
  const p = BASE + zone * STRIDE,
    capped = Math.min(weight, dword(s.missionPrefix, p + 14));
  if (capped <= 0) return false;
  const owner = byte(subject.native, 24);
  integer(owner, 0, 4, "subject owner");
  const amount = owner === 4 ? capped >> 2 : capped;
  putEffectDword(
    s.missionPrefix,
    p + 14,
    (dword(s.missionPrefix, p + 14) - amount) | 0,
  );
  for (let player = 0; player < c.participatingPlayers; player++) {
    if (owner === 4 || owner === player)
      reward(s, player, amount, subject, family, zone, c, events);
    else if (amount >> 2 > 0) {
      if (player === c.selectedPlayer)
        events.push({ type: "zone-warning", player, textIndex: 70 });
      const state = s.players.find((p) => p.id === player);
      if (!state) throw new Error("Zone penalty player state is missing");
      if (dword(state.raw, 0x49d) >>> 0 > 0) {
        putEffectDword(
          state.raw,
          17,
          Math.max(
            (dword(state.raw, 17) - (amount >> 2)) | 0,
            -(word(s.missionPrefix, 0x1c78) & 65535),
          ),
        );
        events.push({
          type: "zone-penalty",
          zone,
          family,
          index: subject.index,
          player,
          amount: amount >> 2,
        });
      }
    }
  }
  return amount > 0;
}
function trail(
  s: ZoneState,
  subject: ZoneRecord,
  family: number,
  c: ZoneContext,
  events: ZoneEvent[],
): void {
  const owner = byte(subject.native, 24),
    journals = [family === 0 ? 0xcf2 : family === 1 ? 0xd1a : 0xd3e];
  const base = family === 0 ? word(subject.native, 57) : c.tailYaw;
  if (base === undefined)
    throw new Error(
      "Source112D14 scratch yaw required for plant/building zone trail",
    );
  integer(base, -32768, 32767, "trail yaw");
  const yaw =
      family === 0
        ? (base + 1920 + (nextRandom(s.rng) % 256)) & 2047
        : wrap(base + (nextRandom(s.rng) % 256) * 8),
    pitch = nextRandom(s.rng) % 128;
  journals.push(family === 0 ? 0xcf3 : family === 1 ? 0xd1b : 0xd3f);
  const effectOwner = owner === 4 ? nextRandom(s.rng) % 4 : owner;
  if (owner === 4) journals.push(family === 0 ? 0xcf5 : 0xd1d);
  factory(
    s,
    47,
    effectOwner,
    point(subject.native),
    family === 0 ? dword(subject.native, 39) : 0,
    [yaw, pitch, family === 3 ? 384 : 512],
    c,
    events,
    journals,
  );
}
/**8C290 applies the two source normals in call order. Values are source
 * signed words; even water shade keeps its signed division/wrapping. */
function relight(s: ZoneState, cell: number, c: ZoneContext): void {
  const p = cell * 14;
  let value: number;
  if ((s.terrain.bytes[p + 5] & 7) === 0) {
    const water = word(s.missionPrefix, 0x1c63);
    if (!water) throw new Error("Zone water relight divisor is zero");
    value = wrap(
      8192 -
        Math.trunc(
          (((water - readWord(s.terrain, cell, 2)) << 12) | 0) / water,
        ),
    );
  } else {
    const x = wrap((cell & 127) * 256 - 16),
      y = wrap((cell >> 7) * 256 - 2),
      normals = [
        terrainNormal(s.terrain, x, y),
        terrainNormal(s.terrain, x, wrap(y + 4)),
      ];
    let sum = 0;
    for (const normal of normals)
      for (let axis = 0; axis < 3; axis++)
        sum =
          (sum +
            (Math.imul(normal[axis], c.rules.terrainLightVector[axis]) >> 8)) |
          0;
    const average = Math.trunc(sum / 2);
    value =
      average < -164
        ? 8192
        : Math.max(
            0xf00,
            wrap(
              8192 -
                Math.trunc(((Math.imul(average + 256, 3) << 12) | 0) / 512),
            ),
          );
  }
  putEffectWord(s.terrain.bytes, p, value);
}
/**79D50 light/reveal changes and84B40's four linked-cell shade callbacks.
 * Viewport strip invalidation is returned as ordered points, not hidden UI. */
function terrainZone(
  s: ZoneState,
  zone: number,
  activate: boolean,
  c: ZoneContext,
  events: ZoneEvent[],
): void {
  const p = BASE + zone * STRIDE,
    center: [number, number] = [
      word(s.missionPrefix, p),
      word(s.missionPrefix, p + 2),
    ],
    radius = dword(s.missionPrefix, p + 6),
    ground = groundHeight(s.terrain, ...center),
    points: [number, number][] = [];
  integer(radius, 0, 32767, "terrain radius");
  const start = center.map((v) => (wrap(v - radius) & 65535) >> 8),
    end = center.map((v) => (((wrap(v + radius) & 65535) >> 8) + 1) & 255),
    width = (end[0] - start[0]) & 255,
    height = (end[1] - start[1]) & 255;
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const at: [number, number] = [
          wrap(((start[0] + col) & 255) << 8),
          wrap(((start[1] + row) & 255) << 8),
        ],
        cell = worldCell(...at),
        offset = cell * 14,
        z = (groundHeight(s.terrain, ...at) - ground) >> 3,
        d = (distance(at, center) + Math.imul(z, z)) | 0;
      relight(s, cell, c);
      if (activate && d < Math.imul(radius - 512, radius - 512)) {
        // Source ADD highbyte11 wraps before the signed-word cap.
        s.terrain.bytes[offset + 1] =
          (s.terrain.bytes[offset + 1] + 0x11) & 255;
        putEffectWord(
          s.terrain.bytes,
          offset,
          Math.min(readWord(s.terrain, cell, 0), 0x3000),
        );
        s.terrain.bytes[offset + 12] = 63;
      } else if (activate && d < Math.imul(radius, radius)) {
        const delta = radius - integerSqrt(d >>> 0) - 1;
        putEffectWord(
          s.terrain.bytes,
          offset,
          Math.min(
            wrap(
              readWord(s.terrain, cell, 0) + Math.trunc((delta * 0x1100) / 512),
            ),
            0x3000,
          ),
        );
        s.terrain.bytes[offset + 12] =
          Math.max(
            s.terrain.bytes[offset + 12],
            Math.trunc((delta * 64) / 512),
          ) & 255;
      }
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [-1, -1],
        [0, -1],
      ]) {
        const corner =
          (((cell >> 7) + dy) & 127) * 128 + (((cell & 127) + dx) & 127);
        s.terrain.bytes[corner * 14 + 11] |= 12;
        let next = s.spatial.heads[corner];
        const visited = new Set<string>();
        while (next) {
          if (visited.has(next))
            throw new Error("Zone terrain linked-cell cycle");
          visited.add(next);
          const node = s.spatial.nodes[next];
          if (!node) throw new Error("Zone terrain link target is missing");
          next = node.next;
          const record =
            node.family === 1
              ? s.plants.find((r) => r.index === node.index)
              : node.family === 3
                ? s.buildings.find((r) => r.index === node.index)
                : undefined;
          if ((node.family === 1 || node.family === 3) && !record)
            throw new Error("Zone terrain native shade target is missing");
          if (record && !(byte(record.native, 21) & 2))
            record.native[23] = effectTerrainShade(
              s.terrain,
              ...point(record.native),
            );
        }
      }
      points.push(at);
    }
  s.terrain.revision++;
  events.push({ type: "zone-terrain", zone, activate, points });
}
function exhaust(
  s: ZoneState,
  zone: number,
  count: number,
  c: ZoneContext,
  events: ZoneEvent[],
): void {
  const p = BASE + zone * STRIDE,
    selector = byte(s.missionPrefix, p + 4);
  if (dword(s.missionPrefix, p + 14) === 0)
    putEffectDword(s.missionPrefix, p + 10, 0);
  if (dword(s.missionPrefix, p + 10) !== 0) return;
  s.missionPrefix[0x34b9] = (byte(s.missionPrefix, 0x34b9) + 1) & 255;
  events.push({
    type: "zone-completed",
    zone,
    textIndex: c.rules.zoneTextIndices[selector] + 46,
  });
  const next = (byte(s.missionPrefix, p + 5) << 24) >> 24;
  if (next >= 0) {
    if (next >= count)
      throw new Error("Zone chain target is outside declared zones");
    const q = BASE + next * STRIDE,
      quota = dword(s.missionPrefix, q + 10);
    if (quota !== 0) {
      putEffectDword(s.missionPrefix, q + 14, quota);
      terrainZone(s, next, true, c, events);
      const at: [number, number] = [
          word(s.missionPrefix, q),
          word(s.missionPrefix, q + 2),
        ],
        request: ZoneVisitorRequest = {
          mode: 2,
          zone: next,
          position: at,
          height: (groundHeight(s.terrain, ...at) + 32000) | 0,
        };
      if (!c.visitor)
        throw new Error("Zone activation requires source101D0 family8 factory");
      const slot = c.visitor(s, request);
      events.push({ type: "zone-visitor", request, slot });
      events.push({
        type: "zone-activated",
        zone: next,
        textIndex: c.rules.zoneTextIndices[byte(s.missionPrefix, q + 4)] + 45,
      });
    }
  }
  terrainZone(s, zone, false, c, events);
  for (const visitor of ordered(s.visitors, 16))
    if (
      byte(visitor.native, 6) &&
      byte(visitor.native, 85) === 2 &&
      byte(visitor.native, 88) === zone
    ) {
      visitor.native[87] = 1;
      events.push({ type: "visitor-departure", index: visitor.index, zone });
    }
}
/**72AD0 invokes79D50 for each positive-quota zone, then creates its actual
 *101D0 selector2 marker. No observation counter is synthesized here. */
export function initializeZones(
  before: ZoneState,
  c: ZoneContext,
  createMarkers = true,
): ZoneReceipt {
  const s = structuredClone(before),
    events: ZoneEvent[] = [];
  const count = byte(s.missionPrefix, 0x34b8);
  if (!count) return { state: s, events, queries: [] };
  integer(count, 0, 4, "count");
  rules(c);
  validateSpatial(s.spatial);
  poolCount(s);
  for (let zone = 0; zone < count; zone++) {
    const p = BASE + zone * STRIDE;
    if (dword(s.missionPrefix, p + 14) <= 0) continue;
    terrainZone(s, zone, true, c, events);
    if (!createMarkers) continue;
    const at: [number, number] = [
      word(s.missionPrefix, p),
      word(s.missionPrefix, p + 2),
    ];
    const request: ZoneVisitorRequest = {
      mode: 2,
      zone,
      position: at,
      height: (groundHeight(s.terrain, ...at) + 32000) | 0,
    };
    if (!c.visitor)
      throw new Error("Zone bootstrap requires source101D0 marker factory");
    const slot = c.visitor(s, request);
    events.push({ type: "zone-visitor", request, slot });
  }
  links(s);
  validateSpatial(s.spatial);
  poolCount(s);
  return { state: s, events, queries: [] };
}
/** Source7A280 pre-actor phase. A countdown/empty-list return precedes all
 * profile/family admissions, exactly as the original early branches do. */
export function stepZones(before: ZoneState, c: ZoneContext): ZoneReceipt {
  const s = structuredClone(before),
    events: ZoneEvent[] = [],
    queries: ZoneQuery[] = [];
  if (s.missionPrefix.length !== 0x355e)
    throw new Error("Original zone mission prefix extent required");
  const count = byte(s.missionPrefix, 0x34b8);
  if (word(s.missionPrefix, 0x355c) !== 0 || count === 0)
    return { state: s, events, queries };
  rules(c);
  integer(count, 0, 4, "count");
  validateSpatial(s.spatial);
  poolCount(s);
  const creatures = ordered(s.creatures, 300),
    plants = ordered(s.plants, 512),
    buildings = ordered(s.buildings, 256);
  for (let zone = 0; zone < count; zone++) {
    const p = BASE + zone * STRIDE;
    if (
      dword(s.missionPrefix, p + 14) <= 0 ||
      (byte(s.missionPrefix, p + 18) << 24) >> 24 <= 0
    )
      continue;
    const selector = byte(s.missionPrefix, p + 4);
    integer(selector, 0, 13, "selector");
    const radius = dword(s.missionPrefix, p + 6),
      center: [number, number] = [
        word(s.missionPrefix, p),
        word(s.missionPrefix, p + 2),
      ];
    integer(radius, 0, 32767, "radius");
    const inside = (record: ZoneRecord, family: number, eligible: boolean) => {
      const hit =
        distance(point(record.native), center) <=
        Math.imul(radius, radius) >>> 0;
      queries.push({
        zone,
        family,
        index: record.index,
        eligible,
        inside: hit,
      });
      return eligible && hit;
    };
    if (selector >= 7 && selector <= 12 && (c.frame & 63) === 0) {
      activeCount(creatures, word(s.missionPrefix, 0x3550), 1, "creature");
      const category = selector === 7 ? 5 : selector - 8;
      for (const record of creatures) {
        if (!byte(record.native, 6)) continue;
        const state = byte(record.native, 94);
        if (state >= 24 || state === 15) {
          queries.push({
            zone,
            family: 0,
            index: record.index,
            eligible: false,
            inside: false,
          });
          continue;
        }
        if (!inside(record, 0, true)) continue;
        let credited = false;
        if (category === 5)
          credited = credit(s, zone, 10, record, 0, c, events);
        else {
          const species = byte(record.native, 122);
          integer(species, 0, 24, "creature selector");
          const pair = c.rules.speciesComponents[species];
          if (pair[0] === category)
            credited = credit(s, zone, 16, record, 0, c, events);
          if (pair[1] === category)
            credited = credit(s, zone, 8, record, 0, c, events);
        }
        if (credited) trail(s, record, 0, c, events);
      }
    }
    if (selector === 7 && ((c.frame + 16) & 63) === 0) {
      activeCount(plants, word(s.missionPrefix, 0x3552), 2, "plant");
      for (const record of plants)
        if (
          byte(record.native, 6) &&
          inside(record, 1, true) &&
          credit(s, zone, 8, record, 1, c, events)
        )
          trail(s, record, 1, c, events);
    }
    if (selector === 13 && ((c.frame + 32) & 63) === 0) {
      for (let owner = 0; owner < c.participatingPlayers; owner++) {
        const player = s.players.find((p) => p.id === owner);
        if (!player) throw new Error("Zone research player is missing");
        if (!byte(player.raw, 0x607)) continue;
        for (const record of buildings.filter(
          (r) => Math.floor(r.index / 64) === owner,
        )) {
          if (!byte(record.native, 6) || byte(record.native, 45) !== 7)
            continue;
          const flags = word(record.native, 49),
            eligible = (flags & 5) === 5 && !(flags & 64);
          if (
            inside(record, 3, eligible) &&
            credit(s, zone, 64, record, 3, c, events)
          )
            trail(s, record, 3, c, events);
        }
      }
    }
    exhaust(s, zone, count, c, events);
  }
  links(s);
  validateSpatial(s.spatial);
  poolCount(s);
  return { state: s, events, queries };
}
export interface ZoneEffectUpdate {
  native: EffectNativePrior;
  retirementRequired: boolean;
  /** Ordered7B380 sample points. Grounded motion has a real second sample. */
  samples: [number, number][];
}
/** One60/0x3C or47/0x2F native callback for an external shared scheduler.
 * Source virtual70/90 are false, so obstacle/water queries are skipped.
 *6DF30 physics precedes EFF7AC00; no selector damping or RNG follows. */
export function stepZoneEffectRecord(
  before: readonly (number | null)[],
  code: ZoneEffectCode,
  terrain: TerrainState,
  c: Pick<ZoneContext, "tables" | "bounce" | "profile">,
): ZoneEffectUpdate {
  validateEffectNativePrior(before);
  const p = profile(c, code),
    n = before.slice(),
    samples: [number, number][] = [];
  if (
    byte(n, 6) !== 5 ||
    byte(n, 69) !== code ||
    (word(n, 21) & ~0x21) !== 0 ||
    !(word(n, 21) & 0x20) ||
    word(n, 63) !== -1 ||
    word(n, 51) !== 0 ||
    word(n, 53) !== 0 ||
    byte(n, 28) !== 1 ||
    !(byte(n, 29) >= 1 && byte(n, 29) <= 3)
  )
    throw new Error("Unsupported zone effect physics/animation state");
  const old = before,
    x = word(old, 7),
    y = word(old, 9),
    fractions: [number, number] = [byte(old, 67), byte(old, 68)],
    vx = word(old, 45),
    vy = word(old, 47),
    vz = wrap(word(old, 49) + word(old, 55));
  const fixed = (axis: number, speed: number) =>
    (((axis ? y : x) << 16) + (fractions[axis] << 8) + (speed << 10)) | 0;
  const sample = (fx: number, fy: number): number => {
    const at: [number, number] = [fx >> 16, fy >> 16];
    samples.push(at);
    putEffectWord(n, 7, at[0]);
    putEffectWord(n, 9, at[1]);
    n[67] = (fx >> 8) & 255;
    n[68] = (fy >> 8) & 255;
    const ground = groundHeight(terrain, ...at);
    putEffectDword(n, 17, ground);
    n[23] = effectTerrainShade(terrain, ...at);
    return ground;
  };
  const orient = (
    horizontalX: number,
    horizontalY: number,
    vertical: number,
  ) => {
    const xy = integerSqrt(
        (Math.imul(horizontalX, horizontalX) +
          Math.imul(horizontalY, horizontalY)) >>>
          0,
      ),
      speed = wrap(
        integerSqrt((Math.imul(xy, xy) + Math.imul(vertical, vertical)) >>> 0),
      );
    if (speed < 0 || speed > 0x4b00)
      throw new Error("Zone effect speed outside source bound");
    if (xy)
      putEffectWord(
        n,
        57,
        originalAngle(horizontalX, horizontalY, c.tables.atan),
      );
    putEffectWord(
      n,
      59,
      speed ? originalAngle(xy, -vertical, c.tables.atan) : 512,
    );
    putEffectWord(n, 61, speed);
  };
  const ground = sample(fixed(0, vx), fixed(1, vy)),
    candidateHeight = (dword(old, 39) + (vz >> 3)) | 0;
  let actualX = vx,
    actualY = vy,
    actualZ = vz;
  if (candidateHeight <= ground && dword(old, 39) <= dword(old, 17)) {
    // Source recomputes orientation/quantized velocity and samples from OLD
    // position again. It does not advance twice or reuse the first height.
    actualZ = wrap(wrap(ground) - wrap(dword(old, 17)));
    actualZ = wrap(actualZ * 8);
    orient(vx, vy, actualZ);
    const m = createMotion(x, y, ground, 0);
    m.yaw = word(n, 57);
    m.pitch = word(n, 59);
    m.speed = word(n, 61);
    velocity(m, c.tables);
    actualX = m.vx;
    actualY = m.vy;
    actualZ = m.vz;
    const secondGround = sample(fixed(0, actualX), fixed(1, actualY));
    putEffectDword(n, 39, secondGround);
  } else {
    putEffectDword(n, 39, Math.max(ground, Math.max(0, candidateHeight)));
    if (candidateHeight <= ground) {
      if (Math.trunc((actualZ >> 6) / 16) > 0)
        throw new Error(
          "Zone effect positive impact virtual34 callback is required",
        );
      const at = point(n),
        normal = terrainNormal(terrain, ...at),
        coefficient = c.bounce[ecologyTerrainClass(terrain, at)];
      if (coefficient === undefined)
        throw new Error("Zone source bounce coefficient required");
      actualZ = wrap((Math.abs(actualZ) * coefficient) >> 8);
      actualX = wrap(actualX + Math.trunc((actualZ * normal[0]) / 256));
      actualY = wrap(actualY + Math.trunc((actualZ * normal[1]) / 256));
    }
    orient(actualX, actualY, actualZ);
  }
  putEffectWord(n, 45, actualX);
  putEffectWord(n, 47, actualY);
  putEffectWord(n, 49, actualZ);
  putEffectWord(n, 7, word(n, 7) & 32767);
  putEffectWord(n, 9, word(n, 9) & 32767);
  if (word(n, 74) >= 0) putEffectWord(n, 74, wrap(word(n, 74) - 1));
  const animation = advanceAnimation(
    {
      action: 0,
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: (byte(n, 28) << 24) >> 24,
      delay: (byte(n, 29) << 24) >> 24,
      counter: (byte(n, 30) << 24) >> 24,
    },
    p,
  );
  n[26] = animation.hold;
  n[27] = animation.frame;
  n[28] = animation.direction & 255;
  n[29] = animation.delay & 255;
  n[30] = animation.counter & 255;
  return {
    native: n,
    retirementRequired: word(n, 74) < 0 && animationFinished(animation, p),
    samples,
  };
}
/** Complete staged marker callback, including movement, source count and the
 * required reference-cleanup port. External schedulers can use record-only
 * export above when they already own unlink/count/cleanup transactionally. */
export function stepZoneEffect(
  before: ZoneState,
  slot: number,
  c: ZoneContext,
): ZoneReceipt {
  const s = structuredClone(before),
    events: ZoneEvent[] = [],
    effect = s.effects.find((e) => e.slot === slot);
  if (!effect) throw new Error("Zone effect binding is missing");
  rules(c);
  poolCount(s);
  validateSpatial(s.spatial);
  const shared = s.powerEffects.slots[slot];
  if (
    !shared?.occupied ||
    shared.packet ||
    !shared.nativePrior ||
    byte(shared.nativePrior, 69) !== effect.code
  )
    throw new Error("Zone shared effect binding differs");
  const oldCell = worldCell(...point(shared.nativePrior)),
    update = stepZoneEffectRecord(
      shared.nativePrior,
      effect.code,
      s.terrain,
      c,
    );
  shared.nativePrior = update.native;
  shared.fractionX = update.native[67];
  shared.fractionY = update.native[68];
  effect.native = update.native;
  if (worldCell(...point(update.native)) !== oldCell)
    moveSpatial(
      s.spatial,
      s.terrain,
      effectId(slot),
      worldCell(...point(update.native)),
    );
  links(s);
  if (update.retirementRequired) retire(s, slot, c, events);
  validateSpatial(s.spatial);
  poolCount(s);
  return { state: s, events, queries: [] };
}
