import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  stepGeneticistCallback,
  stepSpecialistLifecycleCallback,
  queueGeneticistInteraction,
  queueGeneticistMove,
  cancelGeneticistWork,
  cancelStagedGeneticistWork,
  readGeneticistMotion,
  type GeneticistCallbackContext,
  type GeneticistReceipt,
} from "../mechanics/geneticist";
import {
  damageSpecialist,
  retireSpecialist,
  stepSpecialistDamageState,
  type SpecialistDamageContext,
  type SpecialistDamageEvent,
} from "../mechanics/specialist-damage";
import {
  stepSpecialistMotion,
  stepStagedSpecialistMotion,
  specialistBlockerWeight,
  specialistApproachPoint,
  geneticistLineOfSight,
  specialistRevealRadius,
  escapeStagedSpecialistRay,
  resolveSpecialistMovePoint,
  type SpecialistMotionContext,
} from "../mechanics/specialist-motion";
import { createSourceParticle } from "../mechanics/landing";
import { ecologyTerrainClass, plantBlockerWeight } from "../mechanics/ecology";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { worldCell } from "../mechanics/terrain";
import {
  campaignEntity,
  campaignQueryEntities,
  synchronizeCampaignLinks,
} from "./entity-view";
import {
  campaignAirborneBuilding,
  damageCampaignMule,
} from "./mule-damage-adapter";
import {
  createStagedGeneticistShot,
  createStagedCampaignWater,
} from "./geneticist-effect-adapter";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  createStagedSpecialistCorpseEffect,
  cloneEffectHost,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import { cleanupCampaignReferences } from "./cleanup";
import type { SourceEntityId } from "./source-pools";
import { revealCampaignRadius } from "./reveal-adapter";
import { applyStagedSpecialistCharge } from "../mechanics/specialist-charge";
import {
  cancelSpecialistWithoutActiveRole,
  stepSpecialistAbductionCallback,
} from "../mechanics/specialist-abduction";
import { mapSpecialistDamageVoice } from "../mechanics/specialist-voice";
import { moveSpatial, copySpatialLinks, unlinkSpatial } from "./spatial";
import { i16, put16, u16 } from "./bytes";

export interface CampaignSpecialistServices {
  effectOptions(w: CampaignWorld): EffectSchedulerOptions<CampaignWorld>;
  damage?(w: CampaignWorld, index: number, amount: number): void;
  /** Actual construction cancellation for the modern construction projection. */
  cancelConstruction?(w: CampaignWorld, index: number): void;
  cancelRole?(w: CampaignWorld, index: number): void;
}
/** Native blueprint bytes are authoritative during role/damage callbacks.
 * Refresh the UI/carry projection before synchronizePlayer serializes it. */
