import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  stepBotanistCallback,
  queueBotanistWork,
  queueBotanistMove,
  cancelBotanistWork,
  cancelStagedBotanistWork,
  botanistRulesFromEcology,
  planBotanistPlantCreation,
  planBotanistEconomy,
  emitBotanistEconomyBurst,
  type BotanistCallbackContext,
  type BotanistReceipt,
  type BotanistWorkRequest,
  type BotanistEconomyParticle,
} from "../mechanics/botanist";
import {
  makeBotanistWorkEffect,
  makeBotanistEconomyEffect,
} from "../mechanics/botanist-effect";
import {
  campaignGeneticistContext,
  consumeCampaignGeneticistReceipt,
  type CampaignSpecialistServices,
} from "./specialist-adapter";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
} from "./effect-scheduler";
import { damageCampaignPlant } from "./blast-adapter";
import { igniteStagedPlant } from "./plant-fire-adapter";
import { insertSpatial } from "./spatial";
import {
  campaignEntity,
  campaignQueryEntities,
  synchronizeCampaignLinks,
} from "./entity-view";
import { synchronizeCampaignPlantCounts } from "./ecology-adapter";
import { requestAudio } from "../mechanics/audio";
import { animationProfile } from "../mechanics/animation";
import { worldCell } from "../mechanics/terrain";
import { i16, put16 } from "./bytes";
import type { SourceEntityId } from "./source-pools";

