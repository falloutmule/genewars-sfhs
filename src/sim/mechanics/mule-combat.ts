import {creatureComponents} from "./creature-species";
/** Selector4 creature combat. Numeric ports of6B700/5B580/6EDA0/5C840,
 * completed-animation60332 and5B9F0; no executable or process pointers. */
import { nextRandom, type GeneRng } from "./random";
import {
  originalAngle,
  createMotion,
  velocity,
  type MotionTables,
} from "./motion";
import { worldCell, integerSqrt, type TerrainState } from "./terrain";
import {
  ecologyTerrainClass,
  plantBlockerWeight,
  type EcologyState,
  type EcologyMule,
} from "./ecology";
import type { MuleEvent } from "./mule";
import type { SourceEntityId } from "../campaign/source-pools";

export interface MuleCombatTraits {
  queryRadius: number;
  attack: number;
  defense: number;
  disposition: number;
  foodWeights: readonly [number, number, number];
  attackChannel: number;
}
export interface MuleCombatEffectRequest {
  code: 32;
  source: string;
  position: [number, number];
  angles: [number, number, number];
  /** Source69730 uses actual physical height; ordinary5B9F0 blood uses ground. */
  height?: number;
}
export interface MuleCombatTarget {
  id: SourceEntityId;
  index: number;
  kind: 1 | 2 | 3 | 4;
  owner: number;
  native: (number | null)[];
  physicalHeight: number;
  /** Concrete virtual68, including the actual specialist blueprint health. */
  dead: boolean;
  specialistStyle?: number;
  /**104E12[104DE0[selector]], distinct from74270 collision extents. */
  buildingHalfWidth?: number;
}
export interface MuleCombatContext {
  speciesComponents?: readonly (readonly number[])[];
  terrain: TerrainState;
  tables: MotionTables;
  frame: number;
  traits: MuleCombatTraits;
  allianceMasks?: readonly number[];
  players?: readonly (readonly number[])[];
  cellOrder?(cell: number): readonly string[];
  effectCode?(id: string): number;
  entity?(id: string): MuleCombatTarget | null;
  damage?(self: EcologyMule, target: MuleCombatTarget, amount: number): boolean;
  buildingAt?(self: EcologyMule): string | null;
  /** Required on blood emission. Mutate the provided staged host only, in
   * place; the caller owns its full-host rollback/commit. Factory32 draws0. */
  effect?(
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
    request: MuleCombatEffectRequest,
  ): void;
}
export interface MuleCombatPorts {
  release(mule: EcologyMule): void;
  speed(mule: EcologyMule): number;
  occupied(mule: EcologyMule): boolean;
  /** Ordinary source73C20(point,256) escape, with its actual two draws. */
  escape(mule: EcologyMule): void;
  /** Source5D700 mode1 attack contribution, actual category3 operator only. */
  attackBonus(mule: EcologyMule): number;
  death(mule: EcologyMule, attackerOwner: number): void;
  /** Immediate5E640 on reflection, before the source66F/6DB90 draws. */
  selectAnimation(mule: EcologyMule): void;
  /** Actual6D500 burst14 followed by shared unlink/cleanup. Invoked before
   * this record is cleared; the host owns the encompassing transaction. */
  coldRetire?(mule: EcologyMule, count: number): void;
}
/** Actual logical attacker identity. Creature classes come from the admitted
 * species table; native is mutable because researched recoil affects it. */
