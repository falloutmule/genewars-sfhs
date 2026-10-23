import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  createCraterJob,
  stepCraterJobs,
  type CraterRules,
  type CraterLinkedRecord,
} from "../mechanics/crater";
import { copySpatialLinks } from "./spatial";
import { stepCampaignZones, type CampaignZoneOptions } from "./zone-adapter";
import { u32 } from "./bytes";
import type { SourceEntityId } from "./source-pools";

export function campaignCraterRules(pack: Pack): CraterRules {
  if (!pack.craterRules || !pack.ecologyRules || !pack.rules || !pack.zoneRules)
    throw new Error("Original crater/terrain tables missing");
  return {
    directions: pack.ecologyRules.spreadDirections,
    largeTextures: pack.craterRules.largeTextures,
    largeFlags: pack.craterRules.largeFlags,
    terrainBorder: pack.rules.tables.terrainBorder,
    terrainLightVector: pack.zoneRules.terrainLightVector,
  };
}
function native(
  w: CampaignWorld,
  family: number,
  index: number,
): (number | null)[] {
  const record =
    family === 0
      ? w.ecology.mules.find((m) => m.index === index)?.native
      : family === 1
        ? w.ecology.plants[index]?.native
        : family === 2
          ? w.specialists.records[index]
          : family === 3
            ? w.buildingNative[index]
            : family === 4
              ? w.powerEffects.slots[index]?.nativePrior
              : family === 7
                ? w.ethereals.records[index]?.native
                : undefined;
  if (!record || record[6] !== family + 1)
    throw new Error(
      `Crater linked native source:${family}:${index} missing or inactive`,
    );
  return record;
}
function changed(w: CampaignWorld, record: CraterLinkedRecord): void {
  const [, family, index] = record.id.split(":").map(Number),
    n = record.native;
  const ground = u32(n as number[], 17) | 0,
    height = u32(n as number[], 39) | 0;
  if (family === 0) w.creatureNative[index] = n;
  else if (family === 1) {
    const p = w.ecology.plants[index];
    p.height = ground;
    p.shade = n[23]!;
  } else if (family === 2) {
    const a = w.actors.find((a) => a.id === index);
    if (!a) throw new Error("Crater specialist motion mirror missing");
    a.motion.ground = ground;
    a.motion.height = height;
    const builder = w.builders.find((b) => b.id === index);
    if (builder) builder.motion = a.motion;
  } else if (family === 4) {
    for (const l of w.landings) {
      if (l.slot === index && l.phase !== 4) {
        l.native = n;
        l.height = height;
      }
      for (const p of l.particles)
        if (p.slot === index) {
          p.native = n;
          p.ground = ground;
          p.height = height;
        }
    }
    for (const e of w.waterEffects)
      if (e.slot === index && e.active) {
        e.native = n;
        e.ground = ground;
        e.height = height;
        e.shade = n[23]!;
      }
  }
}
export function createCampaignCrater(
  w: CampaignWorld,
  point: [number, number],
  variant: 0 | 1,
  pack: Pack,
) {
  return createCraterJob(w, point, variant, campaignCraterRules(pack));
}
/**79220 after effects. The core stages the complete world, including all
 * live native mirrors and the post-retirement79D50 refresh transaction. */
export function stepCampaignCraters(
  w: CampaignWorld,
  pack: Pack,
  options: CampaignZoneOptions,
) {
  if (!w.missionPrefix[0x2ff7]) return [];
  return stepCraterJobs(w, {
    rules: campaignCraterRules(pack),
    linkedRecords(staged, cell) {
      const records: CraterLinkedRecord[] = [];
      let id = staged.spatial.heads[cell];
      const seen = new Set<string>();
      while (id) {
        if (seen.has(id)) throw new Error("Crater shared link cycle");
        seen.add(id);
        const node = staged.spatial.nodes[id],
          n = native(staged, node.family, node.index);
        copySpatialLinks(staged.spatial, id as SourceEntityId, n);
        records.push({ id, native: n });
        id = node.next;
      }
      return records;
    },
    linkedChanged: changed,
    refreshZones(staged) {
      return stepCampaignZones(staged, pack, options, "refresh").flatMap(
        (event) =>
          event.type === "zone-terrain"
            ? event.points.map(
                ([x, y]) => ((y >> 8) & 127) * 128 + ((x >> 8) & 127),
              )
            : [],
      );
    },
  });
}
