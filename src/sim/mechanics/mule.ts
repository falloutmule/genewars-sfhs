import { creatureParameters, creatureComponents, creatureSelector, chooseCreatureOffspring } from "./creature-species";
import { nextRandom, type GeneRng } from "./random";
import {
  originalAngle,
  terrainNormal,
  velocity,
  createMotion,
  resolveMovementTarget,
  type MotionTables,
} from "./motion";
import {
  groundHeight,
  worldCell,
  integerSqrt,
  torusDelta,
  type TerrainState,
} from "./terrain";
import {
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
  type AnimationState,
} from "./animation";
import {
  cloneEcologyState,
  damagePlant,
  ecologyTerrainClass,
  muleLifecycleTail,
  muleRequestedSpeed,
  plantBlockerWeight,
  type EcologyState,
  type EcologyRules,
  type EcologyMule,
} from "./ecology";
import { initializeMuleNative } from "./genepod";
import {
  stepMuleMaterialWork,
  stepMuleMaterialTravel,
  finishMuleMaterialCut,
  resumeMuleMaterialTask,
  type MuleHaulingContext,
} from "./mule-hauling";
import {
  chooseMuleHostile,
  contactMuleHostile,
  acquireMuleHostile,
  completeMuleAttack,
  queryMuleCombat,
  queryMuleCellFallback,
  resolveMuleHostileQuery,
  damageMuleFromSource,
  resolveMuleCombatTarget,
  consumeMuleCombatQuery,
  beginMuleAttack,
  muleCombatTargetDistance,
  type MuleCombatTraits,
  type MuleCombatEffectRequest,
  type MuleCombatContext,
  type MuleCombatPorts,
  type MuleDamageAttacker,
  type MuleCombatTarget,
  type MuleCombatQuery,
} from "./mule-combat";

type Native = (number | null)[];
const signed = (v: number) => (v << 16) >> 16;
const w = (n: Native, p: number) => {
  if (n[p] === null || n[p + 1] === null)
    throw new Error("Mule native field has no initialized value");
  return signed(n[p]! | (n[p + 1]! << 8));
};
const d = (n: Native, p: number) => (w(n, p) & 65535) | (w(n, p + 2) << 16);
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const point = (n: Native): [number, number] => [w(n, 7), w(n, 9)];
export interface MuleContext {
  /** Actual104A64 component rows; required for admitted non-Mule species. */
  speciesComponents?: readonly (readonly number[])[];
  /**Already isolated full-host material services, required lazily on entry. */
  material?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    mule: EcologyMule,
  ): MuleHaulingContext;
  /**Callback-owned closure; installed only by stepMule for actual5CC60. */
  materialRuntime?(mule: EcologyMule): MuleHaulingContext;
  terrain: TerrainState;
  tables: MotionTables;
  rules: EcologyRules;
  frame: number;
  gravity: number;
  water: number;
  climate: number;
  bounce: readonly number[];
  profile(action: number, state: number): AnimationProfile;
  bonesProfile?(action: number): AnimationProfile;
  /** Source74270 building/entity obstacle result, before terrain/plant checks. */
  obstacleAt(position: [number, number], mule: EcologyMule): boolean;
  /** Actual source shared-cell list order, head first. Required when more than
   * one living Mule can affect a5B100/5B260 query. */
  cellOrder?(cell: number): readonly string[];
  /** Native69 selector for an actual shared family4 identity. Read lazily
   * when a query visits an effect, before the source code11 exception. */
  effectCode?(id: string): number;
  /** Source8ACC0/8AC60 before cell-entry virtual88. The normal host publishes
   * actual intrusive links/native headers into this same staged transaction. */
  relocate?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    mule: EcologyMule,
    oldCell: number,
    newCell: number,
  ): void;
  /** Exact74270 result at current physical height, not a broad rectangle. */
  airborneObstacle?(
    position: [number, number],
    height: number,
    mule: EcologyMule,
  ): { position: [number, number]; ground: number } | null;
  /** Actual300-slot native backing, including inactive retained bytes. Only
   * read by a successful natural birth; never synthesized from a slot count. */
  creaturePriors?: readonly Native[];
  combat?: MuleCombatTraits;
  combatEntity?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    id: string,
  ): MuleCombatTarget | null;
  combatDamage?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    self: EcologyMule,
    target: MuleCombatTarget,
    amount: number,
  ): boolean;
  combatBuildingAt?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    self: EcologyMule,
  ): string | null;
  /** Complete74D90 predicate with the actual nominated4D building only. */
  combatBuildingPointAccepted?(
    state: EcologyState,
    terrain: TerrainState,
    mule: EcologyMule,
    point: [number, number],
    buildingIndex: number,
  ): boolean;
  combatEffect?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    request: MuleCombatEffectRequest,
  ): void;
  /** Synchronous6C900/6C780 before nutrition and neighborhood traversal.
   * Retirement must publish actual unlink/count/reference cleanup into the
   * supplied staged host while preserving held Mule/native identities. */
  plantDamage?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    index: number,
    amount: number,
  ): void;
  /**6D500 cold shatter14, called before source retirement/unlink receipt.
   * The factory must use the supplied staged host and RNG. */
  coldBurst?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    mule: EcologyMule,
    request: {
      code: 14;
      count: number;
      parameter1: 80;
      parameter2: 70;
      height: -1;
    },
  ): void;
  /** Signed original component temperature-loss bytes, admitted by importer. */
  coldResponse?: { primaryLoss: number; secondaryLoss: number };
  owned?: {
    selectedPlayer: number;
    globalFlags: number;
    allianceMasks: readonly number[];
    buildings: readonly { index: number; native: Native }[];
    /** Actual player1805 records, read lazily for inherited-trait birth gates. */
    players?: readonly (readonly number[])[];
    /** Complete actual category3 roster's control fields for source5D700.
     * An empty actual roster establishes no operator; absence is not assumed. */
    operators: readonly {
      owner: number;
      position: [number, number];
      enabled: number;
      commandState: number;
      flags70: number;
      mode: number;
      range: number;
      /** Source blueprint byte17, used only by a qualifying mode1 operator. */
      attackBonus?: number;
    }[];
  };
}
export interface MuleEvent {
  kind:
    | "mule-moved"
    | "mule-target"
    | "mule-fed"
    | "mule-died"
    | "mule-retired"
    | "mule-audio"
    | "mule-water-effect"
    | "mule-water-damage"
    | "mule-reveal"
    | "mule-command-feedback"
    | "mule-born"
    | "mule-effect"
    | "mule-combat-damage"
    | "mule-combat-kill"
    | "mule-portrait-refresh";
  id: string;
  position?: [number, number];
  target?: number;
  targetKind?: 1 | 2 | 3 | 4;
  channel?: number;
  code?: number;
  height?: number;
  damage?: number;
  attackerOwner?: number;
  attackerKind?: number;
  victimOwner?: number;
  index?: number;
  angles?: [number, number, number];
  vertices?: [number, number][];
  buildingShades?: { index: number; shade: number }[];
  newborn?: {
    index: number;
    native: Native;
    owner: number;
    bornCounterIncrement: number;
  };
  retirement?: {
    cleanupTarget: { index: number; kind: 1 };
    countDelta: -1;
    displayPhase: 11;
    portraitRefresh: true;
    moduleCleanup: true;
  };
}
export interface MuleStepResult {
  committed: boolean;
  reason: string | null;
  events: MuleEvent[];
}
/**74270/74160's source ordering, physical-height argument and first-candidate
 * rejection semantics. Current frame metadata must come from the actual ANB. */
