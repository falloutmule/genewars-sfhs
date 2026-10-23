/** Serializable source AI storage. Native pointers are represented by null and
 * specialist blueprint links are explicit logical bindings. No pool is made
 * active, initialized or strategically ready by copying its source image. */
import type { GeneRng } from "./random";

export type StrategicNative = (number | null)[];
export interface StrategicSpecialist {
  native: StrategicNative;
  blueprint: { player: number; index: number } | null;
}
export interface StrategicAIState {
  schemaVersion: 1;
  /** Four exact source1831BC images, each with sizeword1726 and owner byte4. */
  records: number[][];
  players: number[][];
  /** Global native indices:300 creatures,256 buildings and20 specialists. */
  creatures: StrategicNative[];
  buildings: StrategicNative[];
  specialists: StrategicSpecialist[];
  /** Actual184D7C two-byte creature control images. A null prior remains
   * unknown and is rejected when consumed; no zeroed control image is invented. */
  creatureControl: (number | null)[];
  missionPrefix: number[];
  rng: GeneRng;
}
export interface StrategicAIContext {
  frame: number;
  flags: number;
  runtimeMode: number;
  activePlayerCount: number;
  selectedPlayer: number;
  /** Actual six numeric bytes at object3+79D4. */
  groupLimits: readonly number[];
  /** Source virtual68, evaluated only for an active creature. */
  creatureProtected(state: StrategicAIState, index: number): boolean;
}
export interface StrategicAIEvent {
  routine: number;
  player: number;
  kind: string;
  index?: number;
}
export const aiInteger = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
export function aiByte(n: readonly (number | null)[], p: number): number {
  const v = n[p];
  if (typeof v !== "number" || !aiInteger(v, 0, 255))
    throw Error(`Uninitialized strategic numeric byte${p}`);
  return v;
}
export const aiSByte = (n: readonly (number | null)[], p: number) =>
  (aiByte(n, p) << 24) >> 24;
export const aiWord = (n: readonly (number | null)[], p: number) =>
  aiByte(n, p) | (aiByte(n, p + 1) << 8);
export const aiSWord = (n: readonly (number | null)[], p: number) =>
  (aiWord(n, p) << 16) >> 16;
export const aiDword = (n: readonly (number | null)[], p: number) =>
  (aiWord(n, p) | (aiWord(n, p + 2) << 16)) >>> 0;
