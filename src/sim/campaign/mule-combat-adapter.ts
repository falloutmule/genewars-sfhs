import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { MuleCombatEffectRequest } from "../mechanics/mule-combat";
import type { EcologyState } from "../mechanics/ecology";
import { groundHeight, type TerrainState } from "../mechanics/terrain";
import type { GeneRng } from "../mechanics/random";
import { consumeStagedMuleEffects } from "./mule-effects";
import { cleanupCampaignReferences } from "./cleanup";
import { put16 } from "./bytes";
import { moveSpatial } from "./spatial";
import { synchronizeCampaignLinks } from "./entity-view";
import type { EcologyMule } from "../mechanics/ecology";

/** Lazily isolates extra host roots when a creature callback emits blood.
 * Core-held native arrays stay identical across the immediate factory call.
 * Only a successful complete creature callback may commit this transaction. */
export function createMuleCombatTransaction(
  world: CampaignWorld,
  pack: Pack,
  cloneHost: (world: CampaignWorld) => CampaignWorld = structuredClone,
) {
  let staged: CampaignWorld | null = null;
  const host = (
    state: EcologyState,
    terrain: TerrainState,
    rng: GeneRng,
  ): CampaignWorld => {
    staged ??= cloneHost(world);
    staged.ecology = state;
    staged.terrain = terrain;
    staged.rng = rng;
    for (const m of state.mules) staged.creatureNative[m.index] = m.native;
    return staged;
  };
  return {
    current: () => staged ?? world,
    host,
    relocate(
      state: EcologyState,
      terrain: TerrainState,
      rng: GeneRng,
      mule: EcologyMule,
      _oldCell: number,
      newCell: number,
    ): void {
      staged = host(state, terrain, rng);
      moveSpatial(staged.spatial, terrain, mule.id, newCell);
      synchronizeCampaignLinks(staged);
    },
    effect(
      state: EcologyState,
      terrain: TerrainState,
      rng: GeneRng,
      request: MuleCombatEffectRequest,
    ): void {
      staged = host(state, terrain, rng);
      put16(
        staged.missionPrefix,
        0x3554,
        staged.powerEffects.slots.filter((e) => e.occupied).length,
      );
      consumeStagedMuleEffects(
        staged,
        [
          {
            kind: "mule-effect",
            id: request.source,
            code: 32,
            position: request.position,
            height:
              request.height ?? groundHeight(terrain, ...request.position),
            angles: request.angles,
          },
        ],
        pack,
        {
          cleanupReferences: cleanupCampaignReferences,
          priority: (code) => pack.effectRules?.descriptors[code]?.priority,
        },
      );
    },
    commit(): void {
      if (!staged) return;
      // The numeric callback has now committed these three roots itself.
      staged.ecology = world.ecology;
      staged.terrain = world.terrain;
      staged.rng = world.rng;
      Object.assign(world, staged);
      for (const m of world.ecology.mules)
        world.creatureNative[m.index] = m.native;
    },
  };
}
