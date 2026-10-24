/** Independently expressed Exceland economy. Original numeric profiles are inputs,
 * never defaults. See docs/mechanics/ECONOMY.md for evidence and host obligations. */
import type { AnimationState } from "./animation";
import type { RecyclingEvent } from "./building-startup";
export type Grade = 0 | 1 | 2;
export type GradeValues = readonly [number, number, number];
export interface EconomyRules {
  evidence: string;
  cellSize: number;
  power: {
    distributorGeneration: GradeValues;
    distributorRange: GradeValues;
    distributorCapacity: number;
    distributorPulsePeriod: number;
    distributorPulsePhase: GradeValues;
    photonReleaseThreshold: number;
    photonReleaseAmount: number;
    packetPayloadCap: number;
    consumerCapacity: number;
    deliveryRadius: number;
    noPowerWarningTicks: number;
    noPowerWarningCooldownTicks: number;
  };
  extractor: {
    upkeep: number;
    harvestRadius: number;
    harvestUnits: GradeValues;
    goopPerResource: number;
    cycleLength: number;
    startFrame: number;
    resetFrame: number;
    harvestFrames: readonly number[];
    workDelay: number;
    harvestExtraDrain: number;
    /** Source ANB holds for each admitted grade; do not synthesize missing grades. */
    frameHolds: readonly [
      readonly number[],
      readonly number[],
      readonly number[],
    ];
  };
  capacity: {
    extractor: number;
    store4: GradeValues;
    store13: GradeValues;
    unusedGoopWarningTicks: number;
  };
}
export interface ExtractorCycle {
  cycle: number;
  frame: number;
  delay: number;
  hold: number;
  stepDelay: number;
  workAudioActive: boolean;
}
export type PowerProducerAudio =
  | { type: "stop"; channel: 35 }
  | {
      type: "play";
      channel: 35 | 61;
      mode: 2;
      parameter: 0 | 255;
      volume: 90 | 127;
      range: number;
    };
export interface PowerProducerState {
  animation: AnimationState;
  audioRequested: boolean;
  audioRequests: PowerProducerAudio[];
  lastFrame: number | null;
  lastPulse: boolean;
  lastDraw: number | null;
}
export interface EconomyBuilding {
  id: number;
  /** Native owner-partition order, independent of entity ID and array order. */
  slot: number;
  owner: number;
  selector: number;
  grade: Grade;
  x: number;
  y: number;
  complete: boolean;
  disabled: boolean;
  /** Decoded source 0x840 flags; completion/power are separate conditions. */
  capacitySuppressed: boolean;
  /** Decoded source 0x140 flags, for operational HQ grade only. */
  hqUpgradeSuppressed: boolean;
  powered: boolean;
  energy: number;
  extraDrain: number;
  depleted: boolean;
  storedGoop: number;
  /** Selector12's conditional special effects are not silently discarded. */
  specialPowerDelivery: boolean;
  extractor?: ExtractorCycle;
  producer?: PowerProducerState;
}
export interface EconomyPlayer {
  id: number;
  /** Secondary resource (+4A7), distinct from construction funds (+4A3). */
  goop: number;
  capacity: number;
  maxOperationalHQGrade: number;
  generatedEnergy: number;
  noPowerWarningTicks: number;
  unusedGoopWarningTicks: number;
}
export interface EnergyPacket {
  id: number;
  sourceId: number;
  targetId: number;
  payload: number;
  x: number;
  y: number;
}
export interface EconomyState {
  width: number;
  height: number;
  /** Row-major source resource amounts, separate from terrain presentation. */
  resources: number[];
  buildings: EconomyBuilding[];
  players: EconomyPlayer[];
  packets: EnergyPacket[];
  nextPacketId: number;
}
/** Transaction copy of every mutable economy record, including retained
 * producer animation and pending audio requests. Numeric rule inputs are not
 * part of this state and remain separate. */