export interface MuleDamageAttacker {
  index: number;
  kind: 1 | 3 | 4 | 5 | 7 | 8;
  owner: number;
  native?: (number | null)[];
  primaryClass?: number;
  secondaryClass?: number;
}
type Native = readonly (number | null)[];
const i16 = (v: number) => (v << 16) >> 16;
const byte = (n: Native, p: number) => {
  const v = n[p];
  if (!Number.isInteger(v) || v! < 0 || v! > 255)
    throw new Error("Mule combat requires initialized numeric native fields");
  return v!;
};
const word = (n: Native, p: number) => i16(byte(n, p) | (byte(n, p + 1) << 8));
const dword = (n: Native, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const put = (n: (number | null)[], p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const point = (n: Native): [number, number] => [word(n, 7), word(n, 9)];
const virtualHeight = (n: Native) => (dword(n, 39) - dword(n, 17)) | 0;
const delta = (a: number, b: number) => i16(i16(b * 2) - i16(a * 2)) >> 1;
function assertMule(m: EcologyMule) {
  const n = m.native;
  if (
    n.length !== 124 ||
    !Number.isInteger(m.index) ||
    m.index < 0 ||
    m.index >= 300 ||
    byte(n, 6) !== 1 ||
    ![1,4,11,22].includes(byte(n,122)) ||
    word(n, 15) !== m.index ||
    byte(n, 24) > 4
  )
    throw new Error("Combat requires an admitted ground creature identity");
}
function traits(c: MuleCombatContext) {
  const t = c.traits;
  if (
    !t ||
    !Number.isInteger(t.queryRadius) ||
    t.queryRadius <= 0 ||
    t.queryRadius + 512 > 4096 ||
    [t.attack, t.defense, t.disposition, ...t.foodWeights].some(
      (v) => !Number.isInteger(v) || v < 0 || v > 255,
    ) ||
    !Number.isInteger(t.attackChannel) ||
    t.attackChannel < -128 ||
    t.attackChannel > 127
  )
    throw new Error("Hash-admitted original Mule combat traits are required");
  return t;
}
export interface MuleCombatQuery {
  points: [number, number][];
  enemyWeights: number[];
  friendlyWeights: number[];
  enemyCount: number;
  friendlyCount: number;
  enemySector: number;
  friendlySector: number;
  target: number | null;
  targetKind: 1 | 3 | 4 | null;
  secondaryCount: number;
  /** Complete preview, including source conditional specialist traversal draws. */
  rngAfter: GeneRng;
  confidence: number;
}
function localTarget(m: EcologyMule): MuleCombatTarget {
  assertMule(m);
  return {
    ...m,
    kind: 1,
    owner: byte(m.native, 24),
    physicalHeight: dword(m.native, 39),
    dead: byte(m.native, 94) >= 24,
  };
}
export function resolveMuleCombatTarget(
  state: EcologyState,
  c: MuleCombatContext,
  kind: number,
  index: number,
): MuleCombatTarget | null {
  if (kind === 1) {
    const m = state.mules.find((m) => m.index === index && m.native[6] === 1);
    return m ? localTarget(m) : null;
  }
  if (kind !== 3 && kind !== 4) return null;
  if (!c.entity)
    throw Error(
      "Mule combat requires the actual current specialist/building entity port",
    );
  const e = c.entity(`source:${kind - 1}:${index}`);
  if (!e) return null;
  if (
    e.kind !== kind ||
    e.index !== index ||
    byte(e.native, 6) !== kind ||
    word(e.native, 15) !== index ||
    byte(e.native, 24) !== e.owner
  )
    throw Error("Mule combat target identity differs from its native record");
  if (!Number.isInteger(e.physicalHeight) || typeof e.dead !== "boolean")
    throw Error("Mule combat concrete height/dead virtuals required");
  return e;
}
export function consumeMuleCombatQuery(
  rng: GeneRng,
  q: MuleCombatQuery | null,
): void {
  if (q) Object.assign(rng, q.rngAfter);
  else {
    nextRandom(rng);
    nextRandom(rng);
  }
}
/**8AE10: the current cell's owner-only fallback, without traversal draws.
 * The native routine ranks sorted coefficients by their first original
 * index; equal coefficients therefore all receive the same rank. */
export function queryMuleCellFallback(
  state: EcologyState,
  self: EcologyMule,
  c: MuleCombatContext,
): MuleCombatTarget | null {
  assertMule(self);
  const weights = traits(c).foodWeights,
    ranks = [...weights].sort((a, b) => a - b).map((v) => weights.indexOf(v)),
    cell = worldCell(...point(self.native));
  if (!c.cellOrder)
    throw Error("Mule cell fallback requires actual shared-cell head order");
  let best = 0,
    result: MuleCombatTarget | null = null;
  for (const id of c.cellOrder(cell)) {
    if (id === self.id) continue;
    const match = /^source:(\d+):(\d+)$/.exec(id);
    if (!match)
      throw Error("Mule cell fallback requires actual source identities");
    const kind = Number(match[1]) + 1,
      index = Number(match[2]);
    let target: MuleCombatTarget | null, rank: number;
    if (kind === 1 || kind === 3) {
      target = resolveMuleCombatTarget(state, c, kind, index);
      if (!target) throw Error("Mule cell fallback linked target is inactive");
      if (target.owner === byte(self.native, 24)) continue;
      rank = ranks[kind === 1 && byte(target.native, 94) >= 26 ? 2 : 0];
    } else if (kind === 2) {
      const p = state.plants[index];
      if (!p?.active)
        throw Error("Mule cell fallback linked plant is inactive");
      if (word(p.native, 44) <= 0) continue;
      target = {
        ...p,
        kind: 2,
        physicalHeight: dword(p.native, 17),
        dead: false,
      };
      rank = ranks[1];
    } else continue;
    if (rank > best) {
      best = rank;
      result = target;
    }
  }
  return result;
}
const bestSector = (weights: readonly number[]) =>
  weights.reduce((best, v, i) => (v > weights[best] ? i : best), 0);
/** Two8D930 traversal draws, previewed so a no-enemy caller can reuse the same
 * query for existing food/mate scorers. X outer/Y inner; head→next, first ties. */
export function queryMuleCombat(
  state: EcologyState,
  self: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
): MuleCombatQuery {
  assertMule(self);
  const t = traits(c),
    n = self.native,
    at = point(n),
    radius = t.queryRadius + 512,
    preview = { ...rng },
    sx = nextRandom(preview) % 2 ? -256 : 256,
    sy = nextRandom(preview) % 2 ? -256 : 256,
    q: MuleCombatQuery = {
      points: [],
      enemyWeights: Array(16).fill(0),
      friendlyWeights: Array(16).fill(0),
      enemyCount: 0,
      friendlyCount: 0,
      enemySector: 0,
      friendlySector: 0,
      target: null,
      targetKind: null,
      secondaryCount: 0,
      rngAfter: { ...preview },
      confidence: 0,
    };
  let best = -0x7fffffff;
  //8D930 uses the integer radius/256 bounds, then a squared-radius test.
  const extent = Math.trunc(radius / 256);
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      const squared = Math.imul(x * sx, x * sx) + Math.imul(y * sy, y * sy);
      if (squared > Math.imul(radius, radius)) continue;
      const sample: [number, number] = [
          i16(at[0] + x * sx),
          i16(at[1] + y * sy),
        ],
        cell = worldCell(...sample);
      q.points.push(sample);
      const candidates = state.mules.filter(
        (m) =>
          m.native[6] === 1 &&
          worldCell(...point(m.native)) === cell &&
          m.index !== self.index,
      );
      let ids = candidates.map((m) => m.id as string);
      if (c.cellOrder) {
        ids = [...c.cellOrder(cell)];
        if (candidates.some((m) => !ids.includes(m.id)))
          throw Error("Combat query lacks an actual linked candidate");
      } else if (candidates.length > 1) {
        if (!c.cellOrder)
          throw new Error(
            "Combat query requires actual shared-cell head order",
          );
      } else {
        const other = state.otherEntities.filter(
          (e) => [3, 4].includes(e.kind) && worldCell(...e.position) === cell,
        );
        if (other.length)
          throw Error("Combat query requires actual shared-cell head order");
      }
      for (const id of ids) {
        if (id === self.id) continue;
        const match = /^source:(\d+):(\d+)$/.exec(id);
        if (!match)
          throw Error("Combat query requires actual logical source identities");
        const kind = Number(match[1]) + 1,
          index = Number(match[2]);
        if (kind === 5) {
          if (!c.effectCode)
            throw Error(
              "Combat query requires the actual shared effect selector",
            );
          if (c.effectCode(id) === 17)
            throw Error("Mule neighborhood code17 scorer is not implemented");
          continue;
        }
        if (kind === 8) continue;
        let other: MuleCombatTarget | null;
        if (kind === 2) {
          const plant = state.plants[index];
          if (!plant?.active)
            throw Error("Combat query linked plant is inactive");
          other = {
            ...plant,
            kind: 2,
            physicalHeight: dword(plant.native, 17),
            dead: word(plant.native, 44) <= 0,
          };
        } else other = resolveMuleCombatTarget(state, c, kind, index);
        if (!other)
          throw Error("Combat query lacks its actual linked entity virtuals");
        const o = other.native,
          owner = byte(n, 24),
          otherOwner = byte(o, 24);
        let friendly = owner === otherOwner;
        if (!friendly && owner !== 4) {
          if (!c.allianceMasks || !Number.isInteger(c.allianceMasks[owner]))
            throw new Error(
              "Combat query requires the actual owner's alliance mask",
            );
          friendly = !!(c.allianceMasks[owner] & (1 << otherOwner));
        }
        const angle =
            originalAngle(
              i16(i16(word(o, 7) * 2) - i16(at[0] * 2)),
              i16(i16(word(o, 9) * 2) - i16(at[1] * 2)),
              c.tables.atan,
            ) & 2047,
          sector = angle >> 7,
          weight = radius - integerSqrt(squared);
        if (friendly) {
          q.friendlyCount++;
          q.friendlyWeights[sector] += weight;
        } else if (!other.dead) {
          // Intentional conversion bug fix: native6B700 can retain uninitialized
          // stack flags after a failed specialist roll. Each candidate starts
          // with both threat flags false; all determined branches stay exact.
          let primary = false,
            secondary = false;
          if (kind === 1) {
            primary = byte(o, 94) !== 15;
            secondary = true;
          } else if (kind === 4) secondary = true;
          else if (kind === 3) {
            const style = other.specialistStyle;
            if (!Number.isInteger(style) || style! < 0 || style! > 3)
              throw Error(
                "Combat query requires actual specialist blueprint style",
              );
            primary = secondary =
              style! < 2 ||
              (style === 2
                ? nextRandom(preview) % 100 < 20
                : byte(o, 115) < 224 &&
                  nextRandom(preview) % 224 < 224 - byte(o, 115));
          }
          if (primary) {
            q.enemyCount++;
            q.enemyWeights[sector] += weight;
          }
          if (secondary) {
            q.secondaryCount++;
            if (weight > best) {
              best = weight;
              q.target = other.index;
              q.targetKind = kind as 1 | 3 | 4;
            }
          }
        }
      }
    }
  q.enemySector = bestSector(q.enemyWeights);
  q.friendlySector = bestSector(q.friendlyWeights);
  if (q.enemyCount) {
    const maximum = word(n, 100);
    if (maximum <= 0) throw new Error("Combat maximum health must be positive");
    q.confidence =
      Math.trunc((word(n, 106) * 256) / maximum) -
      Math.trunc(
        Math.trunc(q.enemyWeights[q.enemySector] / q.enemyCount) /
          t.queryRadius,
      ) *
        32 +
      t.attack;
    if (q.friendlyCount)
      q.confidence +=
        Math.trunc(
          Math.trunc(q.friendlyWeights[q.friendlySector] / q.friendlyCount) /
            t.queryRadius,
        ) * 16;
  }
  q.rngAfter = { ...preview };
  return q;
}
/**73770 physical-height range, using signed15 torus deltas before squaring. */
export function muleCombatDistance(a: Native, b: Native): number {
  const dx = delta(word(a, 7), word(b, 7)),
    dy = delta(word(a, 9), word(b, 9)),
    dz = (dword(b, 39) - dword(a, 39)) >> 3;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
}
export function muleCombatTargetDistance(
  a: Native,
  b: MuleCombatTarget,
): number {
  const dx = delta(word(a, 7), word(b.native, 7)),
    dy = delta(word(a, 9), word(b.native, 9)),
    dz = (b.physicalHeight - dword(a, 39)) >> 3;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
}
function targetView(target: EcologyMule | MuleCombatTarget): MuleCombatTarget {
  return "kind" in target ? target : localTarget(target);
}
function halfWidth(t: MuleCombatTarget): number {
  if (
    !Number.isInteger(t.buildingHalfWidth) ||
    t.buildingHalfWidth! < 0 ||
    t.buildingHalfWidth! > 32767
  )
    throw Error("Admitted104E12 building combat half-width required");
  return t.buildingHalfWidth!;
}
/**5B580 kind1. Goal11/13 stays retained;50 and55 reference the live target. */
export function acquireMuleHostile(
  self: EcologyMule,
  target: EcologyMule | MuleCombatTarget,
  p: MuleCombatPorts,
  events: MuleEvent[],
  c?: MuleCombatContext,
  rng?: GeneRng,
) {
  assertMule(self);
  const t = targetView(target);
  p.release(self);
  const n = self.native,
    oldFlags22 = byte(self.native, 22);
  if (t.kind !== 4 && word(t.native, 73) & 0x400) return false;
  put(n, 85, t.index);
  n[87] = t.kind;
  if (byte(n, 120) !== 0) {
    put(n, 88, t.index);
    n[90] = t.kind;
  }
  n[22] = byte(n, 22) & 63;
  put(n, 73, (word(n, 73) | 20) & 0xeffc);
  n[84] = 20;
  n[79] = 0;
  let acquired = true;
  if (t.kind === 4) {
    if (!c?.buildingAt || !rng)
      throw Error(
        "Mule building acquisition requires actual74270 and RNG ports",
      );
    n[82] = 0;
    if (c.buildingAt(self) !== t.id) {
      put(n, 11, word(t.native, 7));
      put(n, 13, word(t.native, 9));
      put(n, 77, t.index);
      n[79] = 4;
      n[22] = oldFlags22 & 0xbf;
    } else {
      const radius = (halfWidth(t) + 256) & 65535,
        angle = nextRandom(rng) * 8,
        length = (radius * nextRandom(rng)) >> 8,
        index = (angle - 512) & 2047;
      put(
        n,
        11,
        (((i16(word(t.native, 7) * 2) +
          (Math.imul(length * 2, c.tables.cosine[index]) >> 16)) <<
          16) >>
          17) &
          32767,
      );
      put(
        n,
        13,
        (((i16(word(t.native, 9) * 2) +
          (Math.imul(length * 2, c.tables.sine[index]) >> 16)) <<
          16) >>
          17) &
          32767,
      );
      acquired = false;
    }
  } else {
    put(n, 80, t.index);
    n[82] = t.kind;
  }
  put(n, 63, p.speed(self));
  put(n, 108, 32767);
  n[96] = byte(n, 96) | 128 | (acquired ? 64 : 0);
  n[94] = acquired ? 1 : 8;
  events.push({
    kind: "mule-target",
    id: self.id,
    target: t.index,
    targetKind: t.kind,
    position: point(t.native),
  });
  return acquired;
}
function setVelocity(n: (number | null)[], c: MuleCombatContext) {
  const m = createMotion(word(n, 7), word(n, 9), dword(n, 17), word(n, 63));
  m.yaw = word(n, 57);
  m.pitch = word(n, 59);
  m.speed = word(n, 61);
  velocity(m, c.tables);
  put(n, 45, m.vx);
  put(n, 47, m.vy);
  put(n, 49, m.vz);
}
function stop(n: (number | null)[]) {
  put(n, 63, 0);
  put(n, 73, word(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = byte(n, 22) & 63;
}
/**6EDA0 alignment gate inclusive256,5C840 sound draw, then65DB5 caller bit. */
export function contactMuleHostile(
  self: EcologyMule,
  target: EcologyMule | MuleCombatTarget,
  rng: GeneRng,
  c: MuleCombatContext,
  events: MuleEvent[],
): boolean {
  assertMule(self);
  const t = targetView(target);
  traits(c);
  const n = self.native,
    o = t.native,
    yaw =
      originalAngle(
        i16(i16(word(o, 7) * 2) - i16(word(n, 7) * 2)),
        i16(i16(word(o, 9) * 2) - i16(word(n, 9) * 2)),
        c.tables.atan,
      ) & 2047;
  let difference = yaw - word(n, 57),
    alternate = difference < 0 ? difference + 2048 : difference - 2048;
  if (Math.abs(alternate) < Math.abs(difference)) difference = alternate;
  if (muleCombatTargetDistance(n, t) > 16384) return false;
  if (Math.abs(difference) > 256) {
    put(n, 75, yaw);
    return false;
  }
  beginMuleAttack(self, t, rng, c, events);
  n[96] = byte(n, 96) & 0xbf;
  return true;
}
/** Direct virtual38 entry, also used by source building arrival/repeated hits. */
export function beginMuleAttack(
  self: EcologyMule,
  target: MuleCombatTarget,
  rng: GeneRng,
  c: MuleCombatContext,
  events: MuleEvent[],
): void {
  const n = self.native,
    yaw =
      originalAngle(
        i16(i16(word(target.native, 7) * 2) - i16(word(n, 7) * 2)),
        i16(i16(word(target.native, 9) * 2) - i16(word(n, 9) * 2)),
        c.tables.atan,
      ) & 2047;
  n[94] = 21;
  put(n, 108, 32767);
  stop(n);
  put(n, 75, yaw);
  if (nextRandom(rng) % 3 === 1)
    events.push({
      kind: "mule-audio",
      id: self.id,
      channel: c.traits.attackChannel,
    });
}
/**707A0's16 directions/74CC0 numeric predicate. No invented grid routing. */
export function fleeMule(
  self: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  state: EcologyState,
  heading: number,
  distance: number,
  mode: number,
): boolean {
  const n = self.native,
    at = point(n),
    turn = nextRandom(rng) % 2 ? 128 : -128;
  for (
    let attempt = 0;
    attempt < 16;
    attempt++, heading = (heading + turn) & 2047
  ) {
    const index = (heading - 512) & 2047,
      target: [number, number] = [
        i16(at[0] + Math.floor((c.tables.cosine[index] * distance) / 65536)),
        i16(at[1] + Math.floor((c.tables.sine[index] * distance) / 65536)),
      ],
      material = ecologyTerrainClass(c.terrain, target);
    if (
      byte(n, 83) & (1 << material) ||
      plantBlockerWeight(state, worldCell(...target)) > 9
    )
      continue;
    put(n, 11, target[0]);
    put(n, 13, target[1]);
    n[84] = 20;
    put(n, 73, (word(n, 73) | 20) & 0xeffc);
    n[22] = byte(n, 22) & 0x3f;
    n[79] = n[82] = 0;
    put(
      n,
      57,
      originalAngle(
        i16(i16(target[0] * 2) - i16(at[0] * 2)),
        i16(i16(target[1] * 2) - i16(at[1] * 2)),
        c.tables.atan,
      ) & 2047,
    );
    if (!mode) n[74] = byte(n, 74) | 16;
    return true;
  }
  put(n, 73, (word(n, 73) & 0xeebc) | 0x140);
  n[22] = byte(n, 22) & 0x7f;
  return false;
}
/** Shared confidence branch. false consumes0 draws, allowing the caller's
 * existing food/mate scorer to consume the same previewed traversal draws. */
export function chooseMuleHostile(
  state: EcologyState,
  self: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  p: MuleCombatPorts,
  events: MuleEvent[],
  captured?: MuleCombatQuery,
): boolean {
  const n = self.native;
  if (n[94] === 0 || byte(n, 96) & 16) return false;
  const q = captured ?? queryMuleCombat(state, self, rng, c);
  if (!q.enemyCount && !(p.occupied(self) && virtualHeight(n) <= 1280))
    return false;
  consumeMuleCombatQuery(rng, q);
  return resolveMuleHostileQuery(state, self, rng, c, p, events, q);
}
/** Same decision after the caller already consumed traversal draws. Corpse
 * eating interleaves its32/0x20 factory between query and confidence draws. */
export function resolveMuleHostileQuery(
  state: EcologyState,
  self: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  p: MuleCombatPorts,
  events: MuleEvent[],
  q: MuleCombatQuery,
): boolean {
  const n = self.native;
  if (n[94] === 0 || byte(n, 96) & 16) return false;
  if (p.occupied(self) && virtualHeight(n) <= 1280) {
    p.release(self);
    escapeMuleNeighborhood(self, rng, c, p.speed(self));
    return true;
  }
  if (!q.enemyCount) return false;
  if (
    nextRandom(rng) % 100 <= c.traits.disposition &&
    nextRandom(rng) >= q.confidence
  ) {
    p.release(self);
    n[94] = 0;
    put(n, 63, p.speed(self));
    put(n, 108, 32767);
    n[96] = byte(n, 96) | 128;
    let heading: number, distance: number, mode: number;
    if (!q.friendlyCount) {
      distance = 256 + 2 * nextRandom(rng);
      heading = (q.enemySector * 128 + (nextRandom(rng) % 128) + 1024) & 2047;
      mode = 1;
    } else {
      mode = nextRandom(rng) % 2;
      distance = 256 + 2 * nextRandom(rng);
      heading = q.friendlySector * 128 + (nextRandom(rng) % 128);
    }
    fleeMule(self, rng, c, state, heading, distance, mode);
    return true;
  }
  const target = resolveMuleCombatTarget(
    state,
    c,
    q.targetKind ?? 1,
    q.target!,
  );
  if (!target) throw new Error("Combat query's live target disappeared");
  acquireMuleHostile(self, target, p, events, c, rng);
  return true;
}
/** The neighborhood's occupied-cell branch uses73E00(point,384): a circle
 * with ONE draw, distinct from the ordinary73C20 random-radius idle escape. */
export function escapeMuleNeighborhood(
  self: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  speed: number,
) {
  const n = self.native,
    angle = nextRandom(rng) * 8,
    index = (angle - 512) & 2047;
  for (let axis = 0; axis < 2; axis++) {
    const trig = axis ? c.tables.sine[index] : c.tables.cosine[index],
      offset = Math.imul(768, trig) >> 16,
      doubled = i16(i16(word(n, 7 + axis * 2) * 2) + offset);
    put(n, 11 + axis * 2, (doubled >> 1) & 32767);
  }
  n[84] = 20;
  put(n, 73, (word(n, 73) | 20) & 0xeffc);
  n[22] = byte(n, 22) & 63;
  n[79] = n[82] = 0;
  put(n, 63, speed);
  put(n, 108, 32767);
  n[96] = byte(n, 96) | 128;
}
/**6DB90 knock-away: velocity direction from source to recipient; CL1 enables
 * an extra pitch draw only when recipient virtual height<=128. */
function knockAway(
  recipient: (number | null)[],
  source: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  impulse: number,
) {
  const n = recipient,
    o = source.native,
    dx = delta(word(o, 7), word(n, 7)),
    dy = delta(word(o, 9), word(n, 9)),
    dz = dword(o, 39) - dword(n, 39),
    horizontal = integerSqrt((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0);
  const yaw = originalAngle(i16(dx * 2), i16(dy * 2), c.tables.atan) & 2047;
  let pitch = originalAngle(horizontal, dz >> 3, c.tables.atan) & 2047;
  if (virtualHeight(n) <= 128) pitch = 2 * (nextRandom(rng) % 128);
  put(n, 57, yaw);
  put(n, 59, pitch);
  put(n, 61, impulse);
  setVelocity(n, c);
}
/**5B9F0 selector4 damage/reaction. Mutates both actual staged records where
 * the researched Mule recoil ability applies. Dead targets take no damage. */
export function damageMule(
  state: EcologyState,
  target: EcologyMule,
  attacker: EcologyMule,
  incoming: number,
  rng: GeneRng,
  c: MuleCombatContext,
  p: MuleCombatPorts,
  events: MuleEvent[],
): boolean {
  assertMule(attacker);
  return damageMuleFromSource(
    state,
    target,
    {
      index: attacker.index,
      kind: 1,
      owner: byte(attacker.native, 24),
      native: attacker.native,
      primaryClass: c.speciesComponents ? creatureComponents(c.speciesComponents,attacker.native[122])[0] : 4,
      secondaryClass: c.speciesComponents ? creatureComponents(c.speciesComponents,attacker.native[122])[1] : 4,
    },
    incoming,
    rng,
    c,
    p,
    events,
  );
}
/**5B9F0 for a selector4 recipient, with all supported logical attacker kinds.
 * The caller supplies an isolated full-host transaction; no record is cloned
 * or replaced here, so source recoil and inline factories retain aliases. */
export function damageMuleFromSource(
  state: EcologyState,
  target: EcologyMule,
  source: MuleDamageAttacker | null,
  incoming: number,
  rng: GeneRng,
  c: MuleCombatContext,
  p: MuleCombatPorts,
  events: MuleEvent[],
): boolean {
  assertMule(target);
  traits(c);
  const n = target.native;
  if (byte(n, 94) >= 24) return true;
  if (!Number.isInteger(incoming))
    throw new Error("Combat damage must be an integer");
  if (byte(n, 94) === 15) {
    if (!p.coldRetire)
      throw new Error(
        "Cold Mule damage requires the actual staged burst14/cleanup factory",
      );
    p.coldRetire(target, 10 + (nextRandom(rng) % 10));
    return true;
  }
  const self = source?.kind === 1 && source.index === target.index;
  const attacker = self ? null : source;
  if (attacker) {
    if (
      !Number.isInteger(attacker.index) ||
      attacker.index < 0 ||
      ![1, 3, 4, 5, 7, 8].includes(attacker.kind) ||
      !Number.isInteger(attacker.owner) ||
      attacker.owner < 0 ||
      attacker.owner > 4
    )
      throw new Error(
        "Mule damage requires an actual logical attacker identity",
      );
    if (
      attacker.native &&
      (byte(attacker.native, 6) !== attacker.kind ||
        word(attacker.native, 15) !== attacker.index ||
        byte(attacker.native, 24) !== attacker.owner)
    )
      throw new Error(
        "Mule attacker metadata disagrees with its actual native record",
      );
    if (
      attacker.kind === 1 &&
      (!attacker.native ||
        attacker.native.length !== 124 ||
        !Number.isInteger(attacker.primaryClass) ||
        !Number.isInteger(attacker.secondaryClass))
    )
      throw new Error("Creature damage requires actual native/class bindings");
    if (
      attacker.kind === 5 &&
      (!attacker.native || [17, 34].includes(byte(attacker.native, 69)))
    )
      throw new Error(
        "Effect17/34 damage requires its additional source smoke/release service",
      );
  }
  let defense = Math.trunc(
    (c.traits.defense *
      (50 + Math.trunc((Math.min(byte(n, 118), 100) * 50) / 100))) /
      100,
  );
  if (attacker?.kind === 1) {
    if (attacker.primaryClass === 2) defense = 0;
    else if (attacker.secondaryClass === 2) defense >>= 1;
  }
  const damage = Math.max(1, incoming - defense);
  p.release(target);
  if (attacker?.kind === 1 && word(n, 65) <= word(attacker.native!, 65))
    stop(n);
  put(n, 106, word(n, 106) - damage);
  const lethal = word(n, 106) < 1;
  if (byte(n, 94) !== 18 && !self) {
    let reflect = false;
    if (!lethal && attacker?.kind === 1 && (c.speciesComponents ? creatureComponents(c.speciesComponents,n[122])[0]===4 : n[122]===4)) {
      if (byte(n, 24) === 4) reflect = byte(n, 118) > 90;
      else {
        const owner = byte(n, 24),
          player = c.players?.[owner];
        if (!(byte(n, 97) & 4) && (!player || player.length !== 1805))
          throw new Error(
            "Mule reaction requires the actual owner's research record",
          );
        reflect = !!(byte(n, 97) & 4) || player![0x6c7 + byte(n,122)] !== 0;
      }
      reflect = reflect && word(n, 104) >= 7;
    }
    if (reflect) {
      put(n, 104, word(n, 104) - 7);
      n[94] = 16;
      p.selectAnimation(target);
      const impulse = 5760 + (nextRandom(rng) % 50) * 64; //66F, before6DB90's conditional draw
      knockAway(attacker!.native!, target, rng, c, impulse);
    } else n[94] = 20;
    put(n, 108, 32767);
  }
  if (attacker) {
    put(n, 85, attacker.index);
    n[87] = attacker.kind;
  }
  if (byte(n, 94) !== 18 && !self)
    events.push({
      kind: "mule-audio",
      id: target.id,
      channel: nextRandom(rng) % 2 ? 8 : 28 + (nextRandom(rng) % 3),
    });
  if (damage > 4) {
    const speed = 8192 + 64 * (nextRandom(rng) % 128),
      pitch = 2 * (nextRandom(rng) % 150),
      yaw = 8 * (nextRandom(rng) % 256);
    if (!c.effect)
      throw new Error(
        "Combat blood requires the actual staged shared effect factory",
      );
    c.effect(state, c.terrain, rng, {
      code: 32,
      source: target.id,
      position: point(n),
      angles: [yaw, pitch, speed],
    });
  }
  events.push({
    kind: "mule-combat-damage",
    id: target.id,
    ...(source ? { target: source.index, attackerKind: source.kind } : {}),
    damage,
  });
  if (lethal) p.death(target, attacker?.owner ?? 4);
  return lethal;
}
/** Completed state21. Range is checked again when ANB finishes; damage is
 * never applied merely because contact/animation entry succeeded. */
export function completeMuleAttack(
  state: EcologyState,
  self: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  p: MuleCombatPorts,
  events: MuleEvent[],
) {
  const n = self.native;
  if (n[94] !== 21 || word(n, 108) > 0)
    throw new Error(
      "Attack completion requires the actual finished animation gate",
    );
  const target = resolveMuleCombatTarget(state, c, byte(n, 87), word(n, 85));
  const idle = (base: number) => {
    n[94] = 8;
    const delay = base + (nextRandom(rng) % 20);
    if (p.occupied(self)) p.escape(self);
    else put(n, 108, delay);
  };
  const range = target?.kind === 4 ? halfWidth(target) + 64 : 128;
  if (!target || muleCombatTargetDistance(n, target) > range * range) {
    idle(10);
    return;
  }
  const strength = Math.trunc(
      (c.traits.attack *
        (50 + Math.trunc((Math.min(byte(n, 118), 100) * 50) / 100))) /
        100,
    ),
    reserve = word(n, 104),
    cost = Math.min(reserve, strength >> 2);
  put(n, 104, Math.max(0, reserve - cost));
  let damage = Math.max(strength >> 1, cost * 2) + (nextRandom(rng) % 10);
  damage = Math.trunc((damage * (100 + p.attackBonus(self))) / 100);
  if (target.kind === 3) damage >>= 2;
  else if (target.kind === 4) {
    //Mule components are4/4: source60553 neither primary nor secondary class1.
    damage >>= 1;
    events.push({ kind: "mule-audio", id: self.id, channel: 88 });
  }
  let killed: boolean;
  if (target.kind === 1) {
    const mule = state.mules.find(
      (m) => m.index === target.index && m.native[6] === 1,
    );
    if (!mule) throw Error("Mule attack recipient disappeared before damage");
    killed = damageMule(state, mule, self, damage, rng, c, p, events);
  } else {
    if (!c.damage)
      throw Error(
        "Mule attack requires the actual specialist/building damage callback",
      );
    killed = c.damage(self, target, damage);
    if (typeof killed !== "boolean")
      throw Error("Mule attack requires the actual damage virtual boolean");
  }
  //BA4 is evaluated exactly once, only after the damage callback returns.
  if (!killed) {
    if (nextRandom(rng) % 100 <= c.traits.disposition) {
      const query = queryMuleCombat(state, self, rng, c);
      if (chooseMuleHostile(state, self, rng, c, p, events, query)) return;
      consumeMuleCombatQuery(rng, query);
    }
    if (target.kind === 4) beginMuleAttack(self, target, rng, c, events);
    else {
      n[94] = 1;
      put(n, 108, 32767);
    }
  } else {
    const kind = byte(target.native, 6);
    if (kind === 1) {
      n[94] = 5;
      put(n, 108, 32767);
      n[96] = byte(n, 96) | 32;
    } else if (kind === 3) {
      n[94] = 6;
      put(n, 108, 10 + (nextRandom(rng) % 6));
    } else {
      n[94] = 8;
      if (p.occupied(self)) p.escape(self);
      else put(n, 108, 0);
    }
  }
  if (n[24] === 4) {
    n.splice(114, 4, ...n.slice(7, 11));
    n[96] = byte(n, 96) | 8;
  }
}
