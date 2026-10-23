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
}
export interface MuleCombatContext {
  terrain: TerrainState;
  tables: MotionTables;
  frame: number;
  traits: MuleCombatTraits;
  allianceMasks?: readonly number[];
  players?: readonly (readonly number[])[];
  cellOrder?(cell: number): readonly string[];
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
    byte(n, 122) !== 4 ||
    word(n, 15) !== m.index ||
    byte(n, 24) > 4
  )
    throw new Error("Combat requires an actual selector4 creature identity");
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
  confidence: number;
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
      let ordered = candidates;
      if (candidates.length > 1) {
        if (!c.cellOrder)
          throw new Error(
            "Combat query requires actual shared-cell head order",
          );
        const ids = c.cellOrder(cell);
        if (candidates.some((m) => !ids.includes(m.id)))
          throw new Error("Combat query lacks an actual linked candidate");
        ordered = candidates
          .slice()
          .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }
      for (const other of ordered) {
        assertMule(other);
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
        } else if (byte(o, 94) < 24 && byte(o, 94) !== 15) {
          q.enemyCount++;
          q.enemyWeights[sector] += weight;
          if (weight > best) {
            best = weight;
            q.target = other.index;
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
  return q;
}
/**73770 physical-height range, using signed15 torus deltas before squaring. */
export function muleCombatDistance(a: Native, b: Native): number {
  const dx = delta(word(a, 7), word(b, 7)),
    dy = delta(word(a, 9), word(b, 9)),
    dz = (dword(b, 39) - dword(a, 39)) >> 3;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
}
/**5B580 kind1. Goal11/13 stays retained;50 and55 reference the live target. */
export function acquireMuleHostile(
  self: EcologyMule,
  target: EcologyMule,
  p: MuleCombatPorts,
  events: MuleEvent[],
) {
  assertMule(self);
  assertMule(target);
  p.release(self);
  const n = self.native;
  put(n, 85, target.index);
  n[87] = 1;
  if (byte(n, 120) !== 0) {
    put(n, 88, target.index);
    n[90] = 1;
  }
  n[22] = byte(n, 22) & 63;
  put(n, 73, (word(n, 73) | 20) & 0xeffc);
  n[84] = 20;
  n[79] = 0;
  put(n, 80, target.index);
  n[82] = 1;
  put(n, 63, p.speed(self));
  put(n, 108, 32767);
  n[96] = byte(n, 96) | 0xc0;
  n[94] = 1;
  events.push({
    kind: "mule-target",
    id: self.id,
    target: target.index,
    targetKind: 1,
    position: point(target.native),
  });
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
  target: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  events: MuleEvent[],
): boolean {
  assertMule(self);
  assertMule(target);
  traits(c);
  const n = self.native,
    o = target.native,
    yaw =
      originalAngle(
        i16(i16(word(o, 7) * 2) - i16(word(n, 7) * 2)),
        i16(i16(word(o, 9) * 2) - i16(word(n, 9) * 2)),
        c.tables.atan,
      ) & 2047;
  let difference = yaw - word(n, 57),
    alternate = difference < 0 ? difference + 2048 : difference - 2048;
  if (Math.abs(alternate) < Math.abs(difference)) difference = alternate;
  if (muleCombatDistance(n, o) > 16384) return false;
  if (Math.abs(difference) > 256) {
    put(n, 75, yaw);
    return false;
  }
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
  n[96] = byte(n, 96) & 0xbf;
  return true;
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
): boolean {
  const n = self.native;
  if (n[94] === 0 || byte(n, 96) & 16) return false;
  const q = queryMuleCombat(state, self, rng, c);
  if (!q.enemyCount && !(p.occupied(self) && virtualHeight(n) <= 1280))
    return false;
  nextRandom(rng);
  nextRandom(rng);
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
  const target = state.mules.find((m) => m.index === q.target);
  if (!target) throw new Error("Combat query's live target disappeared");
  acquireMuleHostile(self, target, p, events);
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
  recipient: EcologyMule,
  source: EcologyMule,
  rng: GeneRng,
  c: MuleCombatContext,
  impulse: number,
) {
  const n = recipient.native,
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
  assertMule(target);
  assertMule(attacker);
  traits(c);
  const n = target.native,
    a = attacker.native;
  if (byte(n, 94) >= 24) return true;
  if (!Number.isInteger(incoming))
    throw new Error("Combat damage must be an integer");
  if (target.index === attacker.index)
    throw new Error("External/self damage has a separate source path");
  const defense = Math.trunc(
      (c.traits.defense *
        (50 + Math.trunc((Math.min(byte(n, 118), 100) * 50) / 100))) /
        100,
    ),
    damage = Math.max(1, incoming - defense);
  p.release(target);
  if (word(n, 65) <= word(a, 65)) stop(n);
  put(n, 106, word(n, 106) - damage);
  const lethal = word(n, 106) < 1;
  if (byte(n, 94) !== 18) {
    let reflect = false;
    if (!lethal) {
      if (byte(n, 24) === 4) reflect = byte(n, 118) > 90;
      else {
        const owner = byte(n, 24),
          player = c.players?.[owner];
        if (!(byte(n, 97) & 4) && (!player || player.length !== 1805))
          throw new Error(
            "Mule reaction requires the actual owner's research record",
          );
        reflect = !!(byte(n, 97) & 4) || player![0x6c7 + 4] !== 0;
      }
      reflect = reflect && word(n, 104) >= 7;
    }
    if (reflect) {
      put(n, 104, word(n, 104) - 7);
      n[94] = 16;
      p.selectAnimation(target);
      const impulse = 5760 + (nextRandom(rng) % 50) * 64; //66F, before6DB90's conditional draw
      knockAway(attacker, target, rng, c, impulse);
    } else n[94] = 20;
    put(n, 108, 32767);
  }
  put(n, 85, attacker.index);
  n[87] = 1;
  if (byte(n, 94) !== 18)
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
    target: attacker.index,
    damage,
  });
  if (lethal) p.death(target, byte(a, 24));
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
  const target =
    n[87] === 1
      ? state.mules.find((m) => m.index === word(n, 85) && m.native[6] === 1)
      : undefined;
  const idle = (base: number) => {
    n[94] = 8;
    const delay = base + (nextRandom(rng) % 20);
    if (p.occupied(self)) p.escape(self);
    else put(n, 108, delay);
  };
  if (!target || muleCombatDistance(n, target.native) > 16384) {
    idle(10);
    return;
  }
  assertMule(target);
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
  const killed = damageMule(state, target, self, damage, rng, c, p, events);
  //BA4 is evaluated exactly once, only after the damage callback returns.
  if (!killed) {
    if (nextRandom(rng) % 100 <= c.traits.disposition) {
      if (chooseMuleHostile(state, self, rng, c, p, events)) return;
      nextRandom(rng);
      nextRandom(rng);
    }
    n[94] = 1;
    put(n, 108, 32767);
  } else {
    n[94] = 5;
    put(n, 108, 32767);
    n[96] = byte(n, 96) | 32;
  }
  if (n[24] === 4) {
    n.splice(114, 4, ...n.slice(7, 11));
    n[96] = byte(n, 96) | 8;
  }
}
