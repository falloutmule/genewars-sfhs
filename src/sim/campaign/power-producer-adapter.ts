/** Full native3/6 callback inside the owner's existing47F80 transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import type {
  EconomyEvent,
  EconomyReason,
  PowerProducerState,
} from "../mechanics/economy";
import {
  stepStagedNativePowerProducer,
  type PowerProducerReceipt,
  type PowerProducerTransfer,
} from "../mechanics/power-producer";
import { animationProfile } from "../mechanics/animation";
import { requestAudio } from "../mechanics/audio";
import { groundHeight } from "../mechanics/terrain";
import {
  launchPowerPackets,
  effectTerrainShade,
} from "../mechanics/power-motion";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
} from "./effect-scheduler";
import { campaignBuildingAsset } from "./building-startup-adapter";
import { synchronizeCampaignLinks } from "./entity-view";
import { i16, put16, u16 } from "./bytes";

export interface PowerProducerPresentationRequest {
  type: "building-queue-request";
  entry: 0x83140;
  sourceCapacity: 256;
  slot: number;
  frame: number;
  action: 0 | 1 | 2 | 3 | 4;
  animationFrame: number;
  /** Actual source request; camera/frontscreen admission is not synthesized. */
  originalQueueOutcome: "not-modeled";
}
export interface CampaignPowerProducerReceipt extends PowerProducerReceipt {
  events: EconomyEvent[];
  reasons: { buildingId: number; reason: EconomyReason }[];
  factoriesAlreadyApplied: true;
  presentationRequests: PowerProducerPresentationRequest[];
}
export type CampaignPowerProducerServices = Pick<
  CampaignSpecialistServices,
  "effectOptions"
>;

function current(w: CampaignWorld, slot: number) {
  const n = w.buildingNative[slot],
    b = w.buildings.find((v) => v.slot === slot),
    e = w.economy.buildings.find((v) => v.owner * 64 + v.slot === slot);
  if (
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot > 255 ||
    !n ||
    n.length !== 67 ||
    n[6] !== 4 ||
    ![3, 6, 8].includes(n[45]!) ||
    n[24] !== Math.floor(slot / 64) ||
    i16(n as number[], 15) !== slot ||
    !b ||
    !e ||
    b.id !== e.id ||
    b.owner !== n[24] ||
    e.owner !== n[24] ||
    b.selector !== n[45] ||
    e.selector !== n[45]
  )
    throw Error("Actual producer native/building/economy binding required");
  if (
    [
      ...n.slice(7, 11),
      ...n.slice(25, 31),
      ...n.slice(43, 51),
      ...n.slice(61, 64),
    ].some((v) => v === null)
  )
    throw Error("Actual producer numeric prior is unknown");
  return { n, b, e };
}
/** Hydrate actual native priors after Engineer progress/upgrade. This must run
 * before any legacy normalized-to-native mirror. Existing metadata stays held. */
export function refreshStagedCampaignPowerProducer(
  w: CampaignWorld,
  slot: number,
): void {
  const { n, b, e } = current(w, slot),
    flags = u16(n as number[], 49),
    grade = n[46]!;
  if (grade > 2) throw Error("Actual producer grade0..2 required");
  b.x = e.x = i16(n as number[], 7);
  b.y = e.y = i16(n as number[], 9);
  b.grade = e.grade = grade as 0 | 1 | 2;
  b.health = i16(n as number[], 43);
  b.complete = e.complete = !!(flags & 1);
  b.energy = e.energy = i16(n as number[], 61);
  e.powered = !!(flags & 4);
  e.disabled = !!(flags & 0x40);
  e.capacitySuppressed = !!(flags & 0x840);
  e.hqUpgradeSuppressed = !!(flags & 0x140);
  e.depleted = !!(flags & 0x200);
  e.extraDrain = n[63]!;
  const animation = {
    action: n[25]!,
    hold: n[26]!,
    frame: n[27]!,
    direction: (n[28]! << 24) >> 24,
    delay: (n[29]! << 24) >> 24,
    counter: (n[30]! << 24) >> 24,
  };
  if (e.producer) Object.assign(e.producer.animation, animation);
  else
    e.producer = {
      animation,
      audioRequested: false,
      audioRequests: [],
      lastFrame: null,
      lastPulse: false,
      lastDraw: null,
    };
  const player = w.players.find((p) => p.id === n[24]),
    ep = w.economy.players.find((p) => p.id === n[24]);
  if (
    !player ||
    !ep ||
    player.raw.length !== 1805 ||
    player.raw[0x4a1] !== n[24] ||
    player.raw[0x4ad] === undefined ||
    player.raw[0x4ae] === undefined
  )
    throw Error("Actual producer generated-energy player binding required");
  ep.generatedEnergy = i16(player.raw, 0x4ad);
}
/** Source482F2, once at the owner's actual pass start, not once per producer. */
export function resetStagedCampaignPowerGenerated(
  w: CampaignWorld,
  owner: number,
): void {
  const p = w.players.find((v) => v.id === owner),
    e = w.economy.players.find((v) => v.id === owner);
  if (
    !Number.isInteger(owner) ||
    owner < 0 ||
    owner > 3 ||
    !p ||
    !e ||
    p.raw.length !== 1805 ||
    p.raw[1] !== owner ||
    p.raw[0x4a1] !== owner
  )
    throw Error("Actual producer owner generated-energy reset required");
  put16(p.raw, 0x4ad, 0);
  e.generatedEnergy = 0;
}

