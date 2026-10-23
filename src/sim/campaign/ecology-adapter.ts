import type { EcologyState } from "../mechanics/ecology";
import type { TerrainState } from "../mechanics/terrain";
import type { SpatialState } from "./spatial";
import { unlinkSpatial } from "./spatial";
import { cleanupCampaignReferences, type CleanupWorld } from "./cleanup";
import { put16 } from "./bytes";

/** Dynamic plant factories/feeding finish before later source callbacks read
 * level3552/player5FA. The global count tracks the pool; owner5FA is a retained
 * source counter.451F0 recycling does not decrement it, unlike6C780 retirement. */
export function synchronizeCampaignPlantCounts(w: {
  ecology: EcologyState;
  missionPrefix: number[];
  players: { raw: number[] }[];
}): void {
  if (w.ecology.plantCount !== w.ecology.plants.filter((p) => p.active).length)
    throw new Error("Current ecology plant count differs from active pool");
  for (let owner = 0; owner < 4; owner++) {
    const count = w.ecology.ownerPlantCounts[owner];
    if (!Number.isInteger(count) || count < 0 || count > 65535)
      throw new Error("Current source owned plant counter is invalid");
  }
  put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
  for (let owner = 0; owner < 4; owner++) {
    const count = w.ecology.ownerPlantCounts[owner];
    put16(w.players[owner].raw, 0x5fa, count);
  }
}

/** Plant damage can retire a slot inside a creature callback, before the
 * scheduled plant pass. Unlink and clear references before any later callback
 * can reuse that first-free slot. Birth binding requests stay with that pass. */
export function flushEatenPlantRetirements(
  w: CleanupWorld & {
    ecology: EcologyState;
    terrain: TerrainState;
    spatial: SpatialState;
  },
): number {
  let retired = 0;
  w.ecology.pending = w.ecology.pending.filter((event) => {
    if (event.kind !== "cleanup-required") return true;
    const [, family, index] = event.id.split(":").map(Number);
    if (family !== 1 || w.ecology.plants[index]?.active !== false) return true;
    if (w.spatial.nodes[event.id])
      unlinkSpatial(w.spatial, w.terrain, event.id);
    cleanupCampaignReferences(w, event.id);
    retired++;
    return false;
  });
  return retired;
}
