import { z } from "zod";
/** Source5C920 corpse deposit displacement, independently hash admitted. */
export const CreatureCommandRulesSchema = z.object({
  schemaVersion: z.literal(1),
  corpseDepositOffset: z.tuple([z.number().int().min(-32768).max(32767), z.number().int().min(-32768).max(32767)]),
  footprintSearchOffsets: z.array(z.tuple([z.number().int().min(-32768).max(32767), z.number().int().min(-32768).max(32767)])).length(9),
  provenance: z.object({
    executableSha256: z.string().length(64), originalExecution: z.literal(false),
    corpseDepositOffset: z.object({ object: z.literal(3), objectOffset: z.literal(0x457c), bytes: z.literal(4), sha256: z.string().length(64) }).passthrough(),
    footprintSearchOffsets: z.object({ object: z.literal(3), orderOffset: z.literal(0x60b8), orderBytes: z.literal(9),
      orderSha256: z.string().length(64), indexedBase: z.literal(0x4564), joinedBytes: z.literal(36), sha256: z.string().length(64) }).passthrough(),
  }).passthrough(),
});
