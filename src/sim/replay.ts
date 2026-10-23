/** Command-record/checkpoint architecture adapted from Battle Drones
 * src/arena/record.ts, pinned 39d6f587. All original game types replaced.
 */
import { z } from "zod";
import { checksum } from "./checksum";
import {
  CommandSchema,
  ENGINE_VERSION,
  WorldSchema,
  type Command,
  type World,
} from "./schema";
import { queue, step } from "./world";
const ReplaySchema = z.object({
  version: z.literal(1),
  engineVersion: z.literal(ENGINE_VERSION),
  contentHash: z.string(),
  initial: WorldSchema,
  commands: z
    .array(
      z.object({
        issuedTick: z.number().int().nonnegative(),
        command: CommandSchema,
      }),
    )
    .max(100000),
  hashes: z.array(z.tuple([z.number().int().nonnegative(), z.string()])),
  endTick: z.number().int().min(0).max(1000000),
  result: z.string(),
});
export type Replay = z.infer<typeof ReplaySchema>;
export function record(initial: World): Replay {
  return {
    version: 1,
    engineVersion: ENGINE_VERSION,
    contentHash: initial.contentHash,
    initial: structuredClone(initial),
    commands: [],
    hashes: [],
    endTick: initial.tick,
    result: checksum(initial),
  };
}
export function captureCommand(r: Replay, w: World, c: Command): void {
  r.commands.push({ issuedTick: w.tick, command: structuredClone(c) });
}
export function seal(r: Replay, w: World): Replay {
  r.endTick = w.tick;
  r.result = checksum(w);
  return structuredClone(r);
}
export function replay(input: unknown, hash: string): World {
  const r = ReplaySchema.parse(input);
  if (r.contentHash !== hash || r.initial.contentHash !== hash)
    throw new Error("Replay content hash differs");
  if (r.endTick < r.initial.tick)
    throw new Error("Replay ends before its initial state");
  const w = structuredClone(r.initial),
    seen = new Set<number>();
  let cursor = 0;
  while (w.tick < r.endTick) {
    while (
      cursor < r.commands.length &&
      r.commands[cursor].issuedTick === w.tick
    )
      queue(w, r.commands[cursor++].command);
    step(w);
    for (const [tick, expected] of r.hashes)
      if (tick === w.tick) {
        if (checksum(w) !== expected)
          throw new Error(`Replay drift at tick ${tick}`);
        seen.add(tick);
      }
  }
  // Orders issued while paused at the final tick still belong in the result.
  while (cursor < r.commands.length && r.commands[cursor].issuedTick === w.tick)
    queue(w, r.commands[cursor++].command);
  if (
    cursor !== r.commands.length ||
    seen.size !== new Set(r.hashes.map((h) => h[0])).size
  )
    throw new Error("Replay contains unreachable commands/checkpoints");
  if (checksum(w) !== r.result)
    throw new Error("Replay final checksum mismatch");
  return w;
}
