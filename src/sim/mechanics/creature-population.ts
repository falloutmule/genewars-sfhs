/**6A540 clears active players'616 totals, then counts each living, unflagged
 *owned creature immediately before its callback. Corpses and deferred records
 *do not contribute. These are source counters, not a victory override. */
import { put32, u32 } from "../campaign/bytes";

export function resetCreaturePopulation(players: readonly number[][], active: number): void {
  if (!Number.isInteger(active) || active < 0 || active > players.length || active > 4)
    throw Error("Actual active player count required for creature population");
  for (let owner = 0; owner < active; owner++) put32(players[owner], 0x616, 0);
}

export function countCreatureBeforeCallback(
  players: readonly number[][], native: readonly (number | null)[],
): void {
  if (!native[6] || native[21]! & 1 || native[94]! >= 24 || native[24] === 4) return;
  const owner = native[24];
  if (!Number.isInteger(owner) || owner! < 0 || owner! >= players.length || owner! > 3)
    throw Error("Actual creature population owner required");
  put32(players[owner!], 0x616, u32(players[owner!], 0x616) + 1);
}