/** Allocate/retire through the shared host, then reuse the already validated
 * pure33 factory. Only the allocated native image/packet is installed. */
function createTransfer(
  w: CampaignWorld,
  q: PowerProducerTransfer,
  pack: Pack,
  services: CampaignPowerProducerServices,
  events: EconomyEvent[],
): number {
  const source = current(w, q.sourceSlot),
    targetNative = w.buildingNative[q.targetSlot],
    target = w.economy.buildings.find(
      (v) => v.owner * 64 + v.slot === q.targetSlot,
    );
  if (
    !targetNative ||
    !target ||
    q.destination[1] !== 4 ||
    q.destination[0] !== q.targetSlot ||
    targetNative[6] !== 4 ||
    targetNative[24] !== target.owner ||
    targetNative[45] !== target.selector ||
    target.x !== q.targetPoint[0] ||
    target.y !== q.targetPoint[1]
  )
    throw Error("Actual33 recipient building/projection required");
  const priors = w.powerEffects.slots.map((v) => v.nativePrior),
    slot = allocateStagedSharedEffect(w, 33, pack, services.effectOptions(w));
  if (slot === null)
    throw Error("Actual shared33 factory has no allocatable slot");
  if (!pack.rules || !pack.assets.EFF)
    throw Error("Original33 motion/EFF resource required");
  const profile = animationProfile(pack.assets.EFF, 33);
  if (
    profile.flags !== 0 ||
    profile.holds.length !== 4 ||
    profile.holds.some((h) => h !== 0)
  )
    throw Error("Original33 four-frame zero-hold animation required");
  const id = w.economy.nextPacketId,
    launched = launchPowerPackets(
      w.powerEffects,
      [
        {
          id,
          sourceId: source.e.id,
          targetId: target.id,
          x: q.sourcePoint[0],
          y: q.sourcePoint[1],
          targetX: q.targetPoint[0],
          targetY: q.targetPoint[1],
          destinationIndex: q.destination[0],
          payload: q.payload,
        },
      ],
      pack.rules.tables,
      (x, y) => groundHeight(w.terrain, x, y),
      (x, y) => effectTerrainShade(w.terrain, x, y),
    );
  if (!launched.ok) throw Error(launched.reason);
  if (
    launched.value.allocated.length !== 1 ||
    launched.value.allocated[0].slot !== slot
  )
    throw Error("Shared33 allocation differs from actual free slot");
  const made = launched.value.pool.slots[slot],
    held = priors[slot];
  if (!held || !made.nativePrior || !made.packet)
    throw Error("Actual33 retained shared native required");
  publishStagedSharedEffect(w, slot, made.nativePrior);
  held.splice(0, held.length, ...w.powerEffects.slots[slot].nativePrior!);
  const shared = w.powerEffects.slots[slot];
  shared.nativePrior = held;
  shared.packet = made.packet;
  const packet = {
    id,
    sourceId: source.e.id,
    targetId: target.id,
    payload: q.payload,
    x: q.sourcePoint[0],
    y: q.sourcePoint[1],
  };
  w.economy.nextPacketId++;
  w.economy.packets.push(packet);
  synchronizeCampaignLinks(w);
  events.push({ type: "packet-launched", packet });
  return slot;
}

