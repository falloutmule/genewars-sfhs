/** One isolated47F80 owner/slot pass, including real selector4/437A0 and33
 * factories. Source packet effects still run later in the effect scheduler. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type {
  EconomyBuilding,
  EconomyEvent,
  EconomyPlayer,
  EconomyReceipt,
  EconomyState,
} from "../mechanics/economy";
import { stepEconomyBuildings } from "../mechanics/economy";
import { allocateStagedGoopStorage } from "../mechanics/goop-storage";
import { requestAudio } from "../mechanics/audio";
import {
  cloneEffectHost,
  commitEffectHost,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import {
  advancePowerProducerRng,
  applyPowerBuildingEvents,
  createExtractorContactSmoke,
  extractorNeedsContact,
  planExtractorContactQueries,
} from "./power-adapter";
import {
  stepStagedCampaignRecyclingPlant,
  type CampaignRecyclingServices,
} from "./recycling-adapter";
import { synchronizeCampaignLinks } from "./entity-view";
import { i16, put16, put32, u16, u32 } from "./bytes";

export interface CampaignEconomyContacts {
  /** Actual already-resolved contact callbacks, if a host has performed them
   * inside this same transaction. Omission performs the established query/smoke
   * family lazily at the native building's actual position in the pass. */
  resolvedIds?: readonly number[];
  resolve?(
    staged: CampaignWorld,
    building: EconomyBuilding,
    queries: ReturnType<typeof planExtractorContactQueries>,
  ): void;
  /** True means the COMPLETE source callback ran (upkeep/common tail included),
   * so generic3/6/11 numeric work is skipped. Used for Genepod/incomplete native
   * callbacks. Selector4 is owned by this adapter and never delegated twice. */
  dispatchBuilding?(staged: CampaignWorld, building: EconomyBuilding): boolean;
  /** Complete451F0 common-prefix branch, before upkeep and selector work,
   * including selector4. True owns the entire callback and its common tail. */
  dispatchCommonBuilding?(staged: CampaignWorld, building: EconomyBuilding): boolean;
}
const extraRoots = [
  "buildingNative",
  "creatureNative",
  "specialists",
  "collapse",
  "collectors",
  "ethereals",
  "presentation",
  "buildings",
  "jobs",
  "muleQueues",
  "auxiliary",
  "pendingEnvironmentEffects",
] as const;
function hooksFor(
  options: EffectSchedulerOptions<CampaignWorld>,
): EffectSchedulerOptions<CampaignWorld> {
  return {
    ...options,
    stageHost(original, staged) {
      options.stageHost?.(original, staged);
      // Respect a host's existing typed copies. Clone only extra roots still
      // shared with the input; group copying preserves their mutual aliases.
      const shared = extraRoots.filter((key) => staged[key] === original[key]);
      Object.assign(
        staged,
        structuredClone(
          Object.fromEntries(shared.map((key) => [key, original[key]])),
        ),
      );
      for (const mule of staged.ecology.mules)
        staged.creatureNative[mule.index] = mule.native;
    },
    commitHost(target, staged) {
      for (const key of extraRoots)
        (target as unknown as Record<string, unknown>)[key] = staged[key];
      options.commitHost?.(target, staged);
    },
  };
}
function syncPlayers(w: CampaignWorld, state: EconomyState): void {
  for (const economy of state.players) {
    const p = w.players.find((p) => p.id === economy.id);
    if (!p || p.raw.length !== 1805)
      throw Error("Economy native player binding missing");
    p.goop = economy.goop;
    put32(p.raw, 0x4a7, economy.goop);
    put32(p.raw, 0x5e6, economy.capacity);
    p.raw[0x6e1] = economy.maxOperationalHQGrade;
    put16(p.raw, 0x5ea, economy.noPowerWarningTicks);
    put16(p.raw, 0x5f0, economy.unusedGoopWarningTicks);
  }
}
/** Mirror only the numeric fields actually owned by generic economy. Preserve
 * unrelated flags, incomplete native ANB and selector4 pending material51. */
