/**5CDB0's AI gate and35F00, after a successful numeric death callback. */
import type { CampaignWorld } from "./world";
import { i16 } from "./bytes";
import { releaseStrategicCreatureOnDeath } from "../mechanics/strategic-ai-creatures";
import { campaignStrategicAuxiliary } from "./strategic-state";

export function releaseCampaignDeadCreature(w: CampaignWorld, index: number): void {
  const n = w.creatureNative[index];
  if (!n || i16(n as number[], 15) !== index)
    throw Error("Actual dead creature pool binding required");
  const owner = n[24];
  if (owner === 4) return;
  if (owner == null || owner < 0 || owner > 3 || !w.players[owner])
    throw Error("Actual dead creature owner required");
  if (w.players[owner].raw[2] === 0) return;
  if (!w.strategy) throw Error("AI creature death requires actual strategic storage");
  releaseStrategicCreatureOnDeath(w.strategy, owner, index);
  w.auxiliary = campaignStrategicAuxiliary(w.strategy);
}