export function queryMuleAirborneBuilding(
  terrain: TerrainState,
  at: [number, number],
  height: number,
  firstLinkedBuilding: (cell: number) => Native | null,
  heightRaw: (native: Native) => number,
  mask: 0 | 1 = 1,
  searchOffsets?: readonly (readonly [number, number])[],
): { native: Native; position: [number, number]; ground: number } | null {
  if (!(terrain.bytes[worldCell(...at) * 14 + 11] & 1)) return null;
  const classes = [3, 1, 2, 3, 2, 2, 1, 2, 1, 2, 3, 3, 2, 1];
  const offsets = searchOffsets ?? [
    [0, 0],
    [256, 0],
    [256, 256],
    [0, 256],
    [-256, 256],
    [-256, 0],
    [-256, -256],
    [256, -256],
    [7680, 0],
  ];
  if (
    offsets.length !== 9 ||
    offsets.some(
      (p) =>
        p.length !== 2 ||
        p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767),
    )
  )
    throw Error("Original74160 nine signed-word query offsets required");
  for (const [i, delta] of offsets.entries()) {
    const n = firstLinkedBuilding(
      worldCell(signed(at[0] + delta[0]), signed(at[1] + delta[1])),
    );
    if (!n) continue;
    if (n[6] !== 4 || !classes[n[45]!])
      throw new Error(
        "Airborne building query has an invalid actual native record",
      );
    const shape = classes[n[45]!];
    if (shape === 2 && i >= 4) continue;
    if ((w(n, 49) & mask) !== mask) return null;
    const extent = shape === 1 ? 85 : shape === 2 ? 128 : 256;
    if (
      Math.abs(signed(w(n, 7) - at[0])) > extent ||
      Math.abs(signed(w(n, 9) - at[1])) > extent
    )
      return null;
    const ground = d(n, 17);
    if (height >= 0) {
      const raw = heightRaw(n);
      if (!Number.isInteger(raw) || raw < -32768 || raw > 32767)
        throw new Error(
          "Original building current-frame raw height is required",
        );
      if (((height - ground) | 0) > (((raw << 6) - 320) | 0)) return null;
    }
    return { native: n, position: point(n), ground };
  }
  return null;
}
function distance(
  terrain: TerrainState,
  from: [number, number],
  to: [number, number],
): number {
  const x = torusDelta(to[0], from[0]),
    y = torusDelta(to[1], from[1]),
    z = (groundHeight(terrain, ...to) - groundHeight(terrain, ...from)) >> 3;
  return (Math.imul(x, x) + Math.imul(y, y) + Math.imul(z, z)) | 0;
}
function renderShade(
  terrain: TerrainState,
  position: [number, number],
): number {
  const [x, y] = position.map((v) => v >> 8),
    [fx, fy] = position.map((v) => v & 255);
  const vertex = (dx: number, dy: number) => {
    const at = (((y + dy) & 127) * 128 + ((x + dx) & 127)) * 14;
    return (
      (signed(terrain.bytes[at] | (terrain.bytes[at + 1] << 8)) *
        terrain.bytes[at + 12]) >>
      6
    );
  };
  const a = vertex(0, 0),
    b = vertex(1, 0),
    c = vertex(0, 1),
    e = vertex(1, 1);
  return Math.max(
    0,
    Math.min(
      64,
      ((2 * a +
        ((fx < fy
          ? (e - c) * fx + (c - a) * fy
          : (b - a) * fx + (e - b) * fy) >>
          7) -
        0x1e00) >>
        8) +
        16,
    ),
  );
}
function accepted(
  state: EcologyState,
  mule: EcologyMule,
  at: [number, number],
  c: MuleContext,
): boolean {
  if (mule.native[79] === 4) {
    if (!c.combatBuildingPointAccepted)
      throw Error(
        "Mule nominated building movement requires the actual74D90 predicate",
      );
    const admitted = c.combatBuildingPointAccepted(
      state,
      c.terrain,
      mule,
      at,
      w(mule.native, 77),
    );
    if (typeof admitted !== "boolean")
      throw Error(
        "Mule building movement predicate requires an actual boolean",
      );
    return admitted;
  }
  if (c.obstacleAt(at, mule)) return false;
  const mask=mule.native[83];
  if (!Number.isInteger(mask) || mask!<0 || mask!>255) throw Error("Actual creature terrain-avoidance mask required");
  if (mask! & (1<<ecologyTerrainClass(c.terrain, at))) return false;
  const n = mule.native,
    cell = worldCell(...at);
  if ((n[0x5f] === 1 || n[0x5e] === 1 || n[0x5e] === 7) && n[0x57] === 2) {
    const target = state.plants[w(n, 0x55)];
    if (target?.active && worldCell(...target.position) === cell) return true;
  }
  return plantBlockerWeight(state, cell) < 10;
}
/** Exact743C0 fixed-point sample walk, with live point-admission callback. */
function straightRay(
  from: [number, number],
  to: [number, number],
  tables: MotionTables,
  accept: (point: [number, number]) => boolean,
): { clear: boolean; failure: [number, number] | null } {
  if (!accept(from)) return { clear: true, failure: null }; // source's initial rejected point bypasses loop
  let fixed = [from[0] << 16, from[1] << 16],
    step = [0, 0];
  for (let iteration = 0; iteration < 1024; iteration++) {
    const p: [number, number] = [fixed[0] >> 16, fixed[1] >> 16];
    if ((iteration & 63) === 0) {
      const a = originalAngle(
          signed(signed(to[0] - p[0]) * 2),
          signed(signed(to[1] - p[1]) * 2),
          tables.atan,
        ),
        index = a < 512 ? a + 1536 : a - 512;
      step = [tables.cosine[index] << 6, tables.sine[index] << 6];
    }
    const dx = signed(signed(to[0] - p[0]) * 2) >> 1,
      dy = signed(signed(to[1] - p[1]) * 2) >> 1,
      done = (Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0 <= 4096;
    if (!accept(done ? to : p))
      return {
        clear: false,
        failure: [
          ((fixed[0] - step[0]) | 0) >> 16,
          ((fixed[1] - step[1]) | 0) >> 16,
        ],
      };
    fixed = [(fixed[0] + step[0]) | 0, (fixed[1] + step[1]) | 0];
    if (done) return { clear: true, failure: null };
  }
  throw new Error("Original Mule ray sample bound exceeded");
}
export function muleStraightRay(
  from: [number, number],
  to: [number, number],
  tables: MotionTables,
  accept: (point: [number, number]) => boolean,
): boolean {
  return straightRay(from, to, tables, accept).clear;
}
const WALK_STEPS: [number, number][] = [
  [0, -128],
  [128, -128],
  [128, 0],
  [128, 128],
  [0, 128],
  [-128, 128],
  [-128, 0],
  [-128, -128],
];
const walkPoint = (
  at: [number, number],
  direction: number,
): [number, number] => [
  signed(at[0] + WALK_STEPS[direction][0]),
  signed(at[1] + WALK_STEPS[direction][1]),
];
function boundaryDirection(
  at: [number, number],
  direction: number,
  clockwise: boolean,
  accept: (p: [number, number]) => boolean,
) {
  const original = accept(walkPoint(at, direction));
  for (let i = 0; i < 8; i++) {
    const forward = original ? clockwise : !clockwise;
    direction = (direction + (forward ? 1 : 7)) & 7;
    if (accept(walkPoint(at, direction)) !== original)
      return original ? (direction + (clockwise ? 7 : 1)) & 7 : direction;
  }
  return direction;
}
export interface MuleWaypoint {
  cost: number;
  point: [number, number] | null;
}
/** Source6F0C0/6EDE0: two callers choose the boundary side; no invented grid path. */
export function muleWaypoint(
  position: [number, number],
  start: [number, number],
  target: [number, number],
  side: boolean,
  limit: number,
  tables: MotionTables,
  accept: (p: [number, number]) => boolean,
): MuleWaypoint {
  if (!Number.isInteger(limit) || limit < 1 || limit > 120)
    throw new Error("Original Mule waypoint limit is invalid");
  if (!accept(target)) return { cost: limit + 1, point: null };
  const angle = originalAngle(
    signed(signed(target[0] - start[0]) * 2),
    signed(signed(target[1] - start[1]) * 2),
    tables.atan,
  );
  let direction = boundaryDirection(
      start,
      ((angle + 128) >> 8) & 7,
      !side,
      accept,
    ),
    at: [number, number] = [...start],
    output: [number, number] = [...start],
    first: [number, number] | null = null,
    bestStep = 0,
    steps = 0;
  const visited: ([number, number] | null)[] = Array(128).fill(null),
    equal = (a: [number, number], b: [number, number]) =>
      a[0] === b[0] && a[1] === b[1];
  const squared = (p: [number, number]) => {
    const dx = signed(signed(p[0] - position[0]) * 2) >> 1,
      dy = signed(signed(p[1] - position[1]) * 2) >> 1;
    return (Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0;
  };
  for (;;) {
    const hash = signed(at[0] + at[1]) & 127;
    let slot = hash,
      repeat = false;
    for (let i = 0; i < 128; i++) {
      const prior = visited[slot];
      if (!prior) break;
      if (equal(prior, at)) {
        repeat = true;
        break;
      }
      slot = (slot + 1) & 127;
    }
    if (repeat) {
      if (bestStep > Math.trunc(steps / 2)) {
        if (!first)
          throw new Error("Original waypoint cycle has no first point");
        output = first;
      }
      return { cost: limit + 1, point: output };
    }
    direction = boundaryDirection(at, direction, side, accept);
    slot = hash;
    for (let i = 0; i < 128 && visited[slot]; i++) slot = (slot + 1) & 127;
    if (visited[slot])
      throw new Error("Original waypoint visited table is full");
    visited[slot] = at;
    at = walkPoint(at, direction);
    if (
      !first ||
      (muleStraightRay(at, position, tables, accept) &&
        squared(at) >= squared(output))
    ) {
      if (!first) first = at;
      output = at;
      bestStep = steps;
    }
    const finished = muleStraightRay(at, target, tables, accept);
    steps = (steps + 1) & 255;
    if (finished || steps >= limit) return { cost: steps, point: output };
  }
}
/** Bounded5B100 state8/plant-approach predicate. Source list order matters only
 * with multiple live creatures; that interaction remains an explicit gate. */
function cellEntryPredicate(
  state: EcologyState,
  mule: EcologyMule,
  cell: number,
  c?: MuleContext,
  entering = false,
): boolean {
  const n = mule.native,
    occupants = state.mules.filter(
      (other) =>
        other.native[6] === 1 &&
        other.native[0x5e]! < 24 &&
        (worldCell(...point(other.native)) === cell ||
          (entering && other.id === mule.id)),
    );
  let ordered = occupants;
  if (occupants.length > 1) {
    if (!c?.cellOrder)
      throw new Error("Mule cell-entry requires shared creature list order");
    const ids = [...c.cellOrder(cell)].filter(
      (id) => id !== mule.id || !entering,
    );
    if (entering) ids.unshift(mule.id);
    ordered = ids.flatMap((id) => occupants.filter((other) => other.id === id));
    if (
      ordered.length !== occupants.length ||
      new Set(ordered.map((other) => other.id)).size !== occupants.length
    )
      throw new Error("Mule cell-entry list does not match living occupants");
  }
  if (w(n, 0x49) & 0x400)
    throw new Error("Mule attached cell-entry predicate is required");
  const last = ordered.at(-1);
  if (n[0x5e] === 10 && worldCell(w(n, 11), w(n, 13)) === cell)
    return cellHasEffect11(state, cell, c);
  if (n[0x5e] === 1 && n[0x57] === 1 && last?.id !== mule.id) {
    const target = state.mules.find((other) => other.index === w(n, 0x55));
    if (
      target &&
      last?.id === target.id &&
      target.native[0x5e]! < 24 &&
      worldCell(...point(target.native)) === cell
    )
      return ordered.length > 2 || cellHasEffect11(state, cell, c);
    return true;
  }
  return last?.id !== mule.id || cellHasEffect11(state, cell, c);
}
function cellHasEffect11(
  state: EcologyState,
  cell: number,
  c?: MuleContext,
): boolean {
  const ids =
    c?.cellOrder?.(cell).filter((id) => id.startsWith("source:4:")) ??
    state.otherEntities
      .filter((e) => e.kind === 5 && worldCell(...e.position) === cell)
      .map((e) => e.id);
  return ids.some((id) => {
    if (!c?.effectCode)
      throw new Error(
        "Mule effect query requires the actual shared-pool selector",
      );
    const selector = c.effectCode(id);
    if (!Number.isInteger(selector) || selector < 0 || selector > 255)
      throw new Error("Mule shared effect has no initialized numeric selector");
    return selector === 17;
  });
}
function routePrefix(
  state: EcologyState,
  mule: EcologyMule,
  random: GeneRng,
  c: MuleContext,
  phase: number,
): { working: [number, number]; savedSpeed: number | null } {
  const n = mule.native,
    current = point(n),
    accept = (at: [number, number]) => accepted(state, mule, at, c);
  let target: [number, number] = [w(n, 11), w(n, 13)];
  const associated =
    n[0x52] === 1
      ? state.mules.find(
          (m) =>
            m.index === w(n, 0x50) && m.id !== mule.id && m.native[6] === 1,
        )
      : n[0x52] === 3
        ? (resolveMuleCombatTarget(
            state,
            combatServices(state, random, c, []).context,
            3,
            w(n, 0x50),
          ) ?? undefined)
        : undefined;
  if (
    (n[0x4f] !== 0 && n[0x4f] !== 4) ||
    (n[0x52] !== 0 && !associated) ||
    n[0x4a]! & 4
  )
    throw new Error("Mule association movement prefix is required");
  if (
    n[79] === 4 &&
    !resolveMuleCombatTarget(
      state,
      combatServices(state, random, c, []).context,
      4,
      w(n, 77),
    )
  )
    throw Error("Mule nominated building source binding is missing");
  if (associated && (n[0x49]! & 3) === 3) {
    target = point(associated.native);
    put(n, 11, target[0]);
    put(n, 13, target[1]);
  }
  n[0x49] = n[0x49]! & 0x9f;
  if ((n[0x49]! & 3) === 3) {
    let flags = w(n, 0x49);
    if (
      (phase & 3) === 3 &&
      !cellEntryPredicate(state, mule, worldCell(...target), c)
    ) {
      n[0x54] = 20;
      flags &= 0xeffc;
      n[0x16] = n[0x16]! & 0x7f;
    } else {
      n[0x54] = (n[0x54]! - 1) & 255;
      if (n[0x54] === 0) {
        n[0x54] = 20;
        flags = (flags & 0xeebc) | 0x140;
        n[0x16] = n[0x16]! & 0x7f;
      }
    }
    put(n, 0x49, flags);
    if (phase & 1)
      put(
        n,
        0x4b,
        originalAngle(
          signed(signed(target[0] - current[0]) * 2),
          signed(signed(target[1] - current[1]) * 2),
          c.tables.atan,
        ),
      );
    const savedSpeed = w(n, 0x3f);
    put(n, 0x3f, 0);
    return { working: target, savedSpeed };
  }
  let working: [number, number] =
      n[0x49]! & 3 ? [w(n, 0x45), w(n, 0x47)] : target,
    immediate = false;
  if (
    n[0x49]! & 0x10 &&
    (n[0x49]! & 0x0c || (associated && (phase & 3) === 3 && !(n[0x49]! & 3)))
  ) {
    if (associated) {
      target = point(associated.native);
      put(n, 11, target[0]);
      put(n, 13, target[1]);
      if (!(n[0x49]! & 3)) working = target;
    }
    if (!accept(target)) {
      target = resolveMovementTarget(current, target, c.tables, accept);
      put(n, 11, target[0]);
      put(n, 13, target[1]);
      if (!(n[0x49]! & 3)) working = target;
    }
    const from = n[0x49]! & 3 ? working : current,
      ray = straightRay(from, target, c.tables, accept);
    if (ray.clear) {
      if (n[0x49]! & 3) {
        put(n, 0x49, w(n, 0x49) & 0xeffc);
        n[0x16] = n[0x16]! & 0x7f;
        immediate = true;
      }
      n[0x49] = n[0x49]! & 0xf3;
      working = target;
      if (n[79] === 4 && !(w(n, 73) & 128)) {
        const building = resolveMuleCombatTarget(
          state,
          combatServices(state, random, c, []).context,
          4,
          w(n, 77),
        );
        const radius = building?.buildingHalfWidth;
        if (!building || !Number.isInteger(radius))
          throw Error("Admitted nominated building104E12 radius required");
        target = point(building.native);
        put(n, 11, target[0]);
        put(n, 13, target[1]);
        const yaw = originalAngle(
          signed((target[0] - current[0]) * 2),
          signed((target[1] - current[1]) * 2),
          c.tables.atan,
        );
        put(n, 75, yaw);
        const trig = (yaw + 1024 + 1536) & 2047;
        working = [
          signed(target[0] + (Math.imul(radius!, c.tables.cosine[trig]) >> 16)),
          signed(target[1] + (Math.imul(radius!, c.tables.sine[trig]) >> 16)),
        ];
        put(n, 11, working[0]);
        put(n, 13, working[1]);
      }
    } else {
      if (n[0x49]! & 3) {
        if (n[0x49]! & 8) {
          const result = muleWaypoint(
            current,
            from,
            target,
            !!(n[0x49]! & 1),
            120,
            c.tables,
            accept,
          );
          working = result.point ?? from;
          if (result.cost < 120) immediate = true;
          else {
            n[0x54] = (n[0x54]! - 1) & 255;
            if (n[0x54] === 0) {
              put(n, 0x49, (w(n, 0x49) & 0xeebc) | 0x140);
              n[0x16] = n[0x16]! & 0x7f;
            }
          }
        }
      } else {
        if (!ray.failure)
          throw new Error("Blocked Mule ray has no failure point");
        const first = muleWaypoint(
            current,
            ray.failure,
            target,
            false,
            120,
            c.tables,
            accept,
          ),
          second = muleWaypoint(
            current,
            ray.failure,
            target,
            true,
            first.cost < 120 ? first.cost + 1 : 120,
            c.tables,
            accept,
          );
        put(n, 0x49, w(n, 0x49) & 0xeffc);
        n[0x16] = n[0x16]! & 0x7f;
        const failed = first.cost >= 120 && second.cost >= 120;
        if (failed) n[0x54] = (n[0x54]! - 1) & 255;
        if (failed && n[0x54] === 0) {
          put(n, 0x49, w(n, 0x49) | 0x140);
          working = [w(n, 0x45), w(n, 0x47)];
        } else {
          if (failed && first.cost === 121 && second.cost === 121)
            n[0x16] = n[0x16]! | 0x80;
          const chooseFirst =
              failed && first.cost === second.cost
                ? nextRandom(random) % 10 < 5
                : first.cost < second.cost,
            result = chooseFirst ? first : second;
          if (!result.point)
            throw new Error("Original Mule waypoint did not produce a point");
          working = result.point;
          put(n, 0x49, w(n, 0x49) | (chooseFirst ? 0x1002 : 0x1001));
          immediate = true;
        }
      }
      put(n, 0x45, working[0]);
      put(n, 0x47, working[1]);
      n[0x49] = n[0x49]! & 0xf3;
    }
  }
  if (n[0x49]! & 0x10 && (immediate || phase & 1))
    put(
      n,
      0x4b,
      originalAngle(
        signed(signed(working[0] - current[0]) * 2),
        signed(signed(working[1] - current[1]) * 2),
        c.tables.atan,
      ),
    );
  return { working, savedSpeed: null };
}
function setVelocity(n: Native, tables: MotionTables) {
  const m = createMotion(
    ...point(n),
    d(n, 0x11),
    w(n, 0x3f),
    w(n, 0x2b) & 65535,
  );
  m.yaw = w(n, 0x39);
  m.pitch = w(n, 0x3b);
  m.speed = w(n, 0x3d);
  if (m.yaw < 0 || m.yaw > 2048 || m.pitch < 0 || m.pitch > 2048 || m.speed < 0)
    throw new Error("Mule velocity is outside original angle/speed bounds");
  velocity(m, tables);
  put(n, 0x2d, m.vx);
  put(n, 0x2f, m.vy);
  put(n, 0x31, m.vz);
}
function angles(n: Native, c: MuleContext) {
  const x = w(n, 0x2d),
    y = w(n, 0x2f),
    z = w(n, 0x31),
    xy = integerSqrt((Math.imul(x, x) + Math.imul(y, y)) >>> 0);
  if (xy) put(n, 0x39, originalAngle(x, y, c.tables.atan));
  const speed = signed(
    integerSqrt((Math.imul(xy, xy) + Math.imul(z, z)) >>> 0),
  );
  put(n, 0x3d, speed);
  put(n, 0x3b, speed === 0 ? 512 : originalAngle(xy, -z, c.tables.atan));
}
function commonContactSpeed(
  n: Native,
  normal: [number, number, number],
  previous: number,
  desired: number,
  squaredDistance: number,
): number {
  const speed = w(n, 0x41),
    width = w(n, 0x2b) & 65535,
    brake = () => (speed > width ? signed(speed - width) : 0);
  if (n[0x4a]! & 0x20) return brake();
  if (!(n[0x4a]! & 0x10)) {
    if (!width) throw new Error("Original zero-width contact division");
    const quotient = Math.trunc((speed * speed) / (width << 7));
    if (squaredDistance <= Math.imul(quotient, quotient)) return brake();
  }
  const surface = normal[2] + (previous < d(n, 0x11) ? 0 : 128) - 128;
  desired = Math.imul(surface, desired) >> 7;
  return Math.abs(speed - desired) <= width
    ? signed(desired)
    : desired < speed
      ? brake()
      : signed(speed + width);
}
function contact(
  state: EcologyState,
  n: Native,
  normal: [number, number, number],
  previous: number,
  c: MuleContext,
  random: GeneRng,
): number {
  const at = point(n),
    cell = worldCell(...at),
    terrainClass = ecologyTerrainClass(c.terrain, at);
  let desired = w(n, 0x3f);
  if (terrainClass === 2) desired = signed(Math.trunc((desired * 4) / 5));
  if (terrainClass === 5) desired = signed(Math.trunc((desired * 5) / 6));
  const candidates = state.plants.filter(
    (plant) => plant.active && worldCell(...plant.position) === cell,
  );
  const order = state.plantOrder?.[String(cell)];
  if (candidates.length > 1 && !order)
    throw new Error("Source cell plant order is required for contact query");
  const nearby = order
    ? state.plants[order.find((index) => state.plants[index].active)!]
    : candidates[0];
  if (nearby) {
    const dx = torusDelta(nearby.position[0], at[0]),
      dy = torusDelta(nearby.position[1], at[1]),
      z = (nearby.height - d(n, 0x27)) >> 3;
    if (
      ((Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(z, z)) | 0) <=
      nearby.animation * 32 + 64
    )
      desired = signed(Math.trunc((desired * 3) / 4));
  }
  return commonContactSpeed(
    n,
    normal,
    previous,
    desired,
    n[0x52] === 3
      ? (() => {
          const target = resolveMuleCombatTarget(
            state,
            combatServices(state, random, c, []).context,
            3,
            w(n, 80),
          );
          if (!target)
            throw Error("Mule physical specialist target is missing");
          return muleCombatTargetDistance(n, target) | 0;
        })()
      : n[0x52] === 1 &&
          ([1, 3, 4, 5].includes(n[0x5e]!) || (n[24] === 4 && n[0x5e] === 8))
        ? (() => {
            const peer = state.mules.find((m) => m.index === w(n, 0x50));
            if (!peer) throw new Error("Mule physical target is missing");
            const to = point(peer.native),
              dx = torusDelta(to[0], at[0]),
              dy = torusDelta(to[1], at[1]),
              z = ((d(peer.native, 0x27) - d(n, 0x27)) | 0) >> 3;
            return (
              (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(z, z)) | 0
            );
          })()
        : distance(
            c.terrain,
            at,
            n[0x49]! & 3 ? [w(n, 0x45), w(n, 0x47)] : [w(n, 11), w(n, 13)],
          ),
  );
}
/**5B260 after actual source insertion.6E9E0 invokes this before assigning
 * its final snapped position, so newCell is an explicit source cell argument. */
function sourceCellEntry(
  state: EcologyState,
  mule: EcologyMule,
  oldCell: number,
  newCell: number,
  random: GeneRng,
  c: MuleContext,
) {
  const n = mule.native;
  c.relocate?.(state, c.terrain, random, mule, oldCell, newCell);
  if (cellEntryPredicate(state, mule, newCell, c, true)) {
    //5B260 has no creature-state test. Its waypoint path also runs while
    //an attack/hit animation coasts across a cell; only virtual10 and8C
    //gate it.74D90 permits its nominated building using the actual host
    //predicate; ordinary movement uses the actual native terrain mask.
    if (n[0x4f] !== 0 && n[0x4f] !== 4)
      throw new Error(
        "Mule cell-entry action requires its associated entity callback",
      );
    const step = nextRandom(random) & 1 ? 256 : -256;
    let heading = w(n, 0x4b),
      at: [number, number] = point(n);
    for (let attempt = 0; attempt < 8; attempt++) {
      heading = (heading + 2048 + step) & 2047;
      const index = (heading + 1536) & 2047;
      at = [
        (signed(
          signed(w(n, 7) * 2) + signed((c.tables.cosine[index] * 512) >> 16),
        ) >>
          1) &
          32767,
        (signed(
          signed(w(n, 9) * 2) + signed((c.tables.sine[index] * 512) >> 16),
        ) >>
          1) &
          32767,
      ];
      if (accepted(state, mule, at, c)) break;
    }
    put(n, 0x45, at[0]);
    put(n, 0x47, at[1]);
    n[0x49] = n[0x49]! | 1;
    if (worldCell(w(n, 11), w(n, 13)) === newCell) {
      n[0x54] = 80;
      n[0x4a] = n[0x4a]! & 0xef;
    } else n[0x4a] = n[0x4a]! | 0x10;
  }
}
function physics(
  state: EcologyState,
  mule: EcologyMule,
  c: MuleContext,
  events: MuleEvent[],
  random: GeneRng,
) {
  const n = mule.native,
    before = n.slice(),
    oldCell = worldCell(...point(n)),
    oldGround = d(n, 0x11),
    wasGrounded = d(n, 0x27) <= oldGround;
  const corpse =
    [24, 25, 26, 27].includes(n[0x5e]!) &&
    w(n, 0x3f) === -1 &&
    !!(n[0x15]! & 0x80);
  if (
    n[0x16]! & 9 ||
    n[0x15]! & 0x20 ||
    w(n, 0x49) & 0x400 ||
    (w(n, 0x3f) < 0 && !corpse)
  )
    throw new Error(
      "Mule airborne/dead/attached physics branch is not admitted",
    );
  for (let axis = 0; axis < 3; axis++)
    put(
      n,
      0x2d + 2 * axis,
      w(before, 0x2d + 2 * axis) +
        w(before, 0x33 + 2 * axis) -
        (axis === 2 ? c.gravity : 0),
    );
  const candidateHeight = (d(before, 0x27) + (w(n, 0x31) >> 3)) | 0;
  const fixed = (axis: number) =>
    ((w(n, 7 + 2 * axis) << 16) +
      (n[0x43 + axis]! << 8) +
      (w(n, 0x2d + 2 * axis) << 10)) |
    0;
  const candidate: [number, number] = [fixed(0) >> 16, fixed(1) >> 16],
    ground = groundHeight(c.terrain, ...candidate);
  put32(n, 0x11, ground);
  n[0x17] = renderShade(c.terrain, candidate);
  if (candidateHeight <= ground) {
    put32(n, 0x27, ground);
    if (wasGrounded || before[0x15]! & 0x40) {
      if (corpse) {
        const speed = integerSqrt(
          [0x2d, 0x2f, 0x31].reduce(
            (sum, at) => (sum + Math.imul(w(n, at), w(n, at))) >>> 0,
            0,
          ),
        );
        if (speed) {
          const friction =
            c.rules.corpseFriction?.[
              ecologyTerrainClass(c.terrain, point(before))
            ];
          if (friction === undefined)
            throw new Error("Original corpse-friction table is required");
          if (speed <= friction) n.fill(0, 0x2d, 0x33);
          else {
            const factor = Math.trunc(((speed - friction) << 6) / speed);
            for (const at of [0x2d, 0x2f, 0x31])
              put(n, at, Math.floor((w(n, at) * factor) / 64));
          }
        }
      }
      const normal = terrainNormal(c.terrain, ...point(before));
      put(n, 0x31, signed(signed(ground) - signed(oldGround)) * 8);
      angles(n, c);
      if (!corpse) {
        const speed = contact(state, n, normal, signed(oldGround), c, random);
        put(n, 0x41, speed);
        put(n, 0x3d, speed);
      }
      setVelocity(n, c.tables);
      for (let axis = 0; axis < 2; axis++) {
        const value = fixed(axis);
        put(n, 7 + 2 * axis, value >> 16);
        n[0x43 + axis] = (value >> 8) & 255;
      }
      const sampled = groundHeight(c.terrain, ...point(n));
      put32(n, 0x11, sampled);
      put32(n, 0x27, sampled);
      n[0x17] = renderShade(c.terrain, point(n));
    } else {
      for (let axis = 0; axis < 2; axis++) {
        const value = fixed(axis);
        put(n, 7 + 2 * axis, candidate[axis]);
        n[0x43 + axis] = (value >> 8) & 255;
      }
      const normal = terrainNormal(c.terrain, ...candidate),
        cls = ecologyTerrainClass(c.terrain, candidate),
        vz = w(n, 0x31);
      //6E3E1 calls virtual34 only for a positive impact.5B9F0 immediately
      //returns for state>=24: no damage, audio, RNG or lifecycle mutation.
      if ((!corpse && Math.trunc((vz >> 6) / 16) > 0) || c.bounce.length !== 8)
        throw new Error("Mule contact bounce requires an admitted coefficient");
      const bounced = signed((Math.abs(vz) * c.bounce[cls]) >> 8);
      put(n, 0x31, bounced);
      for (let axis = 0; axis < 2; axis++)
        put(
          n,
          0x2d + 2 * axis,
          w(n, 0x2d + 2 * axis) + Math.trunc((bounced * normal[axis]) / 256),
        );
      angles(n, c);
    }
  } else {
    for (let axis = 0; axis < 2; axis++) {
      const value = fixed(axis);
      put(n, 7 + 2 * axis, candidate[axis]);
      n[0x43 + axis] = (value >> 8) & 255;
    }
    put32(n, 0x27, Math.max(candidateHeight, 0));
    angles(n, c);
    //6E620..6E757 caps free airborne speed after deriving its angles. The
    //negative desired speed does not freeze a corpse or invoke living contact.
    if (corpse && w(n, 0x3d) > 19200) {
      put(n, 0x3d, 12800);
      setVelocity(n, c.tables);
    }
  }
  const newCell = worldCell(...point(n));
  if (newCell !== oldCell) {
    sourceCellEntry(state, mule, oldCell, newCell, random, c);
    events.push({ kind: "mule-moved", id: mule.id, position: point(n) });
  }
  const phase = (c.frame + w(n, 15)) >>> 0;
  if (phase & 1 && d(n, 0x27) > d(n, 0x11)) {
    const obstacle = c.airborneObstacle?.(point(n), d(n, 0x27), mule);
    if (obstacle) {
      const dx = signed(w(n, 7) * 2 - obstacle.position[0] * 2),
        dy = signed(w(n, 9) * 2 - obstacle.position[1] * 2);
      const yaw = originalAngle(dx, dy, c.tables.atan),
        distance = integerSqrt(
          (Math.imul(dx >> 1, dx >> 1) + Math.imul(dy >> 1, dy >> 1)) >>> 0,
        );
      const pitch = originalAngle(
        distance,
        ((obstacle.ground - d(n, 0x27)) | 0) >> 3,
        c.tables.atan,
      );
      const impulse = createMotion(0, 0, 0, 0);
      impulse.yaw = yaw;
      impulse.pitch = pitch;
      impulse.speed = w(n, 0x3d) >> 1;
      velocity(impulse, c.tables);
      for (const [axis, value] of [
        impulse.vx,
        impulse.vy,
        impulse.vz,
      ].entries())
        put(n, 0x2d + axis * 2, w(n, 0x2d + axis * 2) + value);
      angles(n, c);
    } else if (!c.airborneObstacle && c.obstacleAt(point(n), mule))
      throw new Error(
        "Mule airborne entity collision response requires actual74270 height result",
      );
  }
  if (
    (phase & 3) === 3 &&
    ((c.water >>> 0) + 320) >>> 0 >= d(n, 0x27) >>> 0 &&
    ecologyTerrainClass(c.terrain, point(n)) <= 1
  ) {
    if (w(n, 0x3d) >= 128) {
      const above = d(before, 0x27) >>> 0 > c.water >>> 0,
        deep = !above && ((c.water >>> 0) - 512) >>> 0 > d(n, 0x27) >>> 0;
      events.push({
        kind: "mule-water-effect",
        id: mule.id,
        position: point(n),
        code: deep ? 0x15 : 0x30,
        height: deep
          ? d(n, 0x27)
          : d(n, 0x11) >>> 0 > c.water >>> 0
            ? d(n, 0x11)
            : c.water,
        angles: deep ? [0, 0, 128] : [0, 0, 0],
      });
    }
    if (
      d(n, 0x27) === 0 &&
      ecologyTerrainClass(c.terrain, point(n)) === 0 &&
      n[0x53]! & 1 &&
      !corpse //The reached self-water virtual34 is the same dead-target no-op.
    )
      events.push({
        kind: "mule-water-damage",
        id: mule.id,
        damage:
          n[24] === 4
            ? applyNeutralMuleSelfWaterDamage(mule,c)
            : applyOwnedMuleSelfWaterDamage(state, mule, c),
      });
  }
  put(n, 7, w(n, 7) & 32767);
  put(n, 9, w(n, 9) & 32767);
}
/** Owned counterpart of the admitted null-reference nonlethal5B9F0 reset.
 * Source5BB42..5BB50 nulls the attacker and marks self,5BC1A calls5CC60, and
 * only then5C078..5C087 debits health - with no state test at all.5CC60 owns
 * every state-dependent effect (cargo carrier detach, kind1/kind2 reservation
 * release, stun gate) and the common reset tail, so it must run for any state
 * rather than only the empty/idle case. Only the lethal outcome stays closed:
 * that belongs to5CDB0, which is not ported. */
export function applyOwnedMuleSelfWaterDamage(
  state: EcologyState,
  mule: EcologyMule,
  c?: MuleContext,
): number {
  const n = mule.native;
  if (
    n[6] !== 1 ||
    n[24]! >= 4 ||
    ![1,4,11,22].includes(n[0x7a]!) ||
    w(n, 15) < 0 ||
    w(n, 15) >= 300
  )
    throw new Error(
      "Owned self-water damage requires an actual live pool identity",
    );
  //5BB98..5BBD3:50+trunc(50*min(skill76,100)/100), then defense6*percent/100.
  const health = w(n, 0x6a),
    skill = Math.min(n[0x76]!, 100),
    percent = 50 + Math.trunc((50 * skill) / 100),
    damage = Math.max(1, 5 - Math.trunc(((c?.combat?.defense ?? (n[122]===4?6:NaN)) * percent) / 100));
  if (!Number.isFinite(damage)) throw Error("Actual species defense required for water damage");
  if (health - damage <= 0)
    throw new Error(
      "Owned self-water damage requires the unported lethal continuation",
    );
  releaseAction(state, mule, c);
  put(n, 0x6a, health - damage);
  return damage;
}
/** 5B9F0 attacker==self, neutral state8/null-reference, nonlethal domain.
 * Literal 184-instruction neutral case agrees; no RNG/audio/retaliation. */
export function applyNeutralMuleSelfWaterDamage(mule: EcologyMule, c?: MuleContext): number {
  const n = mule.native;
  if (
    n[6] !== 1 ||
    n[24] !== 4 ||
    ![1,4,11,22].includes(n[0x7a]!) ||
    ![0, 8].includes(n[0x5e]!) ||
    ![8, 0x88].includes(n[0x60]!) ||
    n[0x61] !== 0 ||
    n[0x78] !== 0 ||
    n[0x76] === null ||
    [0x4f, 0x52, 0x57, 0x5d].some((at) => n[at] !== 0) ||
    w(n, 0x6a) <= 5
  )
    throw new Error(
      "Neutral self-water damage requires the unported lethal/action/reference branch",
    );
  const percent = 50 + Math.trunc((50 * Math.min(n[0x76]!,100)) / 100),
    damage = Math.max(1, 5 - Math.trunc(((c?.combat?.defense ?? (n[122]===4?6:NaN)) * percent) / 100));
  if (!Number.isFinite(damage)) throw Error("Actual species defense required for water damage");
  resetAction(n);
  put(n, 0x6c, 0);
  put(n, 0x6a, w(n, 0x6a) - damage);
  return damage;
}
/**Pre-death reference cleanup shared by every5CDB0 entry (old age5E640,
 * starvation5E193, cold15 and selector4 combat). Source5CDB0 is called as
 * reason4/BL0, i.e. only with null task/attachment references, so the same
 * family order precedes the numeric death:
 *  1.5CC60 through the callback-owned service:5C920 attachment detach through
 *    its actual carrier (clears60bit2/5D),5CCEF/5CD14 release of the kind1
 *    target's reservation (peer60bit0), the kind2 plant release and the5CCA0
 *    local reset.5CC60's own state18 stun gate and timer are preserved.
 *  2.5CCA0/5CDB0's null-reference convention for the remaining task envelope:
 *    the associated4D and association50 kinds are nulled while their indices
 *    stay opaque, exactly as installTarget and5CCA0 already do.
 * A surviving attachment bit is the one shape the family cannot admit:5CDB0's
 * D71A mask preserves60bit2, so the caller transaction must reject and roll
 * back instead of entering mortality with a live attachment. */
export function releaseMuleMortalityReferences(
  state: EcologyState,
  mule: EcologyMule,
  c: MuleContext,
) {
  const n = mule.native;
  if (n[0x5e] !== 18) releaseAction(state, mule, c);
  n[0x4f] = 0;
  n[0x52] = 0;
  if (n[0x60]! & 2)
    throw new Error(
      "Mule mortality attachment cleanup left the source attachment bit set",
    );
}
function enterDeath(
  state: EcologyState,
  mule: EcologyMule,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native;
  releaseMuleMortalityReferences(state, mule, c);
  n[0x5e] = 24;
  resetAction(n);
  put(n, 0x15, w(n, 0x15) & 0xf7df & 0x3fdf);
  put(n, 0x6c, 32767);
  n[0x54] = 0;
  put(n, 0x3f, -1);
  n[0x78] = 0;
  put(n, 0x49, w(n, 0x49) & 0x3bef);
  n[0x60] = n[0x60]! & 0xef;
  put(n, 0x66, 0);
  events.push({ kind: "mule-died", id: mule.id });
  if (w(n, 0x6a) <= 0)
    events.push({ kind: "mule-audio", id: mule.id, channel: 0x1f });
}
function nativeAnimation(n: Native): AnimationState {
  return {
    action: n[0x19]!,
    hold: n[0x1a]!,
    frame: n[0x1b]!,
    direction: (n[0x1c]! << 24) >> 24,
    delay: (n[0x1d]! << 24) >> 24,
    counter: (n[0x1e]! << 24) >> 24,
  };
}
function mortalityProfile(
  action: number,
  state: number,
  c: MuleContext,
): AnimationProfile {
  if (state >= 26) {
    if (!c.bonesProfile)
      throw new Error("Original BONES animation metadata/binding is required");
    return c.bonesProfile(action);
  }
  return c.profile(action, state);
}
function mortality(
  state: EcologyState,
  mule: EcologyMule,
  phase: number,
  c: MuleContext,
  events: MuleEvent[],
  entering = false,
) {
  const n = mule.native;
  if (
    !entering &&
    n[0x5e] === 24 &&
    animationFinished(nativeAnimation(n), c.profile(n[0x19]!, 24))
  )
    put(n, 0x6c, 0);
  if (phase & 1) {
    if (!entering && n[0x5e] === 24 && w(n, 0x6c) <= 0) {
      n[0x5e] = 25;
      put(n, 0x68, Math.max(signed(w(n, 0x68) * 2), w(n, 0x62) >> 2));
      put(n, 0x6c, 32767);
    }
    if (n[0x5e] === 25 && (w(n, 0x6c) & 31) === 0) {
      const reserve = Math.max(0, w(n, 0x68) - 1);
      put(n, 0x68, reserve);
      put(n, 0x6c, 32767);
      if (reserve <= w(n, 0x62) >> 1) {
        mortalityProfile(4, 26, c);
        n[0x5e] = 26;
        n[0x19] = 4;
        n[0x1b] = 0;
        n[0x1c] = 0;
      }
    } else if (n[0x5e] === 26 && (w(n, 0x6c) & 31) === 0) {
      const reserve = Math.max(0, w(n, 0x68) - 1);
      put(n, 0x68, reserve);
      put(n, 0x6c, 32767);
      if (reserve <= w(n, 0x62) >> 2) {
        n[0x5e] = 27;
        n[0x1b] = 1;
      }
    } else if (n[0x5e] === 27 && (w(n, 0x6c) & 15) === 0) {
      const reserve = Math.max(0, w(n, 0x68) - 1);
      put(n, 0x68, reserve);
      put(n, 0x6c, 32767);
      if (!reserve) {
        for (const other of state.mules) {
          const r = other.native;
          if (r[6] !== 1) continue;
          for (const at of [0x4d, 0x50, 0x55, 0x58, 0x5b]) {
            if (r[at + 2] !== 1 || w(r, at) !== mule.index) continue;
            r[at + 2] = 0;
            if (at === 0x5b) r[0x60] = r[0x60]! & 0xfd;
          }
        }
        n[6] = 0;
        events.push({
          kind: "mule-retired",
          id: mule.id,
          retirement: {
            cleanupTarget: { index: mule.index, kind: 1 },
            countDelta: -1,
            displayPhase: 11,
            portraitRefresh: true,
            moduleCleanup: true,
          },
        });
      }
    }
    if (w(n, 0x6c) > 0) put(n, 0x6c, w(n, 0x6c) - 1);
  }
  const action = n[0x5e] === 24 ? 17 : n[0x5e] === 25 ? 18 : 4;
  if (n[0x19] !== action) {
    n[0x19] = action;
    n[0x1a] = n[0x1b] = n[0x1d] = n[0x1e] = 0;
    n[0x1c] = action === 17 ? 1 : 0;
  }
  const out = advanceAnimation(
    nativeAnimation(n),
    mortalityProfile(action, n[0x5e]!, c),
  );
  n[0x1a] = out.hold;
  n[0x1b] = out.frame;
  n[0x1c] = out.direction & 255;
  n[0x1d] = out.delay & 255;
  n[0x1e] = out.counter & 255;
}
/**5C730 for species4: audited original1D/1E/1F food coefficients are100.
 * Nutrition uses signed-word wrapping, strict greater-than-full and the
 * original growth/lifetime tradeoff. No source table defaults are inferred. */
function nutrition(mule: EcologyMule, amount: number, mode3 = false): boolean {
  const n = mule.native,
    gain = mode3 ? amount : Math.trunc((amount * 200) / 100),
    reserve = signed(w(n, 0x68) + gain);
  put(n, 0x68, reserve);
  if (n[0x77] !== 255) put(n, 0x66, w(n, 0x66) - gain * 2);
  if (reserve <= w(n, 0x62)) return false;
  put(n, 0x68, w(n, 0x62));
  n[0x61] = n[0x61]! & 0xbf;
  return true;
}
function acquireFood(
  state: EcologyState,
  mule: EcologyMule,
  food: MuleFoodTarget,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native;
  n[0x61] = n[0x61]! | 0x40;
  releaseAction(state, mule, c);
  put(n, 0x55, food.index);
  n[0x57] = food.kind;
  if (n[0x78] !== 0) {
    put(n, 0x58, food.index);
    n[0x5a] = food.kind;
  }
  const at =
    food.kind === 2
      ? state.plants[food.index]?.position
      : point(state.mules.find((m) => m.index === food.index)!.native);
  if (!at)
    throw new Error("Mule food query returned a missing source identity");
  if (food.kind === 2) {
    put(n, 11, at[0]);
    put(n, 13, at[1]);
  }
  n[0x16] = n[0x16]! & 0x3f;
  put(n, 0x49, (w(n, 0x49) | 0x14) & 0xeffc);
  n[0x54] = 20;
  n[0x4f] = n[0x52] = 0;
  if (food.kind === 1) {
    put(n, 0x50, food.index);
    n[0x52] = 1;
  }
  put(n, 0x3f, muleRequestedSpeed(mule, c.rules));
  put(n, 0x6c, 32767);
  n[0x60] = n[0x60]! | 0xc0;
  n[0x5e] = 1;
  events.push({
    kind: "mule-target",
    id: mule.id,
    target: food.index,
    targetKind: food.kind,
    position: [...at],
  });
}
/**679CE Bones and667EE corpse consumption. They share actual query/mating
 * services; their source amounts, completion delays and particle differ. */
function corpseFeeding(
  state: EcologyState,
  mule: EcologyMule,
  rng: GeneRng,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native,
    action = n[0x5e]!,
    target =
      n[0x57] === 1
        ? state.mules.find((m) => m.index === w(n, 0x55))
        : undefined;
  if (
    !target ||
    target.native[6] !== 1 ||
    distance(c.terrain, point(n), point(target.native)) > 4096
  ) {
    releaseAction(state, mule, c);
    idleWait(state, mule, rng, c);
    return;
  }
  const t = target.native;
  if (t[0x5e]! < 24)
    throw new Error("Mule corpse consumption has a live creature target");
  if (action === 5 && n[0x60]! & 0x20) {
    n[0x60] = n[0x60]! & 0xdf;
    return;
  }
  if (w(n, 0x6c) & 15) return;
  if (action === 5 && w(t, 0x68) <= w(t, 0x62) >> 1) {
    releaseAction(state, mule, c);
    idleWait(state, mule, rng, c, 20);
    return;
  }
  verifyNeighborhood(state, mule, c);
  put(t, 0x68, Math.max(0, w(t, 0x68) - (action === 4 ? 2 : 6)));
  const full = nutrition(mule, action === 4 ? 2 : 12),
    peer = mateTarget(state, mule, rng, c);
  const combat = c.combat ? combatServices(state, rng, c, events) : null,
    query = combat ? queryMuleCombat(state, mule, rng, combat.context) : null;
  events.push(
    { kind: "mule-fed", id: mule.id, target: target.index, targetKind: 1 },
    {
      kind: "mule-audio",
      id: mule.id,
      channel: full ? 0x1b : action === 4 ? 0x12 : 0x11,
    },
  );
  consumeMuleCombatQuery(rng, query);
  if (action === 5) {
    const speed = 4096 + 64 * (nextRandom(rng) % 128),
      pitch = 2 * (nextRandom(rng) % 150),
      yaw = 8 * nextRandom(rng);
    if (query && (query.enemyCount || combat!.ports.occupied(mule))) {
      if (!c.combatEffect)
        throw new Error(
          "Combat blood requires the actual staged shared effect factory",
        );
      c.combatEffect(state, c.terrain, rng, {
        code: 32,
        source: mule.id,
        position: point(n),
        angles: [yaw, pitch, speed],
      });
    } else
      events.push({
        kind: "mule-effect",
        id: mule.id,
        code: 32,
        position: point(n),
        height: d(n, 0x27),
        angles: [yaw, pitch, speed],
      });
  }
  if (
    query &&
    resolveMuleHostileQuery(
      state,
      mule,
      rng,
      combat!.context,
      combat!.ports,
      events,
      query,
    )
  )
    return;
  if (peer) {
    beginPair(state, mule, peer, c);
    pairAction(state, mule, rng, c, events);
  } else if (full) {
    releaseAction(state, mule, c);
    idleWait(state, mule, rng, c, action === 4 ? 20 : 10);
  }
}
function selectAnimation(n: Native, c: MuleContext) {
  //5E640 default arm for cold/stunned states: directional action, no playback;
  //the existing frame/hold/counter survive the selector call.
  if (n[94] === 15 || n[94] === 18) {
    n[25] = ((((w(n, 57) >> 7) + 1) >> 1) + 1) & 7;
    n[28] = n[29] = 0;
    return;
  }
  const combatAction = n[0x5e] === 16 ? 23 : n[0x5e] === 20 ? 16 : null;
  if (combatAction !== null) {
    if (n[0x19] !== combatAction) {
      n[0x19] = combatAction;
      n[0x1a] = n[0x1b] = n[0x1d] = n[0x1e] = 0;
      n[0x1c] = 1;
    }
  } else if (n[0x5e] === 21) {
    if (!c.combat)
      throw new Error("Mule attack animation requires original combat traits");
    if (n[0x19]! < 8 || n[0x19]! > 15) {
      n[0x19] = (((((w(n, 0x39) >> 7) + 1) >> 1) + 1) & 7) + 8;
      n[0x1a] = n[0x1b] = n[0x1d] = n[0x1e] = 0;
      n[0x1c] = 1;
    }
    const strength = Math.trunc(
      (c.combat.attack *
        (50 + Math.trunc((Math.min(n[0x76]!, 100) * 50) / 100))) /
        100,
    );
    n[0x1d] = 1 + +(w(n, 0x68) < strength >> 1);
  } else if (n[0x5e] === 11) {
    if (n[25] !== 20) {
      n[25] = 20;
      n[26] = n[27] = n[29] = n[30] = 0;
      n[28] = 1;
    }
  } else if (n[0x5e] === 10) {
    if (n[0x19] !== 22) {
      n[0x19] = 22;
      n[0x1a] = n[0x1b] = n[0x1d] = n[0x1e] = 0;
      n[0x1c] = 1;
    }
  } else if ([4, 5, 6, 7].includes(n[0x5e]!)) {
    if (n[0x19] !== 19) {
      n[0x19] = 19;
      n[0x1a] = n[0x1b] = n[0x1e] = 0;
      n[0x1c] = 1;
      n[0x1d] = 2;
    }
  } else {
    n[0x19] = ((((w(n, 0x39) >> 7) + 1) >> 1) + 1) & 7;
    const speed = w(n, 0x41);
    if (!speed && n[0x5e] !== 0) {
      n[0x1b] = 0;
      n[0x1c] = 0;
      n[0x1d] = 0;
    } else {
      n[0x1c] = 1;
      n[0x1d] = Math.trunc((1024 - speed) / 256) & 255;
    }
  }
}
function animation(n: Native, c: MuleContext) {
  selectAnimation(n, c);
  const a: AnimationState = {
    action: n[0x19]!,
    hold: n[0x1a]!,
    frame: n[0x1b]!,
    direction: (n[0x1c]! << 24) >> 24,
    delay: (n[0x1d]! << 24) >> 24,
    counter: (n[0x1e]! << 24) >> 24,
  };
  const out = advanceAnimation(a, c.profile(a.action, n[0x5e]!));
  n[0x1a] = out.hold;
  n[0x1b] = out.frame;
  n[0x1c] = out.direction & 255;
  n[0x1d] = out.delay & 255;
  n[0x1e] = out.counter & 255;
}
/**6E9AF ->59280 ->84B40. Reveal uses terrain distance, then invalidates all
 * four adjacent cells and updates the actual plant/building shade consumers. */
function reveal(
  state: EcologyState,
  mule: EcologyMule,
  phase: number,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native,
    owned = c.owned;
  if (
    n[24] === 4 ||
    !(phase & 1) ||
    !owned ||
    !(n[0x16]! & 2) ||
    (phase & 3) !== 3 ||
    n[24] !== owned.selectedPlayer ||
    (w(n, 0x3d) <= 32 && d(n, 0x27) <= d(n, 0x11))
  )
    return;
  const center = point(n),
    vertices: [number, number][] = [],
    dirty = new Set<number>();
  const start = center.map((v) => (signed(v - 1024) & 65535) >> 8),
    end = center.map((v) => (((signed(v + 1024) & 65535) >> 8) + 1) & 255);
  for (let row = 0; row < ((end[1] - start[1]) & 255); row++)
    for (let col = 0; col < ((end[0] - start[0]) & 255); col++) {
      const at: [number, number] = [
          signed(((start[0] + col) & 255) << 8),
          signed(((start[1] + row) & 255) << 8),
        ],
        cell = worldCell(...at),
        old = c.terrain.bytes[cell * 14 + 12];
      if (old >= 63) continue;
      const squared = distance(c.terrain, center, at);
      const factor =
        squared < 768 * 768
          ? 63
          : squared < 1024 * 1024
            ? Math.trunc(
                ((1024 - integerSqrt(squared >>> 0)) * 64 - 64) / 256,
              ) & 255
            : old;
      if (factor <= old) continue;
      c.terrain.bytes[cell * 14 + 12] = factor;
      vertices.push(at);
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [-1, -1],
        [0, -1],
      ]) {
        const adjacent =
          (((cell >> 7) + dy) & 127) * 128 + (((cell & 127) + dx) & 127);
        c.terrain.bytes[adjacent * 14 + 11] |= 12;
        dirty.add(adjacent);
        for (const p of state.plants)
          if (
            p.active &&
            worldCell(...p.position) === adjacent &&
            !(p.native[21]! & 2)
          ) {
            p.shade = renderShade(c.terrain, p.position);
            p.native[23] = p.shade;
          }
      }
    }
  if (!vertices.length) return;
  const buildingShades = owned.buildings
    .filter(
      (b) =>
        b.native[6] === 4 &&
        dirty.has(worldCell(...point(b.native))) &&
        !(b.native[21]! & 2),
    )
    .map((b) => ({
      index: b.index,
      shade: renderShade(c.terrain, point(b.native)),
    }));
  c.terrain.revision++;
  events.push({ kind: "mule-reveal", id: mule.id, vertices, buildingShades });
}
function verifyNeighborhood(
  state: EcologyState,
  mule: EcologyMule,
  c: MuleContext,
) {
  const radius=(c.combat?.queryRadius ?? 512)+512, extent=Math.trunc(radius/256);
  const at = point(mule.native),
    near = (to: [number, number]) => {
      const delta = (axis: number) =>
        (((to[axis] >> 8) - (at[axis] >> 8) + 64) & 127) - 64;
      const dx = delta(0),
        dy = delta(1);
      return dx * dx + dy * dy <= (radius/256)**2;
    };
  const owner = mule.native[24]!;
  const friendly = (other: number) =>
    other === owner ||
    (owner < 4 &&
      other <= 4 &&
      !!(c.owned!.allianceMasks[owner] & (1 << other)));
  for (const other of state.mules) {
    if (
      other.id === mule.id ||
      other.native[6] !== 1 ||
      !near(point(other.native))
    )
      continue;
    if (![1,4,11,22].includes(other.native[0x7a]!))
      throw new Error(
        "Mule query needs the other creature's actual species scorer",
      );
    if (!c.combat && !friendly(other.native[24]!) && other.native[0x5e]! < 24)
      throw new Error("Mule query selected a live hostile creature");
  }
  for (const other of state.otherEntities) {
    if (!near(other.position) || other.kind === 8 || other.kind === 5) continue;
    if (
      !friendly(other.owner) &&
      (!c.combat || !c.combatEntity || ![3, 4].includes(other.kind))
    )
      throw new Error("Mule query selected a hostile actor or building");
  }
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      if (x * x + y * y > (radius/256)**2) continue;
      if (
        cellHasEffect11(
          state,
          worldCell(signed(at[0] + x * 256), signed(at[1] + y * 256)),
          c,
        )
      )
        throw new Error(
          "Mule neighborhood code11 effect requires its source scorer",
        );
    }
}
type MuleFoodTarget = { kind: 1 | 2; index: number };
function foodTarget(
  state: EcologyState,
  mule: EcologyMule,
  random: GeneRng,
  c: MuleContext,
): MuleFoodTarget | null {
  const n = mule.native, radius = (c.combat?.queryRadius ?? 512)+512, extent = Math.trunc(radius/256);
  if (
    w(n, 0x68) > w(n, 0x62) >> (operator(mule, 0, c) ? 1 : 2) &&
    !(n[0x61]! & 0x40)
  )
    return null;
  const preview = { ...random },
    sx = nextRandom(preview) & 1 ? -256 : 256,
    sy = nextRandom(preview) & 1 ? -256 : 256;
  let best: number | null = null,
    score = -0x7fffffff,
    corpseWinner = false;
  const at = point(n);
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      const squared = Math.imul(x * sx, x * sx) + Math.imul(y * sy, y * sy);
      if (squared > radius * radius) continue;
      const cell = worldCell(signed(at[0] + x * sx), signed(at[1] + y * sy)),
        value = radius - integerSqrt(squared);
      const candidates =
        state.plantOrder?.[String(cell)] ??
        state.plants
          .filter(
            (plant) => plant.active && worldCell(...plant.position) === cell,
          )
          .map((plant) => plant.index);
      if (!state.plantOrder && candidates.length > 1)
        throw new Error("Food winner requires source linked plant order");
      const corpses = state.mules.filter(
        (m) =>
          m.native[6] === 1 &&
          [1,4,11,22].includes(m.native[0x7a]!) &&
          [24, 25].includes(m.native[0x5e]!) &&
          worldCell(...point(m.native)) === cell,
      );
      let foods = [
        ...candidates.flatMap((index) => {
          const p = state.plants[index];
          return p.active &&
            p.owner === 4 &&
            p.growth > 0 &&
            !(p.plantFlags & 9)
            ? [{ id: p.id as string, index, value, corpse: false }]
            : [];
        }),
        ...corpses.map((m) => ({
          id: m.id as string,
          index: m.index,
          value: value * (m.native[0x60]! & 1 ? 1 : 2),
          corpse: true,
        })),
      ];
      if (corpses.length && foods.length > 1) {
        if (!c.cellOrder)
          throw new Error(
            "Mixed corpse/plant food tie requires actual shared-cell ordering",
          );
        const ids = c.cellOrder(cell);
        if (foods.some((food) => !ids.includes(food.id)))
          throw new Error("Food query lacks a live shared-cell entry");
        foods = foods.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }
      for (const food of foods) {
        if (food.value > score) {
          score = food.value;
          best = food.index;
          corpseWinner = food.corpse;
        }
      }
    }
  return best === null ? null : { kind: corpseWinner ? 1 : 2, index: best };
}
function resetAction(n: Native) {
  n[0x15] = n[0x15]! & 0xdf;
  n.fill(0, 0x33, 0x37);
  put(n, 0x60, w(n, 0x60) & 0xd71a);
  n[0x5d] = 0;
  n[0x57] = 0;
}
/**5CC60's ordinary task cleanup. Reference effects belong to this same
 * transaction; logical resource pointers are never synthesized. */
