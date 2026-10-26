/** Original category2 specialist:52780/58A70 acquisition,51960/507D0 task
 * admission,55200 research/healing,54B10 capture controller and51E80 release.
 *57A10 orchestration requires its actual6FB60 motion service explicitly. */
import { nextRandom, type GeneRng } from "./random";
import {
  originalAngle,
  wrap16,
  type MotionTables,
  type MotionState,
} from "./motion";
import {
  worldCell,
  torusDelta,
  integerSqrt,
  groundHeight,
  type TerrainState,
} from "./terrain";
import {
  animationFinished,
  advanceAnimation,
  type AnimationProfile,
} from "./animation";
import type { SpecialistPool, SpecialistNative } from "./specialist-native";
import type { EcologyState, EcologyMule } from "./ecology";

type Native = (number | null)[];
export interface GeneticistProjectileProfile {
  speedWord: number;
  rangeFactor: number;
  cooldown: number;
  effectCode: number;
}
export interface GeneticistRules {
  schemaVersion: 1;
  projectiles: readonly GeneticistProjectileProfile[];
}
export interface GeneticistWorld {
  specialists: SpecialistPool;
  players: { raw: number[] }[];
  ecology: EcologyState;
  terrain: TerrainState;
  rng: GeneRng;
  frame: number;
  missionPrefix: number[];
}
export interface GeneticistShot {
  actor: number;
  target: number;
  projectileIndex: 4 | 5 | 6;
  profile: GeneticistProjectileProfile;
  position: [number, number];
  height: number;
  owner: number;
  /**6D830 speed is speedWord<<6; the source muzzle offset is1280. */
  aimSpeed: number;
  aimHeightOffset: 1280;
  parameter: 32;
  delay: 0;
}
export interface GeneticistContext<W extends GeneticistWorld> {
  rules: GeneticistRules;
  tables: MotionTables;
  /** Actual source118770 runtime flags, not a mission-prefix surrogate. */
  globalFlags: number;
  cellOrder(world: W, cell: number): readonly string[];
  /** Real75890 visibility between the current actor and target. */
  lineOfSight?(world: W, actor: number, target: number): boolean;
  /** Pure73AC0(point,target,distance,-1); it has no query or RNG draw. */
  approachPoint?(
    world: W,
    actor: number,
    target: number,
    distance: number,
  ): [number, number];
  /**707A0 actor ray at this heading; sourcecaller already consumed610 draw. */
  escapeRay?(
    world: W,
    actor: number,
    heading: number,
    distance: number,
  ): boolean;
  /**6D830 aim and actual48790 shared factory. Null capacity returns false.
   * Successful creation owns real41..43 flight/contact; never mark a Mule
   * stunned here merely to acknowledge this request. */
  fireShot?(world: W, request: GeneticistShot): boolean;
  /** Actual kind1 virtual34/5B9F0; source amount5 and logical kind3 attacker. */
  damageMule?(world: W, target: number, amount: 5, attacker: number): void;
  animation?(world: W, actor: number, action: number): AnimationProfile;
  /** Actual74A50 mask0 resolver, called after80FC0 stages pending/target bytes. */
  resolveMovePoint?(
    world: W,
    actor: number,
    requested: [number, number],
  ): [number, number];
  /** Source6D390 for shared task4/5 movement. Other roles may pursue actual
   * kind3 specialists or kind4 buildings as well as kind1 creatures. */
  movementTarget?(world: W, actor: number, reference: { kind: 1 | 3 | 4; index: number }): readonly (number | null)[] | null;
}
/** Role service adapters mutate their staged world in place. Retained numeric
 * records model stable source pointers across calls; replacing them is rejected. */
function guardPort<W extends GeneticistWorld, T>(
  w: W,
  index: number,
  run: () => T,
  target?: EcologyMule,
): T {
  const a = actor(w, index, [0, 1, 2, 3]),
    n = a.native,
    raw = a.blueprint,
    t = target?.native;
  const result = run();
  if (
    actor(w, index, [0, 1, 2, 3]).native !== n ||
    w.players[a.owner].raw !== raw ||
    (target && mule(w, target.index)?.native !== t)
  )
    throw Error("Geneticist role service replaced retained native records");
  return result;
}
export type GeneticistEvent =
  | {
      type: "audio";
      actor: number;
      cue: number;
      mode: 2 | "stop";
      parameter: number;
    }
  | { type: "feedback"; actor: number; mode: 1 | 2; reason: string }
  | {
      type: "shot";
      actor: number;
      target: number;
      code: number;
      created: boolean;
    }
  | {
      type: "research";
      actor: number;
      species: number;
      before: number;
      after: number;
      cap: number;
      newSpecies: boolean;
    }
  | {
      type: "healing";
      actor: number;
      target: number;
      healthBefore: number;
      healthAfter: number;
      reserveBefore: number;
      reserveAfter: number;
    }
  | { type: "released"; actor: number; panelRefresh: true }
  | {
      type: "presentation";
      actor: number;
      selectedState: number;
      action: number;
    };