function syncBuilding(w: CampaignWorld, b: EconomyBuilding): void {
  const slot = b.owner * 64 + b.slot,
    n = w.buildingNative[slot],
    physical = w.buildings.find((v) => v.slot === slot);
  if (
    !n ||
    n.length !== 67 ||
    n[6] !== 4 ||
    n[24] !== b.owner ||
    n[45] !== b.selector ||
    !physical ||
    physical.id !== b.id
  )
    throw Error("Economy native building binding missing");
  put16(n as number[], 61, b.energy);
  n[63] = b.extraDrain;
  let flags = u16(n as number[], 49);
  flags = b.powered ? flags | 4 : flags & ~4;
  if (b.selector === 11 && b.depleted) flags |= 0x300;
  put16(n as number[], 49, flags);
  physical.energy = b.energy;
  if (!(flags & 0x800) && b.complete && b.extractor) {
    const a = b.extractor;
    n[25] = b.grade + 1;
    n[26] = a.hold;
    n[27] = a.frame;
    n[29] = a.stepDelay & 255;
    n[30] = a.delay & 255;
    n[51] = a.cycle;
  }
  if (!(flags & 0x800) && b.complete && b.producer) {
    const a = b.producer.animation;
    n[25] = a.action;
    n[26] = a.hold;
    n[27] = a.frame;
    n[28] = a.direction & 255;
    n[29] = a.delay & 255;
    n[30] = a.counter & 255;
  }
}
function syncOwnerStorage(
  w: CampaignWorld,
  state: EconomyState,
  p: EconomyPlayer,
  events: EconomyEvent[],
  pack: Pack,
): void {
  syncPlayers(w, state);
  const player = w.players.find((v) => v.id === p.id)!;
  const result = allocateStagedGoopStorage(
    w.buildingNative,
    player.raw,
    w.selectedPlayer,
    pack.economyRules!.capacity,
  );
  if (!result.ok) throw Error(result.reason);
  const receipt = result.receipt;
  if (receipt.owner !== p.id)
    throw Error("Economy storage owner differs from actual player4A1");
  for (const b of state.buildings.filter((b) => b.owner === p.id)) {
    if ([4, 11, 13].includes(b.selector)) {
      const n = w.buildingNative[b.owner * 64 + b.slot];
      if (n.slice(54, 58).some((v) => v === null))
        throw Error("Economy stored GOOP projection has unknown native54");
      b.storedGoop = u32(n as number[], 54) | 0;
    }
  }
  player.goop = p.goop = u32(player.raw, 0x4a7);
  p.unusedGoopWarningTicks = i16(player.raw, 0x5f0);
  if (receipt.discarded)
    events.push({
      type: "goop-discarded",
      playerId: p.id,
      amount: receipt.discarded,
    });
  if (receipt.noticeRequested)
    events.push({ type: "notice", playerId: p.id, cause: "unused-goop" });
}

/** Exactly one outer transaction. A missing late collector/query/asset or
 * packet factory rolls back earlier deposits, retirement, RNG, audio and links.
 * The caller supplies real Genepod/incomplete callbacks through dispatchBuilding.
 * Do not run the former prefix/consumer/contact loop a second time. */