function releaseAction(
  state: EcologyState,
  mule: EcologyMule,
  c?: MuleContext,
) {
  const n = mule.native,
    kind = n[0x57],
    target = w(n, 0x55),
    action = n[0x5e];
  //5CC60's first instruction-level gate preserves stun references and timer.
  if (action === 18) return;
  if (n[96]! & 2 && c?.materialRuntime) {
    c.materialRuntime(mule).release();
    return;
  }
  if (n[0x60]! & 2)
    throw new Error(
      "Mule attachment cleanup requires the actual carrier binding",
    );
  if (kind === 2 && [1, 7, 11].includes(action!)) {
    const p = state.plants[target];
    if (!p) throw new Error("Mule action has a missing plant binding");
    p.plantFlags &= action === 7 ? 0xfe : 0xfb;
    p.native[46] = p.plantFlags;
  } else if (kind === 1 && [3, 5, 10].includes(action!)) {
    const peer = state.mules.find((m) => m.index === target);
    if (!peer) throw new Error("Mule action has a missing creature binding");
    if (action === 5) peer.native[0x60] = peer.native[0x60]! & 0xfe;
    else peer.native[0x57] = 0;
  }
  resetAction(n);
  put(n, 0x6c, 0);
}
export interface OwnedMuleMoveContext {
  callerOwner: number;
  callerIsSelected: boolean;
  selectedPanelRefresh: boolean;
}
export interface OwnedMuleMoveResult extends MuleStepResult {
  outcome: "installed" | "ignored" | "rejected";
  panelRefreshRequested: boolean;
}
/** Ordinary81C60 opcode11 ->5DF50 move. No RNG, path preview or teleport. */
export function requestStagedOwnedMuleMove(
  state: EcologyState,
  index: number,
  target: [number, number],
  context: OwnedMuleMoveContext,
): OwnedMuleMoveResult {
  try {
    const mule = state.mules.find((m) => m.index === index);
    if (
      !mule ||
      mule.native[6] !== 1 ||
      ![1,4,11,22].includes(mule.native[0x7a]!) ||
      mule.native[24]! >= 4 ||
      w(mule.native, 15) !== index
    )
      throw new Error("Owned Mule move requires an actual live pool identity");
    const n = mule.native;
    if (n[24] !== context.callerOwner)
      throw new Error("Mule move caller does not own the creature");
    if (target.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767))
      throw new Error("Mule move target is not a source coordinate");
    if ([15, 18].includes(n[0x5e]!) || n[0x5e]! >= 24 || n[0x61]! & 1)
      return {
        committed: true,
        reason: null,
        events: [],
        outcome: "ignored",
        panelRefreshRequested: false,
      };
    releaseAction(state, mule);
    n[0x5e] = 0;
    for (const at of [0x6e, 0x72]) {
      put(n, at, target[0]);
      put(n, at + 2, target[1]);
    }
    n[0x60] = n[0x60]! | 0x18;
    n[0x61] = (n[0x61]! | 0x80) & 0xbf;
    n[0x78] = 7;
    n[0x5f] = 0;
    return {
      committed: true,
      reason: null,
      events: context.callerIsSelected
        ? [{ kind: "mule-command-feedback", id: mule.id }]
        : [],
      outcome: "installed",
      panelRefreshRequested: context.selectedPanelRefresh,
    };
  } catch (e) {
    return {
      committed: false,
      reason: e instanceof Error ? e.message : String(e),
      events: [],
      outcome: "rejected",
      panelRefreshRequested: false,
    };
  }
}
/** Standalone atomic wrapper. The staged entry preserves every retained
 * ecology/native alias and requires its caller to own whole-host rollback. */
