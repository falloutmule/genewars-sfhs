/** Source48790/49CCD and4E232 special monolith reward effect59.
 * No common effect physics or animation callback runs for descriptor mode5. */
import { nextRandom, type GeneRng } from "./random";
import { type AnimationProfile } from "./animation";
import { createMotion, velocity, type MotionTables } from "./motion";
import { groundHeight, type TerrainState } from "./terrain";
import {
  effectFactoryPrior,
  effectPriorByte,
  effectTerrainShade,
  putEffectWord,
  type EffectNativePrior,
  type PowerEffectPool,
} from "./power-motion";
import type { Blueprint } from "./blueprints";
import type { SourceEntityId } from "../campaign/source-pools";
const word = (n: readonly (number | null)[], at: number) =>
  ((effectPriorByte(n, at) | (effectPriorByte(n, at + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
const wrap = (v: number) => (v << 16) >> 16;
export interface RewardEffectInput {
  slot: number;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  firstComponentY: number;
}
export interface RewardParticleRequest {
  code: 6 | 26;
  owner: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  newborn: boolean;
}
export type RewardTarget = {
  id: SourceEntityId;
  owner: number;
  position: [number, number];
  height: number;
  visualHeight: number;
} & (
  | { kind: 3; blueprint: Blueprint }
  | { kind: 1; native: (number | null)[] }
);
export type RewardEvent =
  | {
      type: "audio";
      channel: 0x29 | 0x54;
      mode: 2;
      parameter: 255;
      volume: 127;
      ratePercent: 100;
    }
  | { type: "stop-if-playing"; channel: 0x29 | 0x54; mode: 4 }
  | { type: "adjust-audio"; channel: 0x54; ratePercent: 500; parameter: 255 }
  | {
      type: "specialist-improved";
      target: SourceEntityId;
      skill: number;
      health: number;
    }
  | {
      type: "creature-researched";
      target: SourceEntityId;
      species: number;
      level: number;
    }
  | { type: "selected-player-cue"; cue: 0x3a | 0x3b }
  | { type: "research-message"; target: SourceEntityId; variant: 0 };
export interface RewardEffectContext {
  frame: number;
  selectedPlayer: number;
  skillCaps: readonly number[];
  healthCaps: readonly number[];
  players: readonly { raw: number[] }[];
  /**4F7C0: nearest eligible KIND1(owner!=4) or KIND3 in spatial traversal
   * order, using73770 height-adjusted squared distance<=65536. The nearest
   * object is selected BEFORE checking whether its reward is already full. */
  nearestTarget(
    native: readonly (number | null)[],
    query: RewardQuery,
  ): RewardTarget | null;
  /**48790 factory. Only successful newborn=true requests contribute to4E950. */
  particle(request: RewardParticleRequest, rng: GeneRng): boolean;
}
export interface RewardEffectUpdate {
  native: EffectNativePrior;
  retirementRequired: boolean;
  newborns: number;
  events: RewardEvent[];
  contact: SourceEntityId | null;
  query: RewardQuery | null;
}
export interface RewardQuery {
  center: [number, number];
  stepX: 256 | -256;
  stepY: 256 | -256;
  points: [number, number][];
}
/**8D7B0(CL1,radius256)/8D930: two random scan directions and X-outer order. */
export function rewardQuery(
  native: readonly (number | null)[],
  rng: GeneRng,
): RewardQuery {
  const center: [number, number] = [word(native, 7), word(native, 9)],
    stepX = nextRandom(rng) % 2 === 0 ? 256 : -256,
    stepY = nextRandom(rng) % 2 === 0 ? 256 : -256,
    points: [number, number][] = [];
  for (let ix = -1; ix <= 1; ix++)
    for (let iy = -1; iy <= 1; iy++) {
      const point: [number, number] = [
        wrap(center[0] + ix * stepX),
        wrap(center[1] + iy * stepY),
      ];
      if (
        rewardTargetDistance(native, {
          position: point,
          height: dword(native, 39),
        }) <= 65536
      )
        points.push(point);
    }
  return { center, stepX, stepY, points };
}
/** Known104EB6 descriptor priorities; unknown live selectors require a profile. */
export const establishedEffectPriorities: Readonly<Record<number, number>> =
  Object.freeze({
    6: 27,
    21: 19,
    22: 20,
    26: 35,
    32: 42,
    33: 1,
    44: 5,
    47: 35,
    48: 20,
    49: 1,
    59: 1,
    60: 11,
  });
export function selectEffectSlot(
  pool: PowerEffectPool,
  requestedCode: number,
  priority: (code: number) => number | undefined = (code) =>
    establishedEffectPriorities[code],
): { slot: number; replace: boolean } | null {
  if (pool.slots.length !== 200)
    throw new Error("Source shared effect pool requires200slots");
  const free = pool.slots.findIndex((s) => !s.occupied);
  if (free >= 0) return { slot: free, replace: false };
  let rank = priority(requestedCode),
    selected: number | null = null;
  if (rank === undefined)
    throw new Error("Requested source effect priority is unknown");
  for (let slot = 0; slot < 200; slot++) {
    const n = pool.slots[slot].nativePrior;
    if (!n) throw new Error("Shared effect replacement prior is required");
    const candidate = priority(effectPriorByte(n, 69));
    if (candidate === undefined)
      throw new Error("Live source effect priority is unknown");
    if (candidate > rank && !(effectPriorByte(n, 21) & 1)) {
      rank = candidate;
      selected = slot;
    }
  }
  return selected === null ? null : { slot: selected, replace: true };
}
export function makeRewardEffect(
  prior: EffectNativePrior,
  input: RewardEffectInput,
  terrain: TerrainState,
  tables: MotionTables,
  profile: AnimationProfile,
): EffectNativePrior {
  if (
    prior[6] !== 0 ||
    !Number.isInteger(input.slot) ||
    input.slot < 0 ||
    input.slot >= 200 ||
    !Number.isInteger(input.owner) ||
    input.owner < 0 ||
    input.owner >= 4 ||
    !Number.isInteger(input.firstComponentY) ||
    input.firstComponentY < -32768 ||
    input.firstComponentY > 32767 ||
    input.position.some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    ) ||
    input.angles.some(
      (v, i) => !Number.isInteger(v) || v < 0 || v > (i === 2 ? 32767 : 2048),
    ) ||
    !Number.isInteger(input.height) ||
    input.height < -2147483648 ||
    input.height > 2147483647
  )
    throw new Error("Invalid source reward factory input");
  if (
    profile.flags !== 0 ||
    profile.holds.length !== 1 ||
    profile.holds[0] !== 0
  )
    throw new Error("Original single hold0 EFF59 profile is required");
  const ground = groundHeight(terrain, ...input.position),
    motion = createMotion(...input.position, ground, 0);
  [motion.yaw, motion.pitch, motion.speed] = input.angles;
  velocity(motion, tables);
  const n = effectFactoryPrior(prior, {
    slot: input.slot,
    owner: input.owner,
    code: 59,
    x: input.position[0],
    y: input.position[1],
    ground,
    height: input.height,
    shade: effectTerrainShade(terrain, ...input.position),
    vx: motion.vx,
    vy: motion.vy,
    vz: motion.vz,
    accelerationZ: 0,
    yaw: input.angles[0],
    pitch: input.angles[1],
    speed: input.angles[2],
    delay: 0,
  });
  n[70] = 255;
  putEffectWord(n, 74, -input.firstComponentY);
  n[76] = n[74];
  return n;
}
export function rewardTargetDistance(
  native: readonly (number | null)[],
  target: Pick<RewardTarget, "position" | "height">,
): number {
  const dx =
      wrap(wrap(target.position[0] * 2) - wrap(word(native, 7) * 2)) >> 1,
    dy = wrap(wrap(target.position[1] * 2) - wrap(word(native, 9) * 2)) >> 1,
    dz = ((target.height - dword(native, 39)) | 0) >> 3;
  return (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
}
function feedback(target: RewardTarget, c: RewardEffectContext, rng: GeneRng) {
  if (!c.particle)
    throw new Error("Source reward shared feedback26 factory is required");
  //6D500(target,code26,variation0,speed10,count10,speedRange20,owner-1).
  for (let i = 0; i < 10; i++) {
    const speed = (10 + (nextRandom(rng) % 20)) << 6,
      pitch =
        (nextRandom(rng) % (target.visualHeight < 128 ? 150 : 128)) *
        (target.visualHeight < 128 ? 1 : 8),
      yaw = (nextRandom(rng) % 128) * 16;
    c.particle(
      {
        code: 26,
        owner: target.owner,
        position: [...target.position],
        height: target.height,
        angles: [yaw, pitch, speed],
        newborn: false,
      },
      rng,
    );
  }
}
function eligible(target: RewardTarget, c: RewardEffectContext): boolean {
  if (target.kind === 3) {
    const b = target.blueprint;
    if (
      b.style < 0 ||
      b.style >= 4 ||
      c.skillCaps.length !== 4 ||
      c.healthCaps.length !== 4
    )
      throw new Error("Original specialist reward caps are required");
    return (
      (b.skill << 24) >> 24 < c.skillCaps[b.style] ||
      (b.maxHealth << 24) >> 24 < c.healthCaps[b.style]
    );
  }
  if (target.owner === 4)
    throw new Error("Source reward nearest query admitted a neutral creature");
  const species = (effectPriorByte(target.native, 0x7a) << 24) >> 24,
    player = c.players[target.owner];
  if (
    !player ||
    player.raw.length !== 1805 ||
    species < 0 ||
    0x6c7 + species >= 1805
  )
    throw new Error("Source creature reward research field is invalid");
  return player.raw[0x6c7 + species] < 1;
}
/** Ordered special callback. Target/blueprint/player views must belong to the
 * enclosing staged world; particle factories execute before later RNG draws. */
export function stepRewardEffectRecord(
  before: readonly (number | null)[],
  rng: GeneRng,
  c: RewardEffectContext,
): RewardEffectUpdate {
  if (
    before.length !== 81 ||
    before[6] !== 5 ||
    before[69] !== 59 ||
    word(before, 15) < 0 ||
    word(before, 15) >= 200
  )
    throw new Error("Invalid source reward callback");
  const n = before.slice(),
    out: RewardEffectUpdate = {
      native: n,
      retirementRequired: false,
      newborns: 0,
      events: [],
      contact: null,
      query: null,
    },
    phase = (effectPriorByte(n, 70) << 24) >> 24,
    audio = (channel: 0x29 | 0x54) =>
      out.events.push({
        type: "audio",
        channel,
        mode: 2,
        parameter: 255,
        volume: 127,
        ratePercent: 100,
      }),
    stop = (channel: 0x29 | 0x54) =>
      out.events.push({ type: "stop-if-playing", channel, mode: 4 });
  if (phase === 0) {
    audio(0x54);
    if (((c.frame + word(n, 15)) & 3) === 3) {
      if (!c.nearestTarget)
        throw new Error("Source reward4F7C0 target query is required");
      out.query = rewardQuery(n, rng);
      const target = c.nearestTarget(n, out.query);
      if (
        target &&
        rewardTargetDistance(n, target) <= 65536 &&
        eligible(target, c)
      ) {
        out.contact = target.id;
        out.events.push({
          type: "adjust-audio",
          channel: 0x54,
          ratePercent: 500,
          parameter: 255,
        });
        audio(0x29);
        n[70] = 1;
        feedback(target, c, rng);
        if (target.kind === 3) {
          const b = target.blueprint;
          b.skill = Math.min(
            c.skillCaps[b.style],
            ((b.skill << 24) >> 24) + 25 + (nextRandom(rng) % 20),
          );
          b.maxHealth = Math.min(
            c.healthCaps[b.style],
            ((b.maxHealth << 24) >> 24) + 25 + (nextRandom(rng) % 20),
          );
          b.health = b.maxHealth;
          out.events.push({
            type: "specialist-improved",
            target: target.id,
            skill: b.skill,
            health: b.maxHealth,
          });
          if (target.owner === c.selectedPlayer)
            out.events.push({ type: "selected-player-cue", cue: 0x3a });
        } else {
          const raw = c.players[target.owner].raw,
            species = (effectPriorByte(target.native, 0x7a) << 24) >> 24;
          raw[0x6c7 + species] = (raw[0x6c7 + species] + 1) & 255;
          putEffectWord(target.native, 0x68, word(target.native, 0x62));
          putEffectWord(target.native, 0x6a, word(target.native, 0x64));
          out.events.push({
            type: "creature-researched",
            target: target.id,
            species,
            level: raw[0x6c7 + species],
          });
          if (
            effectPriorByte(target.native, 0x61) & 4 ||
            raw[0x6c7 + species] >= 1
          )
            out.events.push({
              type: "research-message",
              target: target.id,
              variant: 0,
            });
          if (target.owner === c.selectedPlayer)
            out.events.push({ type: "selected-player-cue", cue: 0x3b });
        }
      }
    }
  } else if (phase < 0) {
    audio(0x29);
    const timer = wrap(word(n, 74) - 1);
    putEffectWord(n, 74, timer);
    if (timer <= 0) {
      stop(0x29);
      putEffectWord(n, 74, 0);
      n[70] = 0;
    }
  } else {
    const timer = wrap(word(n, 74) + 1);
    putEffectWord(n, 74, timer);
    if (timer >= effectPriorByte(n, 76)) {
      stop(0x29);
      stop(0x54);
      out.retirementRequired = true;
      n[70] = 0;
    }
  }
  if ((effectPriorByte(n, 70) << 24) >> 24) {
    if (!c.particle)
      throw new Error("Source reward shared particle factory is required");
    const speed = 320 + (nextRandom(rng) % 20) * 64,
      pitch = nextRandom(rng) % 200,
      yaw = (nextRandom(rng) % 128) * 16;
    if (
      c.particle(
        {
          code: 6,
          owner: 0,
          position: [word(n, 7), word(n, 9)],
          height: dword(n, 39),
          angles: [yaw, pitch, speed],
          newborn: true,
        },
        rng,
      )
    )
      out.newborns++;
  }
  return out;
}

