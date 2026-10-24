/**48790 carrier67/0x43, retained-resource68/0x44 and4B1D0 plant drop. */
import { createMotion, velocity, wrap16, type MotionTables } from "./motion";
import { groundHeight, type TerrainState } from "./terrain";
import type { AnimationProfile } from "./animation";
import type { GeneRng } from "./random";
import {
  effectFactoryPrior,
  effectPriorByte as byte,
  effectTerrainShade,
  putEffectWord as put,
  validateEffectNativePrior,
  type EffectNativePrior,
} from "./power-motion";
import {
  stepSharedFreeEffectMotion,
  type SharedFreeEffectMotionContext,
  type DestructionStep,
} from "./destruction-effect";
import type { EngineerChargeDescriptor } from "./engineer-charge";

type Native = (number | null)[];
const word = (n: readonly (number | null)[], p: number) =>
  wrap16(byte(n, p) | (byte(n, p + 1) << 8));
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);

export interface MulePlantCarrierRequest {
  position: [number, number];
  height: number;
  angles: [number, number, number];
  owner: 0;
  parameter: 0;
  delay: 0;
}
export function validatePlantCarrierDescriptor(
  d: EngineerChargeDescriptor | undefined,
  code: 67 | 68,
): void {
  if (
    !d ||
    d.code !== code ||
    d.retirementMode !== 5 ||
    !d.gravity ||
    d.priority !== 1 ||
    d.childCode !== null ||
    !d.movable ||
    !d.waterResponse
  )
    throw Error("Original plant carrier67/68 descriptor required");
}
/**After actual successful allocation.5D1C0 supplies the plant reference later;
 * common48790 retains71..73/76, fractions and counter. No RNG or newborn mark. */
export function makeMulePlantCarrier(
  prior: readonly (number | null)[],
  slot: number,
  q: MulePlantCarrierRequest,
  terrain: TerrainState,
  tables: MotionTables,
  profile: AnimationProfile,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  if (
    byte(prior, 6) !== 0 ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= 200 ||
    q.owner !== 0 ||
    q.parameter !== 0 ||
    q.delay !== 0 ||
    q.position.length !== 2 ||
    q.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    q.angles.length !== 3 ||
    q.angles.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(q.height) ||
    q.height < -2147483648 ||
    q.height > 2147483647 ||
    tables.atan.length !== 257 ||
    tables.sine.length !== 2048 ||
    tables.cosine.length !== 2048 ||
    profile.flags !== 0 ||
    profile.holds.length !== 1 ||
    profile.holds[0] !== 0 ||
    profile.last !== profile.first
  )
    throw Error("Actual carrier67 factory input/EFF67 resource required");
  const m = createMotion(0, 0, 0, 0);
  [m.yaw, m.pitch, m.speed] = q.angles;
  velocity(m, tables);
  const n = effectFactoryPrior(prior, {
    slot,
    code: 67,
    owner: 0,
    x: q.position[0],
    y: q.position[1],
    height: q.height,
    ground: groundHeight(terrain, ...q.position),
    shade: effectTerrainShade(terrain, ...q.position),
    vx: m.vx,
    vy: m.vy,
    vz: m.vz,
    accelerationZ: 0,
    yaw: q.angles[0],
    pitch: q.angles[1],
    speed: q.angles[2],
    delay: 0,
  });
  put(n, 21, 0x180);
  return n;
}
export interface PlantCarrierContext extends SharedFreeEffectMotionContext {
  /**Publish the completed6DF30 pose/links before the selector-specific query. */
  publishMotion(native: EffectNativePrior): void;
  /**Direct retained kind2 slot resolution, as6D390/4B1D0 do; no query/sort. */
  plant(index: number): Native;
  /**Actual74160(point,0), lazily required only by the drop branch. */
  footprintBuilding?(
    position: [number, number],
  ): { selector: number; position: [number, number] } | null;
  /**Actual10457C signed pair, shared with corpse unloading. */
  depositOffset?: readonly [number, number];
  /**8AC60 prepend of this SAME plant record, not a replacement/factory. */
  relinkPlant?(index: number, plant: Native): void;
}
export interface PlantCarrierUpdate extends DestructionStep {
  droppedPlant: number | null;
}
function resolvePlant(
  n: Native,
  c: PlantCarrierContext,
): [number, Native] | null {
  if (byte(n, 73) !== 2) return null;
  const index = word(n, 71);
  if (index < 0 || index >= 512)
    throw Error("Plant carrier retained slot is outside pool");
  const p = c.plant(index);
  if (p.length !== 49 || word(p, 15) !== index)
    throw Error("Plant carrier actual retained plant identity required");
  return [index, p];
}
/**4B1D0. A null map pointer permits the same source numeric drop without
 * insertion.67 retires;68 marks phase1 and retires on its NEXT callback. */
export function dropPlantCarrier(
  n: EffectNativePrior,
  c: PlantCarrierContext,
  relink: boolean,
): { plant: number | null; retirementRequired: boolean } {
  const resolved = resolvePlant(n, c);
  if (!resolved) return { plant: null, retirementRequired: false };
  const [index, p] = resolved;
  if (!c.footprintBuilding)
    throw Error("Plant drop actual74160 service required");
  p[46] = byte(p, 46) & 0xeb;
  put(p, 7, word(n, 7));
  put(p, 9, word(n, 9));
  const b = c.footprintBuilding([word(p, 7), word(p, 9)]);
  if (b && (b.selector === 2 || b.selector === 4)) {
    const offset = c.depositOffset;
    if (
      !offset ||
      offset.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
    )
      throw Error("Plant drop admitted10457C offset required");
    if (
      wrap16(word(p, 7) & 0xff00) === wrap16(b.position[0] + offset[0]) &&
      wrap16(word(p, 9) & 0xff00) === wrap16(b.position[1] + offset[1])
    )
      p[46] = byte(p, 46) | 4;
  }
  if (relink) {
    if (!c.relinkPlant) throw Error("Plant drop actual8AC60 relink required");
    c.relinkPlant(index, p);
  }
  if (byte(n, 69) === 68) n[70] = 1;
  return { plant: index, retirementRequired: byte(n, 69) === 67 };
}
/**Full numeric6DF30 followed by mode5 selector dispatch. No timer/ANB reads,
 * no EFF68 lookup and no source draw. Physics may call real water factories. */
export function stepPlantCarrierRecord(
  before: readonly (number | null)[],
  rng: GeneRng,
  c: PlantCarrierContext,
): PlantCarrierUpdate {
  validateEffectNativePrior(before);
  const code = byte(before, 69);
  if (code !== 67 && code !== 68)
    throw Error("Actual plant carrier67/68 callback required");
  const flags = word(before, 21) & ~1;
  if (flags !== 0x180 && (code !== 67 || flags !== 0x1a0))
    throw Error("Unsupported original plant carrier flags");
  const result = stepSharedFreeEffectMotion(before, rng, c, {
      movable: true,
      waterResponse: true,
    }),
    out: PlantCarrierUpdate = { ...result, droppedPlant: null },
    n = result.native;
  c.publishMotion(n);
  if (code === 67) {
    const p = resolvePlant(n, c);
    if (!p)
      throw Error("Source67 shade write requires its retained kind2 plant");
    p[1][23] = byte(n, 23);
  } else if (byte(n, 70) !== 0) out.retirementRequired = true;
  else if (word(n, 61) <= 256 && dword(n, 39) <= dword(n, 17)) {
    const drop = dropPlantCarrier(n, c, true);
    out.droppedPlant = drop.plant;
    out.retirementRequired = drop.retirementRequired;
  }
  return out;
}
