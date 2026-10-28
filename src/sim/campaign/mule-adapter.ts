/**Concrete staged host services for Mule4's source material callback. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { MuleContext } from "../mechanics/mule";
import type { GeneRng } from "../mechanics/random";
import type { EcologyState } from "../mechanics/ecology";
import { muleRequestedSpeed, ecologyTerrainClass } from "../mechanics/ecology";
import type { TerrainState } from "../mechanics/terrain";
import { worldCell } from "../mechanics/terrain";
import {
  creatureComponents,
  creatureCombatTraits,
} from "../mechanics/creature-species";
import { createStagedCampaignBuildingMaterial } from "./building-material-effect-adapter";
import {
  progressCampaignEngineerBuilding,
  type CampaignEngineerServices,
} from "./engineer-adapter";
import { dropPlantCarrier } from "../mechanics/plant-carrier";
import { put16 } from "./bytes";
import { cleanupCampaignReferences } from "./cleanup";
import { attachMuleMaterialPose } from "../mechanics/mule-hauling-motion";
import {
  idleMuleMaterial,
  haulingByte as b,
  haulingWord as word,
  haulingDword as dword,
  haulingDistance,
  haulingPoint,
  type MuleHaulingContext,
} from "../mechanics/mule-hauling";
import {
  detachStagedCreatureCarrier,
  releaseStagedCreatureAction,
  targetStagedCreature,
} from "../mechanics/creature-commands";
import {
  campaignCreatureCommandContext,
  campaignCreatureCommandReference,
  campaignCreatureServiceBuilding,
  campaignCreatureFootprintBuilding,
  campaignCreatureOccupied,
  type CampaignCreatureCommandServices,
} from "./creature-command-adapter";
import { campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import {
  campaignAirborneBuilding,
  campaignMuleBuildingPointAccepted,
} from "./mule-damage-adapter";
import { specialistBlockerWeight } from "../mechanics/specialist-motion";
import { createStagedCampaignMulePlantCarrier } from "./plant-carrier-adapter";
import {
  createStagedSmokeEffect,
  retireStagedSharedEffect,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import { igniteStagedPlant } from "./plant-fire-adapter";
import { unlinkSpatial, moveSpatial, copySpatialLinks } from "./spatial";
import { requestAudio } from "../mechanics/audio";
import { issueStagedHumanCreatureTarget } from "../mechanics/human-creature-commands";
import { campaignHumanCreatureCommandContext } from "./human-creature-command-adapter";
import type { SourceEntityId } from "./source-pools";
export type CampaignMuleMaterialHost = (
  state: EcologyState,
  terrain: TerrainState,
  rng: GeneRng,
) => CampaignWorld;
/**No nested clone: every call resolves the current enclosing Mule transaction.
 * Caller commits only after the complete callback and all late ports succeed. */
