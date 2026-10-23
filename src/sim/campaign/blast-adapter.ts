/**4929C/4995A against the current campaign pools, inside a full host transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { BlastAreaContext } from "../mechanics/destruction-effect";
import type { EffectSchedulerOptions } from "./effect-scheduler";
import { requestAudio } from "../mechanics/audio";
import { worldCell } from "../mechanics/terrain";
import {
  campaignBlastTarget,
  campaignEntity,
  synchronizeCampaignLinks,
} from "./entity-view";
import { damageCampaignMule } from "./mule-damage-adapter";
import { igniteStagedPlant } from "./plant-fire-adapter";
import { cleanupCampaignReferences } from "./cleanup";
import { copySpatialLinks, unlinkSpatial } from "./spatial";
import { sourceEntityId, type SourceEntityId } from "./source-pools";
import { put16 } from "./bytes";

export interface CampaignBlastServices<
  W extends CampaignWorld = CampaignWorld,
> {
  /** Actual kind3 virtual34, including work cancellation and retained native mirrors. */
  damageSpecialist(
    world: W,
    index: number,
    amount: number,
    attacker: SourceEntityId | null,
  ): void;
  /** Actual kind4 virtual34, including recursive collapse factories. */
  damageBuilding(
    world: W,
    index: number,
    amount: number,
    attacker: SourceEntityId | null,
  ): void;
  /** Must address this very staged world; ignition can allocate/replace effects inline. */
  effectOptions(world: W): EffectSchedulerOptions<W>;
}

function byte(n: readonly (number | null)[], p: number): number {
  const v = n[p];
  if (!Number.isInteger(v) || v === null || v === undefined || v < 0 || v > 255)
    throw Error(`Blast native byte ${p} is unknown or invalid`);
  return v;
}
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;

/** Unlike campaignEntity, this also resolves a retired record.6D390 decodes
 * the retained index/kind reference without testing the pointed-to active byte. */
function retainedNative(
  w: CampaignWorld,
  id: SourceEntityId,
): (number | null)[] {
  const m = /^source:(\d+):(\d+)$/.exec(id);
  if (!m) throw Error("Invalid blast logical identity");
  const family = Number(m[1]),
    index = Number(m[2]);
  sourceEntityId(family, index);
  const n =
    family === 0
      ? w.ecology.mules.find((mule) => mule.index === index)?.native
      : family === 1
        ? w.ecology.plants[index]?.native
        : family === 2
          ? w.specialists.records[index]
          : family === 3
            ? w.buildingNative[index]
            : family === 4
              ? w.powerEffects.slots[index]?.nativePrior
              : family === 5
                ? w.collapse.records[index]
                : family === 7
                  ? w.ethereals.records[index]?.native
                  : w.source.entities.find((e) => e.id === id)?.nativeBytes;
  if (!n) throw Error("Blast retained native record missing");
  return n;
}

/** The six actual impulse words; routing, fractions and contact speed are untouched. */
function mirrorImpulse(w: CampaignWorld, id: SourceEntityId): void {
  const e = campaignEntity(w, id);
  if (!e) throw Error("Blast impulse target became inactive before damage");
  const n = e.native,
    motion = {
      vx: word(n, 45),
      vy: word(n, 47),
      vz: word(n, 49),
      yaw: word(n, 57),
      pitch: word(n, 59),
      speed: word(n, 61),
    };
  if (e.kind === 1) w.creatureNative[e.index] = n;
  else if (e.kind === 3) {
    const actor = w.actors.find((a) => a.id === e.index);
    if (!actor) throw Error("Blast specialist motion mirror missing");
    Object.assign(actor.motion, motion);
    const builder = w.builders.find((b) => b.id === e.index);
    if (builder) Object.assign(builder.motion, motion);
  } else if (e.kind === 5) {
    const slot = w.powerEffects.slots[e.index];
    // Code33 is immovable in its admitted descriptor. Its constrained horizontal
    // packet model must never silently erase a source vertical impulse.
    if (slot.packet)
      throw Error("Original power packet is not a movable blast target");
    for (const landing of w.landings) {
      if (landing.slot === e.index && landing.phase !== 4) {
        landing.native = n;
        landing.vz = motion.vz;
      }
      for (const p of landing.particles)
        if (p.slot === e.index) {
          if (p.code !== byte(n, 69))
            throw Error("Blast particle mirror selector differs");
          p.native = n;
          p.vx = motion.vx;
          p.vy = motion.vy;
          p.vz = motion.vz;
        }
    }
    for (const water of w.waterEffects)
      if (water.slot === e.index && water.active) {
        if (water.code !== byte(n, 69))
          throw Error("Blast water mirror selector differs");
        water.native = n;
        Object.assign(water, motion);
      }
  }
}

/**6C900 ->6C780 numeric simulation writes. The source's current-viewport old
 * frame dirty drawing is presentation-only and does not choose a new game state. */
