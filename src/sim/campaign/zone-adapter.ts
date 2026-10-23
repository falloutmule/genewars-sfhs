import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  cloneEffectHost,
  commitEffectHost,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import {
  stepZones,
  initializeZones,
  type ZoneState,
  type ZoneEvent,
} from "../mechanics/zones";
import { cloneEthereals } from "../mechanics/ethereal";
import { createCampaignEthereal } from "./ethereal-adapter";
import { cleanupCampaignReferences } from "./cleanup";
import { animationProfile } from "../mechanics/animation";
import { i16, u16 } from "./bytes";
import { cloneSpecialistPool } from "../mechanics/specialist-native";
import { cloneCampaignHostRoots } from "./clone-host";
export interface CampaignZoneOptions {
  gravity: number;
  obstacleAt(position: [number, number]): boolean;
  onEvent?(staged: CampaignWorld, event: ZoneEvent): void;
}
function project(w: CampaignWorld): ZoneState {
  const particles = new Set(
    w.landings.flatMap((l) => l.particles.map((p) => p.slot)),
  );
  return {
    missionPrefix: w.missionPrefix,
    players: w.players.map((p) => ({ id: p.id, raw: p.raw })),
    creatures: w.creatureNative.map((native, index) => ({ index, native })),
    plants: w.ecology.plants.map((p) => ({ index: p.index, native: p.native })),
    buildings: w.buildingNative.map((native, index) => ({ index, native })),
    visitors: w.ethereals.records.map((r) => ({
      index: r.slot,
      native: r.native,
    })),
    effects: w.powerEffects.slots.flatMap((p, slot) =>
      p.occupied &&
      !particles.has(slot) &&
      (p.nativePrior?.[69] === 47 || p.nativePrior?.[69] === 60)
        ? [{ slot, code: p.nativePrior[69] as 47 | 60, native: p.nativePrior }]
        : [],
    ),
    powerEffects: w.powerEffects,
    spatial: w.spatial,
    terrain: w.terrain,
    rng: w.rng,
  };
}
function adopt(w: CampaignWorld, z: ZoneState): void {
  w.missionPrefix = z.missionPrefix;
  w.powerEffects = z.powerEffects;
  w.spatial = z.spatial;
  w.terrain = z.terrain;
  w.rng = z.rng;
  for (const p of z.players) w.players[p.id].raw = p.raw;
  for (const c of z.creatures) w.creatureNative[c.index] = c.native;
  for (const m of w.ecology.mules) m.native = w.creatureNative[m.index];
  for (const p of z.plants) {
    const host = w.ecology.plants.find((q) => q.index === p.index)!;
    host.native = p.native;
    host.shade = p.native[23]!;
  }
  for (const b of z.buildings) w.buildingNative[b.index] = b.native;
  for (const v of z.visitors) w.ethereals.records[v.index].native = v.native;
  w.ethereals.count = w.ethereals.records.filter(
    (v) => v.native[6] !== 0,
  ).length;
}
/** Whole7A280 before actor callbacks. Nested visitor creation/cleanup operate
 * on the same staged world and current shared cell order as the zone scan. */
export function stepCampaignZones(
  w: CampaignWorld,
  pack: Pack,
  options: CampaignZoneOptions,
  mode: "step" | "initialize" | "refresh" = "step",
): ZoneEvent[] {
  //7A280 returns before reading family/profile state while countdown is live.
  if (
    (mode === "step" && u16(w.missionPrefix, 0x355c) !== 0) ||
    !w.missionPrefix[0x34b8]
  )
    return [];
  if (!pack.zoneRules || !pack.rules)
    throw new Error("Original zone tables missing");
  const hooks: EffectSchedulerOptions<CampaignWorld> = {
      cloneHostRoots: cloneCampaignHostRoots,
      gravity: options.gravity,
      obstacleAt: options.obstacleAt,
      cleanupReferences: (s, id) => cleanupCampaignReferences(s, id),
      stageHost(original, s) {
        s.missionPrefix = original.missionPrefix.slice();
        s.buildingNative = original.buildingNative.map((n) => n.slice());
        s.creatureNative = original.creatureNative.map((n) => n.slice());
        s.ethereals = cloneEthereals(original.ethereals);
        s.presentation = structuredClone(original.presentation);
        s.specialists = cloneSpecialistPool(original.specialists);
      },
      commitHost(target, s) {
        target.missionPrefix = s.missionPrefix;
        target.buildingNative = s.buildingNative;
        target.creatureNative = s.creatureNative;
        target.ethereals = s.ethereals;
        target.presentation = s.presentation;
        target.specialists = s.specialists;
      },
    },
    s = cloneEffectHost(w, hooks);
  const operation: typeof stepZones =
    mode === "step"
      ? stepZones
      : (state, ctx) => initializeZones(state, ctx, mode !== "refresh");
  const result = operation(project(s), {
    frame: s.frame,
    participatingPlayers: s.source.source.context.activePlayerCount,
    selectedPlayer: s.selectedPlayer,
    rules: pack.zoneRules,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    gravity: options.gravity,
    profile: (code) => animationProfile(pack.assets.EFF, code),
    cleanup(z, id) {
      adopt(s, z);
      cleanupCampaignReferences(s, id);
      Object.assign(z, project(s));
    },
    visitor(z, request) {
      adopt(s, z);
      const slot = createCampaignEthereal(
        s,
        {
          selector: 2,
          owner: request.zone,
          position: request.position,
          initialHeight: request.height,
        },
        pack,
        {
          gravity: options.gravity,
          obstacleAt: options.obstacleAt,
          cleanupReferences: (staged, id) =>
            cleanupCampaignReferences(staged, id),
        },
      );
      Object.assign(z, project(s));
      return slot;
    },
  });
  adopt(s, result.state);
  for (const event of result.events) options.onEvent?.(s, event);
  commitEffectHost(w, s, hooks);
  return result.events;
}
