/** Immediate 6C4B0/80780 and 6C780 boundaries inside the plant scheduler. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  stepPlants,
  type EcologyState,
  type EcologyStepResult,
} from "../mechanics/ecology";
import type { GeneRng } from "../mechanics/random";
import { worldCell, type TerrainState } from "../mechanics/terrain";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import { applyCampaignBotanistEconomy } from "./botanist-adapter";
import { synchronizeCampaignPlantCounts } from "./ecology-adapter";
import { cleanupCampaignReferences } from "./cleanup";
import { insertSpatial, unlinkSpatial } from "./spatial";
import { synchronizeCampaignLinks } from "./entity-view";
import { put16 } from "./bytes";

function validateCounts(state: EcologyState) {
  if (state.plantCount !== state.plants.filter((p) => p.active).length)
    throw Error("Current ecology plant count differs from active pool");
  if (
    state.ownerPlantCounts.length !== 4 ||
    state.ownerPlantCounts.some(
      (n) => !Number.isInteger(n) || n < 0 || n > 65535,
    )
  )
    throw Error("Current source owned plant counter is invalid");
}

/** The core isolates ecology/map/RNG even on quiet passes. Extra roots are
 * cloned only at the first actual birth/retirement, then stay current across
 * every following inline factory, replacement cleanup and plant callback.
 * This is the complete plant pass; callers must not repeat buffered events. */
export function stepCampaignPlants(
  world: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): EcologyStepResult {
  if (!pack.ecologyRules)
    return {
      committed: false,
      events: [],
      callbacks: [],
      reason: "Original plant ecology rule profile is required",
    };
  try {
    validateCounts(world.ecology);
    if (
      world.players.length !== 4 ||
      world.players.some((p) => p.raw.length !== 1805) ||
      world.missionPrefix.length !== 0x355e
    )
      throw Error("Original plant player/prefix storage is required");
  } catch (error) {
    return {
      committed: false,
      events: [],
      callbacks: [],
      reason: String(error instanceof Error ? error.message : error),
    };
  }
  let staged: CampaignWorld | null = null;
  const host = (
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
  ): CampaignWorld => {
    staged ??= structuredClone(world);
    staged.ecology = state;
    staged.terrain = terrain;
    staged.rng = rng;
    //724C0 and recursive effects see the current numeric callback image.
    for (const mule of state.mules)
      staged.creatureNative[mule.index] = mule.native;
    return staged;
  };
  const result = stepPlants(
    world.ecology,
    world.terrain,
    world.rng,
    pack.ecologyRules,
    world.source.source.terrain.rawWaterHeight,
    {
      publishBirth(state, terrain, rng, child) {
        const w = host(state, terrain, rng);
        insertSpatial(
          w.spatial,
          terrain,
          child.id,
          worldCell(...child.position),
        );
        synchronizeCampaignLinks(w);
      },
      creditBirth(state, terrain, rng, child) {
        const w = host(state, terrain, rng);
        synchronizeCampaignPlantCounts(w);
        applyCampaignBotanistEconomy(w, pack, child.id, "credit", 1, services);
      },
      unlinkRetiring(state, terrain, rng, plant) {
        const w = host(state, terrain, rng);
        unlinkSpatial(w.spatial, terrain, plant.id);
        synchronizeCampaignLinks(w);
      },
      cleanupRetiring(state, terrain, rng, plant) {
        const w = host(state, terrain, rng);
        //Owner5FA has already decremented; native kind/global count are still
        //the old active values at the source724C0 call.
        synchronizeCampaignPlantCounts(w);
        cleanupCampaignReferences(w, plant.id);
      },
      completeRetirement(state, terrain, rng) {
        synchronizeCampaignPlantCounts(host(state, terrain, rng));
      },
      validateCommit: validateCounts,
    },
  );
  if (!result.committed) return result;
  if (staged) {
    //The core has now committed its three isolated roots itself.
    const extra = staged as CampaignWorld;
    extra.ecology = world.ecology;
    extra.terrain = world.terrain;
    extra.rng = world.rng;
    Object.assign(world, extra);
  }
  for (const mule of world.ecology.mules)
    world.creatureNative[mule.index] = mule.native;
  world.ecology.pending = world.ecology.pending.filter(
    (e) => e.kind !== "cleanup-required",
  );
  synchronizeCampaignPlantCounts(world);
  put16(world.missionPrefix, 0x355a, world.ecology.plantCursor);
  return result;
}