export function requestOwnedMuleMove(
  state: EcologyState,
  index: number,
  target: [number, number],
  context: OwnedMuleMoveContext,
): OwnedMuleMoveResult {
  const staged = cloneEcologyState(state),
    result = requestStagedOwnedMuleMove(staged, index, target, context);
  if (result.committed && result.outcome === "installed")
    Object.assign(state, staged);
  return result;
}
/**5D700. Neutral creatures inherently qualify; human creatures require a
 * real category3 roster entry whose control mode and range match. */
function operator(state: EcologyMule, mode: number, c: MuleContext): boolean {
  const n = state.native;
  if (n[24] === 4) return true;
  if (!c.owned)
    throw new Error("Owned Mule decision requires its actual operator roster");
  return c.owned.operators.some(
    (a) =>
      a.owner === n[24] &&
      a.enabled !== 0 &&
      a.commandState === 0 &&
      !!(a.flags70 & 0x80) &&
      (a.mode === mode || a.mode === 0) &&
      (() => {
        const dx = torusDelta(a.position[0], w(n, 7)),
          dy = torusDelta(a.position[1], w(n, 9));
        return (
          (Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0 <=
          Math.imul(a.range, a.range) >>> 0
        );
      })(),
  );
}
function installTarget(
  mule: EcologyMule,
  target: [number, number],
  c: MuleContext,
  speed = muleRequestedSpeed(mule, c.rules),
) {
  const n = mule.native;
  put(n, 11, target[0]);
  put(n, 13, target[1]);
  n[0x16] = n[0x16]! & 0x3f;
  put(n, 0x49, (w(n, 0x49) | 0x14) & 0xeffc);
  n[0x54] = 20;
  n[0x4f] = n[0x52] = 0;
  put(n, 0x3f, speed);
  put(n, 0x6c, 32767);
  n[0x60] = n[0x60]! | 0x80;
}
/**64CD7 common choice, including all16 candidate attempts and the74A50
 * backward repair of the retained anchor. Query-order draws occur outside. */
function commonChoice(
  state: EcologyState,
  mule: EcologyMule,
  rng: GeneRng,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native,
    accept = (at: [number, number]) => accepted(state, mule, at, c);
  if (n[0x61]! & 0x80) {
    const target: [number, number] = [w(n, 0x6e), w(n, 0x70)];
    if (accept(target)) {
      installTarget(mule, target, c);
      events.push({ kind: "mule-target", id: mule.id, position: target });
      return;
    }
    n[0x49] = n[0x49]! | 0x40;
  }
  if (!(n[0x60]! & 8)) {
    n.splice(0x72, 4, ...n.slice(7, 11));
    n[0x60] = n[0x60]! | 8;
  }
  if (
    !(w(n, 0x49) & 0x100) &&
    !cellEntryPredicate(state, mule, worldCell(...point(n)), c) &&
    nextRandom(rng) % 10 < 4
  ) {
    put(n, 0x6c, 20);
    return;
  }
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = nextRandom(rng) * 8,
      radius =
        ((n[24] === 4 || w(n, 0x68) <= 0 ? 2048 : 512) * nextRandom(rng)) >> 8,
      at = (angle + 1536) & 2047;
    const target: [number, number] = [0, 1].map(
      (axis) =>
        (signed(
          signed(w(n, 0x72 + axis * 2) * 2) +
            signed(
              ((axis ? c.tables.sine[at] : c.tables.cosine[at]) * radius * 2) >>
                16,
            ),
        ) >>
          1) &
        32767,
    ) as [number, number];
    if (accept(target)) {
      installTarget(mule, target, c);
      events.push({ kind: "mule-target", id: mule.id, position: target });
      return;
    }
    n[0x49] = n[0x49]! | 0x40;
  }
  const anchor = resolveMovementTarget(
    point(n),
    [w(n, 0x72), w(n, 0x74)],
    c.tables,
    accept,
  );
  put(n, 0x72, anchor[0]);
  put(n, 0x74, anchor[1]);
  n[0x60] = n[0x60]! | 8;
  put(n, 0x6c, 10 + (nextRandom(rng) % 20));
}
function randomPoint(
  anchor: [number, number],
  radius: number,
  rng: GeneRng,
  c: MuleContext,
): [number, number] {
  const angle = nextRandom(rng) * 8,
    length = (radius * nextRandom(rng)) >> 8,
    at = (angle + 1536) & 2047;
  return [0, 1].map(
    (axis) =>
      (signed(
        signed(anchor[axis] * 2) +
          signed(
            ((axis ? c.tables.sine[at] : c.tables.cosine[at]) * length * 2) >>
              16,
          ),
      ) >>
        1) &
      32767,
  ) as [number, number];
}
function idleWait(
  state: EcologyState,
  mule: EcologyMule,
  rng: GeneRng,
  c: MuleContext,
  base = 10,
) {
  const delay = base + (nextRandom(rng) % 20);
  mule.native[0x5e] = 8;
  if (cellEntryPredicate(state, mule, worldCell(...point(mule.native)), c))
    installTarget(mule, randomPoint(point(mule.native), 256, rng, c), c);
  else put(mule.native, 0x6c, delay);
}
/** Randomized8D930 cell order and6B700 same-Mule score. The peer's stage is
 * deliberately unrestricted; source only gates its full-growth byte77. */
