/** Source814A0 numeric production input handler. Producer admission and birth
 * callbacks are separate families; this handler has no human/readiness gates. */
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPutDword,
  aiPutWord,
  aiSWord,
  type StrategicNative,
} from "./strategic-ai-state";
export interface GenepodCommandState {
  players: number[][];
  buildings: StrategicNative[];
}
export interface GenepodCommandContext {
  /** Actual25 rows,45 bytes each. Signed cost is the dword at row+32. */
  speciesTraits: readonly (readonly number[])[];
  /** Complete presentation-only21D70 condition, resolved by an actual UI host.
   * Omission leaves the refresh request false and does not alter gameplay. */
  panelRefreshEligible?: boolean;
}
export interface GenepodInputReceipt {
  routine: 0x814a0;
  player: number;
  building: number;
  species: number;
  parameter: number;
  disposition: "started" | "cancelled";
  cost: number;
  shift: number;
  remaining: number;
  /** Source remainder cost&((1<<grade)-1); it may be signed after32-bit wrap. */
  partialPayment: number;
  refund: number;
  computerRefilled: boolean;
  capacityCapped: boolean;
  panelRefreshRequested: boolean;
}
/** The actual11-byte opcode12 packet. Bytes6..9 are not initialized by36920;
 * their explicit nulls never become guessed zeroes or handler inputs. */
export function genepodCommandPacket(
  species: number,
  building: number,
  parameter: number,
): (number | null)[] {
  if (![species, building, parameter].every((v) => aiInteger(v, -32768, 32767)))
    throw Error("Actual signed Genepod command words required");
  const packet: (number | null)[] = Array(11).fill(null);
  aiPutWord(packet, 0, species);
  aiPutWord(packet, 2, building);
  aiPutWord(packet, 4, parameter);
  packet[10] = 12;
  return packet;
}
function selected(s: GenepodCommandState, player: number, building: number) {
  if (
    !aiInteger(player, 0, 3) ||
    s.players.length !== 4 ||
    !aiInteger(building, 0, 255) ||
    s.buildings.length !== 256
  )
    throw Error("Actual Genepod command player/building extent required");
  const p = s.players[player],
    n = s.buildings[building];
  if (
    !p ||
    p.length !== 1805 ||
    !n ||
    n.length !== 67 ||
    n.slice(31, 39).some((v) => v !== null)
  )
    throw Error("Actual Genepod command retained player/native image required");
  return { p, n };
}
/** Mutates only existing numeric images. Invoke inside the complete caller's
 * transaction. Unknown fields are read lazily and untouched fields retained.
 * Only packet words0/2/4 are consumed, as in814A0 itself. */
export function applyStagedGenepodCommand(
  s: GenepodCommandState,
  player: number,
  packet: readonly (number | null)[],
  c: GenepodCommandContext,
): GenepodInputReceipt {
  if (!Array.isArray(packet) || packet.length < 6)
    throw Error("Actual Genepod command packet required");
  const species = aiSWord(packet, 0),
    building = aiSWord(packet, 2),
    parameter = aiSWord(packet, 4),
    { p, n } = selected(s, player, building),
    row = c.speciesTraits[species];
  if (
    c.speciesTraits.length !== 25 ||
    !aiInteger(species, 0, 24) ||
    !row ||
    row.length !== 45
  )
    throw Error("Actual admitted Genepod species cost row required");
  const cost = aiDword(row, 32) | 0,
    shift = aiByte(n, 46) & 31,
    scale = 1 << shift,
    partial = (cost & ((scale - 1) | 0)) | 0,
    out: GenepodInputReceipt = {
      routine: 0x814a0,
      player,
      building,
      species,
      parameter,
      disposition: parameter ? "started" : "cancelled",
      cost,
      shift,
      remaining: 0,
      partialPayment: parameter ? partial : 0,
      refund: 0,
      computerRefilled: false,
      capacityCapped: false,
      panelRefreshRequested: false,
    };
  if (parameter) {
    const work = cost >> shift;
    aiPutDword(n, 54, work);
    aiPutWord(n, 52, work);
    n[51] = species & 255;
    const excess = (partial - (aiDword(p, 0x4a3) | 0)) | 0;
    if (excess > 0) {
      aiPutDword(p, 0x4a3, 0);
      aiPutDword(p, 0x4a7, -((excess - (aiDword(p, 0x4a7) | 0)) | 0) | 0);
    } else aiPutDword(p, 0x4a3, -excess | 0);
    const subowner = aiByte(p, 0x4a1),
      identity = s.players[subowner];
    if (!identity || identity.length !== 1805)
      throw Error("Actual Genepod construction subowner required");
    if (
      aiByte(identity, 2) &&
      (((aiDword(p, 0x4a3) | 0) + (aiDword(p, 0x4a7) | 0)) | 0) <= 1000
    ) {
      aiPutDword(p, 0x4a7, 1000);
      out.computerRefilled = true;
    }
    out.panelRefreshRequested = c.panelRefreshEligible === true;
  } else {
    const paid = (aiSWord(n, 52) - (aiDword(n, 54) | 0)) | 0,
      refund = (partial + Math.imul(paid, scale)) | 0,
      old = aiDword(p, 0x4a7) | 0,
      sum = (old + refund) | 0,
      cap = aiDword(p, 0x5e6) | 0;
    out.refund = refund;
    if (sum >>> 0 < cap >>> 0) aiPutDword(p, 0x4a7, sum);
    else {
      aiPutDword(p, 0x4a7, cap);
      out.capacityCapped = true;
      aiPutDword(
        p,
        0x4a3,
        ((aiDword(p, 0x4a3) | 0) + ((refund - ((cap - old) | 0)) | 0)) | 0,
      );
    }
    aiPutDword(n, 54, 0);
  }
  if (!aiByte(p, 2)) n[58] = aiByte(p, 1);
  out.remaining = aiDword(n, 54) | 0;
  return out;
}
/** Independent atomic numeric wrapper. The staged campaign adapter uses the
 * in-place entry so its caller's native/player/RNG identities remain held. */
export function applyGenepodCommand<T extends GenepodCommandState>(
  before: T,
  player: number,
  packet: readonly (number | null)[],
  c: GenepodCommandContext,
): { state: T; receipt: GenepodInputReceipt } {
  const state = {
    ...before,
    players: before.players.map((p) => p.slice()),
    buildings: before.buildings.map((n) => n.slice()),
  } as T;
  return {
    state,
    receipt: applyStagedGenepodCommand(state, player, packet, c),
  };
}