export function synchronizeCampaignSpecialistBlueprints(
  w: CampaignWorld,
): void {
  for (const p of w.players)
    for (const bp of p.blueprints) {
      const at = 0x16 + bp.index * 36;
      let name = "";
      for (let i = 0; i < 20 && p.raw[at + i] !== 0; i++)
        name += String.fromCharCode(p.raw[at + i]);
      bp.name = name;
      bp.skill = p.raw[at + 23];
      bp.maxHealth = p.raw[at + 25];
      bp.health = (p.raw[at + 26] << 24) >> 24;
      bp.runtimeFlags = p.raw[at + 32];
    }
}
function consumeDamageEvents(
  w: CampaignWorld,
  index: number,
  events: readonly SpecialistDamageEvent[],
  pack: Pack,
): void {
  for (const e of events) {
    if (e.type === "specialist-voice") {
      const sequence = w.presentation.voiceSequence ?? 0;
      if (
        !Number.isSafeInteger(sequence) ||
        sequence < 0 ||
        sequence >= Number.MAX_SAFE_INTEGER
      )
        throw new Error("Invalid specialist voice sequence");
      w.presentation.voiceSequence = sequence + 1;
      w.presentation.pending.push({
        frame: w.frame,
        event: {
          type: "specialist-voice",
          sequence,
          request: mapSpecialistDamageVoice(e, {
            frame: w.frame,
            owner: Math.floor(e.index / 5),
            pathPrefix: "",
            profile: pack.specialistVoiceProfile,
            sounds: pack.sounds,
          }),
        },
      });
      if (w.presentation.pending.length > 128) w.presentation.pending.shift();
    }
    if (e.type === "specialist-retired") {
      const retired = e.retiredIndex;
      if (retired !== null) {
        w.ecology.otherEntities = w.ecology.otherEntities.filter(
          (e) => e.id !== `source:2:${retired}`,
        );
        const a = w.actors.find((a) => a.id === retired);
        if (a) {
          a.ready = false;
          a.goal = null;
          a.route = [];
          a.orders = [];
          a.reason = e.reason === "death" ? "Dead" : "Removed";
        }
        const b = w.builders.find((b) => b.id === retired);
        if (b) {
          b.enabled = false;
          b.task = null;
        }
      }
    }
  }
  synchronizeCampaignSpecialistBlueprints(w);
  if (w.specialists.records[index][6] === 3) {
    mirrorCampaignSpecialist(w, index);
    const a = w.actors.find((a) => a.id === index)!;
    if (w.specialists.records[index][85] === 4) a.reason = "Dying";
    else if (w.specialists.records[index][85] === 5) a.reason = "Injured";
  }
}
export function campaignSpecialistDamageContext(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): SpecialistDamageContext<CampaignWorld> {
  return {
    //The modern sidebar derives selection/removal from world entities; the
    //original DOS unit-panel16 is not active in this host.
    unitPanelActive: false,
    selectedActor: null,
    cancelWork: (s, index) =>
      cancelStagedCampaignSpecialistWork(s, index, pack, services),
    unlink: (s, index) => {
      const id = `source:2:${index}` as const;
      if (s.spatial.nodes[id]) unlinkSpatial(s.spatial, s.terrain, id);
      synchronizeCampaignLinks(s);
    },
    cleanupReferences: (s, target) => {
      cleanupCampaignReferences(s, `source:2:${target.index}`);
    },
    profile: (s, index, action) =>
      animationProfile(
        pack.assets[s.specialists.bindings[index]!.assetKey],
        action,
      ),
    corpse: (s, _index, request) =>
      createStagedSpecialistCorpseEffect(
        s,
        request,
        pack,
        services.effectOptions(s),
      ) !== null,
  };
}
/** Complete existing role release plus the source51E80 common stop. The
 * construction projection remains an explicitly documented modern bridge. */
