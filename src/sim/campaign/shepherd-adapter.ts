import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  queueShepherdControl, queueShepherdInteraction, queueShepherdMove, cancelShepherdWork,
  cancelStagedShepherdWork, stepShepherdCallback,
  type ShepherdCallbackContext, type ShepherdReceipt, type ShepherdReference,
} from "../mechanics/shepherd";
import {
  campaignGeneticistContext, consumeCampaignGeneticistReceipt,
  type CampaignSpecialistServices,
} from "./specialist-adapter";
import { campaignEntity } from "./entity-view";
import { sourceEntityId } from "./source-pools";
import { queryShepherdHostile, shepherdTargetVirtual58, shepherdTargetVirtual68, shepherdLineOfSight } from "../mechanics/shepherd-query";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { createStagedShepherdShot } from "./shepherd-effect-adapter";
import { applyCampaignBotanistEconomy } from "./botanist-adapter";
import { planBotanistEconomy } from "../mechanics/botanist";

/** Same57A10/6FB60/7AC00 envelope as the other native specialists. */
export function campaignShepherdContext(w: CampaignWorld, pack: Pack,
  services: CampaignSpecialistServices): ShepherdCallbackContext<CampaignWorld> {
  if (!pack.shepherdRules) throw Error("Original Shepherd rules missing");
  const common = campaignGeneticistContext(w, pack, services);
  return {
    ...common, rules: pack.shepherdRules,
    resolveTarget: (s, _actor, reference) => {
      const e = campaignEntity(s, sourceEntityId(reference.kind - 1, reference.index));
      return e ? { ...reference, native: e.native, physicalHeight: e.physicalHeight } : null;
    },
    findHostile: (s, index, radius) => queryShepherdHostile(s, index, radius, {
      cellOrder: common.cellOrder,
      creature: (host, slot) => host.ecology.mules.find(m => m.index === slot)?.native ?? null,
    }),
    protectedTarget: (s, target) => {
      const binding = target.kind === 3 ? s.specialists.bindings[target.index] : null;
      if (target.kind === 3 && !binding) throw Error("Actual Shepherd target blueprint binding missing");
      const offset = binding ? 0x16 + binding.blueprintIndex * 36 : 0;
      return shepherdTargetVirtual68(target, binding ? s.players[binding.owner].raw.slice(offset, offset + 36) : undefined);
    },
    deadTarget: (_s, target) => shepherdTargetVirtual58(target),
    targetVisible: (s, index, target) => shepherdLineOfSight(s, index, target, {
      tables: pack.rules!.tables,
      obstacle: (host, point, mask, height) => campaignAirborneBuilding(host, pack, point, height, mask) !== null,
    }),
    launchProjectile: (s, shot) => createStagedShepherdShot(s, shot, pack, services.effectOptions(s)),
    debit: (s, index, amount, show) => {
      if (show) applyCampaignBotanistEconomy(s, pack, `source:2:${index}`, "debit", amount, services);
      else {
        const raw = s.players[s.specialists.bindings[index]!.owner].raw,
          result = planBotanistEconomy(raw, s.missionPrefix, { operation: "debit", amount, entity: null });
        raw.splice(0, raw.length, ...result.raw);
      }
    },
  };
}
function consume(w: CampaignWorld, index: number, out: ShepherdReceipt) {
  consumeCampaignGeneticistReceipt(w, index, out);
  if (w.specialists.records[index][6] !== 3) return;
  const n = w.specialists.records[index], actor = w.actors.find(a => a.id === index)!;
  if (n[85] === 12) actor.reason = n[126] === 0 ? "Controlling nearby creatures" : "Interacting with target";
  const feedback = [...out.events].reverse().find(e => e.type === "feedback" && e.mode === 1);
  if (feedback?.type === "feedback") {
    const text = feedback.reason === "shepherd-target-lost" ? "Shepherd target is no longer available" : "No suitable Shepherd target nearby";
    actor.reason = text;
    w.notices.push({ frame: w.frame, severity: "warning", text, entityId: index });
    if (w.notices.length > 40) w.notices.shift();
  }
}
export function stepCampaignShepherd(w: CampaignWorld, index: number, pack: Pack, services: CampaignSpecialistServices) {
  consume(w, index, stepShepherdCallback(w, index, campaignShepherdContext(w, pack, services)));
}
export function requestCampaignShepherdControl(w: CampaignWorld, index: number,
  point: [number, number], mode: 0 | 1 | 2) {
  consume(w, index, queueShepherdControl(w, index, { callerOwner: w.selectedPlayer, point, mode }));
}
export function requestCampaignShepherdInteraction(w: CampaignWorld, index: number,
  task: 1 | 2, target: ShepherdReference, pack: Pack, services: CampaignSpecialistServices) {
  consume(w, index, queueShepherdInteraction(w, index, { callerOwner: w.selectedPlayer, task, target }, campaignShepherdContext(w, pack, services)));
}
export function moveCampaignShepherd(w: CampaignWorld, index: number, point: [number, number],
  pack: Pack, services: CampaignSpecialistServices) {
  consume(w, index, queueShepherdMove(w, index, { callerOwner: w.selectedPlayer, point }, campaignShepherdContext(w, pack, services)));
}
export function stopCampaignShepherd(w: CampaignWorld, index: number) {
  consume(w, index, cancelShepherdWork(w, index, w.selectedPlayer));
  //The modern Stop also discards pending paused commands, as for other roles.
  w.specialists.records[index][87] = w.specialists.records[index][87]! & 252;
}
export function cancelStagedCampaignShepherd(w: CampaignWorld, index: number) {
  consume(w, index, cancelStagedShepherdWork(w, index, w.specialists.bindings[index]!.owner));
}
