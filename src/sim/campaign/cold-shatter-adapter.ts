import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { EcologyMule } from "../mechanics/ecology";
import { emitColdShatterBurst, type ColdShatterRequest } from "../mechanics/cold-shatter";
import { createStagedDestructionEffect, type EffectSchedulerOptions } from "./effect-scheduler";

/**The surrounding creature/damage transaction owns rollback and retirement.
 * Each successful allocation is published before the next three burst draws. */
export function createStagedColdShatterBurst(
  w: CampaignWorld, mule: EcologyMule, request: ColdShatterRequest,
  pack: Pack, options: EffectSchedulerOptions<CampaignWorld>,
): number {
  if (w.ecology.mules.find(m => m.index === mule.index)?.native !== mule.native)
    throw Error("Cold shatter requires the current staged creature");
  for (const m of w.ecology.mules) w.creatureNative[m.index] = m.native;
  return emitColdShatterBurst(mule.native, w.rng, request,
    q => createStagedDestructionEffect(w, q, pack, options) !== null);
}