function mateTarget(
  state: EcologyState,
  mule: EcologyMule,
  rng: GeneRng,
  c: MuleContext,
): EcologyMule | null {
  const n = mule.native, radius=(c.combat?.queryRadius ?? 512)+512, extent=Math.trunc(radius/256);
  if (
    n[0x77] !== 255 ||
    (n[0x79]! << 24) >> 24 <= 0 ||
    w(n, 0x68) <= w(n, 0x62) >> 1 ||
    !operator(mule, 2, c)
  )
    return null;
  const preview = { ...rng },
    sx = nextRandom(preview) & 1 ? -256 : 256,
    sy = nextRandom(preview) & 1 ? -256 : 256,
    at = point(n);
  let best: EcologyMule | null = null,
    bestScore = -0xfffffff;
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      const squared = (x * x + y * y) * 65536;
      if (squared > radius*radius) continue;
      const cell = worldCell(signed(at[0] + x * sx), signed(at[1] + y * sy));
      let candidates = state.mules.filter(
        (m) =>
          m.id !== mule.id &&
          m.native[6] === 1 &&
          worldCell(...point(m.native)) === cell,
      );
      if (candidates.length > 1) {
        if (!c.cellOrder)
          throw new Error("Mule mate tie requires actual shared-cell ordering");
        const order = c.cellOrder(cell);
        candidates = [...candidates].sort(
          (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
        );
        if (candidates.some((m) => !order.includes(m.id)))
          throw new Error("Mule mate list lacks an actual peer");
      }
      for (const peer of candidates) {
        const p = peer.native;
        if (
          p[24] !== n[24] ||
          ![1,4,11,22].includes(p[0x7a]!) ||
          p[0x5e]! >= 24 ||
          [3, 10, 15].includes(p[0x5e]!) ||
          p[0x77] !== 255 ||
          w(p, 0x49) & 0x400
        )
          continue;
        const score = w(p, 0x68) + radius - integerSqrt(squared);
        if (score > bestScore) {
          bestScore = score;
          best = peer;
        }
      }
    }
  return best;
}
function beginPair(
  state: EcologyState,
  mule: EcologyMule,
  peer: EcologyMule,
  c: MuleContext,
) {
  const speed = muleRequestedSpeed(mule, c.rules);
  releaseAction(state, mule, c);
  releaseAction(state, peer, c);
  for (const [self, other] of [
    [mule, peer],
    [peer, mule],
  ]) {
    const n = self.native;
    n[0x5e] = 3;
    put(n, 0x55, other.index);
    n[0x57] = 1;
    n[0x16] = n[0x16]! & 0x3f;
    put(n, 0x49, (w(n, 0x49) | 0x14) & 0xeffc);
    n[0x54] = 20;
    n[0x4f] = 0;
    put(n, 0x50, other.index);
    n[0x52] = 1;
    put(n, 0x3f, speed);
    put(n, 0x6c, 32767);
    n[0x60] = n[0x60]! | 0x80;
  }
}
function physicalDistance(a: Native, b: Native): number {
  const dx = torusDelta(w(a, 7), w(b, 7)),
    dy = torusDelta(w(a, 9), w(b, 9)),
    dz = ((d(a, 0x27) - d(b, 0x27)) | 0) >> 3;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) | 0;
}
/** Admitted ground-family rendezvous/center/countdown/crossbreeding. */
function pairAction(
  state: EcologyState,
  mule: EcologyMule,
  rng: GeneRng,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native,
    peer =
      n[0x57] === 1
        ? state.mules.find((m) => m.index === w(n, 0x55))
        : undefined,
    p = peer?.native;
  if (
    !peer ||
    !p ||
    p[6] !== 1 ||
    p[0x5e]! >= 24 ||
    p[0x57] !== 1 ||
    w(p, 0x55) !== mule.index
  ) {
    releaseAction(state, mule, c);
    idleWait(state, mule, rng, c);
    return;
  }
  const phase = (c.frame + w(n, 15)) >>> 0,
    cell = worldCell(...point(n));
  if (n[0x5e] === 3) {
    if (!(n[0x61]! & 0x20)) {
      if (worldCell(...point(p)) !== cell) {
        if ((phase & 3) === 3) {
          put(n, 11, w(p, 7));
          put(n, 13, w(p, 9));
          n[0x49] = n[0x49]! | 4;
        }
        return;
      }
      const x = w(n, 7) & 0xff00,
        y = w(n, 9) & 0xff00;
      n[0x61] = n[0x61]! | 0x20;
      p[0x61] = p[0x61]! | 0x20;
      installTarget(
        mule,
        [x + 64, y + 192],
        c,
        muleRequestedSpeed(mule, c.rules) >> 1,
      );
      installTarget(
        peer,
        [x + 192, y + 64],
        c,
        muleRequestedSpeed(peer, c.rules) >> 1,
      );
      return;
    }
    if ((w(n, 0x60) & w(p, 0x60) & 0x2004) === 0x2000) {
      if (w(n, 0x49) & 0x200) n[0x60] = n[0x60]! | 4;
      if ((w(n, 0x60) & w(p, 0x60) & 0x2004) === 0x2004) {
        const center: [number, number] = [
            (w(n, 7) & 0xff00) | 127,
            (w(n, 9) & 0xff00) | 127,
          ],
          speed = muleRequestedSpeed(mule, c.rules) >> 1;
        installTarget(mule, center, c, speed);
        installTarget(peer, center, c, speed);
      }
    } else if (physicalDistance(n, p) <= 16384) {
      for (const m of [mule, peer]) {
        const r = m.native;
        put(r, 0x3f, 0);
        put(r, 0x49, w(r, 0x49) & 0xefe8);
        r[0x54] = 0;
        r[0x16] = r[0x16]! & 0x3f;
        r[0x5e] = 10;
        put(r, 0x6c, 32);
      }
    }
    return;
  }
  if (w(n, 0x6c) > 0) {
    if ((phase & 3) === 3 && physicalDistance(n, p) > 16384) {
      releaseAction(state, mule, c);
      idleWait(state, mule, rng, c);
    }
    return;
  }
  const dx = torusDelta(w(n, 7), w(p, 7)),
    dy = torusDelta(w(n, 9), w(p, 9));
  if ((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0 > 16384) {
    releaseAction(state, mule, c);
    idleWait(state, mule, rng, c);
    return;
  }
  for (const r of [n, p]) {
    put(r, 0x68, Math.max(0, w(r, 0x68) - (w(r, 0x62) >> 1)));
    r[0x79] = -r[0x79]! & 255;
  }
  const eligible = (r: Native) => {
    if (r[24] === 4) return r[0x76]! > 90;
    if (r[0x61]! & 4) return true;
    const player = c.owned?.players?.[r[24]!];
    if (!player || player.length !== 1805)
      throw new Error(
        "Owned Mule trait inheritance requires the actual player research flags",
      );
    return player[0x6c7 + creatureSelector(r[122])] !== 0;
  };
  const componentRows = c.speciesComponents ?? Array.from({length:25},(_,i)=>i===4?[4,4]:[-1,-1]);
  const offspring = chooseCreatureOffspring(componentRows,
    {species:creatureSelector(n[122]),quality:n[118]!,eligible:eligible(n)},
    {species:creatureSelector(p[122]),quality:p[118]!,eligible:eligible(p)},rng);
  const {quality,inherit}=offspring;
  if (!c.creaturePriors || c.creaturePriors.length !== 300)
    throw new Error(
      "Natural Mule birth requires all300 actual retained native priors",
    );
  const priors = c.creaturePriors.map(
    (prior, index) =>
      state.mules.find((m) => m.index === index)?.native ?? prior,
  );
  const slot = priors.findIndex((prior) => prior[6] === 0);
  if (slot !== -1) {
    const made = initializeMuleNative(
      priors[slot],
      rng,
      { slot, owner: n[24]!, position: point(n), quality, parent: n, species: offspring.species },
      c,
    );
    if (!made.ok) throw new Error(made.reason);
    const born = made.value.native;
    if (inherit) born[0x61] = born[0x61]! | 4;
    const id = `source:0:${slot}` as EcologyMule["id"],
      old = state.mules.findIndex((m) => m.index === slot),
      newborn = { id, index: slot, native: born, pending: [] };
    if (old === -1) state.mules.push(newborn);
    else state.mules[old] = newborn;
    Object.assign(rng, made.value.rng);
    const order = c.cellOrder;
    c.cellOrder = (query) =>
      query === cell
        ? [id, ...(order?.(query) ?? []).filter((value) => value !== id)]
        : (order?.(query) ?? []);
    events.push(
      {
        kind: "mule-born",
        id,
        position: point(born),
        newborn: {
          index: slot,
          native: born.slice(),
          owner: born[24]!,
          bornCounterIncrement: born[24] === 4 ? 0 : 1,
        },
      },
      { kind: "mule-audio", id, channel: 0x44 },
    );
  }
  //62270: peer then current, retaining paired references. Both5B100 queries
  //use the saved current AI cell even if the peer has moved to another cell.
  for (const self of [peer, mule]) {
    const delay = 10 + (nextRandom(rng) % 20);
    self.native[0x5e] = 8;
    if (cellEntryPredicate(state, self, cell, c))
      installTarget(self, randomPoint(point(self.native), 256, rng, c), c);
    else put(self.native, 0x6c, delay);
  }
}
function combatServices(
  state: EcologyState,
  random: GeneRng,
  c: MuleContext,
  events: MuleEvent[],
): { context: MuleCombatContext; ports: MuleCombatPorts } {
  if (!c.combat)
    throw new Error("Mule hostile interaction requires original combat traits");
  return {
    context: {
      terrain: c.terrain,
      tables: c.tables,
      frame: c.frame,
      traits: c.combat,
      speciesComponents: c.speciesComponents,
      allianceMasks: c.owned?.allianceMasks,
      players: c.owned?.players,
      cellOrder: c.cellOrder,
      effectCode: c.effectCode,
      effect: c.combatEffect,
      entity: c.combatEntity
        ? (id) => c.combatEntity!(state, c.terrain, random, id)
        : undefined,
      damage: c.combatDamage
        ? (self, target, amount) =>
            c.combatDamage!(state, c.terrain, random, self, target, amount)
        : undefined,
      buildingAt: c.combatBuildingAt
        ? (self) => c.combatBuildingAt!(state, c.terrain, random, self)
        : undefined,
    },
    ports: {
      release: (m) => releaseAction(state, m, c),
      speed: (m) => muleRequestedSpeed(m, c.rules),
      occupied: (m) =>
        cellEntryPredicate(state, m, worldCell(...point(m.native)), c),
      escape: (m) =>
        installTarget(m, randomPoint(point(m.native), 256, random, c), c),
      selectAnimation: (m) => selectAnimation(m.native, c),
      attackBonus: (m) => {
        if (m.native[24] === 4) return 0;
        if (!c.owned)
          throw new Error("Mule attack requires the actual operator roster");
        const a = c.owned.operators.find((a) => {
          const dx = torusDelta(a.position[0], w(m.native, 7)),
            dy = torusDelta(a.position[1], w(m.native, 9));
          return (
            a.owner === m.native[24] &&
            a.enabled !== 0 &&
            a.commandState === 0 &&
            !!(a.flags70 & 128) &&
            (a.mode === 0 || a.mode === 1) &&
            (Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0 <=
              Math.imul(a.range, a.range) >>> 0
          );
        });
        if (!a) return 0;
        if (
          !Number.isInteger(a.attackBonus) ||
          a.attackBonus! < -128 ||
          a.attackBonus! > 127
        )
          throw new Error(
            "Mule attack requires its operator's original blueprint byte17",
          );
        return a.attackBonus!;
      },
      death: (m, attackerOwner) => {
        enterDeath(state, m, c, events);
        events.push({
          kind: "mule-combat-kill",
          id: m.id,
          index: m.index,
          attackerOwner,
          victimOwner: m.native[24]!,
        });
      },
      coldRetire: (m, count) => {
        if (!c.coldBurst)
          throw new Error(
            "Cold Mule damage requires the actual staged burst14 factory",
          );
        c.coldBurst(state, c.terrain, random, m, {
          code: 14,
          count,
          parameter1: 80,
          parameter2: 70,
          height: -1,
        });
        for (const other of state.mules) {
          const r = other.native;
          if (r[6] !== 1) continue;
          for (const at of [0x4d, 0x50, 0x55, 0x58, 0x5b]) {
            if (r[at + 2] !== 1 || w(r, at) !== m.index) continue;
            r[at + 2] = 0;
            if (at === 0x5b) r[0x60] = r[0x60]! & 0xfd;
          }
        }
        m.native[6] = 0;
        events.push({
          kind: "mule-retired",
          id: m.id,
          retirement: {
            cleanupTarget: { index: m.index, kind: 1 },
            countDelta: -1,
            displayPhase: 11,
            portraitRefresh: true,
            moduleCleanup: true,
          },
        });
      },
    },
  };
}
/** Selector4 virtual34 damage. The host owns an enclosing isolated transaction
 * and must consume retirement/death receipts before its next spatial query.
 * This function preserves all existing native array identities. */
export function damageMuleEntity(
  state: EcologyState,
  targetIndex: number,
  amount: number,
  attacker: MuleDamageAttacker | null,
  rng: GeneRng,
  c: MuleContext,
): MuleEvent[] {
  if (c.material)
    c = { ...c, materialRuntime: (m) => c.material!(state, c.terrain, rng, m) };
  const target = state.mules.find(
    (m) => m.index === targetIndex && m.native[6] === 1,
  );
  if (!target)
    throw new Error("Mule damage requires its actual live pool binding");
  if (target.native[94] === 15 && !c.coldBurst)
    throw new Error(
      "Cold Mule damage requires the actual staged burst14 factory",
    );
  const events: MuleEvent[] = [],
    services = combatServices(state, rng, c, events);
  damageMuleFromSource(
    state,
    target,
    attacker,
    amount,
    rng,
    services.context,
    services.ports,
    events,
  );
  return events;
}
/**4F6A0 damage1 then5C7E0 stun, even when damage has just entered mortality.
 * capturedByActor comes only from capture child20's retained native71/73. */
export function applyMuleCaptureImpact(
  state: EcologyState,
  targetIndex: number,
  effect: (number | null)[],
  rng: GeneRng,
  c: MuleContext,
  request: { damage: 1; duration: number; capturedByActor: number | null },
): MuleEvent[] {
  if (c.material)
    c = { ...c, materialRuntime: (m) => c.material!(state, c.terrain, rng, m) };
  if (
    effect.length !== 81 ||
    effect[6] !== 5 ||
    effect[69] !== 20 ||
    request.damage !== 1 ||
    !Number.isInteger(request.duration) ||
    request.duration < -32768 ||
    request.duration > 32767 ||
    (request.capturedByActor !== null &&
      (!Number.isInteger(request.capturedByActor) ||
        request.capturedByActor < 0 ||
        request.capturedByActor >= 20))
  )
    throw new Error(
      "Capture impact requires actual code20 and source stun parameters",
    );
  const target = state.mules.find(
    (m) => m.index === targetIndex && m.native[6] === 1,
  );
  if (!target || target.native[94]! >= 24 || target.native[94] === 15)
    throw new Error("Capture impact requires the actual eligible living Mule");
  const events = damageMuleEntity(
    state,
    targetIndex,
    1,
    {
      index: w(effect, 15),
      kind: 5,
      owner: effect[24]!,
      native: effect,
    },
    rng,
    c,
  );
  const n = target.native;
  if (request.capturedByActor !== null) {
    put(n, 88, request.capturedByActor);
    n[90] = 3;
  }
  releaseAction(state, target, c);
  n[97] = n[97]! & 127;
  put(n, 63, 0);
  put(n, 73, w(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = n[22]! & 63;
  n[94] = 18;
  put(n, 108, request.duration);
  n[74] = n[74]! & 0x3b;
  n[21] = n[21]! & 0xdf;
  events.push({ kind: "mule-audio", id: target.id, channel: 57 });
  return events;
}
function combatChoice(
  state: EcologyState,
  mule: EcologyMule,
  random: GeneRng,
  c: MuleContext,
  events: MuleEvent[],
  capture?: { query: MuleCombatQuery | null },
): boolean {
  if (!c.combat) return false;
  const { context, ports } = combatServices(state, random, c, events);
  const query = queryMuleCombat(state, mule, random, context);
  if (capture) capture.query = query;
  return chooseMuleHostile(state, mule, random, context, ports, events, query);
}
function action(
  state: EcologyState,
  mule: EcologyMule,
  random: GeneRng,
  c: MuleContext,
  events: MuleEvent[],
) {
  const n = mule.native;
  if (n[94] === 11) {
    if (w(n, 108) <= 0) {
      if (!c.materialRuntime)
        throw Error("Mule cutting requires actual material services");
      finishMuleMaterialCut(n, c.materialRuntime(mule));
    }
    return;
  }
  if (n[94] === 6) {
    if (w(n, 108) <= 0) {
      nutrition(mule, 1000, true);
      events.push({ kind: "mule-audio", id: mule.id, channel: 27 });
      idleWait(state, mule, random, c);
    } else if (((w(n, 15) + c.frame) & 3) === 3) {
      events.push({ kind: "mule-audio", id: mule.id, channel: 17 });
      const speed = 4096 + 64 * (nextRandom(random) % 128),
        pitch = 2 * (nextRandom(random) % 150),
        yaw = 8 * nextRandom(random);
      if (!c.combatEffect)
        throw Error(
          "Mule specialist consumption requires the actual staged effect32 factory",
        );
      c.combatEffect(state, c.terrain, random, {
        code: 32,
        source: mule.id,
        position: point(n),
        height: d(n, 39),
        angles: [yaw, pitch, speed],
      });
    }
    return;
  }
  if (n[94] === 15) {
    if (w(n, 108) <= 0) enterDeath(state, mule, c, events);
    return;
  }
  if (n[94] === 18) {
    if (w(n, 108) > 0) return;
    const delay = 10 + (nextRandom(random) % 10);
    n[94] = 8;
    if (cellEntryPredicate(state, mule, worldCell(...point(n)), c))
      installTarget(mule, randomPoint(point(n), 256, random, c), c);
    else put(n, 108, delay);
    return;
  }
  if (n[0x5e] === 21) {
    if (w(n, 0x6c) > 0) return;
    const { context, ports } = combatServices(state, random, c, events);
    completeMuleAttack(state, mule, random, context, ports, events);
    if ([1, 4, 5].includes(n[0x5e]!)) action(state, mule, random, c, events);
    return;
  }
  if ([16, 20].includes(n[0x5e]!)) {
    if (w(n, 0x6c) > 0) return;
    const { context, ports } = combatServices(state, random, c, events);
    if (w(n, 0x6a) <= 0) {
      ports.death(mule, 4);
      return;
    }
    if (n[0x78] !== 0) {
      if ((w(n, 0x49) & 3) !== 3) {
        if (n[0x78] !== 7) {
          if (!c.materialRuntime)
            throw Error(
              "Mule hit resume requires its actual retained task command",
            );
          resumeMuleMaterialTask(n, c.materialRuntime(mule));
        } else {
          const target: [number, number] = [w(n, 0x72), w(n, 0x74)];
          releaseAction(state, mule, c);
          n[0x5e] = 0;
          for (const at of [0x6e, 0x72]) {
            put(n, at, target[0]);
            put(n, at + 2, target[1]);
          }
          n[0x60] = n[0x60]! | 0x18;
          n[0x61] = (n[0x61]! | 0x80) & 0xbf;
          n[0x78] = 7;
          n[0x5f] = 0;
        }
      }
      if (n[120] !== 0) {
        n[0x5e] = 8;
        if (ports.occupied(mule)) ports.escape(mule);
        else put(n, 0x6c, 0);
        return;
      }
    }
    const query = queryMuleCombat(state, mule, random, context);
    if (chooseMuleHostile(state, mule, random, context, ports, events, query)) {
      if (n[0x5e] === 1) action(state, mule, random, c, events);
      return;
    }
    // No enemy: reuse the same query for ordinary food/mate scorers before
    // falling back to the retained attacker reference (5F4C4..60291).
    const food = foodTarget(state, mule, random, c),
      peer = food === null ? mateTarget(state, mule, random, c) : null;
    consumeMuleCombatQuery(random, query);
    if (food !== null) {
      acquireFood(state, mule, food, c, events);
      action(state, mule, random, c, events);
      return;
    }
    if (peer) {
      beginPair(state, mule, peer, c);
      pairAction(state, mule, random, c, events);
      return;
    }
    const previous = resolveMuleCombatTarget(state, context, n[87]!, w(n, 85));
    if (previous) {
      acquireMuleHostile(mule, previous, ports, events, context, random);
      action(state, mule, random, c, events);
    } else {
      n[0x5e] = 8;
      const delay = 20 + (nextRandom(random) % 20);
      if (ports.occupied(mule)) ports.escape(mule);
      else put(n, 0x6c, delay);
    }
    return;
  }
  if ([3, 10].includes(n[0x5e]!)) {
    pairAction(state, mule, random, c, events);
    return;
  }
  if ([4, 5].includes(n[0x5e]!)) {
    corpseFeeding(state, mule, random, c, events);
    return;
  }
  if (n[0x5e] === 7) {
    //6A243/6889A validates its reference and736F0 range before the damage
    //cadence test.724C0 can clear only the reference kind between callbacks.
    const target = w(n, 0x55);
    if (n[0x57] !== 2) {
      releaseAction(state, mule, c);
      idleWait(state, mule, random, c);
      return;
    }
    const plant = state.plants[target];
    if (!plant?.active)
      throw Error("Mule feeding reference has an inactive plant binding");
    if (distance(c.terrain, point(n), plant.position) >>> 0 > 4096) {
      releaseAction(state, mule, c);
      idleWait(state, mule, random, c);
      return;
    }
    if (w(n, 0x6c) & 15) return;
    const amount = c.rules.plants[plant.selector].nutrition,
      retired = plant.growth <= 3;
    if (c.plantDamage) c.plantDamage(state, c.terrain, random, target, 3);
    else {
      const damaged = damagePlant(state, c.terrain, c.rules, target, 3);
      if (!damaged.committed) throw new Error(damaged.reason!);
      if (damaged.events.some((event) => event.kind === "plant-retired"))
        throw Error(
          "Mule feeding retirement requires immediate6C780 host unlink/cleanup",
        );
      // The pure plant transaction replaces state's cloned Mule objects.
      state.mules.find((candidate) => candidate.id === mule.id)!.native = n;
    }
    const current = state.mules.find((candidate) => candidate.id === mule.id)!;
    if (current.native !== n)
      throw Error("Mule plant damage replaced a held native record");
    const full = nutrition(current, amount);
    events.push(
      { kind: "mule-fed", id: mule.id, target },
      { kind: "mule-audio", id: mule.id, channel: full ? 0x1b : 0x12 },
    );
    verifyNeighborhood(state, current, c);
    const capture: { query: MuleCombatQuery | null } = { query: null };
    if (combatChoice(state, current, random, c, events, capture)) return;
    const peer = mateTarget(state, current, random, c);
    consumeMuleCombatQuery(random, capture.query);
    if (peer) {
      beginPair(state, current, peer, c);
      pairAction(state, current, random, c, events);
      return;
    }
    if (retired || full) {
      releaseAction(state, current, c);
      idleWait(state, current, random, c);
    }
    return;
  }
  if (n[0x5e] === 1) {
    if (n[87] === 3 || n[87] === 4) {
      const { context, ports } = combatServices(state, random, c, events),
        target = resolveMuleCombatTarget(state, context, n[87]!, w(n, 85));
      if (!target) {
        releaseAction(state, mule, c);
        idleWait(state, mule, random, c);
        return;
      }
      if (target.kind === 4 || target.dead) {
        put(n, 63, muleRequestedSpeed(mule, c.rules));
        if (w(n, 73) & 0x200 && !(n[96]! & 128)) {
          beginMuleAttack(mule, target, random, context, events);
          if (n[24] === 4) {
            n.splice(114, 4, ...n.slice(7, 11));
            n[96] = n[96]! | 8;
          }
          n[96] = n[96]! & 0xbf;
        }
        return;
      }
      if (
        w(target.native, 73) & 0x400 &&
        target.physicalHeight - d(target.native, 17) > 1280
      ) {
        if (!(n[96]! & 64) && ((w(n, 15) + c.frame) & 3) === 3) {
          const fallback = queryMuleCellFallback(state, mule, context);
          if (fallback) {
            n[96] = n[96]! | 64;
            put(n, 85, fallback.index);
            n[87] = fallback.kind;
            if (fallback.kind === 2)
              acquireFood(
                state,
                mule,
                { kind: 2, index: fallback.index },
                c,
                events,
              );
            else
              acquireMuleHostile(
                mule,
                fallback,
                ports,
                events,
                context,
                random,
              );
            put(n, 108, 0);
            return;
          }
        }
        releaseAction(state, mule, c);
        idleWait(state, mule, random, c);
        return;
      }
      const elapsed =
        (32767 - w(n, 108)) * (target.specialistStyle === 2 ? 2 : 1);
      if (
        ((w(n, 15) + c.frame) & 3) === 3 &&
        elapsed > 256 &&
        nextRandom(random) % 150 <= elapsed - 256
      ) {
        releaseAction(state, mule, c);
        idleWait(state, mule, random, c);
        return;
      }
      contactMuleHostile(mule, target, random, context, events);
      return;
    }
    if (n[0x57] === 1) {
      const corpse = state.mules.find((m) => m.index === w(n, 0x55));
      if (!corpse || corpse.native[6] === 0) {
        releaseAction(state, mule, c);
        idleWait(state, mule, random, c);
        return;
      }
      if (corpse.native[0x5e]! < 24) {
        const { context, ports } = combatServices(state, random, c, events),
          elapsed = 32767 - w(n, 0x6c);
        if (
          ((w(n, 15) + c.frame) & 3) === 3 &&
          elapsed > 256 &&
          nextRandom(random) % 150 <= elapsed - 256
        ) {
          releaseAction(state, mule, c);
          idleWait(state, mule, random, c);
          return;
        }
        contactMuleHostile(mule, corpse, random, context, events);
        return;
      }
      if (!(w(n, 0x49) & 0x200) || n[0x60]! & 0x80) return;
      n[0x5e] = corpse.native[0x5e]! >= 26 ? 4 : 5;
      corpse.native[0x60] = corpse.native[0x60]! | 1;
      put(n, 0x3f, muleRequestedSpeed(mule, c.rules));
      put(n, 0x6c, 32767);
      n.splice(0x72, 4, ...n.slice(7, 11));
      n[0x60] = (n[0x60]! | 8) & 0xbf;
      return;
    }
    const target = w(n, 0x55),
      plant = state.plants[target];
    if (
      n[0x57] === 0 ||
      !plant?.active ||
      plant.growth <= 0 ||
      plant.plantFlags & 8
    ) {
      releaseAction(state, mule, c);
      idleWait(state, mule, random, c);
      return;
    }
    if (n[0x57] !== 2)
      throw new Error("Mule approach needs its creature-food/hostile action");
    if (!(w(n, 0x49) & 0x200) || n[0x60]! & 0x80) return;
    put(n, 0x3f, muleRequestedSpeed(mule, c.rules));
    n[0x5e] = 7;
    put(n, 0x6c, 32767);
    n.splice(0x72, 4, ...n.slice(7, 11));
    n[0x60] = (n[0x60]! | 8) & 0xbf;
    plant.plantFlags |= 1;
    plant.native[46] = plant.plantFlags;
    return;
  }
  if (n[0x5e] === 0) n[0x5e] = 8;
  if (n[0x5e] !== 8)
    throw new Error("Mule action state requires an unported original callback");
  verifyNeighborhood(state, mule, c);
  const capture: { query: MuleCombatQuery | null } = { query: null };
  if (combatChoice(state, mule, random, c, events, capture)) {
    if (Number(n[0x5e]) === 1) action(state, mule, random, c, events);
    return;
  }
  const target = foodTarget(state, mule, random, c);
  if (target === null) {
    const peer = mateTarget(state, mule, random, c);
    consumeMuleCombatQuery(random, capture.query);
    if (peer) {
      beginPair(state, mule, peer, c);
      pairAction(state, mule, random, c, events);
      return;
    }
    if (n[24]! < 4 && (c.material || n[95] !== 0 || n[0x78] === 0)) {
      if (!c.owned)
        throw new Error(
          "Owned Mule idle requires actual player building/operator context",
        );
      const possible = c.owned.buildings.some(
        (b) =>
          b.index >= n[24]! * 64 &&
          b.index < (n[24]! + 1) * 64 &&
          b.native[6] === 4 &&
          (b.native[24] === n[24] ||
            !!(c.owned!.allianceMasks[n[24]!] & (1 << b.native[24]!))) &&
          [2, 4].includes(b.native[0x2d]!) &&
          (w(b.native, 0x31) & 0x141) === 1,
      );
      if (c.materialRuntime) {
        //64CE7 consumes the actual work result in DL. Failed work has already
        //performed its source idle wait and joins commonChoice exactly once.
        if (!stepMuleMaterialWork(n, c.materialRuntime(mule)))
          commonChoice(state, mule, random, c, events);
        return;
      } else if (possible || n[95] !== 0 || n[96]! & 2)
        throw new Error(
          "Owned Mule selected a processing building action: actual material services required",
        );
      if (!cellEntryPredicate(state, mule, worldCell(...point(n)), c))
        put(n, 0x6c, 10 + (nextRandom(random) % 20));
    }
    commonChoice(state, mule, random, c, events);
    return;
  }
  if (n[0x60]! & 2)
    throw new Error("Mule food acquisition requires prior action cleanup");
  consumeMuleCombatQuery(random, capture.query);
  acquireFood(state, mule, target, c, events);
}

/**5EB30 common prefix runs on both phases, after odd life and before dispatch. */
function materialPrefix(mule: EcologyMule, c: MuleContext) {
  const n = mule.native;
  if (n[94] === 19) return;
  if (w(n, 73) & 0x200) n[96] = n[96]! & (n[94] === 0 ? 0xcf : 0xef);
  if (n[94]! < 24 && n[96]! & 128 && w(n, 73) & 0x300) {
    n[96] = n[96]! & 127;
    if (n[97]! & 128 && w(n, 110) === w(n, 11) && w(n, 112) === w(n, 13))
      n[97] = n[97]! & 127;
    put(n, 108, 0);
  }
  if (
    [11, 16, 20, 21, 22, 23, 24].includes(n[94]!) &&
    animationFinished(nativeAnimation(n), c.profile(n[25]!, n[94]!))
  )
    put(n, 108, 0);
  if (n[96]! & 2) {
    if (!c.materialRuntime)
      throw Error("Mule attached9C requires actual material pose service");
    const kind = n[93]!,
      index = w(n, 91);
    if (kind && index >= 0) {
      if (kind < 1 || kind > 5)
        throw Error("Actual carried reference kind required");
      c.materialRuntime(mule).attach({
        kind: kind as 1 | 2 | 3 | 4 | 5,
        index,
      });
    }
  }
}
function carriedAnimation(n: Native, c: MuleContext) {
  if (n[94]! < 24) {
    animation(n, c);
    return;
  }
  if (n[94] === 24 && n[25] !== 17) {
    n[25] = 17;
    n[26] = n[27] = n[29] = n[30] = 0;
    n[28] = 1;
  } else if (n[94] === 25) {
    n[25] = 18;
    n[27] = 0;
    n[28] = 0;
  }
  const a = advanceAnimation(
    nativeAnimation(n),
    mortalityProfile(n[25]!, n[94]!, c),
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
}

/** Shared admitted ground Mule/Crab wander/plant-feeding callback.
 * Spatial relinking is reported; unsupported branches roll back data and RNG. */
function stepMule(
  state: EcologyState,
  index: number,
  rng: GeneRng,
  context: MuleContext,
  owned: boolean,
): MuleStepResult {
  const staged = cloneEcologyState(state),
    random = { ...rng },
    terrain = {
      bytes: context.terrain.bytes.slice(),
      revision: context.terrain.revision,
    },
    c: MuleContext = { ...context, terrain },
    events: MuleEvent[] = [];
  try {
    const found = staged.mules.find((candidate) => candidate.index === index);
    if (!found) throw new Error("Mule slot is absent");
    let mule: EcologyMule = found,
      n = mule.native;
    if (c.material)
      c.materialRuntime = (m) => c.material!(staged, terrain, random, m);
    if (n[6] === 0) return { committed: true, reason: null, events: [] };
    const dead = n[0x5e]! >= 24;
    if (
      n[6] !== 1 ||
      (owned ? n[24]! >= 4 : n[24] !== 4) ||
      ![1,4,11,22].includes(n[0x7a]!) ||
      n[0x76] === null ||
      ![
        0, 1, 3, 4, 5, 6, 7, 8, 10, 11, 15, 16, 18, 20, 21, 24, 25, 26, 27,
      ].includes(n[0x5e]!) ||
      (!dead && n[94] !== 18 && w(n, 0x6a) <= 0)
    )
      throw new Error("Mule callback owner/species/state is not admitted");
    if (owned && !c.owned)
      throw new Error(
        "Owned Mule callback requires actual selected-player, alliance, building and operator context",
      );
    if (n[122]!==4) {
      creatureComponents(c.speciesComponents,n[122]);
      if (!c.combat) throw Error("Actual non-Mule combat traits required");
    }
    const phase = (c.frame + w(n, 15)) >>> 0;
    if (n[97]! & 1) {
      materialPrefix(mule, c);
      carriedAnimation(n, c);
      Object.assign(state, staged);
      Object.assign(rng, random);
      Object.assign(context.terrain, terrain);
      return { committed: true, reason: null, events };
    }
    if (n[0x16]! & 0x48 || w(n, 0x49) & 0x400)
      throw new Error("Mule attached movement prefix is required");
    const route = routePrefix(staged, mule, random, c, phase),
      goal = route.working;
    const yaw = w(n, 0x39),
      wanted = w(n, 0x4b);
    if (yaw !== wanted && d(n, 0x27) <= d(n, 0x11)) {
      let delta = wanted - yaw;
      const alternative = delta < 0 ? 2048 + delta : -2048 + delta;
      if (Math.abs(delta) > Math.abs(alternative)) delta = alternative;
      n[0x4a] = Math.abs(delta) >= 256 ? n[0x4a]! | 0x20 : n[0x4a]! & 0xdf;
      const step = 2 * (w(n, 0x2b) & 65535);
      put(
        n,
        0x39,
        Math.abs(delta) <= step
          ? wanted
          : (yaw + Math.sign(delta) * step) & 2047,
      );
      setVelocity(n, c.tables);
    } else if (yaw === wanted) n[0x4a] = n[0x4a]! & 0xdf;
    physics(staged, mule, c, events, random);
    reveal(staged, mule, phase, c, events);
    if (dead) {
      mortality(staged, mule, phase, c, events);
      //5ED20's odd-phase corpse body joins6A290 before its shared tail.
      //Even-phase callbacks return earlier at5EED4 and preserve these bits.
      if (phase & 1) n[0x4a] = n[0x4a]! & 0xfc;
      Object.assign(state, staged);
      Object.assign(rng, random);
      Object.assign(context.terrain, terrain);
      return { committed: true, reason: null, events };
    }
    if (route.savedSpeed !== null) put(n, 0x3f, route.savedSpeed);
    else if (n[0x49]! & 3) {
      if (n[0x54]! > 20) {
        if (
          w(n, 0x3d) <= 256 &&
          d(n, 0x27) <= d(n, 0x11) &&
          distance(terrain, point(n), goal) <= 1024
        )
          n[0x49] = n[0x49]! | 3;
      } else if (distance(terrain, point(n), goal) <= 4096)
        n[0x49] = n[0x49]! | 8;
    } else if (
      n[0x49]! & 0x10 &&
      (n[79] === 4
        ? distance(terrain, point(n), goal) <= 400
        : w(n, 0x3d) <= 256 &&
          d(n, 0x27) <= d(n, 0x11) &&
          distance(terrain, point(n), goal) <= 1024)
    ) {
      const oldCell = worldCell(...point(n)),
        newCell = worldCell(...goal);
      if (oldCell !== newCell)
        sourceCellEntry(staged, mule, oldCell, newCell, random, c);
      put(n, 7, goal[0] & 32767);
      put(n, 9, goal[1] & 32767);
      put32(n, 0x11, groundHeight(terrain, ...point(n)));
      n[0x17] = renderShade(terrain, point(n));
      n[0x43] = n[0x44] = 0;
      put(n, 0x41, 0);
      n.fill(0, 0x2d, 0x33);
      put(n, 0x3d, 0);
      put(n, 0x3f, 0);
      n[0x54] = 0;
      put(n, 0x49, (w(n, 0x49) & 0xfdcf) | 0x220);
      if (n[79] === 4) {
        n[74] = n[74]! & 0x2f;
        n[21] = n[21]! & 0xdf;
      }
      n[0x16] = n[0x16]! & 0x3f;
      if (oldCell !== newCell)
        events.push({ kind: "mule-moved", id: mule.id, position: point(n) });
    }
    if (phase & 1) {
      //5E0B0 skips a Mule already in cold state15 at entry. Its source
      //timer/action/shared-tail still run below; no invented thermal thaw.
      if (n[94] !== 15) {
        put(n, 0x66, w(n, 0x66) - 1);
        if (w(n, 0x66) <= 0) {
          enterDeath(staged, mule, c, events);
          mortality(staged, mule, phase, c, events, true);
          Object.assign(state, staged);
          Object.assign(rng, random);
          Object.assign(context.terrain, terrain);
          return { committed: true, reason: null, events };
        }
        const reserve = w(n, 0x68),
          health = w(n, 0x6a),
          maximum = w(n, 0x64);
        if (
          reserve > 0 &&
          health < maximum &&
          phase % creatureParameters(c.rules,n[122]).healthRecoveryPeriod <= 1
        ) {
          put(n, 0x6a, health + Math.min(maximum - health, 2));
          put(n, 0x68, reserve < 3 ? 0 : reserve - 3);
        } else if (reserve <= 0 && (phase & 31) <= 1) {
          if (health <= 1) {
            put(n, 0x6a, 0);
            enterDeath(staged, mule, c, events);
            mortality(staged, mule, phase, c, events, true);
            Object.assign(state, staged);
            Object.assign(rng, random);
            Object.assign(context.terrain, terrain);
            return { committed: true, reason: null, events };
          }
          put(n, 0x6a, health - 1);
        }
        if (n[0x60]! & 0x80) {
          const components = n[122]===4 && !c.speciesComponents ? [4,4] : creatureComponents(c.speciesComponents,n[122]);
          const mask = !components.includes(1) && [2, 5].includes(ecologyTerrainClass(terrain, point(n)))
            ? 63
            : 127;
          if ((w(n, 0x6c) & mask) === 0)
            put(n, 0x68, Math.max(0, w(n, 0x68) - 1));
        }
        if ((phase & 15) <= 1) {
          const temperature = signed(
              c.climate +
                signed(
                  terrain.bytes[worldCell(...point(n)) * 14 + 9] |
                    (terrain.bytes[worldCell(...point(n)) * 14 + 10] << 8),
                ),
            ),
            warmth = n[123];
          if (!Number.isInteger(warmth) || warmth! < 0 || warmth! > 255)
            throw new Error(
              "Mule warmth byte has no initialized original value",
            );
          if (temperature < 26 && warmth) {
            const response = c.coldResponse;
            if (
              !response ||
              [response.primaryLoss, response.secondaryLoss].some(
                (v) => !Number.isInteger(v) || v < -128 || v > 127,
              )
            )
              throw new Error(
                "Cold Mule requires admitted original component temperature losses",
              );
            n[123] =
              (warmth -
                Math.min(
                  warmth,
                  response.primaryLoss + response.secondaryLoss,
                )) &
              255;
          } else if (temperature >= 26 && warmth! < 255)
            n[123] =
              warmth! + (temperature < 86 ? 1 : Math.min(2, 255 - warmth!));
          if (n[123] === 0 && n[94] !== 15) {
            releaseAction(staged, mule, c);
            put(n, 63, 0);
            put(n, 73, w(n, 73) & 0xefe8);
            n[84] = 0;
            n[22] = n[22]! & 63;
            if (n[24] === c.owned?.selectedPlayer)
              events.push({
                kind: "mule-portrait-refresh",
                id: mule.id,
                index: mule.index,
              });
            n[94] = 15;
            put(n, 108, 500);
          }
        }
      }
      materialPrefix(mule, c);
      if (n[94] === 8 && w(n, 108) > 0 && n[95] === 1) {
        if (!c.materialRuntime)
          throw Error("Pending Mule material travel requires actual services");
        stepMuleMaterialTravel(n, c.materialRuntime(mule));
      }
      if (
        ([0, 8].includes(n[0x5e]!) && w(n, 0x6c) === 0) ||
        [1, 3, 4, 5, 6, 7, 10].includes(n[0x5e]!) ||
        ([11, 15, 16, 18, 20, 21].includes(n[0x5e]!) && w(n, 0x6c) <= 0) ||
        (n[0x5e] === 1 && (w(n, 0x49) & 0x200) !== 0 && !(n[0x60]! & 0x80))
      )
        action(staged, mule, random, c, events);
      mule = staged.mules.find((candidate) => candidate.id === mule.id)!;
      n = mule.native;
      n[0x4a] = n[0x4a]! & 0xfc;
      muleLifecycleTail(mule, c.rules);
      if (w(n, 0x6c) > 0) put(n, 0x6c, w(n, 0x6c) - 1);
    } else {
      materialPrefix(mule, c);
    }
    if (n[94]! >= 24) mortality(staged, mule, 0, c, events, true);
    else animation(n, c);
    Object.assign(state, staged);
    Object.assign(rng, random);
    Object.assign(context.terrain, terrain);
    return { committed: true, reason: null, events };
  } catch (error) {
    return {
      committed: false,
      events: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Neutral and owned callbacks share the numeric movement/lifecycle body. */
export function stepNeutralMule(
  state: EcologyState,
  index: number,
  rng: GeneRng,
  context: MuleContext,
): MuleStepResult {
  return stepMule(state, index, rng, context, false);
}
export function stepOwnedMule(
  state: EcologyState,
  index: number,
  rng: GeneRng,
  context: MuleContext,
): MuleStepResult {
  return stepMule(state, index, rng, context, true);
}
