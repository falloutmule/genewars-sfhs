import { z } from "zod";
/** Imported filename/bundle metadata only. No waveform or original table
 * literals belong in public code; actual samples remain in the private pack. */
export const SpecialistVoiceProfileSchema = z.object({
  schemaVersion: z.literal(1),
  descriptorClasses: z
    .array(z.number().int().min(0).max(255))
    .length(100)
    .optional(),
  rows: z
    .array(
      z.object({
        style: z.number().int().min(0).max(3),
        category: z.number().int().min(0).max(3),
        filenamePrefix: z.string().min(1).max(80),
        filenameSuffix: z.string().min(1).max(16),
        speechContainer: z.string().min(1).max(80),
        bundleIndex: z.number().int().min(0).max(17),
        soundKeyPrefix: z.string().min(1).max(80),
      }),
    )
    .length(16)
    .refine(
      (rows) => new Set(rows.map((r) => r.style * 4 + r.category)).size === 16,
      "Complete unique specialist voice rows required",
    ),
  provenance: z
    .object({
      executableSha256: z.string().length(64),
      originalExecution: z.literal(false),
    })
    .passthrough(),
});
