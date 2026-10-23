/** Complete concrete37870 service composition over one staged campaign host.
 * The public wrapper isolates all mutable gameplay roots, including effects,
 * native actors, resources and source command afterimages. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import { requiredOpponentStrategyPlayers } from "../mechanics/opponent-startup";
import {
  stepStagedStrategicPlayer,
  type StrategicAIState,
  type StrategicAIEvent,
  type StrategicAIServices,
  validateStrategicAIContext,
} from "../mechanics/strategic-ai";
import {
  makeStrategicCreatureServices,
  type StrategicCreatureContext,
} from "../mechanics/strategic-ai-creatures";
import {
  makeStrategicGroupService,
  type StrategicGroupContext,
} from "../mechanics/strategic-ai-group-control";
import { makeStrategicAttackService } from "../mechanics/strategic-ai-attack";
import { makeStrategicBuildingService } from "../mechanics/strategic-ai-buildings";
import { makeStrategicSurveyService } from "../mechanics/strategic-ai-survey";
import { makeStrategicSpatialServices } from "../mechanics/strategic-ai-spatial";
import { makeStrategicSitePlanningServices } from "../mechanics/strategic-ai-site-planning";
import { makeStrategicEngineerPlanningService } from "../mechanics/strategic-ai-engineer";
import { makeStrategicSpecialistService } from "../mechanics/strategic-ai-specialists";
import type { CampaignEngineerServices } from "./engineer-adapter";
import { campaignStrategicContext } from "./strategic-context";
import {
  bindCampaignStrategicState,
  publishCampaignStrategicState,
} from "./strategic-state";
import {
  campaignStrategicRecruitServices,
  type CampaignRecruitEvent,
} from "./strategic-recruit-adapter";
import { dispatchStagedCampaignStrategicRoleCommand } from "./strategic-role-command-adapter";
import { makeCampaignStrategicProductionService } from "./strategic-production-adapter";
import {
  executeStagedCampaignCreatureCommand,
  type CampaignCreatureCommandServices,
} from "./creature-command-adapter";

export interface CampaignStrategyReceipt {
  players: number[];
  events: StrategicAIEvent[];
  recruits: CampaignRecruitEvent[];
}
export interface CampaignStrategyServices extends CampaignEngineerServices {
  creature?: CampaignCreatureCommandServices;
}
/** Every returned provider calls the real staged implementation. Optional
 * downstream branches retain explicit errors; no readiness receipts stand in
 * for constructors, commands, queries or actual native mutations. */
export function campaignStrategicServices(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignStrategyServices,
  recruits: CampaignRecruitEvent[] = [],
) {
  const base = campaignStrategicContext(w, pack),
    assertBound = (s: StrategicAIState) => {
      if (
        s.records !== w.strategy?.records ||
        s.creatures !== w.creatureNative ||
        s.buildings !== w.buildingNative ||
        s.rng !== w.rng ||
        s.players.some((p, i) => p !== w.players[i].raw)
      )
        throw Error("Strategic action is bound to a different staged campaign");
    },
    creatureContext: StrategicCreatureContext & StrategicGroupContext = {
      ...base,
      moveOrder(s, request) {
        assertBound(s);
        const result = executeStagedCampaignCreatureCommand(
          w,
          request.creature,
          {
            type: "move",
            callerOwner: request.player,
            point: request.point,
            selectedPanelRefresh: false,
          },
          pack,
          { ...services.creature, effectOptions: services.effectOptions },
        );
        return {
          ...request,
          outcome: result.accepted ? "installed" : "ignored",
        };
      },
      targetOrder(s, request) {
        assertBound(s);
        const result = executeStagedCampaignCreatureCommand(
          w,
          request.creature,
          {
            type: "target",
            target: {
              kind: request.target.family,
              index: request.target.index,
            },
          },
          pack,
          { ...services.creature, effectOptions: services.effectOptions },
        );
        return { ...request, accepted: result.accepted };
      },
      releaseAction(s, creature) {
        assertBound(s);
        executeStagedCampaignCreatureCommand(
          w,
          creature,
          { type: "release" },
          pack,
          { ...services.creature, effectOptions: services.effectOptions },
        );
        return { routine: 0x5cc60, creature };
      },
      interact(s, request) {
        assertBound(s);
        executeStagedCampaignCreatureCommand(
          w,
          request.creature,
          {
            type: "interact",
            target: {
              kind: request.target.family,
              index: request.target.index,
            },
            force: request.force,
          },
          pack,
          { ...services.creature, effectOptions: services.effectOptions },
        );
        return { ...request };
      },
    },
    groups = makeStrategicGroupService(creatureContext),
    spatial = makeStrategicSpatialServices(base),
    sites = makeStrategicSitePlanningServices(base),
    command = (
      _s: StrategicAIState,
      request: Parameters<typeof dispatchStagedCampaignStrategicRoleCommand>[1],
    ) => {
      assertBound(_s);
      return dispatchStagedCampaignStrategicRoleCommand(
        w,
        request,
        pack,
        services,
      );
    },
    recruit = campaignStrategicRecruitServices(w, pack, services, recruits),
    engineerPlan = makeStrategicEngineerPlanningService({
      ...base,
      ...spatial,
      ...sites,
      command,
    }),
    ports: StrategicAIServices = {
      ...recruit,
      ...makeStrategicCreatureServices(creatureContext),
      ...groups,
      ...makeStrategicAttackService(creatureContext, groups.stepGroup!),
      ...makeStrategicBuildingService({
        ...base,
        ...makeStrategicSurveyService(base),
        requestProduction: makeCampaignStrategicProductionService(w, pack),
      }),
      ...makeStrategicSpecialistService({
        ...base,
        ...creatureContext,
        ...spatial,
        ...sites,
        ...recruit,
        command,
        engineerPlan,
      }),
    };
  return { context: base, ports };
}
/** Source70B00 uses this current frame, before1C120 queued game commands and
 * before the1BD4F frame increment. Called before zones/actor/economy callbacks. */
export function stepStagedCampaignStrategy(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignStrategyServices,
): CampaignStrategyReceipt {
  const players = requiredOpponentStrategyPlayers(
      w.players.map((p) => p.raw),
      {
        flags: w.flags,
        runtimeMode: w.runtimeMode,
        activePlayerCount: w.source.source.context.activePlayerCount,
      },
    ),
    receipt: CampaignStrategyReceipt = { players, events: [], recruits: [] };
  if (!players.length) return receipt;
  const state = bindCampaignStrategicState(w),
    bound = campaignStrategicServices(w, pack, services, receipt.recruits);
  validateStrategicAIContext(bound.context);
  for (const player of players)
    stepStagedStrategicPlayer(
      state,
      player,
      bound.context,
      bound.ports,
      receipt.events,
    );
  publishCampaignStrategicState(w, state);
  return receipt;
}
/** A later failed role, charge or query rolls back every earlier player's AI,
 * native pool, factory allocation, raw debit, spatial link and shared RNG. */
export function stepCampaignStrategy(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignStrategyServices,
): CampaignStrategyReceipt {
  if (
    !requiredOpponentStrategyPlayers(
      w.players.map((p) => p.raw),
      {
        flags: w.flags,
        runtimeMode: w.runtimeMode,
        activePlayerCount: w.source.source.context.activePlayerCount,
      },
    ).length
  )
    return { players: [], events: [], recruits: [] };
  const staged = structuredClone(w),
    receipt = stepStagedCampaignStrategy(staged, pack, services);
  if (receipt.players.length) Object.assign(w, staged);
  return receipt;
}