export function cloneEconomyState(before: EconomyState): EconomyState {
  return {
    ...before,
    resources: before.resources.slice(),
    players: before.players.map((player) => ({ ...player })),
    buildings: before.buildings.map((building) => ({
      ...building,
      ...(building.extractor ? { extractor: { ...building.extractor } } : {}),
      ...(building.producer
        ? {
            producer: {
              ...building.producer,
              animation: { ...building.producer.animation },
              audioRequests: building.producer.audioRequests.map((request) => ({
                ...request,
              })),
            },
          }
        : {}),
    })),
    packets: before.packets.map((packet) => ({ ...packet })),
  };
}
export interface EconomyContext {
  frame: number;
  /** Explicit mission solar global; zero is meaningful and is not a default. */
  solarGeneration: number;
  /** Postphysics samples for packets the host actually advanced this callback.
   * Missing samples pause those packets; they do not invent motion or decay. */
  packetSamples: readonly {
    id: number;
    x: number;
    y: number;
    targetValid?: boolean;
  }[];
  /** Contact queries/damage are host work. Every harvesting callback must have
   * its ordered contact pass resolved before this family can commit. */
  contactResolvedBuildingIds: readonly number[];
  /** Explicit full native11 ownership. Its callback must handle every11 row;
   * the separately admitted native profile replaces legacy ANB validation. */
  nativeExtractorCallbacks?: true;
  /** Already-isolated host services. They receive this callback's mutable
   * economy afterimage; they must not publish it before the family succeeds. */
  services?: EconomyPhaseServices;
}
export interface EconomyPhaseServices {
  contactResolved?(state: EconomyState, building: EconomyBuilding): boolean;
  /** Source482F2 owner prefix, including owners with no active buildings. */
  beforeOwner?(state: EconomyState, player: EconomyPlayer): void;
  beforeBuilding?(
    state: EconomyState,
    building: EconomyBuilding,
    player: EconomyPlayer,
  ): void;
  /** True means the entire native callback, including its common tail, ran. */
  buildingCallback?(
    state: EconomyState,
    building: EconomyBuilding,
    player: EconomyPlayer,
    events: EconomyEvent[],
  ): boolean;
  afterBuilding?(
    state: EconomyState,
    building: EconomyBuilding,
    player: EconomyPlayer,
    events: readonly EconomyEvent[],
  ): void;
  /** True replaces bounded generic storage with the actual owner437A0 pass. */
  allocateOwner?(
    state: EconomyState,
    player: EconomyPlayer,
    events: EconomyEvent[],
  ): boolean;
  afterOwner?(state: EconomyState, player: EconomyPlayer): void;
}
export type EconomyReason =
  | "under-construction"
  | "disabled"
  | "producing-power"
  | "pulse-wait"
  | "no-recipients"
  | "power-dispatched"
  | "unpowered"
  | "cycle-wait"
  | "harvesting"
  | "capacity-full"
  | "resource-exhausted"
  | "host-consumer-callback-complete"
  | "host-consumer-callback-required";
export type EconomyEvent =
  | { type: "power-generated"; buildingId: number; amount: number }
  | { type: "packet-launched"; packet: EnergyPacket }
  | {
      type: "packet-delivered";
      packetId: number;
      buildingId: number;
      payload: number;
      credited: number;
    }
  | { type: "packet-expired"; packetId: number }
  | { type: "power-lost" | "power-restored"; buildingId: number }
  | {
      type: "goop-harvested";
      buildingId: number;
      cell: number;
      consumed: number;
      credited: number;
    }
  | { type: "terrain-depleted"; buildingId: number; cell: number }
  | { type: "extractor-empty"; buildingId: number }
  | { type: "goop-discarded"; playerId: number; amount: number }
  | { type: "notice"; playerId: number; cause: "no-power" | "unused-goop" }
  | { type: "recycling"; buildingId: number; event: RecyclingEvent }
  | {
      type: "audio";
      buildingId: number;
      cue: "work-start" | "work-stop" | "work-finish" | "harvest" | "empty";
    };
