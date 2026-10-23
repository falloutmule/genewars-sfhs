import { z } from "zod";
import { WorldSchema, type World } from "./schema";
import { checksum } from "./checksum";
export const SAVE_VERSION = 1;
export const SaveSchema = z
  .object({
    version: z.literal(SAVE_VERSION),
    world: WorldSchema,
    checksum: z.string(),
    session: z.object({
      paused: z.boolean(),
      speed: z.union([
        z.literal(0.5),
        z.literal(1),
        z.literal(2),
        z.literal(4),
      ]),
      accumulator: z.number().finite().nonnegative(),
    }),
  })
  .strict();
export type Session = z.infer<typeof SaveSchema>["session"];
export function save(w: World, session: Session): string {
  const body = { version: SAVE_VERSION, world: w, session };
  return JSON.stringify(
    SaveSchema.parse({ ...body, checksum: checksum(body) }),
  );
}
export function load(
  text: string,
  contentHash: string,
): z.infer<typeof SaveSchema> {
  if (text.length > 10_000_000) throw new Error("Save exceeds size limit");
  const raw = JSON.parse(text);
  if (raw.version !== SAVE_VERSION)
    throw new Error(
      `Unsupported save version ${raw.version}; no migration is available`,
    );
  const s = SaveSchema.parse(raw);
  if (s.world.contentHash !== contentHash)
    throw new Error(
      "Content hash differs; rebuild with the same original files",
    );
  if (
    checksum({ version: s.version, world: s.world, session: s.session }) !==
    s.checksum
  )
    throw new Error("Save checksum mismatch; try a recovery slot");
  const ids = [...s.world.specialists, ...s.world.buildings].map((a) => a.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => id >= s.world.nextId)
  )
    throw new Error("Invalid entity identity in save");
  if (
    s.world.pending.some(
      (c) => c.tick < s.world.tick || c.sequence >= s.world.nextSequence,
    )
  )
    throw new Error("Invalid pending command in save");
  if (
    new Set(s.world.pending.map((c) => c.sequence)).size !==
    s.world.pending.length
  )
    throw new Error("Duplicate pending sequence in save");
  const assigned = new Map<number, number>();
  for (const a of s.world.specialists)
    for (const o of a.orders)
      if (o.type === "construct" && o.buildingId !== null) {
        const b = s.world.buildings.find((b) => b.id === o.buildingId);
        if (
          !b ||
          b.complete ||
          b.selector !== o.selector ||
          b.x !== o.x ||
          b.y !== o.y
        )
          throw new Error("Invalid construction reference in save");
        assigned.set(b.id, (assigned.get(b.id) || 0) + 1);
      }
  for (const b of s.world.buildings)
    if (
      b.complete
        ? b.remaining !== 0
        : b.remaining === 0 || assigned.get(b.id) !== 1
    )
      throw new Error("Invalid construction progress in save");
  return s;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function storeRecovery(storage: StorageLike, text: string): void {
  // Write new slot before advancing the head. A quota failure preserves prior saves.
  const current = Number(storage.getItem("gw:recovery:head") ?? "-1");
  const next =
    (Number.isInteger(current) && current >= -1 && current < 4
      ? current + 1
      : 0) % 4;
  storage.setItem("gw:recovery:" + next, text);
  storage.setItem("gw:recovery:head", String(next));
}
export function recover(
  storage: StorageLike,
  hash: string,
): ReturnType<typeof load> | null {
  const head = Number(storage.getItem("gw:recovery:head"));
  for (let i = 0; i < 4; i++) {
    const text = storage.getItem("gw:recovery:" + ((head - i + 4) % 4));
    if (text)
      try {
        return load(text, hash);
      } catch {
        /* try older slot */
      }
  }
  return null;
}
