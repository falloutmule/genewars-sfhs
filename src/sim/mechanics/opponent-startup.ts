/** Source71B70 AI payload and7D090 campaign opponent entry.
 * Strategic37870 is a distinct required family; this module does not run it. */
import {
  generateBlueprints,
  type Blueprint,
  type BlueprintRules,
} from "./blueprints";
import type { GeneRng } from "./random";

export const OPPONENT_AI_RECORD_BYTES = 0x6be;
export const OPPONENT_AI_PLAYERS = 4;
export interface OpponentStartupAIRecord {
  player: number;
  /** Exact retained source image; consumed numeric fields are named below.
   * Unreviewed fields do not become initialized strategic orders by copying. */
  raw: number[];
  levelAdjustment: number;
}
export interface OpponentStartupAI {
  schemaVersion: 1;
  records: OpponentStartupAIRecord[];
  strategicAI: "unimplemented";
}
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
function bytes(n: readonly number[], length: number, label: string): void {
  if (
    !Array.isArray(n) ||
    n.length !== length ||
    n.some((v) => !integer(v, 0, 255))
  )
    throw Error(`Actual ${label} byte extent required`);
}
const signed = (n: number) => (n << 24) >> 24;
const dword = (n: readonly number[], p: number) =>
  (n[p] | (n[p + 1] << 8) | (n[p + 2] << 16) | (n[p + 3] << 24)) >>> 0;
