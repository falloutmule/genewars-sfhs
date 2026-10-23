/** Source446D0 services over an already isolated complete campaign host. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { SourceEntityId } from "./source-pools";
import {
  damageNativeBuilding,
  type BuildingDamageEffect,
  type BuildingDamageEvent,
  type BuildingDamageReceipt,
} from "../mechanics/building-damage";
import { createCollapse, type CollapseRequest } from "../mechanics/collapse";
import {
  createStagedDestructionEffect,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import { campaignCraterRules } from "./crater-adapter";
import { createCraterJob } from "../mechanics/crater";
import { campaignEntity, synchronizeCampaignLinks } from "./entity-view";
import { cleanupCampaignReferences } from "./cleanup";
import { unlinkSpatial } from "./spatial";
import { requestAudio, type AudioRequest } from "../mechanics/audio";
import { i16, u16, u32, put16 } from "./bytes";

export interface CampaignBuildingDamageServices {
  /** Real recursive blast/damage services bound to the current staged world. */
  effectOptions(world: CampaignWorld): EffectSchedulerOptions<CampaignWorld>;
  /** Required only for an actual modern builder task referencing this target. */
  cancelConstruction?(world: CampaignWorld, actorId: number): void;
  /** The current gameplay-screen binding, source116974==1863A2. */
  gameplayRunning?(world: CampaignWorld): boolean;
  selectedBuildingSlot?(world: CampaignWorld): number | null;
  /** Numeric audio is already queued here. This consumes typed UI/media
   * messages in staged state; it must not send external side effects. */
  onEvent?(world: CampaignWorld, event: BuildingDamageEvent): void;
}
export interface CampaignBuildingDamageReceipt extends BuildingDamageReceipt {
  effectAllocations: { request: BuildingDamageEffect; slot: number | null }[];
  collapseAllocation: { request: CollapseRequest; slot: number | null } | null;
  craterAllocation: {
    request: { position: [number, number]; variant: 0 | 1 };
    slot: number | null;
    viewportInvalidations: number[];
  } | null;
  removedBuildingId: number | null;
  cancelledActorIds: number[];
  detachedPacketIds: number[];
  cleanedReferenceBytes: number;
  audioRequests: AudioRequest[];
}
/** Read native/raw state into its projections; never serialize stale host
 * fields back over source changes or recompute the pre-unlink capacity. */
function synchronizeDamageViews(w: CampaignWorld): void {
  for (const p of w.players) {
    p.funds = u32(p.raw, 0x4a3);
    p.goop = u32(p.raw, 0x4a7);
    for (let selector = 0; selector < 14; selector++)
      p.completed[selector] = p.raw[0x600 + selector];
    p.owned = u16(p.raw, 0x60e);
    const economy = w.economy.players.find((v) => v.id === p.id);
    if (!economy) throw Error("Building damage owner economy binding missing");
    economy.goop = p.goop;
    economy.capacity = u32(p.raw, 0x5e6);
    economy.maxOperationalHQGrade = p.raw[0x6e1];
  }
  for (const b of w.buildings) {
    const native = w.buildingNative[b.slot];
    if (native?.[6] !== 4 || i16(native as number[], 15) !== b.slot)
      throw Error("Building damage live normalized/native binding differs");
    if (
      native[45] !== b.selector ||
      native[46] !== b.grade ||
      native[24] !== b.owner
    )
      throw Error("Building damage selector/grade/owner projection differs");
    const flags = u16(native as number[], 49);
    b.health = i16(native as number[], 43);
    b.complete = !!(flags & 1);
    b.energy = i16(native as number[], 61);
    const economy = w.economy.buildings.find((v) => v.id === b.id);
    if (!economy || economy.owner !== b.owner || economy.slot !== b.slot % 64)
      throw Error("Building damage live economy binding differs");
    economy.complete = b.complete;
    economy.grade = b.grade;
    economy.disabled = !!(flags & 0x40);
    economy.capacitySuppressed = !!(flags & 0x840);
    economy.hqUpgradeSuppressed = !!(flags & 0x140);
    economy.powered = !!(flags & 4);
    economy.depleted = !!(flags & 0x100);
    economy.energy = b.energy;
    if (native[63] === null)
      throw Error("Building damage native drain is unknown");
    economy.extraDrain = native[63]!;
  }
}
/** Already isolated: recursive effects may mutate all live families. This
 * function neither clones nor commits an independent partial transaction. */