export interface EconomyReceipt {
  state: EconomyState;
  events: EconomyEvent[];
  reasons: { buildingId: number; reason: EconomyReason }[];
  /** Timer samples consumed by the player's source power history. */
  powerSamples: {
    playerId: number;
    count: number;
    mean: number;
    minimum: number;
    maximum: number;
  }[];
}
export type EconomyResult =
  | { ok: true; receipt: EconomyReceipt }
  | { ok: false; reason: string; buildingId?: number; packetId?: number };

const i16 = (value: number) => (value << 16) >> 16;
const u16 = (value: number) => value & 0xffff;
const u8 = (value: number) => value & 0xff;
const i8 = (value: number) => (value << 24) >> 24;
const mod = (value: number, span: number) => ((value % span) + span) % span;
const integer = (value: number, low: number, high: number) =>
  Number.isInteger(value) && value >= low && value <= high;
function distanceSquared(
  a: { x: number; y: number },
  b: { x: number; y: number },
  state: EconomyState,
  rules: EconomyRules,
) {
  const delta = (v: number, span: number) => mod(v + span / 2, span) - span / 2;
  const x = delta(a.x - b.x, state.width * rules.cellSize);
  const y = delta(a.y - b.y, state.height * rules.cellSize);
  return x * x + y * y;
}
function ordered(buildings: EconomyBuilding[]) {
  return [...buildings].sort((a, b) => a.owner - b.owner || a.slot - b.slot);
}

/** Capacity43620: occupied storage contributes even while incomplete; depleted
 * Extractors retain capacity. The source's suppression flags are authoritative. */
export function aggregateEconomyCapacity(
  buildings: readonly EconomyBuilding[],
  owner: number,
  rules: EconomyRules,
) {
  let capacity = 0;
  let maxOperationalHQGrade = 0;
  for (const building of buildings) {
    if (building.owner !== owner) continue;
    if (!building.capacitySuppressed) {
      capacity +=
        building.selector === 11
          ? rules.capacity.extractor
          : building.selector === 4
            ? rules.capacity.store4[building.grade]
            : building.selector === 13
              ? rules.capacity.store13[building.grade]
              : 0;
    }
    if (
      building.selector === 0 &&
      building.complete &&
      !building.hqUpgradeSuppressed
    )
      maxOperationalHQGrade = Math.max(maxOperationalHQGrade, building.grade);
  }
  return { capacity, maxOperationalHQGrade };
}

