import type { CampaignWorld } from "./world";
import {
  groundHeight,
  integerSqrt,
  torusDelta,
  worldCell,
} from "../mechanics/terrain";
import { wrap16 } from "../mechanics/motion";
import { effectTerrainShade } from "../mechanics/power-motion";
import { campaignQueryEntities } from "./entity-view";

/**75B00 raises visibility using terrain-aware distance and the original256-unit
 * feather;84B40 updates only the actual plant/building shade consumers. */
export function revealCampaignRadius(
  w: CampaignWorld,
  center: [number, number],
  radius: number,
): number {
  if (!Number.isInteger(radius) || radius < 256 || radius > 8192)
    throw new Error("Unsupported source reveal radius");
  const start = center.map((v) => (wrap16(v - radius) & 65535) >> 8),
    end = center.map((v) => (((wrap16(v + radius) & 65535) >> 8) + 1) & 255),
    height = groundHeight(w.terrain, ...center),
    inner = radius - 256;
  let changes = 0;
  for (let row = 0; row < ((end[1] - start[1]) & 255); row++)
    for (let col = 0; col < ((end[0] - start[0]) & 255); col++) {
      const at: [number, number] = [
          wrap16(((start[0] + col) & 255) << 8),
          wrap16(((start[1] + row) & 255) << 8),
        ],
        cell = worldCell(...at),
        old = w.terrain.bytes[cell * 14 + 12];
      if (old >= 63) continue;
      const dx = torusDelta(at[0], center[0]),
        dy = torusDelta(at[1], center[1]),
        dz = (groundHeight(w.terrain, ...at) - height) >> 3,
        squared =
          (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) >>> 0;
      if (squared >= radius * radius) continue;
      const value =
        squared < inner * inner
          ? 63
          : Math.trunc((radius - integerSqrt(squared) - 1) / 4) & 255;
      if (value <= old) continue;
      w.terrain.bytes[cell * 14 + 12] = value;
      changes++;
      for (const [ox, oy] of [
        [0, 0],
        [-256, 0],
        [-256, -256],
        [0, -256],
      ]) {
        const point: [number, number] = [
            wrap16(at[0] + ox),
            wrap16(at[1] + oy),
          ],
          adjacent = worldCell(...point);
        w.terrain.bytes[adjacent * 14 + 11] |= 12;
        for (const e of campaignQueryEntities(w, [point])) {
          if ((e.kind !== 2 && e.kind !== 4) || e.native[21]! & 2) continue;
          e.native[23] = effectTerrainShade(w.terrain, ...e.position);
          if (e.kind === 2) w.ecology.plants[e.index].shade = e.native[23]!;
        }
      }
    }
  if (changes) w.terrain.revision++;
  return changes;
}