export function damageCampaignBuilding(
  w: CampaignWorld,
  pack: Pack,
  slot: number,
  damage: number,
  attackerId: SourceEntityId | null,
  services: CampaignBuildingDamageServices,
): CampaignBuildingDamageReceipt {
  if (
    !pack.rules?.tables.buildingNameIndices ||
    typeof services.effectOptions !== "function"
  )
    throw Error("Original building damage rules/effect services are required");
  const buildings = w.buildings.filter((b) => b.slot === slot),
    target = buildings[0],
    native = w.buildingNative[slot];
  if (
    buildings.length !== 1 ||
    !target ||
    native?.[6] !== 4 ||
    native[24] !== target.owner ||
    native[45] !== target.selector ||
    native[46] !== target.grade ||
    !w.spatial.nodes[`source:3:${slot}`]
  )
    throw Error(
      "Original building damage target/native/spatial binding missing",
    );
  const attacker = attackerId ? campaignEntity(w, attackerId) : null;
  if (attackerId && !attacker)
    throw Error("Original building damage attacker is inactive or unbound");
  const details = {
    effectAllocations: [] as CampaignBuildingDamageReceipt["effectAllocations"],
    collapseAllocation:
      null as CampaignBuildingDamageReceipt["collapseAllocation"],
    craterAllocation: null as CampaignBuildingDamageReceipt["craterAllocation"],
    removedBuildingId: null as number | null,
    cancelledActorIds: [] as number[],
    detachedPacketIds: [] as number[],
    cleanedReferenceBytes: 0,
    audioRequests: [] as AudioRequest[],
  };
  const result = damageNativeBuilding(
    w,
    slot,
    damage,
    attacker ? { id: attacker.id, owner: attacker.owner } : null,
    {
      rules: {
        buildingFootprints: pack.rules.tables.buildingFootprints,
        buildingHealth: pack.rules.tables.buildingHealth,
        buildingNameIndices: pack.rules.tables.buildingNameIndices,
      },
      gameplayRunning: services.gameplayRunning?.(w) ?? w.phase === "active",
      selectedBuildingSlot: services.selectedBuildingSlot?.(w) ?? null,
      createEffect(current, request) {
        const effect = createStagedDestructionEffect(
          current,
          request,
          pack,
          services.effectOptions(current),
        );
        details.effectAllocations.push({ request, slot: effect });
        synchronizeCampaignLinks(current);
        put16(
          current.missionPrefix,
          0x3554,
          current.powerEffects.slots.filter((e) => e.occupied).length,
        );
        current.countdown = u16(current.missionPrefix, 0x355c);
        return effect;
      },
      createCollapse(current, request) {
        const collapse = createCollapse(current, request);
        details.collapseAllocation = { request, slot: collapse };
        return collapse;
      },
      createCrater(current, request) {
        // The numeric constructor stages its argument. Supply only its three
        // real roots, preserving native/player pointers held by recursive
        // source callbacks instead of cloning/replacing the entire host.
        const numeric = {
          missionPrefix: current.missionPrefix,
          terrain: current.terrain,
          rng: current.rng,
        };
        const crater = createCraterJob(
          numeric,
          request.position,
          request.variant,
          campaignCraterRules(pack),
        );
        if (crater.slot !== null) {
          current.missionPrefix.splice(
            0,
            current.missionPrefix.length,
            ...numeric.missionPrefix,
          );
          current.terrain.bytes = numeric.terrain.bytes;
          current.terrain.revision = numeric.terrain.revision;
          Object.assign(current.rng, numeric.rng);
        }
        details.craterAllocation = { request, ...crater };
        return crater;
      },
      unlinkBuilding(current, dyingSlot) {
        const identity: SourceEntityId = `source:3:${dyingSlot}`,
          binding = current.buildings.find((b) => b.slot === dyingSlot);
        if (!binding || current.buildingNative[dyingSlot][6] !== 4)
          throw Error(
            "Original building unlink lost its live native/projection",
          );
        unlinkSpatial(current.spatial, current.terrain, identity);
        synchronizeCampaignLinks(current);
        details.cleanedReferenceBytes += cleanupCampaignReferences(
          current,
          identity,
        );
        // Preserve launched packet identities/velocity/payload. Only the real
        // destination kind and corresponding normalized target are cleared.
        for (const effect of current.powerEffects.slots)
          if (effect.packet?.targetId === binding.id) {
            const carrier = effect.nativePrior;
            if (
              !carrier ||
              u16(carrier as number[], 71) !== dyingSlot ||
              carrier[73] !== 0
            )
              throw Error(
                "Destroyed building packet destination binding differs",
              );
            details.detachedPacketIds.push(effect.packet.id);
            effect.packet.targetId = null;
          }
        const associated = current.builders
          .filter((b) => b.task?.buildingId === binding.id)
          .map((b) => b.id);
        for (const actorId of associated) {
          if (!services.cancelConstruction)
            throw Error(
              "Destroyed building requires actual construction cancellation",
            );
          services.cancelConstruction(current, actorId);
          if (
            current.builders.find((b) => b.id === actorId)?.task?.buildingId ===
            binding.id
          )
            throw Error(
              "Destroyed building construction cancellation retained its binding",
            );
          details.cancelledActorIds.push(actorId);
        }
        for (const actor of current.actors)
          if (actor.egressBuildingId === binding.id)
            actor.egressBuildingId = null;
        current.buildings = current.buildings.filter(
          (b) => b.id !== binding.id,
        );
        current.ecology.otherEntities = current.ecology.otherEntities.filter(
          (e) => e.id !== identity,
        );
        current.economy.buildings = current.economy.buildings.filter(
          (b) => b.id !== binding.id,
        );
        details.removedBuildingId = binding.id;
        // Genepod production lives in this retained native67 record. Removal
        // from both active projections prevents another production callback;
        // its queue/parent fields remain source-compatible inactive afterimage.
      },
      onEvent(current, event) {
        if (event.type === "stop-audio" || event.type === "depleted-audio") {
          requestAudio(current.audio, {
            frame: current.frame,
            entity: `source:3:${event.slot}`,
            cue: event.channel,
            mode: event.type === "stop-audio" ? 4 : event.mode,
            parameter: event.type === "stop-audio" ? 0 : event.parameter,
            gain: 1,
            range: null,
            ...(event.type === "depleted-audio"
              ? { initialRatePercent: event.ratePercent }
              : {}),
          });
          details.audioRequests.push({
            ...current.audio.requests.at(-1)!,
          } as AudioRequest);
        }
        services.onEvent?.(current, event);
      },
    },
  );
  synchronizeDamageViews(w);
  synchronizeCampaignLinks(w);
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((e) => e.occupied).length,
  );
  return { ...result, ...details };
}