const put = (n: number[], p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
function validateAIRecord(
  record: OpponentStartupAIRecord,
  player: number,
): void {
  if (!record || record.player !== player)
    throw Error("Opponent AI record owner differs");
  bytes(record.raw, OPPONENT_AI_RECORD_BYTES, "opponent AI record");
  if (
    dword(record.raw, 0) !== OPPONENT_AI_RECORD_BYTES ||
    record.raw[4] !== player ||
    record.levelAdjustment !== signed(record.raw[0x646])
  )
    throw Error("Opponent AI record header/owner/level differs");
}
/**71B70 copies tag+payload into1831BC..184CB4 as four contiguous1726-byte
 * records. The importer exposes the following6900 bytes, excluding FIRST
 * sizeword only. Later sizewords remain in that payload, not separate tags. */
export function loadOpponentStartupAI(
  extensionPayload: readonly number[],
): OpponentStartupAI {
  bytes(
    extensionPayload,
    OPPONENT_AI_RECORD_BYTES * 4 - 4,
    "CONQ opponent extension",
  );
  const raw = [0xbe, 0x06, 0, 0, ...extensionPayload],
    records: OpponentStartupAIRecord[] = [];
  for (let player = 0; player < 4; player++) {
    const row = raw.slice(
        player * OPPONENT_AI_RECORD_BYTES,
        (player + 1) * OPPONENT_AI_RECORD_BYTES,
      ),
      record = { player, raw: row, levelAdjustment: signed(row[0x646]) };
    validateAIRecord(record, player);
    records.push(record);
  }
  return { schemaVersion: 1, records, strategicAI: "unimplemented" };
}
export interface OpponentStartupInput {
  player: number;
  selectedPlayer: number;
  selectedProgress: number;
  activePlayerCount: number;
  target: [number, number];
  /** Actual118770 and118968 values. This entry admits campaign/nonnetwork. */
  flags: number;
  runtimeMode: number;
  aiRecord: OpponentStartupAIRecord;
  names: readonly string[];
  blueprintRules: BlueprintRules;
  rng: GeneRng;
  /** Original7F580 reusable stack18/1B, never guessed from a mission prior.
   * Explicit null keeps that offset unresolved in the returned known projection. */
  blueprintScratch: { byte18: number | null; byte1b: number | null };
}
export interface OpponentStartupPlan {
  player: number;
  /** Known numeric projection. At unresolvedPlayerOffsets the retained source
   * byte is only a placeholder and is not an asserted generated stack value. */
  raw: number[];
  blueprints: Blueprint[];
  rng: GeneRng;
  progress: number;
  funds: 2000;
  levelAdjustment: number;
  unresolvedPlayerOffsets: number[];
  aiRecord: OpponentStartupAIRecord;
  /**7D61D..7D687 never calls801C0/80830. Later AI creates its own units. */
  specialistsCreated: [];
  landingRequired: false;
  strategicAI: "unimplemented";
}
/** Pure7D090 opponent entry, after exact selected-player restoration and all
 * earlier player RNG work. No retained human carry is overlaid on this record.
 * All inputs remain unchanged when any bound or generator validation fails. */
export function prepareOpponentStartup(
  before: readonly number[],
  c: OpponentStartupInput,
): OpponentStartupPlan {
  bytes(before, 1805, "source opponent player");
  if (
    !integer(c.player, 0, 3) ||
    !integer(c.selectedPlayer, 0, 3) ||
    c.player === c.selectedPlayer ||
    !integer(c.activePlayerCount, 1, 4) ||
    c.player >= c.activePlayerCount ||
    c.selectedPlayer >= c.activePlayerCount
  )
    throw Error("Actual active opponent/selected player context required");
  if (
    !integer(c.flags, 0, 255) ||
    !(c.flags & 0x20) ||
    !integer(c.runtimeMode, 0, 255) ||
    c.runtimeMode & 1
  )
    throw Error("Opponent startup requires source campaign/nonnetwork mode");
  if (!integer(c.selectedProgress, 0, 24))
    throw Error("Actual selected campaign progress0..24 required");
  if (
    !Array.isArray(c.target) ||
    c.target.length !== 2 ||
    c.target.some((v) => !integer(v, -32768, 32767))
  )
    throw Error("Actual signed opponent target required");
  if (before[1] !== c.player || before[2] === 0)
    throw Error("Actual source computer-player record required");
  if (before[3] !== 0)
    throw Error(
      "Existing opponent source roster requires its actual specialist binding",
    );
  validateAIRecord(c.aiRecord, c.player);
  if (
    !c.blueprintScratch ||
    [c.blueprintScratch.byte18, c.blueprintScratch.byte1b].some(
      (v) => v !== null && !integer(v, 0, 255),
    )
  )
    throw Error(
      "Explicit original opponent blueprint scratch provenance required",
    );
  // The admitted128-name English table is ASCII. A different encoding needs
  // its exact original byte table instead of truncating Unicode codepoints.
  if (c.names.some((name) => /[^\x01-\x7f]/.test(name)))
    throw Error(
      "Original opponent name bytes require the admitted ASCII table",
    );
  const generated = generateBlueprints(c.names, c.blueprintRules, c.rng, true),
    raw = before.slice(),
    unknown: number[] = [];
  //7D6D8/7D6DE/7D6EB then7D760/7D589 precede regeneration.
  raw[1] = c.player;
  raw[0x6e3] = 0;
  put(raw, 9, c.target[0]);
  put(raw, 11, c.target[1]);
  raw[0x4a3] = 0xd0;
  raw[0x4a4] = 7;
  raw[0x4a5] = raw[0x4a6] = 0;
  for (let index = 0; index < 32; index++) raw[0x16 + index * 36] = 0;
  for (const bp of generated.blueprints) {
    const at = 0x16 + bp.index * 36;
    raw.fill(0, at, at + 21);
    for (let i = 0; i < bp.name.length; i++)
      raw[at + i] = bp.name.charCodeAt(i);
    raw[at + 0x15] = bp.style;
    raw[at + 0x16] = bp.category;
    raw[at + 0x17] = bp.skill;
    raw[at + 0x19] = bp.maxHealth;
    raw[at + 0x1a] = bp.health;
    raw.fill(0, at + 0x1c, at + 0x24);
    bp.unresolved = {
      byte18: c.blueprintScratch.byte18,
      byte1b: c.blueprintScratch.byte1b,
    };
    for (const [offset, value] of [
      [0x18, c.blueprintScratch.byte18],
      [0x1b, c.blueprintScratch.byte1b],
    ] as const) {
      if (value === null) unknown.push(at + offset);
      else raw[at + offset] = value;
    }
  }
  raw[0x15] = 20;
  const delta = c.aiRecord.levelAdjustment,
    sum = c.selectedProgress + delta,
    progress = delta < 0 ? Math.max(0, sum) : Math.min(24, sum);
  raw[0x6e7] = progress & 255;
  return {
    player: c.player,
    raw,
    blueprints: generated.blueprints,
    rng: generated.rng,
    progress,
    funds: 2000,
    levelAdjustment: delta,
    unresolvedPlayerOffsets: unknown,
    aiRecord: { ...c.aiRecord, raw: c.aiRecord.raw.slice() },
    specialistsCreated: [],
    landingRequired: false,
    strategicAI: "unimplemented",
  };
}
export interface OpponentStrategyContext {
  flags: number;
  runtimeMode: number;
  activePlayerCount: number;
}
/** Exact70B00 gates and ascending player selection. It does NOT consume the
 * first37870 timer increment or claim any decision/initializer was performed. */
export function requiredOpponentStrategyPlayers(
  players: readonly (readonly number[])[],
  c: OpponentStrategyContext,
): number[] {
  if (
    players.length !== 4 ||
    !integer(c.activePlayerCount, 0, 4) ||
    !integer(c.flags, 0, 255) ||
    !integer(c.runtimeMode, 0, 255)
  )
    throw Error("Actual opponent strategy scheduler context required");
  if (!(c.flags & 4) || c.runtimeMode & 2) return [];
  const required: number[] = [];
  for (let player = 0; player < c.activePlayerCount; player++) {
    bytes(players[player], 1805, "opponent strategy player");
    if (players[player][1] !== player)
      throw Error("Opponent strategy player order differs");
    if (players[player][2] !== 0) required.push(player);
  }
  return required;
}
/** An unbound strategy pass must stop atomically instead of freezing a loaded
 * opponent. The host binds a concrete37870 family before removing this guard. */
export function assertOpponentStrategyImplemented(
  players: readonly (readonly number[])[],
  c: OpponentStrategyContext,
): void {
  const required = requiredOpponentStrategyPlayers(players, c);
  if (required.length)
    throw Error(
      `Opponent strategicAI37870 is not implemented for players ${required.join(", ")}`,
    );
}