export function cancelStagedCampaignSpecialistWork(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const binding = w.specialists.bindings[index]!;
  if (binding.category === 2)
    cancelStagedGeneticistWork(w, index, binding.owner);
  else if (binding.category === 1) {
    if (!services.cancelRole)
      throw new Error("Actual Botanist cancellation service required");
    services.cancelRole(w, index);
  } else if (
    binding.category === 0 &&
    (w.builders.find((b) => b.id === index)?.task ||
      w.specialists.records[index][130] !== 0 ||
      w.specialists.records[index][88]! & 1)
  ) {
    if (!services.cancelConstruction)
      throw new Error("Actual specialist construction cancellation required");
    services.cancelConstruction(w, index);
  }
  const n = w.specialists.records[index],
    after = cancelSpecialistWithoutActiveRole(n);
  n.splice(0, n.length, ...after);
  const a = w.actors.find((a) => a.id === index)!;
  a.goal = null;
  a.route = [];
  a.orders = [];
  mirrorCampaignSpecialist(w, index);
}
/** Already-isolated damage port: retained native/player pointers survive. */
export function damageCampaignSpecialist(
  w: CampaignWorld,
  index: number,
  amount: number,
  attacker: SourceEntityId | null,
  pack: Pack,
  services: CampaignSpecialistServices,
): boolean {
  const e = attacker ? campaignEntity(w, attacker) : null;
  if (attacker && !e)
    throw new Error("Actual specialist damage attacker missing");
  //Construction currently has an explicit modern controller projection. Retire
  //its active job on lethal damage even while that projection has no native58
  //task bit. This bridge cannot leave an invisible immortal builder working.
  const binding = w.specialists.bindings[index]!,
    raw = w.players[binding.owner].raw,
    health = (raw[0x16 + binding.blueprintIndex * 36 + 26] << 24) >> 24,
    effective = binding.style === 1 ? Math.max(1, amount >> 1) : amount;
  if (
    binding.category === 0 &&
    !(w.specialists.records[index][88]! & 1) &&
    health - effective <= 0 &&
    w.builders.find((b) => b.id === index)?.task
  ) {
    if (!services.cancelConstruction)
      throw new Error("Actual specialist construction cancellation required");
    services.cancelConstruction(w, index);
  }
  const r = damageSpecialist(
    w,
    index,
    amount,
    e ? { index: e.index, kind: e.kind } : null,
    campaignSpecialistDamageContext(w, pack, services),
  );
  consumeDamageEvents(w, index, r.events, pack);
  return r.dead;
}
export function retireCampaignSpecialist(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const events = retireSpecialist(
    w,
    index,
    campaignSpecialistDamageContext(w, pack, services),
  );
  consumeDamageEvents(w, index, events, pack);
}
export function mirrorCampaignSpecialist(
  w: CampaignWorld,
  index: number,
): void {
  const a = w.actors.find((a) => a.id === index),
    n = w.specialists.records[index];
  if (!a || n[6] !== 3)
    throw new Error("Specialist native mirror binding missing");
  a.motion = readGeneticistMotion(n);
  a.animation = {
    action: n[25]!,
    hold: n[26]!,
    frame: n[27]!,
    direction: (n[28]! << 24) >> 24,
    delay: (n[29]! << 24) >> 24,
    counter: (n[30]! << 24) >> 24,
  };
  const builder = w.builders.find((b) => b.id === index);
  if (builder) builder.motion = a.motion;
}
export function campaignSpecialistMotionContext(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): SpecialistMotionContext<CampaignWorld> {
  if (!pack.rules) throw new Error("Original specialist motion tables missing");
  return {
    tables: pack.rules.tables,
    gravity: i16(w.missionPrefix, 0x1c5d),
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    bounce: pack.rules.tables.bounce,
    selectedPlayer: w.selectedPlayer,
    obstacle: (w, p, mask, height) => {
      const result = campaignAirborneBuilding(w, pack, p, height, mask);
      return result
        ? {
            index: i16(result.native as number[], 15),
            position: result.position,
            ground: result.ground,
          }
        : null;
    },
    blockerWeight: (w, index, p) => {
      const n = w.specialists.records[index],
        binding = w.specialists.bindings[index]!;
      if (binding.category === 1 && n[129] === 2) {
        const target = campaignEntity(w, `source:1:${u16(n as number[], 127)}`);
        if (target && worldCell(...target.position) === worldCell(...p))
          return 0;
      }
      return specialistBlockerWeight(
        n,
        campaignQueryEntities(w, [p])
          .filter((e) => e.id !== `source:2:${index}`)
          .map((e) => e.native),
      );
    },
    building: (w, index) => w.buildingNative[index],
    relocate: (w, index, _before, after) => {
      const id = `source:2:${index}` as const;
      moveSpatial(w.spatial, w.terrain, id, worldCell(...after));
      synchronizeCampaignLinks(w);
    },
    waterEffect: (w, request) => {
      createStagedCampaignWater(
        w,
        { ...request, owner: 0 },
        pack,
        services.effectOptions(w),
      );
    },
    damage: (w, index, amount) => {
      if (!services.damage)
        throw new Error("Original specialist damage service required");
      services.damage(w, index, amount);
    },
    reveal: (w, index) => {
      if (!pack.geneticistRules)
        throw new Error("Original specialist reveal radii missing");
      const n = w.specialists.records[index];
      revealCampaignRadius(
        w,
        [i16(n as number[], 7), i16(n as number[], 9)],
        specialistRevealRadius(w, index, pack.geneticistRules),
      );
    },
  };
}
export function boundSpecialistMotionContext(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): SpecialistMotionContext<CampaignWorld> {
  return campaignSpecialistMotionContext(w, pack, services);
}
export function stepCampaignSpecialistMotion(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const staged = cloneEffectHost(w, services.effectOptions(w));
  stepStagedSpecialistMotion(
    staged,
    index,
    boundSpecialistMotionContext(staged, pack, services),
  );
  mirrorCampaignSpecialist(staged, index);
  Object.assign(w, staged);
}
function footstep(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
  request: Parameters<
    NonNullable<GeneticistCallbackContext<CampaignWorld>["footstep"]>
  >[1],
): void {
  createStagedCampaignSpecialistParticle(w, pack, services, {
    ...request,
    code: 6,
    newborn: false,
  });
}
/** Real shared48790 feedback. The caller has already consumed its draws;
 * successful6/26 factories consume the ANB delay draw on this same RNG. */