export interface GeneticistReceipt {
  events: GeneticistEvent[];
  status: "ignored" | "pending" | "active" | "released";
  reason: string;
}
const byte = (n: readonly (number | null)[], p: number): number => {
  const v = n[p];
  if (v === null || v === undefined || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown Geneticist native byte ${p}`);
  return v;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  byte(n, p) |
  (byte(n, p + 1) << 8) |
  (byte(n, p + 2) << 16) |
  (byte(n, p + 3) << 24);
const signed = (v: number) => (v << 24) >> 24;
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const point = (n: readonly (number | null)[]): [number, number] => [
  word(n, 7),
  word(n, 9),
];
const dead = (n: Native) => byte(n, 94) >= 24;
const stunned = (n: Native) => byte(n, 94) === 18 && word(n, 108) > 0;
const arrived = (n: Native) => !!(word(n, 73) & 32);
const moving = (n: Native) =>
  word(n, 45) !== 0 ||
  word(n, 47) !== 0 ||
  word(n, 49) !== 0 ||
  dword(n, 39) > dword(n, 17);
function actor<W extends GeneticistWorld>(
  w: W,
  index: number,
  categories: readonly number[] = [2],
): {
  native: SpecialistNative;
  skill: number;
  blueprint: number[];
  offset: number;
  owner: number;
  style: number;
  speed: number;
} {
  const n = w.specialists.records[index],
    binding = w.specialists.bindings[index];
  if (
    !n ||
    n.length !== 200 ||
    !binding ||
    byte(n, 6) !== 3 ||
    word(n, 15) !== index ||
    byte(n, 24) !== binding.owner ||
    !categories.includes(binding.category)
  )
    throw Error("Actual live Geneticist specialist/binding is required");
  const raw = w.players[binding.owner]?.raw;
  if (!raw || raw.length !== 1805)
    throw Error("Actual Geneticist player record is required");
  const offset = 0x16 + binding.blueprintIndex * 36;
  if (
    signed(byte(raw, offset + 22)) !== binding.category ||
    signed(byte(raw, offset + 21)) !== binding.style
  )
    throw Error("Geneticist blueprint binding differs from retained player");
  const skill = signed(byte(raw, offset + 23));
  if (skill < 0 || skill > 100)
    throw Error("Unsupported Geneticist signed source skill");
  return {
    native: n,
    skill,
    blueprint: raw,
    offset,
    owner: binding.owner,
    style: binding.style,
    speed: binding.classSpeed,
  };
}
/** Shared kind3 control view; role modules must enforce their own category. */
export function readSpecialistControlActor<W extends GeneticistWorld>(
  w: W,
  index: number,
) {
  return actor(w, index, [0, 1, 2, 3]);
}
function mule<W extends GeneticistWorld>(
  w: W,
  index: number,
): EcologyMule | null {
  const m = w.ecology.mules.find((m) => m.index === index);
  if (!m || byte(m.native, 6) === 0) return null;
  if (
    m.native.length !== 124 ||
    byte(m.native, 6) !== 1 ||
    word(m.native, 15) !== index ||
    byte(m.native, 122) >= 25
  )
    throw Error("Geneticist requires an actual kind1 target with species0..24");
  return m;
}
function profile(
  r: GeneticistRules,
  index: number,
): GeneticistProjectileProfile {
  const p = r?.projectiles?.[index - 4];
  if (
    r?.schemaVersion !== 1 ||
    r.projectiles.length !== 3 ||
    !p ||
    [p.speedWord, p.rangeFactor, p.cooldown].some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    p.effectCode !== 37 + index
  )
    throw Error("Admitted original Geneticist projectile profile required");
  return p;
}
function distance(a: Native, b: Native, physical: boolean): number {
  const dx = torusDelta(word(b, 7), word(a, 7)),
    dy = torusDelta(word(b, 9), word(a, 9)),
    dz = physical ? (dword(b, 39) - dword(a, 39)) >> 3 : 0;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
}
function angle(a: readonly (number | null)[], b: readonly (number | null)[], t: MotionTables): number {
  return originalAngle(
    wrap16((word(b, 7) - word(a, 7)) * 2),
    wrap16((word(b, 9) - word(a, 9)) * 2),
    t.atan,
  );
}
/**1EE50 common virtual84, with physical velocity retained. */
function stop(n: Native): void {
  put(n, 63, 0);
  put(n, 73, word(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = byte(n, 22) & 63;
}
function release<W extends GeneticistWorld>(
  w: W,
  index: number,
  out: GeneticistReceipt,
): void {
  const n = actor(w, index).native;
  if (byte(n, 88) & 1) {
    for (const cue of [87, 86])
      out.events.push({
        type: "audio",
        actor: index,
        cue,
        mode: "stop",
        parameter: 0,
      });
    n[88] = byte(n, 88) & 254;
  }
  n[130] = 0;
  n[126] = 255;
  put(n, 112, word(n, 112) & 0xee69);
  stop(n);
  put(n, 73, word(n, 73) & 0xeffc);
  n[22] = byte(n, 22) & 127;
  out.events.push({ type: "released", actor: index, panelRefresh: true });
  out.status = "released";
}
function reference(n: Native, target: Native): void {
  put(n, 127, word(target, 15));
  n[129] = byte(target, 6);
}
type Query = "research" | "healing" | "hostile";
/**8D930 consumes its two axis-order draws even when no candidate wins. */
function query<W extends GeneticistWorld>(
  w: W,
  index: number,
  radius: number,
  kind: Query,
  c: GeneticistContext<W>,
): EcologyMule | null {
  const a = actor(w, index, [0, 1, 2, 3]),
    n = a.native,
    at = point(n),
    sx = nextRandom(w.rng) % 2 ? -256 : 256,
    sy = nextRandom(w.rng) % 2 ? -256 : 256,
    extent = Math.trunc(radius / 256);
  let best = 0x7fffffff,
    winner: EcologyMule | null = null;
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      if (
        Math.imul(x * sx, x * sx) + Math.imul(y * sy, y * sy) >
        Math.imul(radius, radius)
      )
        continue;
      const cell = worldCell(wrap16(at[0] + x * sx), wrap16(at[1] + y * sy)),
        ids = c.cellOrder(w, cell),
        present = w.ecology.mules.filter(
          (m) =>
            byte(m.native, 6) === 1 && worldCell(...point(m.native)) === cell,
        );
      if (present.some((m) => !ids.includes(m.id)))
        throw Error(
          "Geneticist query requires complete actual shared-cell order",
        );
      for (const id of ids) {
        const m = present.find((m) => m.id === id);
        if (!m) continue;
        mule(w, m.index);
        const target = m.native;
        let eligible = false;
        if (kind === "research") eligible = byte(target, 122) === byte(n, 144);
        else {
          const owner = byte(target, 24),
            friendly =
              owner === a.owner || !!(byte(a.blueprint, 0x6e5) & (1 << owner));
          eligible =
            !dead(target) &&
            (kind === "hostile"
              ? !friendly
              : friendly && word(target, 106) < word(target, 100));
        }
        if (!eligible) continue;
        const dz =
          (groundHeight(w.terrain, ...point(target)) -
            groundHeight(w.terrain, ...at)) >>
          3;
        const score =
          (distance(n, target, false) +
            Math.imul(dz, dz) +
            (kind === "research" && dead(target) ? 262144 : 0)) |
          0;
        if (score < best) {
          best = score;
          winner = m;
        }
      }
    }
  return winner;
}
/** Shared52780/58A70 hostile scorer. Category0/1 callers escape instead of
 * assigning the category2 healing task after this same source query. */
export function querySpecialistHostileMule<W extends GeneticistWorld>(
  world: W,
  index: number,
  radius: number,
  c: Pick<GeneticistContext<W>, "cellOrder">,
): EcologyMule | null {
  return query(world, index, radius, "hostile", c as GeneticistContext<W>);
}
/**51960 category2 and507D0 category2; common pending-action prefix made
 *58-bit0 true before507D0. No native record or player byte is invented. */
function start<W extends GeneticistWorld>(
  w: W,
  index: number,
  task: 0 | 1,
  target: EcologyMule,
  c: GeneticistContext<W>,
  out: GeneticistReceipt,
): void {
  const a = actor(w, index),
    n = a.native,
    t = target.native;
  n[126] = task;
  reference(n, t);
  put(n, 136, 0);
  put(n, 138, Math.trunc((a.skill * 362) / 100) + 150);
  put(n, 132, 0);
  put(n, 134, 0);
  n[87] = byte(n, 87) & 254;
  n[122] = 0;
  n[88] = byte(n, 88) | 1;
  activate(w, index, c, out);
}
/**507D0 alone preserves51960's retained shot/turn counters. */
function activate<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: GeneticistContext<W>,
  out: GeneticistReceipt,
): void {
  const a = actor(w, index),
    n = a.native,
    task = byte(n, 126);
  n[112] = byte(n, 112) & 251;
  n[85] = 11;
  if (task !== 0 && task !== 1) return;
  const t = byte(n, 129) === 1 ? mule(w, word(n, 127)) : null;
  if (!t) {
    if (task === 0) release(w, index, out);
    return;
  }
  const projectile = Math.min(2, Math.trunc((a.skill - 1) / 33)) + 4,
    p = profile(c.rules, projectile);
  n[131] = projectile;
  put32(n, 140, Math.imul(p.speedWord, p.rangeFactor));
  n[144] = byte(t.native, 122);
  if (task === 0)
    out.events.push({
      type: "feedback",
      actor: index,
      mode: 2,
      reason: "research-started",
    });
  out.status = "active";
}
export function requestGeneticistInteraction<W extends GeneticistWorld>(
  world: W,
  index: number,
  request: { task: 0 | 1; target: number; callerOwner: number },
  c: GeneticistContext<W>,
): GeneticistReceipt {
  const s = structuredClone(world),
    a = actor(s, index),
    out: GeneticistReceipt = {
      events: [],
      status: "ignored",
      reason: "ineligible-actor",
    };
  if (request.callerOwner !== a.owner)
    throw Error("Geneticist request owner differs");
  if (request.task !== 0 && request.task !== 1)
    throw Error("Unsupported Geneticist role task");
  if (!(byte(a.native, 112) & 1)) return out;
  const target = mule(s, request.target);
  if (!target) throw Error("Geneticist request target is inactive");
  release(s, index, out);
  start(s, index, request.task, target, c, out);
  out.reason = "task-started";
  Object.assign(world, s);
  return out;
}

export interface GeneticistCallbackContext<W extends GeneticistWorld>
  extends GeneticistContext<W> {
  /** Complete host-owned isolation; absent provider uses a full structured
   * clone. A provider must isolate every mutable callback/service root. */
  stageWorld?(world: W): W;
  /** The actual6FB60 phase, including route prefix, physics, arrival, water and
   * spatial relocation. Called first on the isolated transaction. It may replace
   * world fields. A normalized ground-motion approximation is not this port. */
  motion(world: W, actor: number): void;
  runtimeMode: number;
  override180d80: number;
  runtimeCount11c2bc: number;
  animation(world: W, actor: number, action: number): AnimationProfile;
  /** Actual57860, lazily needed only when a powered class3 charge reaches224. */
  charge?(world: W, actor: number): void;
  /** Actual52B90 abduction dispatch, before the shared charge/animation tail. */
  abductionState?(world: W, actor: number): void;
  /** Actual57F92 state4/5 dispatch, before common animation. Returned events
   * are already-normalized side effects; retired suppresses the animation tail. */
  lifecycle?(
    world: W,
    actor: number,
  ): { handled: boolean; retired: boolean; events?: GeneticistEvent[] };
  /** Actual8B520 classification, lazily called on the source footstep gate. */
  terrainClass?(world: W, position: [number, number]): number;
  /** Actual shared48790 code6 factory. Capacity failure does not suppress4B audio. */
  footstep?(
    world: W,
    request: {
      actor: number;
      code: 6;
      position: [number, number];
      height: number;
      angles: [number, number, number];
      owner: number;
    },
  ): void;
}

/** Known native↔normalized mirror only. Source65 contact speed, routing73,
 * accelerations33/35/37 and references remain in the actual native record. */
export function readGeneticistMotion(n: SpecialistNative): MotionState {
  return {
    x: word(n, 7),
    y: word(n, 9),
    fractionX: byte(n, 67),
    fractionY: byte(n, 68),
    height: dword(n, 39),
    ground: dword(n, 17),
    vx: word(n, 45),
    vy: word(n, 47),
    vz: word(n, 49),
    yaw: word(n, 57),
    pitch: word(n, 59),
    speed: word(n, 61),
    desiredSpeed: word(n, 63),
    width: word(n, 43) & 65535,
    turnBraking: !!(word(n, 73) & 0x2000),
  };
}
export function writeGeneticistMotion(
  n: SpecialistNative,
  m: MotionState,
): void {
  for (const [offset, v] of [
    [7, m.x],
    [9, m.y],
    [43, m.width],
    [45, m.vx],
    [47, m.vy],
    [49, m.vz],
    [57, m.yaw],
    [59, m.pitch],
    [61, m.speed],
    [63, m.desiredSpeed],
  ] as const) {
    if (!Number.isInteger(v) || v < -32768 || v > 65535)
      throw Error("Invalid Geneticist motion word");
    put(n, offset, v);
  }
  for (const [offset, v] of [
    [17, m.ground],
    [39, m.height],
  ] as const) {
    if (!Number.isInteger(v) || v < -2147483648 || v > 2147483647)
      throw Error("Invalid Geneticist motion height");
    put32(n, offset, v);
  }
  for (const [offset, v] of [
    [67, m.fractionX],
    [68, m.fractionY],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 255)
      throw Error("Invalid Geneticist retained fraction");
    n[offset] = v;
  }
  put(n, 73, m.turnBraking ? word(n, 73) | 0x2000 : word(n, 73) & ~0x2000);
}
function resetIdle<W extends GeneticistWorld>(w: W, index: number): void {
  const n = actor(w, index, [0, 1, 2, 3]).native;
  n[85] = 1;
  put32(n, 104, 0);
  n[25] = 8;
  n[28] = 1;
  n[29] = 16;
  n[27] = 0;
  n[112] = nextRandom(w.rng) % 4 < 2 ? byte(n, 112) | 4 : byte(n, 112) & 251;
}
function idleTail<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: Omit<GeneticistCallbackContext<W>, "rules">,
): void {
  const n = actor(w, index, [0, 1, 2, 3]).native,
    override = c.runtimeMode & 1 ? 0 : c.override180d80;
  if (c.runtimeCount11c2bc !== 0 && override === 0) {
    n[25] = 8;
    return;
  }
  put32(n, 104, (dword(n, 104) - 1) | 0);
  if (dword(n, 104) <= 0) {
    n[25] = override !== 0 ? 11 : nextRandom(w.rng) % 10 < 6 ? 8 : 11;
    put32(n, 104, 20 + (nextRandom(w.rng) % 30));
    n[112] = nextRandom(w.rng) % 4 < 2 ? byte(n, 112) | 4 : byte(n, 112) & 251;
  }
}
/** Complete category2 control envelope at57A10. Every required service
 * runs on an isolated world, so a missing service or invalid actual byte aborts
 * all world/RNG changes. External I/O must consume the returned events after
 * commit. The source common6FB60 service remains an explicit host obligation. */
export function stepGeneticistCallback<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: GeneticistCallbackContext<W>,
): GeneticistReceipt {
  return stepSpecialistRoleCallback(world, index, c, {
    category: 2,
    roleState: 11,
    activate: (s, i, c, out) => activate(s, i, c, out),
    release: (s, i, out) => release(s, i, out),
    idle: (s, i, c) => tryStagedGeneticistIdleAcquisition(s, i, c),
    role: (s, i, c) => stepStagedGeneticistRole(s, i, c),
  });
}
export interface SpecialistRoleHooks<
  W extends GeneticistWorld,
  C extends Omit<GeneticistCallbackContext<W>, "rules">,
> {
  category: 0 | 1 | 2 | 3;
  roleState: 9 | 10 | 11 | 12;
  activate(world: W, index: number, context: C, out: GeneticistReceipt): void;
  release(world: W, index: number, out: GeneticistReceipt): void;
  idle(world: W, index: number, context: C): GeneticistReceipt;
  role(world: W, index: number, context: C): GeneticistReceipt;
}
/** Shared57A10 envelope. Role hooks execute at their actual pending/idle/work
 * sites, and retain the same atomic world transaction and animation ordering. */
export function stepSpecialistRoleCallback<
  W extends GeneticistWorld,
  C extends Omit<GeneticistCallbackContext<W>, "rules">,
>(
  world: W,
  index: number,
  c: C,
  hooks: SpecialistRoleHooks<W, C>,
): GeneticistReceipt {
  const s = c.stageWorld?.(world) ?? structuredClone(world),
    out: GeneticistReceipt = {
      events: [],
      status: "ignored",
      reason: "inactive",
    };
  if (!(byte(actor(s, index, [hooks.category]).native, 112) & 1)) return out;
  if (!c.motion) throw Error("Geneticist callback requires actual6FB60 motion");
  c.motion(s, index);
  let a = actor(s, index, [hooks.category]),
    n = a.native;
  if (hooks.category >= 2 && dword(n, 100) > 0)
    put32(n, 100, dword(n, 100) - 1);
  const mask = a.style === 2 ? 127 : 255;
  if (
    ((s.frame + index) & mask) === 0 &&
    signed(byte(a.blueprint, a.offset + 26)) <
      signed(byte(a.blueprint, a.offset + 25))
  )
    a.blueprint[a.offset + 26] = (byte(a.blueprint, a.offset + 26) + 1) & 255;
  if (byte(n, 88) === 0 && ![1, 2, 3, 4, 5].includes(byte(n, 85)))
    resetIdle(s, index);
  if (byte(n, 85) === 8) {
    if (!(word(n, 73) & 64)) {
      if (continueMovement(s, index, 1, c)) {
        resetIdle(s, index);
        if (byte(n, 88) & 1) n[87] = byte(n, 87) | 1;
      }
    } else {
      stop(n);
      hooks.release(s, index, out);
      resetIdle(s, index);
      out.events.push({
        type: "feedback",
        actor: index,
        mode: 1,
        reason: "movement-failed",
      });
    }
  }
  if (
    !(byte(n, 113) & 16) &&
    ![2, 3, 4, 5].includes(byte(n, 85)) &&
    byte(n, 112) & 1
  ) {
    if (!(byte(n, 87) & 2)) {
      if (byte(n, 85) !== 8 && byte(n, 87) & 1) {
        n[87] = byte(n, 87) & 254;
        n[122] = 0;
        n[88] = byte(n, 88) | 1;
        hooks.activate(s, index, c, out);
      }
    } else {
      n[122] = 0;
      if (byte(n, 88) & 1) {
        hooks.release(s, index, out);
        n[87] = byte(n, 87) & 254;
      }
      const mode = byte(n, 91);
      n[112] = byte(n, 112) & 239;
      if (mode === 0)
        out.events.push({
          type: "feedback",
          actor: index,
          mode: 2,
          reason: "move-started",
        });
      n[85] = 8;
      n[90] = mode;
      put(n, 63, a.speed);
      put32(n, 104, 0);
      n[88] = byte(n, 88) | 2;
      n[73] = byte(n, 73) | 4;
      issueMovement(s, index, c);
      n[87] = byte(n, 87) & 253;
    }
  }
  const absorb = (r: GeneticistReceipt) => {
    out.events.push(...r.events);
    if (r.status !== "ignored") out.status = r.status;
    out.reason = r.reason;
  };
  let retired = false;
  switch (byte(n, 85)) {
    case 1: {
      const r = hooks.idle(s, index, c);
      absorb(r);
      //52780 skips the timer tail only if its scorer actually acquired a target.
      if (r.status !== "pending") idleTail(s, index, c);
      break;
    }
    case 2:
    case 8:
      break;
    case 3:
      if (!c.abductionState)
        throw Error(
          "Specialist state3 requires actual52B90 abduction dispatch",
        );
      c.abductionState(s, index);
      break;
    case 4:
    case 5:
      if (c.lifecycle) {
        const r = c.lifecycle(s, index);
        if (!r.handled)
          throw Error(
            "Required specialist lifecycle dispatcher did not handle current state",
          );
        out.events.push(...(r.events ?? []));
        retired = r.retired;
        break;
      }
      if (byte(n, 85) === 4)
        throw Error("Specialist death lifecycle requires actual dispatch");
      if (
        byte(n, 25) === 10 &&
        animationFinished(
          {
            action: 10,
            hold: byte(n, 26),
            frame: byte(n, 27),
            direction: signed(byte(n, 28)),
            delay: signed(byte(n, 29)),
            counter: signed(byte(n, 30)),
          },
          c.animation(s, index, 10),
        )
      ) {
        n[85] = byte(n, 86);
        put32(n, 104, dword(n, 108));
      }
      break;
    default:
      if (byte(n, 85) === hooks.roleState) absorb(hooks.role(s, index, c));
      else
        throw Error(
          "Specialist common callback lifecycle state is not admitted",
        );
  }
  // Nested role transactions may replace records; reacquire before the tail.
  a = retired
    ? {
        ...a,
        native: s.specialists.records[index],
        blueprint: s.players[a.owner].raw,
      }
    : actor(s, index, [hooks.category]);
  n = a.native;
  //80360/800B0 may delete this blueprint during the death dispatch. The source
  // still dereferences the retained C0 address here, not its earlier style.
  if (signed(byte(a.blueprint, a.offset + 21)) === 3) {
    if (byte(a.blueprint, 0x610) === 0) n[115] = 0;
    else if (byte(n, 115) < 255 && (s.frame + index) & 1 && !moving(n)) {
      n[115] = (byte(n, 115) + 1) & 255;
      if (byte(n, 115) === 224) {
        if (!c.charge)
          throw Error(
            "Geneticist powered class3 requires actual57860 charge callback",
          );
        c.charge(s, index);
        a = retired
          ? {
              ...a,
              native: s.specialists.records[index],
              blueprint: s.players[a.owner].raw,
            }
          : actor(s, index, [hooks.category]);
        n = a.native;
      }
    }
  }
  if (retired) {
    out.status = "released";
    out.reason = "specialist-retired";
    Object.assign(world, s);
    return out;
  }
  if (
    signed(byte(a.blueprint, a.offset + 27)) <
      signed(byte(a.blueprint, a.offset + 24)) &&
    signed(byte(n, 85)) < 9 &&
    (s.frame & (byte(n, 85) === 8 ? 127 : 31)) === 0
  )
    a.blueprint[a.offset + 27] = (byte(a.blueprint, a.offset + 27) + 1) & 255;
  const selected =
    byte(n, 112) & 64
      ? 6
      : byte(n, 112) & 16 && byte(n, 85) !== 5
        ? 8
        : signed(byte(n, 85)) < 9 || word(n, 112) & 0x180
          ? byte(n, 85)
          : 1;
  let action: number | null = null;
  if (selected === 8) {
    action = ((((word(n, 57) >> 7) + 1) >> 1) + 1) & 7;
    if (action !== byte(n, 25)) {
      n[25] = action;
      n[28] = 1;
    }
    n[29] = Math.trunc((1024 - word(n, 65)) / 256) & 255;
  } else if (selected !== 1) {
    action =
      selected === 2
        ? dword(n, 39) - dword(n, 17) < 1
          ? 8
          : 12
        : selected === 4
          ? 9
          : selected === 5
            ? 10
            : signed(byte(n, 89));
    if (action !== byte(n, 25)) {
      n[25] = action & 255;
      n[28] = 1;
      n[29] = 0;
    }
  }
  out.events.push({
    type: "presentation",
    actor: index,
    selectedState: selected,
    action: byte(n, 25),
  });
  const anim = advanceAnimation(
    {
      action: byte(n, 25),
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: signed(byte(n, 28)),
      delay: signed(byte(n, 29)),
      counter: signed(byte(n, 30)),
    },
    c.animation(s, index, byte(n, 25)),
  );
  n[26] = anim.hold;
  n[27] = anim.frame;
  n[28] = anim.direction & 255;
  n[29] = anim.delay & 255;
  n[30] = anim.counter & 255;
  if (
    ((s.frame + index) & 3) === 3 &&
    dword(n, 39) === dword(n, 17) &&
    selected === 1 &&
    moving(n)
  ) {
    if (!c.terrainClass)
      throw Error(
        "Geneticist footstep requires actual8B520 terrain classification",
      );
    if (c.terrainClass(s, point(n)) > 1) {
      if (!c.footstep)
        throw Error("Geneticist footstep requires actual shared code6 factory");
      c.footstep(s, {
        actor: index,
        code: 6,
        position: point(n),
        height: dword(n, 39),
        angles: [word(n, 57), Math.max(0, word(n, 59) - 256), word(n, 61) >> 1],
        owner: a.owner,
      });
      out.events.push({
        type: "audio",
        actor: index,
        cue: 75,
        mode: 2,
        parameter: 127,
      });
    }
  }
  if (out.status === "ignored") {
    out.status = "active";
    out.reason = "common-callback";
  }
  Object.assign(world, s);
  return out;
}
/** Common57A10 for actual kind3 states4/5 only. No Engineer/Shepherd role or
 * idle behavior is implied by this deliberately bounded entry point. */
export function stepSpecialistLifecycleCallback<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: Omit<GeneticistCallbackContext<W>, "rules">,
): GeneticistReceipt {
  const binding = world.specialists.bindings[index];
  if (
    !binding ||
    ![0, 1, 2, 3].includes(binding.category) ||
    ![4, 5].includes(byte(world.specialists.records[index], 85))
  )
    throw Error(
      "Specialist lifecycle callback requires actual category0..3 state4/5",
    );
  const unsupported = (): never => {
    throw Error("Unadmitted specialist role dispatch");
  };
  return stepSpecialistRoleCallback(world, index, c, {
    category: binding.category as 0 | 1 | 2 | 3,
    roleState: (9 + binding.category) as 9 | 10 | 11 | 12,
    activate: unsupported,
    release: unsupported,
    idle: unsupported,
    role: unsupported,
  });
}
/**81080 category2 input, including conditional51E80 and51960.57A10 consumes
 *57-bit0 on the next callback; an interrupted state8 must clear active motion.
 * no507D0 activation, cooldown step, animation or physical movement occurs here. */
export function queueGeneticistInteraction<W extends GeneticistWorld>(
  world: W,
  index: number,
  request: { task: 0 | 1; target: number; callerOwner: number },
  c: GeneticistContext<W>,
): GeneticistReceipt {
  const s = structuredClone(world),
    a = actor(s, index),
    n = a.native;
  const out: GeneticistReceipt = {
    events: [],
    status: "ignored",
    reason: "ineligible-actor",
  };
  if (request.callerOwner !== a.owner)
    throw Error("Geneticist request owner differs");
  if (request.task !== 0 && request.task !== 1)
    throw Error("Unsupported Geneticist role task");
  if (!(byte(n, 112) & 1)) return out;
  const target = mule(s, request.target);
  if (!target) throw Error("Geneticist request target is inactive");
  n[87] = byte(n, 87) | 1;
  if (byte(n, 130) !== 0) release(s, index, out);
  n[126] = request.task;
  reference(n, target.native);
  put(n, 136, 0);
  put(n, 138, Math.trunc((a.skill * 362) / 100) + 150);
  put(n, 132, 0);
  put(n, 134, 0);
  n[130] = 1;
  if (byte(n, 85) === 8) {
    stop(n);
    n[88] = byte(n, 88) & 253;
  }
  out.status = "pending";
  out.reason = "interaction-queued";
  // Admit the exact row now, without selecting an action or resetting counters.
  profile(c.rules, Math.min(2, Math.trunc((a.skill - 1) / 33)) + 4);
  Object.assign(world, s);
  return out;
}
/**80FC0 setter. The existing active role is released at its source gate, either
 * here for native82/pending57-bit0 or during57A10's pending-move dispatch. */
export function queueGeneticistMove<W extends GeneticistWorld>(
  world: W,
  index: number,
  request: { callerOwner: number; point: [number, number] },
  c: GeneticistContext<W>,
): GeneticistReceipt {
  const s = structuredClone(world),
    a = actor(s, index),
    n = a.native,
    out: GeneticistReceipt = {
      events: [],
      status: "ignored",
      reason: "move-inhibited",
    };
  if (request.callerOwner !== a.owner)
    throw Error("Geneticist request owner differs");
  if (byte(n, 113) & 16) return out;
  if (
    request.point.length !== 2 ||
    request.point.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Invalid Geneticist requested move point");
  if (!c.resolveMovePoint)
    throw Error("Geneticist queued move requires actual74A50 resolver");
  n[87] = byte(n, 87) | 2;
  put(n, 92, request.point[0]);
  put(n, 94, request.point[1]);
  n[91] = 0;
  const resolved = guardPort(s, index, () =>
    c.resolveMovePoint!(s, index, request.point),
  );
  if (
    resolved.length !== 2 ||
    resolved.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Invalid Geneticist resolved move point");
  put(n, 92, resolved[0]);
  put(n, 94, resolved[1]);
  put(n, 11, resolved[0]);
  put(n, 13, resolved[1]);
  if (byte(n, 130) !== 0 || byte(n, 87) & 1) {
    n[87] = byte(n, 87) & 254;
    release(s, index, out);
  }
  out.status = "pending";
  out.reason = "move-queued";
  Object.assign(world, s);
  return out;
}
/** Exact category2 51E80 release, with pending57 bits retained as in source. */
export function cancelGeneticistWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  callerOwner: number,
): GeneticistReceipt {
  const s = structuredClone(world),
    a = actor(s, index),
    out: GeneticistReceipt = {
      events: [],
      status: "ignored",
      reason: "inactive",
    };
  if (a.owner !== callerOwner) throw Error("Geneticist request owner differs");
  release(s, index, out);
  out.reason = "work-released";
  Object.assign(world, s);
  return out;
}
/**51E80 inside an already isolated host transaction. Numeric records, player
 * arrays and blueprint bindings retain their source pointer identities. */
export function cancelStagedGeneticistWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  callerOwner: number,
): GeneticistReceipt {
  const a = actor(world, index),
    out: GeneticistReceipt = {
      events: [],
      status: "ignored",
      reason: "inactive",
    };
  if (a.owner !== callerOwner) throw Error("Geneticist request owner differs");
  release(world, index, out);
  out.reason = "work-released";
  return out;
}
/** Source52780 pulse/acquisition only. With no target the caller continues its
 * original idle timer/animation tail; this function never replaces that tail. */
function runGeneticistIdleAcquisition<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: GeneticistContext<W>,
  staged: boolean,
): GeneticistReceipt {
  const s = staged ? world : structuredClone(world),
    a = actor(s, index),
    n = a.native,
    out: GeneticistReceipt = {
      events: [],
      status: "ignored",
      reason: "no-idle-acquisition",
    };
  if ((s.frame + index) & 15) return out;
  const chance = (a.skill >> (byte(a.blueprint, 2) === 0 ? 1 : 3)) * 2;
  if (nextRandom(s.rng) % 100 < chance) {
    const target = query(s, index, 512, "hostile", c);
    if (target) {
      reference(n, target.native);
      if (stunned(target.native)) {
        n[90] = 5;
        n[91] = 5;
        put(n, 63, a.speed);
        n[87] = byte(n, 87) | 2;
        n[112] = byte(n, 112) | 16;
        out.status = "pending";
        out.reason = "stunned-target-escape";
      } else {
        n[87] = byte(n, 87) | 1;
        n[126] = 1;
        put(n, 136, 0);
        put(n, 138, Math.trunc((a.skill * 362) / 100) + 150);
        put(n, 132, 0);
        put(n, 134, 0);
        n[112] = byte(n, 112) | 2;
        out.status = "pending";
        out.reason = "automatic-healing-request";
      }
    }
  }
  Object.assign(world, s);
  return out;
}
export function tryGeneticistIdleAcquisition<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: GeneticistContext<W>,
): GeneticistReceipt {
  return runGeneticistIdleAcquisition(w, index, c, false);
}
/** Already-isolated57A10 service; caller owns rollback on every later failure. */
export function tryStagedGeneticistIdleAcquisition<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: GeneticistContext<W>,
): GeneticistReceipt {
  return runGeneticistIdleAcquisition(w, index, c, true);
}
/** Source526C0 plus52340's role1/4/5 movement continuations. */
function continueMovement<W extends GeneticistWorld>(
  w: W,
  index: number,
  mode: 0 | 1,
  c: Pick<GeneticistContext<W>, "tables" | "escapeRay" | "movementTarget">,
): boolean {
  const a = actor(w, index, [0, 1, 2, 3]),
    n = a.native;
  if (byte(n, 112) & 32) return false;
  if (a.style === 3 && (w.frame + index) & 1 && byte(n, 115) > 0)
    n[115] = byte(n, 115) - 1;
  if (word(n, 73) & 3) return false;
  if (!(word(n, 73) & 16) && !arrived(n)) {
    issueMovement(w, index, c);
  }
  if (arrived(n) || word(n, 73) & 64) {
    n[22] = byte(n, 22) & 63;
    n[84] = 0;
    n[73] = byte(n, 73) & 239;
    if (mode) n[88] = byte(n, 88) & 253;
    else n[112] = byte(n, 112) & 239;
    return true;
  }
  return false;
}
/**52340 role movement dispatcher. Pending commands call it unconditionally. */
export function continueSpecialistMovement<W extends GeneticistWorld>(
  w: W,
  index: number,
  mode: 0 | 1,
  c: Pick<GeneticistContext<W>, "tables" | "escapeRay" | "movementTarget">,
): boolean {
  return continueMovement(w, index, mode, c);
}
function issueMovement<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: Pick<GeneticistContext<W>, "tables" | "escapeRay" | "movementTarget">,
): void {
  const a = actor(w, index, [0, 1, 2, 3]),
    n = a.native,
    task = byte(n, 90);
  const resolve = (): readonly (number | null)[] | null => {
    const kind = byte(n, 129), targetIndex = word(n, 127);
    if (kind === 0) return null;
    if (![1, 3, 4].includes(kind)) throw Error("Unsupported source movement target kind");
    if (!c.movementTarget) {
      if (kind !== 1) throw Error("Specialist movement requires actual6D390 target resolver");
      return mule(w, targetIndex)?.native ?? null;
    }
    const target = guardPort(w, index, () => c.movementTarget!(w, index, { kind: kind as 1 | 3 | 4, index: targetIndex }));
    if (target && (byte(target, 6) !== kind || word(target, 15) !== targetIndex))
      throw Error("Specialist movement target identity differs");
    return target;
  };
  if (task === 4) {
    const target = resolve();
    if (target) {
      n[84] = 20;
      put(n, 73, (word(n, 73) | 20) & 0xeffc);
      n[22] = byte(n, 22) & 63;
      n[79] = 0;
      put(n, 80, word(target, 15));
      n[82] = byte(target, 6);
    }
  } else if (task === 5) {
    const target = resolve();
    if (!target) throw Error("Geneticist escape target is missing");
    const p = point(target);
    put(n, 11, p[0]);
    put(n, 13, p[1]);
    put(n, 75, (angle(n, target, c.tables) + 1024) & 2047);
    if (!(word(n, 73) & 16)) put(n, 57, word(n, 75));
    const escapeDistance = 384 + (nextRandom(w.rng) % 256);
    if (!c.escapeRay)
      throw Error("Geneticist capture requires original707A0 escape ray");
    guardPort(
      w,
      index,
      () => c.escapeRay!(w, index, word(n, 75), escapeDistance),
    );
    if (resolve() !== target) throw Error("Specialist escape service replaced its held target");
  } else if (task === 0 || task === 1) {
    const goal = task === 0 ? 92 : 96;
    put(n, 11, word(n, goal));
    put(n, 13, word(n, goal + 2));
    const p: Native = n.slice();
    put(p, 7, word(n, 11));
    put(p, 9, word(n, 13));
    const yaw = angle(n, p, c.tables);
    if (!(word(n, 73) & 16)) {
      put(n, 75, yaw);
      put(n, 57, yaw);
    }
    n[84] = 20;
    put(n, 73, (word(n, 73) | 20) & 0xeffc);
    n[22] = byte(n, 22) & 63;
    n[79] = n[82] = 0;
  } else throw Error("Unsupported Geneticist source movement continuation");
}
function approach<W extends GeneticistWorld>(
  w: W,
  index: number,
  target: EcologyMule,
  c: GeneticistContext<W>,
  out: GeneticistReceipt,
): void {
  const a = actor(w, index),
    n = a.native;
  if (word(n, 73) & 16) return;
  n[112] = byte(n, 112) & 123;
  for (const cue of [87, 86])
    out.events.push({
      type: "audio",
      actor: index,
      cue,
      mode: "stop",
      parameter: 0,
    });
  if (!c.approachPoint)
    throw Error("Geneticist role requires original73AC0 approach query");
  const p = guardPort(
    w,
    index,
    () =>
      c.approachPoint!(
        w,
        index,
        target.index,
        128 + a.skill * (byte(n, 126) === 0 ? 12 : 4),
      ),
    target,
  );
  if (
    p.length !== 2 ||
    p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Geneticist source approach result is invalid");
  n[90] = 1;
  put(n, 96, p[0]);
  put(n, 98, p[1]);
  put(n, 63, a.speed);
  n[112] = byte(n, 112) | 16;
}
function capture<W extends GeneticistWorld>(
  w: W,
  index: number,
  target: EcologyMule,
  c: GeneticistContext<W>,
  out: GeneticistReceipt,
): void {
  const a = actor(w, index),
    n = a.native,
    t = target.native,
    range = integerSqrt(distance(n, t, true));
  if (!(byte(n, 112) & 128)) {
    if (byte(n, 112) & 16) {
      if (!arrived(n)) continueMovement(w, index, 0, c);
      else {
        put(n, 112, word(n, 112) & 0xfeef);
        n[113] = byte(n, 113) | 1;
      }
    }
  } else {
    if (!c.animation)
      throw Error("Geneticist capture needs actual specialist animation");
    const p = c.animation(w, index, signed(byte(n, 89)));
    if (
      animationFinished(
        {
          action: byte(n, 25),
          hold: byte(n, 26),
          frame: byte(n, 27),
          direction: signed(byte(n, 28)),
          delay: signed(byte(n, 29)),
          counter: signed(byte(n, 30)),
        },
        p,
      )
    ) {
      n[28] = n[27] = 0;
      n[112] = byte(n, 112) & 127;
    }
  }
  if (byte(n, 90) === 5 && byte(n, 112) & 16) return;
  let pursuit = true;
  if (range <= dword(n, 140) >>> 0) {
    if (!c.lineOfSight)
      throw Error("Geneticist capture requires original75890 visibility query");
    if (c.lineOfSight(w, index, target.index)) {
      pursuit = false;
      if (word(n, 63) === 0 || !moving(n)) {
        if (!(byte(n, 112) & 4) && word(n, 63) === 0 && !moving(n)) {
          n[84] = 0;
          n[28] = n[27] = 0;
          n[22] = byte(n, 22) & 63;
          n[112] = (byte(n, 112) & 235) | 4;
          put(n, 73, word(n, 73) & 0xefec);
        }
      } else {
        stop(n);
        put(n, 73, word(n, 73) & 0xeffc);
        n[22] = byte(n, 22) & 127;
        n[113] = byte(n, 113) | 1;
      }
      if (byte(n, 112) & 4) {
        if (dword(n, 100) < 1) {
          const yaw = angle(n, t, c.tables),
            delta = ((yaw - word(n, 57) + 1024) & 2047) - 1024;
          if (Math.abs(delta) > word(n, 138)) put(n, 75, yaw);
          else {
            const p = profile(c.rules, byte(n, 131));
            if (!c.fireShot)
              throw Error(
                "Geneticist capture requires actual41..43 projectile factory/lifecycle",
              );
            const created = guardPort(
              w,
              index,
              () =>
                c.fireShot!(w, {
                  actor: index,
                  target: target.index,
                  projectileIndex: byte(n, 131) as 4 | 5 | 6,
                  profile: p,
                  position: point(n),
                  height: (dword(n, 39) + 1280) | 0,
                  owner: a.owner,
                  aimSpeed: p.speedWord << 6,
                  aimHeightOffset: 1280,
                  parameter: 32,
                  delay: 0,
                }),
              target,
            );
            out.events.push({
              type: "shot",
              actor: index,
              target: target.index,
              code: p.effectCode,
              created,
            });
            if (created) {
              put32(n, 100, p.cooldown);
              put(n, 136, word(n, 136) + 1);
            }
            n[28] = 1;
            n[27] = n[29] = 0;
            n[112] = byte(n, 112) | 128;
          }
        } else if (range < 257) {
          put(n, 112, word(n, 112) & 0xfefb);
          reference(n, t);
          n[90] = 5;
          put(n, 63, a.speed);
          n[112] = byte(n, 112) | 16;
          continueMovement(w, index, 0, c);
        } else if (((w.frame + index) & 3) === 3)
          put(n, 75, angle(n, t, c.tables));
        n[89] = 15 + (((((word(n, 57) >> 7) + 1) >> 1) + 1) & 7);
      }
    }
  }
  if (pursuit && (!(byte(n, 112) & 16) || word(n, 63) === 0)) {
    put(n, 112, word(n, 112) & 0xfefb);
    reference(n, t);
    n[90] = 4;
    put(n, 63, a.speed);
    n[112] = byte(n, 112) | 16;
    continueMovement(w, index, 0, c);
  }
}
function nutrition(n: Native, amount: number): void {
  //55200 calls5C730 with BL3: this bypasses the food coefficients.
  const gain = wrap16(amount);
  put(n, 104, word(n, 104) + gain);
  if (byte(n, 119) !== 255) put(n, 102, word(n, 102) - gain * 2);
  if (word(n, 104) > word(n, 98)) {
    put(n, 104, word(n, 98));
    n[97] = byte(n, 97) & 191;
  }
}
/** Runs55200 only, after the normal57A10 prefix (including cooldown100
 * decrement), before common animation selection/advance and footsteps. */
function runGeneticistRole<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: GeneticistContext<W>,
  staged: boolean,
): GeneticistReceipt {
  const s = staged ? world : structuredClone(world),
    a = actor(s, index),
    n = a.native,
    out: GeneticistReceipt = {
      events: [],
      status: "active",
      reason: "role-callback",
    };
  if (byte(n, 85) !== 11 || !(byte(n, 112) & 1))
    throw Error("Geneticist source role state11 must be active");
  const task = byte(n, 126);
  if (task !== 0 && task !== 1)
    return {
      ...out,
      status: "ignored",
      reason: "unsupported-task-not-dispatched",
    };
  if (!Number.isInteger(c.globalFlags))
    throw Error("Geneticist actual runtime flags are required");
  if (task === 0 && c.globalFlags & 64) {
    release(s, index, out);
    out.reason = "research-disabled";
    Object.assign(world, s);
    return out;
  }
  const target = byte(n, 129) === 1 ? mule(s, word(n, 127)) : null;
  let lost = !target,
    capped = false;
  if (target) {
    const t = target.native;
    if (task === 0) {
      const cap = (50 + 25 * byte(a.blueprint, 0x6e1)) * 2048;
      capped = dword(a.blueprint, 0x61a + byte(t, 122) * 4) >= cap;
      if (dead(t) && byte(n, 112) & 128 && nextRandom(s.rng) % 100 < a.skill)
        lost = true;
      if (
        ((s.frame + index) & 3) === 3 &&
        (capped || nextRandom(s.rng) % 100 < a.skill)
      ) {
        const next = query(s, index, 768, "hostile", c);
        if (next && !stunned(next.native)) reference(n, next.native);
      }
    } else
      lost =
        dead(t) ||
        (!(byte(n, 112) & 2) ? word(t, 100) <= word(t, 106) : stunned(t));
  }
  if (lost) {
    if (task === 1 && byte(n, 144) === 25) {
      release(s, index, out);
      out.reason = "target-lost";
      Object.assign(world, s);
      return out;
    }
    const next = query(
      s,
      index,
      a.skill * 16 + 256,
      task === 0 ? "research" : "healing",
      c,
    );
    if (next) {
      reference(n, next.native);
      out.reason = "target-reacquired";
    } else {
      out.events.push({
        type: "feedback",
        actor: index,
        mode: 1,
        reason: "no-target",
      });
      release(s, index, out);
      out.reason = "no-target";
    }
    Object.assign(world, s);
    return out;
  }
  const current = byte(n, 129) === 1 ? mule(s, word(n, 127)) : null;
  if (!current) {
    Object.assign(world, s);
    return out;
  }
  const t = current.native;
  if (!dead(t) && !stunned(t) && byte(t, 94) !== 15) {
    capture(s, index, current, c, out);
    out.reason = "capture-controller";
    Object.assign(world, s);
    return out;
  }
  if (!(byte(n, 112) & 16)) {
    if (capped) {
      const next = query(s, index, a.skill * 16 + 256, "hostile", c);
      if (next) {
        reference(n, next.native);
        out.reason = "research-cap-retarget";
      } else release(s, index, out);
      Object.assign(world, s);
      return out;
    }
    if ((task === 0 && byte(t, 122) !== byte(n, 144)) || byte(n, 112) & 2) {
      n[129] = 0;
      out.reason = "target-cleared";
      Object.assign(world, s);
      return out;
    }
    const radius = 256 + a.skill * (task === 0 ? 12 : 4);
    if (distance(n, t, true) > Math.imul(radius, radius)) {
      approach(s, index, current, c, out);
      out.reason = "approaching";
      Object.assign(world, s);
      return out;
    }
    n[112] = (byte(n, 112) & 111) | 128;
    const yaw = angle(n, t, c.tables);
    n[112] = (byte(n, 112) & 251) | (Number(yaw >= 768 && yaw <= 1792) * 4);
    n[112] = byte(n, 112) ^ 4;
    if (task === 0) {
      const wasDead = dead(t);
      out.events.push({
        type: "audio",
        actor: index,
        cue: 86,
        mode: 2,
        parameter: 255,
      });
      if (
        ((s.frame + index) & 3) === 3 &&
        nextRandom(s.rng) % 100 <= 100 - a.skill
      ) {
        if (wasDead) put(t, 104, Math.max(0, word(t, 104) - 2));
        else {
          if (!c.damageMule)
            throw Error(
              "Geneticist live research requires actual Mule virtual34 damage",
            );
          guardPort(
            s,
            index,
            () => c.damageMule!(s, current.index, 5, index),
            current,
          );
        }
      }
      const base = a.skill * (c.globalFlags & 32 ? 2 : 4),
        increase = wasDead ? Math.max(1, base >> 1) : base,
        raw = a.blueprint,
        species = byte(t,122),
        researchAt = 0x61a + species*4,
        before = dword(raw, researchAt),
        cap = (50 + 25 * byte(raw, 0x6e1)) * 2048;
      let newSpecies = false;
      const count = byte(raw, 0x6e0);
      if (count > 25)
        throw Error("Geneticist species list exceeds source25 capacity");
      if (!raw.slice(0x6ae, 0x6ae + count).includes(species)) {
        if (count === 25) throw Error("Geneticist actual species list is full");
        raw[0x6ae + count] = species;
        raw[0x6e0] = count + 1;
        put32(raw, 0x705, dword(raw, 0x705) + 1);
        newSpecies = true;
      }
      const after =
        before < cap ? Math.min(cap, (before + increase) | 0) : before;
      put32(raw, researchAt, after);
      out.events.push({
        type: "research",
        actor: index,
        species,
        before,
        after,
        cap,
        newSpecies,
      });
      if (after >= cap) {
        out.events.push({
          type: "feedback",
          actor: index,
          mode: 1,
          reason: "research-complete",
        });
        release(s, index, out);
      } else n[89] = 13;
    } else {
      out.events.push({
        type: "audio",
        actor: index,
        cue: 87,
        mode: 2,
        parameter: 255,
      });
      if (((s.frame + index) & 7) === 0) {
        const healthBefore = word(t, 106),
          reserveBefore = word(t, 104);
        put(
          t,
          106,
          healthBefore +
            Math.min(Math.trunc(a.skill / 10), word(t, 100) - healthBefore),
        );
        nutrition(t, Math.trunc(a.skill / 5) + 1);
        out.events.push({
          type: "healing",
          actor: index,
          target: current.index,
          healthBefore,
          healthAfter: word(t, 106),
          reserveBefore,
          reserveAfter: word(t, 104),
        });
      }
      n[89] = 14;
    }
    if (out.status !== "released") {
      n[28] = 1;
      n[29] = 0;
    }
  } else if (arrived(n)) {
    put(n, 112, word(n, 112) & 0xfeef);
    n[113] = byte(n, 113) | 1;
  } else continueMovement(s, index, 0, c);
  Object.assign(world, s);
  return out;
}
export function stepGeneticistRole<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: GeneticistContext<W>,
): GeneticistReceipt {
  return runGeneticistRole(w, index, c, false);
}
/** Already-isolated57A10 service; retained actor/target/player records stay held. */
export function stepStagedGeneticistRole<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: GeneticistContext<W>,
): GeneticistReceipt {
  return runGeneticistRole(w, index, c, true);
}
