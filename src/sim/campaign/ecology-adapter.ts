import type { EcologyState } from "../mechanics/ecology";
import type { TerrainState } from "../mechanics/terrain";
import type { SpatialState } from "./spatial";
import { unlinkSpatial } from "./spatial";
import { cleanupCampaignReferences, type CleanupWorld } from "./cleanup";

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
