/**Actual97-byte collector pool, source queries and whole14EC0 host pass. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import type { SourceEntityId } from "./source-pools";
import {
  collectorByte as b,
  collectorWord as word,
  createStagedProcessorCollector,
  queryProcessorCollection,
  stepStagedProcessorCollector,
  cancelStagedProcessorCollector,
  damageStagedProcessorCollector,
  type CollectorReference,
  type ProcessorCollectorContext,
  type ProcessorCollectorReceipt,
} from "../mechanics/processor-collector";
import { stepStagedProcessorCollectorMotion } from "../mechanics/processor-collector-motion";
import { attachGroundMaterialPose } from "../mechanics/mule-hauling-motion";
import { makeProcessorCollectorFeedback } from "../mechanics/processor-collector-feedback";
import { dropPlantCarrier } from "../mechanics/plant-carrier";
import { animationProfile } from "../mechanics/animation";
import { restoreCreatureCommandAliases } from "../mechanics/creature-commands";
import { specialistBlockerWeight } from "../mechanics/specialist-motion";
import { requestAudio, requestAudioPlaybackRate } from "../mechanics/audio";
import { worldCell } from "../mechanics/terrain";
import { PROCESSOR_COLLECTOR_COUNT_OFFSET } from "../mechanics/processor-collector-state";
import { campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import { cleanupCampaignReferences } from "./cleanup";
import { campaignAirborneBuilding } from "./mule-damage-adapter";
import { campaignCreatureFootprintBuilding } from "./creature-command-adapter";
import { createStagedCampaignMulePlantCarrier } from "./plant-carrier-adapter";
import { igniteStagedPlant } from "./plant-fire-adapter";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import { insertSpatial, moveSpatial, unlinkSpatial } from "./spatial";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  retireStagedSharedEffect,
  createStagedSmokeEffect,
} from "./effect-scheduler";
import { i16 } from "./bytes";
export type CampaignProcessorCollectorServices = Pick<
  CampaignSpecialistServices,
  "effectOptions"
>;
const id = (index: number): SourceEntityId => `source:6:${index}`;
function syncCount(w: CampaignWorld) {
  w.missionPrefix[PROCESSOR_COLLECTOR_COUNT_OFFSET] = w.collectors.count;
}
/**Stable6D390 rows. No source overlay replaces these current native pools. */
function resolve(w: CampaignWorld, r: CollectorReference) {
  const limit = { 1: 300, 2: 512, 4: 256, 5: 200 }[r.kind];
  if (!Number.isInteger(r.index) || r.index < 0 || r.index >= limit)
    throw Error("Actual retained collector reference index required");
  return r.kind === 1
    ? w.creatureNative[r.index]
    : r.kind === 2
      ? w.ecology.plants[r.index]?.native
      : r.kind === 4
        ? w.buildingNative[r.index]
        : (w.powerEffects.slots[r.index]?.nativePrior ?? null);
}
function mirrorPlants(w: CampaignWorld) {
  for (const p of w.ecology.plants) {
    p.plantFlags = b(p.native, 46);
    p.position = [word(p.native, 7), word(p.native, 9)];
    p.shade = b(p.native, 23);
  }
}
function context(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
): ProcessorCollectorContext<CampaignWorld> {
  restoreCreatureCommandAliases(w);
  const records = w.collectors.records,
    players = w.players.map((p) => p.raw),
    held = new Map<string, (number | null)[]>(),
    options = () => services.effectOptions(w);
  const guard = <T>(run: () => T): T => {
    const result = run();
    if (
      w.collectors.records !== records ||
      w.players.some((p, i) => p.raw !== players[i]) ||
      records.some((n, i) => held.has(id(i)) && held.get(id(i)) !== n)
    )
      throw Error("Collector service replaced a held native/player identity");
    return result;
  };
  for (let i = 0; i < 32; i++) held.set(id(i), records[i]);
  const c: ProcessorCollectorContext<CampaignWorld> = {
    resolve: (s, r) => resolve(s, r) ?? null,
    profile: (_s, action) => {
      const asset = pack.assets.EFF;
      if (!asset) throw Error("Actual EFF collector resource required");
      return animationProfile(asset, action);
    },
    insert: (s, index) =>
      guard(() => {
        const n = records[index];
        insertSpatial(
          s.spatial,
          s.terrain,
          id(index),
          worldCell(word(n, 7), word(n, 9)),
        );
        synchronizeCampaignLinks(s);
      }),
    unlink: (s, index) =>
      guard(() => {
        unlinkSpatial(s.spatial, s.terrain, id(index));
        synchronizeCampaignLinks(s);
      }),
    cleanup: (s, index) =>
      guard(() => {
        cleanupCampaignReferences(s, id(index));
      }),
    ignitePlant: (s, index) =>
      guard(() => {
        igniteStagedPlant(s, index, pack, options(), (host, e) =>
          requestAudio(host.audio, {
            frame: host.frame,
            entity: e.entity,
            cue: e.channel,
            mode: e.mode,
            parameter: e.parameter,
            range: 64,
            gain: e.volume,
            initialRatePercent: e.ratePercent,
          }),
        );
      }),
    unlinkPlant: (s, index) =>
      guard(() => {
        unlinkSpatial(s.spatial, s.terrain, `source:1:${index}`);
        mirrorPlants(s);
        synchronizeCampaignLinks(s);
      }),
    createPlantCarrier: (s, q) =>
      guard(() => {
        const made = createStagedCampaignMulePlantCarrier(
          s,
          pack,
          q,
          options(),
        );
        return made
          ? {
              slot: made.slot,
              get native() {
                return s.powerEffects.slots[made.slot].nativePrior!;
              },
            }
          : null;
      }),
    attach: (s, t, parent) =>
      guard(() => {
        attachGroundMaterialPose(t, parent, {
          terrain: s.terrain,
          frame: s.frame,
          scrape: (q) => {
            createStagedSmokeEffect(
              s,
              { ...q, newborn: false },
              pack,
              options(),
            );
          },
          relocate: (n, oldCell, newCell) => {
            const target =
              `source:${b(n, 6) - 1}:${word(n, 15)}` as SourceEntityId;
            if (s.spatial.nodes[target]?.cell !== oldCell)
              throw Error("Collector attachment prior spatial cell differs");
            moveSpatial(s.spatial, s.terrain, target, newCell);
            synchronizeCampaignLinks(s);
          },
        });
      }),
    retireEffect: (s, index) =>
      guard(() => {
        retireStagedSharedEffect(s, index, options());
      }),
    dropPlantCarrier: (s, n) =>
      guard(() => {
        if (!pack.rules)
          throw Error("Original collector carrier drop tables required");
        const slot = word(n, 15),
          result = dropPlantCarrier(
            n,
            {
              terrain: s.terrain,
              tables: pack.rules.tables,
              bounce: pack.rules.tables.bounce,
              friction: pack.ecologyRules?.corpseFriction ?? [],
              gravity: options().gravity,
              water: s.source.source.terrain.loadedPhysicalWaterHeight,
              frame: s.frame,
              publishMotion: (n) => publishStagedSharedEffect(s, slot, n),
              particle: (q) => {
                if (q.code !== 21 && q.code !== 48)
                  throw Error("Actual collector water child required");
                return (
                  createStagedCampaignWater(
                    s,
                    { ...q, code: q.code },
                    pack,
                    options(),
                  ) !== null
                );
              },
              plant: (index) => {
                const p = s.ecology.plants[index];
                if (!p) throw Error("Collector retained plant missing");
                return p.native;
              },
              footprintBuilding: (p) => {
                const i = campaignCreatureFootprintBuilding(s, pack, p, 0);
                if (i === null) return null;
                const n = s.buildingNative[i];
                return {
                  selector: b(n, 45),
                  position: [word(n, 7), word(n, 9)],
                };
              },
              depositOffset: pack.creatureCommandRules?.corpseDepositOffset,
              relinkPlant: (index, p) => {
                insertSpatial(
                  s.spatial,
                  s.terrain,
                  `source:1:${index}`,
                  worldCell(word(p, 7), word(p, 9)),
                );
                mirrorPlants(s);
                synchronizeCampaignLinks(s);
              },
            },
            true,
          );
        if (result.retirementRequired)
          retireStagedSharedEffect(s, slot, options());
        mirrorPlants(s);
      }),
    feedback: (s, p, h) =>
      guard(() => {
        createStagedCampaignCollectorFeedback(s, p, h, pack, services);
      }),
    audio: (s, index, e) =>
      guard(() => {
        requestAudio(s.audio, {
          frame: s.frame,
          entity: id(index),
          cue: e.cue,
          mode: e.operation === "stop" ? 4 : 2,
          parameter: e.operation === "stop" ? 0 : 255,
          range: 64,
          gain: 127,
          initialRatePercent: 100,
        });
        if (e.operation === "play")
          requestAudioPlaybackRate(s.audio, {
            frame: s.frame,
            entity: id(index),
            cue: e.cue,
            ratePercent: e.rate!,
          });
      }),
    motion: (s, index) =>
      guard(() => {
        if (!pack.rules) throw Error("Actual collector motion tables required");
        stepStagedProcessorCollectorMotion(s, index, {
          tables: pack.rules.tables,
          gravity: i16(s.missionPrefix, 0x1c5d),
          water: s.source.source.terrain.loadedPhysicalWaterHeight,
          bounce: pack.rules.tables.bounce,
          selectedPlayer: s.selectedPlayer,
          obstacle: (s, p, mask, h) => {
            const hit = campaignAirborneBuilding(s, pack, p, h, mask);
            return hit
              ? {
                  index: word(hit.native, 15),
                  position: hit.position,
                  ground: hit.ground,
                }
              : null;
          },
          blockerWeight: (s, index, p) =>
            specialistBlockerWeight(
              records[index],
              campaignQueryEntities(s, [p])
                .filter((e) => e.id !== id(index))
                .map((e) => e.native),
            ),
          building: (s, index) => s.buildingNative[index],
          buildingTargetRadius: (s, index) => {
            const footprint =
              pack.rules!.tables.buildingFootprints[
                b(s.buildingNative[index], 45)
              ];
            const radius =
              pack.rules!.tables.buildingCombatHalfWidths?.[footprint];
            if (radius === undefined)
              throw Error(
                "Actual collector nominated-building radius required",
              );
            return radius;
          },
          relocate: (s, index, _before, after) => {
            moveSpatial(s.spatial, s.terrain, id(index), worldCell(...after));
            synchronizeCampaignLinks(s);
          },
          waterEffect: (s, q) => {
            createStagedCampaignWater(s, { ...q, owner: 0 }, pack, options());
          },
          cancel: (s, index) => {
            cancelStagedProcessorCollector(s, index, c);
          },
          damage: (s, index) => {
            damageStagedProcessorCollector(s, index, c);
          },
        });
      }),
  };
  return c;
}
/**14E2B ordinary code10 allocation. Capacity decline precedes ANB access. */
export function createStagedCampaignCollectorFeedback(
  w: CampaignWorld,
  p: [number, number],
  height: number,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
): number | null {
  const options = services.effectOptions(w),
    slot = allocateStagedSharedEffect(w, 10, pack, options);
  if (slot === null) return null;
  const held = w.powerEffects.slots[slot].nativePrior!,
    descriptor = pack.effectRules?.descriptors[10];
  if (!descriptor || !pack.assets.EFF)
    throw Error("Actual collector10 resource/descriptor required");
  const n = makeProcessorCollectorFeedback(
    held,
    slot,
    p,
    height,
    w.terrain,
    animationProfile(pack.assets.EFF, 10),
    descriptor,
  );
  publishStagedSharedEffect(w, slot, n);
  held.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
  w.powerEffects.slots[slot].nativePrior = held;
  synchronizeCampaignLinks(w);
  return slot;
}
export function dispatchStagedCampaignProcessorCollection(
  w: CampaignWorld,
  building: number,
  range: 1024 | 1536 | 2048,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
): boolean {
  const c = context(w, pack, services),
    n = w.buildingNative[building],
    query = queryProcessorCollection(w, n, range, (s, cell) =>
      campaignQueryEntities(s, [[(cell & 127) << 8, (cell >> 7) << 8]]).map(
        (e) => e.native,
      ),
    );
  const made = query
    ? createStagedProcessorCollector(w, { building, ...query }, c)
    : null;
  syncCount(w);
  mirrorPlants(w);
  return made !== null;
}
export function stepStagedCampaignProcessorCollector(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
): ProcessorCollectorReceipt {
  const out = stepStagedProcessorCollector(
    w,
    index,
    context(w, pack, services),
  );
  syncCount(w);
  mirrorPlants(w);
  return out;
}
/**14EC0 live ascending pass, no newborn skip or count-based early exit. */
export function stepStagedCampaignProcessorCollectors(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
): ProcessorCollectorReceipt[] {
  const out: ProcessorCollectorReceipt[] = [];
  for (let index = 0; index < 32; index++)
    if (b(w.collectors.records[index], 6) !== 0)
      out.push(stepStagedCampaignProcessorCollector(w, index, pack, services));
  return out;
}
export function damageStagedCampaignProcessorCollector(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
) {
  const out = damageStagedProcessorCollector(
    w,
    index,
    context(w, pack, services),
  );
  syncCount(w);
  mirrorPlants(w);
  return out;
}
/**Full-host atomic convenience wrapper; staged calls belong to outer callbacks. */
export function stepCampaignProcessorCollectors(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignProcessorCollectorServices,
): ProcessorCollectorReceipt[] {
  const s = structuredClone(w),
    options = services.effectOptions(s);
  options.stageHost?.(w, s);
  const out = stepStagedCampaignProcessorCollectors(s, pack, services);
  Object.assign(w, s);
  options.commitHost?.(w, s);
  return out;
}