export function createStagedCampaignSpecialistParticle(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
  request: Parameters<typeof createSourceParticle>[0],
): number | null {
  const options = services.effectOptions(w),
    slot = allocateStagedSharedEffect(w, request.code, pack, options);
  if (slot === null) return null;
  const particle = createSourceParticle(request, w.rng, {
    terrain: w.terrain,
    tables: pack.rules!.tables,
    bounce: pack.rules!.tables.bounce,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    gravity: i16(w.missionPrefix, 0x1c5d),
    frame: w.frame,
    profile: (code) => animationProfile(pack.assets.EFF, code),
    plantBlockerWeight: (cell) => plantBlockerWeight(w.ecology, cell),
    occupiedEffectSlots: w.powerEffects.slots.flatMap((p, i) =>
      p.occupied ? [i] : [],
    ),
    slotPriors: w.powerEffects.slots,
  });
  if (!particle?.native || particle.slot !== slot)
    throw new Error("Actual specialist feedback allocation differs");
  publishStagedSharedEffect(w, slot, particle.native);
  synchronizeCampaignLinks(w);
  put16(
    w.missionPrefix,
    0x3554,
    w.powerEffects.slots.filter((e) => e.occupied).length,
  );
  return slot;
}
export function campaignGeneticistContext(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignSpecialistServices,
): GeneticistCallbackContext<CampaignWorld> {
  if (!pack.rules || !pack.geneticistRules)
    throw new Error("Original Geneticist rules missing");
  const motion = (s: CampaignWorld) =>
    boundSpecialistMotionContext(s, pack, services);
  return {
    rules: pack.geneticistRules,
    stageWorld: (original) =>
      cloneEffectHost(original, services.effectOptions(original)),
    charge: (s, index) => {
      for (const mule of s.ecology.mules)
        s.creatureNative[mule.index] = mule.native;
      applyStagedSpecialistCharge(s, index);
    },
    tables: pack.rules.tables,
    globalFlags: w.flags,
    runtimeMode: w.runtimeMode,
    override180d80: 0,
    runtimeCount11c2bc: u16(w.missionPrefix, 0x355c),
    cellOrder: (s, cell) =>
      campaignQueryEntities(s, [[(cell & 127) * 256, (cell >> 7) * 256]]).map(
        (e) => e.id,
      ),
    animation: (s, index, action) =>
      animationProfile(
        pack.assets[s.actors.find((a) => a.id === index)!.art],
        action,
      ),
    motion: (s, index) => {
      stepStagedSpecialistMotion(s, index, motion(s));
    },
    resolveMovePoint: (s, index, p) =>
      resolveSpecialistMovePoint(s, index, p, motion(s)),
    lineOfSight: (s, index, target) =>
      geneticistLineOfSight(s, index, target, motion(s)),
    approachPoint: (s, index, target, distance) => {
      const a = campaignEntity(s, `source:2:${index}`),
        m = campaignEntity(s, `source:0:${target}`);
      if (!a || !m)
        throw new Error("Actual Geneticist approach endpoints missing");
      return specialistApproachPoint(
        a.position,
        m.position,
        distance,
        pack.rules!.tables,
      );
    },
    escapeRay: (s, index, heading, distance) =>
      escapeStagedSpecialistRay(s, index, heading, distance, motion(s)),
    fireShot: (s, shot) =>
      createStagedGeneticistShot(s, shot, pack, services.effectOptions(s)),
    damageMule: (s, target, amount, actor) => {
      damageCampaignMule(s, pack, target, amount, `source:2:${actor}`);
    },
    terrainClass: (s, p) => ecologyTerrainClass(s.terrain, p),
    footstep: (s, request) => footstep(s, pack, services, request),
    lifecycle: (s, index) => {
      const r = stepSpecialistDamageState(
        s,
        index,
        campaignSpecialistDamageContext(s, pack, services),
      );
      consumeDamageEvents(s, index, r.events, pack);
      return { handled: r.handled, retired: r.retired };
    },
  };
}
export function consumeCampaignGeneticistReceipt(
  w: CampaignWorld,
  index: number,
  r: GeneticistReceipt,
): void {
  synchronizeCampaignSpecialistBlueprints(w);
  for (const e of r.events)
    if (e.type === "audio")
      requestAudio(w.audio, {
        frame: w.frame,
        entity: `source:2:${index}`,
        cue: e.cue,
        mode: e.mode === "stop" ? 4 : e.mode,
        parameter: e.parameter,
        gain: 1,
        range: null,
      });
  if (w.specialists.records[index][6] === 0) return;
  mirrorCampaignSpecialist(w, index);
  const a = w.actors.find((a) => a.id === index)!,
    n = w.specialists.records[index];
  a.reason =
    n[85] === 4
      ? "Dying"
      : n[85] === 5
        ? "Injured"
        : r.events.some((e) => e.type === "research")
          ? "Researching Mule DNA"
          : r.events.some((e) => e.type === "healing")
            ? "Healing Mule"
            : r.events.some((e) => e.type === "shot" && e.created)
              ? "Capturing Mule"
              : n[85] === 8
                ? "Moving"
                : n[85] === 11
                  ? n[126] === 1
                    ? "Healing Mule"
                    : "Capturing and researching Mule"
                  : "Idle";
}
export function stepCampaignGeneticist(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const r = stepGeneticistCallback(
    w,
    index,
    campaignGeneticistContext(w, pack, services),
  );
  consumeCampaignGeneticistReceipt(w, index, r);
}
export function stepCampaignSpecialistLifecycle(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const r = stepSpecialistLifecycleCallback(
    w,
    index,
    campaignGeneticistContext(w, pack, services),
  );
  consumeCampaignGeneticistReceipt(w, index, r);
}
export function stepCampaignSpecialistAbduction(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  consumeCampaignGeneticistReceipt(
    w,
    index,
    stepSpecialistAbductionCallback(w, index, {
      ...campaignGeneticistContext(w, pack, services),
      abductionServices: {
        parent: (s, visitorIndex) =>
          s.ethereals.records[visitorIndex]?.native ?? null,
        particle: (s, request) =>
          createStagedCampaignSpecialistParticle(s, pack, services, request),
      },
    }),
  );
  if (w.specialists.records[index][6] === 3)
    w.actors.find((a) => a.id === index)!.reason = "Being abducted";
}
export function requestCampaignGeneticist(
  w: CampaignWorld,
  index: number,
  task: 0 | 1,
  target: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const r = queueGeneticistInteraction(
    w,
    index,
    { task, target, callerOwner: w.selectedPlayer },
    campaignGeneticistContext(w, pack, services),
  );
  consumeCampaignGeneticistReceipt(w, index, r);
}
export function moveCampaignGeneticist(
  w: CampaignWorld,
  index: number,
  p: [number, number],
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const r = queueGeneticistMove(
    w,
    index,
    { callerOwner: w.selectedPlayer, point: p },
    campaignGeneticistContext(w, pack, services),
  );
  consumeCampaignGeneticistReceipt(w, index, r);
}
export function stopCampaignGeneticist(w: CampaignWorld, index: number): void {
  const r = cancelGeneticistWork(w, index, w.selectedPlayer);
  // Modern Stop also clears commands queued while paused;51E80 itself leaves
  // these source pending bits intact. It does not fabricate an idle RNG draw.
  w.specialists.records[index][87] = w.specialists.records[index][87]! & 252;
  consumeCampaignGeneticistReceipt(w, index, r);
}