export function stepCampaignEconomyBuildings(
  w: CampaignWorld,
  pack: Pack,
  services: CampaignRecyclingServices,
  contacts: CampaignEconomyContacts = {},
): EconomyReceipt {
  if (!pack.economyRules || !pack.rules)
    throw Error("Original campaign economy rules required");
  const hooks = hooksFor(services.effectOptions(w)),
    staged = cloneEffectHost(w, hooks);
  const resolved = new Set(contacts.resolvedIds ?? []);
  const result = stepEconomyBuildings(
    staged.economy,
    {
      frame: staged.frame,
      solarGeneration: staged.source.source.terrain.solarGeneration,
      packetSamples: [],
      contactResolvedBuildingIds: [...resolved],
      services: {
        contactResolved: (_state, b) => resolved.has(b.id),
        beforeBuilding(state, b, player) {
          staged.economy = state;
          syncPlayers(staged, state);
          syncBuilding(staged, b);
          //451F0 branches on0800 before producer work, upkeep or contacts.
          //The complete common callback is dispatched below in this same slot.
          if (u16(staged.buildingNative[b.owner * 64 + b.slot] as number[], 49) & 0x800)
            return;
          if (b.complete && !b.disabled && [3, 6].includes(b.selector)) {
            const producer = advancePowerProducerRng(staged, b, pack);
            for (const a of producer.audio)
              requestAudio(staged.audio, {
                frame: staged.frame,
                entity: `source:3:${b.owner * 64 + b.slot}`,
                cue: a.channel,
                mode: a.type === "stop" ? 4 : a.mode,
                parameter: a.type === "stop" ? 0 : a.parameter,
                gain: a.type === "stop" ? 1 : a.volume / 127,
                range: a.type === "stop" ? null : a.range,
              });
          }
          if (
            extractorNeedsContact(
              b,
              player.goop,
              player.capacity,
              pack.economyRules!,
            ) &&
            !resolved.has(b.id)
          ) {
            // Source smoke factory/RNG precedes both contact queries.
            createExtractorContactSmoke(staged, b, pack);
            staged.economy = state;
            const queries = planExtractorContactQueries(
              staged.spatial,
              b,
              staged.players[b.owner].raw[0x6e5],
              (index) => {
                const n = staged.ecology.mules.find(
                  (m) => m.index === index,
                )?.native;
                return n && n[24] !== null && n[94] !== null
                  ? { owner: n[24]!, state: n[94]! }
                  : null;
              },
            );
            if (contacts.resolve) contacts.resolve(staged, b, queries);
            else if (queries.queries.some((q) => q.virtual34Required))
              throw Error(
                "Extractor contact with a living creature requires its damage callback",
              );
            resolved.add(b.id);
          }
        },
        buildingCallback(state, b, _player, events) {
          const common = contacts.dispatchCommonBuilding?.(staged, b) ?? false;
          if (staged.economy !== state)
            throw Error("Common building callback replaced its retained economy state");
          if (common) return true;
          if (u16(staged.buildingNative[b.owner * 64 + b.slot] as number[], 49) & 0x800)
            throw Error("Actual451F0 timed demolition callback is required");
          if (b.selector === 4) {
            const receipt = stepStagedCampaignRecyclingPlant(
              staged,
              b.owner * 64 + b.slot,
              pack,
              services,
            );
            for (const event of receipt.events)
              events.push({ type: "recycling", buildingId: b.id, event });
            return true;
          }
          const handled = contacts.dispatchBuilding?.(staged, b) ?? false;
          if (staged.economy !== state)
            throw Error(
              "Economy host callback replaced its retained economy state",
            );
          if (!handled && (!b.complete || ![3, 6, 11].includes(b.selector)))
            throw Error(
              `Native building callback ${b.selector} requires its source host service`,
            );
          return handled;
        },
        afterBuilding(state, b, _player, events) {
          const slot = b.owner * 64 + b.slot;
          if (staged.buildingNative[slot][6] === 0) {
            if (state.buildings.includes(b) || staged.buildings.some(v => v.slot === slot))
              throw Error("Common building retirement did not publish its actual host removal");
            syncPlayers(staged, state);
            return;
          }
          if (!b.complete && b.producer) {
            const n = staged.buildingNative[b.owner * 64 + b.slot];
            if (n.slice(25, 31).some((v) => v === null))
              throw Error("Incomplete producer animation prior is unknown");
            b.producer.animation = {
              action: n[25]!,
              hold: n[26]!,
              frame: n[27]!,
              direction: (n[28]! << 24) >> 24,
              delay: (n[29]! << 24) >> 24,
              counter: (n[30]! << 24) >> 24,
            };
          }
          syncBuilding(staged, b);
          syncPlayers(staged, state);
          const launches = events.filter((e) => e.type === "packet-launched");
          if (launches.length) {
            applyPowerBuildingEvents(
              staged,
              { state, events: [...launches], reasons: [], powerSamples: [] },
              pack,
            );
            // Existing33 factory either allocates every real requested slot or
            // refuses its unadmitted full-pool replacement branch atomically.
            staged.economy = state;
            put16(
              staged.missionPrefix,
              0x3554,
              staged.powerEffects.slots.filter((s) => s.occupied).length,
            );
            synchronizeCampaignLinks(staged);
          }
        },
        allocateOwner(state, p, events) {
          syncOwnerStorage(staged, state, p, events, pack);
          return true;
        },
        afterOwner(state) {
          syncPlayers(staged, state);
        },
      },
    },
    pack.economyRules,
  );
  if (!result.ok) throw Error(result.reason);
  staged.economy = result.receipt.state;
  syncPlayers(staged, staged.economy);
  for (let cell = 0; cell < staged.economy.resources.length; cell++)
    staged.terrain.bytes[cell * 14 + 13] = staged.economy.resources[cell];
  synchronizeCampaignLinks(staged);
  commitEffectHost(w, staged, hooks);
  return result.receipt;
}
