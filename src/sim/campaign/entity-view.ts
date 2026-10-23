import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import { sourceEntityId, type SourceEntityId } from "./source-pools";
import { i16, u32 } from "./bytes";
import { worldCell } from "../mechanics/terrain";
import type { BlastTarget } from "../mechanics/destruction-effect";

export interface CampaignEntityView {
  id: SourceEntityId;
  index: number;
  kind: number;
  owner: number;
  position: [number, number];
  physicalHeight: number;
  relativeHeight: number;
  native: (number | null)[];
}
/** Real current authoritative pools. Source registry overlays are used only
 * by the still registry-owned families6/7, never instead of live replacements. */
export function campaignEntity(
  w: CampaignWorld,
  id: SourceEntityId,
): CampaignEntityView | null {
  const match = /^source:(\d+):(\d+)$/.exec(id);
  if (!match) throw new Error("Invalid logical campaign entity");
  const family = Number(match[1]),
    index = Number(match[2]);
  sourceEntityId(family, index);
  const native =
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
                : w.source.entities.find((e) => e.id === id)?.nativeBytes;
  if (!native || native[6] === 0) return null;
  if (native[6] !== family + 1 || i16(native as number[], 15) !== index)
    throw new Error("Campaign entity native identity differs");
  const raw = native as number[],
    ground = u32(raw, 17) | 0,
    fixed = family === 1 || family === 3 || family === 5,
    physicalHeight = fixed ? ground : u32(raw, 39) | 0;
  return {
    id,
    index,
    kind: family + 1,
    owner: native[24]!,
    position: [i16(raw, 7), i16(raw, 9)],
    physicalHeight,
    relativeHeight: fixed ? 0 : (physicalHeight - ground) | 0,
    native,
  };
}
/** Do not pre-sort or deduplicate samples: source queries own point order and
 * repeated cells. Each point traverses the actual current intrusive chain. */
export function campaignQueryEntities(
  w: CampaignWorld,
  points: readonly (readonly [number, number])[],
): CampaignEntityView[] {
  const result: CampaignEntityView[] = [];
  for (const p of points) {
    let id = w.spatial.heads[worldCell(p[0], p[1])];
    const seen = new Set<string>();
    while (id) {
      if (seen.has(id)) throw new Error("Campaign entity query link cycle");
      seen.add(id);
      const entity = campaignEntity(w, id as SourceEntityId),
        node = w.spatial.nodes[id];
      if (!entity || !node)
        throw new Error(
          "Campaign entity query has an inactive or missing link",
        );
      result.push(entity);
      id = node.next;
    }
  }
  return result;
}
/** Source virtual0/4/8/68, established independently for each admitted kind.
 * Descriptor metadata does not imply an EFF animation or callback exists. */
export function campaignBlastTarget(
  w: CampaignWorld,
  pack: Pack,
  id: SourceEntityId,
): BlastTarget {
  const e = campaignEntity(w, id);
  if (!e) throw new Error("Blast target is inactive");
  let movable: boolean;
  if (e.kind === 2 || e.kind === 4 || e.kind === 6) movable = false;
  else if (e.kind === 3) movable = (e.native[85]! << 24) >> 24 !== 3;
  else if (e.kind === 5) {
    const descriptor = pack.effectRules?.descriptors[e.native[69]!];
    if (!descriptor || descriptor.code !== e.native[69])
      throw new Error("Original effect movement descriptor missing");
    movable = descriptor.movable;
  } else movable = true;
  return {
    ...e,
    height: e.physicalHeight,
    movable,
    ...(e.kind === 2
      ? { plantProtected: i16(e.native as number[], 44) <= 0 }
      : {}),
  };
}