function invalidInput(
  state: EconomyState,
  context: EconomyContext,
  rules: EconomyRules,
  admitBuildingCallbacks = true,
): string | undefined {
  if (!rules.evidence.trim()) return "economy-profile-evidence-required";
  if (
    !integer(state.width, 1, 65535) ||
    !integer(state.height, 1, 65535) ||
    state.resources.length !== state.width * state.height ||
    state.resources.some((n) => !integer(n, 0, 255))
  )
    return "invalid-resource-grid";
  const positive = [
    rules.cellSize,
    rules.power.distributorCapacity,
    rules.power.distributorPulsePeriod,
    rules.power.consumerCapacity,
    rules.extractor.cycleLength,
    rules.extractor.goopPerResource,
  ];
  if (positive.some((n) => !integer(n, 1, 32767)))
    return "invalid-economy-profile";
  const nonnegative = [
    rules.power.photonReleaseThreshold,
    rules.power.photonReleaseAmount,
    rules.power.packetPayloadCap,
    rules.power.deliveryRadius,
    rules.power.noPowerWarningTicks,
    rules.power.noPowerWarningCooldownTicks,
    rules.extractor.upkeep,
    rules.extractor.harvestRadius,
    rules.extractor.workDelay,
    rules.extractor.harvestExtraDrain,
    rules.capacity.extractor,
    rules.capacity.unusedGoopWarningTicks,
    ...rules.power.distributorGeneration,
    ...rules.power.distributorRange,
    ...rules.power.distributorPulsePhase,
    ...rules.extractor.harvestUnits,
    ...rules.capacity.store4,
    ...rules.capacity.store13,
  ];
  if (
    nonnegative.some((n) => !integer(n, 0, 32767)) ||
    rules.power.packetPayloadCap > 255 ||
    rules.extractor.harvestExtraDrain > 255 ||
    rules.extractor.cycleLength > 255 ||
    rules.extractor.workDelay > 127 ||
    rules.power.distributorPulsePhase.some(
      (n) => n >= rules.power.distributorPulsePeriod,
    )
  )
    return "invalid-economy-profile";
  if (
    !integer(context.frame, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(context.solarGeneration, -32768, 32767) ||
    !integer(
      state.nextPacketId,
      0,
      Number.MAX_SAFE_INTEGER - state.buildings.length * state.buildings.length,
    )
  )
    return "invalid-economy-clock";
  const players = new Set<number>();
  for (const p of state.players) {
    if (
      !integer(p.id, 0, 3) ||
      players.has(p.id) ||
      !integer(p.goop, -0x80000000, 0x7fffffff) ||
      !integer(p.generatedEnergy, -32768, 32767) ||
      !integer(p.noPowerWarningTicks, 0, 65535) ||
      !integer(p.unusedGoopWarningTicks, 0, 65535)
    )
      return "invalid-economy-player";
    players.add(p.id);
  }
  const ids = new Set<number>();
  const slots = new Set<string>();
  for (const b of state.buildings) {
    const key = `${b.owner}:${b.slot}`;
    if (
      !players.has(b.owner) ||
      !integer(b.id, 0, Number.MAX_SAFE_INTEGER) ||
      ids.has(b.id) ||
      slots.has(key) ||
      !integer(b.slot, 0, 63) ||
      !integer(b.selector, 0, 13) ||
      !integer(b.grade, 0, 2) ||
      !integer(b.energy, -32768, 32767) ||
      !integer(b.extraDrain, 0, 255) ||
      !integer(b.storedGoop, 0, 0x7fffffff) ||
      !Number.isInteger(b.x) ||
      !Number.isInteger(b.y)
    )
      return "invalid-economy-building";
    ids.add(b.id);
    slots.add(key);
    if (admitBuildingCallbacks && b.selector === 11 && b.complete && !context.nativeExtractorCallbacks) {
      const a = b.extractor;
      const holds = rules.extractor.frameHolds[b.grade];
      if (
        !a ||
        holds.length === 0 ||
        holds.length > 255 ||
        holds.some((n) => !integer(n, 0, 255)) ||
        !integer(rules.extractor.startFrame, 0, holds.length - 1) ||
        !integer(rules.extractor.resetFrame, 0, holds.length - 1) ||
        rules.extractor.harvestFrames.some(
          (n) => !integer(n, 0, holds.length - 1),
        ) ||
        !integer(a.cycle, 0, 255) ||
        !integer(a.frame, 0, 255) ||
        !integer(a.delay, -128, 127) ||
        !integer(a.hold, 0, 255) ||
        !integer(a.stepDelay, -128, 127)
      )
        return "extractor-animation-profile-required";
    }
  }
  const packets = new Set<number>();
  for (const p of state.packets) {
    if (
      !integer(p.id, 0, state.nextPacketId - 1) ||
      packets.has(p.id) ||
      !integer(p.payload, 0, 255) ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y)
    )
      return "invalid-energy-packet";
    packets.add(p.id);
  }
  const samples = new Set<number>();
  for (const sample of context.packetSamples) {
    if (
      !packets.has(sample.id) ||
      samples.has(sample.id) ||
      !Number.isInteger(sample.x) ||
      !Number.isInteger(sample.y)
    )
      return "invalid-packet-sample";
    samples.add(sample.id);
  }
  return undefined;
}

