/** Current-pool bindings for the source parent state7 punishment family. */
import type { CampaignWorld } from "./world";
import type {
  EtherealPunishmentServices,
  PunishmentTarget,
} from "../mechanics/ethereal-punishment";
import type { EtherealRecord } from "../mechanics/ethereal";
import { campaignEntity, campaignQueryEntities } from "./entity-view";
import { i16, u32 } from "./bytes";
import { torusDelta } from "../mechanics/terrain";

export interface CampaignPunishmentPorts {
  cancelWork(world: CampaignWorld, index: number): void;
  removeSpecialist(world: CampaignWorld, index: number): void;
  damageBuilding(
    world: CampaignWorld,
    index: number,
    damage: number,
    attacker: `source:7:${number}`,
  ): void;
  attack?(
    world: CampaignWorld,
    parent: EtherealRecord,
    target: PunishmentTarget,
  ): void;
}
/** No world transaction or synthetic candidates: the visitor pass owns its
 * atomic host and source13A40 already supplied the two query-axis RNG draws. */
export function campaignPunishmentServices(
  w: CampaignWorld,
  ports: CampaignPunishmentPorts,
): EtherealPunishmentServices {
  const resolve = (kind: 1 | 3 | 4, index: number): PunishmentTarget | null => {
    const e = campaignEntity(w, `source:${kind - 1}:${index}`);
    if (!e) return null;
    let health: number;
    if (kind === 3) {
      const b = w.specialists.bindings[index];
      if (!b || b.owner !== e.owner)
        throw new Error("Punishment specialist blueprint missing");
      health =
        (w.players[b.owner].raw[22 + b.blueprintIndex * 36 + 26] << 24) >> 24;
    } else health = i16(e.native as number[], kind === 1 ? 106 : 43);
    return {
      id: e.id,
      kind,
      index,
      owner: e.owner,
      position: e.position,
      ground: u32(e.native as number[], 17) | 0,
      height: e.physicalHeight,
      health,
      native: e.native,
    };
  };
  return {
    resolve,
    nearby(parent, q) {
      const choices: (PunishmentTarget | null)[] = Array(7).fill(null),
        best = Array(7).fill(Infinity),
        owner = parent.native[24];
      for (const e of campaignQueryEntities(w, q.points)) {
        if (e.owner !== owner || ![1, 3, 4].includes(e.kind)) continue;
        //1EC50 uses Mule state>=24.1EBB0/1EBC0 use signed actual
        //blueprint health / native building health, respectively.
        if (e.kind === 1 && e.native[94]! >= 24) continue;
        const dx = torusDelta(e.position[0], q.center[0]),
          dy = torusDelta(e.position[1], q.center[1]),
          metric = (Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0;
        if (metric > q.radius * q.radius || metric >= best[e.kind]) continue;
        const target = resolve(e.kind as 1 | 3 | 4, e.index);
        if (!target)
          throw new Error("Punishment query lost its current entity");
        if (e.kind !== 1 && target.health <= 0) continue;
        choices[e.kind] = target;
        best[e.kind] = metric;
      }
      return choices;
    },
    cancelUnitWork(_parent, target) {
      ports.cancelWork(w, target.index);
    },
    removeUnit(_parent, target) {
      ports.removeSpecialist(w, target.index);
    },
    damageBuilding(parent, target, damage) {
      ports.damageBuilding(w, target.index, damage, `source:7:${parent.slot}`);
    },
    attack(parent, target) {
      if (!ports.attack)
        throw new Error(
          "Original Ethereal attack25 factory and callback are not implemented",
        );
      ports.attack(w, parent, target);
    },
  };
}
