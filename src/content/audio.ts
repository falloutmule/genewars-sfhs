import { z } from "zod";
const integer = z.number().int().nonnegative();
export const AudioProfileSchema = z.object({
  schemaVersion: z.literal(1),
  sourceVersion: z.literal("qa-beta-v5-cd"),
  preferredFormatIndex: integer,
  alternateFormatIndex: integer,
  cues: z.record(
    z
      .object({
        cue: integer,
        soundKey: z.string(),
        alternateSoundKey: z.string(),
        textIndex: z.number().nullable(),
      })
      .passthrough(),
  ),
  records: z.array(
    z
      .object({
        key: z.string(),
        cue: integer,
        formatIndex: integer,
        name: z.string(),
        offset: integer,
        bytes: integer,
        sha256: z.string().length(64),
      })
      .passthrough(),
  ),
  speechBoundary: z.object({ effectCueSentinel: z.literal(99) }).passthrough(),
  provenance: z.object({ originalExecution: z.literal(false) }).passthrough(),
});
