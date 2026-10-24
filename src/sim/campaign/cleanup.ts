import type { SourceEntityId } from "./source-pools";
export interface CleanupWorld {
  ecology: { mules: { native: (number | null)[] }[] };
  source: {
    entities: {
      family: number;
      index: number;
      nativeBytes: (number | null)[];
    }[];
  };
  waterEffects?: { native: (number | null)[] }[];
  landings?: {
    native?: (number | null)[];
    particles: { native?: (number | null)[] }[];
  }[];
  powerEffects?: { slots: { nativePrior?: (number | null)[] }[] };
  buildingNative?: (number | null)[][];
  specialists?: { records: (number | null)[][] };
  ethereals?: { records: { native: (number | null)[] }[] };
  collectors?: { records: (number | null)[][] };
}
const OFFSETS: Record<number, number[]> = {
  1: [0x4d, 0x50, 0x55, 0x58, 0x5b],
  3: [0x4d, 0x50, 0x7f, 0x7b],
  5: [0x47],
  7: [0x4d, 0x50, 0x57, 0x5a],
  8: [0x59],
};
/**724C0 removes reference KIND bytes only, retaining stale index operands.
 * Runtime native fields carry logical IDs; process pointers are never read. */
export function cleanupCampaignReferences(
  w: CleanupWorld,
  id: SourceEntityId,
): number {
  const [, family, index] = id.split(":").map(Number),
    kind = family + 1;
  let writes = 0;
  const clear = (raw: (number | null)[], recordKind: number) => {
    if (raw[6] !== recordKind) return;
    for (const at of OFFSETS[recordKind] ?? []) {
      if (raw[at + 2] !== kind) continue;
      if (raw[at] === null || raw[at + 1] === null)
        throw new Error("Retirement reference index is uninitialized");
      if ((raw[at]! | (raw[at + 1]! << 8)) !== index) continue;
      raw[at + 2] = 0;
      writes++;
      if (recordKind === 1 && at === 0x5b) {
        if (raw[0x60] === null)
          throw new Error("Creature retirement flags are uninitialized");
        if (raw[0x60]! & 2) {
          raw[0x60] = raw[0x60]! & ~2;
          writes++;
        }
      }
    }
  };
  for (const m of w.ecology.mules) clear(m.native, 1);
  for (const e of w.source.entities)
    if (e.family !== 0 && (e.family !== 6 || !w.collectors)) clear(e.nativeBytes, e.family + 1);
  for (const e of w.waterEffects ?? []) clear(e.native, 5);
  for (const l of w.landings ?? []) {
    if (l.native) clear(l.native, 5);
    for (const p of l.particles) if (p.native) clear(p.native, 5);
  }
  for (const s of w.powerEffects?.slots ?? [])
    if (s.nativePrior) clear(s.nativePrior, 5);
  for (const b of w.buildingNative ?? []) clear(b, 4);
  for (const n of w.specialists?.records ?? []) clear(n, 3);
  for (const e of w.ethereals?.records ?? []) clear(e.native, 8);
  for (const n of w.collectors?.records ?? []) clear(n, 7);
  return writes;
}
