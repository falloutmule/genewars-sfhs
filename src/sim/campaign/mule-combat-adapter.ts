import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { MuleCombatEffectRequest } from "../mechanics/mule-combat";
import type { EcologyState } from "../mechanics/ecology";
import { groundHeight, type TerrainState } from "../mechanics/terrain";
import type { GeneRng } from "../mechanics/random";
import { consumeMuleEffects } from "./mule-effects";
import { cleanupCampaignReferences } from "./cleanup";
import { put16 } from "./bytes";

/** Lazily isolates extra host roots when a creature callback emits blood.
 * Core-held native arrays stay identical across the immediate factory call.
 * Only a successful complete creature callback may commit this transaction. */
export function createMuleCombatTransaction(world: CampaignWorld, pack: Pack) {
  let staged: CampaignWorld | null = null;
  return {
    current: () => staged ?? world,
    effect(
      state: EcologyState,
      terrain: TerrainState,
      rng: GeneRng,
      request: MuleCombatEffectRequest,
    ): void {
      staged ??= structuredClone(world);
      staged.ecology = state;
      staged.terrain = terrain;
      staged.rng = rng;
      for (const m of state.mules) staged.creatureNative[m.index] = m.native;
      put16(
        staged.missionPrefix,
        0x3554,
        staged.powerEffects.slots.filter((e) => e.occupied).length,
      );
      consumeMuleEffects(
        staged,
        [
          {
            kind: "mule-effect",
            id: request.source,
            code: 32,
            position: request.position,
            height: groundHeight(terrain, ...request.position),
            angles: request.angles,
          },
        ],
        pack,
        { cleanupReferences: cleanupCampaignReferences },
      );
      // Replacement724C0 may clear live creature references. Retain every
      // caller-held native identity while copying that exact afterimage back.
      for (const m of state.mules) {
        const next = staged.ecology.mules.find((n) => n.index === m.index);
        if (!next)
          throw new Error("Combat factory lost a live creature identity");
        m.native.splice(0, m.native.length, ...next.native);
      }
      for (let i = 0; i < terrain.bytes.length; i++)
        terrain.bytes[i] = staged.terrain.bytes[i];
      terrain.revision = staged.terrain.revision;
      Object.assign(rng, staged.rng);
      staged.ecology = state;
      staged.terrain = terrain;
      staged.rng = rng;
      for (const m of state.mules) staged.creatureNative[m.index] = m.native;
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