export function damageCampaignPlant(
  w: CampaignWorld,
  pack: Pack,
  index: number,
  amount: number,
): void {
  const id = sourceEntityId(1, index);
  const e = campaignEntity(w, id),
    plant = e?.kind === 2 ? w.ecology.plants[e.index] : undefined;
  if (
    !plant?.active ||
    !e ||
    plant.native !== e.native ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > 32767
  )
    throw Error("Original blast plant damage target/amount required");
  const n = e.native,
    selector = (byte(n, 43) << 24) >> 24,
    row = pack.ecologyRules?.plants[selector];
  if (!row || row.selector !== selector || selector !== plant.selector)
    throw Error("Original blast plant resource rule required");
  if (word(n, 44) <= 0) return;
  const growth = ((word(n, 44) - amount) << 16) >> 16;
  put16(n as number[], 44, growth);
  plant.growth = growth;
  if (growth > 0) return;
  if (!(byte(n, 46) & 0x88)) {
    n[25] = (byte(n, 25) + 6) & 255;
    put16(n as number[], 44, 0);
    n[46] = byte(n, 46) | 0x80;
    n[48] = row.retirementDelay;
    plant.animation = n[25];
    plant.growth = 0;
    plant.plantFlags = n[46];
    plant.retirement = n[48];
  }
  if (byte(n, 48) >= 4) {
    n[48] = byte(n, 48) - 4;
    plant.retirement = n[48];
    return;
  }
  const owner = byte(n, 24),
    cell = worldCell(...e.position);
  if (owner > 4 || owner !== plant.owner || w.spatial.nodes[id]?.cell !== cell)
    throw Error("Original blast retiring plant owner/link required");
  const count = word(w.missionPrefix, 0x3552) & 65535;
  if (count !== w.ecology.plantCount)
    throw Error("Blast plant count native mirror differs");
  if (
    owner < 4 &&
    (word(w.players[owner].raw, 0x5fa) & 65535) !==
      w.ecology.ownerPlantCounts[owner]
  )
    throw Error("Blast owner plant count native mirror differs");
  // Keep this retired record's continuation for the source next-after-damage walk.
  copySpatialLinks(w.spatial, id, n);
  unlinkSpatial(w.spatial, w.terrain, id);
  synchronizeCampaignLinks(w);
  if (owner < 4) {
    const next = (w.ecology.ownerPlantCounts[owner] - 1) & 65535;
    put16(w.players[owner].raw, 0x5fa, next);
    w.ecology.ownerPlantCounts[owner] = next;
  }
  const at = cell * 14 + 13,
    old = w.terrain.bytes[at];
  if (old < 64) w.terrain.bytes[at] = old + 2;
  w.terrain.revision++;
  cleanupCampaignReferences(w, id);
  n[6] = 0;
  plant.active = false;
  w.ecology.plantCount = (count - 1) & 65535;
  put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
  if (w.ecology.plantOrder) {
    const key = String(cell);
    w.ecology.plantOrder[key] = (w.ecology.plantOrder[key] ?? []).filter(
      (index) => index !== e.index,
    );
  }
}

/** No transaction is opened here: recursive factories and damage must share
 * the caller's isolated full host, with commit/rollback at that outer boundary. */
export function campaignBlastAreaContext<W extends CampaignWorld>(
  w: W,
  pack: Pack,
  services: CampaignBlastServices<W>,
): BlastAreaContext {
  if (
    !pack.rules ||
    !pack.ecologyRules ||
    pack.ecologyRules.spreadDirections.length !== 9
  )
    throw Error("Original campaign blast motion/area tables required");
  const current = (id: SourceEntityId) => {
    const target = campaignBlastTarget(w, pack, id);
    copySpatialLinks(w.spatial, id, target.native);
    return target;
  };
  const afterDamage = () => synchronizeCampaignLinks(w);
  return {
    directions: pack.ecologyRules.spreadDirections,
    tables: pack.rules.tables,
    currentRng: () => w.rng,
    readCountdown: () => word(w.missionPrefix, 0x355c) & 65535,
    writeCountdown(value) {
      if (!Number.isInteger(value) || value < 0 || value > 65535)
        throw Error("Original blast countdown word required");
      put16(w.missionPrefix, 0x355c, value);
      w.countdown = value;
    },
    head: (position) => w.spatial.heads[worldCell(...position)],
    resolve: current,
    next(id) {
      const n = retainedNative(w, id);
      copySpatialLinks(w.spatial, id, n);
      const kind = byte(n, 5),
        index = word(n, 3);
      if (index < 0 || kind < 1 || kind > 8) return null;
      return sourceEntityId(kind - 1, index);
    },
    damage(id, amount, attacker) {
      const e = current(id);
      if (e.kind === 1) damageCampaignMule(w, pack, e.index, amount, attacker);
      else if (e.kind === 3) {
        if (typeof services.damageSpecialist !== "function")
          throw Error("Original blast specialist damage service required");
        services.damageSpecialist(w, e.index, amount, attacker);
      } else if (e.kind === 4) {
        if (typeof services.damageBuilding !== "function")
          throw Error("Original blast building damage service required");
        services.damageBuilding(w, e.index, amount, attacker);
      } else if (e.kind === 7)
        throw Error("Original blast kind7 damage service is not implemented");
      else throw Error("Unsupported original blast damage virtual");
      afterDamage();
    },
    plantDamage(id, amount) {
      const e = current(id);
      if (e.kind !== 2) throw Error("Original blast plant target required");
      damageCampaignPlant(w, pack, e.index, amount);
      afterDamage();
    },
    plantIgnite(id) {
      const e = current(id);
      if (e.kind !== 2 || typeof services.effectOptions !== "function")
        throw Error("Original blast plant ignition effect service required");
      igniteStagedPlant(
        w,
        e.index,
        pack,
        services.effectOptions(w),
        (host, event) => {
          requestAudio(host.audio, {
            frame: host.frame,
            entity: event.entity,
            cue: event.channel,
            mode: event.mode,
            parameter: event.parameter,
            gain: event.volume / 127,
            range: null,
            initialRatePercent: event.ratePercent,
          });
        },
      );
      // The shared ignition planner returns a new numeric image. Keep the
      // concrete plant address identity for callers already holding that row,
      // including all current link/cleanup writes made during the factory.
      const plant = w.ecology.plants[e.index];
      if (plant.native !== e.native) {
        for (let p = 0; p < plant.native.length; p++)
          e.native[p] = plant.native[p];
        plant.native = e.native;
      }
      afterDamage();
    },
    motionChanged: (id) => mirrorImpulse(w, id),
  };
}