export function aiPutWord(n: (number | null)[], p: number, v: number): void {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
}
export function aiPutDword(n: (number | null)[], p: number, v: number): void {
  aiPutWord(n, p, v);
  aiPutWord(n, p + 2, v >>> 16);
}
export const aiPoint = (
  n: readonly (number | null)[],
  p: number,
): [number, number] => [aiSWord(n, p), aiSWord(n, p + 2)];
export function aiDistance(a: readonly number[], b: readonly number[]): number {
  //73690 doubles coordinates, subtracts in16 bits, then arithmetic-shifts1.
  // This is the source32768-coordinate wrap, including its half-world tie.
  const x = ((a[0] - b[0]) << 17) >> 17,
    y = ((a[1] - b[1]) << 17) >> 17;
  return (Math.imul(x, x) + Math.imul(y, y)) >>> 0;
}
export function aiAssertBytes(
  n: readonly number[],
  size: number,
  label: string,
): void {
  if (
    !Array.isArray(n) ||
    n.length !== size ||
    n.some((v) => !aiInteger(v, 0, 255))
  )
    throw Error(`Actual strategic ${label} extent required`);
}
export function validateStrategicAIState(s: StrategicAIState): void {
  if (
    s.schemaVersion !== 1 ||
    s.records.length !== 4 ||
    s.players.length !== 4 ||
    s.creatures.length !== 300 ||
    s.buildings.length !== 256 ||
    s.specialists.length !== 20 ||
    s.creatureControl.length !== 600
  )
    throw Error("Actual strategic AI/player/native pool extents required");
  for (let p = 0; p < 4; p++) {
    aiAssertBytes(s.records[p], 1726, "AI record");
    aiAssertBytes(s.players[p], 1805, "player record");
    if (
      aiDword(s.records[p], 0) !== 1726 ||
      s.records[p][4] !== p ||
      s.players[p][1] !== p
    )
      throw Error("Strategic AI/player identity differs");
  }
  for (const [rows, size] of [
    [s.creatures, 124],
    [s.buildings, 67],
  ] as const)
    for (const row of rows)
      if (
        row.length !== size ||
        row.some((v) => v !== null && !aiInteger(v, 0, 255)) ||
        row.slice(31, 39).some((v) => v !== null)
      )
        throw Error("Actual strategic native image required");
  for (const row of s.specialists)
    if (
      row.native.length !== 200 ||
      row.native.some((v) => v !== null && !aiInteger(v, 0, 255)) ||
      row.native.slice(31, 39).some((v) => v !== null) ||
      row.native.slice(192, 200).some((v) => v !== null)
    )
      throw Error("Actual strategic specialist image required");
  if (s.creatureControl.some((v) => v !== null && !aiInteger(v, 0, 255)))
    throw Error("Actual strategic creature control image required");
  aiAssertBytes(s.missionPrefix, 0x355e, "mission prefix");
  if (
    !aiInteger(s.rng.seed, 0, 65535) ||
    !aiInteger(s.rng.draws, 0, 0xffffffff) ||
    (s.rng.ring !== null && !aiInteger(s.rng.ring, 0, 31))
  )
    throw Error("Actual strategic RNG required");
}
export function validateStrategicAIContext(c: StrategicAIContext): void {
  if (
    !aiInteger(c.frame, 0, 0xffffffff) ||
    !aiInteger(c.flags, 0, 255) ||
    !aiInteger(c.runtimeMode, 0, 255) ||
    !aiInteger(c.activePlayerCount, 0, 4) ||
    !aiInteger(c.selectedPlayer, 0, 3) ||
    c.groupLimits.length !== 6 ||
    c.groupLimits.some((v) => !aiInteger(v, 0, 255)) ||
    typeof c.creatureProtected !== "function"
  )
    throw Error("Actual strategic scheduler/profile context required");
}
export function strategicBlueprint(
  s: StrategicAIState,
  slot: number,
): number[] {
  const unit = s.specialists[slot],
    binding = unit?.blueprint;
  if (
    !binding ||
    !aiInteger(binding.player, 0, 3) ||
    !aiInteger(binding.index, 0, 31)
  )
    throw Error(
      `Actual strategic specialist${slot} blueprint binding required`,
    );
  if (aiByte(unit.native, 24) !== binding.player)
    throw Error("Strategic specialist blueprint owner differs");
  return s.players[binding.player].slice(
    0x16 + binding.index * 36,
    0x16 + (binding.index + 1) * 36,
  );
}
/**72E50 clears group links and high control bits, preserving the actual low3.
 * Its input is a retained constructor/control image, never a synthesized zero. */
export function resetStrategicCreatureControl(
  prior: readonly number[],
): number[] {
  aiAssertBytes(prior, 600, "creature control prior");
  const result = prior.slice();
  for (let i = 0; i < 300; i++) {
    result[i * 2] &= 7;
    result[i * 2 + 1] = 255;
  }
  return result;
}
export function cloneStrategicAIState(s: StrategicAIState): StrategicAIState {
  return {
    ...s,
    records: s.records.map((r) => r.slice()),
    players: s.players.map((r) => r.slice()),
    creatures: s.creatures.map((r) => r.slice()),
    buildings: s.buildings.map((r) => r.slice()),
    specialists: s.specialists.map((r) => ({
      native: r.native.slice(),
      blueprint: r.blueprint && { ...r.blueprint },
    })),
    creatureControl: s.creatureControl.slice(),
    missionPrefix: s.missionPrefix.slice(),
    rng: { ...s.rng },
  };
}