export function makeCampaignMuleMaterialServices(
  pack: Pack,
  host: CampaignMuleMaterialHost,
  options:
    | EffectSchedulerOptions<CampaignWorld>
    | ((staged: CampaignWorld) => EffectSchedulerOptions<CampaignWorld>),
  commandServices: CampaignCreatureCommandServices = {},
  engineerServices?: () => CampaignEngineerServices,
): NonNullable<MuleContext["material"]> {
  return (state, terrain, rng, mule) => {
    const w = host(state, terrain, rng),
      n = mule.native;
    if (!pack.rules || !pack.ecologyRules)
      throw Error("Admitted material-work rules required");
    if (w.creatureNative[mule.index] !== n)
      throw Error(
        "Material callback requires retained current Mule/native aliases",
      );
    const heldPlayer = w.players.map((p) => p.raw),
      heldN = w.creatureNative,
      heldM = state.mules,
      effectOptions = () =>
        typeof options === "function" ? options(w) : options,
      command = campaignCreatureCommandContext(w, pack, {
        ...commandServices,
        effectOptions,
      }),
      guard = <T>(run: () => T): T => {
        const result = run();
        if (
          w.creatureNative !== heldN ||
          state.mules !== heldM ||
          w.creatureNative[mule.index] !== n ||
          state.mules.find((m) => m.index === mule.index)?.native !== n ||
          w.players.some((p, i) => p.raw !== heldPlayer[i])
        )
          throw Error(
            "Material service replaced a held native/player identity",
          );
        return result;
      },
      mirror = () => {
        for (const p of w.ecology.plants)
          if (p.active) p.plantFlags = p.native[46]!;
      };
    const c: MuleHaulingContext = {
      terrain,
      rng,
      tables: pack.rules.tables,
      components: creatureComponents(pack.zoneRules?.speciesComponents, n[122]),
      queryRadius:
        (n[122] === 4
          ? pack.ecologyRules.muleCombat
          : creatureCombatTraits(
              pack.ecologyRules,
              pack.zoneRules?.speciesComponents,
              n[122],
            )
        )?.queryRadius ?? NaN,
      builder: {
        nearest: () => {
          const aggregate = b(w.players[b(n, 24)].raw, 0x4a1),
            raw = w.players[aggregate]?.raw;
          if (!raw) throw Error("Actual301F0 builder aggregate required");
          const start = w.runtimeMode & 1 ? 0 : aggregate * 64,
            count = w.runtimeMode & 1 ? 256 : 64;
          let chosen: (number | null)[] | null = null,
            best = 0x7fffffff;
          for (let i = start; i < start + count; i++) {
            const bn = w.buildingNative[i];
            if (
              !b(bn, 6) ||
              (b(bn, 24) !== b(raw, 1) && !(b(raw, 0x6e5) & (1 << b(bn, 24))))
            )
              continue;
            if (
              !(
                (b(bn, 46) < b(bn, 47) && word(bn, 49) & 0x400) ||
                word(bn, 43) < c.maximumBuildingHealth(bn)
              )
            )
              continue;
            const score = haulingDistance(
              terrain,
              haulingPoint(n),
              haulingPoint(bn),
            );
            if (score < best) {
              best = score;
              chosen = bn;
            }
          }
          return chosen;
        },
        createMaterial: (request) =>
          guard(() =>
            createStagedCampaignBuildingMaterial(
              w,
              pack,
              request,
              effectOptions(),
            ),
          ),
        contribute: (bn, amount) =>
          guard(() => {
            const index = word(bn, 15);
            if (w.buildingNative[index] !== bn)
              throw Error("Crab contribution lost held building");
            progressCampaignEngineerBuilding(
              w,
              pack,
              index,
              amount,
              engineerServices?.(),
            );
          }),
        consumeMaterial: (material) =>
          guard(() => {
            const slot = word(material, 15);
            if (w.powerEffects.slots[slot].nativePrior !== material)
              throw Error("Crab material lost held effect");
            retireStagedSharedEffect(w, slot, effectOptions());
            material.splice(
              0,
              material.length,
              ...w.powerEffects.slots[slot].nativePrior!,
            );
            w.powerEffects.slots[slot].nativePrior = material;
          }),
        consumePlant: (material, contribute) =>
          guard(() => {
            const dropped = dropPlantCarrier(
              material,
              {
                plant: (index) => w.ecology.plants[index].native,
                footprintBuilding: (p) => {
                  const index = campaignCreatureFootprintBuilding(w, pack, p);
                  if (index === null) return null;
                  const bn = w.buildingNative[index];
                  return { selector: b(bn, 45), position: haulingPoint(bn) };
                },
                depositOffset:
                  commandServices.corpseDepositOffset?.value ??
                  pack.creatureCommandRules?.corpseDepositOffset,
              },
              false,
            );
            if (dropped.plant === null)
              throw Error("Crab carried plant reference required");
            const plant = w.ecology.plants[dropped.plant],
              amount = b(plant.native, 48);
            if (dropped.retirementRequired)
              c.builder!.consumeMaterial(material);
            contribute(amount);
            //61AD3 performs724C0 before clearing the already unlinked plant.
            if (!plant.active || w.spatial.nodes[`source:1:${dropped.plant}`])
              throw Error(
                "Crab plant consumption requires unlinked active plant",
              );
            cleanupCampaignReferences(
              w,
              `source:1:${dropped.plant}` as SourceEntityId,
            );
            plant.native[6] = 0;
            plant.active = false;
            w.ecology.plantCount = (w.ecology.plantCount - 1) & 65535;
            put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
            const id = `source:1:${dropped.plant}`;
            const overlay = w.source.entities.find((e) => e.id === id);
            if (overlay)
              overlay.nativeBytes.splice(
                0,
                overlay.nativeBytes.length,
                ...plant.native,
              );
            w.ecology.otherEntities = w.ecology.otherEntities.filter(
              (e) => e.id !== id,
            );
            if (w.ecology.plantOrder)
              for (const key of Object.keys(w.ecology.plantOrder))
                w.ecology.plantOrder[key] = w.ecology.plantOrder[key].filter(
                  (i) => i !== dropped.plant,
                );
            mirror();
          }),
      },
      resolve: (r) => campaignCreatureCommandReference(w, r),
      cell: (cell) =>
        campaignQueryEntities(w, [[(cell & 127) << 8, (cell >> 7) << 8]]).map(
          (e) => ({ kind: e.kind as 1 | 2 | 3 | 4 | 5, index: e.index }),
        ),
      serviceBuilding: (selectorMask, requiredFlags) => {
        const i = campaignCreatureServiceBuilding(w, mule.index, {
          selectorMask,
          requiredFlags,
        });
        return i === null ? null : w.buildingNative[i];
      },
      storageFull: () => {
        const raw = w.players[b(n, 24)].raw,
          aggregate = b(raw, 0x4a1),
          r = w.players[aggregate]?.raw;
        if (!r) throw Error("Actual301F0 storage aggregate required");
        return dword(r, 0x4a7) >>> 0 >= dword(r, 0x5e6) >>> 0;
      },
      maximumBuildingHealth: (bn) => {
        const v = pack.rules!.tables.buildingHealth[b(bn, 45) * 3 + b(bn, 46)];
        if (v === undefined)
          throw Error("Admitted service-building health required");
        return v;
      },
      pointAccepted: (p) =>
        n[79] === 4
          ? campaignMuleBuildingPointAccepted(w, pack, mule, p, word(n, 77))
          : !campaignAirborneBuilding(w, pack, p, -1, 0) &&
            !(b(n, 83) & (1 << ecologyTerrainClass(terrain, p))) &&
            specialistBlockerWeight(
              n,
              campaignQueryEntities(w, [p]).map((e) => e.native),
            ) < 10,
      footprintBuilding: (p) => {
        const i = campaignCreatureFootprintBuilding(w, pack, p);
        return i === null ? null : w.buildingNative[i];
      },
      target: (r) =>
        guard(() => {
          const out = targetStagedCreature(w, mule.index, r, command);
          mirror();
          return out.accepted;
        }),
      detach: () =>
        guard(() => {
          detachStagedCreatureCarrier(w, mule.index, command);
          mirror();
        }),
      release: () =>
        guard(() => {
          releaseStagedCreatureAction(w, mule.index, command);
          mirror();
        }),
      occupied: () => campaignCreatureOccupied(w, mule.index),
      idle: (delay) => idleMuleMaterial(n, delay, c),
      speed: () => muleRequestedSpeed(mule, pack.ecologyRules!),
      audio: (cue) =>
        requestAudio(w.audio, {
          frame: w.frame,
          entity: mule.id,
          cue,
          mode: 2,
          parameter: 0,
          range: 64,
          gain: 127,
          initialRatePercent: 100,
        }),
      ignite: (plant) =>
        guard(() => {
          const i = word(plant, 15);
          if (w.ecology.plants[i]?.native !== plant)
            throw Error("Material ignition lost retained plant");
          igniteStagedPlant(w, i, pack, effectOptions(), (s, event) =>
            requestAudio(s.audio, {
              frame: s.frame,
              entity: event.entity,
              cue: event.channel,
              mode: event.mode,
              parameter: event.parameter,
              range: 64,
              gain: event.volume,
              initialRatePercent: event.ratePercent,
            }),
          );
        }),
      unlinkPlant: (plant) =>
        guard(() => {
          const i = word(plant, 15),
            id = `source:1:${i}` as SourceEntityId;
          if (w.ecology.plants[i]?.native !== plant)
            throw Error("Material unlink lost retained plant");
          unlinkSpatial(w.spatial, w.terrain, id);
          copySpatialLinks(w.spatial, id, plant);
          w.ecology.plants[i].plantFlags = b(plant, 46);
          synchronizeCampaignLinks(w);
        }),
      createPlantCarrier: (request) =>
        guard(() =>
          createStagedCampaignMulePlantCarrier(
            w,
            pack,
            request,
            effectOptions(),
          ),
        ),
      attach: (r) =>
        guard(() => {
          const carried = campaignCreatureCommandReference(w, r);
          if (!carried) throw Error("Actual9C carried binding required");
          attachMuleMaterialPose(carried, n, {
            terrain,
            frame: w.frame,
            scrape: (request) => {
              createStagedSmokeEffect(
                w,
                { ...request, newborn: false },
                pack,
                effectOptions(),
              );
            },
            relocate: (record, oldCell, newCell) => {
              const id =
                `source:${b(record, 6) - 1}:${word(record, 15)}` as SourceEntityId;
              if (w.spatial.nodes[id]?.cell !== oldCell)
                throw Error("Carried9C prior spatial cell differs");
              moveSpatial(w.spatial, terrain, id, newCell);
              synchronizeCampaignLinks(w);
            },
          });
          //JSON and earlier host operations can leave equal canonical rows split;
          //the enclosing transaction establishes aliases before every callback.
        }),
      resumeTask: (target, mode) =>
        guard(() => {
          issueStagedHumanCreatureTarget(
            w,
            mule.index,
            {
              target,
              mode,
              callerOwner: b(n, 24),
              selectedPlayer: w.selectedPlayer,
            },
            campaignHumanCreatureCommandContext(pack, mule.index, {
              ...commandServices,
              effectOptions,
            }),
          );
          mirror();
          synchronizeCampaignLinks(w);
        }),
    };
    return c;
  };
}