/** One deterministic family tick. Existing packet observations deliver first,
 * then owner/slot-ordered buildings, then player storage/history maintenance.
 * New packets await a later host physics observation. All errors are atomic:
 * neither the supplied state nor any nested input/profile object is mutated. */
function runEconomyPhase(
  before: EconomyState,
  context: EconomyContext,
  rules: EconomyRules,
  phase: "compatibility" | "buildings" | "packets",
): EconomyResult {
  const invalid = invalidInput(before, context, rules, phase !== "packets");
  if (invalid) return { ok: false, reason: invalid };
  const state = cloneEconomyState(before);
  const events: EconomyEvent[] = [];
  const reasons: EconomyReceipt["reasons"] = [];
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const players = new Map(state.players.map((p) => [p.id, p]));
  const sampled = new Map(context.packetSamples.map((p) => [p.id, p]));
  const contactResolved = new Set(context.contactResolvedBuildingIds);
  for (const player of phase === "packets" ? [] : state.players) {
    Object.assign(
      player,
      aggregateEconomyCapacity(state.buildings, player.id, rules),
    );
    player.generatedEnergy = 0;
  }
  const activePackets: EnergyPacket[] =
    phase === "buildings" ? state.packets : [];
  const callbackPackets =
    phase === "packets"
      ? [
          ...context.packetSamples.map(
            (sample) =>
              state.packets.find((packet) => packet.id === sample.id)!,
          ),
          ...state.packets.filter((packet) => !sampled.has(packet.id)),
        ]
      : state.packets;
  for (const packet of phase === "buildings" ? [] : callbackPackets) {
    const observation = sampled.get(packet.id);
    if (!observation) {
      activePackets.push(packet);
      continue;
    }
    packet.x = observation.x;
    packet.y = observation.y;
    const target =
      observation.targetValid === false ? undefined : byId.get(packet.targetId);
    if (
      target &&
      distanceSquared(packet, target, state, rules) <=
        rules.power.deliveryRadius ** 2
    ) {
      if (target.specialPowerDelivery)
        return {
          ok: false,
          reason: "special-power-delivery-required",
          buildingId: target.id,
          packetId: packet.id,
        };
      const previous = target.energy;
      target.energy = Math.min(
        i16(target.energy + packet.payload),
        target.selector === 3
          ? rules.power.distributorCapacity
          : rules.power.consumerCapacity,
      );
      target.powered = true;
      events.push({
        type: "packet-delivered",
        packetId: packet.id,
        buildingId: target.id,
        payload: packet.payload,
        credited: target.energy - previous,
      });
    } else {
      packet.payload = u8(packet.payload - 1);
      if (packet.payload === 0)
        events.push({ type: "packet-expired", packetId: packet.id });
      else activePackets.push(packet);
    }
  }
  state.packets = activePackets;
  if (phase === "packets") {
    for (const b of state.buildings) {
      const was = before.buildings.find((prior) => prior.id === b.id)!.powered;
      if (b.powered !== was)
        events.push({
          type: b.powered ? "power-restored" : "power-lost",
          buildingId: b.id,
        });
    }
    return { ok: true, receipt: { state, events, reasons, powerSamples: [] } };
  }
  const buildings = ordered(state.buildings);
  const cue = (
    b: EconomyBuilding,
    name: Extract<EconomyEvent, { type: "audio" }>["cue"],
  ) => events.push({ type: "audio", buildingId: b.id, cue: name });
  for (const player of [...state.players].sort((a, b) => a.id - b.id)) {
    context.services?.beforeOwner?.(state, player);
    for (const building of buildings.filter((b) => b.owner === player.id)) {
      const eventStart = events.length;
      context.services?.beforeBuilding?.(state, building, player);
      let reason: EconomyReason;
      const handled = context.services?.buildingCallback?.(state, building, player, events);
      if (context.nativeExtractorCallbacks && building.selector === 11 && !handled)
        throw Error("Admitted native Extractor callback must handle its complete row");
      if (handled)
        reason = "host-consumer-callback-complete";
      else if (!building.complete) reason = "under-construction";
      else if (building.selector === 3 || building.selector === 6) {
        if (building.disabled) reason = "disabled";
        else {
          const distributor = building.selector === 3;
          const generated = distributor
            ? rules.power.distributorGeneration[building.grade]
            : i16(context.solarGeneration + building.grade);
          building.energy = i16(
            i16(building.energy - building.extraDrain) + generated,
          );
          building.powered = true;
          player.generatedEnergy = i16(player.generatedEnergy + generated);
          events.push({
            type: "power-generated",
            buildingId: building.id,
            amount: generated,
          });
          if (distributor)
            building.energy = Math.min(
              building.energy,
              rules.power.distributorCapacity,
            );
          const pulse = distributor
            ? context.frame % rules.power.distributorPulsePeriod ===
                rules.power.distributorPulsePhase[building.grade] ||
              building.energy === rules.power.distributorCapacity
            : building.energy > rules.power.photonReleaseThreshold;
          reason = "pulse-wait";
          if (pulse) {
            const targets = buildings.filter(
              (target) =>
                target.owner === building.owner &&
                target.complete &&
                (distributor
                  ? !target.disabled && ![3, 6, 8, 9].includes(target.selector)
                  : target.selector === 3) &&
                distanceSquared(building, target, state, rules) <=
                  rules.power.distributorRange[
                    distributor ? building.grade : target.grade
                  ] **
                    2,
            );
            reason = targets.length ? "power-dispatched" : "no-recipients";
            if (targets.length) {
              const share = distributor
                ? u16(Math.trunc(building.energy / targets.length))
                : Math.trunc(rules.power.photonReleaseAmount / targets.length);
              if (!distributor || share !== 0)
                for (const target of targets) {
                  const packet = {
                    id: state.nextPacketId++,
                    sourceId: building.id,
                    targetId: target.id,
                    payload: Math.min(share, rules.power.packetPayloadCap),
                    x: building.x,
                    y: building.y,
                  };
                  state.packets.push(packet);
                  events.push({
                    type: "packet-launched",
                    packet: { ...packet },
                  });
                }
              building.energy = 0;
            } else if (!distributor) building.energy = 0;
          }
          if (building.extraDrain > 0) building.extraDrain--;
        }
      } else if (building.selector === 11) {
        const animation = building.extractor!;
        let energy = i16(
          building.energy - rules.extractor.upkeep - building.extraDrain,
        );
        if (energy <= 0) {
          energy = 0;
          if (!building.disabled) {
            building.powered = false;
            if (player.noPowerWarningTicks === 0)
              player.noPowerWarningTicks = rules.power.noPowerWarningTicks;
          }
        }
        let advancing = animation.frame !== 0;
        if (!advancing && animation.workAudioActive) {
          cue(building, "work-stop");
          cue(building, "work-finish");
        }
        if (animation.frame === rules.extractor.resetFrame) {
          animation.frame = 0;
          advancing = false;
        }
        reason = building.disabled
          ? "disabled"
          : energy === 0
            ? "unpowered"
            : "cycle-wait";
        if (energy !== 0 && !building.disabled) {
          const previousCycle = animation.cycle;
          animation.cycle = u8(previousCycle + 1);
          if (previousCycle >= rules.extractor.cycleLength) {
            animation.cycle = 0;
            if (player.goop >>> 0 < player.capacity) {
              animation.frame = rules.extractor.startFrame;
              animation.stepDelay = rules.extractor.workDelay;
              cue(building, "work-start");
            } else reason = "capacity-full";
          }
          if (rules.extractor.harvestFrames.includes(animation.frame)) {
            if (
              !contactResolved.has(building.id) &&
              !context.services?.contactResolved?.(state, building)
            )
              return {
                ok: false,
                reason: "extractor-contact-pass-required",
                buildingId: building.id,
              };
            building.extraDrain = rules.extractor.harvestExtraDrain;
            if (player.goop >>> 0 >= player.capacity) reason = "capacity-full";
            else {
              let chosen = -1;
              let richest = 0;
              const centerX = Math.floor(building.x / rules.cellSize);
              const centerY = Math.floor(building.y / rules.cellSize);
              for (
                let dy = -rules.extractor.harvestRadius;
                dy <= rules.extractor.harvestRadius;
                dy++
              )
                for (
                  let dx = -rules.extractor.harvestRadius;
                  dx <= rules.extractor.harvestRadius;
                  dx++
                ) {
                  const cell =
                    mod(centerY + dy, state.height) * state.width +
                    mod(centerX + dx, state.width);
                  if (state.resources[cell] > richest) {
                    chosen = cell;
                    richest = state.resources[cell];
                  }
                }
              if (chosen < 0) {
                building.disabled = true;
                building.depleted = true;
                building.hqUpgradeSuppressed = true;
                reason = "resource-exhausted";
                events.push({
                  type: "extractor-empty",
                  buildingId: building.id,
                });
                cue(building, "empty");
              } else {
                const consumed = Math.min(
                  richest,
                  rules.extractor.harvestUnits[building.grade],
                );
                state.resources[chosen] -= consumed;
                const previous = player.goop;
                player.goop = Math.min(
                  (player.goop + consumed * rules.extractor.goopPerResource) >>>
                    0,
                  player.capacity,
                );
                reason = "harvesting";
                events.push({
                  type: "goop-harvested",
                  buildingId: building.id,
                  cell: chosen,
                  consumed,
                  credited: player.goop - previous,
                });
                if (state.resources[chosen] === 0)
                  events.push({
                    type: "terrain-depleted",
                    buildingId: building.id,
                    cell: chosen,
                  });
              }
            }
            if (animation.frame === rules.extractor.harvestFrames[0]) {
              cue(building, "work-stop");
              cue(building, "harvest");
            }
            if (animation.frame === rules.extractor.harvestFrames.at(-1))
              cue(building, "work-start");
          }
        } else building.powered = false;
        energy = Math.min(energy, rules.power.consumerCapacity);
        if (building.extraDrain > 0) building.extraDrain--;
        if (building.disabled) {
          if (energy > 0) energy--;
          cue(building, "work-stop");
        }
        building.energy = energy;
        const holds = rules.extractor.frameHolds[building.grade];
        animation.frame = Math.min(animation.frame, holds.length - 1);
        animation.delay = Math.min(animation.delay, animation.stepDelay);
        const delay = animation.delay;
        animation.delay = i8(animation.delay - 1);
        if (delay <= 0) {
          animation.delay = animation.stepDelay;
          animation.hold = Math.min(animation.hold, holds[animation.frame]);
          const hold = animation.hold;
          animation.hold = u8(hold - 1);
          if (hold === 0) {
            animation.frame =
              (animation.frame + Number(advancing)) % holds.length;
            animation.hold = holds[animation.frame];
          }
        }
      } else reason = "host-consumer-callback-required";
      reasons.push({ buildingId: building.id, reason });
      context.services?.afterBuilding?.(
        state,
        building,
        player,
        events.slice(eventStart),
      );
    }
    const allocatedByHost =
      context.services?.allocateOwner?.(state, player, events) ?? false;
    if (!allocatedByHost) {
      // Bounded437A0: only Extractor allocation is recovered. Do not pretend the
      // distinct store4/13 allocation callbacks have been established by capacity.
      if (
        player.goop > 0 &&
        buildings.some(
          (b) => b.owner === player.id && [4, 13].includes(b.selector),
        )
      )
        return { ok: false, reason: "additional-storage-allocation-required" };
      let remaining = player.goop;
      if (remaining > 0)
        for (const b of buildings) {
          if (remaining <= 0) break;
          if (b.owner === player.id && b.selector === 11) {
            b.storedGoop = Math.min(remaining, rules.capacity.extractor);
            remaining -= b.storedGoop;
          }
        }
      if (remaining > 0) {
        player.goop -= remaining;
        if (player.unusedGoopWarningTicks === 0)
          player.unusedGoopWarningTicks = rules.capacity.unusedGoopWarningTicks;
        events.push({
          type: "goop-discarded",
          playerId: player.id,
          amount: remaining,
        });
        if (
          player.unusedGoopWarningTicks ===
          rules.capacity.unusedGoopWarningTicks
        )
          events.push({
            type: "notice",
            playerId: player.id,
            cause: "unused-goop",
          });
      }
    }
    if (
      player.noPowerWarningTicks === rules.power.noPowerWarningTicks &&
      player.noPowerWarningTicks !== 0
    ) {
      player.noPowerWarningTicks = rules.power.noPowerWarningCooldownTicks;
      events.push({ type: "notice", playerId: player.id, cause: "no-power" });
    }
    if (player.noPowerWarningTicks > 0) player.noPowerWarningTicks--;
    if (player.unusedGoopWarningTicks > 0) player.unusedGoopWarningTicks--;
    context.services?.afterOwner?.(state, player);
  }
  for (const b of state.buildings) {
    const was = before.buildings.find((prior) => prior.id === b.id)!.powered;
    if (b.powered !== was)
      events.push({
        type: b.powered ? "power-restored" : "power-lost",
        buildingId: b.id,
      });
  }
  const powerSamples: EconomyReceipt["powerSamples"] = [];
  for (const player of state.players) {
    const samples = buildings
      .filter(
        (b) =>
          b.owner === player.id &&
          b.complete &&
          !b.disabled &&
          ![3, 6, 8, 9].includes(b.selector),
      )
      .map((b) => b.energy);
    if (samples.length)
      powerSamples.push({
        playerId: player.id,
        count: samples.length,
        mean: Math.trunc(
          samples.reduce((sum, n) => sum + n, 0) / samples.length,
        ),
        minimum: Math.min(...samples),
        maximum: Math.max(...samples),
      });
  }
  return { ok: true, receipt: { state, events, reasons, powerSamples } };
}