function publish(
  w: CampaignWorld,
  slot: number,
  native: readonly (number | null)[],
) {
  publishStagedSharedEffect(w, slot, native);
  synchronizeCampaignLinks(w);
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((e) => e.occupied).length,
  );
}
export function applyCampaignBotanistEconomy(
  w: CampaignWorld,
  pack: Pack,
  entity: SourceEntityId,
  operation: "credit" | "debit",
  amount: number,
  services: CampaignSpecialistServices,
): void {
  const e = campaignEntity(w, entity);
  if (!e || e.owner >= 4)
    throw new Error("Actual owned Botanist economy entity required");
  const raw = w.players[e.owner].raw,
    result = planBotanistEconomy(raw, w.missionPrefix, {
      operation,
      amount,
      entity,
    });
  raw.splice(0, raw.length, ...result.raw);
  if (result.audio)
    requestAudio(w.audio, {
      frame: w.frame,
      entity,
      cue: result.audio.cue,
      mode: result.audio.mode,
      parameter: result.audio.parameter,
      gain: result.audio.volume / 127,
      range: null,
      initialRatePercent: result.audio.ratePercent,
    });
  if (result.burst)
    emitBotanistEconomyBurst(
      e.native,
      w.rng,
      result.burst,
      (q) => createStagedBotanistEconomyEffect(w, q, pack, services) !== null,
    );
}
export function createStagedBotanistEconomyEffect(
  w: CampaignWorld,
  q: BotanistEconomyParticle,
  pack: Pack,
  services: CampaignSpecialistServices,
): number | null {
  const slot = allocateStagedSharedEffect(
    w,
    q.code,
    pack,
    services.effectOptions(w),
  );
  if (slot === null) return null;
  const native = makeBotanistEconomyEffect(
    w.powerEffects.slots[slot].nativePrior!,
    { ...q, slot },
    w.terrain,
    i16(w.missionPrefix, 0x1c5d),
    w.rng,
    pack.rules!.tables,
    animationProfile(pack.assets.EFF, q.code),
  );
  publish(w, slot, native);
  return slot;
}
export function createStagedBotanistPlant(
  w: CampaignWorld,
  request: {
    actor: number;
    owner: number;
    selector: number;
    position: [number, number];
  },
  pack: Pack,
  services: CampaignSpecialistServices,
): number | null {
  const index = w.ecology.plants.findIndex(
    (p) => !p.active && p.native[6] === 0,
  );
  if (index < 0) return null;
  const p = w.ecology.plants[index],
    plan = planBotanistPlantCreation(
      p.native,
      index,
      request.owner,
      request.selector,
      request.position,
      w.terrain,
    );
  //Keep the real native slot identity for any callback retaining that pointer.
  p.native.splice(0, p.native.length, ...plan.native);
  Object.assign(p, {
    active: true,
    owner: request.owner,
    position: plan.position,
    selector: request.selector,
    growth: 4,
    flags: 4,
    plantFlags: 0,
    updateCounter: p.native[47],
    retirement: p.native[48],
    animation: 0,
    frame: 0,
    shade: p.native[23],
    height: plan.height,
  });
  insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
  synchronizeCampaignLinks(w);
  w.ecology.plantCount++;
  w.ecology.ownerPlantCounts[request.owner] =
    (w.ecology.ownerPlantCounts[request.owner] + 1) & 65535;
  synchronizeCampaignPlantCounts(w);
  const cell = worldCell(...p.position);
  if (w.ecology.plantOrder)
    w.ecology.plantOrder[cell] = campaignQueryEntities(w, [p.position])
      .filter((e) => e.kind === 2)
      .map((e) => e.index);
  applyCampaignBotanistEconomy(w, pack, p.id, "credit", 1, services);
  return index;
}
export function campaignBotanistContext(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): BotanistCallbackContext<CampaignWorld> {
  if (!pack.ecologyRules)
    throw new Error("Original Botanist ecology rules missing");
  return {
    ...campaignGeneticistContext(w, pack, services),
    rules: botanistRulesFromEcology(pack.ecologyRules),
    damagePlant: (s, index, amount) => {
      damageCampaignPlant(s, pack, index, amount);
    },
    createPlant: (s, q) => createStagedBotanistPlant(s, q, pack, services),
    ignitePlant: (s, index) => {
      igniteStagedPlant(s, index, pack, services.effectOptions(s), (host, e) =>
        requestAudio(host.audio, {
          frame: host.frame,
          entity: e.entity,
          cue: e.channel,
          mode: e.mode,
          parameter: e.parameter,
          gain: e.volume / 127,
          range: null,
          initialRatePercent: e.ratePercent,
        }),
      );
    },
    effect: (s, q) => {
      const slot = allocateStagedSharedEffect(
        s,
        7,
        pack,
        services.effectOptions(s),
      );
      if (slot === null) return;
      const n = makeBotanistWorkEffect(
        s.powerEffects.slots[slot].nativePrior!,
        { ...q, slot },
        s.terrain,
        animationProfile(pack.assets.EFF, 7),
      );
      publish(s, slot, n);
    },
    economy: (s, q) =>
      applyCampaignBotanistEconomy(
        s,
        pack,
        `source:2:${q.actor}`,
        q.operation,
        q.amount,
        services,
      ),
    //Deterministic modern presentation policy: stop a previously requested
    //loop regardless of device completion. Device audio never gates gameplay.
    audioPlaying: (s, index, cue) => {
      const last = [...s.audio.requests]
        .reverse()
        .find(
          (r) =>
            r.type !== "playback-rate" &&
            r.entity === `source:2:${index}` &&
            r.cue === cue,
        );
      return last?.type !== "playback-rate" && last?.mode === 2;
    },
  };
}
function consume(w: CampaignWorld, index: number, r: BotanistReceipt) {
  consumeCampaignGeneticistReceipt(w, index, r);
  if (w.specialists.records[index][6] !== 3) return;
  const n = w.specialists.records[index],
    a = w.actors.find((a) => a.id === index)!;
  const blocked: Record<string, string> = {
      "no-area-plants": "No suitable plants nearby",
      "botanist-resource-full": "Plant sample storage is full",
      "insufficient-botanist-resource": "No plant samples available",
      "no-planting-site": "No suitable planting site nearby",
      "no-harvest-target": "No suitable plant to clear nearby",
    },
    feedback = [...r.events]
      .reverse()
      .find((e) => e.type === "feedback" && e.mode === 1);
  if (feedback?.type === "feedback" && blocked[feedback.reason]) {
    a.reason = blocked[feedback.reason];
    w.notices.push({
      frame: w.frame,
      severity: "warning",
      text: a.reason,
      entityId: index,
    });
    if (w.notices.length > 40) w.notices.shift();
  } else if (n[85] === 10 && n[88]! & 1 && n[126]! <= 2)
    a.reason =
      n[126] === 0
        ? "Collecting plant samples"
        : n[126] === 1
          ? "Planting"
          : "Clearing plants";
}
export function stepCampaignBotanist(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  consume(
    w,
    index,
    stepBotanistCallback(w, index, campaignBotanistContext(w, pack, services)),
  );
}
export function requestCampaignBotanist(
  w: CampaignWorld,
  index: number,
  q: BotanistWorkRequest,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  consume(
    w,
    index,
    queueBotanistWork(w, index, q, campaignBotanistContext(w, pack, services)),
  );
}
export function moveCampaignBotanist(
  w: CampaignWorld,
  index: number,
  point: [number, number],
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  consume(
    w,
    index,
    queueBotanistMove(
      w,
      index,
      { point, callerOwner: w.selectedPlayer },
      campaignBotanistContext(w, pack, services),
    ),
  );
}
export function stopCampaignBotanist(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  consume(
    w,
    index,
    cancelBotanistWork(
      w,
      index,
      w.selectedPlayer,
      campaignBotanistContext(w, pack, services),
    ),
  );
  w.specialists.records[index][87] = w.specialists.records[index][87]! & 252;
}
export function cancelStagedCampaignBotanist(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const owner = w.specialists.bindings[index]!.owner;
  consume(
    w,
    index,
    cancelStagedBotanistWork(
      w,
      index,
      owner,
      campaignBotanistContext(w, pack, services),
    ),
  );
}