/** Exactly one source callback. The enclosing47F80 transaction owns rollback;
 * this entry never clones/replaces the native, player or economy roots. */
export function stepStagedCampaignPowerProducer(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignPowerProducerServices,
): CampaignPowerProducerReceipt {
  if (!pack.buildingRules)
    throw Error("Original power producer building rules required");
  refreshStagedCampaignPowerProducer(w, slot);
  const { n, b, e } = current(w, slot),
    oldPower = e.powered,
    events: EconomyEvent[] = [],
    presentationRequests: PowerProducerPresentationRequest[] = [];
  const receipt = stepStagedNativePowerProducer(w, slot, {
    upkeep: pack.buildingRules.upkeep,
    solarGeneration: w.source.source.terrain.solarGeneration,
    groundHeight: (s, x, y) => groundHeight(s.terrain, x, y),
    profile: (s, i, action) =>
      animationProfile(
        pack.assets[campaignBuildingAsset(pack, s.buildingNative[i][45]!)],
        action,
      ),
    createTransfer: (s, q) => createTransfer(s, q, pack, services, events),
    audio(s, i, request) {
      requestAudio(s.audio, {
        frame: s.frame,
        entity: `source:3:${i}`,
        cue: request.channel,
        mode: request.type === "stop" ? 4 : request.mode,
        parameter: request.type === "stop" ? 0 : request.parameter,
        gain: request.type === "stop" ? 1 : request.volume / 127,
        range: request.type === "stop" ? null : request.range,
      });
    },
    queueBuilding(s, i) {
      const current = s.buildingNative[i],
        action = current[25],
        frame = current[27];
      if (
        action === null ||
        action === undefined ||
        action < 0 ||
        action > 4 ||
        frame === null ||
        frame === undefined ||
        frame < 0 ||
        frame > 255 ||
        presentationRequests.length
      )
        throw Error(
          "Actual bounded83140 producer presentation request required",
        );
      presentationRequests.push({
        type: "building-queue-request",
        entry: 0x83140,
        sourceCapacity: 256,
        slot: i,
        frame: s.frame,
        action: action as 0 | 1 | 2 | 3 | 4,
        animationFrame: frame,
        originalQueueOutcome: "not-modeled",
      });
    },
  });
  if (
    w.buildingNative[slot] !== n ||
    w.buildings.find((v) => v.slot === slot) !== b ||
    w.economy.buildings.find((v) => v.id === e.id) !== e
  )
    throw Error("Producer factory replaced its held host projection");
  refreshStagedCampaignPowerProducer(w, slot);
  const producer = e.producer as PowerProducerState;
  producer.audioRequested = receipt.audio.length > 0;
  producer.audioRequests.splice(
    0,
    producer.audioRequests.length,
    ...receipt.audio,
  );
  producer.lastFrame = w.frame;
  producer.lastPulse = receipt.pulse;
  producer.lastDraw = receipt.draw;
  if (receipt.operational)
    events.unshift({
      type: "power-generated",
      buildingId: b.id,
      amount: receipt.generated,
    });
  if (oldPower !== e.powered)
    events.push({
      type: e.powered ? "power-restored" : "power-lost",
      buildingId: b.id,
    });
  const reason: EconomyReason = !e.complete
    ? "under-construction"
    : !receipt.operational
      ? "disabled"
      : receipt.createdSlots.length
        ? "power-dispatched"
        : receipt.pulse
          ? "no-recipients"
          : "pulse-wait";
  return {
    ...receipt,
    events,
    reasons: [{ buildingId: b.id, reason }],
    factoriesAlreadyApplied: true,
    presentationRequests,
  };
}

/** Standalone atomic wrapper. The ordinary owner pass uses the staged entry
 * above so one late failure also rolls back all preceding owner callbacks. */
export function stepCampaignPowerProducer(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignPowerProducerServices,
): CampaignPowerProducerReceipt {
  const staged = structuredClone(w),
    options = services.effectOptions(w);
  options.stageHost?.(w, staged);
  for (const mule of staged.ecology.mules)
    staged.creatureNative[mule.index] = mule.native;
  const receipt = stepStagedCampaignPowerProducer(staged, slot, pack, services);
  Object.assign(w, staged);
  options.commitHost?.(w, staged);
  return receipt;
}