function stepEconomyPhase(
  before: EconomyState,
  context: EconomyContext,
  rules: EconomyRules,
  phase: "compatibility" | "buildings" | "packets",
): EconomyResult {
  try {
    return runEconomyPhase(before, context, rules, phase);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "economy-host-service-failed",
    };
  }
}

/** Source47F80 building/player phase; packets are preserved without delivery
 * or decay. The host dispatches effect callbacks later in its frame. */
export function stepEconomyBuildings(
  before: EconomyState,
  context: EconomyContext,
  rules: EconomyRules,
): EconomyResult {
  return stepEconomyPhase(
    before,
    { ...context, packetSamples: [] },
    rules,
    "buildings",
  );
}

/** Source4E950 effect phase after buildings. Only supplied packet observations
 * deliver/decay; no generation, consumption, harvesting or player timers run. */
export function stepEconomyPackets(
  before: EconomyState,
  packetSamples: EconomyContext["packetSamples"],
  rules: EconomyRules,
): EconomyResult {
  return stepEconomyPhase(
    before,
    {
      frame: 0,
      solarGeneration: 0,
      packetSamples,
      contactResolvedBuildingIds: [],
    },
    rules,
    "packets",
  );
}

/** Historical delivery-first family composition retained for existing clients
 * and tests. Source-order hosts use the two explicit phases above. */
export function stepEconomy(
  before: EconomyState,
  context: EconomyContext,
  rules: EconomyRules,
): EconomyResult {
  return stepEconomyPhase(before, context, rules, "compatibility");
}
