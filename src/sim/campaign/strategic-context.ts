/** Concrete read-only services over the actual current campaign spatial/pools.
 * No entity is reconstructed from a count or a decorative projection. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  aiByte,
  aiSByte,
  aiSWord,
  strategicBlueprint,
  type StrategicAIState,
} from "../mechanics/strategic-ai-state";
import type { StrategicSpecialistPlanContext } from "../mechanics/strategic-ai-specialists";
import type { StrategicBuildingContext } from "../mechanics/strategic-ai-buildings";
import type {
  StrategicSurveyContext,
  StrategicSurveyReference,
} from "../mechanics/strategic-ai-survey";
import type { StrategicSpatialContext } from "../mechanics/strategic-ai-spatial";
import type { StrategicEngineerRules } from "../mechanics/strategic-ai-engineer";
import type { StrategicSitePlanningContext } from "../mechanics/strategic-ai-site-planning";

/**Inherited virtual68 bodies from the actual family constructors/vtables:
 * kinds5/6 true(1EB60/1EB40),7 native86==3(1EB30),8 false(1EAE0).
 * Kind5 is skipped before this call by31560; the concrete result is still named. */
export function campaignStrategicProtected(
  w: CampaignWorld,
  s: StrategicAIState,
  ref: StrategicSurveyReference,
): boolean {
  const n = campaignStrategicNative(w, s, ref);
  if (!n) throw Error("Actual strategic protection target missing");
  switch (ref.kind) {
    case 1:
      return aiByte(n, 94) >= 24;
    case 2:
      return aiSWord(n, 44) <= 0;
    case 3:
      return aiSByte(strategicBlueprint(s, ref.index), 26) <= 0;
    case 4:
      return aiSWord(n, 43) <= 0;
    case 5:
    case 6:
      return true;
    case 7:
      return aiByte(n, 86) === 3;
    case 8:
      return false;
    default:
      throw Error("Unsupported strategic native protection kind");
  }
}
export function campaignStrategicNative(
  w: CampaignWorld,
  s: StrategicAIState,
  ref: StrategicSurveyReference,
): readonly (number | null)[] | null {
  const { kind, index } = ref;
  if (!Number.isInteger(index) || index < 0)
    throw Error("Actual strategic reference index required");
  switch (kind) {
    case 1:
      return s.creatures[index] ?? null;
    case 2:
      return w.ecology.plants[index]?.native ?? null;
    case 3:
      return s.specialists[index]?.native ?? null;
    case 4:
      return s.buildings[index] ?? null;
    case 5:
      return w.powerEffects.slots[index]?.nativePrior ?? null;
    case 6:
      return w.collapse.records[index] ?? null;
    case 7:
      return w.collectors.records[index] ?? null;
    case 8:
      return w.ethereals.records[index]?.native ?? null;
    default:
      return null;
  }
}
export function campaignStrategicEngineerRules(
  pack: Pack,
): StrategicEngineerRules {
  const tables = pack.rules?.tables,
    ai = pack.strategicAIRules,
    engineer = pack.strategicEngineerRules;
  if (!tables || !ai?.buildingValues || !engineer || !pack.buildingRules)
    throw Error("Admitted strategic Engineer rule tables required");
  return {
    upkeep: pack.buildingRules.upkeep,
    buildingHealth: tables.buildingHealth,
    constructionCosts: tables.constructionCosts,
    buildingFootprints: tables.buildingFootprints,
    buildingProgressThresholds: tables.buildingProgressThresholds,
    buildingPrerequisites: tables.buildingPrerequisites,
    buildingValues: ai.buildingValues,
    priorities: engineer.priorities,
  };
}
export function campaignStrategicContext(w: CampaignWorld, pack: Pack) {
  const tables = pack.rules?.tables,
    ai = pack.strategicAIRules,
    ecology = pack.ecologyRules;
  if (
    !tables ||
    !ai?.speciesGenes ||
    !ai.productionWeights ||
    !ai.buildingValues ||
    !ai.buildingThreatValues ||
    !ai.specialistThreatWeights ||
    !ecology
  )
    throw Error("Admitted complete strategic numeric context required");
  const held = (s: StrategicAIState) => {
    if (
      !w.strategy ||
      s.records !== w.strategy.records ||
      s.rng !== w.rng ||
      s.missionPrefix !== w.missionPrefix
    )
      throw Error("Strategic query is bound to a different staged campaign");
  };
  const c = {
    frame: w.frame,
    flags: w.flags,
    runtimeMode: w.runtimeMode,
    activePlayerCount: w.source.source.context.activePlayerCount,
    selectedPlayer: w.selectedPlayer,
    tables,
    groupLimits: ai.groupLimits,
    speciesGenes: ai.speciesGenes,
    productionWeights: ai.productionWeights,
    buildingValues: ai.buildingValues,
    buildingThreatValues: ai.buildingThreatValues,
    specialistThreatWeights: ai.specialistThreatWeights,
    plantValues: ecology.plants,
    recruitmentLandingOffset: pack.specialistRecruitmentRules?.associatedLandingOffset,
    spreadDirections: ecology.spreadDirections,
    water: w.source.source.terrain.rawWaterHeight,
    rules: campaignStrategicEngineerRules(pack),
    footprintSearchOffsets: pack.creatureCommandRules?.footprintSearchOffsets,
    terrain: (s: StrategicAIState) => {
      held(s);
      return w.terrain;
    },
    plants: (s: StrategicAIState) => {
      held(s);
      return w.ecology.plants.map((p) => p.native);
    },
    effects: (s: StrategicAIState) => {
      held(s);
      return w.powerEffects.slots.map((p) => {
        if (!p.nativePrior)
          throw Error("Actual strategic effect prior required");
        return p.nativePrior;
      });
    },
    family6: (s: StrategicAIState) => {
      held(s);
      return w.collapse.records;
    },
    creatureProtected: (s: StrategicAIState, index: number) => {
      held(s);
      return campaignStrategicProtected(w, s, { kind: 1, index });
    },
    plantProtected: (s: StrategicAIState, index: number) => {
      held(s);
      return campaignStrategicProtected(w, s, { kind: 2, index });
    },
    specialistProtected: (s: StrategicAIState, index: number) => {
      held(s);
      return campaignStrategicProtected(w, s, { kind: 3, index });
    },
    protectedTarget: (s: StrategicAIState, ref: StrategicSurveyReference) => {
      held(s);
      return campaignStrategicProtected(w, s, ref);
    },
    entity: (s: StrategicAIState, ref: StrategicSurveyReference) => {
      held(s);
      return campaignStrategicNative(w, s, ref);
    },
    cellOrder: (
      s: StrategicAIState,
      cell: number,
    ): StrategicSurveyReference[] => {
      held(s);
      if (!Number.isInteger(cell) || cell < 0 || cell >= 16384)
        throw Error("Actual strategic source cell required");
      let id = w.spatial.heads[cell];
      const seen = new Set<string>(),
        refs: StrategicSurveyReference[] = [];
      while (id) {
        if (seen.has(id)) throw Error("Strategic source spatial chain cycles");
        seen.add(id);
        const node = w.spatial.nodes[id],
          match = /^source:([0-7]):(\d+)$/.exec(id);
        if (!node || !match || node.cell !== cell)
          throw Error("Actual strategic source spatial link differs");
        refs.push({ kind: Number(match[1]) + 1, index: Number(match[2]) });
        id = node.next;
      }
      return refs;
    },
  } satisfies StrategicSpecialistPlanContext &
    StrategicBuildingContext &
    StrategicSurveyContext &
    StrategicSpatialContext &
    StrategicSitePlanningContext;
  return c;
}
